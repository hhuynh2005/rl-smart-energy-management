"""Đánh giá DDQN đã chọn, so với SAC (nếu có), No-battery và RBC trên S1–S5.

Ví dụ: python evaluate_ddqn.py --runs runs/ddqn/ddqn_seed0 --sac-runs runs/sac/custom_seed0
Mặc định dùng validation. Chỉ chạy --split test một lần, khi mô hình đã chốt.
"""

import argparse
import json
from pathlib import Path

import pandas as pd

from evaluate_sac import aggregate_results, save_plots
from sems_rl.agents.ddqn import DDQNAgent
from sems_rl.agents.sac import SACAgent
from sems_rl.experiments.sac_experiment import (
    ROOT, SCENARIOS, evaluate_policy, experiment_metadata, make_env,
    protocol_fingerprint, scenario_days, seed_everything, write_json,
)


def read_runs(parser, ddqn_dirs, sac_dirs):
    """Trả [(method, run_dir, metadata)]; mỗi (method, seed) chỉ được tính một lần."""
    runs, identities = [], set()
    for method, directories in (("ddqn", ddqn_dirs), ("sac", sac_dirs or [])):
        for run_dir in directories:
            metadata_path = run_dir / "metadata.json"
            if not metadata_path.is_file():
                parser.error(f"Không tìm thấy {metadata_path}.")
            metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
            expected = "ddqn" if method == "ddqn" else "custom"
            if metadata["backend"] != expected:
                parser.error(f"{run_dir} không phải lần chạy {method} (backend={metadata['backend']}).")
            identity = (method, metadata["seed"])
            if identity in identities:
                parser.error("Mỗi phương pháp/seed chỉ nhận một lần chạy để tránh đếm lặp.")
            identities.add(identity)
            runs.append((method, run_dir, metadata))
    return runs


def load_model(method, run_dir):
    return (DDQNAgent if method == "ddqn" else SACAgent).load(run_dir / "best.pt")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--runs", type=Path, nargs="+", required=True, help="Các thư mục ddqn_seedN")
    parser.add_argument("--sac-runs", type=Path, nargs="+", help="Các thư mục SAC tự viết custom_seedN")
    parser.add_argument("--split", choices=["val", "test"], default="val")
    parser.add_argument("--scenarios", choices=SCENARIOS, nargs="+", default=list(SCENARIOS))
    parser.add_argument("--max-days", type=int)
    parser.add_argument("--data-path", type=Path, help="Vị trí cùng CSV khi chuyển mô hình sang máy khác")
    parser.add_argument("--output", type=Path, default=Path("runs/ddqn/evaluation"))
    args = parser.parse_args()
    if args.max_days is not None and args.max_days < 1:
        parser.error("--max-days phải dương.")
    if args.output.exists() and any(args.output.iterdir()):
        parser.error("Thư mục kết quả đã có dữ liệu; chọn --output khác để tránh trộn thí nghiệm.")
    if len(set(args.scenarios)) != len(args.scenarios):
        parser.error("Danh sách kịch bản không được lặp.")

    runs = read_runs(parser, args.runs, args.sac_runs)
    if len({protocol_fingerprint(metadata) for _, _, metadata in runs}) != 1:
        parser.error("Các lần chạy không dùng cùng dữ liệu, môi trường và quy ước đánh giá.")

    first = runs[0][2]
    settings = first["settings"]
    dataset = args.data_path or Path(settings["environment"]["data"]["file_path"])
    if not dataset.is_file() and args.data_path is None:
        dataset = ROOT / "data/processed.csv"
    current = experiment_metadata(settings, first["backend"], first["seed"], dataset_path=dataset)
    if current["fingerprint"] != protocol_fingerprint(first):
        parser.error("CSV hoặc cấu hình đã thay đổi từ lúc huấn luyện.")
    # Chỉ đổi đường dẫn sau khi kiểm tra hash; nội dung CSV phải giữ nguyên.
    settings["environment"]["data"]["file_path"] = str(dataset.resolve())
    seed_everything(0, settings["training"]["torch_threads"])
    args.output.mkdir(parents=True, exist_ok=True)
    initial_soc = settings["evaluation"]["initial_soc"]
    all_frames, baseline_done, example_trace = [], set(), None

    for method, run_dir, metadata in runs:
        model = load_model(method, run_dir)
        for scenario in args.scenarios:
            env = make_env(settings, args.split, scenario)
            days = scenario_days(env, args.split, scenario, args.max_days)
            # Seed nhiễu cố định theo ngày, giống nhau cho mọi phương pháp.
            frame, history = evaluate_policy(model, env, days, seed=0, initial_soc=initial_soc)
            frame["seed"], frame["method"] = metadata["seed"], method
            all_frames.append(frame)
            trace = pd.DataFrame(history)
            trace.to_csv(args.output / f"example_{method}_seed{metadata['seed']}_{scenario}.csv",
                         index=False)
            if example_trace is None:
                example_trace = trace
            if scenario not in baseline_done:
                for baseline in ("no_battery", "rule_based"):
                    baseline_frame, _ = evaluate_policy(
                        None, env, days, seed=0, initial_soc=initial_soc, baseline=baseline,
                    )
                    baseline_frame["method"] = baseline
                    all_frames.append(baseline_frame)
                baseline_done.add(scenario)
            env.close()

    daily = pd.concat(all_frames, ignore_index=True)
    by_seed, summary = aggregate_results(daily)
    daily.to_csv(args.output / "daily_metrics.csv", index=False)
    by_seed.to_csv(args.output / "seed_metrics.csv", index=False)
    summary.to_csv(args.output / "summary.csv", index=False)
    write_json(args.output / "evaluation_metadata.json", {
        "split": args.split, "scenarios": args.scenarios,
        "max_days": args.max_days, "fingerprint": current["fingerprint"],
        "runs": [{"method": m, "path": str(p.resolve())} for m, p, _ in runs],
        "noise_seed_base": 0, "dataset_used": str(dataset.resolve()),
        "std_definition": "Độ lệch chuẩn mẫu giữa các trung bình seed; 1 seed ghi 0.",
        "selection_metric": first["selection_metric"],
    })
    save_plots(summary, example_trace, args.output)
    print(summary[[
        "method", "scenario", "seed_count", "daily_cost_j_mean",
        "adjusted_cost_saving_pct_mean", "peak_buy_kw_mean",
    ]].to_string(index=False))
    print(f"Đã lưu kết quả tại {args.output.resolve()}")


if __name__ == "__main__":
    main()
