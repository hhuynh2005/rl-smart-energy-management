import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Sky } from '@react-three/drei';
import { useQualityStore } from '../../store/useQualityStore';

/**
 * Deterministic pseudo-random helper in [0, 1) to keep render pure for React Compiler / Oxlint
 */
function seededUnit(seed) {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * Lighting Component - Continuous 24-hour Celestial Arc calibrated for the TLU Campus
 * Smoothly transitions from bright daylight (matching video template) through sunset to night.
 */
export default function Lighting({ hour = 12 }) {
  const { quality, getConfig } = useQualityStore();
  const config = getConfig();

  const sunLightRef = useRef();
  const moonLightRef = useRef();
  const starsRef = useRef();

  const celestialData = useMemo(() => {
    const sunAngle = ((hour - 6) / 12) * Math.PI;
    const isSunUp = hour >= 5.5 && hour <= 18.5;

    const r = 140;
    const sunX = Math.cos(sunAngle) * r;
    const sunY = Math.max(-18, Math.sin(sunAngle) * r);
    const sunZ = -30 + Math.sin(sunAngle) * 35;

    const moonAngle = sunAngle + Math.PI;
    const moonX = Math.cos(moonAngle) * r;
    const moonY = Math.max(-12, Math.sin(moonAngle) * r);
    const moonZ = 35;

    let sunColor = '#FFFDF5';
    let sunIntensity = 2.7;
    let skyTurbidity = 4.5;
    let skyRayleigh = 0.65;
    let ambientIntensity = 0.72;
    let skyBg = '#93C5FD';

    if (hour >= 5.2 && hour < 7.2) {
      const t = (hour - 5.2) / 2.0;
      sunColor = '#FFB067';
      sunIntensity = 1.1 + t * 1.4;
      skyTurbidity = 11 - t * 5;
      skyRayleigh = 3.2 - t * 2.0;
      ambientIntensity = 0.36 + t * 0.34;
      skyBg = t > 0.5 ? '#BAE6FD' : '#475569';
    } else if (hour >= 7.2 && hour <= 16.5) {
      sunColor = '#FFFDF7';
      sunIntensity = 2.75;
      skyTurbidity = 4.0;
      skyRayleigh = 0.6;
      ambientIntensity = 0.78;
      skyBg = '#BAE6FD';
    } else if (hour > 16.5 && hour <= 18.7) {
      const t = (18.7 - hour) / 2.2;
      sunColor = '#FF7043';
      sunIntensity = 0.7 + t * 1.8;
      skyTurbidity = 13 - t * 6;
      skyRayleigh = 4.0 - t * 2.5;
      ambientIntensity = 0.25 + t * 0.45;
      skyBg = t > 0.45 ? '#94A3B8' : '#1E293B';
    } else {
      sunIntensity = 0.0;
      ambientIntensity = 0.22;
      skyBg = '#0F172A';
    }

    const moonIntensity = isSunUp ? 0.0 : 0.48;

    return {
      sunPos: [sunX, Math.max(2, sunY), sunZ],
      moonPos: [moonX, Math.max(4, moonY), moonZ],
      sunColor,
      sunIntensity: config.shadows ? sunIntensity : sunIntensity * 0.85,
      moonIntensity,
      isSunUp,
      skyTurbidity,
      skyRayleigh,
      ambientIntensity,
      skyBg,
    };
  }, [hour, config.shadows]);

  useFrame((_, delta) => {
    if (starsRef.current) {
      starsRef.current.rotation.y += delta * 0.0015;
    }
  });

  const starPositions = useMemo(() => {
    const coords = [];
    for (let i = 0; i < 420; i++) {
      const theta = seededUnit(i * 3 + 1) * Math.PI * 2;
      const phi = Math.acos(seededUnit(i * 3 + 2) * 0.85 + 0.15);
      const dist = 210;
      coords.push(
        dist * Math.sin(phi) * Math.cos(theta),
        dist * Math.cos(phi),
        dist * Math.sin(phi) * Math.sin(theta)
      );
    }
    return new Float32Array(coords);
  }, []);

  return (
    <group name="LightingRig">
      <color attach="background" args={[celestialData.skyBg]} />

      {celestialData.isSunUp && (
        <Sky
          distance={450000}
          sunPosition={celestialData.sunPos}
          turbidity={celestialData.skyTurbidity}
          rayleigh={celestialData.skyRayleigh}
          mieCoefficient={0.005}
          mieDirectionalG={0.8}
        />
      )}

      <hemisphereLight
        args={[
          celestialData.isSunUp ? '#F0F9FF' : '#312E81',
          celestialData.isSunUp ? '#64748B' : '#0F172A',
          celestialData.ambientIntensity,
        ]}
      />

      <directionalLight
        ref={sunLightRef}
        position={celestialData.sunPos}
        intensity={celestialData.sunIntensity}
        color={celestialData.sunColor}
        castShadow={config.shadows && celestialData.isSunUp}
        shadow-mapSize-width={config.shadowMapSize}
        shadow-mapSize-height={config.shadowMapSize}
        shadow-camera-near={10}
        shadow-camera-far={360}
        shadow-camera-left={-130}
        shadow-camera-right={130}
        shadow-camera-top={110}
        shadow-camera-bottom={-110}
        shadow-bias={-0.0004}
        shadow-normalBias={0.03}
      />

      {celestialData.isSunUp && (
        <mesh position={celestialData.sunPos}>
          <sphereGeometry args={[4.5, 16, 16]} />
          <meshBasicMaterial color={celestialData.sunColor} />
        </mesh>
      )}

      <directionalLight
        ref={moonLightRef}
        position={celestialData.moonPos}
        intensity={celestialData.moonIntensity}
        color="#93C5FD"
        castShadow={config.shadows && !celestialData.isSunUp && quality !== 'low'}
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-near={10}
        shadow-camera-far={320}
        shadow-camera-left={-110}
        shadow-camera-right={110}
        shadow-camera-top={90}
        shadow-camera-bottom={-90}
      />

      {!celestialData.isSunUp && (
        <>
          <mesh position={celestialData.moonPos}>
            <sphereGeometry args={[3.2, 16, 16]} />
            <meshStandardMaterial
              color="#E0E7FF"
              emissive="#A5B4FC"
              emissiveIntensity={0.85}
              roughness={0.9}
            />
          </mesh>

          <points ref={starsRef}>
            <bufferGeometry>
              <bufferAttribute
                attach="attributes-position"
                count={starPositions.length / 3}
                array={starPositions}
                itemSize={3}
              />
            </bufferGeometry>
            <pointsMaterial
              size={1.8}
              color="#FFFFFF"
              transparent
              opacity={0.85}
              sizeAttenuation
            />
          </points>
        </>
      )}
    </group>
  );
}
