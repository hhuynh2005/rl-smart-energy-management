"""
SEMS-RL: Interactive Streamlit Dashboard for Microgrid BESS & Solar PV Simulation.
Giao diện trực quan hóa môi trường mô phỏng năng lượng thông minh.
Phụ trách: Nguyễn Văn Huỳnh (Nhóm trưởng) & Lý Đình Sơn (Môi trường).
"""

import sys
import os

# Đảm bảo console Windows xử lý mã hóa UTF-8
for stream in [sys.stdout, sys.stderr]:
    if hasattr(stream, "reconfigure"):
        try:
            stream.reconfigure(encoding="utf-8")
        except Exception:
            pass

import numpy as np
import pandas as pd
import streamlit as st
import plotly.graph_objects as go
from plotly.subplots import make_subplots

# Cấu hình giao diện trang Streamlit
st.set_page_config(
    page_title="SEMS-RL | Microgrid Simulation Dashboard",
    page_icon="⚡",
    layout="wide",
    initial_sidebar_state="expanded",
)

# Custom CSS cho giao diện hiện đại phong cách Clean Energy Dashboard
st.markdown("""
<style>
    .main-title {
        font-size: 2.2rem;
        font-weight: 700;
        color: #1E3A8A;
        margin-bottom: 0.2rem;
    }
    .sub-title {
        font-size: 1.05rem;
        color: #4B5563;
        margin-bottom: 1.2rem;
    }
    .badge {
        display: inline-block;
        padding: 0.25rem 0.6rem;
        font-size: 0.8rem;
        font-weight: 600;
        border-radius: 9999px;
        margin-right: 0.4rem;
    }
    .badge-gym { background-color: #DEF7EC; color: #03543F; }
    .badge-citylearn { background-color: #E1EFFE; color: #1E429F; }
    .badge-tou { background-color: #FEF08A; color: #854D0E; }
    .card-metric {
        background: linear-gradient(135deg, #F9FAFB 0%, #F3F4F6 100%);
        border-radius: 10px;
        padding: 1rem;
        border-left: 4px solid #3B82F6;
        box-shadow: 0 1px 3px rgba(0,0,0,0.08);
    }
</style>
""", unsafe_allow_html=True)

from sems_rl.envs.microgrid_env import MicrogridBessEnv
from sems_rl.envs.wrappers import NoiseWrapper
from sems_rl.baselines.no_battery import NoBatteryBaseline, RuleBasedController
from sems_rl.metrics.evaluator import MetricsEvaluator


@st.cache_resource
def get_env():
    return MicrogridBessEnv(config_path="sems_rl/config.yaml")


env = get_env()

# --- SIDEBAR: CẤU HÌNH & CHỌN KỊCH BẢN ---
st.sidebar.markdown("### ⚡ SEMS-RL Controls")
st.sidebar.markdown(
    '<span class="badge badge-gym">Gymnasium v1.0</span>'
    '<span class="badge badge-citylearn">CityLearn Architecture</span>'
    '<span class="badge badge-tou">EVN TOU 3-Tier</span>',
    unsafe_allow_html=True
)
st.sidebar.write("")

# 1. Chọn Kịch bản thử nghiệm theo Báo cáo TH2
st.sidebar.subheader("1. Chọn kịch bản vận hành")
scenario = st.sidebar.selectbox(
    "Kịch bản thử nghiệm:",
    [
        "S1: Ngày làm việc điển hình (Typical Weekday)",
        "S2: Ngày cuối tuần (Weekend - Tải thấp, không giờ cao điểm)",
        "S3: Ngày nhiều mây (Cloudy Day - PV giảm 50%)",
        "S4: Thử độ bền với Nhiễu (Robustness Test - NoiseWrapper)",
        "S5: Tùy chọn ngày tự do (Custom Date Picker)",
    ],
    index=0,
)

# Xử lý chọn ngày theo kịch bản
split = "test"
apply_noise = False

if "S1:" in scenario:
    # Tìm ngày weekday đầu tiên trong tập test
    split = "test"
    target_day = 0
elif "S2:" in scenario:
    # Tìm ngày chủ nhật trong tập test
    split = "test"
    target_day = 2  # ngày chủ nhật
elif "S3:" in scenario:
    # Ngày PV thấp
    split = "test"
    target_day = 5
elif "S4:" in scenario:
    split = "test"
    target_day = 0
    apply_noise = True
else:
    split = st.sidebar.selectbox("Phân vùng dữ liệu:", ["test", "val", "train"], index=0)
    max_days = env.data_pipeline.get_num_days(split)
    target_day = st.sidebar.slider(
        f"Chọn ngày mô phỏng (0 đến {max_days-1}):",
        min_value=0,
        max_value=max(0, max_days - 1),
        value=0,
    )

# 2. Chọn chiến lược vận hành
st.sidebar.subheader("2. Chiến lược điều khiển Pin BESS")
policy_mode = st.sidebar.radio(
    "Bộ điều khiển (Agent Strategy):",
    [
        "Mốc đối chuẩn: No-Battery (Pin nghỉ, a=0)",
        "Heuristic: Rule-Based Controller (Chuyên gia)",
        "Thủ công: Interactive Custom Schedule",
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

st.sidebar.subheader("3. Thông số kỹ thuật hệ thống")
st.sidebar.markdown(f"""
- 🔋 **Dung lượng pin BESS:** `{env.battery.e_cap:.0f} kWh`
- ⚡ **Công suất định mức:** `{env.battery.p_charge_max:.0f} kW` (0.25C)
- 🔄 **Hiệu suất sạc/xả:** `{env.battery.eta_c*100:.0f}%`
- 🛡️ **Dải SoC an toàn:** `[{env.battery.soc_min*100:.0f}%, {env.battery.soc_max*100:.0f}%]`
- ☀️ **Công suất PV định mức:** `{env.p_pv_rated:.0f} kWp`
- 🎯 **Ngưỡng công suất đỉnh:** `{env.p_th:.0f} kW`
""")

st.sidebar.warning(
    "⚠️ **Lưu ý môn học:** Các thuật toán RL (SAC, TD3, PPO, DDQN) hiện đang do các thành viên (Trường, Quang Anh, Dương, Ly) tự code. Giao diện này phục vụ nghiệm thu môi trường và chạy thử nghiệm mốc đối chứng."
)

# --- CHẠY MÔ PHỎNG ---
# Môi trường thực tế (có thể bọc NoiseWrapper nếu chọn kịch bản S4)
sim_env = env
if apply_noise:
    sim_env = NoiseWrapper(env, sigma_load=0.08, sigma_pv=0.15, seed=42)

# 1. Chạy mốc No-Battery làm căn cứ tính % tiết kiệm và cắt đỉnh
obs, info = sim_env.reset(options={"day_offset": target_day, "split": split, "initial_soc": initial_soc})
nobat_history = []
while True:
    obs, reward, term, trunc, step_info = sim_env.step(np.array([0.0], dtype=np.float32))
    nobat_history.append(step_info)
    if term or trunc:
        break
df_nobat = pd.DataFrame(nobat_history)
j_nobat = float(df_nobat["c_elec"].sum())
peak_nobat = float(df_nobat["p_buy_kw"].max())

# 2. Chạy chính sách điều khiển được chọn
obs, info = sim_env.reset(options={"day_offset": target_day, "split": split, "initial_soc": initial_soc})
rbc = RuleBasedController(p_th=env.p_th)
sim_history = []
step_idx = 0

while True:
    if policy_mode == "Mốc đối chuẩn: No-Battery (Pin nghỉ, a=0)":
        action = np.array([0.0], dtype=np.float32)
    elif policy_mode == "Heuristic: Rule-Based Controller (Chuyên gia)":
        action = rbc.select_action(obs, info)
    else:
        # Chế độ thủ công: Sạc đêm, xả chiều
        h = (step_idx * 0.25) % 24.0
        if 22.0 <= h or h < 4.0:
            act_val = 0.6  # Sạc đêm
        elif (9.5 <= h < 11.5) or (17.0 <= h < 20.0):
            act_val = -1.0 # Xả mạnh cao điểm
        else:
            act_val = 0.0
        action = np.array([act_val], dtype=np.float32)

    obs, reward, term, trunc, step_info = sim_env.step(action)
    sim_history.append(step_info)
    step_idx += 1
    if term or trunc:
        break

df_sim = pd.DataFrame(sim_history)
evaluator = MetricsEvaluator(j_nobat_mean=j_nobat, peak_nobat_max=peak_nobat)
metrics = evaluator.evaluate_episode(sim_history)

# --- NỘI DUNG CHÍNH TRÊN DASHBOARD ---
st.markdown('<div class="main-title">⚡ SEMS-RL: Dashboard Quản Lý Năng Lượng Thông Minh</div>', unsafe_allow_html=True)
st.markdown(
    f'<div class="sub-title">Mô phỏng vận hành Microgrid BESS & Solar PV trong 24 giờ (96 bước, mỗi bước 15 phút) — <b>{scenario}</b></div>',
    unsafe_allow_html=True
)

# Thẻ chỉ số tổng quan (KPI Metrics Cards)
c1, c2, c3, c4, c5 = st.columns(5)
with c1:
    cost_val = metrics["daily_cost_j"]
    saving_val = metrics.get("cost_saving_pct", 0.0)
    st.metric(
        label="💰 Chi phí điện (J)",
        value=f"{cost_val:,.0f} đ",
        delta=f"{saving_val:+.1f}% vs NoBat" if "No-Battery" not in policy_mode else None,
        delta_color="normal",
    )
with c2:
    peak_val = metrics["peak_buy_kw"]
    shaving_val = metrics.get("peak_shaving_pct", 0.0)
    st.metric(
        label="⚡ Đỉnh mua lưới (Peak)",
        value=f"{peak_val:.1f} kW",
        delta=f"{shaving_val:+.1f}% cắt đỉnh" if "No-Battery" not in policy_mode else None,
        delta_color="normal",
    )
with c3:
    st.metric(
        label="☀️ Tự tiêu thụ PV",
        value=f"{metrics['pv_self_consumption']*100:.1f} %",
        help="Tỷ lệ năng lượng mặt trời được tiêu thụ nội bộ thay vì phát ngược lên lưới giá thấp.",
    )
with c4:
    st.metric(
        label="🔄 Chu kỳ pin (EFC)",
        value=f"{metrics['efc']:.3f} cycles",
        help="Equivalent Full Cycles: Đo lường độ hao mòn pin tương đương trong ngày.",
    )
with c5:
    st.metric(
        label="🛡️ Chạm Safety Guardrail",
        value=f"{metrics['clipped_steps']}/96 bước",
        help="Số bước lệnh của Agent bị bộ lọc an toàn ghim lại để bảo vệ tuổi thọ pin trong khoảng 20% - 90%.",
    )

st.write("")

# TABS GIAO DIỆN ĐỒ THỊ PLOTLY
tab1, tab2, tab3 = st.tabs([
    "📊 Cân bằng công suất & Động lực pin",
    "📈 Phân tích cắt đỉnh & Biểu giá TOU EVN",
    "📋 Nhật ký 96 bước mô phỏng (CSV)",
])

# --- TAB 1: PLOTLY CHARTS CÂN BẰNG CÔNG SUẤT VÀ PIN ---
with tab1:
    col_chart1, col_chart2 = st.columns(2)
    
    with col_chart1:
        fig1 = go.Figure()
        # Phụ tải P_load
        fig1.add_trace(go.Scatter(
            x=df_sim["hour"], y=df_sim["p_load_kw"],
            mode="lines", name="Phụ tải (P_load)",
            line=dict(color="#F59E0B", width=2.5),
        ))
        # Phát điện mặt trời P_pv
        fig1.add_trace(go.Scatter(
            x=df_sim["hour"], y=df_sim["p_pv_kw"],
            mode="lines", name="Quang điện (P_pv)",
            fill="tozeroy", fillcolor="rgba(251, 191, 36, 0.25)",
            line=dict(color="#FBBF24", width=2),
        ))
        # Công suất sạc / xả pin P_batt
        fig1.add_trace(go.Bar(
            x=df_sim["hour"], y=df_sim["p_batt_kw"],
            name="Pin BESS (P_batt)",
            marker_color=np.where(df_sim["p_batt_kw"] >= 0, "#10B981", "#EF4444"),
            opacity=0.7,
        ))
        fig1.update_layout(
            title="<b>1. Cân bằng công suất Microgrid (24 Giờ)</b>",
            xaxis_title="Thời gian (Giờ)",
            yaxis_title="Công suất (kW)",
            hovermode="x unified",
            legend=dict(orientation="h", yanchor="bottom", y=1.02, xanchor="right", x=1),
            margin=dict(l=40, r=20, t=50, b=40),
            height=380,
        )
        st.plotly_chart(fig1, use_container_width=True)
        st.caption("💡 *P_batt > 0 (xanh): Sạc điện vào pin. P_batt < 0 (đỏ): Xả điện từ pin hỗ trợ phụ tải.*")

    with col_chart2:
        fig2 = go.Figure()
        # Vùng an toàn 20% - 90%
        fig2.add_hrect(
            y0=20, y1=90,
            fillcolor="rgba(16, 185, 129, 0.12)", line_width=0,
            annotation_text="Dải vận hành an toàn (Safe Operating Region: 20% - 90%)",
            annotation_position="top left",
        )
        # Đường SoC
        fig2.add_trace(go.Scatter(
            x=df_sim["hour"], y=df_sim["soc"] * 100,
            mode="lines+markers", name="SoC thực tế (%)",
            line=dict(color="#2563EB", width=3),
            marker=dict(size=4),
        ))
        # Đường biên 90%
        fig2.add_hline(y=90, line_dash="dash", line_color="#DC2626", annotation_text="SoC Max (90%)")
        # Đường biên 20%
        fig2.add_hline(y=20, line_dash="dash", line_color="#D97706", annotation_text="SoC Min (20%)")
        
        fig2.update_layout(
            title="<b>2. Mức sạc pin (SoC) & Vùng an toàn Safety Guardrail</b>",
            xaxis_title="Thời gian (Giờ)",
            yaxis_title="State of Charge (%)",
            yaxis=dict(range=[0, 100]),
            hovermode="x unified",
            legend=dict(orientation="h", yanchor="bottom", y=1.02, xanchor="right", x=1),
            margin=dict(l=40, r=20, t=50, b=40),
            height=380,
        )
        st.plotly_chart(fig2, use_container_width=True)
        st.caption("🛡️ *Safety Guardrail luôn đảm bảo đường cong SoC dao động nghiêm ngặt trong dải an toàn.*")

# --- TAB 2: PLOTLY CHARTS CẮT ĐỈNH VÀ BIỂU GIÁ EVN ---
with tab2:
    col_chart3, col_chart4 = st.columns(2)
    
    with col_chart3:
        fig3 = go.Figure()
        # Mua lưới khi không có pin
        fig3.add_trace(go.Scatter(
            x=df_sim["hour"], y=df_nobat["p_buy_kw"],
            mode="lines", name="Mua lưới (No-Battery)",
            line=dict(color="#9CA3AF", dash="dot", width=2),
        ))
        # Mua lưới thực tế khi có pin điều khiển
        fig3.add_trace(go.Scatter(
            x=df_sim["hour"], y=df_sim["p_buy_kw"],
            mode="lines", name="Mua lưới thực tế (P_buy)",
            line=dict(color="#8B5CF6", width=2.5),
            fill="tozeroy", fillcolor="rgba(139, 92, 246, 0.15)",
        ))
        # Ngưỡng đỉnh P_th = 90 kW
        fig3.add_hline(
            y=env.p_th, line_dash="dash", line_color="#EF4444",
            annotation_text=f"Ngưỡng phạt đỉnh P_th ({env.p_th:.0f} kW)",
            annotation_position="bottom right"
        )
        fig3.update_layout(
            title="<b>3. Hiệu quả cắt đỉnh phụ tải lưới (Peak Shaving)</b>",
            xaxis_title="Thời gian (Giờ)",
            yaxis_title="Công suất mua từ lưới (kW)",
            hovermode="x unified",
            legend=dict(orientation="h", yanchor="bottom", y=1.02, xanchor="right", x=1),
            margin=dict(l=40, r=20, t=50, b=40),
            height=380,
        )
        st.plotly_chart(fig3, use_container_width=True)
        st.caption("🎯 *Mục tiêu cắt đỉnh phụ tải: Kéo mức mua điện giờ cao điểm xuống dưới ngưỡng P_th.*")

    with col_chart4:
        # Biểu đồ giá TOU EVN và chi phí điện từng bước
        fig4 = make_subplots(specs=[[{"secondary_y": True}]])
        # Biểu giá EVN TOU
        fig4.add_trace(
            go.Scatter(
                x=df_sim["hour"], y=df_sim["c_grid"],
                mode="lines", name="Biểu giá EVN TOU (VNĐ/kWh)",
                line=dict(color="#6366F1", width=2.5, shape="hv"),
            ),
            secondary_y=False,
        )
        # Chi phí điện từng bước
        fig4.add_trace(
            go.Bar(
                x=df_sim["hour"], y=df_sim["c_elec"],
                name="Chi phí điện bước (VNĐ)",
                marker_color="#F43F5E", opacity=0.45,
            ),
            secondary_y=True,
        )
        fig4.update_xaxes(title_text="Thời gian (Giờ)")
        fig4.update_yaxes(title_text="Đơn giá (VNĐ/kWh)", secondary_y=False)
        fig4.update_yaxes(title_text="Hóa đơn bước (VNĐ)", secondary_y=True)
        fig4.update_layout(
            title="<b>4. Biểu giá điện TOU EVN & Hóa đơn tiền điện</b>",
            hovermode="x unified",
            legend=dict(orientation="h", yanchor="bottom", y=1.02, xanchor="right", x=1),
            margin=dict(l=40, r=20, t=50, b=40),
            height=380,
        )
        st.plotly_chart(fig4, use_container_width=True)
        st.caption("⏰ *Giờ cao điểm (3,000đ): 09:30-11:30 & 17:00-20:00. Thấp điểm (1,100đ): 22:00-04:00.*")

# --- TAB 3: DỮ LIỆU BẢNG VÀ XUẤT CSV ---
with tab3:
    st.subheader("Bảng dữ liệu chi tiết 96 bước thời gian (Chu kỳ 1 ngày)")
    display_cols = [
        "step", "hour", "p_load_kw", "p_pv_kw", "p_batt_kw", "p_grid_kw",
        "p_buy_kw", "p_sell_kw", "soc", "c_grid", "c_elec", "c_deg", "reward"
    ]
    st.dataframe(df_sim[display_cols], use_container_width=True)
    
    col_dl1, col_dl2 = st.columns([1, 4])
    with col_dl1:
        csv_bytes = df_sim.to_csv(index=False).encode("utf-8")
        st.download_button(
            label="📥 Tải xuống kết quả mô phỏng (CSV)",
            data=csv_bytes,
            file_name=f"sems_simulation_day_{target_day}_{split}.csv",
            mime="text/csv",
        )

st.markdown("---")
st.markdown(
    "<center><small>Báo cáo Bài tập lớn Học tăng cường & Ứng dụng — TS. Lê Nguyễn Tuấn Thành — Nhóm 7 (65KTPM, ĐH Thủy Lợi).</small></center>",
    unsafe_allow_html=True
)
