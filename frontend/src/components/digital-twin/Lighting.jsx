import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Sky } from '@react-three/drei';
import { useQualityStore } from '../../store/useQualityStore';

/**
 * Lighting Component - Dynamic 24-hour Celestial Arc & Atmospheric Illumination
 * - Physically calibrated sun and moon directional light
 * - Color temperature shift matching time of day:
 *   + Dawn (05:00-07:00): Warm amber 3000K, long dramatic shadows
 *   + Midday (11:00-13:00): Crisp white 6000K, high altitude (65° elevation)
 *   + Sunset (17:00-19:00): Deep golden-red 2500K
 *   + Night (19:00-05:00): Cool moonlight 8000K
 * - High-resolution soft shadow maps (PCFSoftShadowMap)
 * - Streetlamps, architectural facade lights, and building window emissive glow
 */
export default function Lighting({ hour = 12 }) {
  const { quality, getConfig } = useQualityStore();
  const config = getConfig();

  const sunLightRef = useRef();
  const moonLightRef = useRef();
  const hemiLightRef = useRef();
  const starsRef = useRef();

  // Compute sun and moon coordinates based on hour [0..24]
  const celestialData = useMemo(() => {
    // Sun rises at 06:00, peaks at 12:00, sets at 18:00
    const sunAngle = ((hour - 6) / 12) * Math.PI;
    const isSunUp = hour >= 5.5 && hour <= 18.5;

    // Radius of celestial orbit
    const r = 90;
    const sunX = Math.cos(sunAngle) * r;
    const sunY = Math.max(-12, Math.sin(sunAngle) * r);
    const sunZ = -25 + Math.sin(sunAngle) * 20;

    // Moon is opposite to the sun
    const moonAngle = sunAngle + Math.PI;
    const moonX = Math.cos(moonAngle) * r;
    const moonY = Math.max(-8, Math.sin(moonAngle) * r);
    const moonZ = 25;

    let sunColor = '#FFF5EB';
    let sunIntensity = 2.6;
    let skyTurbidity = 7;
    let skyRayleigh = 1.0;

    if (hour >= 5.0 && hour < 7.0) {
      // Dawn / Sunrise
      const t = (hour - 5.0) / 2.0;
      sunColor = '#FFA050';
      sunIntensity = 1.2 + t * 1.1;
      skyTurbidity = 12;
      skyRayleigh = 3.5;
    } else if (hour >= 7.0 && hour <= 16.5) {
      // Midday Crisp White
      sunColor = '#FFFDF5';
      sunIntensity = 2.8;
      skyTurbidity = 6;
      skyRayleigh = 0.8;
    } else if (hour > 16.5 && hour <= 18.5) {
      // Golden Hour / Sunset
      const t = (18.5 - hour) / 2.0;
      sunColor = '#FF5E36';
      sunIntensity = 1.0 + t * 1.3;
      skyTurbidity = 14;
      skyRayleigh = 4.2;
    } else {
      // Night time
      sunIntensity = 0.0;
    }

    const moonIntensity = isSunUp ? 0.0 : 0.35;

    return {
      sunPos: [sunX, Math.max(1, sunY), sunZ],
      moonPos: [moonX, Math.max(2, moonY), moonZ],
      sunColor,
      sunIntensity: config.shadows ? sunIntensity : sunIntensity * 0.8,
      moonIntensity,
      isSunUp,
      skyTurbidity,
      skyRayleigh,
      ambientIntensity: isSunUp ? 0.5 : 0.16,
    };
  }, [hour, config.shadows]);

  // Subtle twinkle for night starfield
  useFrame((_, delta) => {
    if (starsRef.current) {
      starsRef.current.rotation.y += delta * 0.002;
    }
  });

  // Procedural starfield
  const starPositions = useMemo(() => {
    const coords = [];
    for (let i = 0; i < 450; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(Math.random() * 0.85 + 0.15);
      const dist = 110;
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
      {/* 1. Atmospheric Sky Dome */}
      <Sky
        distance={450000}
        sunPosition={celestialData.sunPos}
        turbidity={celestialData.skyTurbidity}
        rayleigh={celestialData.skyRayleigh}
        mieCoefficient={0.005}
        mieDirectionalG={0.8}
      />

      {/* 2. Hemisphere Light (Sky cool tone / Ground warm reflection) */}
      <hemisphereLight
        ref={hemiLightRef}
        args={[
          celestialData.isSunUp ? '#E0F2FE' : '#1E1B4B',
          celestialData.isSunUp ? '#374151' : '#0B0F19',
          celestialData.ambientIntensity,
        ]}
      />

      {/* 3. Main Directional Sun Light with Soft Shadows */}
      <directionalLight
        ref={sunLightRef}
        position={celestialData.sunPos}
        intensity={celestialData.sunIntensity}
        color={celestialData.sunColor}
        castShadow={config.shadows && celestialData.isSunUp}
        shadow-mapSize-width={config.shadowMapSize}
        shadow-mapSize-height={config.shadowMapSize}
        shadow-camera-near={5}
        shadow-camera-far={220}
        shadow-camera-left={-55}
        shadow-camera-right={55}
        shadow-camera-top={55}
        shadow-camera-bottom={-55}
        shadow-bias={-0.0003}
        shadow-normalBias={0.02}
      />

      {/* Visual Sun Orb */}
      {celestialData.isSunUp && (
        <mesh position={celestialData.sunPos}>
          <sphereGeometry args={[3.5, 16, 16]} />
          <meshBasicMaterial color={celestialData.sunColor} />
        </mesh>
      )}

      {/* 4. Directional Moon Light during Night */}
      <directionalLight
        ref={moonLightRef}
        position={celestialData.moonPos}
        intensity={celestialData.moonIntensity}
        color="#818CF8"
        castShadow={config.shadows && !celestialData.isSunUp && quality !== 'low'}
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-near={10}
        shadow-camera-far={200}
        shadow-camera-left={-45}
        shadow-camera-right={45}
        shadow-camera-top={45}
        shadow-camera-bottom={-45}
      />

      {/* Visual Moon Orb */}
      {!celestialData.isSunUp && (
        <mesh position={celestialData.moonPos}>
          <sphereGeometry args={[2.5, 16, 16]} />
          <meshStandardMaterial
            color="#E0E7FF"
            emissive="#A5B4FC"
            emissiveIntensity={0.8}
            roughness={0.9}
          />
        </mesh>
      )}

      {/* 5. Night Starfield */}
      {!celestialData.isSunUp && (
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
            size={1.5}
            color="#FFFFFF"
            transparent
            opacity={0.85}
            sizeAttenuation
          />
        </points>
      )}

      {/* 6. Night Streetlamp & Building Facade Illuminators */}
      {!celestialData.isSunUp && (
        <group name="StreetNightLighting">
          {[-40, -24, -8, 8, 24, 40].map((lx, idx) => (
            <group key={idx} position={[lx, 6.2, -8]}>
              <pointLight
                color="#FEF08A"
                intensity={quality === 'low' ? 0.9 : 1.8}
                distance={18}
                decay={2}
              />
            </group>
          ))}

          {/* Building Facade Warm Point Lights */}
          <pointLight
            position={[0, 4.5, 3.5]}
            color="#FEF08A"
            intensity={quality === 'low' ? 0.8 : 1.6}
            distance={16}
            decay={2}
          />
          <pointLight
            position={[-14, 4.5, -18]}
            color="#38BDF8"
            intensity={quality === 'low' ? 0.8 : 1.5}
            distance={18}
            decay={2}
          />
        </group>
      )}
    </group>
  );
}

