"""
Demo script: Huấn luyện thử nghiệm SAC và DQN (Double DQN) với Stable-Baselines3.
Chứng minh môi trường MicrogridBessEnv v1.0 hoàn toàn tương thích và sẵn sàng
cho cả nhóm thuật toán (Huỳnh, Trường, Quang Anh, Dương, Ly) bắt tay vào việc!
"""

import sys
import os

if sys.stdout.encoding.lower() != 'utf-8':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

import numpy as np
import gymnasium as gym
from stable_baselines3 import SAC, PPO, DQN

from sems_rl.envs.microgrid_env import MicrogridBessEnv
from sems_rl.envs.wrappers import DiscretizeActionWrapper


def demo_sac_continuous():
    print("\n--- 1. HUẤN LUYỆN THỬ SAC (CONTINUOUS ACTION) CHO TRƯỜNG & HUỲNH ---")
    env = MicrogridBessEnv(split="train")
    
    # Khởi tạo mô hình SAC từ Stable-Baselines3
    model = SAC(
        policy="MlpPolicy",
        env=env,
        learning_rate=3e-4,
        buffer_size=10000,
        batch_size=64,
        ent_coef="auto",
        gamma=0.99,
        tau=0.005,
        verbose=0,
    )
    
    print("Bắt đầu huấn luyện SAC 1,000 bước thử nghiệm...")
    model.learn(total_timesteps=1000)
    print("✓ Huấn luyện SAC 1,000 bước hoàn tất thành công!")
    
    # Đánh giá 1 episode
    obs, info = env.reset(options={"split": "test", "day_offset": 0})
    total_reward = 0.0
    for _ in range(96):
        action, _ = model.predict(obs, deterministic=True)
        obs, reward, term, trunc, info = env.step(action)
        total_reward += reward
        if term or trunc:
            break
            
    print(f"✓ Đánh giá SAC sau 1000 bước: Tổng thưởng = {total_reward:.2f}")
    env.close()


def demo_dqn_discrete():
    print("\n--- 2. HUẤN LUYỆN THỬ DQN/DDQN (DISCRETE ACTION K=11) CHO LY & SƠN ---")
    base_env = MicrogridBessEnv(split="train")
    env_disc = DiscretizeActionWrapper(base_env, num_actions=11)
    
    # Khởi tạo mô hình DQN từ Stable-Baselines3 với DiscretizeActionWrapper
    model = DQN(
        policy="MlpPolicy",
        env=env_disc,
        learning_rate=1e-4,
        buffer_size=10000,
        batch_size=64,
        gamma=0.99,
        exploration_initial_eps=1.0,
        exploration_final_eps=0.05,
        verbose=0,
    )
    
    print("Bắt đầu huấn luyện DQN (rời rạc K=11) 1,000 bước thử nghiệm...")
    model.learn(total_timesteps=1000)
    print("✓ Huấn luyện DQN rời rạc 1,000 bước hoàn tất thành công!")
    
    # Đánh giá 1 episode
    obs, info = env_disc.reset(options={"split": "test", "day_offset": 0})
    total_reward = 0.0
    for _ in range(96):
        action, _ = model.predict(obs, deterministic=True)
        obs, reward, term, trunc, info = env_disc.step(action)
        total_reward += reward
        if term or trunc:
            break
            
    print(f"✓ Đánh giá DQN sau 1000 bước: Tổng thưởng = {total_reward:.2f}")
    env_disc.close()


if __name__ == "__main__":
    print("=" * 70)
    print("KIỂM TRA TƯƠNG THÍCH PIPELINE HUẤN LUYỆN VỚI STABLE-BASELINES3")
    print("=" * 70)
    demo_sac_continuous()
    demo_dqn_discrete()
    print("\n" + "=" * 70)
    print("TẤT CẢ PIPELINE LIÊN TỤC VÀ RỜI RẠC ĐÃ HOẠT ĐỘNG HOÀN HẢO!")
    print("=" * 70)
