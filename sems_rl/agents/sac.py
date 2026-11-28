"""Soft Actor-Critic bằng PyTorch — phần việc của Nguyễn Văn Trường.

Thứ tự nên đọc: SACConfig -> Actor -> Critic -> ReplayBuffer -> SACAgent.
Phiên bản này dùng hai Q, hai Q đích và alpha tự điều chỉnh; không có mạng V.
"""

from copy import deepcopy
from dataclasses import asdict, dataclass
from pathlib import Path

import numpy as np
import torch
from torch import nn
from torch.distributions import Normal
from torch.nn import functional as F


@dataclass
class SACConfig:
    """Các tham số khởi đầu theo báo cáo TH2; mỗi lần chạy lưu một bản riêng."""

    observation_dim: int = 7
    action_dim: int = 1
    hidden_size: int = 256
    learning_rate: float = 3e-4
    gamma: float = 0.99
    tau: float = 0.005
    batch_size: int = 256
    buffer_size: int = 200_000
    learning_starts: int = 5_000
    initial_alpha: float = 1.0
    target_entropy: float = -1.0

    def __post_init__(self):
        if min(self.observation_dim, self.action_dim, self.hidden_size) < 1:
            raise ValueError("Số chiều và kích thước mạng phải dương.")
        if not 0 < self.learning_rate or not 0 < self.initial_alpha:
            raise ValueError("Learning rate và alpha ban đầu phải dương.")
        if not 0 <= self.gamma <= 1 or not 0 < self.tau <= 1:
            raise ValueError("Cần gamma trong [0, 1] và tau trong (0, 1].")
        if not 1 <= self.batch_size <= self.buffer_size or self.learning_starts < 0:
            raise ValueError("Cần 1 <= batch_size <= buffer_size và learning_starts >= 0.")


def make_mlp(input_dim, output_dim, hidden_size):
    """Mạng nhỏ, hai lớp ẩn; dùng chung cách xây dựng cho Actor và Critic."""
    return nn.Sequential(
        nn.Linear(input_dim, hidden_size), nn.ReLU(),
        nn.Linear(hidden_size, hidden_size), nn.ReLU(),
        nn.Linear(hidden_size, output_dim),
    )


class Actor(nn.Module):
    """Quan sát -> Gaussian -> tanh -> hành động chuẩn hóa trong [-1, 1]."""

    def __init__(self, config):
        super().__init__()
        self.network = make_mlp(
            config.observation_dim, 2 * config.action_dim, config.hidden_size
        )

    def distribution(self, observations):
        mean, log_std = self.network(observations).chunk(2, dim=-1)
        # Chặn độ lệch chuẩn quá nhỏ/lớn để tránh lỗi số học khi lấy log xác suất.
        log_std = log_std.clamp(-20.0, 2.0)
        return Normal(mean, log_std.exp())

    def sample(self, observations):
        distribution = self.distribution(observations)
        # rsample = mean + std * noise: gradient đi được qua hành động về Actor.
        raw_actions = distribution.rsample()
        actions = torch.tanh(raw_actions)

        # Sau tanh, mật độ xác suất đã thay đổi: phải trừ log Jacobian.
        # Công thức dưới tương đương log(1 - tanh(u)^2), nhưng ổn định khi |u| lớn.
        correction = 2.0 * (np.log(2.0) - raw_actions - F.softplus(-2.0 * raw_actions))
        log_probs = (distribution.log_prob(raw_actions) - correction).sum(-1, keepdim=True)
        return actions, log_probs

    def deterministic_action(self, observations):
        # Đánh giá bằng tanh(mean), không lấy mẫu ngẫu nhiên như khi huấn luyện.
        return torch.tanh(self.distribution(observations).mean)


class Critic(nn.Module):
    """Ghép trạng thái và hành động để ước lượng một Q(s, a)."""

    def __init__(self, config):
        super().__init__()
        self.network = make_mlp(
            config.observation_dim + config.action_dim, 1, config.hidden_size
        )

    def forward(self, observations, actions):
        return self.network(torch.cat([observations, actions], dim=-1))


class ReplayBuffer:
    """Bộ nhớ vòng: khi đầy sẽ ghi đè trải nghiệm cũ nhất."""

    def __init__(self, config, seed=0):
        self.capacity = config.buffer_size
        self.observations = np.empty((self.capacity, config.observation_dim), np.float32)
        self.actions = np.empty((self.capacity, config.action_dim), np.float32)
        self.rewards = np.empty((self.capacity, 1), np.float32)
        self.next_observations = np.empty_like(self.observations)
        self.terminated = np.empty((self.capacity, 1), np.float32)
        self.position = 0
        self.size = 0
        self.rng = np.random.default_rng(seed)

    def add(self, observation, action, reward, next_observation, terminated):
        i = self.position
        self.observations[i] = observation
        # Lưu lệnh agent gửi cho env; công suất sau guardrail nằm trong info.
        self.actions[i] = action
        self.rewards[i] = reward
        self.next_observations[i] = next_observation
        # truncated chỉ báo cần reset, không tự động làm mất phần giá trị tương lai.
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


class SACAgent:
    """Bộ điều khiển SAC chuẩn hóa theo thuật toán OpenAI Spinning Up (Algorithm 1).
    predict có cùng dạng kết quả với SB3 để dễ bàn giao.
    """

    def __init__(self, config=None, seed=0, device="cpu"):
        self.config = config or SACConfig()
        self.device = torch.device(device)
        self.seed = seed
        torch.manual_seed(seed)
        if self.device.type == "cuda":
            torch.cuda.manual_seed_all(seed)

        # [MÃ GIẢ DÒNG 1]: Khởi tạo tham số chính sách theta, Q-functions phi_1, phi_2 và Replay Buffer rỗng D
        self.actor = Actor(self.config).to(self.device)
        self.q1 = Critic(self.config).to(self.device)
        self.q2 = Critic(self.config).to(self.device)
        self.actor_optimizer = torch.optim.Adam(
            self.actor.parameters(), lr=self.config.learning_rate
        )
        self.critic_optimizer = torch.optim.Adam(
            list(self.q1.parameters()) + list(self.q2.parameters()),
            lr=self.config.learning_rate,
        )
        self.buffer = ReplayBuffer(self.config, seed)

        # [MÃ GIẢ DÒNG 2]: Khởi tạo các mạng đích phi_targ,1 <- phi_1, phi_targ,2 <- phi_2
        self.target_q1 = deepcopy(self.q1).requires_grad_(False)
        self.target_q2 = deepcopy(self.q2).requires_grad_(False)

        # Khởi tạo hệ số nhiệt độ entropy tự điều chỉnh alpha (Bản SAC 2018 cải tiến)
        self.log_alpha = torch.tensor(
            float(np.log(self.config.initial_alpha)), device=self.device, requires_grad=True
        )
        self.alpha_optimizer = torch.optim.Adam([self.log_alpha], lr=self.config.learning_rate)
        self.update_count = 0

    @property
    def alpha(self):
        # Học log(alpha) thay cho alpha để alpha luôn dương.
        return self.log_alpha.exp()

    def predict(self, observation, deterministic=True):
        """Trả (action, None); một quan sát -> action shape (1,), dtype float32."""
        values = np.asarray(observation, dtype=np.float32)
        if values.ndim not in (1, 2) or values.shape[-1] != self.config.observation_dim:
            raise ValueError("Quan sát phải có dạng (observation_dim,) hoặc (batch, observation_dim).")
        if not np.isfinite(values).all():
            raise ValueError("Quan sát chứa NaN hoặc vô cực.")
        single = values.ndim == 1
        observations = torch.as_tensor(values, device=self.device)
        if single:
            observations = observations.unsqueeze(0)
        with torch.no_grad():
            if deterministic:
                actions = self.actor.deterministic_action(observations)
            else:
                actions, _ = self.actor.sample(observations)
        result = actions.cpu().numpy().astype(np.float32)
        return (result[0] if single else result), None

    def compute_target(self, rewards, next_observations, terminated):
        """[MÃ GIẢ DÒNG 12]: Tính mục tiêu Bellman Target Q:
        y(r, s', d) = r + gamma * (1 - d) * [ min_{i=1,2} Q_targ,i(s', a~') - alpha * log pi(a~'|s') ]
        với a~' ~ pi_theta(.|s')
        """
        with torch.no_grad():
            next_actions, next_log_probs = self.actor.sample(next_observations)
            next_q = torch.minimum(
                self.target_q1(next_observations, next_actions),
                self.target_q2(next_observations, next_actions),
            )
            return rewards + self.config.gamma * (1.0 - terminated) * (
                next_q - self.alpha * next_log_probs
            )

    def update(self):
        """Một lần cập nhật gradient tương ứng các dòng 11 đến 15 của mã giả."""
        # [MÃ GIẢ DÒNG 11]: Lấy mẫu ngẫu nhiên một batch chuyển trạng thái B = {(s, a, r, s', d)} từ Buffer D
        observations, actions, rewards, next_observations, terminated = self.buffer.sample(
            self.config.batch_size, self.device
        )

        # [MÃ GIẢ DÒNG 12]: Tính mục tiêu Bellman cho hàm Q (y)
        targets = self.compute_target(rewards, next_observations, terminated)

        # [MÃ GIẢ DÒNG 13]: Cập nhật hai Q-functions bằng Gradient Descent theo MSE Loss:
        # grad_phi_i (1/|B|) sum (Q_phi_i(s, a) - y)^2 cho i in {1, 2}
        q1 = self.q1(observations, actions)
        q2 = self.q2(observations, actions)
        critic_loss = 0.5 * (F.mse_loss(q1, targets) + F.mse_loss(q2, targets))
        self.critic_optimizer.zero_grad()
        critic_loss.backward()
        self.critic_optimizer.step()

        # [MÃ GIẢ DÒNG 14]: Cập nhật chính sách Actor pi_theta bằng Gradient Ascent:
        # grad_theta (1/|B|) sum [ min_{i=1,2} Q_phi_i(s, a~_theta(s)) - alpha * log pi_theta(a~_theta(s)|s) ]
        # Khi code: đổi dấu thành Gradient Descent: Loss = alpha * log_pi - min_Q
        self.q1.requires_grad_(False)
        self.q2.requires_grad_(False)
        policy_actions, log_probs = self.actor.sample(observations)
        policy_q = torch.minimum(
            self.q1(observations, policy_actions), self.q2(observations, policy_actions)
        )
        actor_loss = (self.alpha.detach() * log_probs - policy_q).mean()
        self.actor_optimizer.zero_grad()
        actor_loss.backward()
        self.actor_optimizer.step()
        self.q1.requires_grad_(True)
        self.q2.requires_grad_(True)

        # Điều chỉnh tự động hệ số nhiệt độ alpha theo mục tiêu target_entropy = -dim(A) = -1.0
        alpha_loss = -(
            self.log_alpha * (log_probs.detach() + self.config.target_entropy)
        ).mean()
        self.alpha_optimizer.zero_grad()
        alpha_loss.backward()
        self.alpha_optimizer.step()

        # [MÃ GIẢ DÒNG 15]: Cập nhật mềm mạng đích (Polyak target update):
        # phi_targ,i <- rho * phi_targ,i + (1 - rho) * phi_i (với rho = 1 - tau)
        with torch.no_grad():
            for source, target in ((self.q1, self.target_q1), (self.q2, self.target_q2)):
                for parameter, target_parameter in zip(source.parameters(), target.parameters()):
                    target_parameter.lerp_(parameter, self.config.tau)

        self.update_count += 1
        metrics = {
            "critic_loss": critic_loss.item(), "actor_loss": actor_loss.item(),
            "alpha_loss": alpha_loss.item(), "alpha": self.alpha.item(),
            "q_mean": ((q1.mean() + q2.mean()) / 2).item(),
        }
        if not all(np.isfinite(value) for value in metrics.values()):
            raise FloatingPointError(f"SAC gặp giá trị không hữu hạn: {metrics}")
        return metrics

    def checkpoint_state(self):
        """Trọng số và optimizer; bộ nhớ/RNG được lưu riêng khi resume trên Colab."""
        return {
            "config": asdict(self.config), "seed": self.seed,
            "actor": self.actor.state_dict(), "q1": self.q1.state_dict(),
            "q2": self.q2.state_dict(), "target_q1": self.target_q1.state_dict(),
            "target_q2": self.target_q2.state_dict(),
            "log_alpha": self.log_alpha.detach().cpu(),
            "actor_optimizer": self.actor_optimizer.state_dict(),
            "critic_optimizer": self.critic_optimizer.state_dict(),
            "alpha_optimizer": self.alpha_optimizer.state_dict(),
            "update_count": self.update_count,
        }

    def save(self, path):
        """Lưu checkpoint suy luận. Ghi tạm rồi thay thế để hạn chế file dang dở."""
        path = Path(path)
        path.parent.mkdir(parents=True, exist_ok=True)
        temporary = path.with_name(path.name + ".tmp")
        torch.save(self.checkpoint_state(), temporary)
        temporary.replace(path)

    @classmethod
    def load(cls, path, device="cpu"):
        """Nạp mô hình để dự đoán; chỉ chứa tensor và dữ liệu cấu hình cơ bản."""
        checkpoint = torch.load(path, map_location=device, weights_only=True)
        return cls.from_checkpoint(checkpoint, device)

    @classmethod
    def from_checkpoint(cls, checkpoint, device="cpu"):
        """Dùng chung khi nạp best.pt và khi khôi phục phiên huấn luyện."""
        agent = cls(SACConfig(**checkpoint["config"]), checkpoint["seed"], device)
        for name in ("actor", "q1", "q2", "target_q1", "target_q2"):
            getattr(agent, name).load_state_dict(checkpoint[name])
        with torch.no_grad():
            agent.log_alpha.copy_(checkpoint["log_alpha"])
        for name in ("actor_optimizer", "critic_optimizer", "alpha_optimizer"):
            getattr(agent, name).load_state_dict(checkpoint[name])
        agent.update_count = checkpoint["update_count"]
        return agent
