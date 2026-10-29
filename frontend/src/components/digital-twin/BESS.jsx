import React, { useMemo } from 'react';
import { getBessContainerTexture } from './textures';
import { useQualityStore } from '../../store/useQualityStore';

/**
 * BESS Component - 200 kWh / 100 kW LFP Megapack Container
 * Features:
 * - Industrial corrugated shipping container shell with SEMS-RL BESS branding
 * - Rooftop HVAC chiller & ventilation louvers
 * - Real-time LED status bar (Green = Charging, Yellow = Idle, Red = Discharging)
 * - Vertical Liquid SoC Gauge (0% - 100%)
 * - Pulsing connection ring when active
 * - Night Perimeter Floodlighting & Foundation Glow when dark
 */
export default function BESS({ socPct = 90, pBatt = 0, hour = 12, onSelect }) {
  const {
    hoveredDevice,
    setHoveredDevice,
    selectedDevice,
    setSelectedDevice,
    quality,
    forceNightLights,
  } = useQualityStore();

  const isNight = (hour < 6 || hour > 18.5) || forceNightLights;
  const isHovered = hoveredDevice === 'bess';
  const isSelected = selectedDevice === 'bess';

  const isCharging = pBatt > 0.05;
  const isDischarging = pBatt < -0.05;

  const containerTex = useMemo(() => {
    const t = getBessContainerTexture();
    t.repeat.set(1, 1);
    return t;
  }, []);

  // Status LED color
  const ledColor = isCharging ? '#10B981' : isDischarging ? '#EF4444' : '#F59E0B';

  return (
    <group
      name="BESSMegapack"
      position={[-18, 0, 8]}
      rotation={[0, Math.PI, 0]}
      onPointerOver={(e) => {
        e.stopPropagation();
        setHoveredDevice('bess');
      }}
      onPointerOut={(e) => {
        e.stopPropagation();
        setHoveredDevice(null);
      }}
      onClick={(e) => {
        e.stopPropagation();
        setSelectedDevice('bess');
        if (onSelect) onSelect('bess');
      }}
    >
      {/* 1. Main 20ft Industrial Megapack Container */}
      <mesh position={[0, 1.8, 0]} castShadow receiveShadow>
        <boxGeometry args={[7.2, 3.2, 3.2]} />
        <meshStandardMaterial
          map={containerTex}
          metalness={0.75}
          roughness={0.3}
        />
      </mesh>

      {/* Container Corner Castings */}
      {[
        [-3.55, 3.3, -1.55], [3.55, 3.3, -1.55], [-3.55, 3.3, 1.55], [3.55, 3.3, 1.55],
        [-3.55, 0.3, -1.55], [3.55, 0.3, -1.55], [-3.55, 0.3, 1.55], [3.55, 0.3, 1.55],
      ].map(([cx, cy, cz], idx) => (
        <mesh key={idx} position={[cx, cy, cz]} castShadow>
          <boxGeometry args={[0.3, 0.3, 0.3]} />
          <meshStandardMaterial color="#0F172A" metalness={0.9} roughness={0.2} />
        </mesh>
      ))}

      {/* 2. Rooftop Thermal Management Chiller Units */}
      {[-1.8, 1.8].map((hx, hIdx) => (
        <group key={hIdx} position={[hx, 3.65, 0]}>
          <mesh castShadow>
            <boxGeometry args={[1.8, 0.5, 2.2]} />
            <meshStandardMaterial color="#475569" metalness={0.8} roughness={0.3} />
          </mesh>
          {[-0.45, 0.45].map((fx, fIdx) => (
            <mesh key={fIdx} position={[fx, 0.26, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <ringGeometry args={[0.2, 0.35, 16]} />
              <meshBasicMaterial color="#0F172A" />
            </mesh>
          ))}
        </group>
      ))}

      {/* 3. Front Interactive LED Status Bar & Telemetry Display */}
      <mesh position={[0, 2.8, 1.62]}>
        <boxGeometry args={[4.6, 0.3, 0.06]} />
        <meshStandardMaterial color="#0F172A" />
      </mesh>
      {/* Emissive State Indicator Strip */}
      <mesh position={[0, 2.8, 1.66]}>
        <planeGeometry args={[4.4, 0.16]} />
        <meshBasicMaterial color={ledColor} />
      </mesh>

      {/* 4. Vertical SoC Liquid Gauge on End Wall */}
      <group position={[3.62, 1.8, 0]} rotation={[0, Math.PI / 2, 0]}>
        <mesh>
          <planeGeometry args={[1.2, 2.4]} />
          <meshBasicMaterial color="#0B0F19" />
        </mesh>
        {/* 20% Guardrail Line */}
        <mesh position={[0, -0.6, 0.01]}>
          <planeGeometry args={[0.9, 0.03]} />
          <meshBasicMaterial color="#EF4444" />
        </mesh>
        {/* 90% Guardrail Line */}
        <mesh position={[0, 0.72, 0.01]}>
          <planeGeometry args={[0.9, 0.03]} />
          <meshBasicMaterial color="#EF4444" />
        </mesh>
        {/* Dynamic SoC Fill Level */}
        {(() => {
          const fillH = Math.max(0.1, (socPct / 100) * 2.1);
          const fillY = -1.05 + fillH / 2;
          return (
            <mesh position={[0, fillY, 0.01]}>
              <planeGeometry args={[0.75, fillH]} />
              <meshBasicMaterial color={isDischarging ? '#EF4444' : '#10B981'} />
            </mesh>
          );
        })()}
      </group>

      {/* 5. Central Connection Junction Box & Active Pulsing Ring */}
      <group position={[3.8, 0.8, 0]}>
        <mesh castShadow>
          <boxGeometry args={[0.5, 0.8, 0.8]} />
          <meshStandardMaterial color="#334155" metalness={0.9} />
        </mesh>
        {(isCharging || isDischarging) && (
          <mesh position={[0, -0.6, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.8, 1.2, 24]} />
            <meshBasicMaterial
              color={isCharging ? '#06B6D4' : '#F97316'}
              transparent
              opacity={0.7}
            />
          </mesh>
        )}
      </group>

      {/* 6. Night Security Floodlights & Foundation Lighting */}
      {isNight && (
        <group name="BESSNightLighting">
          {/* Left and Right Container Corner Floodlights */}
          {[-3.4, 3.4].map((lx, idx) => (
            <group key={idx} position={[lx, 3.5, 1.55]}>
              <mesh>
                <boxGeometry args={[0.25, 0.16, 0.25]} />
                <meshStandardMaterial color="#0F172A" />
              </mesh>
              <mesh position={[0, -0.09, 0]}>
                <sphereGeometry args={[0.12, 10, 10]} />
                <meshBasicMaterial color="#FEF08A" />
              </mesh>
            </group>
          ))}

          {/* Dedicated BESS Illumination Point Light */}
          <pointLight
            position={[0, 4.8, 2.0]}
            color="#FEF08A"
            intensity={quality === 'low' ? 0.9 : 1.8}
            distance={16}
            decay={2}
          />

          {/* Concrete Plinth Perimeter Neon LED Underglow Strip */}
          <mesh position={[0, 0.14, 0]}>
            <boxGeometry args={[7.8, 0.04, 3.8]} />
            <meshBasicMaterial color={ledColor} />
          </mesh>
        </group>
      )}

      {/* 7. Highlight Outline on Hover / Selected */}
      {(isHovered || isSelected) && (
        <mesh position={[0, 1.8, 0]}>
          <boxGeometry args={[7.8, 3.8, 3.8]} />
          <meshBasicMaterial
            color="#10B981"
            wireframe
            transparent
            opacity={isSelected ? 0.65 : 0.35}
          />
        </mesh>
      )}
    </group>
  );
}
