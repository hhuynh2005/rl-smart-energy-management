"""
Script huấn luyện và đánh giá thuật toán TD3 trên môi trường MicrogridBessEnv v1.0.
Sử dụng các module sẵn có trong repo:
- MicrogridBessEnv & NoiseWrapper (sems_rl.envs)
- NoBatteryBaseline & RuleBasedController (sems_rl.baselines)
- MetricsEvaluator (sems_rl.metrics)
- TD3Agent (sems_rl.agents.td3)
"""

import argparse
import json
import os
import sys
from typing import Any, Dict, List

# Đảm bảo console Windows hiển thị UTF-8 chuẩn
for stream in [sys.stdout, sys.stderr]:
    if hasattr(stream, "reconfigure"):
        try:
            stream.reconfigure(encoding="utf-8")
        except Exception:
            pass

import numpy as np

from sems_rl.agents.td3 import TD3Agent
from sems_rl.baselines.no_battery import NoBatteryBaseline, RuleBasedController
from sems_rl.envs.microgrid_env import MicrogridBessEnv
from sems_rl.envs.wrappers import NoiseWrapper
from sems_rl.metrics.evaluator import MetricsEvaluator


def evaluate_policy(
    env: Any,
    policy_fn,
    evaluator: MetricsEvaluator,
    split: str,
    initial_soc: float = 0.5,
) -> Dict[str, Any]:
    """Đánh giá chính sách tất định trên toàn bộ các ngày của một split."""
    base_env = env.unwrapped
    n_days = base_env.data_pipeline.get_num_days(split)
    episode_metrics: List[Dict[str, float]] = []

    for day_offset in range(n_days):
        obs, info = env.reset(
            options={"split": split, "day_offset": day_offset, "initial_soc": initial_soc}
        )
        terminated = False
        truncated = False

        while not (terminated or truncated):
            action = policy_fn(obs, info)
            obs, _, terminated, truncated, info = env.step(action)

        episode_metrics.append(evaluator.evaluate_episode(base_env.episode_history))

    return evaluator.summarize_results(episode_metrics)


def train_single_seed(
    seed: int,
    args: argparse.Namespace,
    val_evaluator: MetricsEvaluator,
) -> Dict[str, Any]:
    """Huấn luyện TD3 trên 1 seed và chọn checkpoint tốt nhất trên tập Validation."""
    env_train = MicrogridBessEnv(split="train")
    env_val = MicrogridBessEnv(split="val")

    state_dim = env_train.observation_space.shape[0]
    action_dim = env_train.action_space.shape[0]

    agent = TD3Agent(
        state_dim=state_dim,
        action_dim=action_dim,
        gamma=env_train.gamma,
        tau=0.005,
        lr=args.lr,
        policy_noise=0.2,
        noise_clip=0.5,
        policy_delay=2,
        exploration_noise=args.exploration_noise,
        batch_size=args.batch_size,
        buffer_size=100_000,
        hidden_dim=256,
        seed=seed,
    )

    writer = None
    if not args.no_tensorboard:
        from torch.utils.tensorboard import SummaryWriter

        tb_path = os.path.join(args.log_dir, f"seed_{seed}")
        writer = SummaryWriter(log_dir=tb_path)

    best_val_reward = -float("inf")
    best_ckpt_path = os.path.join(args.save_dir, f"best_td3_seed{seed}.pt")

    obs, _ = env_train.reset(seed=seed)
    env_train.action_space.seed(seed)
    episode_reward = 0.0
    episode_num = 0
    recent_rewards: List[float] = []

    print(f"\n{'=' * 70}")
    print(f"HUẤN LUYỆN TD3 | seed={seed} | timesteps={args.timesteps} | n_start={args.n_start} | device={agent.device}")
    print(f"{'=' * 70}")

    for step in range(1, args.timesteps + 1):
        if step <= args.n_start:
            action = env_train.action_space.sample()
        else:
            action = agent.select_action(obs, add_noise=True)

        next_obs, reward, terminated, truncated, _ = env_train.step(action)
        agent.store_transition(obs, action, reward, next_obs, terminated)

        obs = next_obs
        episode_reward += reward

        if step >= args.n_start and len(agent.replay_buffer) >= args.batch_size:
            update_metrics = agent.update()
            if writer is not None and update_metrics and step % 100 == 0:
                writer.add_scalar("train/critic_loss", update_metrics["critic_loss"], step)
                writer.add_scalar("train/q1_mean", update_metrics["q1_mean"], step)
                if "actor_loss" in update_metrics:
                    writer.add_scalar("train/actor_loss", update_metrics["actor_loss"], step)

        if terminated or truncated:
            episode_num += 1
            recent_rewards.append(episode_reward)
            if writer is not None:
                writer.add_scalar("train/episode_reward", episode_reward, step)
            obs, _ = env_train.reset()
            episode_reward = 0.0

        # Đánh giá định kỳ trên tập Validation
        if (step % args.eval_freq == 0) or (step == args.timesteps):
            val_summary = evaluate_policy(
                env_val,
                lambda o, _info: agent.select_action(o, add_noise=False),
                val_evaluator,
                split="val",
            )
            val_rew = val_summary["episode_reward_mean"]
            val_save = val_summary.get("cost_saving_pct_mean", 0.0)
            val_peak = val_summary.get("peak_shaving_pct_mean", 0.0)
            avg_train_rew = float(np.mean(recent_rewards[-10:])) if recent_rewards else 0.0

            if val_rew > best_val_reward:
                best_val_reward = val_rew
                agent.save(best_ckpt_path)
                marker = " [BEST]"
            else:
                marker = ""

            print(
                f"Step {step:6d}/{args.timesteps} | Ep {episode_num:4d} | "
                f"TrainRew10: {avg_train_rew:7.3f} | ValRew: {val_rew:7.3f} | "
                f"ValSave: {val_save:5.2f}% | ValPeak: {val_peak:5.2f}%{marker}"
            )

            if writer is not None:
                writer.add_scalar("val/episode_reward_mean", val_rew, step)
                writer.add_scalar("val/cost_saving_pct_mean", val_save, step)
                writer.add_scalar("val/peak_shaving_pct_mean", val_peak, step)

    if writer is not None:
        writer.close()

    env_train.close()
    env_val.close()

    return {
        "seed": seed,
        "best_val_reward": float(best_val_reward),
        "checkpoint_path": best_ckpt_path,
    }


def print_comparison_table(rows: List[Dict[str, Any]]) -> None:
    """In bảng tổng hợp kết quả theo các chỉ số MetricsEvaluator."""
    print(f"\n{'=' * 95}")
    print("BẢNG KẾT QUẢ ĐÁNH GIÁ TRÊN TẬP TEST (56 NGÀY)")
    print(f"{'=' * 95}")
    header = (
        f"{'Phương pháp':<24} | {'Chi phí ngày (VNĐ)':>18} | {'Tiết kiệm (%)':>13} | "
        f"{'Cắt đỉnh (%)':>12} | {'PV tự dùng (%)':>14} | {'EFC':>6} | {'Clip':>5}"
    )
    print(header)
    print("-" * 95)
    for r in rows:
        print(
            f"{r['name']:<24} | "
            f"{r['daily_cost']:>18,.1f} | "
            f"{r['cost_saving_pct']:>13.2f} | "
            f"{r['peak_shaving_pct']:>12.2f} | "
            f"{r['pv_self_cons_pct']:>14.2f} | "
            f"{r['efc']:>6.3f} | "
            f"{r['clipped_steps']:>5.1f}"
        )
    print("=" * 95)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Huấn luyện và đánh giá TD3 cho SEMS-RL")
    parser.add_argument("--timesteps", type=int, default=50000, help="Tổng số bước huấn luyện mỗi seed")
    parser.add_argument("--n-start", type=int, default=5000, help="Số bước warm-up chọn hành động ngẫu nhiên")
    parser.add_argument("--eval-freq", type=int, default=5000, help="Chu kỳ đánh giá trên tập Validation")
    parser.add_argument("--seeds", type=int, nargs="+", default=[0], help="Danh sách seed huấn luyện")
    parser.add_argument("--lr", type=float, default=3e-4, help="Tốc độ học Adam")
    parser.add_argument("--batch-size", type=int, default=256, help="Kích thước minibatch")
    parser.add_argument("--exploration-noise", type=float, default=0.1, help="Độ lệch chuẩn nhiễu thăm dò")
    parser.add_argument("--save-dir", type=str, default="models/td3", help="Thư mục lưu checkpoint và kết quả")
    parser.add_argument("--log-dir", type=str, default="logs/td3", help="Thư mục lưu TensorBoard logs")
    parser.add_argument("--no-tensorboard", action="store_true", help="Tắt ghi log TensorBoard")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    os.makedirs(args.save_dir, exist_ok=True)

    # 1. Tính mốc No-battery Baseline trên Val và Test
    env_ref = MicrogridBessEnv(split="val")
    nobat_val = NoBatteryBaseline(env_ref).evaluate(split="val")
    val_evaluator = MetricsEvaluator(
        j_nobat_mean=nobat_val["mean_daily_cost_j"],
        peak_nobat_max=nobat_val["max_peak_buy_kw"],
    )

    nobat_test = NoBatteryBaseline(env_ref).evaluate(split="test")
    test_evaluator = MetricsEvaluator(
        j_nobat_mean=nobat_test["mean_daily_cost_j"],
        peak_nobat_max=nobat_test["max_peak_buy_kw"],
    )
    env_ref.close()

    # 2. Huấn luyện từng seed
    seed_runs: List[Dict[str, Any]] = []
    for seed in args.seeds:
        run_info = train_single_seed(seed, args, val_evaluator)
        seed_runs.append(run_info)

    # 3. Đánh giá trên tập Test (chuẩn & kịch bản S4)
    env_test = MicrogridBessEnv(split="test")
    rbc = RuleBasedController(p_th=env_test.p_th)
    rbc_summary = evaluate_policy(
        env_test,
        lambda obs, info: rbc.select_action(obs, info),
        test_evaluator,
        split="test",
    )

    td3_test_per_seed: List[Dict[str, Any]] = []
    td3_s4_per_seed: List[Dict[str, Any]] = []

    for run_info in seed_runs:
        seed = run_info["seed"]
        agent = TD3Agent(
            state_dim=env_test.observation_space.shape[0],
            action_dim=env_test.action_space.shape[0],
            gamma=env_test.gamma,
            lr=args.lr,
            batch_size=args.batch_size,
            exploration_noise=args.exploration_noise,
            seed=seed,
        )
        agent.load(run_info["checkpoint_path"])

        res_std = evaluate_policy(
            env_test,
            lambda o, _info, ag=agent: ag.select_action(o, add_noise=False),
            test_evaluator,
            split="test",
        )
        res_std["seed"] = seed
        td3_test_per_seed.append(res_std)

        env_s4 = NoiseWrapper(
            MicrogridBessEnv(split="test"),
            sigma_load=0.08,
            sigma_pv=0.15,
            seed=seed,
        )
        res_s4 = evaluate_policy(
            env_s4,
            lambda o, _info, ag=agent: ag.select_action(o, add_noise=False),
            test_evaluator,
            split="test",
        )
        res_s4["seed"] = seed
        td3_s4_per_seed.append(res_s4)
        env_s4.close()

    env_test.close()

    def aggregate_across_seeds(results: List[Dict[str, Any]]) -> Dict[str, float]:
        keys = [
            "daily_cost_j_mean",
            "cost_saving_pct_mean",
            "peak_shaving_pct_mean",
            "pv_self_consumption_mean",
            "efc_mean",
            "clipped_steps_mean",
            "episode_reward_mean",
        ]
        agg: Dict[str, float] = {}
        for k in keys:
            vals = [float(r[k]) for r in results if k in r]
            if vals:
                agg[k] = float(np.mean(vals))
                agg[k.replace("_mean", "_seed_std")] = float(np.std(vals))
        return agg

    td3_std_agg = aggregate_across_seeds(td3_test_per_seed)
    td3_s4_agg = aggregate_across_seeds(td3_s4_per_seed)

    table_rows = [
        {
            "name": "No-Battery Baseline",
            "daily_cost": nobat_test["mean_daily_cost_j"],
            "cost_saving_pct": 0.0,
            "peak_shaving_pct": 0.0,
            "pv_self_cons_pct": nobat_test["mean_pv_self_consumption"] * 100.0,
            "efc": 0.0,
            "clipped_steps": 0.0,
        },
        {
            "name": "Rule-Based (RBC)",
            "daily_cost": rbc_summary["daily_cost_j_mean"],
            "cost_saving_pct": rbc_summary.get("cost_saving_pct_mean", 0.0),
            "peak_shaving_pct": rbc_summary.get("peak_shaving_pct_mean", 0.0),
            "pv_self_cons_pct": rbc_summary["pv_self_consumption_mean"] * 100.0,
            "efc": rbc_summary["efc_mean"],
            "clipped_steps": rbc_summary["clipped_steps_mean"],
        },
        {
            "name": f"TD3 (Test, {len(args.seeds)} seed)",
            "daily_cost": td3_std_agg["daily_cost_j_mean"],
            "cost_saving_pct": td3_std_agg.get("cost_saving_pct_mean", 0.0),
            "peak_shaving_pct": td3_std_agg.get("peak_shaving_pct_mean", 0.0),
            "pv_self_cons_pct": td3_std_agg["pv_self_consumption_mean"] * 100.0,
            "efc": td3_std_agg["efc_mean"],
            "clipped_steps": td3_std_agg["clipped_steps_mean"],
        },
        {
            "name": f"TD3 (S4 Noise, {len(args.seeds)} seed)",
            "daily_cost": td3_s4_agg["daily_cost_j_mean"],
            "cost_saving_pct": td3_s4_agg.get("cost_saving_pct_mean", 0.0),
            "peak_shaving_pct": td3_s4_agg.get("peak_shaving_pct_mean", 0.0),
            "pv_self_cons_pct": td3_s4_agg["pv_self_consumption_mean"] * 100.0,
            "efc": td3_s4_agg["efc_mean"],
            "clipped_steps": td3_s4_agg["clipped_steps_mean"],
        },
    ]
    print_comparison_table(table_rows)

    summary_payload = {
        "config": vars(args),
        "no_battery_test": nobat_test,
        "rbc_test": rbc_summary,
        "td3_runs": seed_runs,
        "td3_test_per_seed": td3_test_per_seed,
        "td3_test_aggregate": td3_std_agg,
        "td3_s4_per_seed": td3_s4_per_seed,
        "td3_s4_aggregate": td3_s4_agg,
    }
    summary_path = os.path.join(args.save_dir, "eval_summary.json")
    with open(summary_path, "w", encoding="utf-8") as f:
        json.dump(summary_payload, f, indent=2, ensure_ascii=False)
    print(f"\n✓ Đã lưu tổng hợp kết quả đánh giá tại: {summary_path}")


if __name__ == "__main__":
    main()
