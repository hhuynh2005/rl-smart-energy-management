"""Kiểm thử các chỗ dễ sai của SAC và quy ước đánh giá năng lượng.

Chạy: python -m unittest discover -s tests -v
Các mạng nhỏ trong kiểm thử giúp phát hiện lỗi nhanh, không đo chất lượng học.
"""

import tempfile
import unittest
from copy import deepcopy
from pathlib import Path
from unittest.mock import patch

import numpy as np
import pandas as pd
import torch
from torch.distributions import TanhTransform, TransformedDistribution

from evaluate_sac import aggregate_results
from sems_rl.agents.sac import Actor, ReplayBuffer, SACAgent, SACConfig
from sems_rl.experiments.sac_experiment import (
    episode, episode_metrics, evaluate_policy, make_env, policy_function,
    protocol_fingerprint, read_settings, scenario_days, seed_everything,
)


class AgentTests(unittest.TestCase):
    def setUp(self):
        seed_everything(7)
        self.config = SACConfig(hidden_size=16, batch_size=8, buffer_size=32)

    def fill_buffer(self, agent):
        rng = np.random.default_rng(10)
        for i in range(16):
            agent.buffer.add(
                rng.normal(size=7), rng.uniform(-1, 1, size=1),
                -float(i + 1), rng.normal(size=7), i % 5 == 0,
            )

    def test_actor_density_matches_torch_transformed_distribution(self):
        """Đối chiếu log pi với phép đổi biến độc lập do PyTorch cung cấp."""
        actor = Actor(self.config)
        observations = torch.zeros(8, 7)
        actions, log_probs = actor.sample(observations)
        reference = TransformedDistribution(
            actor.distribution(observations), [TanhTransform()]
        ).log_prob(actions).sum(-1, keepdim=True)
        torch.testing.assert_close(log_probs, reference, atol=1e-5, rtol=1e-5)
        self.assertTrue(torch.all(actions.abs() <= 1))
        actor_loss = actions.mean() + log_probs.mean()
        actor_loss.backward()
        self.assertTrue(any(p.grad is not None and p.grad.abs().sum() > 0 for p in actor.parameters()))

    def test_saturated_actor_has_finite_log_probability(self):
        actor = Actor(self.config)
        with torch.no_grad():
            for p in actor.parameters():
                p.zero_()
            actor.network[-1].bias[0] = 40.0
        _, log_probs = actor.sample(torch.zeros(4, 7))
        self.assertTrue(torch.isfinite(log_probs).all())

    def test_terminal_mask_and_entropy_in_bellman_target(self):
        agent = SACAgent(SACConfig(hidden_size=16, initial_alpha=0.5, gamma=0.9))
        with torch.no_grad():
            for network, value in ((agent.target_q1, 2.0), (agent.target_q2, 3.0)):
                for p in network.parameters():
                    p.zero_()
                network.network[-1].bias.fill_(value)
        with patch.object(agent.actor, "sample", return_value=(
            torch.zeros(2, 1), torch.full((2, 1), -0.2)
        )):
            target = agent.compute_target(
                torch.ones(2, 1), torch.zeros(2, 7), torch.tensor([[1.0], [0.0]])
            )
        # Terminal: chỉ thưởng 1. Còn tiếp: 1 + 0.9 * (2 + 0.5 * 0.2) = 2.89.
        torch.testing.assert_close(target, torch.tensor([[1.0], [2.89]]))
        self.assertFalse(target.requires_grad)

    def test_replay_overwrite_preserves_matching_transitions(self):
        config = SACConfig(batch_size=4, buffer_size=4)
        buffer = ReplayBuffer(config, seed=3)
        for i in range(6):
            buffer.add(np.full(7, i), [i / 10], 10 * i, np.full(7, i + 1), i % 2)
        self.assertEqual(buffer.size, 4)
        self.assertEqual(set(buffer.observations[:, 0]), {2, 3, 4, 5})
        observations, actions, rewards, next_obs, terminated = buffer.sample(4, "cpu")
        torch.testing.assert_close(rewards[:, 0], observations[:, 0] * 10)
        torch.testing.assert_close(actions[:, 0], observations[:, 0] / 10)
        torch.testing.assert_close(next_obs, observations + 1)
        torch.testing.assert_close(terminated[:, 0], observations[:, 0] % 2)

    def test_update_changes_networks_and_soft_updates_targets(self):
        agent = SACAgent(self.config)
        self.fill_buffer(agent)
        actor_before = [p.detach().clone() for p in agent.actor.parameters()]
        critic_before = [p.detach().clone() for p in agent.q1.parameters()]
        target_before = [p.detach().clone() for p in agent.target_q1.parameters()]
        metrics = agent.update()
        self.assertTrue(all(np.isfinite(value) for value in metrics.values()))
        self.assertGreater(metrics["alpha"], 0)
        self.assertNotEqual(metrics["alpha"], self.config.initial_alpha)
        self.assertTrue(any(not torch.equal(a, b) for a, b in zip(actor_before, agent.actor.parameters())))
        self.assertTrue(any(not torch.equal(a, b) for a, b in zip(critic_before, agent.q1.parameters())))
        for before, source, target in zip(target_before, agent.q1.parameters(), agent.target_q1.parameters()):
            torch.testing.assert_close(target, before * (1 - self.config.tau) + source * self.config.tau)
            self.assertIsNone(target.grad)

    def test_checkpoint_roundtrip_preserves_prediction_and_alpha(self):
        agent = SACAgent(self.config)
        self.fill_buffer(agent)
        agent.update()
        observation = np.linspace(-1, 1, 7, dtype=np.float32)
        before, _ = agent.predict(observation)
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "model.pt"
            agent.save(path)
            restored = SACAgent.load(path)
        np.testing.assert_array_equal(before, restored.predict(observation)[0])
        self.assertEqual(restored.alpha.item(), agent.alpha.item())
        self.assertEqual(restored.update_count, 1)
        self.assertEqual(restored.predict(np.stack([observation, observation]))[0].shape, (2, 1))
        self.assertEqual(restored.buffer.size, 0)  # Nạp mô hình không phải khôi phục toàn bộ lượt train.

    def test_nonfinite_observation_is_rejected(self):
        agent = SACAgent(self.config)
        with self.assertRaises(ValueError):
            agent.predict(np.full(7, np.nan))


class EnergyProtocolTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.settings = read_settings()
        cls.env = make_env(cls.settings, "train")
        cls.pipeline = cls.env.unwrapped.data_pipeline

    @classmethod
    def tearDownClass(cls):
        cls.env.close()

    def make_env(self, split="train", scenario="S5"):
        return make_env(self.settings, split, scenario, self.pipeline)

    def test_day_end_keeps_soc_and_uses_actual_next_day(self):
        env = self.make_env()
        env.reset(seed=0, options={"day_offset": 0, "initial_soc": 0.5})
        for _ in range(96):
            observation, _, terminated, truncated, info = env.step([0.0])
        self.assertFalse(terminated)
        self.assertTrue(truncated)
        self.assertEqual(info["continuation"], "next_day_same_split")
        row = self.pipeline.get_day_data(1, "train").iloc[0]
        self.assertAlmostEqual(observation[0], 0.5)
        self.assertAlmostEqual(observation[1], row.p_load_kw / self.pipeline.p_load_max_train, places=6)
        self.assertEqual(observation[6], row.is_weekday)
        self.assertEqual(observation[4], 0)
        self.assertEqual(observation[5], 1)

    def test_dataset_boundary_does_not_bootstrap_into_validation(self):
        env = self.make_env()
        day = self.pipeline.get_num_days("train") - 1
        env.reset(seed=0, options={"day_offset": day})
        for _ in range(96):
            _, _, terminated, truncated, info = env.step([0.0])
        self.assertTrue(terminated)
        self.assertFalse(truncated)
        self.assertEqual(info["continuation"], "dataset_boundary_terminal")

    def test_cloudy_scenario_changes_physics_without_changing_source_data(self):
        env = self.make_env("val", "S3")
        original = self.pipeline.get_day_data(0, "val").copy()
        history = episode(env, policy_function(baseline="no_battery"), 0, 0, 0.5)
        for i, step in enumerate(history):
            self.assertAlmostEqual(step["p_pv_kw"], original.iloc[i].p_pv_kw * 0.5)
            self.assertAlmostEqual(step["p_grid_kw"], step["p_load_kw"] - step["p_pv_kw"])
        pd.testing.assert_frame_equal(original, self.pipeline.get_day_data(0, "val"))

    def test_observation_noise_is_repeatable_and_does_not_change_physics(self):
        noisy = self.make_env("val", "S4")
        plain = self.make_env("val", "S5")
        options = {"day_offset": 0, "initial_soc": 0.5}
        observation, _ = noisy.reset(seed=42, options=options)
        repeated, _ = noisy.reset(seed=42, options=options)
        np.testing.assert_array_equal(observation, repeated)
        plain_observation, _ = plain.reset(seed=42, options=options)
        self.assertFalse(np.array_equal(observation, plain_observation))
        for _ in range(96):
            _, reward_noisy, _, _, info_noisy = noisy.step([0.0])
            _, reward_plain, _, _, info_plain = plain.step([0.0])
            self.assertEqual(reward_noisy, reward_plain)
            self.assertEqual(info_noisy["p_load_kw"], info_plain["p_load_kw"])

    def test_scenario_days_follow_actual_weekday_flags(self):
        env = self.make_env("val")
        for scenario, flag in (("S1", 1), ("S2", 0)):
            for day in scenario_days(env, "val", scenario):
                self.assertEqual(self.pipeline.get_day_data(day, "val").iloc[0].is_weekday, flag)

    def test_inventory_adjustment_prices_energy_depleted_from_battery(self):
        env = self.make_env("val")
        idle = episode(env, policy_function(baseline="no_battery"), 0, 0, 0.5)
        depleted = episode(env, lambda obs, info: np.array([-1.0], np.float32), 0, 0, 0.5)
        idle_metrics = episode_metrics(idle, env, 0.5, idle)
        depleted_metrics = episode_metrics(depleted, env, 0.5, idle)
        self.assertEqual(idle_metrics["inventory_adjustment_vnd"], 0)
        # Xả từ 50% về 20%: 60 kWh trong pin, 55.2 kWh có thể cấp ra hệ thống.
        expected = 55.2 * depleted_metrics["inventory_reference_price"]
        self.assertAlmostEqual(depleted_metrics["inventory_adjustment_vnd"], expected)

    def test_no_battery_compares_with_same_day_not_split_mean(self):
        env = self.make_env("val")
        frame, _ = evaluate_policy(None, env, [0, 1], baseline="no_battery")
        np.testing.assert_allclose(frame.cost_saving_pct, 0)
        np.testing.assert_allclose(frame.peak_shaving_pct, 0)

    def test_seed_deviation_is_not_daily_deviation(self):
        frame = pd.DataFrame({
            "method": ["custom"] * 4, "scenario": ["S5"] * 4,
            "seed": [0, 0, 1, 1], "day_offset": [0, 1, 0, 1],
            "daily_cost_j": [0, 100, 40, 60],
        })
        by_seed, summary = aggregate_results(frame)
        self.assertEqual(len(by_seed), 2)
        self.assertEqual(summary.iloc[0].daily_cost_j_mean, 50)
        self.assertEqual(summary.iloc[0].daily_cost_j_std_seeds, 0)

    def test_comparison_ignores_machine_path_but_checks_environment(self):
        metadata = {
            "protocol": "sac-daily-v1", "environment": self.settings["environment"],
            "evaluation": self.settings["evaluation"], "data_sha256": "same_csv_content",
        }
        other_machine = deepcopy(metadata)
        other_machine["environment"]["data"]["file_path"] = "/home/duong/project/data/processed.csv"
        self.assertEqual(protocol_fingerprint(metadata), protocol_fingerprint(other_machine))
        other_machine["environment"]["reward"]["w1_wear"] = 2.0
        self.assertNotEqual(protocol_fingerprint(metadata), protocol_fingerprint(other_machine))


if __name__ == "__main__":
    unittest.main()
