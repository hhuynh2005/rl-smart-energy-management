import React, { useState } from 'react';
import { Sun, Battery, Zap, RefreshCw, Info, AlertTriangle, RotateCw, Moon } from 'lucide-react';
import { CAMERA_PRESETS } from './digital-twin/campusLayout';
import { useQualityStore } from '../store/useQualityStore';
import { formatMinuteHHMM } from '../utils/timeSync';

const CAMPUS_PRESET_IDS = ['a1_facade', 'overview', 'front_gate', 'football_field'];
const MICROGRID_PRESET_IDS = ['solar', 'bess', 'grid'];

/**
 * FloatingControlPanel - Top-left collapsible Light Frosted Glass card matching template video
 * Houses:
 *  - Tab 'scene': CHẾ ĐỘ XEM, GÓC NHÌN NHANH, THỜI GIAN (minute slider + Play + step/speed + 4 checkboxes)
 *  - Tab 'rl': Full SEMS-RL scenario/policy/SoC configuration, Run button, BESS/PV specs & course note
 *  - Tab 'display': Quality LOW–ULTRA, Auto-FPS indicator, Night lights & Auto-rotate toggles
 */
export default function FloatingControlPanel({
  currentMinute,
  onChangeMinute,
  currentStep,
  totalSteps,
  isPlaying,
  onTogglePlay,
  onStepDelta,
  onResetTime,
  playbackSpeed,
  setPlaybackSpeed,
  config,
  setConfig,
  metadata,
  onSimulate,
  isLoading,
}) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [panelTab, setPanelTab] = useState('scene'); // 'scene' | 'rl' | 'display'

  const viewMode3D = useQualityStore((s) => s.viewMode3D);
  const setViewMode3D = useQualityStore((s) => s.setViewMode3D);
  const activePreset = useQualityStore((s) => s.activePreset);
  const selectPreset = useQualityStore((s) => s.selectPreset);
  const showLabels = useQualityStore((s) => s.showLabels);
  const toggleLabels = useQualityStore((s) => s.toggleLabels);
  const showTraffic = useQualityStore((s) => s.showTraffic);
  const toggleTraffic = useQualityStore((s) => s.toggleTraffic);
  const showPedestrians = useQualityStore((s) => s.showPedestrians);
  const togglePedestrians = useQualityStore((s) => s.togglePedestrians);
  const showFlows = useQualityStore((s) => s.showFlows);
  const toggleFlows = useQualityStore((s) => s.toggleFlows);
  const quality = useQualityStore((s) => s.quality);
  const setQuality = useQualityStore((s) => s.setQuality);
  const isAutoDegraded = useQualityStore((s) => s.isAutoDegraded);
  const autoRotate = useQualityStore((s) => s.autoRotate);
  const toggleAutoRotate = useQualityStore((s) => s.toggleAutoRotate);
  const forceNightLights = useQualityStore((s) => s.forceNightLights);
  const toggleNightLights = useQualityStore((s) => s.toggleNightLights);

  const isCustomScenario = config.scenario.startsWith('S5:');
  const maxDays = (metadata?.splits && metadata.splits[config.split]) || 56;

  const handleScenarioChange = (e) => {
    const val = e.target.value;
    let newDay = 0;
    let newNoise = false;

    if (val.startsWith('S1:')) newDay = 0;
    else if (val.startsWith('S2:')) newDay = 2;
    else if (val.startsWith('S3:')) newDay = 5;
    else if (val.startsWith('S4:')) {
      newDay = 0;
      newNoise = true;
    }

    setConfig({
      ...config,
      scenario: val,
      split: 'test',
      targetDay: newDay,
      applyNoise: newNoise,
    });
  };

  return (
    <aside className={`floating-control-panel ${isCollapsed ? 'collapsed' : ''}`}>
      {/* Card Header */}
      <div className="panel-header">
        <div>
          <div className="panel-title">Khuôn viên Đại học Thủy Lợi</div>
          <div className="panel-subtitle">SEMS-RL Microgrid Digital Twin</div>
        </div>
        <button
          className="btn-collapse"
          onClick={() => setIsCollapsed((v) => !v)}
          id="btn-panel-collapse"
        >
          {isCollapsed ? 'Mở rộng' : 'Thu gọn'}
        </button>
      </div>

      {!isCollapsed && (
        <>
          {/* Internal Panel Tabs */}
          <div className="panel-subtabs">
            <button
              className={`panel-subtab-btn ${panelTab === 'scene' ? 'active' : ''}`}
              onClick={() => setPanelTab('scene')}
            >
              Cảnh 3D
            </button>
            <button
              className={`panel-subtab-btn ${panelTab === 'rl' ? 'active' : ''}`}
              onClick={() => setPanelTab('rl')}
            >
              Cấu hình RL
            </button>
            <button
              className={`panel-subtab-btn ${panelTab === 'display' ? 'active' : ''}`}
              onClick={() => setPanelTab('display')}
            >
              Hiển thị
            </button>
          </div>

          <div className="panel-body">
            {/* TAB 1: VIDEO TEMPLATE SCENE CONTROLS */}
            {panelTab === 'scene' && (
              <>
                <div>
                  <div className="section-heading">Chế độ xem</div>
                  <div className="segmented-3">
                    {[
                      { id: 'orbit', label: 'Trên cảnh' },
                      { id: 'satellite', label: 'Vệ tinh' },
                      { id: 'walk', label: 'Đi bộ' },
                    ].map((m) => (
                      <button
                        key={m.id}
                        className={`seg-btn ${viewMode3D === m.id ? 'active' : ''}`}
                        onClick={() => setViewMode3D(m.id)}
                        id={`btn-mode-${m.id}`}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="section-heading">Góc nhìn nhanh</div>
                  <div className="preset-grid-2x2">
                    {CAMPUS_PRESET_IDS.map((pid) => {
                      const p = CAMERA_PRESETS[pid];
                      return (
                        <button
                          key={pid}
                          className={`preset-btn ${activePreset === pid && viewMode3D === 'orbit' ? 'active' : ''}`}
                          onClick={() => selectPreset(pid)}
                          title={`Phím tắt ${p.key}`}
                        >
                          {p.label}
                        </button>
                      );
                    })}
                  </div>
                  <div className="microgrid-chip-row">
                    {MICROGRID_PRESET_IDS.map((pid) => {
                      const p = CAMERA_PRESETS[pid];
                      return (
                        <button
                          key={pid}
                          className={`microgrid-chip ${activePreset === pid && viewMode3D === 'orbit' ? 'active' : ''}`}
                          onClick={() => selectPreset(pid)}
                          title={`Phím tắt ${p.key}`}
                        >
                          {pid === 'solar' && <Sun size={11} />}
                          {pid === 'bess' && <Battery size={11} />}
                          {pid === 'grid' && <Zap size={11} />}
                          <span>{p.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <div className="section-heading">Thời gian</div>
                  <div className="time-row-header">
                    <div>
                      <span className="time-clock-inline">{formatMinuteHHMM(currentMinute)}</span>
                      <span className="time-step-tag">
                        Bước {currentStep + 1}/{totalSteps}
                      </span>
                    </div>
                    <button
                      className={`btn-play-inline ${isPlaying ? 'playing' : ''}`}
                      onClick={onTogglePlay}
                      id="btn-sim-play"
                    >
                      {isPlaying ? 'Dừng' : 'Chạy'}
                    </button>
                  </div>

                  <input
                    type="range"
                    className="slider-orange"
                    min={0}
                    max={1439}
                    step={1}
                    value={currentMinute}
                    onChange={(e) => onChangeMinute(parseInt(e.target.value, 10))}
                    id="sim-timeline-scrubber"
                  />

                  <div className="time-mini-controls">
                    <div className="mini-step-group">
                      <button className="btn-mini-step" onClick={onResetTime} title="Về 00:00">
                        00:00
                      </button>
                      <button className="btn-mini-step" onClick={() => onStepDelta(-1)} title="Lùi 15 phút">
                        -15p
                      </button>
                      <button className="btn-mini-step" onClick={() => onStepDelta(1)} title="Tiến 15 phút">
                        +15p
                      </button>
                    </div>
                    <div className="speed-pills">
                      {[0.5, 1, 2, 5].map((spd) => (
                        <button
                          key={spd}
                          className={`speed-pill-btn ${playbackSpeed === spd ? 'active' : ''}`}
                          onClick={() => setPlaybackSpeed(spd)}
                        >
                          {spd}x
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="checkbox-grid">
                    <label className="checkbox-item">
                      <input type="checkbox" checked={showLabels} onChange={toggleLabels} />
                      <span>Nhãn</span>
                    </label>
                    <label className="checkbox-item">
                      <input type="checkbox" checked={showTraffic} onChange={toggleTraffic} />
                      <span>Xe cộ</span>
                    </label>
                    <label className="checkbox-item">
                      <input type="checkbox" checked={showPedestrians} onChange={togglePedestrians} />
                      <span>Người đi bộ</span>
                    </label>
                    <label className="checkbox-item">
                      <input type="checkbox" checked={showFlows} onChange={toggleFlows} />
                      <span>Luồng điện</span>
                    </label>
                  </div>
                </div>

                <div className="panel-disclaimer">
                  Bố cục theo sơ đồ khuôn viên ĐH Thủy Lợi tích hợp Microgrid 150kWp PV & 200kWh BESS. Bấm vào tòa nhà hoặc thiết bị để xem thông số.
                </div>
              </>
            )}

            {/* TAB 2: SEMS-RL CONFIGURATION */}
            {panelTab === 'rl' && (
              <>
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
                        className="slider-orange"
                        min={0}
                        max={Math.max(0, maxDays - 1)}
                        value={config.targetDay}
                        onChange={(e) => setConfig({ ...config, targetDay: parseInt(e.target.value, 10) })}
                        id="day-slider"
                      />
                    </div>
                  </>
                )}

                <div>
                  <div className="section-heading">Chiến lược điều khiển Pin</div>
                  <div className="radio-options">
                    {[
                      {
                        id: 'rbc',
                        title: 'Heuristic: Rule-Based',
                        desc: 'Sạc PV dư & xả cắt đỉnh giờ cao điểm',
                      },
                      {
                        id: 'nobat',
                        title: 'Mốc đối chuẩn: No-Battery',
                        desc: 'Pin nghỉ hoàn toàn (a = 0) để đối chứng',
                      },
                      {
                        id: 'custom',
                        title: 'Thủ công: Interactive Schedule',
                        desc: 'Sạc đêm giá rẻ (22h-04h), xả cao điểm',
                      },
                    ].map((opt) => (
                      <label key={opt.id} className={`radio-card ${config.policyMode === opt.id ? 'active' : ''}`}>
                        <input
                          type="radio"
                          name="policy-panel"
                          value={opt.id}
                          checked={config.policyMode === opt.id}
                          onChange={() => setConfig({ ...config, policyMode: opt.id })}
                        />
                        <div>
                          <div className="radio-label-title">{opt.title}</div>
                          <div className="radio-label-desc">{opt.desc}</div>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="control-group">
                  <label className="control-label">
                    <span>Mức sạc ban đầu (SoC 00:00):</span>
                    <span className="control-value">{(config.initialSoc * 100).toFixed(0)}%</span>
                  </label>
                  <input
                    type="range"
                    className="slider-orange"
                    min={0.2}
                    max={0.9}
                    step={0.05}
                    value={config.initialSoc}
                    onChange={(e) => setConfig({ ...config, initialSoc: parseFloat(e.target.value) })}
                    id="soc-slider"
                  />
                </div>

                <button
                  className="btn-simulate"
                  onClick={onSimulate}
                  disabled={isLoading}
                  id="btn-run-simulation"
                >
                  <RefreshCw size={14} className={isLoading ? 'spin-anim' : ''} />
                  <span>{isLoading ? 'Đang mô phỏng 96 bước...' : 'Chạy lại Mô Phỏng'}</span>
                </button>

                <div>
                  <div className="section-heading">Thông số kỹ thuật (BESS & PV)</div>
                  <div className="specs-box">
                    <div className="spec-item"><span className="name">Dung lượng BESS</span><span className="val">200 kWh</span></div>
                    <div className="spec-item"><span className="name">Công suất định mức</span><span className="val">50 kW (0.25C)</span></div>
                    <div className="spec-item"><span className="name">Hiệu suất sạc/xả</span><span className="val">92%</span></div>
                    <div className="spec-item"><span className="name">Dải SoC an toàn</span><span className="val">[20%, 90%]</span></div>
                    <div className="spec-item"><span className="name">Công suất PV</span><span className="val">150 kWp</span></div>
                    <div className="spec-item"><span className="name">Ngưỡng cắt đỉnh</span><span className="val">90 kW</span></div>
                    <div className="spec-item"><span className="name">Giá bán lưới</span><span className="val">600 đ/kWh</span></div>
                  </div>
                </div>

                <div className="note-box">
                  <div className="note-title">
                    <Info size={13} />
                    <span>Lưu ý BTL Môn Học</span>
                  </div>
                  <p className="note-desc">
                    Các thuật toán RL (SAC, TD3, PPO, DDQN) do thành viên Nhóm 7 (ĐH Thủy Lợi) phát triển. Giao diện phục vụ nghiệm thu môi trường và mốc đối chứng.
                  </p>
                </div>
              </>
            )}

            {/* TAB 3: GRAPHICS & DISPLAY */}
            {panelTab === 'display' && (
              <>
                <div>
                  <div className="section-heading">Chất lượng đồ họa 3D</div>
                  <div className="segmented-3" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
                    {['low', 'med', 'high', 'ultra'].map((q) => (
                      <button
                        key={q}
                        className={`seg-btn ${quality === q ? 'active' : ''}`}
                        onClick={() => setQuality(q)}
                      >
                        {q.toUpperCase()}
                      </button>
                    ))}
                  </div>
                  {isAutoDegraded && (
                    <div
                      style={{
                        marginTop: '6px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '5px',
                        fontSize: '0.68rem',
                        color: '#B45309',
                        background: 'rgba(245, 158, 11, 0.14)',
                        padding: '4px 8px',
                        borderRadius: '6px',
                      }}
                    >
                      <AlertTriangle size={12} />
                      <span>Tự động giảm mức đồ họa để giữ FPS mượt</span>
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                  <div className="section-heading">Hiệu ứng cảnh quan</div>
                  <button
                    className={`preset-btn ${forceNightLights ? 'active' : ''}`}
                    onClick={toggleNightLights}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.48rem 0.65rem' }}
                  >
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                      {forceNightLights ? <Moon size={14} /> : <Sun size={14} />}
                      <span>Chế độ Đèn Đêm Demo</span>
                    </span>
                    <span>{forceNightLights ? 'BẬT' : 'THEO GIỜ'}</span>
                  </button>

                  <button
                    className={`preset-btn ${autoRotate ? 'active' : ''}`}
                    onClick={toggleAutoRotate}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.48rem 0.65rem' }}
                  >
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                      <RotateCw size={14} />
                      <span>Xoay tự động (Trên cảnh)</span>
                    </span>
                    <span>{autoRotate ? 'BẬT' : 'TẮT'}</span>
                  </button>
                </div>
              </>
            )}
          </div>
        </>
      )}
    </aside>
  );
}
