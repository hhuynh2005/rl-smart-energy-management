# SEMS-RL: Quản Lý Năng Lượng Thông Minh Bằng Học Tăng Cường (Reinforcement Learning)

> **Báo cáo Bài tập lớn Học tăng cường & Ứng dụng**  
> **Giảng viên hướng dẫn:** TS. Lê Nguyễn Tuấn Thành  
> **Đơn vị:** Khoa Công nghệ Thông tin – Trường Đại học Thủy Lợi (Lớp 65KTPM – Nhóm 7)  
> **Mã nguồn GitHub:** [https://github.com/hhuynh2005/rl-smart-energy-management](https://github.com/hhuynh2005/rl-smart-energy-management)

---

## 📑 Mục Lục
1. [Giới thiệu đề tài & Kiến trúc tổng thể](#1-giới-thiệu-đề-tài--kiến-trúc-tổng-thể)
2. [Hướng dẫn cài đặt & Tạo môi trường lập trình](#2-hướng-dẫn-cài-đặt--tạo-môi-trường-lập-trình)
3. [Phân công nhiệm vụ & Trách nhiệm hỗ trợ thuật toán của Huỳnh và Sơn](#3-phân-công-nhiệm-vụ--trách-nhiệm-hỗ-trợ-thuật-toán-của-huỳnh-và-sơn)
4. [Hướng dẫn tích hợp môi trường cho từng thuật toán (SAC, TD3, PPO, DDQN)](#4-hướng-dẫn-tích-hợp-môi-trường-cho-từng-thuật-toán)
5. [Quy trình Git & Hướng dẫn tạo nhánh làm việc nhóm](#5-quy-trình-git--hướng-dẫn-tạo-nhánh-làm-việc-nhóm)
6. [Quy trình kiểm thử & Nghiệm thu](#6-quy-trình-kiểm-thử--nghiệm-thu)

---

## 1. Giới thiệu đề tài & Kiến trúc tổng thể

Dự án **SEMS-RL** xây dựng hệ thống điều khiển thông minh lịch nạp/xả của hệ thống pin lưu trữ năng lượng (**BESS** - 200 kWh / 50 kW) kết hợp nguồn điện mặt trời áp mái (**Solar PV** - 150 kWp) và lưới điện quốc gia EVN theo biểu giá 3 mức (**TOU** - Time of Use).

Môi trường mô phỏng **`MicrogridBessEnv`** được thiết kế theo chuẩn **Gymnasium API**, kế thừa triết lý từ dự án quốc tế **CityLearn** (LF Energy / NREL) nhưng được tùy biến chuyên sâu cho dữ liệu Việt Nam.

```
data/raw (CityLearn / Pecan Street / NREL)
      │
      ▼
sems_rl/data/data_pipeline.py (Huỳnh phụ trách)
(Đồng bộ UTC+7, Resample 15 phút, Gán biểu giá EVN, Chia 70/15/15)
      │
      ▼
data/processed.csv (35,040 dòng = 365 ngày x 96 bước/ngày)
      │
      ▼
┌─────────────────────────────────────────────────────────────┐
│       sems_rl/envs/microgrid_env.py (Sơn & Huỳnh)           │
│                  Lớp: MicrogridBessEnv                      │
│                                                             │
│  ┌───────────────────────┐       ┌───────────────────────┐  │
│  │      battery.py       │       │     guardrail.py      │  │
│  │ (Động lực học pin BESS│◄─────►│   (Safety Guardrail   │  │
│  │   η = 0.92, SoC an    │       │     chiếu công suất   │  │
│  │   toàn [0.2; 0.9])    │       │   Pminfeas, Pmaxfeas) │  │
│  └───────────────────────┘       └───────────────────────┘  │
└──────────────┬──────────────────────────────────┬───────────┘
               │                                  ▲
               ▼ (obs 7 chiều, reward rt, info)   │ (action at)
┌──────────────────────────────────────────────┐  │
│ Wrappers mở rộng:                            │  │
│ 1. NoiseWrapper (Kịch bản S4 - Huỳnh)        ├──┘
│ 2. DiscretizeActionWrapper (K=11 DDQN - Sơn) │
└──────────────────────┬───────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│ 4 THUẬT TOÁN HỌC TĂNG CƯỜNG (RL AGENTS)                     │
│ 1. SAC  (Trường Lead + Huỳnh hàm thưởng)                    │
│ 2. TD3  (Quang Anh)                                         │
│ 3. PPO  (Dương + Pipeline đánh giá)                         │
│ 4. DDQN (Ly Lead + Sơn hỗ trợ Wrapper)                      │
│ 5. Baseline: No-battery (Huỳnh)                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Hướng dẫn cài đặt & Tạo môi trường lập trình

Để đảm bảo code chạy đồng nhất giữa tất cả các thành viên (Windows/Linux/macOS), yêu cầu sử dụng **Python 3.10, 3.11, 3.12 hoặc 3.13**.

### Bước 2.1: Clone repository từ GitHub
Mở Terminal hoặc PowerShell trên máy tính của bạn:
```bash
git clone git@github.com:hhuynh2005/rl-smart-energy-management.git
cd rl-smart-energy-management
```
*(Nếu chưa cấu hình SSH key, dùng HTTPS: `git clone https://github.com/hhuynh2005/rl-smart-energy-management.git`)*

### Bước 2.2: Tạo môi trường ảo (Virtual Environment)
Khuyến nghị tạo môi trường ảo độc lập để không xung đột thư viện:

* **Cách 1: Dùng `venv` tiêu chuẩn của Python (Khuyên dùng)**
  * Trên Windows (PowerShell):
    ```powershell
    python -m venv venv
    .\venv\Scripts\Activate.ps1
    ```
    *(Nếu PowerShell báo lỗi `Execution_Policies`, chạy lệnh: `Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned`)*
  * Trên Linux / macOS:
    ```bash
    python3 -m venv venv
    source venv/bin/activate
    ```

* **Cách 2: Dùng `conda` (Nếu dùng Anaconda / Miniconda)**
  ```bash
  conda create -n sems-rl python=3.11 -y
  conda activate sems-rl
  ```

### Bước 2.3: Cài đặt các gói phụ thuộc (Dependencies)
```bash
pip install --upgrade pip
pip install -r requirements.txt
```

---

## 3. Phân công nhiệm vụ & Trách nhiệm hỗ trợ thuật toán của Huỳnh và Sơn

Căn cứ theo mục **Phân chia nhiệm vụ** và **Kế hoạch triển khai tuần tới** trong [Báo cáo Thực hành 2 Cập nhật](file:///D:/Nam_4/RL/Bao_cao_TH2_Nhom_7_cap_nhat.docx), phân hệ Môi trường gồm **Nguyễn Văn Huỳnh (Nhóm trưởng)** và **Lý Đình Sơn**, chịu trách nhiệm hoàn thiện môi trường số và làm cầu nối kỹ thuật hỗ trợ trực tiếp cho 4 thuật toán.

```
                    ┌───────────────────────────────────────────────┐
                    │          PHÂN HỆ MÔI TRƯỜNG & DỮ LIỆU          │
                    │         Nguyễn Văn Huỳnh & Lý Đình Sơn        │
                    └───────┬───────────────────────────────┬───────┘
                            │                               │
            Hỗ trợ SAC      │                               │ Hỗ trợ DDQN
         (Trường + Huỳnh)   │                               │ (Ly + Sơn)
                            ▼                               ▼
       ┌───────────────────────────────┐ ┌───────────────────────────────┐
       │   NGUYỄN VĂN HUỲNH            │ │   LÝ ĐÌNH SƠN                 │
       │   (Nhóm trưởng)               │ │   (Chuyên trách Môi trường)   │
       ├───────────────────────────────┤ ├───────────────────────────────┤
       │ 1. DataPipeline & TOU EVN     │ │ 1. MicrogridBessEnv core v1.0 │
       │ 2. Hàm thưởng đa mục tiêu R   │ │ 2. Động lực học pin Battery   │
       │ 3. NoiseWrapper (Kịch bản S4) │ │ 3. Safety Guardrail an toàn   │
       │ 4. Mốc đối chuẩn No-battery   │ │ 4. DiscretizeWrapper (K=11)   │
       │ 5. Đồng phụ trách lõi SAC     │ │ 5. Hỗ trợ Ly thuật toán DDQN  │
       └───────────────────────────────┘ └───────────────────────────────┘
```

### 3.1. Nhiệm vụ cụ thể của Lý Đình Sơn
1. **Kiến trúc Môi trường `MicrogridBessEnv`:**
   * Đóng gói lớp `MicrogridBessEnv(gymnasium.Env)` tại [`sems_rl/envs/microgrid_env.py`](file:///D:/Nam_4/RL/sems_rl/envs/microgrid_env.py).
   * Cố định giao diện không gian quan sát $S$ (7 chiều liên tục) và hành động $A$ (1 chiều $a_t \in [-1, 1]$).
2. **Mô hình động lực học Pin BESS & Tổn hao:**
   * Lớp `Battery` tại [`sems_rl/envs/battery.py`](file:///D:/Nam_4/RL/sems_rl/envs/battery.py) với dung lượng $E_{cap} = 200$ kWh, công suất $50$ kW, hiệu suất $\eta_c = \eta_d = 0.92$.
   * Tính toán độ hao mòn chu kỳ $c_{wear} = \frac{C_{bat}}{2 \cdot N_{cycle} \cdot DoD} = 468.75$ VNĐ/kWh và chu kỳ tương đương EFC.
3. **Bộ lọc an toàn (Safety Guardrail):**
   * Lớp `SafetyGuardrail` tại [`sems_rl/envs/guardrail.py`](file:///D:/Nam_4/RL/sems_rl/envs/guardrail.py): Tính toán $P_{minfeas}$ và $P_{maxfeas}$, đảm bảo pin không bao giờ vượt ra ngoài dải an toàn $[0.2, 0.9]$.
   * Tính điểm phạt vi phạm $P_{viol,t} = [(P_{cmd} - P_{batt})/P_{max}]^2$ để Agent tự học tránh vùng nguy hiểm.
4. **HỖ TRỢ THUẬT TOÁN DOUBLE DQN (CHO NGUYỄN THỊ CẨM LY):**
   * Xây dựng [`DiscretizeActionWrapper`](file:///D:/Nam_4/RL/sems_rl/envs/wrappers.py#L16) biến đổi action continuous $[-1, 1]$ thành $K=11$ mức rời rạc:
     $$a = -1 + \frac{2k}{K-1}, \quad k \in \{0, \dots, 10\}$$
     *(k=0: xả tối đa, k=5: pin nghỉ, k=10: sạc tối đa)*.
   * Hỗ trợ Cẩm Ly cấu hình replay buffer, đầu Dueling và chạy thử nghiệm DDQN đối chiếu kết quả.
5. **Bộ kiểm thử đơn vị tự động:**
   * Duy trì [`test_env.py`](file:///D:/Nam_4/RL/test_env.py) đảm bảo 100% test pass khi có cập nhật.

---

### 3.2. Nhiệm vụ cụ thể của Nguyễn Văn Huỳnh
1. **Dữ liệu chuỗi thời gian & DataPipeline:**
   * Lớp `DataPipeline` tại [`sems_rl/data/data_pipeline.py`](file:///D:/Nam_4/RL/sems_rl/data/data_pipeline.py): Chuẩn hóa 15 phút, gán biểu giá TOU EVN (Cao điểm: 3,000đ, Bình thường: 1,800đ, Thấp điểm: 1,100đ, Bán ngược: 600đ).
   * Phân chia tập dữ liệu theo thời gian (không xáo trộn): **Train 70% (255 ngày), Val 15% (54 ngày), Test 15% (56 ngày)**.
   * Tính thống kê chuẩn hóa $P_{load,max}^{train}$, $C_{peak}^{train}$, $C_{ref} \approx 26,000$ VNĐ/bước độc quyền trên tập Train nhằm chống rò rỉ thông tin.
2. **Thiết kế & Tinh chỉnh Hàm Phần Thưởng Đa Mục Tiêu ($R$):**
   $$r_t = - \frac{C_{elec,t} + w_1 \cdot C_{deg,t} + w_2 \cdot C_{peak,t} + w_3 \cdot P_{viol,t}}{C_{ref}}$$
   * Tinh chỉnh các trọng số $w_1 = 1.0$, $w_2 = 1.0$, $w_3 = 10.0$ trên tập Validation.
3. **ĐỒNG TRÁCH NHIỆM THUẬT TOÁN SAC (CÙNG NGUYỄN VĂN TRƯỜNG):**
   * Phối hợp cùng Trường cài đặt mạng Actor-Critic (Gaussian + Tanh), Replay Buffer và cơ chế tự điều chỉnh nhiệt độ Entropy mục tiêu $\bar{H} = -1$.
4. **Mốc Tham Chiếu No-Battery Baseline & Rule-Based Controller:**
   * Module [`sems_rl/baselines/no_battery.py`](file:///D:/Nam_4/RL/sems_rl/baselines/no_battery.py): Cung cấp $J_{nobat}$ phục vụ đo % chi phí tiết kiệm và % cắt đỉnh tải.
5. **NoiseWrapper & Ứng dụng:**
   * Cài đặt [`NoiseWrapper`](file:///D:/Nam_4/RL/sems_rl/envs/wrappers.py#L48) ($\sigma_L = 5-10\%, \sigma_{PV} = 10-20\%$) phục vụ kịch bản thử độ bền **S4** của Dương.
   * Phụ trách chuẩn bị khung FastAPI và Dashboard Streamlit cho Thực hành 6.

---

## 4. Hướng dẫn tích hợp môi trường cho từng thuật toán

Môi trường `MicrogridBessEnv` đã được hoàn thiện v1.0. Từng thành viên phụ trách thuật toán có thể gọi môi trường vào mã nguồn của mình như sau:

### 4.1. Cho Nguyễn Văn Trường & Nguyễn Văn Huỳnh (Thuật toán SAC)
SAC nhận không gian liên tục: Box([-1.0], [1.0]):
```python
from sems_rl.envs.microgrid_env import MicrogridBessEnv

# Tạo env trên tập Train (hoặc Val / Test)
env = MicrogridBessEnv(split="train")

obs, info = env.reset(seed=42)
# obs là vector 7 chiều: [SoC, P_load_norm, P_pv_norm, C_grid_norm, sin_h, cos_h, is_weekday]

# Action từ mạng Actor SAC: a in [-1.0, 1.0]
action = [0.8] # Ví dụ lệnh sạc 80% công suất
next_obs, reward, terminated, truncated, step_info = env.step(action)
# step_info chứa đầy đủ: p_batt_kw, p_grid_kw, p_buy_kw, c_elec, c_deg, c_peak, p_viol
```

### 4.2. Cho Phạm Quang Anh (Thuật toán TD3)
TD3 cũng làm việc trực tiếp trên không gian hành động liên tục:
```python
from sems_rl.envs.microgrid_env import MicrogridBessEnv

env = MicrogridBessEnv(split="train")
obs, info = env.reset(seed=101)

# TD3 policy dự đoán hành động tất định + target action noise
action = [ -1.0 ] # Lệnh xả tối đa
next_obs, reward, terminated, truncated, step_info = env.step(action)
```

### 4.3. Cho Nguyễn Tùng Dương (Thuật toán PPO & Pipeline Đánh Giá)
* **Huấn luyện PPO:**
```python
from sems_rl.envs.microgrid_env import MicrogridBessEnv
from stable_baselines3 import PPO

env = MicrogridBessEnv(split="train")
model = PPO("MlpPolicy", env, verbose=1, gamma=0.99, gae_lambda=0.95, n_steps=480, batch_size=64)
model.learn(total_timesteps=100000)
```
* **Chạy Kịch bản thử nghiệm độ bền S4 (Nhiễu tải & PV):**
```python
from sems_rl.envs.microgrid_env import MicrogridBessEnv
from sems_rl.envs.wrappers import NoiseWrapper

base_env = MicrogridBessEnv(split="test")
env_s4 = NoiseWrapper(base_env, sigma_load=0.08, sigma_pv=0.15)
```
* **Đo lường chỉ số tiết kiệm so với mốc No-battery:**
```python
from sems_rl.baselines.no_battery import NoBatteryBaseline
from sems_rl.metrics.evaluator import MetricsEvaluator

baseline = NoBatteryBaseline(env)
res_nobat = baseline.evaluate(split="test")

evaluator = MetricsEvaluator(
    j_nobat_mean=res_nobat["mean_daily_cost_j"],
    peak_nobat_max=res_nobat["max_peak_buy_kw"]
)
metrics = evaluator.evaluate_episode(env.episode_history)
print(f"Tiết kiệm chi phí: {metrics['cost_saving_pct']:.2f}% | Cắt đỉnh: {metrics['peak_shaving_pct']:.2f}%")
```

### 4.4. Cho Nguyễn Thị Cẩm Ly & Lý Đình Sơn (Thuật toán Double DQN)
DDQN yêu cầu không gian hành động rời rạc. Chỉ cần bọc `DiscretizeActionWrapper`:
```python
from sems_rl.envs.microgrid_env import MicrogridBessEnv
from sems_rl.envs.wrappers import DiscretizeActionWrapper

base_env = MicrogridBessEnv(split="train")
# Wrapper ánh xạ 11 mức discrete {0..10} -> continuous [-1.0, 1.0]
env_ddqn = DiscretizeActionWrapper(base_env, num_actions=11)

obs, info = env_ddqn.reset(seed=42)
# Action là số nguyên k in {0, 1, ..., 10}:
# k = 0: xả tối đa (-1.0)
# k = 5: pin nghỉ (0.0)
# k = 10: sạc tối đa (+1.0)
discrete_action = 5
next_obs, reward, terminated, truncated, step_info = env_ddqn.step(discrete_action)
```

---

## 5. Quy trình Git & Hướng dẫn tạo nhánh làm việc nhóm

Để tránh xung đột code (conflict) và quản lý tiến độ khoa học theo chuẩn kỹ nghệ phần mềm, mỗi thành viên phải **tuyệt đối không commit trực tiếp vào nhánh `main`**, mà tạo nhánh tính năng riêng (`feature/...`).

### 5.1. Bảng phân chia nhánh cho từng thành viên

| Thành viên | Phụ trách chính | Tên nhánh Git chuẩn |
| :--- | :--- | :--- |
| **Lý Đình Sơn** | Môi trường, Pin BESS, Guardrail, Wrapper DDQN | `feature/env-microgrid-guardrail` |
| **Nguyễn Văn Huỳnh** | Dữ liệu, Hàm thưởng, No-battery, Cấu hình | `feature/env-data-baseline` |
| **Nguyễn Văn Trường** | Thuật toán Soft Actor-Critic (SAC) | `feature/algo-sac` |
| **Phạm Quang Anh** | Thuật toán Twin Delayed DDPG (TD3) | `feature/algo-td3` |
| **Nguyễn Tùng Dương** | Thuật toán PPO & Pipeline Đánh giá Metrics | `feature/algo-ppo-evaluation` |
| **Nguyễn Thị Cẩm Ly** | Thuật toán Double DQN (Dueling DDQN) | `feature/algo-dueling-ddqn` |

---

### 5.2. Các câu lệnh Git từng bước cụ thể

#### Bước 1: Đồng bộ nhánh `main` mới nhất từ GitHub về máy
Trước khi tạo nhánh mới, luôn cập nhật nhánh `main`:
```bash
git checkout main
git pull origin main
```

#### Bước 2: Tạo nhánh mới và chuyển sang nhánh đó
Thay `ten-nhanh-cua-ban` bằng tên nhánh theo bảng trên (ví dụ: `feature/algo-sac` cho Trường):
```bash
git checkout -b feature/algo-sac
```

Kiểm tra xem mình đang ở đúng nhánh chưa:
```bash
git branch
# Dấu sao (*) sẽ hiển thị ở trước nhánh bạn đang đứng
```

#### Bước 3: Viết code và commit tiến độ
Sau khi code hoặc chạy thí nghiệm xong một phần việc:
```bash
# Xem các file đã chỉnh sửa hoặc thêm mới
git status

# Đưa các file đã sửa vào danh sách chuẩn bị commit
git add sems_rl/ test_env.py

# Commit với thông điệp tiếng Anh rõ ràng (tuân theo Conventional Commits)
git commit -m "feat(sac): implement continuous actor-critic network and replay buffer"
```

#### Bước 4: Đẩy nhánh lên GitHub
Lần đầu tiên đẩy nhánh lên GitHub, dùng cờ `-u`:
```bash
git push -u origin feature/algo-sac
```
Ở các lần đẩy tiếp theo trên cùng nhánh này, chỉ cần gõ:
```bash
git push
```

#### Bước 5: Tạo Pull Request (PR) để Merge vào `main`
1. Truy cập vào GitHub: [https://github.com/hhuynh2005/rl-smart-energy-management](https://github.com/hhuynh2005/rl-smart-energy-management)
2. Bạn sẽ thấy thanh màu vàng gợi ý: **"Compare & pull request"**. Bấm vào đó.
3. Điền mô tả tóm tắt những nội dung mình đã làm được.
4. Gán **Huỳnh (Nhóm trưởng)** hoặc **Sơn** làm Reviewer để duyệt code và bấm **Merge pull request** vào nhánh `main`.

#### Bước 6: Cập nhật lại nhánh cá nhân khi `main` có code mới từ bạn khác
Khi có bạn khác đã merge code vào `main`, bạn cần kéo code mới về nhánh của mình:
```bash
git checkout main
git pull origin main
git checkout feature/algo-sac
git merge main
```

---

## 6. Quy trình kiểm thử & Nghiệm thu

Sau khi tải repo về hoặc trước khi tạo Pull Request, hãy đảm bảo hệ thống vượt qua toàn bộ các kiểm thử sau:

### 6.1. Kiểm thử đơn vị môi trường (Unit Tests)
```bash
python test_env.py
```
**Tiêu chí nghiệm thu:** Phải vượt qua trọn vẹn 8/8 test suites:
- `[TEST 1]` Chuẩn Gymnasium API `check_env`.
- `[TEST 2]` Giới hạn an toàn pin $SoC \in [0.20, 0.90]$.
- `[TEST 3]` Cân bằng công suất lưới $P_{grid} = P_{load} - P_{pv} + P_{batt}$.
- `[TEST 4]` Độ dài episode đúng 96 bước ($24$ giờ) với `truncated=True`.
- `[TEST 5]` Tính tái lập tuyệt đối với seed ngẫu nhiên.
- `[TEST 6]` Wrapper rời rạc $K=11$ mức cho DDQN.
- `[TEST 7]` Wrapper tiêm nhiễu Gaussian cho kịch bản S4.
- `[TEST 8]` Mốc No-battery ($J_{nobat}$) và Rule-based controller.

### 6.2. Kiểm thử huấn luyện mẫu với Stable-Baselines3
```bash
python train_demo_sb3.py
```
Huấn luyện thử nghiệm 1,000 bước liên tục trên **SAC** và 1,000 bước rời rạc trên **DQN / DDQN**.

---

*Tài liệu được biên soạn và cập nhật bởi **Nguyễn Văn Huỳnh & Lý Đình Sơn** (Phân hệ Môi trường & Dữ liệu - SEMS-RL).*
