"""Kiểm tra việc bắt buộc GPU và pilot mới trước khi giao notebook Colab.

Máy kiểm thử có thể chỉ có CPU: giả lập kết quả phát hiện phần cứng để kiểm tra
các nhánh dừng/chạy, không giả lập kết quả huấn luyện hoặc tốc độ GPU.
"""

import ast
import base64
import contextlib
import hashlib
import io
import json
import tempfile
import types
import unittest
import zipfile
from pathlib import Path
from unittest.mock import Mock, patch

import pandas as pd

from scripts.build_sac_colab import bundle_bytes, embed_source_bundle, gpu_notebook


class GpuNotebookTests(unittest.TestCase):
    def execute_setup(self, output, cuda_version='13.0', available=True):
        """Thực thi nguyên ô 3 với kết quả nhận diện GPU được kiểm soát."""
        torch = types.ModuleType('torch')
        torch.__version__ = 'test+cu130'
        torch.version = types.SimpleNamespace(cuda=cuda_version)
        torch.cuda = types.SimpleNamespace(
            is_available=Mock(return_value=available),
            get_device_name=Mock(return_value='Test NVIDIA GPU'),
            synchronize=Mock(),
        )
        tensor = Mock()
        tensor.device.type = 'cuda'
        tensor.__matmul__ = Mock(return_value=tensor)
        tensor.__getitem__ = Mock(return_value=types.SimpleNamespace(item=lambda: 8.0))
        torch.ones = Mock(return_value=tensor)
        workflow = types.ModuleType('colab_sac')
        workflow.prepare_experiment = Mock(return_value={
            'final_steps': 300000, 'final_seeds': [0, 1, 2, 3, 4],
        })
        display_module = types.ModuleType('IPython.display')
        display_module.display, display_module.Image = Mock(), Mock()
        namespace = {'WORKSPACE': output, 'OUTPUT': output,
                     'STAGE': 'all', 'DEVICE_REQUEST': 'cuda'}
        modules = {'torch': torch, 'colab_sac': workflow, 'IPython.display': display_module}
        try:
            with patch.dict('sys.modules', modules), patch('subprocess.run'):
                with contextlib.redirect_stdout(io.StringIO()):
                    exec(gpu_notebook()['cells'][3]['source'], namespace)
        finally:
            # Giữ handle để kiểm tra rằng lỗi phần cứng không tạo kế hoạch huấn luyện.
            self.last_workflow = workflow
        return namespace, torch

    def test_cpu_build_stops_without_creating_experiment(self):
        with tempfile.TemporaryDirectory() as folder:
            output = Path(folder)
            with self.assertRaisesRegex(RuntimeError, 'chỉ hỗ trợ CPU'):
                self.execute_setup(output, cuda_version=None, available=False)
            self.last_workflow.prepare_experiment.assert_not_called()
            self.assertFalse((output / 'device_choice.json').exists())

    def test_missing_gpu_stops_without_falling_back_to_cpu(self):
        with tempfile.TemporaryDirectory() as folder:
            output = Path(folder)
            with self.assertRaisesRegex(RuntimeError, 'Chưa có GPU CUDA'):
                self.execute_setup(output, available=False)
            self.last_workflow.prepare_experiment.assert_not_called()
            self.assertFalse((output / 'device_choice.json').exists())

    def test_available_gpu_is_probed_and_recorded_as_cuda(self):
        with tempfile.TemporaryDirectory() as folder:
            output = Path(folder)
            namespace, torch = self.execute_setup(output)
            self.assertEqual(namespace['DEVICE'], 'cuda')
            torch.ones.assert_called_once_with((8, 8), device='cuda')
            torch.cuda.synchronize.assert_called_once()
            self.last_workflow.prepare_experiment.assert_called_once_with(output)
            device = json.loads((output / 'device_choice.json').read_text(encoding='utf-8'))
            self.assertEqual(device['device'], 'cuda')
            self.assertEqual(device['gpu_name'], 'Test NVIDIA GPU')

    def test_cpu_experiment_is_not_overwritten_by_gpu_setup(self):
        with tempfile.TemporaryDirectory() as folder:
            output = Path(folder)
            device_file = output / 'device_choice.json'
            before = '{"device": "cpu"}'
            device_file.write_text(before, encoding='utf-8')
            with self.assertRaisesRegex(ValueError, 'không ghi đè checkpoint CPU'):
                self.execute_setup(output)
            self.last_workflow.prepare_experiment.assert_not_called()
            self.assertEqual(device_file.read_text(encoding='utf-8'), before)

    def test_new_run_trains_pilots_before_lock_and_diagnoses_its_own_checkpoint(self):
        with tempfile.TemporaryDirectory() as folder:
            output = Path(folder)
            order = []
            workflow = types.SimpleNamespace(
                run_pilots=Mock(side_effect=lambda *args: order.append('pilot')),
                lock_configuration=Mock(side_effect=lambda *args: (
                    order.append('lock') or pd.DataFrame(), {'selected': 'daily_inventory'})),
                verify_lock=Mock(),
            )

            def diagnose(*arguments):
                order.append('diagnose')
                self.assertEqual(arguments[0], 'diagnose_sac.py')
                self.assertEqual(arguments[2], output / 'pilots/daily_inventory/custom_seed0')
                diagnosis = output / 'diagnosis_pilot'
                diagnosis.mkdir()
                columns = ['scenario', 'method', 'charge_kwh', 'discharge_kwh',
                           'clipped_at_soc_min', 'wear_cost_vnd', 'final_soc',
                           'adjusted_total_cost_vnd', 'reward_selection_gap_vnd']
                pd.DataFrame(columns=columns).to_csv(diagnosis / 'behavior_summary.csv', index=False)

            workflow.command = Mock(side_effect=diagnose)
            namespace = {'OUTPUT': output, 'DEVICE': 'cuda', 'STAGE': 'all',
                         'workflow': workflow, 'pd': pd, 'display': Mock(), 'Image': Mock()}
            with contextlib.redirect_stdout(io.StringIO()):
                exec(gpu_notebook()['cells'][11]['source'], namespace)
            self.assertEqual(order, ['pilot', 'lock', 'diagnose'])
            workflow.run_pilots.assert_called_once_with(output, 'cuda')
            workflow.verify_lock.assert_not_called()

    def test_delivered_notebook_compiles_and_contains_no_old_model(self):
        # Tự tạo bản giao từ nguồn: chạy được sau khi clone, không đọc runs/ cá nhân.
        notebook = embed_source_bundle(gpu_notebook(), bundle_bytes(include_reference_pilot=False))
        for cell in notebook['cells']:
            if cell['cell_type'] == 'code':
                compile(cell['source'], cell['id'], 'exec')
                self.assertEqual(cell['outputs'], [])
                self.assertIsNone(cell['execution_count'])
        assignments = {}
        for node in ast.parse(notebook['cells'][2]['source']).body:
            if isinstance(node, ast.Assign) and isinstance(node.value, ast.Constant):
                for target in node.targets:
                    if isinstance(target, ast.Name):
                        assignments[target.id] = node.value.value
        payload = base64.b64decode(assignments['SOURCE_BUNDLE_B64'], validate=True)
        self.assertEqual(hashlib.sha256(payload).hexdigest(), assignments['EXPECTED_BUNDLE_SHA256'])
        with zipfile.ZipFile(io.BytesIO(payload)) as archive:
            names = archive.namelist()
            self.assertIn('data/processed.csv', names)
            self.assertIn('train_sac.py', names)
            self.assertFalse(any(name.startswith('runs/') or name.endswith('.pt') for name in names))


if __name__ == '__main__':
    unittest.main()
