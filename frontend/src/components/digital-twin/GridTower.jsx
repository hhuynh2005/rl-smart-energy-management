import React, { useMemo } from 'react';
import * as THREE from 'three';
import { MICROGRID_NODES } from './campusLayout';
import { useQualityStore } from '../../store/useQualityStore';

/**
 * GridTower Component - EVN 22kV Distribution Substation & Steel Lattice Pylon
 */
export default function GridTower({ pBuy = 0, pSell = 0, hour = 12, onSelectEntity }) {
  const {
    hoveredEntity,
    setHoveredEntity,
    selectedEntity,
    setSelectedEntity,
    quality,
    forceNightLights,
  } = useQualityStore();

  const isNight = hour < 6 || hour > 18.2 || forceNightLights;
  const isHovered = hoveredEntity?.type === 'device' && hoveredEntity?.id === 'grid';
  const isSelected = selectedEntity?.type === 'device' && selectedEntity?.id === 'grid';

  const isBuying = pBuy > 0.1;
  const isSelling = pSell > 0.1;
  const isActive = isBuying || isSelling;

  const wireCurves = useMemo(() => {
    const p1 = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-1.8, 12.8, -2.5),
      new THREE.Vector3(-1.2, 8.5, 0.5),
      new THREE.Vector3(-0.6, 3.2, 3.5),
    ]);
    const p2 = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 14.2, -2.5),
      new THREE.Vector3(0, 9.2, 0.5),
      new THREE.Vector3(0, 3.2, 3.5),
    ]);
    const p3 = new THREE.CatmullRomCurve3([
      new THREE.Vector3(1.8, 12.8, -2.5),
      new THREE.Vector3(1.2, 8.5, 0.5),
      new THREE.Vector3(0.6, 3.2, 3.5),
    ]);
    return [p1, p2, p3];
  }, []);

  return (
    <group
      name="EVNSubstationTower"
      position={[MICROGRID_NODES.grid.x, 0, MICROGRID_NODES.grid.z]}
      onPointerOver={(e) => {
        e.stopPropagation();
        setHoveredEntity({ type: 'device', id: 'grid' });
      }}
      onPointerOut={(e) => {
        e.stopPropagation();
        setHoveredEntity(null);
      }}
      onClick={(e) => {
        e.stopPropagation();
        const ent = { type: 'device', id: 'grid' };
        setSelectedEntity(ent);
        if (onSelectEntity) onSelectEntity(ent);
      }}
    >
      {/* Steel Lattice Transmission Pylon */}
      <group position={[0, 0, -2.5]}>
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
              <meshStandardMaterial color="#94A3B8" metalness={0.85} roughness={0.3} />
            </mesh>
          );
        })}

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

        <mesh position={[0, 12.8, 0]} castShadow>
          <boxGeometry args={[4.8, 0.16, 0.2]} />
          <meshStandardMaterial color="#94A3B8" metalness={0.9} />
        </mesh>
        <mesh position={[0, 14.2, 0]} castShadow>
          <boxGeometry args={[3.2, 0.16, 0.2]} />
          <meshStandardMaterial color="#94A3B8" metalness={0.9} />
        </mesh>

        {/* Aviation Warning Beacon */}
        <mesh position={[0, 15.2, 0]}>
          <sphereGeometry args={[0.2, 10, 10]} />
          <meshBasicMaterial color={isNight ? '#EF4444' : '#64748B'} />
        </mesh>
      </group>

      {wireCurves.map((curve, idx) => (
        <mesh key={idx} castShadow>
          <tubeGeometry args={[curve, 20, 0.03, 6, false]} />
          <meshStandardMaterial color="#1E293B" metalness={0.85} />
        </mesh>
      ))}

      {/* Ground 22kV/0.4kV Transformer */}
      <group position={[0, 0, 3.5]}>
        <mesh position={[0, 1.3, 0]} castShadow receiveShadow>
          <boxGeometry args={[2.2, 2.0, 2.2]} />
          <meshStandardMaterial color="#475569" metalness={0.75} roughness={0.38} />
        </mesh>
        <mesh position={[0, 2.55, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[0.35, 0.35, 1.8, 14]} />
          <meshStandardMaterial color="#64748B" metalness={0.8} />
        </mesh>
        {isActive && (
          <mesh position={[0, 0.24, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[2.2, 2.8, 28]} />
            <meshBasicMaterial
              color={isBuying ? '#8B5CF6' : '#10B981'}
              transparent
              opacity={0.6}
            />
          </mesh>
        )}
      </group>

      {isNight && (
        <pointLight
          position={[0, 5.0, 3.0]}
          color="#FEF08A"
          intensity={quality === 'low' ? 0.8 : 1.6}
          distance={18}
          decay={2}
        />
      )}

      {(isHovered || isSelected) && (
        <mesh position={[0, 7.6, 0]}>
          <boxGeometry args={[9.5, 15.6, 12.0]} />
          <meshBasicMaterial
            color="#8B5CF6"
            wireframe
            transparent
            opacity={isSelected ? 0.7 : 0.38}
          />
        </mesh>
      )}
    </group>
  );
}
