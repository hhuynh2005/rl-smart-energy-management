import React, { useMemo } from 'react';
import { getSolarCellTexture } from './textures';
import { useQualityStore } from '../../store/useQualityStore';

/**
 * Single Townhouse / Commercial Shophouse
 * Designed with full-brightness night illumination (Cyber Smart City style)
 */
function Townhouse({
  position = [0, 0, 0],
  width = 9.0,
  depth = 8.5,
  stories = 3,
  facadeColor = '#F8FAFC',
  hasSolar = false,
  signText = null,
  signColor = '#06B6D4',
  isNight = false,
}) {
  const height = stories * 3.2;
  const solarTex = useMemo(() => {
    const t = getSolarCellTexture();
    t.repeat.set(1, 1);
    return t;
  }, []);

  return (
    <group position={position}>
      {/* 1. Main Structural Body */}
      <mesh position={[0, height / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[width, height, depth]} />
        <meshStandardMaterial
          color={facadeColor}
          roughness={0.4}
          metalness={0.15}
        />
      </mesh>

      {/* 2. Architectural Accent Panels & Parapet */}
      <mesh position={[0, height + 0.3, 0]}>
        <boxGeometry args={[width + 0.2, 0.6, depth + 0.2]} />
        <meshStandardMaterial color="#1E293B" roughness={0.6} />
      </mesh>

      {/* Roofline Architectural LED Accent Strip (Glows neon cyber at night) */}
      <mesh position={[0, height + 0.62, depth / 2 + 0.12]}>
        <boxGeometry args={[width, 0.08, 0.08]} />
        <meshBasicMaterial color={isNight ? signColor : '#334155'} />
      </mesh>

      {/* 3. Front Glass Windows on Upper Floors (Facing South towards street at +Z) */}
      {Array.from({ length: stories - 1 }).map((_, sIdx) => {
        const wy = 4.2 + sIdx * 3.2;
        return (
          <group key={sIdx} position={[0, wy, depth / 2 + 0.05]}>
            {/* Window Glass Pane - Sáng rực rỡ Full Brightness khi trời tối */}
            <mesh>
              <planeGeometry args={[width * 0.78, 1.9]} />
              <meshPhysicalMaterial
                color={isNight ? '#FEF08A' : '#7DD3FC'}
                emissive={isNight ? '#FDE047' : '#0284C7'}
                emissiveIntensity={isNight ? 2.8 : 0.15}
                roughness={0.08}
                metalness={0.8}
                clearcoat={1.0}
              />
            </mesh>
            {/* Window Frame Mullions (Window grid lines) */}
            <mesh position={[0, 0, 0.01]}>
              <boxGeometry args={[width * 0.78, 0.05, 0.02]} />
              <meshStandardMaterial color="#0F172A" />
            </mesh>
            <mesh position={[0, 0, 0.01]}>
              <boxGeometry args={[0.05, 1.9, 0.02]} />
              <meshStandardMaterial color="#0F172A" />
            </mesh>
            {/* Balcony Railing */}
            <mesh position={[0, -0.65, 0.3]}>
              <boxGeometry args={[width * 0.8, 0.7, 0.05]} />
              <meshStandardMaterial color="#334155" metalness={0.8} />
            </mesh>
          </group>
        );
      })}

      {/* 4. Ground Floor Commercial Storefront - Sáng rực rỡ khi trời tối */}
      <mesh position={[0, 1.6, depth / 2 + 0.05]}>
        <planeGeometry args={[width * 0.88, 2.5]} />
        <meshPhysicalMaterial
          color={isNight ? '#FFFBEB' : '#BAE6FD'}
          emissive={isNight ? '#FBBF24' : '#000000'}
          emissiveIntensity={isNight ? 2.6 : 0.0}
          roughness={0.08}
          metalness={0.7}
        />
      </mesh>

      {/* Entrance Sconce Light Orb (Tỏa sáng quầng đèn ấm ban đêm) */}
      {isNight && (
        <mesh position={[0, 3.0, depth / 2 + 0.16]}>
          <sphereGeometry args={[0.16, 12, 12]} />
          <meshBasicMaterial color="#FEF08A" />
        </mesh>
      )}

      {/* 5. Glowing Neon Store Signboard */}
      {signText && (
        <group position={[0, 3.3, depth / 2 + 0.2]}>
          {/* Signboard Backing Box */}
          <mesh castShadow>
            <boxGeometry args={[width * 0.75, 0.7, 0.15]} />
            <meshStandardMaterial color="#0F172A" metalness={0.9} />
          </mesh>
          {/* Glowing Sign Front Plate (Rực rỡ neon) */}
          <mesh position={[0, 0, 0.09]}>
            <planeGeometry args={[width * 0.72, 0.6]} />
            <meshBasicMaterial color={signColor} />
          </mesh>
        </group>
      )}

      {/* 6. Rooftop Solar PV Panels (if equipped) */}
      {hasSolar && (
        <group position={[0, height + 0.6, 0]} rotation={[0.26, 0, 0]}>
          <mesh castShadow>
            <boxGeometry args={[width * 0.7, 0.08, depth * 0.5]} />
            <meshStandardMaterial
              map={solarTex}
              roughness={0.1}
              metalness={0.8}
            />
          </mesh>
        </group>
      )}
    </group>
  );
}

/**
 * CityBlocks Component - Surrounding Urban Environment
 * Bỏ sạch các tòa nhà cao tầng màu đen ở hậu cảnh để mở rộng đường chân trời
 */
export default function CityBlocks({ hour = 12 }) {
  const { forceNightLights } = useQualityStore();
  const isNight = (hour < 6 || hour > 18.5) || forceNightLights;

  return (
    <group name="SurroundingCityBlocks">
      {/* 1. Directly Across the Street (North side: Z = -22 to -25) */}
      {/* Shop 1: 24/7 Smart Convenience Store */}
      <Townhouse
        position={[-28, 0, -22]}
        width={9.5}
        depth={8.5}
        stories={3}
        facadeColor="#F1F5F9"
        signText="SEMS MART 24/7"
        signColor="#06B6D4"
        hasSolar={true}
        isNight={isNight}
      />

      {/* Shop 2: Modern Cyber Cafe */}
      <Townhouse
        position={[-16, 0, -22]}
        width={8.5}
        depth={8.5}
        stories={4}
        facadeColor="#334155"
        signText="ECO COFFEE & ROASTERY"
        signColor="#F59E0B"
        hasSolar={true}
        isNight={isNight}
      />

      {/* Shop 3: Clean Energy Tech Office */}
      <Townhouse
        position={[-4, 0, -22]}
        width={10.5}
        depth={9.0}
        stories={4}
        facadeColor="#E2E8F0"
        signText="GREEN GRID LABS"
        signColor="#10B981"
        hasSolar={true}
        isNight={isNight}
      />

      {/* Shop 4: Residential Townhouse */}
      <Townhouse
        position={[9, 0, -22]}
        width={8.8}
        depth={8.5}
        stories={3}
        facadeColor="#F8FAFC"
        signText={null}
        hasSolar={false}
        isNight={isNight}
      />

      {/* Shop 5: Boutique Pharmacy / Clinic */}
      <Townhouse
        position={[21, 0, -22]}
        width={9.2}
        depth={8.5}
        stories={3}
        facadeColor="#CBD5E1"
        signText="SMART HEALTHCARE"
        signColor="#3B82F6"
        hasSolar={true}
        isNight={isNight}
      />

      {/* 2. Flanking Left/Right Shophouses (East & West ends of the street) */}
      {/* Far West */}
      <Townhouse
        position={[-42, 0, -22]}
        width={9.0}
        depth={8.5}
        stories={3}
        facadeColor="#94A3B8"
        isNight={isNight}
      />
      {/* Far East */}
      <Townhouse
        position={[33, 0, -22]}
        width={9.0}
        depth={8.5}
        stories={4}
        facadeColor="#F1F5F9"
        isNight={isNight}
      />
    </group>
  );
}
