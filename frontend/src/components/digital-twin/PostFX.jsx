import React from 'react';
import { EffectComposer, Bloom, Vignette, SMAA, N8AO } from '@react-three/postprocessing';
import { useQualityStore } from '../../store/useQualityStore';

/**
 * PostFX Component - Cinematic Post-Processing Pipeline
 * Features:
 * - High-threshold Selective Bloom for laser conduits, LEDs, and celestial sources
 * - N8AO Ambient Occlusion for soft contact crevices
 * - Cinematic Vignette and Anti-Aliasing (SMAA)
 * - Scalable by quality mode (LOW disables FX, MED enables Bloom, HIGH/ULTRA full stack)
 */
export default function PostFX() {
  const { quality, getConfig } = useQualityStore();
  const config = getConfig();

  // If quality is low, bypass postprocessing entirely for raw 60 FPS performance
  if (quality === 'low' || !config.bloom) {
    return null;
  }

  return (
    <EffectComposer multisampling={0} disableNormalPass={quality !== 'ultra'}>
      {/* 1. Selective Emissive Bloom */}
      <Bloom
        luminanceThreshold={0.82}
        luminanceSmoothing={0.25}
        intensity={config.bloomIntensity || 1.0}
        mipmapBlur
      />

      {/* 2. Ambient Occlusion (Ultra only for maximum fidelity without GPU strain) */}
      {quality === 'ultra' && (
        <N8AO
          aoRadius={2.0}
          intensity={1.2}
          distanceFalloff={1.0}
          quality="low"
        />
      )}

      {/* 3. Subtle Cinematic Vignette */}
      {config.vignette && (
        <Vignette
          eskil={false}
          offset={0.2}
          darkness={0.45}
        />
      )}

      {/* 4. Subpixel Morphological Anti-Aliasing (SMAA) */}
      <SMAA />
    </EffectComposer>
  );
}

