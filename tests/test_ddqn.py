"""Kiểm thử các chỗ dễ sai của Double DQN + Dueling (phần của Lý Đình Sơn).

Chạy: python -m unittest discover -s tests -p "test_ddqn*.py" -v
Mạng nhỏ giúp phát hiện lỗi nhanh, không đo chất lượng học.
"""

import unittest

import numpy as np
import torch

from sems_rl.agents.ddqn import DDQNConfig, DuelingQNetwork, build_action_grid
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


if __name__ == "__main__":
    unittest.main()
