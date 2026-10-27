"""
Microgrid BESS Gymnasium Environment (MicrogridBessEnv v1.0).
Môi trường mô phỏng Microgrid tích hợp Pin BESS và Điện mặt trời Solar PV.
Dựa trên kiến trúc CityLearn và đặc tả chuẩn trong Báo cáo TH2 - Nhóm 7.
Tác giả phụ trách: Lý Đình Sơn (Kiến trúc Env & Guardrail) & Nguyễn Văn Huỳnh (Nhóm trưởng - Hàm thưởng & Dữ liệu).
"""

from typing import Dict, Any, Tuple, Optional
import os
import sys

# Ensure UTF-8 console output on Windows
for stream in [sys.stdout, sys.stderr]:
    if hasattr(stream, "reconfigure"):
        try:
            stream.reconfigure(encoding="utf-8")
        except Exception:
            pass

import yaml
import numpy as np
import pandas as pd
import gymnasium as gym
from gymnasium import spaces

from sems_rl.envs.battery import Battery
from sems_rl.envs.guardrail import SafetyGuardrail
from sems_rl.data.data_pipeline import DataPipeline


class MicrogridBessEnv(gym.Env):
    """
    Môi trường Gymnasium mô phỏng Microgrid có hệ thống pin lưu trữ BESS và Solar PV.
    
    Không gian quan sát (Observation Space) - Vector 7 chiều liên tục:
    s_t = [ SoC_t, P_load,t_norm, P_pv,t_norm, C_grid,t_norm, sin(2pi*h_t/24), cos(2pi*h_t/24), d_t ]
    
    Không gian hành động (Action Space) - 1 chiều liên tục:
    a_t in [-1.0, 1.0]:
        a_t >= 0: Sạc pin với công suất P_cmd = a_t * P_charge_max
        a_t < 0:  Xả pin với công suất P_cmd = a_t * P_discharge_max
        
    Sau đó P_cmd được chiếu qua SafetyGuardrail để thành P_batt khả thi.
    """

    metadata = {"render_modes": ["human"], "render_fps": 4}

    def __init__(
        self,
        config_path: Optional[str] = None,
        config_dict: Optional[Dict[str, Any]] = None,
        data_pipeline: Optional[DataPipeline] = None,
        split: str = "train",
        render_mode: Optional[str] = None,
    ):
        super().__init__()
        self.render_mode = render_mode
        self.split = split

        # 1. Nạp cấu hình từ YAML hoặc dict
        self.config = self._load_config(config_path, config_dict)
        
        sys_cfg = self.config.get("system", {})
        bat_cfg = self.config.get("battery", {})
        rew_cfg = self.config.get("reward", {})
        
        self.delta_t = float(sys_cfg.get("delta_t", 0.25))          # 15 phút = 0.25 giờ
        self.episode_steps = int(sys_cfg.get("episode_steps", 96))   # 96 bước/ngày
        self.gamma = float(sys_cfg.get("gamma", 0.99))
        self.p_th = float(sys_cfg.get("p_th", 90.0))                 # Ngưỡng đỉnh (kW)
        self.p_pv_rated = float(sys_cfg.get("p_pv_rated", 150.0))    # kWp
        self.c_feed_in = float(sys_cfg.get("c_feed_in", 600.0))      # VNĐ/kWh
        
        # Hệ số trọng số hàm phần thưởng đa mục tiêu (Nguyễn Văn Huỳnh thiết kế)
        self.w1_wear = float(rew_cfg.get("w1_wear", 1.0))
        self.w2_peak = float(rew_cfg.get("w2_peak", 1.0))
        self.w3_viol = float(rew_cfg.get("w3_viol", 10.0))
        self.use_guardrail = bool(rew_cfg.get("use_guardrail", True))

        # 2. Khởi tạo mô hình Pin BESS và Safety Guardrail
        self.battery = Battery(
            e_cap=bat_cfg.get("e_cap", 200.0),
            p_charge_max=bat_cfg.get("p_charge_max", 50.0),
            p_discharge_max=bat_cfg.get("p_discharge_max", 50.0),
            eta_c=bat_cfg.get("eta_c", 0.92),
            eta_d=bat_cfg.get("eta_d", 0.92),
            soc_min=bat_cfg.get("soc_min", 0.20),
            soc_max=bat_cfg.get("soc_max", 0.90),
            soc_init_low=bat_cfg.get("soc_init_low", 0.30),
            soc_init_high=bat_cfg.get("soc_init_high", 0.70),
            c_bat=bat_cfg.get("c_bat", 3000000.0),
            n_cycle=bat_cfg.get("n_cycle", 4000),
            dod=bat_cfg.get("dod", 0.80),
        )
        self.guardrail = SafetyGuardrail(self.battery, enabled=self.use_guardrail)

        # 3. Data Pipeline
        if data_pipeline is not None:
            self.data_pipeline = data_pipeline
        else:
            data_cfg = self.config.get("data", {})
            csv_path = data_cfg.get("file_path", "data/processed.csv")
            self.data_pipeline = DataPipeline(
                csv_path=csv_path,
                train_ratio=data_cfg.get("train_ratio", 0.70),
                val_ratio=data_cfg.get("val_ratio", 0.15),
                test_ratio=data_cfg.get("test_ratio", 0.15),
                p_pv_rated=self.p_pv_rated,
                delta_t=self.delta_t,
                steps_per_day=self.episode_steps,
            )

        # Thống kê dùng để chuẩn hóa (tính từ train set)
        self.p_load_max_train = self.data_pipeline.p_load_max_train
        self.c_grid_peak_train = self.data_pipeline.c_grid_peak_train
        self.c_ref = self.data_pipeline.c_ref

        # 4. Định nghĩa Không gian hành động và Không gian quan sát theo chuẩn Gymnasium
        # Action: Box([-1.0], [1.0])
        self.action_space = spaces.Box(
            low=-1.0, high=1.0, shape=(1,), dtype=np.float32
        )

        # State vector: 7 chiều
        # [SoC, P_load_norm, P_pv_norm, C_grid_norm, sin(2pi*h/24), cos(2pi*h/24), is_weekday]
        low_obs = np.array([0.0, 0.0, 0.0, 0.0, -1.0, -1.0, 0.0], dtype=np.float32)
        high_obs = np.array([1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0], dtype=np.float32)
        self.observation_space = spaces.Box(
            low=low_obs, high=high_obs, shape=(7,), dtype=np.float32
        )

        # Trạng thái runtime của Episode
        self.current_step = 0
        self.day_df: Optional[pd.DataFrame] = None
        self.current_day_offset: int = 0
        self.episode_history = []

    def _load_config(self, config_path: Optional[str], config_dict: Optional[Dict[str, Any]]) -> Dict[str, Any]:
        """Tải cấu hình từ dict hoặc file YAML."""
        if config_dict is not None:
            return config_dict
        if config_path is None:
            # Tìm file config.yaml mặc định
            current_dir = os.path.dirname(os.path.abspath(__file__))
            default_yaml = os.path.join(os.path.dirname(current_dir), "config.yaml")
            if os.path.exists(default_yaml):
                config_path = default_yaml
            elif os.path.exists("config.yaml"):
                config_path = "config.yaml"
        
        if config_path and os.path.exists(config_path):
            with open(config_path, "r", encoding="utf-8") as f:
                return yaml.safe_load(f)
        return {}

    def reset(
        self,
        *,
        seed: Optional[int] = None,
        options: Optional[Dict[str, Any]] = None,
    ) -> Tuple[np.ndarray, Dict[str, Any]]:
        """
        Khởi tạo lại môi trường cho một episode mới (1 ngày = 96 bước 15 phút).
        
        Options hỗ trợ:
        - day_offset (int): Chỉ định ngày cụ thể trong split (cho đánh giá kịch bản).
        - initial_soc (float): Chỉ định mức SoC ban đầu (mặc định lấy ngẫu nhiên U(0.3, 0.7)).
        - split (str): Ghi đè split ('train', 'val', 'test').
        """
        super().reset(seed=seed)
        
        options = options or {}
        split = options.get("split", self.split)
        
        # Chọn ngày
        if "day_offset" in options:
            self.current_day_offset = int(options["day_offset"])
            self.day_df = self.data_pipeline.get_day_data(self.current_day_offset, split=split)
        else:
            self.current_day_offset, self.day_df = self.data_pipeline.sample_day_data(
                split=split, np_random=self.np_random
            )

        # Khởi tạo mức pin SoC ban đầu
        initial_soc = options.get("initial_soc", None)
        soc0 = self.battery.reset(initial_soc=initial_soc, np_random=self.np_random)

        self.current_step = 0
        self.episode_history = []

        obs = self._get_observation()
        info = {
            "step": self.current_step,
            "day_offset": self.current_day_offset,
            "split": split,
            "soc": soc0,
            "p_load_kw": float(self.day_df.iloc[0]["p_load_kw"]),
            "p_pv_kw": float(self.day_df.iloc[0]["p_pv_kw"]),
            "c_grid": float(self.day_df.iloc[0]["c_grid"]),
            "is_weekday": int(self.day_df.iloc[0]["is_weekday"]),
        }
        return obs, info

    def step(self, action: np.ndarray) -> Tuple[np.ndarray, float, bool, bool, Dict[str, Any]]:
        """
        Thực hiện một bước điều khiển (15 phút).
        
        Quy trình:
        1. Nhận action a_t in [-1, 1], chuyển đổi thành P_cmd.
        2. Chiếu qua SafetyGuardrail -> P_batt khả thi và phạt P_viol.
        3. Cập nhật động lực học pin -> SoC_{t+1}, chi phí hao mòn C_deg.
        4. Cân bằng công suất tại điểm đấu nối lưới: P_grid = P_load - P_pv + P_batt.
        5. Tính hóa đơn tiền điện C_elec và phạt vượt đỉnh C_peak.
        6. Tính phần thưởng chuẩn hóa r_t.
        7. Trả về obs_{t+1}, reward, terminated, truncated, info.
        """
        if isinstance(action, (list, tuple, np.ndarray)):
            action_scalar = float(action[0])
        else:
            action_scalar = float(action)

        # Lấy dữ liệu ngoại sinh tại bước t hiện tại
        row = self.day_df.iloc[self.current_step]
        p_load_t = float(row["p_load_kw"])
        p_pv_t = float(row["p_pv_kw"])
        c_grid_t = float(row["c_grid"])
        is_weekday_t = int(row["is_weekday"])
        ht = (self.current_step * self.delta_t) % 24.0

        # --- BƯỚC 1 & 2: Safety Guardrail ---
        p_cmd, p_batt, p_viol, is_clipped = self.guardrail.filter_action(action_scalar, self.delta_t)

        # --- BƯỚC 3: Cập nhật động lực học pin ---
        old_soc = self.battery.soc
        new_soc, c_deg, efc_step = self.battery.step(p_batt, self.delta_t)

        # --- BƯỚC 4: Cân bằng công suất lưới ---
        # Quy ước: P_grid > 0 là mua điện từ lưới, P_grid < 0 là bán điện lên lưới
        p_grid = p_load_t - p_pv_t + p_batt
        p_buy = max(0.0, p_grid)
        p_sell = max(0.0, -p_grid)

        # --- BƯỚC 5: Các thành phần chi phí ---
        # 5.1. Chi phí điện lưới (VNĐ)
        c_elec = (c_grid_t * p_buy - self.c_feed_in * p_sell) * self.delta_t

        # 5.2. Phạt công suất đỉnh phụ tải (Peak Shaving)
        # C_peak = [max(0, P_buy - P_th)]^2
        c_peak = float(max(0.0, p_buy - self.p_th) ** 2)

        # --- BƯỚC 6: Hàm phần thưởng đa mục tiêu ---
        # rt = - (Celec,t + w1 * Cdeg,t + w2 * Cpeak,t + w3 * Pviol,t) / Cref
        total_cost = c_elec + self.w1_wear * c_deg + self.w2_peak * c_peak + self.w3_viol * p_viol
        reward = -float(total_cost / self.c_ref)

        # Ghi nhận lịch sử bước
        step_info = {
            "step": self.current_step,
            "hour": ht,
            "p_cmd_kw": p_cmd,
            "p_batt_kw": p_batt,
            "is_clipped": is_clipped,
            "old_soc": old_soc,
            "soc": new_soc,
            "p_load_kw": p_load_t,
            "p_pv_kw": p_pv_t,
            "c_grid": c_grid_t,
            "is_weekday": is_weekday_t,
            "p_grid_kw": p_grid,
            "p_buy_kw": p_buy,
            "p_sell_kw": p_sell,
            "c_elec": c_elec,
            "c_deg": c_deg,
            "c_peak": c_peak,
            "p_viol": p_viol,
            "total_cost": total_cost,
            "reward": reward,
            "efc_step": efc_step,
        }
        self.episode_history.append(step_info)

        # Tăng bước thời gian
        self.current_step += 1

        # Điều kiện kết thúc episode: 96 bước (1 ngày)
        terminated = False
        truncated = bool(self.current_step >= self.episode_steps)

        # Lấy quan sát kế tiếp s_{t+1}
        next_obs = self._get_observation()

        return next_obs, reward, terminated, truncated, step_info

    def _get_observation(self) -> np.ndarray:
        """
        Trích xuất và chuẩn hóa vector trạng thái 7 chiều:
        st = [ SoCt, P_load,norm, P_pv,norm, C_grid,norm, sin(2pi*h/24), cos(2pi*h/24), dt ]
        """
        if self.current_step < self.episode_steps:
            row = self.day_df.iloc[self.current_step]
            p_load = float(row["p_load_kw"])
            p_pv = float(row["p_pv_kw"])
            c_grid = float(row["c_grid"])
            is_weekday = float(row["is_weekday"])
            h = float((self.current_step * self.delta_t) % 24.0)
        else:
            # Bước kết thúc (bước 96): lấy giá trị biên
            p_load = float(self.day_df.iloc[-1]["p_load_kw"])
            p_pv = 0.0
            c_grid = float(self.day_df.iloc[-1]["c_grid"])
            is_weekday = float(self.day_df.iloc[-1]["is_weekday"])
            h = 0.0

        # Chuẩn hóa trạng thái
        norm_soc = float(np.clip(self.battery.soc, 0.0, 1.0))
        norm_load = float(np.clip(p_load / max(self.p_load_max_train, 1e-5), 0.0, 1.0))
        norm_pv = float(np.clip(p_pv / max(self.p_pv_rated, 1e-5), 0.0, 1.0))
        norm_cgrid = float(np.clip(c_grid / max(self.c_grid_peak_train, 1e-5), 0.0, 1.0))
        sin_h = float(np.sin(2.0 * np.pi * h / 24.0))
        cos_h = float(np.cos(2.0 * np.pi * h / 24.0))

        obs = np.array([
            norm_soc,
            norm_load,
            norm_pv,
            norm_cgrid,
            sin_h,
            cos_h,
            is_weekday,
        ], dtype=np.float32)

        return obs

    def render(self):
        if self.render_mode == "human" and self.episode_history:
            last = self.episode_history[-1]
            print(
                f"Step {last['step']:02d} | Hour {last['hour']:04.2f}h | "
                f"SoC: {last['soc']:.3f} | Load: {last['p_load_kw']:5.1f}kW | "
                f"PV: {last['p_pv_kw']:5.1f}kW | P_batt: {last['p_batt_kw']:+5.1f}kW | "
                f"Grid: {last['p_grid_kw']:+5.1f}kW | Rew: {last['reward']:+.4f}"
            )

    def close(self):
        pass
