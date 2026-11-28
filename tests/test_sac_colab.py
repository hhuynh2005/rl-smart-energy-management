"""Kiểm tra reward, khôi phục phiên và chặn test khi chưa đủ thí nghiệm."""

import json
import subprocess
import sys
import tempfile
import unittest
from copy import deepcopy
from pathlib import Path

import numpy as np
import pandas as pd
import torch
import yaml

from colab_sac import evaluate_final, file_hash, prepare_experiment
from sems_rl.experiments.sac_experiment import (
    ROOT, episode, episode_metrics, make_env, read_settings, write_json,
)


class ColabTests(unittest.TestCase):
    def test_daily_inventory_reward_matches_selection_cost_and_stops_bootstrap(self):
        settings = read_settings()
        settings["objective"] = {"mode": "daily_inventory"}
        settings["agent"]["gamma"] = 1.0
        env = make_env(settings, "val", "S3")
        calls = iter([0.8] * 24 + [-0.7] * 72)
        history = episode(env, lambda obs, info: np.array([next(calls)], np.float32), 0, 0, 0.5)
        metrics = episode_metrics(history, env, 0.5)
        self.assertAlmostEqual(-sum(row["reward"] for row in history) * env.unwrapped.c_ref,
                               metrics["adjusted_total_cost_vnd"], places=6)
        self.assertEqual(history[-1]["continuation"], "daily_inventory_terminal")
        observation, _ = env.reset(options={"day_offset": 0, "initial_soc": 0.5})
        for _ in range(96):
            observation, _, terminated, truncated, _ = env.step([0.0])
        self.assertTrue(terminated)
        self.assertFalse(truncated)
        self.assertTrue(env.observation_space.contains(observation))
        env.close()
        settings["agent"]["gamma"] = 0.99
        with self.assertRaisesRegex(ValueError, "gamma=1"):
            make_env(settings)

    def cli(self, *args, success=True):
        result = subprocess.run([sys.executable, "-B", "train_sac.py", *map(str, args)],
                                cwd=ROOT, capture_output=True, encoding="utf-8", timeout=120)
        if success:
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        else:
            self.assertNotEqual(result.returncode, 0)

    def assert_nested_equal(self, left, right):
        if torch.is_tensor(left):
            self.assertTrue(torch.equal(left, right))
        elif isinstance(left, dict):
            self.assertEqual(left.keys(), right.keys())
            for key in left:
                self.assert_nested_equal(left[key], right[key])
        elif isinstance(left, (list, tuple)):
            self.assertEqual(len(left), len(right))
            for a, b in zip(left, right):
                self.assert_nested_equal(a, b)
        else:
            self.assertEqual(left, right)

    def test_resume_matches_continuous_training_across_warmup_day_end_and_buffer_wrap(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            settings = read_settings()
            settings.pop("environment")
            settings["objective"] = {"mode": "daily_inventory"}
            settings["agent"].update({"hidden_size": 16, "batch_size": 8, "buffer_size": 64,
                                       "learning_starts": 20, "gamma": 1.0})
            settings["training"].update({"total_timesteps": 130, "eval_freq": 30,
                                          "eval_days": 1, "log_freq": 10, "seeds": [0]})
            config = root / "config.yaml"
            config.write_text(yaml.safe_dump(settings), encoding="utf-8")
            common = ["--config", config, "--checkpoint-freq", "30"]
            self.cli(*common, "--output", root / "continuous")
            self.cli(*common, "--output", root / "resumed", "--session-steps", "13")
            self.cli(*common, "--output", root / "resumed", "--resume", "--session-steps", "37")
            run = root / "resumed/custom_seed0"
            before = file_hash(run / "resume.pt")
            altered = deepcopy(settings)
            altered["agent"]["learning_rate"] *= 2
            bad = root / "bad.yaml"
            bad.write_text(yaml.safe_dump(altered), encoding="utf-8")
            self.cli("--config", bad, "--output", root / "resumed", "--resume", success=False)
            self.assertEqual(before, file_hash(run / "resume.pt"))
            self.cli(*common, "--output", root / "resumed", "--resume")
            uninterrupted = root / "continuous/custom_seed0"
            for name in ("best.pt", "last.pt"):
                self.assert_nested_equal(
                    torch.load(uninterrupted / name, weights_only=True),
                    torch.load(run / name, weights_only=True),
                )
            for name in ("training.csv", "validation.csv"):
                left, right = (pd.read_csv(path / name).drop(columns=["elapsed_seconds"], errors="ignore")
                               for path in (uninterrupted, run))
                pd.testing.assert_frame_equal(left, right, check_exact=True)

    def test_test_set_is_blocked_before_all_five_seeds_finish(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            plan = prepare_experiment(root)
            config = root / "locked_config.yaml"
            config.write_text((root / "configs/original.yaml").read_text(encoding="utf-8"), encoding="utf-8")
            write_json(root / "configuration_lock.json", {
                "config_sha256": file_hash(config), "final_steps": 300000,
                "final_seeds": [0, 1, 2, 3, 4], "source_sha256": plan["source_sha256"],
            })
            with self.assertRaisesRegex(ValueError, "Chưa đủ"):
                evaluate_final(root, "test")
            self.assertFalse((root / "final_test").exists())
            self.assertFalse((root / "test_models_lock.json").exists())
            config.write_text("modified", encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "bị thay đổi"):
                evaluate_final(root, "test")


if __name__ == "__main__":
    unittest.main()
