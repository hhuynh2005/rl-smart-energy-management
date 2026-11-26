"""Kiểm thử chế độ DDQN của server.py: Q-values theo từng bước, lỗi rõ khi thiếu checkpoint.

Gọi thẳng hàm simulate() vì repo chưa cài httpx cho TestClient.
"""

import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import numpy as np
from fastapi import HTTPException

import server
from sems_rl.agents.ddqn import DDQNAgent, DDQNConfig

S1 = "S1: Ngày làm việc điển hình (Typical Weekday)"


class ServerDDQNTests(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.root = Path(self.folder.name)

    def tearDown(self):
        self.folder.cleanup()

    def checkpoint(self, dueling=True):
        path = self.root / f"best_{dueling}.pt"
        DDQNAgent(DDQNConfig(hidden_size=16, batch_size=8, buffer_size=32,
                             dueling=dueling), seed=1).save(path)
        return path

    def simulate(self, path, policy_mode="ddqn"):
        with patch.dict(os.environ, {"SEMS_DDQN_CHECKPOINT": str(path)}):
            return server.simulate(server.SimulationRequest(scenario=S1, policy_mode=policy_mode))

    def test_ddqn_mode_returns_q_values_per_step(self):
        result = self.simulate(self.checkpoint())
        self.assertEqual(result["policy_mode"], "ddqn")
        self.assertIn("kpi_metrics", result)
        self.assertEqual(len(result["action_grid"]), 11)
        self.assertEqual(len(result["timeline"]), 96)
        for step in result["timeline"]:
            ddqn = step["ddqn"]
            self.assertEqual(len(ddqn["q_values"]), 11)
            self.assertEqual(len(ddqn["advantages"]), 11)
            self.assertEqual(ddqn["chosen_k"], int(np.argmax(ddqn["q_values"])))
            self.assertIsInstance(ddqn["v_value"], float)

    def test_missing_checkpoint_returns_clear_error_without_fallback(self):
        with self.assertRaises(HTTPException) as caught:
            self.simulate(self.root / "missing.pt")
        self.assertEqual(caught.exception.status_code, 404)
        self.assertIn("DDQN", caught.exception.detail)

    def test_plain_head_checkpoint_has_no_value_stream(self):
        result = self.simulate(self.checkpoint(dueling=False))
        step = result["timeline"][0]["ddqn"]
        self.assertIsNone(step["v_value"])
        self.assertIsNone(step["advantages"])
        self.assertEqual(len(step["q_values"]), 11)

    def test_other_modes_have_no_ddqn_field(self):
        result = self.simulate(self.root / "missing.pt", policy_mode="rbc")
        self.assertNotIn("action_grid", result)
        self.assertTrue(all("ddqn" not in step for step in result["timeline"]))
        self.assertFalse(any(c.startswith("ddqn_") for c in server.flatten_timeline(result["timeline"]).columns))

    def test_csv_export_flattens_ddqn_columns(self):
        frame = server.flatten_timeline(self.simulate(self.checkpoint())["timeline"])
        expected = {"ddqn_chosen_k", "ddqn_v_value"}
        expected |= {f"ddqn_q_{i}" for i in range(11)} | {f"ddqn_adv_{i}" for i in range(11)}
        self.assertTrue(expected <= set(frame.columns))
        self.assertNotIn("ddqn", frame.columns)
        self.assertNotIn("flows", frame.columns)
        self.assertEqual(len(frame), 96)


if __name__ == "__main__":
    unittest.main()
