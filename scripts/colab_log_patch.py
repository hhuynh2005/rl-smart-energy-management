"""Đưa stdout/stderr của tiến trình con vào ô Colab và hiển thị thời gian chờ.

Dán nội dung file vào một ô SAU khi import workflow, TRƯỚC ô 8. Chỉ thay hàm
gọi tiến trình trong bộ nhớ; không sửa các file nằm trong khóa mã nguồn SAC.
"""

import csv
import json
import os
import queue
import signal
import subprocess
import sys
import threading
import time
from collections import deque
from functools import partial
from pathlib import Path


def _option(arguments, name):
    values = list(map(str, arguments))
    return values[values.index(name) + 1] if name in values else None


def active_experiment_jobs(workspace, output_root, proc_root=Path('/proc')):
    """Chỉ nhận diện job đúng thư mục/đầu ra này; không dừng tiến trình khác."""
    jobs = []
    if not proc_root.is_dir():
        return jobs  # /proc có trên runtime Linux của Colab.
    for entry in proc_root.iterdir():
        if not entry.name.isdigit() or int(entry.name) == os.getpid():
            continue
        try:
            args = [part.decode('utf-8', errors='replace')
                    for part in (entry / 'cmdline').read_bytes().split(b'\0') if part]
            scripts = {'train_sac.py', 'evaluate_sac.py', 'diagnose_sac.py'}
            if not any(Path(value).name in scripts for value in args):
                continue
            output = _option(args, '--output')
            if output is None or (entry / 'cwd').resolve() != Path(workspace).resolve():
                continue
            target = Path(output)
            if not target.is_absolute():
                target = Path(workspace) / target
            if target.resolve().is_relative_to(Path(output_root).resolve()):
                jobs.append({'pid': int(entry.name), 'output': str(target)})
        except (OSError, ValueError):
            continue  # Tiến trình có thể vừa kết thúc hoặc thuộc người dùng khác.
    return jobs


def training_progress(arguments):
    """Đọc mốc đã GHI RA FILE; không xem đồng hồ sống là bằng chứng mô hình tiến bộ."""
    output = _option(arguments, '--output')
    seed = _option(arguments, '--seeds')
    if not output or seed is None or Path(str(arguments[0])).name != 'train_sac.py':
        return 'đang chờ log từ tiến trình'
    backend = _option(arguments, '--backend') or 'custom'
    run = Path(output) / f'{backend}_seed{seed}'
    parts = [f'seed={seed}']
    for name, label in (('training.csv', 'train'), ('validation.csv', 'val')):
        try:
            with (run / name).open(encoding='utf-8') as stream:
                rows = list(csv.DictReader(stream))
            if rows:
                parts.append(f'{label}={int(rows[-1]["step"]):,} bước')
        except (OSError, KeyError, TypeError, ValueError):
            pass
    try:
        settings = json.loads((run / 'metadata.json').read_text(encoding='utf-8'))['settings']
        parts.append(f'mục tiêu={settings["training"]["total_timesteps"]:,}')
    except (OSError, ValueError, KeyError):
        pass
    if len(parts) == 1:
        parts.append('chưa có CSV tiến độ; đang khởi tạo hoặc đánh giá đầu')
    return ' | '.join(parts)


def _stop_owned_process(process):
    """Dọn đúng nhóm do hàm này tạo khi người dùng bấm Dừng; không pkill hàng loạt."""
    if process.poll() is not None:
        return
    try:
        if os.name == 'posix':
            os.killpg(process.pid, signal.SIGTERM)
        else:
            process.terminate()
        process.wait(timeout=5)
    except subprocess.TimeoutExpired:
        if os.name == 'posix':
            os.killpg(process.pid, signal.SIGKILL)
        else:
            process.kill()
        process.wait(timeout=5)
    except ProcessLookupError:
        process.wait(timeout=5)


def command_with_logs(*arguments, workspace, output_root, heartbeat_seconds=30):
    """Chuyển log ngay vào notebook; in thời gian và CSV mỗi 30 giây khi chờ.

    Luồng đọc pipe ngăn bộ đệm stdout đầy; luồng đọc CSV tách riêng để việc đọc
    Google Drive chậm không làm đứng đồng hồ trong luồng chính.
    """
    jobs = active_experiment_jobs(workspace, output_root)
    if jobs:
        raise RuntimeError(f'Đã có job của thí nghiệm đang chạy: {jobs}. '
                           'Chưa tạo job mới để tránh hai tiến trình ghi cùng checkpoint.')
    environment = os.environ.copy()
    environment.update({'PYTHONIOENCODING': 'utf-8', 'PYTHONUNBUFFERED': '1'})
    args = [sys.executable, '-u', *map(str, arguments)]
    process = subprocess.Popen(args, cwd=workspace, env=environment,
                               stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                               text=True, encoding='utf-8', errors='replace', bufsize=1,
                               start_new_session=(os.name == 'posix'))
    started, last_heartbeat = time.monotonic(), time.monotonic()
    lines, stopped = queue.Queue(), threading.Event()
    progress = {'text': 'đang khởi tạo; chưa đọc được CSV'}
    tail = deque(maxlen=60)

    def read_stdout():
        try:
            for line in process.stdout:
                lines.put(line)
        finally:
            lines.put(None)

    def read_progress():
        while not stopped.is_set():
            progress['text'] = training_progress(arguments)
            stopped.wait(10)

    reader = threading.Thread(target=read_stdout, daemon=True)
    watcher = threading.Thread(target=read_progress, daemon=True)
    print(f'▶ Bắt đầu {arguments[0]} | PID={process.pid}. '
          f'Thời gian/tiến độ được in mỗi {heartbeat_seconds:g} giây.', flush=True)
    reader.start()
    watcher.start()
    pipe_closed = False
    try:
        while not pipe_closed or process.poll() is None:
            try:
                line = lines.get(timeout=min(1, heartbeat_seconds))
                if line is None:
                    pipe_closed = True
                else:
                    tail.append(line)
                    print(line, end='', flush=True)
            except queue.Empty:
                pass
            now = time.monotonic()
            if now - last_heartbeat >= heartbeat_seconds:
                seconds = int(now - started)
                elapsed = f'{seconds // 3600:02d}:{seconds // 60 % 60:02d}:{seconds % 60:02d}'
                print(f'⏱ {elapsed} | {progress["text"]} | PID={process.pid}', flush=True)
                last_heartbeat = now
        code = process.wait()
        if code:
            raise subprocess.CalledProcessError(code, args, output=''.join(tail))
        print(f'✓ Hoàn tất {arguments[0]} sau {time.monotonic() - started:.1f} giây.', flush=True)
    except KeyboardInterrupt:
        print('Đã nhận lệnh Dừng. Đang dừng đúng tiến trình vừa tạo...', flush=True)
        _stop_owned_process(process)
        print('Chạy lại cùng OUTPUT/DEVICE để tiếp tục từ resume.pt gần nhất.', flush=True)
        raise
    finally:
        stopped.set()
        if process.poll() is None:
            _stop_owned_process(process)
        reader.join(timeout=1)
        process.stdout.close()


def install_colab_logging(workflow, output):
    workflow.command = partial(command_with_logs, workspace=workflow.ROOT, output_root=output)
    print('Đã bật log trực tiếp và bộ đếm thời gian; cấu hình/SAC/checkpoint giữ nguyên.', flush=True)


# Khi dán nguyên file vào Colab, hai biến này đã có từ ô thiết lập notebook.
if 'workflow' in globals() and 'OUTPUT' in globals():
    install_colab_logging(workflow, OUTPUT)
