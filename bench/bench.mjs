// bench/bench.mjs — real timings, >=7 samples + cold start -> bench/result.json
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { meshMinClearance } from '../src/core.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const scene = JSON.parse(readFileSync(join(root, 'data', 'scene.json')));

const stats = (arr) => {
  const a = arr.slice().sort((x, y) => x - y);
  const n = a.length;
  const mean = a.reduce((s, x) => s + x, 0) / n;
  const variance = a.reduce((s, x) => s + (x - mean) ** 2, 0) / n;
  const stddev = Math.sqrt(variance);
  return {
    n, min: a[0], median: a[(n - 1) >> 1], p95: a[Math.min(n - 1, Math.ceil(0.95 * n) - 1)],
    max: a[n - 1], stddev, mean, rsd_pct: (stddev / mean) * 100,
  };
};

// ---- cold start: very first BVH clearance in a fresh process ----
const tCold0 = performance.now();
const cold = meshMinClearance(scene.A, scene.B, true);
const coldMs = performance.now() - tCold0;

// ---- brute baseline (correctness + timing). Each sample is a batch of queries
// so per-query cost is not swamped by single-shot jitter.
const BRUTE_BATCH = 3;
const bruteTimes = [];
let brute = null;
for (let i = 0; i < 9; i++) {
  const t = performance.now();
  for (let b = 0; b < BRUTE_BATCH; b++) brute = meshMinClearance(scene.A, scene.B, false);
  bruteTimes.push((performance.now() - t) / BRUTE_BATCH);
}

// ---- BVH: 3 warmups, then 9 samples of a 50-query batch (per-query ms) ----
const BVH_BATCH = 50;
for (let w = 0; w < 3; w++) meshMinClearance(scene.A, scene.B, true);
const bvhTimes = [];
let bvh = null;
for (let i = 0; i < 9; i++) {
  const t = performance.now();
  for (let b = 0; b < BVH_BATCH; b++) bvh = meshMinClearance(scene.A, scene.B, true);
  bvhTimes.push((performance.now() - t) / BVH_BATCH);
}

const bvhStats = stats(bvhTimes);
const bruteStats = stats(bruteTimes);
const pruneRatio = bvh.distEvals / brute.distEvals;

const result = {
  generated: 'bench/bench.mjs (deterministic scene from tools/gen-sample.mjs)',
  scene: { trisA: scene.A.length, trisB: scene.B.length, triPairs: scene.A.length * scene.B.length },
  clearance: {
    d2: bvh.d2,
    minDist: Math.sqrt(bvh.d2),
    witnessA_tri: bvh.triA, witnessB_tri: bvh.triB,
    bvhDistEvals: bvh.distEvals, bruteDistEvals: brute.distEvals,
    pruneRatioPct: pruneRatio * 100,
    d2MatchBrute: Math.abs(bvh.d2 - brute.d2),
  },
  timing: {
    cold_firstBvhQuery_ms: coldMs,
    bvh: { samples: bvhStats.n, min: bvhStats.min, median: bvhStats.median, p95: bvhStats.p95, max: bvhStats.max, stddev: bvhStats.stddev, rsd_pct: bvhStats.rsd_pct },
    brute: { samples: bruteStats.n, median: bruteStats.median, min: bruteStats.min },
    speedup_brute_over_bvh_median: bruteStats.median / bvhStats.median,
    note: 'per-query ms; BVH = 9 samples x 50-query batches after 3 warmups, brute = 9 samples x 3-query batches.',
  },
};

writeFileSync(join(root, 'bench', 'result.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
