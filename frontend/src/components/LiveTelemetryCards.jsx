import React from 'react';
import { Sun, Building2, Battery, Zap } from 'lucide-react';
import { computeSparklineData } from '../utils/chartHelpers';

function SparklineSvg({ timeline, getValue, strokeColor, currentStep, fixedMin = null, fixedMax = null }) {
  const w = 72;
  const h = 24;
  const data = computeSparklineData(timeline, getValue, w, h, fixedMin, fixedMax, currentStep);
  if (!data) return null;

  const { polylineStr, curX, curY } = data;
  const gradId = `spark-light-${strokeColor.replace('#', '')}`;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', marginLeft: 'auto', flexShrink: 0 }}>
      <svg width={w} height={h} style={{ overflow: 'visible' }}>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={strokeColor} stopOpacity="0.32" />
            <stop offset="100%" stopColor={strokeColor} stopOpacity="0.0" />
          </linearGradient>
        </defs>
        <line x1="0" y1={h - 1} x2={w} y2={h - 1} stroke="rgba(148, 163, 184, 0.4)" strokeWidth="1" />
        <polygon points={`${polylineStr} ${w},${h - 1} 0,${h - 1}`} fill={`url(#${gradId})`} />
        <polyline points={polylineStr} fill="none" stroke={strokeColor} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx={curX} cy={curY} r="3" fill="#FFFFFF" stroke={strokeColor} strokeWidth="2" />
      </svg>
      <span style={{ fontSize: '0.6rem', color: '#64748B', marginTop: '2px', fontFamily: 'var(--font-mono)' }}>
        24h Trend
      </span>
    </div>
  );
}

/**
 * Shared 4-card Live Telemetry strip with 24h SVG sparklines (Light Frosted Glass).
 */
export default function LiveTelemetryCards({ stepData = {}, timeline = [], currentStep = 0 }) {
  const isCharging = (stepData.p_batt_kw || 0) > 0.05;
  const isDischarging = (stepData.p_batt_kw || 0) < -0.05;

  return (
    <div className="live-telemetry-row">
      {/* Solar PV */}
      <div className="live-card">
        <div className="live-icon-box" style={{ background: 'rgba(217, 119, 6, 0.14)', color: '#D97706' }}>
          <Sun size={18} />
        </div>
        <div className="live-content">
          <span className="live-label">Quang điện Solar PV</span>
          <span className="live-number" style={{ color: '#B45309' }}>
            {(stepData.p_pv_kw || 0).toFixed(1)} <small style={{ fontSize: '0.7rem', color: '#64748B' }}>kW</small>
          </span>
        </div>
        <SparklineSvg
          timeline={timeline}
          getValue={(d) => d.p_pv_kw}
          strokeColor="#D97706"
          currentStep={currentStep}
          fixedMin={0}
          fixedMax={150}
        />
      </div>

      {/* Campus Load */}
      <div className="live-card">
        <div className="live-icon-box" style={{ background: 'rgba(37, 99, 235, 0.14)', color: '#2563EB' }}>
          <Building2 size={18} />
        </div>
        <div className="live-content">
          <span className="live-label">Phụ tải TLU (P_load)</span>
          <span className="live-number" style={{ color: '#1D4ED8' }}>
            {(stepData.p_load_kw || 0).toFixed(1)} <small style={{ fontSize: '0.7rem', color: '#64748B' }}>kW</small>
          </span>
        </div>
        <SparklineSvg
          timeline={timeline}
          getValue={(d) => d.p_load_kw}
          strokeColor="#2563EB"
          currentStep={currentStep}
        />
      </div>

      {/* BESS */}
      <div className="live-card">
        <div
          className="live-icon-box"
          style={{
            background: isDischarging ? 'rgba(220, 38, 38, 0.14)' : 'rgba(5, 150, 105, 0.14)',
            color: isDischarging ? '#DC2626' : '#059669',
          }}
        >
          <Battery size={18} />
        </div>
        <div className="live-content">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '4px' }}>
            <span className="live-label">Pin BESS ({(stepData.soc_pct || 0).toFixed(0)}%)</span>
            <span
              style={{
                fontSize: '0.6rem',
                fontWeight: 700,
                padding: '0.08rem 0.34rem',
                borderRadius: '4px',
                background: isDischarging ? 'rgba(220, 38, 38, 0.12)' : isCharging ? 'rgba(5, 150, 105, 0.12)' : 'rgba(100, 116, 139, 0.12)',
                color: isDischarging ? '#B91C1C' : isCharging ? '#047857' : '#475569',
                whiteSpace: 'nowrap',
              }}
            >
              {isCharging ? 'Sạc' : isDischarging ? 'Xả' : 'Nghỉ'}
            </span>
          </div>
          <span
            className="live-number"
            style={{
              color: isDischarging ? '#DC2626' : isCharging ? '#059669' : '#475569',
              whiteSpace: 'nowrap',
            }}
          >
            {(stepData.p_batt_kw || 0) > 0
              ? `+${(stepData.p_batt_kw || 0).toFixed(1)} kW`
              : (stepData.p_batt_kw || 0) < 0
              ? `${(stepData.p_batt_kw || 0).toFixed(1)} kW`
              : '0.0 kW'}
          </span>
        </div>
        <SparklineSvg
          timeline={timeline}
          getValue={(d) => d.soc_pct}
          strokeColor="#059669"
          currentStep={currentStep}
          fixedMin={0}
          fixedMax={100}
        />
      </div>

      {/* EVN Grid */}
      <div className="live-card">
        <div className="live-icon-box" style={{ background: 'rgba(124, 58, 237, 0.14)', color: '#7C3AED' }}>
          <Zap size={18} />
        </div>
        <div className="live-content">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '4px' }}>
            <span className="live-label">Điện lưới ({(stepData.c_grid || 0).toLocaleString('vi-VN')} đ)</span>
            <span
              style={{
                fontSize: '0.6rem',
                fontWeight: 700,
                padding: '0.08rem 0.34rem',
                borderRadius: '4px',
                background: (stepData.p_buy_kw || 0) > 0 ? 'rgba(124, 58, 237, 0.12)' : (stepData.p_sell_kw || 0) > 0 ? 'rgba(217, 119, 6, 0.14)' : 'rgba(100, 116, 139, 0.12)',
                color: (stepData.p_buy_kw || 0) > 0 ? '#6D28D9' : (stepData.p_sell_kw || 0) > 0 ? '#B45309' : '#475569',
                whiteSpace: 'nowrap',
              }}
            >
              {(stepData.p_buy_kw || 0) > 0 ? 'Mua' : (stepData.p_sell_kw || 0) > 0 ? 'Bán' : 'Cân bằng'}
            </span>
          </div>
          <span className="live-number" style={{ color: '#6D28D9', whiteSpace: 'nowrap' }}>
            {(stepData.p_buy_kw || 0) > 0
              ? `${(stepData.p_buy_kw || 0).toFixed(1)} kW`
              : (stepData.p_sell_kw || 0) > 0
              ? `${(stepData.p_sell_kw || 0).toFixed(1)} kW`
              : '0.0 kW'}
          </span>
        </div>
        <SparklineSvg
          timeline={timeline}
          getValue={(d) => d.p_grid_kw}
          strokeColor="#7C3AED"
          currentStep={currentStep}
        />
      </div>
    </div>
  );
}
