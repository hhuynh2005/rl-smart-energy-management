"""Màn hình chạy mô hình SAC thật để Trường kiểm chứng từng quyết định.

Chạy: python -m streamlit run dashboard_sac.py --server.address 127.0.0.1
Không huấn luyện hoặc cập nhật trọng số khi người dùng điều khiển giao diện.
"""

import json
from pathlib import Path

import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
import streamlit as st
from plotly.subplots import make_subplots

from sems_rl.agents.sac import SACAgent
from sems_rl.experiments.sac_experiment import (
    ROOT, episode, episode_metrics, experiment_metadata, make_env,
    policy_function, protocol_fingerprint, scenario_days, seed_everything,
)


st.set_page_config(page_title="Kiểm chứng SAC của Trường", page_icon="🔋", layout="wide")

RUNS = {
    "SAC tự viết — Nguyễn Văn Trường": ROOT / "runs/sac_pilot/custom_seed0",
    "SAC thư viện SB3 — đối chiếu": ROOT / "runs/sac_pilot/sb3_seed0",
}
SCENARIOS = {
    "S1": "S1 · Ngày làm việc", "S2": "S2 · Chủ nhật",
    "S3": "S3 · Điện mặt trời giảm 50%", "S4": "S4 · Sai số quan sát tải/PV",
    "S5": "S5 · Ngày bất kỳ, nguyên dữ liệu",
}


def money(value):
    return f"{value:,.0f} đ".replace(",", ".")


@st.cache_resource
def load_run(run_path):
    """Nạp checkpoint thật; thiếu hoặc sai dữ liệu thì báo lỗi, không thay bằng luật."""
    path = Path(run_path)
    metadata = json.loads((path / "metadata.json").read_text(encoding="utf-8"))
    summary = json.loads((path / "training_summary.json").read_text(encoding="utf-8"))
    settings = metadata["settings"]
    dataset = ROOT / "data/processed.csv"
    current = experiment_metadata(settings, metadata["backend"], metadata["seed"], dataset)
    if current["fingerprint"] != protocol_fingerprint(metadata):
        raise ValueError("CSV/quy ước hiện tại khác dữ liệu lúc huấn luyện mô hình.")
    settings["environment"]["data"]["file_path"] = str(dataset)
    seed_everything(0, settings["training"]["torch_threads"])
    if metadata["backend"] == "custom":
        model = SACAgent.load(path / "best.pt")
    else:
        from stable_baselines3 import SAC
        model = SAC.load(path / "best.zip", device="cpu")
    env = make_env(settings, "val")
    pipeline = env.unwrapped.data_pipeline
    env.close()
    return model, settings, metadata, summary, pipeline


@st.cache_data
def simulate_day(run_path, split, scenario, day, initial_soc):
    """Chạy 96 lần predict của SAC, cùng hai mốc trên chính ngày đang chọn."""
    model, settings, _, _, pipeline = load_run(run_path)
    env = make_env(settings, split, scenario, pipeline)
    no_battery = episode(
        env, policy_function(baseline="no_battery"), day, day, initial_soc
    )
    histories = {"No-battery": no_battery}
    histories["Theo luật"] = episode(
        env, policy_function(baseline="rule_based", peak_threshold=env.unwrapped.p_th),
        day, day, initial_soc,
    )
    histories["SAC"] = episode(env, policy_function(model), day, day, initial_soc)
    metrics = {
        name: episode_metrics(history, env, initial_soc, no_battery)
        for name, history in histories.items()
    }
    env.close()
    return {name: pd.DataFrame(history) for name, history in histories.items()}, metrics


st.title("🔋 Kiểm chứng thuật toán SAC của Trường")
st.caption("Chạy mô hình đã huấn luyện trên dữ liệu mô phỏng; mỗi quyết định tương ứng 15 phút.")

available = {name: path for name, path in RUNS.items() if (path / "metadata.json").is_file()}
if not available:
    st.error("Chưa tìm thấy mô hình trong runs/sac_pilot. Cần chạy train_sac.py trước.")
    st.stop()

with st.sidebar:
    st.header("Điều kiện kiểm chứng")
    model_name = st.selectbox("Mô hình", list(available), key="model_choice")
    run_path = str(available[model_name])
    try:
        model, settings, metadata, training, pipeline = load_run(run_path)
    except (OSError, ValueError, RuntimeError) as error:
        st.error(str(error))
        st.stop()
    split = st.selectbox(
        "Phân vùng dữ liệu", ["val", "train", "test"],
        format_func=lambda value: {"val": "Validation", "train": "Train", "test": "Test"}[value],
        help="Dùng validation để kiểm tra. Test dành cho đánh giá sau khi đã chốt cấu hình.",
        key="split_choice",
    )
    scenario = st.selectbox(
        "Kịch bản", list(SCENARIOS), format_func=SCENARIOS.get, key="scenario_choice"
    )
    env = make_env(settings, split, scenario, pipeline)
    days = scenario_days(env, split, scenario)
    env.close()
    day = st.selectbox(
        "Ngày vận hành", days,
        format_func=lambda value: str(pipeline.get_day_data(value, split).iloc[0]["timestamp"])[:10],
        key="day_choice",
    )
    initial_soc = st.slider("Mức pin đầu ngày", 0.20, 0.90, 0.50, 0.05, key="initial_soc")
    if st.button("Chạy lại mô phỏng", type="primary"):
        simulate_day.clear()
    st.caption("Cả SAC, No-battery và bộ điều khiển theo luật dùng cùng ngày và mức pin ban đầu.")

st.info(
    f"Đang dùng **{model_name}** · Đã huấn luyện **{training['total_timesteps']:,} bước**"
    f" · Checkpoint được chọn tại bước **{training['best_step']:,}** · Seed **{metadata['seed']}**."
)
with st.spinner("Đang nạp mô hình và thực hiện 96 quyết định sạc/xả…"):
    histories, metrics = simulate_day(run_path, split, scenario, day, initial_soc)
trace, selected = histories["SAC"], metrics["SAC"]

tab_day, tab_learning, tab_summary = st.tabs([
    "1 · Xem SAC vận hành", "2 · Kiểm tra quá trình học", "3 · Kết quả 54 ngày validation"
])

with tab_day:
    columns = st.columns(4)
    columns[0].metric("Tiền điện SAC trong ngày", money(selected["daily_cost_j"]))
    columns[1].metric("Tiết kiệm tiền điện gốc", f"{selected['cost_saving_pct']:.2f}%")
    columns[2].metric("Đỉnh mua điện", f"{selected['peak_buy_kw']:.2f} kW")
    columns[3].metric("Lệnh bị bộ lọc điều chỉnh", f"{selected['clipped_steps']}/96")

    comparison = pd.DataFrame([
        {"Phương pháp": name, "Tiền điện gốc (đ)": values["daily_cost_j"],
         "Tiền điện điều chỉnh (đ)": values["adjusted_electric_cost_vnd"],
         "Tổng chi phí điều chỉnh (đ)": values["adjusted_total_cost_vnd"],
         "Hao mòn (đ)": values["wear_cost_vnd"], "SoC cuối (%)": 100 * values["final_soc"]}
        for name, values in metrics.items()
    ])
    st.dataframe(comparison, hide_index=True, width="stretch")
    st.caption(
        "Tiền điện điều chỉnh có tính giá trị lượng điện pin dùng ròng trong ngày. "
        "Tổng chi phí còn cộng hao mòn và phạt; đây là phép đánh giá mô phỏng, không phải hóa đơn thực tế."
    )

    step = st.slider("Xem quyết định tại bước", 0, 95, 38, key="step_choice")
    current = trace.iloc[step]
    time_label = f"{int(current.hour):02d}:{int(round(current.hour % 1 * 60)):02d}"
    action = current.p_cmd_kw / settings["environment"]["battery"][
        "p_charge_max" if current.p_cmd_kw >= 0 else "p_discharge_max"
    ]
    mode = "SẠC" if current.p_batt_kw > 0.01 else "XẢ" if current.p_batt_kw < -0.01 else "NGHỈ"
    st.markdown(
        f"**{time_label} · {mode}** — SAC đề nghị a = **{action:+.3f}**, "
        f"tương ứng **{current.p_cmd_kw:+.2f} kW**; pin thực hiện **{current.p_batt_kw:+.2f} kW**. "
        f"Mức pin: **{current.old_soc * 100:.1f}% → {current.soc * 100:.1f}%**."
    )
    if current.is_clipped:
        st.warning("Bộ lọc an toàn đã điều chỉnh lệnh này để giữ pin trong giới hạn.")

    figure = make_subplots(rows=3, cols=1, shared_xaxes=True, vertical_spacing=0.07)
    for field, label in [("p_load_kw", "Tải"), ("p_pv_kw", "Điện mặt trời"),
                         ("p_batt_kw", "Pin (+ sạc, − xả)"), ("p_buy_kw", "Mua lưới — SAC")]:
        figure.add_trace(go.Scatter(x=trace.hour, y=trace[field], name=label), row=1, col=1)
    figure.add_trace(go.Scatter(
        x=trace.hour, y=histories["No-battery"].p_buy_kw, name="Mua lưới — không pin",
        line={"dash": "dot"},
    ), row=1, col=1)
    figure.add_trace(go.Scatter(x=trace.hour, y=trace.soc * 100, name="SoC (%)"), row=2, col=1)
    figure.add_hline(y=20, line_dash="dash", line_color="red", row=2, col=1)
    figure.add_hline(y=90, line_dash="dash", line_color="red", row=2, col=1)
    figure.add_trace(go.Scatter(x=trace.hour, y=trace.c_grid, name="Giá điện"), row=3, col=1)
    figure.add_vline(x=float(current.hour), line_dash="dot", line_color="gray")
    figure.update_yaxes(title_text="Công suất (kW)", row=1, col=1)
    figure.update_yaxes(title_text="SoC (%)", row=2, col=1)
    figure.update_yaxes(title_text="Giá (đ/kWh)", row=3, col=1)
    figure.update_xaxes(title_text="Giờ trong ngày", row=3, col=1)
    figure.update_layout(height=750, hovermode="x unified", legend={"orientation": "h"})
    st.plotly_chart(figure, width="stretch")
    st.subheader("Dữ liệu 96 quyết định thực tế")
    st.dataframe(trace[[
        "step", "hour", "p_cmd_kw", "p_batt_kw", "soc", "p_load_kw", "p_pv_kw",
        "p_buy_kw", "c_grid", "c_elec", "c_deg", "reward", "is_clipped",
    ]], hide_index=True, width="stretch")
    st.download_button(
        "Tải CSV ngày đang xem", trace.to_csv(index=False).encode("utf-8-sig"),
        file_name=f"sac_{metadata['backend']}_{split}_{scenario}_day{day}.csv", mime="text/csv",
    )

with tab_learning:
    validation = pd.read_csv(Path(run_path) / "validation.csv")
    st.subheader("Đánh giá định kỳ trên validation")
    st.plotly_chart(px.line(
        validation, x="step", y="episode_reward_mean", markers=True,
        labels={"step": "Số bước huấn luyện", "episode_reward_mean": "Phần thưởng/ngày"},
    ), width="stretch")
    st.plotly_chart(px.line(
        validation, x="step", y="adjusted_total_cost_vnd_mean", markers=True,
        labels={"step": "Số bước huấn luyện", "adjusted_total_cost_vnd_mean": "Tổng chi phí điều chỉnh (đ/ngày)"},
    ), width="stretch")
    st.caption("Phần thưởng càng cao và chi phí càng thấp càng tốt. Dao động vẫn có thể xảy ra khi học.")
    with st.expander("Thông tin mô hình và cấu hình để đối chiếu mã nguồn"):
        st.write("Thư mục mô hình:", run_path)
        st.json({"agent": settings["agent"], "training_result": training})

with tab_summary:
    summary_path = ROOT / "runs/sac_verify/evaluation/summary.csv"
    if not summary_path.is_file():
        summary_path = ROOT / "runs/sac_pilot/evaluation/summary.csv"
    if summary_path.is_file():
        summary = pd.read_csv(summary_path)
        st.dataframe(summary[[
            "method", "scenario", "seed_count", "daily_cost_j_mean",
            "adjusted_electric_cost_vnd_mean", "adjusted_total_cost_vnd_mean",
            "adjusted_cost_saving_pct_mean", "clipped_steps_mean",
        ]], hide_index=True, width="stretch")
    st.info(
        "Đây là kết quả một seed trên dữ liệu tổng hợp. Bản tự viết chưa tốt hơn bộ điều khiển "
        "theo luật về tổng chi phí điều chỉnh; xem thêm chủ nhật S2 và PV giảm S3."
    )
    st.markdown("Hướng dẫn: `docs/SAC_NGUYEN_VAN_TRUONG.md` · Báo cáo: `docs/BAO_CAO_SAC_CHAY_THU.md`.")
