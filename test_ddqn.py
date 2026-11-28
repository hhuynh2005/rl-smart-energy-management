"""
Kiểm thử đơn vị (Unit Test) cho thuật toán Dueling Double DQN.
Kiểm tra:
1. Số đầu ra K của mạng Dueling.
2. Cập nhật mềm mạng đích (soft update).
3. Lịch giảm tuyến tính epsilon.
4. Tương thích với MicrogridBessEnv + DiscretizeActionWrapper.
"""

import numpy as np
import torch
from sems_rl.agents.ddqn import DuelingQNetwork, DDQNAgent
from sems_rl.envs.microgrid_env import MicrogridBessEnv
from sems_rl.envs.wrappers import DiscretizeActionWrapper


def test_dueling_network_output_shape():
    for k in [5, 11, 21]:
        net = DuelingQNetwork(state_dim=7, num_actions=k)
        dummy_state = torch.randn(4, 7)
        q_vals = net(dummy_state)
        assert q_vals.shape == (4, k), f"Sai kích thước đầu ra với K={k}: {q_vals.shape}"
        assert not torch.isnan(q_vals).any(), "Đầu ra mạng chứa NaN!"


def test_epsilon_schedule():
    agent = DDQNAgent(eps_start=1.0, eps_end=0.05, n_decay=50_000)
    assert np.isclose(agent.compute_epsilon(0), 1.0)
    assert np.isclose(agent.compute_epsilon(25_000), 0.525)
    assert np.isclose(agent.compute_epsilon(50_000), 0.05)
    assert np.isclose(agent.compute_epsilon(100_000), 0.05)


def test_soft_update():
    agent = DDQNAgent(tau=0.005)
    # Đặt toàn bộ trọng số mạng chính = 1, mạng đích = 0
    for p in agent.q_net.parameters():
        p.data.fill_(1.0)
    for p in agent.target_net.parameters():
        p.data.fill_(0.0)

    agent.soft_update()

    for tp in agent.target_net.parameters():
        assert torch.allclose(tp.data, torch.full_like(tp.data, 0.005)), "Soft update sai hệ số tau!"


def test_env_integration_and_update():
    base_env = MicrogridBessEnv(split="train")
    env = DiscretizeActionWrapper(base_env, num_actions=11)
    agent = DDQNAgent(state_dim=7, num_actions=11, batch_size=16, n_start=20)

    obs, _ = env.reset(seed=42)
    for step in range(30):
        action = agent.select_action(obs, step=step, eval_mode=False)
        assert 0 <= action < 11
        next_obs, reward, term, trunc, _ = env.step(action)
        agent.replay_buffer.push(obs, action, reward, next_obs, term)
        obs = next_obs
        if step >= 20:
            loss = agent.update()
            assert loss is not None and not np.isnan(loss), "Loss bị None hoặc NaN!"

    env.close()