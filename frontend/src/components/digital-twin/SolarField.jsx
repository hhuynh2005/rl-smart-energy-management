import React, { useMemo } from 'react';
import { getSolarCellTexture } from './textures';
import { useQualityStore } from '../../store/useQualityStore';

/**
 * SolarField Component - 150 kWp Industrial Ground-Mounted Solar Farm
 * Features:
 * - 4 Parallel rack rows tilted at 20° south-facing
 * - High-efficiency monocrystalline wafers with glass clearcoat & aluminum bezel
 * - Galvanized steel ground struts & purlins
 * - Central 150 kW Solar Inverter Cabinet with status indicator
 * - Luminous activity pulse ring at inverter node
 * - Night Perimeter Floodlighting & Inspection Lamp when dark
 */
export default function SolarField({ pPv = 0, hour = 12, onSelect }) {
  const {
    hoveredDevice,
    setHoveredDevice,
    selectedDevice,
    setSelectedDevice,
    quality,
    forceNightLights,
  } = useQualityStore();

  const isNight = (hour < 6 || hour > 18.5) || forceNightLights;
  const isHovered = hoveredDevice === 'solar';
  const isSelected = selectedDevice === 'solar';
  const isGenerating = pPv > 0.5;

  const solarTex = useMemo(() => {
    const t = getSolarCellTexture();
    t.repeat.set(1, 1);
    return t;
  }, []);

  // 4 rows of 4 panel tables each
  const rows = [-4.5, -1.5, 1.5, 4.5];
  const cols = [-5.4, -1.8, 1.8, 5.4];

  // 4 Perimeter Floodlight Pole positions
  const floodlightPoles = [
    [-8.0, -6.5],
    [8.0, -6.5],
    [-8.0, 6.5],
    [8.0, 6.5],
  ];

  return (
    <group
      name="SolarPVFarm"
      position={[18, 0, 8]}
      onPointerOver={(e) => {
        e.stopPropagation();
        setHoveredDevice('solar');
      }}
      onPointerOut={(e) => {
        e.stopPropagation();
        setHoveredDevice(null);
      }}
      onClick={(e) => {
        e.stopPropagation();
        setSelectedDevice('solar');
        if (onSelect) onSelect('solar');
      }}
    >
      {/* 1. Ground Mount Rows */}
      {rows.map((rz, rIdx) => (
        <group key={rIdx} position={[0, 0, rz]}>
          {/* Galvanized Steel Ground Support Struts */}
          {[-6.0, -2.0, 2.0, 6.0].map((sx, sIdx) => (
            <group key={sIdx} position={[sx, 0, 0]}>
              <mesh position={[0, 0.45, 0.9]} castShadow>
                <cylinderGeometry args={[0.04, 0.04, 0.9, 8]} />
                <meshStandardMaterial color="#94A3B8" metalness={0.9} roughness={0.2} />
              </mesh>
              <mesh position={[0, 0.9, -0.9]} castShadow>
                <cylinderGeometry args={[0.04, 0.04, 1.8, 8]} />
                <meshStandardMaterial color="#94A3B8" metalness={0.9} roughness={0.2} />
              </mesh>
              <mesh position={[0, 0.7, 0]} rotation={[0.42, 0, 0]} castShadow>
                <boxGeometry args={[0.06, 0.04, 2.2]} />
                <meshStandardMaterial color="#64748B" metalness={0.8} />
              </mesh>
            </group>
          ))}

          {/* Long Horizontal Support Purlins */}
          <mesh position={[0, 0.88, -0.4]} castShadow>
            <boxGeometry args={[13.5, 0.06, 0.08]} />
            <meshStandardMaterial color="#94A3B8" metalness={0.9} roughness={0.3} />
          </mesh>
          <mesh position={[0, 0.52, 0.4]} castShadow>
            <boxGeometry args={[13.5, 0.06, 0.08]} />
            <meshStandardMaterial color="#94A3B8" metalness={0.9} roughness={0.3} />
          </mesh>

          {/* 4 PV Tables per Row, Tilted at ~22° */}
          {cols.map((cx, cIdx) => (
            <group
              key={cIdx}
              position={[cx, 0.75, 0]}
              rotation={[0.38, 0, 0]}
            >
              <mesh castShadow receiveShadow>
                <boxGeometry args={[3.2, 0.06, 2.0]} />
                <meshStandardMaterial
                  color="#CBD5E1"
                  metalness={0.92}
                  roughness={0.15}
                />
              </mesh>

              <mesh position={[0, 0.04, 0]}>
                <boxGeometry args={[3.12, 0.02, 1.92]} />
                <meshPhysicalMaterial
                  map={solarTex}
                  roughness={0.08}
                  metalness={0.8}
                  reflectivity={0.95}
                  clearcoat={1.0}
                  clearcoatRoughness={0.05}
                />
              </mesh>
            </group>
          ))}
        </group>
      ))}

      {/* 2. Central 150 kW String Inverter & Combiner Enclosure */}
      <group position={[-7.5, 0, 0]}>
        <mesh position={[0, 0.2, 0]} castShadow receiveShadow>
          <boxGeometry args={[1.6, 0.4, 2.2]} />
          <meshStandardMaterial color="#94A3B8" roughness={0.7} />
        </mesh>
        <mesh position={[0, 1.3, 0]} castShadow receiveShadow>
          <boxGeometry args={[1.2, 1.8, 1.8]} />
          <meshStandardMaterial color="#E2E8F0" metalness={0.8} roughness={0.25} />
        </mesh>
        <mesh position={[-0.61, 1.5, 0]}>
          <planeGeometry args={[0.3, 0.5]} />
          <meshBasicMaterial color={isGenerating ? '#10B981' : isNight ? '#38BDF8' : '#64748B'} />
        </mesh>
        <mesh position={[-0.61, 0.9, 0]}>
          <planeGeometry args={[0.8, 0.5]} />
          <meshStandardMaterial color="#334155" />
        </mesh>

        {/* Inverter Night Inspection Light */}
        {isNight && (
          <group position={[-0.62, 2.1, 0]}>
            <mesh>
              <boxGeometry args={[0.1, 0.08, 0.4]} />
              <meshStandardMaterial color="#0F172A" />
            </mesh>
            <mesh position={[-0.04, -0.04, 0]}>
              <sphereGeometry args={[0.08, 8, 8]} />
              <meshBasicMaterial color="#38BDF8" />
            </mesh>
          </group>
        )}

        {/* Luminous Pulsing Ring at Inverter Base when Active */}
        {isGenerating && (
          <mesh position={[0, 0.08, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[1.2, 1.6, 24]} />
            <meshBasicMaterial
              color="#F59E0B"
              transparent
              opacity={0.65}
            />
          </mesh>
        )}
      </group>

      {/* 3. Night Perimeter Security Floodlight Poles */}
      {isNight && (
        <group name="SolarNightFloodlights">
          {floodlightPoles.map(([fx, fz], idx) => (
            <group key={idx} position={[fx, 0, fz]}>
              <mesh position={[0, 1.8, 0]} castShadow>
                <cylinderGeometry args={[0.05, 0.07, 3.6, 8]} />
                <meshStandardMaterial color="#334155" metalness={0.9} />
              </mesh>
              {/* Angled LED Floodlight Head */}
              <mesh position={[0, 3.5, 0]} rotation={[fx < 0 ? -0.4 : 0.4, 0, fz < 0 ? 0.4 : -0.4]}>
                <boxGeometry args={[0.25, 0.15, 0.35]} />
                <meshStandardMaterial color="#0F172A" />
              </mesh>
              {/* Emissive Floodlight Lens */}
              <mesh position={[0, 3.44, 0]}>
                <sphereGeometry args={[0.12, 10, 10]} />
                <meshBasicMaterial color="#FEF08A" />
              </mesh>
            </group>
          ))}

          {/* Dedicated Night Solar Field Illuminating Point Light */}
          <pointLight
            position={[0, 4.8, 0]}
            color="#FEF08A"
            intensity={quality === 'low' ? 0.9 : 1.8}
            distance={24}
            decay={2}
          />
        </group>
      )}

      {/* 4. Highlight Outline on Hover / Selected */}
      {(isHovered || isSelected) && (
        <mesh position={[0, 1.0, 0]}>
          <boxGeometry args={[17.5, 2.4, 13.5]} />
          <meshBasicMaterial
            color="#F59E0B"
            wireframe
            transparent
            opacity={isSelected ? 0.65 : 0.35}
          />
        </mesh>
      )}
    </group>
  );
}
