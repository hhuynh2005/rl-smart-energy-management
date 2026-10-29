import * as THREE from 'three';

/**
 * Procedural PBR Texture Generator for Photorealistic Digital Twin
 * Produces crisp, high-res canvas textures (Albedo, Roughness, Bump/Normal)
 * Zero external network dependency - 100% offline, instantaneous boot.
 */

// Cache textures so they are created only once
const textureCache = {};

function createCachedCanvasTexture(key, width, height, drawFn) {
  if (textureCache[key]) return textureCache[key];
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  drawFn(ctx, width, height);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  textureCache[key] = texture;
  return texture;
}

/**
 * 1. Solar Monocrystalline PV Panel Texture
 * Features deep navy/cyan anti-reflective cell wafer, silver busbars, grid fingers
 */
export function getSolarCellTexture() {
  return createCachedCanvasTexture('solar_cell', 512, 512, (ctx, w, h) => {
    // Deep monocrystalline dark navy-indigo base
    const grad = ctx.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, '#0F172A');
    grad.addColorStop(0.5, '#1E293B');
    grad.addColorStop(1, '#0B132B');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Silicon wafer 6x10 cell grid
    const cols = 6;
    const rows = 10;
    const cellW = w / cols;
    const cellH = h / rows;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = c * cellW;
        const y = r * cellH;

        // Individual cell wafer with chamfered corners
        ctx.fillStyle = '#0F2042';
        ctx.fillRect(x + 2, y + 2, cellW - 4, cellH - 4);

        // Subtle wafer crystal shimmer gradient
        const waferGrad = ctx.createLinearGradient(x, y, x + cellW, y + cellH);
        waferGrad.addColorStop(0, 'rgba(37, 99, 235, 0.25)');
        waferGrad.addColorStop(0.5, 'rgba(30, 58, 138, 0.45)');
        waferGrad.addColorStop(1, 'rgba(15, 23, 42, 0.6)');
        ctx.fillStyle = waferGrad;
        ctx.fillRect(x + 3, y + 3, cellW - 6, cellH - 6);

        // Chamfer cell corners (monocrystalline signature)
        ctx.fillStyle = '#0F172A';
        ctx.beginPath();
        ctx.moveTo(x + 2, y + 2);
        ctx.lineTo(x + 6, y + 2);
        ctx.lineTo(x + 2, y + 6);
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(x + cellW - 2, y + 2);
        ctx.lineTo(x + cellW - 6, y + 2);
        ctx.lineTo(x + cellW - 2, y + 6);
        ctx.fill();

        // Microscopic silver finger grid
        ctx.strokeStyle = 'rgba(203, 213, 225, 0.22)';
        ctx.lineWidth = 1;
        for (let f = 6; f < cellH - 6; f += 5) {
          ctx.beginPath();
          ctx.moveTo(x + 4, y + f);
          ctx.lineTo(x + cellW - 4, y + f);
          ctx.stroke();
        }

        // 3 Vertical silver busbars per cell
        ctx.strokeStyle = '#CBD5E1';
        ctx.lineWidth = 1.5;
        const bbOffsets = [cellW * 0.25, cellW * 0.5, cellW * 0.75];
        bbOffsets.forEach((bx) => {
          ctx.beginPath();
          ctx.moveTo(x + bx, y + 2);
          ctx.lineTo(x + bx, y + cellH - 2);
          ctx.stroke();
        });
      }
    }
  });
}

/**
 * 2. Asphalt Road with Lanes & Skid Marks
 */
export function getAsphaltTexture() {
  return createCachedCanvasTexture('asphalt_road', 1024, 512, (ctx, w, h) => {
    // Dark asphalt aggregate base
    ctx.fillStyle = '#22252A';
    ctx.fillRect(0, 0, w, h);

    // Fine mineral aggregate noise
    const imgData = ctx.getImageData(0, 0, w, h);
    const d = imgData.data;
    for (let i = 0; i < d.length; i += 4) {
      const noise = (Math.random() - 0.5) * 28;
      d[i] = Math.min(255, Math.max(0, d[i] + noise));
      d[i + 1] = Math.min(255, Math.max(0, d[i + 1] + noise));
      d[i + 2] = Math.min(255, Math.max(0, d[i + 2] + noise));
    }
    ctx.putImageData(imgData, 0, 0);

    // Subtle tire wheel track wear (darker strips)
    ctx.fillStyle = 'rgba(15, 17, 21, 0.45)';
    ctx.fillRect(0, h * 0.2, w, h * 0.18);
    ctx.fillRect(0, h * 0.62, w, h * 0.18);

    // Solid white edge lines
    ctx.strokeStyle = 'rgba(241, 245, 249, 0.85)';
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(0, 18);
    ctx.lineTo(w, 18);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(0, h - 18);
    ctx.lineTo(w, h - 18);
    ctx.stroke();

    // Dashed center yellow/white line
    ctx.strokeStyle = '#FACC15';
    ctx.lineWidth = 6;
    ctx.setLineDash([48, 36]);
    ctx.beginPath();
    ctx.moveTo(0, h * 0.5);
    ctx.lineTo(w, h * 0.5);
    ctx.stroke();
    ctx.setLineDash([]);
  });
}

/**
 * 3. Grass Landscape PBR Texture
 */
export function getGrassTexture() {
  return createCachedCanvasTexture('grass_terrain', 512, 512, (ctx, w, h) => {
    // Base lush lawn green
    ctx.fillStyle = '#2E5A27';
    ctx.fillRect(0, 0, w, h);

    // Noise variation (spring green, deep moss, olive lawn)
    const imgData = ctx.getImageData(0, 0, w, h);
    const d = imgData.data;
    for (let i = 0; i < d.length; i += 4) {
      const n = (Math.random() - 0.5) * 40;
      d[i] = Math.min(255, Math.max(0, 46 + n * 0.8));
      d[i + 1] = Math.min(255, Math.max(0, 90 + n * 1.2));
      d[i + 2] = Math.min(255, Math.max(0, 39 + n * 0.5));
    }
    ctx.putImageData(imgData, 0, 0);

    // Add fine blades of grass details
    ctx.strokeStyle = 'rgba(74, 138, 59, 0.5)';
    ctx.lineWidth = 1;
    for (let k = 0; k < 600; k++) {
      const gx = Math.random() * w;
      const gy = Math.random() * h;
      ctx.beginPath();
      ctx.moveTo(gx, gy);
      ctx.lineTo(gx + (Math.random() - 0.5) * 6, gy - (Math.random() * 8 + 3));
      ctx.stroke();
    }
  });
}

/**
 * 4. Industrial Metal Container / BESS Megapack Decal Texture
 */
export function getBessContainerTexture() {
  return createCachedCanvasTexture('bess_container', 1024, 512, (ctx, w, h) => {
    // Premium matte white / light gray industrial finish
    ctx.fillStyle = '#E2E8F0';
    ctx.fillRect(0, 0, w, h);

    // Corrugated vertical panel grooves
    const grooveW = 24;
    for (let x = 0; x < w; x += grooveW) {
      ctx.fillStyle = 'rgba(148, 163, 184, 0.3)';
      ctx.fillRect(x, 0, 3, h);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.fillRect(x + 3, 0, 2, h);
    }

    // Top BESS Logo Panel
    ctx.fillStyle = '#0F172A';
    ctx.fillRect(80, 60, 420, 100);
    ctx.strokeStyle = '#06B6D4';
    ctx.lineWidth = 3;
    ctx.strokeRect(80, 60, 420, 100);

    // BESS Text & Branding
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 36px "JetBrains Mono", monospace';
    ctx.fillText('SEMS-RL BESS', 105, 115);

    ctx.fillStyle = '#06B6D4';
    ctx.font = 'bold 20px "JetBrains Mono", monospace';
    ctx.fillText('200 kWh / 100 kW LFP MEGAPACK', 105, 145);

    // High Voltage Danger Warning Symbol
    ctx.fillStyle = '#EF4444';
    ctx.beginPath();
    ctx.moveTo(560, 150);
    ctx.lineTo(600, 70);
    ctx.lineTo(640, 150);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 26px sans-serif';
    ctx.fillText('⚡', 590, 138);

    ctx.fillStyle = '#1E293B';
    ctx.font = 'bold 15px "JetBrains Mono", monospace';
    ctx.fillText('400V 3-PHASE ESS - ESSENTIAL POWER', 540, 180);

    // Louver Ventilation Grills (left & right cooling intake)
    ctx.fillStyle = '#334155';
    for (let y = 240; y < 450; y += 14) {
      ctx.fillRect(80, y, 380, 7);
      ctx.fillRect(540, y, 400, 7);
    }
  });
}

/**
 * 5. Architectural Concrete Paving Texture
 */
export function getConcreteTexture() {
  return createCachedCanvasTexture('concrete_paving', 512, 512, (ctx, w, h) => {
    ctx.fillStyle = '#94A3B8';
    ctx.fillRect(0, 0, w, h);

    // Concrete aggregate noise
    const imgData = ctx.getImageData(0, 0, w, h);
    const d = imgData.data;
    for (let i = 0; i < d.length; i += 4) {
      const n = (Math.random() - 0.5) * 22;
      d[i] = Math.min(255, Math.max(0, d[i] + n));
      d[i + 1] = Math.min(255, Math.max(0, d[i + 1] + n));
      d[i + 2] = Math.min(255, Math.max(0, d[i + 2] + n));
    }
    ctx.putImageData(imgData, 0, 0);

    // Expansion joint grid (2x2 slabs)
    ctx.strokeStyle = 'rgba(51, 65, 85, 0.45)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(w * 0.5, 0);
    ctx.lineTo(w * 0.5, h);
    ctx.moveTo(0, h * 0.5);
    ctx.lineTo(w, h * 0.5);
    ctx.stroke();
  });
}

/**
 * 6. Water Ripple Normal Texture
 */
export function getWaterRippleTexture() {
  return createCachedCanvasTexture('water_normal', 256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#8080FF'; // Neutral tangent normal
    ctx.fillRect(0, 0, w, h);

    // Subtle gentle ripples
    for (let i = 0; i < 40; i++) {
      const rx = Math.random() * w;
      const ry = Math.random() * h;
      const rad = Math.random() * 40 + 10;
      const grad = ctx.createRadialGradient(rx, ry, 2, rx, ry, rad);
      grad.addColorStop(0, 'rgba(140, 140, 255, 0.8)');
      grad.addColorStop(0.5, 'rgba(128, 128, 255, 0.2)');
      grad.addColorStop(1, 'rgba(120, 120, 255, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(rx, ry, rad, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

