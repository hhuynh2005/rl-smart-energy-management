"""Kiểm thử cho thuật toán PPO, DummyVecEnv + ScenarioWrapper và CLI train_ppo.py."""

import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

import numpy as np
import pandas as pd
import yaml
from stable_baselines3 import PPO
from stable_baselines3.common.vec_env import DummyVecEnv

from sems_rl.agents.ppo import PPOAgentWrapper, PPOConfig, linear_lr_schedule, load_ppo_model
from sems_rl.experiments.protocol import ROOT, make_env, read_settings, seed_everything


class PPOModuleTests(unittest.TestCase):
    def test_config_validation_rejects_invalid_values(self):
        with self.assertRaises(ValueError):
            PPOConfig(n_envs=2, n_steps=10, batch_size=32)  # batch > rollout
        with self.assertRaises(ValueError):
            PPOConfig(activation="sigmoid")
        with self.assertRaises(ValueError):
            PPOConfig(lr_schedule="cosine")
        with self.assertRaises(ValueError):
            PPOConfig(sde_sample_freq=0)
        with self.assertRaises(ValueError):
            PPOConfig(ent_coef=-0.1)
        with self.assertRaises(ValueError):
            PPOConfig(vf_coef=-0.5)
        with self.assertRaises(ValueError):
            PPOConfig(net_arch={"pi": [64]})

    def test_linear_schedule_bounds(self):
        sched = linear_lr_schedule(3e-4, min_ratio=0.1)
        self.assertAlmostEqual(sched(1.0), 3e-4)
        self.assertAlmostEqual(sched(0.0), 3e-5)

    def test_dummy_vec_env_terminal_observation_uses_next_day(self):
        settings = read_settings(default_config="configs/ppo.yaml")
        probe = make_env(settings, split="train", scenario="S5")
        pipeline = probe.unwrapped.data_pipeline
        probe.close()

        def _make():
            return make_env(settings, split="train", scenario="S5", data_pipeline=pipeline)

        vec = DummyVecEnv([_make])
        vec.envs[0].reset(seed=0, options={"day_offset": 0, "initial_soc": 0.5})
        infos = None
        for _ in range(96):
            _, _, dones, infos = vec.step(np.array([[0.0]], dtype=np.float32))
        self.assertTrue(bool(dones[0]))
        term_obs = infos[0]["terminal_observation"]
        row_next = pipeline.get_day_data(1, "train").iloc[0]
        expected_load = row_next["p_load_kw"] / pipeline.p_load_max_train
        self.assertAlmostEqual(float(term_obs[0]), 0.5, places=5)
        self.assertAlmostEqual(float(term_obs[1]), float(expected_load), places=5)
        self.assertEqual(infos[0]["continuation"], "next_day_same_split")
        vec.close()

    def test_dummy_vec_env_split_boundary_is_terminal(self):
        settings = read_settings(default_config="configs/ppo.yaml")
        probe = make_env(settings, split="train", scenario="S5")
        pipeline = probe.unwrapped.data_pipeline
        last_train_day = pipeline.get_num_days("train") - 1
        probe.close()

        def _make():
            return make_env(settings, split="train", scenario="S5", data_pipeline=pipeline)

        vec = DummyVecEnv([_make])
        vec.envs[0].reset(seed=0, options={"day_offset": last_train_day, "initial_soc": 0.5})
        infos = None
        dones = None
        for _ in range(96):
            _, _, dones, infos = vec.step(np.array([[0.0]], dtype=np.float32))
        self.assertTrue(bool(dones[0]))
        self.assertEqual(infos[0]["continuation"], "dataset_boundary_terminal")
        self.assertIsNot(infos[0].get("TimeLimit.truncated"), True)
        vec.close()

    def test_ppo_wrapper_clips_actions_and_rejects_nan(self):
        seed_everything(0)
        settings = read_settings(default_config="configs/ppo.yaml")
        env = make_env(settings, split="train", scenario="S5")
        model = PPO(
            "MlpPolicy",
            env,
            n_steps=16,
            batch_size=8,
            n_epochs=1,
            policy_kwargs={"net_arch": {"pi": [16, 16], "vf": [16, 16]}},
            device="cpu",
            verbose=0,
        )
        wrapper = PPOAgentWrapper(model, clip_action=True)
        obs, _ = env.reset(seed=0)
        action, _ = wrapper.predict(obs, deterministic=True)
        self.assertEqual(action.shape, (1,))
        self.assertEqual(action.dtype, np.float32)
        self.assertTrue(-1.0 <= float(action[0]) <= 1.0)
        with self.assertRaises(ValueError):
            wrapper.predict(np.full(7, np.nan, dtype=np.float32))
        env.close()

        class _OutOfBoundsStub:
            def __init__(self, value: float):
                self.value = value

            def predict(self, obs, deterministic=True):
                return np.array([self.value], dtype=np.float32), None

        hi, _ = PPOAgentWrapper(_OutOfBoundsStub(2.5), clip_action=True).predict(np.zeros(7, dtype=np.float32))
        lo, _ = PPOAgentWrapper(_OutOfBoundsStub(-3.2), clip_action=True).predict(np.zeros(7, dtype=np.float32))
        self.assertEqual(float(hi[0]), 1.0)
        self.assertEqual(float(lo[0]), -1.0)

    def test_train_ppo_cli_smoke_and_checkpoint_reload(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            settings = read_settings(default_config="configs/ppo.yaml")
            settings["agent"].update(
                {
                    "net_arch": {"pi": [16, 16], "vf": [16, 16]},
                    "n_envs": 2,
                    "n_steps": 16,
                    "batch_size": 8,
                    "n_epochs": 2,
                }
            )
            settings["training"].update(
                {
                    "total_timesteps": 64,
                    "eval_freq": 32,
                    "eval_days": 1,
                    "log_freq": 32,
                    "seeds": [0],
                }
            )
            settings.pop("environment")
            cfg_path = root / "ppo.yaml"
            cfg_path.write_text(yaml.safe_dump(settings), encoding="utf-8")

            res = subprocess.run(
                [
                    sys.executable,
                    "-B",
                    "train_ppo.py",
                    "--config",
                    str(cfg_path),
                    "--device",
                    "cpu",
                    "--output",
                    str(root / "runs"),
                ],
                cwd=ROOT,
                capture_output=True,
                encoding="utf-8",
                timeout=120,
            )
            self.assertEqual(res.returncode, 0, res.stdout + res.stderr)

            run_dir = root / "runs/ppo_seed0"
            self.assertTrue((run_dir / "best.zip").is_file())
            self.assertTrue((run_dir / "last.zip").is_file())
            self.assertTrue((run_dir / "training.csv").is_file())
            self.assertTrue((run_dir / "learning_curve.png").is_file())

            summary = json.loads((run_dir / "training_summary.json").read_text(encoding="utf-8"))
            self.assertFalse(summary["test_used_for_selection"])
            self.assertGreaterEqual(summary["total_timesteps"], 64)

            meta = json.loads((run_dir / "metadata.json").read_text(encoding="utf-8"))
            self.assertEqual(meta["settings"]["environment"]["data"]["file_path"], "data/processed.csv")

            val_df = pd.read_csv(run_dir / "validation.csv")
            self.assertEqual(val_df["step"].tolist(), [0, 32, 64])

            loaded = load_ppo_model(run_dir, device="cpu")
            act, _ = loaded.predict(np.zeros(7, dtype=np.float32), deterministic=True)
            self.assertEqual(act.shape, (1,))

            # Từ chối ghi đè thư mục đã tồn tại
            overwrite = subprocess.run(
                [
                    sys.executable,
                    "-B",
                    "train_ppo.py",
                    "--config",
                    str(cfg_path),
                    "--device",
                    "cpu",
                    "--output",
                    str(root / "runs"),
                ],
                cwd=ROOT,
                capture_output=True,
                encoding="utf-8",
                timeout=120,
            )
            self.assertNotEqual(overwrite.returncode, 0)

    def test_train_ppo_sde_vecnormalize_smoke_and_reload(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            settings = read_settings(default_config="configs/ppo_sde_stable.yaml")
            settings["agent"].update(
                {
                    "net_arch": {"pi": [16, 16], "vf": [16, 16]},
                    "n_envs": 2,
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
            cfg_path = root / "ppo_sde_test.yaml"
            cfg_path.write_text(yaml.safe_dump(settings), encoding="utf-8")

            res = subprocess.run(
                [
                    sys.executable,
                    "-B",
                    "train_ppo.py",
                    "--config",
                    str(cfg_path),
                    "--device",
                    "cpu",
                    "--output",
                    str(root / "runs"),
                ],
                cwd=ROOT,
                capture_output=True,
                encoding="utf-8",
                timeout=120,
            )
            self.assertEqual(res.returncode, 0, res.stdout + res.stderr)
            run_dir = root / "runs/ppo_seed0"
            self.assertTrue((run_dir / "vecnormalize.pkl").is_file())

            sample_obs = np.array([0.5, 0.3, 0.2, 0.4, 0.0, 1.0, 1.0], dtype=np.float32)
            a1, _ = load_ppo_model(run_dir, device="cpu").predict(sample_obs, deterministic=True)
            a2, _ = load_ppo_model(run_dir, device="cpu").predict(sample_obs, deterministic=True)
            np.testing.assert_allclose(a1, a2, atol=1e-6)


if __name__ == "__main__":
    unittest.main()
