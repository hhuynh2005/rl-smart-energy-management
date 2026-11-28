"""Chạy dashboard_ddqn.py bằng Streamlit AppTest trên một mô hình DDQN nhỏ vừa huấn luyện."""

import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from streamlit.testing.v1 import AppTest

from sems_rl.experiments.sac_experiment import ROOT
from tests.test_ddqn_cli import run_command, write_small_ddqn_config

DASHBOARD = str(ROOT / "dashboard_ddqn.py")


class DashboardTests(unittest.TestCase):
    def test_dashboard_renders_learning_comparison_and_q_values(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            run_command(self, "train_ddqn.py", "--config", write_small_ddqn_config(root),
                        "--output", root / "models")
            with patch.dict(os.environ, {"SEMS_DDQN_RUNS": str(root / "models/ddqn_seed0"),
                                         "SEMS_SAC_RUNS": str(root / "no_sac")}):
                app = AppTest.from_file(DASHBOARD, default_timeout=180).run()
            self.assertFalse(app.exception, [e.value for e in app.exception])
            self.assertFalse(app.error, [e.value for e in app.error])
            # Ba phần: quá trình học, so sánh trong ngày, và Q(s,k)/V/A tại một bước.
            self.assertGreaterEqual(len(app.get("plotly_chart")), 4)
            self.assertTrue(any("Q(s,k)" in s.value for s in app.subheader))

    def test_missing_runs_show_clear_error(self):
        with tempfile.TemporaryDirectory() as folder:
            with patch.dict(os.environ, {"SEMS_DDQN_RUNS": str(Path(folder) / "none")}):
                app = AppTest.from_file(DASHBOARD, default_timeout=60).run()
            self.assertFalse(app.exception)
            self.assertTrue(app.error)
            self.assertIn("DDQN", app.error[0].value)


if __name__ == "__main__":
    unittest.main()
