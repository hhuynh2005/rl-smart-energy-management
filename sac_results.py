"""Đọc, kiểm tra và tổng hợp kết quả SAC đã huấn luyện.

Module phục vụ giao diện/báo cáo, đặt ngoài mã huấn luyện để không thay đổi
source_hash của các thí nghiệm Colab đã khóa. Không cập nhật trọng số mô hình.
"""

import hashlib
import json
from pathlib import Path

import numpy as np
import pandas as pd

from colab_sac import completed_run, source_hash
from evaluate_sac import aggregate_results
from sems_rl.experiments.sac_experiment import ROOT, protocol_fingerprint


METHOD_NAMES = {'custom': 'SAC', 'no_battery': 'Không dùng pin', 'rule_based': 'Điều khiển theo luật'}
SCENARIO_NAMES = {
    'S1': 'Ngày làm việc', 'S2': 'Chủ nhật', 'S3': 'PV giảm 50%',
    'S4': 'Nhiễu quan sát', 'S5': 'Toàn bộ ngày',
}


def read_json(path, default=None):
    path = Path(path)
    if not path.is_file():
        return {} if default is None else default
    return json.loads(path.read_text(encoding='utf-8'))


def sha256(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def discover_experiments(directory=None):
    """Chỉ chọn thí nghiệm có khóa cấu hình và ít nhất một metadata chính thức."""
    directory = Path(directory or ROOT / 'runs')
    roots = [p.parent for p in directory.rglob('configuration_lock.json')
             if any((p.parent / 'final').glob('custom_seed*/metadata.json'))]
    return sorted(roots, key=lambda p: (p / 'configuration_lock.json').stat().st_mtime, reverse=True)


def run_paths(root):
    return sorted((Path(root) / 'final').glob('custom_seed*/metadata.json'),
                  key=lambda p: read_json(p)['seed'])


def seed_summary(root):
    """Lấy mốc tốt nhất từ training_summary, không suy đoán bằng bước cuối log."""
    rows = []
    for metadata_path in run_paths(root):
        run = metadata_path.parent
        metadata = read_json(metadata_path)
        summary = read_json(run / 'training_summary.json')
        validation = pd.read_csv(run / 'validation.csv')
        steps = summary.get('total_timesteps', int(validation.step.max()))
        planned = metadata['settings']['training']['total_timesteps']
        best_step = summary.get('best_step', int(validation.loc[
            validation.adjusted_total_cost_vnd_mean.idxmin(), 'step']))
        rows.append({
            'seed': metadata['seed'], 'trained_steps': steps, 'planned_steps': planned,
            'best_step': best_step,
            'best_cost_vnd': summary.get('best_validation_adjusted_total_cost_vnd',
                                         float(validation.adjusted_total_cost_vnd_mean.min())),
            'last_cost_vnd': float(validation.iloc[-1].adjusted_total_cost_vnd_mean),
            'elapsed_minutes': summary.get('elapsed_seconds', np.nan) / 60,
            'device': metadata.get('device', 'không ghi'),
            'complete': steps == planned and (run / 'best.pt').is_file(),
            'run_path': str(run),
        })
    return pd.DataFrame(rows)


def learning_logs(root):
    frames = {'training': [], 'validation': []}
    for metadata_path in run_paths(root):
        seed = read_json(metadata_path)['seed']
        for name in frames:
            path = metadata_path.parent / f'{name}.csv'
            if path.is_file():
                frame = pd.read_csv(path)
                frame['seed'] = seed
                frames[name].append(frame)
    return {name: pd.concat(values, ignore_index=True) if values else pd.DataFrame()
            for name, values in frames.items()}


def evaluation_available(root, split):
    if split not in ('val', 'test'):
        return False
    folder = Path(root) / ('final_validation' if split == 'val' else 'final_test')
    metadata = read_json(folder / 'evaluation_metadata.json')
    return (folder / 'summary.csv').is_file() and metadata.get('split') == split


def evaluation(root, split='val'):
    """Luôn đọc đúng phân vùng; thiếu test thì báo thiếu, không lấy validation thay."""
    if not evaluation_available(root, split):
        raise FileNotFoundError(f'Chưa có kết quả {split} trong thí nghiệm này.')
    folder = Path(root) / ('final_validation' if split == 'val' else 'final_test')
    return pd.read_csv(folder / 'summary.csv'), pd.read_csv(folder / 'daily_metrics.csv')


def cost_comparison(summary):
    """Tiết kiệm tổng chi phí khác với trung bình % tiết kiệm tiền điện mỗi ngày."""
    result = summary.copy()
    baseline = result[result.method.eq('no_battery')].set_index('scenario')
    rules = result[result.method.eq('rule_based')].set_index('scenario')
    for label, reference in [('no_battery', baseline), ('rule_based', rules)]:
        denominator = result.scenario.map(reference.adjusted_total_cost_vnd_mean)
        denominator = denominator.where(denominator.gt(0))
        result[f'total_saving_vs_{label}_pct'] = (
            100 * (denominator - result.adjusted_total_cost_vnd_mean) / denominator
        )
    return result


def integrity_checks(root):
    """Kiểm tra hash, cấu hình, ngân sách, fingerprint và phép tổng hợp CSV."""
    root = Path(root)
    lock = read_json(root / 'configuration_lock.json')
    checks = []

    def add(name, ok, detail):
        checks.append({'check': name, 'passed': bool(ok), 'detail': str(detail)})

    dataset = ROOT / 'data/processed.csv'
    add('Dữ liệu CSV', dataset.is_file() and sha256(dataset) == lock.get('data_sha256'), dataset)
    config = root / 'locked_config.yaml'
    add('Cấu hình đã khóa', config.is_file() and sha256(config) == lock.get('config_sha256'), config)
    add('Mã huấn luyện', source_hash() == lock.get('source_sha256'), lock.get('source_sha256'))
    paths = run_paths(root)
    seeds = [read_json(p)['seed'] for p in paths]
    add('Đủ seed chính thức', sorted(seeds) == sorted(lock.get('final_seeds', [])), seeds)
    fingerprints = set()
    for path in paths:
        metadata = read_json(path)
        fingerprints.add(protocol_fingerprint(metadata))
        try:
            complete = completed_run(path.parent, config, metadata['seed'], lock['final_steps'])
            summary = read_json(path.parent / 'training_summary.json')
            val = pd.read_csv(path.parent / 'validation.csv')
            selected = val[val.step.eq(summary['best_step'])]
            consistent = (len(selected) == 1 and np.isclose(
                selected.iloc[0].adjusted_total_cost_vnd_mean,
                summary['best_validation_adjusted_total_cost_vnd'], rtol=0, atol=1e-5))
            add(f'Seed {metadata["seed"]}: ngân sách và checkpoint', complete and consistent,
                f'{summary.get("total_timesteps")} bước; best={summary.get("best_step")}')
        except (OSError, ValueError, KeyError) as error:
            add(f'Seed {metadata["seed"]}: ngân sách và checkpoint', False, error)
    add('Cùng quy ước đánh giá', len(fingerprints) == 1, sorted(fingerprints))
    test_lock = read_json(root / 'test_models_lock.json')
    if test_lock:
        hashes_match = all(
            (root / 'final' / f'custom_seed{seed}' / 'best.pt').is_file()
            and sha256(root / 'final' / f'custom_seed{seed}' / 'best.pt') == expected
            for seed, expected in test_lock.get('checkpoints', {}).items()
        )
        add('Khóa checkpoint trước test',
            hashes_match and len(test_lock.get('checkpoints', {})) == len(paths)
            and test_lock.get('configuration_sha256') == lock.get('config_sha256'),
            'Hash mô hình và cấu hình giữ nguyên từ lúc mở test')
    for split in ('val', 'test'):
        if not evaluation_available(root, split):
            continue
        summary, daily = evaluation(root, split)
        _, rebuilt = aggregate_results(daily)
        columns = list(rebuilt.columns)
        left = summary[columns].sort_values(['method', 'scenario']).reset_index(drop=True)
        right = rebuilt.sort_values(['method', 'scenario']).reset_index(drop=True)
        try:
            pd.testing.assert_frame_equal(left, right, check_dtype=False, rtol=1e-8, atol=1e-6)
            same = True
        except AssertionError:
            same = False
        add(f'Tổng hợp {split} từ dữ liệu từng ngày', same,
            f'{len(daily)} dòng; {len(summary)} nhóm phương pháp/kịch bản')
        folder = root / ('final_validation' if split == 'val' else 'final_test')
        meta = read_json(folder / 'evaluation_metadata.json')
        add(f'Fingerprint {split}', meta.get('fingerprint') in fingerprints, meta.get('fingerprint'))
    manifest = read_json(root / 'import_manifest.json')
    if manifest.get('files'):
        bad = [item['path'] for item in manifest['files']
               if not (root / item['path']).is_file() or sha256(root / item['path']) != item['sha256']]
        add('File gốc nhập từ Drive', not bad, f'{len(manifest["files"])} file; sai khác: {bad}')
    return pd.DataFrame(checks)


def export_analysis(root):
    """Xuất CSV tổng hợp và HTML tương tác; giữ nguyên log/checkpoint đầu vào."""
    import plotly.express as px
    import plotly.io as pio

    root = Path(root)
    output = root / 'analysis'
    output.mkdir(exist_ok=True)
    checks = integrity_checks(root)
    checks.to_csv(output / 'integrity.csv', index=False, encoding='utf-8-sig')
    if not checks.passed.all():
        raise ValueError('Kiểm tra nguồn dữ liệu chưa đạt; xem analysis/integrity.csv.')
    seeds = seed_summary(root)
    seeds.to_csv(output / 'seed_summary.csv', index=False, encoding='utf-8-sig')
    logs = learning_logs(root)
    for name, frame in logs.items():
        frame.to_csv(output / f'{name}_all_seeds.csv', index=False, encoding='utf-8-sig')
    comparisons = []
    for split in ('val', 'test'):
        if evaluation_available(root, split):
            summary, _ = evaluation(root, split)
            comparison = cost_comparison(summary)
            comparison['split'] = split
            comparisons.append(comparison)
    combined = pd.concat(comparisons, ignore_index=True)
    combined.to_csv(output / 'evaluation_comparison.csv', index=False, encoding='utf-8-sig')
    figures = [px.line(logs['validation'], x='step', y='adjusted_total_cost_vnd_mean',
                       color=logs['validation'].seed.astype(str), markers=True,
                       title='Chi phí validation theo bước huấn luyện',
                       labels={'step': 'Bước huấn luyện', 'adjusted_total_cost_vnd_mean': 'đồng/ngày', 'color': 'Seed'})]
    for split in combined.split.unique():
        values = combined[combined.split.eq(split)].copy()
        values['method_name'] = values.method.map(METHOD_NAMES)
        figures.append(px.bar(values, x='scenario', y='adjusted_total_cost_vnd_mean',
                              color='method_name', barmode='group',
                              error_y='adjusted_total_cost_vnd_std_seeds',
                              title=f'Tổng chi phí điều chỉnh — {split}',
                              labels={'scenario': 'Kịch bản', 'adjusted_total_cost_vnd_mean': 'đồng/ngày',
                                      'method_name': 'Phương pháp'}))
    parts = ['<!doctype html><html lang="vi"><meta charset="utf-8">',
             '<title>Kết quả SAC từ Google Colab</title>',
             '<style>body{font:16px system-ui;margin:32px auto;max-width:1200px;padding:0 24px;color:#17263a}'
             'table{border-collapse:collapse;width:100%}td,th{padding:10px;border-bottom:1px solid #ddd}</style>',
             '<h1>Kết quả SAC từ Google Colab</h1>',
             '<p>Chi phí điều chỉnh gồm hao mòn, phạt và định giá điện còn trong pin. '
             'Validation dùng chọn mô hình; test được báo cáo riêng. Sai số biểu diễn là độ lệch chuẩn giữa seed.</p>']
    for index, figure in enumerate(figures):
        parts.append(pio.to_html(figure, full_html=False, include_plotlyjs=True if index == 0 else False))
    parts.extend(['<h2>Checkpoint và thời gian từng seed</h2>', seeds.drop(columns='run_path').to_html(index=False),
                  '<h2>Đối chiếu nguồn dữ liệu</h2>', checks.to_html(index=False), '</html>'])
    (output / 'bao_cao_sac.html').write_text('\n'.join(parts), encoding='utf-8')
    # Chỉ lưu console đã có trong notebook; không thực thi bất kỳ ô code nào.
    notebook = read_json(root / 'notebook.ipynb')
    raw = []
    for cell in notebook.get('cells', []):
        source = cell.get('source', '')
        source = ''.join(source) if isinstance(source, list) else source
        if source.startswith('# 8.'):
            for item in cell.get('outputs', []):
                if item.get('output_type') == 'stream':
                    text = item.get('text', '')
                    raw.append(''.join(text) if isinstance(text, list) else text)
    if raw:
        (output / 'colab_console.log').write_text(''.join(raw), encoding='utf-8')
    return output
