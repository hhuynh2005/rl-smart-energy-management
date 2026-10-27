import React, { useState } from 'react';
import { BarChart2, Battery, Zap, DollarSign } from 'lucide-react';

export default function AnalyticsCharts({ timeline = [], nobatTimeline = [], pTh = 90.0, currentStep, onSelectStep }) {
  const [hoverIndex, setHoverIndex] = useState(null);

  if (!timeline || timeline.length === 0) {
    return <div style={{ color: '#9CA3AF', padding: '2rem', textAlign: 'center' }}>Không có dữ liệu mô phỏng.</div>;
  }

  const activeIdx = hoverIndex !== null ? hoverIndex : currentStep;
  const activeRecord = timeline[activeIdx] || timeline[0];

  // Helper coordinate mappers for SVG charts
  const width = 560;
  const height = 240;
  const padding = { top: 20, right: 30, bottom: 35, left: 55 };
  const plotW = width - padding.left - padding.right;
  const plotH = height - padding.top - padding.bottom;

  const n = timeline.length; // 96
  const getX = (i) => padding.left + (i / (n - 1)) * plotW;

  // Chart 1: Power Balance scales
  // Max power between p_load and p_pv
  const maxP = Math.max(120, ...timeline.map((d) => Math.max(d.p_load_kw, d.p_pv_kw)));
  const minP = Math.min(-50, ...timeline.map((d) => d.p_batt_kw));
  const pRange = maxP - minP;
  const getY1 = (val) => padding.top + plotH - ((val - minP) / pRange) * plotH;
  const y1Zero = getY1(0);

  // Path generators
  const pLoadPath = timeline.map((d, i) => `${i === 0 ? 'M' : 'L'} ${getX(i)} ${getY1(d.p_load_kw)}`).join(' ');
  const pPvPoints = timeline.map((d, i) => `${getX(i)} ${getY1(d.p_pv_kw)}`);
  const pPvAreaPath = `M ${getX(0)} ${y1Zero} L ${pPvPoints.join(' L ')} L ${getX(n - 1)} ${y1Zero} Z`;
  const pPvLinePath = `M ${pPvPoints.join(' L ')}`;

  // Chart 2: SoC scales (0 - 100%)
  const getY2 = (pct) => padding.top + plotH - (pct / 100) * plotH;
  const socLinePath = timeline.map((d, i) => `${i === 0 ? 'M' : 'L'} ${getX(i)} ${getY2(d.soc_pct)}`).join(' ');

  // Chart 3: Peak Shaving scales (0 to max P_buy)
  const maxBuy = Math.max(pTh + 20, ...timeline.map((d) => Math.max(d.p_buy_kw, d.nobat_p_buy_kw)));
  const getY3 = (val) => padding.top + plotH - (val / maxBuy) * plotH;
  const nobatBuyPath = timeline.map((d, i) => `${i === 0 ? 'M' : 'L'} ${getX(i)} ${getY3(d.nobat_p_buy_kw)}`).join(' ');
  const pBuyPoints = timeline.map((d, i) => `${getX(i)} ${getY3(d.p_buy_kw)}`);
  const pBuyAreaPath = `M ${getX(0)} ${getY3(0)} L ${pBuyPoints.join(' L ')} L ${getX(n - 1)} ${getY3(0)} Z`;
  const pBuyLinePath = `M ${pBuyPoints.join(' L ')}`;

  // Chart 4: EVN TOU Tariffs & Step cost scales
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
      {/* ==========================================
          CHART 1: CÂN BẰNG CÔNG SUẤT 24 GIỜ
         ========================================== */}
      <div className="chart-card">
        <div className="chart-header">
          <div className="chart-title">
            <Zap size={18} color="#F59E0B" />
            <span>1. Cân bằng công suất Microgrid (24 Giờ)</span>
          </div>
          <div className="chart-legend">
            <span className="legend-item">
              <span className="legend-dot" style={{ background: '#F59E0B' }} /> P_load
            </span>
            <span className="legend-item">
              <span className="legend-dot" style={{ background: '#FBBF24' }} /> P_pv
            </span>
            <span className="legend-item">
              <span className="legend-dot" style={{ background: '#10B981' }} /> Sạc BESS
            </span>
            <span className="legend-item">
              <span className="legend-dot" style={{ background: '#EF4444' }} /> Xả BESS
            </span>
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
            {/* Grid Lines */}
            {[0, 30, 60, 90, 120].map((val) => (
              <g key={val}>
                <line x1={padding.left} y1={getY1(val)} x2={width - padding.right} y2={getY1(val)} stroke="#1F2937" strokeWidth="1" />
                <text x={padding.left - 8} y={getY1(val) + 4} fill="#6B7280" fontSize="10" textAnchor="end" fontFamily="monospace">
                  {val}
                </text>
              </g>
            ))}
            {/* Zero Axis */}
            <line x1={padding.left} y1={y1Zero} x2={width - padding.right} y2={y1Zero} stroke="#4B5563" strokeWidth="1.5" />

            {/* Time X Ticks (0, 4, 8, 12, 16, 20, 24) */}
            {[0, 16, 32, 48, 64, 80, 95].map((idx) => (
              <g key={idx}>
                <line x1={getX(idx)} y1={padding.top} x2={getX(idx)} y2={height - padding.bottom} stroke="#1F2937" strokeDasharray="3,3" />
                <text x={getX(idx)} y={height - 12} fill="#6B7280" fontSize="10" textAnchor="middle" fontFamily="monospace">
                  {Math.round(timeline[idx].hour)}h
                </text>
              </g>
            ))}

            {/* Battery Bars (P_batt) */}
            {timeline.map((d, i) => {
              if (Math.abs(d.p_batt_kw) < 0.1) return null;
              const barX = getX(i) - 2;
              const barY = d.p_batt_kw >= 0 ? getY1(d.p_batt_kw) : y1Zero;
              const barH = Math.abs(getY1(d.p_batt_kw) - y1Zero);
              const barColor = d.p_batt_kw >= 0 ? '#10B981' : '#EF4444';
              return <rect key={i} x={barX} y={barY} width="4" height={barH} fill={barColor} opacity="0.75" rx="1" />;
            })}

            {/* PV Solar Area Fill & Line */}
            <path d={pPvAreaPath} fill="rgba(251, 191, 36, 0.25)" />
            <path d={pPvLinePath} fill="none" stroke="#FBBF24" strokeWidth="2" />

            {/* Load Power Line */}
            <path d={pLoadPath} fill="none" stroke="#F59E0B" strokeWidth="2.5" />

            {/* Active Time Step Cursor */}
            <line
              x1={getX(activeIdx)}
              y1={padding.top}
              x2={getX(activeIdx)}
              y2={height - padding.bottom}
              stroke="#60A5FA"
              strokeWidth="2"
              strokeDasharray="4,3"
            />
            <circle cx={getX(activeIdx)} cy={getY1(activeRecord.p_load_kw)} r="4" fill="#F59E0B" stroke="#FFFFFF" strokeWidth="1.5" />
            <circle cx={getX(activeIdx)} cy={getY1(activeRecord.p_pv_kw)} r="4" fill="#FBBF24" stroke="#FFFFFF" strokeWidth="1.5" />
          </svg>
        </div>
        <div className="chart-caption">
          💡 <b>{activeRecord.time_str}</b>: Tải {activeRecord.p_load_kw} kW | PV {activeRecord.p_pv_kw} kW | Pin {activeRecord.p_batt_kw > 0 ? `+${activeRecord.p_batt_kw} kW (sạc)` : `${activeRecord.p_batt_kw} kW (xả)`}
        </div>
      </div>

      {/* ==========================================
          CHART 2: MỨC SẠC PIN (SoC) & GUARDRAIL
         ========================================== */}
      <div className="chart-card">
        <div className="chart-header">
          <div className="chart-title">
            <Battery size={18} color="#3B82F6" />
            <span>2. Mức sạc pin (SoC) & Vùng an toàn Guardrail</span>
          </div>
          <div className="chart-legend">
            <span className="legend-item">
              <span className="legend-dot" style={{ background: '#2563EB' }} /> SoC (%)
            </span>
            <span className="legend-item">
              <span className="legend-dot" style={{ background: '#DC2626' }} /> Max (90%)
            </span>
            <span className="legend-item">
              <span className="legend-dot" style={{ background: '#D97706' }} /> Min (20%)
            </span>
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
            {/* Safe Region Green Rectangle (20% - 90%) */}
            <rect
              x={padding.left}
              y={getY2(90)}
              width={plotW}
              height={getY2(20) - getY2(90)}
              fill="rgba(16, 185, 129, 0.12)"
            />

            {/* SoC Y-Axis Ticks */}
            {[0, 20, 50, 90, 100].map((val) => (
              <g key={val}>
                <line x1={padding.left} y1={getY2(val)} x2={width - padding.right} y2={getY2(val)} stroke="#1F2937" strokeWidth="1" />
                <text x={padding.left - 8} y={getY2(val) + 4} fill="#6B7280" fontSize="10" textAnchor="end" fontFamily="monospace">
                  {val}%
                </text>
              </g>
            ))}

            {/* Time Ticks */}
            {[0, 16, 32, 48, 64, 80, 95].map((idx) => (
              <text key={idx} x={getX(idx)} y={height - 12} fill="#6B7280" fontSize="10" textAnchor="middle" fontFamily="monospace">
                {Math.round(timeline[idx].hour)}h
              </text>
            ))}

            {/* Dashed 90% and 20% Guardrails */}
            <line x1={padding.left} y1={getY2(90)} x2={width - padding.right} y2={getY2(90)} stroke="#DC2626" strokeWidth="1.5" strokeDasharray="4,4" />
            <line x1={padding.left} y1={getY2(20)} x2={width - padding.right} y2={getY2(20)} stroke="#D97706" strokeWidth="1.5" strokeDasharray="4,4" />

            {/* SoC Curve */}
            <path d={socLinePath} fill="none" stroke="#2563EB" strokeWidth="2.5" />

            {/* Active Time Step Cursor */}
            <line
              x1={getX(activeIdx)}
              y1={padding.top}
              x2={getX(activeIdx)}
              y2={height - padding.bottom}
              stroke="#60A5FA"
              strokeWidth="2"
              strokeDasharray="4,3"
            />
            <circle cx={getX(activeIdx)} cy={getY2(activeRecord.soc_pct)} r="5" fill="#2563EB" stroke="#FFFFFF" strokeWidth="2" />
          </svg>
        </div>
        <div className="chart-caption">
          🛡️ <b>{activeRecord.time_str}</b>: SoC = <b>{activeRecord.soc_pct.toFixed(1)}%</b> {activeRecord.is_clipped && '⚠️ (Lệnh bị Guardrail ghim an toàn!)'}
        </div>
      </div>

      {/* ==========================================
          CHART 3: HIỆU QUẢ CẮT ĐỈNH (PEAK SHAVING)
         ========================================== */}
      <div className="chart-card">
        <div className="chart-header">
          <div className="chart-title">
            <BarChart2 size={18} color="#8B5CF6" />
            <span>3. Cắt đỉnh phụ tải lưới (Peak Shaving)</span>
          </div>
          <div className="chart-legend">
            <span className="legend-item">
              <span className="legend-dot" style={{ background: '#9CA3AF' }} /> No-Battery
            </span>
            <span className="legend-item">
              <span className="legend-dot" style={{ background: '#8B5CF6' }} /> Mua lưới thực tế
            </span>
            <span className="legend-item">
              <span className="legend-dot" style={{ background: '#EF4444' }} /> Ngưỡng P_th ({pTh}kW)
            </span>
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
            {/* Grid lines */}
            {[0, 30, 60, 90, 120].map((val) => (
              <g key={val}>
                <line x1={padding.left} y1={getY3(val)} x2={width - padding.right} y2={getY3(val)} stroke="#1F2937" strokeWidth="1" />
                <text x={padding.left - 8} y={getY3(val) + 4} fill="#6B7280" fontSize="10" textAnchor="end" fontFamily="monospace">
                  {val}
                </text>
              </g>
            ))}

            {/* Time Ticks */}
            {[0, 16, 32, 48, 64, 80, 95].map((idx) => (
              <text key={idx} x={getX(idx)} y={height - 12} fill="#6B7280" fontSize="10" textAnchor="middle" fontFamily="monospace">
                {Math.round(timeline[idx].hour)}h
              </text>
            ))}

            {/* P_th Threshold Line */}
            <line x1={padding.left} y1={getY3(pTh)} x2={width - padding.right} y2={getY3(pTh)} stroke="#EF4444" strokeWidth="1.5" strokeDasharray="5,4" />
            <text x={width - padding.right - 5} y={getY3(pTh) - 6} fill="#EF4444" fontSize="9" textAnchor="end" fontWeight="700">
              P_th = {pTh.toFixed(0)} kW
            </text>

            {/* No-Battery Baseline Dotted Line */}
            <path d={nobatBuyPath} fill="none" stroke="#9CA3AF" strokeWidth="1.5" strokeDasharray="3,3" />

            {/* Actual P_buy Area & Line */}
            <path d={pBuyAreaPath} fill="rgba(139, 92, 246, 0.2)" />
            <path d={pBuyLinePath} fill="none" stroke="#8B5CF6" strokeWidth="2.5" />

            {/* Cursor */}
            <line
              x1={getX(activeIdx)}
              y1={padding.top}
              x2={getX(activeIdx)}
              y2={height - padding.bottom}
              stroke="#60A5FA"
              strokeWidth="2"
              strokeDasharray="4,3"
            />
            <circle cx={getX(activeIdx)} cy={getY3(activeRecord.p_buy_kw)} r="5" fill="#8B5CF6" stroke="#FFFFFF" strokeWidth="2" />
          </svg>
        </div>
        <div className="chart-caption">
          🎯 <b>{activeRecord.time_str}</b>: Mua thực tế <b>{activeRecord.p_buy_kw.toFixed(1)} kW</b> (Mốc không pin: {activeRecord.nobat_p_buy_kw.toFixed(1)} kW)
        </div>
      </div>

      {/* ==========================================
          CHART 4: BIỂU GIÁ EVN TOU & HÓA ĐƠN BƯỚC
         ========================================== */}
      <div className="chart-card">
        <div className="chart-header">
          <div className="chart-title">
            <DollarSign size={18} color="#6366F1" />
            <span>4. Biểu giá TOU EVN & Chi phí điện từng bước</span>
          </div>
          <div className="chart-legend">
            <span className="legend-item">
              <span className="legend-dot" style={{ background: '#6366F1' }} /> Giá điện (đ/kWh)
            </span>
            <span className="legend-item">
              <span className="legend-dot" style={{ background: '#F43F5E' }} /> Tiền điện bước (VNĐ)
            </span>
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
            {/* Tariff Grid Lines: 1100, 1800, 3000 */}
            {[1100, 1800, 3000].map((vnd) => (
              <g key={vnd}>
                <line x1={padding.left} y1={getY4Tariff(vnd)} x2={width - padding.right} y2={getY4Tariff(vnd)} stroke="#1F2937" strokeWidth="1" />
                <text x={padding.left - 8} y={getY4Tariff(vnd) + 4} fill="#6B7280" fontSize="10" textAnchor="end" fontFamily="monospace">
                  {vnd}
                </text>
              </g>
            ))}

            {/* Time Ticks */}
            {[0, 16, 32, 48, 64, 80, 95].map((idx) => (
              <text key={idx} x={getX(idx)} y={height - 12} fill="#6B7280" fontSize="10" textAnchor="middle" fontFamily="monospace">
                {Math.round(timeline[idx].hour)}h
              </text>
            ))}

            {/* Step Cost Bars */}
            {timeline.map((d, i) => {
              const bX = getX(i) - 2;
              const bY = getY4Cost(d.c_elec);
              const bH = Math.max(0, padding.top + plotH - bY);
              return <rect key={i} x={bX} y={bY} width="4" height={bH} fill="#F43F5E" opacity="0.45" rx="1" />;
            })}

            {/* TOU Tariff Stepped Line */}
            <path d={touLinePath} fill="none" stroke="#6366F1" strokeWidth="2.5" />

            {/* Cursor */}
            <line
              x1={getX(activeIdx)}
              y1={padding.top}
              x2={getX(activeIdx)}
              y2={height - padding.bottom}
              stroke="#60A5FA"
              strokeWidth="2"
              strokeDasharray="4,3"
            />
            <circle cx={getX(activeIdx)} cy={getY4Tariff(activeRecord.c_grid)} r="5" fill="#6366F1" stroke="#FFFFFF" strokeWidth="2" />
          </svg>
        </div>
        <div className="chart-caption">
          ⏰ <b>{activeRecord.time_str}</b>: Đơn giá <b>{activeRecord.c_grid.toLocaleString('vi-VN')} đ/kWh</b> | Hóa đơn bước: <b>{activeRecord.c_elec.toLocaleString('vi-VN', { maximumFractionDigits: 0 })} đ</b>
        </div>
      </div>
    </div>
  );
}
