"""
Realistic Microgrid Data Generator (CityLearn / Pecan Street & NREL PV Style).
Tạo dữ liệu phụ tải và điện mặt trời thực tế với tần suất 15 phút (96 bước/ngày)
và biểu giá điện TOU theo quy định của EVN.
Tác giả phụ trách: Nguyễn Thị Cẩm Ly (Dữ liệu chuỗi thời gian).
"""

import os
from typing import Optional
import numpy as np
import pandas as pd


def generate_synthetic_microgrid_dataset(
    output_path: str = "data/processed.csv",
    num_days: int = 365,
    p_load_peak: float = 120.0,
    p_pv_rated: float = 150.0,
    seed: int = 42,
) -> pd.DataFrame:
    """
    Tạo bộ dữ liệu chuỗi thời gian phụ tải và phát PV 15 phút (96 bước/ngày) cho 1 năm.
    
    Đặc điểm mô phỏng phỏng theo CityLearn / Pecan Street / NREL:
    - Phụ tải tòa nhà văn phòng/nhà máy: Tải ban ngày cao (07:30 - 18:30), thấp ban đêm;
      ngày làm việc tải cao hơn cuối tuần.
    - Phát PV: Theo phân bố đường cong nhật xạ mặt trời (06:00 - 18:00), đỉnh vào 11:30 - 13:00,
      kèm theo các ngày nhiều mây hoặc bóng mây ngẫu nhiên.
    - Biểu giá TOU EVN: 3 mức giá (Cao điểm, Bình thường, Thấp điểm).
    """
    np.random.seed(seed)
    
    # 96 bước mỗi ngày (15 phút một bước)
    steps_per_day = 96
    total_steps = num_days * steps_per_day
    
    start_time = pd.Timestamp("2026-01-01 00:00:00")
    timestamps = [start_time + pd.Timedelta(minutes=15 * i) for i in range(total_steps)]
    
    # Giờ trong ngày (0.0 đến 23.75)
    hours = np.array([ts.hour + ts.minute / 60.0 for ts in timestamps])
    # Ngày trong tuần: 0=Mon, 1=Tue, ..., 5=Sat, 6=Sun
    # Theo biểu giá EVN: Thứ 2 đến Thứ 7 là ngày làm việc/bình thường có giờ cao điểm, Chủ Nhật không có giờ cao điểm
    day_of_week = np.array([ts.dayofweek for ts in timestamps])
    is_weekday = np.array([1 if d < 6 else 0 for d in day_of_week], dtype=np.int32)
    
    # --- 1. MÔ PHỎNG PHỤ TẢI (CityLearn / Pecan Street Style) ---
    p_loads = []
    for i, h in enumerate(hours):
        weekday = is_weekday[i]
        # Hình dạng phụ tải cơ bản: 2 đỉnh (sáng ~10h, chiều ~15h)
        base = 25.0  # Tải nền ban đêm (cooling, standby, an ninh)
        if weekday == 1:
            # Ngày thường: Giờ làm việc 07:30 - 18:00
            day_profile = (
                60.0 * np.exp(-((h - 10.5) ** 2) / 8.0)
                + 55.0 * np.exp(-((h - 15.0) ** 2) / 8.0)
            )
        else:
            # Cuối tuần: Tải giảm 50%
            day_profile = (
                30.0 * np.exp(-((h - 11.0) ** 2) / 10.0)
                + 25.0 * np.exp(-((h - 15.5) ** 2) / 10.0)
            )
        
        # Biến thiên theo mùa (mùa hè tải điều hòa nhiệt độ cao hơn)
        day_idx = i // steps_per_day
        seasonal_factor = 1.0 + 0.15 * np.sin(2 * np.pi * (day_idx - 80) / 365)
        
        # Nhiễu ngẫu nhiên tức thời
        noise = np.random.normal(0, 3.5)
        
        load = (base + day_profile) * seasonal_factor + noise
        p_loads.append(max(5.0, load))
        
    p_loads = np.array(p_loads)
    # Co giãn về công suất đỉnh mong muốn (~120 kW)
    p_loads = p_loads * (p_load_peak / np.percentile(p_loads, 99.5))
    
    # --- 2. MÔ PHỎNG NĂNG LƯỢNG MẶT TRỜI (NREL PVWatts Style) ---
    p_pvs = []
    # Xác định trước các ngày mây (mỗi tuần có khoảng 1-2 ngày mây âm u)
    cloudy_days = np.random.rand(num_days) < 0.22
    
    for i, h in enumerate(hours):
        day_idx = i // steps_per_day
        is_cloudy = cloudy_days[day_idx]
        
        if 6.0 <= h <= 18.0:
            # Đường cong bức xạ hình sin nửa chu kỳ (06h - 18h)
            rad = np.sin(np.pi * (h - 6.0) / 12.0)
            rad = max(0.0, rad) ** 1.3
            
            # Yếu tố mây
            if is_cloudy:
                cloud_reduction = np.random.uniform(0.3, 0.6)
            else:
                cloud_reduction = np.random.uniform(0.85, 1.0)
                
            pv = p_pv_rated * rad * cloud_reduction
        else:
            pv = 0.0
            
        p_pvs.append(max(0.0, pv))
        
    p_pvs = np.array(p_pvs)
    
    # --- 3. BIỂU GIÁ ĐIỆN TOU CỦA EVN (VNĐ/kWh) ---
    c_grids = []
    for i, h in enumerate(hours):
        weekday = is_weekday[i]
        
        # Thấp điểm: 22:00 - 04:00 (tất cả các ngày)
        if h >= 22.0 or h < 4.0:
            price = 1100.0
        # Chủ Nhật: Không có giờ cao điểm (04:00 - 22:00 là giờ bình thường)
        elif weekday == 0:
            price = 1800.0
        # Thứ 2 - Thứ 7:
        else:
            # Cao điểm: 09:30 - 11:30 và 17:00 - 20:00
            if (9.5 <= h < 11.5) or (17.0 <= h < 20.0):
                price = 3000.0
            else:
                price = 1800.0
                
        c_grids.append(price)
        
    c_grids = np.array(c_grids)
    
    # Tạo DataFrame
    df = pd.DataFrame({
        "timestamp": timestamps,
        "p_load_kw": np.round(p_loads, 2),
        "p_pv_kw": np.round(p_pvs, 2),
        "c_grid": np.round(c_grids, 2),
        "is_weekday": is_weekday,
    })
    
    if output_path:
        os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
        df.to_csv(output_path, index=False)
        print(f"[DataGenerator] Đã tạo thành công {len(df)} dòng dữ liệu ({num_days} ngày) tại: {output_path}")
        
    return df


if __name__ == "__main__":
    generate_synthetic_microgrid_dataset()
