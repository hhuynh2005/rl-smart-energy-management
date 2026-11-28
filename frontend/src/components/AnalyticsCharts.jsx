import React, { useState } from 'react';
import { BarChart2, Battery, Zap, DollarSign } from 'lucide-react';
import { getSafeChartTickIndices } from '../utils/chartHelpers';

export default function AnalyticsCharts({ timeline = [], pTh = 90.0, currentStep, onSelectStep }) {
  const [hoverIndex, setHoverIndex] = useState(null);

  if (!timeline || timeline.length === 0) {
    return (
      <div style={{ color: '#64748B', padding: '2rem', textAlign: 'center' }}>
        Không có dữ liệu mô phỏng.
      </div>
    );
  }

  const n = timeline.length;
  const activeIdx = Math.max(0, Math.min(n - 1, hoverIndex !== null ? hoverIndex : currentStep));
  const activeRecord = timeline[activeIdx] || timeline[0];
  const tickIndices = getSafeChartTickIndices(n);

  const width = 560;
  const height = 240;
  const padding = { top: 20, right: 30, bottom: 35, left: 55 };
  const plotW = width - padding.left - padding.right;
  const plotH = height - padding.top - padding.bottom;

  const getX = (i) => (n <= 1 ? padding.left : padding.left + (i / (n - 1)) * plotW);

  // Chart 1: Power Balance
  const maxP = Math.max(120, ...timeline.map((d) => Math.max(d.p_load_kw, d.p_pv_kw)));
  const minP = Math.min(-50, ...timeline.map((d) => d.p_batt_kw));
  const pRange = maxP - minP;
  const getY1 = (val) => padding.top + plotH - ((val - minP) / pRange) * plotH;
  const y1Zero = getY1(0);

  const pLoadPath = timeline.map((d, i) => `${i === 0 ? 'M' : 'L'} ${getX(i)} ${getY1(d.p_load_kw)}`).join(' ');
  const pPvPoints = timeline.map((d, i) => `${getX(i)} ${getY1(d.p_pv_kw)}`);
  const pPvAreaPath = `M ${getX(0)} ${y1Zero} L ${pPvPoints.join(' L ')} L ${getX(n - 1)} ${y1Zero} Z`;
  const pPvLinePath = `M ${pPvPoints.join(' L ')}`;

  // Chart 2: SoC
  const getY2 = (pct) => padding.top + plotH - (pct / 100) * plotH;
  const socLinePath = timeline.map((d, i) => `${i === 0 ? 'M' : 'L'} ${getX(i)} ${getY2(d.soc_pct)}`).join(' ');

  // Chart 3: Peak Shaving
  const maxBuy = Math.max(pTh + 20, ...timeline.map((d) => Math.max(d.p_buy_kw, d.nobat_p_buy_kw)));
  const getY3 = (val) => padding.top + plotH - (val / maxBuy) * plotH;
  const nobatBuyPath = timeline.map((d, i) => `${i === 0 ? 'M' : 'L'} ${getX(i)} ${getY3(d.nobat_p_buy_kw)}`).join(' ');
  const pBuyPoints = timeline.map((d, i) => `${getX(i)} ${getY3(d.p_buy_kw)}`);
  const pBuyAreaPath = `M ${getX(0)} ${getY3(0)} L ${pBuyPoints.join(' L ')} L ${getX(n - 1)} ${getY3(0)} Z`;
  const pBuyLinePath = `M ${pBuyPoints.join(' L ')}`;

  // Chart 4: EVN TOU
  const maxCost = Math.max(40000, ...timeline.map((d) => d.c_elec));
  const getY4Tariff = (vnd) => padding.top + plotH - ((vnd - 800) / 2600) * plotH;
  const getY4Cost = (cost) => padding.top + plotH - (cost / maxCost) * plotH;
  const touLinePath = timeline.map((d, i) => `${i === 0 ? 'M' : 'L'} ${getX(i)} ${getY4Tariff(d.c_grid)}`).join(' ');

  const handleSvgMouseMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clientX = e.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, (clientX - padding.left) / plotW));
    const stepIdx = Math.round(ratio * (n - 1));
    setHoverIndex(stepIdx);
  };

  const handleSvgClick = () => {
    if (hoverIndex !== null && onSelectStep) {
      onSelectStep(hoverIndex);
    }
  };

  return (
    <div className="charts-grid">
      {/* CHART 1: CÂN BẰNG CÔNG SUẤT */}
      <div className="chart-card">
        <div className="chart-header">
          <div className="chart-title">
            <Zap size={17} color="#D97706" />
            <span>1. Cân bằng công suất Microgrid (24 Giờ)</span>
          </div>
          <div className="chart-legend">
            <span className="legend-item"><span className="legend-dot" style={{ background: '#EA580C' }} /> P_load</span>
            <span className="legend-item"><span className="legend-dot" style={{ background: '#F59E0B' }} /> P_pv</span>
            <span className="legend-item"><span className="legend-dot" style={{ background: '#059669' }} /> Sạc BESS</span>
            <span className="legend-item"><span className="legend-dot" style={{ background: '#DC2626' }} /> Xả BESS</span>
          </div>
        </div>

        <div className="chart-svg-wrapper">
          <svg
            viewBox={`0 0 ${width} ${height}`}
            style={{ width: '100%', height: '100%', cursor: 'crosshair' }}
            onMouseMove={handleSvgMouseMove}
            onMouseLeave={() => setHoverIndex(null)}
            onClick={handleSvgClick}
          >
            {[0, 30, 60, 90, 120].map((val) => (
              <g key={val}>
                <line x1={padding.left} y1={getY1(val)} x2={width - padding.right} y2={getY1(val)} stroke="#E2E8F0" strokeWidth="1" />
                <text x={padding.left - 8} y={getY1(val) + 4} fill="#64748B" fontSize="10" textAnchor="end" fontFamily="monospace">
                  {val}
                </text>
              </g>
            ))}
            <line x1={padding.left} y1={y1Zero} x2={width - padding.right} y2={y1Zero} stroke="#94A3B8" strokeWidth="1.5" />

            {tickIndices.map((idx) => (
              <g key={idx}>
                <line x1={getX(idx)} y1={padding.top} x2={getX(idx)} y2={height - padding.bottom} stroke="#F1F5F9" strokeDasharray="3,3" />
                <text x={getX(idx)} y={height - 12} fill="#64748B" fontSize="10" textAnchor="middle" fontFamily="monospace">
                  {Math.round(timeline[idx]?.hour ?? idx * 0.25)}h
                </text>
              </g>
            ))}

            {timeline.map((d, i) => {
              if (Math.abs(d.p_batt_kw) < 0.1) return null;
              const barX = getX(i) - 2;
              const barY = d.p_batt_kw >= 0 ? getY1(d.p_batt_kw) : y1Zero;
              const barH = Math.abs(getY1(d.p_batt_kw) - y1Zero);
              const barColor = d.p_batt_kw >= 0 ? '#059669' : '#DC2626';
              return <rect key={i} x={barX} y={barY} width="4" height={barH} fill={barColor} opacity="0.72" rx="1" />;
            })}

            <path d={pPvAreaPath} fill="rgba(245, 158, 11, 0.22)" />
            <path d={pPvLinePath} fill="none" stroke="#D97706" strokeWidth="2" />
            <path d={pLoadPath} fill="none" stroke="#EA580C" strokeWidth="2.5" />

            <line x1={getX(activeIdx)} y1={padding.top} x2={getX(activeIdx)} y2={height - padding.bottom} stroke="#B91C1C" strokeWidth="1.8" strokeDasharray="4,3" />
            <circle cx={getX(activeIdx)} cy={getY1(activeRecord.p_load_kw)} r="4" fill="#EA580C" stroke="#FFFFFF" strokeWidth="1.5" />
            <circle cx={getX(activeIdx)} cy={getY1(activeRecord.p_pv_kw)} r="4" fill="#D97706" stroke="#FFFFFF" strokeWidth="1.5" />
          </svg>
        </div>
        <div className="chart-caption">
          <b>{activeRecord.time_str}</b>: Tải {activeRecord.p_load_kw.toFixed(1)} kW | PV {activeRecord.p_pv_kw.toFixed(1)} kW | Pin{' '}
          {activeRecord.p_batt_kw > 0 ? `+${activeRecord.p_batt_kw.toFixed(1)} kW (sạc)` : `${activeRecord.p_batt_kw.toFixed(1)} kW (xả)`}
        </div>
      </div>

      {/* CHART 2: MỨC SẠC PIN (SoC) & GUARDRAIL */}
      <div className="chart-card">
        <div className="chart-header">
          <div className="chart-title">
            <Battery size={17} color="#2563EB" />
            <span>2. Mức sạc pin (SoC) & Vùng an toàn Guardrail</span>
          </div>
          <div className="chart-legend">
            <span className="legend-item"><span className="legend-dot" style={{ background: '#2563EB' }} /> SoC (%)</span>
            <span className="legend-item"><span className="legend-dot" style={{ background: '#DC2626' }} /> Max (90%)</span>
            <span className="legend-item"><span className="legend-dot" style={{ background: '#D97706' }} /> Min (20%)</span>
          </div>
        </div>

        <div className="chart-svg-wrapper">
          <svg
            viewBox={`0 0 ${width} ${height}`}
            style={{ width: '100%', height: '100%', cursor: 'crosshair' }}
            onMouseMove={handleSvgMouseMove}
            onMouseLeave={() => setHoverIndex(null)}
            onClick={handleSvgClick}
          >
            <rect x={padding.left} y={getY2(90)} width={plotW} height={getY2(20) - getY2(90)} fill="rgba(5, 150, 105, 0.10)" />

            {[0, 20, 50, 90, 100].map((val) => (
              <g key={val}>
                <line x1={padding.left} y1={getY2(val)} x2={width - padding.right} y2={getY2(val)} stroke="#E2E8F0" strokeWidth="1" />
                <text x={padding.left - 8} y={getY2(val) + 4} fill="#64748B" fontSize="10" textAnchor="end" fontFamily="monospace">
                  {val}%
                </text>
              </g>
            ))}

            {tickIndices.map((idx) => (
              <text key={idx} x={getX(idx)} y={height - 12} fill="#64748B" fontSize="10" textAnchor="middle" fontFamily="monospace">
                {Math.round(timeline[idx]?.hour ?? idx * 0.25)}h
              </text>
            ))}

            <line x1={padding.left} y1={getY2(90)} x2={width - padding.right} y2={getY2(90)} stroke="#DC2626" strokeWidth="1.5" strokeDasharray="4,4" />
            <line x1={padding.left} y1={getY2(20)} x2={width - padding.right} y2={getY2(20)} stroke="#D97706" strokeWidth="1.5" strokeDasharray="4,4" />
            <path d={socLinePath} fill="none" stroke="#2563EB" strokeWidth="2.5" />

            <line x1={getX(activeIdx)} y1={padding.top} x2={getX(activeIdx)} y2={height - padding.bottom} stroke="#B91C1C" strokeWidth="1.8" strokeDasharray="4,3" />
            <circle cx={getX(activeIdx)} cy={getY2(activeRecord.soc_pct)} r="5" fill="#2563EB" stroke="#FFFFFF" strokeWidth="2" />
          </svg>
        </div>
        <div className="chart-caption">
          <b>{activeRecord.time_str}</b>: SoC = <b>{activeRecord.soc_pct.toFixed(1)}%</b>{' '}
          {activeRecord.is_clipped && '(Lệnh bị Guardrail ghim an toàn)'}
        </div>
      </div>

      {/* CHART 3: PEAK SHAVING */}
      <div className="chart-card">
        <div className="chart-header">
          <div className="chart-title">
            <BarChart2 size={17} color="#7C3AED" />
            <span>3. Cắt đỉnh phụ tải lưới (Peak Shaving)</span>
          </div>
          <div className="chart-legend">
            <span className="legend-item"><span className="legend-dot" style={{ background: '#64748B' }} /> No-Battery</span>
            <span className="legend-item"><span className="legend-dot" style={{ background: '#7C3AED' }} /> Mua lưới thực tế</span>
            <span className="legend-item"><span className="legend-dot" style={{ background: '#DC2626' }} /> Ngưỡng P_th ({pTh}kW)</span>
          </div>
        </div>

        <div className="chart-svg-wrapper">
          <svg
            viewBox={`0 0 ${width} ${height}`}
            style={{ width: '100%', height: '100%', cursor: 'crosshair' }}
            onMouseMove={handleSvgMouseMove}
            onMouseLeave={() => setHoverIndex(null)}
            onClick={handleSvgClick}
          >
            {[0, 30, 60, 90, 120].map((val) => (
              <g key={val}>
                <line x1={padding.left} y1={getY3(val)} x2={width - padding.right} y2={getY3(val)} stroke="#E2E8F0" strokeWidth="1" />
                <text x={padding.left - 8} y={getY3(val) + 4} fill="#64748B" fontSize="10" textAnchor="end" fontFamily="monospace">
                  {val}
                </text>
              </g>
            ))}

            {tickIndices.map((idx) => (
              <text key={idx} x={getX(idx)} y={height - 12} fill="#64748B" fontSize="10" textAnchor="middle" fontFamily="monospace">
                {Math.round(timeline[idx]?.hour ?? idx * 0.25)}h
              </text>
            ))}

            <line x1={padding.left} y1={getY3(pTh)} x2={width - padding.right} y2={getY3(pTh)} stroke="#DC2626" strokeWidth="1.5" strokeDasharray="5,4" />
            <text x={width - padding.right - 5} y={getY3(pTh) - 6} fill="#DC2626" fontSize="9" textAnchor="end" fontWeight="700">
              P_th = {pTh.toFixed(0)} kW
            </text>

            <path d={nobatBuyPath} fill="none" stroke="#64748B" strokeWidth="1.6" strokeDasharray="3,3" />
            <path d={pBuyAreaPath} fill="rgba(124, 58, 237, 0.16)" />
            <path d={pBuyLinePath} fill="none" stroke="#7C3AED" strokeWidth="2.5" />

            <line x1={getX(activeIdx)} y1={padding.top} x2={getX(activeIdx)} y2={height - padding.bottom} stroke="#B91C1C" strokeWidth="1.8" strokeDasharray="4,3" />
            <circle cx={getX(activeIdx)} cy={getY3(activeRecord.p_buy_kw)} r="5" fill="#7C3AED" stroke="#FFFFFF" strokeWidth="2" />
          </svg>
        </div>
        <div className="chart-caption">
          <b>{activeRecord.time_str}</b>: Mua thực tế <b>{activeRecord.p_buy_kw.toFixed(1)} kW</b> (Mốc không pin:{' '}
          {activeRecord.nobat_p_buy_kw.toFixed(1)} kW)
        </div>
      </div>

      {/* CHART 4: EVN TOU & STEP COST */}
      <div className="chart-card">
        <div className="chart-header">
          <div className="chart-title">
            <DollarSign size={17} color="#B91C1C" />
            <span>4. Biểu giá TOU EVN & Chi phí điện từng bước</span>
          </div>
          <div className="chart-legend">
            <span className="legend-item"><span className="legend-dot" style={{ background: '#4F46E5' }} /> Giá điện (đ/kWh)</span>
            <span className="legend-item"><span className="legend-dot" style={{ background: '#E11D48' }} /> Tiền điện bước (VNĐ)</span>
          </div>
        </div>

        <div className="chart-svg-wrapper">
          <svg
            viewBox={`0 0 ${width} ${height}`}
            style={{ width: '100%', height: '100%', cursor: 'crosshair' }}
            onMouseMove={handleSvgMouseMove}
            onMouseLeave={() => setHoverIndex(null)}
            onClick={handleSvgClick}
          >
            {[1100, 1800, 3000].map((vnd) => (
              <g key={vnd}>
                <line x1={padding.left} y1={getY4Tariff(vnd)} x2={width - padding.right} y2={getY4Tariff(vnd)} stroke="#E2E8F0" strokeWidth="1" />
                <text x={padding.left - 8} y={getY4Tariff(vnd) + 4} fill="#64748B" fontSize="10" textAnchor="end" fontFamily="monospace">
                  {vnd}
                </text>
              </g>
            ))}

            {tickIndices.map((idx) => (
              <text key={idx} x={getX(idx)} y={height - 12} fill="#64748B" fontSize="10" textAnchor="middle" fontFamily="monospace">
                {Math.round(timeline[idx]?.hour ?? idx * 0.25)}h
              </text>
            ))}

            {timeline.map((d, i) => {
              const bX = getX(i) - 2;
              const bY = getY4Cost(d.c_elec);
              const bH = Math.max(0, padding.top + plotH - bY);
              return <rect key={i} x={bX} y={bY} width="4" height={bH} fill="#E11D48" opacity="0.45" rx="1" />;
            })}

            <path d={touLinePath} fill="none" stroke="#4F46E5" strokeWidth="2.5" />

            <line x1={getX(activeIdx)} y1={padding.top} x2={getX(activeIdx)} y2={height - padding.bottom} stroke="#B91C1C" strokeWidth="1.8" strokeDasharray="4,3" />
            <circle cx={getX(activeIdx)} cy={getY4Tariff(activeRecord.c_grid)} r="5" fill="#4F46E5" stroke="#FFFFFF" strokeWidth="2" />
          </svg>
        </div>
        <div className="chart-caption">
          <b>{activeRecord.time_str}</b>: Đơn giá <b>{activeRecord.c_grid.toLocaleString('vi-VN')} đ/kWh</b> | Hóa đơn bước:{' '}
          <b>{activeRecord.c_elec.toLocaleString('vi-VN', { maximumFractionDigits: 0 })} đ</b>
        </div>
      </div>
    </div>
  );
}
