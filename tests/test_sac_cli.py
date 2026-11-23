"""Kiểm tra từ lệnh huấn luyện đến bảng đánh giá và việc từ chối ghi đè."""

import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

import pandas as pd
import yaml

from sems_rl.experiments.sac_experiment import ROOT, read_settings


class CommandLineTests(unittest.TestCase):
    def run_command(self, *arguments, success=True):
        result = subprocess.run(
            [sys.executable, "-B", *map(str, arguments)], cwd=ROOT,
            capture_output=True, encoding="utf-8", timeout=120,
        )
        if success:
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        else:
            self.assertNotEqual(result.returncode, 0)
        return result

    def test_train_evaluate_both_backends_and_preserve_existing_results(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            settings = read_settings()
            settings["agent"].update({
                "hidden_size": 16, "batch_size": 8,
                "buffer_size": 64, "learning_starts": 8,
            })
            settings["training"].update({
                "total_timesteps": 20, "eval_freq": 10, "eval_days": 1,
                "log_freq": 10, "seeds": [0],
            })
            settings.pop("environment")
            config_path = root / "sac.yaml"
            config_path.write_text(yaml.safe_dump(settings), encoding="utf-8")
            for backend in ("custom", "sb3"):
                self.run_command(
                    "train_sac.py", "--backend", backend, "--config", config_path,
                    "--output", root / "models",
                )
                run = root / "models" / f"{backend}_seed0"
                summary = json.loads((run / "training_summary.json").read_text())
                self.assertFalse(summary["test_used_for_selection"])
                self.assertEqual(summary["total_timesteps"], 20)
                validation = pd.read_csv(run / "validation.csv")
                self.assertEqual(validation.step.tolist(), [0, 10, 20])
                self.assertTrue((run / "learning_curve.png").is_file())
                self.assertTrue((run / "training.csv").is_file())

            custom = root / "models/custom_seed0"
            sb3 = root / "models/sb3_seed0"
            self.run_command(
                "evaluate_sac.py", "--runs", custom, sb3, "--split", "val",
                "--max-days", 1, "--data-path", ROOT / "data/processed.csv",
                "--output", root / "evaluation",
            )
            daily = pd.read_csv(root / "evaluation/daily_metrics.csv")
            self.assertEqual(set(daily.method), {"custom", "sb3", "no_battery", "rule_based"})
            self.assertEqual(set(daily.scenario), {"S1", "S2", "S3", "S4", "S5"})
            self.assertEqual(len(daily), 20)
            self.assertTrue(daily.final_soc.between(0.2 - 1e-6, 0.9 + 1e-6).all())
            checkpoint = custom / "best.pt"
            before = checkpoint.read_bytes()
            self.run_command(
                "train_sac.py", "--backend", "custom", "--config", config_path,
                "--output", root / "models", success=False,
            )
            self.assertEqual(before, checkpoint.read_bytes())


if __name__ == "__main__":
    unittest.main()
