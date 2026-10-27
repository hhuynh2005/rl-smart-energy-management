"""
Evaluation Metrics & Pipeline.
Đánh giá hiệu năng theo Bảng 6 - Báo cáo TH2 (Nhóm 7).
Tác giả phụ trách: Nguyễn Tùng Dương (Pipeline đánh giá) & Nguyễn Văn Huỳnh (Mốc No-battery).
"""

from typing import Dict, Any, List, Optional
import numpy as np
import pandas as pd


class MetricsEvaluator:
    """
    Bộ tính toán các chỉ số kinh tế và kỹ thuật theo chuẩn Báo cáo TH2:
    - Chi phí điện ngày J (VNĐ)
    - % Chi phí tiết kiệm so với mốc No-battery
    - % Cắt đỉnh phụ tải (Peak Shaving Ratio)
    - Tỷ lệ tự tiêu thụ điện mặt trời PV (Self-consumption)
    - Số chu kỳ sạc/xả tương đương (EFC)
    - Số lần lệnh bị cắt bởi Safety Guardrail
    - Phần thưởng trung bình mỗi episode
    """

    def __init__(self, j_nobat_mean: Optional[float] = None, peak_nobat_max: Optional[float] = None):
        self.j_nobat_mean = j_nobat_mean
        self.peak_nobat_max = peak_nobat_max

    def evaluate_episode(self, episode_history: List[Dict[str, Any]]) -> Dict[str, float]:
        df = pd.DataFrame(episode_history)
        
        # 1. Tổng chi phí điện trong ngày J = sum(C_elec)
        j_cost = float(df["c_elec"].sum())
        
        # 2. Công suất mua đỉnh lớn nhất trong ngày max(P_buy)
        peak_buy = float(df["p_buy_kw"].max())
        
        # 3. Tỷ lệ tự tiêu thụ PV
        total_pv = float(df["p_pv_kw"].sum())
        total_sell = float(df["p_sell_kw"].sum())
        if total_pv > 0:
            pv_self_cons = float(np.clip(1.0 - (total_sell / total_pv), 0.0, 1.0))
        else:
            pv_self_cons = 1.0
            
        # 4. Chu kỳ sạc xả tương đương EFC
        efc = float(df["efc_step"].sum())
        
        # 5. Số lần bị cắt hành động / vi phạm
        clipped_count = int(df["is_clipped"].sum())
        
        # 6. Tổng phần thưởng
        total_reward = float(df["reward"].sum())
        
        metrics = {
            "daily_cost_j": j_cost,
            "peak_buy_kw": peak_buy,
            "pv_self_consumption": pv_self_cons,
            "efc": efc,
            "clipped_steps": clipped_count,
            "episode_reward": total_reward,
        }

        # Tính chỉ số tương đối nếu có mốc No-battery
        if self.j_nobat_mean is not None and self.j_nobat_mean > 0:
            cost_saving_pct = ((self.j_nobat_mean - j_cost) / self.j_nobat_mean) * 100.0
            metrics["cost_saving_pct"] = float(cost_saving_pct)

        if self.peak_nobat_max is not None and self.peak_nobat_max > 0:
            peak_shaving_pct = ((self.peak_nobat_max - peak_buy) / self.peak_nobat_max) * 100.0
            metrics["peak_shaving_pct"] = float(peak_shaving_pct)

        return metrics

    def summarize_results(self, all_episode_metrics: List[Dict[str, float]]) -> Dict[str, Any]:
        """Tổng hợp kết quả trung bình và độ lệch chuẩn qua nhiều ngày."""
        df_m = pd.DataFrame(all_episode_metrics)
        summary = {}
        for col in df_m.columns:
            summary[f"{col}_mean"] = float(df_m[col].mean())
            summary[f"{col}_std"] = float(df_m[col].std())
        return summary
