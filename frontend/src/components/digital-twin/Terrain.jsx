import React, { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { getGrassTexture, getConcreteTexture, getWaterRippleTexture } from './textures';
import { useQualityStore } from '../../store/useQualityStore';

/**
 * Terrain Component
 * Features:
 * - Broad undulating grass terrain with distant perimeter rolling hills
 * - Asphalt 2-lane service access road with markings and curbs
 * - Concrete industrial equipment pads (House, BESS, Inverter, Substation)
 * - Shimmering campus water retention pond with reflective ripples
 */
export default function Terrain() {
  const waterMatRef = useRef();

  // Load procedural PBR textures
  const grassTex = useMemo(() => {
    const t = getGrassTexture();
    t.repeat.set(16, 16);
    return t;
  }, []);

  const concreteTex = useMemo(() => {
    const t = getConcreteTexture();
    t.repeat.set(2, 2);
    return t;
  }, []);

  const waterNormal = useMemo(() => {
    const t = getWaterRippleTexture();
    t.repeat.set(6, 6);
    return t;
  }, []);

  // Water ripple animation
  useFrame((_, delta) => {
    if (waterMatRef.current && waterMatRef.current.normalMap) {
      waterMatRef.current.normalMap.offset.x += delta * 0.03;
      waterMatRef.current.normalMap.offset.y += delta * 0.02;
    }
  });

  return (
    <group name="CampusTerrain">
      {/* 1. Main Ground Landscape */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -0.05, 0]}
        receiveShadow
      >
        <planeGeometry args={[140, 140, 32, 32]} />
        <meshStandardMaterial
          map={grassTex}
          roughness={0.88}
          metalness={0.05}
        />
      </mesh>

      {/* 2. Concrete Foundation Equipment Slabs */}
      {/* House Foundation Pad */}
      <mesh position={[0, 0.12, 9.5]} receiveShadow castShadow>
        <boxGeometry args={[16.5, 0.24, 11]} />
        <meshStandardMaterial map={concreteTex} roughness={0.65} />
      </mesh>

      {/* BESS Megapack Pad */}
      <mesh position={[-18, 0.12, 8]} receiveShadow castShadow>
        <boxGeometry args={[10, 0.24, 8]} />
        <meshStandardMaterial map={concreteTex} roughness={0.6} />
      </mesh>

      {/* Solar Field Gravel Bed */}
      <mesh position={[18, 0.06, 8]} receiveShadow>
        <boxGeometry args={[17, 0.12, 14]} />
        <meshStandardMaterial color="#475569" roughness={0.9} />
      </mesh>

      {/* Substation & Grid Tower Pad */}
      <mesh position={[-28, 0.12, 2]} receiveShadow castShadow>
        <boxGeometry args={[11, 0.24, 11]} />
        <meshStandardMaterial map={concreteTex} roughness={0.6} />
      </mesh>

      {/* 4. Shimmering Water Retention Pond (Garden corner) */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[38, 0.04, 16]}
        receiveShadow
      >
        <circleGeometry args={[8, 32]} />
        <meshStandardMaterial
          ref={waterMatRef}
          color="#1E3A8A"
          roughness={0.12}
          metalness={0.85}
          normalMap={waterNormal}
          normalScale={new THREE.Vector2(0.4, 0.4)}
          transparent
          opacity={0.88}
        />
      </mesh>
      {/* Pond Stone Border */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[38, 0.05, 16]}
      >
        <ringGeometry args={[7.8, 8.4, 32]} />
        <meshStandardMaterial color="#64748B" roughness={0.85} />
      </mesh>

      {/* 5. Interconnecting Walkways */}
      <mesh position={[-9.5, 0.06, 8]} receiveShadow>
        <boxGeometry args={[5, 0.08, 2.4]} />
        <meshStandardMaterial color="#CBD5E1" roughness={0.7} />
      </mesh>
      <mesh position={[9.5, 0.06, 8]} receiveShadow>
        <boxGeometry args={[4, 0.08, 2.4]} />
        <meshStandardMaterial color="#CBD5E1" roughness={0.7} />
      </mesh>
    </group>
  );
}
