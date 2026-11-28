"""Cấu hình và bộ bọc suy luận chuẩn cho thuật toán PPO (Stable-Baselines3).

Tác giả phụ trách: Nguyễn Tùng Dương (Thuật toán PPO & Pipeline đánh giá).
"""

from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Tuple, Union

import numpy as np
import torch
from torch import nn


@dataclass
class PPOConfig:
    """Siêu tham số PPO-Clip chuẩn hóa theo Báo cáo TH2 (Nhóm 7)."""

    algorithm: str = "ppo"
    backend: str = "sb3"
    observation_dim: int = 7
    action_dim: int = 1
    net_arch: Dict[str, List[int]] = field(
        default_factory=lambda: {"pi": [64, 64], "vf": [64, 64]}
    )
    activation: str = "tanh"
    n_envs: int = 4
    n_steps: int = 480
    batch_size: int = 64
    n_epochs: int = 10
    learning_rate: float = 3e-4
    lr_schedule: str = "constant"
    gamma: float = 0.99
    gae_lambda: float = 0.95
    clip_range: float = 0.2
    ent_coef: float = 0.005
    vf_coef: float = 0.5
    max_grad_norm: float = 0.5
    target_kl: Optional[float] = None
    normalize_reward: bool = False
    clip_action_eval: bool = True
    use_sde: bool = False
    sde_sample_freq: int = -1
    log_std_init: float = 0.0

    def __post_init__(self) -> None:
        if min(self.observation_dim, self.action_dim, self.n_envs, self.n_steps, self.batch_size, self.n_epochs) < 1:
            raise ValueError("Các tham số kích thước và số bước phải dương.")
        rollout_size = self.n_envs * self.n_steps
        if self.batch_size > rollout_size:
            raise ValueError(
                f"batch_size ({self.batch_size}) không được lớn hơn n_envs * n_steps ({rollout_size})."
            )
        if self.activation.lower() not in ("tanh", "relu"):
            raise ValueError("activation chỉ hỗ trợ 'tanh' hoặc 'relu'.")
        if self.lr_schedule.lower() not in ("constant", "linear"):
            raise ValueError("lr_schedule chỉ hỗ trợ 'constant' hoặc 'linear'.")
        if not 0.0 <= self.gamma <= 1.0 or not 0.0 <= self.gae_lambda <= 1.0:
            raise ValueError("gamma và gae_lambda phải nằm trong [0, 1].")
        if self.learning_rate <= 0 or self.clip_range <= 0 or self.max_grad_norm <= 0:
            raise ValueError("learning_rate, clip_range và max_grad_norm phải dương.")
        if self.target_kl is not None and self.target_kl <= 0:
            raise ValueError("target_kl phải dương hoặc null.")
        if self.ent_coef < 0 or self.vf_coef < 0:
            raise ValueError("ent_coef và vf_coef không được âm.")
        if self.sde_sample_freq != -1 and self.sde_sample_freq < 1:
            raise ValueError("sde_sample_freq phải bằng -1 hoặc số nguyên dương >= 1.")
        if not isinstance(self.net_arch, dict) or not {"pi", "vf"}.issubset(self.net_arch.keys()):
            raise ValueError("net_arch phải là dict chứa cả hai khóa 'pi' và 'vf'.")
        for branch in ("pi", "vf"):
            layers = self.net_arch[branch]
            if not isinstance(layers, list) or not layers or any(int(units) < 1 for units in layers):
                raise ValueError(f"net_arch['{branch}'] phải là danh sách các số nguyên dương.")

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)

    def activation_fn(self) -> type[nn.Module]:
        return nn.Tanh if self.activation.lower() == "tanh" else nn.ReLU


def linear_lr_schedule(initial_lr: float, min_ratio: float = 0.1) -> Callable[[float], float]:
    """Lịch giảm tuyến tính theo tiến độ còn lại `progress_remaining` in [1 -> 0]."""

    def _schedule(progress_remaining: float) -> float:
        factor = min_ratio + (1.0 - min_ratio) * max(0.0, float(progress_remaining))
        return float(initial_lr * factor)

    return _schedule


class PPOAgentWrapper:
    """Bọc SB3 PPO để chuẩn hóa giao diện predict(obs, deterministic=True) và clip [-1, 1]."""

    def __init__(self, model: Any, clip_action: bool = True):
        self.model = model
        self.clip_action = clip_action

    def predict(
        self,
        observation: np.ndarray,
        deterministic: bool = True,
    ) -> Tuple[np.ndarray, Optional[Tuple[np.ndarray, ...]]]:
        values = np.asarray(observation, dtype=np.float32)
        if not np.isfinite(values).all():
            raise ValueError("Quan sát đầu vào chứa NaN hoặc vô cực.")
        action, state = self.model.predict(values, deterministic=deterministic)
        action_arr = np.asarray(action, dtype=np.float32)
        if self.clip_action:
            action_arr = np.clip(action_arr, -1.0, 1.0)
        return action_arr, state

    def save(self, path: Union[str, Path]) -> None:
        self.model.save(path)


def load_ppo_model(run_dir: Union[str, Path], device: str = "cpu") -> PPOAgentWrapper:
    """Nạp checkpoint best.zip của PPO kèm cờ clip hành động từ metadata."""
    import json
    from stable_baselines3 import PPO

    run_path = Path(run_dir)
    clip_eval = True
    meta_path = run_path / "metadata.json"
    if meta_path.is_file():
        meta = json.loads(meta_path.read_text(encoding="utf-8"))
        clip_eval = bool(meta.get("settings", {}).get("agent", {}).get("clip_action_eval", True))

    model = PPO.load(run_path / "best.zip", device=device)
    return PPOAgentWrapper(model, clip_action=clip_eval)
