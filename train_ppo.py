"""Huấn luyện PPO (Stable-Baselines3) cho bài toán quản lý năng lượng BESS & Solar PV.

Ví dụ chạy nhanh (smoke test):
  python train_ppo.py --config configs/ppo_sde_stable.yaml --seeds 0 --steps 4000 --eval-freq 2000 --eval-days 5 --device cpu --output runs/ppo_smoke

Huấn luyện chính thức (300,000 bước x 5 seeds, chọn checkpoint mỗi 20,000 bước):
  python train_ppo.py --config configs/ppo_sde_stable.yaml --eval-freq 20000 --device cpu --output runs/ppo_final
"""

import argparse
import csv
from pathlib import Path
import sys
import time
from typing import Any, Dict

# Đảm bảo console Windows xử lý UTF-8
for stream in (sys.stdout, sys.stderr):
    if hasattr(stream, "reconfigure"):
        try:
            stream.reconfigure(encoding="utf-8")
        except Exception:
            pass

import numpy as np
import torch
from torch.utils.tensorboard import SummaryWriter

from sems_rl.agents.ppo import PPOAgentWrapper, PPOConfig, linear_lr_schedule
from sems_rl.experiments.protocol import (
    evaluate_policy,
    experiment_metadata,
    format_rel_path,
    make_env,
    plot_learning_curve,
    read_settings,
    scenario_days,
    seed_everything,
    summarize_days,
    write_json,
)


def append_csv(path: Path, row: Dict[str, Any]) -> None:
    """Ghi nối từng dòng vào CSV để theo dõi tiến trình theo thời gian thực."""
    exists = path.exists()
    with path.open("a", newline="", encoding="utf-8") as stream:
        writer = csv.DictWriter(stream, fieldnames=list(row.keys()))
        if not exists:
            writer.writeheader()
        writer.writerow(row)


def check_spaces(env: Any, config: PPOConfig) -> None:
    """Kiểm tra tính khớp giữa không gian quan sát/hành động của môi trường và PPOConfig."""
    if env.observation_space.shape != (config.observation_dim,):
        raise ValueError(
            f"Số chiều quan sát ({env.observation_space.shape}) khác cấu hình ({config.observation_dim})."
        )
    if env.action_space.shape != (config.action_dim,):
        raise ValueError(
            f"Số chiều hành động ({env.action_space.shape}) khác cấu hình ({config.action_dim})."
        )


def resolve_device(requested: str) -> str:
    """Xác định thiết bị PyTorch (auto ưu tiên CUDA nếu khả dụng)."""
    if requested == "auto":
        return "cuda" if torch.cuda.is_available() else "cpu"
    if requested == "cuda" and not torch.cuda.is_available():
        raise RuntimeError("Không phát hiện GPU CUDA khả dụng; hãy dùng --device cpu.")
    return requested


class TrainingRecorder:
    """Ghi nhận training metrics, đánh giá định kỳ trên validation và lưu best.zip."""

    def __init__(self, run_dir: Path, settings: Dict[str, Any], seed: int, pipeline: Any):
        self.run_dir = Path(run_dir)
        self.settings = settings
        self.seed = seed
        self.writer = SummaryWriter(str(self.run_dir / "tensorboard"))
        self.eval_env = make_env(settings, split="val", scenario="S5", data_pipeline=pipeline)
        self.days = scenario_days(
            self.eval_env, "val", "S5", settings["training"]["eval_days"]
        )
        self.best_score = float("inf")
        self.best_step = 0
        self.last_eval_step = -1
        self.started = time.perf_counter()

    def validate(self, policy_wrapper: PPOAgentWrapper, step: int) -> None:
        """Đánh giá deterministic trên tập Validation và cập nhật checkpoint tốt nhất."""
        if step == self.last_eval_step:
            return
        frame, _ = evaluate_policy(
            policy_wrapper,
            self.eval_env,
            self.days,
            seed=0,
            initial_soc=float(self.settings["evaluation"]["initial_soc"]),
        )
        summary = summarize_days(frame)
        score = summary["adjusted_total_cost_vnd_mean"]
        append_csv(self.run_dir / "validation.csv", {"step": int(step), **summary})
        for name, value in summary.items():
            if np.isfinite(value):
                self.writer.add_scalar(f"validation/{name}", value, step)
        if score < self.best_score:
            self.best_score = score
            self.best_step = int(step)
            policy_wrapper.save(self.run_dir / "best.zip")
            frame.to_csv(self.run_dir / "best_validation_days.csv", index=False)
        self.last_eval_step = int(step)
        self.writer.flush()
        print(
            f"  Bước {step:>7,} | Val thưởng={summary['episode_reward_mean']:.3f}"
            f" | Tiền điện ĐC={summary['adjusted_electric_cost_vnd_mean']:,.0f} đ"
            f" | Tổng ĐC={score:,.0f} đ | Tốt nhất tại {self.best_step:,}",
            flush=True,
        )

    def log_train_metrics(self, step: int, metrics: Dict[str, Any]) -> None:
        """Ghi log quá trình tối ưu PPO vào `training.csv` và TensorBoard."""
        elapsed = time.perf_counter() - self.started
        row: Dict[str, Any] = {"step": int(step), "elapsed_seconds": round(elapsed, 3)}
        keys = (
            "rollout/ep_rew_mean",
            "rollout/ep_len_mean",
            "train/policy_gradient_loss",
            "train/value_loss",
            "train/entropy_loss",
            "train/approx_kl",
            "train/clip_fraction",
            "train/explained_variance",
            "train/std",
            "train/learning_rate",
        )
        for key in keys:
            col = key.replace("/", "_")
            val = metrics.get(key)
            row[col] = float(val) if val is not None and np.isfinite(val) else None
            if row[col] is not None:
                self.writer.add_scalar(key, row[col], step)
        append_csv(self.run_dir / "training.csv", row)

    def finish(self, policy_wrapper: PPOAgentWrapper, step: int) -> None:
        """Hoàn tất huấn luyện, lưu `last.zip`, `training_summary.json` và vẽ learning curve."""
        if not (self.run_dir / "training.csv").exists():
            self.log_train_metrics(step, {})
        self.validate(policy_wrapper, step)
        policy_wrapper.save(self.run_dir / "last.zip")
        write_json(
            self.run_dir / "training_summary.json",
            {
                "algorithm": "ppo",
                "backend": "sb3",
                "total_timesteps": int(step),
                "best_step": int(self.best_step),
                "best_validation_adjusted_total_cost_vnd": float(self.best_score),
                "validation_days": len(self.days),
                "training_seed": int(self.seed),
                "elapsed_seconds": float(time.perf_counter() - self.started),
                "test_used_for_selection": False,
                "resume_supported": False,
            },
        )
        self.writer.close()
        self.eval_env.close()
        plot_learning_curve(self.run_dir)


def make_train_vec_env(settings: Dict[str, Any], config: PPOConfig, seed: int):
    """Tạo DummyVecEnv n_envs song song chia sẻ DataPipeline cho tập train."""
    from stable_baselines3.common.monitor import Monitor
    from stable_baselines3.common.vec_env import DummyVecEnv, VecNormalize

    probe = make_env(settings, split="train", scenario="S5")
    check_spaces(probe, config)
    shared_pipeline = probe.unwrapped.data_pipeline
    probe.close()

    def _make_one(rank: int):
        def _init():
            env = make_env(
                settings,
                split="train",
                scenario="S5",
                data_pipeline=shared_pipeline,
            )
            env.reset(seed=seed + rank)
            return Monitor(env)

        return _init

    vec_env = DummyVecEnv([_make_one(i) for i in range(config.n_envs)])
    if config.normalize_reward:
        vec_env = VecNormalize(vec_env, norm_obs=False, norm_reward=True, gamma=config.gamma)
    return vec_env, shared_pipeline


def train_ppo(settings: Dict[str, Any], seed: int, device: str, run_dir: Path) -> None:
    """Huấn luyện 1 seed PPO-Clip bằng Stable-Baselines3."""
    from stable_baselines3 import PPO
    from stable_baselines3.common.callbacks import BaseCallback
    from stable_baselines3.common.logger import KVWriter, Logger

    config = PPOConfig(**settings["agent"])
    training = settings["training"]
    vec_env, shared_pipeline = make_train_vec_env(settings, config, seed)
    recorder = TrainingRecorder(run_dir, settings, seed, shared_pipeline)

    class RecorderKVWriter(KVWriter):
        def write(self, key_values, key_excluded, step):
            recorder.log_train_metrics(step, key_values)

        def close(self):
            pass

    lr_value = (
        linear_lr_schedule(config.learning_rate)
        if config.lr_schedule.lower() == "linear"
        else config.learning_rate
    )

    model = PPO(
        policy="MlpPolicy",
        env=vec_env,
        learning_rate=lr_value,
        n_steps=config.n_steps,
        batch_size=config.batch_size,
        n_epochs=config.n_epochs,
        gamma=config.gamma,
        gae_lambda=config.gae_lambda,
        clip_range=config.clip_range,
        ent_coef=config.ent_coef,
        vf_coef=config.vf_coef,
        max_grad_norm=config.max_grad_norm,
        target_kl=config.target_kl,
        use_sde=config.use_sde,
        sde_sample_freq=config.sde_sample_freq,
        policy_kwargs={
            "net_arch": dict(config.net_arch),
            "activation_fn": config.activation_fn(),
            "log_std_init": config.log_std_init,
        },
        seed=seed,
        device=device,
        verbose=0,
    )
    model.set_logger(Logger(folder=None, output_formats=[RecorderKVWriter()]))

    wrapper = PPOAgentWrapper(model, clip_action=config.clip_action_eval)
    eval_freq = int(training["eval_freq"])

    class ValidationCallback(BaseCallback):
        def __init__(self):
            super().__init__()
            self.next_eval_step = eval_freq

        def _on_step(self) -> bool:
            while self.num_timesteps >= self.next_eval_step:
                recorder.validate(wrapper, self.num_timesteps)
                self.next_eval_step += eval_freq
            return True

    recorder.validate(wrapper, 0)
    model.learn(
        total_timesteps=int(training["total_timesteps"]),
        callback=ValidationCallback(),
    )
    if config.normalize_reward:
        vec_env.save(str(run_dir / "vecnormalize.pkl"))
    recorder.finish(wrapper, model.num_timesteps)
    vec_env.close()


def main() -> None:
    """Điểm vào dòng lệnh cho huấn luyện đa seed PPO."""
    parser = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("--config", type=Path, default=Path("configs/ppo.yaml"), help="Tệp cấu hình PPO YAML")
    parser.add_argument("--env-config", type=Path, help="Tệp cấu hình môi trường (mặc định sems_rl/config.yaml)")
    parser.add_argument("--seeds", type=int, nargs="+", help="Danh sách seed huấn luyện (vd: 0 1 2 3 4)")
    parser.add_argument("--steps", type=int, help="Tổng số bước huấn luyện mỗi seed")
    parser.add_argument("--n-envs", type=int, help="Số môi trường song song trong DummyVecEnv")
    parser.add_argument("--eval-freq", type=int, help="Chu kỳ bước đánh giá trên tập Validation")
    parser.add_argument("--eval-days", type=int, help="Số ngày Validation đánh giá mỗi lần")
    parser.add_argument("--device", default="auto", choices=["auto", "cpu", "cuda"], help="Thiết bị chạy PyTorch/SB3")
    parser.add_argument("--output", type=Path, default=Path("runs/ppo"), help="Thư mục gốc lưu kết quả từng seed")
    args = parser.parse_args()

    settings = read_settings(args.config, args.env_config, default_config="configs/ppo.yaml")
    if args.steps is not None:
        settings["training"]["total_timesteps"] = args.steps
    if args.eval_freq is not None:
        settings["training"]["eval_freq"] = args.eval_freq
    if args.eval_days is not None:
        settings["training"]["eval_days"] = args.eval_days
    if args.seeds is not None:
        settings["training"]["seeds"] = args.seeds
    if args.n_envs is not None:
        settings["agent"]["n_envs"] = args.n_envs

    config = PPOConfig(**settings["agent"])
    training = settings["training"]
    if any(training[k] < 1 for k in ("total_timesteps", "eval_freq", "eval_days", "log_freq", "torch_threads")):
        parser.error("Số bước, tần suất, số ngày và số luồng phải dương.")
    if len(set(training["seeds"])) != len(training["seeds"]) or min(training["seeds"]) < 0:
        parser.error("Seed phải không âm và không trùng lặp.")

    device = resolve_device(args.device)
    settings["agent"] = config.to_dict()

    for seed in training["seeds"]:
        run_dir = args.output / f"ppo_seed{seed}"
        if run_dir.exists() and any(run_dir.iterdir()):
            parser.error(f"Thư mục đã có kết quả: {run_dir}. Hãy chọn --output khác.")
        run_dir.mkdir(parents=True, exist_ok=True)
        seed_everything(seed, training["torch_threads"])
        metadata = experiment_metadata(settings, method="ppo", backend="sb3", seed=seed)
        metadata["device"] = device
        write_json(run_dir / "metadata.json", metadata)
        print(
            f"[PPO] Seed={seed} | Device={device} | Steps={training['total_timesteps']:,} "
            f"| n_envs={config.n_envs} | n_steps={config.n_steps}",
            flush=True,
        )
        train_ppo(settings, seed, device, run_dir)
        print(f"Đã lưu kết quả tại {format_rel_path(run_dir)}", flush=True)


if __name__ == "__main__":
    main()
