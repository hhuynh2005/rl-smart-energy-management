"""Đánh giá mô hình SAC đã chọn; xuất KPI theo ngày, theo seed và biểu đồ.

Ví dụ: python evaluate_sac.py --runs runs/sac/custom_seed0 --split test
Lựa chọn mô hình luôn dùng validation trong train_sac.py, không dùng kết quả test.
"""

import argparse
import json
from pathlib import Path

import pandas as pd

from sems_rl.agents.sac import SACAgent
from sems_rl.experiments.sac_experiment import (
    SCENARIOS, evaluate_policy, experiment_metadata, make_env,
    ROOT, protocol_fingerprint, scenario_days, seed_everything, write_json,
)


def aggregate_results(daily):
    """Tính trung bình ngày trong mỗi seed, sau đó mới tính độ lệch chuẩn giữa seed."""
    metrics = [
        name for name in daily.select_dtypes(include="number").columns
        if name not in ("seed", "day_offset", "initial_soc", "inventory_reference_price")
    ]
    by_seed = daily.groupby(["method", "scenario", "seed"], as_index=False)[metrics].mean()
    rows = []
    for (method, scenario), group in by_seed.groupby(["method", "scenario"]):
        row = {"method": method, "scenario": scenario, "seed_count": len(group)}
        for name in metrics:
            row[name + "_mean"] = float(group[name].mean())
            row[name + "_std_seeds"] = float(group[name].std(ddof=1)) if len(group) > 1 else 0.0
        rows.append(row)
    return by_seed, pd.DataFrame(rows)


def save_plots(summary, trace, output):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    scenarios = list(summary["scenario"].unique())
    fig, axes = plt.subplots(1, len(scenarios), figsize=(5 * len(scenarios), 4), squeeze=False)
    for axis, scenario in zip(axes[0], scenarios):
        values = summary[summary["scenario"] == scenario]
        axis.bar(
            values["method"], values["adjusted_electric_cost_vnd_mean"],
            yerr=values["adjusted_electric_cost_vnd_std_seeds"], capsize=4,
        )
        axis.set_title(scenario)
        axis.set_ylabel("Chi phi dien dieu chinh (VND/ngay)")
        axis.tick_params(axis="x", rotation=30)
    fig.tight_layout()
    fig.savefig(output / "comparison.png", dpi=150)
    plt.close(fig)

    fig, axes = plt.subplots(3, 1, figsize=(10, 8), sharex=True)
    axes[0].plot(trace["hour"], trace["p_load_kw"], label="Tai")
    axes[0].plot(trace["hour"], trace["p_pv_kw"], label="PV")
    axes[0].plot(trace["hour"], trace["p_batt_kw"], label="Pin (+ sac, - xa)")
    axes[0].set_ylabel("Cong suat (kW)")
    axes[0].legend()
    axes[1].plot(trace["hour"], trace["soc"] * 100)
    axes[1].axhline(20, linestyle="--", color="red")
    axes[1].axhline(90, linestyle="--", color="red")
    axes[1].set_ylabel("SoC (%)")
    axes[2].plot(trace["hour"], trace["c_grid"])
    axes[2].set_ylabel("Gia dien (VND/kWh)")
    axes[2].set_xlabel("Gio")
    for axis in axes:
        axis.grid(alpha=0.3)
    fig.tight_layout()
    fig.savefig(output / "example_day.png", dpi=150)
    plt.close(fig)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--runs", type=Path, nargs="+", required=True)
    parser.add_argument("--split", choices=["val", "test"], default="val")
    parser.add_argument("--scenarios", choices=SCENARIOS, nargs="+", default=list(SCENARIOS))
    parser.add_argument("--max-days", type=int)
    parser.add_argument("--data-path", type=Path, help="Vị trí cùng CSV khi chuyển mô hình sang máy khác")
    parser.add_argument("--output", type=Path, default=Path("runs/sac/evaluation"))
    args = parser.parse_args()
    if args.max_days is not None and args.max_days < 1:
        parser.error("--max-days phải dương.")
    if args.output.exists() and any(args.output.iterdir()):
        parser.error("Thư mục kết quả đã có dữ liệu; chọn --output khác để tránh trộn thí nghiệm.")
    if len(set(args.scenarios)) != len(args.scenarios):
        parser.error("Danh sách kịch bản không được lặp.")

    runs = []
    identities = set()
    for run_dir in args.runs:
        metadata = json.loads((run_dir / "metadata.json").read_text(encoding="utf-8"))
        identity = (metadata["backend"], metadata["seed"])
        if identity in identities:
            parser.error("Mỗi phương pháp/seed chỉ nhận một lần chạy để tránh đếm lặp.")
        identities.add(identity)
        runs.append((run_dir, metadata))
    if len({protocol_fingerprint(metadata) for _, metadata in runs}) != 1:
        parser.error("Các lần chạy không dùng cùng dữ liệu, môi trường và quy ước đánh giá.")

    settings = runs[0][1]["settings"]
    dataset = args.data_path or Path(settings["environment"]["data"]["file_path"])
    if not dataset.is_file() and args.data_path is None:
        dataset = ROOT / "data/processed.csv"
    current = experiment_metadata(
        settings, runs[0][1]["backend"], runs[0][1]["seed"], dataset_path=dataset
    )
    if current["fingerprint"] != protocol_fingerprint(runs[0][1]):
        parser.error("CSV hoặc cấu hình đã thay đổi từ lúc huấn luyện.")
    # Chỉ đổi đường dẫn sau khi kiểm tra hash; nội dung CSV phải giữ nguyên.
    settings["environment"]["data"]["file_path"] = str(dataset.resolve())
    seed_everything(0, settings["training"]["torch_threads"])
    args.output.mkdir(parents=True, exist_ok=True)
    all_frames = []
    baseline_done = set()
    example_trace = None

    for run_dir, metadata in runs:
        seed, backend = metadata["seed"], metadata["backend"]
        if backend == "custom":
            model = SACAgent.load(run_dir / "best.pt")
        else:
            from stable_baselines3 import SAC
            model = SAC.load(run_dir / "best.zip", device="cpu")
        for scenario in args.scenarios:
            env = make_env(settings, args.split, scenario)
            days = scenario_days(env, args.split, scenario, args.max_days)
            # Seed nhiễu cố định theo ngày, độc lập seed khởi tạo mạng của mô hình.
            frame, history = evaluate_policy(
                model, env, days, seed=0, initial_soc=settings["evaluation"]["initial_soc"]
            )
            frame["seed"], frame["method"] = seed, backend
            all_frames.append(frame)
            trace = pd.DataFrame(history)
            trace.to_csv(args.output / f"example_{backend}_seed{seed}_{scenario}.csv", index=False)
            if example_trace is None:
                example_trace = trace
            if scenario not in baseline_done:
                for baseline in ("no_battery", "rule_based"):
                    baseline_frame, _ = evaluate_policy(
                        None, env, days, seed=0,
                        initial_soc=settings["evaluation"]["initial_soc"], baseline=baseline,
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
        "runs": [str(path.resolve()) for path, _ in runs],
        "noise_seed_base": 0,
        "dataset_used": str(dataset.resolve()),
        "std_definition": "Độ lệch chuẩn mẫu giữa các trung bình seed; 1 seed ghi 0, chưa đo được độ ổn định.",
        "selection_metric": runs[0][1]["selection_metric"],
    })
    save_plots(summary, example_trace, args.output)
    print(summary[[
        "method", "scenario", "seed_count", "daily_cost_j_mean",
        "adjusted_cost_saving_pct_mean", "peak_buy_kw_mean",
    ]].to_string(index=False))
    print(f"Đã lưu kết quả tại {args.output.resolve()}")


if __name__ == "__main__":
    main()
