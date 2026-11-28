"""
Twin Delayed Deep Deterministic Policy Gradient (TD3) Agent for SEMS-RL.
Cài đặt lõi thuật toán TD3 bằng PyTorch tương thích với MicrogridBessEnv v1.0.
Bám sát đặc tả trong Bao_cao_TD3_Pham_Quang_Anh.pdf (Nhóm 7 - 65KTPM).
"""

import copy
import os
import random
from typing import Any, Dict, Optional, Tuple

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F


class Actor(nn.Module):
    """Mạng Actor tất định pi_phi(s) -> [-1.0, 1.0]."""

    def __init__(self, state_dim: int = 7, action_dim: int = 1, hidden_dim: int = 256):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(state_dim, hidden_dim),
            nn.ReLU(),
            nn.Linear(hidden_dim, hidden_dim),
            nn.ReLU(),
            nn.Linear(hidden_dim, action_dim),
            nn.Tanh(),
        )

    def forward(self, state: torch.Tensor) -> torch.Tensor:
        return self.net(state)


class Critic(nn.Module):
    """Hai mạng Critic độc lập Q_theta1(s, a) và Q_theta2(s, a) cho Clipped Double Q-Learning."""

    def __init__(self, state_dim: int = 7, action_dim: int = 1, hidden_dim: int = 256):
        super().__init__()
        in_dim = state_dim + action_dim
        self.q1 = nn.Sequential(
            nn.Linear(in_dim, hidden_dim),
            nn.ReLU(),
            nn.Linear(hidden_dim, hidden_dim),
            nn.ReLU(),
            nn.Linear(hidden_dim, 1),
        )
        self.q2 = nn.Sequential(
            nn.Linear(in_dim, hidden_dim),
            nn.ReLU(),
            nn.Linear(hidden_dim, hidden_dim),
            nn.ReLU(),
            nn.Linear(hidden_dim, 1),
        )

    def forward(self, state: torch.Tensor, action: torch.Tensor) -> Tuple[torch.Tensor, torch.Tensor]:
        sa = torch.cat([state, action], dim=-1)
        return self.q1(sa), self.q2(sa)

    def q1_forward(self, state: torch.Tensor, action: torch.Tensor) -> torch.Tensor:
        sa = torch.cat([state, action], dim=-1)
        return self.q1(sa)


class ReplayBuffer:
    """Bộ nhớ đệm Replay Buffer dạng vòng (Ring Buffer) lưu (s, a, r, s', terminated)."""

    def __init__(
        self,
        state_dim: int = 7,
        action_dim: int = 1,
        max_size: int = 100_000,
        seed: Optional[int] = None,
    ):
        self.max_size = int(max_size)
        self.ptr = 0
        self.size = 0

        self.states = np.zeros((self.max_size, state_dim), dtype=np.float32)
        self.actions = np.zeros((self.max_size, action_dim), dtype=np.float32)
        self.rewards = np.zeros((self.max_size, 1), dtype=np.float32)
        self.next_states = np.zeros((self.max_size, state_dim), dtype=np.float32)
        self.dones = np.zeros((self.max_size, 1), dtype=np.float32)

        self.rng = np.random.default_rng(seed)

    def add(
        self,
        state: np.ndarray,
        action: np.ndarray,
        reward: float,
        next_state: np.ndarray,
        terminated: bool,
    ) -> None:
        self.states[self.ptr] = np.asarray(state, dtype=np.float32)
        self.actions[self.ptr] = np.asarray(action, dtype=np.float32).reshape(-1)
        self.rewards[self.ptr] = float(reward)
        self.next_states[self.ptr] = np.asarray(next_state, dtype=np.float32)
        # Chỉ dùng cờ terminated (không dùng truncated) để bootstrap qua bước 96
        self.dones[self.ptr] = float(bool(terminated))

        self.ptr = (self.ptr + 1) % self.max_size
        self.size = min(self.size + 1, self.max_size)

    def sample(self, batch_size: int) -> Tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
        ind = self.rng.integers(0, self.size, size=batch_size)
        return (
            self.states[ind],
            self.actions[ind],
            self.rewards[ind],
            self.next_states[ind],
            self.dones[ind],
        )

    def __len__(self) -> int:
        return self.size


class TD3Agent:
    """
    Tác tử TD3 với 3 kỹ thuật cốt lõi:
    1. Clipped Double Q-Learning (min của 2 Target Critic)
    2. Delayed Policy Updates (cập nhật Actor & Target trễ mỗi policy_delay bước)
    3. Target Policy Smoothing (làm mượt hành động đích bằng nhiễu Gaussian cắt ngưỡng)
    """

    def __init__(
        self,
        state_dim: int = 7,
        action_dim: int = 1,
        gamma: float = 0.99,
        tau: float = 0.005,
        lr: float = 3e-4,
        policy_noise: float = 0.2,
        noise_clip: float = 0.5,
        policy_delay: int = 2,
        exploration_noise: float = 0.1,
        batch_size: int = 256,
        buffer_size: int = 100_000,
        hidden_dim: int = 256,
        device: str = "auto",
        seed: Optional[int] = None,
    ):
        self.state_dim = int(state_dim)
        self.action_dim = int(action_dim)
        self.gamma = float(gamma)
        self.tau = float(tau)
        self.lr = float(lr)
        self.policy_noise = float(policy_noise)
        self.noise_clip = float(noise_clip)
        self.policy_delay = int(policy_delay)
        self.exploration_noise = float(exploration_noise)
        self.batch_size = int(batch_size)
        self.buffer_size = int(buffer_size)
        self.hidden_dim = int(hidden_dim)
        self.seed = seed

        if seed is not None:
            random.seed(seed)
            np.random.seed(seed)
            torch.manual_seed(seed)
            if torch.cuda.is_available():
                torch.cuda.manual_seed_all(seed)

        if device == "auto":
            self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        else:
            self.device = torch.device(device)

        self.rng = np.random.default_rng(seed)

        self.actor = Actor(self.state_dim, self.action_dim, self.hidden_dim).to(self.device)
        self.actor_target = copy.deepcopy(self.actor).to(self.device)
        self.actor_optimizer = torch.optim.Adam(self.actor.parameters(), lr=self.lr)

        self.critic = Critic(self.state_dim, self.action_dim, self.hidden_dim).to(self.device)
        self.critic_target = copy.deepcopy(self.critic).to(self.device)
        self.critic_optimizer = torch.optim.Adam(self.critic.parameters(), lr=self.lr)

        self.replay_buffer = ReplayBuffer(
            state_dim=self.state_dim,
            action_dim=self.action_dim,
            max_size=self.buffer_size,
            seed=seed,
        )
        self.total_it = 0

    @torch.no_grad()
    def select_action(self, state: np.ndarray, add_noise: bool = False) -> np.ndarray:
        """Chọn hành động liên tục trong [-1.0, 1.0], có thể cộng nhiễu thăm dò Gaussian."""
        state_tensor = torch.as_tensor(state, dtype=torch.float32, device=self.device).reshape(1, -1)
        action = self.actor(state_tensor).cpu().numpy().reshape(self.action_dim)
        if add_noise:
            noise = self.rng.normal(0.0, self.exploration_noise, size=self.action_dim)
            action = action + noise
        return np.clip(action, -1.0, 1.0).astype(np.float32)

    def store_transition(
        self,
        state: np.ndarray,
        action: np.ndarray,
        reward: float,
        next_state: np.ndarray,
        terminated: bool,
    ) -> None:
        """Lưu chuyển tiếp vào Replay Buffer (chỉ dùng cờ terminated)."""
        self.replay_buffer.add(state, action, reward, next_state, terminated)

    def update(self) -> Dict[str, float]:
        """Thực hiện 1 bước cập nhật Critic và (trễ mỗi policy_delay bước) cập nhật Actor + Target."""
        if len(self.replay_buffer) < self.batch_size:
            return {}

        self.total_it += 1

        states, actions, rewards, next_states, dones = self.replay_buffer.sample(self.batch_size)
        state_t = torch.as_tensor(states, dtype=torch.float32, device=self.device)
        action_t = torch.as_tensor(actions, dtype=torch.float32, device=self.device)
        reward_t = torch.as_tensor(rewards, dtype=torch.float32, device=self.device)
        next_state_t = torch.as_tensor(next_states, dtype=torch.float32, device=self.device)
        done_t = torch.as_tensor(dones, dtype=torch.float32, device=self.device)

        with torch.no_grad():
            # 1. Target Policy Smoothing
            noise = torch.randn_like(action_t) * self.policy_noise
            noise = torch.clamp(noise, -self.noise_clip, self.noise_clip)
            next_action = torch.clamp(self.actor_target(next_state_t) + noise, -1.0, 1.0)

            # 2. Clipped Double Q-Learning
            target_q1, target_q2 = self.critic_target(next_state_t, next_action)
            target_q = reward_t + (1.0 - done_t) * self.gamma * torch.min(target_q1, target_q2)

        # Cập nhật hai mạng Critic theo MSE
        current_q1, current_q2 = self.critic(state_t, action_t)
        critic_loss = F.mse_loss(current_q1, target_q) + F.mse_loss(current_q2, target_q)

        self.critic_optimizer.zero_grad()
        critic_loss.backward()
        self.critic_optimizer.step()

        metrics: Dict[str, float] = {
            "critic_loss": float(critic_loss.item()),
            "q1_mean": float(current_q1.mean().item()),
            "q2_mean": float(current_q2.mean().item()),
        }

        # 3. Delayed Policy Updates & Soft Target Update
        if self.total_it % self.policy_delay == 0:
            actor_loss = -self.critic.q1_forward(state_t, self.actor(state_t)).mean()

            self.actor_optimizer.zero_grad()
            actor_loss.backward()
            self.actor_optimizer.step()

            self._soft_update(self.critic, self.critic_target)
            self._soft_update(self.actor, self.actor_target)

            metrics["actor_loss"] = float(actor_loss.item())

        return metrics

    def _soft_update(self, source: nn.Module, target: nn.Module) -> None:
        """Cập nhật mềm Polyak averaging: target <- tau * source + (1 - tau) * target."""
        with torch.no_grad():
            for param, target_param in zip(source.parameters(), target.parameters()):
                target_param.data.copy_(self.tau * param.data + (1.0 - self.tau) * target_param.data)

    def save(self, path: str) -> None:
        """Lưu checkpoint mô hình TD3 và siêu tham số."""
        os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
        checkpoint = {
            "actor": self.actor.state_dict(),
            "actor_target": self.actor_target.state_dict(),
            "critic": self.critic.state_dict(),
            "critic_target": self.critic_target.state_dict(),
            "actor_optimizer": self.actor_optimizer.state_dict(),
            "critic_optimizer": self.critic_optimizer.state_dict(),
            "total_it": self.total_it,
            "hparams": {
                "state_dim": self.state_dim,
                "action_dim": self.action_dim,
                "gamma": self.gamma,
                "tau": self.tau,
                "lr": self.lr,
                "policy_noise": self.policy_noise,
                "noise_clip": self.noise_clip,
                "policy_delay": self.policy_delay,
                "exploration_noise": self.exploration_noise,
                "batch_size": self.batch_size,
                "buffer_size": self.buffer_size,
                "hidden_dim": self.hidden_dim,
            },
        }
        torch.save(checkpoint, path)

    def load(self, path: str) -> Dict[str, Any]:
        """Nạp checkpoint mô hình TD3 từ file."""
        checkpoint = torch.load(path, map_location=self.device, weights_only=True)
        self.actor.load_state_dict(checkpoint["actor"])
        self.actor_target.load_state_dict(checkpoint["actor_target"])
        self.critic.load_state_dict(checkpoint["critic"])
        self.critic_target.load_state_dict(checkpoint["critic_target"])
        if "actor_optimizer" in checkpoint:
            self.actor_optimizer.load_state_dict(checkpoint["actor_optimizer"])
        if "critic_optimizer" in checkpoint:
            self.critic_optimizer.load_state_dict(checkpoint["critic_optimizer"])
        self.total_it = int(checkpoint.get("total_it", 0))
        return checkpoint.get("hparams", {})
