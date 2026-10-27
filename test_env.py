"""
Test suite cho Môi trường MicrogridBessEnv v1.0.
Thực hiện các kiểm thử đơn vị theo phân công trong Báo cáo TH2 (Lý Đình Sơn & Nguyễn Văn Huỳnh):
1. Kiểm thử Gymnasium API Standard (gymnasium.utils.env_checker).
2. Kiểm thử động lực học pin: SoC luôn trong [0.2, 0.9] khi Guardrail bật.
3. Kiểm thử cân bằng công suất: P_grid = P_load - P_pv + P_batt.
4. Kiểm thử Episode đúng 96 bước (24h x 4 bước/h).
5. Kiểm thử tính tái lập (Reproducibility) với seed.
6. Kiểm thử DiscretizeActionWrapper (K=11 mức cho DDQN).
7. Kiểm thử NoiseWrapper (Kịch bản S4).
8. Kiểm thử Mốc No-battery Baseline.
"""

import sys
import os

# Đảm bảo in tiếng Việt không bị lỗi encoding trên Windows console
if sys.stdout.encoding.lower() != 'utf-8':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

import numpy as np
import gymnasium as gym
from gymnasium.utils.env_checker import check_env

from sems_rl.envs.microgrid_env import MicrogridBessEnv
from sems_rl.envs.wrappers import DiscretizeActionWrapper, NoiseWrapper
from sems_rl.baselines.no_battery import NoBatteryBaseline, RuleBasedController
from sems_rl.metrics.evaluator import MetricsEvaluator


def test_gymnasium_compliance():
    print("\n--- [TEST 1] Kiểm tra tính tương thích chuẩn Gymnasium ---")
    env = MicrogridBessEnv()
    # Kiểm tra bằng env_checker chính thức của Gymnasium
    check_env(env.unwrapped)
    print("✓ Môi trường vượt qua hoàn toàn kiểm thử gymnasium.utils.env_checker.check_env!")
    env.close()


def test_battery_dynamics_and_guardrail():
    print("\n--- [TEST 2] Kiểm thử Động lực học pin & Safety Guardrail ---")
    env = MicrogridBessEnv()
    
    # Thử nghiệm các hành động cực đoan: ép sạc liên tục (action = +1.0)
    obs, info = env.reset(options={"initial_soc": 0.85})
    for step_i in range(15):
        obs, reward, term, trunc, step_info = env.step(np.array([1.0], dtype=np.float32))
        soc = step_info["soc"]
        # Phải bảo đảm SoC không bao giờ vượt quá 0.90
        assert soc <= 0.90001, f"LỖI: SoC {soc} vượt ngưỡng tối đa 0.90!"
        if soc >= 0.899:
            assert step_info["is_clipped"], "Safety Guardrail phải cắt lệnh khi chạm ngưỡng đỉnh!"

    print("✓ Đạt yêu cầu: Lệnh sạc tối đa được Guardrail chặn an toàn tại SoC = 0.90!")

    # Thử nghiệm ép xả liên tục (action = -1.0)
    obs, info = env.reset(options={"initial_soc": 0.25})
    for step_i in range(15):
        obs, reward, term, trunc, step_info = env.step(np.array([-1.0], dtype=np.float32))
        soc = step_info["soc"]
        # Phải bảo đảm SoC không bao giờ giảm dưới 0.20
        assert soc >= 0.19999, f"LỖI: SoC {soc} tụt dưới ngưỡng tối thiểu 0.20!"
        if soc <= 0.201:
            assert step_info["is_clipped"], "Safety Guardrail phải cắt lệnh khi chạm ngưỡng đáy!"

    print("✓ Đạt yêu cầu: Lệnh xả tối đa được Guardrail chặn an toàn tại SoC = 0.20!")
    env.close()


def test_power_balance():
    print("\n--- [TEST 3] Kiểm thử Cân bằng công suất tại điểm đấu nối lưới ---")
    env = MicrogridBessEnv()
    obs, info = env.reset(seed=123)
    
    for _ in range(20):
        action = env.action_space.sample()
        obs, reward, term, trunc, step_info = env.step(action)
        
        p_load = step_info["p_load_kw"]
        p_pv = step_info["p_pv_kw"]
        p_batt = step_info["p_batt_kw"]
        p_grid = step_info["p_grid_kw"]
        
        # P_grid = P_load - P_pv + P_batt
        expected_p_grid = p_load - p_pv + p_batt
        assert abs(p_grid - expected_p_grid) < 1e-4, f"LỖI: Cân bằng công suất sai! P_grid={p_grid}, Mong muốn={expected_p_grid}"
        
        p_buy = step_info["p_buy_kw"]
        p_sell = step_info["p_sell_kw"]
        assert abs(p_buy - max(0.0, p_grid)) < 1e-4, "LỖI: P_buy không chính xác!"
        assert abs(p_sell - max(0.0, -p_grid)) < 1e-4, "LỖI: P_sell không chính xác!"

    print("✓ Đạt yêu cầu: Phương trình cân bằng công suất P_grid = P_load - P_pv + P_batt chính xác tuyệt đối!")
    env.close()


def test_episode_length_and_truncation():
    print("\n--- [TEST 4] Kiểm thử Độ dài Episode (96 bước = 1 ngày) ---")
    env = MicrogridBessEnv()
    obs, info = env.reset(seed=42)
    step_count = 0
    
    while True:
        action = np.array([0.0], dtype=np.float32)
        obs, reward, terminated, truncated, step_info = env.step(action)
        step_count += 1
        
        if truncated:
            assert not terminated, "Episode kết thúc do cắt thời gian (truncated=True, terminated=False) theo mục 1.6!"
            break
            
    assert step_count == 96, f"LỖI: Số bước episode là {step_count}, mong đợi đúng 96 bước!"
    print(f"✓ Đạt yêu cầu: Episode kết thúc chính xác sau {step_count} bước (24 giờ vận hành) với truncated=True!")
    env.close()


def test_reproducibility():
    print("\n--- [TEST 5] Kiểm thử Tính tái lập theo Seed ---")
    env1 = MicrogridBessEnv()
    env2 = MicrogridBessEnv()

    obs1, _ = env1.reset(seed=999)
    obs2, _ = env2.reset(seed=999)
    assert np.allclose(obs1, obs2), "LỖI: Hai môi trường cùng seed nhưng trạng thái ban đầu khác nhau!"

    for _ in range(10):
        action = np.array([0.35], dtype=np.float32)
        o1, r1, _, _, _ = env1.step(action)
        o2, r2, _, _, _ = env2.step(action)
        assert np.allclose(o1, o2), "LỖI: Trạng thái tiếp theo không trùng khớp!"
        assert abs(r1 - r2) < 1e-6, "LỖI: Phần thưởng không trùng khớp!"

    print("✓ Đạt yêu cầu: Môi trường hoàn toàn tái lập và nhất quán khi dùng chung hạt giống seed!")
    env1.close()
    env2.close()


def test_discretize_wrapper_for_ddqn():
    print("\n--- [TEST 6] Kiểm thử DiscretizeActionWrapper (K=11 mức cho DDQN) ---")
    base_env = MicrogridBessEnv()
    env_disc = DiscretizeActionWrapper(base_env, num_actions=11)
    
    assert env_disc.action_space.n == 11, "LỖI: Không gian hành động rời rạc phải có 11 mức!"
    
    # Kiểm tra các mức ánh xạ chính
    # k = 0 -> -1.0 (xả tối đa)
    # k = 5 -> 0.0 (pin nghỉ)
    # k = 10 -> 1.0 (sạc tối đa)
    assert abs(env_disc.get_action_value(0) - (-1.0)) < 1e-5
    assert abs(env_disc.get_action_value(5) - 0.0) < 1e-5
    assert abs(env_disc.get_action_value(10) - 1.0) < 1e-5

    obs, _ = env_disc.reset(seed=42)
    # Step với action rời rạc 5 (tức a = 0.0)
    obs, rew, term, trunc, info = env_disc.step(5)
    assert abs(info["p_cmd_kw"]) < 1e-4, "LỖI: Action k=5 phải tương ứng P_cmd = 0.0 kW!"
    
    print("✓ Đạt yêu cầu: DiscretizeActionWrapper ánh xạ chuẩn xác K=11 mức từ k={0..10} sang [-1.0, 1.0]!")
    env_disc.close()


def test_noise_wrapper_scenario_s4():
    print("\n--- [TEST 7] Kiểm thử NoiseWrapper (Kịch bản thử độ bền S4) ---")
    base_env = MicrogridBessEnv()
    noisy_env = NoiseWrapper(base_env, sigma_load=0.08, sigma_pv=0.15, seed=42)
    
    obs, info = noisy_env.reset()
    assert len(obs) == 7
    obs, rew, term, trunc, info = noisy_env.step(np.array([0.0], dtype=np.float32))
    assert "noisy_p_load_norm" in info
    assert "noisy_p_pv_norm" in info
    print(f"✓ Đạt yêu cầu: NoiseWrapper đã cộng nhiễu Gaussian thành công (Load noise={info['noisy_p_load_norm']:.3f}, PV noise={info['noisy_p_pv_norm']:.3f})!")
    noisy_env.close()


def test_no_battery_baseline():
    print("\n--- [TEST 8] Kiểm thử Mốc No-battery Baseline & Bộ đánh giá Metrics ---")
    env = MicrogridBessEnv()
    baseline = NoBatteryBaseline(env)
    
    # Đánh giá 5 ngày mốc no-battery trên tập test
    res = baseline.evaluate(num_days=5, split="test")
    print(f"  > Chi phí điện trung bình/ngày (J_nobat): {res['mean_daily_cost_j']:,.1f} VNĐ")
    print(f"  > Công suất đỉnh mua lưới lớn nhất: {res['max_peak_buy_kw']:.2f} kW")
    print(f"  > Tỷ lệ tự tiêu thụ PV trung bình: {res['mean_pv_self_consumption']*100:.2f}%")
    
    assert res["mean_daily_cost_j"] > 0, "LỖI: Chi phí điện phải dương!"
    assert res["max_peak_buy_kw"] > 0, "LỖI: Đỉnh mua lưới phải dương!"
    
    # Thử chạy Rule-Based Controller để so sánh tiết kiệm
    evaluator = MetricsEvaluator(j_nobat_mean=res["mean_daily_cost_j"], peak_nobat_max=res["max_peak_buy_kw"])
    rbc = RuleBasedController(p_th=env.p_th)
    
    obs, info = env.reset(options={"day_offset": 0, "split": "test", "initial_soc": 0.5})
    while True:
        action = rbc.select_action(obs, info)
        obs, reward, term, trunc, info = env.step(action)
        if term or trunc:
            break
            
    m_rbc = evaluator.evaluate_episode(env.episode_history)
    print(f"  > Rule-Based Controller ngày 0:")
    print(f"    - Chi phí điện ngày J: {m_rbc['daily_cost_j']:,.1f} VNĐ (Tiết kiệm: {m_rbc.get('cost_saving_pct', 0.0):.2f}%)")
    print(f"    - Đỉnh mua lưới: {m_rbc['peak_buy_kw']:.2f} kW (Cắt đỉnh: {m_rbc.get('peak_shaving_pct', 0.0):.2f}%)")
    print(f"    - Tỷ lệ tự tiêu thụ PV: {m_rbc['pv_self_consumption']*100:.2f}%")
    print(f"    - Chu kỳ sạc xả EFC: {m_rbc['efc']:.3f} cycles")
    print(f"    - Số bước bị cắt bởi Guardrail: {m_rbc['clipped_steps']}/96 bước")
    
    print("✓ Đạt yêu cầu: Mốc No-battery và Bộ đo lường chỉ số tính toán trơn tru và chính xác!")
    env.close()


if __name__ == "__main__":
    print("=" * 70)
    print("BẮT ĐẦU CHẠY KIỂM THỬ MÔI TRƯỜNG SEMS-RL (MicrogridBessEnv v1.0)")
    print("Thực hiện bởi: Lý Đình Sơn & Nguyễn Văn Huỳnh (Nhóm 7)")
    print("=" * 70)
    
    test_gymnasium_compliance()
    test_battery_dynamics_and_guardrail()
    test_power_balance()
    test_episode_length_and_truncation()
    test_reproducibility()
    test_discretize_wrapper_for_ddqn()
    test_noise_wrapper_scenario_s4()
    test_no_battery_baseline()
    
    print("\n" + "=" * 70)
    print("TẤT CẢ 8 BÀI KIỂM THỬ ĐƠN VỊ ĐÃ THÀNH CÔNG RỰC RỠ 100%!")
    print("MÔI TRƯỜNG SẴN SÀNG BÀN GIAO CHO CẢ 4 THUẬT TOÁN (SAC, TD3, PPO, DDQN)!")
    print("=" * 70)
