import React, { useMemo } from 'react';
import {
  CAMPUS_ROADS,
  CAMPUS_ZONES,
  MICROGRID_NODES,
} from './campusLayout';
import {
  getGrassTexture,
  getAsphaltTexture,
  getConcreteTexture,
  getFootballPitchTexture,
  getVolleyballCourtTexture,
  getCampusPlazaTexture,
} from './textures';

/**
 * RoadSegment renders a single straight road segment between two 2D points.
 */
function RoadSegment({ points, width, asphaltTex }) {
  const [p1, p2] = points;
  const dx = p2[0] - p1[0];
  const dz = p2[1] - p1[1];
  const length = Math.hypot(dx, dz);
  const cx = (p1[0] + p2[0]) / 2;
  const cz = (p1[1] + p2[1]) / 2;
  const angle = Math.atan2(dx, dz);

  return (
    <group position={[cx, 0.03, cz]} rotation={[0, angle, 0]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[width, length]} />
        <meshStandardMaterial map={asphaltTex} roughness={0.78} metalness={0.08} />
      </mesh>
      {/* Side curbs */}
      <mesh position={[-width / 2 - 0.15, 0.07, 0]} receiveShadow>
        <boxGeometry args={[0.3, 0.14, length]} />
        <meshStandardMaterial color="#CBD5E1" roughness={0.8} />
      </mesh>
      <mesh position={[width / 2 + 0.15, 0.07, 0]} receiveShadow>
        <boxGeometry args={[0.3, 0.14, length]} />
        <meshStandardMaterial color="#CBD5E1" roughness={0.8} />
      </mesh>
    </group>
  );
}

/**
 * CampusGate renders an entrance gate arch at Cổng trước, Cổng sau, or Cổng KTX.
 */
function CampusGate({ x, z, width = 12, isNight = false, main = false }) {
  return (
    <group position={[x, 0, z]}>
      {/* Left & Right Pillars */}
      <mesh position={[-width / 2, 2.4, 0]} castShadow>
        <boxGeometry args={[1.1, 4.8, 1.1]} />
        <meshStandardMaterial color={main ? '#991B1B' : '#475569'} roughness={0.5} />
      </mesh>
      <mesh position={[width / 2, 2.4, 0]} castShadow>
        <boxGeometry args={[1.1, 4.8, 1.1]} />
        <meshStandardMaterial color={main ? '#991B1B' : '#475569'} roughness={0.5} />
      </mesh>
      {/* Top Beam Signboard */}
      <mesh position={[0, 4.5, 0]} castShadow>
        <boxGeometry args={[width + 1.4, 0.9, 0.9]} />
        <meshStandardMaterial
          color={main ? '#B91C1C' : '#334155'}
          emissive={isNight && main ? '#EF4444' : '#000000'}
          emissiveIntensity={isNight ? 0.45 : 0}
        />
      </mesh>
      {/* Gate Pillar Lamps */}
      {[-width / 2, width / 2].map((lx, idx) => (
        <mesh key={idx} position={[lx, 5.05, 0]}>
          <sphereGeometry args={[0.26, 10, 10]} />
          <meshBasicMaterial color={isNight ? '#FEF08A' : '#E2E8F0'} />
        </mesh>
      ))}
    </group>
  );
}

export default function CampusGrounds({ isNight = false }) {
  const grassTex = useMemo(() => {
    const t = getGrassTexture();
    t.repeat.set(22, 16);
    return t;
  }, []);

  const asphaltTex = useMemo(() => {
    const t = getAsphaltTexture();
    t.repeat.set(1, 6);
    return t;
  }, []);

  const concreteTex = useMemo(() => {
    const t = getConcreteTexture();
    t.repeat.set(2, 2);
    return t;
  }, []);

  const plazaTex = useMemo(() => {
    const t = getCampusPlazaTexture();
    t.repeat.set(6, 4);
    return t;
  }, []);

  const pitchTex = useMemo(() => getFootballPitchTexture(), []);
  const courtTex = useMemo(() => getVolleyballCourtTexture(), []);

  const pitchZone = CAMPUS_ZONES.find((z) => z.id === 'san_bong');
  const courtZone = CAMPUS_ZONES.find((z) => z.id === 'san_bong_chuyen');
  const roundaboutZone = CAMPUS_ZONES.find((z) => z.id === 'vong_xoay_giua');
  const plazaZone = CAMPUS_ZONES.find((z) => z.id === 'san_truoc_a1');
  const gardenZone = CAMPUS_ZONES.find((z) => z.id === 'vuon_hoa');
  const monumentZone = CAMPUS_ZONES.find((z) => z.id === 'monument');

  const streetLamps = [
    [-90, 63], [-60, 63], [-30, 63], [16, 63], [48, 63], [86, 63],
    [-16, 46], [10, 46], [-16, 20], [10, 20], [-20, -28], [20, -28],
    [-60, 10], [-60, -22], [80, 18], [80, -14],
  ];

  // Subtle surrounding urban context silhouettes (matches video aerial periphery)
  const outerCityBlocks = [
    [-150, -50, 24, 34, 14], [-150, 10, 22, 40, 18], [-150, 58, 26, 20, 12],
    [152, -45, 24, 36, 16], [152, 18, 24, 38, 15], [152, 60, 26, 22, 12],
    [-85, -116, 42, 22, 16], [-15, -118, 48, 20, 20], [65, -116, 44, 22, 14],
    [-80, 100, 38, 20, 15], [0, 102, 46, 20, 18], [80, 100, 38, 20, 14],
  ];

  return (
    <group name="TLUCampusGrounds">
      {/* 1. Surrounding Urban Base Apron */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.1, 0]} receiveShadow>
        <planeGeometry args={[540, 440]} />
        <meshStandardMaterial color={isNight ? '#1E293B' : '#CBD5E1'} roughness={0.92} />
      </mesh>

      {/* Distant Urban Context Blocks */}
      {outerCityBlocks.map(([bx, bz, bw, bd, bh], idx) => (
        <mesh key={idx} position={[bx, bh / 2, bz]} receiveShadow>
          <boxGeometry args={[bw, bh, bd]} />
          <meshStandardMaterial
            color={isNight ? '#334155' : '#94A3B8'}
            roughness={0.85}
          />
        </mesh>
      ))}

      {/* 2. Main Campus Grass Ground (240m x 180m) */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[240, 180]} />
        <meshStandardMaterial map={grassTex} roughness={0.9} metalness={0.04} />
      </mesh>

      {/* 3. Asphalt Road Network */}
      {CAMPUS_ROADS.map((road) => (
        <RoadSegment
          key={road.id}
          points={road.points}
          width={road.width}
          asphaltTex={asphaltTex}
        />
      ))}

      {/* Pedestrian Crosswalks on Tay Son Avenue */}
      {[-4, 68].map((zx, idx) => (
        <group key={idx} position={[zx, 0.045, 70]}>
          {[-3.5, -2.1, -0.7, 0.7, 2.1, 3.5].map((dx, si) => (
            <mesh key={si} rotation={[-Math.PI / 2, 0, 0]} position={[dx, 0, 0]}>
              <planeGeometry args={[0.7, 7.5]} />
              <meshStandardMaterial color="#F8FAFC" roughness={0.6} />
            </mesh>
          ))}
        </group>
      ))}

      {/* 4. Vòng Xoay Giữa (Central Roundabout) */}
      {roundaboutZone && (
        <group position={[roundaboutZone.x, 0.035, roundaboutZone.z]}>
          {/* Asphalt circular ring */}
          <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
            <ringGeometry args={[7.5, 13.5, 36]} />
            <meshStandardMaterial color="#363C44" roughness={0.8} />
          </mesh>
          {/* Green island center */}
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.04, 0]} receiveShadow>
            <circleGeometry args={[7.4, 32]} />
            <meshStandardMaterial color="#3B7A3E" roughness={0.9} />
          </mesh>
          <mesh position={[0, 0.14, 0]}>
            <torusGeometry args={[7.4, 0.25, 8, 36]} />
            <meshStandardMaterial color="#CBD5E1" roughness={0.7} />
          </mesh>
        </group>
      )}

      {/* 5. Sân Trước A1 (Front Flag Plaza) */}
      {plazaZone && (
        <group position={[plazaZone.x, 0.04, plazaZone.z]}>
          <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
            <planeGeometry args={[52, 20]} />
            <meshStandardMaterial map={plazaTex} roughness={0.75} />
          </mesh>
          {/* Central Green Medallion */}
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]} receiveShadow>
            <circleGeometry args={[5.8, 28]} />
            <meshStandardMaterial color="#2E7D32" roughness={0.85} />
          </mesh>
          <mesh position={[0, 0.12, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[5.8, 0.22, 8, 32]} />
            <meshStandardMaterial color="#E2E8F0" />
          </mesh>
        </group>
      )}

      {/* 6. Vườn Hoa & Tượng Đài */}
      {gardenZone && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[gardenZone.x, 0.03, gardenZone.z]} receiveShadow>
          <planeGeometry args={[gardenZone.width, gardenZone.depth]} />
          <meshStandardMaterial color="#4D8B40" roughness={0.9} />
        </mesh>
      )}
      {monumentZone && (
        <group position={[monumentZone.x, 0, monumentZone.z]}>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.04, 0]}>
            <circleGeometry args={[5, 24]} />
            <meshStandardMaterial map={plazaTex} roughness={0.75} />
          </mesh>
          <mesh position={[0, 0.45, 0]} castShadow receiveShadow>
            <boxGeometry args={[3.4, 0.9, 3.4]} />
            <meshStandardMaterial color="#64748B" roughness={0.6} />
          </mesh>
          <mesh position={[0, 3.2, 0]} castShadow>
            <cylinderGeometry args={[0.35, 0.8, 4.8, 4]} />
            <meshStandardMaterial color="#B91C1C" roughness={0.4} metalness={0.2} />
          </mesh>
        </group>
      )}

      {/* 7. Sân Bóng Đá Thủy Lợi */}
      {pitchZone && (
        <group position={[pitchZone.x, 0.04, pitchZone.z]}>
          <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
            <planeGeometry args={[pitchZone.width, pitchZone.depth]} />
            <meshStandardMaterial map={pitchTex} roughness={0.85} />
          </mesh>
          {/* Football Goals (West & East) */}
          {[-pitchZone.width / 2 + 2.5, pitchZone.width / 2 - 2.5].map((gx, gi) => (
            <group key={gi} position={[gx, 1.1, 0]}>
              <mesh position={[0, 0, -2.8]} castShadow>
                <cylinderGeometry args={[0.08, 0.08, 2.2, 8]} />
                <meshStandardMaterial color="#FFFFFF" />
              </mesh>
              <mesh position={[0, 0, 2.8]} castShadow>
                <cylinderGeometry args={[0.08, 0.08, 2.2, 8]} />
                <meshStandardMaterial color="#FFFFFF" />
              </mesh>
              <mesh position={[0, 1.1, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
                <cylinderGeometry args={[0.08, 0.08, 5.7, 8]} />
                <meshStandardMaterial color="#FFFFFF" />
              </mesh>
            </group>
          ))}
          {/* 4 Stadium Floodlight Poles */}
          {[
            [-pitchZone.width / 2 - 1.5, -pitchZone.depth / 2 - 1.5],
            [pitchZone.width / 2 + 1.5, -pitchZone.depth / 2 - 1.5],
            [-pitchZone.width / 2 - 1.5, pitchZone.depth / 2 + 1.5],
            [pitchZone.width / 2 + 1.5, pitchZone.depth / 2 + 1.5],
          ].map(([fx, fz], fi) => (
            <group key={fi} position={[fx, 0, fz]}>
              <mesh position={[0, 6.5, 0]} castShadow>
                <cylinderGeometry args={[0.18, 0.28, 13, 8]} />
                <meshStandardMaterial color="#475569" metalness={0.8} />
              </mesh>
              <mesh position={[0, 13, 0]}>
                <boxGeometry args={[1.6, 0.6, 0.5]} />
                <meshBasicMaterial color={isNight ? '#FEF9C3' : '#CBD5E1'} />
              </mesh>
            </group>
          ))}
        </group>
      )}

      {/* 8. Sân Bóng Chuyền */}
      {courtZone && (
        <mesh
          rotation={[-Math.PI / 2, 0, 0]}
          position={[courtZone.x, 0.045, courtZone.z]}
          receiveShadow
        >
          <planeGeometry args={[courtZone.width, courtZone.depth]} />
          <meshStandardMaterial map={courtTex} roughness={0.75} />
        </mesh>
      )}

      {/* 9. Campus Gates */}
      <CampusGate x={-4} z={63} width={14} isNight={isNight} main />
      <CampusGate x={36} z={-34} width={10} isNight={isNight} />
      <CampusGate x={68} z={63} width={10} isNight={isNight} />

      {/* 10. Microgrid Concrete Technical Pads (NW Utility Yard) */}
      <mesh position={[MICROGRID_NODES.bess.x, 0.1, MICROGRID_NODES.bess.z]} receiveShadow castShadow>
        <boxGeometry args={[12, 0.2, 8]} />
        <meshStandardMaterial map={concreteTex} roughness={0.65} />
      </mesh>
      <mesh position={[MICROGRID_NODES.grid.x, 0.1, MICROGRID_NODES.grid.z]} receiveShadow castShadow>
        <boxGeometry args={[12, 0.2, 12]} />
        <meshStandardMaterial map={concreteTex} roughness={0.65} />
      </mesh>
      <mesh position={[MICROGRID_NODES.solar.x, 0.08, MICROGRID_NODES.solar.z]} receiveShadow castShadow>
        <boxGeometry args={[12, 0.16, 10]} />
        <meshStandardMaterial map={concreteTex} roughness={0.7} />
      </mesh>

      {/* 11. Campus Street Lamps */}
      {streetLamps.map(([lx, lz], idx) => (
        <group key={idx} position={[lx, 0, lz]}>
          <mesh position={[0, 2.4, 0]}>
            <cylinderGeometry args={[0.08, 0.12, 4.8, 8]} />
            <meshStandardMaterial color="#334155" metalness={0.8} />
          </mesh>
          <mesh position={[0, 4.85, 0]}>
            <sphereGeometry args={[0.24, 10, 10]} />
            <meshBasicMaterial color={isNight ? '#FDE047' : '#E2E8F0'} />
          </mesh>
        </group>
      ))}
    </group>
  );
}
