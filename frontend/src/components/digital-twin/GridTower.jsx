import React, { useMemo } from 'react';
import * as THREE from 'three';
import { useQualityStore } from '../../store/useQualityStore';

/**
 * GridTower Component - 22kV Distribution Substation & Steel Lattice Pylon
 * Features:
 * - Galvanized steel lattice transmission pylon with crossarms
 * - High-voltage porcelain bell insulator strings
 * - Catenary sagging overhead distribution lines
 * - Ground step-down transformer (22kV / 0.4kV) with cooling radiator fins
 * - Substation safety perimeter fence
 * - Aviation Red Beacon at Pylon apex and Substation Floodlights at night
 */
export default function GridTower({ pBuy = 0, pSell = 0, hour = 12, onSelect }) {
  const {
    hoveredDevice,
    setHoveredDevice,
    selectedDevice,
    setSelectedDevice,
    quality,
    forceNightLights,
  } = useQualityStore();

  const isNight = (hour < 6 || hour > 18.5) || forceNightLights;
  const isHovered = hoveredDevice === 'grid';
  const isSelected = selectedDevice === 'grid';

  const isBuying = pBuy > 0.1;
  const isSelling = pSell > 0.1;
  const isActive = isBuying || isSelling;

  // Catenary sagging overhead wire curves
  const wireCurves = useMemo(() => {
    const p1 = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-1.8, 12.8, 0),
      new THREE.Vector3(-1.2, 8.5, 4),
      new THREE.Vector3(-0.6, 3.2, 8),
    ]);
    const p2 = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 14.2, 0),
      new THREE.Vector3(0, 9.2, 4),
      new THREE.Vector3(0, 3.2, 8),
    ]);
    const p3 = new THREE.CatmullRomCurve3([
      new THREE.Vector3(1.8, 12.8, 0),
      new THREE.Vector3(1.2, 8.5, 4),
      new THREE.Vector3(0.6, 3.2, 8),
    ]);
    return [p1, p2, p3];
  }, []);

  return (
    <group
      name="EVNSubstationTower"
      position={[-28, 0, -2]}
      onPointerOver={(e) => {
        e.stopPropagation();
        setHoveredDevice('grid');
      }}
      onPointerOut={(e) => {
        e.stopPropagation();
        setHoveredDevice(null);
      }}
      onClick={(e) => {
        e.stopPropagation();
        setSelectedDevice('grid');
        if (onSelect) onSelect('grid');
      }}
    >
      {/* 1. Galvanized Steel Lattice Transmission Pylon */}
      <group position={[0, 0, 0]}>
        {/* 4 Corner Slanted Main Steel Legs */}
        {[
          [-1.4, -1.4, 0.4, 0.4],
          [1.4, -1.4, -0.4, 0.4],
          [-1.4, 1.4, 0.4, -0.4],
          [1.4, 1.4, -0.4, -0.4],
        ].map(([bx, bz, tx, tz], i) => {
          const start = new THREE.Vector3(bx, 0, bz);
          const end = new THREE.Vector3(tx, 14.5, tz);
          const mid = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
          const len = start.distanceTo(end);
          return (
            <mesh key={i} position={mid} castShadow>
              <cylinderGeometry args={[0.07, 0.1, len, 6]} />
              <meshStandardMaterial color="#94A3B8" metalness={0.9} roughness={0.25} />
            </mesh>
          );
        })}

        {/* Horizontal Steel Bracing Tiers */}
        {[3.5, 7.0, 10.5, 13.0].map((by, bi) => {
          const scale = 1 - (by / 15) * 0.7;
          return (
            <group key={bi} position={[0, by, 0]}>
              <mesh castShadow>
                <boxGeometry args={[2.8 * scale, 0.08, 0.08]} />
                <meshStandardMaterial color="#64748B" metalness={0.85} />
              </mesh>
              <mesh castShadow>
                <boxGeometry args={[0.08, 0.08, 2.8 * scale]} />
                <meshStandardMaterial color="#64748B" metalness={0.85} />
              </mesh>
            </group>
          );
        })}

        {/* Lower Crossarm */}
        <mesh position={[0, 12.8, 0]} castShadow>
          <boxGeometry args={[4.8, 0.16, 0.2]} />
          <meshStandardMaterial color="#94A3B8" metalness={0.9} />
        </mesh>
        {/* Upper Crossarm */}
        <mesh position={[0, 14.2, 0]} castShadow>
          <boxGeometry args={[3.2, 0.16, 0.2]} />
          <meshStandardMaterial color="#94A3B8" metalness={0.9} />
        </mesh>

        {/* Top Pylon Aviation Warning Beacon (Sáng đỏ rực rỡ ban đêm) */}
        <group position={[0, 15.0, 0]}>
          <mesh>
            <cylinderGeometry args={[0.05, 0.08, 0.6, 8]} />
            <meshStandardMaterial color="#334155" />
          </mesh>
          <mesh position={[0, 0.35, 0]}>
            <sphereGeometry args={[0.15, 12, 12]} />
            <meshBasicMaterial color={isNight ? '#EF4444' : '#64748B'} />
          </mesh>
        </group>

        {/* Porcelain Bell Insulator Strings */}
        {[-1.8, 0, 1.8].map((ix, ii) => (
          <group key={ii} position={[ix, 12.6, 0]}>
            {[0, -0.2, -0.4, -0.6].map((iy, j) => (
              <mesh key={j} position={[0, iy, 0]} castShadow>
                <cylinderGeometry args={[0.12, 0.08, 0.14, 10]} />
                <meshPhysicalMaterial
                  color="#E0E7FF"
                  roughness={0.1}
                  metalness={0.1}
                  clearcoat={1.0}
                />
              </mesh>
            ))}
          </group>
        ))}
      </group>

      {/* 2. Catenary Sagging Overhead Lines */}
      {wireCurves.map((curve, idx) => (
        <mesh key={idx} castShadow>
          <tubeGeometry args={[curve, 24, 0.025, 8, false]} />
          <meshStandardMaterial color="#1E293B" metalness={0.9} roughness={0.3} />
        </mesh>
      ))}

      {/* 3. Ground Distribution Transformer & Radiators */}
      <group position={[0, 0, 8]}>
        <mesh position={[0, 0.2, 0]} castShadow receiveShadow>
          <boxGeometry args={[2.8, 0.4, 2.8]} />
          <meshStandardMaterial color="#94A3B8" roughness={0.7} />
        </mesh>

        {/* Transformer Tank */}
        <mesh position={[0, 1.3, 0]} castShadow receiveShadow>
          <boxGeometry args={[1.8, 1.8, 1.8]} />
          <meshStandardMaterial color="#475569" metalness={0.8} roughness={0.35} />
        </mesh>

        {/* Cooling Radiator Fins */}
        {[-1.0, 1.0].map((rx, ri) => (
          <group key={ri} position={[rx, 1.3, 0]}>
            {[-0.6, -0.3, 0, 0.3, 0.6].map((fz, fi) => (
              <mesh key={fi} position={[0, 0, fz]} castShadow>
                <boxGeometry args={[0.15, 1.4, 0.05]} />
                <meshStandardMaterial color="#334155" metalness={0.85} />
              </mesh>
            ))}
          </group>
        ))}

        {/* Overhead Conservator Oil Drum */}
        <mesh position={[0, 2.4, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[0.3, 0.3, 1.5, 16]} />
          <meshStandardMaterial color="#475569" metalness={0.85} />
        </mesh>

        {/* High Voltage Bushings */}
        {[-0.5, 0, 0.5].map((bx, bi) => (
          <mesh key={bi} position={[bx, 2.45, 0.5]} castShadow>
            <cylinderGeometry args={[0.06, 0.08, 0.6, 8]} />
            <meshPhysicalMaterial color="#C7D2FE" clearcoat={1.0} />
          </mesh>
        ))}

        {/* Ground Active Luminous Pulse Ring */}
        {isActive && (
          <mesh position={[0, 0.08, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[1.6, 2.1, 24]} />
            <meshBasicMaterial
              color={isBuying ? '#8B5CF6' : '#10B981'}
              transparent
              opacity={0.7}
            />
          </mesh>
        )}
      </group>

      {/* 4. Substation Perimeter Safety Fence & Night Floodlighting */}
      <group position={[0, 1.0, 4]}>
        {[[-3.8, -7], [3.8, -7], [-3.8, 6.5], [3.8, 6.5]].map(([fx, fz], fi) => (
          <group key={fi} position={[fx, 0, fz]}>
            <mesh castShadow>
              <cylinderGeometry args={[0.06, 0.06, 2.2, 8]} />
              <meshStandardMaterial color="#475569" metalness={0.9} />
            </mesh>
            {/* Corner Security Floodlight (Ban đêm) */}
            {isNight && (
              <mesh position={[0, 1.15, 0]}>
                <sphereGeometry args={[0.12, 10, 10]} />
                <meshBasicMaterial color="#FEF08A" />
              </mesh>
            )}
          </group>
        ))}
      </group>

      {/* Dedicated Substation Illumination Point Light (Ban đêm) */}
      {isNight && (
        <pointLight
          position={[0, 4.2, 7.5]}
          color="#FEF08A"
          intensity={quality === 'low' ? 0.9 : 1.8}
          distance={18}
          decay={2}
        />
      )}

      {/* 5. Highlight Outline on Hover / Selected */}
      {(isHovered || isSelected) && (
        <mesh position={[0, 7.5, 4]}>
          <boxGeometry args={[8.5, 15.5, 15.0]} />
          <meshBasicMaterial
            color="#8B5CF6"
            wireframe
            transparent
            opacity={isSelected ? 0.65 : 0.35}
          />
        </mesh>
      )}
    </group>
  );
}
