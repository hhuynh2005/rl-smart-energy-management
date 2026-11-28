"""Kiểm thử các chỗ dễ sai của Double DQN + Dueling (phần của Lý Đình Sơn).

Chạy: python -m unittest discover -s tests -p "test_ddqn*.py" -v
Mạng nhỏ giúp phát hiện lỗi nhanh, không đo chất lượng học.
"""

import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

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


def fill_buffer(agent, count=16, reward=None):
    rng = np.random.default_rng(10)
    for i in range(count):
        agent.buffer.add(
            rng.normal(size=7), i % agent.config.num_actions,
            -float(i + 1) if reward is None else reward, rng.normal(size=7), i % 5 == 0,
        )


class AgentLearningTests(unittest.TestCase):
    def setUp(self):
        seed_everything(7)
        self.rewards = torch.tensor([[-1.0], [0.5], [2.0]])
        self.next_observations = torch.randn(3, 7)

    def disagreeing_agent(self, double):
        """Mạng chính ưu tiên k=2, mạng đích ưu tiên k=7: hai cách tính đích phải khác nhau."""
        agent = DDQNAgent(small_config(double=double))
        force_best_action(agent.online, 2)
        force_best_action(agent.target, 7)
        with torch.no_grad():
            agent.target.output_head.bias[2] = 0.4  # Q_tg(s', 2) thấp hơn Q_tg(s', 7)
        return agent

    def test_double_target_uses_online_argmax_and_target_values(self):
        not_done = torch.zeros(3, 1)
        double = self.disagreeing_agent(True)
        target_q = double.target(self.next_observations)
        expected = self.rewards + 0.99 * target_q[:, 2:3]
        result = double.compute_target(self.rewards, self.next_observations, not_done)
        torch.testing.assert_close(result, expected)
        vanilla = self.disagreeing_agent(False)
        vanilla_result = vanilla.compute_target(self.rewards, self.next_observations, not_done)
        torch.testing.assert_close(
            vanilla_result, self.rewards + 0.99 * target_q.max(-1, keepdim=True).values
        )
        self.assertFalse(torch.allclose(result, vanilla_result))

    def test_terminated_removes_bootstrap_but_truncation_is_not_an_input(self):
        agent = self.disagreeing_agent(True)
        done = agent.compute_target(self.rewards, self.next_observations, torch.ones(3, 1))
        torch.testing.assert_close(done, self.rewards)
        live = agent.compute_target(self.rewards, self.next_observations, torch.zeros(3, 1))
        self.assertFalse(torch.allclose(live, self.rewards))

    def test_update_changes_online_and_soft_updates_target(self):
        agent = DDQNAgent(small_config(tau=0.1))
        fill_buffer(agent)
        old_online = [p.detach().clone() for p in agent.online.parameters()]
        old_target = [p.detach().clone() for p in agent.target.parameters()]
        metrics = agent.update()
        self.assertEqual(set(metrics), {"loss", "q_mean", "td_error_mean"})
        self.assertTrue(all(np.isfinite(v) for v in metrics.values()))
        self.assertEqual(agent.update_count, 1)
        new_online = list(agent.online.parameters())
        self.assertTrue(any(not torch.equal(a, b) for a, b in zip(old_online, new_online)))
        for before, online, after in zip(old_target, new_online, agent.target.parameters()):
            torch.testing.assert_close(after, before + 0.1 * (online.detach() - before))
            self.assertFalse(after.requires_grad)

    def test_update_clips_gradient_with_configured_norm(self):
        agent = DDQNAgent(small_config())
        fill_buffer(agent)
        with patch("torch.nn.utils.clip_grad_norm_", wraps=torch.nn.utils.clip_grad_norm_) as clip:
            agent.update()
        clip.assert_called_once()
        self.assertEqual(clip.call_args.kwargs["max_norm"], 10.0)

    def test_update_rejects_small_buffer_and_nonfinite_values(self):
        agent = DDQNAgent(small_config())
        fill_buffer(agent, count=4)
        with self.assertRaises(ValueError):
            agent.update()
        broken = DDQNAgent(small_config())
        fill_buffer(broken, reward=float("nan"))
        with self.assertRaises(FloatingPointError):
            broken.update()

    def test_save_load_roundtrip(self):
        agent = DDQNAgent(small_config(), seed=5)
        fill_buffer(agent)
        agent.update()
        observation = np.linspace(0, 1, 7, dtype=np.float32)
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "model.pt"
            agent.save(path)
            loaded = DDQNAgent.load(path)
        np.testing.assert_allclose(loaded.q_values(observation), agent.q_values(observation))
        self.assertEqual(loaded.update_count, 1)
        self.assertEqual(loaded.config, agent.config)
        self.assertEqual(loaded.seed, 5)


if __name__ == "__main__":
    unittest.main()
