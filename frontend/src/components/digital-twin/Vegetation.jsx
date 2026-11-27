import React, { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { TREE_CLUSTERS } from './campusLayout';

/**
 * Vegetation Component - TLU Campus Shade Trees & Perimeter Hedges
 * Instanced for crisp 60 FPS across 30+ campus tree clusters.
 */
export default function Vegetation() {
  const foliageMeshRef = useRef();
  const trunkMeshRef = useRef();
  const hedgeMeshRef = useRef();

  const dummy = useMemo(() => new THREE.Object3D(), []);

  const treePlacements = useMemo(
    () =>
      TREE_CLUSTERS.map((t, idx) => ({
        ...t,
        rotY: (idx * 0.9) % (Math.PI * 2),
        swayPhase: idx * 0.65,
      })),
    []
  );

  const hedgePlacements = useMemo(
    () => [
      { x: -32, y: 0.45, z: 62.5, sx: 40, sy: 0.9, sz: 0.7 },
      { x: 30, y: 0.45, z: 62.5, sx: 46, sy: 0.9, sz: 0.7 },
      { x: -94, y: 0.45, z: 62.5, sx: 28, sy: 0.9, sz: 0.7 },
      { x: 94, y: 0.45, z: 62.5, sx: 28, sy: 0.9, sz: 0.7 },
    ],
    []
  );

  useFrame(({ clock }) => {
    const time = clock.getElapsedTime();

    if (foliageMeshRef.current && trunkMeshRef.current) {
      treePlacements.forEach((d, i) => {
        const sway = Math.sin(time * 1.4 + d.swayPhase) * 0.04 * d.scale;
        dummy.position.set(d.x + sway, 3.8 * d.scale, d.z);
        dummy.rotation.set(sway * 0.4, d.rotY, sway);
        dummy.scale.set(d.scale, d.scale * 1.12, d.scale);
        dummy.updateMatrix();
        foliageMeshRef.current.setMatrixAt(i, dummy.matrix);

        dummy.position.set(d.x, 1.4 * d.scale, d.z);
        dummy.rotation.set(0, d.rotY, 0);
        dummy.scale.set(d.scale, d.scale, d.scale);
        dummy.updateMatrix();
        trunkMeshRef.current.setMatrixAt(i, dummy.matrix);
      });
      foliageMeshRef.current.instanceMatrix.needsUpdate = true;
      trunkMeshRef.current.instanceMatrix.needsUpdate = true;
    }

    if (hedgeMeshRef.current) {
      hedgePlacements.forEach((h, i) => {
        dummy.position.set(h.x, h.y, h.z);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(h.sx, h.sy, h.sz);
        dummy.updateMatrix();
        hedgeMeshRef.current.setMatrixAt(i, dummy.matrix);
      });
      hedgeMeshRef.current.instanceMatrix.needsUpdate = true;
    }
  });

  return (
    <group name="TLUCampusVegetation">
      <instancedMesh
        ref={trunkMeshRef}
        args={[null, null, treePlacements.length]}
        castShadow
      >
        <cylinderGeometry args={[0.24, 0.34, 2.8, 8]} />
        <meshStandardMaterial color="#5C4033" roughness={0.9} />
      </instancedMesh>

      <instancedMesh
        ref={foliageMeshRef}
        args={[null, null, treePlacements.length]}
        castShadow
      >
        <dodecahedronGeometry args={[2.1, 1]} />
        <meshStandardMaterial color="#2D6A31" roughness={0.85} />
      </instancedMesh>

      <instancedMesh
        ref={hedgeMeshRef}
        args={[null, null, hedgePlacements.length]}
        castShadow
      >
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#1F5127" roughness={0.88} />
      </instancedMesh>
    </group>
  );
}
