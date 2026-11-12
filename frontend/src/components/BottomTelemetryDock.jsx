import React, { useEffect, useState } from 'react';
import { ChevronUp, ChevronDown } from 'lucide-react';
import KpiCards from './KpiCards';
import LiveTelemetryCards from './LiveTelemetryCards';
import { useQualityStore } from '../store/useQualityStore';
import { computeExpandedDockBounds } from '../utils/chartHelpers';

/**
 * BottomTelemetryDock - Compact 1-row summary bar on 3D view with expandable 5 KPI + 24h Sparklines sheet.
 * Avoids colliding with InspectorCard on 1280x720 viewports via computeExpandedDockBounds.
 */
export default function BottomTelemetryDock({
  stepData = {},
  discreteStep = {},
  metrics = null,
  policyMode = 'rbc',
  timeline = [],
  currentStep = 0,
  isExpanded = false,
  onToggleExpand,
}) {
  const selectedEntity = useQualityStore((s) => s.selectedEntity);
  const [viewportW, setViewportW] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth : 1280
  );

  useEffect(() => {
    const onResize = () => setViewportW(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const touTier = discreteStep?.tou_tier || stepData.tou_tier || 'normal';
  const cGrid = discreteStep?.c_grid || stepData.c_grid || 1800;

  const isCharging = (stepData.p_batt_kw || 0) > 0.05;
  const isDischarging = (stepData.p_batt_kw || 0) < -0.05;

  const costVal = metrics?.daily_cost_j || 0;
  const peakVal = metrics?.peak_buy_kw || 0;

  const hasInspector = Boolean(selectedEntity);
  const expandedBounds = isExpanded
    ? computeExpandedDockBounds({ viewportW, hasInspector })
    : null;

  return (
    <div className="bottom-telemetry-dock">
      {isExpanded && expandedBounds && (
        <div
          className="dock-expanded-sheet"
          style={
            hasInspector
              ? {
                  alignSelf: 'flex-start',
                  marginLeft: `${Math.max(0, expandedBounds.left - 12)}px`,
                  width: `${expandedBounds.width}px`,
                }
              : { width: `${expandedBounds.width}px` }
          }
        >
          <KpiCards metrics={metrics} policyMode={policyMode} />
          <LiveTelemetryCards
            stepData={{ ...stepData, c_grid: cGrid }}
            timeline={timeline}
            currentStep={currentStep}
          />
        </div>
      )}

      <div className="dock-summary-bar">
        <span className={`badge-tou ${touTier}`}>
          {touTier === 'peak' && `CAO ĐIỂM · ${cGrid.toLocaleString('vi-VN')} đ`}
          {touTier === 'normal' && `BÌNH THƯỜNG · ${cGrid.toLocaleString('vi-VN')} đ`}
          {touTier === 'off_peak' && `THẤP ĐIỂM · ${cGrid.toLocaleString('vi-VN')} đ`}
        </span>

        <div className="dock-metric-chip">
          <span className="dock-metric-label">PV</span>
          <span className="dock-metric-val" style={{ color: '#B45309' }}>
            {(stepData.p_pv_kw || 0).toFixed(1)} kW
          </span>
        </div>

        <div className="dock-metric-chip">
          <span className="dock-metric-label">Tải TLU</span>
          <span className="dock-metric-val" style={{ color: '#1D4ED8' }}>
            {(stepData.p_load_kw || 0).toFixed(1)} kW
          </span>
        </div>

        <div className="dock-metric-chip">
          <span className="dock-metric-label">BESS ({(stepData.soc_pct || 0).toFixed(0)}%)</span>
          <span
            className="dock-metric-val"
            style={{ color: isDischarging ? '#DC2626' : isCharging ? '#059669' : '#475569' }}
          >
            {(stepData.p_batt_kw || 0) > 0
              ? `+${(stepData.p_batt_kw || 0).toFixed(1)}`
              : (stepData.p_batt_kw || 0).toFixed(1)}{' '}
            kW
          </span>
        </div>

        <div className="dock-metric-chip">
          <span className="dock-metric-label">
            {(stepData.p_buy_kw || 0) > 0 ? 'Mua lưới' : (stepData.p_sell_kw || 0) > 0 ? 'Bán lưới' : 'Lưới'}
          </span>
          <span className="dock-metric-val" style={{ color: '#6D28D9' }}>
            {(stepData.p_buy_kw || 0) > 0
              ? `${(stepData.p_buy_kw || 0).toFixed(1)}`
              : (stepData.p_sell_kw || 0) > 0
              ? `${(stepData.p_sell_kw || 0).toFixed(1)}`
              : '0.0'}{' '}
            kW
          </span>
        </div>

        <div className="dock-metric-chip">
          <span className="dock-metric-label">Chi phí</span>
          <span className="dock-metric-val">
            {costVal.toLocaleString('vi-VN', { maximumFractionDigits: 0 })} đ
          </span>
        </div>

        <div className="dock-metric-chip">
          <span className="dock-metric-label">Peak</span>
          <span className="dock-metric-val">{peakVal.toFixed(1)} kW</span>
        </div>

        <button
          className="btn-dock-expand"
          onClick={onToggleExpand}
          id="btn-toggle-kpi-dock"
        >
          {isExpanded ? <ChevronDown size={13} /> : <ChevronUp size={13} />}
          <span>{isExpanded ? 'Thu gọn KPI' : 'Mở rộng KPI & 24h'}</span>
        </button>
      </div>
    </div>
  );
}
