import React, { useMemo } from 'react';
import { CAMPUS_BUILDINGS } from './campusLayout';
import { getSolarCellTexture, getTerracottaRoofTexture } from './textures';
import { useQualityStore } from '../../store/useQualityStore';

/**
 * RooftopSolarArray renders angled monocrystalline PV racks mounted on building roofs.
 */
function RooftopSolarArray({ width, depth, y, solarTex }) {
  const cols = Math.max(2, Math.floor((width - 4) / 4.2));
  const rows = Math.max(1, Math.floor((depth - 3) / 3.4));
  const startX = -((cols - 1) * 3.8) / 2;
  const startZ = -((rows - 1) * 3.0) / 2;

  return (
    <group position={[0, y, 0]}>
      {Array.from({ length: rows }).map((_, r) =>
        Array.from({ length: cols }).map((__, c) => (
          <group
            key={`${r}-${c}`}
            position={[startX + c * 3.8, 0.35, startZ + r * 3.0]}
            rotation={[0.32, 0, 0]}
          >
            <mesh castShadow>
              <boxGeometry args={[3.2, 0.08, 2.2]} />
              <meshPhysicalMaterial
                map={solarTex}
                roughness={0.12}
                metalness={0.82}
                clearcoat={0.9}
              />
            </mesh>
          </group>
        ))
      )}
    </group>
  );
}

/**
 * WindowGrid renders emissive window strips on front (+Z) and back (-Z) facades.
 */
function WindowGrid({ width, depth, stories, isNight, loadIntensity }) {
  const storyH = 3.2;
  const cols = Math.max(2, Math.floor(width / 3.4));
  const spacingX = (width - 2.4) / Math.max(1, cols);
  const startX = -((cols - 1) * spacingX) / 2;

  return (
    <group>
      {Array.from({ length: stories }).map((_, sIdx) => {
        const wy = 1.8 + sIdx * storyH;
        return (
          <group key={sIdx}>
            {Array.from({ length: cols }).map((__, cIdx) => {
              const wx = startX + cIdx * spacingX;
              const isLitRoom = ((sIdx * 7 + cIdx * 3) % 5) !== 0;
              const lit = isNight && isLitRoom;
              const emissiveStrength = lit ? 1.2 + loadIntensity * 0.9 : 0.05;
              const glassColor = lit ? '#FEF08A' : '#1E3A5F';
              const emissiveColor = lit ? '#FDE047' : '#0284C7';

              return (
                <group key={cIdx}>
                  <mesh position={[wx, wy, depth / 2 + 0.04]}>
                    <planeGeometry args={[Math.min(2.1, spacingX * 0.68), 1.55]} />
                    <meshStandardMaterial
                      color={glassColor}
                      emissive={emissiveColor}
                      emissiveIntensity={emissiveStrength}
                      roughness={0.18}
                      metalness={0.65}
                    />
                  </mesh>
                  <mesh position={[wx, wy, -depth / 2 - 0.04]} rotation={[0, Math.PI, 0]}>
                    <planeGeometry args={[Math.min(2.1, spacingX * 0.68), 1.55]} />
                    <meshStandardMaterial
                      color={glassColor}
                      emissive={emissiveColor}
                      emissiveIntensity={emissiveStrength * 0.85}
                      roughness={0.18}
                      metalness={0.65}
                    />
                  </mesh>
                </group>
              );
            })}
          </group>
        );
      })}
    </group>
  );
}

/**
 * Single TLU Campus Building with interactive hover/click & rooftop PV support.
 */
function CampusBuildingMesh({
  building,
  isNight,
  loadIntensity,
  solarTex,
  roofTex,
  isSelected,
  isHovered,
  onHover,
  onSelect,
}) {
  const height = building.stories * 3.2;

  return (
    <group
      name={`TLU_${building.id}`}
      position={[building.x, 0, building.z]}
      onPointerOver={(e) => {
        e.stopPropagation();
        onHover({ type: 'building', id: building.id });
      }}
      onPointerOut={(e) => {
        e.stopPropagation();
        onHover(null);
      }}
      onClick={(e) => {
        e.stopPropagation();
        onSelect({ type: 'building', id: building.id });
      }}
    >
      {/* Selection / Hover ground highlight ring */}
      {(isSelected || isHovered) && (
        <mesh position={[0, 0.08, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[building.width + 2.6, building.depth + 2.6]} />
          <meshBasicMaterial
            color={isSelected ? '#DC2626' : '#F59E0B'}
            transparent
            opacity={isSelected ? 0.42 : 0.25}
          />
        </mesh>
      )}

      {/* Concrete plinth base */}
      <mesh position={[0, 0.25, 0]} receiveShadow castShadow>
        <boxGeometry args={[building.width + 0.8, 0.5, building.depth + 0.8]} />
        <meshStandardMaterial color="#CBD5E1" roughness={0.75} />
      </mesh>

      {building.shape === 'canopy' ? (
        <group>
          {/* Steel carport support columns */}
          {[-building.width * 0.4, 0, building.width * 0.4].map((px, i) =>
            [-building.depth * 0.35, building.depth * 0.35].map((pz, j) => (
              <mesh key={`${i}-${j}`} position={[px, 1.8, pz]} castShadow>
                <cylinderGeometry args={[0.16, 0.2, 3.2, 8]} />
                <meshStandardMaterial color="#475569" metalness={0.8} roughness={0.3} />
              </mesh>
            ))
          )}
          {/* Angled Solar Roof Canopy */}
          <mesh position={[0, 3.55, 0]} rotation={[0.12, 0, 0]} castShadow receiveShadow>
            <boxGeometry args={[building.width, 0.22, building.depth]} />
            <meshPhysicalMaterial
              map={solarTex}
              roughness={0.14}
              metalness={0.75}
              clearcoat={0.85}
            />
          </mesh>
        </group>
      ) : building.shape === 'u_shape' ? (
        <group>
          {/* Main North wing of U-shaped A1 */}
          <mesh position={[0, height / 2 + 0.4, -building.depth * 0.2]} castShadow receiveShadow>
            <boxGeometry args={[building.width, height, building.depth * 0.58]} />
            <meshStandardMaterial color={building.facadeColor} roughness={0.55} />
          </mesh>
          {/* West & East forward arms */}
          {[-building.width * 0.38, building.width * 0.38].map((wx, idx) => (
            <mesh
              key={idx}
              position={[wx, height / 2 + 0.4, building.depth * 0.22]}
              castShadow
              receiveShadow
            >
              <boxGeometry args={[building.width * 0.24, height, building.depth * 0.55]} />
              <meshStandardMaterial color={building.facadeColor} roughness={0.55} />
            </mesh>
          ))}
          {/* Central entrance portico facing Sân trước A1 */}
          <mesh position={[0, 2.6, building.depth * 0.14]} castShadow>
            <boxGeometry args={[10, 4.4, 3.4]} />
            <meshStandardMaterial color={building.trimColor} roughness={0.45} />
          </mesh>
          {/* Roof crown */}
          <mesh position={[0, height + 0.7, -building.depth * 0.2]} castShadow>
            <boxGeometry args={[building.width + 0.8, 0.65, building.depth * 0.62]} />
            <meshStandardMaterial map={roofTex} roughness={0.65} />
          </mesh>
          <WindowGrid
            width={building.width - 2}
            depth={building.depth * 0.96}
            stories={building.stories}
            isNight={isNight}
            loadIntensity={loadIntensity}
          />
          {building.hasRooftopPv && (
            <RooftopSolarArray
              width={building.width - 2}
              depth={building.depth * 0.52}
              y={height + 1.05}
              solarTex={solarTex}
            />
          )}
        </group>
      ) : building.shape === 'sports_hall' ? (
        <group>
          <mesh position={[0, height / 2 + 0.4, 0]} castShadow receiveShadow>
            <boxGeometry args={[building.width, height, building.depth]} />
            <meshStandardMaterial color={building.facadeColor} roughness={0.6} />
          </mesh>
          {/* Vaulted Roof Cap */}
          <mesh position={[0, height + 1.2, 0]} castShadow>
            <boxGeometry args={[building.width + 0.6, 1.4, building.depth + 0.6]} />
            <meshStandardMaterial color={building.roofColor} roughness={0.5} metalness={0.3} />
          </mesh>
          <WindowGrid
            width={building.width}
            depth={building.depth}
            stories={Math.max(1, building.stories - 1)}
            isNight={isNight}
            loadIntensity={loadIntensity}
          />
          {building.hasRooftopPv && (
            <RooftopSolarArray
              width={building.width - 2}
              depth={building.depth - 2}
              y={height + 1.95}
              solarTex={solarTex}
            />
          )}
        </group>
      ) : (
        <group>
          {/* Standard Box / Tall K1 Tower */}
          <mesh position={[0, height / 2 + 0.4, 0]} castShadow receiveShadow>
            <boxGeometry args={[building.width, height, building.depth]} />
            <meshStandardMaterial color={building.facadeColor} roughness={0.52} />
          </mesh>
          {/* Horizontal trim cornice / parapet */}
          <mesh position={[0, height + 0.65, 0]} castShadow>
            <boxGeometry args={[building.width + 0.5, 0.55, building.depth + 0.5]} />
            <meshStandardMaterial
              color={building.roofColor}
              map={building.category === 'academic' ? roofTex : null}
              roughness={0.62}
            />
          </mesh>
          {building.shape === 'tower' && (
            <mesh position={[0, height + 1.9, 0]} castShadow>
              <boxGeometry args={[building.width * 0.45, 2.0, building.depth * 0.45]} />
              <meshStandardMaterial color={building.trimColor} roughness={0.5} />
            </mesh>
          )}
          <WindowGrid
            width={building.width}
            depth={building.depth}
            stories={building.stories}
            isNight={isNight}
            loadIntensity={loadIntensity}
          />
          {building.hasRooftopPv && (
            <RooftopSolarArray
              width={building.width - 2}
              depth={building.depth - 2}
              y={building.shape === 'tower' ? height + 1.0 : height + 0.95}
              solarTex={solarTex}
            />
          )}
        </group>
      )}
    </group>
  );
}

export default function CampusBuildings({ hour = 12, pLoad = 60, onSelectEntity }) {
  const {
    selectedEntity,
    setSelectedEntity,
    hoveredEntity,
    setHoveredEntity,
    forceNightLights,
  } = useQualityStore();

  const isNight = hour < 6 || hour > 18.2 || forceNightLights;
  const loadIntensity = Math.min(1, Math.max(0.2, pLoad / 120));

  const solarTex = useMemo(() => getSolarCellTexture(), []);
  const roofTex = useMemo(() => getTerracottaRoofTexture(), []);

  const handleSelect = (entity) => {
    setSelectedEntity(entity);
    if (onSelectEntity) onSelectEntity(entity);
  };

  return (
    <group name="TLUCampusBuildings">
      {CAMPUS_BUILDINGS.map((b) => (
        <CampusBuildingMesh
          key={b.id}
          building={b}
          isNight={isNight}
          loadIntensity={loadIntensity}
          solarTex={solarTex}
          roofTex={roofTex}
          isSelected={selectedEntity?.type === 'building' && selectedEntity?.id === b.id}
          isHovered={hoveredEntity?.type === 'building' && hoveredEntity?.id === b.id}
          onHover={setHoveredEntity}
          onSelect={handleSelect}
        />
      ))}
    </group>
  );
}
