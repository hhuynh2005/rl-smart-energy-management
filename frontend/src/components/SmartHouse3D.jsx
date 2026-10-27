import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Camera, Eye, Maximize2, RotateCcw, Sun, Battery, Home, Zap } from 'lucide-react';

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
    interiorLights: [],
    fanBlades: null,
    batteryLiquid: null,
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

  // Current camera target for smooth animation
  const targetCameraPos = useRef(null);
  const targetLookAt = useRef(null);

  // Smooth camera preset transition
  const setCameraPreset = useCallback((pos, lookAt = [0, 2, 0]) => {
    targetCameraPos.current = new THREE.Vector3(...pos);
    targetLookAt.current = new THREE.Vector3(...lookAt);
  }, []);

  // --- INITIALIZE THREE.JS SCENE ONCE ---
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = container.clientWidth;
    const height = container.clientHeight || 520;

    // 1. Scene & Fog
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#0A0E1A');
    scene.fog = new THREE.FogExp2('#0A0E1A', 0.015);
    sceneRef.current = scene;

    // 2. Camera
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 150);
    camera.position.set(18, 14, 18);
    cameraRef.current = camera;

    // 3. Renderer with high visual fidelity & shadows
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // 4. Orbit Controls (360 rotate, zoom, pan)
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.minDistance = 6;
    controls.maxDistance = 50;
    controls.maxPolarAngle = Math.PI / 2.05; // Don't go below ground
    controls.target.set(0, 2, 0);
    controlsRef.current = controls;

    // 5. Lighting Setup
    // Hemispherical Sky Ambient Light
    const hemiLight = new THREE.HemisphereLight('#60A5FA', '#1E293B', 0.8);
    scene.add(hemiLight);

    // Directional Sun Light (casts shadows)
    const sunLight = new THREE.DirectionalLight('#FFFBEB', 2.0);
    sunLight.position.set(15, 20, 10);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
    sunLight.shadow.camera.near = 0.5;
    sunLight.shadow.camera.far = 60;
    sunLight.shadow.camera.left = -16;
    sunLight.shadow.camera.right = 16;
    sunLight.shadow.camera.top = 16;
    sunLight.shadow.camera.bottom = -16;
    sunLight.shadow.bias = -0.0005;
    scene.add(sunLight);

    // Glowing Sun Mesh
    const sunGeo = new THREE.SphereGeometry(1.4, 24, 24);
    const sunMat = new THREE.MeshBasicMaterial({ color: '#FBBF24' });
    const sunMesh = new THREE.Mesh(sunGeo, sunMat);
    scene.add(sunMesh);

    // Moon Light & Mesh for night
    const moonLight = new THREE.DirectionalLight('#93C5FD', 0.5);
    moonLight.position.set(-15, 18, -10);
    scene.add(moonLight);

    const moonGeo = new THREE.SphereGeometry(1.0, 16, 16);
    const moonMat = new THREE.MeshBasicMaterial({ color: '#E2E8F0' });
    const moonMesh = new THREE.Mesh(moonGeo, moonMat);
    scene.add(moonMesh);

    // 6. Ground & Terrain
    // Lawn plane
    const groundGeo = new THREE.PlaneGeometry(60, 60);
    const groundMat = new THREE.MeshStandardMaterial({ color: '#0F3826', roughness: 0.9, metalness: 0.1 });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    // Concrete House Platform / Foundation
    const platGeo = new THREE.BoxGeometry(16, 0.4, 14);
    const platMat = new THREE.MeshStandardMaterial({ color: '#1E293B', roughness: 0.7 });
    const platform = new THREE.Mesh(platGeo, platMat);
    platform.position.set(0, 0.2, 0);
    platform.receiveShadow = true;
    scene.add(platform);

    // Concrete Driveway Path
    const driveGeo = new THREE.PlaneGeometry(5, 12);
    const driveMat = new THREE.MeshStandardMaterial({ color: '#334155', roughness: 0.8 });
    const driveway = new THREE.Mesh(driveGeo, driveMat);
    driveway.rotation.x = -Math.PI / 2;
    driveway.position.set(5.5, 0.21, 6);
    driveway.receiveShadow = true;
    scene.add(driveway);

    // 7. BUILD 3D SMART HOUSE WITH CUTAWAY INTERIOR
    // Main walls group
    const houseGroup = new THREE.Group();
    scene.add(houseGroup);

    // Wall Material
    const wallMat = new THREE.MeshStandardMaterial({ color: '#1F2937', roughness: 0.6 });
    const glassMat = new THREE.MeshPhysicalMaterial({
      color: '#38BDF8',
      transmission: 0.85,
      opacity: 0.9,
      transparent: true,
      roughness: 0.1,
      ior: 1.5,
    });
    const floorMat = new THREE.MeshStandardMaterial({ color: '#0F172A', roughness: 0.5 });

    // First Floor (Tầng 1)
    // Back wall
    const backWall1 = new THREE.Mesh(new THREE.BoxGeometry(10, 3.2, 0.3), wallMat);
    backWall1.position.set(0, 1.8, -4);
    backWall1.castShadow = true;
    backWall1.receiveShadow = true;
    houseGroup.add(backWall1);

    // Left wall
    const leftWall1 = new THREE.Mesh(new THREE.BoxGeometry(0.3, 3.2, 8), wallMat);
    leftWall1.position.set(-5, 1.8, 0);
    leftWall1.castShadow = true;
    leftWall1.receiveShadow = true;
    houseGroup.add(leftWall1);

    // Partition wall (Living room vs Garage)
    const partWall = new THREE.Mesh(new THREE.BoxGeometry(0.3, 3.2, 8), wallMat);
    partWall.position.set(2.5, 1.8, 0);
    partWall.castShadow = true;
    houseGroup.add(partWall);

    // Cutaway: Front wall is open with clean glass framing so interior is visible!
    const frontGlass = new THREE.Mesh(new THREE.BoxGeometry(7.2, 3.0, 0.1), glassMat);
    frontGlass.position.set(-1.3, 1.8, 4);
    houseGroup.add(frontGlass);

    // Second Floor Slab (Sàn tầng 2)
    const floor2 = new THREE.Mesh(new THREE.BoxGeometry(10, 0.3, 8.2), floorMat);
    floor2.position.set(0, 3.4, 0);
    floor2.castShadow = true;
    floor2.receiveShadow = true;
    houseGroup.add(floor2);

    // Second Floor (Tầng 2)
    const backWall2 = new THREE.Mesh(new THREE.BoxGeometry(10, 2.6, 0.3), wallMat);
    backWall2.position.set(0, 4.8, -4);
    backWall2.castShadow = true;
    houseGroup.add(backWall2);

    const leftWall2 = new THREE.Mesh(new THREE.BoxGeometry(0.3, 2.6, 8), wallMat);
    leftWall2.position.set(-5, 4.8, 0);
    leftWall2.castShadow = true;
    houseGroup.add(leftWall2);

    const rightWall2 = new THREE.Mesh(new THREE.BoxGeometry(0.3, 2.6, 8), wallMat);
    rightWall2.position.set(5, 4.8, 0);
    rightWall2.castShadow = true;
    houseGroup.add(rightWall2);

    // Upper Front Glass Facade
    const frontGlass2 = new THREE.Mesh(new THREE.BoxGeometry(9.6, 2.4, 0.1), glassMat);
    frontGlass2.position.set(0, 4.8, 4);
    houseGroup.add(frontGlass2);

    // --- INTERIOR APPLIANCES & FURNITURE (Mặt cắt nội thất) ---
    // Living Room Sofa
    const sofaBase = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.5, 1.0), new THREE.MeshStandardMaterial({ color: '#2563EB' }));
    sofaBase.position.set(-2, 0.65, 0);
    sofaBase.castShadow = true;
    houseGroup.add(sofaBase);

    const sofaBack = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.7, 0.3), new THREE.MeshStandardMaterial({ color: '#1D4ED8' }));
    sofaBack.position.set(-2, 1.1, -0.4);
    sofaBack.castShadow = true;
    houseGroup.add(sofaBack);

    // Modern TV & Table
    const tvTable = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.4, 0.6), new THREE.MeshStandardMaterial({ color: '#475569' }));
    tvTable.position.set(-2, 0.6, -3.2);
    houseGroup.add(tvTable);

    const tvScreen = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.1, 0.08), new THREE.MeshStandardMaterial({ color: '#0284C7', emissive: '#0284C7', emissiveIntensity: 0.4 }));
    tvScreen.position.set(-2, 1.4, -3.2);
    houseGroup.add(tvScreen);

    // HVAC / Heat Pump Unit (Outdoor/Indoor)
    const hvacBox = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.2, 0.8), new THREE.MeshStandardMaterial({ color: '#E2E8F0', roughness: 0.4 }));
    hvacBox.position.set(1.4, 1.0, -3.2);
    hvacBox.castShadow = true;
    houseGroup.add(hvacBox);

    // Spinning Fan Blades on HVAC
    const fanBladeGroup = new THREE.Group();
    const blade1 = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.08, 0.04), new THREE.MeshStandardMaterial({ color: '#38BDF8' }));
    const blade2 = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.8, 0.04), new THREE.MeshStandardMaterial({ color: '#38BDF8' }));
    fanBladeGroup.add(blade1);
    fanBladeGroup.add(blade2);
    fanBladeGroup.position.set(1.4, 1.0, -2.78);
    houseGroup.add(fanBladeGroup);
    animObjectsRef.current.fanBlades = fanBladeGroup;

    // Garage & Electric Vehicle (EV Car)
    const evCarGroup = new THREE.Group();
    // Car Body
    const carBody = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.8, 3.8), new THREE.MeshStandardMaterial({ color: '#3B82F6', roughness: 0.2, metalness: 0.8 }));
    carBody.position.set(0, 0.6, 0);
    carBody.castShadow = true;
    evCarGroup.add(carBody);

    // Car Cabin Glass
    const carCabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.65, 2.0), glassMat);
    carCabin.position.set(0, 1.25, -0.2);
    evCarGroup.add(carCabin);

    // 4 Wheels
    const wheelGeo = new THREE.CylinderGeometry(0.35, 0.35, 0.25, 16);
    wheelGeo.rotateZ(Math.PI / 2);
    const wheelMat = new THREE.MeshStandardMaterial({ color: '#111827', roughness: 0.8 });
    const w1 = new THREE.Mesh(wheelGeo, wheelMat);
    w1.position.set(1.05, 0.35, 1.2);
    const w2 = new THREE.Mesh(wheelGeo, wheelMat);
    w2.position.set(-1.05, 0.35, 1.2);
    const w3 = new THREE.Mesh(wheelGeo, wheelMat);
    w3.position.set(1.05, 0.35, -1.2);
    const w4 = new THREE.Mesh(wheelGeo, wheelMat);
    w4.position.set(-1.05, 0.35, -1.2);
    evCarGroup.add(w1, w2, w3, w4);

    evCarGroup.position.set(4.2, 0.2, 1.5);
    houseGroup.add(evCarGroup);

    // EV Wallbox Charger
    const chargerBox = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.6, 0.4), new THREE.MeshStandardMaterial({ color: '#10B981', emissive: '#10B981', emissiveIntensity: 0.6 }));
    chargerBox.position.set(2.8, 1.6, 1.5);
    houseGroup.add(chargerBox);

    // Interior Warm Lights (Turn on at night)
    const livingRoomLight = new THREE.PointLight('#FBBF24', 0, 8);
    livingRoomLight.position.set(-2, 2.5, 0);
    scene.add(livingRoomLight);

    const bedroomLight = new THREE.PointLight('#FDE047', 0, 8);
    bedroomLight.position.set(0, 5.2, 0);
    scene.add(bedroomLight);
    animObjectsRef.current.interiorLights = [livingRoomLight, bedroomLight];

    // --- ROOFTOP & SOLAR PV 150 kWp ARRAY ---
    // Sloped roof structure
    const roofGeo = new THREE.ConeGeometry(7.6, 2.2, 4);
    roofGeo.rotateY(Math.PI / 4);
    const roofMat = new THREE.MeshStandardMaterial({ color: '#1E293B', roughness: 0.5 });
    const roofMesh = new THREE.Mesh(roofGeo, roofMat);
    roofMesh.position.set(0, 7.2, 0);
    roofMesh.castShadow = true;
    houseGroup.add(roofMesh);

    // PV Solar Panel Modules on sloped roof sides
    const pvMat = new THREE.MeshStandardMaterial({
      color: '#1E3A8A',
      roughness: 0.2,
      metalness: 0.8,
      emissive: '#F59E0B',
      emissiveIntensity: 0.1,
    });

    const pvGroup = new THREE.Group();
    for (let r = 0; r < 2; r++) {
      for (let c = 0; c < 4; c++) {
        const panel = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.05, 1.1), pvMat);
        panel.position.set(-2.4 + c * 1.6, 0, -1.0 + r * 1.2);
        panel.castShadow = true;
        pvGroup.add(panel);
        animObjectsRef.current.pvPanels.push(panel);
      }
    }
    pvGroup.position.set(0, 7.1, 1.5);
    pvGroup.rotation.x = Math.PI / 8;
    houseGroup.add(pvGroup);

    // --- 8. BESS BATTERY STORAGE CABINET (KHỐI PIN LƯU TRỮ 200 kWh) ---
    const bessGroup = new THREE.Group();
    bessGroup.position.set(-8.5, 0.2, 3.5);
    scene.add(bessGroup);

    // Concrete pad
    const bessPad = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.3, 2.4), new THREE.MeshStandardMaterial({ color: '#334155' }));
    bessPad.position.set(0, 0.15, 0);
    bessGroup.add(bessPad);

    // Cabinet Main Enclosure (Tesla Megapack style)
    const bessCabinet = new THREE.Mesh(
      new THREE.BoxGeometry(2.6, 2.8, 1.8),
      new THREE.MeshStandardMaterial({ color: '#0F172A', roughness: 0.4, metalness: 0.6 })
    );
    bessCabinet.position.set(0, 1.55, 0);
    bessCabinet.castShadow = true;
    bessCabinet.receiveShadow = true;
    bessGroup.add(bessCabinet);

    // Liquid Glass Gauge Cylinder (Displays SoC fluid level)
    const liquidCylinderGeo = new THREE.CylinderGeometry(0.35, 0.35, 2.0, 24);
    const liquidMat = new THREE.MeshStandardMaterial({
      color: '#10B981',
      emissive: '#10B981',
      emissiveIntensity: 0.8,
      roughness: 0.2,
      transparent: true,
      opacity: 0.9,
    });
    const liquidMesh = new THREE.Mesh(liquidCylinderGeo, liquidMat);
    liquidMesh.position.set(0, 1.55, 0.92);
    bessGroup.add(liquidMesh);
    animObjectsRef.current.batteryLiquid = liquidMesh;

    // Glowing point light at battery
    const battGlowLight = new THREE.PointLight('#10B981', 1.0, 5);
    battGlowLight.position.set(0, 1.55, 1.2);
    bessGroup.add(battGlowLight);
    animObjectsRef.current.batteryGlow = battGlowLight;

    // --- 9. EVN POWER GRID POLE (CỘT ĐIỆN LƯỚI QUỐC GIA) ---
    const gridGroup = new THREE.Group();
    gridGroup.position.set(10.5, 0.2, -3.5);
    scene.add(gridGroup);

    // Concrete utility pole
    const poleGeo = new THREE.CylinderGeometry(0.2, 0.25, 8.5, 16);
    const poleMat = new THREE.MeshStandardMaterial({ color: '#475569', roughness: 0.8 });
    const pole = new THREE.Mesh(poleGeo, poleMat);
    pole.position.set(0, 4.25, 0);
    pole.castShadow = true;
    gridGroup.add(pole);

    // Crossarm bars
    const crossGeo = new THREE.BoxGeometry(3.0, 0.18, 0.18);
    const crossMat = new THREE.MeshStandardMaterial({ color: '#334155' });
    const cross1 = new THREE.Mesh(crossGeo, crossMat);
    cross1.position.set(0, 7.8, 0);
    const cross2 = new THREE.Mesh(crossGeo, crossMat);
    cross2.position.set(0, 6.8, 0);
    gridGroup.add(cross1, cross2);

    // Transformer cylinder
    const transGeo = new THREE.CylinderGeometry(0.45, 0.45, 1.2, 16);
    const transMat = new THREE.MeshStandardMaterial({ color: '#64748B', metalness: 0.7 });
    const trans = new THREE.Mesh(transGeo, transMat);
    trans.position.set(0.6, 5.5, 0);
    gridGroup.add(trans);

    // Bidirectional Smart Meter Box on pole
    const meterGeo = new THREE.BoxGeometry(0.5, 0.7, 0.3);
    const meterMat = new THREE.MeshStandardMaterial({ color: '#1E1B4B', emissive: '#8B5CF6', emissiveIntensity: 0.5 });
    const meter = new THREE.Mesh(meterGeo, meterMat);
    meter.position.set(0, 2.2, 0.25);
    gridGroup.add(meter);

    // --- 10. CENTRAL SMART INVERTER / SEMS HUB ---
    const inverterMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.8, 1.2, 0.4),
      new THREE.MeshStandardMaterial({ color: '#0F172A', emissive: '#3B82F6', emissiveIntensity: 0.8 })
    );
    inverterMesh.position.set(-5.1, 2.2, -1.0);
    scene.add(inverterMesh);

    // --- 11. 3D GLOWING ENERGY FLOW CURVES & PARTICLE SYSTEMS ---
    // Physical Anchor positions
    const posPV = new THREE.Vector3(0, 7.2, 1.5);
    const posInverter = new THREE.Vector3(-5.1, 2.2, -1.0);
    const posBattery = new THREE.Vector3(-8.5, 1.8, 3.5);
    const posHouse = new THREE.Vector3(-1.0, 1.5, 0);
    const posGrid = new THREE.Vector3(10.5, 4.0, -3.5);

    animObjectsRef.current.anchorPoints = {
      pv: posPV,
      inverter: posInverter,
      battery: posBattery,
      house: posHouse,
      grid: posGrid,
    };

    // Create 3D Splines connecting nodes through SEMS Inverter
    const createSplineTube = (p1, p2, midYOffset = 1.0) => {
      const mid = new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5);
      mid.y += midYOffset;
      const curve = new THREE.CatmullRomCurve3([p1, mid, p2]);
      const tubeGeo = new THREE.TubeGeometry(curve, 32, 0.06, 8, false);
      const tubeMat = new THREE.MeshBasicMaterial({ color: '#38BDF8', transparent: true, opacity: 0.25 });
      const tubeMesh = new THREE.Mesh(tubeGeo, tubeMat);
      scene.add(tubeMesh);
      return { curve, tubeMesh, tubeMat };
    };

    // Define 4 main transmission channels
    const curves = {
      pv_inv: createSplineTube(posPV, posInverter, 0.5),
      inv_batt: createSplineTube(posInverter, posBattery, 1.2),
      inv_house: createSplineTube(posInverter, posHouse, 0.8),
      inv_grid: createSplineTube(posInverter, posGrid, 2.5),
    };
    animObjectsRef.current.flowCurves = curves;

    // Glowing Particle Spheres along curves
    const particleGeo = new THREE.SphereGeometry(0.16, 12, 12);
    const createParticleGroup = (colorHex, count = 8) => {
      const group = new THREE.Group();
      const pMat = new THREE.MeshBasicMaterial({ color: colorHex });
      for (let i = 0; i < count; i++) {
        const p = new THREE.Mesh(particleGeo, pMat);
        p.visible = false;
        group.add(p);
      }
      scene.add(group);
      return { group, count };
    };

    animObjectsRef.current.flowParticles = {
      pv_inv: createParticleGroup('#FBBF24', 8),
      inv_batt: createParticleGroup('#10B981', 8),
      inv_house: createParticleGroup('#60A5FA', 8),
      inv_grid: createParticleGroup('#C4B5FD', 8),
    };

    // Store references
    animObjectsRef.current.sunMesh = sunMesh;
    animObjectsRef.current.sunLight = sunLight;
    animObjectsRef.current.moonMesh = moonMesh;
    animObjectsRef.current.moonLight = moonLight;
    animObjectsRef.current.hemiLight = hemiLight;

    // --- ANIMATION LOOP ---
    let animationFrameId;
    let clock = new THREE.Clock();

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      const delta = clock.getDelta();
      const elapsed = clock.getElapsedTime();

      // Smooth camera transition if preset requested
      if (targetCameraPos.current && targetLookAt.current) {
        camera.position.lerp(targetCameraPos.current, 0.08);
        controls.target.lerp(targetLookAt.current, 0.08);
        if (camera.position.distanceTo(targetCameraPos.current) < 0.1) {
          targetCameraPos.current = null;
          targetLookAt.current = null;
        }
      }

      controls.update();

      // Spin HVAC Fan blades
      if (animObjectsRef.current.fanBlades) {
        animObjectsRef.current.fanBlades.rotation.z += delta * 8.0;
      }

      // Update projected 2D coordinates for HTML Badges
      const anchors = animObjectsRef.current.anchorPoints;
      if (anchors.pv) {
        const project = (pos3D) => {
          const v = pos3D.clone().project(camera);
          const x = ((v.x + 1) * width) / 2;
          const y = ((-v.y + 1) * height) / 2;
          const visible = v.z < 1.0;
          return { x, y, visible };
        };

        setBadges({
          pv: project(anchors.pv),
          battery: project(new THREE.Vector3(-8.5, 3.2, 3.5)),
          house: project(new THREE.Vector3(0, 3.2, 3.8)),
          grid: project(new THREE.Vector3(10.5, 5.5, -3.5)),
        });
      }

      renderer.render(scene, camera);
    };

    animate();

    // Window Resize Handler
    const handleResize = () => {
      if (!container || !camera || !renderer) return;
      const newW = container.clientWidth;
      const newH = container.clientHeight || 520;
      camera.aspect = newW / newH;
      camera.updateProjectionMatrix();
      renderer.setSize(newW, newH);
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationFrameId);
      if (renderer.domElement && container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, []);

  // --- REACTIVE TELEMETRY & 24H DAY/NIGHT LIGHTING UPDATES ---
  useEffect(() => {
    if (!stepData || !animObjectsRef.current.sunMesh) return;

    const { hour, p_pv_kw, p_load_kw, p_batt_kw, p_buy_kw, p_sell_kw, soc_pct } = stepData;
    const isDay = hour >= 6.0 && hour <= 18.0;

    const { sunMesh, sunLight, moonMesh, moonLight, hemiLight, interiorLights, batteryLiquid, batteryGlow, pvPanels, flowCurves, flowParticles } = animObjectsRef.current;

    // 1. Sun & Moon Movement
    if (isDay) {
      const progress = (hour - 6.0) / 12.0; // 0 to 1
      const sunAngle = progress * Math.PI;
      const sunDist = 26;
      const sX = Math.cos(sunAngle) * sunDist;
      const sY = Math.sin(sunAngle) * 20 + 2;
      const sZ = Math.sin(sunAngle) * 12 - 4;

      sunMesh.position.set(sX, sY, sZ);
      sunMesh.visible = true;
      sunLight.position.set(sX, sY, sZ);
      sunLight.intensity = Math.max(0.4, Math.sin(sunAngle) * 2.6);

      // Sun Color Warmth
      if (progress < 0.2 || progress > 0.8) {
        sunLight.color.set('#F59E0B'); // Sunrise/Sunset
        sunMesh.material.color.set('#F59E0B');
        sceneRef.current.background.set('#1E1B4B');
      } else {
        sunLight.color.set('#FFFBEB'); // Bright Noon
        sunMesh.material.color.set('#FBBF24');
        sceneRef.current.background.set('#0369A1');
      }

      moonMesh.visible = false;
      moonLight.intensity = 0;

      // Turn off interior lights during bright day
      interiorLights.forEach((l) => (l.intensity = 0));
    } else {
      // Night
      sunMesh.visible = false;
      sunLight.intensity = 0;

      moonMesh.position.set(-16, 20, -12);
      moonMesh.visible = true;
      moonLight.intensity = 0.6;
      sceneRef.current.background.set('#060A14');

      // Turn ON interior room lights at night!
      interiorLights.forEach((l) => (l.intensity = 3.5));
    }

    // 2. Battery Liquid Fill & Color
    if (batteryLiquid) {
      // Scale height proportional to SoC (20% - 90%)
      const normalizedSoC = Math.max(0.1, Math.min(1.0, soc_pct / 100));
      batteryLiquid.scale.set(1, normalizedSoC, 1);
      batteryLiquid.position.y = 0.55 + normalizedSoC;

      if (p_batt_kw > 0.1) {
        // Charging: Glowing Green
        batteryLiquid.material.color.set('#10B981');
        batteryLiquid.material.emissive.set('#10B981');
        batteryGlow.color.set('#10B981');
        batteryGlow.intensity = 2.0;
      } else if (p_batt_kw < -0.1) {
        // Discharging: Glowing Red-Orange
        batteryLiquid.material.color.set('#EF4444');
        batteryLiquid.material.emissive.set('#EF4444');
        batteryGlow.color.set('#EF4444');
        batteryGlow.intensity = 2.0;
      } else {
        // Idle
        batteryLiquid.material.color.set('#065F46');
        batteryLiquid.material.emissive.set('#065F46');
        batteryGlow.intensity = 0.5;
      }
    }

    // 3. Solar Panels Emissive Sheen
    pvPanels.forEach((p) => {
      if (p_pv_kw > 5.0) {
        p.material.emissiveIntensity = Math.min(1.2, p_pv_kw / 120);
        p.material.emissive.set('#FBBF24');
      } else {
        p.material.emissiveIntensity = 0.05;
      }
    });

    // 4. Update 3D Flow Tubes & Flowing Particle Visibility
    const flows = stepData.flows || {};

    // Helper to animate particles along curve
    const updateParticles = (key, activeKw, colorHex, reverse = false) => {
      const pGroup = flowParticles[key];
      const curveObj = flowCurves[key];
      if (!pGroup || !curveObj) return;

      const isActive = activeKw > 0.5;
      curveObj.tubeMesh.visible = isActive;
      curveObj.tubeMat.color.set(colorHex);

      const count = pGroup.count;
      for (let i = 0; i < count; i++) {
        const particle = pGroup.group.children[i];
        particle.visible = isActive;
        if (isActive) {
          particle.material.color.set(colorHex);
          // Calculate parametric position t in [0, 1] based on step and index
          const speed = Math.max(0.4, Math.min(2.5, activeKw / 30));
          const tOffset = (Date.now() * 0.001 * speed + i / count) % 1.0;
          const t = reverse ? 1.0 - tOffset : tOffset;
          const pos = curveObj.curve.getPointAt(t);
          particle.position.copy(pos);
          particle.scale.setScalar(Math.max(0.8, Math.min(1.8, activeKw / 40)));
        }
      }
    };

    // PV -> Inverter
    updateParticles('pv_inv', p_pv_kw, '#FBBF24', false);

    // Inverter -> Battery (Charging) OR Battery -> Inverter (Discharging)
    if (p_batt_kw > 0.5) {
      updateParticles('inv_batt', p_batt_kw, '#10B981', false); // Sạc
    } else if (p_batt_kw < -0.5) {
      updateParticles('inv_batt', Math.abs(p_batt_kw), '#EF4444', true); // Xả
    } else {
      updateParticles('inv_batt', 0, '#10B981', false);
    }

    // Inverter -> House
    updateParticles('inv_house', p_load_kw, '#60A5FA', false);

    // Inverter -> Grid (Bán) OR Grid -> Inverter (Mua)
    if (p_buy_kw > 0.5) {
      updateParticles('inv_grid', p_buy_kw, '#C4B5FD', true); // Mua điện lưới
    } else if (p_sell_kw > 0.5) {
      updateParticles('inv_grid', p_sell_kw, '#FBBF24', false); // Bán điện dư
    } else {
      updateParticles('inv_grid', 0, '#8B5CF6', false);
    }
  }, [stepData]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '520px', borderRadius: '16px', overflow: 'hidden' }}>
      {/* 3D WebGL Canvas Container */}
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
          border: '1px solid rgba(255, 255, 255, 0.1)',
          zIndex: 20,
        }}
      >
        <button
          className="btn-ctrl"
          style={{ width: 'auto', padding: '0.25rem 0.6rem', fontSize: '0.75rem', borderRadius: '6px' }}
          onClick={() => setCameraPreset([18, 14, 18], [0, 2, 0])}
          title="Góc toàn cảnh Isometric"
        >
          <Camera size={14} style={{ marginRight: 4 }} />
          Toàn cảnh
        </button>
        <button
          className="btn-ctrl"
          style={{ width: 'auto', padding: '0.25rem 0.6rem', fontSize: '0.75rem', borderRadius: '6px' }}
          onClick={() => setCameraPreset([-6, 5, 8], [-8.5, 1.8, 3.5])}
          title="Cận cảnh Pin BESS"
        >
          <Battery size={14} color="#10B981" style={{ marginRight: 4 }} />
          Pin BESS
        </button>
        <button
          className="btn-ctrl"
          style={{ width: 'auto', padding: '0.25rem 0.6rem', fontSize: '0.75rem', borderRadius: '6px' }}
          onClick={() => setCameraPreset([2, 12, 8], [0, 6, 1.5])}
          title="Cận cảnh Mái Pin PV"
        >
          <Sun size={14} color="#F59E0B" style={{ marginRight: 4 }} />
          Mái PV
        </button>
        <button
          className="btn-ctrl"
          style={{ width: 'auto', padding: '0.25rem 0.6rem', fontSize: '0.75rem', borderRadius: '6px' }}
          onClick={() => setCameraPreset([0, 4, 11], [0, 2, 0])}
          title="Cận cảnh Nội thất Căn nhà"
        >
          <Home size={14} color="#3B82F6" style={{ marginRight: 4 }} />
          Nội thất
        </button>
        <button
          className="btn-ctrl"
          style={{ width: 'auto', padding: '0.25rem 0.6rem', fontSize: '0.75rem', borderRadius: '6px' }}
          onClick={() => setCameraPreset([0, 28, 0.1], [0, 0, 0])}
          title="Góc nhìn trên cao Top-Down"
        >
          <Eye size={14} style={{ marginRight: 4 }} />
          Top-down
        </button>
      </div>

      {/* Floating 3D Telemetry Badges in Screen Space */}
      {/* 1. Solar PV Badge */}
      {badges.pv.visible && (
        <div
          onClick={() => setCameraPreset([2, 12, 8], [0, 6, 1.5])}
          style={{
            position: 'absolute',
            left: `${badges.pv.x}px`,
            top: `${badges.pv.y}px`,
            transform: 'translate(-50%, -100%)',
            background: 'rgba(17, 24, 39, 0.88)',
            backdropFilter: 'blur(8px)',
            border: '1.5px solid #F59E0B',
            borderRadius: '8px',
            padding: '0.35rem 0.65rem',
            color: '#FFFFFF',
            cursor: 'pointer',
            boxShadow: '0 4px 14px rgba(245, 158, 11, 0.4)',
            transition: 'transform 0.1s ease',
            zIndex: 15,
            pointerEvents: 'auto',
          }}
        >
          <div style={{ fontSize: '0.65rem', fontWeight: 700, color: '#FBBF24' }}>☀️ SOLAR PV</div>
          <div style={{ fontSize: '0.85rem', fontWeight: 800, fontFamily: 'monospace' }}>
            {stepData?.p_pv_kw?.toFixed(1) || 0} kW
          </div>
        </div>
      )}

      {/* 2. Battery BESS Badge */}
      {badges.battery.visible && (
        <div
          onClick={() => setCameraPreset([-6, 5, 8], [-8.5, 1.8, 3.5])}
          style={{
            position: 'absolute',
            left: `${badges.battery.x}px`,
            top: `${badges.battery.y}px`,
            transform: 'translate(-50%, -100%)',
            background: 'rgba(17, 24, 39, 0.88)',
            backdropFilter: 'blur(8px)',
            border: `1.5px solid ${stepData?.p_batt_kw < -0.1 ? '#EF4444' : '#10B981'}`,
            borderRadius: '8px',
            padding: '0.35rem 0.65rem',
            color: '#FFFFFF',
            cursor: 'pointer',
            boxShadow: `0 4px 14px ${stepData?.p_batt_kw < -0.1 ? 'rgba(239, 68, 68, 0.4)' : 'rgba(16, 185, 129, 0.4)'}`,
            zIndex: 15,
            pointerEvents: 'auto',
          }}
        >
          <div style={{ fontSize: '0.65rem', fontWeight: 700, color: stepData?.p_batt_kw < -0.1 ? '#F87171' : '#34D399' }}>
            🔋 BESS (SoC: {stepData?.soc_pct?.toFixed(0) || 50}%)
          </div>
          <div style={{ fontSize: '0.85rem', fontWeight: 800, fontFamily: 'monospace' }}>
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
          onClick={() => setCameraPreset([0, 4, 11], [0, 2, 0])}
          style={{
            position: 'absolute',
            left: `${badges.house.x}px`,
            top: `${badges.house.y}px`,
            transform: 'translate(-50%, -100%)',
            background: 'rgba(17, 24, 39, 0.88)',
            backdropFilter: 'blur(8px)',
            border: '1.5px solid #3B82F6',
            borderRadius: '8px',
            padding: '0.35rem 0.65rem',
            color: '#FFFFFF',
            cursor: 'pointer',
            boxShadow: '0 4px 14px rgba(59, 130, 246, 0.4)',
            zIndex: 15,
            pointerEvents: 'auto',
          }}
        >
          <div style={{ fontSize: '0.65rem', fontWeight: 700, color: '#60A5FA' }}>🏠 PHỤ TẢI NHÀ</div>
          <div style={{ fontSize: '0.85rem', fontWeight: 800, fontFamily: 'monospace' }}>
            {stepData?.p_load_kw?.toFixed(1) || 0} kW
          </div>
        </div>
      )}

      {/* 4. EVN Grid Badge */}
      {badges.grid.visible && (
        <div
          onClick={() => setCameraPreset([8, 8, 4], [10.5, 4.0, -3.5])}
          style={{
            position: 'absolute',
            left: `${badges.grid.x}px`,
            top: `${badges.grid.y}px`,
            transform: 'translate(-50%, -100%)',
            background: 'rgba(17, 24, 39, 0.88)',
            backdropFilter: 'blur(8px)',
            border: '1.5px solid #8B5CF6',
            borderRadius: '8px',
            padding: '0.35rem 0.65rem',
            color: '#FFFFFF',
            cursor: 'pointer',
            boxShadow: '0 4px 14px rgba(139, 92, 246, 0.4)',
            zIndex: 15,
            pointerEvents: 'auto',
          }}
        >
          <div style={{ fontSize: '0.65rem', fontWeight: 700, color: '#C4B5FD' }}>⚡ LƯỚI EVN</div>
          <div style={{ fontSize: '0.85rem', fontWeight: 800, fontFamily: 'monospace' }}>
            {stepData?.p_buy_kw > 0
              ? `Mua: ${stepData?.p_buy_kw?.toFixed(1)} kW`
              : stepData?.p_sell_kw > 0
              ? `Bán: ${stepData?.p_sell_kw?.toFixed(1)} kW`
              : '0.0 kW (Cân bằng)'}
          </div>
        </div>
      )}

      {/* Bottom Hint */}
      <div
        style={{
          position: 'absolute',
          bottom: '0.75rem',
          left: '1rem',
          background: 'rgba(15, 23, 42, 0.75)',
          padding: '0.25rem 0.6rem',
          borderRadius: '6px',
          fontSize: '0.72rem',
          color: '#9CA3AF',
          pointerEvents: 'none',
          backdropFilter: 'blur(6px)',
        }}
      >
        💡 <i>Chuột trái: Xoay 360° | Cuộn chuột: Phóng to/nhỏ | Chuột phải: Dịch chuyển | Click nhãn để zoom lại gần</i>
      </div>
    </div>
  );
}
