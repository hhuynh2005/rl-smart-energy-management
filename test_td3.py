"""
Bộ kiểm thử đơn vị (Unit Tests) cho thuật toán TD3 trong SEMS-RL.
"""

import os
import sys
import tempfile

for stream in [sys.stdout, sys.stderr]:
    if hasattr(stream, "reconfigure"):
        try:
            stream.reconfigure(encoding="utf-8")
        except Exception:
            pass

import numpy as np
import torch

from sems_rl.agents.td3 import Actor, Critic, ReplayBuffer, TD3Agent
from sems_rl.envs.microgrid_env import MicrogridBessEnv
from sems_rl.metrics.evaluator import MetricsEvaluator


def test_actor_critic_shapes_and_bounds():
    print("\n--- [TEST 1] Kiểm tra kích thước mạng Actor & Critic ---")
    actor = Actor(state_dim=7, action_dim=1, hidden_dim=256)
    critic = Critic(state_dim=7, action_dim=1, hidden_dim=256)

    states = torch.randn(16, 7)
    actions = actor(states)
    assert actions.shape == (16, 1), f"Shape Actor sai: {actions.shape}"
    assert torch.all(actions >= -1.0) and torch.all(actions <= 1.0), "Đầu ra Actor vượt ngoài [-1, 1]!"

    q1, q2 = critic(states, actions)
    assert q1.shape == (16, 1) and q2.shape == (16, 1), f"Shape Critic sai: {q1.shape}, {q2.shape}"
    q1_only = critic.q1_forward(states, actions)
    assert torch.allclose(q1, q1_only), "q1_forward không khớp đầu ra q1 của forward!"
    print("✓ Đạt yêu cầu: Actor (7->1 trong [-1, 1]) và Twin Critic (7+1->2 giá trị Q) hợp lệ!")


def test_replay_buffer_terminated_flag():
    print("\n--- [TEST 2] Kiểm tra ReplayBuffer và cờ terminated ---")
    buf = ReplayBuffer(state_dim=7, action_dim=1, max_size=10, seed=42)
    for i in range(12):
        s = np.full(7, float(i), dtype=np.float32)
        a = np.array([0.5], dtype=np.float32)
        ns = s + 1.0
        # Giả lập kết thúc ngày do truncated=True nhưng terminated=False -> truyền terminated=False
        buf.add(s, a, -1.0, ns, terminated=False)

    assert len(buf) == 10, f"Kích thước ring buffer phải bị chặn ở 10, thực tế {len(buf)}"
    states, actions, rewards, next_states, dones = buf.sample(4)
    assert states.shape == (4, 7)
    assert actions.shape == (4, 1)
    assert rewards.shape == (4, 1)
    assert next_states.shape == (4, 7)
    assert np.all(dones == 0.0), "Cờ done trong buffer phải giữ đúng giá trị terminated=False (0.0)!"
    print("✓ Đạt yêu cầu: Ring Buffer hoạt động đúng và bảo toàn cờ terminated!")


def test_delayed_policy_update():
    print("\n--- [TEST 3] Kiểm tra cơ chế cập nhật Actor trễ (policy_delay=2) ---")
    agent = TD3Agent(batch_size=8, buffer_size=64, policy_delay=2, device="cpu", seed=7)
    rng = np.random.default_rng(7)
    for _ in range(16):
        s = rng.normal(size=7).astype(np.float32)
        a = rng.uniform(-1.0, 1.0, size=1).astype(np.float32)
        ns = rng.normal(size=7).astype(np.float32)
        agent.store_transition(s, a, float(rng.normal()), ns, False)

    actor_before = [p.detach().clone() for p in agent.actor.parameters()]
    m1 = agent.update()
    assert "critic_loss" in m1 and "actor_loss" not in m1, "Bước update thứ 1 không được cập nhật Actor!"
    for p0, p1 in zip(actor_before, agent.actor.parameters()):
        assert torch.equal(p0, p1), "Trọng số Actor đã thay đổi ở bước 1 dù policy_delay=2!"

    m2 = agent.update()
    assert "actor_loss" in m2, "Bước update thứ 2 phải cập nhật Actor!"
    changed = any(not torch.equal(p0, p2) for p0, p2 in zip(actor_before, agent.actor.parameters()))
    assert changed, "Trọng số Actor phải thay đổi ở bước update thứ 2!"
    print("✓ Đạt yêu cầu: Delayed Policy Update (d=2) hoạt động chính xác!")


def test_soft_target_update():
    print("\n--- [TEST 4] Kiểm tra cập nhật mềm mạng đích (Polyak averaging) ---")
    agent = TD3Agent(tau=0.1, batch_size=8, buffer_size=32, policy_delay=1, device="cpu", seed=11)
    with torch.no_grad():
        for p in agent.actor.parameters():
            p.fill_(1.0)
        for pt in agent.actor_target.parameters():
            pt.fill_(0.0)

    agent._soft_update(agent.actor, agent.actor_target)
    for pt in agent.actor_target.parameters():
        assert torch.allclose(pt, torch.full_like(pt, 0.1), atol=1e-6), "Polyak averaging sai giá trị kỳ vọng 0.1!"
    print("✓ Đạt yêu cầu: Cập nhật mềm mạng đích đúng công thức tau*theta + (1-tau)*theta_tg!")


def test_save_and_load_reproducibility():
    print("\n--- [TEST 5] Kiểm tra lưu và nạp checkpoint (save/load) ---")
    agent1 = TD3Agent(device="cpu", seed=123)
    obs = np.array([0.5, 0.4, 0.3, 0.6, 0.0, 1.0, 1.0], dtype=np.float32)
    act1 = agent1.select_action(obs, add_noise=False)

    with tempfile.TemporaryDirectory() as tmpdir:
        ckpt = os.path.join(tmpdir, "td3_test.pt")
        agent1.save(ckpt)

        agent2 = TD3Agent(device="cpu", seed=999)
        agent2.load(ckpt)
        act2 = agent2.select_action(obs, add_noise=False)

    assert np.allclose(act1, act2, atol=1e-7), f"Hành động sau load khác trước save: {act1} vs {act2}"
    print("✓ Đạt yêu cầu: save/load tái lập chính xác hành động tất định!")


def test_env_and_evaluator_integration():
    print("\n--- [TEST 6] Kiểm tra tích hợp 1 episode trên MicrogridBessEnv & MetricsEvaluator ---")
    env = MicrogridBessEnv(split="train")
    agent = TD3Agent(
        state_dim=env.observation_space.shape[0],
        action_dim=env.action_space.shape[0],
        batch_size=16,
        buffer_size=256,
        device="cpu",
        seed=42,
    )
    evaluator = MetricsEvaluator()

    obs, _ = env.reset(seed=42)
    steps = 0
    while True:
        action = agent.select_action(obs, add_noise=True)
        next_obs, reward, terminated, truncated, _ = env.step(action)
        agent.store_transition(obs, action, reward, next_obs, terminated)
        if len(agent.replay_buffer) >= agent.batch_size:
            agent.update()
        obs = next_obs
        steps += 1
        if terminated or truncated:
            break

    assert steps == 96, f"Episode phải đúng 96 bước, thực tế {steps}"
    metrics = evaluator.evaluate_episode(env.episode_history)
    assert "daily_cost_j" in metrics and "episode_reward" in metrics
    env.close()
    print(f"✓ Đạt yêu cầu: Chạy trọn vẹn 96 bước, EFC={metrics['efc']:.3f}, Reward={metrics['episode_reward']:.3f}!")


if __name__ == "__main__":
    print("=" * 70)
    print("KIỂM THỬ ĐƠN VỊ THUẬT TOÁN TD3 (SEMS-RL)")
    print("=" * 70)
    test_actor_critic_shapes_and_bounds()
    test_replay_buffer_terminated_flag()
    test_delayed_policy_update()
    test_soft_target_update()
    test_save_and_load_reproducibility()
    test_env_and_evaluator_integration()
    print("\n" + "=" * 70)
    print("TẤT CẢ 6 BÀI KIỂM THỬ TD3 ĐÃ ĐẠT 100%!")
    print("=" * 70)
