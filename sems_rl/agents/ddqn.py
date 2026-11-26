"""Double DQN với kiến trúc Dueling bằng PyTorch — phần việc của Lý Đình Sơn.

Thứ tự nên đọc: DDQNConfig -> build_action_grid -> DuelingQNetwork.
Theo van Hasselt và cộng sự (2015) và Wang và cộng sự (2015); mạng đích cập nhật mềm
theo mã giả Thuật toán 4 trong báo cáo TH2.
"""

from dataclasses import dataclass

import numpy as np
import torch
from torch import nn


@dataclass
class DDQNConfig:
    """Siêu tham số khởi đầu theo báo cáo TH2 (bảng của Thuật toán 4)."""

    observation_dim: int = 7
    num_actions: int = 11
    hidden_size: int = 256
    learning_rate: float = 1e-4
    gamma: float = 0.99
    tau: float = 0.005
    batch_size: int = 256
    buffer_size: int = 200_000
    learning_starts: int = 5_000
    epsilon_start: float = 1.0
    epsilon_end: float = 0.05
    epsilon_decay_steps: int = 50_000
    grad_clip_norm: float = 10.0
    double: bool = True
    dueling: bool = True

    def __post_init__(self):
        if self.num_actions < 2:
            raise ValueError("Cần ít nhất 2 mức hành động rời rạc.")
        if min(self.observation_dim, self.hidden_size) < 1:
            raise ValueError("Số chiều và kích thước mạng phải dương.")
        if not 0 < self.learning_rate or not 0 < self.grad_clip_norm:
            raise ValueError("Learning rate và ngưỡng cắt gradient phải dương.")
        if not 0 <= self.gamma <= 1 or not 0 < self.tau <= 1:
            raise ValueError("Cần gamma trong [0, 1] và tau trong (0, 1].")
        if not 1 <= self.batch_size <= self.buffer_size or self.learning_starts < 0:
            raise ValueError("Cần 1 <= batch_size <= buffer_size và learning_starts >= 0.")
        if not 0 <= self.epsilon_end <= self.epsilon_start <= 1:
            raise ValueError("Cần 0 <= epsilon_end <= epsilon_start <= 1.")
        if self.epsilon_decay_steps < 1:
            raise ValueError("Số bước giảm epsilon phải dương.")


def build_action_grid(num_actions):
    """a = -1 + 2k/(K-1): cùng công thức với DiscretizeActionWrapper; k ở giữa là pin nghỉ."""
    return np.linspace(-1.0, 1.0, int(num_actions), dtype=np.float32)


class DuelingQNetwork(nn.Module):
    """Thân chung 2 lớp ẩn -> V(s) và A(s,k); Q = V + A - mean_k A.

    Khi dueling=False, output_head cho thẳng Q (DQN thường) để chạy ablation.
    """

    def __init__(self, config):
        super().__init__()
        self.dueling = config.dueling
        self.trunk = nn.Sequential(
            nn.Linear(config.observation_dim, config.hidden_size), nn.ReLU(),
            nn.Linear(config.hidden_size, config.hidden_size), nn.ReLU(),
        )
        self.value_head = nn.Linear(config.hidden_size, 1) if config.dueling else None
        self.output_head = nn.Linear(config.hidden_size, config.num_actions)

    def heads(self, observations):
        """Trả (V, A) chưa ghép; chỉ có nghĩa với kiến trúc Dueling."""
        if not self.dueling:
            raise ValueError("Mạng không dùng Dueling nên không tách được V và A.")
        features = self.trunk(observations)
        return self.value_head(features), self.output_head(features)

    def forward(self, observations):
        if not self.dueling:
            return self.output_head(self.trunk(observations))
        value, advantage = self.heads(observations)
        # Trừ trung bình A để V và A xác định duy nhất (Wang và cộng sự, công thức 9).
        return value + advantage - advantage.mean(dim=-1, keepdim=True)
