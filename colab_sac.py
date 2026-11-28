"""Các bước thí nghiệm trên Colab; notebook gọi lần lượt các hàm trong file này.

Chỉ validation được dùng để chọn cấu hình/checkpoint. Test được bảo vệ bằng
khóa cấu hình và hash mô hình sau khi đủ 300.000 bước cho cả 5 seed.
"""

import hashlib
import json
import os
import subprocess
import sys
import time
from copy import deepcopy
from pathlib import Path

import pandas as pd
import torch
import yaml

from sems_rl.agents.sac import SACAgent, SACConfig
from sems_rl.experiments.sac_experiment import ROOT, read_settings, seed_everything, write_json
from sems_rl.experiments.sac_resume import portable_settings


FINAL_STEPS = 300_000
FINAL_SEEDS = [0, 1, 2, 3, 4]
PILOT_STEPS = 50_000
PILOT_SEEDS = [0, 1]
CANDIDATES = ("original", "daily_inventory")


def file_hash(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def source_hash():
    """Khóa đúng mã thuật toán khi chọn cấu hình và khi đánh giá cuối."""
    paths = sorted((ROOT / "sems_rl").rglob("*.py"))
    paths += [ROOT / name for name in ("train_sac.py", "evaluate_sac.py", "diagnose_sac.py", "colab_sac.py")]
    digest = hashlib.sha256()
    for path in paths:
        digest.update(str(path.relative_to(ROOT)).replace("\\", "/").encode())
        digest.update(path.read_bytes())
    return digest.hexdigest()


def immutable_file(path, contents):
    """Không trộn cấu hình của hai thí nghiệm khi chạy lại notebook."""
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists():
        if path.read_text(encoding="utf-8") != contents:
            raise ValueError(f"Nội dung đã đổi: {path}. Hãy chọn thư mục thí nghiệm mới.")
    else:
        path.write_text(contents, encoding="utf-8")


def command(*arguments):
    """Truyền đối số theo danh sách, không ghép lệnh shell hoặc chứa thông tin đăng nhập."""
    environment = os.environ.copy()
    environment["PYTHONIOENCODING"] = "utf-8"
    subprocess.run([sys.executable, "-u", *map(str, arguments)], cwd=ROOT,
                   env=environment, check=True)


def prepare_experiment(root):
    root = Path(root)
    settings = read_settings()
    settings.pop("environment")
    settings["training"].update({"total_timesteps": PILOT_STEPS, "seeds": PILOT_SEEDS})
    for candidate in CANDIDATES:
        current = deepcopy(settings)
        current["objective"] = {"mode": candidate}
        if candidate == "daily_inventory":
            current["agent"]["gamma"] = 1.0
        immutable_file(root / "configs" / f"{candidate}.yaml",
                       yaml.safe_dump(current, allow_unicode=True, sort_keys=False))
    plan = {
        "pilot_steps": PILOT_STEPS, "pilot_seeds": PILOT_SEEDS,
        "final_steps": FINAL_STEPS, "final_seeds": FINAL_SEEDS,
        "candidates": list(CANDIDATES), "selection_split": "val",
        "selection_metric": "S5 adjusted_total_cost_vnd_mean (nhỏ nhất)",
        "diagnostic_scenarios": ["S2", "S3"],
        "data_sha256": file_hash(ROOT / "data/processed.csv"), "source_sha256": source_hash(),
        "note": "Hai cách đặt bài toán khác gamma, reward và terminal; không quy kết tác động cho một yếu tố riêng.",
    }
    immutable_file(root / "experiment_plan.json", json.dumps(plan, ensure_ascii=False, indent=2))
    return plan


def verify_plan(root):
    plan = json.loads((root / "experiment_plan.json").read_text(encoding="utf-8"))
    if plan["source_sha256"] != source_hash() or plan["data_sha256"] != file_hash(ROOT / "data/processed.csv"):
        raise ValueError("Mã nguồn hoặc dữ liệu đã đổi so với kế hoạch. Cần một thư mục thí nghiệm mới.")
    return plan


def completed_run(run, config_path, seed, steps):
    summary_path = run / "training_summary.json"
    if not summary_path.is_file():
        return False
    summary = json.loads(summary_path.read_text(encoding="utf-8"))
    if summary["total_timesteps"] != steps or summary["training_seed"] != seed:
        raise ValueError(f"Ngân sách/seed khác kế hoạch: {run}")
    metadata = json.loads((run / "metadata.json").read_text(encoding="utf-8"))
    expected = read_settings(config_path)
    expected["training"]["seeds"] = [seed]
    if portable_settings(expected) != portable_settings(metadata["settings"]):
        raise ValueError(f"Cấu hình mô hình không khớp: {run}")
    if metadata["data_sha256"] != file_hash(ROOT / "data/processed.csv") or not (run / "best.pt").is_file():
        raise ValueError(f"Thiếu checkpoint hoặc dữ liệu khác: {run}")
    return True


def train_seeds(output, config_path, seeds, steps, device):
    for seed in seeds:
        run = output / f"custom_seed{seed}"
        if completed_run(run, config_path, seed, steps):
            print(f"Seed {seed} đã đủ {steps:,} bước; giữ nguyên kết quả.", flush=True)
            continue
        if run.exists() and any(run.iterdir()) and not (run / "resume.pt").is_file():
            # Phiên có thể dừng ngay lúc khởi tạo, trước snapshot đầu tiên.
            # Giữ thư mục dang dở để đối chiếu rồi khởi tạo lại đúng seed.
            backup = run.with_name(run.name + f"_incomplete_{time.time_ns()}")
            run.rename(backup)
        command("train_sac.py", "--backend", "custom", "--config", config_path,
                "--seeds", seed, "--device", device, "--output", output,
                "--resume", "--checkpoint-freq", 10000)


def evaluate_runs(runs, output, split):
    summary = output / "summary.csv"
    if summary.is_file():
        print(f"Đã có đánh giá {split}: {output}", flush=True)
        return pd.read_csv(summary)
    if output.exists() and any(output.iterdir()):
        output.rename(output.with_name(output.name + f"_incomplete_{time.time_ns()}"))
    command("evaluate_sac.py", "--runs", *runs, "--split", split,
            "--data-path", ROOT / "data/processed.csv", "--output", output)
    return pd.read_csv(summary)


def run_pilots(root, device):
    root = Path(root)
    verify_plan(root)
    for candidate in CANDIDATES:
        output = root / "pilots" / candidate
        config = root / "configs" / f"{candidate}.yaml"
        train_seeds(output, config, PILOT_SEEDS, PILOT_STEPS, device)
        runs = [output / f"custom_seed{seed}" for seed in PILOT_SEEDS]
        evaluate_runs(runs, output / "validation", "val")


def lock_configuration(root):
    root = Path(root)
    plan = verify_plan(root)
    records = []
    for candidate in CANDIDATES:
        config = root / "configs" / f"{candidate}.yaml"
        for seed in PILOT_SEEDS:
            if not completed_run(root / "pilots" / candidate / f"custom_seed{seed}", config, seed, PILOT_STEPS):
                raise ValueError("Cần hoàn tất tất cả pilot trước khi chọn cấu hình.")
        summary = pd.read_csv(root / "pilots" / candidate / "validation/summary.csv")
        custom = summary[summary.method.eq("custom")].set_index("scenario")
        if not custom.seed_count.eq(len(PILOT_SEEDS)).all():
            raise ValueError("Kết quả pilot chưa đủ seed.")
        records.append({"candidate": candidate,
                        **{f"{s}_cost": float(custom.loc[s, "adjusted_total_cost_vnd_mean"])
                           for s in ("S2", "S3", "S5")},
                        "S5_clipped_steps": float(custom.loc["S5", "clipped_steps_mean"])})
    comparison = pd.DataFrame(records)
    comparison.to_csv(root / "pilot_comparison.csv", index=False)
    # Nếu bằng điểm, ưu tiên original theo thứ tự đã khai báo trước thí nghiệm.
    selected = min(records, key=lambda row: row["S5_cost"])["candidate"]
    settings = yaml.safe_load((root / "configs" / f"{selected}.yaml").read_text(encoding="utf-8"))
    settings["training"].update({"total_timesteps": FINAL_STEPS, "seeds": FINAL_SEEDS})
    path = root / "locked_config.yaml"
    immutable_file(path, yaml.safe_dump(settings, allow_unicode=True, sort_keys=False))
    lock = {"selected": selected, "config_sha256": file_hash(path),
            "data_sha256": plan["data_sha256"], "source_sha256": plan["source_sha256"],
            "selection_metric": plan["selection_metric"], "test_used_for_selection": False,
            "pilot_scores": records, "final_steps": FINAL_STEPS, "final_seeds": FINAL_SEEDS}
    immutable_file(root / "configuration_lock.json", json.dumps(lock, ensure_ascii=False, indent=2))
    return comparison, lock


def verify_lock(root):
    verify_plan(root)
    lock = json.loads((root / "configuration_lock.json").read_text(encoding="utf-8"))
    if lock["config_sha256"] != file_hash(root / "locked_config.yaml"):
        raise ValueError("Cấu hình đã bị thay đổi sau khi khóa.")
    if lock["final_steps"] != FINAL_STEPS or lock["final_seeds"] != FINAL_SEEDS:
        raise ValueError("Kế hoạch chính thức phải đủ 300.000 bước × 5 seed.")
    return lock


def run_final(root, device):
    root = Path(root)
    verify_lock(root)
    train_seeds(root / "final", root / "locked_config.yaml", FINAL_SEEDS, FINAL_STEPS, device)
    return evaluate_final(root, "val")


def evaluate_final(root, split="test"):
    root = Path(root)
    if split not in ("val", "test"):
        raise ValueError("Chỉ đánh giá validation hoặc test.")
    lock = verify_lock(root)
    runs = [root / "final" / f"custom_seed{seed}" for seed in FINAL_SEEDS]
    for seed, run in zip(FINAL_SEEDS, runs):
        if not completed_run(run, root / "locked_config.yaml", seed, FINAL_STEPS):
            raise ValueError("Chưa đủ 300.000 bước × 5 seed; chưa được chạy test.")
    if split == "test":
        # Validation cuối có sẵn trước khi mở test; khóa đúng các best.pt đã chọn.
        if not (root / "final_validation/summary.csv").is_file():
            raise ValueError("Cần tổng hợp validation cuối trước khi mở test.")
        model_lock = {"configuration_sha256": lock["config_sha256"],
                      "checkpoints": {str(seed): file_hash(run / "best.pt")
                                      for seed, run in zip(FINAL_SEEDS, runs)}}
        immutable_file(root / "test_models_lock.json", json.dumps(model_lock, indent=2))
    return evaluate_runs(runs, root / ("final_validation" if split == "val" else "final_test"), split)


def benchmark_device():
    """Mạng nhỏ có thể chạy CPU nhanh hơn GPU; đo thay vì giả định GPU tốt hơn."""
    devices = ["cpu"] + (["cuda"] if torch.cuda.is_available() else [])
    rows = []
    for device in devices:
        seed_everything(0, 1)
        agent = SACAgent(SACConfig(buffer_size=512), device=device)
        for _ in range(512):
            agent.buffer.add([0.5] * 7, [0.0], -1.0, [0.5] * 7, False)
        for _ in range(10):
            agent.update()
        if device == "cuda":
            torch.cuda.synchronize()
        start = time.perf_counter()
        for _ in range(100):
            agent.predict([0.5] * 7)
            agent.update()
        if device == "cuda":
            torch.cuda.synchronize()
        rows.append({"device": device, "seconds_per_100_updates": time.perf_counter() - start})
    results = pd.DataFrame(rows)
    return min(rows, key=lambda row: row["seconds_per_100_updates"])["device"], results
