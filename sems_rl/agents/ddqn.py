"""Double DQN với kiến trúc Dueling bằng PyTorch — phần việc của Lý Đình Sơn.

Thứ tự nên đọc: DDQNConfig -> build_action_grid -> DuelingQNetwork.
Theo van Hasselt và cộng sự (2015) và Wang và cộng sự (2015); mạng đích cập nhật mềm
theo mã giả Thuật toán 4 trong báo cáo TH2.
"""

from copy import deepcopy
from dataclasses import asdict, dataclass
from pathlib import Path

import numpy as np
import torch
from torch import nn
from torch.nn import functional as F


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


class ReplayBuffer:
    """Bộ nhớ vòng lưu chỉ số hành động k (không lưu lệnh liên tục)."""

    def __init__(self, config, seed=0):
        self.capacity = config.buffer_size
        self.observations = np.empty((self.capacity, config.observation_dim), np.float32)
        self.actions = np.empty((self.capacity, 1), np.int64)
        self.rewards = np.empty((self.capacity, 1), np.float32)
        self.next_observations = np.empty_like(self.observations)
        self.terminated = np.empty((self.capacity, 1), np.float32)
        self.position = 0
        self.size = 0
        self.rng = np.random.default_rng(seed)

    def add(self, observation, action_index, reward, next_observation, terminated):
        i = self.position
        self.observations[i] = observation
        self.actions[i] = int(action_index)
        self.rewards[i] = reward
        self.next_observations[i] = next_observation
        # Chỉ terminated tắt bootstrap; truncated (hết ngày) không được lưu ở đây.
        self.terminated[i] = terminated
        self.position = (i + 1) % self.capacity
        self.size = min(self.size + 1, self.capacity)

    def sample(self, batch_size, device):
        if self.size < batch_size:
            raise ValueError("Replay buffer chưa đủ trải nghiệm để lấy một batch.")
        indices = self.rng.integers(self.size, size=batch_size)
        arrays = (
            self.observations, self.actions, self.rewards,
            self.next_observations, self.terminated,
        )
        return tuple(torch.as_tensor(x[indices], device=device) for x in arrays)


class DDQNAgent:
    """Bộ điều khiển DDQN; predict trả hành động LIÊN TỤC giống SAC để dùng chung đánh giá."""

    def __init__(self, config=None, seed=0, device="cpu"):
        self.config = config or DDQNConfig()
        self.device = torch.device(device)
        self.seed = seed
        torch.manual_seed(seed)
        if self.device.type == "cuda":
            torch.cuda.manual_seed_all(seed)
        self.online = DuelingQNetwork(self.config).to(self.device)
        self.target = deepcopy(self.online).requires_grad_(False)
        self.optimizer = torch.optim.Adam(
            self.online.parameters(), lr=self.config.learning_rate
        )
        self.action_grid = build_action_grid(self.config.num_actions)
        self.rng = np.random.default_rng(seed)
        self.buffer = ReplayBuffer(self.config, seed)
        self.update_count = 0

    def epsilon(self, step):
        """ε giảm tuyến tính theo bước môi trường TOÀN CỤC, rồi giữ epsilon_end."""
        c = self.config
        fraction = step / c.epsilon_decay_steps
        if fraction >= 1.0:
            return c.epsilon_end  # giữ đúng giá trị, tránh sai số 1 - 0.95
        return max(c.epsilon_end, c.epsilon_start - (c.epsilon_start - c.epsilon_end) * fraction)

    def action_value(self, k):
        return float(self.action_grid[int(k)])

    def _observations(self, observation):
        values = np.asarray(observation, dtype=np.float32)
        if values.ndim not in (1, 2) or values.shape[-1] != self.config.observation_dim:
            raise ValueError("Quan sát phải có dạng (observation_dim,) hoặc (batch, observation_dim).")
        if not np.isfinite(values).all():
            raise ValueError("Quan sát chứa NaN hoặc vô cực.")
        single = values.ndim == 1
        tensor = torch.as_tensor(values, device=self.device)
        return (tensor.unsqueeze(0) if single else tensor), single

    def _greedy(self, observation):
        observations, single = self._observations(observation)
        with torch.no_grad():
            indices = self.online(observations).argmax(dim=-1).cpu().numpy()
        return indices, single

    def select_action_index(self, observation, epsilon=0.0):
        """ε-greedy trên một quan sát; argmax lấy chỉ số nhỏ nhất khi hòa."""
        if self.rng.random() < epsilon:
            return int(self.rng.integers(self.config.num_actions))
        indices, _ = self._greedy(observation)
        return int(indices[0])

    def q_values(self, observation):
        observations, _ = self._observations(observation)
        with torch.no_grad():
            return self.online(observations)[0].cpu().numpy()

    def explain(self, observation):
        """Q(s,k) cho mọi k, cùng V(s) và A(s,k) nếu là Dueling — dùng cho 3D và dashboard."""
        observations, _ = self._observations(observation)
        with torch.no_grad():
            q = self.online(observations)[0].cpu().numpy()
            value = advantages = None
            if self.config.dueling:
                v, a = self.online.heads(observations)
                value = float(v[0, 0])
                advantages = a[0].cpu().numpy().astype(float).tolist()
        return {
            "q_values": q.astype(float).tolist(), "v_value": value,
            "advantages": advantages, "chosen_k": int(np.argmax(q)),
        }

    def predict(self, observation, deterministic=True):
        """Trả (action, None) như SB3; một quan sát -> shape (1,), float32, thuộc action_grid."""
        if deterministic:
            indices, single = self._greedy(observation)
        else:
            observations, single = self._observations(observation)
            indices = np.array([
                self.select_action_index(row, self.config.epsilon_end)
                for row in observations.cpu().numpy()
            ])
        actions = self.action_grid[indices].reshape(-1, 1).astype(np.float32)
        return (actions[0] if single else actions), None

    def compute_target(self, rewards, next_observations, terminated):
        """Double: k* = argmax Q_θ(s'), y = r + γ(1-d)·Q_tg(s', k*). DQN thường: max Q_tg(s')."""
        with torch.no_grad():
            next_target_q = self.target(next_observations)
            if self.config.double:
                # Mạng chính CHỌN hành động, mạng đích ĐÁNH GIÁ: giảm ước lượng quá cao.
                best = self.online(next_observations).argmax(dim=-1, keepdim=True)
                next_q = next_target_q.gather(1, best)
            else:
                next_q = next_target_q.max(dim=-1, keepdim=True).values
            return rewards + self.config.gamma * (1.0 - terminated) * next_q

    def update(self):
        """Một lần cập nhật: Huber trên Q(s,k) - y, cắt gradient, rồi cập nhật mềm mạng đích."""
        observations, actions, rewards, next_observations, terminated = self.buffer.sample(
            self.config.batch_size, self.device
        )
        targets = self.compute_target(rewards, next_observations, terminated)
        q = self.online(observations).gather(1, actions.long())
        loss = F.smooth_l1_loss(q, targets)
        self.optimizer.zero_grad()
        loss.backward()
        torch.nn.utils.clip_grad_norm_(
            self.online.parameters(), max_norm=self.config.grad_clip_norm
        )
        self.optimizer.step()

        # Cập nhật mềm: θ_tg ← τ·θ + (1-τ)·θ_tg; mạng đích thay đổi chậm để đích ít dao động.
        with torch.no_grad():
            for parameter, target_parameter in zip(
                self.online.parameters(), self.target.parameters()
            ):
                target_parameter.lerp_(parameter, self.config.tau)

        self.update_count += 1
        metrics = {
            "loss": loss.item(), "q_mean": q.mean().item(),
            "td_error_mean": (q - targets).abs().mean().item(),
        }
        if not all(np.isfinite(value) for value in metrics.values()):
            raise FloatingPointError(f"DDQN gặp giá trị không hữu hạn: {metrics}")
        return metrics

    def save(self, path):
        """Lưu mạng và optimizer. Replay buffer không lưu: đây không phải resume đầy đủ."""
        path = Path(path)
        path.parent.mkdir(parents=True, exist_ok=True)
        torch.save({
            "config": asdict(self.config), "seed": self.seed,
            "online": self.online.state_dict(), "target": self.target.state_dict(),
            "optimizer": self.optimizer.state_dict(), "update_count": self.update_count,
        }, path)

    @classmethod
    def load(cls, path, device="cpu"):
        """Nạp mô hình để dự đoán; chỉ chứa tensor và dữ liệu cấu hình cơ bản."""
        checkpoint = torch.load(path, map_location=device, weights_only=True)
        agent = cls(DDQNConfig(**checkpoint["config"]), checkpoint["seed"], device)
        agent.online.load_state_dict(checkpoint["online"])
        agent.target.load_state_dict(checkpoint["target"])
        agent.optimizer.load_state_dict(checkpoint["optimizer"])
        agent.update_count = checkpoint["update_count"]
        return agent
