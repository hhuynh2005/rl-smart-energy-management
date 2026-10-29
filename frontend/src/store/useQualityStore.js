import { create } from 'zustand';

/**
 * Zustand store managing 3D Graphics Quality & Digital Twin View State
 * Supports LOW, MED, HIGH, ULTRA presets with automatic FPS fallback.
 */
export const useQualityStore = create((set, get) => ({
  quality: 'high', // 'low' | 'med' | 'high' | 'ultra'
  fps: 60,
  isAutoDegraded: false,

  // Camera & Interaction
  activePreset: 'overview', // 'overview' | 'bess' | 'solar' | 'house' | 'grid' | 'street'
  selectedDevice: null,     // null | 'solar' | 'bess' | 'house' | 'grid'
  hoveredDevice: null,

  // Display toggles
  showLabels: true,
  showFlows: true,
  autoRotate: false,
  forceNightLights: true,

  // Action setters
  setQuality: (quality) => set({ quality, isAutoDegraded: false }),
  setFps: (fps) => set({ fps }),
  setActivePreset: (activePreset) => set({ activePreset }),
  setSelectedDevice: (selectedDevice) => set({ selectedDevice }),
  setHoveredDevice: (hoveredDevice) => set({ hoveredDevice }),
  toggleLabels: () => set((s) => ({ showLabels: !s.showLabels })),
  toggleFlows: () => set((s) => ({ showFlows: !s.showFlows })),
  toggleAutoRotate: () => set((s) => ({ autoRotate: !s.autoRotate })),
  toggleNightLights: () => set((s) => ({ forceNightLights: !s.forceNightLights })),

  // Performance degrade triggered by PerformanceMonitor
  handlePerformanceDegrade: () => {
    const cur = get().quality;
    if (cur === 'ultra') set({ quality: 'high', isAutoDegraded: true });
    else if (cur === 'high') set({ quality: 'med', isAutoDegraded: true });
    else if (cur === 'med') set({ quality: 'low', isAutoDegraded: true });
  },

  // Derived config based on active quality level
  getConfig: () => {
    const q = get().quality;
    switch (q) {
      case 'ultra':
        return {
          dpr: Math.min(window.devicePixelRatio || 2, 2.0),
          shadows: true,
          shadowMapSize: 4096,
          treeCount: 400,
          grassTufts: 350,
          bloom: true,
          bloomIntensity: 1.25,
          vignette: true,
          ssao: true,
          particlesPerKw: 1.0,
        };
      case 'high':
        return {
          dpr: Math.min(window.devicePixelRatio || 1.5, 1.5),
          shadows: true,
          shadowMapSize: 2048,
          treeCount: 260,
          grassTufts: 220,
          bloom: true,
          bloomIntensity: 1.0,
          vignette: true,
          ssao: true,
          particlesPerKw: 0.8,
        };
      case 'med':
        return {
          dpr: 1.2,
          shadows: true,
          shadowMapSize: 1024,
          treeCount: 140,
          grassTufts: 100,
          bloom: true,
          bloomIntensity: 0.7,
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
          treeCount: 60,
          grassTufts: 30,
          bloom: false,
          bloomIntensity: 0,
          vignette: false,
          ssao: false,
          particlesPerKw: 0.4,
        };
    }
  },
}));

