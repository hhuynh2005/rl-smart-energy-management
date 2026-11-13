import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CAMPUS_BOUNDS,
  CAMPUS_BUILDINGS,
  CAMPUS_ZONES,
  MICROGRID_NODES,
  CAMERA_PRESETS,
  worldToMinimap,
  minimapToWorld,
  clampWalkPosition,
} from './campusLayout.js';

test('building loadShare weights sum to 1.0 and cover core TLU buildings', () => {
  const totalShare = CAMPUS_BUILDINGS.reduce((acc, b) => acc + (b.loadShare || 0), 0);
  assert.ok(Math.abs(totalShare - 1.0) < 1e-6, `Expected sum 1.0, got ${totalShare}`);
  const ids = new Set(CAMPUS_BUILDINGS.map((b) => b.id));
  for (const required of [
    'a1',
    'a2',
    'a3',
    'a4',
    'a5',
    't45',
    'b1',
    'b2',
    'b3',
    'b4',
    'b5',
    'c1',
    'library',
    'td',
    'k1',
    'ktx1',
    'ktx2',
    'ktx3',
    'ktx4',
    'canteen',
    'gdtc',
    'parking',
  ]) {
    assert.ok(ids.has(required), `Missing building ${required}`);
  }
});

test('rooftop PV buildings and microgrid nodes are configured', () => {
  const pvBuildings = CAMPUS_BUILDINGS.filter((b) => b.hasRooftopPv);
  assert.ok(pvBuildings.length >= 4);
  assert.ok(
    MICROGRID_NODES.bess &&
      MICROGRID_NODES.grid &&
      MICROGRID_NODES.solar &&
      MICROGRID_NODES.hub
  );
  const zoneIds = new Set(CAMPUS_ZONES.map((z) => z.id));
  for (const z of ['san_truoc_a1', 'vong_xoay_giua', 'san_bong', 'cong_truoc', 'cong_sau']) {
    assert.ok(zoneIds.has(z), `Missing zone ${z}`);
  }
});

test('worldToMinimap and minimapToWorld are exact inverses within campus bounds', () => {
  const mapW = 190;
  const mapH = 136;
  const { mx, my } = worldToMinimap(18, -24, mapW, mapH);
  assert.ok(mx >= 0 && mx <= mapW && my >= 0 && my <= mapH);
  const back = minimapToWorld(mx, my, mapW, mapH);
  assert.ok(Math.abs(back.x - 18) < 1e-6);
  assert.ok(Math.abs(back.z - -24) < 1e-6);
});

test('camera presets include 4 TLU views + 3 microgrid views and walk clamping stays inside bounds', () => {
  for (const key of ['overview', 'a1_facade', 'front_gate', 'football_field', 'solar', 'bess', 'grid']) {
    assert.ok(CAMERA_PRESETS[key], `Missing preset ${key}`);
  }
  const clamped = clampWalkPosition(999, -999);
  assert.ok(clamped.x <= CAMPUS_BOUNDS.maxX && clamped.z >= CAMPUS_BOUNDS.minZ);
  assert.ok(clamped.x >= CAMPUS_BOUNDS.minX && clamped.z <= CAMPUS_BOUNDS.maxZ);
});
