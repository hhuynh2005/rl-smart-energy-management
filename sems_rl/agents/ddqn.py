"""
Thuật toán 4: Double DQN (DDQN) với kiến trúc Dueling (PyTorch).
Phụ trách chính: Nguyễn Thị Cẩm Ly (hỗ trợ wrapper & thực nghiệm: Lý Đình Sơn).
"""

import os
import sys
import random
import argparse
from collections import deque
from typing import Tuple, Dict, Any, Optional

if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
from torch.utils.tensorboard import SummaryWriter

from sems_rl.envs.microgrid_env import MicrogridBessEnv
from sems_rl.envs.wrappers import DiscretizeActionWrapper


def set_seed(seed: int) -> None:
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)


class DuelingQNetwork(nn.Module):
    """
    Mạng Dueling MLP: 2 lớp ẩn 256 nút, ReLU.
    Tách nhánh giá trị trạng thái V(s) và lợi thế hành động A(s, k):
    Q(s, k) = V(s) + A(s, k) - mean_k A(s, k)
    """

    def __init__(self, state_dim: int = 7, num_actions: int = 11, hidden_dim: int = 256):
        super().__init__()
        self.feature = nn.Sequential(
            nn.Linear(state_dim, hidden_dim),
            nn.ReLU(),
            nn.Linear(hidden_dim, hidden_dim),
            nn.ReLU(),
        )
        self.value_stream = nn.Linear(hidden_dim, 1)
        self.advantage_stream = nn.Linear(hidden_dim, num_actions)

    def forward(self, state: torch.Tensor) -> torch.Tensor:
        feat = self.feature(state)
        value = self.value_stream(feat)
        advantage = self.advantage_stream(feat)
        q_values = value + (advantage - advantage.mean(dim=-1, keepdim=True))
        return q_values


class ReplayBuffer:
    """Bộ đệm kinh nghiệm (dung lượng mặc định 200.000)."""

    def __init__(self, capacity: int = 200_000):
        self.buffer = deque(maxlen=capacity)

    def push(
        self,
        state: np.ndarray,
        action: int,
        reward: float,
        next_state: np.ndarray,
        done: bool,
    ) -> None:
        self.buffer.append((state, action, reward, next_state, float(done)))

    def sample(self, batch_size: int, device: torch.device) -> Tuple[torch.Tensor, ...]:
        batch = random.sample(self.buffer, batch_size)
        states, actions, rewards, next_states, dones = zip(*batch)
        return (
            torch.tensor(np.array(states), dtype=torch.float32, device=device),
            torch.tensor(actions, dtype=torch.long, device=device).unsqueeze(1),
            torch.tensor(rewards, dtype=torch.float32, device=device).unsqueeze(1),
            torch.tensor(np.array(next_states), dtype=torch.float32, device=device),
            torch.tensor(dones, dtype=torch.float32, device=device).unsqueeze(1),
        )

    def __len__(self) -> int:
        return len(self.buffer)


class DDQNAgent:
    """Tác tử Dueling Double DQN theo Thuật toán 4."""

    def __init__(
        self,
        state_dim: int = 7,
        num_actions: int = 11,
        lr: float = 1e-4,
        gamma: float = 0.99,
        tau: float = 0.005,
        batch_size: int = 256,
        buffer_capacity: int = 200_000,
        n_start: int = 5_000,
        eps_start: float = 1.0,
        eps_end: float = 0.05,
        n_decay: int = 50_000,
        grad_clip: float = 10.0,
        device: Optional[str] = None,
    ):
        self.state_dim = state_dim
        self.num_actions = num_actions
        self.gamma = gamma
        self.tau = tau
        self.batch_size = batch_size
        self.n_start = n_start
        self.eps_start = eps_start
        self.eps_end = eps_end
        self.n_decay = n_decay
        self.grad_clip = grad_clip

        if device is None:
            self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        else:
            self.device = torch.device(device)

        # Mạng chính và mạng đích
        self.q_net = DuelingQNetwork(state_dim, num_actions).to(self.device)
        self.target_net = DuelingQNetwork(state_dim, num_actions).to(self.device)
        self.target_net.load_state_dict(self.q_net.state_dict())
        self.target_net.eval()

        self.optimizer = torch.optim.Adam(self.q_net.parameters(), lr=lr)
        self.replay_buffer = ReplayBuffer(capacity=buffer_capacity)

    def compute_epsilon(self, step: int) -> float:
        """Giảm tuyến tính epsilon từ eps_start về eps_end trong n_decay bước."""
        return max(
            self.eps_end,
            self.eps_start - (self.eps_start - self.eps_end) * (step / self.n_decay),
        )

    @torch.no_grad()
    def select_action(self, state: np.ndarray, step: int = 0, eval_mode: bool = False) -> int:
        """Chọn hành động: tham lam khi đánh giá, epsilon-greedy khi huấn luyện."""
        if not eval_mode:
            eps = self.compute_epsilon(step)
            if step < self.n_start or random.random() < eps:
                return random.randrange(self.num_actions)

        state_tensor = torch.tensor(state, dtype=torch.float32, device=self.device).unsqueeze(0)
        q_values = self.q_net(state_tensor)
        return int(torch.argmax(q_values, dim=1).item())

    def soft_update(self) -> None:
        """Cập nhật mềm mạng đích: theta_tg <- tau * theta + (1 - tau) * theta_tg."""
        for target_param, param in zip(self.target_net.parameters(), self.q_net.parameters()):
            target_param.data.copy_(self.tau * param.data + (1.0 - self.tau) * target_param.data)

    def update(self) -> Optional[float]:
        """Cập nhật mạng chính bằng Double DQN target & Huber loss."""
        if len(self.replay_buffer) < self.batch_size:
            return None

        states, actions, rewards, next_states, dones = self.replay_buffer.sample(
            self.batch_size, self.device
        )

        # Q(s, k) hiện tại
        current_q = self.q_net(states).gather(1, actions)

        # Đích Double DQN: chọn hành động bằng mạng chính, đánh giá bằng mạng đích
        with torch.no_grad():
            best_next_actions = self.q_net(next_states).argmax(dim=1, keepdim=True)
            next_q_target = self.target_net(next_states).gather(1, best_next_actions)
            target_q = rewards + self.gamma * (1.0 - dones) * next_q_target

        # Hàm mất mát Huber + cắt gradient theo chuẩn 10
        loss = F.huber_loss(current_q, target_q)
        self.optimizer.zero_grad()
        loss.backward()
        torch.nn.utils.clip_grad_norm_(self.q_net.parameters(), self.grad_clip)
        self.optimizer.step()

        # Cập nhật mềm mạng đích
        self.soft_update()
        return float(loss.item())

    def save(self, path: str) -> None:
        os.makedirs(os.path.dirname(path), exist_ok=True)
        torch.save(
            {
                "q_net_state_dict": self.q_net.state_dict(),
                "target_net_state_dict": self.target_net.state_dict(),
                "num_actions": self.num_actions,
                "state_dim": self.state_dim,
            },
            path,
        )

    def load(self, path: str) -> None:
        checkpoint = torch.load(path, map_location=self.device)
        self.q_net.load_state_dict(checkpoint["q_net_state_dict"])
        self.target_net.load_state_dict(checkpoint["target_net_state_dict"])


def evaluate_agent(agent: DDQNAgent, num_actions: int = 11, num_episodes: int = 10) -> float:
    """Đánh giá chính sách tất định trên tập kiểm định (val)."""
    base_env = MicrogridBessEnv(split="val")
    env = DiscretizeActionWrapper(base_env, num_actions=num_actions)
    total_rewards = []

    for day_idx in range(num_episodes):
        obs, _ = env.reset(options={"split": "val", "day_offset": day_idx})
        ep_reward = 0.0
        for _ in range(96):
            action = agent.select_action(obs, eval_mode=True)
            obs, reward, terminated, truncated, _ = env.step(action)
            ep_reward += reward
            if terminated or truncated:
                break
        total_rewards.append(ep_reward)

    env.close()
    return float(np.mean(total_rewards))


def train(
    total_steps: int = 300_000,
    num_actions: int = 11,
    seed: int = 0,
    eval_freq: int = 10_000,
    save_dir: str = "checkpoints/ddqn",
    log_dir: str = "runs/ddqn",
) -> DDQNAgent:
    set_seed(seed)

    base_env = MicrogridBessEnv(split="train")
    env = DiscretizeActionWrapper(base_env, num_actions=num_actions)

    state_dim = env.observation_space.shape[0]
    agent = DDQNAgent(state_dim=state_dim, num_actions=num_actions)

    run_name = f"ddqn_K{num_actions}_seed{seed}"
    writer = SummaryWriter(log_dir=os.path.join(log_dir, run_name))
    best_val_reward = -float("inf")

    obs, _ = env.reset(seed=seed)
    ep_reward = 0.0
    ep_count = 0
    recent_losses = []

    print(f"Bắt đầu huấn luyện {run_name} trong {total_steps} bước trên thiết bị: {agent.device}")

    for step in range(1, total_steps + 1):
        action = agent.select_action(obs, step=step, eval_mode=False)
        next_obs, reward, terminated, truncated, _ = env.step(action)

        # Lưu ý: chỉ truyền terminated vào done (không truyền truncated cuối ngày)
        agent.replay_buffer.push(obs, action, reward, next_obs, terminated)
        obs = next_obs
        ep_reward += reward

        if step >= agent.n_start:
            loss = agent.update()
            if loss is not None:
                recent_losses.append(loss)

        if terminated or truncated:
            ep_count += 1
            writer.add_scalar("train/episode_reward", ep_reward, step)
            writer.add_scalar("train/epsilon", agent.compute_epsilon(step), step)
            if recent_losses:
                writer.add_scalar("train/loss", float(np.mean(recent_losses)), step)
                recent_losses.clear()

            obs, _ = env.reset()
            ep_reward = 0.0

        # Đánh giá định kỳ trên tập val và lưu checkpoint tốt nhất
        if step % eval_freq == 0:
            val_reward = evaluate_agent(agent, num_actions=num_actions, num_episodes=10)
            writer.add_scalar("val/mean_reward", val_reward, step)
            print(
                f"[Step {step:>6}/{total_steps}] Ep: {ep_count:>4} | "
                f"Eps: {agent.compute_epsilon(step):.3f} | Val Reward: {val_reward:.2f}"
            )
            if val_reward > best_val_reward:
                best_val_reward = val_reward
                agent.save(os.path.join(save_dir, f"{run_name}_best.pt"))

    agent.save(os.path.join(save_dir, f"{run_name}_last.pt"))
    writer.close()
    env.close()
    print(f"Hoàn tất huấn luyện! Checkpoint tốt nhất đạt Val Reward = {best_val_reward:.2f}")
    return agent


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Huấn luyện Dueling Double DQN cho SEMS-RL")
    parser.add_argument("--steps", type=int, default=50_000, help="Tổng số bước huấn luyện")
    parser.add_argument("--k", type=int, default=11, help="Số mức rời rạc hóa K (5, 11, 21)")
    parser.add_argument("--seed", type=int, default=0, help="Hạt giống ngẫu nhiên")
    parser.add_argument("--eval-freq", type=int, default=5_000, help="Chu kỳ đánh giá trên tập val")
    args = parser.parse_args()

    train(
        total_steps=args.steps,
        num_actions=args.k,
        seed=args.seed,
        eval_freq=args.eval_freq,
    )