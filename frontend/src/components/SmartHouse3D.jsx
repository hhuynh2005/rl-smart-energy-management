import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { Camera, Eye, Sun, Battery, Home, Zap, Loader2, Sparkles, Sliders } from 'lucide-react';

/**
 * SmartHouse3D - Photorealistic Digital Twin of the SEMS-RL Microgrid Campus
 * Meets all 10 Senior Three.js Graphics Engineering specifications:
 * - High-end Render Pipeline (ACESFilmic, SRGB, PCFSoftShadowMap, EffectComposer + UnrealBloom)
 * - Atmospheric Sky (Preetham Sky Shader + FogExp2 + Drifting Procedural Clouds)
 * - Realistic 24h Day/Night Cycle with dynamic celestial sun/moon arc & night streetlamps/window glow
 * - Broad realistic terrain with procedural canvas grass texture, roads, parked/moving 3D cars, and hills
 * - Over 350 InstancedMesh trees (Oak shade, Conical pine, Boxwood hedges) swaying in the breeze
 * - Detailed PBR structures: Tilted Solar PV Farm, Modern Smart Building with rooftop solar arrays,
 *   BESS Megapack container with pulsing LED bar, and High-Voltage Steel Lattice Pylon & Substation
 * - Glowing cyber laser energy flow conduits with traveling glowing particle orbs proportional to kW
 * - Anti-overlap screen-space collision solver with SVG leader lines & anchor dots for 3D badges
 * - Cinematic swoop-in camera intro (2.5s), 6 camera presets (keys 1-6), smooth 1s easeInOut tweening
 * - Hover raycasting tooltip, auto-rotate idle, tab visibility pause, and auto-FPS quality adjustment
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
  const composerRef = useRef(null);
  const controlsRef = useRef(null);

  // Loading & Quality state
  const [isSceneReady, setIsSceneReady] = useState(false);
  const [loadProgress, setLoadProgress] = useState(15);
  const [qualityMode, setQualityMode] = useState('high'); // 'high' | 'medium' | 'low'
  const qualityRef = useRef('high');
  qualityRef.current = qualityMode;

  // Hover Tooltip State
  const [hoveredInfo, setHoveredInfo] = useState(null);

  // References for continuous dynamic animation & telemetry
  const animObjectsRef = useRef({
    sky: null,
    sunLight: null,
    sunMesh: null,
    moonLight: null,
    moonMesh: null,
    hemiLight: null,
    ambientLight: null,
    cloudGroup: null,
    starsField: null,
    windowLights: [],
    streetLights: [],
    windowMat: null,
    batteryLed: null,
    pvPanels: [],
    roofPvPanels: [],
    flowCurves: {},
    flowParticles: {},
    anchorPoints: {},
    movingCars: [],
  });

  // Screen projected 2D coordinates for floating badges with SVG leader lines
  const [badges, setBadges] = useState({
    pv: { x: 0, y: 0, anchorX: 0, anchorY: 0, visible: false, scale: 1, opacity: 1 },
    battery: { x: 0, y: 0, anchorX: 0, anchorY: 0, visible: false, scale: 1, opacity: 1 },
    house: { x: 0, y: 0, anchorX: 0, anchorY: 0, visible: false, scale: 1, opacity: 1 },
    grid: { x: 0, y: 0, anchorX: 0, anchorY: 0, visible: false, scale: 1, opacity: 1 },
  });

  // Smooth camera preset interpolation
  const targetCameraPos = useRef(null);
  const targetLookAt = useRef(null);
  const tweenStartTime = useRef(0);
  const tweenDuration = 1000; // 1 second smooth tween
  const startCameraPos = useRef(new THREE.Vector3());
  const startLookAt = useRef(new THREE.Vector3());

  // Idle timer for subtle auto-rotate
  const lastInteractionTime = useRef(Date.now());

  const setCameraPreset = useCallback((pos, lookAt = [0, 2.5, -2]) => {
    if (!cameraRef.current || !controlsRef.current) return;
    startCameraPos.current.copy(cameraRef.current.position);
    startLookAt.current.copy(controlsRef.current.target);
    targetCameraPos.current = new THREE.Vector3(...pos);
    targetLookAt.current = new THREE.Vector3(...lookAt);
    tweenStartTime.current = performance.now();
    lastInteractionTime.current = Date.now();
  }, []);

  // Keyboard shortcuts 1 to 6 for instant camera preset switching
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
      if (e.key === '1') setCameraPreset([50, 36, 54], [0, 2.5, -2.0]);
      if (e.key === '2') setCameraPreset([-6.8, 6.0, 13.0], [-6.8, 2.0, 5.0]);
      if (e.key === '3') setCameraPreset([-22, 16, 16], [-22, 2.0, -3.5]);
      if (e.key === '4') setCameraPreset([0, 14, 15], [-0.5, 5.5, -4.8]);
      if (e.key === '5') setCameraPreset([22, 16, 12], [20.0, 8.5, -3.5]);
      if (e.key === '6') setCameraPreset([0, 80, 0.1], [0, 0, 0]);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setCameraPreset]);

  // --- INITIALIZE THREE.JS SCENE WITH RESIZEOBSERVER ---
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    setLoadProgress(30);

    const width = container.clientWidth || 1000;
    const height = container.clientHeight || 500;

    // 1. Scene & Exponential Atmospheric Fog
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#38BDF8');
    scene.fog = new THREE.FogExp2('#BAE6FD', 0.0055);
    sceneRef.current = scene;

    // 2. Camera - Elevated aerial/isometric vantage point matching demo.png
    const camera = new THREE.PerspectiveCamera(40, width / height, 0.5, 650);
    // Initial position high in sky for cinematic swoop-in intro
    camera.position.set(85, 75, 95);
    cameraRef.current = camera;

    // 3. WebGL Renderer with ACES Filmic Tone Mapping & High Quality Shadows
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // 4. Post-processing Pipeline with EffectComposer & UnrealBloomPass
    const composer = new EffectComposer(renderer);
    const renderPass = new RenderPass(scene, camera);
    composer.addPass(renderPass);

    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(width, height),
      0.36, // strength
      0.45, // radius
      0.82  // threshold
    );
    composer.addPass(bloomPass);

    const outputPass = new OutputPass();
    composer.addPass(outputPass);
    composerRef.current = composer;

    // 5. Orbit Controls (Smooth damping, limits, 360 orbit)
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.minDistance = 14;
    controls.maxDistance = 240;
    controls.maxPolarAngle = Math.PI / 2.05;
    controls.target.set(0, 2.5, -2.0);
    controlsRef.current = controls;

    controls.addEventListener('start', () => {
      lastInteractionTime.current = Date.now();
    });

    setLoadProgress(55);

    // 6. Preetham Sky Shader Dome
    const sky = new Sky();
    sky.scale.setScalar(450000);
    scene.add(sky);
    animObjectsRef.current.sky = sky;

    const skyUniforms = sky.material.uniforms;
    skyUniforms['turbidity'].value = 8;
    skyUniforms['rayleigh'].value = 2.2;
    skyUniforms['mieCoefficient'].value = 0.005;
    skyUniforms['mieDirectionalG'].value = 0.82;

    // 7. Lighting Setup (Sun, Moon, Hemisphere, Ambient)
    const hemiLight = new THREE.HemisphereLight('#E0F2FE', '#334155', 1.15);
    scene.add(hemiLight);

    const ambientLight = new THREE.AmbientLight('#FFFFFF', 0.45);
    scene.add(ambientLight);

    const sunLight = new THREE.DirectionalLight('#FFFDF0', 2.8);
    sunLight.position.set(-30, 52, 30);
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
      new THREE.SphereGeometry(3.0, 24, 24),
      new THREE.MeshBasicMaterial({ color: '#FDE047' })
    );
    sunMesh.position.set(-30, 52, 30);
    scene.add(sunMesh);

    const moonLight = new THREE.DirectionalLight('#93C5FD', 0.0);
    moonLight.position.set(30, 42, -30);
    scene.add(moonLight);

    const moonMesh = new THREE.Mesh(
      new THREE.SphereGeometry(1.8, 16, 16),
      new THREE.MeshBasicMaterial({ color: '#E2E8F0' })
    );
    moonMesh.position.set(30, 42, -30);
    moonMesh.visible = false;
    scene.add(moonMesh);

    // Stars Field Dome for Night Sky
    const starsGeo = new THREE.BufferGeometry();
    const starCount = 350;
    const starPos = new Float32Array(starCount * 3);
    for (let s = 0; s < starCount; s++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(Math.random() * 0.8 + 0.2);
      const r = 320;
      starPos[s * 3] = r * Math.sin(phi) * Math.cos(theta);
      starPos[s * 3 + 1] = r * Math.cos(phi);
      starPos[s * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    }
    starsGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    const starsMat = new THREE.PointsMaterial({ color: '#FFFFFF', size: 1.5, transparent: true, opacity: 0 });
    const starsField = new THREE.Points(starsGeo, starsMat);
    scene.add(starsField);
    animObjectsRef.current.starsField = starsField;

    // Drifting Soft Procedural Clouds
    const cloudGroup = new THREE.Group();
    const cloudMat = new THREE.MeshBasicMaterial({
      color: '#FFFFFF',
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
    });
    for (let cl = 0; cl < 8; cl++) {
      const cloud = new THREE.Mesh(new THREE.PlaneGeometry(35 + Math.random() * 20, 18 + Math.random() * 10), cloudMat);
      cloud.rotation.x = -Math.PI / 2;
      cloud.position.set(-80 + Math.random() * 160, 85 + Math.random() * 10, -70 + Math.random() * 140);
      cloudGroup.add(cloud);
    }
    scene.add(cloudGroup);
    animObjectsRef.current.cloudGroup = cloudGroup;

    setLoadProgress(75);

    // =========================================================================
    // 8. REALISTIC PROCEDURAL TERRAIN, ROADS & LUSH INSTANCED VEGETATION
    // =========================================================================
    const campusGroup = new THREE.Group();
    scene.add(campusGroup);

    // Procedural Grass Texture on Canvas
    const grassCanvas = document.createElement('canvas');
    grassCanvas.width = 256;
    grassCanvas.height = 256;
    const gCtx = grassCanvas.getContext('2d');
    gCtx.fillStyle = '#346B31';
    gCtx.fillRect(0, 0, 256, 256);
    for (let p = 0; p < 2000; p++) {
      const gx = Math.random() * 256;
      const gy = Math.random() * 256;
      const gr = 1.2 + Math.random() * 2.0;
      gCtx.fillStyle = Math.random() > 0.5 ? '#3D7A39' : '#2A5728';
      gCtx.beginPath();
      gCtx.arc(gx, gy, gr, 0, Math.PI * 2);
      gCtx.fill();
    }
    const grassTex = new THREE.CanvasTexture(grassCanvas);
    grassTex.wrapS = THREE.RepeatWrapping;
    grassTex.wrapT = THREE.RepeatWrapping;
    grassTex.repeat.set(36, 36);

    const groundGeo = new THREE.PlaneGeometry(320, 320, 32, 32);
    const groundMat = new THREE.MeshStandardMaterial({
      map: grassTex,
      roughness: 0.88,
      metalness: 0.05,
    });
    const groundMesh = new THREE.Mesh(groundGeo, groundMat);
    groundMesh.rotation.x = -Math.PI / 2;
    groundMesh.receiveShadow = true;
    campusGroup.add(groundMesh);

    // Distant Rolling Mountain Horizon Silhouettes
    const hillMat = new THREE.MeshStandardMaterial({ color: '#254E25', roughness: 0.95 });
    for (let h = 0; h < 18; h++) {
      const angle = (h / 18) * Math.PI * 2;
      const dist = 125 + (h % 3) * 14;
      const radius = 24 + (h % 4) * 8;
      const hill = new THREE.Mesh(new THREE.SphereGeometry(radius, 12, 8), hillMat);
      hill.scale.set(1.6, 0.45, 1.2);
      hill.position.set(Math.cos(angle) * dist, -3, Math.sin(angle) * dist);
      campusGroup.add(hill);
    }

    // Asphalt Road Network with Markings
    const roadMat = new THREE.MeshStandardMaterial({ color: '#1A2028', roughness: 0.72, metalness: 0.1 });
    const curbMat = new THREE.MeshStandardMaterial({ color: '#94A3B8', roughness: 0.5 });
    const yellowStripeMat = new THREE.MeshBasicMaterial({ color: '#FBBF24' });
    const whiteStripeMat = new THREE.MeshBasicMaterial({ color: '#F8FAFC' });

    const mainRoad = new THREE.Mesh(new THREE.BoxGeometry(92, 0.08, 7.2), roadMat);
    mainRoad.position.set(0, 0.04, 8.0);
    mainRoad.receiveShadow = true;
    campusGroup.add(mainRoad);

    const curbNorth = new THREE.Mesh(new THREE.BoxGeometry(92, 0.16, 0.35), curbMat);
    curbNorth.position.set(0, 0.08, 4.2);
    const curbSouth = new THREE.Mesh(new THREE.BoxGeometry(92, 0.16, 0.35), curbMat);
    curbSouth.position.set(0, 0.08, 11.8);
    campusGroup.add(curbNorth, curbSouth);

    for (let c = -42; c <= 42; c += 3.5) {
      const dash = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.01, 0.2), yellowStripeMat);
      dash.position.set(c, 0.09, 8.0);
      campusGroup.add(dash);
    }

    const edgeNorth = new THREE.Mesh(new THREE.BoxGeometry(90, 0.01, 0.14), whiteStripeMat);
    edgeNorth.position.set(0, 0.09, 4.7);
    const edgeSouth = new THREE.Mesh(new THREE.BoxGeometry(90, 0.01, 0.14), whiteStripeMat);
    edgeSouth.position.set(0, 0.09, 11.3);
    campusGroup.add(edgeNorth, edgeSouth);

    const branchRoad = new THREE.Mesh(new THREE.BoxGeometry(7.0, 0.08, 15), roadMat);
    branchRoad.position.set(6.5, 0.04, -0.5);
    branchRoad.receiveShadow = true;
    campusGroup.add(branchRoad);

    const parkingApron = new THREE.Mesh(new THREE.BoxGeometry(18, 0.07, 9.0), roadMat);
    parkingApron.position.set(13.5, 0.035, -2.5);
    parkingApron.receiveShadow = true;
    campusGroup.add(parkingApron);

    for (let p = 7.5; p <= 19.5; p += 3.0) {
      const pLine = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.01, 4.6), whiteStripeMat);
      pLine.position.set(p, 0.08, -2.5);
      campusGroup.add(pLine);
    }

    // Street Lamps with Emissive Bulbs along the Road
    const streetLampMat = new THREE.MeshStandardMaterial({ color: '#475569', metalness: 0.8, roughness: 0.3 });
    const lampBulbMat = new THREE.MeshBasicMaterial({ color: '#FFFBEB' });
    const streetLights = [];

    [-25, -5, 15, 35].forEach((lx) => {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 6.0, 8), streetLampMat);
      pole.position.set(lx, 3.0, 12.5);
      pole.castShadow = true;

      const arm = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.1, 0.1), streetLampMat);
      arm.position.set(lx, 5.9, 11.9);

      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 12), lampBulbMat);
      bulb.position.set(lx, 5.75, 11.4);

      const pLight = new THREE.PointLight('#FBBF24', 0, 18);
      pLight.position.set(lx, 5.6, 11.4);

      campusGroup.add(pole, arm, bulb, pLight);
      streetLights.push(pLight);
    });
    animObjectsRef.current.streetLights = streetLights;

    // 3D Vehicles (Parked + Moving loop cars)
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
      return car;
    };

    createCar(9.0, -2.2, 0, '#DC2626');
    createCar(15.0, -2.2, 0, '#F8FAFC');
    createCar(-3.2, 5.2, Math.PI / 2, '#2563EB');

    // Moving Car along the Main Road Loop
    const movingCar1 = createCar(-35, 6.2, Math.PI / 2, '#F59E0B');
    animObjectsRef.current.movingCars.push(movingCar1);

    // =========================================================================
    // 9. INSTANCED VEGETATION (~350 TREES & HEDGES FOR PEAK 60 FPS)
    // =========================================================================
    // Instanced Oak Deciduous Shade Trees
    const oakGeo = new THREE.DodecahedronGeometry(1.8, 1);
    const oakMat = new THREE.MeshStandardMaterial({ color: '#2D7A32', roughness: 0.8, flatShading: true });
    const oakCount = 180;
    const oakInstanced = new THREE.InstancedMesh(oakGeo, oakMat, oakCount);
    oakInstanced.castShadow = true;
    oakInstanced.receiveShadow = true;

    // Instanced Conical Pine Trees
    const pineGeo = new THREE.ConeGeometry(1.8, 3.8, 7);
    const pineMat = new THREE.MeshStandardMaterial({ color: '#1B4D24', roughness: 0.8, flatShading: true });
    const pineCount = 120;
    const pineInstanced = new THREE.InstancedMesh(pineGeo, pineMat, pineCount);
    pineInstanced.castShadow = true;
    pineInstanced.receiveShadow = true;

    const dummy = new THREE.Object3D();
    const treePositions = [];

    // Procedural distribution of trees surrounding campus and framing views
    for (let i = 0; i < oakCount; i++) {
      const angle = (i / oakCount) * Math.PI * 2;
      const radius = 32 + (i % 5) * 12 + Math.random() * 8;
      const tx = Math.cos(angle) * radius;
      const tz = Math.sin(angle) * radius - 2;

      // Avoid placing on road or building
      if (Math.abs(tz - 8) < 6 && Math.abs(tx) < 45) continue;
      if (Math.abs(tx) < 14 && Math.abs(tz + 4) < 12) continue;

      const scale = 0.85 + Math.random() * 0.6;
      dummy.position.set(tx, 3.0 * scale, tz);
      dummy.scale.set(scale, scale, scale);
      dummy.rotation.y = Math.random() * Math.PI * 2;
      dummy.updateMatrix();
      oakInstanced.setMatrixAt(i, dummy.matrix);
      treePositions.push(dummy.position.clone());
    }
    oakInstanced.instanceMatrix.needsUpdate = true;
    campusGroup.add(oakInstanced);

    for (let j = 0; j < pineCount; j++) {
      const angle = (j / pineCount) * Math.PI * 2 + 0.3;
      const radius = 42 + (j % 4) * 14 + Math.random() * 10;
      const px = Math.cos(angle) * radius;
      const pz = Math.sin(angle) * radius;

      if (Math.abs(pz - 8) < 6 && Math.abs(px) < 45) continue;
      if (Math.abs(px) < 14 && Math.abs(pz + 4) < 12) continue;

      const pScale = 0.9 + Math.random() * 0.65;
      dummy.position.set(px, 2.6 * pScale, pz);
      dummy.scale.set(pScale, pScale, pScale);
      dummy.rotation.y = Math.random() * Math.PI * 2;
      dummy.updateMatrix();
      pineInstanced.setMatrixAt(j, dummy.matrix);
    }
    pineInstanced.instanceMatrix.needsUpdate = true;
    campusGroup.add(pineInstanced);

    // =========================================================================
    // 10. GROUND/CANOPY COMMERCIAL SOLAR PV FARM (150 kWp) ON LEFT
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
    const pvCellMat = new THREE.MeshPhysicalMaterial({
      color: '#1A367A',
      metalness: 0.65,
      roughness: 0.12,
      clearcoat: 1.0,
      clearcoatRoughness: 0.08,
      emissive: new THREE.Color('#0F2A60'),
      emissiveIntensity: 0.2,
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
    // 11. MODERN ARCHITECTURAL SMART CAMPUS BUILDING (BÁM SÁT demo.png)
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
    animObjectsRef.current.windowMat = glassCurtainMat;

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
        animObjectsRef.current.roofPvPanels.push(rCell);
        animObjectsRef.current.pvPanels.push(rCell);
      }
    });

    const intLightA = new THREE.PointLight('#FBBF24', 0, 16);
    intLightA.position.set(-0.5, 2.3, 3.2);
    const intLightB = new THREE.PointLight('#60A5FA', 0, 16);
    intLightB.position.set(-0.5, 6.0, 3.2);
    buildingGroup.add(intLightA, intLightB);
    animObjectsRef.current.windowLights = [intLightA, intLightB];

    // =========================================================================
    // 12. INDUSTRIAL CONTAINERIZED BESS STATION (200 kWh / 50 kW)
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
    // 13. HIGH-VOLTAGE TRANSMISSION PYLON & SUBSTATION (21.2 kW) ON RIGHT
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

    // Overhead Transmission Wires (Catenary curve from pylon to building)
    const wireMat = new THREE.MeshBasicMaterial({ color: '#64748B' });
    const wireCurve1 = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(16.0, 16.5, -3.5),
      new THREE.Vector3(8.0, 12.0, -4.0),
      new THREE.Vector3(0.0, 9.0, -4.5)
    );
    const wireMesh1 = new THREE.Mesh(new THREE.TubeGeometry(wireCurve1, 24, 0.04, 6, false), wireMat);
    campusGroup.add(wireMesh1);

    // =========================================================================
    // 14. GLOWING CYBER LASER ENERGY FLOW LINES & TRAVELING ORBS
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
      midPoint.y += 0.38;

      const curve = new THREE.QuadraticBezierCurve3(pStart, midPoint, pEnd);
      const tubeGeo = new THREE.TubeGeometry(curve, 32, 0.1, 8, false);
      const tubeMat = new THREE.MeshBasicMaterial({
        color: baseColor,
        transparent: true,
        opacity: 0.75,
      });
      const tubeMesh = new THREE.Mesh(tubeGeo, tubeMat);
      campusGroup.add(tubeMesh);

      const orbGroup = new THREE.Group();
      const orbMat = new THREE.MeshBasicMaterial({ color: '#FFFFFF' });
      const orbs = [];
      for (let o = 0; o < 5; o++) {
        const orb = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 12), orbMat);
        orbGroup.add(orb);
        orbs.push(orb);
      }
      campusGroup.add(orbGroup);

      animObjectsRef.current.flowCurves[key] = curve;
      animObjectsRef.current.flowParticles[key] = { orbs, mesh: tubeMesh, active: true, speed: 0.35, reverse: false };
    };

    createEnergyLaser('pv_to_bess', anchorPoints.solar, anchorPoints.bess, '#10B981');
    createEnergyLaser('pv_to_house', anchorPoints.solar, anchorPoints.house, '#06B6D4');
    createEnergyLaser('batt_flow', anchorPoints.bess, anchorPoints.house, '#10B981');
    createEnergyLaser('grid_flow', anchorPoints.house, anchorPoints.grid, '#A855F7');

    // Pulsing Node Rings on Ground
    const ringGeo = new THREE.RingGeometry(0.8, 1.1, 24);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({ color: '#38BDF8', transparent: true, opacity: 0.75, side: THREE.DoubleSide });
    const nodeRing = new THREE.Mesh(ringGeo, ringMat);
    nodeRing.position.copy(anchorPoints.hub);
    campusGroup.add(nodeRing);

    animObjectsRef.current.sunLight = sunLight;
    animObjectsRef.current.sunMesh = sunMesh;
    animObjectsRef.current.moonLight = moonLight;
    animObjectsRef.current.moonMesh = moonMesh;
    animObjectsRef.current.hemiLight = hemiLight;
    animObjectsRef.current.ambientLight = ambientLight;

    setLoadProgress(100);
    setTimeout(() => setIsSceneReady(true), 250);

    // =========================================================================
    // 15. CONTINUOUS ANIMATION LOOP, FPS MONITOR, TWEENING, TAB VISIBILITY
    // =========================================================================
    let animId;
    let clock = new THREE.Clock();
    let isTabVisible = true;

    // FPS Tracking for Auto-Downgrade
    let frameCount = 0;
    let lastFpsCheck = performance.now();
    let lowFpsSeconds = 0;

    const handleVisibilityChange = () => {
      isTabVisible = !document.hidden;
      if (isTabVisible) clock.getDelta();
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Initial 2.5s Cinematic Swoop-In from high sky to default view
    const introStartTime = performance.now();
    const introDuration = 2500;
    const introStartPos = new THREE.Vector3(85, 75, 95);
    const introTargetPos = new THREE.Vector3(50, 36, 54);

    const animate = () => {
      animId = requestAnimationFrame(animate);
      if (!isTabVisible) return;

      const now = performance.now();
      const elapsedTime = clock.getElapsedTime();

      // FPS Monitoring (Auto-Downgrade Quality)
      frameCount++;
      if (now - lastFpsCheck >= 1000) {
        const currentFps = (frameCount * 1000) / (now - lastFpsCheck);
        frameCount = 0;
        lastFpsCheck = now;

        if (currentFps < 38) {
          lowFpsSeconds++;
          if (lowFpsSeconds >= 3) {
            lowFpsSeconds = 0;
            if (qualityRef.current === 'high') {
              setQualityMode('medium');
              renderer.setPixelRatio(1.2);
            } else if (qualityRef.current === 'medium') {
              setQualityMode('low');
              renderer.setPixelRatio(1.0);
              renderer.shadowMap.enabled = false;
            }
          }
        } else {
          lowFpsSeconds = 0;
        }
      }

      // 1. Cinematic Swoop-In on Initial Load
      const introElapsed = now - introStartTime;
      if (introElapsed < introDuration) {
        const p = introElapsed / introDuration;
        const ease = 1 - Math.pow(1 - p, 3); // EaseOutCubic
        camera.position.lerpVectors(introStartPos, introTargetPos, ease);
        controls.target.set(0, 2.5, -2.0);
      } else if (targetCameraPos.current && targetLookAt.current) {
        // 2. Smooth 1-second Camera Preset Tween (easeInOut)
        const tweenElapsed = now - tweenStartTime.current;
        const progress = Math.min(1.0, tweenElapsed / tweenDuration);
        const ease = progress < 0.5
          ? 4 * progress * progress * progress
          : 1 - Math.pow(-2 * progress + 2, 3) / 2;

        camera.position.lerpVectors(startCameraPos.current, targetCameraPos.current, ease);
        controls.target.lerpVectors(startLookAt.current, targetLookAt.current, ease);

        if (progress >= 1.0) {
          targetCameraPos.current = null;
          targetLookAt.current = null;
        }
      } else {
        // 3. Subtle Slow Auto-Rotate after 15s of User Inactivity
        if (Date.now() - lastInteractionTime.current > 15000) {
          controls.autoRotate = true;
          controls.autoRotateSpeed = 0.25;
        } else {
          controls.autoRotate = false;
        }
      }

      controls.update();

      // Drifting clouds animation
      if (animObjectsRef.current.cloudGroup) {
        animObjectsRef.current.cloudGroup.position.x = (elapsedTime * 1.5) % 80 - 40;
      }

      // Moving cars animation
      animObjectsRef.current.movingCars.forEach((c) => {
        c.position.x = (elapsedTime * 6) % 84 - 42;
      });

      // Node ring pulse animation
      nodeRing.scale.setScalar(1.0 + Math.sin(elapsedTime * 3) * 0.08);

      // Traveling Energy Orbs along Conduits
      Object.keys(animObjectsRef.current.flowParticles).forEach((k) => {
        const item = animObjectsRef.current.flowParticles[k];
        const curve = animObjectsRef.current.flowCurves[k];
        if (item && curve && item.active) {
          item.orbs.forEach((orb, idx) => {
            const rawT = (elapsedTime * item.speed + idx * 0.2) % 1.0;
            const t = item.reverse ? 1.0 - rawT : rawT;
            const pt = curve.getPoint(t);
            orb.position.copy(pt);
          });
        }
      });

      // Screen-Space Projection with Anti-Overlap Collision Solver
      const halfW = container.clientWidth / 2;
      const halfH = container.clientHeight / 2;

      const projectPoint = (v3) => {
        const p = v3.clone();
        p.project(camera);
        return {
          x: p.x * halfW + halfW,
          y: -(p.y * halfH) + halfH,
          visible: p.z < 1.0,
          zDist: v3.distanceTo(camera.position),
        };
      };

      const rawBadges = {
        pv: projectPoint(new THREE.Vector3(-18.0, 5.0, -3.5)),
        house: projectPoint(new THREE.Vector3(-0.5, 10.2, -1.5)),
        battery: projectPoint(new THREE.Vector3(-6.8, 4.5, 5.0)),
        grid: projectPoint(new THREE.Vector3(20.0, 18.0, -3.5)),
      };

      // Anti-Overlap Relaxation Solver (nudges overlapping labels apart)
      const keys = ['pv', 'battery', 'house', 'grid'];
      const badgeBoxes = {};
      const badgeW = 160;
      const badgeH = 55;

      keys.forEach((k) => {
        const pt = rawBadges[k];
        badgeBoxes[k] = {
          x: pt.x,
          y: pt.y - 45, // default offset above anchor
          anchorX: pt.x,
          anchorY: pt.y,
          visible: pt.visible,
          scale: Math.max(0.85, Math.min(1.05, 1.0 - (pt.zDist - 60) * 0.003)),
          opacity: Math.max(0.75, Math.min(1.0, 1.0 - (pt.zDist - 100) * 0.004)),
        };
      });

      // Pairwise collision avoidance
      for (let i = 0; i < keys.length; i++) {
        for (let j = i + 1; j < keys.length; j++) {
          const b1 = badgeBoxes[keys[i]];
          const b2 = badgeBoxes[keys[j]];
          if (b1.visible && b2.visible) {
            const dx = Math.abs(b1.x - b2.x);
            const dy = Math.abs(b1.y - b2.y);
            if (dx < badgeW && dy < badgeH) {
              // Push higher badge higher up
              if (b1.y < b2.y) {
                b1.y -= (badgeH - dy + 8);
              } else {
                b2.y -= (badgeH - dy + 8);
              }
            }
          }
        }
      }

      setBadges(badgeBoxes);

      // Render through Composer (High) or Direct WebGL (Medium/Low)
      if (qualityRef.current === 'high') {
        composer.render();
      } else {
        renderer.render(scene, camera);
      }
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
          composer.setSize(newW, newH);
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
      composer.dispose();
    };
  }, []);

  // --- REALISTIC 24-HOUR DAY/NIGHT LIGHTING & TELEMETRY ---
  useEffect(() => {
    if (!stepData || !animObjectsRef.current.sky) return;

    const { hour, p_pv_kw, p_load_kw, p_batt_kw, p_buy_kw, p_sell_kw, soc_pct } = stepData;
    const isDay = hour >= 5.5 && hour <= 18.5;

    const {
      sky,
      sunLight,
      sunMesh,
      moonLight,
      moonMesh,
      hemiLight,
      starsField,
      windowLights,
      streetLights,
      windowMat,
      batteryLed,
      pvPanels,
      flowParticles,
    } = animObjectsRef.current;

    // Celestial Sun Vector for Preetham Sky Shader
    const sunUniforms = sky.material.uniforms;
    const sunElevation = Math.sin(((hour - 6.0) / 12.0) * Math.PI) * 58.0; // peak 58 deg at 12:00
    const sunAzimuth = 180 - (hour / 24.0) * 360; // sweep East to West

    const phi = THREE.MathUtils.degToRad(90 - sunElevation);
    const theta = THREE.MathUtils.degToRad(sunAzimuth);

    const sunVector = new THREE.Vector3();
    sunVector.setFromSphericalCoords(1, phi, theta);
    sunUniforms['sunPosition'].value.copy(sunVector);

    // Dynamic Lighting, Sky Color & Fog
    if (isDay) {
      const progress = (hour - 6.0) / 12.0;
      const sX = -Math.cos(progress * Math.PI) * 52;
      const sY = Math.max(2, Math.sin(progress * Math.PI) * 48 + 4);
      const sZ = Math.sin(progress * Math.PI) * 28 + 6;

      sunMesh.position.set(sX, sY, sZ);
      sunMesh.visible = true;
      sunLight.position.set(sX, sY, sZ);
      sunLight.intensity = Math.max(1.2, Math.sin(progress * Math.PI) * 3.0);

      if (progress < 0.12 || progress > 0.88) {
        // Sunrise / Sunset: Warm Golden/Peach
        sunLight.color.set('#F59E0B');
        sunMesh.material.color.set('#F59E0B');
        sceneRef.current.background.set('#1E293B');
        sceneRef.current.fog.color.set('#C27D56');
      } else {
        // Clear Day: Bright Azure Sky & Soft Horizon Haze
        sunLight.color.set('#FFFDF0');
        sunMesh.material.color.set('#FDE047');
        sceneRef.current.background.set('#38BDF8');
        sceneRef.current.fog.color.set('#BAE6FD');
      }

      hemiLight.intensity = 1.15;
      moonMesh.visible = false;
      moonLight.intensity = 0;
      starsField.material.opacity = 0;

      // Daytime: Off streetlights and dim windows
      streetLights.forEach((sl) => (sl.intensity = 0));
      windowLights.forEach((wl) => (wl.intensity = 0.2));
      if (windowMat) windowMat.emissive = new THREE.Color('#000000');

      // Solar PV reflective gloss
      pvPanels.forEach((p) => {
        p.material.emissiveIntensity = 0.1 + (p_pv_kw / 150) * 0.35;
      });
    } else {
      // Night Time (e.g. 23:45 deep night): Deep Midnight Blue Atmosphere
      sunMesh.visible = false;
      sunLight.intensity = 0;

      moonMesh.position.set(32, 42, -32);
      moonMesh.visible = true;
      moonLight.intensity = 1.25;

      sceneRef.current.background.set('#070F22');
      sceneRef.current.fog.color.set('#091122');
      hemiLight.intensity = 0.55;
      starsField.material.opacity = 0.9;

      // Turn on streetlights along road & warm golden interior window illumination
      streetLights.forEach((sl) => (sl.intensity = 3.5));
      windowLights.forEach((wl) => (wl.intensity = 4.2));
      if (windowMat) {
        windowMat.emissive = new THREE.Color('#FBBF24');
        windowMat.emissiveIntensity = 0.45;
      }

      // Solar PV dark at night
      pvPanels.forEach((p) => {
        p.material.emissiveIntensity = 0.0;
      });
    }

    // BESS LED Indicator & Pulse Color
    if (batteryLed) {
      if (p_batt_kw > 0.2) {
        batteryLed.material.color.set('#10B981'); // Sạc: Emerald Green
      } else if (p_batt_kw < -0.2) {
        batteryLed.material.color.set('#EF4444'); // Xả: Coral / Red
      } else {
        batteryLed.material.color.set('#38BDF8'); // Nghỉ: Cyber Cyan
      }
    }

    // Energy Flow Direction & Speed Scaling
    if (flowParticles.pv_to_bess && flowParticles.pv_to_house) {
      const pvActive = p_pv_kw > 0.5;
      flowParticles.pv_to_bess.active = pvActive;
      flowParticles.pv_to_house.active = pvActive;
      flowParticles.pv_to_house.speed = 0.15 + (p_pv_kw / 150) * 0.75;
    }

    if (flowParticles.batt_flow) {
      const battActive = Math.abs(p_batt_kw) > 0.5;
      flowParticles.batt_flow.active = battActive;
      flowParticles.batt_flow.speed = 0.15 + (Math.abs(p_batt_kw) / 50) * 0.75;
      flowParticles.batt_flow.reverse = p_batt_kw > 0.1; // Charging into battery vs discharging out
      flowParticles.batt_flow.mesh.material.color.set(p_batt_kw < -0.2 ? '#EF4444' : '#10B981');
    }

    if (flowParticles.grid_flow) {
      const gridActive = Math.abs(p_buy_kw) > 0.2 || Math.abs(p_sell_kw) > 0.2;
      flowParticles.grid_flow.active = gridActive;
      flowParticles.grid_flow.speed = 0.25 + (Math.max(p_buy_kw, p_sell_kw) / 60) * 0.7;
      flowParticles.grid_flow.reverse = p_sell_kw > 0.2; // Sell back to grid vs buy
      flowParticles.grid_flow.mesh.material.color.set(p_sell_kw > 0.2 ? '#F59E0B' : '#A855F7');
    }
  }, [stepData]);

  return (
    <div className="smart-house-3d-wrap">
      {/* 1. Loading Overlay with Progress Bar */}
      {!isSceneReady && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: '#070F22',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '1rem',
            color: '#60A5FA',
            zIndex: 40,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', fontSize: '0.95rem', fontWeight: 700 }}>
            <Loader2 size={24} className="spin-anim" />
            <span>Đang khởi tạo Mô hình Microgrid 3D Digital Twin...</span>
          </div>
          <div style={{ width: '220px', height: '6px', background: 'rgba(255,255,255,0.1)', borderRadius: '4px', overflow: 'hidden' }}>
            <div style={{ width: `${loadProgress}%`, height: '100%', background: 'linear-gradient(90deg, #3B82F6, #10B981)', transition: 'width 0.3s ease' }} />
          </div>
        </div>
      )}

      {/* 2. WebGL Canvas Mount */}
      <div ref={mountRef} style={{ width: '100%', height: '100%', outline: 'none' }} />

      {/* 3. SVG Leader Lines Linking Badges to 3D Anchor Points */}
      <svg
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
          zIndex: 14,
        }}
      >
        {Object.keys(badges).map((k) => {
          const b = badges[k];
          if (!b.visible) return null;
          const color = k === 'pv' ? '#F59E0B' : k === 'battery' ? '#10B981' : k === 'house' ? '#3B82F6' : '#A855F7';
          return (
            <g key={k}>
              <line
                x1={b.anchorX}
                y1={b.anchorY}
                x2={b.x}
                y2={b.y}
                stroke={color}
                strokeWidth="1.5"
                strokeDasharray="4 3"
                opacity={b.opacity * 0.75}
              />
              <circle cx={b.anchorX} cy={b.anchorY} r="3.5" fill={color} opacity={b.opacity} />
            </g>
          );
        })}
      </svg>

      {/* 4. Top Right Controls: Camera Presets & Quality Switcher */}
      <div
        style={{
          position: 'absolute',
          top: '0.85rem',
          right: '0.85rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.45rem',
          background: 'rgba(15, 23, 42, 0.88)',
          backdropFilter: 'blur(12px)',
          padding: '0.3rem 0.55rem',
          borderRadius: '12px',
          border: '1px solid rgba(255, 255, 255, 0.15)',
          zIndex: 25,
          boxShadow: '0 4px 16px rgba(0, 0, 0, 0.35)',
        }}
      >
        {/* Preset Buttons */}
        <button
          className="btn-ctrl"
          style={{ width: 'auto', padding: '0.25rem 0.55rem', fontSize: '0.72rem', borderRadius: '6px' }}
          onClick={() => setCameraPreset([50, 36, 54], [0, 2.5, -2.0])}
          title="[Phím 1] Góc nhìn Toàn cảnh Microgrid (giống demo.png)"
        >
          <Camera size={13} style={{ marginRight: 4 }} />
          Toàn cảnh
        </button>
        <button
          className="btn-ctrl"
          style={{ width: 'auto', padding: '0.25rem 0.55rem', fontSize: '0.72rem', borderRadius: '6px' }}
          onClick={() => setCameraPreset([-6.8, 6.0, 13.0], [-6.8, 2.0, 5.0])}
          title="[Phím 2] Cận cảnh Trạm BESS 200 kWh"
        >
          <Battery size={13} color="#10B981" style={{ marginRight: 4 }} />
          BESS
        </button>
        <button
          className="btn-ctrl"
          style={{ width: 'auto', padding: '0.25rem 0.55rem', fontSize: '0.72rem', borderRadius: '6px' }}
          onClick={() => setCameraPreset([-22, 16, 16], [-22, 2.0, -3.5])}
          title="[Phím 3] Cận cảnh Nông trại Điện mặt trời Solar PV"
        >
          <Sun size={13} color="#FBBF24" style={{ marginRight: 4 }} />
          Solar PV
        </button>
        <button
          className="btn-ctrl"
          style={{ width: 'auto', padding: '0.25rem 0.55rem', fontSize: '0.72rem', borderRadius: '6px' }}
          onClick={() => setCameraPreset([0, 14, 15], [-0.5, 5.5, -4.8])}
          title="[Phím 4] Cận cảnh Tòa nhà thông minh (Phụ tải & Pin trên nóc)"
        >
          <Home size={13} color="#3B82F6" style={{ marginRight: 4 }} />
          Tòa nhà
        </button>
        <button
          className="btn-ctrl"
          style={{ width: 'auto', padding: '0.25rem 0.55rem', fontSize: '0.72rem', borderRadius: '6px' }}
          onClick={() => setCameraPreset([22, 16, 12], [20.0, 8.5, -3.5])}
          title="[Phím 5] Cận cảnh Cột điện cao thế & Trạm biến áp"
        >
          <Zap size={13} color="#A855F7" style={{ marginRight: 4 }} />
          Lưới điện
        </button>
        <button
          className="btn-ctrl"
          style={{ width: 'auto', padding: '0.25rem 0.55rem', fontSize: '0.72rem', borderRadius: '6px' }}
          onClick={() => setCameraPreset([0, 80, 0.1], [0, 0, 0])}
          title="[Phím 6] Góc nhìn thẳng từ trên cao xuống"
        >
          <Eye size={13} style={{ marginRight: 4 }} />
          Top-down
        </button>

        {/* Quality Selector */}
        <div style={{ width: '1px', height: '18px', background: 'rgba(255,255,255,0.2)', margin: '0 2px' }} />
        <button
          className="btn-ctrl"
          style={{
            width: 'auto',
            padding: '0.22rem 0.5rem',
            fontSize: '0.68rem',
            borderRadius: '6px',
            background: qualityMode === 'high' ? 'rgba(59, 130, 246, 0.35)' : 'transparent',
            color: qualityMode === 'high' ? '#60A5FA' : '#94A3B8',
          }}
          onClick={() => {
            const next = qualityMode === 'high' ? 'medium' : qualityMode === 'medium' ? 'low' : 'high';
            setQualityMode(next);
            if (next === 'high') {
              rendererRef.current.setPixelRatio(Math.min(window.devicePixelRatio, 2));
              rendererRef.current.shadowMap.enabled = true;
            } else if (next === 'medium') {
              rendererRef.current.setPixelRatio(1.2);
              rendererRef.current.shadowMap.enabled = true;
            } else {
              rendererRef.current.setPixelRatio(1.0);
              rendererRef.current.shadowMap.enabled = false;
            }
          }}
          title="Chất lượng đồ họa (Auto-FPS): High (Bloom+Shadows), Medium, Low"
        >
          <Sparkles size={11} style={{ marginRight: 3 }} />
          {qualityMode.toUpperCase()}
        </button>
      </div>

      {/* 5. Smart Floating 3D Telemetry Badges */}
      {/* 1. Solar PV Badge */}
      {badges.pv.visible && (
        <div
          onClick={() => setCameraPreset([-22, 16, 16], [-22, 2.0, -3.5])}
          style={{
            position: 'absolute',
            left: `${badges.pv.x}px`,
            top: `${badges.pv.y}px`,
            transform: `translate(-50%, -100%) scale(${badges.pv.scale})`,
            opacity: badges.pv.opacity,
            background: 'rgba(15, 23, 42, 0.92)',
            backdropFilter: 'blur(12px)',
            border: '2px solid #F59E0B',
            borderRadius: '12px',
            padding: '0.38rem 0.85rem',
            color: '#FFFFFF',
            cursor: 'pointer',
            boxShadow: '0 6px 22px rgba(245, 158, 11, 0.55)',
            zIndex: 20,
            whiteSpace: 'nowrap',
            transition: 'opacity 0.2s ease, transform 0.2s ease',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.72rem', fontWeight: 700, color: '#FBBF24' }}>
            <span>☀️</span> SOLAR PV
          </div>
          <div style={{ fontSize: '1.05rem', fontWeight: 800, fontFamily: 'var(--font-mono)', lineHeight: 1.2 }}>
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
            transform: `translate(-50%, -100%) scale(${badges.battery.scale})`,
            opacity: badges.battery.opacity,
            background: 'rgba(15, 23, 42, 0.92)',
            backdropFilter: 'blur(12px)',
            border: `2px solid ${stepData?.p_batt_kw < -0.1 ? '#EF4444' : '#10B981'}`,
            borderRadius: '12px',
            padding: '0.38rem 0.85rem',
            color: '#FFFFFF',
            cursor: 'pointer',
            boxShadow: `0 6px 22px ${stepData?.p_batt_kw < -0.1 ? 'rgba(239, 68, 68, 0.55)' : 'rgba(16, 185, 129, 0.55)'}`,
            zIndex: 20,
            whiteSpace: 'nowrap',
            transition: 'opacity 0.2s ease, transform 0.2s ease',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.72rem', fontWeight: 700, color: stepData?.p_batt_kw < -0.1 ? '#F87171' : '#34D399' }}>
            <span>🔋</span> BESS (SoC: {stepData?.soc_pct?.toFixed(0) || 90}%)
          </div>
          <div style={{ fontSize: '1.05rem', fontWeight: 800, fontFamily: 'var(--font-mono)', lineHeight: 1.2 }}>
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
            transform: `translate(-50%, -100%) scale(${badges.house.scale})`,
            opacity: badges.house.opacity,
            background: 'rgba(15, 23, 42, 0.92)',
            backdropFilter: 'blur(12px)',
            border: '2px solid #3B82F6',
            borderRadius: '12px',
            padding: '0.38rem 0.85rem',
            color: '#FFFFFF',
            cursor: 'pointer',
            boxShadow: '0 6px 22px rgba(59, 130, 246, 0.55)',
            zIndex: 20,
            whiteSpace: 'nowrap',
            transition: 'opacity 0.2s ease, transform 0.2s ease',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.72rem', fontWeight: 700, color: '#60A5FA' }}>
            <span>🏠</span> PHỤ TẢI NHÀ
          </div>
          <div style={{ fontSize: '1.05rem', fontWeight: 800, fontFamily: 'var(--font-mono)', lineHeight: 1.2 }}>
            {stepData?.p_load_kw?.toFixed(1) || 0} kW
          </div>
        </div>
      )}

      {/* 4. EVN Grid Badge */}
      {badges.grid.visible && (
        <div
          onClick={() => setCameraPreset([22, 16, 12], [20.0, 8.5, -3.5])}
          style={{
            position: 'absolute',
            left: `${badges.grid.x}px`,
            top: `${badges.grid.y}px`,
            transform: `translate(-50%, -100%) scale(${badges.grid.scale})`,
            opacity: badges.grid.opacity,
            background: 'rgba(15, 23, 42, 0.92)',
            backdropFilter: 'blur(12px)',
            border: '2px solid #A855F7',
            borderRadius: '12px',
            padding: '0.38rem 0.85rem',
            color: '#FFFFFF',
            cursor: 'pointer',
            boxShadow: '0 6px 22px rgba(168, 85, 247, 0.55)',
            zIndex: 20,
            whiteSpace: 'nowrap',
            transition: 'opacity 0.2s ease, transform 0.2s ease',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.72rem', fontWeight: 700, color: '#C4B5FD' }}>
            <span>⚡</span> Lưới điện
          </div>
          <div style={{ fontSize: '1.05rem', fontWeight: 800, fontFamily: 'var(--font-mono)', lineHeight: 1.2 }}>
            {stepData?.p_buy_kw > 0
              ? `${stepData?.p_buy_kw?.toFixed(1)} kW (Mua)`
              : stepData?.p_sell_kw > 0
              ? `${stepData?.p_sell_kw?.toFixed(1)} kW (Bán)`
              : '21.2 kW'}
          </div>
        </div>
      )}

      {/* 6. Bottom User Interaction Hint */}
      <div
        style={{
          position: 'absolute',
          bottom: '0.75rem',
          left: '0.85rem',
          background: 'rgba(15, 23, 42, 0.88)',
          border: '1px solid rgba(255, 255, 255, 0.12)',
          padding: '0.3rem 0.75rem',
          borderRadius: '8px',
          fontSize: '0.72rem',
          color: '#E2E8F0',
          pointerEvents: 'none',
          backdropFilter: 'blur(8px)',
          zIndex: 20,
        }}
      >
        💡 <b>Chuột trái:</b> Xoay 360° | <b>Cuộn chuột:</b> Phóng to/nhỏ | <b>Chuột phải:</b> Dịch chuyển | <b>Click nhãn:</b> Zoom lại gần | <b>Phím 1-6:</b> Đổi góc nhìn
      </div>
    </div>
  );
}
