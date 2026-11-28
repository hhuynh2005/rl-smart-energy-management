import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { useQualityStore } from '../../store/useQualityStore';

/**
 * Procedural Vehicle Visual Models (Sedan, Taxi, Van, Bus)
 */
function VehicleModel({ type = 'sedan', color = '#0284C7', isNight = false, isBraking = false }) {
  if (type === 'bus') {
    return (
      <group>
        <mesh position={[0, 1.25, 0]} castShadow>
          <boxGeometry args={[7.8, 2.1, 2.2]} />
          <meshStandardMaterial color="#0284C7" metalness={0.65} roughness={0.35} />
        </mesh>
        <mesh position={[0, 1.5, 0]}>
          <boxGeometry args={[7.6, 0.9, 2.24]} />
          <meshPhysicalMaterial color="#0F172A" roughness={0.12} metalness={0.85} clearcoat={0.9} />
        </mesh>
        {[[-2.4, 0.35, 1.05], [2.4, 0.35, 1.05], [-2.4, 0.35, -1.05], [2.4, 0.35, -1.05]].map(([wx, wy, wz], wi) => (
          <mesh key={wi} position={[wx, wy, wz]} rotation={[0, 0, Math.PI / 2]} castShadow>
            <cylinderGeometry args={[0.38, 0.38, 0.28, 12]} />
            <meshStandardMaterial color="#1E293B" roughness={0.9} />
          </mesh>
        ))}
        <mesh position={[3.92, 0.8, 0.7]}>
          <boxGeometry args={[0.06, 0.22, 0.3]} />
          <meshBasicMaterial color={isNight ? '#FFFFFF' : '#CBD5E1'} />
        </mesh>
        <mesh position={[3.92, 0.8, -0.7]}>
          <boxGeometry args={[0.06, 0.22, 0.3]} />
          <meshBasicMaterial color={isNight ? '#FFFFFF' : '#CBD5E1'} />
        </mesh>
        <mesh position={[-3.92, 0.8, 0.7]}>
          <boxGeometry args={[0.06, 0.22, 0.3]} />
          <meshBasicMaterial color={isNight || isBraking ? '#EF4444' : '#64748B'} />
        </mesh>
        <mesh position={[-3.92, 0.8, -0.7]}>
          <boxGeometry args={[0.06, 0.22, 0.3]} />
          <meshBasicMaterial color={isNight || isBraking ? '#EF4444' : '#64748B'} />
        </mesh>
      </group>
    );
  }

  if (type === 'van') {
    return (
      <group>
        <mesh position={[0, 1.1, 0]} castShadow>
          <boxGeometry args={[4.8, 1.8, 1.9]} />
          <meshStandardMaterial color="#F8FAFC" metalness={0.55} roughness={0.35} />
        </mesh>
        <mesh position={[1.4, 1.25, 0]}>
          <boxGeometry args={[1.6, 0.85, 1.92]} />
          <meshPhysicalMaterial color="#0F172A" roughness={0.12} metalness={0.85} />
        </mesh>
        {[[-1.4, 0.35, 0.95], [1.4, 0.35, 0.95], [-1.4, 0.35, -0.95], [1.4, 0.35, -0.95]].map(([wx, wy, wz], wi) => (
          <mesh key={wi} position={[wx, wy, wz]} rotation={[0, 0, Math.PI / 2]} castShadow>
            <cylinderGeometry args={[0.34, 0.34, 0.24, 12]} />
            <meshStandardMaterial color="#1E293B" roughness={0.9} />
          </mesh>
        ))}
        <mesh position={[2.42, 0.75, 0.6]}>
          <boxGeometry args={[0.06, 0.2, 0.25]} />
          <meshBasicMaterial color={isNight ? '#FFFFFF' : '#CBD5E1'} />
        </mesh>
        <mesh position={[2.42, 0.75, -0.6]}>
          <boxGeometry args={[0.06, 0.2, 0.25]} />
          <meshBasicMaterial color={isNight ? '#FFFFFF' : '#CBD5E1'} />
        </mesh>
        <mesh position={[-2.42, 0.75, 0.6]}>
          <boxGeometry args={[0.06, 0.2, 0.25]} />
          <meshBasicMaterial color={isNight || isBraking ? '#EF4444' : '#64748B'} />
        </mesh>
        <mesh position={[-2.42, 0.75, -0.6]}>
          <boxGeometry args={[0.06, 0.2, 0.25]} />
          <meshBasicMaterial color={isNight || isBraking ? '#EF4444' : '#64748B'} />
        </mesh>
      </group>
    );
  }

  const isTaxi = type === 'taxi';
  const bodyColor = isTaxi ? '#FACC15' : color;

  return (
    <group>
      <mesh position={[0, 0.45, 0]} castShadow>
        <boxGeometry args={[3.8, 0.55, 1.7]} />
        <meshPhysicalMaterial color={bodyColor} roughness={0.18} metalness={0.8} clearcoat={0.9} />
      </mesh>
      <mesh position={[-0.15, 0.95, 0]} castShadow>
        <boxGeometry args={[2.0, 0.5, 1.45]} />
        <meshPhysicalMaterial color="#0F172A" roughness={0.08} metalness={0.9} clearcoat={0.9} />
      </mesh>
      {isTaxi && (
        <mesh position={[-0.15, 1.28, 0]}>
          <boxGeometry args={[0.6, 0.16, 0.35]} />
          <meshBasicMaterial color="#FEF08A" />
        </mesh>
      )}
      {[[-1.1, 0.28, 0.85], [1.1, 0.28, 0.85], [-1.1, 0.28, -0.85], [1.1, 0.28, -0.85]].map(([wx, wy, wz], wi) => (
        <mesh key={wi} position={[wx, wy, wz]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[0.28, 0.28, 0.2, 12]} />
          <meshStandardMaterial color="#1E293B" roughness={0.85} />
        </mesh>
      ))}
      <mesh position={[1.92, 0.5, 0.55]}>
        <boxGeometry args={[0.05, 0.16, 0.26]} />
        <meshBasicMaterial color={isNight ? '#FFFFFF' : '#CBD5E1'} />
      </mesh>
      <mesh position={[1.92, 0.5, -0.55]}>
        <boxGeometry args={[0.05, 0.16, 0.26]} />
        <meshBasicMaterial color={isNight ? '#FFFFFF' : '#CBD5E1'} />
      </mesh>
      <mesh position={[-1.92, 0.5, 0.55]}>
        <boxGeometry args={[0.05, 0.16, 0.26]} />
        <meshBasicMaterial color={isNight || isBraking ? '#EF4444' : '#64748B'} />
      </mesh>
      <mesh position={[-1.92, 0.5, -0.55]}>
        <boxGeometry args={[0.05, 0.16, 0.26]} />
        <meshBasicMaterial color={isNight || isBraking ? '#EF4444' : '#64748B'} />
      </mesh>
    </group>
  );
}

/**
 * Traffic Component - Vehicles along Tay Son Boulevard (Z = 67.4 & 72.6) & internal campus avenue (Z = 42)
 * Gated by showTraffic from useQualityStore.
 */
export default function Traffic({ hour = 12 }) {
  const showTraffic = useQualityStore((s) => s.showTraffic);
  const forceNightLights = useQualityStore((s) => s.forceNightLights);
  const isNight = hour < 6 || hour > 18.2 || forceNightLights;
  const isPeak = (hour >= 7 && hour <= 9) || (hour >= 17 && hour <= 19);

  const initialCars = useMemo(
    () => [
      // Tay Son Westbound (Z = 67.4)
      { id: 1, dir: -1, z: 67.4, minX: -116, maxX: 116, x: -90, speed: 18, type: 'sedan', color: '#DC2626' },
      { id: 2, dir: -1, z: 67.4, minX: -116, maxX: 116, x: -45, speed: 22, type: 'taxi', color: '#FACC15' },
      { id: 3, dir: -1, z: 67.4, minX: -116, maxX: 116, x: 5, speed: 17, type: 'bus', color: '#0284C7' },
      { id: 4, dir: -1, z: 67.4, minX: -116, maxX: 116, x: 55, speed: 20, type: 'van', color: '#F8FAFC' },
      { id: 5, dir: -1, z: 67.4, minX: -116, maxX: 116, x: 95, speed: 21, type: 'sedan', color: '#10B981' },
      // Tay Son Eastbound (Z = 72.6)
      { id: 6, dir: 1, z: 72.6, minX: -116, maxX: 116, x: -100, speed: 20, type: 'taxi', color: '#FACC15' },
      { id: 7, dir: 1, z: 72.6, minX: -116, maxX: 116, x: -55, speed: 19, type: 'sedan', color: '#2563EB' },
      { id: 8, dir: 1, z: 72.6, minX: -116, maxX: 116, x: -10, speed: 16, type: 'bus', color: '#0284C7' },
      { id: 9, dir: 1, z: 72.6, minX: -116, maxX: 116, x: 40, speed: 23, type: 'sedan', color: '#7C3AED' },
      { id: 10, dir: 1, z: 72.6, minX: -116, maxX: 116, x: 88, speed: 19, type: 'van', color: '#F8FAFC' },
      // Campus internal slow shuttle cars (Z = 42)
      { id: 11, dir: 1, z: 42.0, minX: -86, maxX: 78, x: -50, speed: 7, type: 'sedan', color: '#E2E8F0' },
      { id: 12, dir: -1, z: 42.0, minX: -86, maxX: 78, x: 42, speed: 6.5, type: 'taxi', color: '#FACC15' },
    ],
    []
  );

  const carPositionsRef = useRef(initialCars.map((c) => ({ ...c })));
  const carGroupRefs = useRef([]);

  useFrame((_, delta) => {
    if (!showTraffic) return;
    const cars = carPositionsRef.current;
    const speedMult = isPeak ? 0.78 : 1.05;

    cars.forEach((car, i) => {
      car.x += car.dir * car.speed * delta * speedMult;
      if (car.dir < 0 && car.x < car.minX) {
        car.x = car.maxX + (i % 5) * 2;
      } else if (car.dir > 0 && car.x > car.maxX) {
        car.x = car.minX - (i % 5) * 2;
      }

      const grp = carGroupRefs.current[i];
      if (grp) {
        grp.position.set(car.x, 0.12, car.z);
        grp.rotation.y = car.dir < 0 ? Math.PI : 0;
      }
    });
  });

  if (!showTraffic) return null;

  return (
    <group name="TrafficSimulation">
      {initialCars.map((car, idx) => (
        <group
          key={car.id}
          ref={(el) => {
            carGroupRefs.current[idx] = el;
          }}
          position={[car.x, 0.12, car.z]}
        >
          <VehicleModel type={car.type} color={car.color} isNight={isNight} />
        </group>
      ))}
    </group>
  );
}
