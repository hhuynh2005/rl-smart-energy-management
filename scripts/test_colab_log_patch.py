"""Kiểm tra log trực tiếp, thời gian chờ và dừng đúng tiến trình con.

Chạy: python -m unittest discover -s scripts -p test_colab_log_patch.py -v
"""

import contextlib
import io
import json
import subprocess
import tempfile
import time
import unittest
from pathlib import Path
from unittest.mock import patch

from scripts.colab_log_patch import command_with_logs, training_progress


class LogTests(unittest.TestCase):
    def test_progress_reports_written_steps(self):
        with tempfile.TemporaryDirectory() as directory:
            run = Path(directory) / 'custom_seed0'
            run.mkdir()
            (run / 'training.csv').write_text('step,elapsed_seconds\n42000,500\n', encoding='utf-8')
            (run / 'validation.csv').write_text('step\n40000\n', encoding='utf-8')
            (run / 'metadata.json').write_text(json.dumps({
                'settings': {'training': {'total_timesteps': 300000}}}), encoding='utf-8')
            text = training_progress(('train_sac.py', '--output', directory, '--seeds', '0'))
            self.assertIn('42,000', text)
            self.assertIn('40,000', text)
            self.assertIn('300,000', text)

    def test_stdout_stderr_and_heartbeat_are_visible_before_process_finishes(self):
        class Recorder(io.StringIO):
            def __init__(self):
                super().__init__()
                self.events = []

            def write(self, value):
                self.events.append((time.monotonic(), value))
                return super().write(value)

        with tempfile.TemporaryDirectory() as directory:
            output = Recorder()
            script = "import sys,time; print('LIVE_OUT',flush=True); time.sleep(.4); print('LIVE_ERR',file=sys.stderr,flush=True); time.sleep(.4)"
            with contextlib.redirect_stdout(output):
                command_with_logs('-c', script, workspace=directory, output_root=directory,
                                  heartbeat_seconds=0.05)
            finished = time.monotonic()
            first = next(stamp for stamp, value in output.events if 'LIVE_OUT' in value)
            self.assertLess(first, finished - 0.3)
            self.assertIn('LIVE_ERR', output.getvalue())
            self.assertIn('⏱', output.getvalue())

    def test_child_failure_is_propagated_with_its_output(self):
        with tempfile.TemporaryDirectory() as directory, contextlib.redirect_stdout(io.StringIO()):
            with self.assertRaises(subprocess.CalledProcessError) as raised:
                command_with_logs('-c', "print('CHILD_FAILURE'); raise SystemExit(3)",
                                  workspace=directory, output_root=directory)
            self.assertEqual(raised.exception.returncode, 3)
            self.assertIn('CHILD_FAILURE', raised.exception.output)

    def test_interrupt_stops_owned_process(self):
        actual_popen, spawned = subprocess.Popen, []

        def remember(*args, **kwargs):
            process = actual_popen(*args, **kwargs)
            spawned.append(process)
            return process

        with tempfile.TemporaryDirectory() as directory, contextlib.redirect_stdout(io.StringIO()):
            with patch('scripts.colab_log_patch.subprocess.Popen', side_effect=remember):
                with patch('scripts.colab_log_patch.queue.Queue.get', side_effect=KeyboardInterrupt):
                    with self.assertRaises(KeyboardInterrupt):
                        command_with_logs('-c', 'import time; time.sleep(30)',
                                          workspace=directory, output_root=directory)
            self.assertEqual(len(spawned), 1)
            self.assertIsNotNone(spawned[0].poll())

    def test_existing_experiment_job_blocks_duplicate_launch(self):
        with patch('scripts.colab_log_patch.active_experiment_jobs', return_value=[{'pid': 123}]):
            with patch('scripts.colab_log_patch.subprocess.Popen') as launch:
                with self.assertRaisesRegex(RuntimeError, 'checkpoint'):
                    command_with_logs('train_sac.py', workspace='.', output_root='.')
                launch.assert_not_called()


if __name__ == '__main__':
    unittest.main()
