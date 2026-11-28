import React, { Suspense } from 'react';
import * as THREE from 'three';
import { Canvas } from '@react-three/fiber';
import { Loader2 } from 'lucide-react';
import Scene from './digital-twin/Scene';
import { CAMERA_PRESETS } from './digital-twin/campusLayout';
import { useQualityStore } from '../store/useQualityStore';

/**
 * SmartHouse3D - Fullscreen 3D Canvas Viewport for TLU Campus & SEMS-RL Microgrid
 */
export default function SmartHouse3D({ stepData = {}, onSelectEntity }) {
  const getConfig = useQualityStore((s) => s.getConfig);
  const config = getConfig();

  return (
    <div className="fullscreen-3d-stage">
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
              background: '#E2E8F0',
              color: '#0F172A',
              gap: '12px',
              fontFamily: 'var(--font-ui)',
              fontWeight: 600,
            }}
          >
            <Loader2 className="spin-anim" size={34} color="#B91C1C" />
            <span style={{ fontSize: '0.9rem' }}>
              Đang khởi tạo Khuôn viên 3D Đại học Thủy Lợi & SEMS-RL...
            </span>
          </div>
        }
      >
        <Canvas
          shadows={config.shadows}
          dpr={config.dpr}
          camera={{
            position: CAMERA_PRESETS.overview.pos,
            fov: 45,
            near: 0.5,
            far: 600,
          }}
          gl={{
            antialias: true,
            powerPreference: 'high-performance',
            toneMapping: THREE.ACESFilmicToneMapping,
            toneMappingExposure: 1.05,
          }}
          style={{ width: '100%', height: '100%' }}
        >
          <Scene stepData={stepData} onSelectEntity={onSelectEntity} />
        </Canvas>
      </Suspense>
    </div>
  );
}
