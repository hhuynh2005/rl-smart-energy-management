# SEMS-RL: Smart Energy Management System using Reinforcement Learning

[![Python 3.10+](https://img.shields.io/badge/python-3.10+-blue.svg)](https://www.python.org/downloads/)
[![Gymnasium](https://img.shields.io/badge/Gymnasium-v1.0+-green.svg)](https://gymnasium.farama.org/)
[![Stable-Baselines3](https://img.shields.io/badge/SB3-v2.9+-orange.svg)](https://stable-baselines3.readthedocs.io/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

An advanced Reinforcement Learning (RL) simulation environment and algorithmic benchmark for **Battery Energy Storage System (BESS)** and **Solar Photovoltaic (PV)** optimal scheduling in microgrids, inspired by [CityLearn](https://github.com/citylearn-project/CityLearn) and tailored for real-world Time-of-Use (TOU) electricity pricing schemes.

Developed by **Team 7 - Faculty of Information Technology, Thuyloi University**.

---

## 📌 Project Overview

* **Course:** Reinforcement Learning & Applications
* **Advisor:** Dr. Le Nguyen Tuan Thanh
* **Team Members:**
  * **Nguyen Van Huynh (Team Leader):** Environment (Data Pipeline, Reward Design, Baseline Benchmarking) & SAC co-lead.
  * **Ly Dinh Son:** Environment (MicrogridBessEnv Architecture, Battery Dynamics, Safety Guardrail, DiscretizeWrapper).
  * **Nguyen Van Truong:** Algorithm Lead - Soft Actor-Critic (SAC).
  * **Pham Quang Anh:** Algorithm Lead - Twin Delayed DDPG (TD3).
  * **Nguyen Tung Duong:** Algorithm Lead - Proximal Policy Optimization (PPO) & Evaluation Pipeline.
  * **Nguyen Thi Cam Ly:** Algorithm Lead - Double DQN (DDQN) with Dueling Architecture.

---

## 🏗️ Architecture & Simulation Model

### 1. State Space $S \in \mathbb{R}^7$ (Continuous)
$$s_t = \left[ SoC_t, \frac{P_{load,t}}{P_{load,max}^{train}}, \frac{P_{pv,t}}{P_{pv,rated}}, \frac{C_{grid,t}}{C_{grid,peak}^{train}}, \sin\left(\frac{2\pi h_t}{24}\right), \cos\left(\frac{2\pi h_t}{24}\right), d_t \right]$$

### 2. Action Space $A$
* **Continuous (SAC, TD3, PPO):** $a_t \in [-1.0, 1.0]$ representing normalized charge ($a_t \ge 0$) / discharge ($a_t < 0$) power.
* **Discrete (Double DQN):** $K=11$ discrete levels mapped via `DiscretizeActionWrapper`:
  $$a = -1 + \frac{2k}{K-1}, \quad k \in \{0, \dots, 10\}$$

### 3. Safety Guardrail (Feasible Action Projection)
Ensures the battery state of charge (SoC) never violates physical safety limits $[SoC_{min}, SoC_{max}]$:
$$P_{maxfeas,t} = \min\left( P_{charge,max}, \frac{(SoC_{max} - SoC_t) \cdot E_{cap}}{\eta_c \cdot \Delta t} \right)$$
$$P_{minfeas,t} = -\min\left( P_{discharge,max}, \frac{(SoC_t - SoC_{min}) \cdot E_{cap} \cdot \eta_d}{\Delta t} \right)$$
$$P_{batt,t} = \text{clip}(P_{cmd,t}, P_{minfeas,t}, P_{maxfeas,t})$$

### 4. Multi-Objective Reward Function
$$r_t = - \frac{C_{elec,t} + w_1 \cdot C_{deg,t} + w_2 \cdot C_{peak,t} + w_3 \cdot P_{viol,t}}{C_{ref}}$$
Where:
* $C_{elec,t}$: Electricity cost based on 3-tier EVN TOU tariff and feed-in tariff.
* $C_{deg,t} = c_{wear} \cdot |P_{batt,t}| \cdot \Delta t$: Battery degradation cost per kWh throughput.
* $C_{peak,t} = [\max(0, P_{buy,t} - P_{th})]^2$: Quadratic peak shaving penalty.
* $P_{viol,t} = \left[ (P_{cmd,t} - P_{batt,t}) / P_{charge,max} \right]^2$: Safety guardrail clipping penalty.
* $C_{ref}$: Normalization baseline cost.

---

## 📁 Repository Structure

```
rl-smart-energy-management/
├── sems_rl/                         # Core package
│   ├── config.yaml                  # System, battery, and reward hyperparameters
│   ├── envs/
│   │   ├── microgrid_env.py         # MicrogridBessEnv (Gymnasium.Env)
│   │   ├── battery.py               # Battery energy storage dynamics
│   │   ├── guardrail.py             # Safety Guardrail action projection
│   │   └── wrappers.py              # DiscretizeActionWrapper & NoiseWrapper
│   ├── data/
│   │   ├── generator.py             # Realistic PV, load, and TOU dataset generator
│   │   └── data_pipeline.py         # Sequential Train/Val/Test splitting (70/15/15)
│   ├── baselines/
│   │   └── no_battery.py            # No-battery benchmark & Rule-based controller
│   └── metrics/
│       └── evaluator.py             # Cost savings, peak shaving, and EFC calculator
├── data/
│   └── processed.csv                # 35,040 steps (1 year of 15-min interval data)
├── test_env.py                      # Full unit test suite (100% pass)
├── train_demo_sb3.py                # SB3 demonstration (SAC & DQN)
├── README_ENV.md                    # Detailed Vietnamese environment documentation
└── README.md                        # Project documentation
```

---

## 🚀 Quick Start

### 1. Installation

```bash
git clone https://github.com/hhuynh2005/rl-smart-energy-management.git
cd rl-smart-energy-management
pip install gymnasium stable-baselines3 torch pandas numpy pyyaml
```

### 2. Run Environment Unit Tests

```bash
python test_env.py
```

### 3. Run Benchmark / Training Demo

```bash
python train_demo_sb3.py
```

### 4. Basic Environment Usage

```python
import gymnasium as gym
from sems_rl.envs.microgrid_env import MicrogridBessEnv

# 1. Continuous Environment (SAC, TD3, PPO)
env = MicrogridBessEnv(split="train")
obs, info = env.reset(seed=42)
action = env.action_space.sample()  # Continuous action in [-1.0, 1.0]
next_obs, reward, terminated, truncated, step_info = env.step(action)

# 2. Discrete Environment (Double DQN)
from sems_rl.envs.wrappers import DiscretizeActionWrapper
env_discrete = DiscretizeActionWrapper(env, num_actions=11)
obs, info = env_discrete.reset(seed=42)
next_obs, reward, terminated, truncated, step_info = env_discrete.step(5) # Action index 5: idle
```

---

## 📊 Benchmarking & Baseline Metrics

The environment automatically compares RL agent policies against the **No-battery reference** ($J_{nobat}$) and **Rule-based heuristic control**:
* **Cost Saving (%):** $\frac{J_{nobat} - J_m}{J_{nobat}} \times 100\%$
* **Peak Shaving Ratio (%):** $\frac{\max(P_{buy}^{nobat}) - \max(P_{buy}^m)}{\max(P_{buy}^{nobat})} \times 100\%$
* **PV Self-Consumption (%):** $1 - \frac{\sum P_{sell}}{\sum P_{pv}}$
* **Equivalent Full Cycles (EFC):** $\frac{\sum |P_{batt}| \cdot \Delta t}{2 \cdot E_{cap}}$

---

## 📜 License
MIT License. Developed for academic and research purposes at Thuyloi University.
