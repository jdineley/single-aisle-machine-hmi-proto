import type { FastenerPoint } from '../types';

const DWELL_TIME_S = 12;
const TRAVERSE_SPEED_MMS = 100;

const TOOL_IDS = ['T-01A', 'T-01B', 'T-02A', 'T-02B', 'T-03A', 'T-03B', 'T-04A', 'T-04B'];
const FAULT_CODES = ['TORQUE_LOW', 'ANGLE_LOW', 'TORQUE_HIGH', 'CYCLE_TIMEOUT'];

// Simple LCG — deterministic per seed, no Math.random() dependency
function seededRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

// Cumulative process time (seconds) for each fastener assuming ideal conditions.
// Index 0: dwell only (no prior position). Index i: travel from i-1 + dwell.
export function computeIdealTimestamps(
  fasteners: Array<{ worldX: number; worldY: number }>,
): number[] {
  const ts = new Array<number>(fasteners.length);
  let cum = DWELL_TIME_S;
  ts[0] = cum;
  for (let i = 1; i < fasteners.length; i++) {
    const dx = fasteners[i].worldX - fasteners[i - 1].worldX;
    const dy = fasteners[i].worldY - fasteners[i - 1].worldY;
    cum += Math.sqrt(dx * dx + dy * dy) / TRAVERSE_SPEED_MMS + DWELL_TIME_S;
    ts[i] = cum;
  }
  return ts;
}

// Actual cumulative timestamps with 'numDelayed' fasteners each receiving an
// additional hold (delayed PLC data-packet emit). Total extra time equals
// idealTotal * targetFraction. All delays propagate forward cumulatively.
export function generateActualTimestamps(
  idealTimestamps: number[],
  targetFraction: number,
  numDelayed: number,
  seed: number,
): number[] {
  const n = idealTimestamps.length;
  const totalExtra = idealTimestamps[n - 1] * targetFraction;
  const delayEach = totalExtra / numDelayed;

  const rng = seededRng(seed);
  const picked = new Set<number>();
  while (picked.size < numDelayed) {
    picked.add(Math.floor(rng() * n));
  }
  const delayedAt = Array.from(picked).sort((a, b) => a - b);

  const actual = new Array<number>(n);
  let accumulated = 0;
  let di = 0;
  for (let i = 0; i < n; i++) {
    if (di < delayedAt.length && i === delayedAt[di]) {
      accumulated += delayEach;
      di++;
    }
    actual[i] = idealTimestamps[i] + accumulated;
  }
  return actual;
}

// Assign deterministic ok/fail statuses and process payload to base coordinates.
export function generateFasteners(
  coords: Array<{ fastId: string; worldX: number; worldY: number }>,
  seed: number,
): FastenerPoint[] {
  const rng = seededRng(seed);
  return coords.map(({ fastId, worldX, worldY }) => {
    const status = rng() < 0.04 ? 'fail' : ('ok' as const);
    const toolId = TOOL_IDS[Math.floor(rng() * TOOL_IDS.length)];
    const payload: Record<string, unknown> = {
      torque_nm: status === 'fail'
        ? +(5  + rng() * 8).toFixed(1)
        : +(40 + rng() * 15).toFixed(1),
      angle_deg:    +(160 + rng() * 25).toFixed(1),
      cycle_time_ms: Math.floor(700 + rng() * 700),
      tool_id: toolId,
    };
    if (status === 'fail') {
      payload.fault_code = FAULT_CODES[Math.floor(rng() * FAULT_CODES.length)];
    }
    return { fastId, worldX, worldY, status, payload };
  });
}
