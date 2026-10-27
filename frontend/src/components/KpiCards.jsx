import React from 'react';
import { DollarSign, Zap, Sun, RefreshCw, ShieldCheck, TrendingDown } from 'lucide-react';

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
          <DollarSign size={18} className="kpi-icon" />
        </div>
        <div className="kpi-value">{costVal.toLocaleString('vi-VN', { maximumFractionDigits: 0 })} đ</div>
        {!isNoBat && savingPct !== 0 ? (
          <div className="kpi-delta positive">
            <TrendingDown size={14} />
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
          <Zap size={18} className="kpi-icon" />
        </div>
        <div className="kpi-value">{peakVal.toFixed(1)} <small style={{ fontSize: '0.9rem' }}>kW</small></div>
        {!isNoBat && shavingPct !== 0 ? (
          <div className="kpi-delta positive">
            <TrendingDown size={14} />
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
          <Sun size={18} className="kpi-icon" />
        </div>
        <div className="kpi-value">{pvSelfPct.toFixed(1)}%</div>
        <div className="kpi-delta neutral">Điện mặt trời dùng nội bộ</div>
      </div>

      {/* KPI 4: Chu kỳ pin EFC */}
      <div className="kpi-card" style={{ '--card-accent': '#3B82F6' }}>
        <div className="kpi-header">
          <span className="kpi-label">Chu kỳ pin (EFC)</span>
          <RefreshCw size={18} className="kpi-icon" />
        </div>
        <div className="kpi-value">{efc.toFixed(3)} <small style={{ fontSize: '0.85rem' }}>cycles</small></div>
        <div className="kpi-delta neutral">Hao mòn tương đương/ngày</div>
      </div>

      {/* KPI 5: Chạm Safety Guardrail */}
      <div className="kpi-card" style={{ '--card-accent': clippedSteps > 0 ? '#EF4444' : '#10B981' }}>
        <div className="kpi-header">
          <span className="kpi-label">Safety Guardrail</span>
          <ShieldCheck size={18} className="kpi-icon" />
        </div>
        <div className="kpi-value" style={{ color: clippedSteps > 0 ? '#F87171' : '#34D399' }}>
          {clippedSteps} <small style={{ fontSize: '0.85rem', color: '#9CA3AF' }}>/ 96 bước</small>
        </div>
        <div className="kpi-delta neutral">Bảo vệ dải SoC 20% - 90%</div>
      </div>
    </div>
  );
}
