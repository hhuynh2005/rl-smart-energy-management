import React, { useState } from 'react';
import { Download, Search, ShieldAlert, Filter } from 'lucide-react';

export default function DataTableTab({ timeline = [], currentStep = 0, onSelectStep, scenario, split, targetDay }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterClippedOnly, setFilterClippedOnly] = useState(false);

  if (!timeline || timeline.length === 0) {
    return <div style={{ color: '#9CA3AF', padding: '2rem', textAlign: 'center' }}>Không có dữ liệu hiển thị.</div>;
  }

  // Filter rows
  const filteredTimeline = timeline.filter((row) => {
    if (filterClippedOnly && !row.is_clipped) return false;
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      return (
        row.time_str.toLowerCase().includes(term) ||
        row.tou_tier.toLowerCase().includes(term) ||
        String(row.step).includes(term)
      );
    }
    return true;
  });

  // Client-side CSV Download
  const handleDownloadCsv = () => {
    const headers = [
      'step',
      'hour',
      'time',
      'tou_tier',
      'p_load_kw',
      'p_pv_kw',
      'p_batt_kw',
      'p_grid_kw',
      'p_buy_kw',
      'p_sell_kw',
      'soc',
      'c_grid_vnd',
      'c_elec_vnd',
      'c_deg_vnd',
      'reward',
      'is_clipped',
      'pv_to_house',
      'pv_to_batt',
      'pv_to_grid',
      'batt_to_house',
      'grid_to_house',
      'grid_to_batt',
    ];

    const rows = timeline.map((r) => [
      r.step,
      r.hour,
      r.time_str,
      r.tou_tier,
      r.p_load_kw,
      r.p_pv_kw,
      r.p_batt_kw,
      r.p_grid_kw,
      r.p_buy_kw,
      r.p_sell_kw,
      r.soc,
      r.c_grid,
      r.c_elec,
      r.c_deg,
      r.reward,
      r.is_clipped,
      r.flows?.pv_to_house || 0,
      r.flows?.pv_to_batt || 0,
      r.flows?.pv_to_grid || 0,
      r.flows?.batt_to_house || 0,
      r.flows?.grid_to_house || 0,
      r.flows?.grid_to_batt || 0,
    ]);

    const csvContent =
      'data:text/csv;charset=utf-8,\uFEFF' +
      [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `sems_simulation_day_${targetDay}_${split}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="table-card">
      <div className="table-header-actions">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
          {/* Search box */}
          <div style={{ position: 'relative' }}>
            <input
              type="text"
              className="input-control"
              placeholder="Tìm theo giờ (vd: 14:00)..."
              style={{ width: '220px', paddingLeft: '2rem' }}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            <Search
              size={14}
              style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: '#9CA3AF' }}
            />
          </div>

          {/* Filter clipped steps only */}
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', color: '#9CA3AF', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={filterClippedOnly}
              onChange={(e) => setFilterClippedOnly(e.target.checked)}
              style={{ accentColor: '#EF4444' }}
            />
            <span>Chỉ xem bước chạm Guardrail</span>
          </label>
        </div>

        {/* Export CSV button */}
        <button className="btn-export-csv" onClick={handleDownloadCsv} id="btn-export-csv">
          <Download size={16} />
          <span>Tải xuống kết quả (CSV)</span>
        </button>
      </div>

      <div className="table-responsive">
        <table className="data-table">
          <thead>
            <tr>
              <th>Bước (Step)</th>
              <th>Giờ</th>
              <th>Khung giá</th>
              <th>P_load (kW)</th>
              <th>P_pv (kW)</th>
              <th>P_batt (kW)</th>
              <th>P_grid (kW)</th>
              <th>P_buy (kW)</th>
              <th>P_sell (kW)</th>
              <th>SoC (%)</th>
              <th>Đơn giá (đ)</th>
              <th>Tiền điện (đ)</th>
              <th>Hao mòn (đ)</th>
              <th>Phần thưởng</th>
              <th>Guardrail</th>
            </tr>
          </thead>
          <tbody>
            {filteredTimeline.map((row) => {
              const isActive = row.step === currentStep;
              return (
                <tr
                  key={row.step}
                  className={isActive ? 'row-active' : ''}
                  onClick={() => onSelectStep && onSelectStep(row.step)}
                  style={{ cursor: 'pointer' }}
                >
                  <td style={{ fontWeight: 700, color: '#60A5FA' }}>#{row.step}</td>
                  <td style={{ fontWeight: 600 }}>{row.time_str}</td>
                  <td>
                    {row.tou_tier === 'peak' && <span style={{ color: '#F87171' }}>Cao điểm</span>}
                    {row.tou_tier === 'normal' && <span style={{ color: '#A5B4FC' }}>Bình thường</span>}
                    {row.tou_tier === 'off_peak' && <span style={{ color: '#6EE7B7' }}>Thấp điểm</span>}
                  </td>
                  <td>{row.p_load_kw.toFixed(1)}</td>
                  <td style={{ color: '#FBBF24' }}>{row.p_pv_kw.toFixed(1)}</td>
                  <td style={{ color: row.p_batt_kw > 0 ? '#34D399' : row.p_batt_kw < 0 ? '#F87171' : '#9CA3AF' }}>
                    {row.p_batt_kw > 0 ? `+${row.p_batt_kw.toFixed(1)}` : row.p_batt_kw.toFixed(1)}
                  </td>
                  <td style={{ color: '#C4B5FD' }}>{row.p_grid_kw.toFixed(1)}</td>
                  <td>{row.p_buy_kw.toFixed(1)}</td>
                  <td>{row.p_sell_kw.toFixed(1)}</td>
                  <td style={{ fontWeight: 600 }}>{(row.soc * 100).toFixed(1)}%</td>
                  <td>{row.c_grid.toLocaleString('vi-VN')}</td>
                  <td style={{ color: '#FDA4AF' }}>{row.c_elec.toLocaleString('vi-VN', { maximumFractionDigits: 0 })}</td>
                  <td style={{ color: '#9CA3AF' }}>{row.c_deg.toFixed(1)}</td>
                  <td>{row.reward.toFixed(3)}</td>
                  <td>
                    {row.is_clipped ? (
                      <span className="badge-guardrail">Clipped</span>
                    ) : (
                      <span style={{ color: '#10B981', fontSize: '0.75rem' }}>An toàn</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
