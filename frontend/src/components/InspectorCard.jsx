import React from 'react';
import { Sun, Battery, Zap, Building2, X } from 'lucide-react';
import { CAMPUS_BUILDINGS } from './digital-twin/campusLayout';
import { useQualityStore } from '../store/useQualityStore';

/**
 * InspectorCard - Bottom-right (or upper-right when dock expanded) frosted card
 * Displays detailed real-time metrics for either Microgrid devices or TLU campus buildings.
 */
export default function InspectorCard({ stepData = {}, specs = {}, isDockExpanded = false }) {
  const selectedEntity = useQualityStore((s) => s.selectedEntity);
  const setSelectedEntity = useQualityStore((s) => s.setSelectedEntity);

  if (!selectedEntity) return null;

  const isDevice = selectedEntity.type === 'device';
  const building = !isDevice
    ? CAMPUS_BUILDINGS.find((b) => b.id === selectedEntity.id)
    : null;

  if (!isDevice && !building) return null;

  const totalLoad = stepData.p_load_kw || 0;
  const totalPv = stepData.p_pv_kw || 0;
  const totalPvCap = specs?.pv_capacity_kw || 150;
  const estBuildingLoad = building ? totalLoad * (building.loadShare || 0) : 0;
  const estBuildingPv =
    building && building.hasRooftopPv
      ? totalPv * ((building.pvCapacityKw || 0) / totalPvCap)
      : 0;

  return (
    <div
      className="inspector-card"
      style={
        isDockExpanded
          ? { top: '196px', bottom: 'auto', right: '12px' }
          : { bottom: '98px', right: '12px' }
      }
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '8px',
          paddingBottom: '8px',
          borderBottom: '1px solid rgba(148, 163, 184, 0.25)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '7px', minWidth: 0 }}>
          {isDevice && selectedEntity.id === 'solar' && <Sun size={17} color="#D97706" />}
          {isDevice && selectedEntity.id === 'bess' && <Battery size={17} color="#059669" />}
          {isDevice && selectedEntity.id === 'grid' && <Zap size={17} color="#7C3AED" />}
          {!isDevice && <Building2 size={17} color="#B91C1C" />}
          <span
            style={{
              fontSize: '0.82rem',
              fontWeight: 800,
              color: '#0F172A',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {isDevice && selectedEntity.id === 'solar' && 'Trạm Solar PV Khuôn Viên'}
            {isDevice && selectedEntity.id === 'bess' && 'Hệ Thống Lưu Trữ BESS'}
            {isDevice && selectedEntity.id === 'grid' && 'Trạm Biến Áp Lưới EVN 22kV'}
            {!isDevice && building.name}
          </span>
        </div>

        <button
          onClick={() => setSelectedEntity(null)}
          style={{
            background: 'transparent',
            border: 'none',
            color: '#64748B',
            cursor: 'pointer',
            padding: '2px',
            flexShrink: 0,
          }}
          title="Đóng thẻ thông tin"
        >
          <X size={15} />
        </button>
      </div>

      <div style={{ fontSize: '0.75rem', display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {isDevice && selectedEntity.id === 'solar' && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#64748B' }}>Công suất phát hiện tại:</span>
              <span style={{ color: '#B45309', fontWeight: 800, fontFamily: 'var(--font-mono)' }}>
                {(stepData.p_pv_kw || 0).toFixed(1)} kW
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#64748B' }}>Quy mô lắp đặt:</span>
              <span style={{ color: '#0F172A', fontWeight: 600 }}>150 kWp áp mái TLU</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#64748B' }}>Các mái lắp PV:</span>
              <span style={{ color: '#0F172A' }}>A1, Thư viện, K1, GDTC, Nhà xe</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#64748B' }}>Công nghệ tế bào:</span>
              <span style={{ color: '#0F172A' }}>Monocrystalline PERC</span>
            </div>
          </>
        )}

        {isDevice && selectedEntity.id === 'bess' && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#64748B' }}>Công suất sạc/xả:</span>
              <span
                style={{
                  color:
                    (stepData.p_batt_kw || 0) < 0
                      ? '#DC2626'
                      : (stepData.p_batt_kw || 0) > 0
                      ? '#059669'
                      : '#475569',
                  fontWeight: 800,
                  fontFamily: 'var(--font-mono)',
                }}
              >
                {(stepData.p_batt_kw || 0) > 0
                  ? `+${(stepData.p_batt_kw || 0).toFixed(1)}`
                  : (stepData.p_batt_kw || 0).toFixed(1)}{' '}
                kW
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#64748B' }}>Dung lượng khả dụng SoC:</span>
              <span style={{ color: '#0891B2', fontWeight: 800, fontFamily: 'var(--font-mono)' }}>
                {(stepData.soc_pct || 90).toFixed(1)}% ({((stepData.soc_pct || 90) * 2.0).toFixed(1)} / 200 kWh)
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#64748B' }}>Giới hạn Guardrail:</span>
              <span style={{ color: '#B91C1C', fontWeight: 700 }}>[20% - 90%] SoC</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#64748B' }}>Hiệu suất nạp/xả:</span>
              <span style={{ color: '#0F172A' }}>92.0% LFP Megapack</span>
            </div>
          </>
        )}

        {isDevice && selectedEntity.id === 'grid' && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#64748B' }}>Công suất mua từ lưới:</span>
              <span style={{ color: '#6D28D9', fontWeight: 800, fontFamily: 'var(--font-mono)' }}>
                {(stepData.p_buy_kw || 0).toFixed(1)} kW
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#64748B' }}>Công suất bán ngược lưới:</span>
              <span style={{ color: '#059669', fontWeight: 800, fontFamily: 'var(--font-mono)' }}>
                {(stepData.p_sell_kw || 0).toFixed(1)} kW
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#64748B' }}>Giá điện EVN TOU:</span>
              <span style={{ color: '#B45309', fontWeight: 800, fontFamily: 'var(--font-mono)' }}>
                {(stepData.c_grid || 0).toLocaleString('vi-VN')} đ/kWh
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#64748B' }}>Ngưỡng cắt đỉnh (P_th):</span>
              <span style={{ color: '#0F172A', fontWeight: 600 }}>90.0 kW</span>
            </div>
          </>
        )}

        {!isDevice && building && (
          <>
            <div style={{ color: '#475569', fontSize: '0.73rem', lineHeight: 1.35 }}>
              {building.role}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '2px' }}>
              <span style={{ color: '#64748B' }}>Quy mô công trình:</span>
              <span style={{ color: '#0F172A', fontWeight: 600 }}>{building.stories} tầng</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#64748B' }}>
                Phụ tải mô phỏng ({(building.loadShare * 100).toFixed(0)}%):
              </span>
              <span style={{ color: '#1D4ED8', fontWeight: 800, fontFamily: 'var(--font-mono)' }}>
                {estBuildingLoad.toFixed(1)} / {totalLoad.toFixed(1)} kW
              </span>
            </div>
            {building.hasRooftopPv && (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#64748B' }}>
                  Solar áp mái ({building.pvCapacityKw} kWp):
                </span>
                <span style={{ color: '#B45309', fontWeight: 800, fontFamily: 'var(--font-mono)' }}>
                  {estBuildingPv.toFixed(1)} kW
                </span>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
