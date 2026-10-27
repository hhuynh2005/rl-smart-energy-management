import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Camera, Eye, Maximize2, RotateCcw, Sun, Battery, Home, Zap, Layers } from 'lucide-react';

export default function SmartHouse3D({
  stepData,
  currentStep,
  totalSteps,
  onFocusComponent,
}) {
  const mountRef = useRef(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const rendererRef = useRef(null);
  const controlsRef = useRef(null);

  // Mesh & Light references for continuous animation
  const animObjectsRef = useRef({
    sunMesh: null,
    sunLight: null,
    moonMesh: null,
    moonLight: null,
    hemiLight: null,
    dirLight: null,
    windowLights: [],
    streetLights: [],
    batteryLed: null,
    batteryGlow: null,
    pvPanels: [],
    flowCurves: {},
    flowParticles: {},
    anchorPoints: {},
  });

  // Screen projected 2D coordinates for 3D floating badges
  const [badges, setBadges] = useState({
    pv: { x: 0, y: 0, visible: false },
    battery: { x: 0, y: 0, visible: false },
    house: { x: 0, y: 0, visible: false },
    grid: { x: 0, y: 0, visible: false },
  });

  // Smooth camera preset transition
  const targetCameraPos = useRef(null);
  const targetLookAt = useRef(null);

  const setCameraPreset = useCallback((pos, lookAt = [0, 2, 0]) => {
    targetCameraPos.current = new THREE.Vector3(...pos);
    targetLookAt.current = new THREE.Vector3(...lookAt);
  }, []);

  // --- INITIALIZE THREE.JS SCENE ---
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = container.clientWidth;
    const height = container.clientHeight || 640;

    // 1. Scene & Atmosphere Fog
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#0A1120');
    scene.fog = new THREE.FogExp2('#0A1120', 0.012);
    sceneRef.current = scene;

    // 2. Camera - Wide perspective
    const camera = new THREE.PerspectiveCamera(42, width / height, 0.5, 300);
    camera.position.set(28, 20, 28);
    cameraRef.current = camera;

    // 3. WebGL Renderer with High Fidelity Shadows & Tone Mapping
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // 4. Orbit Controls (360 orbit, smooth zoom, pan)
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.minDistance = 8;
    controls.maxDistance = 90;
    controls.maxPolarAngle = Math.PI / 2.05; // Never go below ground
    controls.target.set(0, 2, 0);
    controlsRef.current = controls;

    // 5. Lighting Setup
    // Hemispherical Ambient Sky Light
    const hemiLight = new THREE.HemisphereLight('#93C5FD', '#1E293B', 0.75);
    scene.add(hemiLight);

    // Directional Sun Light (Shadow Caster)
    const sunLight = new THREE.DirectionalLight('#FFFBEB', 2.2);
    sunLight.position.set(30, 40, 20);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
    sunLight.shadow.camera.near = 1.0;
    sunLight.shadow.camera.far = 120;
    sunLight.shadow.camera.left = -35;
    sunLight.shadow.camera.right = 35;
    sunLight.shadow.camera.top = 35;
    sunLight.shadow.camera.bottom = -35;
    sunLight.shadow.bias = -0.0003;
    scene.add(sunLight);

    // Sun Visual Orb
    const sunMesh = new THREE.Mesh(
      new THREE.SphereGeometry(2.0, 24, 24),
      new THREE.MeshBasicMaterial({ color: '#FBBF24' })
    );
    scene.add(sunMesh);

    // Moon Visual & Light for Night
    const moonLight = new THREE.DirectionalLight('#93C5FD', 0.4);
    moonLight.position.set(-25, 30, -20);
    scene.add(moonLight);

    const moonMesh = new THREE.Mesh(
      new THREE.SphereGeometry(1.4, 16, 16),
      new THREE.MeshBasicMaterial({ color: '#E2E8F0' })
    );
    scene.add(moonMesh);

    // =========================================================================
    // 6. EXPANSIVE CAMPUS TERRAIN, ROADS, AND TREES
    // =========================================================================
    const campusGroup = new THREE.Group();
    scene.add(campusGroup);

    // 6.1. Grass Ground Plane (120 x 120)
    const groundGeo = new THREE.PlaneGeometry(140, 140, 16, 16);
    const groundMat = new THREE.MeshStandardMaterial({
      color: '#133E26',
      roughness: 0.85,
      metalness: 0.05,
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    campusGroup.add(ground);

    // 6.2. Campus Asphalt Road Network
    // Main Avenue (runs along Z axis)
    const roadMat = new THREE.MeshStandardMaterial({ color: '#1E2530', roughness: 0.8 });
    const lineYellowMat = new THREE.MeshBasicMaterial({ color: '#FBBF24' });
    const lineWhiteMat = new THREE.MeshBasicMaterial({ color: '#E2E8F0' });

    const mainRoad = new THREE.Mesh(new THREE.PlaneGeometry(7.0, 70), roadMat);
    mainRoad.rotation.x = -Math.PI / 2;
    mainRoad.position.set(7.5, 0.02, 0);
    mainRoad.receiveShadow = true;
    campusGroup.add(mainRoad);

    // Dashed Yellow Center Line
    for (let z = -32; z < 32; z += 3.5) {
      const stripe = new THREE.Mesh(new THREE.PlaneGeometry(0.25, 2.0), lineYellowMat);
      stripe.rotation.x = -Math.PI / 2;
      stripe.position.set(7.5, 0.03, z);
      campusGroup.add(stripe);
    }

    // Cross Road (runs along X axis toward BESS & Solar)
    const crossRoad = new THREE.Mesh(new THREE.PlaneGeometry(40, 6.0), roadMat);
    crossRoad.rotation.x = -Math.PI / 2;
    crossRoad.position.set(-8.0, 0.025, 12.0);
    crossRoad.receiveShadow = true;
    campusGroup.add(crossRoad);

    // White Stop Line
    const stopLine = new THREE.Mesh(new THREE.PlaneGeometry(3.0, 0.4), lineWhiteMat);
    stopLine.rotation.x = -Math.PI / 2;
    stopLine.position.set(5.5, 0.035, 9.0);
    campusGroup.add(stopLine);

    // Concrete Sidewalks & Curbs
    const sidewalkMat = new THREE.MeshStandardMaterial({ color: '#334155', roughness: 0.7 });
    const walk1 = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.15, 68), sidewalkMat);
    walk1.position.set(11.8, 0.08, 0);
    walk1.receiveShadow = true;
    campusGroup.add(walk1);

    const walk2 = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.15, 68), sidewalkMat);
    walk2.position.set(3.2, 0.08, -6);
    walk2.receiveShadow = true;
    campusGroup.add(walk2);

    // 6.3. PROCEDURAL TREES & FOLIAGE AROUND CAMPUS ("Cây cối xung quanh")
    const treeGroup = new THREE.Group();
    campusGroup.add(treeGroup);

    const trunkMat = new THREE.MeshStandardMaterial({ color: '#3B2314', roughness: 0.9 });
    const leafMats = [
      new THREE.MeshStandardMaterial({ color: '#15803D', roughness: 0.7 }),
      new THREE.MeshStandardMaterial({ color: '#16A34A', roughness: 0.7 }),
      new THREE.MeshStandardMaterial({ color: '#22C55E', roughness: 0.65 }),
      new THREE.MeshStandardMaterial({ color: '#047857', roughness: 0.75 }),
      new THREE.MeshStandardMaterial({ color: '#0F5132', roughness: 0.8 }),
    ];

    // Helper: Create Round Deciduous Tree
    const createShadeTree = (x, z, scale = 1.0) => {
      const tree = new THREE.Group();
      // Trunk
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22 * scale, 0.32 * scale, 2.2 * scale, 8), trunkMat);
      trunk.position.y = 1.1 * scale;
      trunk.castShadow = true;
      trunk.receiveShadow = true;
      tree.add(trunk);

      // Layered Canopy
      const mat = leafMats[Math.floor(Math.random() * leafMats.length)];
      const crown1 = new THREE.Mesh(new THREE.DodecahedronGeometry(1.4 * scale, 1), mat);
      crown1.position.y = 2.7 * scale;
      crown1.castShadow = true;
      tree.add(crown1);

      const crown2 = new THREE.Mesh(new THREE.DodecahedronGeometry(1.1 * scale, 1), mat);
      crown2.position.set(0.3 * scale, 3.4 * scale, 0.2 * scale);
      crown2.castShadow = true;
      tree.add(crown2);

      tree.position.set(x, 0, z);
      treeGroup.add(tree);
    };

    // Helper: Create Pine / Conifer Tree
    const createPineTree = (x, z, scale = 1.0) => {
      const tree = new THREE.Group();
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18 * scale, 0.28 * scale, 1.8 * scale, 8), trunkMat);
      trunk.position.y = 0.9 * scale;
      trunk.castShadow = true;
      tree.add(trunk);

      const pineMat = leafMats[4];
      for (let i = 0; i < 3; i++) {
        const cone = new THREE.Mesh(
          new THREE.ConeGeometry((1.5 - i * 0.3) * scale, 1.6 * scale, 8),
          pineMat
        );
        cone.position.y = (2.0 + i * 1.1) * scale;
        cone.castShadow = true;
        tree.add(cone);
      }
      tree.position.set(x, 0, z);
      treeGroup.add(tree);
    };

    // Plant trees along road, perimeter, behind solar array, and around building
    // 1. Perimeter avenue trees (right border)
    for (let z = -28; z <= 28; z += 5.5) {
      createShadeTree(14.5 + (Math.sin(z) * 0.8), z, 0.95 + Math.random() * 0.3);
      if (Math.abs(z) % 2 === 0) {
        createPineTree(17.5, z + 2.5, 1.1);
      }
    }

    // 2. Trees behind and around Solar PV Farm (left & back)
    for (let x = -28; x <= -6; x += 4.5) {
      createShadeTree(x, -24 + Math.cos(x) * 1.5, 1.1 + Math.random() * 0.25);
      createPineTree(x + 2.0, -28, 1.2);
    }
    for (let z = -20; z <= 8; z += 5.0) {
      createPineTree(-28, z, 1.15 + Math.random() * 0.3);
    }

    // 3. Landscape trees in front garden of building & courtyard
    createShadeTree(1.5, 9.5, 0.85);
    createShadeTree(-2.5, 9.2, 0.9);
    createShadeTree(-10.5, 5.5, 0.8);
    createShadeTree(-5.5, 5.0, 0.75);
    createShadeTree(3.5, 18.0, 1.0);
    createPineTree(-14.0, 16.0, 1.0);
    createShadeTree(-18.0, 16.5, 1.1);

    // =========================================================================
    // 7. GROUND-MOUNTED COMMERCIAL SOLAR PV FARM (150 kWp)
    // =========================================================================
    const pvFarmGroup = new THREE.Group();
    pvFarmGroup.position.set(-16.0, 0, -8.0);
    campusGroup.add(pvFarmGroup);

    // Concrete mounting pad for solar farm
    const solarPad = new THREE.Mesh(
      new THREE.BoxGeometry(22, 0.25, 20),
      new THREE.MeshStandardMaterial({ color: '#1E293B', roughness: 0.85 })
    );
    solarPad.position.set(0, 0.125, 0);
    solarPad.receiveShadow = true;
    pvFarmGroup.add(solarPad);

    // PV Module Material (High-tech Blue Silicon with Metallic Sheen)
    const pvSiliconMat = new THREE.MeshStandardMaterial({
      color: '#0F2756',
      roughness: 0.15,
      metalness: 0.85,
      emissive: '#F59E0B',
      emissiveIntensity: 0.1,
    });
    const pvRackMat = new THREE.MeshStandardMaterial({ color: '#94A3B8', metalness: 0.8, roughness: 0.3 });

    // 4 Long Rows of Ground Mount Arrays, tilted 25 degrees toward South
    for (let row = 0; row < 4; row++) {
      const zRow = -6.5 + row * 4.4;
      const rackGroup = new THREE.Group();
      rackGroup.position.set(0, 0, zRow);

      // Aluminum Support Legs
      for (let legX = -8; legX <= 8; legX += 4) {
        const legFront = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.8, 8), pvRackMat);
        legFront.position.set(legX, 0.4, 0.9);
        const legBack = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.8, 8), pvRackMat);
        legBack.position.set(legX, 0.9, -0.9);
        rackGroup.add(legFront, legBack);
      }

      // PV Solar Panels Row (10 modules per row = 40 commercial modules)
      for (let col = 0; col < 9; col++) {
        const xCol = -8.0 + col * 2.0;
        const panel = new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.04, 2.1), pvSiliconMat);
        panel.position.set(xCol, 1.15, 0);
        panel.rotation.x = Math.PI / 7.5; // ~24 deg tilt
        panel.castShadow = true;
        panel.receiveShadow = true;
        rackGroup.add(panel);
        animObjectsRef.current.pvPanels.push(panel);
      }
      pvFarmGroup.add(rackGroup);
    }

    // Solar Farm Inverter Box & Transformer
    const farmInv = new THREE.Mesh(
      new THREE.BoxGeometry(1.4, 1.8, 0.9),
      new THREE.MeshStandardMaterial({ color: '#0F172A', metalness: 0.7, roughness: 0.3 })
    );
    farmInv.position.set(9.5, 0.9, 0);
    farmInv.castShadow = true;
    pvFarmGroup.add(farmInv);

    // =========================================================================
    // 8. MODERN COMMERCIAL SMART BUILDING (PHỤ TẢI TÒA NHÀ - 80.6 kW)
    // =========================================================================
    const buildingGroup = new THREE.Group();
    buildingGroup.position.set(0, 0, -6.0);
    campusGroup.add(buildingGroup);

    // Concrete Building Foundation / Plaza
    const bldgPlaza = new THREE.Mesh(
      new THREE.BoxGeometry(18, 0.3, 16),
      new THREE.MeshStandardMaterial({ color: '#334155', roughness: 0.7 })
    );
    bldgPlaza.position.set(0, 0.15, 0);
    bldgPlaza.receiveShadow = true;
    buildingGroup.add(bldgPlaza);

    // Materials
    const wallGreyMat = new THREE.MeshStandardMaterial({ color: '#1E293B', roughness: 0.5 });
    const wallAccentMat = new THREE.MeshStandardMaterial({ color: '#0F172A', roughness: 0.3, metalness: 0.5 });
    const glassFacadeMat = new THREE.MeshPhysicalMaterial({
      color: '#38BDF8',
      transmission: 0.8,
      opacity: 0.85,
      transparent: true,
      roughness: 0.08,
      ior: 1.5,
      reflectivity: 0.9,
    });

    // 2-Story Modern Main Building Block
    const mainBlock = new THREE.Mesh(new THREE.BoxGeometry(12, 6.2, 10), wallGreyMat);
    mainBlock.position.set(-1.0, 3.25, 0);
    mainBlock.castShadow = true;
    mainBlock.receiveShadow = true;
    buildingGroup.add(mainBlock);

    // Glass Curtain Wall Facade (Facing front & south)
    const glassFacade = new THREE.Mesh(new THREE.BoxGeometry(10.5, 5.0, 0.2), glassFacadeMat);
    glassFacade.position.set(-1.0, 3.25, 5.1);
    buildingGroup.add(glassFacade);

    // Entrance Portico & Glass Doors
    const canopy = new THREE.Mesh(new THREE.BoxGeometry(4.0, 0.2, 2.5), wallAccentMat);
    canopy.position.set(-1.0, 3.0, 6.2);
    canopy.castShadow = true;
    buildingGroup.add(canopy);

    const canopyPillar1 = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 3.0), pvRackMat);
    canopyPillar1.position.set(0.8, 1.5, 7.2);
    const canopyPillar2 = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 3.0), pvRackMat);
    canopyPillar2.position.set(-2.8, 1.5, 7.2);
    buildingGroup.add(canopyPillar1, canopyPillar2);

    // Rooftop HVAC & Parapet
    const parapet = new THREE.Mesh(new THREE.BoxGeometry(12.4, 0.6, 10.4), wallAccentMat);
    parapet.position.set(-1.0, 6.4, 0);
    buildingGroup.add(parapet);

    const hvacUnit1 = new THREE.Mesh(new THREE.BoxGeometry(2.0, 1.2, 1.6), pvRackMat);
    hvacUnit1.position.set(-3.5, 7.0, -1.5);
    hvacUnit1.castShadow = true;
    const hvacUnit2 = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.0, 1.4), pvRackMat);
    hvacUnit2.position.set(1.5, 6.9, 1.2);
    buildingGroup.add(hvacUnit1, hvacUnit2);

    // Rooftop PV Solar array on Building
    for (let c = 0; c < 4; c++) {
      const roofPanel = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.04, 1.4), pvSiliconMat);
      roofPanel.position.set(-3.0 + c * 2.0, 6.6, 1.5);
      roofPanel.rotation.x = Math.PI / 10;
      roofPanel.castShadow = true;
      buildingGroup.add(roofPanel);
      animObjectsRef.current.pvPanels.push(roofPanel);
    }

    // Warm Interior Lights for Windows (Active at Night)
    const intLight1 = new THREE.PointLight('#FBBF24', 0, 10);
    intLight1.position.set(-1.0, 2.2, 2.0);
    const intLight2 = new THREE.PointLight('#60A5FA', 0, 10);
    intLight2.position.set(-1.0, 4.8, 2.0);
    buildingGroup.add(intLight1, intLight2);
    animObjectsRef.current.windowLights = [intLight1, intLight2];

    // =========================================================================
    // 9. INDUSTRIAL CONTAINERIZED BESS STATION (200 kWh / 50 kW)
    // =========================================================================
    const bessGroup = new THREE.Group();
    bessGroup.position.set(-7.5, 0, 5.5);
    campusGroup.add(bessGroup);

    // BESS Concrete Foundation Pad
    const bessPad = new THREE.Mesh(
      new THREE.BoxGeometry(7.5, 0.35, 4.5),
      new THREE.MeshStandardMaterial({ color: '#334155' })
    );
    bessPad.position.set(0, 0.175, 0);
    bessPad.receiveShadow = true;
    bessGroup.add(bessPad);

    // Industrial Container Body (Tesla Megapack / Fluence Cube style)
    const containerMat = new THREE.MeshStandardMaterial({
      color: '#0B3B2B',
      roughness: 0.35,
      metalness: 0.65,
    });
    const bessContainer = new THREE.Mesh(new THREE.BoxGeometry(6.2, 2.8, 3.2), containerMat);
    bessContainer.position.set(0, 1.6, 0);
    bessContainer.castShadow = true;
    bessContainer.receiveShadow = true;
    bessGroup.add(bessContainer);

    // Container Roof HVAC Chiller Units
    const chiller = new THREE.Mesh(
      new THREE.BoxGeometry(4.5, 0.6, 2.2),
      new THREE.MeshStandardMaterial({ color: '#1E293B' })
    );
    chiller.position.set(0, 3.2, 0);
    bessGroup.add(chiller);

    // Glowing LED Status Bar & SoC Level Display
    const ledBarGeo = new THREE.BoxGeometry(5.2, 0.25, 0.1);
    const ledBarMat = new THREE.MeshBasicMaterial({ color: '#10B981' });
    const ledBar = new THREE.Mesh(ledBarGeo, ledBarMat);
    ledBar.position.set(0, 2.7, 1.66);
    bessGroup.add(ledBar);
    animObjectsRef.current.batteryLed = ledBar;

    // Point Light Glow at BESS
    const bessGlow = new THREE.PointLight('#10B981', 1.5, 8);
    bessGlow.position.set(0, 2.2, 2.2);
    bessGroup.add(bessGlow);
    animObjectsRef.current.batteryGlow = bessGlow;

    // High Voltage Transformer at BESS Station
    const bessTrans = new THREE.Mesh(
      new THREE.CylinderGeometry(0.5, 0.5, 1.6, 16),
      new THREE.MeshStandardMaterial({ color: '#475569', metalness: 0.8 })
    );
    bessTrans.position.set(2.5, 1.0, -1.8);
    bessGroup.add(bessTrans);

    // =========================================================================
    // 10. HIGH-VOLTAGE POWER TRANSMISSION PYLON & GRID SUBSTATION (21.2 kW)
    // =========================================================================
    const gridGroup = new THREE.Group();
    gridGroup.position.set(16.0, 0, -10.0);
    campusGroup.add(gridGroup);

    // Gravel Substation Ground Pad
    const gravelPad = new THREE.Mesh(
      new THREE.BoxGeometry(14, 0.2, 14),
      new THREE.MeshStandardMaterial({ color: '#475569', roughness: 0.9 })
    );
    gravelPad.position.set(0, 0.1, 0);
    gravelPad.receiveShadow = true;
    gridGroup.add(gravelPad);

    // High-Voltage Lattice Steel Tower Pylon (Authentic Power Pylon)
    const steelMat = new THREE.MeshStandardMaterial({ color: '#CBD5E1', metalness: 0.9, roughness: 0.2 });

    const createLatticePylon = () => {
      const pylon = new THREE.Group();
      // 4 Main corner legs tapering to top
      const legGeo = new THREE.CylinderGeometry(0.08, 0.14, 18, 8);
      const l1 = new THREE.Mesh(legGeo, steelMat);
      l1.position.set(-1.2, 9, -1.2);
      l1.rotation.z = -0.05;
      l1.rotation.x = 0.05;
      const l2 = new THREE.Mesh(legGeo, steelMat);
      l2.position.set(1.2, 9, -1.2);
      l2.rotation.z = 0.05;
      l2.rotation.x = 0.05;
      const l3 = new THREE.Mesh(legGeo, steelMat);
      l3.position.set(-1.2, 9, 1.2);
      l3.rotation.z = -0.05;
      l3.rotation.x = -0.05;
      const l4 = new THREE.Mesh(legGeo, steelMat);
      l4.position.set(1.2, 9, 1.2);
      l4.rotation.z = 0.05;
      l4.rotation.x = -0.05;
      pylon.add(l1, l2, l3, l4);

      // Horizontal crossbars
      for (let y = 3; y <= 16; y += 3) {
        const w = 2.4 - (y / 18) * 1.4;
        const bX1 = new THREE.Mesh(new THREE.BoxGeometry(w, 0.1, 0.1), steelMat);
        bX1.position.set(0, y, w / 2);
        const bX2 = new THREE.Mesh(new THREE.BoxGeometry(w, 0.1, 0.1), steelMat);
        bX2.position.set(0, y, -w / 2);
        pylon.add(bX1, bX2);
      }

      // 3 High-Voltage Crossarms
      const arm1 = new THREE.Mesh(new THREE.BoxGeometry(8.0, 0.2, 0.2), steelMat);
      arm1.position.set(0, 16.5, 0);
      const arm2 = new THREE.Mesh(new THREE.BoxGeometry(6.4, 0.2, 0.2), steelMat);
      arm2.position.set(0, 14.5, 0);
      const arm3 = new THREE.Mesh(new THREE.BoxGeometry(7.2, 0.2, 0.2), steelMat);
      arm3.position.set(0, 12.5, 0);
      pylon.add(arm1, arm2, arm3);

      // Insulator strings (Sứ cách điện)
      const insMat = new THREE.MeshStandardMaterial({ color: '#E2E8F0', roughness: 0.1 });
      [-3.6, 0, 3.6].forEach((xPos) => {
        const ins = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.2, 8), insMat);
        ins.position.set(xPos, 15.8, 0);
        pylon.add(ins);
      });

      return pylon;
    };

    gridGroup.add(createLatticePylon());

    // High Voltage Step-Down Transformers in Substation
    for (let tx = -3.5; tx <= 3.5; tx += 3.5) {
      const transUnit = new THREE.Mesh(
        new THREE.BoxGeometry(1.8, 2.0, 1.8),
        new THREE.MeshStandardMaterial({ color: '#1E293B', metalness: 0.8, roughness: 0.4 })
      );
      transUnit.position.set(tx, 1.0, 3.5);
      transUnit.castShadow = true;
      gridGroup.add(transUnit);

      // Bushings on transformer top
      const bush = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.8, 8), new THREE.MeshBasicMaterial({ color: '#A855F7' }));
      bush.position.set(tx, 2.4, 3.5);
      gridGroup.add(bush);
    }

    // =========================================================================
    // 11. GLOWING ENERGY TRANSMISSION LASER LINES & ENERGY ORBS
    // =========================================================================
    // Hub Substation Junction point
    const posHub = new THREE.Vector3(-2.5, 1.5, 1.5);
    const posPV = new THREE.Vector3(-14.0, 2.0, -8.0);
    const posBESS = new THREE.Vector3(-7.5, 2.2, 5.5);
    const posHouse = new THREE.Vector3(-1.0, 2.5, -4.0);
    const posGrid = new THREE.Vector3(14.0, 3.0, -9.0);

    animObjectsRef.current.anchorPoints = {
      pv: posPV,
      hub: posHub,
      battery: posBESS,
      house: posHouse,
      grid: posGrid,
    };

    // Helper: Create 3D Curved Laser Line
    const createLaserPath = (p1, p2, midY = 2.5, colorHex = '#38BDF8') => {
      const mid = new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5);
      mid.y = Math.max(p1.y, p2.y) + midY;
      const curve = new THREE.CatmullRomCurve3([p1, mid, p2]);
      const tubeGeo = new THREE.TubeGeometry(curve, 36, 0.08, 8, false);
      const tubeMat = new THREE.MeshBasicMaterial({ color: colorHex, transparent: true, opacity: 0.65 });
      const tubeMesh = new THREE.Mesh(tubeGeo, tubeMat);
      scene.add(tubeMesh);
      return { curve, tubeMesh, tubeMat };
    };

    const flowCurves = {
      pv: createLaserPath(posPV, posHub, 2.2, '#F59E0B'),
      bess: createLaserPath(posHub, posBESS, 1.8, '#10B981'),
      house: createLaserPath(posHub, posHouse, 1.5, '#3B82F6'),
      grid: createLaserPath(posHub, posGrid, 3.5, '#8B5CF6'),
    };
    animObjectsRef.current.flowCurves = flowCurves;

    // Glowing Particle Energy Orbs
    const orbGeo = new THREE.SphereGeometry(0.25, 16, 16);
    const createOrbGroup = (colorHex, count = 10) => {
      const group = new THREE.Group();
      const oMat = new THREE.MeshBasicMaterial({ color: colorHex });
      for (let i = 0; i < count; i++) {
        const orb = new THREE.Mesh(orbGeo, oMat);
        orb.visible = false;
        group.add(orb);
      }
      scene.add(group);
      return { group, count };
    };

    animObjectsRef.current.flowParticles = {
      pv: createOrbGroup('#FDE047', 10),
      bess: createOrbGroup('#34D399', 10),
      house: createOrbGroup('#60A5FA', 10),
      grid: createOrbGroup('#C4B5FD', 10),
    };

    // Store references
    animObjectsRef.current.sunMesh = sunMesh;
    animObjectsRef.current.sunLight = sunLight;
    animObjectsRef.current.moonMesh = moonMesh;
    animObjectsRef.current.moonLight = moonLight;
    animObjectsRef.current.hemiLight = hemiLight;

    // --- CONTINUOUS ANIMATION LOOP ---
    let animId;
    const clock = new THREE.Clock();

    const animate = () => {
      animId = requestAnimationFrame(animate);
      const delta = clock.getDelta();

      // Smooth camera transition if user clicked preset
      if (targetCameraPos.current && targetLookAt.current) {
        camera.position.lerp(targetCameraPos.current, 0.08);
        controls.target.lerp(targetLookAt.current, 0.08);
        if (camera.position.distanceTo(targetCameraPos.current) < 0.1) {
          targetCameraPos.current = null;
          targetLookAt.current = null;
        }
      }

      controls.update();

      // Project 3D Anchors to 2D Screen Space for HTML Badges
      const anchors = animObjectsRef.current.anchorPoints;
      if (anchors.pv) {
        const project = (v3) => {
          const v = v3.clone().project(camera);
          const x = ((v.x + 1) * width) / 2;
          const y = ((-v.y + 1) * height) / 2;
          const visible = v.z < 1.0;
          return { x, y, visible };
        };

        setBadges({
          pv: project(new THREE.Vector3(-16.0, 4.0, -8.0)),
          battery: project(new THREE.Vector3(-7.5, 4.2, 5.5)),
          house: project(new THREE.Vector3(-1.0, 6.5, -4.0)),
          grid: project(new THREE.Vector3(16.0, 14.0, -10.0)),
        });
      }

      renderer.render(scene, camera);
    };

    animate();

    // Window Resize Handler
    const handleResize = () => {
      if (!container || !camera || !renderer) return;
      const newW = container.clientWidth;
      const newH = container.clientHeight || 640;
      camera.aspect = newW / newH;
      camera.updateProjectionMatrix();
      renderer.setSize(newW, newH);
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animId);
      if (renderer.domElement && container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, []);

  // --- REACTIVE DAY/NIGHT LIGHTING & POWER FLOW TELEMETRY ---
  useEffect(() => {
    if (!stepData || !animObjectsRef.current.sunMesh) return;

    const { hour, p_pv_kw, p_load_kw, p_batt_kw, p_buy_kw, p_sell_kw, soc_pct } = stepData;
    const isDay = hour >= 6.0 && hour <= 18.0;

    const {
      sunMesh,
      sunLight,
      moonMesh,
      moonLight,
      windowLights,
      batteryLed,
      batteryGlow,
      pvPanels,
      flowCurves,
      flowParticles,
    } = animObjectsRef.current;

    // 1. Dynamic Celestial Movement (Sun & Moon Arc)
    if (isDay) {
      const progress = (hour - 6.0) / 12.0;
      const sunAngle = progress * Math.PI;
      const sX = Math.cos(sunAngle) * 45;
      const sY = Math.sin(sunAngle) * 35 + 4;
      const sZ = Math.sin(sunAngle) * 20 - 10;

      sunMesh.position.set(sX, sY, sZ);
      sunMesh.visible = true;
      sunLight.position.set(sX, sY, sZ);
      sunLight.intensity = Math.max(0.6, Math.sin(sunAngle) * 2.8);

      if (progress < 0.2 || progress > 0.8) {
        sunLight.color.set('#F59E0B');
        sunMesh.material.color.set('#F59E0B');
        sceneRef.current.background.set('#1E1B4B');
      } else {
        sunLight.color.set('#FFFBEB');
        sunMesh.material.color.set('#FBBF24');
        sceneRef.current.background.set('#0A192F');
      }

      moonMesh.visible = false;
      moonLight.intensity = 0;
      windowLights.forEach((l) => (l.intensity = 0));
    } else {
      sunMesh.visible = false;
      sunLight.intensity = 0;

      moonMesh.position.set(-25, 35, -20);
      moonMesh.visible = true;
      moonLight.intensity = 0.5;
      sceneRef.current.background.set('#060D1A');

      // Turn on building lights at night
      windowLights.forEach((l) => (l.intensity = 4.0));
    }

    // 2. BESS LED Status & Glow
    if (batteryLed) {
      if (p_batt_kw > 0.2) {
        // Charging: Emerald Green
        batteryLed.material.color.set('#10B981');
        batteryGlow.color.set('#10B981');
        batteryGlow.intensity = 2.5;
      } else if (p_batt_kw < -0.2) {
        // Discharging: Crimson Red
        batteryLed.material.color.set('#EF4444');
        batteryGlow.color.set('#EF4444');
        batteryGlow.intensity = 2.5;
      } else {
        // Idle
        batteryLed.material.color.set('#059669');
        batteryGlow.color.set('#059669');
        batteryGlow.intensity = 0.6;
      }
    }

    // 3. Solar PV Glow Intensity
    pvPanels.forEach((p) => {
      if (p_pv_kw > 2.0) {
        p.material.emissiveIntensity = Math.min(1.4, p_pv_kw / 100);
        p.material.emissive.set('#FBBF24');
      } else {
        p.material.emissiveIntensity = 0.04;
      }
    });

    // 4. Update Laser Tubes & Energy Particle Flow
    const updatePathParticles = (key, activeKw, colorHex, reverse = false) => {
      const pObj = flowParticles[key];
      const curveObj = flowCurves[key];
      if (!pObj || !curveObj) return;

      const isActive = activeKw > 0.5;
      curveObj.tubeMesh.visible = isActive;
      curveObj.tubeMat.color.set(colorHex);

      const count = pObj.count;
      for (let i = 0; i < count; i++) {
        const orb = pObj.group.children[i];
        orb.visible = isActive;
        if (isActive) {
          orb.material.color.set(colorHex);
          const speed = Math.max(0.4, Math.min(2.5, activeKw / 30));
          const tOffset = (Date.now() * 0.001 * speed + i / count) % 1.0;
          const t = reverse ? 1.0 - tOffset : tOffset;
          orb.position.copy(curveObj.curve.getPointAt(t));
          orb.scale.setScalar(Math.max(0.8, Math.min(2.0, activeKw / 35)));
        }
      }
    };

    // Solar PV Flow
    updatePathParticles('pv', p_pv_kw, '#FBBF24', false);

    // BESS Flow: Sạc vs Xả
    if (p_batt_kw > 0.5) {
      updatePathParticles('bess', p_batt_kw, '#10B981', false); // Nạp pin
    } else if (p_batt_kw < -0.5) {
      updatePathParticles('bess', Math.abs(p_batt_kw), '#EF4444', true); // Xả pin
    } else {
      updatePathParticles('bess', 0, '#10B981', false);
    }

    // Building Load Flow
    updatePathParticles('house', p_load_kw, '#3B82F6', false);

    // Grid Import / Export Flow
    if (p_buy_kw > 0.5) {
      updatePathParticles('grid', p_buy_kw, '#A855F7', true); // Mua lưới
    } else if (p_sell_kw > 0.5) {
      updatePathParticles('grid', p_sell_kw, '#FBBF24', false); // Bán lưới
    } else {
      updatePathParticles('grid', 0, '#8B5CF6', false);
    }
  }, [stepData]);

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: '620px',
        borderRadius: '16px',
        overflow: 'hidden',
        border: '1px solid rgba(59, 130, 246, 0.25)',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.6), inset 0 0 24px rgba(59, 130, 246, 0.1)',
      }}
    >
      {/* 3D WebGL Canvas */}
      <div ref={mountRef} style={{ width: '100%', height: '100%', outline: 'none' }} />

      {/* Camera Presets Toolbar */}
      <div
        style={{
          position: 'absolute',
          top: '1rem',
          right: '1rem',
          display: 'flex',
          gap: '0.45rem',
          background: 'rgba(15, 23, 42, 0.85)',
          backdropFilter: 'blur(12px)',
          padding: '0.35rem 0.6rem',
          borderRadius: '10px',
          border: '1px solid rgba(255, 255, 255, 0.12)',
          zIndex: 20,
        }}
      >
        <button
          className="btn-ctrl"
          style={{ width: 'auto', padding: '0.25rem 0.6rem', fontSize: '0.75rem', borderRadius: '6px' }}
          onClick={() => setCameraPreset([28, 20, 28], [0, 2, 0])}
          title="Góc nhìn Isometric toàn cảnh Microgrid"
        >
          <Camera size={14} style={{ marginRight: 4 }} />
          Toàn cảnh
        </button>
        <button
          className="btn-ctrl"
          style={{ width: 'auto', padding: '0.25rem 0.6rem', fontSize: '0.75rem', borderRadius: '6px' }}
          onClick={() => setCameraPreset([-5, 6, 12], [-7.5, 2.2, 5.5])}
          title="Cận cảnh Trạm BESS 200 kWh"
        >
          <Battery size={14} color="#10B981" style={{ marginRight: 4 }} />
          BESS 200kWh
        </button>
        <button
          className="btn-ctrl"
          style={{ width: 'auto', padding: '0.25rem 0.6rem', fontSize: '0.75rem', borderRadius: '6px' }}
          onClick={() => setCameraPreset([-12, 14, 2], [-16.0, 2.0, -8.0])}
          title="Cận cảnh Nông trại Điện mặt trời Solar PV"
        >
          <Sun size={14} color="#FBBF24" style={{ marginRight: 4 }} />
          Solar PV Farm
        </button>
        <button
          className="btn-ctrl"
          style={{ width: 'auto', padding: '0.25rem 0.6rem', fontSize: '0.75rem', borderRadius: '6px' }}
          onClick={() => setCameraPreset([2, 8, 8], [-1.0, 3.5, -4.0])}
          title="Cận cảnh Tòa nhà thông minh (Phụ tải)"
        >
          <Home size={14} color="#3B82F6" style={{ marginRight: 4 }} />
          Tòa nhà
        </button>
        <button
          className="btn-ctrl"
          style={{ width: 'auto', padding: '0.25rem 0.6rem', fontSize: '0.75rem', borderRadius: '6px' }}
          onClick={() => setCameraPreset([12, 14, -2], [16.0, 6.0, -10.0])}
          title="Cận cảnh Trạm biến áp & Cột điện cao thế"
        >
          <Zap size={14} color="#A855F7" style={{ marginRight: 4 }} />
          Lưới điện
        </button>
        <button
          className="btn-ctrl"
          style={{ width: 'auto', padding: '0.25rem 0.6rem', fontSize: '0.75rem', borderRadius: '6px' }}
          onClick={() => setCameraPreset([0, 45, 0.1], [0, 0, 0])}
          title="Góc nhìn thẳng từ trên cao xuống"
        >
          <Eye size={14} style={{ marginRight: 4 }} />
          Top-down
        </button>
      </div>

      {/* Floating 3D Telemetry Badges (Exact match with demo.png) */}
      {/* 1. Solar PV Badge */}
      {badges.pv.visible && (
        <div
          onClick={() => setCameraPreset([-12, 14, 2], [-16.0, 2.0, -8.0])}
          style={{
            position: 'absolute',
            left: `${badges.pv.x}px`,
            top: `${badges.pv.y}px`,
            transform: 'translate(-50%, -100%)',
            background: 'rgba(15, 23, 42, 0.9)',
            backdropFilter: 'blur(10px)',
            border: '2px solid #F59E0B',
            borderRadius: '10px',
            padding: '0.4rem 0.75rem',
            color: '#FFFFFF',
            cursor: 'pointer',
            boxShadow: '0 6px 20px rgba(245, 158, 11, 0.45)',
            zIndex: 15,
            pointerEvents: 'auto',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.72rem', fontWeight: 700, color: '#FBBF24' }}>
            <span>☀️</span> SOLAR PV
          </div>
          <div style={{ fontSize: '0.95rem', fontWeight: 800, fontFamily: 'monospace' }}>
            {stepData?.p_pv_kw?.toFixed(1) || 0} kW
          </div>
        </div>
      )}

      {/* 2. Battery BESS Badge */}
      {badges.battery.visible && (
        <div
          onClick={() => setCameraPreset([-5, 6, 12], [-7.5, 2.2, 5.5])}
          style={{
            position: 'absolute',
            left: `${badges.battery.x}px`,
            top: `${badges.battery.y}px`,
            transform: 'translate(-50%, -100%)',
            background: 'rgba(15, 23, 42, 0.9)',
            backdropFilter: 'blur(10px)',
            border: `2px solid ${stepData?.p_batt_kw < -0.1 ? '#EF4444' : '#10B981'}`,
            borderRadius: '10px',
            padding: '0.4rem 0.75rem',
            color: '#FFFFFF',
            cursor: 'pointer',
            boxShadow: `0 6px 20px ${stepData?.p_batt_kw < -0.1 ? 'rgba(239, 68, 68, 0.5)' : 'rgba(16, 185, 129, 0.5)'}`,
            zIndex: 15,
            pointerEvents: 'auto',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.72rem', fontWeight: 700, color: stepData?.p_batt_kw < -0.1 ? '#F87171' : '#34D399' }}>
            <span>🔋</span> BESS (SoC: {stepData?.soc_pct?.toFixed(0) || 50}%)
          </div>
          <div style={{ fontSize: '0.95rem', fontWeight: 800, fontFamily: 'monospace' }}>
            {stepData?.p_batt_kw > 0
              ? `+${stepData?.p_batt_kw?.toFixed(1)} kW (Sạc)`
              : stepData?.p_batt_kw < 0
              ? `${stepData?.p_batt_kw?.toFixed(1)} kW (Xả)`
              : '0.0 kW (Nghỉ)'}
          </div>
        </div>
      )}

      {/* 3. House Load Badge */}
      {badges.house.visible && (
        <div
          onClick={() => setCameraPreset([2, 8, 8], [-1.0, 3.5, -4.0])}
          style={{
            position: 'absolute',
            left: `${badges.house.x}px`,
            top: `${badges.house.y}px`,
            transform: 'translate(-50%, -100%)',
            background: 'rgba(15, 23, 42, 0.9)',
            backdropFilter: 'blur(10px)',
            border: '2px solid #3B82F6',
            borderRadius: '10px',
            padding: '0.4rem 0.75rem',
            color: '#FFFFFF',
            cursor: 'pointer',
            boxShadow: '0 6px 20px rgba(59, 130, 246, 0.5)',
            zIndex: 15,
            pointerEvents: 'auto',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.72rem', fontWeight: 700, color: '#60A5FA' }}>
            <span>🏠</span> PHỤ TẢI NHÀ
          </div>
          <div style={{ fontSize: '0.95rem', fontWeight: 800, fontFamily: 'monospace' }}>
            {stepData?.p_load_kw?.toFixed(1) || 0} kW
          </div>
        </div>
      )}

      {/* 4. EVN Grid Badge */}
      {badges.grid.visible && (
        <div
          onClick={() => setCameraPreset([12, 14, -2], [16.0, 6.0, -10.0])}
          style={{
            position: 'absolute',
            left: `${badges.grid.x}px`,
            top: `${badges.grid.y}px`,
            transform: 'translate(-50%, -100%)',
            background: 'rgba(15, 23, 42, 0.9)',
            backdropFilter: 'blur(10px)',
            border: '2px solid #A855F7',
            borderRadius: '10px',
            padding: '0.4rem 0.75rem',
            color: '#FFFFFF',
            cursor: 'pointer',
            boxShadow: '0 6px 20px rgba(168, 85, 247, 0.5)',
            zIndex: 15,
            pointerEvents: 'auto',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.72rem', fontWeight: 700, color: '#C4B5FD' }}>
            <span>⚡</span> Lưới điện
          </div>
          <div style={{ fontSize: '0.95rem', fontWeight: 800, fontFamily: 'monospace' }}>
            {stepData?.p_buy_kw > 0
              ? `${stepData?.p_buy_kw?.toFixed(1)} kW (Mua)`
              : stepData?.p_sell_kw > 0
              ? `${stepData?.p_sell_kw?.toFixed(1)} kW (Bán)`
              : '21.2 kW'}
          </div>
        </div>
      )}

      {/* Bottom Hint */}
      <div
        style={{
          position: 'absolute',
          bottom: '0.75rem',
          left: '1rem',
          background: 'rgba(15, 23, 42, 0.85)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          padding: '0.35rem 0.75rem',
          borderRadius: '8px',
          fontSize: '0.78rem',
          color: '#CBD5E1',
          pointerEvents: 'none',
          backdropFilter: 'blur(8px)',
        }}
      >
        💡 <b>Chuột trái:</b> Xoay 360° | <b>Cuộn chuột:</b> Phóng to/nhỏ | <b>Chuột phải:</b> Dịch chuyển | <b>Click nhãn:</b> Zoom lại gần
      </div>
    </div>
  );
}
