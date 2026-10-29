import React, { useMemo } from 'react';
import { getAsphaltTexture, getConcreteTexture } from './textures';
import { useQualityStore } from '../../store/useQualityStore';

/**
 * Road Component - Urban Arterial 2-Lane Street Infrastructure
 * Features:
 * - 2-Lane Asphalt Roadway running along X-axis at Z = -8
 * - Yellow dashed centerline, solid white boundary lines, tire skid wear
 * - Pedestrian zebra crossing directly aligned with Smart House main entrance gate
 * - Storm water drainage grates & concrete curbs
 * - North & South pedestrian sidewalks with modern LED street lamps
 */
export default function Road({ isNight: isNightProp = false }) {
  const { forceNightLights } = useQualityStore();
  const isNight = isNightProp || forceNightLights;
  const asphaltTex = useMemo(() => {
    const t = getAsphaltTexture();
    t.repeat.set(6, 1);
    return t;
  }, []);

  const concreteTex = useMemo(() => {
    const t = getConcreteTexture();
    t.repeat.set(12, 1);
    return t;
  }, []);

  // Streetlamp post positions along the south and north sidewalks
  const lampPosts = [
    { x: -42, z: -3.5 },
    { x: -24, z: -3.5 },
    { x: -6,  z: -3.5 },
    { x: 12,  z: -3.5 },
    { x: 30,  z: -3.5 },
    { x: 48,  z: -3.5 },
    // North sidewalk lamps
    { x: -33, z: -12.5 },
    { x: -15, z: -12.5 },
    { x: 3,   z: -12.5 },
    { x: 21,  z: -12.5 },
    { x: 39,  z: -12.5 },
  ];

  return (
    <group name="UrbanRoadInfrastructure">
      {/* 1. Main Asphalt 2-Lane Road Surface */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.02, -8]}
        receiveShadow
      >
        <planeGeometry args={[130, 8.2]} />
        <meshStandardMaterial
          map={asphaltTex}
          roughness={0.7}
          metalness={0.12}
        />
      </mesh>

      {/* 2. Pedestrian Zebra Crossing (in front of House Gate at X = 0) */}
      <group position={[0, 0.025, -8]}>
        {[-3.0, -2.0, -1.0, 0.0, 1.0, 2.0, 3.0].map((zx, idx) => (
          <mesh
            key={idx}
            rotation={[-Math.PI / 2, 0, 0]}
            position={[0, 0, zx]}
            receiveShadow
          >
            <planeGeometry args={[4.2, 0.55]} />
            <meshStandardMaterial color="#FFFFFF" roughness={0.6} />
          </mesh>
        ))}
      </group>

      {/* 3. Storm Water Drainage Grates (near curbs) */}
      {[-20, 0, 20].map((gx, idx) => (
        <group key={idx}>
          {/* South curb grate */}
          <mesh position={[gx, 0.03, -4.1]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[1.2, 0.4]} />
            <meshStandardMaterial color="#1E293B" metalness={0.9} roughness={0.3} />
          </mesh>
          {/* North curb grate */}
          <mesh position={[gx, 0.03, -11.9]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[1.2, 0.4]} />
            <meshStandardMaterial color="#1E293B" metalness={0.9} roughness={0.3} />
          </mesh>
        </group>
      ))}

      {/* 4. Raised Concrete Curbs (Bó vỉa) */}
      {/* South Curb (Campus side) */}
      <mesh position={[0, 0.12, -3.95]} receiveShadow castShadow>
        <boxGeometry args={[130, 0.22, 0.3]} />
        <meshStandardMaterial color="#94A3B8" roughness={0.7} />
      </mesh>
      {/* North Curb (Opposite city side) */}
      <mesh position={[0, 0.12, -12.05]} receiveShadow castShadow>
        <boxGeometry args={[130, 0.22, 0.3]} />
        <meshStandardMaterial color="#94A3B8" roughness={0.7} />
      </mesh>

      {/* 5. Concrete Sidewalks (Vỉa hè) */}
      {/* South Sidewalk (in front of Campus: Z from -3.8 to -0.8) */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.14, -2.3]}
        receiveShadow
      >
        <planeGeometry args={[130, 3.0]} />
        <meshStandardMaterial
          map={concreteTex}
          roughness={0.65}
        />
      </mesh>

      {/* North Sidewalk (opposite side: Z from -12.2 to -15.2) */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.14, -13.7]}
        receiveShadow
      >
        <planeGeometry args={[130, 3.0]} />
        <meshStandardMaterial
          map={concreteTex}
          roughness={0.65}
        />
      </mesh>

      {/* 6. Modern LED Street Lamp Posts */}
      {lampPosts.map((lp, idx) => (
        <group key={idx} position={[lp.x, 0.14, lp.z]}>
          {/* Vertical Steel Pole */}
          <mesh position={[0, 3.2, 0]} castShadow>
            <cylinderGeometry args={[0.07, 0.1, 6.4, 8]} />
            <meshStandardMaterial color="#334155" metalness={0.9} roughness={0.25} />
          </mesh>
          {/* Curved Arm Overhanging the Road */}
          <mesh
            position={[0, 6.2, lp.z > -8 ? -0.8 : 0.8]}
            rotation={[lp.z > -8 ? -0.4 : 0.4, 0, 0]}
            castShadow
          >
            <cylinderGeometry args={[0.05, 0.05, 1.8, 8]} />
            <meshStandardMaterial color="#334155" metalness={0.9} />
          </mesh>
          {/* LED Fixture Head */}
          <mesh position={[0, 6.5, lp.z > -8 ? -1.5 : 1.5]} castShadow>
            <boxGeometry args={[0.3, 0.12, 0.6]} />
            <meshStandardMaterial color="#1E293B" metalness={0.8} />
          </mesh>
          {/* Emissive LED Lens */}
          <mesh position={[0, 6.43, lp.z > -8 ? -1.5 : 1.5]}>
            <planeGeometry args={[0.26, 0.52]} />
            <meshBasicMaterial color={isNight ? '#FEF08A' : '#E2E8F0'} />
          </mesh>
        </group>
      ))}

      {/* 7. Sidewalk Trees in Planter Wells (Neatly spaced, replacing random clutter) */}
      {[-38, -20, 16, 34].map((tx, idx) => (
        <group key={idx} position={[tx, 0.15, -2.4]}>
          {/* Square Granite Tree Well Curb */}
          <mesh rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.65, 0.85, 4]} />
            <meshStandardMaterial color="#475569" roughness={0.8} />
          </mesh>
          {/* Tree Trunk */}
          <mesh position={[0, 1.6, 0]} castShadow>
            <cylinderGeometry args={[0.12, 0.18, 3.2, 8]} />
            <meshStandardMaterial color="#4A3525" roughness={0.9} />
          </mesh>
          {/* Trimmed Canopy */}
          <mesh position={[0, 3.8, 0]} castShadow>
            <dodecahedronGeometry args={[1.5, 1]} />
            <meshStandardMaterial color="#2E5A27" roughness={0.8} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

