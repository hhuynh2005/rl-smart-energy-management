import React, { useMemo } from 'react';
import { getBessContainerTexture } from './textures';
import { MICROGRID_NODES } from './campusLayout';
import { useQualityStore } from '../../store/useQualityStore';

/**
 * BESS Component - 200 kWh / 50 kW LFP Megapack Container sited at TLU NW Technical Yard.
 */
export default function BESS({ socPct = 90, pBatt = 0, hour = 12, onSelectEntity }) {
  const {
    hoveredEntity,
    setHoveredEntity,
    selectedEntity,
    setSelectedEntity,
    quality,
    forceNightLights,
  } = useQualityStore();

  const isNight = hour < 6 || hour > 18.2 || forceNightLights;
  const isHovered = hoveredEntity?.type === 'device' && hoveredEntity?.id === 'bess';
  const isSelected = selectedEntity?.type === 'device' && selectedEntity?.id === 'bess';

  const isCharging = pBatt > 0.05;
  const isDischarging = pBatt < -0.05;

  const containerTex = useMemo(() => {
    const t = getBessContainerTexture();
    t.repeat.set(1, 1);
    return t;
  }, []);

  const ledColor = isCharging ? '#10B981' : isDischarging ? '#EF4444' : '#F59E0B';
  const fillH = Math.max(0.1, (socPct / 100) * 2.1);
  const fillY = -1.05 + fillH / 2;

  return (
    <group
      name="BESSMegapack"
      position={[MICROGRID_NODES.bess.x, 0, MICROGRID_NODES.bess.z]}
      onPointerOver={(e) => {
        e.stopPropagation();
        setHoveredEntity({ type: 'device', id: 'bess' });
      }}
      onPointerOut={(e) => {
        e.stopPropagation();
        setHoveredEntity(null);
      }}
      onClick={(e) => {
        e.stopPropagation();
        const ent = { type: 'device', id: 'bess' };
        setSelectedEntity(ent);
        if (onSelectEntity) onSelectEntity(ent);
      }}
    >
      {/* Main 20ft Megapack Container */}
      <mesh position={[0, 1.8, 0]} castShadow receiveShadow>
        <boxGeometry args={[7.4, 3.2, 3.4]} />
        <meshStandardMaterial map={containerTex} metalness={0.7} roughness={0.35} />
      </mesh>

      {/* Corner Castings */}
      {[
        [-3.65, 3.3, -1.65], [3.65, 3.3, -1.65], [-3.65, 3.3, 1.65], [3.65, 3.3, 1.65],
        [-3.65, 0.3, -1.65], [3.65, 0.3, -1.65], [-3.65, 0.3, 1.65], [3.65, 0.3, 1.65],
      ].map(([cx, cy, cz], idx) => (
        <mesh key={idx} position={[cx, cy, cz]} castShadow>
          <boxGeometry args={[0.3, 0.3, 0.3]} />
          <meshStandardMaterial color="#0F172A" metalness={0.9} roughness={0.2} />
        </mesh>
      ))}

      {/* Rooftop Chiller Units */}
      {[-1.8, 1.8].map((hx, hIdx) => (
        <mesh key={hIdx} position={[hx, 3.65, 0]} castShadow>
          <boxGeometry args={[1.8, 0.5, 2.2]} />
          <meshStandardMaterial color="#475569" metalness={0.8} roughness={0.3} />
        </mesh>
      ))}

      {/* Front LED Status Strip */}
      <mesh position={[0, 2.8, 1.72]}>
        <boxGeometry args={[4.6, 0.3, 0.06]} />
        <meshStandardMaterial color="#0F172A" />
      </mesh>
      <mesh position={[0, 2.8, 1.76]}>
        <planeGeometry args={[4.4, 0.16]} />
        <meshBasicMaterial color={ledColor} />
      </mesh>

      {/* Vertical SoC Gauge */}
      <group position={[3.72, 1.8, 0]} rotation={[0, Math.PI / 2, 0]}>
        <mesh>
          <planeGeometry args={[1.2, 2.4]} />
          <meshBasicMaterial color="#0B0F19" />
        </mesh>
        <mesh position={[0, -0.6, 0.01]}>
          <planeGeometry args={[0.9, 0.03]} />
          <meshBasicMaterial color="#EF4444" />
        </mesh>
        <mesh position={[0, 0.72, 0.01]}>
          <planeGeometry args={[0.9, 0.03]} />
          <meshBasicMaterial color="#EF4444" />
        </mesh>
        <mesh position={[0, fillY, 0.01]}>
          <planeGeometry args={[0.75, fillH]} />
          <meshBasicMaterial color={isDischarging ? '#EF4444' : '#10B981'} />
        </mesh>
      </group>

      {/* Active Ground Pulse Ring */}
      {(isCharging || isDischarging) && (
        <mesh position={[0, 0.24, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[4.4, 5.0, 32]} />
          <meshBasicMaterial
            color={isCharging ? '#10B981' : '#EF4444'}
            transparent
            opacity={0.55}
          />
        </mesh>
      )}

      {/* Night Floodlight */}
      {isNight && (
        <group>
          <pointLight
            position={[0, 5.2, 2.5]}
            color="#FEF08A"
            intensity={quality === 'low' ? 0.9 : 1.7}
            distance={18}
            decay={2}
          />
          <mesh position={[0, 0.22, 0]}>
            <boxGeometry args={[8.0, 0.04, 4.0]} />
            <meshBasicMaterial color={ledColor} />
          </mesh>
        </group>
      )}

      {/* Hover / Selected Outline */}
      {(isHovered || isSelected) && (
        <mesh position={[0, 1.8, 0]}>
          <boxGeometry args={[8.2, 4.0, 4.2]} />
          <meshBasicMaterial
            color="#10B981"
            wireframe
            transparent
            opacity={isSelected ? 0.7 : 0.38}
          />
        </mesh>
      )}
    </group>
  );
}
