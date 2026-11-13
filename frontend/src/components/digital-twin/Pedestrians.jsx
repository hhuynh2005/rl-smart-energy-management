import React, { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { PEDESTRIAN_PATHS } from './campusLayout';
import { useQualityStore } from '../../store/useQualityStore';

/**
 * Pedestrians Component - Instanced walking students/visitors along TLU walkways
 * Controlled via the "Người đi bộ" checkbox in FloatingControlPanel.
 */
export default function Pedestrians() {
  const showPedestrians = useQualityStore((s) => s.showPedestrians);
  const bodyRef = useRef();
  const headRef = useRef();
  const dummy = useMemo(() => new THREE.Object3D(), []);

  // Precompute segment lengths for each closed path loop
  const pathData = useMemo(() => {
    return PEDESTRIAN_PATHS.map((pts) => {
      const segs = [];
      let totalLen = 0;
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i];
        const b = pts[(i + 1) % pts.length];
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (len > 0.01) {
          segs.push({ a, b, len, start: totalLen });
          totalLen += len;
        }
      }
      return { segs, totalLen };
    });
  }, []);

  const walkers = useMemo(() => {
    const arr = [];
    const totalWalkers = 30;
    for (let i = 0; i < totalWalkers; i++) {
      const pathIdx = i % pathData.length;
      const offset = (i / totalWalkers) * pathData[pathIdx].totalLen;
      const speed = 1.6 + (i % 4) * 0.25;
      const laneSide = (i % 2 === 0 ? 1 : -1) * 0.7;
      arr.push({ pathIdx, offset, speed, laneSide, phase: i * 1.1 });
    }
    return arr;
  }, [pathData]);

  useFrame(({ clock }) => {
    if (!showPedestrians || !bodyRef.current || !headRef.current) return;
    const t = clock.getElapsedTime();

    walkers.forEach((w, idx) => {
      const p = pathData[w.pathIdx];
      const dist = (w.offset + t * w.speed) % p.totalLen;

      let activeSeg = p.segs[0];
      for (let s = 0; s < p.segs.length; s++) {
        if (dist >= p.segs[s].start && dist <= p.segs[s].start + p.segs[s].len) {
          activeSeg = p.segs[s];
          break;
        }
      }

      const localT = (dist - activeSeg.start) / activeSeg.len;
      const dx = activeSeg.b[0] - activeSeg.a[0];
      const dz = activeSeg.b[1] - activeSeg.a[1];
      const nx = -dz / activeSeg.len;
      const nz = dx / activeSeg.len;

      const x = activeSeg.a[0] + dx * localT + nx * w.laneSide;
      const z = activeSeg.a[1] + dz * localT + nz * w.laneSide;
      const bob = Math.abs(Math.sin(t * 7 + w.phase)) * 0.08;

      dummy.position.set(x, 0.75 + bob, z);
      dummy.rotation.set(0, Math.atan2(dx, dz), 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      bodyRef.current.setMatrixAt(idx, dummy.matrix);

      dummy.position.set(x, 1.38 + bob, z);
      dummy.updateMatrix();
      headRef.current.setMatrixAt(idx, dummy.matrix);
    });

    bodyRef.current.instanceMatrix.needsUpdate = true;
    headRef.current.instanceMatrix.needsUpdate = true;
  });

  if (!showPedestrians) return null;

  return (
    <group name="TLUPedestrians">
      <instancedMesh ref={bodyRef} args={[null, null, walkers.length]} castShadow>
        <capsuleGeometry args={[0.24, 0.65, 4, 8]} />
        <meshStandardMaterial color="#B91C1C" roughness={0.7} />
      </instancedMesh>
      <instancedMesh ref={headRef} args={[null, null, walkers.length]} castShadow>
        <sphereGeometry args={[0.2, 8, 8]} />
        <meshStandardMaterial color="#FDE68A" roughness={0.6} />
      </instancedMesh>
    </group>
  );
}
