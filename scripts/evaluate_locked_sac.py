"""Đánh giá các checkpoint SAC đã khóa và tổng hợp lại báo cáo.

Chạy từ gốc dự án bằng python -m scripts.evaluate_locked_sac --experiment ...
Các điều kiện đủ ngân sách, cấu hình, hash mô hình vẫn do colab_sac kiểm tra.
"""

import argparse
from datetime import datetime, timezone
from pathlib import Path

from colab_sac import evaluate_final
from sac_results import export_analysis, integrity_checks
from sems_rl.experiments.sac_experiment import write_json


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--experiment', type=Path, required=True)
    parser.add_argument('--split', choices=['val', 'test'], default='test')
    args = parser.parse_args()
    checks = integrity_checks(args.experiment)
    if not checks.passed.all():
        raise ValueError('Nguồn thí nghiệm chưa khớp; chưa thực hiện đánh giá mới.')
    result = evaluate_final(args.experiment, args.split)
    folder = args.experiment / ('final_test' if args.split == 'test' else 'final_validation')
    origin = folder / 'evaluation_origin.json'
    if not origin.exists():
        write_json(origin, {
            'origin': 'local_locked_checkpoints', 'device': 'cpu',
            'created_at_utc': datetime.now(timezone.utc).isoformat(),
            'note': 'Đánh giá cục bộ từ checkpoint đã khóa, không huấn luyện hoặc chọn lại mô hình.',
        })
    output = export_analysis(args.experiment)
    print(result[result.scenario.eq('S5')][['method', 'seed_count',
        'adjusted_total_cost_vnd_mean', 'adjusted_total_cost_vnd_std_seeds']].to_string(index=False))
    print('Báo cáo:', output)


if __name__ == '__main__':
    main()
