"""
Baseline Benchmarks: No-Battery Baseline & Rule-Based Heuristic Controller.
Mốc đối chuẩn không sử dụng pin (No-battery) để tính % chi phí tiết kiệm và % cắt đỉnh phụ tải.
Tác giả phụ trách: Nguyễn Văn Huỳnh (Mốc No-battery & Baseline).
"""

from typing import Dict, Any, List
import numpy as np
import pandas as pd
from sems_rl.envs.microgrid_env import MicrogridBessEnv


class NoBatteryBaseline:
    """
    Mốc tham chiếu No-Battery (pin không hoạt động, a_t = 0.0 ở mọi bước).
    Toàn bộ phụ tải được bù đắp trực tiếp bằng điện mặt trời PV và lưới điện EVN.
    """

    def __init__(self, env: MicrogridBessEnv):
        self.env = env

    def evaluate(self, num_days: int = None, split: str = "test") -> Dict[str, Any]:
        """
        Chạy đánh giá mốc No-battery trên toàn bộ tập chỉ định.
        """
        max_days = self.env.data_pipeline.get_num_days(split)
        if num_days is None or num_days > max_days:
            num_days = max_days

        daily_costs = []
        daily_peak_buys = []
        daily_pv_self_consumptions = []
        daily_feed_in_revenues = []

        for d in range(num_days):
            obs, info = self.env.reset(options={"day_offset": d, "split": split, "initial_soc": 0.5})
            terminated = False
            truncated = False

            day_cost = 0.0
            day_peak = 0.0
            total_pv = 0.0
            total_sell = 0.0

            while not (terminated or truncated):
                # Pin không sạc không xả (a = 0.0)
                action = np.array([0.0], dtype=np.float32)
                obs, reward, terminated, truncated, step_info = self.env.step(action)

                day_cost += step_info["c_elec"]
                day_peak = max(day_peak, step_info["p_buy_kw"])
                total_pv += step_info["p_pv_kw"]
                total_sell += step_info["p_sell_kw"]

            daily_costs.append(day_cost)
            daily_peak_buys.append(day_peak)
            pv_self_cons = 1.0 - (total_sell / max(total_pv, 1e-5)) if total_pv > 0 else 1.0
            daily_pv_self_consumptions.append(np.clip(pv_self_cons, 0.0, 1.0))

        return {
            "num_days": num_days,
            "split": split,
            "mean_daily_cost_j": float(np.mean(daily_costs)),
            "std_daily_cost_j": float(np.std(daily_costs)),
            "total_cost_j": float(np.sum(daily_costs)),
            "max_peak_buy_kw": float(np.max(daily_peak_buys)),
            "mean_peak_buy_kw": float(np.mean(daily_peak_buys)),
            "mean_pv_self_consumption": float(np.mean(daily_pv_self_consumptions)),
        }


class RuleBasedController:
    """
    Bộ điều khiển theo luật chuyên gia (Rule-Based Heuristic Baseline):
    - Đêm (22:00 - 04:00, giá thấp điểm): Sạc pin công suất vừa (a = +0.6)
    - Giờ thừa PV (P_pv > P_load): Tận dụng sạc tối đa (a = +1.0)
    - Giờ cao điểm (09:30 - 11:30 & 17:00 - 20:00): Xả pin triệt để cắt đỉnh (a = -1.0)
    - Các khung giờ còn lại: Xả nhẹ nếu tải cao hơn ngưỡng P_th, hoặc nghỉ (a = 0.0)
    """

    def __init__(self, p_th: float = 90.0):
        self.p_th = p_th

    def select_action(self, obs: np.ndarray, info: Dict[str, Any]) -> np.ndarray:
        hour = float(info.get("hour", 0.0))
        p_load = float(info.get("p_load_kw", 0.0))
        p_pv = float(info.get("p_pv_kw", 0.0))
        is_weekday = int(info.get("is_weekday", 1))

        # 1. Thừa năng lượng mặt trời -> Sạc pin
        if p_pv > p_load + 10.0:
            return np.array([1.0], dtype=np.float32)

        # 2. Giờ cao điểm thứ 2 - thứ 7: Xả pin tối đa
        if is_weekday == 1:
            if (9.5 <= hour < 11.5) or (17.0 <= hour < 20.0):
                return np.array([-1.0], dtype=np.float32)

        # 3. Giờ thấp điểm ban đêm (22h - 4h): Sạc pin
        if hour >= 22.0 or hour < 4.0:
            return np.array([0.6], dtype=np.float32)

        # 4. Khi tải vượt ngưỡng đỉnh P_th: Xả hỗ trợ cắt đỉnh
        if p_load - p_pv > self.p_th:
            return np.array([-0.8], dtype=np.float32)

        # 5. Mặc định: Giữ pin
        return np.array([0.0], dtype=np.float32)
