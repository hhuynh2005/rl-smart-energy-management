import * as THREE from 'three';

/**
 * Procedural PBR Texture Generator for TLU Campus & SEMS-RL Digital Twin
 * Zero external network dependency - 100% offline procedural canvas textures.
 */

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

export function getSolarCellTexture() {
  return createCachedCanvasTexture('solar_cell', 512, 512, (ctx, w, h) => {
    const grad = ctx.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, '#0F172A');
    grad.addColorStop(0.5, '#1E293B');
    grad.addColorStop(1, '#0B132B');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    const cols = 6;
    const rows = 10;
    const cellW = w / cols;
    const cellH = h / rows;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = c * cellW;
        const y = r * cellH;
        ctx.fillStyle = '#0F2042';
        ctx.fillRect(x + 2, y + 2, cellW - 4, cellH - 4);

        const waferGrad = ctx.createLinearGradient(x, y, x + cellW, y + cellH);
        waferGrad.addColorStop(0, 'rgba(37, 99, 235, 0.25)');
        waferGrad.addColorStop(0.5, 'rgba(30, 58, 138, 0.45)');
        waferGrad.addColorStop(1, 'rgba(15, 23, 42, 0.6)');
        ctx.fillStyle = waferGrad;
        ctx.fillRect(x + 3, y + 3, cellW - 6, cellH - 6);

        ctx.strokeStyle = 'rgba(203, 213, 225, 0.22)';
        ctx.lineWidth = 1;
        for (let f = 6; f < cellH - 6; f += 5) {
          ctx.beginPath();
          ctx.moveTo(x + 4, y + f);
          ctx.lineTo(x + cellW - 4, y + f);
          ctx.stroke();
        }

        ctx.strokeStyle = '#CBD5E1';
        ctx.lineWidth = 1.5;
        [cellW * 0.25, cellW * 0.5, cellW * 0.75].forEach((bx) => {
          ctx.beginPath();
          ctx.moveTo(x + bx, y + 2);
          ctx.lineTo(x + bx, y + cellH - 2);
          ctx.stroke();
        });
      }
    }
  });
}

export function getAsphaltTexture() {
  return createCachedCanvasTexture('asphalt_road', 1024, 512, (ctx, w, h) => {
    ctx.fillStyle = '#363C44';
    ctx.fillRect(0, 0, w, h);

    const imgData = ctx.getImageData(0, 0, w, h);
    const d = imgData.data;
    for (let i = 0; i < d.length; i += 4) {
      const noise = (Math.random() - 0.5) * 18;
      d[i] = Math.min(255, Math.max(0, d[i] + noise));
      d[i + 1] = Math.min(255, Math.max(0, d[i + 1] + noise));
      d[i + 2] = Math.min(255, Math.max(0, d[i + 2] + noise));
    }
    ctx.putImageData(imgData, 0, 0);

    ctx.strokeStyle = 'rgba(241, 245, 249, 0.75)';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(0, 18);
    ctx.lineTo(w, 18);
    ctx.moveTo(0, h - 18);
    ctx.lineTo(w, h - 18);
    ctx.stroke();

    ctx.strokeStyle = '#FACC15';
    ctx.lineWidth = 5;
    ctx.setLineDash([44, 34]);
    ctx.beginPath();
    ctx.moveTo(0, h * 0.5);
    ctx.lineTo(w, h * 0.5);
    ctx.stroke();
    ctx.setLineDash([]);
  });
}

export function getGrassTexture() {
  return createCachedCanvasTexture('grass_terrain', 512, 512, (ctx, w, h) => {
    ctx.fillStyle = '#4B7C3E';
    ctx.fillRect(0, 0, w, h);

    const imgData = ctx.getImageData(0, 0, w, h);
    const d = imgData.data;
    for (let i = 0; i < d.length; i += 4) {
      const n = (Math.random() - 0.5) * 26;
      d[i] = Math.min(255, Math.max(0, 75 + n * 0.7));
      d[i + 1] = Math.min(255, Math.max(0, 124 + n));
      d[i + 2] = Math.min(255, Math.max(0, 62 + n * 0.5));
    }
    ctx.putImageData(imgData, 0, 0);
  });
}

export function getBessContainerTexture() {
  return createCachedCanvasTexture('bess_container', 1024, 512, (ctx, w, h) => {
    ctx.fillStyle = '#E2E8F0';
    ctx.fillRect(0, 0, w, h);

    for (let x = 0; x < w; x += 24) {
      ctx.fillStyle = 'rgba(148, 163, 184, 0.3)';
      ctx.fillRect(x, 0, 3, h);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.fillRect(x + 3, 0, 2, h);
    }

    ctx.fillStyle = '#0F172A';
    ctx.fillRect(80, 60, 420, 100);
    ctx.strokeStyle = '#06B6D4';
    ctx.lineWidth = 3;
    ctx.strokeRect(80, 60, 420, 100);

    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 36px "JetBrains Mono", monospace';
    ctx.fillText('SEMS-RL BESS', 105, 115);

    ctx.fillStyle = '#06B6D4';
    ctx.font = 'bold 20px "JetBrains Mono", monospace';
    ctx.fillText('200 kWh / 50 kW LFP MEGAPACK', 105, 145);

    ctx.fillStyle = '#EF4444';
    ctx.beginPath();
    ctx.moveTo(560, 150);
    ctx.lineTo(600, 70);
    ctx.lineTo(640, 150);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#1E293B';
    ctx.font = 'bold 15px "JetBrains Mono", monospace';
    ctx.fillText('TLU MICROGRID - ESSENTIAL POWER', 540, 180);

    ctx.fillStyle = '#334155';
    for (let y = 240; y < 450; y += 14) {
      ctx.fillRect(80, y, 380, 7);
      ctx.fillRect(540, y, 400, 7);
    }
  });
}

export function getConcreteTexture() {
  return createCachedCanvasTexture('concrete_paving', 512, 512, (ctx, w, h) => {
    ctx.fillStyle = '#CBD5E1';
    ctx.fillRect(0, 0, w, h);

    const imgData = ctx.getImageData(0, 0, w, h);
    const d = imgData.data;
    for (let i = 0; i < d.length; i += 4) {
      const n = (Math.random() - 0.5) * 16;
      d[i] = Math.min(255, Math.max(0, d[i] + n));
      d[i + 1] = Math.min(255, Math.max(0, d[i + 1] + n));
      d[i + 2] = Math.min(255, Math.max(0, d[i + 2] + n));
    }
    ctx.putImageData(imgData, 0, 0);

    ctx.strokeStyle = 'rgba(100, 116, 139, 0.35)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(w * 0.5, 0);
    ctx.lineTo(w * 0.5, h);
    ctx.moveTo(0, h * 0.5);
    ctx.lineTo(w, h * 0.5);
    ctx.stroke();
  });
}

export function getWaterRippleTexture() {
  return createCachedCanvasTexture('water_normal', 256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#8080FF';
    ctx.fillRect(0, 0, w, h);
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

/**
 * 7. TLU Football Pitch Texture (Alternating grass mowing stripes + crisp white pitch lines)
 */
export function getFootballPitchTexture() {
  return createCachedCanvasTexture('tlu_football_pitch', 1024, 512, (ctx, w, h) => {
    const stripes = 12;
    const sw = w / stripes;
    for (let i = 0; i < stripes; i++) {
      ctx.fillStyle = i % 2 === 0 ? '#2F7D32' : '#388E3C';
      ctx.fillRect(i * sw, 0, sw + 1, h);
    }

    const padX = 48;
    const padY = 36;
    const fw = w - padX * 2;
    const fh = h - padY * 2;

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.92)';
    ctx.lineWidth = 5;
    ctx.strokeRect(padX, padY, fw, fh);

    // Center line & circle
    ctx.beginPath();
    ctx.moveTo(w / 2, padY);
    ctx.lineTo(w / 2, h - padY);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(w / 2, h / 2, 68, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, 6, 0, Math.PI * 2);
    ctx.fill();

    // Penalty boxes
    ctx.strokeRect(padX, h / 2 - 110, 120, 220);
    ctx.strokeRect(padX, h / 2 - 52, 46, 104);
    ctx.strokeRect(w - padX - 120, h / 2 - 110, 120, 220);
    ctx.strokeRect(w - padX - 46, h / 2 - 52, 46, 104);
  });
}

/**
 * 8. TLU Volleyball Court Texture
 */
export function getVolleyballCourtTexture() {
  return createCachedCanvasTexture('tlu_volleyball_court', 512, 512, (ctx, w, h) => {
    ctx.fillStyle = '#1D4ED8';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#EA580C';
    ctx.fillRect(54, 68, w - 108, h - 136);
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 6;
    ctx.strokeRect(54, 68, w - 108, h - 136);
    ctx.beginPath();
    ctx.moveTo(54, h / 2);
    ctx.lineTo(w - 54, h / 2);
    ctx.moveTo(54, h / 2 - 64);
    ctx.lineTo(w - 54, h / 2 - 64);
    ctx.moveTo(54, h / 2 + 64);
    ctx.lineTo(w - 54, h / 2 + 64);
    ctx.stroke();
  });
}

/**
 * 9. Campus Plaza Tile Texture (Sân trước A1 & walkways)
 */
export function getCampusPlazaTexture() {
  return createCachedCanvasTexture('tlu_campus_plaza', 512, 512, (ctx, w, h) => {
    ctx.fillStyle = '#D6D3D1';
    ctx.fillRect(0, 0, w, h);
    const step = 64;
    ctx.strokeStyle = 'rgba(120, 113, 108, 0.35)';
    ctx.lineWidth = 2;
    for (let x = 0; x <= w; x += step) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = 0; y <= h; y += step) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
  });
}

/**
 * 10. Terracotta Roof Shingle Texture
 */
export function getTerracottaRoofTexture() {
  return createCachedCanvasTexture('tlu_terracotta_roof', 512, 512, (ctx, w, h) => {
    ctx.fillStyle = '#8B2620';
    ctx.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 24) {
      ctx.fillStyle = y % 48 === 0 ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.06)';
      ctx.fillRect(0, y, w, 6);
    }
  });
}
