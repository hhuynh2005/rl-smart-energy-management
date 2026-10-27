import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Camera, Eye, Sun, Battery, Home, Zap, Loader2 } from 'lucide-react';

/**
 * SmartHouse3D - 3D Digital Twin of the Smart Microgrid Campus
 * High-fidelity Three.js scene faithfully reproducing docs/demo.png:
 * - Aerial/Isometric camera vantage point capturing all structures in 1 default view
 * - Auto-resizing with ResizeObserver, filling 100% of container (flex: 1)
 * - Modern Architectural Smart Campus Building (Ivory/Stone facade + Glass curtain walls)
 * - Extensive Rooftop Solar PV Installation tiled on building roofs
 * - Large commercial ground/canopy solar PV farm (150 kWp) on the left
 * - Industrial BESS container (200 kWh / 50 kW) with dynamic LED status bar
 * - High-voltage steel lattice transmission pylon & substation on the right
 * - Asphalt roadway network with painted yellow dashed lines & parked 3D cars
 * - Glowing cyber laser energy flow conduits with real-time traveling orbs
 * - Floating 3D holographic badges for PV, Load, BESS, and Grid with smooth camera tween
 * - Pause animation when tab is inactive (document.hidden)
 */
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
  const [isSceneReady, setIsSceneReady] = useState(false);

  // References for continuous dynamic animation
  const animObjectsRef = useRef({
    sunLight: null,
    sunMesh: null,
    moonLight: null,
    moonMesh: null,
    hemiLight: null,
    ambientLight: null,
    windowLights: [],
    batteryLed: null,
    pvPanels: [],
    flowCurves: {},
    flowParticles: {},
    anchorPoints: {},
  });

  // Screen projected 2D coordinates for floating badges
  const [badges, setBadges] = useState({
    pv: { x: 0, y: 0, visible: false },
    battery: { x: 0, y: 0, visible: false },
    house: { x: 0, y: 0, visible: false },
    grid: { x: 0, y: 0, visible: false },
  });

  // Smooth camera preset interpolation
  const targetCameraPos = useRef(null);
  const targetLookAt = useRef(null);

  const setCameraPreset = useCallback((pos, lookAt = [0, 2.5, -2]) => {
    targetCameraPos.current = new THREE.Vector3(...pos);
    targetLookAt.current = new THREE.Vector3(...lookAt);
  }, []);

  // --- INITIALIZE THREE.JS SCENE WITH RESIZEOBSERVER ---
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = container.clientWidth || 1000;
    const height = container.clientHeight || 500;

    // 1. Scene & Atmospheric Fog
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#38BDF8');
    scene.fog = new THREE.FogExp2('#BAE6FD', 0.005);
    sceneRef.current = scene;

    // 2. Camera - Elevated aerial/isometric vantage point matching demo.png
    const camera = new THREE.PerspectiveCamera(42, width / height, 0.5, 600);
    camera.position.set(50, 38, 55);
    cameraRef.current = camera;

    // 3. WebGL Renderer with High-Fidelity Shadows & Tone Mapping
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.18;
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // 4. Orbit Controls (Wide zoom range, smooth damping, 360 orbit)
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.minDistance = 12;
    controls.maxDistance = 240;
    controls.maxPolarAngle = Math.PI / 2.05;
    controls.target.set(0, 2.5, -2.0);
    controlsRef.current = controls;

    // 5. High-Quality Lighting Setup
    const hemiLight = new THREE.HemisphereLight('#E0F2FE', '#334155', 1.15);
    scene.add(hemiLight);

    const ambientLight = new THREE.AmbientLight('#FFFFFF', 0.5);
    scene.add(ambientLight);

    const sunLight = new THREE.DirectionalLight('#FFFDF0', 2.8);
    sunLight.position.set(-30, 50, 30);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
    sunLight.shadow.camera.near = 1.0;
    sunLight.shadow.camera.far = 180;
    sunLight.shadow.camera.left = -55;
    sunLight.shadow.camera.right = 55;
    sunLight.shadow.camera.top = 55;
    sunLight.shadow.camera.bottom = -55;
    sunLight.shadow.bias = -0.0002;
    scene.add(sunLight);

    const sunMesh = new THREE.Mesh(
      new THREE.SphereGeometry(2.8, 24, 24),
      new THREE.MeshBasicMaterial({ color: '#FDE047' })
    );
    sunMesh.position.set(-30, 50, 30);
    scene.add(sunMesh);

    const moonLight = new THREE.DirectionalLight('#93C5FD', 0.0);
    moonLight.position.set(30, 40, -30);
    scene.add(moonLight);

    const moonMesh = new THREE.Mesh(
      new THREE.SphereGeometry(1.8, 16, 16),
      new THREE.MeshBasicMaterial({ color: '#E2E8F0' })
    );
    moonMesh.position.set(30, 40, -30);
    moonMesh.visible = false;
    scene.add(moonMesh);

    // =========================================================================
    // 6. EXPANSIVE LANDSCAPE TERRAIN, ROADS & LUSH TREES (Bám sát demo.png)
    // =========================================================================
    const campusGroup = new THREE.Group();
    scene.add(campusGroup);

    // 6.1. Vibrant Green Lawn Ground (280 x 280)
    const groundGeo = new THREE.PlaneGeometry(280, 280, 32, 32);
    const groundMat = new THREE.MeshStandardMaterial({
      color: '#346B31',
      roughness: 0.85,
      metalness: 0.05,
    });
    const groundMesh = new THREE.Mesh(groundGeo, groundMat);
    groundMesh.rotation.x = -Math.PI / 2;
    groundMesh.receiveShadow = true;
    campusGroup.add(groundMesh);

    // Distant Rolling Hills Horizon
    const hillMat = new THREE.MeshStandardMaterial({ color: '#254E25', roughness: 0.95 });
    for (let h = 0; h < 16; h++) {
      const angle = (h / 16) * Math.PI * 2;
      const dist = 115 + (h % 3) * 12;
      const radius = 22 + (h % 4) * 8;
      const hill = new THREE.Mesh(new THREE.SphereGeometry(radius, 12, 8), hillMat);
      hill.scale.set(1.6, 0.45, 1.2);
      hill.position.set(Math.cos(angle) * dist, -3, Math.sin(angle) * dist);
      campusGroup.add(hill);
    }

    // 6.2. Campus Asphalt Road Network with Yellow & White Markings
    const roadMat = new THREE.MeshStandardMaterial({ color: '#1E232A', roughness: 0.7, metalness: 0.1 });
    const curbMat = new THREE.MeshStandardMaterial({ color: '#94A3B8', roughness: 0.5 });
    const yellowStripeMat = new THREE.MeshBasicMaterial({ color: '#FBBF24' });
    const whiteStripeMat = new THREE.MeshBasicMaterial({ color: '#F8FAFC' });

    // Main East-West Thoroughfare
    const mainRoad = new THREE.Mesh(new THREE.BoxGeometry(84, 0.08, 7.0), roadMat);
    mainRoad.position.set(0, 0.04, 8.0);
    mainRoad.receiveShadow = true;
    campusGroup.add(mainRoad);

    // Curbs along main road
    const curbNorth = new THREE.Mesh(new THREE.BoxGeometry(84, 0.16, 0.35), curbMat);
    curbNorth.position.set(0, 0.08, 4.3);
    const curbSouth = new THREE.Mesh(new THREE.BoxGeometry(84, 0.16, 0.35), curbMat);
    curbSouth.position.set(0, 0.08, 11.7);
    campusGroup.add(curbNorth, curbSouth);

    // Yellow Dashed Centerlines along Main Road
    for (let c = -38; c <= 38; c += 3.4) {
      const dash = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.01, 0.2), yellowStripeMat);
      dash.position.set(c, 0.09, 8.0);
      campusGroup.add(dash);
    }

    // Solid White Edge Lines
    const edgeNorth = new THREE.Mesh(new THREE.BoxGeometry(82, 0.01, 0.14), whiteStripeMat);
    edgeNorth.position.set(0, 0.09, 4.8);
    const edgeSouth = new THREE.Mesh(new THREE.BoxGeometry(82, 0.01, 0.14), whiteStripeMat);
    edgeSouth.position.set(0, 0.09, 11.2);
    campusGroup.add(edgeNorth, edgeSouth);

    // North-South Branch Road towards House & Parking Apron
    const branchRoad = new THREE.Mesh(new THREE.BoxGeometry(7.0, 0.08, 15), roadMat);
    branchRoad.position.set(6.5, 0.04, -0.5);
    branchRoad.receiveShadow = true;
    campusGroup.add(branchRoad);

    // Parking Bay in front of Building
    const parkingApron = new THREE.Mesh(new THREE.BoxGeometry(18, 0.07, 9.0), roadMat);
    parkingApron.position.set(13.5, 0.035, -2.5);
    parkingApron.receiveShadow = true;
    campusGroup.add(parkingApron);

    // Parking Stall White Striping
    for (let p = 7.5; p <= 19.5; p += 3.0) {
      const pLine = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.01, 4.6), whiteStripeMat);
      pLine.position.set(p, 0.08, -2.5);
      campusGroup.add(pLine);
    }

    // 6.3. 3D Parked Vehicles on Campus (matching demo.png)
    const createCar = (x, z, rotY, bodyColor) => {
      const car = new THREE.Group();
      car.position.set(x, 0, z);
      car.rotation.y = rotY;

      const bodyMat = new THREE.MeshStandardMaterial({ color: bodyColor, metalness: 0.65, roughness: 0.2 });
      const lowerBody = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.58, 4.0), bodyMat);
      lowerBody.position.y = 0.52;
      lowerBody.castShadow = true;
      car.add(lowerBody);

      const cabinMat = new THREE.MeshStandardMaterial({ color: '#0F172A', roughness: 0.1, metalness: 0.8 });
      const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.52, 2.3), cabinMat);
      cabin.position.set(0, 1.0, -0.2);
      cabin.castShadow = true;
      car.add(cabin);

      const wheelGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.24, 12);
      const wheelMat = new THREE.MeshStandardMaterial({ color: '#111827', roughness: 0.9 });
      wheelGeo.rotateZ(Math.PI / 2);

      const wFL = new THREE.Mesh(wheelGeo, wheelMat);
      wFL.position.set(1.0, 0.3, 1.2);
      const wFR = new THREE.Mesh(wheelGeo, wheelMat);
      wFR.position.set(-1.0, 0.3, 1.2);
      const wBL = new THREE.Mesh(wheelGeo, wheelMat);
      wBL.position.set(1.0, 0.3, -1.2);
      const wBR = new THREE.Mesh(wheelGeo, wheelMat);
      wBR.position.set(-1.0, 0.3, -1.2);
      car.add(wFL, wFR, wBL, wBR);

      campusGroup.add(car);
    };

    createCar(9.0, -2.2, 0, '#DC2626');
    createCar(15.0, -2.2, 0, '#F8FAFC');
    createCar(-3.2, 5.2, Math.PI / 2, '#2563EB');

    // 6.4. ABUNDANT PROCEDURAL TREES & SHRUBS ("Cây cối xung quanh" bám sát demo.png)
    const treeTrunkMat = new THREE.MeshStandardMaterial({ color: '#4A2F13', roughness: 0.85 });
    const greenShades = ['#2D7A32', '#388E3C', '#43A047', '#2E7D32', '#1B5E20', '#4CAF50'];

    const createShadeTree = (x, z, scale = 1.0, colorIdx = 0) => {
      const tree = new THREE.Group();
      tree.position.set(x, 0, z);

      const trunkH = 2.5 * scale;
      const trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(0.24 * scale, 0.38 * scale, trunkH, 8),
        treeTrunkMat
      );
      trunk.position.y = trunkH / 2;
      trunk.castShadow = true;
      tree.add(trunk);

      const leafColor = greenShades[colorIdx % greenShades.length];
      const leafMat = new THREE.MeshStandardMaterial({
        color: leafColor,
        roughness: 0.75,
        flatShading: true,
      });

      const c1 = new THREE.Mesh(new THREE.DodecahedronGeometry(1.8 * scale, 1), leafMat);
      c1.position.y = trunkH + 0.7 * scale;
      c1.castShadow = true;

      const c2 = new THREE.Mesh(new THREE.DodecahedronGeometry(1.4 * scale, 1), leafMat);
      c2.position.set(0.35 * scale, trunkH + 1.5 * scale, -0.25 * scale);
      c2.castShadow = true;

      const c3 = new THREE.Mesh(new THREE.DodecahedronGeometry(1.15 * scale, 1), leafMat);
      c3.position.set(-0.25 * scale, trunkH + 2.1 * scale, 0.25 * scale);
      c3.castShadow = true;

      tree.add(c1, c2, c3);
      campusGroup.add(tree);
    };

    const createPineTree = (x, z, scale = 1.0) => {
      const pine = new THREE.Group();
      pine.position.set(x, 0, z);

      const trunkH = 1.6 * scale;
      const trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(0.2 * scale, 0.3 * scale, trunkH, 8),
        treeTrunkMat
      );
      trunk.position.y = trunkH / 2;
      trunk.castShadow = true;
      pine.add(trunk);

      const pineMat = new THREE.MeshStandardMaterial({ color: '#1B4D24', roughness: 0.8, flatShading: true });
      for (let t = 0; t < 3; t++) {
        const cone = new THREE.Mesh(
          new THREE.ConeGeometry((1.8 - t * 0.38) * scale, 2.0 * scale, 8),
          pineMat
        );
        cone.position.y = trunkH + (t * 1.0 + 0.6) * scale;
        cone.castShadow = true;
        pine.add(cone);
      }
      campusGroup.add(pine);
    };

    const createHedge = (x, z, sx = 1.0, sz = 1.0) => {
      const hedgeMat = new THREE.MeshStandardMaterial({ color: '#2E7D32', roughness: 0.8 });
      const hedge = new THREE.Mesh(new THREE.BoxGeometry(sx, 0.65, sz), hedgeMat);
      hedge.position.set(x, 0.32, z);
      hedge.castShadow = true;
      campusGroup.add(hedge);
    };

    // Plant lush trees matching demo.png
    createShadeTree(8, -14, 1.35, 0);
    createShadeTree(-8, -15, 1.4, 1);
    createShadeTree(-3, -17, 1.5, 2);
    createShadeTree(3, -18, 1.3, 3);
    createShadeTree(-11, -12, 1.2, 4);
    createShadeTree(12, -11, 1.25, 1);
    createPineTree(15, -16, 1.4);
    createPineTree(-13, -17, 1.35);

    createShadeTree(-12, 0, 1.25, 0);
    createShadeTree(-12, 4, 1.2, 2);
    createShadeTree(-13, -5, 1.35, 3);
    createPineTree(-11, 9, 1.2);
    createPineTree(-13, 11, 1.25);

    createShadeTree(-20, 13, 1.3, 4);
    createShadeTree(-25, 13, 1.35, 1);
    createShadeTree(-29, 12, 1.25, 0);
    createPineTree(-33, 11, 1.35);
    createPineTree(-35, 7, 1.3);

    createPineTree(-30, -15, 1.45);
    createPineTree(-25, -16, 1.4);
    createPineTree(-20, -16, 1.35);
    createShadeTree(-17, -15, 1.25, 2);

    createShadeTree(16, 13, 1.25, 0);
    createShadeTree(21, 13, 1.35, 1);
    createShadeTree(26, 13, 1.3, 2);
    createPineTree(23, 7, 1.25);
    createPineTree(26, 3, 1.35);
    createPineTree(27, -4, 1.4);
    createShadeTree(24, -12, 1.25, 3);
    createShadeTree(19, -15, 1.35, 4);

    createShadeTree(-6, 13, 1.15, 1);
    createShadeTree(1, 13.5, 1.25, 3);
    createShadeTree(8, 13, 1.2, 0);

    createHedge(-3.2, 1.0, 3.5, 0.65);
    createHedge(1.8, 1.0, 4.2, 0.65);
    createHedge(-7.0, 1.2, 0.65, 2.8);

    // =========================================================================
    // 7. GROUND/CANOPY COMMERCIAL SOLAR PV FARM (150 kWp) ON LEFT
    // =========================================================================
    const solarFarmGroup = new THREE.Group();
    solarFarmGroup.position.set(-22.0, 0, -3.5);
    campusGroup.add(solarFarmGroup);

    const solarPad = new THREE.Mesh(
      new THREE.BoxGeometry(24, 0.12, 20),
      new THREE.MeshStandardMaterial({ color: '#57534E', roughness: 0.9 })
    );
    solarPad.position.set(0, 0.06, 0);
    solarPad.receiveShadow = true;
    solarFarmGroup.add(solarPad);

    const pvRackMat = new THREE.MeshStandardMaterial({ color: '#94A3B8', metalness: 0.85, roughness: 0.25 });
    const pvCellMat = new THREE.MeshStandardMaterial({
      color: '#1E3A8A',
      metalness: 0.75,
      roughness: 0.12,
    });
    const pvFrameMat = new THREE.MeshStandardMaterial({ color: '#CBD5E1', metalness: 0.9, roughness: 0.2 });

    const rowZPositions = [-6.5, -2.2, 2.2, 6.5];
    rowZPositions.forEach((rz) => {
      const rowGroup = new THREE.Group();
      rowGroup.position.set(0, 0, rz);

      for (let st = -9.0; st <= 9.0; st += 3.6) {
        const postFront = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.2), pvRackMat);
        postFront.position.set(st, 0.6, 1.15);
        postFront.castShadow = true;

        const postBack = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.1), pvRackMat);
        postBack.position.set(st, 1.05, -1.15);
        postBack.castShadow = true;

        const diagBeam = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 2.7), pvRackMat);
        diagBeam.position.set(st, 1.25, 0);
        diagBeam.rotation.x = Math.PI / 8.5;
        diagBeam.castShadow = true;

        rowGroup.add(postFront, postBack, diagBeam);
      }

      const purlin1 = new THREE.Mesh(new THREE.BoxGeometry(21.0, 0.06, 0.06), pvRackMat);
      purlin1.position.set(0, 1.05, 0.7);
      const purlin2 = new THREE.Mesh(new THREE.BoxGeometry(21.0, 0.06, 0.06), pvRackMat);
      purlin2.position.set(0, 1.55, -0.7);
      rowGroup.add(purlin1, purlin2);

      for (let m = 0; m < 11; m++) {
        const mx = -8.8 + m * 1.76;
        const panelGroup = new THREE.Group();
        panelGroup.position.set(mx, 1.28, 0);
        panelGroup.rotation.x = Math.PI / 8.5;

        const frame = new THREE.Mesh(new THREE.BoxGeometry(1.68, 0.04, 2.25), pvFrameMat);
        frame.castShadow = true;
        const cell = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.045, 2.18), pvCellMat);
        cell.castShadow = true;

        panelGroup.add(frame, cell);
        rowGroup.add(panelGroup);
        animObjectsRef.current.pvPanels.push(cell);
      }

      solarFarmGroup.add(rowGroup);
    });

    const farmInverter = new THREE.Mesh(
      new THREE.BoxGeometry(2.0, 1.6, 1.1),
      new THREE.MeshStandardMaterial({ color: '#E2E8F0', metalness: 0.4, roughness: 0.4 })
    );
    farmInverter.position.set(10.0, 0.9, 0);
    farmInverter.castShadow = true;
    solarFarmGroup.add(farmInverter);

    // =========================================================================
    // 8. MODERN ARCHITECTURAL SMART CAMPUS BUILDING (BÁM SÁT demo.png)
    // =========================================================================
    const buildingGroup = new THREE.Group();
    buildingGroup.position.set(-0.5, 0, -4.8);
    campusGroup.add(buildingGroup);

    const bldgPlaza = new THREE.Mesh(
      new THREE.BoxGeometry(24, 0.25, 20),
      new THREE.MeshStandardMaterial({ color: '#94A3B8', roughness: 0.6 })
    );
    bldgPlaza.position.set(0, 0.125, 0);
    bldgPlaza.receiveShadow = true;
    buildingGroup.add(bldgPlaza);

    const walkway = new THREE.Mesh(
      new THREE.BoxGeometry(5.0, 0.15, 7.0),
      new THREE.MeshStandardMaterial({ color: '#CBD5E1', roughness: 0.5 })
    );
    walkway.position.set(-1.0, 0.1, 9.5);
    walkway.receiveShadow = true;
    buildingGroup.add(walkway);

    const ivoryWallMat = new THREE.MeshStandardMaterial({
      color: '#EFECE6',
      roughness: 0.45,
      metalness: 0.05,
    });
    const trimDarkMat = new THREE.MeshStandardMaterial({
      color: '#262E3B',
      roughness: 0.35,
      metalness: 0.3,
    });
    const glassCurtainMat = new THREE.MeshPhysicalMaterial({
      color: '#38BDF8',
      transmission: 0.82,
      opacity: 0.9,
      transparent: true,
      roughness: 0.08,
      ior: 1.52,
      reflectivity: 0.95,
      clearcoat: 1.0,
      clearcoatRoughness: 0.1,
    });

    // Ground Floor
    const groundFloor = new THREE.Mesh(new THREE.BoxGeometry(16, 4.0, 13), ivoryWallMat);
    groundFloor.position.set(-0.5, 2.1, 0);
    groundFloor.castShadow = true;
    groundFloor.receiveShadow = true;
    buildingGroup.add(groundFloor);

    const groundGlassFront = new THREE.Mesh(new THREE.BoxGeometry(14.0, 2.8, 0.2), glassCurtainMat);
    groundGlassFront.position.set(-0.5, 2.1, 6.55);
    buildingGroup.add(groundGlassFront);

    const winTrim1 = new THREE.Mesh(new THREE.BoxGeometry(14.3, 0.14, 0.28), trimDarkMat);
    winTrim1.position.set(-0.5, 2.1, 6.6);
    buildingGroup.add(winTrim1);

    // Second Floor
    const secondFloor = new THREE.Mesh(new THREE.BoxGeometry(17.5, 3.6, 12), ivoryWallMat);
    secondFloor.position.set(-0.2, 5.9, -0.5);
    secondFloor.castShadow = true;
    secondFloor.receiveShadow = true;
    buildingGroup.add(secondFloor);

    const secondGlassFront = new THREE.Mesh(new THREE.BoxGeometry(15.5, 2.4, 0.2), glassCurtainMat);
    secondGlassFront.position.set(-0.2, 5.9, 5.55);
    buildingGroup.add(secondGlassFront);

    const floorBand = new THREE.Mesh(new THREE.BoxGeometry(17.9, 0.4, 12.4), trimDarkMat);
    floorBand.position.set(-0.2, 4.0, -0.5);
    floorBand.castShadow = true;
    buildingGroup.add(floorBand);

    // Entrance Portico
    const entranceCanopy = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.28, 3.5), trimDarkMat);
    entranceCanopy.position.set(-1.0, 3.8, 7.5);
    entranceCanopy.castShadow = true;
    buildingGroup.add(entranceCanopy);

    const pillar1 = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 3.8), pvRackMat);
    pillar1.position.set(1.4, 1.9, 9.0);
    const pillar2 = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 3.8), pvRackMat);
    pillar2.position.set(-3.4, 1.9, 9.0);
    buildingGroup.add(pillar1, pillar2);

    // Rooftop Parapet
    const roofParapet = new THREE.Mesh(new THREE.BoxGeometry(17.8, 0.6, 12.3), trimDarkMat);
    roofParapet.position.set(-0.2, 8.0, -0.5);
    roofParapet.castShadow = true;
    buildingGroup.add(roofParapet);

    const hvacUnitA = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.4, 1.8), pvRackMat);
    hvacUnitA.position.set(5.5, 8.6, -2.8);
    hvacUnitA.castShadow = true;
    const hvacUnitB = new THREE.Mesh(new THREE.BoxGeometry(2.0, 1.2, 1.5), pvRackMat);
    hvacUnitB.position.set(5.5, 8.5, 1.8);
    hvacUnitB.castShadow = true;
    buildingGroup.add(hvacUnitA, hvacUnitB);

    const roofPenthouse = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.2, 2.8), ivoryWallMat);
    roofPenthouse.position.set(-6.0, 8.8, -1.2);
    roofPenthouse.castShadow = true;
    buildingGroup.add(roofPenthouse);

    // ROOFTOP SOLAR PV ARRAYS ("để pin trên nóc nhà")
    const roofPvRows = [-3.5, 0.0, 3.5];
    roofPvRows.forEach((rpz) => {
      for (let rx = 0; rx < 5; rx++) {
        const rpx = -4.0 + rx * 2.1;
        const roofPanel = new THREE.Group();
        roofPanel.position.set(rpx, 8.2, rpz);
        roofPanel.rotation.x = Math.PI / 9.0;

        const rFrame = new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.05, 1.4), pvFrameMat);
        rFrame.castShadow = true;
        const rCell = new THREE.Mesh(new THREE.BoxGeometry(1.78, 0.055, 1.32), pvCellMat);
        rCell.castShadow = true;

        roofPanel.add(rFrame, rCell);
        buildingGroup.add(roofPanel);
        animObjectsRef.current.pvPanels.push(rCell);
      }
    });

    const intLightA = new THREE.PointLight('#FBBF24', 0.6, 14);
    intLightA.position.set(-0.5, 2.3, 3.2);
    const intLightB = new THREE.PointLight('#60A5FA', 0.6, 14);
    intLightB.position.set(-0.5, 6.0, 3.2);
    buildingGroup.add(intLightA, intLightB);
    animObjectsRef.current.windowLights = [intLightA, intLightB];

    // =========================================================================
    // 9. INDUSTRIAL CONTAINERIZED BESS STATION (200 kWh / 50 kW)
    // =========================================================================
    const bessGroup = new THREE.Group();
    bessGroup.position.set(-6.8, 0, 5.0);
    campusGroup.add(bessGroup);

    const bessPad = new THREE.Mesh(
      new THREE.BoxGeometry(5.6, 0.2, 3.6),
      new THREE.MeshStandardMaterial({ color: '#64748B', roughness: 0.7 })
    );
    bessPad.position.set(0, 0.1, 0);
    bessPad.receiveShadow = true;
    bessGroup.add(bessPad);

    const bessBodyMat = new THREE.MeshStandardMaterial({
      color: '#059669',
      roughness: 0.35,
      metalness: 0.2,
    });
    const bessWhiteMat = new THREE.MeshStandardMaterial({
      color: '#F8FAFC',
      roughness: 0.3,
      metalness: 0.1,
    });

    const bessMainBox = new THREE.Mesh(new THREE.BoxGeometry(4.6, 2.5, 2.8), bessBodyMat);
    bessMainBox.position.set(0, 1.35, 0);
    bessMainBox.castShadow = true;
    bessMainBox.receiveShadow = true;
    bessGroup.add(bessMainBox);

    const bessFrontDoor = new THREE.Mesh(new THREE.BoxGeometry(4.2, 2.2, 0.1), bessWhiteMat);
    bessFrontDoor.position.set(0, 1.35, 1.42);
    bessGroup.add(bessFrontDoor);

    const fanChiller1 = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.48, 1.5), pvRackMat);
    fanChiller1.position.set(-1.3, 2.85, 0);
    fanChiller1.castShadow = true;
    const fanChiller2 = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.48, 1.5), pvRackMat);
    fanChiller2.position.set(1.3, 2.85, 0);
    fanChiller2.castShadow = true;
    bessGroup.add(fanChiller1, fanChiller2);

    const ledGeo = new THREE.BoxGeometry(3.8, 0.14, 0.08);
    const ledMat = new THREE.MeshBasicMaterial({ color: '#10B981' });
    const batteryLed = new THREE.Mesh(ledGeo, ledMat);
    batteryLed.position.set(0, 2.35, 1.48);
    bessGroup.add(batteryLed);
    animObjectsRef.current.batteryLed = batteryLed;

    // =========================================================================
    // 10. HIGH-VOLTAGE TRANSMISSION PYLON & SUBSTATION (21.2 kW) ON RIGHT
    // =========================================================================
    const pylonGroup = new THREE.Group();
    pylonGroup.position.set(20.0, 0, -3.5);
    campusGroup.add(pylonGroup);

    const subPad = new THREE.Mesh(
      new THREE.BoxGeometry(16, 0.15, 16),
      new THREE.MeshStandardMaterial({ color: '#78716C', roughness: 0.9 })
    );
    subPad.position.set(0, 0.075, 0);
    subPad.receiveShadow = true;
    pylonGroup.add(subPad);

    const fenceMat = new THREE.MeshStandardMaterial({ color: '#64748B', wireframe: true });
    const fenceNorth = new THREE.Mesh(new THREE.PlaneGeometry(15.8, 2.4), fenceMat);
    fenceNorth.position.set(0, 1.2, -7.8);
    const fenceSouth = new THREE.Mesh(new THREE.PlaneGeometry(15.8, 2.4), fenceMat);
    fenceSouth.position.set(0, 1.2, 7.8);
    const fenceWest = new THREE.Mesh(new THREE.PlaneGeometry(15.8, 2.4), fenceMat);
    fenceWest.position.set(-7.8, 1.2, 0);
    fenceWest.rotation.y = Math.PI / 2;
    pylonGroup.add(fenceNorth, fenceSouth, fenceWest);

    const steelMat = new THREE.MeshStandardMaterial({ color: '#CBD5E1', metalness: 0.85, roughness: 0.3 });
    const pylonHeight = 18.0;

    const legGeo = new THREE.CylinderGeometry(0.09, 0.15, pylonHeight, 6);
    const legFL = new THREE.Mesh(legGeo, steelMat);
    legFL.position.set(1.5, pylonHeight / 2, 1.5);
    legFL.rotation.z = -0.05;
    legFL.rotation.x = 0.05;

    const legFR = new THREE.Mesh(legGeo, steelMat);
    legFR.position.set(-1.5, pylonHeight / 2, 1.5);
    legFR.rotation.z = 0.05;
    legFR.rotation.x = 0.05;

    const legBL = new THREE.Mesh(legGeo, steelMat);
    legBL.position.set(1.5, pylonHeight / 2, -1.5);
    legBL.rotation.z = -0.05;
    legBL.rotation.x = -0.05;

    const legBR = new THREE.Mesh(legGeo, steelMat);
    legBR.position.set(-1.5, pylonHeight / 2, -1.5);
    legBR.rotation.z = 0.05;
    legBR.rotation.x = -0.05;

    pylonGroup.add(legFL, legFR, legBL, legBR);

    [4.0, 7.5, 11.0, 14.0].forEach((ringY) => {
      const ringScale = 1.0 - (ringY / pylonHeight) * 0.45;
      const ring = new THREE.Mesh(new THREE.BoxGeometry(3.2 * ringScale, 0.09, 3.2 * ringScale), steelMat);
      ring.position.y = ringY;
      pylonGroup.add(ring);
    });

    [11.5, 14.5, 17.0].forEach((armY, idx) => {
      const armWidth = 8.2 - idx * 0.9;
      const arm = new THREE.Mesh(new THREE.BoxGeometry(armWidth, 0.2, 0.2), steelMat);
      arm.position.y = armY;
      arm.castShadow = true;
      pylonGroup.add(arm);

      [-armWidth / 2 + 0.25, armWidth / 2 - 0.25].forEach((ix) => {
        const insulator = new THREE.Mesh(
          new THREE.CylinderGeometry(0.08, 0.15, 1.0, 8),
          new THREE.MeshPhysicalMaterial({ color: '#38BDF8', transmission: 0.7, opacity: 0.85, transparent: true })
        );
        insulator.position.set(ix, armY - 0.5, 0);
        pylonGroup.add(insulator);
      });
    });

    const transBody = new THREE.Mesh(
      new THREE.BoxGeometry(3.5, 2.4, 2.6),
      new THREE.MeshStandardMaterial({ color: '#475569', metalness: 0.6, roughness: 0.4 })
    );
    transBody.position.set(-3.8, 1.3, 0);
    transBody.castShadow = true;
    pylonGroup.add(transBody);

    for (let f = -1.3; f <= 1.3; f += 0.32) {
      const fin = new THREE.Mesh(new THREE.BoxGeometry(0.04, 1.8, 2.8), steelMat);
      fin.position.set(-3.8 + f, 1.3, 0);
      pylonGroup.add(fin);
    }

    // =========================================================================
    // 11. GLOWING CYBER LASER ENERGY FLOW LINES & TRAVELING ORBS
    // =========================================================================
    const anchorPoints = {
      solar: new THREE.Vector3(-15.0, 0.8, -3.5),
      bess: new THREE.Vector3(-6.8, 0.8, 4.0),
      house: new THREE.Vector3(-1.0, 0.8, -1.0),
      grid: new THREE.Vector3(16.0, 0.8, -3.5),
      hub: new THREE.Vector3(-4.0, 0.2, 2.0),
    };
    animObjectsRef.current.anchorPoints = anchorPoints;

    const createEnergyLaser = (key, pStart, pEnd, baseColor) => {
      const midPoint = new THREE.Vector3()
        .addVectors(pStart, pEnd)
        .multiplyScalar(0.5);
      midPoint.y += 0.35;

      const curve = new THREE.QuadraticBezierCurve3(pStart, midPoint, pEnd);
      const tubeGeo = new THREE.TubeGeometry(curve, 32, 0.1, 8, false);
      const tubeMat = new THREE.MeshBasicMaterial({
        color: baseColor,
        transparent: true,
        opacity: 0.85,
      });
      const tubeMesh = new THREE.Mesh(tubeGeo, tubeMat);
      campusGroup.add(tubeMesh);

      const orbGroup = new THREE.Group();
      const orbMat = new THREE.MeshBasicMaterial({ color: '#FFFFFF' });
      const orbs = [];
      for (let o = 0; o < 4; o++) {
        const orb = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 12), orbMat);
        orbGroup.add(orb);
        orbs.push(orb);
      }
      campusGroup.add(orbGroup);

      animObjectsRef.current.flowCurves[key] = curve;
      animObjectsRef.current.flowParticles[key] = { orbs, mesh: tubeMesh, active: true, speed: 0.35 };
    };

    createEnergyLaser('pv_to_bess', anchorPoints.solar, anchorPoints.bess, '#10B981');
    createEnergyLaser('pv_to_house', anchorPoints.solar, anchorPoints.house, '#06B6D4');
    createEnergyLaser('batt_flow', anchorPoints.bess, anchorPoints.house, '#10B981');
    createEnergyLaser('grid_flow', anchorPoints.house, anchorPoints.grid, '#A855F7');

    const nodeJunction = new THREE.Mesh(
      new THREE.CylinderGeometry(0.75, 0.75, 0.16, 24),
      new THREE.MeshBasicMaterial({ color: '#38BDF8', transparent: true, opacity: 0.9 })
    );
    nodeJunction.position.copy(anchorPoints.hub);
    campusGroup.add(nodeJunction);

    animObjectsRef.current.sunLight = sunLight;
    animObjectsRef.current.sunMesh = sunMesh;
    animObjectsRef.current.moonLight = moonLight;
    animObjectsRef.current.moonMesh = moonMesh;
    animObjectsRef.current.hemiLight = hemiLight;
    animObjectsRef.current.ambientLight = ambientLight;

    setIsSceneReady(true);

    // =========================================================================
    // 12. CONTINUOUS RAF ANIMATION & TAB VISIBILITY PAUSE
    // =========================================================================
    let animId;
    let clock = new THREE.Clock();
    let isTabVisible = true;

    const handleVisibilityChange = () => {
      isTabVisible = !document.hidden;
      if (isTabVisible) clock.getDelta();
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    const animate = () => {
      animId = requestAnimationFrame(animate);
      if (!isTabVisible) return;

      const elapsedTime = clock.getElapsedTime();

      // Smooth camera preset interpolation
      if (targetCameraPos.current) {
        camera.position.lerp(targetCameraPos.current, 0.05);
        if (camera.position.distanceTo(targetCameraPos.current) < 0.1) {
          targetCameraPos.current = null;
        }
      }
      if (targetLookAt.current) {
        controls.target.lerp(targetLookAt.current, 0.05);
        if (controls.target.distanceTo(targetLookAt.current) < 0.1) {
          targetLookAt.current = null;
        }
      }
      controls.update();

      // Traveling Energy Orbs
      Object.keys(animObjectsRef.current.flowParticles).forEach((k) => {
        const item = animObjectsRef.current.flowParticles[k];
        const curve = animObjectsRef.current.flowCurves[k];
        if (item && curve && item.active) {
          item.orbs.forEach((orb, idx) => {
            const t = (elapsedTime * item.speed + idx * 0.25) % 1.0;
            const pt = curve.getPoint(t);
            orb.position.copy(pt);
          });
        }
      });

      // Project 3D Coordinates to 2D Screen Space for Badges
      const projectBadge = (v3) => {
        const p = v3.clone();
        p.project(camera);
        const halfW = container.clientWidth / 2;
        const halfH = container.clientHeight / 2;
        return {
          x: p.x * halfW + halfW,
          y: -(p.y * halfH) + halfH,
          visible: p.z < 1.0,
        };
      };

      setBadges({
        pv: projectBadge(new THREE.Vector3(-18.0, 4.5, -3.5)),
        house: projectBadge(new THREE.Vector3(-0.5, 9.6, -1.5)),
        battery: projectBadge(new THREE.Vector3(-6.8, 4.0, 5.0)),
        grid: projectBadge(new THREE.Vector3(20.0, 18.0, -3.5)),
      });

      renderer.render(scene, camera);
    };

    animate();

    // ResizeObserver for Dynamic Container Sizing
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width: newW, height: newH } = entry.contentRect;
        if (newW > 0 && newH > 0) {
          camera.aspect = newW / newH;
          camera.updateProjectionMatrix();
          renderer.setSize(newW, newH);
        }
      }
    });
    resizeObserver.observe(container);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      resizeObserver.disconnect();
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
      hemiLight,
      windowLights,
      batteryLed,
      flowParticles,
    } = animObjectsRef.current;

    if (isDay) {
      const progress = (hour - 6.0) / 12.0;
      const sunAngle = progress * Math.PI;
      const sX = -Math.cos(sunAngle) * 50;
      const sY = Math.sin(sunAngle) * 42 + 6;
      const sZ = Math.sin(sunAngle) * 25 + 6;

      sunMesh.position.set(sX, sY, sZ);
      sunMesh.visible = true;
      sunLight.position.set(sX, sY, sZ);
      sunLight.intensity = Math.max(1.3, Math.sin(sunAngle) * 3.0);

      if (progress < 0.15 || progress > 0.85) {
        sunLight.color.set('#F59E0B');
        sunMesh.material.color.set('#F59E0B');
        sceneRef.current.background.set('#1E293B');
        sceneRef.current.fog.color.set('#334155');
      } else {
        sunLight.color.set('#FFFDF0');
        sunMesh.material.color.set('#FDE047');
        sceneRef.current.background.set('#38BDF8');
        sceneRef.current.fog.color.set('#BAE6FD');
      }

      hemiLight.intensity = 1.15;
      moonMesh.visible = false;
      moonLight.intensity = 0;
      windowLights.forEach((l) => (l.intensity = 0.2));
    } else {
      sunMesh.visible = false;
      sunLight.intensity = 0;

      moonMesh.position.set(30, 40, -30);
      moonMesh.visible = true;
      moonLight.intensity = 1.2;
      sceneRef.current.background.set('#0B132B');
      sceneRef.current.fog.color.set('#1E293B');

      hemiLight.intensity = 0.6;
      windowLights.forEach((l) => (l.intensity = 3.8));
    }

    if (batteryLed) {
      if (p_batt_kw > 0.2) {
        batteryLed.material.color.set('#10B981');
      } else if (p_batt_kw < -0.2) {
        batteryLed.material.color.set('#EF4444');
      } else {
        batteryLed.material.color.set('#38BDF8');
      }
    }

    if (flowParticles.pv_to_bess && flowParticles.pv_to_house) {
      const pvActive = p_pv_kw > 0.5;
      flowParticles.pv_to_bess.active = pvActive;
      flowParticles.pv_to_house.active = pvActive;
      flowParticles.pv_to_house.speed = 0.15 + (p_pv_kw / 150) * 0.7;
    }

    if (flowParticles.batt_flow) {
      const battActive = Math.abs(p_batt_kw) > 0.5;
      flowParticles.batt_flow.active = battActive;
      flowParticles.batt_flow.speed = 0.15 + (Math.abs(p_batt_kw) / 50) * 0.7;
      flowParticles.batt_flow.mesh.material.color.set(p_batt_kw < -0.2 ? '#EF4444' : '#10B981');
    }

    if (flowParticles.grid_flow) {
      const gridActive = Math.abs(p_buy_kw) > 0.2 || Math.abs(p_sell_kw) > 0.2;
      flowParticles.grid_flow.active = gridActive;
      flowParticles.grid_flow.speed = 0.25 + (Math.max(p_buy_kw, p_sell_kw) / 60) * 0.6;
    }
  }, [stepData]);

  return (
    <div className="smart-house-3d-wrap">
      {/* Loading Overlay */}
      {!isSceneReady && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: '#0B132B',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.65rem',
            color: '#60A5FA',
            fontSize: '0.9rem',
            fontWeight: 600,
            zIndex: 30,
          }}
        >
          <Loader2 size={24} className="spin-anim" />
          <span>Đang nạp mô hình Microgrid 3D...</span>
        </div>
      )}

      {/* 3D WebGL Canvas */}
      <div ref={mountRef} style={{ width: '100%', height: '100%', outline: 'none' }} />

      {/* Camera Presets Toolbar */}
      <div
        style={{
          position: 'absolute',
          top: '0.85rem',
          right: '0.85rem',
          display: 'flex',
          gap: '0.35rem',
          background: 'rgba(15, 23, 42, 0.88)',
          backdropFilter: 'blur(12px)',
          padding: '0.3rem 0.5rem',
          borderRadius: '10px',
          border: '1px solid rgba(255, 255, 255, 0.15)',
          zIndex: 20,
        }}
      >
        <button
          className="btn-ctrl"
          style={{ width: 'auto', padding: '0.25rem 0.6rem', fontSize: '0.72rem', borderRadius: '6px' }}
          onClick={() => setCameraPreset([50, 38, 55], [0, 2.5, -2.0])}
          title="Góc nhìn Toàn cảnh Microgrid (giống demo.png)"
        >
          <Camera size={13} style={{ marginRight: 4 }} />
          Toàn cảnh
        </button>
        <button
          className="btn-ctrl"
          style={{ width: 'auto', padding: '0.25rem 0.6rem', fontSize: '0.72rem', borderRadius: '6px' }}
          onClick={() => setCameraPreset([-6.8, 6.0, 13.0], [-6.8, 2.0, 5.0])}
          title="Cận cảnh Trạm BESS 200 kWh"
        >
          <Battery size={13} color="#10B981" style={{ marginRight: 4 }} />
          BESS 200kWh
        </button>
        <button
          className="btn-ctrl"
          style={{ width: 'auto', padding: '0.25rem 0.6rem', fontSize: '0.72rem', borderRadius: '6px' }}
          onClick={() => setCameraPreset([-22, 16, 16], [-22, 2.0, -3.5])}
          title="Cận cảnh Nông trại Điện mặt trời Solar PV"
        >
          <Sun size={13} color="#FBBF24" style={{ marginRight: 4 }} />
          Solar PV Farm
        </button>
        <button
          className="btn-ctrl"
          style={{ width: 'auto', padding: '0.25rem 0.6rem', fontSize: '0.72rem', borderRadius: '6px' }}
          onClick={() => setCameraPreset([0, 14, 15], [-0.5, 5.5, -4.8])}
          title="Cận cảnh Tòa nhà thông minh (Phụ tải & Pin trên nóc)"
        >
          <Home size={13} color="#3B82F6" style={{ marginRight: 4 }} />
          Tòa nhà & Nóc
        </button>
        <button
          className="btn-ctrl"
          style={{ width: 'auto', padding: '0.25rem 0.6rem', fontSize: '0.72rem', borderRadius: '6px' }}
          onClick={() => setCameraPreset([24, 18, 12], [20.0, 8.5, -3.5])}
          title="Cận cảnh Cột điện cao thế & Trạm biến áp"
        >
          <Zap size={13} color="#A855F7" style={{ marginRight: 4 }} />
          Lưới điện
        </button>
        <button
          className="btn-ctrl"
          style={{ width: 'auto', padding: '0.25rem 0.6rem', fontSize: '0.72rem', borderRadius: '6px' }}
          onClick={() => setCameraPreset([0, 80, 0.1], [0, 0, 0])}
          title="Góc nhìn thẳng từ trên cao xuống"
        >
          <Eye size={13} style={{ marginRight: 4 }} />
          Top-down
        </button>
      </div>

      {/* Floating 3D Telemetry Badges (Exact match with demo.png) */}
      {/* 1. Solar PV Badge */}
      {badges.pv.visible && (
        <div
          onClick={() => setCameraPreset([-22, 16, 16], [-22, 2.0, -3.5])}
          style={{
            position: 'absolute',
            left: `${badges.pv.x}px`,
            top: `${badges.pv.y}px`,
            transform: 'translate(-50%, -100%)',
            background: 'rgba(15, 23, 42, 0.92)',
            backdropFilter: 'blur(10px)',
            border: '2px solid #F59E0B',
            borderRadius: '10px',
            padding: '0.35rem 0.75rem',
            color: '#FFFFFF',
            cursor: 'pointer',
            boxShadow: '0 6px 20px rgba(245, 158, 11, 0.5)',
            zIndex: 15,
            pointerEvents: 'auto',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.7rem', fontWeight: 700, color: '#FBBF24' }}>
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
          onClick={() => setCameraPreset([-6.8, 6.0, 13.0], [-6.8, 2.0, 5.0])}
          style={{
            position: 'absolute',
            left: `${badges.battery.x}px`,
            top: `${badges.battery.y}px`,
            transform: 'translate(-50%, -100%)',
            background: 'rgba(15, 23, 42, 0.92)',
            backdropFilter: 'blur(10px)',
            border: `2px solid ${stepData?.p_batt_kw < -0.1 ? '#EF4444' : '#10B981'}`,
            borderRadius: '10px',
            padding: '0.35rem 0.75rem',
            color: '#FFFFFF',
            cursor: 'pointer',
            boxShadow: `0 6px 20px ${stepData?.p_batt_kw < -0.1 ? 'rgba(239, 68, 68, 0.5)' : 'rgba(16, 185, 129, 0.5)'}`,
            zIndex: 15,
            pointerEvents: 'auto',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.7rem', fontWeight: 700, color: stepData?.p_batt_kw < -0.1 ? '#F87171' : '#34D399' }}>
            <span>🔋</span> BESS (SoC: {stepData?.soc_pct?.toFixed(0) || 90}%)
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
          onClick={() => setCameraPreset([0, 14, 15], [-0.5, 5.5, -4.8])}
          style={{
            position: 'absolute',
            left: `${badges.house.x}px`,
            top: `${badges.house.y}px`,
            transform: 'translate(-50%, -100%)',
            background: 'rgba(15, 23, 42, 0.92)',
            backdropFilter: 'blur(10px)',
            border: '2px solid #3B82F6',
            borderRadius: '10px',
            padding: '0.35rem 0.75rem',
            color: '#FFFFFF',
            cursor: 'pointer',
            boxShadow: '0 6px 20px rgba(59, 130, 246, 0.5)',
            zIndex: 15,
            pointerEvents: 'auto',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.7rem', fontWeight: 700, color: '#60A5FA' }}>
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
          onClick={() => setCameraPreset([24, 18, 12], [20.0, 8.5, -3.5])}
          style={{
            position: 'absolute',
            left: `${badges.grid.x}px`,
            top: `${badges.grid.y}px`,
            transform: 'translate(-50%, -100%)',
            background: 'rgba(15, 23, 42, 0.92)',
            backdropFilter: 'blur(10px)',
            border: '2px solid #A855F7',
            borderRadius: '10px',
            padding: '0.35rem 0.75rem',
            color: '#FFFFFF',
            cursor: 'pointer',
            boxShadow: '0 6px 20px rgba(168, 85, 247, 0.5)',
            zIndex: 15,
            pointerEvents: 'auto',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.7rem', fontWeight: 700, color: '#C4B5FD' }}>
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

      {/* Bottom Hint Bar */}
      <div
        style={{
          position: 'absolute',
          bottom: '0.75rem',
          left: '0.85rem',
          background: 'rgba(15, 23, 42, 0.88)',
          border: '1px solid rgba(255, 255, 255, 0.12)',
          padding: '0.3rem 0.75rem',
          borderRadius: '8px',
          fontSize: '0.74rem',
          color: '#E2E8F0',
          pointerEvents: 'none',
          backdropFilter: 'blur(8px)',
        }}
      >
        💡 <b>Chuột trái:</b> Xoay 360° | <b>Cuộn chuột:</b> Phóng to/nhỏ | <b>Chuột phải:</b> Dịch chuyển | <b>Click nhãn:</b> Zoom lại gần
      </div>
    </div>
  );
}
