import React, { useState, useEffect, useRef } from 'react';
import SmartHouse3D from './SmartHouse3D';
import {
  Play,
  Pause,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  Sun,
  Battery,
  Home,
  Zap,
  Box,
  Layers,
} from 'lucide-react';

export default function SmartHouseSimulation({
  timeline = [],
  currentStep = 38,
  setCurrentStep,
  specs = {},
}) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1); // 0.5x, 1x, 2x, 5x
  const [viewMode, setViewMode] = useState('3D'); // '3D' | '2D'
  const timerRef = useRef(null);

  const totalSteps = timeline.length || 96;
  const stepData = timeline[currentStep] || {
    hour: 9.5,
    time_str: '09:30',
    tou_tier: 'peak',
    p_load_kw: 80.6,
    p_pv_kw: 80.6,
    p_batt_kw: 0.0,
    p_grid_kw: -21.2,
    p_buy_kw: 0.0,
    p_sell_kw: 21.2,
    soc: 0.90,
    soc_pct: 90.0,
    c_grid: 3000,
    c_elec: 0,
    is_clipped: false,
    sun_intensity: 0.85,
    sun_angle: 75.0,
    flows: {
      pv_to_house: 80.6,
      pv_to_batt: 0.0,
      pv_to_grid: 21.2,
      batt_to_house: 0.0,
      grid_to_house: 0.0,
      grid_to_batt: 0.0,
    },
  };

  // Playback timer effect
  useEffect(() => {
    if (isPlaying) {
      const intervalMs = Math.max(80, Math.floor(600 / playbackSpeed));
      timerRef.current = setInterval(() => {
        setCurrentStep((prev) => {
          if (prev >= totalSteps - 1) {
            setIsPlaying(false);
            return prev;
          }
          return prev + 1;
        });
      }, intervalMs);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isPlaying, playbackSpeed, totalSteps, setCurrentStep]);

  const handlePlayToggle = () => {
    if (!isPlaying && currentStep >= totalSteps - 1) {
      setCurrentStep(0);
    }
    setIsPlaying(!isPlaying);
  };

  const handleStepPrev = () => {
    setIsPlaying(false);
    setCurrentStep((prev) => Math.max(0, prev - 1));
  };

  const handleStepNext = () => {
    setIsPlaying(false);
    setCurrentStep((prev) => Math.min(totalSteps - 1, prev + 1));
  };

  const handleReset = () => {
    setIsPlaying(false);
    setCurrentStep(0);
  };

  // Energy flows for 2D diagram
  const flows = stepData.flows || {
    pv_to_house: 0,
    pv_to_batt: 0,
    pv_to_grid: 0,
    batt_to_house: 0,
    grid_to_house: 0,
    grid_to_batt: 0,
  };

  const isCharging = stepData.p_batt_kw > 0.05;
  const isDischarging = stepData.p_batt_kw < -0.05;

  // Mini SVG Sparkline generator for live cards
  const renderSparkline = (getValue, strokeColor, fixedMin = null, fixedMax = null) => {
    if (!timeline || timeline.length === 0) return null;
    const w = 75;
    const h = 26;
    const values = timeline.map(getValue);
    const min = fixedMin !== null ? fixedMin : Math.min(...values);
    const max = fixedMax !== null ? fixedMax : Math.max(...values, min + 0.001);
    const range = (max - min) || 1;

    const points = values.map((v, idx) => {
      const x = (idx / (timeline.length - 1)) * w;
      const y = h - ((v - min) / range) * (h - 6) - 3;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });

    const currentIdx = Math.min(currentStep, timeline.length - 1);
    const curX = ((currentIdx / (timeline.length - 1)) * w).toFixed(1);
    const curY = (h - ((values[currentIdx] - min) / range) * (h - 6) - 3).toFixed(1);

    const polylineStr = points.join(' ');
    const gradId = `spark-${strokeColor.replace('#', '')}`;

    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', marginLeft: 'auto', flexShrink: 0 }}>
        <svg width={w} height={h} style={{ overflow: 'visible' }}>
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={strokeColor} stopOpacity="0.45" />
              <stop offset="100%" stopColor={strokeColor} stopOpacity="0.0" />
            </linearGradient>
          </defs>
          {/* Subtle baseline */}
          <line x1="0" y1={h - 1} x2={w} y2={h - 1} stroke="rgba(255,255,255,0.12)" strokeWidth="1" />
          {/* Area fill */}
          <polygon points={`${polylineStr} ${w},${h - 1} 0,${h - 1}`} fill={`url(#${gradId})`} />
          {/* Sparkline curve */}
          <polyline points={polylineStr} fill="none" stroke={strokeColor} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          {/* Highlight dot for current time */}
          <circle cx={curX} cy={curY} r="3.2" fill="#FFFFFF" stroke={strokeColor} strokeWidth="2" />
        </svg>
        <span style={{ fontSize: '0.62rem', color: '#64748B', marginTop: '2px', fontFamily: 'var(--font-mono)' }}>
          24h Trend
        </span>
      </div>
    );
  };

  return (
    <div className="simulation-viewport">
      {/* 1. Thanh điều khiển phát lại mô phỏng 24h (Playback Bar) */}
      <div className="playback-bar">
        {/* Controls: Play, Step, Reset */}
        <div className="playback-controls-left">
          <button className="btn-ctrl" onClick={handleReset} title="Về 00:00" id="btn-sim-reset">
            <RotateCcw size={15} />
          </button>
          <button className="btn-ctrl" onClick={handleStepPrev} title="Lùi 15 phút" id="btn-sim-prev">
            <ChevronLeft size={16} />
          </button>
          <button
            className={`btn-ctrl primary ${isPlaying ? 'active' : ''}`}
            onClick={handlePlayToggle}
            title={isPlaying ? 'Tạm dừng' : 'Chạy mô phỏng 24h'}
            id="btn-sim-play"
          >
            {isPlaying ? <Pause size={16} /> : <Play size={16} style={{ marginLeft: 2 }} />}
          </button>
          <button className="btn-ctrl" onClick={handleStepNext} title="Tiến 15 phút" id="btn-sim-next">
            <ChevronRight size={16} />
          </button>

          {/* Clock Display */}
          <div className="time-clock-display" style={{ marginLeft: '0.5rem' }}>
            <div className="time-current">{stepData.time_str}</div>
            <div className="step-indicator">
              Bước {currentStep + 1}/{totalSteps} ({(stepData.hour).toFixed(2)}h)
            </div>
          </div>
        </div>

        {/* Scrubber Range Slider (Clean, evenly spaced Inter font ticks) */}
        <div className="scrubber-wrapper">
          <input
            type="range"
            className="slider-control scrubber-track"
            min={0}
            max={totalSteps - 1}
            value={currentStep}
            onChange={(e) => {
              setIsPlaying(false);
              setCurrentStep(parseInt(e.target.value, 10));
            }}
            id="sim-timeline-scrubber"
          />
          <div className="scrubber-ticks">
            <span>00:00</span>
            <span>06:00</span>
            <span>12:00</span>
            <span>18:00</span>
            <span>24:00</span>
          </div>
        </div>

        {/* Speed, TOU Badge, & View Mode Toggles */}
        <div className="playback-controls-right">
          {/* TOU Tariff Badge */}
          {stepData.tou_tier === 'peak' && (
            <span className="badge-tou-peak">
              🔴 CAO ĐIỂM: {stepData.c_grid?.toLocaleString('vi-VN')} đ/KWH
            </span>
          )}
          {stepData.tou_tier === 'normal' && (
            <span className="badge" style={{ background: 'rgba(99, 102, 241, 0.25)', color: '#A5B4FC', border: '1px solid #6366F1', padding: '0.32rem 0.65rem' }}>
              🔵 BÌNH THƯỜNG: {stepData.c_grid?.toLocaleString('vi-VN')} đ/KWH
            </span>
          )}
          {stepData.tou_tier === 'off_peak' && (
            <span className="badge" style={{ background: 'rgba(16, 185, 129, 0.25)', color: '#6EE7B7', border: '1px solid #10B981', padding: '0.32rem 0.65rem' }}>
              🟢 THẤP ĐIỂM: {stepData.c_grid?.toLocaleString('vi-VN')} đ/KWH
            </span>
          )}

          {/* Speed Selector (0.5x, 1x, 2x, 5x) */}
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

          {/* 3D / 2D View Mode Toggle */}
          <div className="view-mode-toggle">
            <button
              className={`view-btn ${viewMode === '3D' ? 'active' : ''}`}
              onClick={() => setViewMode('3D')}
              id="btn-toggle-3d"
            >
              <Box size={13} />
              <span>3D Không Gian</span>
            </button>
            <button
              className={`view-btn ${viewMode === '2D' ? 'active' : ''}`}
              onClick={() => setViewMode('2D')}
              id="btn-toggle-2d"
            >
              <Layers size={13} />
              <span>2D Mặt Cắt</span>
            </button>
          </div>
        </div>
      </div>

      {/* 2. Khung vẽ mô phỏng: 3D Digital Twin (Flex 1) hoặc 2D Mặt Cắt */}
      {viewMode === '3D' ? (
        <SmartHouse3D
          stepData={stepData}
          currentStep={currentStep}
          totalSteps={totalSteps}
        />
      ) : (
        <div className="house-svg-container">
          <svg viewBox="0 0 1000 480" className="house-svg" preserveAspectRatio="xMidYMid meet">
            <defs>
              <linearGradient id="pvPanelGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#1E3A8A" />
                <stop offset="50%" stopColor="#2563EB" />
                <stop offset="100%" stopColor="#1D4ED8" />
              </linearGradient>
              <linearGradient id="batteryGrad" x1="0%" y1="100%" x2="0%" y2="0%">
                <stop offset="0%" stopColor={isDischarging ? '#EF4444' : '#10B981'} />
                <stop offset="100%" stopColor={isDischarging ? '#F87171' : '#34D399'} />
              </linearGradient>
              <linearGradient id="inverterCoreGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#3B82F6" />
                <stop offset="100%" stopColor="#8B5CF6" />
              </linearGradient>
            </defs>

            {/* Ground & Grass */}
            <rect x="0" y="380" width="1000" height="100" fill="#064E3B" opacity="0.6" />

            {/* 1. Solar PV Station (Left) */}
            <g transform="translate(140, 160)">
              <rect x="0" y="0" width="220" height="110" rx="8" fill="#1E293B" stroke="#3B82F6" strokeWidth="2" />
              <rect x="10" y="10" width="200" height="90" rx="4" fill="url(#pvPanelGrad)" />
              <text x="110" y="45" fill="#FBBF24" fontSize="14" fontWeight="800" textAnchor="middle">SOLAR PV</text>
              <text x="110" y="75" fill="#FFFFFF" fontSize="20" fontWeight="900" textAnchor="middle" fontFamily="monospace">
                {stepData.p_pv_kw.toFixed(1)} kW
              </text>
            </g>

            {/* 2. Smart House Load (Center) */}
            <g transform="translate(420, 180)">
              <polygon points="110,0 20,60 200,60" fill="#3B82F6" opacity="0.8" />
              <rect x="20" y="60" width="180" height="140" rx="6" fill="#1E293B" stroke="#60A5FA" strokeWidth="2" />
              <text x="110" y="105" fill="#60A5FA" fontSize="14" fontWeight="800" textAnchor="middle">PHỤ TẢI NHÀ</text>
              <text x="110" y="145" fill="#FFFFFF" fontSize="22" fontWeight="900" textAnchor="middle" fontFamily="monospace">
                {stepData.p_load_kw.toFixed(1)} kW
              </text>
            </g>

            {/* 3. BESS Container (Bottom Center-Left) */}
            <g transform="translate(200, 310)">
              <rect x="0" y="0" width="160" height="90" rx="8" fill="#065F46" stroke="#10B981" strokeWidth="2" />
              <text x="80" y="32" fill="#34D399" fontSize="12" fontWeight="800" textAnchor="middle">
                BESS (SoC: {stepData.soc_pct.toFixed(0)}%)
              </text>
              <text x="80" y="65" fill="#FFFFFF" fontSize="18" fontWeight="900" textAnchor="middle" fontFamily="monospace">
                {stepData.p_batt_kw > 0 ? `+${stepData.p_batt_kw.toFixed(1)} kW` : `${stepData.p_batt_kw.toFixed(1)} kW`}
              </text>
            </g>

            {/* 4. High-Voltage EVN Grid (Right) */}
            <g transform="translate(720, 160)">
              <rect x="0" y="0" width="180" height="130" rx="8" fill="#1E293B" stroke="#8B5CF6" strokeWidth="2" />
              <text x="90" y="45" fill="#C4B5FD" fontSize="14" fontWeight="800" textAnchor="middle">LƯỚI ĐIỆN EVN</text>
              <text x="90" y="85" fill="#FFFFFF" fontSize="20" fontWeight="900" textAnchor="middle" fontFamily="monospace">
                {stepData.p_buy_kw > 0 ? `Mua: ${stepData.p_buy_kw.toFixed(1)} kW` : stepData.p_sell_kw > 0 ? `Bán: ${stepData.p_sell_kw.toFixed(1)} kW` : '0.0 kW'}
              </text>
            </g>

            {/* Central Animated SEMS Dispatch Hub */}
            <circle cx="510" cy="270" r="16" fill="#3B82F6" opacity="0.8" />
            <text x="510" y="274" fill="#FFFFFF" fontSize="9" fontWeight="900" textAnchor="middle">SEMS</text>
          </svg>
        </div>
      )}

      {/* 3. Dãy thẻ Telemetry đo lường tức thời (Live Telemetry Row) */}
      <div className="live-telemetry-row">
        {/* PV Telemetry */}
        <div className="live-card">
          <div className="live-icon-box" style={{ background: 'rgba(245, 158, 11, 0.18)', color: '#F59E0B' }}>
            <Sun size={20} />
          </div>
          <div className="live-content">
            <span className="live-label">Quang điện Solar PV</span>
            <span className="live-number" style={{ color: '#FBBF24' }}>
              {stepData.p_pv_kw.toFixed(1)} <small style={{ fontSize: '0.75rem', color: '#94A3B8' }}>kW</small>
            </span>
          </div>
          {renderSparkline((d) => d.p_pv_kw, '#F59E0B', 0, 150)}
        </div>

        {/* House Load Telemetry */}
        <div className="live-card">
          <div className="live-icon-box" style={{ background: 'rgba(59, 130, 246, 0.18)', color: '#3B82F6' }}>
            <Home size={20} />
          </div>
          <div className="live-content">
            <span className="live-label">Phụ tải Căn nhà (P_load)</span>
            <span className="live-number" style={{ color: '#60A5FA' }}>
              {stepData.p_load_kw.toFixed(1)} <small style={{ fontSize: '0.75rem', color: '#94A3B8' }}>kW</small>
            </span>
          </div>
          {renderSparkline((d) => d.p_load_kw, '#3B82F6')}
        </div>

        {/* Battery Telemetry (Single line value + Status Badge pill, zero wrap) */}
        <div className="live-card">
          <div
            className="live-icon-box"
            style={{
              background: isDischarging ? 'rgba(239, 68, 68, 0.18)' : 'rgba(16, 185, 129, 0.18)',
              color: isDischarging ? '#EF4444' : '#10B981',
            }}
          >
            <Battery size={20} />
          </div>
          <div className="live-content">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '4px' }}>
              <span className="live-label">Pin BESS ({stepData.soc_pct.toFixed(0)}%)</span>
              <span
                style={{
                  fontSize: '0.62rem',
                  fontWeight: 700,
                  padding: '0.12rem 0.38rem',
                  borderRadius: '4px',
                  background: isDischarging ? 'rgba(239, 68, 68, 0.25)' : isCharging ? 'rgba(16, 185, 129, 0.25)' : 'rgba(148, 163, 184, 0.2)',
                  color: isDischarging ? '#FCA5A5' : isCharging ? '#6EE7B7' : '#94A3B8',
                  border: `1px solid ${isDischarging ? '#EF4444' : isCharging ? '#10B981' : '#64748B'}`,
                  whiteSpace: 'nowrap',
                }}
              >
                {isCharging ? 'Sạc' : isDischarging ? 'Xả' : 'Nghỉ'}
              </span>
            </div>
            <span
              className="live-number"
              style={{
                color: isDischarging ? '#F87171' : isCharging ? '#34D399' : '#94A3B8',
                whiteSpace: 'nowrap',
                fontSize: 'clamp(1.0rem, 1.15vw, 1.25rem)',
              }}
            >
              {stepData.p_batt_kw > 0 ? `+${stepData.p_batt_kw.toFixed(1)} kW` : stepData.p_batt_kw < 0 ? `${stepData.p_batt_kw.toFixed(1)} kW` : '0.0 kW'}
            </span>
          </div>
          {renderSparkline((d) => d.soc_pct, '#10B981', 0, 100)}
        </div>

        {/* Grid Telemetry (Single line value + Status Badge pill, zero wrap) */}
        <div className="live-card">
          <div className="live-icon-box" style={{ background: 'rgba(139, 92, 246, 0.18)', color: '#8B5CF6' }}>
            <Zap size={20} />
          </div>
          <div className="live-content">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '4px' }}>
              <span className="live-label">Điện lưới ({stepData.c_grid?.toLocaleString('vi-VN')} đ)</span>
              <span
                style={{
                  fontSize: '0.62rem',
                  fontWeight: 700,
                  padding: '0.12rem 0.38rem',
                  borderRadius: '4px',
                  background: stepData.p_buy_kw > 0 ? 'rgba(139, 92, 246, 0.25)' : stepData.p_sell_kw > 0 ? 'rgba(245, 158, 11, 0.25)' : 'rgba(148, 163, 184, 0.2)',
                  color: stepData.p_buy_kw > 0 ? '#C4B5FD' : stepData.p_sell_kw > 0 ? '#FDE68A' : '#94A3B8',
                  border: `1px solid ${stepData.p_buy_kw > 0 ? '#8B5CF6' : stepData.p_sell_kw > 0 ? '#F59E0B' : '#64748B'}`,
                  whiteSpace: 'nowrap',
                }}
              >
                {stepData.p_buy_kw > 0 ? 'Mua' : stepData.p_sell_kw > 0 ? 'Bán' : 'Cân bằng'}
              </span>
            </div>
            <span
              className="live-number"
              style={{
                color: '#C4B5FD',
                whiteSpace: 'nowrap',
                fontSize: 'clamp(1.0rem, 1.15vw, 1.25rem)',
              }}
            >
              {stepData.p_buy_kw > 0 ? `${stepData.p_buy_kw.toFixed(1)} kW` : stepData.p_sell_kw > 0 ? `${stepData.p_sell_kw.toFixed(1)} kW` : '0.0 kW'}
            </span>
          </div>
          {renderSparkline((d) => d.p_grid_kw, '#8B5CF6')}
        </div>
      </div>
    </div>
  );
}
