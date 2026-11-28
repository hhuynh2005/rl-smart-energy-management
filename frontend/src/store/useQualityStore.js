import { create } from 'zustand';
import { CAMERA_PRESETS } from '../components/digital-twin/campusLayout';

/**
 * Zustand store managing 3D Graphics Quality, TLU Campus View Modes,
 * Layer Visibility, Selection, and Live Minimap Camera Telemetry.
 */
export const useQualityStore = create((set, get) => ({
  quality: 'high', // 'low' | 'med' | 'high' | 'ultra'
  fps: 60,
  isAutoDegraded: false,

  // Camera & 3D Interaction
  viewMode3D: 'orbit', // 'orbit' | 'satellite' | 'walk'
  activePreset: 'overview',
  selectedEntity: null, // { type: 'building' | 'device', id: string } | null
  hoveredEntity: null,  // { type: 'building' | 'device', id: string } | null
  presetToast: null,    // { id, title, description, ts } | null

  // Live Minimap sync
  cameraTelemetry: {
    x: 0,
    z: 126,
    yaw: 0,
    targetX: 0,
    targetZ: -6,
  },
  minimapFocusTarget: null, // { x, z, ts } | null

  // Display layer toggles (forceNightLights defaults to false for natural day/night)
  showLabels: true,
  showTraffic: true,
  showPedestrians: true,
  showFlows: true,
  autoRotate: false,
  forceNightLights: false,

  // Action setters
  setQuality: (quality) => set({ quality, isAutoDegraded: false }),
  setFps: (fps) => set({ fps }),
  setViewMode3D: (viewMode3D) =>
    set({
      viewMode3D,
      autoRotate: viewMode3D === 'orbit' ? get().autoRotate : false,
    }),
  setActivePreset: (activePreset) => set({ activePreset }),
  setSelectedEntity: (selectedEntity) => set({ selectedEntity }),
  setHoveredEntity: (hoveredEntity) => set({ hoveredEntity }),

  selectPreset: (presetId) => {
    const preset = CAMERA_PRESETS[presetId];
    if (!preset) return;
    let nextSelected = get().selectedEntity;
    if (['solar', 'bess', 'grid'].includes(presetId)) {
      nextSelected = { type: 'device', id: presetId };
    } else if (presetId === 'a1_facade') {
      nextSelected = { type: 'building', id: 'a1' };
    }
    set({
      viewMode3D: 'orbit',
      activePreset: presetId,
      selectedEntity: nextSelected,
      presetToast: {
        id: presetId,
        title: preset.label,
        description: preset.description,
        ts: Date.now(),
      },
    });
  },

  clearPresetToast: () => set({ presetToast: null }),
  setCameraTelemetry: (cameraTelemetry) => set({ cameraTelemetry }),
  focusFromMinimap: (x, z) =>
    set({
      minimapFocusTarget: { x, z, ts: Date.now() },
    }),

  toggleLabels: () => set((s) => ({ showLabels: !s.showLabels })),
  toggleTraffic: () => set((s) => ({ showTraffic: !s.showTraffic })),
  togglePedestrians: () => set((s) => ({ showPedestrians: !s.showPedestrians })),
  toggleFlows: () => set((s) => ({ showFlows: !s.showFlows })),
  toggleAutoRotate: () => set((s) => ({ autoRotate: !s.autoRotate })),
  toggleNightLights: () => set((s) => ({ forceNightLights: !s.forceNightLights })),

  handlePerformanceDegrade: () => {
    const cur = get().quality;
    if (cur === 'ultra') set({ quality: 'high', isAutoDegraded: true });
    else if (cur === 'high') set({ quality: 'med', isAutoDegraded: true });
    else if (cur === 'med') set({ quality: 'low', isAutoDegraded: true });
  },

  getConfig: () => {
    const q = get().quality;
    switch (q) {
      case 'ultra':
        return {
          dpr: Math.min(window.devicePixelRatio || 2, 2.0),
          shadows: true,
          shadowMapSize: 4096,
          bloom: true,
          bloomIntensity: 0.9,
          vignette: false,
          ssao: true,
          particlesPerKw: 1.0,
        };
      case 'high':
        return {
          dpr: Math.min(window.devicePixelRatio || 1.5, 1.5),
          shadows: true,
          shadowMapSize: 2048,
          bloom: true,
          bloomIntensity: 0.75,
          vignette: false,
          ssao: true,
          particlesPerKw: 0.8,
        };
      case 'med':
        return {
          dpr: 1.2,
          shadows: true,
          shadowMapSize: 1024,
          bloom: true,
          bloomIntensity: 0.5,
          vignette: false,
          ssao: false,
          particlesPerKw: 0.6,
        };
      case 'low':
      default:
        return {
          dpr: 1.0,
          shadows: false,
          shadowMapSize: 512,
          bloom: false,
          bloomIntensity: 0,
          vignette: false,
          ssao: false,
          particlesPerKw: 0.4,
        };
    }
  },
}));
