import React from 'react';
import { DollarSign, Zap, Sun, RefreshCw, ShieldCheck, TrendingDown, TrendingUp } from 'lucide-react';

export default function KpiCards({ metrics, policyMode }) {
  if (!metrics) return null;

  const isNoBat = policyMode === 'nobat' || policyMode.includes('No-Battery');
  const costVal = metrics.daily_cost_j || 0;
  const savingPct = metrics.cost_saving_pct || 0;
  const peakVal = metrics.peak_buy_kw || 0;
  const shavingPct = metrics.peak_shaving_pct || 0;
  const pvSelfPct = metrics.pv_self_consumption_pct || 0;
  const efc = metrics.efc || 0;
  const clippedSteps = metrics.clipped_steps || 0;

  return (
    <div className="kpi-row">
      {/* KPI 1: Chi phí điện */}
      <div className="kpi-card" style={{ '--card-accent': '#10B981' }}>
        <div className="kpi-header">
          <span className="kpi-label">Chi phí điện (J)</span>
          <DollarSign size={16} className="kpi-icon" />
        </div>
        <div className="kpi-value">{costVal.toLocaleString('vi-VN', { maximumFractionDigits: 0 })} <span style={{ fontSize: '1rem', fontWeight: 600 }}>đ</span></div>
        {!isNoBat && savingPct !== 0 ? (
          <div className="kpi-delta positive">
            <TrendingDown size={13} />
            <span>{savingPct > 0 ? `-${savingPct.toFixed(1)}%` : `+${Math.abs(savingPct).toFixed(1)}%`} vs NoBat</span>
          </div>
        ) : (
          <div className="kpi-delta neutral">Mốc đối chuẩn gốc</div>
        )}
      </div>

      {/* KPI 2: Đỉnh mua lưới */}
      <div className="kpi-card" style={{ '--card-accent': '#8B5CF6' }}>
        <div className="kpi-header">
          <span className="kpi-label">Đỉnh mua lưới (Peak)</span>
          <Zap size={16} className="kpi-icon" />
        </div>
        <div className="kpi-value">{peakVal.toFixed(1)} <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>kW</span></div>
        {!isNoBat && shavingPct !== 0 ? (
          <div className="kpi-delta positive">
            <TrendingDown size={13} />
            <span>{shavingPct.toFixed(1)}% cắt đỉnh</span>
          </div>
        ) : (
          <div className="kpi-delta neutral">Không có pin BESS</div>
        )}
      </div>

      {/* KPI 3: Tự tiêu thụ PV */}
      <div className="kpi-card" style={{ '--card-accent': '#F59E0B' }}>
        <div className="kpi-header">
          <span className="kpi-label">Tự tiêu thụ PV</span>
          <Sun size={16} className="kpi-icon" />
        </div>
        <div className="kpi-value">{pvSelfPct.toFixed(1)}%</div>
        <div className="kpi-delta neutral">Điện mặt trời dùng nội bộ</div>
      </div>

      {/* KPI 4: Chu kỳ pin EFC */}
      <div className="kpi-card" style={{ '--card-accent': '#3B82F6' }}>
        <div className="kpi-header">
          <span className="kpi-label">Chu kỳ pin (EFC)</span>
          <RefreshCw size={16} className="kpi-icon" />
        </div>
        <div className="kpi-value">{efc.toFixed(3)} <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>cycles</span></div>
        <div className="kpi-delta neutral">Hao mòn tương đương/ngày</div>
      </div>

      {/* KPI 5: Chạm Safety Guardrail */}
      <div className="kpi-card" style={{ '--card-accent': clippedSteps > 0 ? '#EF4444' : '#10B981' }}>
        <div className="kpi-header">
          <span className="kpi-label">Safety Guardrail</span>
          <ShieldCheck size={16} className="kpi-icon" />
        </div>
        <div className="kpi-value" style={{ color: clippedSteps > 0 ? '#F87171' : '#34D399' }}>
          {clippedSteps} <span style={{ fontSize: '0.85rem', color: '#94A3B8', fontWeight: 600 }}>/ 96 bước</span>
        </div>
        <div className="kpi-delta neutral">Bảo vệ dải SoC 20% - 90%</div>
      </div>
    </div>
  );
}
