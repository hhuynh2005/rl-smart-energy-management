"""
Gymnasium Wrappers for MicrogridBessEnv.
1. DiscretizeActionWrapper: Rời rạc hóa hành động (K = 11 mức) phục vụ thuật toán Double DQN (DDQN).
   Tác giả phụ trách: Lý Đình Sơn (Wrapper) & Nguyễn Thị Cẩm Ly (Thuật toán DDQN).
2. NoiseWrapper: Thêm nhiễu Gaussian vào tải và PV cho kịch bản thử nghiệm độ bền S4.
   Tác giả phụ trách: Nguyễn Văn Huỳnh (Tiếp nhận và chuẩn hóa).
"""

from typing import Union, Tuple, Dict, Any, Optional
import numpy as np
import gymnasium as gym
from gymnasium import spaces


class DiscretizeActionWrapper(gym.ActionWrapper):
    """
    Rời rạc hóa không gian hành động liên tục [-1, 1] thành K mức:
    a = -1 + 2*k / (K - 1), với k in {0, ..., K - 1}.
    
    Với K = 11:
    - k = 0: a = -1.0 (xả tối đa)
    - k = 5: a =  0.0 (pin nghỉ)
    - k = 10: a = +1.0 (sạc tối đa)
    - Bước nhảy delta_a = 0.2 (10% công suất danh định mỗi chiều).
    
    Sau khi giải mã, lệnh vẫn đi qua Safety Guardrail của MicrogridBessEnv.
    """

    def __init__(self, env: gym.Env, num_actions: int = 11):
        super().__init__(env)
        self.num_actions = int(num_actions)
        if self.num_actions < 2:
            raise ValueError("num_actions phải lớn hơn hoặc bằng 2")
            
        self.action_space = spaces.Discrete(self.num_actions)
        # Bảng tra trước các giá trị hành động liên tục
        self.action_grid = np.linspace(-1.0, 1.0, self.num_actions, dtype=np.float32)

    def action(self, act: Union[int, np.integer]) -> np.ndarray:
        """Chuyển đổi chỉ số nguyên k thành mảng continuous action np.ndarray([a])."""
        idx = int(np.clip(act, 0, self.num_actions - 1))
        continuous_action = np.array([self.action_grid[idx]], dtype=np.float32)
        return continuous_action

    def get_action_value(self, act: int) -> float:
        """Lấy giá trị thực của hành động rời rạc k."""
        idx = int(np.clip(act, 0, self.num_actions - 1))
        return float(self.action_grid[idx])


class NoiseWrapper(gym.Wrapper):
    """
    Kịch bản thử nghiệm độ bền S4:
    Thêm nhiễu Gaussian vào công suất phụ tải và phát PV:
    P_load_tilde = P_load * (1 + eps_L),  eps_L ~ N(0, sigma_L^2)
    P_pv_tilde   = P_pv   * (1 + eps_PV), eps_PV ~ N(0, sigma_PV^2)
    
    sigma_L: 0.05 - 0.10 (5% - 10%)
    sigma_PV: 0.10 - 0.20 (10% - 20%)
    """

    def __init__(
        self,
        env: gym.Env,
        sigma_load: float = 0.05,
        sigma_pv: float = 0.10,
        seed: Optional[int] = None,
    ):
        super().__init__(env)
        self.sigma_load = float(sigma_load)
        self.sigma_pv = float(sigma_pv)
        self.rng = np.random.default_rng(seed)

    def reset(self, **kwargs):
        obs, info = self.env.reset(**kwargs)
        # Thêm nhiễu vào obs ban đầu (obs[1] là load, obs[2] là pv)
        noisy_obs = obs.copy()
        eps_l = self.rng.normal(0, self.sigma_load)
        eps_pv = self.rng.normal(0, self.sigma_pv)
        noisy_obs[1] = float(np.clip(obs[1] * (1.0 + eps_l), 0.0, 1.0))
        noisy_obs[2] = float(np.clip(obs[2] * (1.0 + eps_pv), 0.0, 1.0))
        return noisy_obs, info

    def step(self, action):
        obs, reward, terminated, truncated, info = self.env.step(action)
        # Thêm nhiễu vào quan sát trả về cho Agent
        noisy_obs = obs.copy()
        eps_l = self.rng.normal(0, self.sigma_load)
        eps_pv = self.rng.normal(0, self.sigma_pv)
        noisy_obs[1] = float(np.clip(obs[1] * (1.0 + eps_l), 0.0, 1.0))
        noisy_obs[2] = float(np.clip(obs[2] * (1.0 + eps_pv), 0.0, 1.0))
        
        info["noisy_p_load_norm"] = noisy_obs[1]
        info["noisy_p_pv_norm"] = noisy_obs[2]
        return noisy_obs, reward, terminated, truncated, info
