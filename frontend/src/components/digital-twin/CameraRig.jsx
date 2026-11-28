import React, { useRef, useEffect } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { CAMERA_PRESETS, clampWalkPosition } from './campusLayout';
import { useQualityStore } from '../../store/useQualityStore';

const PRESET_KEY_LIST = [
  'overview',
  'a1_facade',
  'front_gate',
  'football_field',
  'solar',
  'bess',
  'grid',
];

/**
 * CameraRig - Unified 3-Mode Camera Controller for TLU Campus
 * Modes:
 * - 'orbit' (Trên cảnh): smooth OrbitControls + preset transitions + autoRotate
 * - 'satellite' (Vệ tinh): top-down locked rotation, left-click pan & zoom
 * - 'walk' (Đi bộ): eye-level WASD/Arrow movement + pointer drag look + bounds clamp
 */
export default function CameraRig() {
  const { camera, gl } = useThree();
  const controlsRef = useRef();

  const viewMode3D = useQualityStore((s) => s.viewMode3D);
  const activePreset = useQualityStore((s) => s.activePreset);
  const autoRotate = useQualityStore((s) => s.autoRotate);
  const minimapFocusTarget = useQualityStore((s) => s.minimapFocusTarget);
  const selectPreset = useQualityStore((s) => s.selectPreset);
  const setCameraTelemetry = useQualityStore((s) => s.setCameraTelemetry);

  const targetPos = useRef(new THREE.Vector3(...CAMERA_PRESETS.overview.pos));
  const targetLook = useRef(new THREE.Vector3(...CAMERA_PRESETS.overview.look));
  const isTransitioning = useRef(false);

  // Walk mode state
  const keysPressed = useRef({});
  const walkLook = useRef({ yaw: 0, pitch: -0.04 });
  const isDraggingWalk = useRef(false);
  const lastPointer = useRef({ x: 0, y: 0 });

  // Throttle minimap telemetry publishing
  const lastTelemetryRef = useRef({ x: 0, z: 0, yaw: 0, time: 0 });
  const tempEuler = useRef(new THREE.Euler(0, 0, 0, 'YXZ'));

  // Handle viewMode3D transitions
  useEffect(() => {
    if (viewMode3D === 'satellite') {
      targetPos.current.set(0, 185, 8);
      targetLook.current.set(0, 0, 0);
      isTransitioning.current = true;
    } else if (viewMode3D === 'walk') {
      isTransitioning.current = false;
      const clamped = clampWalkPosition(camera.position.x, camera.position.z);
      // If coming from far high altitude, drop gracefully onto Sân trước A1 plaza
      if (camera.position.y > 40) {
        camera.position.set(-4, 2.2, 54);
        walkLook.current = { yaw: 0, pitch: 0.02 };
      } else {
        camera.position.set(clamped.x, 2.2, clamped.z);
      }
    } else {
      const p = CAMERA_PRESETS[activePreset] || CAMERA_PRESETS.overview;
      targetPos.current.set(...p.pos);
      targetLook.current.set(...p.look);
      isTransitioning.current = true;
    }
  }, [viewMode3D, activePreset, camera]);

  // Handle minimap click-to-focus
  useEffect(() => {
    if (!minimapFocusTarget) return;
    const { x, z } = minimapFocusTarget;
    if (viewMode3D === 'walk') {
      const clamped = clampWalkPosition(x, z);
      camera.position.set(clamped.x, 2.2, clamped.z);
    } else if (viewMode3D === 'satellite') {
      targetPos.current.set(x, camera.position.y, z + 6);
      targetLook.current.set(x, 0, z);
      isTransitioning.current = true;
    } else {
      const offset = controlsRef.current
        ? new THREE.Vector3().subVectors(camera.position, controlsRef.current.target)
        : new THREE.Vector3(0, 52, 72);
      targetLook.current.set(x, 2, z);
      targetPos.current.set(x + offset.x, Math.max(18, offset.y), z + offset.z);
      isTransitioning.current = true;
    }
  }, [minimapFocusTarget, viewMode3D, camera]);

  // Keyboard shortcuts 1-7 + Walk WASD/Arrows (strictly guarded on editable inputs)
  useEffect(() => {
    const isEditable = (el) =>
      el && ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName);

    const onKeyDown = (e) => {
      if (isEditable(e.target)) return;
      const idx = parseInt(e.key, 10) - 1;
      if (idx >= 0 && idx < PRESET_KEY_LIST.length) {
        selectPreset(PRESET_KEY_LIST[idx]);
        return;
      }
      keysPressed.current[e.code] = true;
    };

    const onKeyUp = (e) => {
      keysPressed.current[e.code] = false;
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [selectPreset]);

  // Pointer drag look for Walk mode
  useEffect(() => {
    if (viewMode3D !== 'walk') return undefined;
    const dom = gl.domElement;

    const onPointerDown = (e) => {
      isDraggingWalk.current = true;
      lastPointer.current = { x: e.clientX, y: e.clientY };
    };
    const onPointerMove = (e) => {
      if (!isDraggingWalk.current) return;
      const dx = e.clientX - lastPointer.current.x;
      const dy = e.clientY - lastPointer.current.y;
      lastPointer.current = { x: e.clientX, y: e.clientY };
      walkLook.current.yaw -= dx * 0.0045;
      walkLook.current.pitch = Math.max(
        -0.55,
        Math.min(0.65, walkLook.current.pitch - dy * 0.0035)
      );
    };
    const onPointerUp = () => {
      isDraggingWalk.current = false;
    };

    dom.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    return () => {
      dom.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };
  }, [viewMode3D, gl]);

  useFrame(({ clock }, delta) => {
    if (viewMode3D === 'walk') {
      const k = keysPressed.current;
      const speed = (k.ShiftLeft || k.ShiftRight ? 26 : 13) * Math.min(delta, 0.1);
      const forward = new THREE.Vector3(
        -Math.sin(walkLook.current.yaw),
        0,
        -Math.cos(walkLook.current.yaw)
      );
      const right = new THREE.Vector3(
        Math.cos(walkLook.current.yaw),
        0,
        -Math.sin(walkLook.current.yaw)
      );

      let nextX = camera.position.x;
      let nextZ = camera.position.z;
      if (k.KeyW || k.ArrowUp) {
        nextX += forward.x * speed;
        nextZ += forward.z * speed;
      }
      if (k.KeyS || k.ArrowDown) {
        nextX -= forward.x * speed;
        nextZ -= forward.z * speed;
      }
      if (k.KeyD || k.ArrowRight) {
        nextX += right.x * speed;
        nextZ += right.z * speed;
      }
      if (k.KeyA || k.ArrowLeft) {
        nextX -= right.x * speed;
        nextZ -= right.z * speed;
      }

      const clamped = clampWalkPosition(nextX, nextZ);
      camera.position.set(clamped.x, 2.2, clamped.z);
      tempEuler.current.set(walkLook.current.pitch, walkLook.current.yaw, 0, 'YXZ');
      camera.quaternion.setFromEuler(tempEuler.current);
    } else if (isTransitioning.current && controlsRef.current) {
      camera.position.lerp(targetPos.current, Math.min(1, delta * 4.0));
      controlsRef.current.target.lerp(targetLook.current, Math.min(1, delta * 4.0));
      controlsRef.current.update();

      if (
        camera.position.distanceTo(targetPos.current) < 0.25 &&
        controlsRef.current.target.distanceTo(targetLook.current) < 0.25
      ) {
        camera.position.copy(targetPos.current);
        controlsRef.current.target.copy(targetLook.current);
        controlsRef.current.update();
        isTransitioning.current = false;
      }
    }

    // Publish camera telemetry to minimap (~20Hz max)
    const now = clock.getElapsedTime();
    if (now - lastTelemetryRef.current.time > 0.05) {
      const tx = controlsRef.current
        ? controlsRef.current.target.x
        : camera.position.x - Math.sin(walkLook.current.yaw) * 18;
      const tz = controlsRef.current
        ? controlsRef.current.target.z
        : camera.position.z - Math.cos(walkLook.current.yaw) * 18;
      const yaw =
        viewMode3D === 'walk'
          ? walkLook.current.yaw
          : Math.atan2(tx - camera.position.x, tz - camera.position.z);

      if (
        Math.abs(camera.position.x - lastTelemetryRef.current.x) > 0.5 ||
        Math.abs(camera.position.z - lastTelemetryRef.current.z) > 0.5 ||
        Math.abs(yaw - lastTelemetryRef.current.yaw) > 0.05
      ) {
        lastTelemetryRef.current = { x: camera.position.x, z: camera.position.z, yaw, time: now };
        setCameraTelemetry({
          x: camera.position.x,
          z: camera.position.z,
          yaw,
          targetX: tx,
          targetZ: tz,
        });
      }
    }
  });

  if (viewMode3D === 'walk') return null;

  return (
    <OrbitControls
      ref={controlsRef}
      enableDamping
      dampingFactor={0.07}
      enableRotate={viewMode3D === 'orbit'}
      minPolarAngle={viewMode3D === 'satellite' ? 0.02 : 0.12}
      maxPolarAngle={viewMode3D === 'satellite' ? 0.08 : Math.PI / 2 - 0.05}
      minDistance={12}
      maxDistance={250}
      autoRotate={viewMode3D === 'orbit' && autoRotate}
      autoRotateSpeed={0.65}
      mouseButtons={
        viewMode3D === 'satellite'
          ? {
              LEFT: THREE.MOUSE.PAN,
              MIDDLE: THREE.MOUSE.DOLLY,
              RIGHT: THREE.MOUSE.PAN,
            }
          : {
              LEFT: THREE.MOUSE.ROTATE,
              MIDDLE: THREE.MOUSE.DOLLY,
              RIGHT: THREE.MOUSE.PAN,
            }
      }
      onStart={() => {
        isTransitioning.current = false;
      }}
    />
  );
}
