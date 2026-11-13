import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_STEP_DATA,
  clampMinute,
  formatMinuteHHMM,
  minuteToStepIndex,
  interpolateTimelineAtMinute,
} from './timeSync.js';

test('clampMinute handles bounds and invalid inputs', () => {
  assert.equal(clampMinute(-20), 0);
  assert.equal(clampMinute(1500), 1439);
  assert.equal(clampMinute(Number.NaN), 0);
  assert.equal(clampMinute(570.6), 571);
});

test('formatMinuteHHMM formats continuous minutes', () => {
  assert.equal(formatMinuteHHMM(0), '00:00');
  assert.equal(formatMinuteHHMM(570), '09:30');
  assert.equal(formatMinuteHHMM(1007), '16:47');
  assert.equal(formatMinuteHHMM(1439), '23:59');
});

test('minuteToStepIndex maps to 0..95 steps', () => {
  assert.equal(minuteToStepIndex(0), 0);
  assert.equal(minuteToStepIndex(570), 38);
  assert.equal(minuteToStepIndex(1439), 95);
});

test('interpolateTimelineAtMinute linearly blends continuous fields and preserves discrete step metadata', () => {
  const timeline = Array.from({ length: 96 }, (_, i) => ({
    ...DEFAULT_STEP_DATA,
    step: i,
    hour: i * 0.25,
    time_str: formatMinuteHHMM(i * 15),
    tou_tier: i === 2 ? 'peak' : 'normal',
    c_grid: i === 2 ? 3000 : 1800,
    p_pv_kw: i === 2 ? 40 : i === 3 ? 60 : 10,
    p_load_kw: i === 2 ? 80 : i === 3 ? 100 : 50,
    soc_pct: i === 2 ? 50 : i === 3 ? 70 : 40,
    flows: {
      pv_to_house: i === 2 ? 20 : i === 3 ? 40 : 0,
      pv_to_batt: 0,
      pv_to_grid: 0,
      batt_to_house: 0,
      grid_to_house: 0,
      grid_to_batt: 0,
    },
  }));

  const res = interpolateTimelineAtMinute(timeline, 37.5);
  assert.equal(res.stepIndex, 2);
  assert.equal(res.discreteStep.tou_tier, 'peak');
  assert.equal(res.discreteStep.c_grid, 3000);
  assert.ok(Math.abs(res.interpolatedStep.p_pv_kw - 50.6667) < 0.1);
  assert.ok(Math.abs(res.interpolatedStep.soc_pct - 60.6667) < 0.1);
  assert.ok(Math.abs(res.interpolatedStep.flows.pv_to_house - 30.6667) < 0.1);
});

test('interpolateTimelineAtMinute falls back cleanly when timeline is empty', () => {
  const res = interpolateTimelineAtMinute([], 570);
  assert.equal(res.stepIndex, 38);
  assert.equal(res.timeStr, '09:30');
  assert.equal(res.interpolatedStep.p_load_kw, DEFAULT_STEP_DATA.p_load_kw);
});
