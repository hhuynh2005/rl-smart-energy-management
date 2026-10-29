import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { useQualityStore } from '../../store/useQualityStore';

/**
 * Procedural Vehicle Visual Models (Sedan, Taxi, Van, Bus, Motorbike)
 */
function VehicleModel({ type = 'sedan', color = '#0284C7', isNight = false, isBraking = false }) {
  if (type === 'bus') {
    return (
      <group>
        {/* Bus Body */}
        <mesh position={[0, 1.25, 0]} castShadow>
          <boxGeometry args={[7.8, 2.1, 2.2]} />
          <meshStandardMaterial color="#0284C7" metalness={0.7} roughness={0.3} />
        </mesh>
        {/* Tinted Long Windows */}
        <mesh position={[0, 1.5, 0]}>
          <boxGeometry args={[7.6, 0.9, 2.24]} />
          <meshPhysicalMaterial color="#0F172A" roughness={0.1} metalness={0.9} clearcoat={1.0} />
        </mesh>
        {/* Wheels */}
        {[[-2.4, 0.35, 1.05], [2.4, 0.35, 1.05], [-2.4, 0.35, -1.05], [2.4, 0.35, -1.05]].map(([wx, wy, wz], wi) => (
          <mesh key={wi} position={[wx, wy, wz]} rotation={[0, 0, Math.PI / 2]} castShadow>
            <cylinderGeometry args={[0.38, 0.38, 0.28, 12]} />
            <meshStandardMaterial color="#1E293B" roughness={0.9} />
          </mesh>
        ))}
        {/* Headlights (Front is +X or -X depending on lane rotation) */}
        <mesh position={[3.92, 0.8, 0.7]}>
          <boxGeometry args={[0.06, 0.22, 0.3]} />
          <meshBasicMaterial color={isNight ? '#FFFFFF' : '#CBD5E1'} />
        </mesh>
        <mesh position={[3.92, 0.8, -0.7]}>
          <boxGeometry args={[0.06, 0.22, 0.3]} />
          <meshBasicMaterial color={isNight ? '#FFFFFF' : '#CBD5E1'} />
        </mesh>
        {/* Taillights */}
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
        {/* Delivery Van Body */}
        <mesh position={[0, 1.1, 0]} castShadow>
          <boxGeometry args={[4.8, 1.8, 1.9]} />
          <meshStandardMaterial color="#F8FAFC" metalness={0.6} roughness={0.3} />
        </mesh>
        {/* Front Cabin Windshield */}
        <mesh position={[1.4, 1.25, 0]}>
          <boxGeometry args={[1.6, 0.85, 1.92]} />
          <meshPhysicalMaterial color="#0F172A" roughness={0.1} metalness={0.9} />
        </mesh>
        {/* Wheels */}
        {[[-1.4, 0.35, 0.95], [1.4, 0.35, 0.95], [-1.4, 0.35, -0.95], [1.4, 0.35, -0.95]].map(([wx, wy, wz], wi) => (
          <mesh key={wi} position={[wx, wy, wz]} rotation={[0, 0, Math.PI / 2]} castShadow>
            <cylinderGeometry args={[0.34, 0.34, 0.24, 12]} />
            <meshStandardMaterial color="#1E293B" roughness={0.9} />
          </mesh>
        ))}
        {/* Headlights */}
        <mesh position={[2.42, 0.75, 0.6]}>
          <boxGeometry args={[0.06, 0.2, 0.25]} />
          <meshBasicMaterial color={isNight ? '#FFFFFF' : '#CBD5E1'} />
        </mesh>
        <mesh position={[2.42, 0.75, -0.6]}>
          <boxGeometry args={[0.06, 0.2, 0.25]} />
          <meshBasicMaterial color={isNight ? '#FFFFFF' : '#CBD5E1'} />
        </mesh>
        {/* Taillights */}
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

  // Default: Sedan / Taxi
  const isTaxi = type === 'taxi';
  const bodyColor = isTaxi ? '#FACC15' : color;

  return (
    <group>
      {/* Lower Chassis */}
      <mesh position={[0, 0.45, 0]} castShadow>
        <boxGeometry args={[3.8, 0.55, 1.7]} />
        <meshPhysicalMaterial
          color={bodyColor}
          roughness={0.15}
          metalness={0.85}
          clearcoat={1.0}
        />
      </mesh>
      {/* Upper Cabin Glass */}
      <mesh position={[-0.15, 0.95, 0]} castShadow>
        <boxGeometry args={[2.0, 0.5, 1.45]} />
        <meshPhysicalMaterial
          color="#0F172A"
          roughness={0.05}
          metalness={0.95}
          clearcoat={1.0}
        />
      </mesh>
      {/* Taxi Roof Sign */}
      {isTaxi && (
        <mesh position={[-0.15, 1.28, 0]}>
          <boxGeometry args={[0.6, 0.16, 0.35]} />
          <meshBasicMaterial color="#FEF08A" />
        </mesh>
      )}
      {/* 4 Wheels */}
      {[[-1.1, 0.28, 0.85], [1.1, 0.28, 0.85], [-1.1, 0.28, -0.85], [1.1, 0.28, -0.85]].map(([wx, wy, wz], wi) => (
        <mesh key={wi} position={[wx, wy, wz]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[0.28, 0.28, 0.2, 12]} />
          <meshStandardMaterial color="#1E293B" roughness={0.85} />
        </mesh>
      ))}
      {/* Headlights */}
      <mesh position={[1.92, 0.5, 0.55]}>
        <boxGeometry args={[0.05, 0.16, 0.26]} />
        <meshBasicMaterial color={isNight ? '#FFFFFF' : '#CBD5E1'} />
      </mesh>
      <mesh position={[1.92, 0.5, -0.55]}>
        <boxGeometry args={[0.05, 0.16, 0.26]} />
        <meshBasicMaterial color={isNight ? '#FFFFFF' : '#CBD5E1'} />
      </mesh>
      {/* Taillights */}
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
 * Traffic Component - Real-time Continuous Vehicle Flow
 */
export default function Traffic({ hour = 12 }) {
  const { forceNightLights } = useQualityStore();
  const isNight = (hour < 6 || hour > 18.5) || forceNightLights;
  const isPeak = (hour >= 7 && hour <= 9) || (hour >= 17 && hour <= 19);

  // Initial Pool of 12 vehicles (Eastbound & Westbound)
  const initialCars = useMemo(() => {
    return [
      // Lane 1: Westbound (Z = -6.2, moving towards -X, rotation = PI)
      { id: 1, lane: 'west', x: -45, speed: 18, type: 'sedan', color: '#EF4444' },
      { id: 2, lane: 'west', x: -25, speed: 22, type: 'taxi',  color: '#FACC15' },
      { id: 3, lane: 'west', x: -5,  speed: 19, type: 'van',   color: '#F8FAFC' },
      { id: 4, lane: 'west', x: 15,  speed: 16, type: 'bus',   color: '#0284C7' },
      { id: 5, lane: 'west', x: 35,  speed: 24, type: 'sedan', color: '#10B981' },
      { id: 6, lane: 'west', x: 55,  speed: 20, type: 'sedan', color: '#64748B' },

      // Lane 2: Eastbound (Z = -9.8, moving towards +X, rotation = 0)
      { id: 7,  lane: 'east', x: -50, speed: 21, type: 'taxi',  color: '#FACC15' },
      { id: 8,  lane: 'east', x: -30, speed: 19, type: 'sedan', color: '#3B82F6' },
      { id: 9,  lane: 'east', x: -10, speed: 17, type: 'bus',   color: '#0284C7' },
      { id: 10, lane: 'east', x: 10,  speed: 23, type: 'sedan', color: '#A855F7' },
      { id: 11, lane: 'east', x: 30,  speed: 20, type: 'van',   color: '#F8FAFC' },
      { id: 12, lane: 'east', x: 50,  speed: 22, type: 'sedan', color: '#E2E8F0' },
    ];
  }, []);

  const carPositionsRef = useRef(initialCars.map((c) => ({ ...c })));
  const carGroupRefs = useRef([]);

  // Animate traffic movement in useFrame
  useFrame((_, delta) => {
    const cars = carPositionsRef.current;
    const speedMult = isPeak ? 0.75 : 1.1; // Slower during rush hour congestion

    cars.forEach((car, i) => {
      if (car.lane === 'west') {
        // Moving towards -X
        car.x -= car.speed * delta * speedMult;
        if (car.x < -65) {
          car.x = 65 + Math.random() * 8;
        }
      } else {
        // Moving towards +X
        car.x += car.speed * delta * speedMult;
        if (car.x > 65) {
          car.x = -65 - Math.random() * 8;
        }
      }

      const grp = carGroupRefs.current[i];
      if (grp) {
        const laneZ = car.lane === 'west' ? -6.2 : -9.8;
        const rotY = car.lane === 'west' ? Math.PI : 0;
        grp.position.set(car.x, 0.15, laneZ);
        grp.rotation.y = rotY;
      }
    });
  });

  return (
    <group name="TrafficSimulation">
      {initialCars.map((car, idx) => (
        <group
          key={car.id}
          ref={(el) => { carGroupRefs.current[idx] = el; }}
          position={[car.x, 0.15, car.lane === 'west' ? -6.2 : -9.8]}
        >
          <VehicleModel
            type={car.type}
            color={car.color}
            isNight={isNight}
          />
        </group>
      ))}
    </group>
  );
}

