"""Huấn luyện Double DQN + Dueling tự viết theo cùng giao thức thí nghiệm với SAC.

Ví dụ chạy thử: python train_ddqn.py --seeds 0 --steps 50000 --output runs/ddqn_pilot
Mặc định chính thức: 300.000 bước/seed, 5 seed. Không tự đánh giá trên test.

Quy ước bước: step đếm từ 1 đến total_timesteps. step <= learning_starts thì chọn ngẫu
nhiên hoàn toàn; update() khi step > learning_starts và buffer đủ một batch. epsilon(step)
dùng chính bước toàn cục này (giống train_sac.py; mã giả TH2 dùng step < N_start, lệch 1 bước).
"""

import argparse
import time
from dataclasses import asdict
from pathlib import Path

import numpy as np
import torch

from sems_rl.agents.ddqn import DDQNAgent, DDQNConfig
from sems_rl.experiments.sac_experiment import (
    ROOT, experiment_metadata, make_env, read_settings, seed_everything, write_json,
)
from train_sac import TrainingRecorder, append_csv


LOG_KEYS = ("loss", "q_mean", "td_error_mean", "epsilon")


class DDQNRecorder(TrainingRecorder):
    """Dùng lại phần validation/lưu mô hình của SAC; chỉ đổi các cột log huấn luyện."""

    def __init__(self, run_dir, settings, seed, pipeline):
        # backend "custom" -> checkpoint có đuôi .pt như SAC tự viết.
        super().__init__(run_dir, settings, seed, "custom", pipeline)

    def progress(self, step, metrics):
        row = {"step": step, "elapsed_seconds": time.perf_counter() - self.started}
        for key in LOG_KEYS:
            value = metrics.get(key)
            row[key] = value
            if value is not None and np.isfinite(value):
                self.writer.add_scalar("train/" + key, value, step)
        append_csv(self.run_dir / "training.csv", row)


def train(settings, seed, device, run_dir):
    config = DDQNConfig(**settings["agent"])
    agent = DDQNAgent(config, seed, device)
    env = make_env(settings, split="train")
    if env.observation_space.shape != (config.observation_dim,):
        raise ValueError("Số chiều quan sát trong cấu hình DDQN khác môi trường.")
    recorder = DDQNRecorder(run_dir, settings, seed, env.unwrapped.data_pipeline)
    observation, _ = env.reset(seed=seed)
    recorder.validate(agent, 0)
    training = settings["training"]
    metrics = {}

    for step in range(1, training["total_timesteps"] + 1):
        epsilon = 1.0 if step <= config.learning_starts else agent.epsilon(step)
        k = agent.select_action_index(observation, epsilon)
        # Môi trường nhận lệnh liên tục; chỉ số k chỉ nằm trong agent và buffer.
        action = np.array([agent.action_value(k)], dtype=np.float32)
        next_observation, reward, terminated, truncated, _ = env.step(action)
        agent.buffer.add(observation, k, reward, next_observation, terminated)
        observation = next_observation
        if terminated or truncated:
            observation, _ = env.reset()
        if step > config.learning_starts and agent.buffer.size >= config.batch_size:
            metrics = agent.update()
        if step % training["log_freq"] == 0:
            recorder.progress(step, {**metrics, "epsilon": agent.epsilon(step)})
        if step % training["eval_freq"] == 0:
            recorder.validate(agent, step)

    recorder.finish(agent, training["total_timesteps"])
    env.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", type=Path, default=ROOT / "configs/ddqn.yaml")
    parser.add_argument("--env-config", type=Path)
    parser.add_argument("--seeds", type=int, nargs="+")
    parser.add_argument("--steps", type=int)
    parser.add_argument("--learning-starts", type=int)
    parser.add_argument("--eval-freq", type=int)
    parser.add_argument("--eval-days", type=int)
    parser.add_argument("--device", default="cpu", choices=["cpu", "cuda"])
    parser.add_argument("--output", type=Path, default=Path("runs/ddqn"))
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
    try:
        DDQNConfig(**settings["agent"])
    except (TypeError, ValueError) as error:
        parser.error(f"Cấu hình DDQN không hợp lệ: {error}")
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
        run_dir = args.output / f"ddqn_seed{seed}"
        if run_dir.exists() and any(run_dir.iterdir()):
            parser.error(f"Thư mục đã có kết quả: {run_dir}. Hãy chọn --output khác.")
        run_dir.mkdir(parents=True, exist_ok=True)
        seed_everything(seed, training["torch_threads"])
        # Lưu tham số thực dùng sau các ghi đè ở dòng lệnh.
        settings["agent"] = asdict(DDQNConfig(**settings["agent"]))
        metadata = experiment_metadata(settings, "ddqn", seed)
        metadata["device"] = args.device
        write_json(run_dir / "metadata.json", metadata)
        print(f"Huấn luyện DDQN, seed={seed}, {training['total_timesteps']:,} bước", flush=True)
        train(settings, seed, args.device, run_dir)
        print(f"Đã lưu kết quả tại {run_dir.resolve()}", flush=True)


if __name__ == "__main__":
    main()
