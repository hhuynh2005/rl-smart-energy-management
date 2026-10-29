import React, { useRef, useMemo } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { getSolarCellTexture, getConcreteTexture } from './textures';
import { useQualityStore } from '../../store/useQualityStore';

/**
 * House Component - Modern Smart Building Digital Twin
 * Oriented with FRONT FAÇADE facing directly towards the road (-Z axis).
 * Features:
 * - 3D BoxGeometry glass facade & front door (100% visible from street, no backface culling)
 * - Full interior warm room glow & dedicated pointLights for night demo
 * - Driveway courtyard with 3D Electric Vehicle (EV)
 * - Level-2 Smart Wallbox Charger with Off-peak (22:00-04:00) auto-charging
 * - Pathway garden bollards & entrance sconce lighting
 * - Rooftop 12 kWp solar array and spinning HVAC chiller fan
 */
export default function House({ hour = 12, pLoad = 0, onSelect }) {
  const {
    hoveredDevice,
    setHoveredDevice,
    selectedDevice,
    setSelectedDevice,
    forceNightLights,
    quality,
  } = useQualityStore();
  const hvacFanRef = useRef();

  // Active when time is evening/night OR when user clicks Demo Night Lights toggle
  const isNight = (hour < 6 || hour > 18.5) || forceNightLights;
  const isOffPeakEvCharging = hour >= 22.0 || hour < 4.0;
  const isHovered = hoveredDevice === 'house';
  const isSelected = selectedDevice === 'house';

  const solarCellTex = useMemo(() => {
    const t = getSolarCellTexture();
    t.repeat.set(2, 2);
    return t;
  }, []);

  const concreteTex = useMemo(() => {
    const t = getConcreteTexture();
    t.repeat.set(3, 3);
    return t;
  }, []);

  // Spin HVAC fan based on electrical load
  useFrame((_, delta) => {
    if (hvacFanRef.current) {
      const speed = Math.max(2, (pLoad / 30) * 12);
      hvacFanRef.current.rotation.z += delta * speed;
    }
  });

  // Pathway bollard positions in front courtyard
  const walkwayBollards = [
    [-1.8, 0.8],
    [-1.8, 2.6],
    [-1.8, 4.2],
    [1.8, 0.8],
    [1.8, 2.6],
    [1.8, 4.2],
  ];

  return (
    <group
      name="SmartHouseProperty"
      position={[0, 0, 0]}
      onPointerOver={(e) => {
        e.stopPropagation();
        setHoveredDevice('house');
      }}
      onPointerOut={(e) => {
        e.stopPropagation();
        setHoveredDevice(null);
      }}
      onClick={(e) => {
        e.stopPropagation();
        setSelectedDevice('house');
        if (onSelect) onSelect('house');
      }}
    >
      {/* 1. Front Courtyard & Driveway Paving (Z = -0.5 to 5.0) */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.08, 2.2]}
        receiveShadow
      >
        <planeGeometry args={[16, 5.5]} />
        <meshStandardMaterial map={concreteTex} roughness={0.65} />
      </mesh>

      {/* Garden Pathway Bollards (Cột đèn sân vườn phát sáng ban đêm) */}
      {walkwayBollards.map(([bx, bz], bIdx) => (
        <group key={bIdx} position={[bx, 0.08, bz]}>
          <mesh position={[0, 0.35, 0]} castShadow>
            <cylinderGeometry args={[0.04, 0.04, 0.7, 8]} />
            <meshStandardMaterial color="#1E293B" metalness={0.9} />
          </mesh>
          <mesh position={[0, 0.72, 0]}>
            <sphereGeometry args={[0.08, 10, 10]} />
            <meshBasicMaterial color={isNight ? '#FDE047' : '#94A3B8'} />
          </mesh>
        </group>
      ))}

      {/* 2. Perimeter Modern Slatted Fence & Front Gate (at Z = -0.5) */}
      <group position={[0, 0, -0.5]}>
        {/* Left Fence Segment */}
        <mesh position={[-6.2, 0.75, 0]} castShadow>
          <boxGeometry args={[4.2, 1.5, 0.12]} />
          <meshStandardMaterial color="#334155" metalness={0.8} roughness={0.3} />
        </mesh>
        {/* Right Fence Segment */}
        <mesh position={[6.2, 0.75, 0]} castShadow>
          <boxGeometry args={[4.2, 1.5, 0.12]} />
          <meshStandardMaterial color="#334155" metalness={0.8} roughness={0.3} />
        </mesh>
        {/* Gate Pillars (Granite Pillars) */}
        {[-3.8, 3.8].map((gx, idx) => (
          <mesh key={idx} position={[gx, 1.0, 0]} castShadow>
            <boxGeometry args={[0.5, 2.0, 0.5]} />
            <meshStandardMaterial color="#1E293B" roughness={0.5} />
          </mesh>
        ))}
        {/* Sliding Entrance Gate */}
        <mesh position={[-1.2, 0.8, 0.08]} castShadow>
          <boxGeometry args={[4.6, 1.4, 0.06]} />
          <meshStandardMaterial color="#0F172A" metalness={0.9} roughness={0.2} />
        </mesh>
      </group>

      {/* 3. Carport & 3D Electric Vehicle (EV) (In courtyard at X = 5.2, Z = 2.4) */}
      <group position={[5.2, 0, 2.4]}>
        {/* Modern Carport Canopy Roof */}
        <mesh position={[0, 3.0, 0]} castShadow receiveShadow>
          <boxGeometry args={[3.8, 0.14, 5.8]} />
          <meshStandardMaterial color="#1E293B" metalness={0.6} roughness={0.3} />
        </mesh>

        {/* Carport Ceiling LED Downlight (Ban đêm) */}
        {isNight && (
          <group position={[0, 2.9, 0]}>
            <mesh>
              <sphereGeometry args={[0.18, 12, 12]} />
              <meshBasicMaterial color="#FEF08A" />
            </mesh>
            <pointLight
              color="#FEF08A"
              intensity={quality === 'low' ? 1.0 : 2.2}
              distance={12}
              decay={2}
            />
          </group>
        )}

        {/* Steel Carport Pillars */}
        {[[-1.6, 0, -2.5], [-1.6, 0, 2.5], [1.6, 0, -2.5], [1.6, 0, 2.5]].map(([px, , pz], i) => (
          <mesh key={i} position={[px, 1.5, pz]} castShadow>
            <cylinderGeometry args={[0.07, 0.07, 3.0, 8]} />
            <meshStandardMaterial color="#0F172A" metalness={0.9} />
          </mesh>
        ))}

        {/* 3D Electric Vehicle (Parked facing the street towards -Z) */}
        <group position={[0, 0.45, 0]}>
          {/* Main Car Body Chassis */}
          <mesh position={[0, 0.4, 0]} castShadow>
            <boxGeometry args={[2.0, 0.7, 4.2]} />
            <meshPhysicalMaterial
              color="#0284C7"
              roughness={0.12}
              metalness={0.9}
              clearcoat={1.0}
            />
          </mesh>
          {/* Tinted Cabin Glass */}
          <mesh position={[0, 0.95, -0.1]} castShadow>
            <boxGeometry args={[1.7, 0.6, 2.3]} />
            <meshPhysicalMaterial
              color="#0F172A"
              roughness={0.05}
              metalness={0.95}
              clearcoat={1.0}
            />
          </mesh>
          {/* Front Headlights (Facing street towards -Z) */}
          <mesh position={[0.65, 0.45, -2.11]}>
            <boxGeometry args={[0.38, 0.14, 0.04]} />
            <meshBasicMaterial color={isNight ? '#FFFFFF' : '#E2E8F0'} />
          </mesh>
          <mesh position={[-0.65, 0.45, -2.11]}>
            <boxGeometry args={[0.38, 0.14, 0.04]} />
            <meshBasicMaterial color={isNight ? '#FFFFFF' : '#E2E8F0'} />
          </mesh>
          {/* Rear Taillights */}
          <mesh position={[0.65, 0.45, 2.11]}>
            <boxGeometry args={[0.38, 0.14, 0.04]} />
            <meshBasicMaterial color={isNight ? '#EF4444' : '#64748B'} />
          </mesh>
          <mesh position={[-0.65, 0.45, 2.11]}>
            <boxGeometry args={[0.38, 0.14, 0.04]} />
            <meshBasicMaterial color={isNight ? '#EF4444' : '#64748B'} />
          </mesh>
          {/* 4 Wheels */}
          {[[-0.95, 0, 1.2], [0.95, 0, 1.2], [-0.95, 0, -1.2], [0.95, 0, -1.2]].map(([wx, wy, wz], wi) => (
            <mesh key={wi} position={[wx, wy, wz]} rotation={[0, 0, Math.PI / 2]} castShadow>
              <cylinderGeometry args={[0.32, 0.32, 0.26, 16]} />
              <meshStandardMaterial color="#1E293B" roughness={0.85} />
            </mesh>
          ))}
        </group>

        {/* Level-2 Smart Wallbox EV Charger Post */}
        <group position={[-1.7, 0, 0.5]}>
          <mesh position={[0, 1.1, 0]} castShadow>
            <cylinderGeometry args={[0.07, 0.07, 2.2, 10]} />
            <meshStandardMaterial color="#0F172A" metalness={0.9} />
          </mesh>
          <mesh position={[0, 1.5, 0.08]} castShadow>
            <boxGeometry args={[0.32, 0.46, 0.18]} />
            <meshStandardMaterial color="#FFFFFF" roughness={0.2} />
          </mesh>
          <mesh position={[0, 1.55, 0.18]}>
            <circleGeometry args={[0.08, 16]} />
            <meshBasicMaterial color={isOffPeakEvCharging ? '#10B981' : '#F59E0B'} />
          </mesh>

          {/* Charging Cable connected to car when charging */}
          {isOffPeakEvCharging && (
            <mesh position={[0.4, 0.85, 0.2]}>
              <tubeGeometry
                args={[
                  new THREE.CatmullRomCurve3([
                    new THREE.Vector3(0, 0.5, 0),
                    new THREE.Vector3(0.3, 0.1, 0.1),
                    new THREE.Vector3(0.7, 0.0, 0.2),
                  ]),
                  16,
                  0.025,
                  8,
                  false,
                ]}
              />
              <meshBasicMaterial color="#10B981" />
            </mesh>
          )}
        </group>
      </group>

      {/* 4. Main House Structure (Z = 5.0 to 14.0) */}
      <group position={[-1.2, 0, 9.5]}>
        {/* Concrete Foundation Plinth */}
        <mesh position={[0, 0.15, 0]} receiveShadow castShadow>
          <boxGeometry args={[13.5, 0.3, 9.5]} />
          <meshStandardMaterial color="#94A3B8" roughness={0.7} />
        </mesh>

        {/* Ground Floor Body */}
        <mesh position={[0, 2.0, 0]} castShadow receiveShadow>
          <boxGeometry args={[12.8, 3.8, 9.0]} />
          <meshStandardMaterial
            color="#F8FAFC"
            roughness={0.4}
            metalness={0.1}
          />
        </mesh>

        {/* Front Wood Slat Feature Wall (Facing Street towards -Z) */}
        <mesh position={[-2.4, 2.0, -4.55]} castShadow>
          <boxGeometry args={[4.8, 3.6, 0.1]} />
          <meshStandardMaterial color="#78350F" roughness={0.7} />
        </mesh>

        {/* Modern Front Entrance Door (Facing Street towards -Z, BoxGeometry 3D để không bị culling) */}
        <mesh position={[1.8, 1.4, -4.56]}>
          <boxGeometry args={[1.6, 2.6, 0.12]} />
          <meshStandardMaterial
            color={isNight ? '#FEF08A' : '#1E293B'}
            emissive={isNight ? '#FDE047' : '#000000'}
            emissiveIntensity={isNight ? 2.8 : 0.0}
            roughness={0.1}
            metalness={0.8}
          />
        </mesh>

        {/* Ground Floor Living Room Panoramic Window (Mặt tiền tầng 1 phát sáng ban đêm) */}
        <mesh position={[4.4, 1.8, -4.54]}>
          <boxGeometry args={[3.0, 2.2, 0.12]} />
          <meshPhysicalMaterial
            color={isNight ? '#FEF08A' : '#7DD3FC'}
            emissive={isNight ? '#FBBF24' : '#0284C7'}
            emissiveIntensity={isNight ? 3.0 : 0.15}
            roughness={0.05}
            metalness={0.8}
            clearcoat={1.0}
          />
        </mesh>

        {/* Tầng 1 Interior Living Room PointLight */}
        {isNight && (
          <pointLight
            position={[4.4, 1.8, -3.8]}
            color="#FEF08A"
            intensity={quality === 'low' ? 1.4 : 2.8}
            distance={16}
            decay={2}
          />
        )}

        {/* Entrance Sconce Lights (2 bên cửa chính) */}
        {isNight && (
          <>
            <mesh position={[0.8, 1.8, -4.54]}>
              <boxGeometry args={[0.1, 0.25, 0.08]} />
              <meshBasicMaterial color="#FEF08A" />
            </mesh>
            <mesh position={[2.8, 1.8, -4.54]}>
              <boxGeometry args={[0.1, 0.25, 0.08]} />
              <meshBasicMaterial color="#FEF08A" />
            </mesh>
          </>
        )}

        {/* Entrance Modern Canopy */}
        <mesh position={[1.8, 2.8, -5.2]} castShadow>
          <boxGeometry args={[2.4, 0.12, 1.4]} />
          <meshStandardMaterial color="#0F172A" metalness={0.8} />
        </mesh>

        {/* Entrance Canopy Downward LED Spot & PointLight (Ban đêm) */}
        {isNight && (
          <group position={[1.8, 2.7, -5.0]}>
            <mesh>
              <sphereGeometry args={[0.16, 12, 12]} />
              <meshBasicMaterial color="#FEF08A" />
            </mesh>
            <pointLight
              color="#FDE047"
              intensity={quality === 'low' ? 1.2 : 2.6}
              distance={14}
              decay={2}
            />
          </group>
        )}

        {/* Second Floor Cantilevered Volume */}
        <mesh position={[0.4, 5.5, -0.3]} castShadow receiveShadow>
          <boxGeometry args={[13.2, 3.2, 8.8]} />
          <meshStandardMaterial
            color="#0F172A"
            roughness={0.3}
            metalness={0.3}
          />
        </mesh>

        {/* Interior Warm Room Volume (Tỏa ánh sáng vàng mật ong từ trong phòng ra ngoài) */}
        {isNight && (
          <mesh position={[0.4, 5.5, -3.2]}>
            <boxGeometry args={[11.2, 2.4, 2.6]} />
            <meshBasicMaterial color="#FEF08A" />
          </mesh>
        )}

        {/* Floor-to-Ceiling Front Glass Curtain Facade (BoxGeometry 3D để không bị Backface Culling) */}
        <mesh position={[0.4, 5.5, -4.75]}>
          <boxGeometry args={[11.5, 2.5, 0.12]} />
          <meshPhysicalMaterial
            color={isNight ? '#FEF08A' : '#7DD3FC'}
            emissive={isNight ? '#FBBF24' : '#0284C7'}
            emissiveIntensity={isNight ? 3.5 : 0.15}
            roughness={0.04}
            metalness={0.85}
            clearcoat={1.0}
          />
        </mesh>

        {/* 2nd Floor Dedicated Interior PointLight rọi ra ngoài mặt tiền */}
        {isNight && (
          <pointLight
            position={[0.4, 5.5, -4.5]}
            color="#FEF08A"
            intensity={quality === 'low' ? 1.6 : 3.8}
            distance={22}
            decay={2}
          />
        )}

        {/* Roofline Architectural Cyber LED Accent Strip (Ban đêm) */}
        <mesh position={[0.4, 7.3, -4.85]}>
          <boxGeometry args={[13.4, 0.08, 0.08]} />
          <meshBasicMaterial color={isNight ? '#38BDF8' : '#334155'} />
        </mesh>

        {/* Cantilever Front Balcony Railing */}
        <mesh position={[0.4, 4.4, -4.9]}>
          <boxGeometry args={[11.8, 0.85, 0.06]} />
          <meshPhysicalMaterial
            color="#BAE6FD"
            roughness={0.1}
            metalness={0.1}
            transmission={0.7}
            transparent
            opacity={0.65}
          />
        </mesh>

        {/* 5. Rooftop Structure & Mini Solar PV Array */}
        <mesh position={[0.4, 7.15, -0.3]} receiveShadow>
          <boxGeometry args={[13.3, 0.2, 8.9]} />
          <meshStandardMaterial color="#334155" roughness={0.8} />
        </mesh>

        {/* Rooftop Solar Panels (3x3 grid tilted at ~20°) */}
        <group position={[-1.5, 7.6, -0.5]} rotation={[0.26, 0, 0]}>
          {[
            [-2.2, 0, -1.8], [0, 0, -1.8], [2.2, 0, -1.8],
            [-2.2, 0, 0.2],  [0, 0, 0.2],  [2.2, 0, 0.2],
            [-2.2, 0, 2.2],  [0, 0, 2.2],  [2.2, 0, 2.2],
          ].map(([px, py, pz], idx) => (
            <group key={idx} position={[px, py, pz]}>
              <mesh castShadow>
                <boxGeometry args={[1.8, 0.06, 1.2]} />
                <meshStandardMaterial color="#94A3B8" metalness={0.85} roughness={0.2} />
              </mesh>
              <mesh position={[0, 0.04, 0]}>
                <boxGeometry args={[1.72, 0.02, 1.12]} />
                <meshStandardMaterial
                  map={solarCellTex}
                  roughness={0.15}
                  metalness={0.7}
                />
              </mesh>
            </group>
          ))}
        </group>

        {/* Rooftop HVAC Chiller Unit with Spinning Fan */}
        <group position={[4.2, 7.8, -1.2]}>
          <mesh castShadow receiveShadow>
            <boxGeometry args={[2.0, 1.2, 1.8]} />
            <meshStandardMaterial color="#64748B" metalness={0.8} roughness={0.3} />
          </mesh>
          <mesh position={[0, 0.61, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.5, 0.7, 16]} />
            <meshStandardMaterial color="#1E293B" metalness={0.9} />
          </mesh>
          <group ref={hvacFanRef} position={[0, 0.62, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <mesh>
              <boxGeometry args={[1.1, 0.14, 0.02]} />
              <meshStandardMaterial color="#0F172A" />
            </mesh>
            <mesh rotation={[0, 0, Math.PI / 2]}>
              <boxGeometry args={[1.1, 0.14, 0.02]} />
              <meshStandardMaterial color="#0F172A" />
            </mesh>
          </group>
        </group>
      </group>

      {/* 6. Highlight Outline when Hovered or Selected */}
      {(isHovered || isSelected) && (
        <mesh position={[-0.8, 3.8, 9.2]}>
          <boxGeometry args={[14.5, 8.2, 10.2]} />
          <meshBasicMaterial
            color="#38BDF8"
            wireframe
            transparent
            opacity={isSelected ? 0.65 : 0.35}
          />
        </mesh>
      )}
    </group>
  );
}
