import React, { Suspense } from 'react';
import * as THREE from 'three';
import { Canvas } from '@react-three/fiber';
import {
  Camera,
  Sun,
  Battery,
  Home,
  Zap,
  Car,
  Activity,
  RotateCw,
  X,
  AlertTriangle,
  Loader2,
  Moon,
} from 'lucide-react';
import Scene from './digital-twin/Scene';
import { useQualityStore } from '../store/useQualityStore';

/**
 * SmartHouse3D - Professional Photorealistic Digital Twin for SEMS-RL
 * Built on React Three Fiber, Drei, and PostProcessing
 * Fully modular architecture adhering to 10-component specification.
 */
export default function SmartHouse3D({
  stepData = {},
  onFocusComponent,
}) {
  const {
    quality,
    setQuality,
    fps,
    isAutoDegraded,
    activePreset,
    setActivePreset,
    selectedDevice,
    setSelectedDevice,
    showFlows,
    toggleFlows,
    showLabels,
    toggleLabels,
    autoRotate,
    toggleAutoRotate,
    forceNightLights,
    toggleNightLights,
    getConfig,
  } = useQualityStore();

  const config = getConfig();

  // Camera presets list matching 6 shortcuts [1-6]
  const cameraPresets = [
    { id: 'overview', label: 'Toàn cảnh', key: '1', icon: Camera },
    { id: 'bess', label: 'Pin BESS', key: '2', icon: Battery },
    { id: 'solar', label: 'Cánh đồng PV', key: '3', icon: Sun },
    { id: 'house', label: 'Tòa nhà', key: '4', icon: Home },
    { id: 'grid', label: 'Lưới điện', key: '5', icon: Zap },
    { id: 'street', label: 'Mặt đường', key: '6', icon: Car },
  ];

  // Quality modes list
  const qualityModes = [
    { id: 'low', label: 'LOW' },
    { id: 'med', label: 'MED' },
    { id: 'high', label: 'HIGH' },
    { id: 'ultra', label: 'ULTRA' },
  ];

  const handlePresetClick = (id) => {
    setActivePreset(id);
    if (['bess', 'solar', 'house', 'grid'].includes(id)) {
      setSelectedDevice(id);
    } else {
      setSelectedDevice(null);
    }
  };

  return (
    <div
      className="digital-twin-wrapper"
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        minHeight: '520px',
        background: '#0B0F19',
        overflow: 'hidden',
        borderRadius: '12px',
      }}
    >
      {/* 1. Main 3D WebGL Canvas */}
      <Suspense
        fallback={
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              background: '#0F172A',
              color: '#38BDF8',
              gap: '12px',
              fontFamily: '"JetBrains Mono", monospace',
            }}
          >
            <Loader2 className="animate-spin" size={36} />
            <span style={{ fontSize: '0.9rem', color: '#94A3B8' }}>
              Đang khởi tạo SEMS-RL 3D Photorealistic Digital Twin...
            </span>
          </div>
        }
      >
        <Canvas
          shadows={config.shadows}
          dpr={config.dpr}
          camera={{ position: [0, 24, 34], fov: 45, near: 0.1, far: 350 }}
          gl={{
            antialias: true,
            powerPreference: 'high-performance',
            toneMapping: THREE.ACESFilmicToneMapping,
            toneMappingExposure: 1.05,
          }}
          style={{ width: '100%', height: '100%' }}
        >
          <Scene stepData={stepData} onSelectDevice={onFocusComponent} />
        </Canvas>
      </Suspense>

      {/* 2. Top-Left: Camera Presets HUD Bar */}
      <div
        className="hud-camera-bar"
        style={{
          position: 'absolute',
          top: '12px',
          left: '12px',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          background: 'rgba(15, 23, 42, 0.82)',
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
          border: '1px solid rgba(255, 255, 255, 0.12)',
          borderRadius: '8px',
          padding: '4px 6px',
          zIndex: 10,
        }}
      >
        <span
          style={{
            fontSize: '0.68rem',
            color: '#64748B',
            fontWeight: 700,
            textTransform: 'uppercase',
            marginRight: '4px',
            fontFamily: '"JetBrains Mono", monospace',
          }}
        >
          Góc nhìn:
        </span>
        {cameraPresets.map((p) => {
          const Icon = p.icon;
          const isActive = activePreset === p.id;
          return (
            <button
              key={p.id}
              onClick={() => handlePresetClick(p.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                padding: '4px 9px',
                borderRadius: '6px',
                fontSize: '0.75rem',
                fontWeight: 600,
                border: 'none',
                cursor: 'pointer',
                background: isActive ? '#0284C7' : 'transparent',
                color: isActive ? '#FFFFFF' : '#94A3B8',
                transition: 'all 0.15s ease',
              }}
              title={`Phím tắt ${p.key}`}
            >
              <Icon size={13} />
              <span>{p.label}</span>
              <kbd
                style={{
                  fontSize: '0.62rem',
                  padding: '1px 3px',
                  borderRadius: '3px',
                  background: isActive ? 'rgba(255, 255, 255, 0.25)' : 'rgba(255, 255, 255, 0.08)',
                  color: isActive ? '#FFFFFF' : '#64748B',
                }}
              >
                {p.key}
              </kbd>
            </button>
          );
        })}
      </div>

      {/* 3. Top-Right: Quality Controls & Live FPS Telemetry */}
      <div
        className="hud-quality-bar"
        style={{
          position: 'absolute',
          top: '12px',
          right: '12px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          zIndex: 10,
        }}
      >
        {/* Auto degraded notice badge */}
        {isAutoDegraded && (
          <span
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              fontSize: '0.68rem',
              color: '#FBBF24',
              background: 'rgba(245, 158, 11, 0.2)',
              border: '1px solid rgba(245, 158, 11, 0.4)',
              borderRadius: '6px',
              padding: '3px 8px',
            }}
          >
            <AlertTriangle size={12} />
            Auto-FPS
          </span>
        )}

        {/* Live FPS Counter */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
            background: 'rgba(15, 23, 42, 0.82)',
            backdropFilter: 'blur(10px)',
            border: '1px solid rgba(255, 255, 255, 0.12)',
            borderRadius: '6px',
            padding: '3px 8px',
            fontSize: '0.75rem',
            fontFamily: '"JetBrains Mono", monospace',
            color: fps >= 50 ? '#34D399' : fps >= 30 ? '#FBBF24' : '#F87171',
            fontWeight: 700,
          }}
        >
          <Activity size={13} />
          <span>{fps} FPS</span>
        </div>

        {/* Quality Mode Switcher (LOW / MED / HIGH / ULTRA) */}
        <div
          style={{
            display: 'flex',
            background: 'rgba(15, 23, 42, 0.82)',
            backdropFilter: 'blur(10px)',
            border: '1px solid rgba(255, 255, 255, 0.12)',
            borderRadius: '6px',
            padding: '2px',
          }}
        >
          {qualityModes.map((qm) => {
            const isActive = quality === qm.id;
            return (
              <button
                key={qm.id}
                onClick={() => setQuality(qm.id)}
                style={{
                  padding: '3px 8px',
                  borderRadius: '4px',
                  fontSize: '0.68rem',
                  fontWeight: 700,
                  border: 'none',
                  cursor: 'pointer',
                  background: isActive ? '#0284C7' : 'transparent',
                  color: isActive ? '#FFFFFF' : '#94A3B8',
                  transition: 'all 0.15s ease',
                }}
              >
                {qm.label}
              </button>
            );
          })}
        </div>

        {/* Layer Toggles */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            background: 'rgba(15, 23, 42, 0.82)',
            backdropFilter: 'blur(10px)',
            border: '1px solid rgba(255, 255, 255, 0.12)',
            borderRadius: '6px',
            padding: '2px 4px',
          }}
        >
          <button
            onClick={toggleFlows}
            style={{
              padding: '4px 6px',
              borderRadius: '4px',
              border: 'none',
              cursor: 'pointer',
              background: showFlows ? 'rgba(56, 189, 248, 0.2)' : 'transparent',
              color: showFlows ? '#38BDF8' : '#64748B',
              fontSize: '0.68rem',
              fontWeight: 600,
            }}
            title="Bật/Tắt dòng điện"
          >
            Luồng điện
          </button>
          <button
            onClick={toggleLabels}
            style={{
              padding: '4px 6px',
              borderRadius: '4px',
              border: 'none',
              cursor: 'pointer',
              background: showLabels ? 'rgba(56, 189, 248, 0.2)' : 'transparent',
              color: showLabels ? '#38BDF8' : '#64748B',
              fontSize: '0.68rem',
              fontWeight: 600,
            }}
            title="Bật/Tắt nhãn thông số 3D"
          >
            Nhãn 3D
          </button>
          <button
            onClick={toggleAutoRotate}
            style={{
              padding: '4px 6px',
              borderRadius: '4px',
              border: 'none',
              cursor: 'pointer',
              background: autoRotate ? 'rgba(56, 189, 248, 0.2)' : 'transparent',
              color: autoRotate ? '#38BDF8' : '#64748B',
            }}
            title="Xoay tự động"
          >
            <RotateCw size={13} />
          </button>
          <button
            onClick={toggleNightLights}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              padding: '4px 8px',
              borderRadius: '4px',
              border: forceNightLights ? '1px solid rgba(250, 204, 21, 0.45)' : '1px solid transparent',
              cursor: 'pointer',
              background: forceNightLights ? 'rgba(234, 179, 8, 0.22)' : 'transparent',
              color: forceNightLights ? '#FDE047' : '#94A3B8',
              fontSize: '0.68rem',
              fontWeight: 700,
              transition: 'all 0.15s ease',
            }}
            title="Bật/Tắt chế độ đèn đêm demo cho căn nhà chính và microgrid"
          >
            {forceNightLights ? <Moon size={12} color="#FDE047" /> : <Sun size={12} color="#94A3B8" />}
            <span>{forceNightLights ? 'Đèn Đêm: BẬT' : 'Đèn Đêm: TẮT'}</span>
          </button>
        </div>
      </div>

      {/* 4. Bottom-Right: Interactive Device Inspector Card */}
      {selectedDevice && (
        <div
          className="device-inspector-card"
          style={{
            position: 'absolute',
            bottom: '16px',
            right: '16px',
            width: '320px',
            background: 'rgba(15, 23, 42, 0.92)',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            border: '1px solid rgba(56, 189, 248, 0.4)',
            boxShadow: '0 12px 40px rgba(0, 0, 0, 0.6), 0 0 20px rgba(56, 189, 248, 0.2)',
            borderRadius: '10px',
            padding: '12px 14px',
            color: '#F8FAFC',
            zIndex: 10,
            animation: 'fadeIn 0.2s ease',
          }}
        >
          {/* Card Header */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '8px',
              paddingBottom: '8px',
              borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {selectedDevice === 'solar' && <Sun size={18} color="#F59E0B" />}
              {selectedDevice === 'bess' && <Battery size={18} color="#10B981" />}
              {selectedDevice === 'house' && <Home size={18} color="#3B82F6" />}
              {selectedDevice === 'grid' && <Zap size={18} color="#8B5CF6" />}
              <span style={{ fontSize: '0.85rem', fontWeight: 700 }}>
                {selectedDevice === 'solar' && 'Cánh Đồng Pin Solar PV'}
                {selectedDevice === 'bess' && 'Hệ Thống Lưu Trữ BESS Megapack'}
                {selectedDevice === 'house' && 'Tòa Nhà Thông Minh & EV Car'}
                {selectedDevice === 'grid' && 'Trạm Biến Áp Lưới Điện 22kV'}
              </span>
            </div>
            <button
              onClick={() => setSelectedDevice(null)}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#94A3B8',
                cursor: 'pointer',
                padding: '2px',
              }}
            >
              <X size={15} />
            </button>
          </div>

          {/* Card Body Metrics */}
          <div style={{ fontSize: '0.78rem', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {selectedDevice === 'solar' && (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#94A3B8' }}>Công suất phát hiện tại:</span>
                  <span style={{ color: '#FBBF24', fontWeight: 700 }}>
                    {(stepData.p_pv_kw || 0).toFixed(1)} kW
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#94A3B8' }}>Quy mô lắp đặt:</span>
                  <span style={{ color: '#CBD5E1' }}>150 kWp Ground + 12 kWp Mái</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#94A3B8' }}>Góc nghiêng tấm pin:</span>
                  <span style={{ color: '#CBD5E1' }}>22° Hướng Nam tối ưu</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#94A3B8' }}>Loại tế bào quang điện:</span>
                  <span style={{ color: '#CBD5E1' }}>Monocrystalline PERC</span>
                </div>
              </>
            )}

            {selectedDevice === 'bess' && (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#94A3B8' }}>Công suất sạc/xả:</span>
                  <span
                    style={{
                      color:
                        (stepData.p_batt_kw || 0) < 0
                          ? '#F87171'
                          : (stepData.p_batt_kw || 0) > 0
                          ? '#34D399'
                          : '#94A3B8',
                      fontWeight: 700,
                    }}
                  >
                    {(stepData.p_batt_kw || 0) > 0 ? `+${(stepData.p_batt_kw || 0).toFixed(1)}` : (stepData.p_batt_kw || 0).toFixed(1)} kW
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#94A3B8' }}>Dung lượng khả dụng SoC:</span>
                  <span style={{ color: '#38BDF8', fontWeight: 700 }}>
                    {(stepData.soc_pct || 90).toFixed(1)}% ({(stepData.soc_pct * 2.0).toFixed(1)} / 200 kWh)
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#94A3B8' }}>Giới hạn bảo vệ Guardrail:</span>
                  <span style={{ color: '#F87171' }}>[20% - 90%] SoC</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#94A3B8' }}>Hiệu suất nạp/xả:</span>
                  <span style={{ color: '#CBD5E1' }}>95.0% LFP Megapack</span>
                </div>
              </>
            )}

            {selectedDevice === 'house' && (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#94A3B8' }}>Phụ tải căn nhà (P_load):</span>
                  <span style={{ color: '#60A5FA', fontWeight: 700 }}>
                    {(stepData.p_load_kw || 0).toFixed(1)} kW
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#94A3B8' }}>Trạm sạc EV Wallbox:</span>
                  <span style={{ color: '#34D399' }}>Sẵn sàng (7.4 kW Level-2)</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#94A3B8' }}>Hệ thống HVAC làm mát:</span>
                  <span style={{ color: '#CBD5E1' }}>Tự động điều chỉnh theo tải</span>
                </div>
              </>
            )}

            {selectedDevice === 'grid' && (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#94A3B8' }}>Công suất mua từ lưới:</span>
                  <span style={{ color: '#C4B5FD', fontWeight: 700 }}>
                    {(stepData.p_buy_kw || 0).toFixed(1)} kW
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#94A3B8' }}>Công suất phát ngược lưới:</span>
                  <span style={{ color: '#6EE7B7', fontWeight: 700 }}>
                    {(stepData.p_sell_kw || 0).toFixed(1)} kW
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#94A3B8' }}>Giá điện EVN TOU:</span>
                  <span style={{ color: '#FBBF24', fontWeight: 700 }}>
                    {(stepData.c_grid || 0).toLocaleString('vi-VN')} đ/kWh
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#94A3B8' }}>Ngưỡng cắt đỉnh (P_th):</span>
                  <span style={{ color: '#CBD5E1' }}>90.0 kW</span>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
