import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { 
  Camera, Eye, Compass, Sun, Battery, Building2, Zap, 
  Layers, MapPin, Maximize2, ExternalLink, Info, CheckSquare, Square
} from 'lucide-react';
import logoSrc from '../assets/logo-tlu.jpg';

export default function CampusThuyLoi3D({
  stepData,
  currentStep = 0,
  totalSteps = 96,
  onFocusComponent
}) {
  const mountRef = useRef(null);
  const miniRef = useRef(null);
  const infoRef = useRef(null);

  // States for UI overlays
  const [viewMode, setViewMode] = useState('orbit'); // 'orbit' | 'sat' | 'walk'
  const [showLabels, setShowLabels] = useState(true);
  const [showShadows, setShowShadows] = useState(true);
  const [showPeople, setShowPeople] = useState(true);
  const [stadiumLights, setStadiumLights] = useState(true);
  const [forceStadiumLights, setForceStadiumLights] = useState(false);
  const [selectedBuilding, setSelectedBuilding] = useState(null);

  const stadiumLightsRef = useRef(true);
  const forceStadiumLightsRef = useRef(false);

  // References to communicate with Three.js animation loop without re-triggering effects
  const stepDataRef = useRef(stepData);
  useEffect(() => {
    stepDataRef.current = stepData;
  }, [stepData]);

  const sceneActionsRef = useRef({
    setMode: null,
    flyTo: null,
    setLabels: null,
    setShadows: null,
    setPeople: null,
    setStadiumLights: null,
    toggleForceStadiumLights: null,
  });

  useEffect(() => {
    const container = mountRef.current;
    const miniCanvas = miniRef.current;
    if (!container || !miniCanvas) return;

    let destroyed = false;
    let animId = null;

    // Dimensions
    const MW = 750, MH = 320, S = 0.4;
    const WX = (mx) => (mx - MW / 2) * S;
    const WZ = (my) => (my - MH / 2) * S;

    // PRNG
    let _s = 20251111;
    const rnd = () => {
      _s |= 0;
      _s = (_s + 0x6D2B79F5) | 0;
      let t = Math.imul(_s ^ (_s >>> 15), 1 | _s);
      t = t + Math.imul(t ^ (t >>> 7), 61 | t) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const rr = (a, b) => a + rnd() * (b - a);
    const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
    const sstep = (a, b, x) => {
      const t = clamp((x - a) / (b - a), 0, 1);
      return t * t * (3 - 2 * t);
    };

    // 1. Scene, Camera, Renderer
    const width = container.clientWidth || 800;
    const height = container.clientHeight || 600;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0e1714);
    scene.fog = new THREE.FogExp2(0x0e1714, 0.0016);

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.5, 3600);
    camera.position.set(-146, 30, -3);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    if (THREE.SRGBColorSpace) {
      renderer.outputColorSpace = THREE.SRGBColorSpace;
    }
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.minDistance = 6;
    controls.maxDistance = 650;
    controls.maxPolarAngle = Math.PI / 2.02;
    controls.target.set(-66, 9, -3);
    controls.update();

    const maxAniso = renderer.capabilities.getMaxAnisotropy();

    // 2. Sky Shader & Stars
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        top: { value: new THREE.Color(0x3f8fe0) },
        bot: { value: new THREE.Color(0xcfe7f7) }
      },
      vertexShader: `
        varying vec3 vP;
        void main() {
          vP = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 top;
        uniform vec3 bot;
        varying vec3 vP;
        void main() {
          float h = clamp(vP.y, 0.0, 1.0);
          gl_FragColor = vec4(mix(bot, top, pow(h, 0.5)), 1.0);
        }
      `
    });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(2000, 32, 16), skyMat);
    sky.renderOrder = -10;
    scene.add(sky);

    const starGeo = new THREE.BufferGeometry();
    const starPos = [];
    for (let i = 0; i < 700; i++) {
      const a = rnd() * 6.283, e = Math.acos(rnd() * 0.95 + 0.05);
      starPos.push(Math.sin(e) * Math.cos(a) * 1800, Math.cos(e) * 1800, Math.sin(e) * Math.sin(a) * 1800);
    }
    starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3));
    const starMat = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 2.2,
      sizeAttenuation: false,
      transparent: true,
      opacity: 0,
      fog: false,
      depthWrite: false
    });
    const stars = new THREE.Points(starGeo, starMat);
    scene.add(stars);

    // 3. Lighting
    const hemi = new THREE.HemisphereLight(0xbfdcff, 0x6b7a5a, 0.7);
    scene.add(hemi);

    const sun = new THREE.DirectionalLight(0xfff3e0, 2.2);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -175, right: 175, top: 115, bottom: -115, near: 10, far: 800 });
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.35;
    scene.add(sun, sun.target);

    const moon = new THREE.DirectionalLight(0x7f9cff, 0);
    moon.position.set(-120, 200, -90);
    scene.add(moon);

    // 4. Ground Texture & Mesh
    function groundTexture() {
      const k = 4, c = document.createElement('canvas');
      c.width = MW * k; c.height = MH * k;
      const g = c.getContext('2d');
      const R = (x, y, w, h, col) => { g.fillStyle = col; g.fillRect(x * k, y * k, w * k, h * k); };
      const E = (cx, cy, rx, ry, col) => {
        g.fillStyle = col; g.beginPath(); g.ellipse(cx * k, cy * k, rx * k, ry * k, 0, 0, 6.2832); g.fill();
      };
      const Ln = (x1, y1, x2, y2, col, w) => {
        g.strokeStyle = col; g.lineWidth = w * k; g.beginPath(); g.moveTo(x1 * k, y1 * k); g.lineTo(x2 * k, y2 * k); g.stroke();
      };
      const grass = (x, y, w, h) => {
        R(x, y, w, h, '#5d8c44');
        for (let i = 0; i < w * h * 0.9; i++) {
          g.fillStyle = ['#6c9f4e', '#4d7a39', '#76a856', '#557f3e'][i & 3];
          g.globalAlpha = 0.55;
          g.fillRect((x + rnd() * w) * k, (y + rnd() * h) * k, k * 1.6, k * 1.6);
        }
        g.globalAlpha = 1;
      };

      R(0, 0, MW, MH, '#aaa79d');
      for (let i = 0; i < 42000; i++) {
        g.fillStyle = rnd() < 0.5 ? 'rgba(255,255,255,.08)' : 'rgba(0,0,0,.08)';
        g.fillRect(rnd() * c.width, rnd() * c.height, 3, 3);
      }
      R(0, 0, 40, MH, '#b9b6ad'); R(36, 0, 4, MH, '#8c8a82'); // Vỉa hè trước cổng

      // Sân bóng + đường chạy
      R(532, 56, 218, 110, '#b4593a'); grass(540, 64, 202, 94);
      for (let i = 0; i < 18; i++) if (i % 2) R(540 + i * 202 / 18, 64, 202 / 18, 94, 'rgba(0,0,0,.10)');
      g.strokeStyle = '#fff'; g.lineWidth = 1.1 * k; g.strokeRect(548 * k, 70 * k, 186 * k, 82 * k);
      Ln(641, 70, 641, 152, '#fff', 1.1);
      g.beginPath(); g.arc(641 * k, 111 * k, 10 * k, 0, 6.2832); g.stroke();
      g.strokeRect(548 * k, 89 * k, 22 * k, 44 * k); g.strokeRect(712 * k, 89 * k, 22 * k, 44 * k);
      g.strokeRect(548 * k, 100 * k, 8 * k, 22 * k); g.strokeRect(726 * k, 100 * k, 8 * k, 22 * k);

      // Sân trước A1
      grass(110, 62, 75, 173); E(140, 133, 26, 26, '#c9c5b8'); E(140, 133, 21, 21, '#5d8c44'); E(140, 133, 13, 13, '#c9c5b8');
      Ln(140, 62, 140, 235, '#c9c5b8', 5); Ln(110, 133, 185, 133, '#c9c5b8', 6); R(181, 126, 50, 14, '#bdb9ab');

      // Sân giữa có vòng xoay
      grass(235, 95, 140, 140); E(305, 165, 40, 40, '#c9c5b8'); E(305, 165, 30, 30, '#5d8c44'); E(305, 165, 16, 16, '#c9c5b8');
      Ln(235, 165, 375, 165, '#c9c5b8', 5); Ln(305, 95, 305, 235, '#c9c5b8', 5);

      // Đường đi bộ & trục chính
      R(108, 208, 427, 12, '#c9c5b8'); R(185, 206, 310, 20, '#c9c5b8'); R(108, 210, 367, 8, '#47494d');
      for (let x = 112; x < 470; x += 12) R(x, 213.6, 6, 0.8, '#e8e8e0');
      R(225, 129, 211, 8, '#c9c5b8'); R(436, 42, 48, 100, '#c9c5b8'); R(440, 46, 40, 92, '#6aa04c'); R(436, 129, 48, 8, '#c9c5b8');

      // Vườn hoa
      grass(45, 8, 30, 292); R(40, 147, 72, 12, '#c9c5b8'); R(40, 148.5, 72, 9, '#bdb9ab');
      for (let i = 0; i < 560; i++) {
        g.fillStyle = ['#e8527a', '#f2c94c', '#f7f7f7', '#c04bd6'][i & 3];
        const fy = rr(9, 299);
        if (fy > 145 && fy < 160) continue;
        g.beginPath(); g.arc(rr(46, 74) * k, fy * k, 1.3 * k, 0, 6.2832); g.fill();
      }

      // Bãi xe + sân bóng rổ, chuyền, bơi
      R(236, 226, 66, 22, '#3f4246'); for (let i = 0; i < 9; i++) R(238 + i * 7.2, 228, 0.7, 17, '#e8e8e8');
      R(358, 226, 40, 22, '#3f7fb0'); g.strokeStyle = '#fff'; g.lineWidth = 0.8 * k; g.strokeRect(361 * k, 229 * k, 34 * k, 16 * k); Ln(378, 229, 378, 245, '#fff', 0.8);
      R(402, 226, 90, 22, '#2f8a55'); g.strokeRect(406 * k, 229 * k, 82 * k, 16 * k); Ln(447, 229, 447, 245, '#fff', 0.8); g.beginPath(); g.arc(447 * k, 237 * k, 5 * k, 0, 6.2832); g.stroke();
      R(588, 224, 54, 34, '#cfd3d0'); R(592, 228, 46, 26, '#3aa6d8'); for (let i = 1; i < 5; i++) Ln(592 + i * 9.2, 228, 592 + i * 9.2, 254, 'rgba(255,255,255,.7)', 0.5);
      R(666, 262, 84, 26, '#9a978d');

      const t = new THREE.CanvasTexture(c);
      if (THREE.SRGBColorSpace) t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = maxAniso;
      return t;
    }

    const ground = new THREE.Mesh(new THREE.PlaneGeometry(MW * S, MH * S), new THREE.MeshStandardMaterial({ map: groundTexture(), roughness: 1 }));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    const outer = new THREE.Mesh(new THREE.PlaneGeometry(3600, 2400), new THREE.MeshStandardMaterial({ color: 0x7d8e5f, roughness: 1 }));
    outer.rotation.x = -Math.PI / 2;
    outer.position.y = -0.1;
    outer.receiveShadow = true;
    scene.add(outer);

    // 5. Surrounding external roads
    function roadTex() {
      const c = document.createElement('canvas'); c.width = 64; c.height = 128;
      const g = c.getContext('2d');
      g.fillStyle = '#45484c'; g.fillRect(0, 0, 64, 128);
      for (let i = 0; i < 300; i++) {
        g.fillStyle = rnd() < 0.5 ? 'rgba(255,255,255,.05)' : 'rgba(0,0,0,.08)';
        g.fillRect(rnd() * 64, rnd() * 128, 2, 2);
      }
      g.fillStyle = '#d8d8d0'; g.fillRect(3, 0, 2, 128); g.fillRect(59, 0, 2, 128);
      g.fillStyle = '#e8c84a'; g.fillRect(31, 10, 2, 50);
      const t = new THREE.CanvasTexture(c);
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      if (THREE.SRGBColorSpace) t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = maxAniso;
      return t;
    }

    const roadDefs = [
      [-158, 0, 2400, 13, 1], [158, 0, 2400, 13, 1], [-340, 0, 2400, 12, 1], [340, 0, 2400, 12, 1],
      [0, -72, 3000, 13, 0], [0, 72, 3000, 13, 0], [0, -230, 3000, 12, 0], [0, 230, 3000, 12, 0]
    ];
    roadDefs.forEach(([x, z, len, w, v], i) => {
      const t = roadTex();
      t.repeat.set(1, len / 36);
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(w, len),
        new THREE.MeshStandardMaterial({ map: t, roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -1 - i * 0.1, polygonOffsetUnits: -1 })
      );
      m.rotation.x = -Math.PI / 2;
      if (!v) m.rotation.z = Math.PI / 2;
      m.position.set(x, -0.03, z);
      m.receiveShadow = true;
      scene.add(m);
    });

    // 6. Buildings Generator & Array B
    const facCache = {}, windowMats = [];
    const hexStr = (h) => '#' + h.toString(16).padStart(6, '0');
    function facade(len, floors, hex) {
      const cols = Math.max(1, Math.round(len / 3.4)), key = cols + '_' + floors + '_' + hex;
      if (facCache[key]) return facCache[key];
      const cw = 40, ch = 46, c = document.createElement('canvas'); c.width = cols * cw; c.height = floors * ch;
      const e = document.createElement('canvas'); e.width = c.width; e.height = c.height;
      const g = c.getContext('2d'), ge = e.getContext('2d');
      g.fillStyle = hexStr(hex); g.fillRect(0, 0, c.width, c.height);
      for (let i = 0; i < 1400; i++) {
        g.fillStyle = rnd() < 0.5 ? 'rgba(255,255,255,.05)' : 'rgba(0,0,0,.06)';
        g.fillRect(rnd() * c.width, rnd() * c.height, 2, 2);
      }
      ge.fillStyle = '#000'; ge.fillRect(0, 0, e.width, e.height);
      for (let r = 0; r < floors; r++) for (let i = 0; i < cols; i++) {
        const x = i * cw, y = r * ch;
        g.fillStyle = 'rgba(255,255,255,.22)'; g.fillRect(x, y + ch - 4, cw, 3);
        g.fillStyle = '#f1efe8'; g.fillRect(x + 7, y + 8, cw - 14, ch - 20);
        g.fillStyle = '#34526b'; g.fillRect(x + 10, y + 11, cw - 20, ch - 26);
        g.fillStyle = 'rgba(255,255,255,.18)'; g.fillRect(x + 10, y + 11, cw - 20, 5);
        g.fillStyle = '#f1efe8'; g.fillRect(x + cw / 2 - 1, y + 11, 2, ch - 26);
        if (rnd() < 0.55) {
          ge.fillStyle = rnd() < 0.8 ? '#ffd58a' : '#cfe6ff';
          ge.fillRect(x + 10, y + 11, cw - 20, ch - 26);
        }
      }
      const t = new THREE.CanvasTexture(c), te = new THREE.CanvasTexture(e);
      if (THREE.SRGBColorSpace) {
        t.colorSpace = te.colorSpace = THREE.SRGBColorSpace;
      }
      t.anisotropy = te.anisotropy = maxAniso;
      const m = new THREE.MeshStandardMaterial({ map: t, emissiveMap: te, emissive: 0xffffff, emissiveIntensity: 0, roughness: 0.85 });
      windowMats.push(m);
      return (facCache[key] = m);
    }

    const shade = (hex, f) => new THREE.Color(hex).multiplyScalar(f).getHex();
    const B = [
      { id: 'A1', n: 'Tòa A1', x: 187, y: 58, w: 38, h: 68, f: 5, c: 0xd9482c },
      { id: 'A1L', n: 'Tòa A1', x: 187, y: 126, w: 38, h: 14, f: 5, c: 0xd9482c, h0: 5, noCol: 1, noLabel: 1 },
      { id: 'A1b', n: 'Tòa A1', x: 187, y: 140, w: 38, h: 68, f: 5, c: 0xd9482c, noLabel: 1 },
      { id: 'A1c', n: 'Tòa A1 (sảnh chính)', x: 181, y: 115, w: 50, h: 11, f: 6, c: 0xd9482c, noLabel: 1, pick: 'Tòa A1' },
      { id: 'A1cL', n: 'Tòa A1 (sảnh chính)', x: 181, y: 126, w: 50, h: 14, f: 6, c: 0xd9482c, h0: 5, noCol: 1, noLabel: 1, pick: 'Tòa A1' },
      { id: 'A1cb', n: 'Tòa A1 (sảnh chính)', x: 181, y: 140, w: 50, h: 11, f: 6, c: 0xd9482c, noLabel: 1, pick: 'Tòa A1' },
      { id: 'A4', n: 'Tòa A4', x: 150, y: 6, w: 38, h: 54, f: 4, c: 0xc9774f },
      { id: 'P7', n: 'P7', x: 198, y: 18, w: 14, h: 34, f: 2, c: 0xb98a62, noLabel: 1 },
      { id: 'T45', n: 'Nhà T45', x: 236, y: 12, w: 94, h: 56, f: 5, c: 0x9a7bb0 },
      { id: 'TV', n: 'Thư viện', x: 330, y: 12, w: 100, h: 56, f: 5, c: 0xc23a32 },
      { id: 'K1E', n: 'Tòa K1 (Khoa CNTT - SEMS)', x: 484, y: 12, w: 22, h: 160, f: 11, c: 0xe3c04a },
      { id: 'K1N', n: 'Tòa K1', x: 436, y: 12, w: 48, h: 30, f: 11, c: 0xe3c04a, noLabel: 1 },
      { id: 'K1S', n: 'Tòa K1', x: 436, y: 142, w: 48, h: 30, f: 11, c: 0xe3c04a, noLabel: 1 },
      { id: 'CT', n: 'Căng tin', x: 436, y: 172, w: 64, h: 16, f: 1, c: 0xeeeeee },
      { id: 'C1', n: 'Tòa C1', x: 390, y: 162, w: 40, h: 44, f: 4, c: 0xc9774f },
      { id: 'A2', n: 'Tòa A2', x: 148, y: 222, w: 79, h: 34, f: 4, c: 0xc9774f },
      { id: 'LK1', n: 'Nhà nối A1–A2', x: 185, y: 208, w: 42, h: 2, f: 4, c: 0xc9774f },
      { id: 'LK2', n: 'Nhà nối A1–A2', x: 185, y: 219, w: 42, h: 3, f: 4, c: 0xc9774f, noLabel: 1 },
      { id: 'LK3', n: 'Nhà nối A1–A2', x: 185, y: 210, w: 42, h: 9, f: 4, c: 0xc9774f, h0: 4.2, noCol: 1, noLabel: 1 },
      { id: 'A3', n: 'Tòa A3', x: 148, y: 256, w: 68, h: 54, f: 4, c: 0xc9774f },
      { id: 'T35', n: 'Nhà T35', x: 165, y: 226, w: 30, h: 14, f: 2, c: 0xd98cb4, noLabel: 1 },
      { id: 'B1', n: 'Tòa B1', x: 196, y: 266, w: 30, h: 26, f: 3, c: 0xb98a62 },
      { id: 'B5', n: 'Tòa B5', x: 236, y: 272, w: 70, h: 28, f: 3, c: 0xb98a62 },
      { id: 'B4', n: 'Nhà B4', x: 236, y: 250, w: 60, h: 12, f: 1, c: 0xb98a62, noLabel: 1 },
      { id: 'A5', n: 'Tòa A5', x: 306, y: 250, w: 50, h: 66, f: 4, c: 0xc9774f },
      { id: 'K4', n: 'KTX Nhà 4', x: 360, y: 248, w: 136, h: 14, f: 5, c: 0xe3c04a },
      { id: 'K3', n: 'KTX Nhà 3', x: 360, y: 270, w: 136, h: 14, f: 5, c: 0xe3c04a },
      { id: 'K2', n: 'KTX Nhà 2', x: 360, y: 292, w: 136, h: 14, f: 5, c: 0xe3c04a },
      { id: 'C5', n: 'Tòa C5', x: 540, y: 226, w: 48, h: 30, f: 3, c: 0xc9774f },
      { id: 'TY', n: 'Trạm y tế', x: 78, y: 6, w: 24, h: 58, f: 2, c: 0xd04a3c },
      { id: 'GD', n: 'Nhà GD Thể chất', x: 666, y: 224, w: 80, h: 40, f: 2, c: 0x9a9a38 },
      { id: 'GX1', n: 'Nhà gửi xe', x: 78, y: 232, w: 25, h: 70, f: 1, c: 0x6a8fc0, shed: 1 },
      { id: 'GX1b', n: 'Nhà gửi xe', x: 108, y: 222, w: 27, h: 78, f: 1, c: 0x6a8fc0, shed: 1, noLabel: 1 },
      { id: 'GX2', n: 'Nhà gửi xe', x: 508, y: 236, w: 14, h: 30, f: 1, c: 0x6a8fc0, shed: 1, noLabel: 1 },
      { id: 'HS', n: 'Hiệu sách', x: 78, y: 195, w: 26, h: 26, f: 1, c: 0xe6d9a8, noLabel: 1 }
    ];

    const colliders = [], pickables = [], labelDefs = [];
    const hFloor = 3.6;

    function addBuilding(b) {
      const w = b.w * S, d = b.h * S, hTop = b.shed ? 3.2 : b.f * hFloor, h0 = b.h0 || 0, h = hTop - h0;
      const rows = Math.max(1, Math.round(h / hFloor));
      const cx = WX(b.x + b.w / 2), cz = WZ(b.y + b.h / 2);
      const mx = facade(d, rows, b.c), mz = facade(w, rows, b.c);
      const top = new THREE.MeshStandardMaterial({ color: shade(b.c, 0.62), roughness: 0.9 });
      let mats = [mx, mx, top, top, mz, mz];
      if (b.shed) {
        mats = [0, 1, 2, 3, 4, 5].map((i) => new THREE.MeshStandardMaterial({ color: i === 2 ? 0x8aa6c8 : 0x6a8fc0, roughness: 0.8 }));
      }
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mats);
      m.position.set(cx, h0 + h / 2, cz);
      m.castShadow = true;
      m.receiveShadow = true;
      m.userData = { name: b.pick || b.n, floors: b.f, height: hTop, shed: !!b.shed };
      scene.add(m);
      pickables.push(m);

      const par = new THREE.Mesh(new THREE.BoxGeometry(w + 0.5, 0.55, d + 0.5), new THREE.MeshStandardMaterial({ color: shade(b.c, 0.5), roughness: 0.9 }));
      par.position.set(cx, hTop + 0.27, cz);
      par.castShadow = true;
      scene.add(par);

      if (b.f >= 3) {
        const n = 1 + Math.floor(rnd() * 3);
        for (let i = 0; i < n; i++) {
          const s = rr(1.4, 3), hh = rr(0.9, 1.8);
          const r = new THREE.Mesh(new THREE.BoxGeometry(s, hh, s * rr(0.8, 1.4)), new THREE.MeshStandardMaterial({ color: 0x8d9297, roughness: 0.9 }));
          r.position.set(cx + rr(-w / 2 + 2, w / 2 - 2), hTop + 0.55 + hh / 2, cz + rr(-d / 2 + 2, d / 2 - 2));
          r.castShadow = true;
          if (!/^K1/.test(b.id) && !b.noCol) scene.add(r);
        }
      }
      if (!b.noCol) colliders.push({ a: cx - w / 2, b: cx + w / 2, c: cz - d / 2, d: cz + d / 2 });
      if (!b.noLabel) labelDefs.push({ t: b.n, x: cx, y: hTop + (b.f >= 3 ? 4.5 : 3), z: cz });
    }
    B.forEach(addBuilding);

    // 7. Porch & 65-year anniversary medallion at A1
    {
      const cx = WX(178), cz = WZ(133);
      const porch = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.4, 10), new THREE.MeshStandardMaterial({ color: 0xf1eee4, roughness: 0.8 }));
      porch.position.set(cx, 4.4, cz);
      porch.castShadow = true;
      scene.add(porch);
      for (let i = 0; i < 4; i++) {
        const p = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 4.2, 10), new THREE.MeshStandardMaterial({ color: 0xf6f3ea }));
        p.position.set(cx - 1.9, 2.1, cz - 4 + i * 2.66);
        p.castShadow = true;
        scene.add(p);
      }
      const c = document.createElement('canvas'); c.width = c.height = 128;
      const g = c.getContext('2d');
      g.fillStyle = '#f2c230'; g.beginPath(); g.arc(64, 64, 58, 0, 6.2832); g.fill();
      g.fillStyle = '#b8221a'; g.beginPath(); g.arc(64, 64, 44, 0, 6.2832); g.fill();
      g.fillStyle = '#fff'; g.font = '700 54px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('65', 64, 68);
      const t = new THREE.CanvasTexture(c);
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthWrite: false }));
      sp.scale.set(4.2, 4.2, 1);
      sp.position.set(WX(206), 6 * hFloor + 3.4, cz);
      scene.add(sp);
    }

    // 8. Roundabouts, Stone Plinth, Flags
    {
      const x = WX(140), z = WZ(133);
      const hedge = new THREE.Mesh(new THREE.CylinderGeometry(5, 5.2, 1.2, 28), new THREE.MeshStandardMaterial({ color: 0x2f6d33, roughness: 1 }));
      hedge.position.set(x, 0.6, z);
      hedge.castShadow = true; hedge.receiveShadow = true;
      scene.add(hedge);

      const ring = new THREE.Mesh(new THREE.TorusGeometry(5.6, 0.35, 8, 40), new THREE.MeshStandardMaterial({ color: 0xcfcabb }));
      ring.rotation.x = Math.PI / 2; ring.position.set(x, 0.3, z);
      scene.add(ring);

      const c = document.createElement('canvas'); c.width = 1024; c.height = 256;
      const g = c.getContext('2d');
      g.fillStyle = '#8b8e92'; g.fillRect(0, 0, 1024, 256);
      for (let q = 0; q < 9000; q++) {
        g.fillStyle = ['rgba(255,255,255,.10)', 'rgba(0,0,0,.12)', 'rgba(60,60,70,.10)'][q % 3];
        g.fillRect(rnd() * 1024, rnd() * 256, 2 + rnd() * 2, 2 + rnd() * 2);
      }
      g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 5; g.strokeRect(8, 8, 1008, 240);
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.font = '700 92px sans-serif';
      g.fillStyle = 'rgba(255,255,255,.45)'; g.fillText('ĐẠI HỌC THỦY LỢI', 514, 114);
      g.fillStyle = '#262a31'; g.fillText('ĐẠI HỌC THỦY LỢI', 512, 112);
      g.font = '600 40px sans-serif';
      g.fillStyle = 'rgba(255,255,255,.4)'; g.fillText('THUYLOI UNIVERSITY', 514, 198);
      g.fillStyle = '#2f343c'; g.fillText('THUYLOI UNIVERSITY', 512, 196);

      const t = new THREE.CanvasTexture(c);
      const stoneMat = new THREE.MeshStandardMaterial({ color: 0x8b8e92, roughness: 0.92 });
      const plinth = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.4, 7.4), new THREE.MeshStandardMaterial({ color: 0x6f7276, roughness: 0.95 }));
      plinth.position.set(x, 1.4, z); plinth.castShadow = true; plinth.receiveShadow = true;
      scene.add(plinth);

      const sign = new THREE.Mesh(new THREE.BoxGeometry(1.1, 2.2, 6.6), [0, 1, 2, 3, 4, 5].map((i) => (i === 0 || i === 1 ? new THREE.MeshStandardMaterial({ map: t, roughness: 0.85 }) : stoneMat)));
      sign.position.set(x, 2.7, z); sign.castShadow = true; sign.receiveShadow = true;
      scene.add(sign);

      const flagCols = [0xd5251d, 0xd5251d, 0x2f7fd0];
      flagCols.forEach((col, i) => {
        const fx = x + 9.5, fz = z - 4.8 + i * 4.8;
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 9, 8), new THREE.MeshStandardMaterial({ color: 0xdddddd, metalness: 0.6, roughness: 0.4 }));
        pole.position.set(fx, 4.5, fz); pole.castShadow = true; scene.add(pole);
        const fl = new THREE.Mesh(new THREE.PlaneGeometry(3, 2), new THREE.MeshStandardMaterial({ color: col, side: THREE.DoubleSide, roughness: 0.8 }));
        fl.position.set(fx, 7.9, fz + 1.5); fl.rotation.y = Math.PI / 2; scene.add(fl);
        if (i === 0) {
          const star = new THREE.Mesh(new THREE.CircleGeometry(0.5, 5), new THREE.MeshBasicMaterial({ color: 0xffe14a, side: THREE.DoubleSide }));
          star.position.set(fx + 0.02, 7.9, fz + 1.5); star.rotation.y = Math.PI / 2; scene.add(star);
        }
      });
      colliders.push({ a: x - 5.5, b: x + 5.5, c: z - 5.5, d: z + 5.5 });
    }

    {
      const x = WX(305), z = WZ(165);
      const hedge = new THREE.Mesh(new THREE.CylinderGeometry(5, 5.2, 1.2, 28), new THREE.MeshStandardMaterial({ color: 0x2f6d33, roughness: 1 }));
      hedge.position.set(x, 0.6, z); hedge.castShadow = true; hedge.receiveShadow = true;
      scene.add(hedge);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(5.6, 0.35, 8, 40), new THREE.MeshStandardMaterial({ color: 0xcfcabb }));
      ring.rotation.x = Math.PI / 2; ring.position.set(x, 0.3, z);
      scene.add(ring);
      colliders.push({ a: x - 5.5, b: x + 5.5, c: z - 5.5, d: z + 5.5 });
    }

    // 9. Fence, Gates, Entrance Beam with TLU Logo
    {
      const mat = new THREE.MeshStandardMaterial({ color: 0xb9b5aa, roughness: 0.9 });
      const wall = (x1, z1, x2, z2) => {
        const L = Math.hypot(x2 - x1, z2 - z1);
        const m = new THREE.Mesh(new THREE.BoxGeometry(L, 1.8, 0.4), mat);
        m.position.set((x1 + x2) / 2, 0.9, (z1 + z2) / 2);
        m.rotation.y = -Math.atan2(z2 - z1, x2 - x1);
        m.castShadow = true; m.receiveShadow = true;
        scene.add(m);
        colliders.push({ a: Math.min(x1, x2) - 0.25, b: Math.max(x1, x2) + 0.25, c: Math.min(z1, z2) - 0.25, d: Math.max(z1, z2) + 0.25 });
      };
      const L = WX(40), Rr = WX(MW), T = WZ(0), Bt = WZ(MH - 2);
      wall(L, T, Rr, T); wall(L, Bt, Rr, Bt); wall(Rr, T, Rr, Bt);
      wall(L, T, L, WZ(135)); wall(L, WZ(170), L, Bt);

      const pm = new THREE.MeshStandardMaterial({ color: 0xece8dc, roughness: 0.8 });
      const post = (x, z, hh = 5.6) => {
        const p = new THREE.Mesh(new THREE.BoxGeometry(1.4, hh, 1.4), pm);
        p.position.set(x, hh / 2, z); p.castShadow = true; scene.add(p);
      };
      post(L, WZ(135), 7.2); post(L, WZ(170), 7.2);

      const sl = WZ(170) - WZ(135) + 1.4, bh = 3.6;
      const gc = document.createElement('canvas'); gc.width = 1400; gc.height = Math.round(1400 * bh / sl);
      const gg = gc.getContext('2d');
      gg.fillStyle = '#ffffff'; gg.fillRect(0, 0, gc.width, gc.height);
      gg.strokeStyle = '#1d4f9c'; gg.lineWidth = 10; gg.strokeRect(5, 5, gc.width - 10, gc.height - 10);

      const logoImg = new Image();
      logoImg.src = logoSrc;
      logoImg.onload = () => {
        if (!destroyed) {
          const pad = gc.height * 0.1, hh = gc.height - pad * 2, ww = hh * logoImg.naturalWidth / logoImg.naturalHeight;
          gg.drawImage(logoImg, (gc.width - ww) / 2, pad, ww, hh);
          gt.needsUpdate = true;
        }
      };
      const gt = new THREE.CanvasTexture(gc);
      const beam = new THREE.Mesh(
        new THREE.BoxGeometry(1.2, bh, sl),
        [0, 1, 2, 3, 4, 5].map((i) => (i < 2 ? new THREE.MeshStandardMaterial({ map: gt, roughness: 0.6 }) : new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.6 })))
      );
      beam.position.set(L, 5.4, (WZ(135) + WZ(170)) / 2);
      beam.castShadow = true;
      scene.add(beam);

      // Cổng sau trường
      const gx = WX(480), gz1 = WZ(207), gz2 = WZ(221);
      post(gx, gz1); post(gx, gz2);
      const gm = new THREE.MeshStandardMaterial({ color: 0x2c3b52, roughness: 0.6 });
      const b2 = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.1, gz2 - gz1 + 1.4), gm);
      b2.position.set(gx, 5.3, (gz1 + gz2) / 2);
      scene.add(b2);
      colliders.push({ a: gx - 0.8, b: gx + 0.8, c: gz1 - 0.8, d: gz1 + 0.8 }, { a: gx - 0.8, b: gx + 0.8, c: gz2 - 0.8, d: gz2 + 0.8 });

      labelDefs.push(
        { t: 'Cổng trước', x: L - 2, y: 8, z: (WZ(135) + WZ(170)) / 2 },
        { t: 'Cổng sau', x: gx, y: 8.5, z: (gz1 + gz2) / 2 },
        { t: 'Sân bóng', x: WX(641), y: 6, z: WZ(111) },
        { t: 'Bể bơi', x: WX(615), y: 5, z: WZ(241) },
        { t: 'Bãi đỗ xe', x: WX(269), y: 5, z: WZ(237) },
        { t: 'Sân bóng chuyền', x: WX(378), y: 5, z: WZ(237) },
        { t: 'Sân bóng rổ', x: WX(447), y: 5, z: WZ(237) },
        { t: 'Vườn hoa', x: WX(60), y: 5, z: WZ(54) },
        { t: 'Vòng xoay A1', x: WX(140), y: 10, z: WZ(133) },
        { t: 'Sân giữa', x: WX(305), y: 8, z: WZ(165) }
      );
    }

    // 10. Labels Group (Billboard text)
    const labelGroup = new THREE.Group();
    scene.add(labelGroup);
    function makeLabel(text) {
      const c = document.createElement('canvas'), g = c.getContext('2d');
      g.font = '600 36px sans-serif';
      const tw = Math.ceil(g.measureText(text).width);
      c.width = tw + 44; c.height = 70;
      g.font = '600 36px sans-serif';
      g.fillStyle = 'rgba(9,17,14,.76)';
      g.beginPath();
      if (g.roundRect) g.roundRect(0, 0, c.width, c.height, 16); else g.rect(0, 0, c.width, c.height);
      g.fill();
      g.fillStyle = '#fff'; g.textBaseline = 'middle';
      g.fillText(text, 22, 37);
      const t = new THREE.CanvasTexture(c);
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, depthWrite: false, fog: false, transparent: true }));
      const hh = 3.1; s.scale.set(hh * c.width / c.height, hh, 1);
      s.renderOrder = 20;
      return s;
    }
    labelDefs.forEach((l) => {
      const s = makeLabel(l.t);
      s.position.set(l.x, l.y, l.z);
      labelGroup.add(s);
    });

    // 11. Campus Vegetation (Trees, Flowers)
    const blockRects = B.map((b) => [b.x - 4, b.y - 4, b.w + 8, b.h + 8]).concat([
      [528, 50, 222, 124], [584, 220, 62, 42], [232, 222, 70, 28], [302, 222, 142, 28], [60, 226, 66, 80], [0, 128, 60, 48]
    ]);
    const blockCircles = [[305, 165, 46], [140, 133, 32]];
    const treeOK = (mx, my) => {
      for (const r of blockRects) if (mx > r[0] && mx < r[0] + r[2] && my > r[1] && my < r[1] + r[3]) return false;
      for (const c of blockCircles) if (Math.hypot(mx - c[0], (my - c[1]) * (c[2] === 40 ? 0.6 : 1)) < c[2]) return false;
      if (my > 148 && my < 182 && mx > 230 && mx < 380) return false;
      if (my > 122 && my < 144 && mx < 190) return false;
      if (my > 198 && my < 226 && mx > 100 && mx < 548) return false;
      if (my > 124 && my < 142 && mx > 228 && mx < 440) return false;
      if (mx > 434 && mx < 488 && my > 40 && my < 144) return false;
      if (mx < 115 && my > 143 && my < 163) return false;
      if (mx > 134 && mx < 146 && my > 60 && my < 236) return false;
      return true;
    };

    const MAXT = 1200;
    const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.22, 0.32, 1, 6), new THREE.MeshStandardMaterial({ color: 0x5a4330, roughness: 1 }), MAXT);
    const crowns = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, flatShading: true }), MAXT);
    trunks.castShadow = crowns.castShadow = true; crowns.receiveShadow = true;
    let ti = 0; const dum = new THREE.Object3D(), col = new THREE.Color();
    const greens = [0x3f7a3a, 0x4f8a3f, 0x2f6a34, 0x5b9442, 0x6a9e49, 0x356f3b];

    function plantTree(mx, my, scale = 1) {
      if (ti >= MAXT) return;
      const th = rr(2, 3.6) * scale, cr = rr(1.7, 3.1) * scale;
      dum.position.set(WX(mx), th / 2, WZ(my)); dum.scale.set(1, th, 1); dum.rotation.set(0, 0, 0); dum.updateMatrix();
      trunks.setMatrixAt(ti, dum.matrix);
      dum.position.set(WX(mx), th + cr * 0.65, WZ(my)); dum.scale.set(cr, cr * rr(0.9, 1.25), cr); dum.rotation.y = rnd() * 6; dum.updateMatrix();
      crowns.setMatrixAt(ti, dum.matrix);
      col.setHex(greens[Math.floor(rnd() * greens.length)]);
      crowns.setColorAt(ti, col);
      ti++;
    }
    function scatter(x, y, w, h, n, sc) {
      let k = 0, tries = 0;
      while (k < n && tries < n * 25) {
        tries++;
        const mx = rr(x, x + w), my = rr(y, y + h);
        if (treeOK(mx, my)) { plantTree(mx, my, sc); k++; }
      }
    }
    scatter(110, 62, 75, 173, 34, 1);
    scatter(235, 95, 140, 140, 40, 1);
    scatter(45, 8, 30, 292, 22, 1.05);
    scatter(0, 0, 40, 320, 16, 1.1);
    scatter(40, 300, 330, 18, 28, 1);
    scatter(500, 296, 240, 22, 24, 1);
    scatter(510, 0, 20, 215, 12, 1);
    scatter(660, 2, 90, 210, 22, 1);

    trunks.count = crowns.count = ti;
    crowns.instanceColor.needsUpdate = true;
    trunks.instanceMatrix.needsUpdate = crowns.instanceMatrix.needsUpdate = true;
    scene.add(trunks, crowns);

    // 12. Parked Vehicles & Street Lamps
    {
      const cars = new THREE.InstancedMesh(new THREE.BoxGeometry(2, 1.3, 4.2), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5, metalness: 0.2 }), 24);
      const cc = [0xe8e8e8, 0x222a33, 0xb32727, 0x2d5fa8, 0xc9c9c9, 0xf2d24a];
      let k = 0;
      for (let r = 0; r < 2; r++) for (let i = 0; i < 9; i++) {
        if (rnd() < 0.2) continue;
        dum.position.set(WX(240.5 + i * 7.2), 0.75, WZ(231 + r * 10)); dum.scale.set(1, 1, 1); dum.rotation.set(0, 0, 0); dum.updateMatrix();
        cars.setMatrixAt(k, dum.matrix);
        col.setHex(cc[Math.floor(rnd() * cc.length)]); cars.setColorAt(k, col); k++;
      }
      cars.count = k; cars.castShadow = true; scene.add(cars);

      const bikes = new THREE.InstancedMesh(new THREE.BoxGeometry(0.6, 0.9, 1.8), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 }), 260);
      const bc = [0x1f1f1f, 0xb32727, 0x2d5fa8, 0xdadada, 0x2b6b3a];
      k = 0;
      [[78, 232, 25, 70], [108, 224, 27, 76], [508, 236, 14, 30]].forEach(([x, y, w, h]) => {
        for (let mx = x + 3; mx < x + w - 2; mx += 2.9) for (let my = y + 3; my < y + h - 2; my += 5.2) {
          if (k >= 260) return;
          if (rnd() < 0.18) continue;
          dum.position.set(WX(mx), 0.5, WZ(my)); dum.scale.set(1, 1, 1); dum.rotation.set(0, rr(-0.15, 0.15), 0); dum.updateMatrix();
          bikes.setMatrixAt(k, dum.matrix);
          col.setHex(bc[Math.floor(rnd() * bc.length)]); bikes.setColorAt(k, col); k++;
        }
      });
      bikes.count = k; bikes.castShadow = true; scene.add(bikes);
    }

    const lampHeadMat = new THREE.MeshBasicMaterial({ color: 0x777777 });
    {
      const pts = [];
      for (let x = 240; x <= 520; x += 30) pts.push([x, 205]);
      for (let y = 80; y <= 230; y += 30) pts.push([384, y]);
      for (let y = 30; y <= 300; y += 34) pts.push([108, y]);
      for (let y = 70; y <= 230; y += 40) pts.push([228, y]);
      const poles = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.09, 0.12, 5, 6), new THREE.MeshStandardMaterial({ color: 0x3b3f44 }), pts.length);
      const heads = new THREE.InstancedMesh(new THREE.SphereGeometry(0.38, 10, 8), lampHeadMat, pts.length);
      pts.forEach((p, i) => {
        dum.rotation.set(0, 0, 0); dum.scale.set(1, 1, 1); dum.position.set(WX(p[0]), 2.5, WZ(p[1])); dum.updateMatrix();
        poles.setMatrixAt(i, dum.matrix);
        dum.position.y = 5.1; dum.updateMatrix();
        heads.setMatrixAt(i, dum.matrix);
      });
      scene.add(poles, heads);
    }

    // 13. Animated Pedestrians
    const corridors = [[240, 212, 520, 212], [381, 70, 381, 226], [240, 90, 430, 90], [104, 70, 104, 225]].map((c) => [WX(c[0]), WZ(c[1]), WX(c[2]), WZ(c[3])]);
    const NP = 70, people = [];
    const peopleMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.26, 0.3, 1.65, 6), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 }), NP);
    const heads = new THREE.InstancedMesh(new THREE.SphereGeometry(0.25, 8, 6), new THREE.MeshStandardMaterial({ color: 0xe3b896, roughness: 0.8 }), NP);
    const shirt = [0xf2f2f2, 0x2d5fa8, 0xd5251d, 0x222222, 0x3b8f5a, 0xe3c04a, 0x8a5fa8];
    for (let i = 0; i < NP; i++) {
      const c = corridors[i % corridors.length];
      people.push({ c, ph: rnd() * 2, sp: rr(0.012, 0.03), off: rr(-1.6, 1.6) });
      col.setHex(shirt[Math.floor(rnd() * shirt.length)]);
      peopleMesh.setColorAt(i, col);
    }
    scene.add(peopleMesh, heads);

    // 14. SEMS-RL 3D Equipment at Building K1 (Khoa CNTT)
    const S3 = {};
    const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
    {
      const roof = 11 * hFloor + 0.55;
      const x1 = WX(506), z0 = WZ(12), z1 = WZ(172), zm = (z0 + z1) / 2;
      const wxa = WX(436), wxb = WX(458), exa = WX(484), exb = WX(506);

      // Solar PV Texture & Panels
      const c = document.createElement('canvas'); c.width = 256; c.height = 128;
      const g = c.getContext('2d');
      const gr = g.createLinearGradient(0, 0, 256, 128);
      gr.addColorStop(0, '#16377a'); gr.addColorStop(0.5, '#0d2556'); gr.addColorStop(1, '#14306b');
      g.fillStyle = gr; g.fillRect(0, 0, 256, 128);
      g.strokeStyle = 'rgba(150,185,255,.55)'; g.lineWidth = 1.5;
      for (let x = 0; x <= 256; x += 16) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 128); g.stroke(); }
      for (let y = 0; y <= 128; y += 16) { g.beginPath(); g.moveTo(0, y); g.lineTo(256, y); g.stroke(); }
      g.strokeStyle = '#cfd6e2'; g.lineWidth = 5; g.strokeRect(0, 0, 256, 128);

      const tex = new THREE.CanvasTexture(c);
      if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(4, 1);
      const panelMat = new THREE.MeshStandardMaterial({ map: tex, metalness: 0.45, roughness: 0.3, emissive: 0x2a62ff, emissiveIntensity: 0 });

      const pw = (wxb - wxa) - 2.4, pd = 3.4, tilt = 0.28, cxp = (exa + exb) / 2;
      const nz1 = WZ(42), sz0 = WZ(142), xw = WX(436);
      const groups = [
        { cx: cxp, za: nz1 + 1, zb: sz0 - 1, n: 7 },
        { cx: xw + 4.2, za: sz0 + 1.5, zb: z1 - 1.5, n: 3 },
        { cx: xw + 10.6, za: sz0 + 1.5, zb: z1 - 1.5, n: 3 },
        { cx: xw + 17, za: sz0 + 1.5, zb: z1 - 1.5, n: 3 }
      ];
      const total = groups.reduce((t, g) => t + g.n, 0);
      const panels = new THREE.InstancedMesh(new THREE.BoxGeometry(pw, 0.14, pd), panelMat, total);
      const legMat = new THREE.MeshStandardMaterial({ color: 0x9aa1aa, metalness: 0.5, roughness: 0.5 });
      const legs = new THREE.InstancedMesh(new THREE.BoxGeometry(0.18, 1, 0.18), legMat, total * 4);

      const o = new THREE.Object3D();
      let li = 0, pi = 0;
      groups.forEach((gp) => {
        const gap = (gp.zb - gp.za) / gp.n;
        for (let i = 0; i < gp.n; i++) {
          const z = gp.za + gap * (i + 0.5), hy = roof + 1.5;
          o.position.set(gp.cx, hy, z); o.rotation.set(tilt, 0, 0); o.scale.set(1, 1, 1); o.updateMatrix();
          panels.setMatrixAt(pi++, o.matrix);
          [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => {
            const px = gp.cx + sx * (pw / 2 - 1), pz = z + sz * (pd / 2 - 0.4) * Math.cos(tilt);
            const top = hy + sz * Math.sin(tilt) * (pd / 2 - 0.4) - 0.1, hgt = top - roof;
            o.position.set(px, roof + hgt / 2, pz); o.rotation.set(0, 0, 0); o.scale.set(1, hgt, 1); o.updateMatrix();
            legs.setMatrixAt(li++, o.matrix);
          });
        }
      });
      panels.castShadow = true; panels.receiveShadow = true; legs.castShadow = true;
      scene.add(panels, legs);

      // Hai Container BESS 200 kWh & PCS/EMS Hub
      const bx = WX(436) + 17, cont = new THREE.MeshStandardMaterial({ color: 0xe8edf2, roughness: 0.6, metalness: 0.2 });
      const stripe = new THREE.MeshStandardMaterial({ color: 0x2fbf71, emissive: 0x2fbf71, emissiveIntensity: 0.4, roughness: 0.5 });
      for (let j = 0; j < 2; j++) {
        const z = z0 + 6, xj = WX(436) + 4.4 + j * 8;
        const b = new THREE.Mesh(new THREE.BoxGeometry(4.6, 2.6, 8), cont);
        b.position.set(xj, roof + 1.3, z); b.castShadow = true; b.receiveShadow = true;
        scene.add(b);
        const st = new THREE.Mesh(new THREE.BoxGeometry(4.7, 0.35, 8.1), stripe);
        st.position.set(xj, roof + 2, z);
        scene.add(st);
      }
      const hz = z0 + 6;
      const hub = new THREE.Mesh(new THREE.BoxGeometry(2.6, 2.4, 3), new THREE.MeshStandardMaterial({ color: 0x5d6672, roughness: 0.6, metalness: 0.4 }));
      hub.position.set(bx, roof + 1.2, hz); hub.castShadow = true; scene.add(hub);

      const hubLight = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.3, 2.6), new THREE.MeshStandardMaterial({ color: 0x3cc8ff, emissive: 0x3cc8ff, emissiveIntensity: 0.8 }));
      hubLight.position.set(bx, roof + 2.55, hz); scene.add(hubLight);

      // Trụ điện lưới và Trạm biến áp
      const px = WX(548), pz = WZ(190), mat = new THREE.MeshStandardMaterial({ color: 0xb7bec8, metalness: 0.6, roughness: 0.45 });
      const ax = V3(0, 1, 0);
      const bar = (a, b, r) => {
        const d = b.clone().sub(a), L = d.length(), m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, L, 5), mat);
        m.position.copy(a).addScaledVector(d, 0.5);
        m.quaternion.setFromUnitVectors(ax, d.normalize());
        scene.add(m);
      };
      const lv = [0, 5, 10, 15, 20, 26], hw = (y) => (y <= 20 ? 2.1 - 1.4 * y / 20 : 0.7 - 0.25 * (y - 20) / 6);
      const corner = (y, i) => V3(px + (i & 1 ? 1 : -1) * hw(y), y, pz + (i & 2 ? 1 : -1) * hw(y));
      for (let k = 0; k < lv.length; k++) {
        for (let i = 0; i < 4; i++) {
          if (k < lv.length - 1) bar(corner(lv[k], i), corner(lv[k + 1], i), 0.13);
          const nx = [1, 3, 0, 2][i]; bar(corner(lv[k], i), corner(lv[k], nx), 0.08);
          if (k < lv.length - 1) bar(corner(lv[k], i), corner(lv[k + 1], nx), 0.06);
        }
      }
      [22, 25.5].forEach((y) => {
        bar(V3(px, y, pz - 3.4), V3(px, y, pz + 3.4), 0.11);
        [-3.4, 0, 3.4].forEach((dz) => {
          const ins = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.9, 6), new THREE.MeshStandardMaterial({ color: 0x6a7ea0 }));
          ins.position.set(px, y - 0.5, pz + dz);
          scene.add(ins);
        });
      });
      const tr = new THREE.Mesh(new THREE.BoxGeometry(3.4, 2.4, 2.6), new THREE.MeshStandardMaterial({ color: 0x7d8a99, roughness: 0.6, metalness: 0.4 }));
      tr.position.set(px + 3, 1.2, pz); tr.castShadow = true; scene.add(tr);
      colliders.push({ a: px - 2.6, b: px + 4.9, c: pz - 2.6, d: pz + 2.6 });

      // Energy Particle Flows
      const mkFlow = (a, b, color) => {
        const N = 28, geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
        const pts = new THREE.Points(geo, new THREE.PointsMaterial({
          color, size: 1.35, transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending, fog: false
        }));
        pts.frustumCulled = false; scene.add(pts);
        const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([a, b]), new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.3, fog: false }));
        scene.add(line);
        return { a, b, pts, geo, N, line, phase: rnd(), P: 0 };
      };

      const hubTop = V3(bx, roof + 2.8, hz);
      S3.flows = {
        pv: mkFlow(V3(cxp, roof + 3.4, zm), hubTop, 0xffc933),
        bess: mkFlow(V3(WX(436) + 8.4, roof + 3.4, z0 + 6), hubTop, 0x38e07b),
        grid: mkFlow(V3(px, 26, pz), hubTop, 0xa56bff),
        load: mkFlow(hubTop, V3(x1 + 5, roof - 9, hz), 0x3cc8ff)
      };
      S3.panelMat = panelMat; S3.stripe = stripe; S3.hubLight = hubLight;

      // 3D Billboard Sprite Tags
      const mkTag = (color, pos) => {
        const cv = document.createElement('canvas'); cv.width = 440; cv.height = 150;
        const tx = new THREE.CanvasTexture(cv);
        if (THREE.SRGBColorSpace) tx.colorSpace = THREE.SRGBColorSpace;
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tx, depthTest: false, depthWrite: false, transparent: true, fog: false }));
        sp.scale.set(10.5, 3.58, 1); sp.position.copy(pos); sp.renderOrder = 30; labelGroup.add(sp);
        return { cv, tx, color };
      };

      S3.tags = {
        pv: mkTag('#ffc933', V3(cxp, roof + 11, zm - 6)),
        bess: mkTag('#38e07b', V3(WX(436) + 8.4, roof + 9, z0 + 6)),
        grid: mkTag('#a56bff', V3(px, 31, pz)),
        load: mkTag('#3cc8ff', V3(x1 + 9, roof - 6, hz))
      };
      S3.view = { pos: V3(95, 66, 16), tgt: V3(40, 34, -30) };
    }

    function drawTag(t, l1, l2, l3) {
      const g = t.cv.getContext('2d'), W = 440, H = 150, r = 22;
      g.clearRect(0, 0, W, H);
      g.fillStyle = 'rgba(8,16,36,.88)'; g.strokeStyle = t.color; g.lineWidth = 5;
      g.beginPath(); g.moveTo(r, 3); g.arcTo(W - 3, 3, W - 3, H - 3, r); g.arcTo(W - 3, H - 3, 3, H - 3, r); g.arcTo(3, H - 3, 3, 3, r); g.arcTo(3, 3, W - 3, 3, r); g.closePath();
      g.fill(); g.stroke();
      g.textBaseline = 'alphabetic'; g.textAlign = 'left'; g.fillStyle = t.color; g.font = '700 30px sans-serif';
      g.fillText(l1, 24, 46);
      g.fillStyle = '#fff'; g.font = '700 62px sans-serif';
      g.fillText(l2, 24, 114);
      if (l3) {
        g.textAlign = 'right'; g.fillStyle = t.color; g.font = '600 32px sans-serif';
        g.fillText(l3, W - 24, 112);
      }
      t.tx.needsUpdate = true;
    }

    // 15. Soccer Match & Floodlights
    const PITCH = { x0: WX(548), x1: WX(734), z0: WZ(70), z1: WZ(152) };
    PITCH.L = PITCH.x1 - PITCH.x0; PITCH.W = PITCH.z1 - PITCH.z0;
    PITCH.cx = (PITCH.x0 + PITCH.x1) / 2; PITCH.cz = (PITCH.z0 + PITCH.z1) / 2;
    const SOC_N = 22;
    const kitA = { shirt: 0xd5251d, shorts: 0xf4f4f4, socks: 0xd5251d, gk: 0xf2c200 };
    const kitB = { shirt: 0x1f5fd1, shorts: 0x10224a, socks: 0x1f5fd1, gk: 0x222222 };
    const soccer = [];

    {
      const form = [[0.05, 0.5, 0.05], [0.2, 0.15, 0.22], [0.2, 0.38, 0.22], [0.2, 0.62, 0.22], [0.2, 0.85, 0.22], [0.4, 0.15, 0.38], [0.4, 0.38, 0.38], [0.4, 0.62, 0.38], [0.4, 0.85, 0.38], [0.62, 0.36, 0.5], [0.62, 0.64, 0.5]];
      for (let t = 0; t < 2; t++) form.forEach((f, i) => soccer.push({ team: t, gk: i === 0, u: t ? 1 - f[0] : f[0], v: t ? 1 - f[1] : f[1], k: f[2], ph: rnd() * 6.28, sp: 0.7 + rnd() * 0.5 }));

      const mk = (geo, n) => new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 }), n);
      const torso = mk(new THREE.CylinderGeometry(0.27, 0.3, 0.7, 8), SOC_N);
      const shorts = mk(new THREE.CylinderGeometry(0.31, 0.31, 0.32, 8), SOC_N);
      const legs = mk(new THREE.CylinderGeometry(0.17, 0.16, 0.8, 6), SOC_N);
      const head = new THREE.InstancedMesh(new THREE.SphereGeometry(0.22, 8, 6), new THREE.MeshStandardMaterial({ color: 0xe3b896, roughness: 0.8 }), SOC_N);

      soccer.forEach((pl, i) => {
        const kit = pl.team ? kitB : kitA;
        torso.setColorAt(i, col.setHex(pl.gk ? kit.gk : kit.shirt));
        shorts.setColorAt(i, col.setHex(kit.shorts));
        legs.setColorAt(i, col.setHex(kit.socks));
      });
      [torso, shorts, legs, head].forEach((m) => { m.castShadow = true; m.frustumCulled = false; scene.add(m); });

      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 10), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 }));
      ball.castShadow = true; scene.add(ball);
      soccer.meshes = { torso, shorts, legs, head, ball };

      // 4 Floodlight Towers at Pitch corners + Stadium Illumination System
      const poleMat = new THREE.MeshStandardMaterial({ color: 0x8d949c, metalness: 0.5, roughness: 0.5 });
      const floodMat = new THREE.MeshStandardMaterial({
        color: 0x222222,
        emissive: 0xfffee5,
        emissiveIntensity: 0,
        roughness: 0.2
      });
      soccer.flood = { mat: floodMat, lights: [], beams: [], pitchLights: [] };

      [[542, 64, -25, -15], [742, 64, 25, -15], [542, 158, -25, 15], [742, 158, 25, 15]].forEach(([mx, my, offX, offZ]) => {
        const x = WX(mx), z = WZ(my);
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.36, 20, 8), poleMat);
        pole.position.set(x, 10, z); pole.castShadow = true; scene.add(pole);
        const targetPos = new THREE.Vector3(PITCH.cx + offX, 0, PITCH.cz + offZ);
        const headBox = new THREE.Mesh(new THREE.BoxGeometry(3.6, 2.0, 0.6), floodMat);
        headBox.position.set(x, 19.5, z); headBox.lookAt(targetPos); scene.add(headBox);
        
        // High-power corner spotlight pointing down to pitch
        const sl = new THREE.SpotLight(0xfffae8, 0, 320, 1.05, 0.5, 0.5);
        sl.position.set(x, 19.5, z); sl.target.position.copy(targetPos); scene.add(sl, sl.target);
        soccer.flood.lights.push(sl);

        // Volumetric Light Beams slicing DOWN onto the football pitch
        const beamGeo = new THREE.CylinderGeometry(0.8, 12, 32, 16, 1, true);
        beamGeo.translate(0, -16, 0); beamGeo.rotateX(-Math.PI / 2);
        const beamMat = new THREE.MeshBasicMaterial({
          color: 0xfffee5,
          transparent: true,
          opacity: 0,
          blending: THREE.AdditiveBlending,
          side: THREE.DoubleSide,
          depthWrite: false
        });
        const beam = new THREE.Mesh(beamGeo, beamMat);
        beam.position.set(x, 19.5, z); beam.lookAt(targetPos); scene.add(beam);
        soccer.flood.beams.push(beamMat);

        colliders.push({ a: x - 0.6, b: x + 0.6, c: z - 0.6, d: z + 0.6 });
      });

      // 2 Stadium High-mast Area Spotlights (Bright green pitch in the night)
      const pLight1 = new THREE.SpotLight(0xf0fff4, 0, 180, Math.PI / 2.8, 0.75, 0.5);
      pLight1.position.set(PITCH.cx - 20, 24, PITCH.cz); pLight1.target.position.set(PITCH.cx - 20, 0, PITCH.cz); scene.add(pLight1, pLight1.target);
      const pLight2 = new THREE.SpotLight(0xf0fff4, 0, 180, Math.PI / 2.8, 0.75, 0.5);
      pLight2.position.set(PITCH.cx + 20, 24, PITCH.cz); pLight2.target.position.set(PITCH.cx + 20, 0, PITCH.cz); scene.add(pLight2, pLight2.target);
      const pFill = new THREE.PointLight(0xe8ffec, 0, 140, 0.5);
      pFill.position.set(PITCH.cx, 16, PITCH.cz); scene.add(pFill);
      soccer.flood.pitchLights.push(pLight1, pLight2, pFill);
    }

    // 16. Sun/Day/Night Colors
    const cDayTop = new THREE.Color(0x3f8fe0), cNightTop = new THREE.Color(0x050b1e), cWarmTop = new THREE.Color(0x5a6aa8);
    const cDayBot = new THREE.Color(0xcfe7f7), cNightBot = new THREE.Color(0x15203a), cWarmBot = new THREE.Color(0xffb27a);
    const cSunW = new THREE.Color(0xfff3e0), cSunO = new THREE.Color(0xff9a4d);
    const cHD = new THREE.Color(0xbfdcff), cHN = new THREE.Color(0x2a3a66);

    function updateTimeLighting(h) {
      const a = (h - 6) / 12 * Math.PI, el = Math.sin(a);
      const d = sstep(-0.02, 0.22, el), warm = (1 - sstep(0.02, 0.4, el)) * d;
      const night = 1 - sstep(-0.1, 0.12, el);

      sun.position.set(Math.cos(a) * 260, Math.max(el, 0.05) * 260 + 8, 95);
      sun.color.copy(cSunW).lerp(cSunO, warm); sun.intensity = 2.3 * d;
      hemi.intensity = 0.16 + 0.62 * d; hemi.color.copy(cHN).lerp(cHD, d);
      moon.intensity = 0.35 * night;

      skyMat.uniforms.top.value.copy(cNightTop).lerp(cDayTop, d).lerp(cWarmTop, warm * 0.5);
      skyMat.uniforms.bot.value.copy(cNightBot).lerp(cDayBot, d).lerp(cWarmBot, warm * 0.8);
      scene.fog.color.copy(skyMat.uniforms.bot.value);
      starMat.opacity = night;
      windowMats.forEach((m) => (m.emissiveIntensity = night * 0.95));

      // Floodlights & Stadium Illumination
      const isNight = h >= 17.5 || h < 6.0 || night > 0.05;
      const active = stadiumLightsRef.current && (isNight || forceStadiumLightsRef.current);
      const on = active ? Math.max(0.85, clamp(night * 1.5, 0.85, 1.0)) : 0;

      soccer.flood.mat.emissiveIntensity = on * 5.0;
      soccer.flood.mat.color.setRGB(0.2 + 0.8 * on, 0.2 + 0.8 * on, 0.2 + 0.7 * on);
      soccer.flood.lights.forEach((l) => (l.intensity = on * 55.0));
      soccer.flood.pitchLights.forEach((l) => (l.intensity = on * 35.0));
      soccer.flood.beams.forEach((b) => (b.opacity = on * 0.18));

      lampHeadMat.color.setRGB(0.32 + night * 0.68, 0.32 + night * 0.6, 0.3 + night * 0.2);
      renderer.toneMappingExposure = 1 + night * 0.25;
    }

    // 17. 2D Minimap Rendering
    const mg = miniCanvas.getContext('2d'), mk = miniCanvas.width / MW;
    const miniBase = document.createElement('canvas'); miniBase.width = miniCanvas.width; miniBase.height = miniCanvas.height;
    {
      const g = miniBase.getContext('2d');
      g.fillStyle = '#2b3a31'; g.fillRect(0, 0, miniBase.width, miniBase.height);
      const R = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(x * mk, y * mk, w * mk, h * mk); };
      R(40, 0, 710, 320, '#8f8d85'); R(540, 64, 202, 94, '#4f9a3f'); R(110, 62, 75, 173, '#5d8c44'); R(235, 95, 140, 140, '#5d8c44');
      R(45, 8, 30, 292, '#5d8c44'); R(40, 147, 72, 12, '#c9c5b8'); R(588, 224, 54, 34, '#3aa6d8');
      B.forEach((b) => R(b.x, b.y, b.w, b.h, hexStr(b.c)));
    }

    function drawMini() {
      mg.drawImage(miniBase, 0, 0);
      const mx = (currentMode === 'walk' ? camera.position.x : controls.target.x) / S + MW / 2;
      const my = (currentMode === 'walk' ? camera.position.z : controls.target.z) / S + MH / 2;
      const dir = new THREE.Vector3();
      camera.getWorldDirection(dir);
      const ang = Math.atan2(dir.z, dir.x);

      mg.save();
      mg.translate(mx * mk, my * mk);
      mg.rotate(ang);
      mg.fillStyle = '#ffd34d'; mg.strokeStyle = '#111'; mg.lineWidth = 2;
      if (currentMode === 'walk') {
        mg.beginPath(); mg.moveTo(11, 0); mg.lineTo(-7, -7); mg.lineTo(-7, 7); mg.closePath(); mg.fill(); mg.stroke();
      } else {
        mg.beginPath(); mg.arc(0, 0, 6, 0, 6.2832); mg.fill(); mg.stroke();
      }
      mg.restore();
    }

    miniCanvas.onclick = (e) => {
      const r = miniCanvas.getBoundingClientRect();
      const mx = ((e.clientX - r.left) / r.width) * MW;
      const my = ((e.clientY - r.top) / r.height) * MH;
      const x = WX(mx), z = WZ(my);
      if (currentMode === 'walk') {
        camera.position.x = x; camera.position.z = z;
        collide(camera.position);
      } else {
        const s = V3(x - controls.target.x, 0, z - controls.target.z);
        camera.position.add(s); controls.target.add(s);
      }
    };

    // 18. Camera Controls & Modes
    let currentMode = 'orbit';
    let tw = null;
    let yaw = -Math.PI / 2, pitch = -0.02;
    const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

    function flyTo(pos, tgt, dur = 1.5) {
      tw = { t: 0, dur, p0: camera.position.clone(), p1: pos, t0: controls.target.clone(), t1: tgt };
    }

    function satPose() {
      const asp = (container.clientWidth || 800) / (container.clientHeight || 600);
      const H = clamp(Math.max(140 / 1.04, 320 / (1.04 * asp)), 130, 640);
      return [V3(0, H, 0.01), V3(0, 0, 0)];
    }

    function setMode(m, keepCam) {
      const prev = currentMode;
      currentMode = m;
      setViewMode(m);
      controls.enabled = m !== 'walk';
      tw = null;

      if (m === 'orbit') {
        controls.enableRotate = true;
        if (prev === 'walk') {
          const f = V3(Math.sin(yaw) * -1, 0, -Math.cos(yaw));
          const p = camera.position.clone();
          controls.target.copy(p).addScaledVector(f, 40).setY(0);
          camera.position.set(p.x - f.x * 30, 30, p.z - f.z * 30);
        }
        if (!keepCam && prev !== 'walk') flyTo(V3(-70, 150, 215), V3(0, 0, -6));
      } else if (m === 'sat') {
        controls.enableRotate = false;
        const [p, t] = satPose();
        flyTo(p, t, 1.6);
      } else if (m === 'walk') {
        const p = V3(WX(56), 1.7, WZ(152));
        camera.position.copy(p);
        yaw = -Math.PI / 2; pitch = -0.02;
        camera.rotation.set(pitch, yaw, 0);
      }
    }

    // 19. Walk Mode Keys & Collision
    const keys = {};
    const onKeyDown = (e) => {
      keys[e.code] = true;
      if (currentMode === 'walk' && /Arrow|Space|KeyW|KeyA|KeyS|KeyD/.test(e.code)) e.preventDefault();
    };
    const onKeyUp = (e) => { keys[e.code] = false; };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    let drag = null, down = null;
    const dom = renderer.domElement;
    dom.onpointerdown = (e) => {
      down = { x: e.clientX, y: e.clientY, t: performance.now() };
      if (currentMode === 'walk') {
        drag = { x: e.clientX, y: e.clientY };
        dom.setPointerCapture(e.pointerId);
      }
    };
    dom.onpointermove = (e) => {
      if (currentMode === 'walk' && drag) {
        yaw -= (e.clientX - drag.x) * 0.0035;
        pitch = clamp(pitch - (e.clientY - drag.y) * 0.0035, -1.3, 1.3);
        drag.x = e.clientX; drag.y = e.clientY;
      }
    };

    const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
    let selBox = null;
    dom.onpointerup = (e) => {
      drag = null;
      if (!down || currentMode === 'walk') return;
      if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5 || performance.now() - down.t > 450) return;
      const r = dom.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      const hit = ray.intersectObjects(pickables, false)[0];
      if (selBox) { scene.remove(selBox); selBox = null; }
      if (hit) {
        const u = hit.object.userData;
        selBox = new THREE.BoxHelper(hit.object, 0xffd34d);
        scene.add(selBox);
        setSelectedBuilding(u);
      } else {
        setSelectedBuilding(null);
      }
    };

    function collide(p) {
      const r = 1;
      for (const c of colliders) {
        if (p.x > c.a - r && p.x < c.b + r && p.z > c.c - r && p.z < c.d + r) {
          const l = p.x - (c.a - r), rt = (c.b + r) - p.x, tp = p.z - (c.c - r), bt = (c.d + r) - p.z;
          const m = Math.min(l, rt, tp, bt);
          if (m === l) p.x = c.a - r; else if (m === rt) p.x = c.b + r; else if (m === tp) p.z = c.c - r; else p.z = c.d + r;
        }
      }
    }

    // Expose actions to React controls
    sceneActionsRef.current = {
      setMode: (m) => setMode(m),
      flyTo: (preset) => {
        if (preset === 'gate') { setMode('walk'); return; }
        if (currentMode !== 'orbit') setMode('orbit', true);
        controls.enableRotate = true;
        if (preset === 'photo') flyTo(V3(-146, 30, -3), V3(-66, 9, -3));
        if (preset === 'overview') flyTo(V3(-70, 150, 215), V3(0, 0, -6));
        if (preset === 'solar') flyTo(S3.view.pos, S3.view.tgt);
        if (preset === 'field') {
          flyTo(V3(60, 45, 40), V3(WX(641), 0, WZ(111)));
          forceStadiumLightsRef.current = true;
          setForceStadiumLights(true);
        }
      },
      setLabels: (visible) => { labelGroup.visible = visible; setShowLabels(visible); },
      setShadows: (enabled) => {
        renderer.shadowMap.enabled = enabled;
        sun.castShadow = enabled;
        scene.traverse((o) => {
          if (o.material) {
            const ms = Array.isArray(o.material) ? o.material : [o.material];
            ms.forEach((m) => (m.needsUpdate = true));
          }
        });
        setShowShadows(enabled);
      },
      setPeople: (visible) => {
        peopleMesh.visible = heads.visible = visible;
        setShowPeople(visible);
      },
      setStadiumLights: (enabled) => {
        stadiumLightsRef.current = enabled;
        setStadiumLights(enabled);
      },
      toggleForceStadiumLights: () => {
        const next = !forceStadiumLightsRef.current;
        forceStadiumLightsRef.current = next;
        setForceStadiumLights(next);
      }
    };

    // 20. Main Animation Loop
    let last = performance.now(), clock = 0;
    const fwd = new THREE.Vector3();
    const _so = new THREE.Object3D();

    function frame(now) {
      if (destroyed) return;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      clock += dt;

      // Sync step data from React state
      const sd = stepDataRef.current || {};
      const hour = sd.hour !== undefined ? sd.hour : 9.5;
      updateTimeLighting(hour);

      // Camera flight interpolation
      if (tw) {
        tw.t += dt;
        const k = ease(Math.min(1, tw.t / tw.dur));
        camera.position.lerpVectors(tw.p0, tw.p1, k);
        controls.target.lerpVectors(tw.t0, tw.t1, k);
        if (tw.t >= tw.dur) tw = null;
      }

      // First person walk control
      if (currentMode === 'walk') {
        const sp = (keys.ShiftLeft || keys.ShiftRight ? 14 : 6.5) * dt;
        let f = 0, s = 0;
        if (keys.KeyW || keys.ArrowUp) f += 1;
        if (keys.KeyS || keys.ArrowDown) f -= 1;
        if (keys.KeyD) s += 1;
        if (keys.KeyA) s -= 1;
        if (keys.ArrowLeft) yaw += 1.6 * dt;
        if (keys.ArrowRight) yaw -= 1.6 * dt;

        fwd.set(-Math.sin(yaw), 0, -Math.cos(yaw));
        const rx = Math.cos(yaw), rz = -Math.sin(yaw), nm = f && s ? 0.707 : 1;
        camera.position.x += (fwd.x * f + rx * s) * sp * nm;
        camera.position.z += (fwd.z * f + rz * s) * sp * nm;
        camera.position.x = clamp(camera.position.x, -420, 420);
        camera.position.z = clamp(camera.position.z, -260, 260);
        collide(camera.position);
        camera.position.y = 1.7;
        camera.rotation.set(pitch, yaw, 0);
      } else {
        controls.target.x = clamp(controls.target.x, -300, 300);
        controls.target.z = clamp(controls.target.z, -200, 200);
        controls.update();
      }

      sky.position.copy(camera.position);

      // Animate Pedestrians
      if (peopleMesh.visible) {
        const nP = hour >= 6 && hour < 19 ? NP : 8;
        peopleMesh.count = heads.count = nP;
        for (let i = 0; i < nP; i++) {
          const p = people[i], c = p.c, len = Math.hypot(c[2] - c[0], c[3] - c[1]);
          let u = (p.ph + clock * p.sp * (36 / len) * 20) % 2;
          if (u > 1) u = 2 - u;
          const x = c[0] + (c[2] - c[0]) * u, z = c[1] + (c[3] - c[1]) * u;
          const nx = -(c[3] - c[1]) / len;
          const bob = Math.abs(Math.sin(clock * 6 + i)) * 0.08;
          dum.rotation.set(0, 0, 0); dum.scale.set(1, 1, 1);
          dum.position.set(x + nx * p.off, 0.83 + bob, z); dum.updateMatrix();
          peopleMesh.setMatrixAt(i, dum.matrix);
          dum.position.y = 1.85 + bob; dum.updateMatrix();
          heads.setMatrixAt(i, dum.matrix);
        }
        peopleMesh.instanceMatrix.needsUpdate = heads.instanceMatrix.needsUpdate = true;
      }

      // Animate Soccer match
      const isNight = hour >= 17.5 || hour < 6.0;
      const playing = stadiumLightsRef.current && (isNight || forceStadiumLightsRef.current);
      const M0 = soccer.meshes;
      [M0.torso, M0.shorts, M0.legs, M0.head, M0.ball].forEach((m) => (m.visible = playing));
      if (playing) {
        const bu = 0.5 + 0.4 * Math.sin(clock * 0.31), bv = 0.5 + 0.38 * Math.sin(clock * 0.47 + 1.3);
        const M = soccer.meshes;
        soccer.forEach((pl, i) => {
          const u = clamp(pl.u + (bu - pl.u) * pl.k + 0.035 * Math.sin(clock * pl.sp + pl.ph), 0.02, 0.98);
          const v = clamp(pl.v + (bv - pl.v) * pl.k * 0.8 + 0.07 * Math.sin(clock * pl.sp * 1.3 + pl.ph * 2), 0.04, 0.96);
          const x = PITCH.x0 + u * PITCH.L, z = PITCH.z0 + v * PITCH.W;
          const bob = Math.abs(Math.sin(clock * 5 + pl.ph)) * 0.1;
          const K = 1.3;
          _so.rotation.set(0, 0, 0); _so.scale.set(K, K, K);
          _so.position.set(x, (0.4 + bob) * K, z); _so.updateMatrix(); M.legs.setMatrixAt(i, _so.matrix);
          _so.position.set(x, (0.96 + bob) * K, z); _so.updateMatrix(); M.shorts.setMatrixAt(i, _so.matrix);
          _so.position.set(x, (1.47 + bob) * K, z); _so.updateMatrix(); M.torso.setMatrixAt(i, _so.matrix);
          _so.position.set(x, (1.98 + bob) * K, z); _so.updateMatrix(); M.head.setMatrixAt(i, _so.matrix);
        });
        ['legs', 'shorts', 'torso', 'head'].forEach((k) => (M[k].instanceMatrix.needsUpdate = true));
        M.ball.position.set(PITCH.x0 + bu * PITCH.L + 0.8, 0.24 + Math.abs(Math.sin(clock * 3.2)) * 0.25, PITCH.z0 + bv * PITCH.W + 0.5);
      }

      // Animate SEMS-RL Flows & Tags on K1 Rooftop
      const pvKw = sd.p_pv_kw || 0;
      const battKw = sd.p_batt_kw || 0;
      const loadKw = sd.p_load_kw || 0;
      const gridKw = sd.p_buy_kw > 0 ? sd.p_buy_kw : (sd.p_sell_kw > 0 ? -sd.p_sell_kw : 0);
      const socVal = sd.soc || 0.5;

      S3.flows.pv.P = pvKw;
      S3.flows.bess.P = battKw;
      S3.flows.grid.P = gridKw;
      S3.flows.load.P = loadKw;

      S3.panelMat.emissiveIntensity = 0.5 * Math.min(1.0, pvKw / 150);
      const sc = battKw < -0.5 ? 0x3a7bff : (battKw > 0.5 ? 0xff9a3d : 0x2fbf71);
      S3.stripe.emissive.setHex(sc);
      S3.stripe.color.setHex(sc);
      S3.stripe.emissiveIntensity = 0.2 + 0.8 * socVal;

      for (const k in S3.flows) {
        const f = S3.flows[k], ap = Math.abs(f.P), n = ap < 0.5 ? 0 : Math.ceil(f.N * Math.min(1, 0.2 + ap / 90));
        f.phase += Math.sign(f.P) * (0.12 + 0.5 * Math.min(1, ap / 100)) * dt;
        const arr = f.geo.attributes.position.array;
        for (let j = 0; j < n; j++) {
          const u = (((j / n + f.phase) % 1) + 1) % 1;
          arr[j * 3] = f.a.x + (f.b.x - f.a.x) * u;
          arr[j * 3 + 1] = f.a.y + (f.b.y - f.a.y) * u;
          arr[j * 3 + 2] = f.a.z + (f.b.z - f.a.z) * u;
        }
        f.geo.setDrawRange(0, n);
        f.geo.attributes.position.needsUpdate = true;
        f.line.material.opacity = ap < 0.5 ? 0.12 : 0.38;
      }

      // Draw 3D Billboard Tags
      drawTag(S3.tags.pv, 'SOLAR PV (MÁI K1)', pvKw.toFixed(1) + ' kW');
      drawTag(
        S3.tags.bess,
        'BESS (SoC ' + Math.round(socVal * 100) + '%)',
        Math.abs(battKw).toFixed(1) + ' kW',
        battKw > 0.5 ? 'xả' : battKw < -0.5 ? 'sạc' : 'nghỉ'
      );
      drawTag(
        S3.tags.grid,
        'LƯỚI ĐIỆN & BIẾN ÁP',
        Math.abs(gridKw).toFixed(1) + ' kW',
        gridKw >= 0 ? 'mua' : 'bán'
      );
      drawTag(S3.tags.load, 'PHỤ TẢI TÒA K1', loadKw.toFixed(1) + ' kW');

      drawMini();
      renderer.render(scene, camera);
      animId = requestAnimationFrame(frame);
    }
    animId = requestAnimationFrame(frame);

    // Resize Observer
    const ro = new ResizeObserver((entries) => {
      if (!entries[0]) return;
      const { width: w, height: h } = entries[0].contentRect;
      if (w > 0 && h > 0) {
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
      }
    });
    ro.observe(container);

    return () => {
      destroyed = true;
      cancelAnimationFrame(animId);
      ro.disconnect();
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', minHeight: '620px', background: '#0e1714', borderRadius: '12px', overflow: 'hidden' }}>
      {/* 1. Main 3D Stage Canvas */}
      <div ref={mountRef} style={{ width: '100%', height: '100%', position: 'absolute', inset: 0 }} />

      {/* 2. Top-Left Floating Controls Panel */}
      <div
        style={{
          position: 'absolute',
          top: '1rem',
          left: '1rem',
          zIndex: 10,
          background: 'rgba(15, 23, 42, 0.88)',
          backdropFilter: 'blur(12px)',
          border: '1px solid rgba(255, 255, 255, 0.12)',
          borderRadius: '12px',
          padding: '0.75rem',
          color: '#F8FAFC',
          maxWidth: '320px',
          boxShadow: '0 10px 30px rgba(0,0,0,0.4)',
          fontSize: '0.82rem'
        }}
      >
        {/* Title Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.6rem', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '0.4rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Building2 size={16} color="#38BDF8" />
            <span style={{ fontWeight: 700, fontSize: '0.88rem' }}>Khuôn viên ĐH Thủy Lợi</span>
          </div>
          <span style={{ fontSize: '0.7rem', color: '#94A3B8', background: 'rgba(255,255,255,0.06)', padding: '2px 6px', borderRadius: '4px' }}>
            Tòa K1 (Khoa CNTT)
          </span>
        </div>

        {/* View Mode Segmented Control */}
        <div style={{ marginBottom: '0.6rem' }}>
          <div style={{ fontSize: '0.7rem', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem', fontWeight: 600 }}>
            Chế độ quan sát
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '4px', background: 'rgba(255,255,255,0.06)', padding: '3px', borderRadius: '8px' }}>
            <button
              onClick={() => sceneActionsRef.current?.setMode('orbit')}
              style={{
                border: 'none',
                background: viewMode === 'orbit' ? '#2563EB' : 'transparent',
                color: viewMode === 'orbit' ? '#fff' : '#94A3B8',
                borderRadius: '6px',
                padding: '4px 0',
                fontSize: '0.75rem',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
            >
              Toàn cảnh
            </button>
            <button
              onClick={() => sceneActionsRef.current?.setMode('sat')}
              style={{
                border: 'none',
                background: viewMode === 'sat' ? '#2563EB' : 'transparent',
                color: viewMode === 'sat' ? '#fff' : '#94A3B8',
                borderRadius: '6px',
                padding: '4px 0',
                fontSize: '0.75rem',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
            >
              Vệ tinh
            </button>
            <button
              onClick={() => sceneActionsRef.current?.setMode('walk')}
              style={{
                border: 'none',
                background: viewMode === 'walk' ? '#2563EB' : 'transparent',
                color: viewMode === 'walk' ? '#fff' : '#94A3B8',
                borderRadius: '6px',
                padding: '4px 0',
                fontSize: '0.75rem',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
            >
              Đi bộ (WASD)
            </button>
          </div>
        </div>

        {/* Quick Camera Preset Views */}
        <div style={{ marginBottom: '0.6rem' }}>
          <div style={{ fontSize: '0.7rem', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem', fontWeight: 600 }}>
            Góc nhìn nhanh
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
            <button
              onClick={() => sceneActionsRef.current?.flyTo('solar')}
              style={{
                background: 'rgba(56, 189, 248, 0.18)',
                border: '1px solid #38BDF8',
                color: '#38BDF8',
                borderRadius: '6px',
                padding: '3px 8px',
                fontSize: '0.74rem',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              ⚡ Năng lượng K1
            </button>
            <button
              onClick={() => sceneActionsRef.current?.flyTo('photo')}
              style={{
                background: 'rgba(255,255,255,0.08)',
                border: '1px solid rgba(255,255,255,0.15)',
                color: '#E2E8F0',
                borderRadius: '6px',
                padding: '3px 8px',
                fontSize: '0.74rem',
                cursor: 'pointer'
              }}
            >
              Mặt tiền A1
            </button>
            <button
              onClick={() => sceneActionsRef.current?.flyTo('overview')}
              style={{
                background: 'rgba(255,255,255,0.08)',
                border: '1px solid rgba(255,255,255,0.15)',
                color: '#E2E8F0',
                borderRadius: '6px',
                padding: '3px 8px',
                fontSize: '0.74rem',
                cursor: 'pointer'
              }}
            >
              Toàn trường
            </button>
            <button
              onClick={() => sceneActionsRef.current?.flyTo('field')}
              style={{
                background: forceStadiumLights ? 'rgba(16, 185, 129, 0.25)' : 'rgba(255,255,255,0.08)',
                border: forceStadiumLights ? '1px solid #10B981' : '1px solid rgba(255,255,255,0.15)',
                color: forceStadiumLights ? '#10B981' : '#E2E8F0',
                borderRadius: '6px',
                padding: '3px 8px',
                fontSize: '0.74rem',
                cursor: 'pointer'
              }}
            >
              ⚽ Sân bóng
            </button>
            <button
              onClick={() => sceneActionsRef.current?.toggleForceStadiumLights()}
              style={{
                background: forceStadiumLights ? '#10B981' : 'rgba(255,255,255,0.08)',
                border: '1px solid ' + (forceStadiumLights ? '#059669' : 'rgba(255,255,255,0.15)'),
                color: forceStadiumLights ? '#FFFFFF' : '#CBD5E1',
                borderRadius: '6px',
                padding: '3px 8px',
                fontSize: '0.74rem',
                fontWeight: 600,
                cursor: 'pointer'
              }}
              title="Bật đèn sân bóng bất chấp ngày đêm"
            >
              💡 {forceStadiumLights ? 'Đang bật đèn sân' : 'Bật đèn sân'}
            </button>
          </div>
        </div>

        {/* Visibility Checkboxes */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', paddingTop: '0.3rem', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', fontSize: '0.75rem', color: '#CBD5E1' }}>
            <input
              type="checkbox"
              checked={showLabels}
              onChange={(e) => sceneActionsRef.current?.setLabels(e.target.checked)}
              style={{ accentColor: '#2563EB' }}
            />
            Nhãn tên
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', fontSize: '0.75rem', color: '#CBD5E1' }}>
            <input
              type="checkbox"
              checked={showShadows}
              onChange={(e) => sceneActionsRef.current?.setShadows(e.target.checked)}
              style={{ accentColor: '#2563EB' }}
            />
            Bóng đổ
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', fontSize: '0.75rem', color: '#CBD5E1' }}>
            <input
              type="checkbox"
              checked={showPeople}
              onChange={(e) => sceneActionsRef.current?.setPeople(e.target.checked)}
              style={{ accentColor: '#2563EB' }}
            />
            Người đi bộ
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', fontSize: '0.75rem', color: '#10B981', fontWeight: 600 }}>
            <input
              type="checkbox"
              checked={stadiumLights}
              onChange={(e) => sceneActionsRef.current?.setStadiumLights(e.target.checked)}
              style={{ accentColor: '#10B981' }}
            />
            💡 Đèn sân bóng
          </label>
        </div>

        {/* External Link button to standalone campus HTML */}
        <div style={{ marginTop: '0.6rem', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '0.5rem' }}>
          <a
            href="/campus"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              width: '100%',
              padding: '5px',
              background: 'rgba(37, 99, 235, 0.2)',
              border: '1px solid #3B82F6',
              borderRadius: '6px',
              color: '#93C5FD',
              textDecoration: 'none',
              fontSize: '0.75rem',
              fontWeight: 600
            }}
          >
            <ExternalLink size={12} />
            Mở Khuôn Viên 3D Toàn Màn Hình
          </a>
        </div>
      </div>

      {/* 3. Top-Right Interactive 2D Minimap */}
      <div
        style={{
          position: 'absolute',
          top: '1rem',
          right: '1rem',
          zIndex: 10,
          background: 'rgba(15, 23, 42, 0.88)',
          backdropFilter: 'blur(10px)',
          border: '1px solid rgba(255, 255, 255, 0.15)',
          borderRadius: '10px',
          padding: '6px',
          boxShadow: '0 8px 24px rgba(0,0,0,0.4)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px', padding: '0 2px' }}>
          <span style={{ fontSize: '0.68rem', color: '#94A3B8', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Compass size={12} color="#FBBF24" /> Sơ đồ mặt bằng Thủy Lợi
          </span>
          <span style={{ fontSize: '0.65rem', color: '#64748B' }}>Click để chuyển cam</span>
        </div>
        <canvas
          ref={miniRef}
          width={250}
          height={107}
          style={{
            display: 'block',
            borderRadius: '6px',
            cursor: 'crosshair',
            background: '#22302a',
            border: '1px solid rgba(255,255,255,0.08)'
          }}
        />
      </div>

      {/* 4. Clicked Building Info Box Popup */}
      {selectedBuilding && (
        <div
          ref={infoRef}
          style={{
            position: 'absolute',
            bottom: '3.5rem',
            left: '1rem',
            zIndex: 15,
            background: 'rgba(15, 23, 42, 0.94)',
            backdropFilter: 'blur(12px)',
            border: '1px solid #F59E0B',
            borderRadius: '10px',
            padding: '0.75rem 1rem',
            color: '#FFFFFF',
            boxShadow: '0 8px 30px rgba(0,0,0,0.5)',
            maxWidth: '300px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
            <b style={{ fontSize: '0.95rem', color: '#FBBF24' }}>{selectedBuilding.name}</b>
            <button
              onClick={() => setSelectedBuilding(null)}
              style={{ background: 'transparent', border: 'none', color: '#94A3B8', cursor: 'pointer', fontSize: '1rem' }}
            >
              ✕
            </button>
          </div>
          <div style={{ fontSize: '0.78rem', color: '#CBD5E1' }}>
            {selectedBuilding.shed
              ? `Mái che, chiều cao ước lượng ${selectedBuilding.height.toFixed(1)} m`
              : `Quy mô: khoảng ${selectedBuilding.floors} tầng, cao ~${selectedBuilding.height.toFixed(0)} m`}
          </div>
        </div>
      )}

      {/* 5. Bottom Navigation Hint */}
      <div
        style={{
          position: 'absolute',
          bottom: '0.75rem',
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 10,
          background: 'rgba(10, 18, 15, 0.78)',
          backdropFilter: 'blur(8px)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          padding: '0.35rem 1rem',
          borderRadius: '999px',
          color: '#E2E8F0',
          fontSize: '0.75rem',
          pointerEvents: 'none',
          whiteSpace: 'nowrap'
        }}
      >
        {viewMode === 'walk' ? (
          <span>⌨️ <b>W A S D</b> hoặc phím mũi tên để đi lại · Giữ <b>Shift</b> để chạy · Kéo chuột để xoay góc nhìn</span>
        ) : (
          <span>💡 <b>Chuột trái:</b> Xoay 360° · <b>Cuộn:</b> Phóng to/nhỏ · <b>Chuột phải:</b> Dịch chuyển · <b>Click tòa nhà:</b> Xem thông tin</span>
        )}
      </div>
    </div>
  );
}
