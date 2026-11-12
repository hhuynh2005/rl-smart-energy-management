import React, { useEffect, useRef } from 'react';
import { Activity } from 'lucide-react';
import {
  CAMPUS_BUILDINGS,
  CAMPUS_ZONES,
  CAMPUS_ROADS,
  MICROGRID_NODES,
  worldToMinimap,
  minimapToWorld,
} from './digital-twin/campusLayout';
import { useQualityStore } from '../store/useQualityStore';

const MAP_W = 190;
const MAP_H = 136;

/**
 * CampusMinimap - Top-right 2D radar minimap synced to campusLayout.js & live camera position
 * Clicking anywhere on the minimap focuses the 3D camera onto that campus location.
 */
export default function CampusMinimap() {
  const canvasRef = useRef(null);
  const fps = useQualityStore((s) => s.fps);
  const cameraTelemetry = useQualityStore((s) => s.cameraTelemetry);
  const selectedEntity = useQualityStore((s) => s.selectedEntity);
  const focusFromMinimap = useQualityStore((s) => s.focusFromMinimap);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    // 1. Campus Turf Background
    ctx.fillStyle = '#D9EAD3';
    ctx.fillRect(0, 0, MAP_W, MAP_H);

    // 2. Roads
    ctx.strokeStyle = '#64748B';
    ctx.lineCap = 'round';
    CAMPUS_ROADS.forEach((road) => {
      const p1 = worldToMinimap(road.points[0][0], road.points[0][1], MAP_W, MAP_H);
      const p2 = worldToMinimap(road.points[1][0], road.points[1][1], MAP_W, MAP_H);
      ctx.lineWidth = road.isMainAvenue ? 6 : 3.5;
      ctx.beginPath();
      ctx.moveTo(p1.mx, p1.my);
      ctx.lineTo(p2.mx, p2.my);
      ctx.stroke();
    });

    // 3. Sports Pitch & Roundabout
    const pitch = CAMPUS_ZONES.find((z) => z.id === 'san_bong');
    if (pitch) {
      const tl = worldToMinimap(pitch.x - pitch.width / 2, pitch.z - pitch.depth / 2, MAP_W, MAP_H);
      const br = worldToMinimap(pitch.x + pitch.width / 2, pitch.z + pitch.depth / 2, MAP_W, MAP_H);
      ctx.fillStyle = '#2E7D32';
      ctx.fillRect(tl.mx, tl.my, br.mx - tl.mx, br.my - tl.my);
      ctx.strokeStyle = 'rgba(255,255,255,0.75)';
      ctx.lineWidth = 1;
      ctx.strokeRect(tl.mx + 2, tl.my + 2, br.mx - tl.mx - 4, br.my - tl.my - 4);
    }

    const rb = CAMPUS_ZONES.find((z) => z.id === 'vong_xoay_giua');
    if (rb) {
      const c = worldToMinimap(rb.x, rb.z, MAP_W, MAP_H);
      ctx.fillStyle = '#64748B';
      ctx.beginPath();
      ctx.arc(c.mx, c.my, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#4ADE80';
      ctx.beginPath();
      ctx.arc(c.mx, c.my, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    // 4. Campus Buildings
    CAMPUS_BUILDINGS.forEach((b) => {
      const tl = worldToMinimap(b.x - b.width / 2, b.z - b.depth / 2, MAP_W, MAP_H);
      const br = worldToMinimap(b.x + b.width / 2, b.z + b.depth / 2, MAP_W, MAP_H);
      const isSelected = selectedEntity?.type === 'building' && selectedEntity?.id === b.id;
      ctx.fillStyle = isSelected ? '#DC2626' : b.facadeColor;
      ctx.fillRect(tl.mx, tl.my, Math.max(3, br.mx - tl.mx), Math.max(3, br.my - tl.my));
      if (b.hasRooftopPv) {
        ctx.strokeStyle = '#F59E0B';
        ctx.lineWidth = 1;
        ctx.strokeRect(tl.mx, tl.my, Math.max(3, br.mx - tl.mx), Math.max(3, br.my - tl.my));
      }
    });

    // 5. Microgrid Device Nodes
    const nodeColors = {
      solar: '#F59E0B',
      bess: '#10B981',
      grid: '#7C3AED',
    };
    Object.entries(nodeColors).forEach(([key, color]) => {
      const node = MICROGRID_NODES[key];
      if (!node) return;
      const pt = worldToMinimap(node.x, node.z, MAP_W, MAP_H);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(pt.mx, pt.my, 3.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 1.2;
      ctx.stroke();
    });

    // 6. Live Camera Target & Viewing Wedge
    const targetPt = worldToMinimap(cameraTelemetry.targetX, cameraTelemetry.targetZ, MAP_W, MAP_H);
    const camPt = worldToMinimap(cameraTelemetry.x, cameraTelemetry.z, MAP_W, MAP_H);
    const angle = Math.atan2(targetPt.my - camPt.my, targetPt.mx - camPt.mx);

    // Subtle viewing line from camera to focus point
    ctx.strokeStyle = 'rgba(185, 28, 28, 0.5)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(camPt.mx, camPt.my);
    ctx.lineTo(targetPt.mx, targetPt.my);
    ctx.stroke();

    // FOV cone at camera position
    ctx.fillStyle = 'rgba(234, 88, 12, 0.25)';
    ctx.beginPath();
    ctx.moveTo(camPt.mx, camPt.my);
    ctx.arc(camPt.mx, camPt.my, 16, angle - 0.45, angle + 0.45);
    ctx.closePath();
    ctx.fill();

    // Camera Dot
    ctx.fillStyle = '#B91C1C';
    ctx.beginPath();
    ctx.arc(camPt.mx, camPt.my, 3.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 1.3;
    ctx.stroke();

    // Focus Target Ring
    ctx.strokeStyle = '#0F172A';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(targetPt.mx, targetPt.my, 3.2, 0, Math.PI * 2);
    ctx.stroke();
  }, [cameraTelemetry, selectedEntity]);

  const handleMinimapClick = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const mx = ((e.clientX - rect.left) / rect.width) * MAP_W;
    const my = ((e.clientY - rect.top) / rect.height) * MAP_H;
    const { x, z } = minimapToWorld(mx, my, MAP_W, MAP_H);
    focusFromMinimap(x, z);
  };

  return (
    <div className="campus-minimap-wrap">
      <div className="campus-minimap-card" title="Bấm vào bản đồ để di chuyển góc nhìn tới khu vực tương ứng">
        <canvas
          ref={canvasRef}
          width={MAP_W}
          height={MAP_H}
          className="campus-minimap-canvas"
          onClick={handleMinimapClick}
        />
      </div>

      <div
        className="fps-pill"
        style={{
          color: fps >= 50 ? '#059669' : fps >= 30 ? '#D97706' : '#DC2626',
        }}
      >
        <Activity size={12} />
        <span>{fps} FPS</span>
      </div>
    </div>
  );
}
