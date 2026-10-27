import React from 'react';
import { X, BookOpen, ShieldCheck, Cpu, Database, Users } from 'lucide-react';

export default function DocModal({ isOpen, onClose }) {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <BookOpen size={20} color="#3B82F6" />
            <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#F9FAFB' }}>
              SEMS-RL: Đặc Tả Mô Hình Toán MDP & Báo Cáo TH2 (Nhóm 7)
            </h3>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#9CA3AF',
              cursor: 'pointer',
            }}
          >
            <X size={20} />
          </button>
        </div>

        <div className="modal-body">
          {/* Section 1 */}
          <div>
            <h4>
              <Database size={16} color="#60A5FA" />
              1. Không gian trạng thái (Observation Space - S)
            </h4>
            <p>
              Vector trạng thái 7 chiều liên tục được chuẩn hóa trong Gymnasium Box(low=0, high=1, shape=(7,)):
            </p>
            <div className="formula-card">
              s_t = [ SoC_t, P_load,t(norm), P_pv,t(norm), C_grid,t(norm), sin(2π·h_t/24), cos(2π·h_t/24), d_t ]
            </div>
            <p style={{ fontSize: '0.8rem', color: '#9CA3AF', marginTop: '0.3rem' }}>
              Mã hóa vòng tròn lượng giác sin/cos giúp mạng nơ-ron nhận diện tính liên tục giữa 23h45 và 00h00.
            </p>
          </div>

          {/* Section 2 */}
          <div>
            <h4>
              <ShieldCheck size={16} color="#34D399" />
              2. Không gian hành động & Safety Guardrail (Action Space - A)
            </h4>
            <p>
              Hành động chuẩn hóa a_t ∈ [-1.0, 1.0]. Lệnh P_cmd được chiếu qua bộ lọc an toàn để đảm bảo SoC luôn nằm trong dải [20%, 90%]:
            </p>
            <div className="formula-card">
              P_max_feas,t = min( P_charge_max, (SoC_max − SoC_t)·E_cap / (η_c·Δt) )<br />
              P_min_feas,t = −min( P_discharge_max, (SoC_t − SoC_min)·E_cap·η_d / Δt )<br />
              P_batt,t = clip( P_cmd,t, P_min_feas,t, P_max_feas,t )
            </div>
          </div>

          {/* Section 3 */}
          <div>
            <h4>
              <Cpu size={16} color="#FBBF24" />
              3. Cân bằng công suất & Hàm phần thưởng đa mục tiêu (Reward - R)
            </h4>
            <div className="formula-card">
              P_grid,t = P_load,t − P_pv,t + P_batt,t<br />
              P_buy,t = max(0, P_grid,t),  P_sell,t = max(0, −P_grid,t)<br /><br />
              r_t = − ( C_elec,t + w1·C_deg,t + w2·C_peak,t + w3·P_viol,t ) / C_ref
            </div>
            <ul style={{ paddingLeft: '1.25rem', marginTop: '0.4rem', fontSize: '0.82rem', color: '#9CA3AF' }}>
              <li><b>C_elec:</b> Tiền điện lưới (VNĐ) tính theo biểu giá EVN TOU 3 khung giờ.</li>
              <li><b>C_deg:</b> Chi phí suy hao tuổi thọ pin dựa trên mô hình chu kỳ Rainflow quy đổi.</li>
              <li><b>C_peak:</b> [max(0, P_buy − P_th)]² phạt vượt ngưỡng công suất đỉnh 90 kW.</li>
              <li><b>P_viol:</b> Phạt khi lệnh của Agent vi phạm và bị Guardrail cắt.</li>
            </ul>
          </div>

          {/* Section 4 */}
          <div>
            <h4>
              <Users size={16} color="#A78BFA" />
              4. Cơ cấu phân công nhiệm vụ Nhóm 7 (ĐH Thủy Lợi)
            </h4>
            <div style={{ background: '#1F2937', padding: '0.75rem', borderRadius: '8px', fontSize: '0.8rem' }}>
              <p>• <b>Nguyễn Văn Huỳnh (Nhóm trưởng):</b> Môi trường (FastAPI & Dashboard, Dữ liệu, Hàm thưởng, No-battery baseline) & Đồng phụ trách SAC.</p>
              <p>• <b>Lý Đình Sơn:</b> Môi trường (Gymnasium Env, Động lực học pin, Safety Guardrail, DiscretizeWrapper) & Hỗ trợ Double DQN.</p>
              <p>• <b>Nguyễn Văn Trường:</b> Thuật toán (Soft Actor-Critic - SAC Lead).</p>
              <p>• <b>Phạm Quang Anh:</b> Thuật toán (Twin Delayed DDPG - TD3 & Rule-Based Controller).</p>
              <p>• <b>Nguyễn Tùng Dương:</b> Thuật toán (Proximal Policy Optimization - PPO & Pipeline đánh giá so chuẩn).</p>
              <p>• <b>Nguyễn Thị Cẩm Ly:</b> Thuật toán (Double Deep Q-Network - DDQN Lead).</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
