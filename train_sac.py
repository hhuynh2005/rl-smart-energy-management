"""Huấn luyện SAC tự viết hoặc SAC của SB3 với cùng cấu hình thí nghiệm.

Ví dụ chạy thử: python train_sac.py --backend custom --seeds 0 --steps 50000
Mặc định chính thức: 300.000 bước/seed, 5 seed. Không tự đánh giá trên test.
"""

import argparse
import csv
import time
from dataclasses import asdict
from pathlib import Path

import numpy as np
import torch
try:
    from torch.utils.tensorboard import SummaryWriter
except (ImportError, ModuleNotFoundError):
    class SummaryWriter:  # type: ignore
        def __init__(self, *args, **kwargs): pass
        def add_scalar(self, *args, **kwargs): pass
        def close(self): pass
        def flush(self): pass

from sems_rl.agents.sac import SACAgent, SACConfig
from sems_rl.experiments.sac_experiment import (
    evaluate_policy, experiment_metadata, make_env, plot_learning_curve,
    read_settings, scenario_days, seed_everything, summarize_days, write_json,
)


def append_csv(path, row):
    """Mỗi bản ghi ghi ngay xuống đĩa để vẫn xem được log khi đang huấn luyện."""
    exists = path.exists()
    with path.open("a", newline="", encoding="utf-8") as stream:
        writer = csv.DictWriter(stream, fieldnames=list(row))
        if not exists:
            writer.writeheader()
        writer.writerow(row)


def check_spaces(env, config):
    if env.observation_space.shape != (config.observation_dim,):
        raise ValueError("Số chiều quan sát trong cấu hình SAC khác môi trường.")
    if env.action_space.shape != (config.action_dim,):
        raise ValueError("Số chiều hành động trong cấu hình SAC khác môi trường.")


class TrainingRecorder:
    """Đánh giá trên validation, lưu mô hình tốt nhất và log cho cả hai bản SAC."""

    def __init__(self, run_dir, settings, seed, backend, pipeline):
        self.run_dir = run_dir
        self.settings = settings
        self.seed = seed
        self.extension = ".pt" if backend == "custom" else ".zip"
        self.writer = SummaryWriter(str(run_dir / "tensorboard"))
        self.eval_env = make_env(settings, split="val", data_pipeline=pipeline)
        self.days = scenario_days(
            self.eval_env, "val", "S5", settings["training"]["eval_days"]
        )
        self.best_score = float("inf")
        self.best_step = 0
        self.last_eval_step = -1
        self.started = time.perf_counter()

    def validate(self, model, step):
        if step == self.last_eval_step:
            return
        frame, _ = evaluate_policy(
            model, self.eval_env, self.days, seed=0,
            initial_soc=self.settings["evaluation"]["initial_soc"],
        )
        summary = summarize_days(frame)
        score = summary["adjusted_total_cost_vnd_mean"]
        append_csv(self.run_dir / "validation.csv", {"step": step, **summary})
        for name, value in summary.items():
            self.writer.add_scalar("validation/" + name, value, step)
        if score < self.best_score:
            self.best_score, self.best_step = score, step
            model.save(self.run_dir / ("best" + self.extension))
            frame.to_csv(self.run_dir / "best_validation_days.csv", index=False)
        self.last_eval_step = step
        self.writer.flush()
        print(
            f"  Bước {step:>7,} | Val thưởng={summary['episode_reward_mean']:.3f}"
            f" | Chi phí điều chỉnh={score:,.0f} đ"
            f" | Tốt nhất tại {self.best_step:,}", flush=True
        )

    def progress(self, step, metrics):
        elapsed = time.perf_counter() - self.started
        row = {"step": step, "elapsed_seconds": elapsed}
        for key in ("critic_loss", "actor_loss", "alpha_loss", "alpha", "q_mean"):
            value = metrics.get(key)
            row[key] = value
            if value is not None and np.isfinite(value):
                self.writer.add_scalar("train/" + key, value, step)
        append_csv(self.run_dir / "training.csv", row)

    def finish(self, model, step):
        if not (self.run_dir / "training.csv").exists():
            self.progress(step, {})
        self.validate(model, step)
        model.save(self.run_dir / ("last" + self.extension))
        write_json(self.run_dir / "training_summary.json", {
            "total_timesteps": step, "best_step": self.best_step,
            "best_validation_adjusted_total_cost_vnd": self.best_score,
            "validation_days": len(self.days), "training_seed": self.seed,
            "elapsed_seconds": time.perf_counter() - self.started,
            "test_used_for_selection": False,
            "resume_supported": False,
        })
        self.writer.close()
        self.eval_env.close()
        plot_learning_curve(self.run_dir)


def train_custom(settings, seed, device, run_dir):
    config = SACConfig(**settings["agent"])
    model = SACAgent(config, seed, device)
    env = make_env(settings, split="train")
    check_spaces(env, config)
    env.action_space.seed(seed)
    recorder = TrainingRecorder(run_dir, settings, seed, "custom", env.unwrapped.data_pipeline)
    observation, _ = env.reset(seed=seed)
    recorder.validate(model, 0)
    training = settings["training"]
    metrics = {}

    for step in range(1, training["total_timesteps"] + 1):
        if step <= config.learning_starts:
            action = env.action_space.sample()
        else:
            action, _ = model.predict(observation, deterministic=False)
        next_observation, reward, terminated, truncated, _ = env.step(action)
        # Lưu trạng thái cuối TRƯỚC reset. Chỉ terminated mới tắt bootstrap.
        model.buffer.add(observation, action, reward, next_observation, terminated)
        observation = next_observation
        if terminated or truncated:
            observation, _ = env.reset()
        if step > config.learning_starts and model.buffer.size >= config.batch_size:
            metrics = model.update()
        if step % training["log_freq"] == 0:
            recorder.progress(step, metrics)
        if step % training["eval_freq"] == 0:
            recorder.validate(model, step)

    recorder.finish(model, training["total_timesteps"])
    env.close()


def train_sb3(settings, seed, device, run_dir):
    from stable_baselines3 import SAC
    from stable_baselines3.common.callbacks import BaseCallback

    config = SACConfig(**settings["agent"])
    env = make_env(settings, split="train")
    check_spaces(env, config)
    recorder = TrainingRecorder(run_dir, settings, seed, "sb3", env.unwrapped.data_pipeline)
    model = SAC(
        "MlpPolicy", env, learning_rate=config.learning_rate,
        buffer_size=config.buffer_size, learning_starts=config.learning_starts,
        batch_size=config.batch_size, tau=config.tau, gamma=config.gamma,
        ent_coef=f"auto_{config.initial_alpha}", target_entropy=config.target_entropy,
        train_freq=1, gradient_steps=1, seed=seed, device=device, verbose=0,
        policy_kwargs={"net_arch": [config.hidden_size, config.hidden_size]},
    )
    training = settings["training"]

    class RecorderCallback(BaseCallback):
        def _on_step(self):
            if self.num_timesteps % training["log_freq"] == 0:
                values = self.model.logger.name_to_value
                recorder.progress(self.num_timesteps, {
                    "critic_loss": values.get("train/critic_loss"),
                    "actor_loss": values.get("train/actor_loss"),
                    "alpha_loss": values.get("train/ent_coef_loss"),
                    "alpha": values.get("train/ent_coef"),
                })
            if self.num_timesteps % training["eval_freq"] == 0:
                recorder.validate(self.model, self.num_timesteps)
            return True

    recorder.validate(model, 0)
    model.learn(total_timesteps=training["total_timesteps"], callback=RecorderCallback())
    recorder.finish(model, model.num_timesteps)
    env.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--backend", choices=["custom", "sb3"], default="custom")
    parser.add_argument("--config", type=Path)
    parser.add_argument("--env-config", type=Path)
    parser.add_argument("--seeds", type=int, nargs="+")
    parser.add_argument("--steps", type=int)
    parser.add_argument("--learning-starts", type=int)
    parser.add_argument("--eval-freq", type=int)
    parser.add_argument("--eval-days", type=int)
    parser.add_argument("--device", default="cpu", choices=["cpu", "cuda"])
    parser.add_argument("--output", type=Path, default=Path("runs/sac"))
    args = parser.parse_args()

    settings = read_settings(args.config, args.env_config)
    for argument, key in ((args.steps, "total_timesteps"), (args.eval_freq, "eval_freq"),
                          (args.eval_days, "eval_days")):
        if argument is not None:
            settings["training"][key] = argument
    if args.seeds is not None:
        settings["training"]["seeds"] = args.seeds
    if args.learning_starts is not None:
        settings["agent"]["learning_starts"] = args.learning_starts
    SACConfig(**settings["agent"])
    training = settings["training"]
    if any(training[key] < 1 for key in (
        "total_timesteps", "eval_freq", "eval_days", "log_freq", "torch_threads"
    )):
        parser.error("Số bước, tần suất, số ngày và số luồng phải dương.")
    if len(set(training["seeds"])) != len(training["seeds"]) or min(training["seeds"]) < 0:
        parser.error("Seed phải không âm và không lặp.")
    if args.device == "cuda" and not torch.cuda.is_available():
        parser.error("Không có CUDA; hãy dùng --device cpu.")

    for seed in training["seeds"]:
        run_dir = args.output / f"{args.backend}_seed{seed}"
        if run_dir.exists() and any(run_dir.iterdir()):
            parser.error(f"Thư mục đã có kết quả: {run_dir}. Hãy chọn --output khác.")
        run_dir.mkdir(parents=True, exist_ok=True)
        seed_everything(seed, training["torch_threads"])
        # Lưu cả tham số thực dùng sau các ghi đè ở dòng lệnh.
        settings["agent"] = asdict(SACConfig(**settings["agent"]))
        metadata = experiment_metadata(settings, args.backend, seed)
        metadata["device"] = args.device
        write_json(run_dir / "metadata.json", metadata)
        print(f"Huấn luyện {args.backend}, seed={seed}, {training['total_timesteps']:,} bước", flush=True)
        trainer = train_custom if args.backend == "custom" else train_sb3
        trainer(settings, seed, args.device, run_dir)
        print(f"Đã lưu kết quả tại {run_dir.resolve()}", flush=True)


if __name__ == "__main__":
    main()
