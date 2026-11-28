import React, { useMemo } from 'react';
import { getSolarCellTexture } from './textures';
import { MICROGRID_NODES } from './campusLayout';
import { useQualityStore } from '../../store/useQualityStore';

/**
 * SolarField Component - Central 150 kWp Rooftop PV Inverter & Combiner Station
 * Coordinates with rooftop arrays mounted on Tòa A1, Thư viện, Tòa K1, Nhà gửi xe, and Nhà GDTC.
 */
export default function SolarField({ pPv = 0, hour = 12, onSelectEntity }) {
  const {
    hoveredEntity,
    setHoveredEntity,
    selectedEntity,
    setSelectedEntity,
    quality,
    forceNightLights,
  } = useQualityStore();

  const isNight = hour < 6 || hour > 18.2 || forceNightLights;
  const isHovered = hoveredEntity?.type === 'device' && hoveredEntity?.id === 'solar';
  const isSelected = selectedEntity?.type === 'device' && selectedEntity?.id === 'solar';
  const isGenerating = pPv > 0.5;

  const solarTex = useMemo(() => getSolarCellTexture(), []);

  return (
    <group
      name="SolarPVStation"
      position={[MICROGRID_NODES.solar.x, 0, MICROGRID_NODES.solar.z]}
      onPointerOver={(e) => {
        e.stopPropagation();
        setHoveredEntity({ type: 'device', id: 'solar' });
      }}
      onPointerOut={(e) => {
        e.stopPropagation();
        setHoveredEntity(null);
      }}
      onClick={(e) => {
        e.stopPropagation();
        const ent = { type: 'device', id: 'solar' };
        setSelectedEntity(ent);
        if (onSelectEntity) onSelectEntity(ent);
      }}
    >
      {/* 2 Compact Ground Calibration PV Racks next to Inverter Yard */}
      {[-2.2, 2.2].map((rz, rIdx) => (
        <group key={rIdx} position={[1.4, 0.85, rz]} rotation={[0.35, 0, 0]}>
          <mesh castShadow receiveShadow>
            <boxGeometry args={[6.8, 0.08, 2.4]} />
            <meshStandardMaterial color="#CBD5E1" metalness={0.85} roughness={0.2} />
          </mesh>
          <mesh position={[0, 0.05, 0]}>
            <boxGeometry args={[6.6, 0.03, 2.25]} />
            <meshPhysicalMaterial
              map={solarTex}
              roughness={0.1}
              metalness={0.8}
              clearcoat={0.9}
            />
          </mesh>
        </group>
      ))}

      {/* Central 150 kW String Inverter & Combiner Enclosure */}
      <group position={[-3.6, 0, 0]}>
        <mesh position={[0, 1.3, 0]} castShadow receiveShadow>
          <boxGeometry args={[1.6, 2.2, 2.4]} />
          <meshStandardMaterial color="#E2E8F0" metalness={0.75} roughness={0.28} />
        </mesh>
        <mesh position={[0.82, 1.6, 0]}>
          <planeGeometry args={[0.05, 0.7]} />
          <meshBasicMaterial color={isGenerating ? '#10B981' : isNight ? '#38BDF8' : '#64748B'} />
        </mesh>
        <mesh position={[0, 2.55, 0]} castShadow>
          <boxGeometry args={[1.8, 0.2, 2.6]} />
          <meshStandardMaterial color="#F59E0B" roughness={0.4} />
        </mesh>
      </group>

      {isGenerating && (
        <mesh position={[0, 0.2, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[4.6, 5.2, 32]} />
          <meshBasicMaterial color="#F59E0B" transparent opacity={0.55} />
        </mesh>
      )}

      {isNight && (
        <pointLight
          position={[0, 4.5, 0]}
          color="#FEF08A"
          intensity={quality === 'low' ? 0.8 : 1.5}
          distance={16}
          decay={2}
        />
      )}

      {(isHovered || isSelected) && (
        <mesh position={[0, 1.4, 0]}>
          <boxGeometry args={[12.5, 3.0, 9.8]} />
          <meshBasicMaterial
            color="#F59E0B"
            wireframe
            transparent
            opacity={isSelected ? 0.7 : 0.38}
          />
        </mesh>
      )}
    </group>
  );
}
