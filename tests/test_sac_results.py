"""Kiểm tra các phép đo và nhãn nguồn trên giao diện SAC."""

import json
import tempfile
import unittest
from pathlib import Path

import pandas as pd

from sac_results import cost_comparison, evaluation, evaluation_available, seed_summary


class ResultTests(unittest.TestCase):
    def test_total_savings_use_total_cost_not_bill_savings(self):
        frame = pd.DataFrame([
            {'method': 'custom', 'scenario': 'S5', 'adjusted_total_cost_vnd_mean': 80.0,
             'adjusted_cost_saving_pct_mean': 99.0},
            {'method': 'no_battery', 'scenario': 'S5', 'adjusted_total_cost_vnd_mean': 100.0,
             'adjusted_cost_saving_pct_mean': 0.0},
            {'method': 'rule_based', 'scenario': 'S5', 'adjusted_total_cost_vnd_mean': 85.0,
             'adjusted_cost_saving_pct_mean': 50.0},
        ])
        result = cost_comparison(frame).iloc[0]
        self.assertAlmostEqual(result.total_saving_vs_no_battery_pct, 20.0)
        self.assertAlmostEqual(result.total_saving_vs_rule_based_pct, 100 * 5 / 85)

    def test_missing_or_mislabeled_test_is_not_replaced_by_validation(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            validation = root / 'final_validation'
            validation.mkdir()
            (validation / 'evaluation_metadata.json').write_text('{"split":"val"}', encoding='utf-8')
            (validation / 'summary.csv').write_text('method,scenario\ncustom,S5\n', encoding='utf-8')
            self.assertTrue(evaluation_available(root, 'val'))
            self.assertFalse(evaluation_available(root, 'test'))
            with self.assertRaises(FileNotFoundError):
                evaluation(root, 'test')
            test = root / 'final_test'
            test.mkdir()
            (test / 'summary.csv').write_text('method,scenario\ncustom,S5\n', encoding='utf-8')
            (test / 'evaluation_metadata.json').write_text('{"split":"val"}', encoding='utf-8')
            self.assertFalse(evaluation_available(root, 'test'))

    def test_best_checkpoint_and_final_cost_stay_distinct(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            run = root / 'final/custom_seed0'
            run.mkdir(parents=True)
            (run / 'metadata.json').write_text(json.dumps({
                'seed': 0, 'device': 'cpu', 'settings': {'training': {'total_timesteps': 300000}},
            }), encoding='utf-8')
            (run / 'training_summary.json').write_text(json.dumps({
                'total_timesteps': 300000, 'best_step': 80000,
                'best_validation_adjusted_total_cost_vnd': 80.0, 'elapsed_seconds': 120.0,
            }), encoding='utf-8')
            pd.DataFrame({'step': [0, 80000, 300000],
                          'adjusted_total_cost_vnd_mean': [100, 80, 90]}).to_csv(run / 'validation.csv', index=False)
            (run / 'best.pt').write_bytes(b'only used to check file existence')
            row = seed_summary(root).iloc[0]
            self.assertEqual(row.best_step, 80000)
            self.assertEqual(row.best_cost_vnd, 80.0)
            self.assertEqual(row.last_cost_vnd, 90.0)
            self.assertEqual(row.elapsed_minutes, 2.0)
            self.assertTrue(row.complete)


if __name__ == '__main__':
    unittest.main()
