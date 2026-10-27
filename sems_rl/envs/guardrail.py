"""
Safety Guardrail for Microgrid BESS Action Projection.
Bộ lọc an toàn chiếu công suất khả thi theo chuẩn Báo cáo TH2 - Nhóm 7.
Tác giả phụ trách: Lý Đình Sơn (Safety Guardrail).
"""

from typing import Tuple
import numpy as np
from sems_rl.envs.battery import Battery


class SafetyGuardrail:
    """
    Safety Guardrail đảm bảo lệnh nạp/xả pin của Agent không bao giờ
    khiến pin vượt quá dải an toàn [SoC_min, SoC_max] hay vượt quá công suất định mức.
    
    Đồng thời tính phạt vi phạm P_viol để phản hồi cho Agent học được vùng khả thi.
    """

    def __init__(self, battery: Battery, enabled: bool = True):
        self.battery = battery
        self.enabled = enabled

    def filter_action(self, action: float, delta_t: float = 0.25) -> Tuple[float, float, float, bool]:
        """
        Chiếu hành động liên tục chuẩn hóa a_t in [-1, 1] về công suất khả thi.
        
        Args:
            action: Giá trị hành động chuẩn hóa trong [-1, 1].
            delta_t: Độ dài bước thời gian (giờ).
            
        Returns:
            p_cmd: Công suất yêu cầu ban đầu (kW).
            p_batt: Công suất thực tế sau khi chiếu qua Guardrail (kW).
            p_viol: Điểm phạt vi phạm chuẩn hóa (đưa vào hàm thưởng).
            is_clipped: Cờ đánh dấu lệnh có bị cắt bởi Guardrail hay không.
        """
        # Ánh xạ hành động liên tục chuẩn hóa thành công suất lệnh
        action = float(np.clip(action, -1.0, 1.0))
        if action >= 0:
            p_cmd = action * self.battery.p_charge_max
        else:
            p_cmd = action * self.battery.p_discharge_max

        if self.enabled:
            # Lấy biên công suất khả thi vật lý từ mô hình pin
            p_min_feas, p_max_feas = self.battery.get_feasible_power_bounds(delta_t)
            p_batt = float(np.clip(p_cmd, p_min_feas, p_max_feas))
        else:
            # Chế độ tắt Guardrail (dùng cho thí nghiệm đối chứng / Ablation Study)
            p_batt = float(np.clip(p_cmd, -self.battery.p_discharge_max, self.battery.p_charge_max))

        # Phạt vi phạm bậc hai chuẩn hóa theo công suất sạc cực đại
        p_max_ref = max(self.battery.p_charge_max, 1e-6)
        p_viol = float(((p_cmd - p_batt) / p_max_ref) ** 2)
        is_clipped = bool(abs(p_cmd - p_batt) > 1e-4)

        return p_cmd, p_batt, p_viol, is_clipped
