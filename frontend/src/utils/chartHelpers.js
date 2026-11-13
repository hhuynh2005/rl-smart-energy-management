/**
 * Pure chart, sparkline, and expanded dock layout helpers
 * guarding against incomplete timelines, NaN coordinates, and narrow-viewport overlap.
 */

export function getSafeChartTickIndices(length) {
  if (!Number.isFinite(length) || length <= 0) return [];
  if (length === 1) return [0];
  if (length >= 96) return [0, 16, 32, 48, 64, 80, 95];

  const desiredCount = Math.min(7, length);
  const indices = new Set();
  for (let i = 0; i < desiredCount; i++) {
    const idx = Math.round((i / (desiredCount - 1)) * (length - 1));
    indices.add(idx);
  }
  return Array.from(indices).sort((a, b) => a - b);
}

export function computeSparklineData(
  timeline,
  getValue,
  w = 72,
  h = 24,
  fixedMin = null,
  fixedMax = null,
  currentStep = 0
) {
  if (!Array.isArray(timeline) || timeline.length === 0) return null;

  const values = timeline.map((d) => {
    const raw = getValue(d);
    return Number.isFinite(raw) ? raw : 0;
  });

  const min = fixedMin !== null ? fixedMin : Math.min(...values);
  const max = fixedMax !== null ? fixedMax : Math.max(...values, min + 0.001);
  const range = max - min || 1;
  const denom = Math.max(1, timeline.length - 1);

  const points = values.map((v, idx) => {
    const x = timeline.length === 1 ? w / 2 : (idx / denom) * w;
    const y = h - ((v - min) / range) * (h - 6) - 3;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  const currentIdx = Math.max(0, Math.min(currentStep, timeline.length - 1));
  const curX = timeline.length === 1 ? w / 2 : (currentIdx / denom) * w;
  const curY = h - ((values[currentIdx] - min) / range) * (h - 6) - 3;

  return {
    polylineStr: points.join(' '),
    curX: Number(curX.toFixed(1)),
    curY: Number(curY.toFixed(1)),
  };
}

export function computeExpandedDockBounds({ viewportW = 1280, hasInspector = false }) {
  const inspectorSpace = hasInspector ? 344 : 28;
  const maxAvailable = Math.max(320, viewportW - 14 - inspectorSpace);
  const width = Math.min(1040, maxAvailable);
  const centeredLeft = Math.max(14, (viewportW - width) / 2);

  if (hasInspector) {
    const inspectorLeft = viewportW - 12 - 310;
    const safeMaxLeft = Math.max(14, inspectorLeft - 14 - width);
    return {
      left: Math.min(centeredLeft, safeMaxLeft),
      width,
    };
  }

  return {
    left: centeredLeft,
    width,
  };
}
