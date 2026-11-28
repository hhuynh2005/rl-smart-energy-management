"""Môi trường và phép đo dùng chung cho SAC tự viết, SB3 và các mốc đối chuẩn.

Không sửa mặc định của môi trường gốc. Các điều chỉnh phục vụ thí nghiệm SAC
được đặt trong wrapper để Sơn, Huỳnh và Dương có thể đọc và tái sử dụng riêng.
"""

import hashlib
import json
import platform
import random
from copy import deepcopy
from pathlib import Path

import gymnasium as gym
import numpy as np
import pandas as pd
import torch
import yaml

from sems_rl.baselines.no_battery import RuleBasedController
from sems_rl.envs.microgrid_env import MicrogridBessEnv
from sems_rl.metrics.evaluator import MetricsEvaluator


ROOT = Path(__file__).resolve().parents[2]
PROTOCOL = "sac-daily-v1"
SCENARIOS = ("S1", "S2", "S3", "S4", "S5")


def seed_everything(seed, threads=1):
    """Cố định nguồn ngẫu nhiên; kết quả vẫn có thể khác giữa thiết bị/phiên bản."""
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    torch.set_num_threads(threads)


def read_settings(path=None, env_config_path=None):
    path = Path(path or ROOT / "configs/sac.yaml").resolve()
    with path.open(encoding="utf-8") as stream:
        settings = yaml.safe_load(stream)
    env_path = Path(env_config_path or ROOT / "sems_rl/config.yaml").resolve()
    with env_path.open(encoding="utf-8") as stream:
        settings["environment"] = yaml.safe_load(stream)
    data_path = Path(settings["environment"]["data"]["file_path"])
    if not data_path.is_absolute():
        data_path = ROOT / data_path
    # Không tự sinh dữ liệu khi chạy thực nghiệm: thiếu dữ liệu phải báo rõ.
    if not data_path.is_file():
        raise FileNotFoundError(f"Không tìm thấy dữ liệu: {data_path}")
    settings["environment"]["data"]["file_path"] = str(data_path.resolve())
    return settings


def write_json(path, content):
    Path(path).write_text(
        json.dumps(content, ensure_ascii=False, indent=2, allow_nan=False), encoding="utf-8"
    )


def protocol_fingerprint(metadata):
    """Đường dẫn trên máy khác có thể khác; nội dung CSV được phân biệt bằng hash."""
    environment = deepcopy(metadata["environment"])
    environment["data"].pop("file_path", None)
    values = {
        "protocol": metadata["protocol"], "environment": environment,
        "evaluation": metadata["evaluation"], "data_sha256": metadata["data_sha256"],
    }
    return hashlib.sha256(json.dumps(values, sort_keys=True).encode("utf-8")).hexdigest()


def experiment_metadata(settings, backend, seed, dataset_path=None):
    """Lưu dấu vết dữ liệu, cấu hình và phiên bản để kết quả có thể kiểm tra lại."""
    import stable_baselines3

    dataset = Path(dataset_path or settings["environment"]["data"]["file_path"])
    data_hash = hashlib.sha256(dataset.read_bytes()).hexdigest()
    protocol_values = {
        "protocol": PROTOCOL, "environment": settings["environment"],
        "evaluation": settings["evaluation"], "data_sha256": data_hash,
    }
    fingerprint = protocol_fingerprint(protocol_values)
    return {
        **protocol_values, "fingerprint": fingerprint,
        "backend": backend, "seed": seed, "settings": settings,
        "selection_metric": "adjusted_total_cost_vnd_mean (càng thấp càng tốt)",
        "versions": {
            "python": platform.python_version(), "torch": str(torch.__version__),
            "gymnasium": gym.__version__, "stable_baselines3": stable_baselines3.__version__,
            "numpy": np.__version__, "pandas": pd.__version__,
        },
    }


class SACScenarioWrapper(gym.Wrapper):
    """Kịch bản S1–S5 và quan sát cuối ngày có nguồn dữ liệu xác định.

    S1/S2 chọn loại ngày ở scenario_days. S3 giảm PV thật trong ngày.
    S4 chỉ nhiễu quan sát. S5 dùng nguyên các ngày của phân vùng được chọn.
    """

    def __init__(self, env, scenario, evaluation):
        super().__init__(env)
        if scenario not in SCENARIOS:
            raise ValueError(f"Kịch bản không hợp lệ: {scenario}")
        self.scenario = scenario
        self.evaluation = evaluation
        self.pv_scale = evaluation["pv_scale_cloudy"] if scenario == "S3" else 1.0
        self.rng = np.random.default_rng(0)
        self.active_split = env.split

    def _noise(self, observation):
        observation = observation.copy()
        if self.scenario == "S4":
            for index, key in ((1, "sigma_load"), (2, "sigma_pv")):
                multiplier = 1.0 + self.rng.normal(0, self.evaluation[key])
                observation[index] = np.clip(observation[index] * multiplier, 0, 1)
        return observation

    def reset(self, *, seed=None, options=None):
        if seed is not None:
            self.rng = np.random.default_rng(seed)
        observation, info = self.env.reset(seed=seed, options=options)
        self.active_split = info["split"]
        base = self.unwrapped
        if self.pv_scale != 1.0:
            # day_df là bản sao; không thay đổi CSV hay dữ liệu của lần chạy khác.
            base.day_df = base.day_df.copy()
            base.day_df["p_pv_kw"] *= self.pv_scale
            observation = base._get_observation()
        return self._noise(observation), info

    def _next_midnight_observation(self, row):
        base = self.unwrapped
        return np.array([
            np.clip(base.battery.soc, 0, 1),
            np.clip(float(row["p_load_kw"]) / base.p_load_max_train, 0, 1),
            np.clip(float(row["p_pv_kw"]) * self.pv_scale / base.p_pv_rated, 0, 1),
            np.clip(float(row["c_grid"]) / base.c_grid_peak_train, 0, 1),
            0.0, 1.0, float(row["is_weekday"]),
        ], dtype=np.float32)

    def step(self, action):
        observation, reward, terminated, truncated, info = self.env.step(action)
        if truncated:
            base = self.unwrapped
            next_day = base.current_day_offset + 1
            if next_day < base.data_pipeline.get_num_days(self.active_split):
                # Dùng tải/PV/giá 00:00 ngày kế tiếp nhưng GIỮ SoC sau hành động.
                # SAC bootstrap từ đây; không dùng trạng thái sau reset pin ngẫu nhiên.
                row = base.data_pipeline.get_day_data(next_day, self.active_split).iloc[0]
                observation = self._next_midnight_observation(row)
                info["continuation"] = "next_day_same_split"
            else:
                # Không nhìn sang validation/test để lấy tương lai của ngày train cuối.
                # Quy ước biên dữ liệu là terminal; không bootstrap ở đúng biên này.
                terminated, truncated = True, False
                info["continuation"] = "dataset_boundary_terminal"
        return self._noise(observation), reward, terminated, truncated, info


def make_env(settings, split="train", scenario="S5", data_pipeline=None):
    base = MicrogridBessEnv(
        config_dict=settings["environment"], split=split, data_pipeline=data_pipeline
    )
    return SACScenarioWrapper(base, scenario, settings["evaluation"])


def scenario_days(env, split, scenario, max_days=None):
    """Chọn ngày bằng dữ liệu thật, không giả định một offset luôn là chủ nhật."""
    pipeline = env.unwrapped.data_pipeline
    days = []
    for day in range(pipeline.get_num_days(split)):
        weekday = int(pipeline.get_day_data(day, split).iloc[0]["is_weekday"])
        if scenario == "S1" and weekday != 1:
            continue
        if scenario == "S2" and weekday != 0:
            continue
        days.append(day)
    if max_days is not None:
        if max_days < 1:
            raise ValueError("Số ngày đánh giá phải dương.")
        days = days[:max_days]
    if not days:
        raise ValueError(f"Không có ngày phù hợp cho {scenario} trong {split}.")
    return days


def episode(env, policy, day, seed, initial_soc):
    """Chạy đúng một ngày. policy nhận quan sát và thông tin tại CÙNG thời điểm."""
    observation, _ = env.reset(
        seed=seed, options={"day_offset": day, "initial_soc": initial_soc}
    )
    base = env.unwrapped
    history = []
    while True:
        # info từ step trước mô tả thời điểm trước; RBC phải lấy dữ liệu hiện tại.
        row = base.day_df.iloc[base.current_step]
        info_now = {
            "hour": base.current_step * base.delta_t,
            "p_load_kw": float(observation[1]) * base.p_load_max_train,
            "p_pv_kw": float(observation[2]) * base.p_pv_rated,
            "is_weekday": int(row["is_weekday"]),
        }
        action = policy(observation, info_now)
        observation, _, terminated, truncated, info = env.step(action)
        history.append(info)
        if terminated or truncated:
            return history


def policy_function(model=None, baseline=None, peak_threshold=90.0):
    if baseline == "no_battery":
        return lambda obs, info: np.array([0.0], dtype=np.float32)
    if baseline == "rule_based":
        return RuleBasedController(peak_threshold).select_action
    if model is None:
        raise ValueError("Cần mô hình hoặc tên mốc đối chuẩn.")
    return lambda obs, info: model.predict(obs, deterministic=True)[0]


def episode_metrics(history, env, initial_soc, baseline_history=None):
    """Giữ KPI gốc và thêm giá trị tồn kho điện để minh bạch SoC cuối ngày."""
    base = env.unwrapped
    baseline_cost = baseline_peak = None
    if baseline_history is not None:
        baseline_cost = sum(step["c_elec"] for step in baseline_history)
        baseline_peak = max(step["p_buy_kw"] for step in baseline_history)
    metrics = MetricsEvaluator(baseline_cost, baseline_peak).evaluate_episode(history)
    final_soc = history[-1]["soc"]
    train_start, train_end = base.data_pipeline.splits["train"]
    train = base.data_pipeline.df.iloc[
        train_start * base.episode_steps:train_end * base.episode_steps
    ]
    reference_price = float(train["c_grid"].mean())
    # Giá trị quy ước của điện có thể xả ra: delta_SoC * E_cap * eta_d * giá tham chiếu.
    # Dương cần báo cáo cả KPI gốc và KPI điều chỉnh; đây không phải hóa đơn thực tế.
    inventory_adjustment = (
        (initial_soc - final_soc) * base.battery.e_cap * base.battery.eta_d * reference_price
    )
    metrics.update({
        "initial_soc": initial_soc, "final_soc": final_soc,
        "wear_cost_vnd": sum(step["c_deg"] for step in history),
        "total_cost_vnd": sum(step["total_cost"] for step in history),
        "inventory_adjustment_vnd": inventory_adjustment,
        "inventory_reference_price": reference_price,
        "adjusted_electric_cost_vnd": metrics["daily_cost_j"] + inventory_adjustment,
        "adjusted_total_cost_vnd": sum(step["total_cost"] for step in history) + inventory_adjustment,
    })
    if baseline_cost is not None and baseline_cost > 0:
        metrics["adjusted_cost_saving_pct"] = 100 * (
            baseline_cost - metrics["adjusted_electric_cost_vnd"]
        ) / baseline_cost
    return metrics


def evaluate_policy(model, env, days, seed=0, initial_soc=0.5, baseline=None,
                    compare_baseline=True):
    """So sánh từng ngày tương ứng; không lấy một ngày so với trung bình toàn test."""
    policy = policy_function(model, baseline, env.unwrapped.p_th)
    no_battery = policy_function(baseline="no_battery")
    rows = []
    first_history = None
    for day in days:
        # Cùng seed theo ngày cho mọi phương pháp, gồm cả chuỗi nhiễu S4.
        day_seed = seed + day
        baseline_history = None
        if compare_baseline:
            baseline_history = episode(env, no_battery, day, day_seed, initial_soc)
        history = episode(env, policy, day, day_seed, initial_soc)
        rows.append({
            "day_offset": day, "seed": seed, "scenario": env.scenario,
            **episode_metrics(history, env, initial_soc, baseline_history),
        })
        if first_history is None:
            first_history = history
    return pd.DataFrame(rows), first_history


def summarize_days(frame):
    """Độ lệch chuẩn ở đây là giữa các NGÀY, khác với độ lệch chuẩn giữa seed."""
    summary = {"num_days": len(frame)}
    for name in frame.select_dtypes(include="number").columns:
        if name not in ("seed", "day_offset"):
            summary[name + "_mean"] = float(frame[name].mean())
            summary[name + "_std_days"] = float(frame[name].std(ddof=0))
    return summary


def plot_learning_curve(run_dir):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    frame = pd.read_csv(Path(run_dir) / "validation.csv")
    fig, axes = plt.subplots(2, 1, figsize=(9, 6), sharex=True)
    axes[0].plot(frame["step"], frame["episode_reward_mean"], marker="o")
    axes[0].set_ylabel("Phan thuong / ngay")
    axes[1].plot(frame["step"], frame["adjusted_total_cost_vnd_mean"], marker="o")
    axes[1].set_ylabel("Chi phi dieu chinh (VND)")
    axes[1].set_xlabel("So buoc huan luyen")
    for axis in axes:
        axis.grid(alpha=0.3)
    fig.tight_layout()
    fig.savefig(Path(run_dir) / "learning_curve.png", dpi=150)
    plt.close(fig)
