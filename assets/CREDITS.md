# SEMS-RL 3D Urban Microgrid Digital Twin - Asset & Shader Credits

This digital twin renders the Smart Energy Management System campus and surrounding urban microgrid district using photorealistic PBR rendering with `@react-three/fiber`, `@react-three/drei`, `@react-three/postprocessing`, and `three`.

## 1. Modular Architecture Components
- `<Scene />`: Orchestrates urban microgrid world, smooth camera flight easing (lerp) for 6 views (Overview, BESS, Solar, House, Grid, Street-level), and `<PerformanceMonitor>`.
- `<House />`: Modern 2-story eco-building with front façade facing the street, cantilevered glass curtain wall, carport with 3D EV, smart Level-2 wallbox charger (with off-peak 22:00-04:00 automated charging), rooftop mini PV, and spinning HVAC fan.
- `<Road />`: 2-lane urban arterial asphalt street with PBR textures, center yellow dashed line, white edge lines, tire marks, pedestrian zebra crossing, storm drainage grates, curbs, sidewalks, and modern LED streetlamps.
- `<Traffic />`: Dynamic 2-lane traffic flow (sedans, yellow taxis, delivery vans, transit buses, motorbikes) with rotating wheels, dusk/night headlights, taillights, brake deceleration lighting, and TOU-hour-dependent vehicle density.
- `<CityBlocks />`: Surrounding Modern Cyber-Eco district featuring 2-4 story commercial shophouses (convenience store with illuminated neon signage, cyber coffee roastery, green tech office, rooftop solar panels) and distant glass skyline towers (8-15 stories) fading into atmospheric fog.
- `<SolarField />`: 150 kWp ground-mounted solar farm with 4 tilted rack rows, aluminum frames, clearcoat silicon wafers, central 150 kW inverter cabinet, and pulsing activity ring.
- `<BESS />`: 200 kWh / 100 kW LFP Megapack container, real-time LED status bar (Charge/Discharge/Idle), liquid SoC gauge [20%-90%], cooling chillers.
- `<GridTower />`: Steel lattice transmission pylon with crossarms, porcelain insulator strings, 22kV catenary sagging wires, 22/0.4kV step-down transformer with cooling fins, oil drum, and safety fence.
- `<EnergyFlow />`: Smooth 3D `TubeGeometry` conduits with travelling energy photon particles proportional in speed and count to kW, color-coded (PV amber, Grid buy purple, Grid sell green, BESS charge cyan, BESS discharge orange, EV charging cyan).
- `<Lighting />`: Preetham sky model with 24h celestial sun/moon arc, Kelvin temperature shifts, soft PCF shadows, streetlamps, and night window glow.
- `<PostFX />`: Selective bloom for emissives/LEDs/lights, N8AO, vignette, SMAA anti-aliasing.

## 2. PBR Procedural Texture Synthesizers
- **Silicon Monocrystalline Solar Cells:** Custom high-frequency canvas PBR generator replicating 6x10 monocrystalline wafers, anti-reflective coating, silver busbars, and micro-grid fingers with `MeshPhysicalMaterial` clearcoat.
- **Asphalt Roadway:** Custom procedural aggregate noise with lane markings, tire tracks, and road curbs.
- **Industrial BESS Container:** Custom PBR corrugated metal material with SEMS-RL 200 kWh / 100 kW LFP Megapack decals, hazard indicators, and intake louvers.
- **Architectural Concrete Foundation:** PBR aggregate noise with expansion joint seams.
- **Water Retention Pond:** Custom procedural normal ripple map with Fresnel specular reflection.

## 3. Atmospheric & Post-Processing Algorithms
- **Sky Shader:** Preetham atmospheric Rayleigh and Mie scattering model from `@react-three/drei` based on Nishita / Preetham et al.
- **Selective Bloom:** Fast Gaussian / mipmap blur bloom from `@react-three/postprocessing` / `postprocessing` by Nelson Cabral and Hendrik Mans.
- **N8AO:** Scalable Screen-Space Ambient Occlusion by N8Programs (MIT License).
- **Tone Mapping:** ACES Filmic Tone Mapping curve implementation in Three.js.
- **SMAA:** Subpixel Morphological Anti-Aliasing by Jorge Jimenez et al.
