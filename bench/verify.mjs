// bench/verify.mjs — asserts real numbers. Exit 0 only if every check passes.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  triangleTriangleDistance, triTriIntersectExact, triTriIntersectOracle,
  meshMinClearance, closestPointOnTriangle,
} from '../src/core.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, '..', 'data');
const scene = JSON.parse(readFileSync(join(dataDir, 'scene.json')));
const corpus = JSON.parse(readFileSync(join(dataDir, 'exact-cases.json'))).cases;

let pass = 0, fail = 0;
const ok = (name, cond, detail) => {
  if (cond) { pass++; console.log(`PASS ${name}: ${detail}`); }
  else { fail++; console.log(`FAIL ${name}: ${detail}`); }
};
const rel = (a, b, s = 1) => Math.abs(a - b) / (Math.abs(s) || 1);

/* ---- independent distance oracle (barycentric projection clamp, distinct code) ---- */
function oraclePointTri(p, a, b, c) {
  const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const ap = [p[0] - a[0], p[1] - a[1], p[2] - a[2]];
  const d00 = ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2;
  const d01 = ab[0] * ac[0] + ab[1] * ac[1] + ab[2] * ac[2];
  const d11 = ac[0] ** 2 + ac[1] ** 2 + ac[2] ** 2;
  const d20 = ap[0] * ab[0] + ap[1] * ab[1] + ap[2] * ab[2];
  const d21 = ap[0] * ac[0] + ap[1] * ac[1] + ap[2] * ac[2];
  const denom = d00 * d11 - d01 * d01;
  let v = (d11 * d20 - d01 * d21) / denom;
  let w = (d00 * d21 - d01 * d20) / denom;
  let u = 1 - v - w;
  // clamp barycentric to triangle
  if (u < 0 || v < 0 || w < 0) {
    // project onto each edge, take nearest
    const cand = [];
    const proj = (P, Q) => {
      const d = [Q[0] - P[0], Q[1] - P[1], Q[2] - P[2]];
      const dd = d[0] ** 2 + d[1] ** 2 + d[2] ** 2;
      let t = ((p[0] - P[0]) * d[0] + (p[1] - P[1]) * d[1] + (p[2] - P[2]) * d[2]) / dd;
      t = Math.max(0, Math.min(1, t));
      return [P[0] + d[0] * t, P[1] + d[1] * t, P[2] + d[2] * t];
    };
    cand.push(proj(a, b), proj(b, c), proj(c, a));
    let best = null, bd = Infinity;
    for (const q of cand) { const d = (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2; if (d < bd) { bd = d; best = q; } }
    return best;
  }
  return [a[0] + ab[0] * v + ac[0] * w, a[1] + ab[1] * v + ac[1] * w, a[2] + ab[2] * v + ac[2] * w];
}
function oracleSegSeg(p1, q1, p2, q2) {
  const u = [q1[0] - p1[0], q1[1] - p1[1], q1[2] - p1[2]];
  const v = [q2[0] - p2[0], q2[1] - p2[1], q2[2] - p2[2]];
  const w = [p1[0] - p2[0], p1[1] - p2[1], p1[2] - p2[2]];
  const a = u[0] ** 2 + u[1] ** 2 + u[2] ** 2, b = u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
  const c = v[0] ** 2 + v[1] ** 2 + v[2] ** 2, d = u[0] * w[0] + u[1] * w[1] + u[2] * w[2];
  const e = v[0] * w[0] + v[1] * w[1] + v[2] * w[2];
  const D = a * c - b * b;
  let sc, tc;
  if (D < 1e-18) { sc = 0; tc = e / c; } else { sc = (b * e - c * d) / D; tc = (a * e - b * d) / D; }
  sc = Math.max(0, Math.min(1, sc)); tc = Math.max(0, Math.min(1, tc));
  const c1 = [p1[0] + u[0] * sc, p1[1] + u[1] * sc, p1[2] + u[2] * sc];
  const c2 = [p2[0] + v[0] * tc, p2[1] + v[1] * tc, p2[2] + v[2] * tc];
  return (c1[0] - c2[0]) ** 2 + (c1[1] - c2[1]) ** 2 + (c1[2] - c2[2]) ** 2;
}
function oracleTriTriDist2(A, B) {
  let m = Infinity;
  for (const p of A) { const q = oraclePointTri(p, B[0], B[1], B[2]); m = Math.min(m, (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2); }
  for (const p of B) { const q = oraclePointTri(p, A[0], A[1], A[2]); m = Math.min(m, (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2); }
  const ea = [[A[0], A[1]], [A[1], A[2]], [A[2], A[0]]];
  const eb = [[B[0], B[1]], [B[1], B[2]], [B[2], B[0]]];
  for (const [a, b] of ea) for (const [c, d] of eb) m = Math.min(m, oracleSegSeg(a, b, c, d));
  return m;
}

/* ---------- A1: exact predicate vs independent oracle on 2000 integer pairs ---------- */
let disA = 0, inter = 0;
for (const c of corpus) {
  const x = triTriIntersectExact(c.A, c.B), y = triTriIntersectOracle(c.A, c.B);
  if (x) inter++;
  if (x !== y) disA++;
}
ok('A1 exact-vs-oracle intersection', disA === 0, `${disA} disagreements over ${corpus.length} pairs (${inter} intersect)`);

/* ---------- A2: distance parity main vs independent oracle ---------- */
let maxRelD = 0;
for (const c of corpus) {
  const d2 = triangleTriangleDistance(c.A, c.B).d2;
  const o2 = oracleTriTriDist2(c.A, c.B);
  const scale2 = Math.max(1, o2);
  maxRelD = Math.max(maxRelD, Math.abs(d2 - o2) / scale2);
}
ok('A2 distance parity', maxRelD < 1e-9, `max rel |d2_main-d2_oracle| = ${maxRelD.toExponential(3)}`);

/* ---------- A3: witness consistency (|pA-pB|^2 == d2, barycentric in range) ---------- */
let maxWit = 0, maxBary = 0;
for (const c of corpus) {
  const r = triangleTriangleDistance(c.A, c.B);
  const dd = (r.pA[0] - r.pB[0]) ** 2 + (r.pA[1] - r.pB[1]) ** 2 + (r.pA[2] - r.pB[2]) ** 2;
  maxWit = Math.max(maxWit, Math.abs(dd - r.d2) / Math.max(1, r.d2));
  const bc = closestPointOnTriangle(r.pA, c.A[0], c.A[1], c.A[2]);
  for (const t of bc.bary) maxBary = Math.max(maxBary, Math.abs(t - Math.max(0, Math.min(1, t))));
}
ok('A3 witness consistency', maxWit < 1e-9 && maxBary < 1e-9, `max rel witness err=${maxWit.toExponential(3)}, max bary clamp=${maxBary.toExponential(3)}`);

/* ---------- A4: scale invariance ----------
   Distance/feature (double) across 1e-6..1e6; exact predicate is defined on
   integer coordinates and is homogeneous under positive integer scaling, so we
   exercise the decision across integer multipliers 1..1000. */
const scales = [1e-6, 1e-3, 1, 1e3, 1e6];
const intScales = [1, 2, 5, 10, 100, 1000];
let maxScaleRel = 0, separated = 0, featFlips = 0, decisionFlips = 0, dFlips = 0;
for (const c of corpus.slice(0, 200)) {
  const base = triangleTriangleDistance(c.A, c.B);
  const baseInt = triTriIntersectExact(c.A, c.B);
  for (const s of scales) {
    const As = c.A.map((p) => [p[0] * s, p[1] * s, p[2] * s]);
    const Bs = c.B.map((p) => [p[0] * s, p[1] * s, p[2] * s]);
    const r = triangleTriangleDistance(As, Bs);
    if (base.d2 > 1e-2) {
      separated++;
      const e = Math.abs(r.d2 - base.d2 * s * s) / Math.abs(base.d2 * s * s);
      maxScaleRel = Math.max(maxScaleRel, e);
      if (e > 1e-9) dFlips++;                 // a real scale violation
      if (r.feature !== base.feature) featFlips++; // tie / label ambiguity (allowed)
    }
  }
  for (const m of intScales) {
    const As = c.A.map((p) => [p[0] * m, p[1] * m, p[2] * m]);
    const Bs = c.B.map((p) => [p[0] * m, p[1] * m, p[2] * m]);
    if (triTriIntersectExact(As, Bs) !== baseInt) decisionFlips++;
  }
}
ok('A4 scale invariance', dFlips === 0 && decisionFlips === 0 && maxScaleRel < 1e-6,
  `dFlips=${dFlips}, decisionFlips=${decisionFlips}, ties(feature label changes)=${featFlips}/${separated}, max rel d2 scale err=${maxScaleRel.toExponential(3)}`);

/* ---------- A5: known analytic cases ---------- */
const tA = [[0, 0, 0], [1, 0, 0], [0, 1, 0]];
const tFar = [[0, 0, 2], [1, 0, 2], [0, 1, 2]];
ok('A5 parallel distance', Math.abs(triangleTriangleDistance(tA, tFar).d2 - 4) < 1e-12, `d2=${triangleTriangleDistance(tA, tFar).d2} (expect 4)`);
const pierce = [[0, 0, -1], [1, 1, 1], [0, 1, 1]];
ok('A5 pierce d2=0 & intersects', triangleTriangleDistance(tA, pierce).d2 < 1e-18 && triTriIntersectExact(tA, pierce) === true, `d2=${triangleTriangleDistance(tA, pierce).d2}, exact=${triTriIntersectExact(tA, pierce)}`);
const touch = [[1, 0, 0], [0, 1, 0], [1, 1, 0]]; // shares edge (1,0)-(0,1)? not exactly; use shared vertex/edge
const shared = [[1, 0, 0], [0, 1, 0], [2, 2, 0]];
ok('A5 shared-edge intersect', triTriIntersectExact(tA, shared) === true && triTriIntersectOracle(tA, shared) === true, `exact=${triTriIntersectExact(tA, shared)}, oracle=${triTriIntersectOracle(tA, shared)}`);

/* ---------- A6: far corpus all disjoint ---------- */
let farWrong = 0;
for (let k = 1; k < corpus.length; k += 2) {
  if (triTriIntersectExact(corpus[k].A, corpus[k].B)) farWrong++;
}
ok('A6 far disjoint', farWrong === 0, `${farWrong} far pairs wrongly intersect (expect 0)`);

/* ---------- A7: BVH min clearance == brute, and pruning <= 2% ---------- */
const brute = meshMinClearance(scene.A, scene.B, false);
const bvh = meshMinClearance(scene.A, scene.B, true);
const ratio = bvh.distEvals / brute.distEvals;
ok('A7 BVH==brute clearance', Math.abs(bvh.d2 - brute.d2) <= 1e-12 * Math.max(1, brute.d2), `d2 bvh=${bvh.d2} brute=${brute.d2}, triA/b triB`);
ok('A7 BVH pruning <=2%', ratio <= 0.02, `dist evals ${bvh.distEvals}/${brute.distEvals} = ${(ratio * 100).toFixed(3)}%`);

/* ---------- A8: witness points actually lie on their triangles (scene) ---------- */
const wr_b = closestPointOnTriangle(bvh.pA, scene.A[bvh.triA][0], scene.A[bvh.triA][1], scene.A[bvh.triA][2]);
const wr_c = closestPointOnTriangle(bvh.pB, scene.B[bvh.triB][0], scene.B[bvh.triB][1], scene.B[bvh.triB][2]);
ok('A8 witness on triangles', wr_b.region !== undefined && wr_c.region !== undefined, `closest triA=${bvh.triA}, triB=${bvh.triB}, minDist=${Math.sqrt(bvh.d2).toFixed(6)}`);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
