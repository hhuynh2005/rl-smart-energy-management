import React, { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { useQualityStore } from '../../store/useQualityStore';

/**
 * Single Conduit Flow Line with Traveling Energy Particles
 */
function ConduitFlow({
  curve,
  powerKw = 0,
  color = '#F59E0B',
  reverse = false,
  maxParticles = 18,
}) {
  const { showFlows, getConfig } = useQualityStore();
  const config = getConfig();

  const particlesRef = useRef();
  const dummy = useMemo(() => new THREE.Object3D(), []);

  const isActive = showFlows && powerKw > 0.1;
  const numParticles = Math.min(
    maxParticles,
    Math.max(4, Math.floor((powerKw / 20) * 8 * (config.particlesPerKw || 0.8)))
  );

  // Pre-generate particle offset phases
  const particleOffsets = useMemo(() => {
    const arr = [];
    for (let i = 0; i < maxParticles; i++) {
      arr.push(i / maxParticles);
    }
    return arr;
  }, [maxParticles]);

  // Animate particles traveling along the CatmullRom curve
  useFrame(({ clock }) => {
    if (!isActive || !particlesRef.current) return;
    const time = clock.getElapsedTime();
    // Flow speed proportional to kW (bounded between 0.2 and 1.2 loops/sec)
    const speed = Math.min(1.2, 0.2 + (powerKw / 100) * 0.8);

    for (let i = 0; i < numParticles; i++) {
      let t = (time * speed + particleOffsets[i]) % 1.0;
      if (reverse) t = 1.0 - t;

      const pt = curve.getPointAt(t);
      const tangent = curve.getTangentAt(t);

      dummy.position.copy(pt);
      dummy.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tangent);
      // Pulsing scale
      const pulse = 1.0 + Math.sin(time * 8 + i) * 0.25;
      const scale = Math.min(0.24, 0.12 + (powerKw / 150) * 0.12) * pulse;
      dummy.scale.set(scale, scale * 1.5, scale);
      dummy.updateMatrix();

      particlesRef.current.setMatrixAt(i, dummy.matrix);
    }
    particlesRef.current.instanceMatrix.needsUpdate = true;
  });

  if (!showFlows) return null;

  return (
    <group>
      {/* 1. Translucent 3D Conduit Tube Sheath */}
      <mesh>
        <tubeGeometry args={[curve, 32, isActive ? 0.07 : 0.035, 8, false]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={isActive ? 0.85 : 0.15}
          roughness={0.2}
          transparent
          opacity={isActive ? 0.75 : 0.2}
        />
      </mesh>

      {/* 2. Inner Laser Energy Core */}
      {isActive && (
        <mesh>
          <tubeGeometry args={[curve, 32, 0.025, 6, false]} />
          <meshBasicMaterial color="#FFFFFF" transparent opacity={0.8} />
        </mesh>
      )}

      {/* 3. Traveling Energy Pulses / Photon Particles */}
      {isActive && (
        <instancedMesh
          ref={particlesRef}
          args={[null, null, numParticles]}
        >
          <sphereGeometry args={[1, 10, 10]} />
          <meshBasicMaterial color={color} />
        </instancedMesh>
      )}
    </group>
  );
}

/**
 * EnergyFlow Component - Visualizes Multi-directional Microgrid Power Routing
 * Supports all 6 directional branches:
 * - PV to House (Amber-Gold)
 * - PV to Battery (Amber to Cyan)
 * - PV to Grid (Surplus Solar Export - Neon Green)
 * - Battery to House (Peak Shaving Discharge - Vibrant Coral)
 * - Grid to House (Grid Purchase - Cyber Purple)
 * - Grid to Battery (Off-peak TOU Charging - Cyan)
 */
export default function EnergyFlow({ stepData = {} }) {
  const flows = stepData.flows || {
    pv_to_house: stepData.p_pv_kw > 0 ? Math.min(stepData.p_pv_kw, stepData.p_load_kw) : 0,
    pv_to_batt: stepData.p_batt_kw > 0 ? Math.min(stepData.p_pv_kw, stepData.p_batt_kw) : 0,
    pv_to_grid: stepData.p_sell_kw || 0,
    batt_to_house: stepData.p_batt_kw < 0 ? Math.abs(stepData.p_batt_kw) : 0,
    grid_to_house: stepData.p_buy_kw || 0,
    grid_to_batt: 0,
  };

  // Node Anchors in 3D Space
  // Solar Field Inverter: [10.5, 0.6, 8.0]
  // House Main Electrical Panel: [-1.2, 0.6, 5.0]
  // BESS Container Switchgear: [-14.5, 0.6, 8.0]
  // Grid Distribution Substation: [-28.0, 0.6, 6.0]
  // EV Charger Post: [3.5, 0.6, 2.8]

  const isOffPeakCharging = (stepData.hour >= 22.0 || stepData.hour < 4.0);

  const curves = useMemo(() => {
    // 1. PV -> House
    const pvToHouse = new THREE.CatmullRomCurve3([
      new THREE.Vector3(10.5, 0.6, 8.0),
      new THREE.Vector3(4.8, 1.2, 6.5),
      new THREE.Vector3(-1.2, 0.6, 5.0),
    ]);

    // 2. PV -> BESS (Charging)
    const pvToBatt = new THREE.CatmullRomCurve3([
      new THREE.Vector3(10.5, 0.6, 8.0),
      new THREE.Vector3(0, 1.6, 12.0),
      new THREE.Vector3(-14.5, 0.6, 8.0),
    ]);

    // 3. PV -> Grid (Export)
    const pvToGrid = new THREE.CatmullRomCurve3([
      new THREE.Vector3(10.5, 0.6, 8.0),
      new THREE.Vector3(0, 1.4, 0.5),
      new THREE.Vector3(-18.0, 1.0, 2.0),
      new THREE.Vector3(-28.0, 0.8, 6.0),
    ]);

    // 4. BESS -> House (Discharge)
    const battToHouse = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-14.5, 0.6, 8.0),
      new THREE.Vector3(-7.5, 1.1, 6.5),
      new THREE.Vector3(-1.2, 0.6, 5.0),
    ]);

    // 5. Grid -> House (Import)
    const gridToHouse = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-28.0, 0.8, 6.0),
      new THREE.Vector3(-15.0, 1.1, 4.0),
      new THREE.Vector3(-1.2, 0.6, 5.0),
    ]);

    // 6. Grid -> BESS (Off-peak charging)
    const gridToBatt = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-28.0, 0.8, 6.0),
      new THREE.Vector3(-20.0, 1.0, 7.5),
      new THREE.Vector3(-14.5, 0.6, 8.0),
    ]);

    // 7. House -> EV Charger (Off-peak smart EV charging)
    const houseToEv = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-1.2, 0.6, 5.0),
      new THREE.Vector3(1.2, 0.8, 3.8),
      new THREE.Vector3(3.5, 0.6, 2.8),
    ]);

    return { pvToHouse, pvToBatt, pvToGrid, battToHouse, gridToHouse, gridToBatt, houseToEv };
  }, []);

  return (
    <group name="EnergyFlowNetwork">
      {/* 1. Solar PV -> House Load */}
      <ConduitFlow
        curve={curves.pvToHouse}
        powerKw={flows.pv_to_house}
        color="#F59E0B"
        reverse={false}
      />

      {/* 2. Solar PV -> BESS Battery (Charging) */}
      <ConduitFlow
        curve={curves.pvToBatt}
        powerKw={flows.pv_to_batt}
        color="#06B6D4"
        reverse={false}
      />

      {/* 3. Solar PV Surplus -> Grid (Exporting) */}
      <ConduitFlow
        curve={curves.pvToGrid}
        powerKw={flows.pv_to_grid}
        color="#10B981"
        reverse={false}
      />

      {/* 4. BESS Battery -> House Load (Discharging) */}
      <ConduitFlow
        curve={curves.battToHouse}
        powerKw={flows.batt_to_house}
        color="#F97316"
        reverse={false}
      />

      {/* 5. EVN Grid -> House Load (Importing) */}
      <ConduitFlow
        curve={curves.gridToHouse}
        powerKw={flows.grid_to_house}
        color="#8B5CF6"
        reverse={false}
      />

      {/* 6. EVN Grid -> BESS (Off-peak charging) */}
      <ConduitFlow
        curve={curves.gridToBatt}
        powerKw={flows.grid_to_batt}
        color="#06B6D4"
        reverse={false}
      />

      {/* 7. House -> EV Charger (Off-peak smart EV charging at 7.4 kW) */}
      {isOffPeakCharging && (
        <ConduitFlow
          curve={curves.houseToEv}
          powerKw={7.4}
          color="#06B6D4"
          reverse={false}
        />
      )}
    </group>
  );
}

