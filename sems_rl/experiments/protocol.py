"""Giao thức thực nghiệm, wrapper kịch bản S1-S5 và phép đo dùng chung cho SEMS-RL.

Thiết kế tương thích trực tiếp với quy ước `sac-daily-v1` (nhánh SAC của Trường)
để đánh giá công bằng giữa No-battery, Rule-based, SAC, TD3, PPO và Double DQN.
"""

from copy import deepcopy
import hashlib
import importlib
import json
import math
from pathlib import Path
import platform
import random
from typing import Any, Callable, Dict, List, Optional, Sequence, Tuple

import gymnasium as gym
import numpy as np
import pandas as pd
import torch
import yaml

from sems_rl.baselines.no_battery import RuleBasedController
from sems_rl.envs.microgrid_env import MicrogridBessEnv
from sems_rl.metrics.evaluator import MetricsEvaluator


ROOT = Path(__file__).resolve().parents[2]
PROTOCOL = "sems-daily-v1"
COMPATIBLE_PROTOCOLS = {"sems-daily-v1", "sac-daily-v1"}
SCENARIOS = ("S1", "S2", "S3", "S4", "S5")
_KNOWN_ALGOS = ("ppo", "sac", "td3", "ddqn", "dqn")

METHOD_ORDER: Dict[str, int] = {
    "no_battery": 0,
    "rule_based": 1,
    "sac_custom": 2,
    "sac_sb3": 3,
    "sac": 3,
    "td3_custom": 4,
    "td3_sb3": 5,
    "td3": 5,
    "ppo_sb3": 6,
    "ppo": 6,
    "ddqn": 7,
    "ddqn_sb3": 8,
    "dqn_sb3": 8,
}

METHOD_LABELS: Dict[str, str] = {
    "no_battery": "No-battery",
    "rule_based": "Rule-based",
    "sac_custom": "SAC (Custom)",
    "sac_sb3": "SAC (SB3)",
    "sac": "SAC",
    "td3_custom": "TD3 (Custom)",
    "td3_sb3": "TD3 (SB3)",
    "td3": "TD3",
    "ppo_sb3": "PPO (SB3)",
    "ppo": "PPO",
    "ddqn": "DDQN",
    "ddqn_sb3": "DDQN (SB3)",
    "dqn_sb3": "DQN (SB3)",
}

METHOD_COLORS: Dict[str, str] = {
    "no_battery": "#64748b",
    "rule_based": "#10b981",
    "sac_custom": "#8b5cf6",
    "sac_sb3": "#7c3aed",
    "sac": "#8b5cf6",
    "td3_custom": "#ec4899",
    "td3_sb3": "#db2777",
    "td3": "#ec4899",
    "ppo_sb3": "#2563eb",
    "ppo": "#2563eb",
    "ddqn": "#f59e0b",
    "ddqn_sb3": "#d97706",
    "dqn_sb3": "#d97706",
}


def format_rel_path(path: Any) -> str:
    """Chuẩn hóa đường dẫn nằm trong repo về dạng tương đối POSIX để chia sẻ an toàn."""
    p = Path(path)
    try:
        return p.resolve().relative_to(ROOT.resolve()).as_posix()
    except ValueError:
        return p.as_posix()


def display_method_name(method: str) -> str:
    """Trả về tên hiển thị đẹp cho phương pháp trong biểu đồ."""
    return METHOD_LABELS.get(method, method)


def sort_methods(methods: Sequence[str]) -> List[str]:
    """Sắp xếp danh sách phương pháp theo thứ tự chuẩn (Baseline -> Off-policy -> PPO -> DDQN)."""
    return sorted(methods, key=lambda m: (METHOD_ORDER.get(m, 99), m))


def infer_run_identity(metadata: Dict[str, Any]) -> Tuple[str, str, str]:
    """Nhận diện (algorithm, backend, label) từ metadata của mọi nhánh SEMS-RL."""
    method_raw = str(metadata.get("method") or "").strip().lower()
    backend = str(metadata.get("backend") or "").strip().lower()
    settings = metadata.get("settings", {}) or {}
    agent_cfg = settings.get("agent", {}) or {}
    cfg_algo = str(agent_cfg.get("algorithm") or "").strip().lower()

    if cfg_algo:
        algo = cfg_algo
    elif method_raw:
        algo = method_raw
    elif backend in _KNOWN_ALGOS:
        algo = backend
    elif "num_actions" in agent_cfg and ("double" in agent_cfg or "epsilon_start" in agent_cfg):
        algo = "ddqn"
    else:
        # Tương thích metadata từ nhánh SAC của Trường (không đặt khóa `method`/`algorithm`)
        algo = "sac"

    if backend and backend not in algo:
        label = f"{algo}_{backend}"
    else:
        label = algo
    return algo, backend, label


def seed_everything(seed: int, threads: int = 1) -> None:
    """Cố định seed cho Python, NumPy và PyTorch (CPU + CUDA)."""
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)
    if threads and threads > 0:
        torch.set_num_threads(int(threads))


def read_settings(
    config_path: Optional[Path] = None,
    env_config_path: Optional[Path] = None,
    default_config: str = "configs/ppo.yaml",
) -> Dict[str, Any]:
    """Đọc cấu hình thuật toán và cấu hình môi trường; kiểm tra tồn tại CSV."""
    cfg_path = Path(config_path or ROOT / default_config).resolve()
    with cfg_path.open(encoding="utf-8") as stream:
        settings = yaml.safe_load(stream)

    env_path = Path(env_config_path or ROOT / "sems_rl/config.yaml").resolve()
    with env_path.open(encoding="utf-8") as stream:
        settings["environment"] = yaml.safe_load(stream)

    data_path = Path(settings["environment"]["data"]["file_path"])
    if not data_path.is_absolute():
        data_path = ROOT / data_path
    if not data_path.is_file():
        raise FileNotFoundError(f"Không tìm thấy dữ liệu: {data_path}")
    settings["environment"]["data"]["file_path"] = str(data_path.resolve())
    return settings


def write_json(path: Path, content: Any) -> None:
    """Ghi JSON UTF-8 chuẩn, từ chối NaN/Inf và bảo đảm ký tự xuống dòng cuối tệp."""
    text = json.dumps(content, ensure_ascii=False, indent=2, allow_nan=False)
    Path(path).write_text(text + "\n", encoding="utf-8")


def protocol_fingerprint(metadata: Dict[str, Any], include_protocol: bool = False) -> str:
    """Tạo dấu vân tay môi trường + dữ liệu + quy ước đánh giá (bỏ qua đường dẫn máy)."""
    environment = deepcopy(metadata["environment"])
    environment.get("data", {}).pop("file_path", None)
    values = {
        "environment": environment,
        "evaluation": metadata["evaluation"],
        "data_sha256": metadata["data_sha256"],
    }
    if include_protocol:
        values["protocol"] = metadata.get("protocol", PROTOCOL)
    return hashlib.sha256(json.dumps(values, sort_keys=True).encode("utf-8")).hexdigest()


def experiment_metadata(
    settings: Dict[str, Any],
    method: str,
    backend: str,
    seed: int,
    dataset_path: Optional[Path] = None,
) -> Dict[str, Any]:
    """Lưu dấu vết dữ liệu, cấu hình, phiên bản thư viện cho mỗi lượt chạy."""
    import stable_baselines3

    raw_dataset = dataset_path or settings["environment"]["data"]["file_path"]
    dataset = Path(raw_dataset)
    if not dataset.is_absolute():
        dataset = ROOT / dataset
    data_hash = hashlib.sha256(dataset.read_bytes()).hexdigest()

    stored_settings = deepcopy(settings)
    if "data" in stored_settings.get("environment", {}):
        stored_settings["environment"]["data"]["file_path"] = format_rel_path(dataset)

    base_values = {
        "protocol": PROTOCOL,
        "environment": stored_settings["environment"],
        "evaluation": stored_settings["evaluation"],
        "data_sha256": data_hash,
    }
    return {
        **base_values,
        "fingerprint": protocol_fingerprint(base_values, include_protocol=False),
        "method": method,
        "backend": backend,
        "seed": seed,
        "settings": stored_settings,
        "selection_metric": "adjusted_total_cost_vnd_mean (càng thấp càng tốt)",
        "versions": {
            "python": platform.python_version(),
            "torch": str(torch.__version__),
            "cuda_available": bool(torch.cuda.is_available()),
            "gymnasium": gym.__version__,
            "stable_baselines3": stable_baselines3.__version__,
            "numpy": np.__version__,
            "pandas": pd.__version__,
        },
    }


class ScenarioWrapper(gym.Wrapper):
    """Wrapper chuẩn hóa 5 kịch bản S1-S5 và xử lý quan sát cuối ngày/biên phân vùng.

    - S1/S2: lọc ngày theo `is_weekday` thông qua `scenario_days()`.
    - S3: giảm công suất PV thực tế trong `day_df` theo `pv_scale_cloudy` (0.5).
    - S4: thêm nhiễu Gaussian có tái lập vào `obs[1]` (load) và `obs[2]` (PV).
    - Cuối ngày (`truncated=True`): nạp dữ liệu 00:00 ngày kế tiếp trong cùng split
      nhưng giữ nguyên SoC hiện tại để PPO GAE / SAC bootstrap chính xác.
      Tại ngày cuối cùng của split, chuyển `terminated=True, truncated=False` để
      không bootstrap xuyên qua phân vùng khác.
    """

    def __init__(self, env: gym.Env, scenario: str, evaluation: Dict[str, Any]):
        super().__init__(env)
        if scenario not in SCENARIOS:
            raise ValueError(f"Kịch bản không hợp lệ: {scenario}")
        self.scenario = scenario
        self.evaluation = evaluation
        self.pv_scale = float(evaluation["pv_scale_cloudy"]) if scenario == "S3" else 1.0
        self.rng = np.random.default_rng(0)
        self.active_split = env.split

    def _noise(self, observation: np.ndarray) -> np.ndarray:
        obs = observation.copy()
        if self.scenario == "S4":
            for index, key in ((1, "sigma_load"), (2, "sigma_pv")):
                multiplier = 1.0 + self.rng.normal(0.0, float(self.evaluation[key]))
                obs[index] = float(np.clip(obs[index] * multiplier, 0.0, 1.0))
        return obs

    def reset(self, *, seed: Optional[int] = None, options: Optional[Dict[str, Any]] = None):
        if seed is not None:
            self.rng = np.random.default_rng(seed)
        observation, info = self.env.reset(seed=seed, options=options)
        self.active_split = info["split"]
        base = self.unwrapped
        if self.pv_scale != 1.0:
            base.day_df = base.day_df.copy()
            base.day_df["p_pv_kw"] = base.day_df["p_pv_kw"] * self.pv_scale
            observation = base._get_observation()
            if "p_pv_kw" in info:
                info["p_pv_kw"] = float(base.day_df.iloc[0]["p_pv_kw"])
        return self._noise(observation), info

    def _next_midnight_observation(self, row: pd.Series) -> np.ndarray:
        base = self.unwrapped
        return np.array(
            [
                np.clip(base.battery.soc, 0.0, 1.0),
                np.clip(float(row["p_load_kw"]) / max(base.p_load_max_train, 1e-5), 0.0, 1.0),
                np.clip(float(row["p_pv_kw"]) * self.pv_scale / max(base.p_pv_rated, 1e-5), 0.0, 1.0),
                np.clip(float(row["c_grid"]) / max(base.c_grid_peak_train, 1e-5), 0.0, 1.0),
                0.0,
                1.0,
                float(row["is_weekday"]),
            ],
            dtype=np.float32,
        )

    def step(self, action):
        observation, reward, terminated, truncated, info = self.env.step(action)
        if truncated:
            base = self.unwrapped
            next_day = base.current_day_offset + 1
            if next_day < base.data_pipeline.get_num_days(self.active_split):
                row = base.data_pipeline.get_day_data(next_day, self.active_split).iloc[0]
                observation = self._next_midnight_observation(row)
                info["continuation"] = "next_day_same_split"
            else:
                terminated, truncated = True, False
                info["continuation"] = "dataset_boundary_terminal"
        return self._noise(observation), reward, terminated, truncated, info


# Giữ alias tương thích ngược với nhánh SAC của Trường
SACScenarioWrapper = ScenarioWrapper


def make_env(
    settings: Dict[str, Any],
    split: str = "train",
    scenario: str = "S5",
    data_pipeline=None,
) -> ScenarioWrapper:
    """Khởi tạo MicrogridBessEnv bọc ScenarioWrapper theo cấu hình chuẩn."""
    env_cfg = deepcopy(settings["environment"])
    raw_data = Path(env_cfg["data"]["file_path"])
    if not raw_data.is_absolute():
        env_cfg["data"]["file_path"] = str((ROOT / raw_data).resolve())
    base = MicrogridBessEnv(
        config_dict=env_cfg,
        split=split,
        data_pipeline=data_pipeline,
    )
    return ScenarioWrapper(base, scenario, settings["evaluation"])


def scenario_days(
    env: gym.Env,
    split: str,
    scenario: str,
    max_days: Optional[int] = None,
) -> List[int]:
    """Lấy danh sách chỉ số ngày hợp lệ cho kịch bản S1-S5 trong split."""
    pipeline = env.unwrapped.data_pipeline
    days: List[int] = []
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
        raise ValueError(f"Không có ngày phù hợp cho kịch bản {scenario} trong tập '{split}'.")
    return days


def episode(
    env: gym.Env,
    policy: Callable[[np.ndarray, Dict[str, Any]], np.ndarray],
    day: int,
    seed: int,
    initial_soc: float,
) -> List[Dict[str, Any]]:
    """Chạy đúng 1 ngày (96 bước); đảm bảo RBC và Agent nhận dữ liệu tại cùng bước t."""
    observation, _ = env.reset(
        seed=seed,
        options={"day_offset": day, "initial_soc": initial_soc},
    )
    base = env.unwrapped
    history: List[Dict[str, Any]] = []
    while True:
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


def decode_discrete_action(action_idx: int, num_actions: int = 11) -> np.ndarray:
    """Giải mã hành động rời rạc k in {0..K-1} sang hành động liên tục [-1.0, 1.0]."""
    grid = np.linspace(-1.0, 1.0, int(num_actions), dtype=np.float32)
    idx = int(np.clip(int(action_idx), 0, int(num_actions) - 1))
    return np.array([grid[idx]], dtype=np.float32)


def policy_function(
    model: Any = None,
    baseline: Optional[str] = None,
    peak_threshold: float = 90.0,
    num_discrete_actions: Optional[int] = None,
) -> Callable[[np.ndarray, Dict[str, Any]], np.ndarray]:
    """Chuẩn hóa giao diện gọi suy luận tất định cho mọi phương pháp (RL và Baseline)."""
    if baseline == "no_battery":
        return lambda obs, info: np.array([0.0], dtype=np.float32)
    if baseline == "rule_based":
        return RuleBasedController(peak_threshold).select_action
    if model is None:
        raise ValueError("Cần truyền mô hình hoặc tên mốc đối chuẩn.")

    def _predict(obs: np.ndarray, info: Dict[str, Any]) -> np.ndarray:
        raw, _ = model.predict(obs, deterministic=True)
        raw_arr = np.asarray(raw)
        if not np.isfinite(raw_arr).all():
            raise ValueError("Hành động dự đoán chứa NaN hoặc vô cực.")
        # Chỉ giải mã k -> [-1, 1] khi model thực sự trả về chỉ số nguyên (ví dụ SB3 DQN).
        # DDQNAgent tự viết của Sơn trả về sẵn giá trị float32 thuộc action_grid nên không cắt int().
        if num_discrete_actions is not None and (
            isinstance(raw, (int, np.integer)) or np.issubdtype(raw_arr.dtype, np.integer)
        ):
            scalar_idx = int(raw_arr.item())
            return decode_discrete_action(scalar_idx, num_discrete_actions)
        arr = np.asarray(raw_arr, dtype=np.float32).reshape(-1)
        return np.clip(arr, -1.0, 1.0).astype(np.float32)

    return _predict


def load_policy_from_run(
    run_dir: Path,
    metadata: Dict[str, Any],
    device: str = "cpu",
) -> Tuple[Callable[[np.ndarray, Dict[str, Any]], np.ndarray], str]:
    """Tự động nạp checkpoint tốt nhất (.zip hoặc .pt) dựa trên metadata.json."""
    run_path = Path(run_dir)
    algo, backend, label = infer_run_identity(metadata)
    agent_cfg = metadata.get("settings", {}).get("agent", {}) or {}
    num_discrete = agent_cfg.get("num_actions")

    # 1. PPO (Stable-Baselines3)
    if algo == "ppo" and (run_path / "best.zip").is_file():
        from sems_rl.agents.ppo import load_ppo_model

        model = load_ppo_model(run_path, device=device)
        return policy_function(model=model), label

    # 2. Các mô hình SB3 (.zip): SAC, TD3, DQN
    if backend == "sb3" or (run_path / "best.zip").is_file():
        import stable_baselines3 as sb3

        cls_map = {
            "sac": sb3.SAC,
            "td3": sb3.TD3,
            "ppo": sb3.PPO,
            "dqn": sb3.DQN,
            "ddqn": sb3.DQN,
        }
        sb3_cls = cls_map.get(algo)
        if sb3_cls is None:
            raise ValueError(f"Không nhận diện được thuật toán SB3 '{algo}' tại {run_path}")
        model = sb3_cls.load(run_path / "best.zip", device=device)
        discrete_k = int(num_discrete or 11) if algo in ("dqn", "ddqn") else None
        return policy_function(model=model, num_discrete_actions=discrete_k), label

    # 3. Các mô hình PyTorch tự viết (.pt): SAC, TD3, DDQN
    if (run_path / "best.pt").is_file():
        loader_candidates = {
            "sac": ("sems_rl.agents.sac", "SACAgent"),
            "td3": ("sems_rl.agents.td3", "TD3Agent"),
            "ddqn": ("sems_rl.agents.ddqn", "DDQNAgent"),
        }
        mod_name, cls_name = loader_candidates.get(algo, (f"sems_rl.agents.{algo}", f"{algo.upper()}Agent"))
        try:
            module = importlib.import_module(mod_name)
        except ModuleNotFoundError as exc:
            raise ModuleNotFoundError(
                f"Không tìm thấy module '{mod_name}' trên nhánh hiện tại để nạp {run_path / 'best.pt'}."
            ) from exc
        agent_cls = getattr(module, cls_name)
        model = agent_cls.load(run_path / "best.pt", device=device)
        discrete_k = int(num_discrete or 11) if algo in ("dqn", "ddqn") else None
        return policy_function(model=model, num_discrete_actions=discrete_k), label

    raise FileNotFoundError(f"Không tìm thấy checkpoint best.zip hoặc best.pt trong {run_path}")


def episode_metrics(
    history: List[Dict[str, Any]],
    env: gym.Env,
    initial_soc: float,
    baseline_history: Optional[List[Dict[str, Any]]] = None,
) -> Dict[str, float]:
    """Tính toàn bộ KPI Bảng 6 TH2 + chỉ số điều chỉnh tồn kho pin cuối ngày."""
    base = env.unwrapped
    baseline_cost = baseline_peak = None
    if baseline_history is not None:
        baseline_cost = float(sum(step["c_elec"] for step in baseline_history))
        baseline_peak = float(max(step["p_buy_kw"] for step in baseline_history))

    metrics = MetricsEvaluator(baseline_cost, baseline_peak).evaluate_episode(history)
    final_soc = float(history[-1]["soc"])

    train_start, train_end = base.data_pipeline.splits["train"]
    train_df = base.data_pipeline.df.iloc[
        train_start * base.episode_steps : train_end * base.episode_steps
    ]
    reference_price = float(train_df["c_grid"].mean())
    inventory_adjustment = float(
        (initial_soc - final_soc) * base.battery.e_cap * base.battery.eta_d * reference_price
    )

    wear_cost = float(sum(step["c_deg"] for step in history))
    peak_penalty = float(sum(step["c_peak"] for step in history))
    total_cost = float(sum(step["total_cost"] for step in history))
    adjusted_electric_cost = float(metrics["daily_cost_j"] + inventory_adjustment)
    adjusted_total_cost = float(total_cost + inventory_adjustment)

    metrics.update(
        {
            "initial_soc": float(initial_soc),
            "final_soc": final_soc,
            "wear_cost_vnd": wear_cost,
            "peak_penalty_sum": peak_penalty,
            "total_cost_vnd": total_cost,
            "inventory_adjustment_vnd": inventory_adjustment,
            "inventory_reference_price": reference_price,
            "adjusted_electric_cost_vnd": adjusted_electric_cost,
            "adjusted_total_cost_vnd": adjusted_total_cost,
        }
    )
    if baseline_cost is not None and baseline_cost > 0:
        metrics["adjusted_cost_saving_pct"] = float(
            100.0 * (baseline_cost - adjusted_electric_cost) / baseline_cost
        )
    if baseline_history is not None:
        metrics["baseline_cost_j"] = baseline_cost
        metrics["baseline_peak_buy_kw"] = baseline_peak
    return metrics


def evaluate_policy(
    model_or_fn: Any,
    env: gym.Env,
    days: Sequence[int],
    seed: int = 0,
    initial_soc: float = 0.5,
    baseline: Optional[str] = None,
    compare_baseline: bool = True,
) -> Tuple[pd.DataFrame, Optional[List[Dict[str, Any]]]]:
    """Đánh giá một chính sách qua danh sách ngày, so sánh từng ngày với No-battery."""
    if callable(model_or_fn) and baseline is None:
        policy = model_or_fn
    else:
        policy = policy_function(model_or_fn, baseline, env.unwrapped.p_th)
    no_battery = policy_function(baseline="no_battery")

    rows: List[Dict[str, Any]] = []
    first_history: Optional[List[Dict[str, Any]]] = None
    for day in days:
        day_seed = int(seed) + int(day)
        baseline_history = (
            episode(env, no_battery, day, day_seed, initial_soc) if compare_baseline else None
        )
        history = episode(env, policy, day, day_seed, initial_soc)
        rows.append(
            {
                "day_offset": int(day),
                "seed": int(seed),
                "scenario": env.scenario,
                **episode_metrics(history, env, initial_soc, baseline_history),
            }
        )
        if first_history is None:
            first_history = history
    return pd.DataFrame(rows), first_history


def summarize_days(frame: pd.DataFrame) -> Dict[str, float]:
    """Tổng hợp trung bình và độ lệch chuẩn theo NGÀY trong 1 lượt validation."""
    summary: Dict[str, float] = {"num_days": float(len(frame))}
    for name in frame.select_dtypes(include="number").columns:
        if name not in ("seed", "day_offset"):
            summary[f"{name}_mean"] = float(frame[name].mean())
            summary[f"{name}_std_days"] = float(frame[name].std(ddof=0))
    return summary


def bootstrap_ci(
    values: Sequence[float],
    n_boot: int = 1000,
    ci: float = 0.95,
    seed: int = 0,
) -> Tuple[float, float]:
    """Tính khoảng tin cậy bootstrap (mặc định 95%) cho phân phối mẫu theo ngày."""
    arr = np.asarray(values, dtype=np.float64)
    if len(arr) == 0:
        return 0.0, 0.0
    if len(arr) == 1:
        return float(arr[0]), float(arr[0])
    rng = np.random.default_rng(seed)
    idx = rng.integers(0, len(arr), size=(n_boot, len(arr)))
    means = arr[idx].mean(axis=1)
    alpha = (1.0 - ci) / 2.0
    low, high = np.quantile(means, [alpha, 1.0 - alpha])
    return float(low), float(high)


def aggregate_results(daily: pd.DataFrame) -> Tuple[pd.DataFrame, pd.DataFrame]:
    """Tính trung bình theo ngày trong từng seed, sau đó tính mean ± std giữa các seed."""
    excluded = {
        "seed",
        "day_offset",
        "initial_soc",
        "inventory_reference_price",
    }
    metrics = [
        name for name in daily.select_dtypes(include="number").columns if name not in excluded
    ]
    by_seed = daily.groupby(["method", "scenario", "seed"], as_index=False)[metrics].mean()

    rows: List[Dict[str, Any]] = []
    for (method, scenario), group in by_seed.groupby(["method", "scenario"], sort=True):
        day_slice = daily[(daily["method"] == method) & (daily["scenario"] == scenario)]
        row: Dict[str, Any] = {
            "method": method,
            "scenario": scenario,
            "seed_count": int(len(group)),
            "num_days": int(day_slice["day_offset"].nunique()),
        }
        for name in metrics:
            row[f"{name}_mean"] = float(group[name].mean())
            row[f"{name}_std_seeds"] = (
                float(group[name].std(ddof=1)) if len(group) > 1 else 0.0
            )
            if name in ("daily_cost_j", "adjusted_electric_cost_vnd", "cost_saving_pct", "adjusted_cost_saving_pct"):
                # Trung bình qua các seed trên từng ngày trước khi bootstrap để tránh thổi phồng n = S * D
                per_day = (
                    day_slice.groupby("day_offset", as_index=False)[name].mean()[name].to_numpy()
                )
                ci_low, ci_high = bootstrap_ci(per_day)
                row[f"{name}_ci95_low"] = ci_low
                row[f"{name}_ci95_high"] = ci_high
        rows.append(row)

    summary = pd.DataFrame(rows)
    summary["_order"] = summary["method"].map(lambda m: METHOD_ORDER.get(m, 99))
    summary = summary.sort_values(["scenario", "_order", "method"]).drop(columns=["_order"]).reset_index(drop=True)
    return by_seed, summary


def compute_aggregate_savings(daily: pd.DataFrame) -> pd.DataFrame:
    """Tính % tiết kiệm trên tổng tiền toàn tập (bổ sung cho trung bình các % từng ngày)."""
    if "baseline_cost_j" not in daily.columns:
        return pd.DataFrame()
    rows: List[Dict[str, Any]] = []
    grouped = daily.groupby(["method", "scenario", "seed"], as_index=False)[
        ["daily_cost_j", "adjusted_electric_cost_vnd", "baseline_cost_j"]
    ].sum()
    for (method, scenario), grp in grouped.groupby(["method", "scenario"], sort=True):
        total_nobat = float(grp["baseline_cost_j"].mean())
        total_raw = float(grp["daily_cost_j"].mean())
        total_adj = float(grp["adjusted_electric_cost_vnd"].mean())
        raw_pct = 100.0 * (total_nobat - total_raw) / total_nobat if total_nobat > 0 else 0.0
        adj_pct = 100.0 * (total_nobat - total_adj) / total_nobat if total_nobat > 0 else 0.0
        rows.append(
            {
                "method": method,
                "scenario": scenario,
                "seed_count": int(len(grp)),
                "total_nobat_cost_vnd": total_nobat,
                "total_raw_cost_vnd": total_raw,
                "total_adjusted_cost_vnd": total_adj,
                "aggregate_raw_saving_pct": raw_pct,
                "aggregate_adjusted_saving_pct": adj_pct,
            }
        )
    df = pd.DataFrame(rows)
    if not df.empty:
        df["_order"] = df["method"].map(lambda m: METHOD_ORDER.get(m, 99))
        df = df.sort_values(["scenario", "_order", "method"]).drop(columns=["_order"]).reset_index(drop=True)
    return df


def format_summary_markdown(summary: pd.DataFrame) -> str:
    """Tạo bảng Markdown tổng hợp cố định thứ tự phương pháp, sẵn sàng đưa vào báo cáo/Slide."""
    ordered = summary.copy()
    ordered["_order"] = ordered["method"].map(lambda m: METHOD_ORDER.get(m, 99))
    ordered = ordered.sort_values(["scenario", "_order", "method"]).drop(columns=["_order"])

    lines = [
        "| Kịch bản | Phương pháp | Seeds | Tiền điện gốc (đ/ngày) | Tiết kiệm gốc (%) | Tiền điện ĐC tồn kho (đ/ngày) | Tiết kiệm ĐC (%) | Tổng ĐC (đ/ngày) | Đỉnh mua (kW) | EFC | Lệnh bị cắt |",
        "| :--- | :--- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    ]
    for _, r in ordered.iterrows():
        lines.append(
            f"| {r['scenario']} | {display_method_name(r['method'])} | {int(r['seed_count'])} | "
            f"{r['daily_cost_j_mean']:,.0f} ± {r['daily_cost_j_std_seeds']:,.0f} | "
            f"{r['cost_saving_pct_mean']:.2f} ± {r['cost_saving_pct_std_seeds']:.2f} | "
            f"{r['adjusted_electric_cost_vnd_mean']:,.0f} ± {r['adjusted_electric_cost_vnd_std_seeds']:,.0f} | "
            f"{r['adjusted_cost_saving_pct_mean']:.2f} ± {r['adjusted_cost_saving_pct_std_seeds']:.2f} | "
            f"{r['adjusted_total_cost_vnd_mean']:,.0f} ± {r['adjusted_total_cost_vnd_std_seeds']:,.0f} | "
            f"{r['peak_buy_kw_mean']:.2f} | {r['efc_mean']:.3f} | {r['clipped_steps_mean']:.1f}/96 |"
        )
    return "\n".join(lines) + "\n"


def plot_learning_curve(run_dir: Path) -> None:
    """Vẽ đường cong validation cho từng lượt huấn luyện kèm mốc đối chuẩn và điểm chọn."""
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    from matplotlib.ticker import FuncFormatter

    run_path = Path(run_dir)
    frame = pd.read_csv(run_path / "validation.csv")
    best_step: Optional[int] = None
    best_cost: Optional[float] = None
    summary_path = run_path / "training_summary.json"
    if summary_path.is_file():
        tr_summary = json.loads(summary_path.read_text(encoding="utf-8"))
        best_step = int(tr_summary["best_step"])
        best_cost = float(tr_summary["best_validation_adjusted_total_cost_vnd"])

    fig, axes = plt.subplots(2, 1, figsize=(9.2, 6.2), sharex=True)
    axes[0].plot(
        frame["step"],
        frame["episode_reward_mean"],
        marker="o",
        markersize=4.5,
        linewidth=1.9,
        color="#2563eb",
        label="Phần thưởng Validation (trung bình/ngày)",
    )
    axes[0].set_ylabel("Phần thưởng / ngày")
    title = f"Đường cong học tập Validation ({run_path.name})"
    if best_step is not None:
        title += f" | Chọn best.zip tại bước {best_step:,}"
    axes[0].set_title(title)

    axes[1].plot(
        frame["step"],
        frame["adjusted_total_cost_vnd_mean"],
        marker="o",
        markersize=4.5,
        color="#d97706",
        linewidth=1.9,
        label="PPO (Tổng chi phí ĐC)",
    )
    axes[1].axhline(861399.0, color="#64748b", linestyle="--", linewidth=1.2, label="No-battery S5 (861.4k)")
    axes[1].axhline(850047.0, color="#10b981", linestyle=":", linewidth=1.4, label="Rule-based S5 (850.0k)")

    if best_step is not None and best_cost is not None:
        for axis in axes:
            axis.axvline(best_step, color="#dc2626", linestyle="--", alpha=0.55, linewidth=1.1)
        axes[1].scatter([best_step], [best_cost], color="#dc2626", s=85, zorder=5, label=f"Best ({best_step:,}: {best_cost/1000:.1f}k)")

    axes[1].yaxis.set_major_formatter(FuncFormatter(lambda v, _: f"{v / 1000:,.0f}k"))
    axes[1].set_ylabel("Tổng ĐC (nghìn đ/ngày)")
    axes[1].set_xlabel("Số bước huấn luyện")
    axes[0].legend(fontsize=8.5, loc="best")
    axes[1].legend(fontsize=8.5, loc="best")
    for axis in axes:
        axis.grid(alpha=0.3)
    fig.tight_layout()
    fig.savefig(run_path / "learning_curve.png", dpi=160)
    plt.close(fig)


def plot_ablation_comparison(
    configs_and_dirs: Sequence[Tuple[str, Path]],
    output_path: Path,
) -> None:
    """Vẽ biểu đồ đối chứng các cấu hình ablation PPO trên tập Validation S5 (seed 0)."""
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    from matplotlib.ticker import FuncFormatter

    fig, axes = plt.subplots(2, 1, figsize=(10.5, 6.8), sharex=True)
    palette = ["#94a3b8", "#64748b", "#38bdf8", "#a855f7", "#f97316", "#ec4899", "#2563eb"]
    for idx, (label, rdir) in enumerate(configs_and_dirs):
        val_csv = Path(rdir) / "ppo_seed0/validation.csv"
        if not val_csv.is_file():
            continue
        df = pd.read_csv(val_csv)
        color = palette[idx % len(palette)]
        is_final = "chốt" in label or "sde_stable" in label
        lw = 2.4 if is_final else 1.5
        alpha = 1.0 if is_final else 0.8
        axes[0].plot(df["step"], df["episode_reward_mean"], label=label, color=color, linewidth=lw, alpha=alpha)
        axes[1].plot(df["step"], df["adjusted_total_cost_vnd_mean"], label=label, color=color, linewidth=lw, alpha=alpha)

    axes[1].axhline(861399.0, color="#475569", linestyle="--", linewidth=1.2, label="No-battery S5 (861.4k)")
    axes[1].axhline(850047.0, color="#10b981", linestyle=":", linewidth=1.5, label="Rule-based S5 (850.0k)")
    axes[0].set_ylabel("Phần thưởng Val / ngày")
    axes[0].set_title("Quá trình tinh chỉnh PPO trên tập Validation S5 (seed 0)")
    axes[0].legend(fontsize=8, ncol=2, loc="lower right")
    axes[1].yaxis.set_major_formatter(FuncFormatter(lambda v, _: f"{v / 1000:,.0f}k"))
    axes[1].set_ylabel("Tổng chi phí ĐC (nghìn đ/ngày)")
    axes[1].set_xlabel("Số bước huấn luyện")
    axes[1].legend(fontsize=8, ncol=2, loc="center right")
    for axis in axes:
        axis.grid(alpha=0.3)
    fig.tight_layout()
    fig.savefig(Path(output_path), dpi=160)
    plt.close(fig)


def save_evaluation_plots(
    summary: pd.DataFrame,
    traces_by_scenario: Dict[str, Dict[str, pd.DataFrame]],
    output: Path,
    run_dirs: Optional[Sequence[Tuple[str, Path]]] = None,
    trace_seeds: Optional[Dict[str, str]] = None,
) -> None:
    """Xuất bộ biểu đồ so sánh S1-S5, vận hành 24h, trade-off và đường cong học tập."""
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    from matplotlib.patches import Patch
    from matplotlib.ticker import FuncFormatter

    scenarios = sorted(summary["scenario"].unique())
    methods = sort_methods(list(summary["method"].unique()))
    pretty_names = [display_method_name(m) for m in methods]
    colors = [METHOD_COLORS.get(m, "#3b82f6") for m in methods]
    k_fmt = FuncFormatter(lambda v, _: f"{v / 1000:,.0f}k")

    def _make_grid(n_panels: int, figsize_per_panel=(5.2, 4.1)):
        if n_panels <= 3:
            nrows, ncols = 1, max(1, n_panels)
            fig, axes = plt.subplots(nrows, ncols, figsize=(figsize_per_panel[0] * ncols, figsize_per_panel[1]), squeeze=False)
            return fig, axes, nrows, ncols
        ncols = 3
        nrows = math.ceil(n_panels / ncols)
        fig, axes = plt.subplots(nrows, ncols, figsize=(15.5, 4.1 * nrows), squeeze=False)
        return fig, axes, nrows, ncols

    # 1. Biểu đồ so sánh tiền điện điều chỉnh tồn kho qua S1-S5
    use_info_slot = len(scenarios) == 5
    n_cost_slots = 6 if use_info_slot else len(scenarios)
    fig, axes, _, _ = _make_grid(n_cost_slots)
    flat_axes = list(axes.flat)
    for idx, scenario in enumerate(scenarios):
        axis = flat_axes[idx]
        values = summary[summary["scenario"] == scenario].set_index("method").reindex(methods).dropna(how="all")
        x_idx = np.arange(len(values))
        bar_colors = [METHOD_COLORS.get(m, "#3b82f6") for m in values.index]
        bars = axis.bar(
            x_idx,
            values["adjusted_electric_cost_vnd_mean"],
            yerr=values["adjusted_electric_cost_vnd_std_seeds"],
            capsize=4,
            color=bar_colors,
            alpha=0.90,
            edgecolor="#1e293b",
            linewidth=0.5,
        )
        axis.set_xticks(x_idx)
        axis.set_xticklabels([display_method_name(m) for m in values.index], rotation=18)
        axis.yaxis.set_major_formatter(k_fmt)
        axis.set_title(f"Kịch bản {scenario}")
        if idx % 3 == 0:
            axis.set_ylabel("Nghìn đ / ngày")
        axis.grid(axis="y", alpha=0.3)
        top_max = float((values["adjusted_electric_cost_vnd_mean"] + values["adjusted_electric_cost_vnd_std_seeds"]).max())
        axis.set_ylim(0, top_max * 1.18)
        for bar, val, err in zip(
            bars,
            values["adjusted_electric_cost_vnd_mean"],
            values["adjusted_electric_cost_vnd_std_seeds"],
        ):
            axis.text(
                bar.get_x() + bar.get_width() / 2.0,
                float(val) + float(err) + top_max * 0.025,
                f"{val / 1000:,.0f}k",
                ha="center",
                va="bottom",
                fontsize=8,
            )

    if use_info_slot:
        legend_ax = flat_axes[5]
        legend_ax.axis("off")
        handles = [
            Patch(facecolor=METHOD_COLORS.get(m, "#3b82f6"), edgecolor="#1e293b", label=display_method_name(m))
            for m in methods
        ]
        legend_ax.legend(
            handles=handles,
            loc="center",
            frameon=True,
            fontsize=10,
            title="Chú giải phương pháp",
            title_fontsize=10.5,
        )
        legend_ax.text(
            0.5,
            0.12,
            "Chỉ số: Tiền điện điều chỉnh tồn kho (đ/ngày)\nThấp hơn là tiết kiệm hơn | Sai số: ±1 std giữa các seed",
            ha="center",
            va="center",
            fontsize=8.5,
            color="#475569",
            transform=legend_ax.transAxes,
        )
    else:
        for empty_ax in flat_axes[len(scenarios):]:
            empty_ax.axis("off")

    fig.suptitle("So sánh tiền điện điều chỉnh tồn kho qua các kịch bản S1–S5", fontsize=12.5, fontweight="bold")
    fig.tight_layout(rect=(0, 0, 1, 0.95))
    fig.savefig(output / "comparison_cost.png", dpi=160)
    plt.close(fig)

    # 2. Biểu đồ % tiết kiệm (hóa đơn gốc vs điều chỉnh tồn kho)
    fig, axes, _, _ = _make_grid(n_cost_slots)
    flat_axes = list(axes.flat)
    x = np.arange(len(methods))
    width = 0.36
    for idx, scenario in enumerate(scenarios):
        axis = flat_axes[idx]
        values = summary[summary["scenario"] == scenario].set_index("method").reindex(methods)
        raw_vals = values["cost_saving_pct_mean"].fillna(0.0).to_numpy()
        adj_vals = values["adjusted_cost_saving_pct_mean"].fillna(0.0).to_numpy()
        raw_err = values["cost_saving_pct_std_seeds"].fillna(0.0).to_numpy()
        adj_err = values["adjusted_cost_saving_pct_std_seeds"].fillna(0.0).to_numpy()
        axis.bar(x - width / 2, raw_vals, width, yerr=raw_err, capsize=3, label="Hóa đơn gốc", color="#10b981", alpha=0.9)
        axis.bar(x + width / 2, adj_vals, width, yerr=adj_err, capsize=3, label="Điều chỉnh tồn kho", color="#f59e0b", alpha=0.9)
        axis.axhline(0, color="black", linewidth=0.8)
        axis.set_xticks(x)
        axis.set_xticklabels(pretty_names, rotation=18)
        axis.set_title(f"Kịch bản {scenario}")
        if idx % 3 == 0:
            axis.set_ylabel("% Tiết kiệm vs No-battery")
        axis.grid(axis="y", alpha=0.3)

    if use_info_slot:
        legend_ax = flat_axes[5]
        legend_ax.axis("off")
        handles, labels_l = flat_axes[0].get_legend_handles_labels()
        legend_ax.legend(handles, labels_l, loc="center", frameon=True, fontsize=10, title="Loại chỉ số tiết kiệm", title_fontsize=10.5)
        legend_ax.text(
            0.5,
            0.14,
            "Dương (+): rẻ hơn No-battery | Âm (-): đắt hơn\nLưu ý: chưa trừ chi phí hao mòn pin (xem Tổng ĐC ở bảng Markdown)",
            ha="center",
            va="center",
            fontsize=8.5,
            color="#475569",
            transform=legend_ax.transAxes,
        )
    else:
        flat_axes[0].legend(fontsize=8.5)
        for empty_ax in flat_axes[len(scenarios):]:
            empty_ax.axis("off")

    fig.suptitle("Tỷ lệ tiết kiệm chi phí điện so với No-battery (%)", fontsize=12.5, fontweight="bold")
    fig.tight_layout(rect=(0, 0, 1, 0.95))
    fig.savefig(output / "comparison_saving.png", dpi=160)
    plt.close(fig)

    # 3. Biểu đồ vận hành 24 giờ trên ngày mẫu (S1–S5)
    for sc_key, method_traces in traces_by_scenario.items():
        if not method_traces:
            continue
        ordered_trace_keys = sort_methods(list(method_traces.keys()))
        ref_trace = next(iter(method_traces.values()))
        fig, axes = plt.subplots(3, 1, figsize=(11.5, 9.0), sharex=True)

        axes[0].plot(ref_trace["hour"], ref_trace["p_load_kw"], label="Phụ tải (Load)", color="#ef4444", linewidth=1.7)
        axes[0].fill_between(ref_trace["hour"], 0.0, ref_trace["p_pv_kw"], color="#fde68a", alpha=0.45, label="Điện mặt trời (PV)")
        axes[0].plot(ref_trace["hour"], ref_trace["p_pv_kw"], color="#d97706", linewidth=1.3, alpha=0.9)

        for m_name in ordered_trace_keys:
            tr = method_traces[m_name]
            pretty = display_method_name(m_name)
            m_color = METHOD_COLORS.get(m_name, "#2563eb")
            if m_name == "no_battery":
                axes[0].plot(tr["hour"], tr["p_buy_kw"], label="Mua lưới (No-battery)", linestyle="--", color=m_color, linewidth=1.4)
            else:
                axes[0].plot(tr["hour"], tr["p_buy_kw"], label=f"Mua lưới ({pretty})", color=m_color, linewidth=1.8, alpha=0.9)
                axes[1].plot(tr["hour"], tr["soc"] * 100.0, label=f"SoC ({pretty})", color=m_color, linewidth=1.8)

        axes[0].set_ylabel("Công suất (kW)")
        extra = " | nhiễu quan sát" if sc_key == "S4" else ""
        seed_note = f" | {trace_seeds[sc_key]}" if trace_seeds and sc_key in trace_seeds else ""
        n_top_handles = len(axes[0].get_legend_handles_labels()[0])
        legend_cols = n_top_handles if n_top_handles <= 5 else 4
        axes[0].set_title(
            f"Vận hành 24 giờ — Kịch bản {sc_key} (Ngày mẫu đầu tiên{extra}{seed_note})",
            pad=38 if legend_cols == n_top_handles else 52,
            fontweight="bold",
        )
        axes[0].legend(bbox_to_anchor=(0.5, 1.02), loc="lower center", ncol=legend_cols, fontsize=8.5, frameon=True)

        axes[1].axhline(20, linestyle="--", color="#dc2626", alpha=0.65, linewidth=1.1, label="Ngưỡng an toàn (20%–90%)")
        axes[1].axhline(90, linestyle="--", color="#dc2626", alpha=0.65, linewidth=1.1)
        axes[1].set_ylim(15, 96)
        axes[1].set_ylabel("SoC sau bước (%)")
        axes[1].legend(loc="center right", ncol=1, fontsize=8.5, frameon=True)

        axes[2].step(ref_trace["hour"], ref_trace["c_grid"], where="post", color="#7c3aed", linewidth=1.8)
        axes[2].set_ylabel("Giá EVN (đ/kWh)")
        axes[2].set_xlabel("Giờ trong ngày")
        axes[2].set_xlim(0, 24)
        axes[2].set_xticks([0, 4, 8, 12, 16, 20, 24])
        for axis in axes:
            axis.grid(alpha=0.3)
        fig.tight_layout()
        fig.savefig(output / f"example_day_{sc_key}.png", dpi=160)
        plt.close(fig)

    # 4. Biểu đồ Trade-off trên S5 (hoặc kịch bản đầu tiên)
    target_sc = "S5" if "S5" in scenarios else scenarios[0]
    sc_df = summary[summary["scenario"] == target_sc].copy()
    sc_df["_order"] = sc_df["method"].map(lambda m: METHOD_ORDER.get(m, 99))
    sc_df = sc_df.sort_values(["_order", "method"])

    fig, ax = plt.subplots(figsize=(8.4, 5.4))
    min_x = float(sc_df["efc_mean"].min())
    max_x = float(sc_df["efc_mean"].max())
    span_x = max(max_x - min_x, 0.2)
    min_y = float(sc_df["adjusted_cost_saving_pct_mean"].min())
    max_y = float(sc_df["adjusted_cost_saving_pct_mean"].max())
    span_y = max(max_y - min_y, 5.0)
    mid_x = min_x + 0.60 * span_x

    for _, row in sc_df.iterrows():
        m = str(row["method"])
        x_val = float(row["efc_mean"])
        y_val = float(row["adjusted_cost_saving_pct_mean"])
        ax.scatter(x_val, y_val, s=110, color=METHOD_COLORS.get(m, "#2563eb"), edgecolor="#0f172a", linewidth=0.7, zorder=4)
        if x_val >= mid_x:
            xytext, ha = (-8, 6), "right"
        else:
            xytext, ha = (8, 6), "left"
        ax.annotate(
            f"{display_method_name(m)} (clip={row['clipped_steps_mean']:.1f})",
            (x_val, y_val),
            textcoords="offset points",
            xytext=xytext,
            ha=ha,
            fontsize=9,
        )

    ax.set_xlim(min_x - 0.12 * span_x, max_x + 0.22 * span_x)
    ax.set_ylim(min_y - 0.16 * span_y, max_y + 0.18 * span_y)
    ax.axhline(0, color="gray", linestyle="--", linewidth=0.9)
    ax.set_xlabel("Chu kỳ sạc/xả tương đương (EFC / ngày)")
    ax.set_ylabel("Tiết kiệm tiền điện điều chỉnh tồn kho (%)")
    ax.set_title(f"Đánh đổi Hiệu quả kinh tế vs Hao mòn pin ({target_sc})", fontweight="bold")
    ax.grid(alpha=0.3)
    fig.tight_layout()
    fig.savefig(output / "tradeoff.png", dpi=160)
    plt.close(fig)

    # 5. So sánh đường cong Validation giữa các run nếu có
    if run_dirs:
        curves_by_label: Dict[str, List[pd.DataFrame]] = {}
        for label, rdir in run_dirs:
            val_csv = Path(rdir) / "validation.csv"
            if val_csv.is_file():
                curves_by_label.setdefault(label, []).append(pd.read_csv(val_csv))
        if curves_by_label:
            fig, axes = plt.subplots(2, 1, figsize=(9.8, 6.8), sharex=True)
            for label in sort_methods(list(curves_by_label.keys())):
                dfs = curves_by_label[label]
                color = METHOD_COLORS.get(label, "#2563eb")
                pretty = display_method_name(label)
                for i_seed, df_seed in enumerate(dfs):
                    lbl_seed = f"{pretty} (từng seed)" if i_seed == 0 and len(dfs) > 1 else None
                    axes[0].plot(df_seed["step"], df_seed["episode_reward_mean"], color=color, alpha=0.25, linewidth=1.0, label=lbl_seed)
                    axes[1].plot(df_seed["step"], df_seed["adjusted_total_cost_vnd_mean"], color=color, alpha=0.25, linewidth=1.0)
                merged = pd.concat(dfs, ignore_index=True)
                agg = merged.groupby("step", as_index=False).agg(
                    rew_mean=("episode_reward_mean", "mean"),
                    rew_std=("episode_reward_mean", "std"),
                    cost_mean=("adjusted_total_cost_vnd_mean", "mean"),
                    cost_std=("adjusted_total_cost_vnd_mean", "std"),
                ).fillna(0.0)
                axes[0].plot(agg["step"], agg["rew_mean"], color=color, linewidth=2.2, label=f"{pretty} (TB ± 1 std)")
                axes[0].fill_between(
                    agg["step"], agg["rew_mean"] - agg["rew_std"], agg["rew_mean"] + agg["rew_std"], color=color, alpha=0.14
                )
                axes[1].plot(agg["step"], agg["cost_mean"], color=color, linewidth=2.2, label=f"{pretty} (TB ± 1 std)")
                axes[1].fill_between(
                    agg["step"], agg["cost_mean"] - agg["cost_std"], agg["cost_mean"] + agg["cost_std"], color=color, alpha=0.14
                )
            axes[1].axhline(861399.0, color="#64748b", linestyle="--", linewidth=1.2, label="No-battery S5 (861.4k)")
            axes[1].axhline(850047.0, color="#10b981", linestyle=":", linewidth=1.4, label="Rule-based S5 (850.0k)")
            axes[0].set_ylabel("Phần thưởng Val / ngày")
            axes[0].set_title("Đường cong học tập trên tập Validation S5 (54 ngày)", fontweight="bold")
            axes[0].legend(fontsize=8.5, loc="best")
            axes[1].yaxis.set_major_formatter(k_fmt)
            axes[1].set_ylabel("Tổng ĐC (nghìn đ/ngày)")
            axes[1].set_xlabel("Số bước huấn luyện")
            axes[1].legend(fontsize=8.5, loc="best")
            for axis in axes:
                axis.grid(alpha=0.3)
            fig.tight_layout()
            fig.savefig(output / "learning_comparison.png", dpi=160)
            plt.close(fig)
