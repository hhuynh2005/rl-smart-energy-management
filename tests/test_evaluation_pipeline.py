"""Kiểm thử cho Pipeline đánh giá tổng hợp (protocol.py và evaluate_all.py)."""

from copy import deepcopy
import json
import subprocess
import sys
import tempfile
import types
import unittest
from pathlib import Path

import numpy as np
import pandas as pd
import yaml
from stable_baselines3 import DQN

from sems_rl.envs.wrappers import DiscretizeActionWrapper
from sems_rl.experiments.protocol import (
    ROOT,
    aggregate_results,
    compute_aggregate_savings,
    decode_discrete_action,
    episode,
    episode_metrics,
    evaluate_policy,
    infer_run_identity,
    load_policy_from_run,
    make_env,
    policy_function,
    protocol_fingerprint,
    read_settings,
    scenario_days,
)


class EvaluationPipelineTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.settings = read_settings(default_config="configs/ppo.yaml")
        probe = make_env(cls.settings, split="train", scenario="S5")
        cls.pipeline = probe.unwrapped.data_pipeline
        probe.close()

    def make_env(self, split="val", scenario="S5"):
        return make_env(self.settings, split=split, scenario=scenario, data_pipeline=self.pipeline)

    def test_s1_s2_weekday_filtering_across_splits(self):
        env_val = self.make_env("val", "S5")
        s1_days = scenario_days(env_val, "val", "S1")
        s2_days = scenario_days(env_val, "val", "S2")
        self.assertTrue(all(int(self.pipeline.get_day_data(d, "val").iloc[0]["is_weekday"]) == 1 for d in s1_days))
        self.assertTrue(all(int(self.pipeline.get_day_data(d, "val").iloc[0]["is_weekday"]) == 0 for d in s2_days))
        self.assertEqual(len(s1_days) + len(s2_days), self.pipeline.get_num_days("val"))
        env_val.close()

    def test_cloudy_s3_scales_pv_without_mutating_pipeline(self):
        env = self.make_env("val", "S3")
        orig = self.pipeline.get_day_data(0, "val").copy()
        hist = episode(env, policy_function(baseline="no_battery"), 0, 0, 0.5)
        for i, step in enumerate(hist):
            self.assertAlmostEqual(step["p_pv_kw"], orig.iloc[i]["p_pv_kw"] * 0.5, places=5)
        pd.testing.assert_frame_equal(orig, self.pipeline.get_day_data(0, "val"))
        env.close()

    def test_s4_observation_noise_repeatable_and_physics_isolated(self):
        noisy = self.make_env("val", "S4")
        plain = self.make_env("val", "S5")
        o1, _ = noisy.reset(seed=7, options={"day_offset": 0, "initial_soc": 0.5})
        o2, _ = noisy.reset(seed=7, options={"day_offset": 0, "initial_soc": 0.5})
        o_plain, _ = plain.reset(seed=7, options={"day_offset": 0, "initial_soc": 0.5})
        np.testing.assert_array_equal(o1, o2)
        self.assertFalse(np.array_equal(o1, o_plain))

        observed_a = []
        observed_b = []

        def _record(target):
            def _fn(obs, info):
                target.append(obs.copy())
                return np.array([0.0], dtype=np.float32)

            return _fn

        hist_a = episode(noisy, _record(observed_a), 0, 7, 0.5)
        hist_b = episode(noisy, _record(observed_b), 0, 7, 0.5)
        hist_plain = episode(plain, policy_function(baseline="no_battery"), 0, 7, 0.5)
        np.testing.assert_allclose(observed_a, observed_b)
        self.assertAlmostEqual(sum(s["c_elec"] for s in hist_a), sum(s["c_elec"] for s in hist_plain), places=6)
        noisy.close()
        plain.close()

    def test_discrete_action_decoder_matches_wrapper(self):
        base = self.make_env("val", "S5")
        wrapped = DiscretizeActionWrapper(base, num_actions=11)
        for k in range(11):
            expected = wrapped.action(k)
            decoded = decode_discrete_action(k, 11)
            np.testing.assert_allclose(decoded, expected, atol=1e-6)
        wrapped.close()

    def test_ddqn_identity_and_continuous_vs_integer_predict(self):
        # 1. Policy trả về int (như SB3 DQN) -> phải giải mã k -> [-1, 1]
        class _IntDDQN:
            def predict(self, obs, deterministic=True):
                return np.array(3, dtype=np.int64), None

        # 2. Policy tự viết trả về float32 liên tục (như DDQNAgent của Sơn) -> KHÔNG được cắt int()
        class _FloatDDQN:
            def predict(self, obs, deterministic=True):
                return np.array([-0.4], dtype=np.float32), None

        obs = np.zeros(7, dtype=np.float32)
        act_int = policy_function(model=_IntDDQN(), num_discrete_actions=11)(obs, {})
        act_flt = policy_function(model=_FloatDDQN(), num_discrete_actions=11)(obs, {})
        np.testing.assert_allclose(act_int, np.array([-0.4], dtype=np.float32), atol=1e-6)
        np.testing.assert_allclose(act_flt, np.array([-0.4], dtype=np.float32), atol=1e-6)

        # 3. Kiểm tra load_policy_from_run với metadata giống hệt nhánh ly-son-DQN
        son_meta = {
            "protocol": "sac-daily-v1",
            "backend": "ddqn",
            "seed": 0,
            "settings": {"agent": {"num_actions": 11}},
        }
        algo, backend, label = infer_run_identity(son_meta)
        self.assertEqual((algo, backend, label), ("ddqn", "ddqn", "ddqn"))

        stub_mod = types.ModuleType("sems_rl.agents.ddqn")

        class _StubDDQNAgent:
            @classmethod
            def load(cls, path, device="cpu"):
                return _FloatDDQN()

        stub_mod.DDQNAgent = _StubDDQNAgent
        prev_mod = sys.modules.get("sems_rl.agents.ddqn")
        sys.modules["sems_rl.agents.ddqn"] = stub_mod
        try:
            with tempfile.TemporaryDirectory() as folder:
                rdir = Path(folder)
                (rdir / "best.pt").write_bytes(b"stub")
                loaded_fn, loaded_label = load_policy_from_run(rdir, son_meta, device="cpu")
                self.assertEqual(loaded_label, "ddqn")
                np.testing.assert_allclose(loaded_fn(obs, {}), np.array([-0.4], dtype=np.float32), atol=1e-6)
        finally:
            if prev_mod is None:
                sys.modules.pop("sems_rl.agents.ddqn", None)
            else:
                sys.modules["sems_rl.agents.ddqn"] = prev_mod

    def test_inventory_adjustment_and_same_day_baseline(self):
        env = self.make_env("val", "S5")
        idle = episode(env, policy_function(baseline="no_battery"), 0, 0, 0.5)
        discharge = episode(env, lambda o, i: np.array([-1.0], dtype=np.float32), 0, 0, 0.5)
        m_idle = episode_metrics(idle, env, 0.5, idle)
        m_dis = episode_metrics(discharge, env, 0.5, idle)
        self.assertEqual(m_idle["inventory_adjustment_vnd"], 0.0)
        expected = 55.2 * m_dis["inventory_reference_price"]
        self.assertAlmostEqual(m_dis["inventory_adjustment_vnd"], expected, places=4)

        frame, _ = evaluate_policy(None, env, [0, 1], baseline="no_battery")
        np.testing.assert_allclose(frame["cost_saving_pct"], 0.0)
        np.testing.assert_allclose(frame["adjusted_cost_saving_pct"], 0.0)
        env.close()

    def test_aggregate_results_separates_seed_std_from_day_std(self):
        frame = pd.DataFrame(
            {
                "method": ["ppo_sb3"] * 4,
                "scenario": ["S5"] * 4,
                "seed": [0, 0, 1, 1],
                "day_offset": [0, 1, 0, 1],
                "daily_cost_j": [100.0, 200.0, 140.0, 160.0],
                "adjusted_electric_cost_vnd": [110.0, 210.0, 150.0, 170.0],
                "adjusted_total_cost_vnd": [120.0, 220.0, 160.0, 180.0],
                "cost_saving_pct": [10.0, 20.0, 15.0, 15.0],
                "adjusted_cost_saving_pct": [5.0, 15.0, 10.0, 10.0],
                "peak_buy_kw": [50.0, 60.0, 55.0, 55.0],
                "efc": [0.5, 0.5, 0.5, 0.5],
                "clipped_steps": [0, 2, 1, 1],
                "baseline_cost_j": [200.0, 200.0, 200.0, 200.0],
            }
        )
        by_seed, summary = aggregate_results(frame)
        self.assertEqual(len(by_seed), 2)
        self.assertAlmostEqual(summary.iloc[0]["daily_cost_j_mean"], 150.0)
        self.assertAlmostEqual(summary.iloc[0]["daily_cost_j_std_seeds"], 0.0)
        self.assertLessEqual(summary.iloc[0]["daily_cost_j_ci95_low"], 150.0)
        self.assertGreaterEqual(summary.iloc[0]["daily_cost_j_ci95_high"], 150.0)

        agg = compute_aggregate_savings(frame)
        self.assertAlmostEqual(agg.iloc[0]["aggregate_raw_saving_pct"], 25.0)

    def test_cross_protocol_fingerprint_compatibility(self):
        sac_meta = {
            "protocol": "sac-daily-v1",
            "environment": deepcopy(self.settings["environment"]),
            "evaluation": deepcopy(self.settings["evaluation"]),
            "data_sha256": "abc123",
        }
        ppo_meta = deepcopy(sac_meta)
        ppo_meta["protocol"] = "sems-daily-v1"
        ppo_meta["environment"]["data"]["file_path"] = "/other/machine/data/processed.csv"
        self.assertEqual(
            protocol_fingerprint(sac_meta, include_protocol=False),
            protocol_fingerprint(ppo_meta, include_protocol=False),
        )

    def test_evaluate_all_cli_baselines_only(self):
        with tempfile.TemporaryDirectory() as folder:
            out_dir = Path(folder) / "baselines_out"
            res = subprocess.run(
                [
                    sys.executable,
                    "-B",
                    "evaluate_all.py",
                    "--baselines-only",
                    "--split",
                    "val",
                    "--scenarios",
                    "S1",
                    "S2",
                    "--max-days",
                    "1",
                    "--output",
                    str(out_dir),
                ],
                cwd=ROOT,
                capture_output=True,
                encoding="utf-8",
                timeout=120,
            )
            self.assertEqual(res.returncode, 0, res.stdout + res.stderr)
            summary = pd.read_csv(out_dir / "summary.csv")
            self.assertEqual(list(summary[summary["scenario"] == "S1"]["method"]), ["no_battery", "rule_based"])
            md = (out_dir / "report_table.md").read_text(encoding="utf-8")
            self.assertIn("Tổng ĐC (đ/ngày)", md)
            meta = json.loads((out_dir / "evaluation_metadata.json").read_text(encoding="utf-8"))
            self.assertEqual(meta["dataset_used"], "data/processed.csv")

    def test_evaluate_all_cli_multi_method_end_to_end(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            settings = read_settings(default_config="configs/ppo.yaml")
            settings["agent"].update(
                {
                    "net_arch": {"pi": [16, 16], "vf": [16, 16]},
                    "n_envs": 1,
                    "n_steps": 16,
                    "batch_size": 8,
                    "n_epochs": 1,
                }
            )
            settings["training"].update(
                {
                    "total_timesteps": 32,
                    "eval_freq": 32,
                    "eval_days": 1,
                    "log_freq": 32,
                    "seeds": [0],
                }
            )
            settings.pop("environment")
            cfg_path = root / "ppo.yaml"
            cfg_path.write_text(yaml.safe_dump(settings), encoding="utf-8")

            # Train tiny PPO run
            r_train = subprocess.run(
                [
                    sys.executable,
                    "-B",
                    "train_ppo.py",
                    "--config",
                    str(cfg_path),
                    "--device",
                    "cpu",
                    "--output",
                    str(root / "models"),
                ],
                cwd=ROOT,
                capture_output=True,
                encoding="utf-8",
                timeout=120,
            )
            self.assertEqual(r_train.returncode, 0, r_train.stdout + r_train.stderr)

            # Create tiny discrete SB3 DQN run (simulating DDQN compatibility)
            dqn_dir = root / "models/ddqn_seed0"
            dqn_dir.mkdir(parents=True, exist_ok=True)
            disc_env = DiscretizeActionWrapper(self.make_env("train", "S5"), num_actions=11)
            dqn_model = DQN("MlpPolicy", disc_env, learning_starts=4, batch_size=4, buffer_size=32, verbose=0)
            dqn_model.learn(total_timesteps=8)
            dqn_model.save(dqn_dir / "best.zip")
            disc_env.close()
            full_settings = read_settings(default_config="configs/ppo.yaml")
            dqn_settings = deepcopy(full_settings)
            dqn_settings["agent"] = {"algorithm": "ddqn", "backend": "sb3", "num_actions": 11}
            from sems_rl.experiments.protocol import experiment_metadata, write_json

            write_json(
                dqn_dir / "metadata.json",
                experiment_metadata(dqn_settings, method="ddqn", backend="sb3", seed=0),
            )

            # Evaluate both PPO and DDQN + baselines across S1-S5
            r_eval = subprocess.run(
                [
                    sys.executable,
                    "-B",
                    "evaluate_all.py",
                    "--runs",
                    str(root / "models/ppo_seed0"),
                    str(dqn_dir),
                    "--split",
                    "val",
                    "--max-days",
                    "1",
                    "--output",
                    str(root / "eval_out"),
                ],
                cwd=ROOT,
                capture_output=True,
                encoding="utf-8",
                timeout=120,
            )
            self.assertEqual(r_eval.returncode, 0, r_eval.stdout + r_eval.stderr)

            daily = pd.read_csv(root / "eval_out/daily_metrics.csv")
            self.assertEqual(set(daily["method"]), {"ppo_sb3", "ddqn_sb3", "no_battery", "rule_based"})
            self.assertEqual(set(daily["scenario"]), {"S1", "S2", "S3", "S4", "S5"})
            self.assertTrue((root / "eval_out/summary.csv").is_file())
            self.assertTrue((root / "eval_out/report_table.md").is_file())
            self.assertTrue((root / "eval_out/comparison_cost.png").is_file())
            self.assertTrue((root / "eval_out/learning_comparison.png").is_file())


if __name__ == "__main__":
    unittest.main()
