import React from 'react';
import { Sliders, Battery, ShieldAlert, Cpu, RefreshCw, Sun, Zap, Info } from 'lucide-react';

export default function SidebarControls({
  config,
  setConfig,
  metadata,
  onSimulate,
  isLoading,
}) {
  const isCustomScenario = config.scenario.startsWith('S5:');
  const maxDays = (metadata?.splits && metadata.splits[config.split]) || 56;

  const handleScenarioChange = (e) => {
    const val = e.target.value;
    let newSplit = 'test';
    let newDay = 0;
    let newNoise = false;

    if (val.startsWith('S1:')) {
      newDay = 0;
    } else if (val.startsWith('S2:')) {
      newDay = 2;
    } else if (val.startsWith('S3:')) {
      newDay = 5;
    } else if (val.startsWith('S4:')) {
      newDay = 0;
      newNoise = true;
    }

    setConfig({
      ...config,
      scenario: val,
      split: newSplit,
      targetDay: newDay,
      applyNoise: newNoise,
    });
  };

  return (
    <aside className="sidebar">
      {/* 1. Chọn Kịch bản thử nghiệm */}
      <div className="sidebar-section">
        <div className="sidebar-title">
          <Sliders size={15} />
          <span>1. Kịch bản thử nghiệm</span>
        </div>

        <div className="control-group">
          <label className="control-label">Kịch bản vận hành:</label>
          <select
            className="select-control"
            value={config.scenario}
            onChange={handleScenarioChange}
            id="scenario-select"
          >
            <option value="S1: Ngày làm việc điển hình (Typical Weekday)">
              S1: Ngày làm việc (Typical Weekday)
            </option>
            <option value="S2: Ngày cuối tuần (Weekend - Tải thấp, không giờ cao điểm)">
              S2: Ngày cuối tuần (Weekend)
            </option>
            <option value="S3: Ngày nhiều mây (Cloudy Day - PV giảm 50%)">
              S3: Ngày nhiều mây (Cloudy Day)
            </option>
            <option value="S4: Thử độ bền với Nhiễu (Robustness Test - NoiseWrapper)">
              S4: Thử độ bền với Nhiễu (Noise)
            </option>
            <option value="S5: Tùy chọn ngày tự do (Custom Date Picker)">
              S5: Tùy chọn ngày tự do (Custom)
            </option>
          </select>
        </div>

        {isCustomScenario && (
          <>
            <div className="control-group">
              <label className="control-label">Phân vùng dữ liệu:</label>
              <select
                className="select-control"
                value={config.split}
                onChange={(e) => setConfig({ ...config, split: e.target.value, targetDay: 0 })}
                id="split-select"
              >
                <option value="test">Tập kiểm thử (Test - 56 ngày)</option>
                <option value="val">Tập thẩm định (Val - 54 ngày)</option>
                <option value="train">Tập huấn luyện (Train - 255 ngày)</option>
              </select>
            </div>

            <div className="control-group">
              <label className="control-label">
                <span>Chọn ngày mô phỏng:</span>
                <span className="control-value">Ngày {config.targetDay}</span>
              </label>
              <input
                type="range"
                className="slider-control"
                min={0}
                max={Math.max(0, maxDays - 1)}
                value={config.targetDay}
                onChange={(e) => setConfig({ ...config, targetDay: parseInt(e.target.value, 10) })}
                id="day-slider"
              />
            </div>
          </>
        )}
      </div>

      {/* 2. Chiến lược điều khiển pin */}
      <div className="sidebar-section">
        <div className="sidebar-title">
          <Cpu size={15} />
          <span>2. Chiến lược điều khiển Pin</span>
        </div>

        <div className="radio-options">
          <label className={`radio-card ${config.policyMode === 'rbc' ? 'active' : ''}`}>
            <input
              type="radio"
              name="policy"
              value="rbc"
              checked={config.policyMode === 'rbc'}
              onChange={() => setConfig({ ...config, policyMode: 'rbc' })}
            />
            <div>
              <div className="radio-label-title">Heuristic: Rule-Based (Chuyên gia)</div>
              <div className="radio-label-desc">Sạc điện mặt trời dư & xả cắt đỉnh giờ cao điểm</div>
            </div>
          </label>

          <label className={`radio-card ${config.policyMode === 'nobat' ? 'active' : ''}`}>
            <input
              type="radio"
              name="policy"
              value="nobat"
              checked={config.policyMode === 'nobat'}
              onChange={() => setConfig({ ...config, policyMode: 'nobat' })}
            />
            <div>
              <div className="radio-label-title">Mốc đối chuẩn: No-Battery</div>
              <div className="radio-label-desc">Pin nghỉ hoàn toàn (a = 0) để so sánh hiệu quả</div>
            </div>
          </label>

          <label className={`radio-card ${config.policyMode === 'custom' ? 'active' : ''}`}>
            <input
              type="radio"
              name="policy"
              value="custom"
              checked={config.policyMode === 'custom'}
              onChange={() => setConfig({ ...config, policyMode: 'custom' })}
            />
            <div>
              <div className="radio-label-title">Thủ công: Interactive Schedule</div>
              <div className="radio-label-desc">Sạc đêm giá rẻ (22h-04h), xả mạnh giờ cao điểm</div>
            </div>
          </label>
        </div>

        {/* Initial SoC Slider */}
        <div className="control-group" style={{ marginTop: '0.4rem' }}>
          <label className="control-label">
            <span>Mức sạc pin ban đầu (SoC 00:00):</span>
            <span className="control-value">{(config.initialSoc * 100).toFixed(0)}%</span>
          </label>
          <input
            type="range"
            className="slider-control"
            min={0.20}
            max={0.90}
            step={0.05}
            value={config.initialSoc}
            onChange={(e) => setConfig({ ...config, initialSoc: parseFloat(e.target.value) })}
            id="soc-slider"
          />
        </div>
      </div>

      {/* 3. Nút kích hoạt mô phỏng */}
      <button
        className="btn-simulate"
        onClick={onSimulate}
        disabled={isLoading}
        id="btn-run-simulation"
      >
        <RefreshCw size={16} className={isLoading ? 'spin-anim' : ''} />
        <span>{isLoading ? 'Đang mô phỏng 96 bước...' : 'Chạy lại Mô Phỏng'}</span>
      </button>

      {/* 4. Thông số kỹ thuật hệ thống */}
      <div className="sidebar-section">
        <div className="sidebar-title">
          <Battery size={15} />
          <span>3. Thông số kỹ thuật (BESS & PV)</span>
        </div>

        <div className="specs-box">
          <div className="spec-item">
            <span className="name">🔋 Dung lượng pin BESS:</span>
            <span className="val">200 kWh</span>
          </div>
          <div className="spec-item">
            <span className="name">⚡ Công suất định mức:</span>
            <span className="val">50 kW (0.25C)</span>
          </div>
          <div className="spec-item">
            <span className="name">🔄 Hiệu suất sạc/xả:</span>
            <span className="val">92%</span>
          </div>
          <div className="spec-item">
            <span className="name">🛡️ Dải SoC an toàn:</span>
            <span className="val">[20%, 90%]</span>
          </div>
          <div className="spec-item">
            <span className="name">☀️ Công suất PV định mức:</span>
            <span className="val">150 kWp</span>
          </div>
          <div className="spec-item">
            <span className="name">🎯 Ngưỡng công suất đỉnh:</span>
            <span className="val">90 kW</span>
          </div>
          <div className="spec-item">
            <span className="name">💰 Giá bán ngược lên lưới:</span>
            <span className="val">600 đ/kWh</span>
          </div>
        </div>
      </div>

      {/* 5. Ghi chú môn học */}
      <div className="note-box">
        <div className="note-title">
          <Info size={15} />
          <span>Lưu ý BTL Môn Học:</span>
        </div>
        <p className="note-desc">
          Các thuật toán RL (SAC, TD3, PPO, DDQN) hiện do các thành viên (Trường, Quang Anh, Dương, Ly) tự code. Giao diện này phục vụ nghiệm thu môi trường và chạy thử nghiệm mốc đối chứng.
        </p>
      </div>
    </aside>
  );
}
