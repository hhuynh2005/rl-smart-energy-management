"""Kiểm thử các chỗ dễ sai của Double DQN + Dueling (phần của Lý Đình Sơn).

Chạy: python -m unittest discover -s tests -p "test_ddqn*.py" -v
Mạng nhỏ giúp phát hiện lỗi nhanh, không đo chất lượng học.
"""

import unittest

import numpy as np
import torch

from sems_rl.agents.ddqn import (
    DDQNAgent, DDQNConfig, DuelingQNetwork, ReplayBuffer, build_action_grid,
)
from sems_rl.envs.wrappers import DiscretizeActionWrapper
from sems_rl.experiments.sac_experiment import make_env, read_settings, seed_everything


class NetworkTests(unittest.TestCase):
    def setUp(self):
        seed_everything(7)
        self.config = DDQNConfig(hidden_size=16, batch_size=8, buffer_size=32)
        self.observations = torch.randn(5, 7)

    def test_q_equals_value_plus_centered_advantage(self):
        network = DuelingQNetwork(self.config)
        value, advantage = network.heads(self.observations)
        q = network(self.observations)
        self.assertEqual(q.shape, (5, 11))
        torch.testing.assert_close(q, value + advantage - advantage.mean(-1, keepdim=True))
        # Trung bình Q theo hành động đúng bằng V(s): A đã được căn về 0.
        torch.testing.assert_close(q.mean(-1, keepdim=True), value)

    def test_plain_head_shape_and_no_heads(self):
        network = DuelingQNetwork(DDQNConfig(hidden_size=16, batch_size=8,
                                             buffer_size=32, dueling=False))
        self.assertEqual(network(self.observations).shape, (5, 11))
        self.assertIsNone(network.value_head)
        with self.assertRaises(ValueError):
            network.heads(self.observations)

    def test_config_rejects_invalid_values(self):
        invalid = [
            {"num_actions": 1}, {"hidden_size": 0}, {"learning_rate": 0.0},
            {"gamma": 1.5}, {"tau": 0.0}, {"tau": 1.5},
            {"batch_size": 300, "buffer_size": 200}, {"learning_starts": -1},
            {"epsilon_start": 0.1, "epsilon_end": 0.5}, {"epsilon_decay_steps": 0},
            {"grad_clip_norm": 0.0},
        ]
        for values in invalid:
            with self.subTest(values=values), self.assertRaises(ValueError):
                DDQNConfig(**values)

    def test_action_grid_matches_discretize_wrapper(self):
        grid = build_action_grid(11)
        wrapper = DiscretizeActionWrapper(make_env(read_settings()), 11)
        np.testing.assert_array_equal(grid, wrapper.action_grid)
        self.assertEqual(grid.dtype, np.float32)
        self.assertEqual((grid[0], grid[5], grid[-1]), (-1.0, 0.0, 1.0))


def small_config(**overrides):
    values = {"hidden_size": 16, "batch_size": 8, "buffer_size": 32}
    values.update(overrides)
    return DDQNConfig(**values)


def force_best_action(network, best, num_actions=11):
    """Tham số về 0, chỉ bias đầu ra ưu tiên mức `best` -> Q như nhau với mọi s."""
    with torch.no_grad():
        for parameter in network.parameters():
            parameter.zero_()
        bias = torch.zeros(num_actions)
        bias[best] = 1.0
        network.output_head.bias.copy_(bias)


class AgentActingTests(unittest.TestCase):
    def setUp(self):
        seed_everything(7)
        self.agent = DDQNAgent(small_config(), seed=3)

    def test_epsilon_schedule(self):
        self.assertEqual(self.agent.epsilon(0), 1.0)
        self.assertAlmostEqual(self.agent.epsilon(25_000), 0.525)
        self.assertAlmostEqual(self.agent.epsilon(50_000), 0.05)
        self.assertEqual(self.agent.epsilon(10**6), 0.05)

    def test_greedy_follows_q_and_full_exploration_covers_all_actions(self):
        force_best_action(self.agent.online, 3)
        observation = np.random.default_rng(0).uniform(size=7).astype(np.float32)
        self.assertEqual(self.agent.select_action_index(observation, 0.0), 3)
        chosen = {self.agent.select_action_index(observation, 1.0) for _ in range(300)}
        self.assertEqual(chosen, set(range(11)))

    def test_predict_returns_grid_action_and_validates_input(self):
        action, state = self.agent.predict(np.zeros(7, np.float32))
        self.assertIsNone(state)
        self.assertEqual(action.shape, (1,))
        self.assertEqual(action.dtype, np.float32)
        self.assertIn(float(action[0]), set(self.agent.action_grid.tolist()))
        batch, _ = self.agent.predict(np.zeros((4, 7), np.float32))
        self.assertEqual(batch.shape, (4, 1))
        bad_nan = np.zeros(7)
        bad_nan[2] = np.nan
        bad_inf = np.zeros(7)
        bad_inf[0] = np.inf
        for bad in (np.zeros(6), bad_nan, bad_inf):
            with self.assertRaises(ValueError):
                self.agent.predict(bad)

    def test_explain_matches_network_and_handles_plain_head(self):
        observation = np.random.default_rng(1).uniform(size=7).astype(np.float32)
        explanation = self.agent.explain(observation)
        q = np.array(explanation["q_values"])
        advantages = np.array(explanation["advantages"])
        self.assertEqual(len(q), 11)
        self.assertEqual(len(advantages), 11)
        self.assertEqual(explanation["chosen_k"], int(np.argmax(q)))
        np.testing.assert_allclose(
            q, explanation["v_value"] + advantages - advantages.mean(), atol=1e-5
        )
        plain = DDQNAgent(small_config(dueling=False)).explain(observation)
        self.assertIsNone(plain["v_value"])
        self.assertIsNone(plain["advantages"])
        self.assertEqual(len(plain["q_values"]), 11)

    def test_buffer_ring_and_sample_shapes(self):
        buffer = ReplayBuffer(small_config(buffer_size=4, batch_size=3), seed=0)
        rng = np.random.default_rng(2)
        for i in range(6):
            buffer.add(rng.normal(size=7), i % 11, -1.0, rng.normal(size=7), False)
        self.assertEqual((buffer.size, buffer.position), (4, 2))
        observations, actions, rewards, next_observations, terminated = buffer.sample(3, "cpu")
        self.assertEqual(observations.shape, (3, 7))
        self.assertEqual(observations.dtype, torch.float32)
        self.assertEqual(actions.shape, (3, 1))
        self.assertEqual(actions.dtype, torch.int64)
        self.assertEqual(rewards.shape, (3, 1))
        self.assertEqual(next_observations.shape, (3, 7))
        self.assertEqual(terminated.shape, (3, 1))
        with self.assertRaises(ValueError):
            buffer.sample(5, "cpu")


if __name__ == "__main__":
    unittest.main()
