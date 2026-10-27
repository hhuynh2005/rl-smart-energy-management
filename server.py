"""
SEMS-RL: FastAPI Backend Server
Cung cấp API mô phỏng Microgrid BESS & Solar PV cho giao diện React.
Dựa trên kiến trúc CityLearn / Gymnasium v1.0 và Báo cáo TH2 Nhóm 7.
"""

import sys
import os
import io

# Đảm bảo console Windows xử lý UTF-8
for stream in [sys.stdout, sys.stderr]:
    if hasattr(stream, "reconfigure"):
        try:
            stream.reconfigure(encoding="utf-8")
        except Exception:
            pass

from typing import Optional, List, Dict, Any
import numpy as np
import pandas as pd
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, JSONResponse
from pydantic import BaseModel, Field

from sems_rl.envs.microgrid_env import MicrogridBessEnv
from sems_rl.envs.wrappers import NoiseWrapper
from sems_rl.baselines.no_battery import NoBatteryBaseline, RuleBasedController
from sems_rl.metrics.evaluator import MetricsEvaluator

app = FastAPI(
    title="SEMS-RL Microgrid API",
    description="Backend API mô phỏng hệ thống năng lượng thông minh BESS & Solar PV",
    version="1.0.0",
)

# Cấu hình CORS để React (chạy trên port 5173 hoặc bất kỳ port nào) gọi được API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Cache môi trường mô phỏng
_global_env: Optional[MicrogridBessEnv] = None

def get_env() -> MicrogridBessEnv:
    global _global_env
    if _global_env is None:
        config_path = "sems_rl/config.yaml"
        if not os.path.exists(config_path):
            config_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "sems_rl", "config.yaml")
        _global_env = MicrogridBessEnv(config_path=config_path)
    return _global_env


class SimulationRequest(BaseModel):
    scenario: str = Field(default="S1: Ngày làm việc điển hình (Typical Weekday)")
    split: str = Field(default="test")
    target_day: int = Field(default=0)
    policy_mode: str = Field(default="rbc")  # "nobat", "rbc", "custom"
    initial_soc: float = Field(default=0.50, ge=0.20, le=0.90)
    apply_noise: bool = Field(default=False)


def decompose_energy_flows(p_load: float, p_pv: float, p_batt: float, p_grid: float, p_buy: float, p_sell: float) -> Dict[str, float]:
    """
    Phân rã chính xác các luồng năng lượng tức thời (kW) giữa 4 thực thể:
    Mặt trời (PV), Pin BESS, Phụ tải nhà (House), Lưới EVN (Grid).
    """
    p_load = max(0.0, p_load)
    p_pv = max(0.0, p_pv)
    p_buy = max(0.0, p_buy)
    p_sell = max(0.0, p_sell)
    
    # 1. PV cấp trực tiếp cho tải nhà
    pv_to_house = min(p_pv, p_load)
    rem_pv = max(0.0, p_pv - pv_to_house)
    rem_load = max(0.0, p_load - pv_to_house)
    
    # 2. Pin nạp / xả
    pv_to_batt = 0.0
    grid_to_batt = 0.0
    batt_to_house = 0.0
    
    if p_batt > 0:  # Đang sạc pin
        p_charge = p_batt
        pv_to_batt = min(rem_pv, p_charge)
        rem_pv = max(0.0, rem_pv - pv_to_batt)
        rem_charge = max(0.0, p_charge - pv_to_batt)
        grid_to_batt = min(p_buy, rem_charge)
    elif p_batt < 0:  # Đang xả pin
        p_discharge = abs(p_batt)
        batt_to_house = min(rem_load, p_discharge)
        rem_load = max(0.0, rem_load - batt_to_house)
        
    # 3. Lưới mua cấp cho nhà
    grid_to_house = min(p_buy, rem_load)
    
    # 4. Điện dư PV bán lên lưới
    pv_to_grid = p_sell

    return {
        "pv_to_house": round(float(pv_to_house), 2),
        "pv_to_batt": round(float(pv_to_batt), 2),
        "pv_to_grid": round(float(pv_to_grid), 2),
        "batt_to_house": round(float(batt_to_house), 2),
        "grid_to_house": round(float(grid_to_house), 2),
        "grid_to_batt": round(float(grid_to_batt), 2),
    }


def get_tou_tier(hour: float, is_weekday: int) -> str:
    """Xác định khung giá EVN TOU theo giờ và ngày."""
    if 22.0 <= hour or hour < 4.0:
        return "off_peak"
    if is_weekday == 1:
        if (9.5 <= hour < 11.5) or (17.0 <= hour < 20.0):
            return "peak"
    return "normal"


@app.get("/api/health")
def health_check():
    return {"status": "ok", "app": "SEMS-RL Microgrid API"}


@app.get("/api/scenarios")
def get_scenarios():
    """Trả về danh sách kịch bản, cấu hình phân vùng dữ liệu và thông số kỹ thuật."""
    env = get_env()
    return {
        "scenarios": [
            {
                "id": "S1",
                "name": "S1: Ngày làm việc điển hình (Typical Weekday)",
                "split": "test",
                "default_day": 0,
                "noise": False,
                "description": "Ngày trong tuần phụ tải cao điểm tiêu chuẩn, thích hợp đánh giá khả năng cắt đỉnh của BESS.",
            },
            {
                "id": "S2",
                "name": "S2: Ngày cuối tuần (Weekend - Tải thấp, không giờ cao điểm)",
                "split": "test",
                "default_day": 2,
                "noise": False,
                "description": "Ngày chủ nhật biểu giá không có giờ cao điểm, phụ tải thấp hơn ngày làm việc.",
            },
            {
                "id": "S3",
                "name": "S3: Ngày nhiều mây (Cloudy Day - PV giảm 50%)",
                "split": "test",
                "default_day": 5,
                "noise": False,
                "description": "Bức xạ mặt trời suy giảm 50% do mây mù che phủ, kiểm thử khả năng thích ứng của hệ thống.",
            },
            {
                "id": "S4",
                "name": "S4: Thử độ bền với Nhiễu (Robustness Test - NoiseWrapper)",
                "split": "test",
                "default_day": 0,
                "noise": True,
                "description": "Kích hoạt NoiseWrapper với nhiễu Gaussian ngẫu nhiên lên tải và PV để thử nghiệm độ bền.",
            },
            {
                "id": "S5",
                "name": "S5: Tùy chọn ngày tự do (Custom Date Picker)",
                "split": "test",
                "default_day": 0,
                "noise": False,
                "description": "Tự do chọn phân vùng dữ liệu (train/val/test) và bất kỳ ngày nào trong tập dữ liệu.",
            },
        ],
        "splits": {
            "test": env.data_pipeline.get_num_days("test"),
            "val": env.data_pipeline.get_num_days("val"),
            "train": env.data_pipeline.get_num_days("train"),
        },
        "policies": [
            {"id": "nobat", "name": "Mốc đối chuẩn: No-Battery (Pin nghỉ, a=0)"},
            {"id": "rbc", "name": "Heuristic: Rule-Based Controller (Chuyên gia)"},
            {"id": "custom", "name": "Thủ công: Interactive Custom Schedule (Sạc đêm, xả chiều)"},
        ],
        "specs": {
            "battery_capacity_kwh": float(env.battery.e_cap),
            "p_charge_max_kw": float(env.battery.p_charge_max),
            "p_discharge_max_kw": float(env.battery.p_discharge_max),
            "efficiency": float(env.battery.eta_c),
            "soc_min": float(env.battery.soc_min),
            "soc_max": float(env.battery.soc_max),
            "pv_rated_kwp": float(env.p_pv_rated),
            "peak_threshold_kw": float(env.p_th),
            "c_feed_in_vnd": float(env.c_feed_in),
            "delta_t_hours": float(env.delta_t),
            "steps_per_day": int(env.episode_steps),
        },
        "tou_tariffs": {
            "peak": 3000.0,
            "normal": 1800.0,
            "off_peak": 1100.0,
            "feed_in": 600.0,
        }
    }


@app.post("/api/simulate")
def simulate(req: SimulationRequest):
    """
    Thực hiện mô phỏng chu kỳ 24h (96 bước, mỗi bước 15 phút).
    Chạy song song:
    1. Kịch bản được yêu cầu với Policy đã chọn
    2. Mốc No-Battery để tính toán deltas đối chuẩn
    """
    env = get_env()
    
    # 1. Xác định kịch bản và ngày mục tiêu
    scenario_str = req.scenario
    split = req.split
    target_day = req.target_day
    apply_noise = req.apply_noise
    
    if "S1:" in scenario_str:
        split = "test"
        target_day = 0
        apply_noise = False
    elif "S2:" in scenario_str:
        split = "test"
        target_day = 2
        apply_noise = False
    elif "S3:" in scenario_str:
        split = "test"
        target_day = 5
        apply_noise = False
    elif "S4:" in scenario_str:
        split = "test"
        target_day = 0
        apply_noise = True
        
    sim_env = env
    if apply_noise:
        sim_env = NoiseWrapper(env, sigma_load=0.08, sigma_pv=0.15, seed=42)

    # 2. Chạy mốc đối chuẩn No-Battery
    obs, info = sim_env.reset(options={"day_offset": target_day, "split": split, "initial_soc": req.initial_soc})
    nobat_history = []
    while True:
        obs, reward, term, trunc, step_info = sim_env.step(np.array([0.0], dtype=np.float32))
        nobat_history.append(step_info)
        if term or trunc:
            break
            
    df_nobat = pd.DataFrame(nobat_history)
    j_nobat = float(df_nobat["c_elec"].sum())
    peak_nobat = float(df_nobat["p_buy_kw"].max())

    # 3. Chạy chính sách điều khiển được chọn
    obs, info = sim_env.reset(options={"day_offset": target_day, "split": split, "initial_soc": req.initial_soc})
    rbc = RuleBasedController(p_th=env.p_th)
    sim_history = []
    step_idx = 0
    
    while True:
        if req.policy_mode == "nobat" or "No-Battery" in req.policy_mode:
            action = np.array([0.0], dtype=np.float32)
        elif req.policy_mode == "rbc" or "Rule-Based" in req.policy_mode:
            action = rbc.select_action(obs, info)
        else:
            # Custom heuristic
            h = (step_idx * 0.25) % 24.0
            if 22.0 <= h or h < 4.0:
                act_val = 0.6  # Sạc đêm
            elif (9.5 <= h < 11.5) or (17.0 <= h < 20.0):
                act_val = -1.0  # Xả mạnh cao điểm
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
    kpi_metrics = evaluator.evaluate_episode(sim_history)

    # 4. Làm giàu chuỗi dữ liệu 96 bước cho Frontend và Mô phỏng Căn nhà
    timeline = []
    cum_cost = 0.0
    cum_pv_gen = 0.0
    cum_load_energy = 0.0
    
    for i in range(len(sim_history)):
        row = sim_history[i]
        nobat_row = nobat_history[i]
        
        hour_val = float(row["hour"])
        mins = int(round((hour_val % 1.0) * 60))
        hrs = int(hour_val)
        time_str = f"{hrs:02d}:{mins:02d}"
        
        # Dòng năng lượng
        flows = decompose_energy_flows(
            p_load=float(row["p_load_kw"]),
            p_pv=float(row["p_pv_kw"]),
            p_batt=float(row["p_batt_kw"]),
            p_grid=float(row["p_grid_kw"]),
            p_buy=float(row["p_buy_kw"]),
            p_sell=float(row["p_sell_kw"]),
        )
        
        tou_tier = get_tou_tier(hour_val, int(row["is_weekday"]))
        cum_cost += float(row["c_elec"])
        cum_pv_gen += float(row["p_pv_kw"]) * 0.25
        cum_load_energy += float(row["p_load_kw"]) * 0.25
        
        # Vị trí mặt trời và cường độ ánh sáng
        # Giờ chiếu sáng từ 06:00 đến 18:00
        if 6.0 <= hour_val <= 18.0:
            sun_angle = (hour_val - 6.0) / 12.0 * 180.0  # 0 to 180 degrees
            sun_intensity = np.sin(np.pi * (hour_val - 6.0) / 12.0)
        else:
            sun_angle = None
            sun_intensity = 0.0

        step_record = {
            "step": int(row["step"]),
            "hour": round(hour_val, 2),
            "time_str": time_str,
            "tou_tier": tou_tier,
            "p_load_kw": round(float(row["p_load_kw"]), 2),
            "p_pv_kw": round(float(row["p_pv_kw"]), 2),
            "p_batt_kw": round(float(row["p_batt_kw"]), 2),
            "p_grid_kw": round(float(row["p_grid_kw"]), 2),
            "p_buy_kw": round(float(row["p_buy_kw"]), 2),
            "p_sell_kw": round(float(row["p_sell_kw"]), 2),
            "soc": round(float(row["soc"]), 4),
            "soc_pct": round(float(row["soc"]) * 100.0, 1),
            "c_grid": round(float(row["c_grid"]), 0),
            "c_elec": round(float(row["c_elec"]), 1),
            "c_deg": round(float(row["c_deg"]), 1),
            "reward": round(float(row["reward"]), 4),
            "is_clipped": bool(row["is_clipped"]),
            "p_viol": round(float(row["p_viol"]), 2),
            "nobat_p_buy_kw": round(float(nobat_row["p_buy_kw"]), 2),
            "cum_cost_vnd": round(cum_cost, 0),
            "sun_intensity": round(float(sun_intensity), 2),
            "sun_angle": round(float(sun_angle), 1) if sun_angle is not None else None,
            "flows": flows,
        }
        timeline.append(step_record)

    return {
        "success": True,
        "scenario": req.scenario,
        "split": split,
        "target_day": target_day,
        "policy_mode": req.policy_mode,
        "initial_soc": req.initial_soc,
        "apply_noise": apply_noise,
        "kpi_metrics": {
            "daily_cost_j": float(kpi_metrics["daily_cost_j"]),
            "cost_saving_pct": float(kpi_metrics.get("cost_saving_pct", 0.0)),
            "peak_buy_kw": float(kpi_metrics["peak_buy_kw"]),
            "peak_shaving_pct": float(kpi_metrics.get("peak_shaving_pct", 0.0)),
            "pv_self_consumption_pct": float(kpi_metrics["pv_self_consumption"] * 100.0),
            "efc": float(kpi_metrics["efc"]),
            "clipped_steps": int(kpi_metrics["clipped_steps"]),
            "total_steps": 96,
            "j_nobat": j_nobat,
            "peak_nobat": peak_nobat,
        },
        "timeline": timeline,
    }


@app.post("/api/export-csv")
def export_csv(req: SimulationRequest):
    """Xuất bảng dữ liệu 96 bước dưới định dạng CSV."""
    sim_result = simulate(req)
    timeline = sim_result["timeline"]
    df = pd.DataFrame(timeline)
    
    # Flatten flows nếu có
    if "flows" in df.columns:
        flows_df = pd.json_normalize(df["flows"])
        df = pd.concat([df.drop(columns=["flows"]), flows_df], axis=1)
        
    csv_buffer = io.StringIO()
    df.to_csv(csv_buffer, index=False, encoding="utf-8-sig")
    csv_bytes = csv_buffer.getvalue().encode("utf-8-sig")
    
    filename = f"sems_sim_{req.split}_day{req.target_day}_{req.policy_mode}.csv"
    return StreamingResponse(
        io.BytesIO(csv_bytes),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


from fastapi.staticfiles import StaticFiles

# Phục vụ giao diện React đã build (Single command mode: chỉ cần chạy python server.py)
frontend_dist = os.path.join(os.path.dirname(os.path.abspath(__file__)), "frontend", "dist")
if os.path.exists(frontend_dist):
    app.mount("/", StaticFiles(directory=frontend_dist, html=True), name="static")


if __name__ == "__main__":
    import uvicorn
    print("Khởi chạy SEMS-RL API & Web App trên http://localhost:8000 ...")
    uvicorn.run("server:app", host="0.0.0.0", port=8000, reload=True)

