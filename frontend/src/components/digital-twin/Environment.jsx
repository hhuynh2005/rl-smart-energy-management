import React, { useRef, useMemo } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { Sky } from '@react-three/drei';
import { useQualityStore } from '../../store/useQualityStore';

/**
 * Environment Component
 * Implements photorealistic 24-hour celestial cycle:
 * - Dynamic Sun & Moon movement matching the 00:00-24:00 time scrubber
 * - Tone-shifted directional light (Dawn orange, Midday white, Sunset gold, Night blue)
 * - Soft PCF shadow map (up to 4096px)
 * - Night streetlights, building window emissive glow, and twinkling night sky stars
 */
export default function EnvironmentComponent({ hour = 12, isNight = false }) {
  const { quality, getConfig } = useQualityStore();
  const config = getConfig();

  const sunLightRef = useRef();
  const moonLightRef = useRef();
  const hemiLightRef = useRef();
  const cloudsRef = useRef();
  const starsRef = useRef();

  // Compute sun and moon celestial positions based on hour [0..24]
  const celestialData = useMemo(() => {
    // Sun rises at 06:00, peaks at 12:00, sets at 18:00
    const sunAngle = ((hour - 6) / 12) * Math.PI;
    const isSunUp = hour >= 5.5 && hour <= 18.5;

    // Radius of celestial dome
    const r = 80;
    const sunX = Math.cos(sunAngle) * r;
    const sunY = Math.max(-10, Math.sin(sunAngle) * r);
    const sunZ = -30 + Math.sin(sunAngle) * 15;

    // Moon is opposite to the sun
    const moonAngle = sunAngle + Math.PI;
    const moonX = Math.cos(moonAngle) * r;
    const moonY = Math.max(-5, Math.sin(moonAngle) * r);
    const moonZ = 30;

    // Color and intensity grading
    let sunColor = '#FFF5EB';
    let sunIntensity = 2.4;
    let skyTurbidity = 8;
    let skyRayleigh = 1.2;

    if (hour >= 5.0 && hour < 7.0) {
      // Dawn / Sunrise
      const t = (hour - 5.0) / 2.0;
      sunColor = '#FFA050';
      sunIntensity = 1.2 + t * 1.0;
      skyTurbidity = 12;
      skyRayleigh = 3.5;
    } else if (hour >= 7.0 && hour <= 16.5) {
      // Full Day
      sunColor = '#FFF9F0';
      sunIntensity = 2.8;
      skyTurbidity = 7;
      skyRayleigh = 0.8;
    } else if (hour > 16.5 && hour <= 18.5) {
      // Sunset / Golden Hour
      const t = (18.5 - hour) / 2.0;
      sunColor = '#FF5E36';
      sunIntensity = 1.0 + t * 1.2;
      skyTurbidity = 14;
      skyRayleigh = 4.0;
    } else {
      // Night
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
      ambientIntensity: isSunUp ? 0.45 : 0.15,
    };
  }, [hour, config.shadows]);

  // Gentle drifting clouds animation
  useFrame((_, delta) => {
    if (cloudsRef.current) {
      cloudsRef.current.rotation.y += delta * 0.008;
    }
    if (starsRef.current) {
      // Subtle twinkle
      starsRef.current.rotation.y += delta * 0.002;
    }
  });

  // Generate procedural star field positions for night
  const starPositions = useMemo(() => {
    const coords = [];
    for (let i = 0; i < 400; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(Math.random() * 0.85 + 0.15); // Upper hemisphere
      const dist = 95;
      coords.push(
        dist * Math.sin(phi) * Math.cos(theta),
        dist * Math.cos(phi),
        dist * Math.sin(phi) * Math.sin(theta)
      );
    }
    return new Float32Array(coords);
  }, []);

  return (
    <group name="EnvironmentCycle">
      {/* 1. Atmospheric Sky Dome */}
      <Sky
        distance={450000}
        sunPosition={celestialData.sunPos}
        turbidity={celestialData.skyTurbidity}
        rayleigh={celestialData.skyRayleigh}
        mieCoefficient={0.005}
        mieDirectionalG={0.8}
      />

      {/* 2. Hemisphere ambient fill (Sky warm tone / Ground green bounce) */}
      <hemisphereLight
        ref={hemiLightRef}
        args={[
          celestialData.isSunUp ? '#E0F2FE' : '#1E1B4B',
          celestialData.isSunUp ? '#2D4A22' : '#0B0F19',
          celestialData.ambientIntensity,
        ]}
      />

      {/* 3. Main Directional Sun Light with High-Resolution Soft Shadows */}
      <directionalLight
        ref={sunLightRef}
        position={celestialData.sunPos}
        intensity={celestialData.sunIntensity}
        color={celestialData.sunColor}
        castShadow={config.shadows && celestialData.isSunUp}
        shadow-mapSize-width={config.shadowMapSize}
        shadow-mapSize-height={config.shadowMapSize}
        shadow-camera-near={5}
        shadow-camera-far={180}
        shadow-camera-left={-45}
        shadow-camera-right={45}
        shadow-camera-top={45}
        shadow-camera-bottom={-45}
        shadow-bias={-0.0003}
        shadow-normalBias={0.02}
      />

      {/* Visual Sun Orb */}
      {celestialData.isSunUp && (
        <mesh position={celestialData.sunPos}>
          <sphereGeometry args={[3.2, 16, 16]} />
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
        shadow-camera-far={160}
        shadow-camera-left={-35}
        shadow-camera-right={35}
        shadow-camera-top={35}
        shadow-camera-bottom={-35}
      />

      {/* Visual Moon Orb */}
      {!celestialData.isSunUp && (
        <mesh position={celestialData.moonPos}>
          <sphereGeometry args={[2.2, 16, 16]} />
          <meshStandardMaterial
            color="#E0E7FF"
            emissive="#A5B4FC"
            emissiveIntensity={0.8}
            roughness={0.9}
          />
        </mesh>
      )}

      {/* 5. Drifting Clouds Layer */}
      <group ref={cloudsRef} position={[0, 45, 0]}>
        {[
          [-35, 0, -25, 14],
          [20, 2, -40, 18],
          [45, -1, 15, 16],
          [-15, 3, 35, 20],
        ].map(([cx, cy, cz, csize], i) => (
          <mesh key={i} position={[cx, cy, cz]}>
            <sphereGeometry args={[csize, 16, 12]} />
            <meshStandardMaterial
              color={celestialData.isSunUp ? '#FFFFFF' : '#334155'}
              roughness={0.95}
              metalness={0.0}
              transparent
              opacity={celestialData.isSunUp ? 0.45 : 0.25}
            />
          </mesh>
        ))}
      </group>

      {/* 6. Night Twinkling Stars */}
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
            size={1.4}
            color="#FFFFFF"
            transparent
            opacity={0.85}
            sizeAttenuation
          />
        </points>
      )}

      {/* 7. Night Campus Street Lamps (Points of Light) */}
      {!celestialData.isSunUp && (
        <group name="StreetLampsNight">
          {[
            [-18, 5.5, -4],
            [-6, 5.5, -4],
            [8, 5.5, -4],
            [22, 5.5, -4],
            [16, 4.5, 10],
          ].map(([lx, ly, lz], idx) => (
            <group key={idx} position={[lx, ly, lz]}>
              <pointLight
                color="#FDE047"
                intensity={quality === 'low' ? 0.8 : 1.6}
                distance={18}
                decay={2}
              />
              <mesh position={[0, 0, 0]}>
                <sphereGeometry args={[0.2, 8, 8]} />
                <meshBasicMaterial color="#FEF08A" />
              </mesh>
            </group>
          ))}
        </group>
      )}
    </group>
  );
}

