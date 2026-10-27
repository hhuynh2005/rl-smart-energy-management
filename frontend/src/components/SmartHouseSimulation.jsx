import React, { useState, useEffect, useRef } from 'react';
import SmartHouse3D from './SmartHouse3D';
import {
  Play,
  Pause,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  Sun,
  Moon,
  Battery,
  Home,
  Zap,
  Cpu,
  Clock,
  ArrowRight,
  AlertTriangle,
  ShieldCheck,
  TrendingUp,
  Box,
  Layers,
} from 'lucide-react';

export default function SmartHouseSimulation({
  timeline = [],
  currentStep = 0,
  setCurrentStep,
  specs = {},
}) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1); // 1x, 2x, 5x, 10x
  const [viewMode, setViewMode] = useState('3D'); // '3D' | '2D'
  const timerRef = useRef(null);


  const totalSteps = timeline.length || 96;
  const stepData = timeline[currentStep] || {
    hour: 12.0,
    time_str: '12:00',
    tou_tier: 'normal',
    p_load_kw: 60.0,
    p_pv_kw: 90.0,
    p_batt_kw: 25.0,
    p_grid_kw: -5.0,
    p_buy_kw: 0.0,
    p_sell_kw: 5.0,
    soc: 0.65,
    soc_pct: 65.0,
    c_grid: 1800,
    c_elec: 0,
    is_clipped: false,
    sun_intensity: 0.9,
    sun_angle: 90.0,
    flows: {
      pv_to_house: 60.0,
      pv_to_batt: 25.0,
      pv_to_grid: 5.0,
      batt_to_house: 0.0,
      grid_to_house: 0.0,
      grid_to_batt: 0.0,
    },
  };

  // Playback timer effect
  useEffect(() => {
    if (isPlaying) {
      const intervalMs = Math.max(100, Math.floor(600 / playbackSpeed));
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

  // Dynamic sky color based on hour (0 - 24)
  const hour = stepData.hour;
  const isDay = hour >= 6.0 && hour <= 18.0;

  let skyTop = '#060A14';
  let skyBottom = '#111827';

  if (hour >= 5.0 && hour < 7.0) {
    // Dawn / Sunrise
    skyTop = '#1E1B4B';
    skyBottom = '#E11D48';
  } else if (hour >= 7.0 && hour < 11.0) {
    // Morning
    skyTop = '#0284C7';
    skyBottom = '#38BDF8';
  } else if (hour >= 11.0 && hour < 15.0) {
    // Midday bright azure
    skyTop = '#0369A1';
    skyBottom = '#60A5FA';
  } else if (hour >= 15.0 && hour < 17.5) {
    // Afternoon
    skyTop = '#0F766E';
    skyBottom = '#F59E0B';
  } else if (hour >= 17.5 && hour < 19.0) {
    // Sunset
    skyTop = '#312E81';
    skyBottom = '#BE185D';
  } else {
    // Night
    skyTop = '#050811';
    skyBottom = '#0F172A';
  }

  // Sun / Moon positioning
  let sunX = 500;
  let sunY = 100;
  if (isDay) {
    const progress = (hour - 6.0) / 12.0; // 0 to 1
    sunX = 140 + progress * 720;
    sunY = 180 - Math.sin(progress * Math.PI) * 110;
  }

  // Energy flows
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


  // Helper to render mini SVG sparklines for live telemetry cards
  const renderSparkline = (getValue, strokeColor, fixedMin = null, fixedMax = null) => {
    if (!timeline || timeline.length === 0) return null;
    const w = 75;
    const h = 28;
    const values = timeline.map(getValue);
    const min = fixedMin !== null ? fixedMin : Math.min(...values);
    const max = fixedMax !== null ? fixedMax : Math.max(...values, min + 0.001);
    const range = (max - min) || 1;

    const points = values.map((v, idx) => {
      const x = (idx / (timeline.length - 1)) * w;
      const y = h - ((v - min) / range) * (h - 8) - 4;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });

    const currentIdx = Math.min(currentStep, timeline.length - 1);
    const curX = ((currentIdx / (timeline.length - 1)) * w).toFixed(1);
    const curY = (h - ((values[currentIdx] - min) / range) * (h - 8) - 4).toFixed(1);

    const polylineStr = points.join(' ');
    const gradId = `spark-${strokeColor.replace('#', '')}`;

    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', marginLeft: 'auto' }}>
        <svg width={w} height={h} style={{ overflow: 'visible', flexShrink: 0 }}>
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={strokeColor} stopOpacity="0.35" />
              <stop offset="100%" stopColor={strokeColor} stopOpacity="0.0" />
            </linearGradient>
          </defs>
          <polygon points={`${polylineStr} ${w},${h} 0,${h}`} fill={`url(#${gradId})`} />
          <polyline points={polylineStr} fill="none" stroke={strokeColor} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx={curX} cy={curY} r="3.5" fill="#FFFFFF" stroke={strokeColor} strokeWidth="2" />
        </svg>
        <span style={{ fontSize: '0.65rem', color: '#6B7280', marginTop: '2px', fontFamily: 'monospace' }}>
          24h Trend
        </span>
      </div>
    );
  };

  return (
    <div className="simulation-viewport" style={{ '--sky-top': skyTop, '--sky-bottom': skyBottom }}>
      {/* 1. Thanh điều khiển phát lại mô phỏng 24h (Playback Bar) */}
      <div className="playback-bar">
        {/* Controls: Play, Step, Reset */}
        <div className="playback-controls-left">
          <button className="btn-ctrl" onClick={handleReset} title="Về 00:00" id="btn-sim-reset">
            <RotateCcw size={16} />
          </button>
          <button className="btn-ctrl" onClick={handleStepPrev} title="Lùi 15 phút" id="btn-sim-prev">
            <ChevronLeft size={18} />
          </button>
          <button
            className={`btn-ctrl primary ${isPlaying ? 'active' : ''}`}
            onClick={handlePlayToggle}
            title={isPlaying ? 'Tạm dừng' : 'Chạy mô phỏng 24h'}
            id="btn-sim-play"
          >
            {isPlaying ? <Pause size={18} /> : <Play size={18} style={{ marginLeft: 2 }} />}
          </button>
          <button className="btn-ctrl" onClick={handleStepNext} title="Tiến 15 phút" id="btn-sim-next">
            <ChevronRight size={18} />
          </button>

          {/* Clock Display */}
          <div className="time-clock-display" style={{ marginLeft: '0.6rem' }}>
            <div className="time-current">{stepData.time_str}</div>
            <div className="step-indicator">
              Bước {currentStep + 1}/{totalSteps} ({(stepData.hour).toFixed(2)}h)
            </div>
          </div>
        </div>

        {/* Scrubber Range Slider (0 - 95) */}
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
            <span>00:00 (Đêm)</span>
            <span>06:00 (Bình minh)</span>
            <span>12:00 (Trưa đỉnh PV)</span>
            <span>18:00 (Hoàng hôn)</span>
            <span>23:45 (Hết ngày)</span>
          </div>
        </div>

        {/* Speed & TOU Badge */}
        <div className="playback-controls-right">
          {/* TOU Tariff Badge */}
          {stepData.tou_tier === 'peak' && (
            <span
              className="badge"
              style={{
                background: 'rgba(239, 68, 68, 0.25)',
                color: '#F87171',
                border: '1px solid #EF4444',
                padding: '0.35rem 0.65rem',
              }}
            >
              🔴 Cao điểm: {stepData.c_grid?.toLocaleString('vi-VN')} đ/kWh
            </span>
          )}
          {stepData.tou_tier === 'normal' && (
            <span
              className="badge"
              style={{
                background: 'rgba(99, 102, 241, 0.25)',
                color: '#A5B4FC',
                border: '1px solid #6366F1',
                padding: '0.35rem 0.65rem',
              }}
            >
              🔵 Bình thường: {stepData.c_grid?.toLocaleString('vi-VN')} đ/kWh
            </span>
          )}
          {stepData.tou_tier === 'off_peak' && (
            <span
              className="badge"
              style={{
                background: 'rgba(16, 185, 129, 0.25)',
                color: '#6EE7B7',
                border: '1px solid #10B981',
                padding: '0.35rem 0.65rem',
              }}
            >
              🟢 Thấp điểm: {stepData.c_grid?.toLocaleString('vi-VN')} đ/kWh
            </span>
          )}

          {/* Speed Selector */}
          <div className="speed-selector">
            {[0.5, 1, 2, 5].map((spd) => (
              <button
                key={spd}
                className={`speed-btn ${playbackSpeed === spd ? 'active' : ''}`}
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
              <Box size={14} />
              <span>3D Không Gian</span>
            </button>
            <button
              className={`view-btn ${viewMode === '2D' ? 'active' : ''}`}
              onClick={() => setViewMode('2D')}
              id="btn-toggle-2d"
            >
              <Layers size={14} />
              <span>2D Mặt Cắt</span>
            </button>
          </div>
        </div>
      </div>

      {/* 2. Khung vẽ mô phỏng: 3D Digital Twin hoặc 2D Mặt Cắt */}
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
              {/* Gradients */}
              <linearGradient id="pvPanelGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#1E3A8A" />
                <stop offset="50%" stopColor="#2563EB" />
                <stop offset="100%" stopColor="#1D4ED8" />
              </linearGradient>


            <linearGradient id="pvActiveGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#F59E0B" />
              <stop offset="100%" stopColor="#FBBF24" />
            </linearGradient>

            <linearGradient id="sunGlowGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#FDE047" stopOpacity="1" />
              <stop offset="60%" stopColor="#F59E0B" stopOpacity="0.8" />
              <stop offset="100%" stopColor="#D97706" stopOpacity="0" />
            </linearGradient>

            <linearGradient id="batteryGrad" x1="0%" y1="100%" x2="0%" y2="0%">
              <stop offset="0%" stopColor={isDischarging ? '#EF4444' : '#10B981'} />
              <stop offset="100%" stopColor={isDischarging ? '#F87171' : '#34D399'} />
            </linearGradient>

            <linearGradient id="inverterCoreGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#3B82F6" />
              <stop offset="100%" stopColor="#8B5CF6" />
            </linearGradient>

            {/* Glowing Drop Shadows */}
            <filter id="glow-gold" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="6" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
            <filter id="glow-green" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="6" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
            <filter id="glow-purple" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="6" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>

          {/* --- LAYER 1: SKY & STARS / SUN / MOON --- */}
          {/* Twinkling Stars (if night) */}
          {!isDay && (
            <g opacity="0.75">
              <circle cx="120" cy="50" r="1.5" fill="#FFFFFF" />
              <circle cx="280" cy="35" r="1.2" fill="#FFFFFF" />
              <circle cx="450" cy="65" r="2.0" fill="#E2E8F0" />
              <circle cx="720" cy="40" r="1.5" fill="#FFFFFF" />
              <circle cx="850" cy="75" r="1.8" fill="#FFFFFF" />
              <circle cx="620" cy="80" r="1.0" fill="#E2E8F0" />
              <circle cx="200" cy="95" r="1.5" fill="#FFFFFF" />
            </g>
          )}

          {/* Sun / Moon Celestial Body */}
          {isDay ? (
            <g transform={`translate(${sunX}, ${sunY})`} filter="url(#glow-gold)">
              {/* Sun rays radiating */}
              <circle cx="0" cy="0" r="32" fill="url(#sunGlowGrad)" opacity="0.4" />
              <circle cx="0" cy="0" r="22" fill="#FBBF24" />
              <circle cx="0" cy="0" r="16" fill="#FEF08A" />
              {/* Dynamic Sun ray lines */}
              {[0, 45, 90, 135, 180, 225, 270, 315].map((ang) => (
                <line
                  key={ang}
                  x1="0"
                  y1="0"
                  x2={Math.cos((ang * Math.PI) / 180) * 36}
                  y2={Math.sin((ang * Math.PI) / 180) * 36}
                  stroke="#FDE047"
                  strokeWidth="2"
                  strokeLinecap="round"
                  opacity="0.8"
                />
              ))}
            </g>
          ) : (
            <g transform="translate(820, 80)">
              {/* Crescent Moon */}
              <path
                d="M 25 0 A 25 25 0 1 0 50 45 A 30 30 0 0 1 25 0 Z"
                fill="#E2E8F0"
                opacity="0.85"
                filter="drop-shadow(0 0 10px rgba(226, 232, 240, 0.5))"
              />
            </g>
          )}

          {/* Ground Terrain */}
          <rect x="0" y="410" width="1000" height="70" fill="#064E3B" opacity="0.8" />
          <line x1="0" y1="410" x2="1000" y2="410" stroke="#10B981" strokeWidth="2" opacity="0.6" />

          {/* --- LAYER 2: PHYSICAL ARCHITECTURE NODES --- */}

          {/* ========================================================
              NODE 1: ROOFTOP SOLAR PV (MÁI NHÀ QUANG ĐIỆN)
              Vị trí: (310, 140) đến (570, 220)
             ======================================================== */}
          {/* Sloped Roof Structure */}
          <polygon points="260,225 440,135 620,225" fill="#1E293B" stroke="#475569" strokeWidth="3" />

          {/* PV Panels Mount Array */}
          <g transform="translate(290, 150)">
            <rect
              x="0"
              y="0"
              width="290"
              height="65"
              rx="4"
              fill={stepData.p_pv_kw > 1.0 ? 'url(#pvActiveGrad)' : 'url(#pvPanelGrad)'}
              stroke="#F59E0B"
              strokeWidth={stepData.p_pv_kw > 1.0 ? '2' : '1'}
              filter={stepData.p_pv_kw > 5.0 ? 'url(#glow-gold)' : 'none'}
              opacity="0.95"
            />
            {/* Photovoltaic Cell Grid Lines */}
            <line x1="0" y1="21" x2="290" y2="21" stroke="rgba(255,255,255,0.3)" strokeWidth="1" />
            <line x1="0" y1="43" x2="290" y2="43" stroke="rgba(255,255,255,0.3)" strokeWidth="1" />
            {[30, 60, 90, 120, 150, 180, 210, 240, 265].map((gx) => (
              <line key={gx} x1={gx} y1="0" x2={gx} y2="65" stroke="rgba(255,255,255,0.3)" strokeWidth="1" />
            ))}
          </g>

          {/* PV Node Label / Telemetry Pill */}
          <g transform="translate(370, 95)">
            <rect x="0" y="0" width="145" height="38" rx="8" fill="#111827" stroke="#F59E0B" strokeWidth="1.5" />
            <text x="12" y="16" fill="#FBBF24" fontSize="10" fontWeight="700">☀️ SOLAR PV (150kWp)</text>
            <text x="12" y="31" fill="#FFFFFF" fontSize="13" fontWeight="800" fontFamily="monospace">
              {stepData.p_pv_kw.toFixed(1)} kW
            </text>
          </g>

          {/* ========================================================
              NODE 2: SMART HOUSE MAIN BODY & APPLIANCES (PHỤ TẢI NHÀ)
              Vị trí: (270, 225) đến (610, 410)
             ======================================================== */}
          {/* House Walls Structure */}
          <rect x="270" y="225" width="340" height="185" fill="#0F172A" stroke="#334155" strokeWidth="3" rx="4" />

          {/* 2nd Floor Room (Living Room / Electronics) */}
          <rect x="290" y="245" width="140" height="65" fill="#1E293B" stroke="#475569" rx="4" />
          <rect x="300" y="255" width="55" height="45" fill={isDay ? '#38BDF8' : '#FDE047'} opacity="0.6" rx="2" />
          <text x="365" y="275" fill="#94A3B8" fontSize="9" fontWeight="600">Đèn & Thiết Bị</text>
          <text x="365" y="292" fill="#E2E8F0" fontSize="11" fontWeight="700">Phòng Khách</text>

          {/* HVAC / Heat Pump Room */}
          <rect x="450" y="245" width="140" height="65" fill="#1E293B" stroke="#475569" rx="4" />
          {/* Fan blades spinning if active */}
          <circle cx="485" cy="277" r="18" fill="#0F172A" stroke="#38BDF8" strokeWidth="2" />
          <line
            x1="485"
            y1="262"
            x2="485"
            y2="292"
            stroke="#38BDF8"
            strokeWidth="3"
            transform={`rotate(${(currentStep * 40) % 360} 485 277)`}
          />
          <line
            x1="470"
            y1="277"
            x2="500"
            y2="277"
            stroke="#38BDF8"
            strokeWidth="3"
            transform={`rotate(${(currentStep * 40) % 360} 485 277)`}
          />
          <text x="512" y="275" fill="#94A3B8" fontSize="9" fontWeight="600">Điều Hòa / HVAC</text>
          <text x="512" y="292" fill="#38BDF8" fontSize="11" fontWeight="700">Active Cool</text>

          {/* 1st Floor Garage & EV Charger */}
          <rect x="290" y="325" width="140" height="75" fill="#1E293B" stroke="#475569" rx="4" />
          {/* EV Silhouette */}
          <rect x="305" y="355" width="80" height="30" rx="6" fill="#3B82F6" opacity="0.8" />
          <circle cx="325" cy="385" r="7" fill="#0F172A" stroke="#94A3B8" strokeWidth="2" />
          <circle cx="365" cy="385" r="7" fill="#0F172A" stroke="#94A3B8" strokeWidth="2" />
          <text x="395" y="360" fill="#10B981" fontSize="10">⚡</text>
          <text x="305" y="342" fill="#94A3B8" fontSize="9" fontWeight="600">Trạm Sạc EV Car</text>

          {/* Smart Kitchen & Home Automation */}
          <rect x="450" y="325" width="140" height="75" fill="#1E293B" stroke="#475569" rx="4" />
          <text x="465" y="355" fill="#94A3B8" fontSize="9" fontWeight="600">Bếp Điện & Gia Dụng</text>
          <text x="465" y="375" fill="#F8FAFC" fontSize="12" fontWeight="700">Smart Home</text>

          {/* House Load Telemetry Pill */}
          <g transform="translate(365, 420)">
            <rect x="0" y="0" width="150" height="38" rx="8" fill="#111827" stroke="#3B82F6" strokeWidth="1.5" />
            <text x="12" y="16" fill="#60A5FA" fontSize="10" fontWeight="700">🏠 PHỤ TẢI NHÀ (P_load)</text>
            <text x="12" y="31" fill="#FFFFFF" fontSize="13" fontWeight="800" fontFamily="monospace">
              {stepData.p_load_kw.toFixed(1)} kW
            </text>
          </g>

          {/* ========================================================
              NODE 3: BESS BATTERY STORAGE SYSTEM (KHỐI PIN LƯU TRỮ)
              Vị trí bên trái sân nhà: (80, 260) đến (200, 410)
             ======================================================== */}
          {/* Concrete Base */}
          <rect x="70" y="395" width="140" height="15" fill="#334155" rx="2" />

          {/* Battery Enclosure (Tesla Megapack style) */}
          <rect
            x="80"
            y="255"
            width="120"
            height="140"
            rx="8"
            fill="#0F172A"
            stroke={isDischarging ? '#EF4444' : '#10B981'}
            strokeWidth="2.5"
            filter={isCharging ? 'url(#glow-green)' : 'none'}
          />
          {/* Battery Top Terminal Cap */}
          <rect x="120" y="245" width="40" height="10" rx="3" fill="#64748B" />

          {/* Battery Liquid SoC Window */}
          <rect x="95" y="275" width="90" height="105" rx="4" fill="#1E293B" stroke="#334155" />
          {/* Dynamic Fill Level */}
          {(() => {
            const maxH = 101;
            const fillH = Math.max(4, (stepData.soc_pct / 100) * maxH);
            const fillY = 277 + (maxH - fillH);
            return (
              <rect
                x="97"
                y={fillY}
                width="86"
                height={fillH}
                rx="2"
                fill="url(#batteryGrad)"
                opacity="0.85"
              />
            );
          })()}

          {/* Safety Guardrail Markers on Battery: 90% and 20% */}
          {/* 90% Max line */}
          <line x1="93" y1="287" x2="187" y2="287" stroke="#DC2626" strokeWidth="2" strokeDasharray="3,2" />
          <text x="190" y="290" fill="#F87171" fontSize="8" fontWeight="700">90% Max</text>
          {/* 20% Min line */}
          <line x1="93" y1="358" x2="187" y2="358" stroke="#D97706" strokeWidth="2" strokeDasharray="3,2" />
          <text x="190" y="361" fill="#FBBF24" fontSize="8" fontWeight="700">20% Min</text>

          {/* Battery Telemetry Pill */}
          <g transform="translate(65, 195)">
            <rect
              x="0"
              y="0"
              width="155"
              height="44"
              rx="8"
              fill="#111827"
              stroke={isDischarging ? '#EF4444' : '#10B981'}
              strokeWidth="1.5"
            />
            <text x="10" y="15" fill={isDischarging ? '#F87171' : '#34D399'} fontSize="10" fontWeight="700">
              🔋 BESS PIN (200kWh | {stepData.soc_pct.toFixed(0)}%)
            </text>
            <text x="10" y="31" fill="#FFFFFF" fontSize="13" fontWeight="800" fontFamily="monospace">
              {stepData.p_batt_kw > 0 ? `+${stepData.p_batt_kw.toFixed(1)} kW (Sạc)` : stepData.p_batt_kw < 0 ? `${stepData.p_batt_kw.toFixed(1)} kW (Xả)` : '0.0 kW (Nghỉ)'}
            </text>
            <text x="10" y="40" fill="#94A3B8" fontSize="8">
              SoC an toàn: [20%, 90%]
            </text>
          </g>

          {/* ========================================================
              NODE 4: EVN POWER GRID & POLE (LƯỚI ĐIỆN QUỐC GIA)
              Vị trí bên phải: (780, 200) đến (920, 410)
             ======================================================== */}
          {/* Power Pole / Pylon */}
          <g transform="translate(850, 190)">
            {/* Wooden/Concrete Pole */}
            <rect x="0" y="0" width="14" height="220" fill="#475569" rx="2" />
            {/* Cross arms */}
            <rect x="-40" y="20" width="94" height="8" fill="#334155" rx="2" />
            <rect x="-30" y="55" width="74" height="8" fill="#334155" rx="2" />
            {/* Ceramic Insulators */}
            <circle cx="-35" cy="33" r="5" fill="#94A3B8" />
            <circle cx="48" cy="33" r="5" fill="#94A3B8" />
            <circle cx="-25" cy="68" r="5" fill="#94A3B8" />
            <circle cx="38" cy="68" r="5" fill="#94A3B8" />
            {/* Power Lines extending out */}
            <path d="M 48 33 Q 90 45 150 40" stroke="#64748B" strokeWidth="2" fill="none" />
            <path d="M 38 68 Q 90 80 150 75" stroke="#64748B" strokeWidth="2" fill="none" />
            {/* Bidirectional Smart Meter Box on pole */}
            <rect x="-12" y="115" width="38" height="45" rx="4" fill="#0F172A" stroke="#8B5CF6" strokeWidth="1.5" />
            <circle cx="7" cy="130" r="4" fill={stepData.p_buy_kw > 0 ? '#8B5CF6' : stepData.p_sell_kw > 0 ? '#F59E0B' : '#64748B'} />
            <text x="7" y="150" fill="#A78BFA" fontSize="8" textAnchor="middle" fontWeight="700">EVN METER</text>
          </g>

          {/* Grid Telemetry Pill */}
          <g transform="translate(750, 130)">
            <rect x="0" y="0" width="160" height="44" rx="8" fill="#111827" stroke="#8B5CF6" strokeWidth="1.5" />
            <text x="10" y="15" fill="#C4B5FD" fontSize="10" fontWeight="700">⚡ LƯỚI ĐIỆN EVN</text>
            <text x="10" y="31" fill="#FFFFFF" fontSize="13" fontWeight="800" fontFamily="monospace">
              {stepData.p_buy_kw > 0
                ? `Mua: ${stepData.p_buy_kw.toFixed(1)} kW`
                : stepData.p_sell_kw > 0
                ? `Bán: ${stepData.p_sell_kw.toFixed(1)} kW`
                : '0.0 kW (Cân bằng)'}
            </text>
            <text x="10" y="40" fill="#94A3B8" fontSize="8">
              Ngưỡng đỉnh P_th: 90 kW
            </text>
          </g>

          {/* ========================================================
              NODE 5: CENTRAL SMART INVERTER / SEMS HUB
              Vị trí trung tâm kết nối: (440, 220)
             ======================================================== */}
          <g transform="translate(440, 205)">
            {/* Outer Inverter Body */}
            <circle cx="0" cy="0" r="30" fill="#0F172A" stroke="#3B82F6" strokeWidth="2.5" />
            {/* Pulsing Energy Core */}
            <circle cx="0" cy="0" r="22" fill="url(#inverterCoreGrad)" className="inverter-pulse" opacity="0.6" />
            <circle cx="0" cy="0" r="14" fill="#1E293B" stroke="#60A5FA" strokeWidth="1.5" />
            <text x="0" y="4" fill="#FFFFFF" fontSize="9" fontWeight="900" textAnchor="middle">SEMS</text>
          </g>

          {/* --- LAYER 3: DYNAMIC ANIMATED ENERGY FLOW LINES --- */}

          {/* 1. PV -> SEMS Inverter */}
          {stepData.p_pv_kw > 0.5 && (
            <path
              d="M 440 185 L 440 205"
              stroke="#F59E0B"
              strokeWidth={Math.min(8, Math.max(3, stepData.p_pv_kw / 18))}
              className="energy-flow-path flow-pv-active"
            />
          )}

          {/* 2. PV -> House (Tự tiêu thụ: flows.pv_to_house) */}
          {flows.pv_to_house > 0.5 && (
            <g>
              <path
                d="M 440 235 L 440 325"
                stroke="#F59E0B"
                strokeWidth={Math.min(7, Math.max(3, flows.pv_to_house / 15))}
                className="energy-flow-path flow-pv-active"
              />
              <rect x="445" y="270" width="60" height="18" rx="4" fill="#111827" stroke="#F59E0B" strokeWidth="1" />
              <text x="475" y="282" fill="#FBBF24" fontSize="9" fontWeight="700" textAnchor="middle" fontFamily="monospace">
                {flows.pv_to_house.toFixed(1)} kW
              </text>
            </g>
          )}

          {/* 3. PV -> BESS Battery (Sạc mặt trời: flows.pv_to_batt) */}
          {flows.pv_to_batt > 0.5 && (
            <g>
              <path
                d="M 410 215 Q 300 215 200 280"
                stroke="#10B981"
                strokeWidth={Math.min(7, Math.max(3, flows.pv_to_batt / 10))}
                className="energy-flow-path flow-batt-charge"
              />
              <rect x="250" y="225" width="60" height="18" rx="4" fill="#111827" stroke="#10B981" strokeWidth="1" />
              <text x="280" y="237" fill="#34D399" fontSize="9" fontWeight="700" textAnchor="middle" fontFamily="monospace">
                +{flows.pv_to_batt.toFixed(1)} kW
              </text>
            </g>
          )}

          {/* 4. PV -> Grid (Bán điện dư: flows.pv_to_grid) */}
          {flows.pv_to_grid > 0.5 && (
            <g>
              <path
                d="M 470 215 Q 650 180 840 250"
                stroke="#F59E0B"
                strokeWidth={Math.min(7, Math.max(3, flows.pv_to_grid / 12))}
                className="energy-flow-path flow-grid-sell"
              />
              <rect x="620" y="185" width="65" height="18" rx="4" fill="#111827" stroke="#F59E0B" strokeWidth="1" />
              <text x="652" y="197" fill="#FBBF24" fontSize="9" fontWeight="700" textAnchor="middle" fontFamily="monospace">
                Bán: {flows.pv_to_grid.toFixed(1)} kW
              </text>
            </g>
          )}

          {/* 5. BESS Battery -> House (Pin xả gánh tải: flows.batt_to_house) */}
          {flows.batt_to_house > 0.5 && (
            <g>
              <path
                d="M 200 320 Q 300 300 340 325"
                stroke="#EF4444"
                strokeWidth={Math.min(7, Math.max(3, flows.batt_to_house / 10))}
                className="energy-flow-path flow-batt-discharge"
              />
              <rect x="240" y="295" width="65" height="18" rx="4" fill="#111827" stroke="#EF4444" strokeWidth="1" />
              <text x="272" y="307" fill="#F87171" fontSize="9" fontWeight="700" textAnchor="middle" fontFamily="monospace">
                Xả: {flows.batt_to_house.toFixed(1)} kW
              </text>
            </g>
          )}

          {/* 6. Grid -> House (Lưới bù phụ tải: flows.grid_to_house) */}
          {flows.grid_to_house > 0.5 && (
            <g>
              <path
                d="M 840 270 Q 650 330 590 340"
                stroke="#8B5CF6"
                strokeWidth={Math.min(7, Math.max(3, flows.grid_to_house / 15))}
                className="energy-flow-path flow-grid-buy"
              />
              <rect x="680" y="315" width="65" height="18" rx="4" fill="#111827" stroke="#8B5CF6" strokeWidth="1" />
              <text x="712" y="327" fill="#C4B5FD" fontSize="9" fontWeight="700" textAnchor="middle" fontFamily="monospace">
                Mua: {flows.grid_to_house.toFixed(1)} kW
              </text>
            </g>
          )}

          {/* 7. Grid -> BESS Battery (Sạc đêm giờ thấp điểm: flows.grid_to_batt) */}
          {flows.grid_to_batt > 0.5 && (
            <g>
              <path
                d="M 840 290 Q 520 400 200 350"
                stroke="#8B5CF6"
                strokeWidth={Math.min(7, Math.max(3, flows.grid_to_batt / 10))}
                className="energy-flow-path flow-grid-buy"
              />
              <rect x="490" y="375" width="75" height="18" rx="4" fill="#111827" stroke="#8B5CF6" strokeWidth="1" />
              <text x="527" y="387" fill="#C4B5FD" fontSize="9" fontWeight="700" textAnchor="middle" fontFamily="monospace">
                Sạc đêm: {flows.grid_to_batt.toFixed(1)} kW
              </text>
            </g>
          )}
        </svg>
      </div>
      )}


      {/* 3. Dãy thẻ Telemetry đo lường tức thời (Live Telemetry Row) */}
      <div className="live-telemetry-row">
        {/* PV Telemetry */}
        <div className="live-card">
          <div className="live-icon-box" style={{ background: 'rgba(245, 158, 11, 0.15)', color: '#F59E0B' }}>
            <Sun size={24} />
          </div>
          <div className="live-content">
            <span className="live-label">Quang điện Solar PV</span>
            <span className="live-number" style={{ color: '#FBBF24' }}>
              {stepData.p_pv_kw.toFixed(1)} <small style={{ fontSize: '0.8rem', color: '#9CA3AF' }}>kW</small>
            </span>
          </div>
          {renderSparkline((d) => d.p_pv_kw, '#F59E0B', 0, 150)}
        </div>

        {/* House Load Telemetry */}
        <div className="live-card">
          <div className="live-icon-box" style={{ background: 'rgba(59, 130, 246, 0.15)', color: '#3B82F6' }}>
            <Home size={24} />
          </div>
          <div className="live-content">
            <span className="live-label">Phụ tải Căn nhà (P_load)</span>
            <span className="live-number" style={{ color: '#60A5FA' }}>
              {stepData.p_load_kw.toFixed(1)} <small style={{ fontSize: '0.8rem', color: '#9CA3AF' }}>kW</small>
            </span>
          </div>
          {renderSparkline((d) => d.p_load_kw, '#3B82F6')}
        </div>

        {/* Battery Telemetry */}
        <div className="live-card">
          <div
            className="live-icon-box"
            style={{
              background: isDischarging ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.15)',
              color: isDischarging ? '#EF4444' : '#10B981',
            }}
          >
            <Battery size={24} />
          </div>
          <div className="live-content">
            <span className="live-label">Pin BESS (SoC: {stepData.soc_pct.toFixed(0)}%)</span>
            <span className="live-number" style={{ color: isDischarging ? '#F87171' : '#34D399' }}>
              {stepData.p_batt_kw > 0 ? `+${stepData.p_batt_kw.toFixed(1)} kW (Sạc)` : stepData.p_batt_kw < 0 ? `${stepData.p_batt_kw.toFixed(1)} kW (Xả)` : '0.0 kW (Nghỉ)'}
            </span>
          </div>
          {renderSparkline((d) => d.soc_pct, '#10B981', 0, 100)}
        </div>

        {/* Grid Telemetry */}
        <div className="live-card">
          <div className="live-icon-box" style={{ background: 'rgba(139, 92, 246, 0.15)', color: '#8B5CF6' }}>
            <Zap size={24} />
          </div>
          <div className="live-content">
            <span className="live-label">Điện lưới ({stepData.c_grid?.toLocaleString('vi-VN')} đ/kWh)</span>
            <span className="live-number" style={{ color: '#C4B5FD' }}>
              {stepData.p_buy_kw > 0 ? `Mua: ${stepData.p_buy_kw.toFixed(1)} kW` : stepData.p_sell_kw > 0 ? `Bán: ${stepData.p_sell_kw.toFixed(1)} kW` : 'Cân bằng (0 kW)'}
            </span>
          </div>
          {renderSparkline((d) => d.p_grid_kw, '#8B5CF6')}
        </div>
      </div>
    </div>
  );
}
