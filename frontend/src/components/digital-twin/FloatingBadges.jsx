import React from 'react';
import { Html } from '@react-three/drei';
import { Sun, Home, Battery, Zap } from 'lucide-react';
import { useQualityStore } from '../../store/useQualityStore';

/**
 * FloatingBadges Component - 3D Glassmorphism Telemetry Cards
 * Positioned in 3D space above the physical assets:
 * - Solar PV Field
 * - Smart House Load
 * - BESS Megapack
 * - EVN Substation & Grid
 */
export default function FloatingBadges({ stepData = {}, onSelectDevice }) {
  const { showLabels, selectedDevice, setSelectedDevice } = useQualityStore();

  if (!showLabels) return null;

  const isCharging = (stepData.p_batt_kw || 0) > 0.05;
  const isDischarging = (stepData.p_batt_kw || 0) < -0.05;

  return (
    <group name="Floating3DBadges">
      {/* 1. Solar PV Badge */}
      <group position={[18, 4.5, 8]}>
        <Html
          center
          distanceFactor={38}
          style={{ pointerEvents: 'auto', userSelect: 'none' }}
        >
          <div
            className={`glass-badge ${selectedDevice === 'solar' ? 'active' : ''}`}
            onClick={(e) => {
              e.stopPropagation();
              setSelectedDevice('solar');
              if (onSelectDevice) onSelectDevice('solar');
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.6rem',
              padding: '0.45rem 0.85rem',
              borderRadius: '10px',
              background: 'rgba(15, 23, 42, 0.82)',
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
              border: '1px solid rgba(245, 158, 11, 0.45)',
              boxShadow: '0 8px 32px rgba(0, 0, 0, 0.45), 0 0 15px rgba(245, 158, 11, 0.2)',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              fontFamily: '"JetBrains Mono", monospace',
              transform: 'translateZ(0)',
            }}
          >
            <div
              style={{
                width: '28px',
                height: '28px',
                borderRadius: '6px',
                background: 'rgba(245, 158, 11, 0.2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#F59E0B',
              }}
            >
              <Sun size={17} />
            </div>
            <div>
              <div style={{ fontSize: '0.68rem', color: '#94A3B8', fontWeight: 600 }}>
                QUANG ĐIỆN SOLAR PV
              </div>
              <div style={{ fontSize: '1.05rem', color: '#FBBF24', fontWeight: 700 }}>
                {(stepData.p_pv_kw || 0).toFixed(1)}{' '}
                <span style={{ fontSize: '0.72rem', color: '#CBD5E1' }}>kW</span>
              </div>
            </div>
          </div>
        </Html>
      </group>

      {/* 2. Smart House Load Badge */}
      <group position={[-0.8, 9.8, 9.2]}>
        <Html
          center
          distanceFactor={38}
          style={{ pointerEvents: 'auto', userSelect: 'none' }}
        >
          <div
            className={`glass-badge ${selectedDevice === 'house' ? 'active' : ''}`}
            onClick={(e) => {
              e.stopPropagation();
              setSelectedDevice('house');
              if (onSelectDevice) onSelectDevice('house');
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.6rem',
              padding: '0.45rem 0.85rem',
              borderRadius: '10px',
              background: 'rgba(15, 23, 42, 0.82)',
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
              border: '1px solid rgba(59, 130, 246, 0.45)',
              boxShadow: '0 8px 32px rgba(0, 0, 0, 0.45), 0 0 15px rgba(59, 130, 246, 0.2)',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              fontFamily: '"JetBrains Mono", monospace',
            }}
          >
            <div
              style={{
                width: '28px',
                height: '28px',
                borderRadius: '6px',
                background: 'rgba(59, 130, 246, 0.2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#3B82F6',
              }}
            >
              <Home size={17} />
            </div>
            <div>
              <div style={{ fontSize: '0.68rem', color: '#94A3B8', fontWeight: 600 }}>
                PHỤ TẢI CĂN NHÀ
              </div>
              <div style={{ fontSize: '1.05rem', color: '#60A5FA', fontWeight: 700 }}>
                {(stepData.p_load_kw || 0).toFixed(1)}{' '}
                <span style={{ fontSize: '0.72rem', color: '#CBD5E1' }}>kW</span>
              </div>
            </div>
          </div>
        </Html>
      </group>

      {/* 3. BESS Megapack Badge */}
      <group position={[-18, 5.2, 8]}>
        <Html
          center
          distanceFactor={38}
          style={{ pointerEvents: 'auto', userSelect: 'none' }}
        >
          <div
            className={`glass-badge ${selectedDevice === 'bess' ? 'active' : ''}`}
            onClick={(e) => {
              e.stopPropagation();
              setSelectedDevice('bess');
              if (onSelectDevice) onSelectDevice('bess');
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.6rem',
              padding: '0.45rem 0.85rem',
              borderRadius: '10px',
              background: 'rgba(15, 23, 42, 0.82)',
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
              border: `1px solid ${isDischarging ? 'rgba(239, 68, 68, 0.5)' : 'rgba(16, 185, 129, 0.5)'}`,
              boxShadow: `0 8px 32px rgba(0, 0, 0, 0.45), 0 0 15px ${isDischarging ? 'rgba(239, 68, 68, 0.2)' : 'rgba(16, 185, 129, 0.2)'}`,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              fontFamily: '"JetBrains Mono", monospace',
            }}
          >
            <div
              style={{
                width: '28px',
                height: '28px',
                borderRadius: '6px',
                background: isDischarging ? 'rgba(239, 68, 68, 0.2)' : 'rgba(16, 185, 129, 0.2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: isDischarging ? '#EF4444' : '#10B981',
              }}
            >
              <Battery size={17} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '0.68rem', color: '#94A3B8', fontWeight: 600 }}>
                  PIN BESS ({(stepData.soc_pct || 0).toFixed(0)}%)
                </span>
                <span
                  style={{
                    fontSize: '0.58rem',
                    padding: '1px 4px',
                    borderRadius: '3px',
                    background: isDischarging ? 'rgba(239, 68, 68, 0.3)' : isCharging ? 'rgba(16, 185, 129, 0.3)' : 'rgba(148, 163, 184, 0.2)',
                    color: isDischarging ? '#FCA5A5' : isCharging ? '#6EE7B7' : '#94A3B8',
                  }}
                >
                  {isCharging ? 'Sạc' : isDischarging ? 'Xả' : 'Chờ'}
                </span>
              </div>
              <div
                style={{
                  fontSize: '1.05rem',
                  fontWeight: 700,
                  color: isDischarging ? '#F87171' : isCharging ? '#34D399' : '#94A3B8',
                }}
              >
                {(stepData.p_batt_kw || 0) > 0 ? `+${(stepData.p_batt_kw || 0).toFixed(1)}` : (stepData.p_batt_kw || 0).toFixed(1)}{' '}
                <span style={{ fontSize: '0.72rem', color: '#CBD5E1' }}>kW</span>
              </div>
            </div>
          </div>
        </Html>
      </group>

      {/* 4. EVN Grid Substation Badge */}
      <group position={[-28, 8.5, -2]}>
        <Html
          center
          distanceFactor={38}
          style={{ pointerEvents: 'auto', userSelect: 'none' }}
        >
          <div
            className={`glass-badge ${selectedDevice === 'grid' ? 'active' : ''}`}
            onClick={(e) => {
              e.stopPropagation();
              setSelectedDevice('grid');
              if (onSelectDevice) onSelectDevice('grid');
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.6rem',
              padding: '0.45rem 0.85rem',
              borderRadius: '10px',
              background: 'rgba(15, 23, 42, 0.82)',
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
              border: '1px solid rgba(139, 92, 246, 0.45)',
              boxShadow: '0 8px 32px rgba(0, 0, 0, 0.45), 0 0 15px rgba(139, 92, 246, 0.2)',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              fontFamily: '"JetBrains Mono", monospace',
            }}
          >
            <div
              style={{
                width: '28px',
                height: '28px',
                borderRadius: '6px',
                background: 'rgba(139, 92, 246, 0.2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#8B5CF6',
              }}
            >
              <Zap size={17} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '0.68rem', color: '#94A3B8', fontWeight: 600 }}>
                  LƯỚI ĐIỆN EVN
                </span>
                <span
                  style={{
                    fontSize: '0.58rem',
                    padding: '1px 4px',
                    borderRadius: '3px',
                    background: (stepData.p_buy_kw || 0) > 0 ? 'rgba(139, 92, 246, 0.3)' : (stepData.p_sell_kw || 0) > 0 ? 'rgba(16, 185, 129, 0.3)' : 'rgba(148, 163, 184, 0.2)',
                    color: (stepData.p_buy_kw || 0) > 0 ? '#C4B5FD' : (stepData.p_sell_kw || 0) > 0 ? '#6EE7B7' : '#94A3B8',
                  }}
                >
                  {(stepData.p_buy_kw || 0) > 0 ? 'Mua' : (stepData.p_sell_kw || 0) > 0 ? 'Bán' : 'Cân bằng'}
                </span>
              </div>
              <div style={{ fontSize: '1.05rem', color: '#C4B5FD', fontWeight: 700 }}>
                {(stepData.p_buy_kw || 0) > 0 ? `${(stepData.p_buy_kw || 0).toFixed(1)}` : (stepData.p_sell_kw || 0) > 0 ? `-${(stepData.p_sell_kw || 0).toFixed(1)}` : '0.0'}{' '}
                <span style={{ fontSize: '0.72rem', color: '#CBD5E1' }}>kW</span>
              </div>
            </div>
          </div>
        </Html>
      </group>
    </group>
  );
}

