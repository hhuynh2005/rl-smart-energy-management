"""Tổng hợp kết quả SAC đã tải từ Drive; không huấn luyện lại mô hình.

Ví dụ: python -m scripts.summarize_sac_results --experiment runs/sac_colab_20261128
"""

import argparse

from sac_results import export_analysis


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--experiment', required=True)
    args = parser.parse_args()
    print('Đã tổng hợp kết quả tại:', export_analysis(args.experiment))


if __name__ == '__main__':
    main()
