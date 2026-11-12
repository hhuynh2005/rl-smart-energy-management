/**
 * Minute-level continuous time synchronization and linear interpolation
 * across the 96-step (15-minute interval) SEMS-RL simulation timeline.
 */

export const DEFAULT_STEP_DATA = {
  step: 38,
  hour: 9.5,
  time_str: '09:30',
  tou_tier: 'peak',
  p_load_kw: 80.6,
  p_pv_kw: 80.6,
  p_batt_kw: 0.0,
  p_grid_kw: -21.2,
  p_buy_kw: 0.0,
  p_sell_kw: 21.2,
  soc: 0.9,
  soc_pct: 90.0,
  c_grid: 3000,
  c_elec: 0,
  c_deg: 0,
  reward: 0,
  is_clipped: false,
  nobat_p_buy_kw: 0.0,
  sun_intensity: 0.85,
  sun_angle: 75.0,
  flows: {
    pv_to_house: 80.6,
    pv_to_batt: 0.0,
    pv_to_grid: 21.2,
    batt_to_house: 0.0,
    grid_to_house: 0.0,
    grid_to_batt: 0.0,
  },
};

const CONTINUOUS_KEYS = [
  'p_load_kw',
  'p_pv_kw',
  'p_batt_kw',
  'p_grid_kw',
  'p_buy_kw',
  'p_sell_kw',
  'soc',
  'soc_pct',
];

const FLOW_KEYS = [
  'pv_to_house',
  'pv_to_batt',
  'pv_to_grid',
  'batt_to_house',
  'grid_to_house',
  'grid_to_batt',
];

export function clampMinute(minute) {
  if (!Number.isFinite(minute)) return 0;
  return Math.max(0, Math.min(1439, Math.round(minute)));
}

export function formatMinuteHHMM(minute) {
  const m = clampMinute(minute);
  const hh = String(Math.floor(m / 60)).padStart(2, '0');
  const mm = String(m % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}

export function minuteToStepIndex(minute, totalSteps = 96) {
  const maxIdx = Math.max(0, totalSteps - 1);
  return Math.min(maxIdx, Math.floor(clampMinute(minute) / 15));
}

function lerpNumber(a, b, alpha) {
  const va = Number.isFinite(a) ? a : 0;
  const vb = Number.isFinite(b) ? b : va;
  return va + (vb - va) * alpha;
}

export function interpolateTimelineAtMinute(timeline = [], minute = 570) {
  const clamped = clampMinute(minute);
  const hour = clamped / 60;
  const timeStr = formatMinuteHHMM(clamped);

  if (!Array.isArray(timeline) || timeline.length === 0) {
    const stepIndex = minuteToStepIndex(clamped, 96);
    const fallback = { ...DEFAULT_STEP_DATA, step: stepIndex, hour, time_str: timeStr };
    return {
      stepIndex,
      hour,
      timeStr,
      discreteStep: fallback,
      interpolatedStep: fallback,
    };
  }

  const len = timeline.length;
  const stepIndex = minuteToStepIndex(clamped, len);
  const nextIndex = Math.min(len - 1, stepIndex + 1);
  const alpha = Math.max(0, Math.min(1, (clamped - stepIndex * 15) / 15));

  const curr = timeline[stepIndex] || DEFAULT_STEP_DATA;
  const next = timeline[nextIndex] || curr;

  const interpolated = {
    ...curr,
    step: stepIndex,
    hour,
    time_str: timeStr,
  };

  for (const key of CONTINUOUS_KEYS) {
    interpolated[key] = lerpNumber(curr[key], next[key], alpha);
  }

  const currFlows = curr.flows || DEFAULT_STEP_DATA.flows;
  const nextFlows = next.flows || currFlows;
  const flows = {};
  for (const fk of FLOW_KEYS) {
    flows[fk] = lerpNumber(currFlows[fk], nextFlows[fk], alpha);
  }
  interpolated.flows = flows;

  return {
    stepIndex,
    hour,
    timeStr,
    discreteStep: curr,
    interpolatedStep: interpolated,
  };
}
