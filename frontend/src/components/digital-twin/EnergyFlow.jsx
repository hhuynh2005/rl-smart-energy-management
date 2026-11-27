import React, { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { MICROGRID_NODES } from './campusLayout';
import { useQualityStore } from '../../store/useQualityStore';

/**
 * Single Conduit Flow Line with Traveling Energy Particles
 */
function ConduitFlow({
  curve,
  powerKw = 0,
  color = '#F59E0B',
  reverse = false,
  maxParticles = 22,
}) {
  const showFlows = useQualityStore((s) => s.showFlows);
  const getConfig = useQualityStore((s) => s.getConfig);
  const config = getConfig();

  const particlesRef = useRef();
  const dummy = useMemo(() => new THREE.Object3D(), []);

  const isActive = showFlows && powerKw > 0.1;
  const numParticles = Math.min(
    maxParticles,
    Math.max(5, Math.floor((powerKw / 18) * 8 * (config.particlesPerKw || 0.8)))
  );

  const particleOffsets = useMemo(() => {
    const arr = [];
    for (let i = 0; i < maxParticles; i++) {
      arr.push(i / maxParticles);
    }
    return arr;
  }, [maxParticles]);

  useFrame(({ clock }) => {
    if (!isActive || !particlesRef.current) return;
    const time = clock.getElapsedTime();
    const speed = Math.min(0.85, 0.16 + (powerKw / 110) * 0.6);

    for (let i = 0; i < numParticles; i++) {
      let t = (time * speed + particleOffsets[i]) % 1.0;
      if (reverse) t = 1.0 - t;

      const pt = curve.getPointAt(t);
      const tangent = curve.getTangentAt(t);

      dummy.position.copy(pt);
      dummy.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tangent);
      const pulse = 1.0 + Math.sin(time * 7 + i) * 0.22;
      const scale = Math.min(0.45, 0.24 + (powerKw / 140) * 0.18) * pulse;
      dummy.scale.set(scale, scale * 1.4, scale);
      dummy.updateMatrix();

      particlesRef.current.setMatrixAt(i, dummy.matrix);
    }
    particlesRef.current.instanceMatrix.needsUpdate = true;
  });

  if (!showFlows) return null;

  return (
    <group>
      <mesh>
        <tubeGeometry args={[curve, 36, isActive ? 0.14 : 0.06, 8, false]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={isActive ? 0.85 : 0.15}
          roughness={0.2}
          transparent
          opacity={isActive ? 0.78 : 0.22}
        />
      </mesh>

      {isActive && (
        <mesh>
          <tubeGeometry args={[curve, 36, 0.05, 6, false]} />
          <meshBasicMaterial color="#FFFFFF" transparent opacity={0.85} />
        </mesh>
      )}

      {isActive && (
        <instancedMesh ref={particlesRef} args={[null, null, numParticles]}>
          <sphereGeometry args={[1, 8, 8]} />
          <meshBasicMaterial color={color} />
        </instancedMesh>
      )}
    </group>
  );
}

/**
 * EnergyFlow Component - Visualizes TLU Campus Microgrid Power Routing
 * Anchored directly to MICROGRID_NODES (Solar PV, BESS, EVN Substation, Central Hub at A1) + K1 Tower feeder.
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

  const curves = useMemo(() => {
    const solarPt = new THREE.Vector3(MICROGRID_NODES.solar.x, 3.2, MICROGRID_NODES.solar.z);
    const bessPt = new THREE.Vector3(MICROGRID_NODES.bess.x, 3.2, MICROGRID_NODES.bess.z);
    const gridPt = new THREE.Vector3(MICROGRID_NODES.grid.x, 4.2, MICROGRID_NODES.grid.z + 3.5);
    const hubPt = new THREE.Vector3(MICROGRID_NODES.hub.x, 6.5, MICROGRID_NODES.hub.z);
    const k1Pt = new THREE.Vector3(16, 12.0, -56);

    const pvToHouse = new THREE.CatmullRomCurve3([
      solarPt,
      new THREE.Vector3(-28, 12.0, -10),
      hubPt,
    ]);

    const pvToBatt = new THREE.CatmullRomCurve3([
      solarPt,
      new THREE.Vector3(-68, 7.5, -36),
      bessPt,
    ]);

    const pvToGrid = new THREE.CatmullRomCurve3([
      solarPt,
      new THREE.Vector3(-76, 9.0, -48),
      gridPt,
    ]);

    const battToHouse = new THREE.CatmullRomCurve3([
      bessPt,
      new THREE.Vector3(-54, 10.5, -6),
      hubPt,
    ]);

    const gridToHouse = new THREE.CatmullRomCurve3([
      gridPt,
      new THREE.Vector3(-56, 12.5, -16),
      hubPt,
    ]);

    const gridToBatt = new THREE.CatmullRomCurve3([
      gridPt,
      new THREE.Vector3(-94, 7.0, -45),
      bessPt,
    ]);

    const hubToK1 = new THREE.CatmullRomCurve3([
      hubPt,
      new THREE.Vector3(6, 13.0, -18),
      k1Pt,
    ]);

    return { pvToHouse, pvToBatt, pvToGrid, battToHouse, gridToHouse, gridToBatt, hubToK1 };
  }, []);

  return (
    <group name="TLUEnergyFlowNetwork">
      <ConduitFlow curve={curves.pvToHouse} powerKw={flows.pv_to_house} color="#F59E0B" />
      <ConduitFlow curve={curves.pvToBatt} powerKw={flows.pv_to_batt} color="#06B6D4" />
      <ConduitFlow curve={curves.pvToGrid} powerKw={flows.pv_to_grid} color="#10B981" />
      <ConduitFlow curve={curves.battToHouse} powerKw={flows.batt_to_house} color="#EA580C" />
      <ConduitFlow curve={curves.gridToHouse} powerKw={flows.grid_to_house} color="#7C3AED" />
      <ConduitFlow curve={curves.gridToBatt} powerKw={flows.grid_to_batt} color="#06B6D4" />
      <ConduitFlow curve={curves.hubToK1} powerKw={(stepData.p_load_kw || 0) * 0.35} color="#2563EB" />
    </group>
  );
}
