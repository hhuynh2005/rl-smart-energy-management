"""Pipeline đánh giá tổng hợp cho SEMS-RL (PPO, SAC, TD3, DDQN, Rule-based, No-battery).

Ví dụ:
  python evaluate_all.py --runs runs/ppo_final/ppo_seed0 runs/ppo_final/ppo_seed1 --split test --output runs/eval_ppo_test
  python evaluate_all.py --baselines-only --split test --output runs/eval_baselines_test
"""

import argparse
import json
from pathlib import Path
import sys
from typing import Any, Dict, List, Tuple

# Đảm bảo console Windows xử lý UTF-8
for stream in (sys.stdout, sys.stderr):
    if hasattr(stream, "reconfigure"):
        try:
            stream.reconfigure(encoding="utf-8")
        except Exception:
            pass

import pandas as pd

from sems_rl.experiments.protocol import (
    COMPATIBLE_PROTOCOLS,
    ROOT,
    SCENARIOS,
    aggregate_results,
    compute_aggregate_savings,
    evaluate_policy,
    experiment_metadata,
    format_rel_path,
    format_summary_markdown,
    infer_run_identity,
    load_policy_from_run,
    make_env,
    protocol_fingerprint,
    read_settings,
    save_evaluation_plots,
    scenario_days,
    seed_everything,
    write_json,
)


def _resolve_dataset_path(settings: Dict[str, Any], cli_data_path: Path | None) -> Path:
    if cli_data_path is not None:
        return cli_data_path
    raw = Path(settings["environment"]["data"]["file_path"])
    if not raw.is_absolute():
        raw = ROOT / raw
    if not raw.is_file():
        return ROOT / "data/processed.csv"
    return raw


def main() -> None:
    """Điểm vào dòng lệnh cho pipeline đánh giá tổng hợp S1-S5."""
    parser = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("--runs", type=Path, nargs="*", default=[], help="Danh sách thư mục checkpoint từng seed")
    parser.add_argument("--baselines-only", action="store_true", help="Chỉ đánh giá No-battery và Rule-based")
    parser.add_argument("--split", choices=["val", "test"], default="val", help="Phân vùng dữ liệu đánh giá")
    parser.add_argument("--scenarios", choices=SCENARIOS, nargs="+", default=list(SCENARIOS), help="Kịch bản đánh giá (S1–S5)")
    parser.add_argument("--max-days", type=int, help="Giới hạn số ngày mỗi kịch bản (dùng khi kiểm thử nhanh)")
    parser.add_argument("--data-path", type=Path, help="Đường dẫn tới processed.csv khi chạy ở máy khác")
    parser.add_argument("--device", default="cpu", choices=["cpu", "cuda"], help="Thiết bị suy luận PyTorch/SB3")
    parser.add_argument("--no-baselines", action="store_true", help="Bỏ qua việc chạy lại No-battery và Rule-based")
    parser.add_argument("--output", type=Path, default=Path("runs/evaluation"), help="Thư mục lưu CSV, bảng Markdown và biểu đồ")
    args = parser.parse_args()

    if not args.runs and not args.baselines_only:
        parser.error("Cần truyền --runs <thư mục> hoặc dùng --baselines-only.")
    if args.max_days is not None and args.max_days < 1:
        parser.error("--max-days phải dương.")
    if args.output.exists() and any(args.output.iterdir()):
        parser.error("Thư mục kết quả đã có dữ liệu; chọn --output khác để tránh ghi đè.")
    if len(set(args.scenarios)) != len(args.scenarios):
        parser.error("Danh sách kịch bản không được lặp.")

    runs: List[Tuple[Path, Dict[str, Any]]] = []
    identities = set()
    for run_dir in args.runs:
        meta_path = run_dir / "metadata.json"
        if not meta_path.is_file():
            parser.error(f"Thiếu metadata.json trong {run_dir}")
        metadata = json.loads(meta_path.read_text(encoding="utf-8"))
        proto = metadata.get("protocol", "")
        if proto not in COMPATIBLE_PROTOCOLS:
            parser.error(f"Protocol '{proto}' không tương thích ({run_dir}).")
        algo, backend, _ = infer_run_identity(metadata)
        identity = (algo, backend, int(metadata["seed"]))
        if identity in identities:
            parser.error(f"Phát hiện trùng lặp phương pháp/seed: {identity}")
        identities.add(identity)
        runs.append((run_dir, metadata))

    if runs:
        fingerprints = {protocol_fingerprint(meta, include_protocol=False) for _, meta in runs}
        if len(fingerprints) != 1:
            parser.error("Các lượt chạy không dùng cùng cấu hình môi trường, dữ liệu hoặc quy ước đánh giá.")
        settings = runs[0][1]["settings"]
        dataset = _resolve_dataset_path(settings, args.data_path)
        current = experiment_metadata(
            settings,
            method=str(runs[0][1].get("method", "eval")),
            backend=str(runs[0][1].get("backend", "eval")),
            seed=int(runs[0][1]["seed"]),
            dataset_path=dataset,
        )
        if current["fingerprint"] != protocol_fingerprint(runs[0][1], include_protocol=False):
            parser.error("CSV hoặc cấu hình môi trường đã thay đổi so với lúc huấn luyện.")
        settings["environment"]["data"]["file_path"] = str(dataset.resolve())
        fingerprint = current["fingerprint"]
    else:
        settings = read_settings(default_config="configs/ppo.yaml")
        if args.data_path is not None:
            settings["environment"]["data"]["file_path"] = str(args.data_path.resolve())
        dataset = Path(settings["environment"]["data"]["file_path"])
        meta_probe = experiment_metadata(settings, "baseline", "baseline", 0, dataset_path=dataset)
        fingerprint = meta_probe["fingerprint"]

    seed_everything(0, settings["training"].get("torch_threads", 1))
    args.output.mkdir(parents=True, exist_ok=True)
    initial_soc = float(settings["evaluation"]["initial_soc"])

    # Chia sẻ DataPipeline duy nhất để không đọc lại CSV qua từng kịch bản/seed
    probe_env = make_env(settings, args.split, args.scenarios[0])
    shared_pipeline = probe_env.unwrapped.data_pipeline
    probe_env.close()

    all_frames: List[pd.DataFrame] = []
    traces_by_scenario: Dict[str, Dict[str, pd.DataFrame]] = {sc: {} for sc in args.scenarios}
    best_trace_cost: Dict[Tuple[str, str], Tuple[float, int]] = {}
    run_labels_dirs: List[Tuple[str, Path]] = []

    # 1. Chạy các mốc đối chuẩn No-battery và Rule-based một lần cho mỗi kịch bản
    if not args.no_baselines:
        for scenario in args.scenarios:
            env = make_env(settings, args.split, scenario, data_pipeline=shared_pipeline)
            days = scenario_days(env, args.split, scenario, args.max_days)
            for baseline in ("no_battery", "rule_based"):
                b_frame, b_hist = evaluate_policy(
                    None,
                    env,
                    days,
                    seed=0,
                    initial_soc=initial_soc,
                    baseline=baseline,
                )
                b_frame["method"] = baseline
                all_frames.append(b_frame)
                if b_hist is not None:
                    b_trace = pd.DataFrame(b_hist)
                    b_trace.to_csv(args.output / f"trace_{baseline}_{scenario}.csv", index=False)
                    traces_by_scenario[scenario][baseline] = b_trace
            env.close()

    # 2. Chạy từng mô hình RL
    for run_dir, metadata in runs:
        seed = int(metadata["seed"])
        policy_fn, label = load_policy_from_run(run_dir, metadata, device=args.device)
        run_labels_dirs.append((label, run_dir))

        for scenario in args.scenarios:
            env = make_env(settings, args.split, scenario, data_pipeline=shared_pipeline)
            days = scenario_days(env, args.split, scenario, args.max_days)
            frame, history = evaluate_policy(
                policy_fn,
                env,
                days,
                seed=0,
                initial_soc=initial_soc,
            )
            frame["seed"] = seed
            frame["method"] = label
            all_frames.append(frame)
            if history is not None:
                trace = pd.DataFrame(history)
                trace.to_csv(args.output / f"trace_{label}_seed{seed}_{scenario}.csv", index=False)
                mean_total_cost = float(frame["adjusted_total_cost_vnd"].mean())
                prev = best_trace_cost.get((scenario, label))
                if prev is None or (mean_total_cost, seed) < prev:
                    best_trace_cost[(scenario, label)] = (mean_total_cost, seed)
                    traces_by_scenario[scenario][label] = trace
            env.close()

    trace_seeds_note: Dict[str, str] = {}
    for scenario in args.scenarios:
        parts = [
            f"{label}: seed {best_trace_cost[(scenario, label)][1]}"
            for (sc_k, label) in sorted(best_trace_cost.keys())
            if sc_k == scenario
        ]
        if parts:
            trace_seeds_note[scenario] = ", ".join(parts)

    daily = pd.concat(all_frames, ignore_index=True)
    by_seed, summary = aggregate_results(daily)
    agg_savings = compute_aggregate_savings(daily)

    daily.to_csv(args.output / "daily_metrics.csv", index=False)
    by_seed.to_csv(args.output / "seed_metrics.csv", index=False)
    summary.to_csv(args.output / "summary.csv", index=False)
    if not agg_savings.empty:
        agg_savings.to_csv(args.output / "aggregate_savings.csv", index=False)

    md_table = format_summary_markdown(summary)
    (args.output / "report_table.md").write_text(md_table, encoding="utf-8")

    write_json(
        args.output / "evaluation_metadata.json",
        {
            "split": args.split,
            "scenarios": args.scenarios,
            "max_days": args.max_days,
            "fingerprint": fingerprint,
            "runs": [format_rel_path(path) for path, _ in runs],
            "trace_seeds_selected": {
                f"{sc}/{label}": seed for (sc, label), (_, seed) in sorted(best_trace_cost.items())
            },
            "noise_seed_base": 0,
            "dataset_used": format_rel_path(dataset),
            "std_definition": "Độ lệch chuẩn mẫu (ddof=1) giữa các trung bình seed; 1 seed ghi 0.",
            "bootstrap_ci_definition": "Bootstrap 95% CI (1.000 mẫu lặp) trên trung bình theo ngày qua các seed.",
        },
    )

    save_evaluation_plots(
        summary,
        traces_by_scenario,
        args.output,
        run_dirs=run_labels_dirs,
        trace_seeds=trace_seeds_note,
    )
    print("\n=== BẢNG TỔNG HỢP KẾT QUẢ ===")
    print(
        summary[
            [
                "scenario",
                "method",
                "seed_count",
                "daily_cost_j_mean",
                "cost_saving_pct_mean",
                "adjusted_electric_cost_vnd_mean",
                "adjusted_cost_saving_pct_mean",
                "adjusted_total_cost_vnd_mean",
                "peak_buy_kw_mean",
                "efc_mean",
                "clipped_steps_mean",
            ]
        ].to_string(index=False)
    )
    print(f"\nĐã lưu toàn bộ bảng và biểu đồ tại: {format_rel_path(args.output)}")


if __name__ == "__main__":
    main()
