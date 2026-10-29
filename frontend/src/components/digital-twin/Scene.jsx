import React, { useRef, useEffect } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, PerformanceMonitor } from '@react-three/drei';
import { useQualityStore } from '../../store/useQualityStore';
import Lighting from './Lighting';
import Road from './Road';
import Traffic from './Traffic';
import CityBlocks from './CityBlocks';
import Terrain from './Terrain';
import Vegetation from './Vegetation';
import House from './House';
import SolarField from './SolarField';
import BESS from './BESS';
import GridTower from './GridTower';
import EnergyFlow from './EnergyFlow';
import FloatingBadges from './FloatingBadges';
import PostFX from './PostFX';

// Preset viewpoints definition matching user specification
const PRESETS = {
  overview: { pos: [0, 18, -26], look: [0, 4, 6] },
  bess:     { pos: [-14, 4.5, 2],  look: [-18, 2.0, 8] },
  solar:    { pos: [14, 6.0, 2],   look: [18, 2.0, 8] },
  house:    { pos: [0, 5.0, -3],   look: [0, 4.0, 8] },
  grid:     { pos: [-24, 6.0, -10], look: [-28, 4.0, 2] },
  street:   { pos: [-16, 2.2, -6.8], look: [18, 1.8, -8.0] },
};

/**
 * Camera Easing & Preset Flight Controller
 */
function CameraController() {
  const { camera } = useThree();
  const controlsRef = useRef();
  const { activePreset, setActivePreset, autoRotate, setSelectedDevice } = useQualityStore();

  const targetPos = useRef(new THREE.Vector3(0, 18, -26));
  const targetLook = useRef(new THREE.Vector3(0, 4, 6));
  const isTransitioning = useRef(false);

  useEffect(() => {
    const p = PRESETS[activePreset] || PRESETS.overview;
    targetPos.current.set(...p.pos);
    targetLook.current.set(...p.look);
    isTransitioning.current = true;
  }, [activePreset]);

  // Keyboard navigation 1-6
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;
      if (e.key === '1') { setActivePreset('overview'); setSelectedDevice(null); }
      if (e.key === '2') { setActivePreset('bess'); setSelectedDevice('bess'); }
      if (e.key === '3') { setActivePreset('solar'); setSelectedDevice('solar'); }
      if (e.key === '4') { setActivePreset('house'); setSelectedDevice('house'); }
      if (e.key === '5') { setActivePreset('grid'); setSelectedDevice('grid'); }
      if (e.key === '6') { setActivePreset('street'); setSelectedDevice(null); }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setActivePreset, setSelectedDevice]);

  // Smooth camera flight interpolation in useFrame
  useFrame((_, delta) => {
    if (isTransitioning.current && controlsRef.current) {
      camera.position.lerp(targetPos.current, delta * 3.5);
      controlsRef.current.target.lerp(targetLook.current, delta * 3.5);
      controlsRef.current.update();

      if (
        camera.position.distanceTo(targetPos.current) < 0.15 &&
        controlsRef.current.target.distanceTo(targetLook.current) < 0.15
      ) {
        camera.position.copy(targetPos.current);
        controlsRef.current.target.copy(targetLook.current);
        isTransitioning.current = false;
      }
    }
  });

  return (
    <OrbitControls
      ref={controlsRef}
      enableDamping
      dampingFactor={0.06}
      maxPolarAngle={Math.PI / 2 - 0.04}
      minDistance={4}
      maxDistance={95}
      autoRotate={autoRotate}
      autoRotateSpeed={0.8}
    />
  );
}

/**
 * Scene Component - Orchestrator of the 3D Digital Twin Urban Microgrid
 */
export default function Scene({ stepData = {}, onSelectDevice }) {
  const {
    setFps,
    handlePerformanceDegrade,
    setActivePreset,
    setSelectedDevice,
    forceNightLights,
  } = useQualityStore();

  const handleDeviceClick = (deviceKey) => {
    setSelectedDevice(deviceKey);
    setActivePreset(deviceKey);
    if (onSelectDevice) onSelectDevice(deviceKey);
  };

  const rawHour = stepData.hour ?? 12;
  // If forceNightLights is active, celestial lighting reflects evening nightfall (20:30)
  const hour = forceNightLights ? 20.5 : rawHour;
  const isNight = rawHour < 6 || rawHour > 18.5 || forceNightLights;

  return (
    <>
      {/* Dynamic FPS Monitor & Auto-Quality Fallback */}
      <PerformanceMonitor
        onIncline={() => {}}
        onDecline={() => handlePerformanceDegrade()}
        onChange={({ fps }) => setFps(Math.round(fps))}
      />

      {/* OrbitControls & Camera Manager */}
      <CameraController />

      {/* 1. Celestial Lighting & Environment */}
      <Lighting hour={hour} />

      {/* 2. Terrain & Concrete Infrastructure */}
      <Terrain />

      {/* 3. Vegetation & Natural Landscape */}
      <Vegetation />

      {/* 4. Urban Road & Sidewalks */}
      <Road isNight={isNight} />

      {/* 5. Real-time Traffic Simulation */}
      <Traffic hour={hour} />

      {/* 6. Surrounding City Blocks & Skyline */}
      <CityBlocks hour={hour} />

      {/* 7. Smart House & EV Architecture (Front Façade facing road) */}
      <House
        hour={hour}
        pLoad={stepData.p_load_kw || 0}
        onSelect={handleDeviceClick}
      />

      {/* 8. 150 kWp Ground-Mounted Solar Farm (Right Flank) */}
      <SolarField
        pPv={stepData.p_pv_kw || 0}
        hour={hour}
        onSelect={handleDeviceClick}
      />

      {/* 9. 200 kWh BESS Megapack Container (Left Flank) */}
      <BESS
        socPct={stepData.soc_pct || 90}
        pBatt={stepData.p_batt_kw || 0}
        hour={hour}
        onSelect={handleDeviceClick}
      />

      {/* 10. EVN Substation & Steel Lattice Transmission Pylon */}
      <GridTower
        pBuy={stepData.p_buy_kw || 0}
        pSell={stepData.p_sell_kw || 0}
        hour={hour}
        onSelect={handleDeviceClick}
      />

      {/* 11. Microgrid Power Routing & Laser Conduits */}
      <EnergyFlow stepData={stepData} />

      {/* 12. 3D Floating Glassmorphism Telemetry Badges */}
      <FloatingBadges stepData={stepData} onSelectDevice={handleDeviceClick} />

      {/* 13. Post-processing Pipeline */}
      <PostFX />
    </>
  );
}
