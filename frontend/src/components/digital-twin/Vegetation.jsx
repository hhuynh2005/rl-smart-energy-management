import React, { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';

/**
 * Vegetation Component - Clean, Purposeful Urban Landscape Foliage
 * Reduced by 80% per specification:
 * - 2 Landscaped shade trees in the front courtyard
 * - Dải cây xanh hàng lối phía sau nhà (Z = 18)
 * - Vài cây viền quanh khuôn viên Solar và BESS
 * - Hàng rào cây thấp (trimmed boxwood hedges) ngăn cách sân và vỉa hè
 * - Đung đưa nhẹ theo gió trong useFrame
 */
export default function Vegetation() {
  const foliageMeshRef = useRef();
  const trunkMeshRef = useRef();
  const hedgeMeshRef = useRef();

  const dummy = useMemo(() => new THREE.Object3D(), []);

  // Purposeful tree placements
  const treePlacements = useMemo(() => {
    return [
      // 1. Front Courtyard Landscaped Trees (Left & Right of Driveway)
      { x: -5.5, z: 2.5, scale: 0.95, rotY: 0.4, swayPhase: 0.2 },
      { x: 8.5,  z: 2.2, scale: 0.90, rotY: 1.2, swayPhase: 1.5 },

      // 2. Greenbelt Tree Belt Behind the House (Z = 18)
      { x: -16, z: 18, scale: 1.15, rotY: 0.8, swayPhase: 0.5 },
      { x: -10, z: 18, scale: 1.25, rotY: 2.1, swayPhase: 1.1 },
      { x: -4,  z: 18, scale: 1.10, rotY: 1.4, swayPhase: 2.3 },
      { x: 2,   z: 18, scale: 1.20, rotY: 0.5, swayPhase: 0.9 },
      { x: 8,   z: 18, scale: 1.15, rotY: 2.8, swayPhase: 1.8 },
      { x: 14,  z: 18, scale: 1.30, rotY: 1.9, swayPhase: 2.7 },
      { x: 20,  z: 18, scale: 1.10, rotY: 0.3, swayPhase: 0.4 },

      // 3. Side Perimeter Trees (Solar & BESS Flanks)
      { x: -25, z: 12, scale: 1.1, rotY: 1.6, swayPhase: 1.3 },
      { x: -25, z: 6,  scale: 1.0, rotY: 0.9, swayPhase: 2.0 },
      { x: 28,  z: 12, scale: 1.1, rotY: 2.2, swayPhase: 0.7 },
      { x: 28,  z: 6,  scale: 1.0, rotY: 1.1, swayPhase: 1.9 },

      // 4. Pond Garden Accent Trees
      { x: 34,  z: 18, scale: 1.05, rotY: 0.6, swayPhase: 2.5 },
      { x: 42,  z: 14, scale: 1.20, rotY: 1.7, swayPhase: 1.2 },
    ];
  }, []);

  // Hedge borders along courtyard front fence
  const hedgePlacements = useMemo(() => {
    return [
      { x: -6.5, y: 0.4, z: -0.2, sx: 4.0, sy: 0.8, sz: 0.8 },
      { x: 6.5,  y: 0.4, z: -0.2, sx: 4.0, sy: 0.8, sz: 0.8 },
      { x: -18,  y: 0.4, z: -0.2, sx: 8.0, sy: 0.8, sz: 0.8 },
      { x: 18,   y: 0.4, z: -0.2, sx: 8.0, sy: 0.8, sz: 0.8 },
    ];
  }, []);

  // Natural boulders around pond garden
  const boulders = useMemo(() => [
    { x: 32, y: 0.6, z: 15, s: 1.2 },
    { x: 44, y: 0.8, z: 17, s: 1.5 },
    { x: 39, y: 0.5, z: 21, s: 1.1 },
    { x: -14, y: 0.5, z: 2.8, s: 0.9 },
  ], []);

  // Ambient wind sway animation
  useFrame(({ clock }) => {
    const time = clock.getElapsedTime();

    if (foliageMeshRef.current && trunkMeshRef.current) {
      treePlacements.forEach((d, i) => {
        const sway = Math.sin(time * 1.5 + d.swayPhase) * 0.035 * d.scale;
        dummy.position.set(d.x + sway, 3.8 * d.scale, d.z);
        dummy.rotation.set(sway * 0.4, d.rotY, sway);
        dummy.scale.set(d.scale, d.scale * 1.1, d.scale);
        dummy.updateMatrix();
        foliageMeshRef.current.setMatrixAt(i, dummy.matrix);

        // Trunk
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
    <group name="PurposefulUrbanVegetation">
      {/* 1. Shade Trees (Trunks & Canopies) */}
      <instancedMesh
        ref={trunkMeshRef}
        args={[null, null, treePlacements.length]}
        castShadow
      >
        <cylinderGeometry args={[0.22, 0.32, 2.8, 8]} />
        <meshStandardMaterial color="#4A3525" roughness={0.9} />
      </instancedMesh>

      <instancedMesh
        ref={foliageMeshRef}
        args={[null, null, treePlacements.length]}
        castShadow
      >
        <dodecahedronGeometry args={[2.2, 1]} />
        <meshStandardMaterial
          color="#2E5A27"
          roughness={0.75}
          metalness={0.0}
        />
      </instancedMesh>

      {/* 2. Trimmed Hedges */}
      <instancedMesh
        ref={hedgeMeshRef}
        args={[null, null, hedgePlacements.length]}
        castShadow
      >
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#1E4D2B" roughness={0.85} />
      </instancedMesh>

      {/* 3. Granite Boulders */}
      {boulders.map((b, idx) => (
        <mesh
          key={idx}
          position={[b.x, b.y, b.z]}
          scale={[b.s, b.s * 0.7, b.s * 1.1]}
          castShadow
          receiveShadow
        >
          <dodecahedronGeometry args={[1, 1]} />
          <meshStandardMaterial color="#64748B" roughness={0.9} metalness={0.1} />
        </mesh>
      ))}
    </group>
  );
}
