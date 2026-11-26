"""Kiểm tra lệnh huấn luyện/đánh giá DDQN chạy thật trên môi trường và không ghi đè kết quả."""

import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

import pandas as pd
import yaml

from sems_rl.experiments.sac_experiment import ROOT, read_settings


def run_command(test, *arguments, success=True):
    result = subprocess.run(
        [sys.executable, "-B", *map(str, arguments)], cwd=ROOT,
        capture_output=True, encoding="utf-8", timeout=300,
    )
    if success:
        test.assertEqual(result.returncode, 0, result.stdout + result.stderr)
    else:
        test.assertNotEqual(result.returncode, 0)
    return result


def write_small_ddqn_config(root):
    settings = read_settings(ROOT / "configs/ddqn.yaml")
    settings["agent"].update({
        "hidden_size": 16, "batch_size": 8, "buffer_size": 64,
        "learning_starts": 8, "epsilon_decay_steps": 10,
    })
    settings["training"].update({
        "total_timesteps": 20, "eval_freq": 10, "eval_days": 1,
        "log_freq": 10, "seeds": [0],
    })
    settings.pop("environment")
    path = root / "ddqn.yaml"
    path.write_text(yaml.safe_dump(settings), encoding="utf-8")
    return path


class TrainingCommandTests(unittest.TestCase):
    def test_train_writes_expected_artifacts_and_refuses_overwrite(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            config_path = write_small_ddqn_config(root)
            run_command(self, "train_ddqn.py", "--config", config_path, "--output", root / "models")
            run = root / "models/ddqn_seed0"
            for name in ("metadata.json", "validation.csv", "training.csv", "best.pt",
                         "last.pt", "training_summary.json", "learning_curve.png"):
                self.assertTrue((run / name).is_file(), name)
            summary = json.loads((run / "training_summary.json").read_text(encoding="utf-8"))
            self.assertFalse(summary["test_used_for_selection"])
            self.assertEqual(summary["total_timesteps"], 20)
            metadata = json.loads((run / "metadata.json").read_text(encoding="utf-8"))
            self.assertEqual(metadata["backend"], "ddqn")
            self.assertEqual(pd.read_csv(run / "validation.csv").step.tolist(), [0, 10, 20])
            training = pd.read_csv(run / "training.csv")
            self.assertEqual(list(training.columns), [
                "step", "elapsed_seconds", "loss", "q_mean", "td_error_mean", "epsilon",
            ])
            # epsilon nhận bước TOÀN CỤC: với decay 10 bước, tại step 10 đã về 0.05.
            self.assertEqual(int(training.step.iloc[0]), 10)
            self.assertAlmostEqual(float(training.epsilon.iloc[0]), 0.05)

            checkpoint = run / "best.pt"
            before = checkpoint.read_bytes()
            run_command(self, "train_ddqn.py", "--config", config_path,
                        "--output", root / "models", success=False)
            self.assertEqual(before, checkpoint.read_bytes())


if __name__ == "__main__":
    unittest.main()
