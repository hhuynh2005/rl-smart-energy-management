import React from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import LiveTelemetryCards from './LiveTelemetryCards';
import { DEFAULT_STEP_DATA, formatMinuteHHMM } from '../utils/timeSync';

/**
 * SmartHouseSimulation - 2D Cross-Section Schematic of the TLU Microgrid
 * Synchronized with App.jsx minute-level playback & 96-step backend timeline.
 */
export default function SmartHouseSimulation({
  timeline = [],
  currentStep = 38,
  currentMinute = 570,
  onChangeMinute,
  onSelectStep,
  isPlaying = false,
  onTogglePlay,
  playbackSpeed = 1,
  setPlaybackSpeed,
  stepData: propStepData,
  discreteStep,
}) {
  const totalSteps = timeline.length || 96;
  const stepData = propStepData || timeline[currentStep] || DEFAULT_STEP_DATA;
  const touTier = discreteStep?.tou_tier || stepData.tou_tier || 'normal';
  const cGrid = discreteStep?.c_grid || stepData.c_grid || 1800;

  const flows = stepData.flows || DEFAULT_STEP_DATA.flows;
  const isCharging = (stepData.p_batt_kw || 0) > 0.05;
  const isDischarging = (stepData.p_batt_kw || 0) < -0.05;

  const handleReset = () => {
    if (onSelectStep) onSelectStep(0);
    else if (onChangeMinute) onChangeMinute(0);
  };

  const handlePrev = () => {
    const nextIdx = Math.max(0, currentStep - 1);
    if (onSelectStep) onSelectStep(nextIdx);
  };

  const handleNext = () => {
    const nextIdx = Math.min(totalSteps - 1, currentStep + 1);
    if (onSelectStep) onSelectStep(nextIdx);
  };

  const renderFlowLine = (x1, y1, x2, y2, kw, color, label) => {
    const active = kw > 0.1;
    const midX = (x1 + x2) / 2;
    const midY = (y1 + y2) / 2;
    return (
      <g>
        <line
          x1={x1}
          y1={y1}
          x2={x2}
          y2={y2}
          stroke={active ? color : '#CBD5E1'}
          strokeWidth={active ? 4 : 2}
          strokeDasharray={active ? '8 5' : '4 4'}
        />
        {active && (
          <g transform={`translate(${midX}, ${midY})`}>
            <rect x="-36" y="-11" width="72" height="22" rx="6" fill="#FFFFFF" stroke={color} strokeWidth="1.5" />
            <text x="0" y="4" fill="#0F172A" fontSize="10" fontWeight="800" textAnchor="middle" fontFamily="monospace">
              {label}: {kw.toFixed(1)}kW
            </text>
          </g>
        )}
      </g>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem', flex: 1, minHeight: 0 }}>
      {/* Playback Control Bar */}
      <div className="playback-bar">
        <div className="playback-controls-left">
          <button className="btn-ctrl" onClick={handleReset} title="Về 00:00" id="btn-sim-reset">
            <RotateCcw size={14} />
          </button>
          <button className="btn-ctrl" onClick={handlePrev} title="Lùi 15 phút" id="btn-sim-prev">
            <ChevronLeft size={15} />
          </button>
          <button
            className={`btn-ctrl primary ${isPlaying ? 'active' : ''}`}
            onClick={onTogglePlay}
            title={isPlaying ? 'Tạm dừng' : 'Chạy mô phỏng 24h'}
            id="btn-sim-play-2d"
          >
            {isPlaying ? <Pause size={15} /> : <Play size={15} style={{ marginLeft: 2 }} />}
          </button>
          <button className="btn-ctrl" onClick={handleNext} title="Tiến 15 phút" id="btn-sim-next">
            <ChevronRight size={15} />
          </button>

          <div className="time-clock-display" style={{ marginLeft: '0.45rem' }}>
            <div className="time-current">{formatMinuteHHMM(currentMinute)}</div>
            <div className="step-indicator">
              Bước {currentStep + 1}/{totalSteps} ({(stepData.hour || 0).toFixed(2)}h)
            </div>
          </div>
        </div>

        <div className="scrubber-wrapper">
          <input
            type="range"
            className="slider-orange"
            min={0}
            max={1439}
            value={currentMinute}
            onChange={(e) => onChangeMinute && onChangeMinute(parseInt(e.target.value, 10))}
            id="sim-timeline-scrubber-2d"
          />
          <div className="scrubber-ticks">
            <span>00:00</span>
            <span>06:00</span>
            <span>12:00</span>
            <span>18:00</span>
            <span>24:00</span>
          </div>
        </div>

        <div className="playback-controls-right">
          <span className={`badge-tou ${touTier}`}>
            {touTier === 'peak' && `CAO ĐIỂM: ${cGrid.toLocaleString('vi-VN')} đ/kWh`}
            {touTier === 'normal' && `BÌNH THƯỜNG: ${cGrid.toLocaleString('vi-VN')} đ/kWh`}
            {touTier === 'off_peak' && `THẤP ĐIỂM: ${cGrid.toLocaleString('vi-VN')} đ/kWh`}
          </span>

          <div className="speed-selector">
            {[0.5, 1, 2, 5].map((spd) => (
              <button
                key={spd}
                className={`btn-speed ${playbackSpeed === spd ? 'active' : ''}`}
                onClick={() => setPlaybackSpeed(spd)}
              >
                {spd}x
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 2D TLU Microgrid Schematic */}
      <div className="house-svg-container">
        <svg viewBox="0 0 1000 420" className="house-svg" preserveAspectRatio="xMidYMid meet">
          <defs>
            <linearGradient id="pvGrad2D" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#1E3A8A" />
              <stop offset="100%" stopColor="#2563EB" />
            </linearGradient>
          </defs>

          {/* Soft light campus grass band */}
          <rect x="0" y="340" width="1000" height="80" fill="#DCFCE7" />
          <line x1="0" y1="340" x2="1000" y2="340" stroke="#86EFAC" strokeWidth="2" />

          {/* Energy Conduits */}
          {renderFlowLine(260, 145, 430, 145, flows.pv_to_house, '#D97706', 'PV→TLU')}
          {renderFlowLine(210, 200, 260, 275, flows.pv_to_batt, '#0891B2', 'PV→Pin')}
          {renderFlowLine(350, 290, 460, 210, flows.batt_to_house, '#EA580C', 'Pin→TLU')}
          {renderFlowLine(720, 145, 580, 145, flows.grid_to_house, '#7C3AED', 'EVN→TLU')}
          {renderFlowLine(260, 95, 720, 95, flows.pv_to_grid, '#059669', 'Bán lưới')}
          {renderFlowLine(720, 200, 360, 315, flows.grid_to_batt, '#0891B2', 'Sạc đêm')}

          {/* 1. Solar PV Station (Left) */}
          <g transform="translate(80, 90)">
            <rect x="0" y="0" width="180" height="110" rx="12" fill="#FFFFFF" stroke="#D97706" strokeWidth="2.5" />
            <rect x="12" y="12" width="156" height="44" rx="6" fill="url(#pvGrad2D)" />
            <text x="90" y="39" fill="#FDE68A" fontSize="13" fontWeight="800" textAnchor="middle">
              SOLAR PV ÁP MÁI
            </text>
            <text x="90" y="88" fill="#B45309" fontSize="22" fontWeight="900" textAnchor="middle" fontFamily="monospace">
              {(stepData.p_pv_kw || 0).toFixed(1)} kW
            </text>
          </g>

          {/* 2. TLU Campus Buildings Load (Center) */}
          <g transform="translate(410, 75)">
            {/* Stylized A1 U-building & K1 silhouette */}
            <rect x="0" y="35" width="180" height="135" rx="12" fill="#FFFFFF" stroke="#2563EB" strokeWidth="2.5" />
            <rect x="18" y="14" width="144" height="24" rx="4" fill="#B91C1C" />
            <text x="90" y="30" fill="#FFFFFF" fontSize="11" fontWeight="800" textAnchor="middle">
              ĐẠI HỌC THỦY LỢI (A1 · K1 · KTX)
            </text>
            <text x="90" y="88" fill="#475569" fontSize="12" fontWeight="700" textAnchor="middle">
              PHỤ TẢI KHUÔN VIÊN
            </text>
            <text x="90" y="128" fill="#1D4ED8" fontSize="24" fontWeight="900" textAnchor="middle" fontFamily="monospace">
              {(stepData.p_load_kw || 0).toFixed(1)} kW
            </text>
          </g>

          {/* 3. BESS Megapack (Bottom-Left) */}
          <g transform="translate(170, 265)">
            <rect
              x="0"
              y="0"
              width="190"
              height="95"
              rx="12"
              fill="#FFFFFF"
              stroke={isDischarging ? '#DC2626' : '#059669'}
              strokeWidth="2.5"
            />
            <rect
              x="14"
              y="58"
              width={Math.max(10, ((stepData.soc_pct || 0) / 100) * 162)}
              height="22"
              rx="5"
              fill={isDischarging ? '#FCA5A5' : '#6EE7B7'}
            />
            <text
              x="95"
              y="26"
              fill={isDischarging ? '#B91C1C' : '#047857'}
              fontSize="12"
              fontWeight="800"
              textAnchor="middle"
            >
              BESS ({(stepData.soc_pct || 0).toFixed(0)}% · {isCharging ? 'Sạc' : isDischarging ? 'Xả' : 'Nghỉ'})
            </text>
            <text x="95" y="49" fill="#0F172A" fontSize="18" fontWeight="900" textAnchor="middle" fontFamily="monospace">
              {(stepData.p_batt_kw || 0) > 0
                ? `+${(stepData.p_batt_kw || 0).toFixed(1)} kW`
                : `${(stepData.p_batt_kw || 0).toFixed(1)} kW`}
            </text>
          </g>

          {/* 4. EVN Grid 22kV (Right) */}
          <g transform="translate(720, 88)">
            <rect x="0" y="0" width="200" height="120" rx="12" fill="#FFFFFF" stroke="#7C3AED" strokeWidth="2.5" />
            <text x="100" y="36" fill="#6D28D9" fontSize="13" fontWeight="800" textAnchor="middle">
              LƯỚI ĐIỆN EVN 22kV
            </text>
            <text x="100" y="75" fill="#0F172A" fontSize="21" fontWeight="900" textAnchor="middle" fontFamily="monospace">
              {(stepData.p_buy_kw || 0) > 0
                ? `Mua: ${(stepData.p_buy_kw || 0).toFixed(1)} kW`
                : (stepData.p_sell_kw || 0) > 0
                ? `Bán: ${(stepData.p_sell_kw || 0).toFixed(1)} kW`
                : '0.0 kW'}
            </text>
            <text x="100" y="100" fill="#64748B" fontSize="11" fontWeight="600" textAnchor="middle">
              Đơn giá: {cGrid.toLocaleString('vi-VN')} đ/kWh
            </text>
          </g>
        </svg>
      </div>

      {/* Shared Live Telemetry Strip */}
      <LiveTelemetryCards
        stepData={{ ...stepData, c_grid: cGrid }}
        timeline={timeline}
        currentStep={currentStep}
      />
    </div>
  );
}
