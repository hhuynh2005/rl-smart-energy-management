# SEMS-RL: Môi Trường Mô Phỏng Microgrid BESS & Solar PV (MicrogridBessEnv v1.0)

> **Báo cáo Thực hành 2 (Cập nhật):** Đề tài Quản lý Năng lượng Thông minh (Smart Energy Management System - SEMS-RL).  
> **Giảng viên hướng dẫn:** TS. Lê Nguyễn Tuấn Thành — Lớp 65KTPM — Nhóm 7 (ĐH Thủy Lợi).  
> **Phân công Môi trường (Cập nhật):** **Nguyễn Văn Huỳnh (Nhóm trưởng)** & **Lý Đình Sơn**.

---

## 1. Kiến Trúc Môi Trường & Phân Công Nhiệm Vụ

Hệ thống được thiết kế theo chuẩn **Gymnasium API** hiện đại, kế thừa triết lý mô hình hóa BESS và Microgrid từ dự án **CityLearn** (LF Energy / NREL / Pecan Street), đồng thời tinh chỉnh sát thực với lưới điện Việt Nam (Biểu giá TOU EVN 3 mức, bước thời gian 15 phút).

```
                      data/raw (CityLearn / Pecan Street / NREL)
                                        │
                                        ▼
                  sems_rl/data/data_pipeline.py (Huỳnh phụ trách)
                 (Làm sạch, Resample 15p, Gán TOU EVN, Train/Val/Test)
                                        │
                                        ▼
                               data/processed.csv
                                        │
                                        ▼
               ┌─────────────────────────────────────────────────┐
               │    sems_rl/envs/microgrid_env.py (Sơn & Huỳnh)   │
               │             Lớp: MicrogridBessEnv               │
               │                                                 │
               │  ┌──────────────────┐    ┌──────────────────┐   │
               │  │    battery.py    │    │   guardrail.py   │   │
               │  │  (Động lực pin)  │    │ (Safety Filter)  │   │
               │  └──────────────────┘    └──────────────────┘   │
               └───────▲─────────────────────────┬───────────────┘
                       │                         │ (obs, reward, info)
       (action liên tục│                         ▼
      hoặc rời rạc)    │         ┌───────────────────────────────┐
                       │         │  NoiseWrapper (Kịch bản S4)   │
                       │         │              hoặc             │
                       │         │ DiscretizeWrapper (cho DDQN)  │
                       │         └───────────────┬───────────────┘
                       │                         │
                       └─────────────────────────┴──────── Agent (SAC / TD3 / PPO / DDQN)
```

### Phân công trách nhiệm Phân hệ Môi trường:
* **Lý Đình Sơn:**
  * Xây dựng `sems_rl/envs/microgrid_env.py`: Kế thừa `gymnasium.Env`, cài đặt `reset()`, `step()`, `render()`.
  * Xây dựng `sems_rl/envs/battery.py`: Động lực học pin, tổn hao nhiệt $\eta_c = \eta_d = 0.92$, suy thoái chu kỳ $c_{wear}$.
  * Xây dựng `sems_rl/envs/guardrail.py`: Safety Guardrail chiếu $P_{cmd} \to [P_{minfeas}, P_{maxfeas}]$, phạt $P_{viol}$.
  * Xây dựng `sems_rl/envs/wrappers.py` (`DiscretizeActionWrapper` $K=11$ mức) hỗ trợ thuật toán Double DQN của Ly.
  * Bộ kiểm thử toàn diện `test_env.py` (vượt qua 8/8 test suites).
* **Nguyễn Văn Huỳnh (Nhóm trưởng):**
  * Xây dựng `sems_rl/data/data_pipeline.py` & `generator.py`: Đồng bộ 15 phút, tính thống kê chuẩn hóa $P_{load,max}^{train}, C_{peak}, C_{ref}$.
  * Thiết kế và tinh chỉnh hàm phần thưởng đa mục tiêu $R = -(C_{elec} + w_1 C_{deg} + w_2 C_{peak} + w_3 P_{viol}) / C_{ref}$.
  * Xây dựng `sems_rl/envs/wrappers.py` (`NoiseWrapper` với $\sigma_L, \sigma_{PV}$) cho kịch bản S4.
  * Xây dựng mốc đối chuẩn `sems_rl/baselines/no_battery.py` ($J_{nobat}$) và Heuristic Rule-Based Controller.
  * Chuẩn hóa cấu hình `sems_rl/config.yaml`.

---

## 2. Đặc Tả Toán Học Không Gian Trạng Thái & Hành Động

### 2.1. Không gian trạng thái $S$ (7 chiều liên tục)
$$s_t = \left[ SoC_t, \frac{P_{load,t}}{P_{load,max}^{train}}, \frac{P_{pv,t}}{P_{pv,rated}}, \frac{C_{grid,t}}{C_{grid,peak}^{train}}, \sin\left(\frac{2\pi h_t}{24}\right), \cos\left(\frac{2\pi h_t}{24}\right), d_t \right]$$
* $SoC_t \in [0, 1]$: Mức sạc pin hiện tại (vận hành an toàn $[0.2, 0.9]$).
* $P_{load,t}^{norm} \in [0, 1]$: Công suất tải chuẩn hóa theo đỉnh tập Train (~120 kW).
* $P_{pv,t}^{norm} \in [0, 1]$: Công suất PV chuẩn hóa theo $P_{pv,rated} = 150$ kWp.
* $C_{grid,t}^{norm} \in [0, 1]$: Đơn giá điện chuẩn hóa theo giá cao điểm EVN ($3,000$ VNĐ/kWh).
* $\sin/\cos(2\pi h_t/24) \in [-1, 1]$: Mã hóa giờ liên tục theo chu kỳ ngày.
* $d_t \in \{0, 1\}$: Cờ ngày làm việc (1: Thứ 2-7 có giờ cao điểm, 0: Chủ Nhật).

### 2.2. Không gian hành động $A$ (Liên tục & Rời rạc)
* **Hành động liên tục gốc (SAC, TD3, PPO):** $a_t \in [-1.0, 1.0]$.
  * $a_t \ge 0$: Sạc $P_{cmd,t} = a_t \cdot P_{charge,max}$ ($50$ kW).
  * $a_t < 0$: Xả $P_{cmd,t} = a_t \cdot P_{discharge,max}$ ($-50$ kW).
* **Hành động rời rạc (Double DQN qua `DiscretizeActionWrapper`):** $K=11$ mức:
  $$a = -1 + \frac{2k}{K-1}, \quad k \in \{0, \dots, 10\}$$
  * $k = 0 \to a = -1.0$ (Xả tối đa)
  * $k = 5 \to a = 0.0$ (Pin nghỉ)
  * $k = 10 \to a = +1.0$ (Sạc tối đa)

### 2.3. Safety Guardrail (Chiếu công suất khả thi)
$$P_{maxfeas,t} = \min\left( P_{charge,max}, \frac{(SoC_{max} - SoC_t) \cdot E_{cap}}{\eta_c \cdot \Delta t} \right)$$
$$P_{minfeas,t} = -\min\left( P_{discharge,max}, \frac{(SoC_t - SoC_{min}) \cdot E_{cap} \cdot \eta_d}{\Delta t} \right)$$
$$P_{batt,t} = \text{clip}(P_{cmd,t}, P_{minfeas,t}, P_{maxfeas,t})$$

### 2.4. Hàm phần thưởng đa mục tiêu $R$
$$r_t = - \frac{C_{elec,t} + w_1 \cdot C_{deg,t} + w_2 \cdot C_{peak,t} + w_3 \cdot P_{viol,t}}{C_{ref}}$$
* $C_{elec,t} = (C_{grid,t} \cdot P_{buy,t} - C_{feed-in} \cdot P_{sell,t}) \cdot \Delta t$
* $C_{deg,t} = c_{wear} \cdot |P_{batt,t}| \cdot \Delta t$, với $c_{wear} = \frac{C_{bat}}{2 \cdot N_{cycle} \cdot DoD} = 468.75$ VNĐ/kWh
* $C_{peak,t} = [\max(0, P_{buy,t} - P_{th})]^2$ với ngưỡng $P_{th} = 90$ kW
* $P_{viol,t} = \left[ \frac{P_{cmd,t} - P_{batt,t}}{P_{charge,max}} \right]^2$
* $C_{ref} = \text{mean}(C_{grid}^{train}) \times \text{mean}(P_{load}^{train}) \times \Delta t \approx 26,000$ VNĐ/bước

---

## 3. Cấu Trúc Thư Mục Source Code

```
D:\Nam_4\RL/
├── sems_rl/
│   ├── __init__.py                  # Package exports
│   ├── config.yaml                  # Cấu hình pin, lưới, biểu giá EVN, trọng số
│   ├── envs/
│   │   ├── __init__.py
│   │   ├── battery.py               # Lớp Battery (Động lực học pin BESS)
│   │   ├── guardrail.py             # Lớp SafetyGuardrail
│   │   ├── microgrid_env.py         # Lớp MicrogridBessEnv (Gymnasium.Env)
│   │   └── wrappers.py              # DiscretizeActionWrapper & NoiseWrapper
│   ├── data/
│   │   ├── __init__.py
│   │   ├── generator.py             # Sinh 365 ngày dữ liệu tải/PV/TOU thực tế
│   │   └── data_pipeline.py         # Nạp, xử lý, chia 70/15/15 và chuẩn hóa
│   ├── baselines/
│   │   ├── __init__.py
│   │   └── no_battery.py            # NoBatteryBaseline & RuleBasedController
│   └── metrics/
│       ├── __init__.py
│       └── evaluator.py             # Bộ đo % tiết kiệm, Peak shaving, EFC, v.v.
├── data/
│   └── processed.csv                # File dữ liệu 35,040 bước (15 phút/bước)
├── test_env.py                      # Bộ 8 bài test đơn vị & kiểm thử Gymnasium API
└── train_demo_sb3.py                # Script demo huấn luyện thử SAC và DQN
```

---

## 4. Hướng Dẫn Sử Dụng & Chạy Thử

### 4.1. Chạy kiểm thử môi trường (8 bài test đơn vị)
```powershell
python test_env.py
```
*Kết quả:* Vượt qua 100% các kiểm tra về Gymnasium API, phương trình cân bằng công suất, chặn an toàn SoC [0.2, 0.9], độ dài episode 96 bước, tính tái lập seed, wrapper rời rạc và mốc No-battery.

### 4.2. Chạy thử nghiệm huấn luyện với Stable-Baselines3
```powershell
python train_demo_sb3.py
```
*Kết quả:* Huấn luyện thử nghiệm thành công 1,000 bước SAC (thuật toán liên tục) và 1,000 bước DQN (thuật toán rời rạc $K=11$).

### 4.3. Cách sử dụng môi trường trong code của từng thành viên

#### Cho Trường & Huỳnh (SAC) hoặc Quang Anh (TD3) hoặc Dương (PPO):
```python
import gymnasium as gym
from sems_rl.envs.microgrid_env import MicrogridBessEnv

# Khởi tạo môi trường huấn luyện
env = MicrogridBessEnv(split="train")

obs, info = env.reset(seed=42)
action = env.action_space.sample() # a in [-1.0, 1.0]
next_obs, reward, terminated, truncated, step_info = env.step(action)
```

#### Cho Ly & Sơn (Double DQN - DDQN):
```python
from sems_rl.envs.microgrid_env import MicrogridBessEnv
from sems_rl.envs.wrappers import DiscretizeActionWrapper

base_env = MicrogridBessEnv(split="train")
# Bọc wrapper rời rạc hóa 11 mức: k in {0..10} -> a in [-1.0, 1.0]
env_ddqn = DiscretizeActionWrapper(base_env, num_actions=11)

obs, info = env_ddqn.reset(seed=42)
action_idx = 5 # Mức k=5 tương ứng pin nghỉ (a = 0.0)
next_obs, reward, terminated, truncated, step_info = env_ddqn.step(action_idx)
```

#### Cho Huỳnh & Dương (Thử nghiệm độ bền S4 với NoiseWrapper):
```python
from sems_rl.envs.microgrid_env import MicrogridBessEnv
from sems_rl.envs.wrappers import NoiseWrapper

base_env = MicrogridBessEnv(split="test")
env_s4 = NoiseWrapper(base_env, sigma_load=0.08, sigma_pv=0.15)
```
