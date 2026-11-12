import React from 'react';
import { Html } from '@react-three/drei';
import { Sun, Building2, Battery, Zap } from 'lucide-react';
import { CAMPUS_BUILDINGS, CAMPUS_ZONES, MICROGRID_NODES } from './campusLayout';
import { useQualityStore } from '../../store/useQualityStore';

/**
 * FloatingBadges Component - Crisp Light Frosted Glass Campus Labels & Live Microgrid Telemetry
 * Matches video template's crisp uniform CSS labels while displaying live SEMS-RL kW/SoC readouts.
 */
export default function FloatingBadges({ stepData = {}, onSelectEntity }) {
  const showLabels = useQualityStore((s) => s.showLabels);
  const selectedEntity = useQualityStore((s) => s.selectedEntity);
  const setSelectedEntity = useQualityStore((s) => s.setSelectedEntity);

  if (!showLabels) return null;

  const isCharging = (stepData.p_batt_kw || 0) > 0.05;
  const isDischarging = (stepData.p_batt_kw || 0) < -0.05;

  const handleSelect = (e, entity) => {
    e.stopPropagation();
    setSelectedEntity(entity);
    if (onSelectEntity) onSelectEntity(entity);
  };

  const tagStyle = (isSelected) => ({
    padding: '2px 7px',
    borderRadius: '6px',
    background: isSelected ? '#B91C1C' : 'rgba(255, 255, 255, 0.90)',
    color: isSelected ? '#FFFFFF' : '#0F172A',
    border: isSelected ? '1px solid #991B1B' : '1px solid rgba(148, 163, 184, 0.45)',
    boxShadow: '0 2px 8px rgba(15, 23, 42, 0.16)',
    fontSize: '10px',
    fontWeight: 700,
    fontFamily: 'var(--font-ui)',
    whiteSpace: 'nowrap',
    cursor: 'pointer',
    userSelect: 'none',
  });

  const microgridCardStyle = (accentColor, isSelected) => ({
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '4px 8px',
    borderRadius: '9px',
    background: 'rgba(255, 255, 255, 0.92)',
    backdropFilter: 'blur(10px)',
    border: isSelected ? `2px solid ${accentColor}` : '1px solid rgba(148, 163, 184, 0.4)',
    boxShadow: '0 4px 16px rgba(15, 23, 42, 0.18)',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    fontFamily: '"JetBrains Mono", monospace',
    userSelect: 'none',
  });

  return (
    <group name="FloatingTLULabels">
      {/* 1. Campus Building Name Pills */}
      {CAMPUS_BUILDINGS.map((b) => {
        const y = b.stories * 3.2 + 2.4;
        const isSel = selectedEntity?.type === 'building' && selectedEntity?.id === b.id;
        return (
          <group key={b.id} position={[b.x, y, b.z]}>
            <Html center zIndexRange={[15, 0]}>
              <div
                style={tagStyle(isSel)}
                onClick={(e) => handleSelect(e, { type: 'building', id: b.id })}
              >
                {b.shortLabel}
              </div>
            </Html>
          </group>
        );
      })}

      {/* 2. Key Campus Zone Pills */}
      {CAMPUS_ZONES.map((z) => (
        <group key={z.id} position={[z.x, z.kind === 'gate' ? 6.2 : 1.8, z.z]}>
          <Html center zIndexRange={[12, 0]}>
            <div
              style={{
                padding: '2px 6px',
                borderRadius: '999px',
                background: 'rgba(248, 250, 252, 0.86)',
                color: '#334155',
                border: '1px solid rgba(148, 163, 184, 0.4)',
                fontSize: '9.5px',
                fontWeight: 600,
                whiteSpace: 'nowrap',
                boxShadow: '0 1px 6px rgba(15, 23, 42, 0.12)',
                pointerEvents: 'none',
              }}
            >
              {z.shortLabel}
            </div>
          </Html>
        </group>
      ))}

      {/* 3. Live Microgrid Telemetry Cards (Solar PV, Campus Hub Load, BESS, EVN Grid) */}
      <group position={[MICROGRID_NODES.solar.x, 7.2, MICROGRID_NODES.solar.z]}>
        <Html center zIndexRange={[20, 0]}>
          <div
            style={microgridCardStyle(
              '#D97706',
              selectedEntity?.type === 'device' && selectedEntity?.id === 'solar'
            )}
            onClick={(e) => handleSelect(e, { type: 'device', id: 'solar' })}
          >
            <Sun size={15} color="#D97706" />
            <div>
              <div style={{ fontSize: '9px', color: '#64748B', fontWeight: 700 }}>SOLAR PV</div>
              <div style={{ fontSize: '12px', color: '#B45309', fontWeight: 800 }}>
                {(stepData.p_pv_kw || 0).toFixed(1)} kW
              </div>
            </div>
          </div>
        </Html>
      </group>

      <group position={[MICROGRID_NODES.hub.x + 14, 19.5, MICROGRID_NODES.hub.z + 10]}>
        <Html center zIndexRange={[20, 0]}>
          <div
            style={microgridCardStyle(
              '#2563EB',
              selectedEntity?.type === 'building' && selectedEntity?.id === 'a1'
            )}
            onClick={(e) => handleSelect(e, { type: 'building', id: 'a1' })}
          >
            <Building2 size={15} color="#2563EB" />
            <div>
              <div style={{ fontSize: '9px', color: '#64748B', fontWeight: 700 }}>PHỤ TẢI TLU</div>
              <div style={{ fontSize: '12px', color: '#1D4ED8', fontWeight: 800 }}>
                {(stepData.p_load_kw || 0).toFixed(1)} kW
              </div>
            </div>
          </div>
        </Html>
      </group>

      <group position={[MICROGRID_NODES.bess.x, 7.6, MICROGRID_NODES.bess.z]}>
        <Html center zIndexRange={[20, 0]}>
          <div
            style={microgridCardStyle(
              isDischarging ? '#DC2626' : '#059669',
              selectedEntity?.type === 'device' && selectedEntity?.id === 'bess'
            )}
            onClick={(e) => handleSelect(e, { type: 'device', id: 'bess' })}
          >
            <Battery size={15} color={isDischarging ? '#DC2626' : '#059669'} />
            <div>
              <div style={{ fontSize: '9px', color: '#64748B', fontWeight: 700 }}>
                BESS {(stepData.soc_pct || 0).toFixed(0)}% ·{' '}
                {isCharging ? 'Sạc' : isDischarging ? 'Xả' : 'Nghỉ'}
              </div>
              <div
                style={{
                  fontSize: '12px',
                  color: isDischarging ? '#DC2626' : isCharging ? '#059669' : '#475569',
                  fontWeight: 800,
                }}
              >
                {(stepData.p_batt_kw || 0) > 0
                  ? `+${(stepData.p_batt_kw || 0).toFixed(1)}`
                  : (stepData.p_batt_kw || 0).toFixed(1)}{' '}
                kW
              </div>
            </div>
          </div>
        </Html>
      </group>

      <group position={[MICROGRID_NODES.grid.x, 18.2, MICROGRID_NODES.grid.z]}>
        <Html center zIndexRange={[20, 0]}>
          <div
            style={microgridCardStyle(
              '#7C3AED',
              selectedEntity?.type === 'device' && selectedEntity?.id === 'grid'
            )}
            onClick={(e) => handleSelect(e, { type: 'device', id: 'grid' })}
          >
            <Zap size={15} color="#7C3AED" />
            <div>
              <div style={{ fontSize: '9px', color: '#64748B', fontWeight: 700 }}>
                EVN {(stepData.p_buy_kw || 0) > 0 ? 'Mua' : (stepData.p_sell_kw || 0) > 0 ? 'Bán' : 'Cân bằng'}
              </div>
              <div style={{ fontSize: '12px', color: '#6D28D9', fontWeight: 800 }}>
                {(stepData.p_buy_kw || 0) > 0
                  ? `${(stepData.p_buy_kw || 0).toFixed(1)}`
                  : (stepData.p_sell_kw || 0) > 0
                  ? `-${(stepData.p_sell_kw || 0).toFixed(1)}`
                  : '0.0'}{' '}
                kW
              </div>
            </div>
          </div>
        </Html>
      </group>
    </group>
  );
}
