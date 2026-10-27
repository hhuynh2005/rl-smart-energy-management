"""
SEMS-RL: Interactive Streamlit Dashboard for Microgrid BESS & Solar PV Simulation.
Giao diện trực quan hóa môi trường mô phỏng năng lượng thông minh.
Phụ trách: Nguyễn Văn Huỳnh (Nhóm trưởng) & Lý Đình Sơn (Môi trường).
"""

import sys
import os
import numpy as np
import pandas as pd
import streamlit as st

# Cấu hình trang Streamlit
st.set_page_config(
    page_title="SEMS-RL | Microgrid Simulation Dashboard",
    page_icon="⚡",
    layout="wide",
    initial_sidebar_state="expanded",
)

from sems_rl.envs.microgrid_env import MicrogridBessEnv
from sems_rl.baselines.no_battery import NoBatteryBaseline, RuleBasedController
from sems_rl.metrics.evaluator import MetricsEvaluator


@st.cache_resource
def get_env():
    return MicrogridBessEnv(config_path="sems_rl/config.yaml")


env = get_env()

# --- SIDEBAR: CẤU HÌNH & CHỌN KỊCH BẢN ---
st.sidebar.image("https://img.icons8.com/fluency/96/solar-panel.png", width=80)
st.sidebar.title("⚡ SEMS-RL Controls")
st.sidebar.caption("Smart Energy Management System (Nhóm 7 - 65KTPM)")

st.sidebar.header("1. Phân vùng dữ liệu")
split = st.sidebar.selectbox("Chọn tập dữ liệu:", ["test", "val", "train"], index=0)
num_days_available = env.data_pipeline.get_num_days(split)

day_offset = st.sidebar.slider(
    f"Chọn ngày mô phỏng (trong tập {split.upper()}):",
    min_value=0,
    max_value=max(0, num_days_available - 1),
    value=0,
    step=1,
)

st.sidebar.header("2. Chế độ vận hành Pin BESS")
policy_mode = st.sidebar.radio(
    "Chiến lược điều khiển:",
    [
        "Mốc đối chuẩn: No-Battery (Không dùng pin)",
        "Heuristic: Rule-Based Controller",
        "Thủ công: Interactive Schedule",
    ],
    index=1,
)

initial_soc = st.sidebar.slider(
    "Mức sạc pin ban đầu (SoC 00:00):",
    min_value=0.20,
    max_value=0.90,
    value=0.50,
    step=0.05,
    format="%.2f",
)

st.sidebar.header("3. Thông số hệ thống BESS")
st.sidebar.markdown(
    f"""
- **Dung lượng pin:** `{env.battery.e_cap:.0f} kWh`
- **Công suất cực đại:** `{env.battery.p_charge_max:.0f} kW` (0.25C)
- **Hiệu suất sạc/xả:** `{env.battery.eta_c*100:.0f}%`
- **Dải SoC an toàn:** `[{env.battery.soc_min*100:.0f}%, {env.battery.soc_max*100:.0f}%]`
- **Công suất PV định mức:** `{env.p_pv_rated:.0f} kWp`
- **Ngưỡng đỉnh lưới (P_th):** `{env.p_th:.0f} kW`
"""
)

st.sidebar.info(
    "ℹ️ **Lưu ý:** Các thuật toán học tăng cường (SAC, TD3, PPO, DDQN) hiện đang được các thành viên (Trường, Quang Anh, Dương, Ly) tự phát triển và huấn luyện theo phân công. Giao diện hiện tại phục vụ kiểm thử môi trường và chạy thử các mốc đối chuẩn."
)

# --- CHẠY MÔ PHỎNG ---
# 1. Chạy mốc No-Battery làm căn cứ tính % tiết kiệm
obs, info = env.reset(options={"day_offset": day_offset, "split": split, "initial_soc": initial_soc})
nobat_history = []
while True:
    obs, reward, term, trunc, step_info = env.step(np.array([0.0], dtype=np.float32))
    nobat_history.append(step_info)
    if term or trunc:
        break
df_nobat = pd.DataFrame(nobat_history)
j_nobat = float(df_nobat["c_elec"].sum())
peak_nobat = float(df_nobat["p_buy_kw"].max())

# 2. Chạy chính sách người dùng lựa chọn
obs, info = env.reset(options={"day_offset": day_offset, "split": split, "initial_soc": initial_soc})
rbc = RuleBasedController(p_th=env.p_th)
sim_history = []

step_idx = 0
while True:
    if policy_mode == "Mốc đối chuẩn: No-Battery (Không dùng pin)":
        action = np.array([0.0], dtype=np.float32)
    elif policy_mode == "Heuristic: Rule-Based Controller":
        action = rbc.select_action(obs, info)
    else:
        # Thủ công: Sạc đêm, xả chiều
        h = (step_idx * 0.25) % 24.0
        if 22.0 <= h or h < 4.0:
            act_val = 0.6  # Sạc thấp điểm
        elif (9.5 <= h < 11.5) or (17.0 <= h < 20.0):
            act_val = -1.0 # Xả cao điểm
        else:
            act_val = 0.0
        action = np.array([act_val], dtype=np.float32)

    obs, reward, term, trunc, info = env.step(action)
    sim_history.append(info)
    step_idx += 1
    if term or trunc:
        break

df_sim = pd.DataFrame(sim_history)
evaluator = MetricsEvaluator(j_nobat_mean=j_nobat, peak_nobat_max=peak_nobat)
metrics = evaluator.evaluate_episode(sim_history)

# --- GIAO DIỆN CHÍNH ---
st.title("🔋 SEMS-RL: Dashboard Mô Phỏng Năng Lượng Thông Minh")
st.markdown(
    f"Mô phỏng vận hành 24 giờ (96 bước, mỗi bước 15 phút) trên tập dữ liệu **{split.upper()}** (Ngày thứ {day_offset+1}/{num_days_available})."
)

# Thẻ chỉ số KPI Cards
col1, col2, col3, col4, col5 = st.columns(5)
with col1:
    cost_val = metrics["daily_cost_j"]
    saving_val = metrics.get("cost_saving_pct", 0.0)
    st.metric(
        "💰 Chi phí điện (J)",
        f"{cost_val:,.0f} đ",
        delta=f"{saving_val:+.1f}% vs NoBat" if policy_mode != "Mốc đối chuẩn: No-Battery (Không dùng pin)" else None,
        delta_color="normal",
    )
with col2:
    peak_val = metrics["peak_buy_kw"]
    shaving_val = metrics.get("peak_shaving_pct", 0.0)
    st.metric(
        "⚡ Đỉnh mua lưới (Peak)",
        f"{peak_val:.1f} kW",
        delta=f"{shaving_val:+.1f}% cắt đỉnh" if policy_mode != "Mốc đối chuẩn: No-Battery (Không dùng pin)" else None,
        delta_color="normal",
    )
with col3:
    st.metric(
        "☀️ Tự tiêu thụ PV",
        f"{metrics['pv_self_consumption']*100:.1f} %",
        help="Tỷ lệ năng lượng mặt trời được tiêu thụ nội bộ thay vì phát ngược lên lưới giá rẻ.",
    )
with col4:
    st.metric(
        "🔄 Chu kỳ pin (EFC)",
        f"{metrics['efc']:.3f} cycles",
        help="Equivalent Full Cycles: Độ hao mòn pin tương đương trong ngày.",
    )
with col5:
    st.metric(
        "🛡️ Lệnh chạm Safety Guardrail",
        f"{metrics['clipped_steps']}/96 bước",
        help="Số bước lệnh công suất của Agent bị bộ lọc an toàn ghim lại để bảo vệ pin.",
    )

st.divider()

# BIỂU ĐỒ 1 & 2
tab1, tab2, tab3 = st.tabs(["📈 Biểu đồ cân bằng công suất & Pin", "💡 Phân tích biểu giá EVN & Lưới", "📋 Dữ liệu bảng chi tiết"])

with tab1:
    col_a, col_b = st.columns(2)
    with col_a:
        st.subheader("1. Cân bằng công suất Microgrid (24h)")
        chart_p = pd.DataFrame({
            "Giờ": df_sim["hour"],
            "Phụ tải (P_load)": df_sim["p_load_kw"],
            "Mặt trời (P_pv)": df_sim["p_pv_kw"],
            "Pin sạc/xả (P_batt)": df_sim["p_batt_kw"],
            "Lưới mua (P_buy)": df_sim["p_buy_kw"],
        }).set_index("Giờ")
        st.line_chart(chart_p, height=340)
        st.caption("Ghi chú: P_batt > 0 là sạc pin (lấy từ PV/lưới), P_batt < 0 là xả pin cấp cho tải.")

    with col_b:
        st.subheader("2. Mức sạc pin (State of Charge - SoC)")
        df_soc = pd.DataFrame({
            "Giờ": df_sim["hour"],
            "SoC thực tế": df_sim["soc"] * 100,
            "Ngưỡng an toàn Max (90%)": 90.0,
            "Ngưỡng an toàn Min (20%)": 20.0,
        }).set_index("Giờ")
        st.line_chart(df_soc, height=340, color=["#00CC96", "#EF553B", "#FFA15A"])
        st.caption("Safety Guardrail đảm bảo SoC luôn luôn dao động chặt chẽ trong dải [20%, 90%].")

with tab2:
    col_c, col_d = st.columns(2)
    with col_c:
        st.subheader("3. Biểu giá điện TOU EVN (VNĐ/kWh)")
        chart_tou = pd.DataFrame({
            "Giờ": df_sim["hour"],
            "Đơn giá mua (C_grid)": df_sim["c_grid"],
            "Đơn giá bán (C_feed-in)": env.c_feed_in,
        }).set_index("Giờ")
        st.line_chart(chart_tou, height=340, color=["#AB63FA", "#19D3F3"])
        st.caption("3 mức giá: Thấp điểm (1,100đ, 22h-4h), Bình thường (1,800đ), Cao điểm (3,000đ, 9h30-11h30 & 17h-20h).")

    with col_d:
        st.subheader("4. Cắt đỉnh phụ tải (Peak Shaving)")
        chart_peak = pd.DataFrame({
            "Giờ": df_sim["hour"],
            "Mua lưới thực tế": df_sim["p_buy_kw"],
            "Mua lưới nếu No-Battery": df_nobat["p_buy_kw"],
            "Ngưỡng đỉnh (P_th = 90 kW)": env.p_th,
        }).set_index("Giờ")
        st.line_chart(chart_peak, height=340, color=["#636EFA", "#EF553B", "#000000"])
        st.caption("So sánh công suất mua đỉnh khi có pin điều khiển thông minh vs khi không có pin.")

with tab3:
    st.subheader("Dữ liệu chi tiết 96 bước trong ngày")
    st.dataframe(
        df_sim[[
            "step", "hour", "p_load_kw", "p_pv_kw", "p_batt_kw", "p_grid_kw",
            "p_buy_kw", "p_sell_kw", "soc", "c_grid", "c_elec", "c_deg", "reward"
        ]],
        use_container_width=True,
    )
    csv_data = df_sim.to_csv(index=False).encode("utf-8")
    st.download_button(
        label="📥 Tải xuống kết quả mô phỏng (CSV)",
        data=csv_data,
        file_name=f"simulation_day_{day_offset}_{split}.csv",
        mime="text/csv",
    )

st.markdown("---")
st.caption("Bản quyền © 2026 Nhóm 7 (SEMS-RL) - Khoa CNTT, Đại học Thủy Lợi.")
