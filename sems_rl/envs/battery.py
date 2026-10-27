"""
Battery Energy Storage System (BESS) Dynamics Model.
Mô hình động lực học pin BESS theo chuẩn CityLearn và Báo cáo TH2 - Nhóm 7.
Tác giả phụ trách: Lý Đình Sơn (Kiến trúc & Động lực học pin).
"""

from typing import Tuple
import numpy as np


class Battery:
    """
    Mô hình pin BESS (Lithium-ion) phục vụ quản lý năng lượng Microgrid.
    
    Quy ước dấu:
    - P_batt > 0: Nạp điện từ hệ thống vào pin (Charging).
    - P_batt < 0: Xả điện từ pin ra hệ thống (Discharging).
    """

    def __init__(
        self,
        e_cap: float = 200.0,
        p_charge_max: float = 50.0,
        p_discharge_max: float = 50.0,
        eta_c: float = 0.92,
        eta_d: float = 0.92,
        soc_min: float = 0.20,
        soc_max: float = 0.90,
        soc_init_low: float = 0.30,
        soc_init_high: float = 0.70,
        c_bat: float = 3000000.0,
        n_cycle: int = 4000,
        dod: float = 0.80,
    ):
        self.e_cap = float(e_cap)
        self.p_charge_max = float(p_charge_max)
        self.p_discharge_max = float(p_discharge_max)
        self.eta_c = float(eta_c)
        self.eta_d = float(eta_d)
        self.soc_min = float(soc_min)
        self.soc_max = float(soc_max)
        self.soc_init_low = float(soc_init_low)
        self.soc_init_high = float(soc_init_high)
        
        # Chi phí hao mòn chu kỳ cwear (VNĐ/kWh thông qua pin)
        # cwear = Cbat / (2 * Ncycle * DoD)
        self.c_wear = float(c_bat) / (2.0 * float(n_cycle) * float(dod))
        
        self.soc: float = 0.5
        self.total_throughput_kwh: float = 0.0
        self.total_efc: float = 0.0

    def reset(self, initial_soc: float = None, np_random: np.random.Generator = None) -> float:
        """
        Khởi tạo lại trạng thái pin cho một episode mới.
        Nếu không chỉ định, SoC ban đầu lấy ngẫu nhiên trong [soc_init_low, soc_init_high].
        """
        if initial_soc is not None:
            self.soc = float(np.clip(initial_soc, self.soc_min, self.soc_max))
        else:
            if np_random is not None:
                self.soc = float(np_random.uniform(self.soc_init_low, self.soc_init_high))
            else:
                self.soc = float(np.random.uniform(self.soc_init_low, self.soc_init_high))
        
        self.total_throughput_kwh = 0.0
        self.total_efc = 0.0
        return self.soc

    def get_feasible_power_bounds(self, delta_t: float = 0.25) -> Tuple[float, float]:
        """
        Tính toán biên công suất sạc và xả khả thi tại bước t sao cho
        SoC sau bước vận hành luôn nằm an toàn trong [soc_min, soc_max]:
        
        Pmaxfeas,t = min(Pcharge,max, (SoCmax - SoCt) * Ecap / (eta_c * delta_t))
        Pminfeas,t = -min(Pdischarge,max, (SoCt - SoCmin) * Ecap * eta_d / delta_t)
        
        Returns:
            (p_min_feas, p_max_feas): dải công suất khả thi [kW] (p_min_feas <= 0 <= p_max_feas)
        """
        # Công suất sạc khả thi tối đa (P >= 0)
        p_max_energy = (self.soc_max - self.soc) * self.e_cap / (self.eta_c * delta_t)
        p_max_feas = max(0.0, min(self.p_charge_max, p_max_energy))
        
        # Công suất xả khả thi tối đa (P <= 0, biểu diễn dưới dạng số âm)
        p_min_energy = (self.soc - self.soc_min) * self.e_cap * self.eta_d / delta_t
        p_min_feas = -max(0.0, min(self.p_discharge_max, p_min_energy))
        
        return p_min_feas, p_max_feas

    def step(self, p_batt: float, delta_t: float = 0.25) -> Tuple[float, float, float]:
        """
        Cập nhật động lực học pin với công suất thực tế p_batt [kW].
        
        Công thức chuyển trạng thái SoC:
        - Nạp (p_batt > 0): Delta_SoC = eta_c * p_batt * delta_t / Ecap
        - Xả (p_batt < 0): Delta_SoC = p_batt * delta_t / (eta_d * Ecap)
        
        Returns:
            new_soc: Mức pin sau cập nhật [0, 1]
            c_deg: Chi phí hao mòn chu kỳ [VNĐ]
            efc_step: Số chu kỳ sạc/xả tương đương tích lũy trong bước
        """
        if p_batt > 0:
            # Nạp: Lượng năng lượng tích trữ = eta_c * p_batt * delta_t
            delta_soc = (self.eta_c * p_batt * delta_t) / self.e_cap
        elif p_batt < 0:
            # Xả: Lượng năng lượng pin mất = (p_batt / eta_d) * delta_t (p_batt âm)
            delta_soc = (p_batt * delta_t) / (self.eta_d * self.e_cap)
        else:
            delta_soc = 0.0

        # Cập nhật SoC và ghim về [0, 1] để bảo đảm giới hạn vật lý
        self.soc = float(np.clip(self.soc + delta_soc, 0.0, 1.0))

        # Tính hao mòn và EFC
        energy_step = abs(p_batt) * delta_t
        self.total_throughput_kwh += energy_step
        c_deg = self.c_wear * energy_step
        efc_step = energy_step / (2.0 * self.e_cap)
        self.total_efc += efc_step

        return self.soc, c_deg, efc_step
