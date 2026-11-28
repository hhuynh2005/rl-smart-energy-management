"""Phân tích hành vi sạc/xả trên VALIDATION, không đọc kết quả tập test.

Chạy: python diagnose_sac.py --run runs/sac_pilot/custom_seed0 --output runs/sac_diagnosis
"""

import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
import pandas as pd

from sems_rl.agents.sac import SACAgent
from sems_rl.experiments.sac_experiment import (
    ROOT, episode, episode_metrics, make_env, policy_function,
    scenario_days, seed_everything, write_json,
)


def energy_statistics(history, env):
    """Đơn vị năng lượng kWh; không suy diễn nguồn điện nằm trong pin."""
    frame = pd.DataFrame(history)
    base = env.unwrapped
    charge = frame.p_batt_kw.clip(lower=0) * base.delta_t
    discharge = (-frame.p_batt_kw).clip(lower=0) * base.delta_t
    return {
        "charge_kwh": float(charge.sum()), "discharge_kwh": float(discharge.sum()),
        "charge_off_peak_kwh": float(charge[frame.c_grid.eq(1100)].sum()),
        "discharge_off_peak_kwh": float(discharge[frame.c_grid.eq(1100)].sum()),
        "discharge_peak_kwh": float(discharge[frame.c_grid.eq(3000)].sum()),
        "pv_surplus_before_battery_kwh": float(
            (frame.p_pv_kw - frame.p_load_kw).clip(lower=0).sum() * base.delta_t
        ),
        "export_during_discharge_kwh": float(
            frame.loc[frame.p_batt_kw.lt(-1e-6), "p_sell_kw"].sum() * base.delta_t
        ),
        "clipped_at_soc_min": int((frame.is_clipped & frame.old_soc.le(base.battery.soc_min + 1e-5)).sum()),
        "clipped_at_soc_max": int((frame.is_clipped & frame.old_soc.ge(base.battery.soc_max - 1e-5)).sum()),
        "peak_penalty_vnd": float(frame.c_peak.sum() * base.w2_peak),
        "violation_penalty_vnd": float(frame.p_viol.sum() * base.w3_viol),
        "cost_implied_by_reward_vnd": float(-frame.reward.sum() * base.c_ref),
    }


def plot_day(histories, output, scenario):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    trace = histories["custom"]
    fig, axes = plt.subplots(3, 1, figsize=(11, 8), sharex=True)
    for name in ("p_load_kw", "p_pv_kw", "p_batt_kw"):
        axes[0].plot(trace.hour, trace[name], label=name)
    axes[0].set_ylabel("kW")
    axes[0].legend()
    for name, frame in histories.items():
        axes[1].plot(frame.hour, frame.soc * 100, label=name)
    axes[1].set_ylabel("SoC (%)")
    axes[1].legend()
    axes[2].plot(trace.hour, trace.c_grid)
    axes[2].set_ylabel("VND/kWh")
    axes[2].set_xlabel("Hour")
    fig.suptitle(f"{scenario}: validation day with largest SAC cost above no-battery")
    fig.tight_layout()
    fig.savefig(output / f"{scenario}_worst_day.png", dpi=140)
    plt.close(fig)


def diagnose(run, output, max_days=None):
    output.mkdir(parents=True, exist_ok=True)
    if any(output.iterdir()):
        raise ValueError(f"Thư mục chẩn đoán đã có dữ liệu: {output}")
    metadata = json.loads((run / "metadata.json").read_text(encoding="utf-8"))
    settings = metadata["settings"]
    dataset = ROOT / "data/processed.csv"
    if hashlib.sha256(dataset.read_bytes()).hexdigest() != metadata["data_sha256"]:
        raise ValueError("CSV khác dữ liệu dùng để huấn luyện mô hình.")
    settings["environment"]["data"]["file_path"] = str(dataset)
    seed_everything(0, settings["training"]["torch_threads"])
    model = SACAgent.load(run / "best.pt")
    rows = []
    theory = None
    for scenario in ("S2", "S3", "S5"):
        env = make_env(settings, "val", scenario)
        days = scenario_days(env, "val", scenario, max_days)
        worst_gap = -np.inf
        for day in days:
            date = str(env.unwrapped.data_pipeline.get_day_data(day, "val").iloc[0].timestamp)[:10]
            histories = {}
            for method in ("no_battery", "rule_based", "custom"):
                policy = policy_function(model) if method == "custom" else policy_function(
                    baseline=method, peak_threshold=env.unwrapped.p_th
                )
                histories[method] = episode(env, policy, day, day, 0.5)
                metrics = episode_metrics(histories[method], env, 0.5, histories["no_battery"])
                statistics = energy_statistics(histories[method], env)
                rows.append({"scenario": scenario, "day_offset": day, "date": date,
                             "method": method, **metrics, **statistics,
                             "reward_selection_gap_vnd": statistics["cost_implied_by_reward_vnd"]
                             - metrics["adjusted_total_cost_vnd"]})
            gap = rows[-1]["adjusted_total_cost_vnd"] - rows[-3]["adjusted_total_cost_vnd"]
            if gap > worst_gap:
                worst_gap = gap
                worst = {name: pd.DataFrame(history) for name, history in histories.items()}
        for method, frame in worst.items():
            frame.to_csv(output / f"{scenario}_worst_{method}.csv", index=False)
        plot_day(worst, output, scenario)
        base = env.unwrapped
        efficiency = base.battery.eta_c * base.battery.eta_d
        theory = {
            "round_trip_efficiency": efficiency,
            "wear_vnd_per_ac_kwh": base.battery.c_wear,
            "grid_cycle_break_even_sell_price": 1100 / efficiency
            + base.battery.c_wear * (1 + 1 / efficiency),
            "pv_cycle_break_even_sell_price": base.c_feed_in / efficiency
            + base.battery.c_wear * (1 + 1 / efficiency),
            "assumption": "Chu kỳ đầy đủ, giá mua 1100, cơ hội bán PV theo cấu hình; chưa có phạt đỉnh/vi phạm.",
        }
        env.close()
    daily = pd.DataFrame(rows)
    daily.to_csv(output / "daily_behavior.csv", index=False)
    columns = [name for name in daily.select_dtypes(include="number") if name != "day_offset"]
    summary = daily.groupby(["scenario", "method"], as_index=False)[columns].mean()
    summary.to_csv(output / "behavior_summary.csv", index=False)
    write_json(output / "diagnosis_metadata.json", {
        "split": "val", "seed": metadata["seed"], "data_sha256": metadata["data_sha256"],
        "objective": settings.get("objective", {"mode": "original"}), "theory": theory,
        "output_scope": "Mỗi kịch bản dùng lại một số ngày; không coi là các ngày lịch độc lập.",
    })
    print(summary[["scenario", "method", "charge_kwh", "discharge_kwh",
                   "clipped_at_soc_min", "adjusted_total_cost_vnd",
                   "reward_selection_gap_vnd"]].to_string(index=False), flush=True)
    return summary


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--run", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--max-days", type=int)
    args = parser.parse_args()
    if args.max_days is not None and args.max_days < 1:
        parser.error("--max-days phải dương.")
    diagnose(args.run, args.output, args.max_days)
