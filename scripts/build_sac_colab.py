"""Tạo notebook Colab và bản giao một file có sẵn nguồn/CSV/checkpoint pilot.

Chạy tại gốc repo: python scripts/build_sac_colab.py
Notebook mẫu được theo dõi trong Git; bản có nhúng checkpoint nằm trong runs/.
Chỉ các file được liệt kê dưới đây đi vào gói, không lấy .git/.env/thông tin đăng nhập.
"""

import argparse
import base64
import copy
import hashlib
import io
import json
import textwrap
import zipfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DELIVERY = ROOT / "runs/colab_delivery"
NAME = "SAC_Colab_NguyenVanTruong.ipynb"
GPU_NAME = "SAC_Colab_GPU_ChayMoi.ipynb"


def markdown(source):
    return {"cell_type": "markdown", "metadata": {},
            "source": textwrap.dedent(source).strip() + "\n"}


def code(source, hidden=False):
    return {"cell_type": "code", "metadata": {"cellView": "form"} if hidden else {},
            "execution_count": None, "outputs": [],
            "source": textwrap.dedent(source).strip() + "\n"}


def notebook():
    cells = [
        markdown("""
        # SAC trên Google Colab của Nguyễn Văn Trường

        Quy trình: phân tích S2/S3 → so sánh hai cách đặt mục tiêu trên validation →
        khóa cấu hình → huấn luyện 300.000 bước × 5 seed → tổng hợp validation → test.

        **Bắt đầu:** đăng nhập tài khoản Google của Trường, chọn File → Save a copy
        in Drive, kết nối runtime rồi chạy các ô từ trên xuống. Có thể chọn GPU trong
        Runtime → Change runtime type; ô đo tốc độ sẽ so CPU/GPU thực tế.

        Colab miễn phí không bảo đảm GPU/thời gian phiên. Kết quả và resume.pt được lưu
        vào Drive mỗi 10.000 bước; sau khi ngắt phiên, mở lại đúng notebook và chạy lại
        từ đầu với cùng tên thí nghiệm. Seed hoàn tất được giữ nguyên, seed dang dở
        tiếp tục từ snapshot gần nhất. Không tự khởi động các phiên Colab khác.

        [Giới hạn Colab và cách lưu dữ liệu theo Google](https://research.google.com/colaboratory/faq.html).
        Dữ liệu là mô phỏng, không phải số đo vận hành hay biểu giá đã xác minh thực tế.
        """),
        code("""
        # 1. Kết nối Google Drive và đặt tên thí nghiệm.
        # Chọn đúng tài khoản Google của Trường khi Colab yêu cầu cấp quyền.
        from google.colab import drive
        from pathlib import Path
        drive.mount('/content/drive')

        EXPERIMENT_NAME = 'SAC_Colab_20261127'
        STAGE = 'all'  # all, pilot, final hoặc test; thường giữ all.
        DEVICE_REQUEST = 'auto'  # auto, cpu hoặc cuda; giữ nguyên khi resume.
        DRIVE_ROOT = Path('/content/drive/MyDrive/SEMS_RL')
        OUTPUT = DRIVE_ROOT / EXPERIMENT_NAME
        OUTPUT.mkdir(parents=True, exist_ok=True)
        print('Nơi lưu kết quả:', OUTPUT)
        """),
        code("""
        #@title 2. Nạp mã nguồn và CSV đã đóng gói
        # Bản giao một file đã có dữ liệu bên trong; không cần GitHub token.
        # Notebook mẫu trong repo sẽ yêu cầu tải source_bundle.zip nếu chưa có gói.
        import base64
        import hashlib
        import io
        import os
        import zipfile

        SOURCE_BUNDLE_B64 = ''
        EXPECTED_BUNDLE_SHA256 = ''
        saved_bundle = OUTPUT / 'source_bundle.zip'
        if SOURCE_BUNDLE_B64:
            bundle = base64.b64decode(SOURCE_BUNDLE_B64)
        elif saved_bundle.is_file():
            bundle = saved_bundle.read_bytes()
        else:
            from google.colab import files
            uploaded = files.upload()
            if len(uploaded) != 1:
                raise ValueError('Chọn đúng một file source_bundle.zip đi kèm notebook.')
            bundle = next(iter(uploaded.values()))
        bundle_hash = hashlib.sha256(bundle).hexdigest()
        if EXPECTED_BUNDLE_SHA256 and bundle_hash != EXPECTED_BUNDLE_SHA256:
            raise ValueError('Nội dung gói không khớp bản notebook đã giao.')
        if saved_bundle.exists() and hashlib.sha256(saved_bundle.read_bytes()).hexdigest() != bundle_hash:
            raise ValueError('Thư mục thí nghiệm đã dùng nguồn khác. Hãy đổi EXPERIMENT_NAME.')
        if not saved_bundle.exists():
            temporary = saved_bundle.with_suffix('.tmp')
            temporary.write_bytes(bundle)
            temporary.replace(saved_bundle)
        # Chạy mã và đọc CSV trên đĩa runtime, tránh đọc nhiều file nhỏ từ Drive.
        WORKSPACE = Path('/content') / ('sems_rl_sac_' + bundle_hash[:12])
        WORKSPACE.mkdir(exist_ok=True)
        with zipfile.ZipFile(io.BytesIO(bundle)) as archive:
            for name in archive.namelist():
                target = (WORKSPACE / name).resolve()
                if not target.is_relative_to(WORKSPACE.resolve()):
                    raise ValueError('Gói chứa đường dẫn ra ngoài workspace.')
            archive.extractall(WORKSPACE)
        os.chdir(WORKSPACE)
        print('Đã nạp đúng gói nguồn:', bundle_hash)
        """, hidden=True),
        code("""
        # 3. Cài thư viện tối thiểu; không ép nâng cấp PyTorch có sẵn trên Colab.
        import subprocess
        import sys
        subprocess.run([sys.executable, '-m', 'pip', 'install', '-q',
                        '-r', 'requirements-sac.txt'], check=True)
        if str(WORKSPACE) not in sys.path:
            sys.path.insert(0, str(WORKSPACE))
        import json
        import pandas as pd
        import torch
        from IPython.display import display, Image
        import colab_sac as workflow

        if STAGE not in ('all', 'pilot', 'final', 'test'):
            raise ValueError('STAGE cần là all, pilot, final hoặc test.')
        plan = workflow.prepare_experiment(OUTPUT)
        device_file = OUTPUT / 'device_choice.json'
        if device_file.is_file():
            DEVICE = json.loads(device_file.read_text())['device']
            if DEVICE_REQUEST != 'auto' and DEVICE_REQUEST != DEVICE:
                raise ValueError('Giữ CPU/CUDA như lần trước để resume; đổi thiết bị cần thí nghiệm mới.')
        else:
            fastest, benchmark = workflow.benchmark_device()
            display(benchmark)
            DEVICE = fastest if DEVICE_REQUEST == 'auto' else DEVICE_REQUEST
            if DEVICE not in ('cpu', 'cuda'):
                raise ValueError('DEVICE_REQUEST cần là auto, cpu hoặc cuda.')
            if DEVICE == 'cuda' and not torch.cuda.is_available():
                raise ValueError('Runtime hiện tại chưa có CUDA.')
            device_file.write_text(json.dumps({'device': DEVICE}), encoding='utf-8')
        if DEVICE == 'cuda' and not torch.cuda.is_available():
            raise ValueError('Seed trước dùng CUDA. Kết nối runtime GPU để tiếp tục.')
        print('Thiết bị sử dụng:', DEVICE, '| PyTorch:', torch.__version__)
        print('Kế hoạch chính thức:', plan['final_steps'], 'bước ×', len(plan['final_seeds']), 'seed')
        """),
        markdown("""
        ## Dữ liệu và kiểm tra trước khi huấn luyện

        Một ngày có 96 bước, mỗi bước 15 phút. Train dùng để học; validation chọn
        cấu hình và checkpoint; test chỉ mở sau khi hoàn tất kế hoạch. Không lấy
        thống kê validation/test để chuẩn hóa dữ liệu huấn luyện.
        """),
        code("""
        # 4. Xem phân vùng và vài dòng dữ liệu.
        from sems_rl.data.data_pipeline import DataPipeline
        pipeline = DataPipeline(str(WORKSPACE / 'data/processed.csv'))
        split_rows = []
        for split, (first, stop) in pipeline.splits.items():
            frame = pipeline.df.iloc[first * 96:stop * 96]
            split_rows.append({'split': split, 'days': stop - first, 'rows': len(frame),
                               'from': frame.iloc[0].timestamp, 'to': frame.iloc[-1].timestamp})
        display(pd.DataFrame(split_rows))
        display(pipeline.df_raw.head(8))
        print('Số ô dữ liệu khuyết:', int(pipeline.df_raw.isna().sum().sum()))
        """),
        code("""
        # 5. Chạy thử nhỏ trước tác vụ dài; chỉ đánh giá validation.
        import tempfile
        import yaml
        from sems_rl.experiments.sac_experiment import read_settings
        with tempfile.TemporaryDirectory(prefix='sac_smoke_') as temporary:
            temporary = Path(temporary)
            smoke = read_settings()
            smoke.pop('environment')
            smoke['objective'] = {'mode': 'daily_inventory'}
            smoke['agent'].update({'gamma': 1.0, 'hidden_size': 16, 'batch_size': 8,
                                   'buffer_size': 256, 'learning_starts': 32})
            smoke['training'].update({'total_timesteps': 200, 'seeds': [0],
                                      'eval_freq': 100, 'eval_days': 1, 'log_freq': 50})
            config = temporary / 'smoke.yaml'
            config.write_text(yaml.safe_dump(smoke), encoding='utf-8')
            workflow.command('train_sac.py', '--config', config, '--device', DEVICE,
                             '--output', temporary / 'models', '--checkpoint-freq', 100)
            workflow.command('evaluate_sac.py', '--runs', temporary / 'models/custom_seed0',
                             '--split', 'val', '--scenarios', 'S2', 'S3', 'S5',
                             '--max-days', 1, '--output', temporary / 'evaluation')
        print('Chạy thử hoàn tất. Kết quả thử nhỏ không dùng trong báo cáo chính thức.')
        """),
        markdown("""
        ## Phân tích S2 và S3 bằng checkpoint cũ 50.000 bước

        Xem điện sạc/xả, lệnh bị cắt ở SoC tối thiểu và hao mòn. Cột
        `reward_selection_gap_vnd` bằng chi phí suy ra từ reward trừ chi phí dùng
        chọn checkpoint; khác 0 cho thấy hai cách đo chưa khớp.

        S2 có giá điện thấp hơn ngày làm việc; lợi ích chênh lệch giá cần đủ bù
        tổn thất và hao mòn. S3 giảm PV thật 50%, làm ít điện mặt trời dư để sạc.
        Các nhận xét về nguyên nhân phải đối chiếu bảng và hành vi từng ngày.
        """),
        code("""
        # 6. Phân tích trên toàn bộ ngày validation phù hợp cho S2, S3 và S5.
        diagnosis = OUTPUT / 'diagnosis_pilot'
        if not (diagnosis / 'behavior_summary.csv').is_file():
            if diagnosis.exists() and any(diagnosis.iterdir()):
                import time
                diagnosis.rename(diagnosis.with_name('diagnosis_incomplete_' + str(time.time_ns())))
            workflow.command('diagnose_sac.py', '--run', 'runs/sac_pilot/custom_seed0',
                             '--output', diagnosis)
        behavior = pd.read_csv(diagnosis / 'behavior_summary.csv')
        display(behavior[['scenario', 'method', 'charge_kwh', 'discharge_kwh',
                          'clipped_at_soc_min', 'wear_cost_vnd', 'final_soc',
                          'adjusted_total_cost_vnd', 'reward_selection_gap_vnd']])
        display(Image(filename=str(diagnosis / 'S2_worst_day.png')))
        display(Image(filename=str(diagnosis / 'S3_worst_day.png')))
        display(json.loads((diagnosis / 'diagnosis_metadata.json').read_text())['theory'])
        """),
        markdown("""
        ## So sánh hai cách đặt mục tiêu rồi khóa cấu hình

        - **original:** reward gốc, gamma=0,99, quy ước tiếp nối ngày như bản pilot.
        - **daily_inventory:** reward trừ thêm giá trị lượng điện pin dùng ròng ở
          mỗi bước; gamma=1 và kết thúc thật sau 96 bước. Tổng reward một ngày
          đúng bằng âm tổng chi phí đã điều chỉnh chia C_ref.

        Mỗi cấu hình chạy 50.000 bước với **seed 0 và 1**. Chọn cấu hình có trung
        bình `adjusted_total_cost_vnd` thấp nhất trên **S5 validation**; S2/S3 được
        báo cáo để chẩn đoán, không thay tiêu chí sau khi thấy kết quả. Nếu bằng
        điểm, ưu tiên original. Đây là so sánh hai cách đặt bài toán, không tách
        riêng tác động của gamma, reward và điều kiện kết thúc.

        Cấu hình mới là giả thuyết cần kiểm chứng, không mặc định sẽ tốt hơn.
        """),
        code("""
        # 7. Chạy pilot và khóa cấu hình; có thể mất nhiều thời gian.
        if STAGE in ('all', 'pilot'):
            workflow.run_pilots(OUTPUT, DEVICE)
            comparison, configuration_lock = workflow.lock_configuration(OUTPUT)
            display(comparison)
            print('Cấu hình được chọn:', configuration_lock['selected'])
        else:
            configuration_lock = workflow.verify_lock(OUTPUT)
            print('Dùng cấu hình đã khóa:', configuration_lock['selected'])
        """),
        markdown("""
        ## Huấn luyện chính thức 300.000 bước với 5 seed

        Mỗi seed khởi tạo lại từ đầu; checkpoint pilot không được dùng để cộng
        thêm bước vào kết quả chính thức. Mỗi 10.000 bước có đánh giá validation
        và snapshot resume; `best.pt` chọn bằng chi phí validation thấp nhất.

        Sau khi Colab ngắt phiên, kết nối lại và chạy từ đầu với cùng
        `EXPERIMENT_NAME`. Không đổi cấu hình hay CPU/CUDA giữa một seed.
        Chỉ tiến độ chưa kịp lưu sau snapshot gần nhất phải chạy lại.
        """),
        code("""
        # 8. Chạy đủ seed 0–4 và tổng hợp validation; không dùng test để học.
        if STAGE in ('all', 'final'):
            print('Bắt đầu ô 8: kiểm tra cấu hình đã khóa, sau đó chạy/tiếp tục từng seed.', flush=True)
            print('Thư mục kết quả:', OUTPUT, '| Thiết bị:', DEVICE, flush=True)
            final_validation = workflow.run_final(OUTPUT, DEVICE)
            display(final_validation.loc[final_validation.scenario.eq('S5'),
                    ['method', 'seed_count', 'adjusted_total_cost_vnd_mean',
                     'adjusted_total_cost_vnd_std_seeds', 'clipped_steps_mean']])
        """),
        code("""
        # 9. Xem reward/chi phí validation của từng seed trong suốt quá trình học.
        import matplotlib.pyplot as plt
        fig, axes = plt.subplots(1, 2, figsize=(13, 4))
        count = 0
        for seed in range(5):
            log = OUTPUT / f'final/custom_seed{seed}/validation.csv'
            if not log.is_file():
                continue
            frame = pd.read_csv(log)
            axes[0].plot(frame.step, frame.episode_reward_mean, label=f'seed {seed}')
            axes[1].plot(frame.step, frame.adjusted_total_cost_vnd_mean, label=f'seed {seed}')
            count += 1
        axes[0].set_title('Validation reward / day')
        axes[1].set_title('Adjusted total cost / day')
        for axis in axes:
            axis.set_xlabel('Training steps')
            if count:
                axis.legend()
        plt.tight_layout()
        plt.show()
        """),
        markdown("""
        ## Đánh giá test sau khi cấu hình và mô hình đã được khóa

        Ô dưới kiểm tra đủ 300.000 bước × 5 seed, đúng mã nguồn, dữ liệu và cấu
        hình; sau đó khóa hash từng `best.pt`. Test gồm 56 ngày thuộc thời gian
        khác với train/validation. S1–S5 có ngày trùng nhau; không cộng chúng
        thành các ngày lịch độc lập. Không chọn lại mô hình sau khi xem test.
        """),
        code("""
        # 10. Test chỉ chạy khi toàn bộ điều kiện của thí nghiệm đã đạt.
        if STAGE in ('all', 'test'):
            final_test = workflow.evaluate_final(OUTPUT, 'test')
            display(final_test[['method', 'scenario', 'seed_count',
                                'adjusted_electric_cost_vnd_mean',
                                'adjusted_total_cost_vnd_mean',
                                'adjusted_total_cost_vnd_std_seeds',
                                'adjusted_cost_saving_pct_mean', 'clipped_steps_mean']])
        """),
        code("""
        # 11. Đóng gói mô hình và kết quả để Dương tổng hợp; không cần gửi resume.pt lớn.
        if (OUTPUT / 'final_test/summary.csv').is_file():
            import zipfile
            # Báo cáo lấy số thực đã chạy; không điền trước kết quả 300.000 bước.
            result = workflow.evaluate_final(OUTPUT, 'test')
            locked = workflow.verify_lock(OUTPUT)
            report_lines = ['# Kết quả SAC của Nguyễn Văn Trường', '',
                'Ngân sách: 300.000 bước × 5 seed. Tập báo cáo: test, sau khi khóa cấu hình.',
                'Cách đặt mục tiêu đã chọn bằng validation: ' + locked['selected'] + '.', '',
                '| Phương pháp | Kịch bản | Số seed/mốc | Tổng chi phí điều chỉnh/ngày | Độ lệch chuẩn giữa seed |',
                '| --- | --- | ---: | ---: | ---: |']
            for row in result.itertuples():
                report_lines.append(f'| {row.method} | {row.scenario} | {row.seed_count} | '
                    f'{row.adjusted_total_cost_vnd_mean:,.0f} | '
                    f'{row.adjusted_total_cost_vnd_std_seeds:,.0f} |')
            report_lines += ['',
                'Dữ liệu và giá điện là mô phỏng. Chi phí điều chỉnh có định giá lượng điện pin dùng ròng;',
                'tổng chi phí còn có hao mòn và các khoản phạt. Không gọi đây là hóa đơn thực tế.',
                'SAC có 5 seed huấn luyện; No-battery và Rule-based chỉ cần một mốc với nhiễu đánh giá cố định.',
                'S1–S5 có ngày trùng nhau. S4 chỉ gây nhiễu quan sát, chỉ số PV chưa truy vết nguồn điện.',
                'Xem SAC_GHI_CHU_CHO_DUONG.md để biết reward, gamma, terminal và giới hạn so sánh.']
            report = OUTPUT / 'BAO_CAO_KET_QUA_SAC.md'
            report.write_text(chr(10).join(report_lines), encoding='utf-8')
            handoff = OUTPUT / 'SAC_ban_giao_Duong.zip'
            paths = [OUTPUT / name for name in ('experiment_plan.json', 'configuration_lock.json',
                     'locked_config.yaml', 'test_models_lock.json', 'pilot_comparison.csv',
                     'BAO_CAO_KET_QUA_SAC.md')]
            for seed in range(5):
                folder = OUTPUT / f'final/custom_seed{seed}'
                paths += [folder / name for name in ('best.pt', 'metadata.json',
                          'training_summary.json', 'training.csv', 'validation.csv', 'learning_curve.png')]
            paths += list((OUTPUT / 'final_test').glob('*'))
            paths += list((OUTPUT / 'final_validation').glob('*'))
            temporary = handoff.with_suffix('.tmp')
            with zipfile.ZipFile(temporary, 'w', zipfile.ZIP_DEFLATED, compresslevel=1) as archive:
                archive.write(WORKSPACE / 'data/processed.csv', 'data/processed.csv')
                archive.write(WORKSPACE / 'docs/SAC_COLAB_NGUYEN_VAN_TRUONG.md',
                              'SAC_GHI_CHU_CHO_DUONG.md')
                for path in paths:
                    if path.is_file():
                        archive.write(path, str(path.relative_to(OUTPUT)))
            temporary.replace(handoff)
            print('Gói bàn giao đã lưu trong Drive:', handoff)
        print('Log huấn luyện: final/custom_seedN/training.csv')
        print('Log validation: final/custom_seedN/validation.csv')
        print('Kết quả cuối: final_test/summary.csv và daily_metrics.csv')
        print('Tất cả nằm trong:', OUTPUT)
        """),
    ]
    # Chỉ sửa notebook và hàm gọi trong bộ nhớ. Các file trong source_hash và gói
    # nguồn của thí nghiệm cũ giữ nguyên, để người dùng tiếp tục seed đang chạy.
    cells.insert(4, code((ROOT / 'scripts/colab_log_patch.py').read_text(encoding='utf-8')))
    for index, cell in enumerate(cells):
        cell["id"] = f"sac-cell-{index:02d}"
    return {"nbformat": 4, "nbformat_minor": 5,
            "metadata": {"colab": {"name": NAME, "provenance": []},
                         "kernelspec": {"name": "python3", "display_name": "Python 3"},
                         "language_info": {"name": "python"}}, "cells": cells}


def gpu_notebook():
    """Bản chạy mới trên GPU; tự huấn luyện pilot thay vì nạp checkpoint cũ."""
    result = notebook()
    result['metadata']['colab'].update({'name': GPU_NAME, 'gpuType': 'T4'})
    result['metadata']['accelerator'] = 'GPU'
    replacements = {
        0: markdown('''
            # Huấn luyện SAC mới trên GPU

            Đăng nhập tài khoản Google mới của Trường. Chọn **Thời gian chạy →
            Thay đổi loại thời gian chạy → GPU (T4 nếu có)** trước khi chạy các ô.
            Khi kết nối Google Drive, chọn đúng tài khoản mới.

            Bản này dùng thư mục SAC_GPU_20261127_v1, STAGE='all' và buộc CUDA.
            Ô 3 kiểm tra GPU thật; nếu chưa có GPU hoặc PyTorch chỉ hỗ trợ CPU,
            notebook dừng với hướng dẫn rõ ràng, không chuyển sang huấn luyện CPU.

            Quy trình: pilot mới 50.000 bước × 2 seed × 2 cấu hình → chọn cấu hình
            bằng validation → phân tích S2/S3 → huấn luyện mới 300.000 bước × 5 seed
            → tổng hợp validation → đánh giá test. Không nạp trọng số từ lần chạy cũ.

            Log trực tiếp và đồng hồ xuất hiện trong lúc huấn luyện. Kết quả được lưu
            trên Drive; nếu Colab ngắt phiên, chạy lại từ đầu với cùng tên thí nghiệm
            và runtime GPU để tiếp tục các snapshot của chính lần chạy mới này.

            [Giới hạn tài nguyên Colab](https://research.google.com/colaboratory/faq.html).
            GPU do Colab cấp; notebook không tự cấp phát được GPU.
        '''),
        1: code('''
            # 1. Kết nối Drive của tài khoản mới và tạo thư mục thí nghiệm GPU riêng.
            from google.colab import drive
            from pathlib import Path
            drive.mount('/content/drive')

            # Giữ nguyên tên này khi tiếp tục sau khi ngắt phiên.
            # Muốn một lần chạy độc lập khác, đổi hậu tố v1 thành v2 trước khi chạy.
            EXPERIMENT_NAME = 'SAC_GPU_20261127_v1'
            STAGE = 'all'  # Chạy pilot, final và test theo đúng thứ tự.
            DEVICE_REQUEST = 'cuda'  # Bản này chỉ huấn luyện trên GPU NVIDIA.
            DRIVE_ROOT = Path('/content/drive/MyDrive/SEMS_RL')
            OUTPUT = DRIVE_ROOT / EXPERIMENT_NAME
            OUTPUT.mkdir(parents=True, exist_ok=True)
            print('Thư mục thí nghiệm GPU:', OUTPUT)
        '''),
        3: code('''
            # 3. Cài thư viện và xác nhận PyTorch thực sự thực hiện được phép tính GPU.
            # Giữ PyTorch có sẵn của runtime GPU Colab; không cài đè bản CPU.
            import subprocess
            import sys
            subprocess.run([sys.executable, '-m', 'pip', 'install', '-q',
                            '-r', 'requirements-sac.txt'], check=True)
            if str(WORKSPACE) not in sys.path:
                sys.path.insert(0, str(WORKSPACE))
            import json
            import pandas as pd
            import torch
            from IPython.display import display, Image
            import colab_sac as workflow

            if STAGE not in ('all', 'pilot', 'final', 'test'):
                raise ValueError('STAGE cần là all, pilot, final hoặc test.')
            if DEVICE_REQUEST != 'cuda':
                raise ValueError("Bản chạy GPU này yêu cầu DEVICE_REQUEST='cuda'.")
            if torch.version.cuda is None:
                raise RuntimeError(
                    'PyTorch hiện tại chỉ hỗ trợ CPU. Hãy chọn runtime GPU, '
                    'ngắt kết nối và xóa runtime cũ nếu cần, rồi chạy lại từ đầu '
                    'trong runtime GPU sạch; không cài lại bản torch +cpu.')
            if not torch.cuda.is_available():
                raise RuntimeError(
                    'Chưa có GPU CUDA khả dụng. Vào Thời gian chạy → Thay đổi loại '
                    'thời gian chạy → chọn GPU, kết nối lại rồi chạy từ ô 1. '
                    'Nếu Colab chưa cấp GPU, cần chờ có GPU; bản này không chạy CPU.')

            DEVICE = 'cuda'
            gpu_name = torch.cuda.get_device_name(0)
            # Phép tính nhỏ xác nhận CUDA dùng được trước khi tạo kế hoạch dài.
            probe = torch.ones((8, 8), device=DEVICE)
            probe = probe @ probe
            torch.cuda.synchronize()
            if probe.device.type != 'cuda' or probe[0, 0].item() != 8.0:
                raise RuntimeError('Phép thử CUDA không đạt; chưa bắt đầu huấn luyện.')
            del probe

            device_file = OUTPUT / 'device_choice.json'
            if device_file.is_file():
                saved_device = json.loads(device_file.read_text(encoding='utf-8'))['device']
                if saved_device != DEVICE:
                    raise ValueError(
                        'Tên thí nghiệm này đã dùng CPU. Chọn EXPERIMENT_NAME mới '
                        'để chạy GPU từ đầu; không ghi đè checkpoint CPU.')
            plan = workflow.prepare_experiment(OUTPUT)
            if not device_file.is_file():
                device_file.write_text(json.dumps({
                    'device': DEVICE, 'gpu_name': gpu_name,
                    'torch_version': torch.__version__, 'cuda_version': torch.version.cuda,
                }, ensure_ascii=False, indent=2), encoding='utf-8')
            print('Thiết bị sử dụng:', DEVICE, '| GPU:', gpu_name,
                  '| PyTorch:', torch.__version__, '| CUDA:', torch.version.cuda)
            print('Phép thử tính toán GPU: đạt. Các lệnh train_sac.py sẽ dùng --device cuda.')
            print('Pilot: 50.000 bước × 2 seed × 2 cấu hình, khởi tạo mới.')
            print('Kế hoạch chính thức:', plan['final_steps'], 'bước ×', len(plan['final_seeds']), 'seed')
        '''),
        8: markdown('''
            ## Phân tích S2/S3 từ pilot mới

            Bản GPU không mang theo checkpoint 50.000 bước của lần chạy CPU cũ.
            Ô 7 tự huấn luyện các pilot, chọn cấu hình bằng S5 validation rồi dùng
            seed 0 của cấu hình được chọn để phân tích hành vi ở S2, S3 và S5.
            Huấn luyện chính thức vẫn khởi tạo lại từ đầu ở từng seed.
        '''),
        9: code('''
            # 6. Phân tích hành vi cần checkpoint của pilot vừa huấn luyện.
            # Bảng và hình S2/S3 sẽ xuất hiện sau khi ô 7 hoàn tất các pilot mới.
            print('Tiếp tục ô 7 để huấn luyện pilot mới trên GPU và phân tích S2/S3.')
        '''),
        11: code('''
            # 7. Huấn luyện pilot mới, chọn cấu hình rồi phân tích S2/S3.
            if STAGE in ('all', 'pilot'):
                print('Pilot GPU: 2 cấu hình × 2 seed, mỗi lần 50.000 bước.', flush=True)
                workflow.run_pilots(OUTPUT, DEVICE)
                comparison, configuration_lock = workflow.lock_configuration(OUTPUT)
                display(comparison)
                print('Cấu hình được chọn:', configuration_lock['selected'])
            else:
                if not (OUTPUT / 'configuration_lock.json').is_file():
                    raise FileNotFoundError(
                        "Chưa có cấu hình đã khóa. Với lần chạy mới, đặt STAGE='all' "
                        'ở ô 1, chạy lại ô 1 và ô 7 để huấn luyện pilot trước.')
                configuration_lock = workflow.verify_lock(OUTPUT)
                print('Dùng cấu hình đã khóa:', configuration_lock['selected'])

            # Chỉ chẩn đoán trên validation, từ checkpoint thuộc thí nghiệm mới này.
            diagnosis = OUTPUT / 'diagnosis_pilot'
            if not (diagnosis / 'behavior_summary.csv').is_file():
                if diagnosis.exists() and any(diagnosis.iterdir()):
                    import time
                    diagnosis.rename(diagnosis.with_name('diagnosis_incomplete_' + str(time.time_ns())))
                pilot_run = OUTPUT / 'pilots' / configuration_lock['selected'] / 'custom_seed0'
                workflow.command('diagnose_sac.py', '--run', pilot_run, '--output', diagnosis)
            behavior = pd.read_csv(diagnosis / 'behavior_summary.csv')
            display(behavior[['scenario', 'method', 'charge_kwh', 'discharge_kwh',
                              'clipped_at_soc_min', 'wear_cost_vnd', 'final_soc',
                              'adjusted_total_cost_vnd', 'reward_selection_gap_vnd']])
            display(Image(filename=str(diagnosis / 'S2_worst_day.png')))
            display(Image(filename=str(diagnosis / 'S3_worst_day.png')))
        '''),
    }
    for index, cell in replacements.items():
        cell['id'] = result['cells'][index]['id']
        result['cells'][index] = cell
    # Ghi thông tin phần cứng vào gói bàn giao để Dương biết thiết bị đã sử dụng.
    handoff = result['cells'][-1]['source']
    handoff = handoff.replace(
        "'locked_config.yaml', 'test_models_lock.json', 'pilot_comparison.csv',",
        "'locked_config.yaml', 'device_choice.json', 'test_models_lock.json', 'pilot_comparison.csv',")
    handoff = handoff.replace(
        "'Ngân sách: 300.000 bước × 5 seed. Tập báo cáo: test, sau khi khóa cấu hình.',",
        "'Ngân sách: 300.000 bước × 5 seed. Tập báo cáo: test, sau khi khóa cấu hình.',\n"
        "        'Thiết bị huấn luyện: CUDA (GPU). Chi tiết phần cứng: device_choice.json.', '',")
    result['cells'][-1]['source'] = handoff
    return result


def bundle_bytes(include_reference_pilot=True):
    paths = list((ROOT / "sems_rl").rglob("*.py"))
    paths += list((ROOT / "tests").glob("*.py"))
    paths += [ROOT / name for name in ("train_sac.py", "evaluate_sac.py", "diagnose_sac.py",
              "colab_sac.py", "requirements-sac.txt", "sems_rl/config.yaml", "configs/sac.yaml",
              "data/processed.csv", "README.md", "docs/SAC_COLAB_NGUYEN_VAN_TRUONG.md")]
    if include_reference_pilot:
        paths += [ROOT / "runs/sac_pilot/custom_seed0" / name for name in (
            "best.pt", "metadata.json", "training_summary.json", "training.csv", "validation.csv")]
    stream = io.BytesIO()
    with zipfile.ZipFile(stream, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
        for path in sorted(set(paths)):
            # Mốc thời gian cố định giúp cùng nội dung tạo ra cùng hash gói.
            info = zipfile.ZipInfo(path.relative_to(ROOT).as_posix(), (2026, 11, 27, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            archive.writestr(info, path.read_bytes())
    return stream.getvalue()


def embed_source_bundle(template, payload):
    """Nhúng gói nguồn và hash vào một bản sao, giữ notebook mẫu gọn trong Git."""
    delivery = copy.deepcopy(template)
    source = delivery['cells'][2]['source']
    source = source.replace("SOURCE_BUNDLE_B64 = ''",
                            f"SOURCE_BUNDLE_B64 = '{base64.b64encode(payload).decode()}'")
    source = source.replace("EXPECTED_BUNDLE_SHA256 = ''",
                            f"EXPECTED_BUNDLE_SHA256 = '{hashlib.sha256(payload).hexdigest()}'")
    delivery['cells'][2]['source'] = source
    return delivery


def write_gpu_delivery():
    """Bản GPU chạy mới không phụ thuộc checkpoint pilot riêng trên máy Trường."""
    template = gpu_notebook()
    (ROOT / 'notebooks').mkdir(exist_ok=True)
    (ROOT / 'notebooks' / GPU_NAME).write_text(
        json.dumps(template, ensure_ascii=False, indent=1), encoding='utf-8')
    payload = bundle_bytes(include_reference_pilot=False)
    delivery = embed_source_bundle(template, payload)
    DELIVERY.mkdir(parents=True, exist_ok=True)
    (DELIVERY / GPU_NAME).write_text(
        json.dumps(delivery, ensure_ascii=False, indent=1), encoding='utf-8')
    (DELIVERY / 'source_bundle_gpu.zip').write_bytes(payload)
    return {'gpu_notebook': str(DELIVERY / GPU_NAME),
            'gpu_bundle_sha256': hashlib.sha256(payload).hexdigest(),
            'gpu_notebook_bytes': (DELIVERY / GPU_NAME).stat().st_size}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--gpu-only', action='store_true',
                        help='Tạo bản GPU chạy mới, không cần checkpoint pilot cũ')
    args = parser.parse_args()
    if args.gpu_only:
        print(json.dumps(write_gpu_delivery(), ensure_ascii=True))
        return
    template = notebook()
    (ROOT / "notebooks").mkdir(exist_ok=True)
    (ROOT / "notebooks" / NAME).write_text(json.dumps(template, ensure_ascii=False, indent=1), encoding="utf-8")
    payload = bundle_bytes()
    checksum = hashlib.sha256(payload).hexdigest()
    delivery = embed_source_bundle(template, payload)
    DELIVERY.mkdir(parents=True, exist_ok=True)
    (DELIVERY / NAME).write_text(json.dumps(delivery, ensure_ascii=False, indent=1), encoding="utf-8")
    (DELIVERY / "source_bundle.zip").write_bytes(payload)
    # Bản tiếp tục nhỏ dùng đúng source_bundle.zip đã lưu trên Drive của người dùng.
    recovery = notebook()
    recovery_name = 'SAC_Colab_TiepTuc_HienLog.ipynb'
    recovery['metadata']['colab']['name'] = recovery_name
    recovery['cells'][0] = markdown('''
        # Tiếp tục SAC với log trực tiếp trên Colab

        Dùng khi notebook cũ im lặng tại ô 8. Giữ đúng EXPERIMENT_NAME và Drive
        đã dùng trước đó. Bản này đọc lại source_bundle.zip đã lưu trên Drive,
        không thay mã SAC hoặc các khóa cấu hình/mô hình. STAGE mặc định là final.

        Nếu ô cũ đang chạy, dừng ô đó trước khi mở thêm job. Các tiến độ đã lưu
        được giữ nguyên; khi chạy lại, seed hoàn tất được bỏ qua và seed dang dở
        dùng resume.pt. Chạy các ô từ đầu để nối lại Drive và các biến cần thiết.
        Log stdout/stderr và đồng hồ trong output sẽ hiện ngay khi job khởi tạo.
    ''')
    recovery['cells'][0]['id'] = 'sac-cell-00'
    recovery['cells'][1]['source'] = recovery['cells'][1]['source'].replace(
        "STAGE = 'all'", "STAGE = 'final'")
    (DELIVERY / recovery_name).write_text(json.dumps(recovery, ensure_ascii=False, indent=1), encoding='utf-8')
    (ROOT / 'notebooks' / recovery_name).write_text(
        json.dumps(recovery, ensure_ascii=False, indent=1), encoding='utf-8')
    gpu_result = write_gpu_delivery()
    print(json.dumps({"notebook": str(DELIVERY / NAME), "bundle_sha256": checksum,
                      "notebook_bytes": (DELIVERY / NAME).stat().st_size,
                      **gpu_result}, ensure_ascii=True))


if __name__ == "__main__":
    main()
