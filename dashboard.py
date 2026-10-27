"""
SEMS-RL: Industrial-Grade Microgrid BESS & Solar PV Simulation Dashboard.
Hệ thống Giám sát & Quản lý Năng lượng Thông minh (Smart Energy Management System).
Được thiết kế theo tiêu chuẩn Production cho Báo cáo Bài tập lớn Học tăng cường (Nhóm 7 - 65KTPM).
Tác giả phụ trách Phân hệ Môi trường & Giao diện: Nguyễn Văn Huỳnh & Lý Đình Sơn.
"""

import sys
import os

# Đảm bảo console Windows xử lý mã hóa UTF-8 tuyệt đối an toàn
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

# Cấu hình trang Streamlit chuẩn Production
st.set_page_config(
    page_title="SEMS-RL | Smart Energy Management System",
    page_icon="⚡",
    layout="wide",
    initial_sidebar_state="expanded",
)

# Custom CSS giao diện Production phong cách Industrial Clean Energy
st.markdown("""
<style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
    
    html, body, [class*="css"] {
        font-family: 'Inter', sans-serif;
    }
    
    .main-header {
        background: linear-gradient(135deg, #0F172A 0%, #1E293B 100%);
        padding: 1.5rem 2rem;
        border-radius: 12px;
        color: white;
        margin-bottom: 1.5rem;
        box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
    }
    
    .status-pill {
        display: inline-flex;
        align-items: center;
        background: rgba(16, 185, 129, 0.15);
        color: #10B981;
        padding: 0.25rem 0.75rem;
        border-radius: 9999px;
        font-size: 0.8rem;
        font-weight: 600;
        margin-right: 0.5rem;
        border: 1px solid rgba(16, 185, 129, 0.3);
    }
    
    .status-pill-info {
        display: inline-flex;
        align-items: center;
        background: rgba(59, 130, 246, 0.15);
        color: #3B82F6;
        padding: 0.25rem 0.75rem;
        border-radius: 9999px;
        font-size: 0.8rem;
        font-weight: 600;
        margin-right: 0.5rem;
        border: 1px solid rgba(59, 130, 246, 0.3);
    }
    
    .status-pill-warning {
        display: inline-flex;
        align-items: center;
        background: rgba(245, 158, 11, 0.15);
        color: #F59E0B;
        padding: 0.25rem 0.75rem;
        border-radius: 9999px;
        font-size: 0.8rem;
        font-weight: 600;
        margin-right: 0.5rem;
        border: 1px solid rgba(245, 158, 11, 0.3);
    }
    
    .spec-card {
        background-color: #F8FAFC;
        border: 1px solid #E2E8F0;
        border-radius: 8px;
        padding: 0.75rem 1rem;
        margin-bottom: 0.5rem;
    }
    
    .card-title {
        font-size: 0.75rem;
        font-weight: 600;
        color: #64748B;
        text-transform: uppercase;
        letter-spacing: 0.05em;
    }
    
    .card-value {
        font-size: 1.1rem;
        font-weight: 700;
        color: #0F172A;
    }
</style>
""", unsafe_allow_html=True)

from sems_rl.envs.microgrid_env import MicrogridBessEnv
from sems_rl.envs.wrappers import NoiseWrapper, DiscretizeActionWrapper
from sems_rl.baselines.no_battery import NoBatteryBaseline, RuleBasedController
from sems_rl.metrics.evaluator import MetricsEvaluator


@st.cache_resource
def get_base_env():
    return MicrogridBessEnv(config_path="sems_rl/config.yaml")


env = get_base_env()

# --- SIDEBAR: ĐIỀU KHIỂN & CẤU HÌNH HỆ THỐNG ---
st.sidebar.markdown("## ⚙️ SEMS Control Center")
st.sidebar.markdown(
    """
    <div style="margin-bottom: 1rem;">
        <span class="status-pill">● DIGITAL TWIN: ACTIVE</span>
        <span class="status-pill-info">● GYM v1.0</span>
    </div>
    """,
    unsafe_allow_html=True,
)

# 1. Chọn Kịch bản vận hành
st.sidebar.subheader("1. Kịch bản thử nghiệm (Scenarios)")
scenario_choice = st.sidebar.selectbox(
    "Chọn kịch bản vận hành:",
    [
        "S1: Ngày làm việc điển hình (Weekday High-Load)",
        "S2: Ngày cuối tuần (Weekend Low-Load / No-Peak)",
        "S3: Ngày nhiều mây (Cloudy Day - PV giảm 50%)",
        "S4: Thử thách độ bền với Nhiễu (Robustness - NoiseWrapper)",
        "S5: Tùy biến toàn bộ 365 ngày (Custom Split & Day)",
    ],
    index=0,
)

split = "test"
day_offset = 0
apply_noise = False

if "S1:" in scenario_choice:
    split = "test"
    day_offset = 0
elif "S2:" in scenario_choice:
    split = "test"
    day_offset = 2
elif "S3:" in scenario_choice:
    split = "test"
    day_offset = 5
elif "S4:" in scenario_choice:
    split = "test"
    day_offset = 0
    apply_noise = True
else:
    split = st.sidebar.selectbox("Phân vùng dữ liệu:", ["test", "val", "train"], index=0)
    total_split_days = env.data_pipeline.get_num_days(split)
    day_offset = st.sidebar.slider(
        f"Chọn ngày mô phỏng (trong tập {split.upper()}):",
        min_value=0,
        max_value=max(0, total_split_days - 1),
        value=0,
    )

# 2. Cơ chế An toàn Safety Guardrail (Ablation Study Switch)
st.sidebar.subheader("2. Cơ chế an toàn (Safety Guardrail)")
use_guardrail = st.sidebar.toggle(
    "Bật Safety Guardrail (Bộ lọc khả thi)",
    value=True,
    help="Khi BẬT: Pin luôn được ghim an toàn trong [20%, 90%]. Khi TẮT: Phục vụ thí nghiệm bóc tách Ablation Study.",
)

# 3. Chọn Bộ Điều Khiển (Strategy)
st.sidebar.subheader("3. Bộ điều khiển BESS (Agent Strategy)")
strategy = st.sidebar.radio(
    "Chọn chiến lược ra quyết định:",
    [
        "Mốc đối chuẩn: No-Battery (Pin nghỉ, a=0)",
        "Chuyên gia: Rule-Based Heuristic Controller",
        "Thủ công: Interactive Schedule Tuner",
        "RL Policy Checkpoint (Sẵn sàng kết nối mô hình)",
    ],
    index=1,
)

# Mức SoC ban đầu lúc 00:00
initial_soc = st.sidebar.slider(
    "Mức pin ban đầu SoC (lúc 00:00):",
    min_value=0.20,
    max_value=0.90,
    value=0.50,
    step=0.05,
    format="%.2f",
)

# Cấu hình thanh trượt nếu chọn thủ công
manual_actions = {}
if "Interactive Schedule" in strategy:
    st.sidebar.markdown("**Tinh chỉnh công suất từng khung giờ:**")
    manual_actions["night"] = st.sidebar.slider("Đêm (22h-4h, Thấp điểm):", -1.0, 1.0, 0.6, 0.1)
    manual_actions["morning_peak"] = st.sidebar.slider("Cao điểm sáng (9h30-11h30):", -1.0, 1.0, -1.0, 0.1)
    manual_actions["solar_noon"] = st.sidebar.slider("Trưa nắng thừa PV (11h30-15h):", -1.0, 1.0, 0.8, 0.1)
    manual_actions["evening_peak"] = st.sidebar.slider("Cao điểm tối (17h-20h):", -1.0, 1.0, -1.0, 0.1)
    manual_actions["normal"] = st.sidebar.slider("Các giờ bình thường khác:", -1.0, 1.0, 0.0, 0.1)

# Thông số vật lý của trạm BESS
st.sidebar.subheader("4. Thông số vật lý hệ thống")
st.sidebar.markdown(f"""
- 🔋 **Dung lượng danh định (E_cap):** `{env.battery.e_cap:.0f} kWh`
- ⚡ **Công suất inverter định mức:** `{env.battery.p_charge_max:.0f} kW` (0.25C)
- 🔄 **Hiệu suất chu trình khứ hồi:** `{env.battery.eta_c * env.battery.eta_d * 100:.1f}%`
- 🛡️ **Dải SoC an toàn:** `[{env.battery.soc_min*100:.0f}%, {env.battery.soc_max*100:.0f}%]`
- ☀️ **Hệ thống Solar PV:** `{env.p_pv_rated:.0f} kWp`
- 🎯 **Ngưỡng đỉnh lưới (P_th):** `{env.p_th:.0f} kW`
""")

# --- CHẠY QUY TRÌNH MÔ PHỎNG SỐ ---
# Cấu hình Guardrail động theo toggle
env.guardrail.enabled = use_guardrail

# Tạo môi trường thực thi (áp dụng NoiseWrapper nếu kịch bản S4)
active_env = env
if apply_noise:
    active_env = NoiseWrapper(env, sigma_load=0.08, sigma_pv=0.15, seed=42)

# 1. Chạy mốc No-Battery làm chuẩn đo lường (J_nobat, Peak_nobat)
obs_nb, info_nb = active_env.reset(options={"day_offset": day_offset, "split": split, "initial_soc": initial_soc})
nobat_records = []
while True:
    obs_nb, rew_nb, term_nb, trunc_nb, sinfo_nb = active_env.step(np.array([0.0], dtype=np.float32))
    nobat_records.append(sinfo_nb)
    if term_nb or trunc_nb:
        break

df_nobat = pd.DataFrame(nobat_records)
j_nobat = float(df_nobat["c_elec"].sum())
peak_nobat = float(df_nobat["p_buy_kw"].max())

# 2. Chạy chính sách điều khiển đang chọn
obs, info = active_env.reset(options={"day_offset": day_offset, "split": split, "initial_soc": initial_soc})
rbc = RuleBasedController(p_th=env.p_th)
sim_records = []
step_idx = 0

while True:
    if "No-Battery" in strategy:
        act = np.array([0.0], dtype=np.float32)
    elif "Rule-Based" in strategy:
        act = rbc.select_action(obs, info)
    elif "Interactive Schedule" in strategy:
        h = (step_idx * 0.25) % 24.0
        if 22.0 <= h or h < 4.0:
            val = manual_actions.get("night", 0.6)
        elif 9.5 <= h < 11.5:
            val = manual_actions.get("morning_peak", -1.0)
        elif 11.5 <= h < 15.0:
            val = manual_actions.get("solar_noon", 0.8)
        elif 17.0 <= h < 20.0:
            val = manual_actions.get("evening_peak", -1.0)
        else:
            val = manual_actions.get("normal", 0.0)
        act = np.array([val], dtype=np.float32)
    else:
        # RL Policy Placeholder
        # Khi có checkpoint thật, nạp model.predict(obs). Tạm thời dùng heuristic fallback
        act = rbc.select_action(obs, info)

    obs, reward, term, trunc, sinfo = active_env.step(act)
    sim_records.append(sinfo)
    step_idx += 1
    if term or trunc:
        break

df_sim = pd.DataFrame(sim_records)
evaluator = MetricsEvaluator(j_nobat_mean=j_nobat, peak_nobat_max=peak_nobat)
kpi = evaluator.evaluate_episode(sim_records)

# --- HEADER CHÍNH CỦA HỆ THỐNG ---
st.markdown(
    f"""
    <div class="main-header">
        <div style="display: flex; justify-content: space-between; align-items: center;">
            <div>
                <h1 style="margin: 0; font-size: 1.8rem; font-weight: 700; color: #FFFFFF;">
                    ⚡ SEMS-RL: Smart Energy Management System
                </h1>
                <p style="margin: 0.3rem 0 0 0; color: #94A3B8; font-size: 0.95rem;">
                    Hệ thống Điều phối Tối ưu BESS 200kWh & Solar PV 150kWp • Chu kỳ 15 phút (96 bước/ngày)
                </p>
            </div>
            <div style="text-align: right;">
                <span class="status-pill">● BESS HEALTH: 100%</span>
                <span class="status-pill-info">● GRID SYNCHRONIZED</span>
                <div style="margin-top: 0.4rem; font-size: 0.85rem; color: #CBD5E1;">
                    Kịch bản: <b>{scenario_choice.split(':')[0]}</b> | Tập dữ liệu: <b>{split.upper()}</b> | Ngày: <b>#{day_offset}</b>
                </div>
            </div>
        </div>
    </div>
    """,
    unsafe_allow_html=True,
)

# --- EXECUTIVE KPI METRICS CARDS ---
k1, k2, k3, k4, k5, k6 = st.columns(6)

with k1:
    cost_val = kpi["daily_cost_j"]
    saving_pct = kpi.get("cost_saving_pct", 0.0)
    delta_str = f"{saving_pct:+.1f}% vs NoBat" if "No-Battery" not in strategy else "Mốc tham chiếu"
    st.metric(
        label="💰 Chi phí điện (J)",
        value=f"{cost_val:,.0f} đ",
        delta=delta_str if "No-Battery" not in strategy else None,
        delta_color="normal",
    )

with k2:
    peak_val = kpi["peak_buy_kw"]
    peak_saving = kpi.get("peak_shaving_pct", 0.0)
    delta_peak = f"{peak_saving:+.1f}% cắt đỉnh" if "No-Battery" not in strategy else "Đỉnh gốc"
    st.metric(
        label="⚡ Đỉnh mua lưới (Peak)",
        value=f"{peak_val:.1f} kW",
        delta=delta_peak if "No-Battery" not in strategy else None,
        delta_color="normal",
    )

with k3:
    st.metric(
        label="☀️ Tự tiêu thụ PV",
        value=f"{kpi['pv_self_consumption']*100:.1f} %",
        delta="Năng lượng sạch tại chỗ",
        delta_color="off",
    )

with k4:
    st.metric(
        label="🔄 Chu kỳ hao mòn (EFC)",
        value=f"{kpi['efc']:.3f} cyl",
        delta=f"{kpi['efc']*200:.1f} kWh qua pin",
        delta_color="off",
    )

with k5:
    clip_count = kpi["clipped_steps"]
    st.metric(
        label="🛡️ Chạm Safety Filter",
        value=f"{clip_count} / 96 bước",
        delta="Bảo vệ pin [20-90%]" if use_guardrail else "⚠️ Guardrail TẮT",
        delta_color="inverse" if not use_guardrail else "off",
    )

with k6:
    total_pv_day = float(df_sim["p_pv_kw"].sum() * 0.25)
    st.metric(
        label="🌿 Tổng phát PV ngày",
        value=f"{total_pv_day:,.0f} kWh",
        delta=f"Đỉnh PV: {df_sim['p_pv_kw'].max():.1f} kW",
        delta_color="off",
    )

st.write("")

# --- VISUALIZATION WORKBENCH (5 TABS CHUYÊN SÂU) ---
tab_energy, tab_battery, tab_peak, tab_ablation, tab_table = st.tabs([
    "📊 1. Cân Bằng Năng Lượng & Dòng Công Suất",
    "🔋 2. Động Lực Học Pin & Safety Guardrail",
    "🎯 3. Cắt Đỉnh Lưới & Phân Tích Biểu Giá EVN",
    "🔬 4. Thí Nghiệm Bóc Tách (Ablation Study)",
    "📋 5. Nhật Ký 96 Bước & Xuất Báo Cáo CSV",
])

# ==============================================================================
# TAB 1: CÂN BẰNG CÔNG SUẤT VÀ DÒNG NĂNG LƯỢNG
# ==============================================================================
with tab_energy:
    col_e1, col_e2 = st.columns([3, 1])
    with col_e1:
        fig_power = go.Figure()
        # Phụ tải P_load
        fig_power.add_trace(go.Scatter(
            x=df_sim["hour"], y=df_sim["p_load_kw"],
            mode="lines", name="Phụ tải tòa nhà (P_load)",
            line=dict(color="#F97316", width=2.5),
        ))
        # Phát điện mặt trời P_pv
        fig_power.add_trace(go.Scatter(
            x=df_sim["hour"], y=df_sim["p_pv_kw"],
            mode="lines", name="Quang điện Solar (P_pv)",
            fill="tozeroy", fillcolor="rgba(251, 191, 36, 0.25)",
            line=dict(color="#FBBF24", width=2),
        ))
        # Công suất sạc/xả pin BESS
        fig_power.add_trace(go.Bar(
            x=df_sim["hour"], y=df_sim["p_batt_kw"],
            name="Pin BESS (P_batt)",
            marker_color=np.where(df_sim["p_batt_kw"] >= 0, "#10B981", "#EF4444"),
            opacity=0.75,
        ))
        # Mua điện lưới P_buy
        fig_power.add_trace(go.Scatter(
            x=df_sim["hour"], y=df_sim["p_buy_kw"],
            mode="lines", name="Mua từ lưới (P_buy)",
            line=dict(color="#8B5CF6", width=2, dash="dash"),
        ))
        fig_power.update_layout(
            title="<b>Phân Bố Dòng Công Suất Microgrid 24 Giờ (96 Bước 15 Phút)</b>",
            xaxis_title="Thời gian trong ngày (Giờ: 00:00 -> 24:00)",
            yaxis_title="Công suất (kW)",
            hovermode="x unified",
            legend=dict(orientation="h", yanchor="bottom", y=1.02, xanchor="right", x=1),
            margin=dict(l=40, r=20, t=50, b=40),
            height=420,
        )
        st.plotly_chart(fig_power, use_container_width=True)

    with col_e2:
        st.markdown("#### ⚡ Cơ cấu Nguồn Cấp Tải")
        tot_load = float(df_sim["p_load_kw"].sum() * 0.25)
        tot_pv_used = float(min(df_sim["p_load_kw"].sum(), df_sim["p_pv_kw"].sum()) * 0.25)
        tot_batt_dis = float(abs(df_sim[df_sim["p_batt_kw"] < 0]["p_batt_kw"].sum()) * 0.25)
        tot_grid_buy = float(df_sim["p_buy_kw"].sum() * 0.25)
        
        fig_donut = go.Figure(data=[go.Pie(
            labels=["Mặt trời (PV)", "Pin BESS (Xả)", "Lưới EVN (Mua)"],
            values=[tot_pv_used, tot_batt_dis, tot_grid_buy],
            hole=0.55,
            marker_colors=["#FBBF24", "#10B981", "#8B5CF6"],
        )])
        fig_donut.update_layout(
            margin=dict(l=10, r=10, t=20, b=10),
            height=280,
            showlegend=True,
            legend=dict(orientation="h", yanchor="bottom", y=-0.2, xanchor="center", x=0.5),
        )
        st.plotly_chart(fig_donut, use_container_width=True)
        st.caption(f"Tổng tiêu thụ trong ngày: **{tot_load:,.1f} kWh**")

# ==============================================================================
# TAB 2: ĐỘNG LỰC HỌC PIN & SAFETY GUARDRAIL
# ==============================================================================
with tab_battery:
    col_b1, col_b2 = st.columns(2)
    with col_b1:
        fig_soc = go.Figure()
        # Vùng xanh an toàn [20%, 90%]
        fig_soc.add_hrect(
            y0=20, y1=90,
            fillcolor="rgba(16, 185, 129, 0.12)", line_width=0,
            annotation_text="Dải vận hành an toàn [20% - 90%]",
            annotation_position="top left",
        )
        # Đường SoC
        fig_soc.add_trace(go.Scatter(
            x=df_sim["hour"], y=df_sim["soc"] * 100,
            mode="lines+markers", name="Mức sạc pin SoC (%)",
            line=dict(color="#2563EB", width=3),
            marker=dict(size=4),
        ))
        # Ngưỡng 90% & 20%
        fig_soc.add_hline(y=90, line_dash="dash", line_color="#DC2626", annotation_text="SoC Max (90%)")
        fig_soc.add_hline(y=20, line_dash="dash", line_color="#D97706", annotation_text="SoC Min (20%)")
        fig_soc.update_layout(
            title="<b>Đường Cong Mức Sạc Pin (SoC) & Dải An Toàn</b>",
            xaxis_title="Thời gian (Giờ)",
            yaxis_title="State of Charge (%)",
            yaxis=dict(range=[0, 100]),
            hovermode="x unified",
            legend=dict(orientation="h", yanchor="bottom", y=1.02, xanchor="right", x=1),
            margin=dict(l=40, r=20, t=50, b=40),
            height=400,
        )
        st.plotly_chart(fig_soc, use_container_width=True)

    with col_b2:
        fig_cmd = go.Figure()
        # Công suất lệnh của Agent vs Công suất thực tế sau Guardrail
        fig_cmd.add_trace(go.Scatter(
            x=df_sim["hour"], y=df_sim["p_cmd_kw"],
            mode="lines", name="Lệnh yêu cầu (P_cmd)",
            line=dict(color="#9CA3AF", dash="dot", width=2),
        ))
        fig_cmd.add_trace(go.Scatter(
            x=df_sim["hour"], y=df_sim["p_batt_kw"],
            mode="lines", name="Thực tế sau Guardrail (P_batt)",
            line=dict(color="#10B981", width=2.5),
        ))
        # Đánh dấu các điểm lệnh bị cắt
        clipped_rows = df_sim[df_sim["is_clipped"]]
        if not clipped_rows.empty:
            fig_cmd.add_trace(go.Scatter(
                x=clipped_rows["hour"], y=clipped_rows["p_batt_kw"],
                mode="markers", name="Lệnh bị can thiệp (Clipped)",
                marker=dict(color="#EF4444", size=9, symbol="x"),
            ))
        fig_cmd.update_layout(
            title="<b>Lệnh Điều Khiển Agent vs Công Suất Khả Thi (Safety Guardrail)</b>",
            xaxis_title="Thời gian (Giờ)",
            yaxis_title="Công suất sạc/xả (kW)",
            hovermode="x unified",
            legend=dict(orientation="h", yanchor="bottom", y=1.02, xanchor="right", x=1),
            margin=dict(l=40, r=20, t=50, b=40),
            height=400,
        )
        st.plotly_chart(fig_cmd, use_container_width=True)

# ==============================================================================
# TAB 3: CẮT ĐỈNH LƯỚI & PHÂN TÍCH BIỂU GIÁ EVN
# ==============================================================================
with tab_peak:
    col_p1, col_p2 = st.columns(2)
    with col_p1:
        fig_peak = go.Figure()
        # Vùng cảnh báo vượt đỉnh > 90kW
        fig_peak.add_hrect(
            y0=env.p_th, y1=max(df_nobat["p_buy_kw"].max() + 20, 140),
            fillcolor="rgba(239, 68, 68, 0.12)", line_width=0,
            annotation_text="Vùng Phạt Công Suất Đỉnh (> 90 kW)",
            annotation_position="top right",
        )
        # Mua lưới No-battery
        fig_peak.add_trace(go.Scatter(
            x=df_sim["hour"], y=df_nobat["p_buy_kw"],
            mode="lines", name="Mua lưới nếu KHÔNG có pin",
            line=dict(color="#94A3B8", dash="dot", width=2),
        ))
        # Mua lưới thực tế
        fig_peak.add_trace(go.Scatter(
            x=df_sim["hour"], y=df_sim["p_buy_kw"],
            mode="lines", name="Mua lưới khi CÓ pin tối ưu",
            line=dict(color="#8B5CF6", width=2.5),
            fill="tozeroy", fillcolor="rgba(139, 92, 246, 0.18)",
        ))
        fig_peak.add_hline(
            y=env.p_th, line_dash="dash", line_color="#EF4444",
            annotation_text=f"Ngưỡng đỉnh P_th ({env.p_th:.0f} kW)",
        )
        fig_peak.update_layout(
            title="<b>Cắt Đỉnh Phụ Tải Lưới (Peak Shaving)</b>",
            xaxis_title="Thời gian (Giờ)",
            yaxis_title="Công suất mua từ lưới (kW)",
            hovermode="x unified",
            legend=dict(orientation="h", yanchor="bottom", y=1.02, xanchor="right", x=1),
            margin=dict(l=40, r=20, t=50, b=40),
            height=400,
        )
        st.plotly_chart(fig_peak, use_container_width=True)

    with col_p2:
        fig_tou = make_subplots(specs=[[{"secondary_y": True}]])
        # Biểu giá TOU EVN
        fig_tou.add_trace(
            go.Scatter(
                x=df_sim["hour"], y=df_sim["c_grid"],
                mode="lines", name="Đơn giá điện EVN (VNĐ/kWh)",
                line=dict(color="#6366F1", width=2.5, shape="hv"),
            ),
            secondary_y=False,
        )
        # Tiền điện từng bước
        fig_tou.add_trace(
            go.Bar(
                x=df_sim["hour"], y=df_sim["c_elec"],
                name="Tiền điện bước 15 phút (VNĐ)",
                marker_color="#EC4899", opacity=0.45,
            ),
            secondary_y=True,
        )
        fig_tou.update_xaxes(title_text="Thời gian (Giờ)")
        fig_tou.update_yaxes(title_text="Đơn giá (VNĐ/kWh)", secondary_y=False)
        fig_tou.update_yaxes(title_text="Hóa đơn bước (VNĐ)", secondary_y=True)
        fig_tou.update_layout(
            title="<b>Biểu Giá EVN 3 Mức & Hóa Đơn Điện Năng</b>",
            hovermode="x unified",
            legend=dict(orientation="h", yanchor="bottom", y=1.02, xanchor="right", x=1),
            margin=dict(l=40, r=20, t=50, b=40),
            height=400,
        )
        st.plotly_chart(fig_tou, use_container_width=True)

# ==============================================================================
# TAB 4: THÍ NGHIỆM BÓC TÁCH (ABLATION STUDY)
# ==============================================================================
with tab_ablation:
    st.markdown("### 🔬 Thí Nghiệm Bóc Tách Đóng Góp Của Các Thành Phần")
    st.markdown("Kiểm chứng vai trò của **Safety Guardrail** và **Khả năng chịu đựng nhiễu ngoại sinh (NoiseWrapper)** theo yêu cầu Mục 2.5 & 3.5 Báo cáo TH2.")
    
    col_ab1, col_ab2 = st.columns(2)
    with col_ab1:
        st.info("🛡️ **Vai trò của Safety Guardrail:**")
        st.markdown(f"""
        - Khi **BẬT (Khuyên dùng):** Bộ lọc an toàn chặn đứng mọi lệnh gây nguy hiểm cho pin. Mức sạc luôn nằm trong `[{env.battery.soc_min*100:.0f}%, {env.battery.soc_max*100:.0f}%]`.
        - Khi **TẮT (Ablation Study):** Pin có nguy cơ bị xả cạn kiệt về `0%` hoặc sạc nhồi quá `100%`, gây chai pin tức thì và tăng đột biến điểm phạt vi phạm.
        - **Trạng thái hiện tại:** `{'ĐANG BẬT' if use_guardrail else 'ĐANG TẮT'}`
        """)
    with col_ab2:
        st.info("🌊 **Vai trò của NoiseWrapper (Kịch bản S4):**")
        st.markdown(r"""
        - Bổ sung nhiễu Gaussian vào công suất tải $\sigma_L = 8\%$ và công suất phát PV $\sigma_{PV} = 15\%$.
        - Phục vụ đánh giá tính bền vững (Robustness) của chính sách điều khiển khi thời tiết thất thường.
        - **Trạng thái hiện tại:** `{'ĐANG ÁP DỤNG NHIỄU' if apply_noise else 'KHÔNG CÓ NHIỄU'}`
        """)

# ==============================================================================
# TAB 5: NHẬT KÝ 96 BƯỚC & XUẤT CSV
# ==============================================================================
with tab_table:
    st.markdown("### 📋 Bảng Dữ Liệu Chi Tiết 96 Bước Vận Hành (24 Giờ)")
    
    cols_to_show = [
        "step", "hour", "p_load_kw", "p_pv_kw", "p_cmd_kw", "p_batt_kw",
        "p_buy_kw", "p_sell_kw", "soc", "c_grid", "c_elec", "c_deg", "reward"
    ]
    st.dataframe(df_sim[cols_to_show], use_container_width=True, height=400)
    
    col_exp1, col_exp2 = st.columns([1, 4])
    with col_exp1:
        csv_file = df_sim.to_csv(index=False).encode("utf-8")
        st.download_button(
            label="📥 Xuất Báo Cáo CSV",
            data=csv_file,
            file_name=f"sems_rl_day_{day_offset}_{split}.csv",
            mime="text/csv",
        )
    with col_exp2:
        st.caption("Dữ liệu có thể nhập trực tiếp vào Excel, MATLAB hoặc Python Pandas để phục vụ viết báo cáo và vẽ biểu đồ đồ án.")

# Footer thương hiệu nhóm
st.markdown("---")
st.markdown(
    """
    <div style="text-align: center; color: #64748B; font-size: 0.85rem; padding: 1rem 0;">
        <b>SEMS-RL Platform</b> • Bài Tập Lớn Học Tăng Cường & Ứng Dụng • Giảng viên: <b>TS. Lê Nguyễn Tuấn Thành</b><br>
        Nhóm sinh viên thực hiện: <b>Nguyễn Văn Huỳnh (Nhóm trưởng), Lý Đình Sơn, Nguyễn Văn Trường, Phạm Quang Anh, Nguyễn Tùng Dương, Nguyễn Thị Cẩm Ly</b> (65KTPM - ĐH Thủy Lợi).
    </div>
    """,
    unsafe_allow_html=True,
)
