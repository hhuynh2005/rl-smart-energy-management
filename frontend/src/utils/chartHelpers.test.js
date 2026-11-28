import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getSafeChartTickIndices,
  computeSparklineData,
  computeExpandedDockBounds,
} from './chartHelpers.js';

test('getSafeChartTickIndices handles partial and 1-element timelines without out-of-bounds indices', () => {
  assert.deepEqual(getSafeChartTickIndices(0), []);
  assert.deepEqual(getSafeChartTickIndices(1), [0]);
  const partial = getSafeChartTickIndices(20);
  assert.ok(partial.length >= 2);
  assert.ok(partial.every((idx) => idx >= 0 && idx < 20));
  assert.deepEqual(getSafeChartTickIndices(96), [0, 16, 32, 48, 64, 80, 95]);
});

test('computeSparklineData handles undefined values and single-point timelines without NaN', () => {
  const single = computeSparklineData([{ p_pv_kw: undefined }], (d) => d.p_pv_kw, 72, 24, 0, 150, 0);
  assert.ok(single);
  assert.ok(!single.polylineStr.includes('NaN'), `Found NaN in ${single.polylineStr}`);
  assert.ok(!Number.isNaN(single.curX) && !Number.isNaN(single.curY));

  const partial = computeSparklineData(
    [{ p_pv_kw: 10 }, { p_pv_kw: undefined }, { p_pv_kw: 50 }],
    (d) => d.p_pv_kw,
    72,
    24,
    null,
    null,
    1
  );
  assert.ok(!partial.polylineStr.includes('NaN'));
  assert.ok(!Number.isNaN(partial.curX) && !Number.isNaN(partial.curY));
});

test('computeExpandedDockBounds avoids InspectorCard overlap on 1280px viewports', () => {
  const inspectorLeftEdge = 1280 - 12 - 310; // 958px
  const bounds = computeExpandedDockBounds({ viewportW: 1280, hasInspector: true });
  assert.ok(bounds.left + bounds.width <= inspectorLeftEdge - 10, `Dock overlaps inspector: ${bounds.left + bounds.width} > ${inspectorLeftEdge - 10}`);
});
