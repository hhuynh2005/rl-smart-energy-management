"""
Data Pipeline for SEMS-RL Microgrid.
Quy trình tiền xử lý, tính thống kê chuẩn hóa trên tập Train và phân chia tập dữ liệu.
Tác giả phụ trách: Nguyễn Văn Huỳnh (Nhóm trưởng - Dữ liệu chuỗi thời gian).
"""

import os
import sys

# Ensure UTF-8 console output on Windows to prevent UnicodeEncodeError
for stream in [sys.stdout, sys.stderr]:
    if hasattr(stream, "reconfigure"):
        try:
            stream.reconfigure(encoding="utf-8")
        except Exception:
            pass

from typing import Dict, Tuple, Optional
import numpy as np
import pandas as pd


class DataPipeline:
    """
    Quản lý dữ liệu chuỗi thời gian cho MicrogridBessEnv:
    - Nạp dữ liệu phụ tải, phát quang điện, giá TOU và cờ ngày làm việc.
    - Chia tuần tự không xáo trộn (Train 70%, Val 15%, Test 15%) để tránh rò rỉ thông tin.
    - Thống kê chuẩn hóa (max tải, giá đỉnh, C_ref) CHỈ tính trên tập huấn luyện.
    - Cung cấp dữ liệu theo từng ngày (mỗi ngày = 96 bước 15 phút).
    """

    def __init__(
        self,
        csv_path: str = "data/processed.csv",
        train_ratio: float = 0.70,
        val_ratio: float = 0.15,
        test_ratio: float = 0.15,
        p_pv_rated: float = 150.0,
        delta_t: float = 0.25,
        steps_per_day: int = 96,
    ):
        self.csv_path = csv_path
        self.train_ratio = train_ratio
        self.val_ratio = val_ratio
        self.test_ratio = test_ratio
        self.p_pv_rated = float(p_pv_rated)
        self.delta_t = float(delta_t)
        self.steps_per_day = steps_per_day

        if not os.path.exists(csv_path):
            from sems_rl.data.generator import generate_synthetic_microgrid_dataset
            print(f"[DataPipeline] CSV not found at '{csv_path}'. Generating 365-day dataset...")
            generate_synthetic_microgrid_dataset(output_path=csv_path)

        self.df_raw = pd.read_csv(csv_path)
        self._validate_and_clean()
        self._split_and_compute_stats()

    def _validate_and_clean(self):
        """Kiểm tra cột, làm sạch và đảm bảo số dòng là bội số của steps_per_day (96)."""
        required_cols = ["p_load_kw", "p_pv_kw", "c_grid", "is_weekday"]
        for col in required_cols:
            if col not in self.df_raw.columns:
                raise ValueError(f"Dữ liệu thiếu cột bắt buộc: {col}")

        # Điền khuyết tật nhỏ nếu có
        self.df_raw = self.df_raw.ffill().bfill()

        # Cắt bớt phần lẻ để vừa đúng số ngày nguyên vẹn
        total_days = len(self.df_raw) // self.steps_per_day
        self.df = self.df_raw.iloc[: total_days * self.steps_per_day].copy()
        self.total_days = total_days

    def _split_and_compute_stats(self):
        """Chia train/val/test theo thời gian và tính toán các tham số chuẩn hóa."""
        n_train_days = int(self.total_days * self.train_ratio)
        n_val_days = int(self.total_days * self.val_ratio)
        n_test_days = self.total_days - n_train_days - n_val_days

        self.splits = {
            "train": (0, n_train_days),
            "val": (n_train_days, n_train_days + n_val_days),
            "test": (n_train_days + n_val_days, self.total_days),
        }

        # Chỉ trích xuất tập Train để tính toán thống kê chuẩn hóa
        train_end_idx = n_train_days * self.steps_per_day
        train_df = self.df.iloc[:train_end_idx]

        self.p_load_max_train = float(train_df["p_load_kw"].max())
        self.c_grid_peak_train = float(train_df["c_grid"].max())
        
        # Chi phí tham chiếu C_ref = mean(c_grid) * mean(p_load) * delta_t
        c_mean = float(train_df["c_grid"].mean())
        p_load_mean = float(train_df["p_load_kw"].mean())
        self.c_ref = float(c_mean * p_load_mean * self.delta_t)
        if self.c_ref <= 0:
            self.c_ref = 27000.0  # Giá trị phòng thủ dự phòng (VNĐ/bước)

        print(f"[DataPipeline] Split: Train={n_train_days} days, Val={n_val_days} days, Test={n_test_days} days.")
        print(f"[DataPipeline] Train Stats: P_load_max={self.p_load_max_train:.2f} kW, C_peak={self.c_grid_peak_train:.1f} VND, C_ref={self.c_ref:.1f} VND/step.")

    def get_num_days(self, split: str = "train") -> int:
        start_day, end_day = self.splits[split]
        return end_day - start_day

    def get_day_data(self, day_offset: int, split: str = "train") -> pd.DataFrame:
        """
        Lấy 96 bước dữ liệu của một ngày cụ thể trong phân vùng chỉ định.
        """
        start_day, end_day = self.splits[split]
        day_idx = start_day + day_offset
        if not (start_day <= day_idx < end_day):
            raise IndexError(f"Day offset {day_offset} out of range for split '{split}' [{0}, {end_day - start_day - 1}]")

        row_start = day_idx * self.steps_per_day
        row_end = row_start + self.steps_per_day
        return self.df.iloc[row_start:row_end].reset_index(drop=True)

    def sample_day_data(self, split: str = "train", np_random: Optional[np.random.Generator] = None) -> Tuple[int, pd.DataFrame]:
        """
        Chọn ngẫu nhiên một ngày trong tập split được chọn.
        """
        num_days = self.get_num_days(split)
        if np_random is not None:
            day_offset = int(np_random.integers(0, num_days))
        else:
            day_offset = int(np.random.randint(0, num_days))
        return day_offset, self.get_day_data(day_offset, split=split)
