"""Màn hình kiểm chứng DDQN + Dueling của Lý Đình Sơn: quá trình học, so sánh, Q(s,k).

Chạy: python -m streamlit run dashboard_ddqn.py --server.address 127.0.0.1
Thư mục mô hình: biến môi trường SEMS_DDQN_RUNS (nhiều đường dẫn cách bằng os.pathsep),
mặc định runs/ddqn/ddqn_seed* rồi runs/ddqn_pilot/ddqn_seed*. Không huấn luyện ở đây.
"""

import json
import os
from pathlib import Path

import numpy as np
import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
import streamlit as st
from plotly.subplots import make_subplots

from sems_rl.agents.ddqn import DDQNAgent
from sems_rl.agents.sac import SACAgent
from sems_rl.experiments.sac_experiment import (
    ROOT, episode, episode_metrics, experiment_metadata, make_env,
    policy_function, protocol_fingerprint, scenario_days, seed_everything,
)


st.set_page_config(page_title="Kiểm chứng DDQN + Dueling", page_icon="🔋", layout="wide")

SCENARIOS = {
    "S1": "S1 · Ngày làm việc", "S2": "S2 · Chủ nhật",
    "S3": "S3 · Điện mặt trời giảm 50%", "S4": "S4 · Sai số quan sát tải/PV",
    "S5": "S5 · Ngày bất kỳ, nguyên dữ liệu",
}


def configured_paths(variable, defaults):
    if os.environ.get(variable):
        return [Path(p) for p in os.environ[variable].split(os.pathsep) if p]
    found = []
    for pattern in defaults:
        found.extend(sorted(ROOT.glob(pattern)))
    return found


def money(value):
    return f"{value:,.0f} đ".replace(",", ".")


@st.cache_resource
def load_run(run_path):
    """Nạp checkpoint thật; CSV khác lúc huấn luyện thì báo lỗi, không đoán."""
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
    agent = DDQNAgent.load(path / "best.pt")
    env = make_env(settings, "val")
    pipeline = env.unwrapped.data_pipeline
    env.close()
    return agent, settings, metadata, summary, pipeline


def matching_sac(fingerprint):
    """SAC tự viết cùng giao thức (nếu có) để so sánh; khác dữ liệu thì bỏ qua."""
    for path in configured_paths("SEMS_SAC_RUNS", ("runs/sac/custom_seed0", "runs/sac_pilot/custom_seed0")):
        meta_path = path / "metadata.json"
        if meta_path.is_file() and (path / "best.pt").is_file():
            metadata = json.loads(meta_path.read_text(encoding="utf-8"))
            if protocol_fingerprint(metadata) == fingerprint:
                return str(path)
    return None


@st.cache_data
def simulate_day(run_path, split, scenario, day, initial_soc):
    """96 quyết định DDQN (kèm Q/V/A từng bước) và các mốc trên cùng ngày."""
    agent, settings, metadata, _, pipeline = load_run(run_path)
    env = make_env(settings, split, scenario, pipeline)
    histories = {"No-battery": episode(env, policy_function(baseline="no_battery"), day, day, initial_soc)}
    histories["Theo luật"] = episode(
        env, policy_function(baseline="rule_based", peak_threshold=env.unwrapped.p_th),
        day, day, initial_soc,
    )
    explanations = []

    def ddqn_policy(observation, info):
        explanation = agent.explain(observation)
        explanations.append(explanation)
        return np.array([agent.action_value(explanation["chosen_k"])], dtype=np.float32)

    histories["DDQN"] = episode(env, ddqn_policy, day, day, initial_soc)
    sac_path = matching_sac(protocol_fingerprint(metadata))
    if sac_path:
        histories["SAC"] = episode(env, policy_function(SACAgent.load(Path(sac_path) / "best.pt")),
                                   day, day, initial_soc)
    metrics = {
        name: episode_metrics(history, env, initial_soc, histories["No-battery"])
        for name, history in histories.items()
    }
    env.close()
    return {name: pd.DataFrame(h) for name, h in histories.items()}, metrics, explanations


st.title("🔋 Kiểm chứng Double DQN + Dueling")
st.caption("Mô hình đã huấn luyện chọn 1 trong 11 mức sạc/xả mỗi 15 phút; lệnh vẫn qua Safety Guardrail.")

runs = {
    f"{path.parent.name}/{path.name}": path for path in
    configured_paths("SEMS_DDQN_RUNS", ("runs/ddqn/ddqn_seed*", "runs/ddqn_pilot/ddqn_seed*"))
    if (path / "metadata.json").is_file() and (path / "best.pt").is_file()
}
if not runs:
    st.error("Chưa tìm thấy mô hình DDQN (runs/ddqn hoặc runs/ddqn_pilot). Cần chạy train_ddqn.py trước.")
    st.stop()

with st.sidebar:
    st.header("Điều kiện kiểm chứng")
    run_name = st.selectbox("Mô hình", list(runs))
    run_path = str(runs[run_name])
    try:
        agent, settings, metadata, training, pipeline = load_run(run_path)
    except (OSError, ValueError, RuntimeError) as error:
        st.error(str(error))
        st.stop()
    split = st.selectbox(
        "Phân vùng dữ liệu", ["val", "train", "test"],
        format_func={"val": "Validation", "train": "Train", "test": "Test"}.get,
        help="Dùng validation để kiểm tra. Test dành cho đánh giá sau khi đã chốt mô hình.",
    )
    scenario = st.selectbox("Kịch bản", list(SCENARIOS), format_func=SCENARIOS.get)
    env = make_env(settings, split, scenario, pipeline)
    days = scenario_days(env, split, scenario)
    env.close()
    day = st.selectbox(
        "Ngày vận hành", days,
        format_func=lambda value: str(pipeline.get_day_data(value, split).iloc[0]["timestamp"])[:10],
    )
    initial_soc = st.slider("Mức pin đầu ngày", 0.20, 0.90, 0.50, 0.05)

st.info(
    f"**{run_name}** · Đã huấn luyện **{training['total_timesteps']:,} bước** · "
    f"Checkpoint chọn tại bước **{training['best_step']:,}** (theo validation) · Seed **{metadata['seed']}**."
)
with st.spinner("Đang chạy 96 quyết định của DDQN…"):
    histories, metrics, explanations = simulate_day(run_path, split, scenario, day, initial_soc)
trace = histories["DDQN"]

tab_learning, tab_day, tab_q = st.tabs([
    "1 · Quá trình học", "2 · So sánh trong ngày", "3 · Q(s,k), V(s), A(s,k)",
])

with tab_learning:
    validation = pd.read_csv(Path(run_path) / "validation.csv")
    log = pd.read_csv(Path(run_path) / "training.csv")
    st.plotly_chart(px.line(
        validation, x="step", y="adjusted_total_cost_vnd_mean", markers=True,
        labels={"step": "Số bước huấn luyện", "adjusted_total_cost_vnd_mean": "Tổng chi phí điều chỉnh (đ/ngày)"},
        title="Validation: chi phí điều chỉnh (càng thấp càng tốt)",
    ), width="stretch")
    figure = make_subplots(rows=1, cols=2, subplot_titles=("Huber loss", "ε (khám phá)"))
    figure.add_trace(go.Scatter(x=log.step, y=log["loss"], name="loss"), row=1, col=1)
    figure.add_trace(go.Scatter(x=log.step, y=log["epsilon"], name="ε"), row=1, col=2)
    figure.update_layout(height=320, showlegend=False)
    st.plotly_chart(figure, width="stretch")

with tab_day:
    if "SAC" not in histories:
        st.caption("Không có mô hình SAC cùng giao thức dữ liệu nên chỉ so với hai mốc.")
    comparison = pd.DataFrame([
        {"Phương pháp": name, "Tiền điện gốc (đ)": m["daily_cost_j"],
         "Tiền điện điều chỉnh (đ)": m["adjusted_electric_cost_vnd"],
         "Tổng chi phí điều chỉnh (đ)": m["adjusted_total_cost_vnd"],
         "Đỉnh mua (kW)": m["peak_buy_kw"], "SoC cuối (%)": 100 * m["final_soc"]}
        for name, m in metrics.items()
    ])
    st.dataframe(comparison, hide_index=True, width="stretch")
    st.caption("Chi phí điều chỉnh tính cả giá trị điện còn/thiếu trong pin cuối ngày; không phải hóa đơn thực tế.")
    figure = make_subplots(rows=2, cols=1, shared_xaxes=True, vertical_spacing=0.08)
    for name, history in histories.items():
        figure.add_trace(go.Scatter(x=history.hour, y=history.p_buy_kw, name=f"Mua lưới — {name}"), row=1, col=1)
        figure.add_trace(go.Scatter(x=history.hour, y=history.soc * 100, name=f"SoC — {name}"), row=2, col=1)
    figure.update_yaxes(title_text="kW", row=1, col=1)
    figure.update_yaxes(title_text="SoC (%)", row=2, col=1)
    figure.update_layout(height=600, hovermode="x unified", legend={"orientation": "h"})
    st.plotly_chart(figure, width="stretch")

with tab_q:
    step = st.slider("Bước trong ngày", 0, len(explanations) - 1, min(38, len(explanations) - 1))
    current, explanation = trace.iloc[step], explanations[step]
    grid = agent.action_grid
    k = explanation["chosen_k"]
    time_label = f"{int(current.hour):02d}:{int(round(current.hour % 1 * 60)):02d}"
    st.subheader(f"Q(s,k) lúc {time_label} — chọn k={k} (a = {grid[k]:+.1f})")
    st.markdown(
        f"Lệnh **{current.p_cmd_kw:+.1f} kW**, pin thực hiện **{current.p_batt_kw:+.1f} kW** "
        f"(+ sạc, − xả); SoC **{current.old_soc * 100:.1f}% → {current.soc * 100:.1f}%**."
    )
    labels = [f"{a:+.1f}" for a in grid]
    colors = ["#8B5CF6" if i == k else "#94A3B8" for i in range(len(grid))]
    st.plotly_chart(go.Figure(go.Bar(x=labels, y=explanation["q_values"], marker_color=colors)).update_layout(
        xaxis_title="Mức hành động a (− xả, + sạc)", yaxis_title="Q(s,k)", height=360,
    ), width="stretch")
    if explanation["v_value"] is not None:
        st.markdown(f"**V(s) = {explanation['v_value']:.3f}** — Q(s,k) = V(s) + A(s,k) − trung bình A.")
        st.plotly_chart(go.Figure(go.Bar(x=labels, y=explanation["advantages"], marker_color=colors)).update_layout(
            xaxis_title="Mức hành động a", yaxis_title="A(s,k)", height=300,
        ), width="stretch")
    chosen = pd.DataFrame({"hour": trace.hour, "a": [grid[e["chosen_k"]] for e in explanations]})
    st.plotly_chart(px.line(chosen, x="hour", y="a", line_shape="hv",
                            labels={"hour": "Giờ", "a": "Mức được chọn"},
                            title="Mức hành động DDQN chọn trong 96 bước"), width="stretch")
