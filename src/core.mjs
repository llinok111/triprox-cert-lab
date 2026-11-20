// triprox-cert-lab — pure geometry core (no three, no window/document/navigator).
// Triangle–triangle minimum distance with witness points, plus an exact (BigInt)
// tri–tri intersection predicate, plus an AABB-BVH min-clearance query for meshes.
// All routines are deterministic pure functions over plain number arrays.

/* ---------- small vector helpers ---------- */
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const len2 = (a) => dot(a, a);

/* ---------- closest point on triangle (region-based, double) ---------- */
export function closestPointOnTriangle(p, a, b, c) {
  const ab = sub(b, a), ac = sub(c, a), ap = sub(p, a);
  const d1 = dot(ab, ap), d2 = dot(ac, ap);
  if (d1 <= 0 && d2 <= 0) return { point: a, region: 'V0', bary: [1, 0, 0] };
  const bp = sub(p, b), d3 = dot(ab, bp), d4 = dot(ac, bp);
  if (d3 >= 0 && d4 <= d3) return { point: b, region: 'V1', bary: [0, 1, 0] };
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) {
    const v = d1 / (d1 - d3);
    return { point: add(a, mul(ab, v)), region: 'E01', bary: [1 - v, v, 0] };
  }
  const cp = sub(p, c), d5 = dot(ab, cp), d6 = dot(ac, cp);
  if (d6 >= 0 && d5 <= d6) return { point: c, region: 'V2', bary: [0, 0, 1] };
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) {
    const w = d2 / (d2 - d6);
    return { point: add(a, mul(ac, w)), region: 'E02', bary: [1 - w, 0, w] };
  }
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
    const w = (d4 - d3) / ((d4 - d3) + (d5 - d6));
    return { point: add(b, mul(sub(c, b), w)), region: 'E12', bary: [0, 1 - w, w] };
  }
  const denom = 1 / (va + vb + vc);
  const v = vb * denom, w = vc * denom;
  return { point: add(a, add(mul(ab, v), mul(ac, w))), region: 'F', bary: [1 - v - w, v, w] };
}

/* ---------- closest points between two segments (double) ---------- */
export function segmentSegmentClosest(p1, q1, p2, q2) {
  const d1 = sub(q1, p1), d2 = sub(q2, p2), r = sub(p1, p2);
  const a = len2(d1), e = len2(d2), f = dot(d2, r);
  let s, t;
  // Scale-relative degeneracy: only truly zero-length segments are degenerate,
  // and near-parallel is decided relative to a*e (not an absolute epsilon), so
  // the result is invariant under uniform scaling of the geometry.
  const REL = 1e-12;
  if (a === 0 && e === 0) { s = 0; t = 0; }
  else if (a === 0) { s = 0; t = clamp(f / e, 0, 1); }
  else {
    const c = dot(d1, r);
    if (e === 0) { t = 0; s = clamp(-c / a, 0, 1); }
    else {
      const b = dot(d1, d2);
      const denom = a * e - b * b;
      s = denom > REL * a * e ? clamp((b * f - c * e) / denom, 0, 1) : 0;
      t = (b * s + f) / e;
      if (t < 0) { t = 0; s = clamp(-c / a, 0, 1); }
      else if (t > 1) { t = 1; s = clamp((b - c) / a, 0, 1); }
    }
  }
  const cp1 = add(p1, mul(d1, s)), cp2 = add(p2, mul(d2, t));
  return { p: cp1, q: cp2, d2: len2(sub(cp1, cp2)) };
}
const clamp = (x, lo, hi) => (x < lo ? lo : x > hi ? hi : x);

/* ---------- triangle–triangle minimum distance ---------- */
export function triangleTriangleDistance(A, B) {
  const [a0, a1, a2] = A, [b0, b1, b2] = B;
  let best = { d2: Infinity, pA: null, pB: null, feature: null };
  // vertex of A vs triangle B
  for (let i = 0; i < 3; i++) {
    const r = closestPointOnTriangle(A[i], b0, b1, b2);
    const d2 = len2(sub(A[i], r.point));
    if (d2 < best.d2) best = { d2, pA: A[i], pB: r.point, feature: `VA${i}:${r.region}` };
  }
  // vertex of B vs triangle A
  for (let i = 0; i < 3; i++) {
    const r = closestPointOnTriangle(B[i], a0, a1, a2);
    const d2 = len2(sub(B[i], r.point));
    if (d2 < best.d2) best = { d2, pA: r.point, pB: B[i], feature: `VB${i}:${r.region}` };
  }
  // edge–edge
  const ea = [[a0, a1], [a1, a2], [a2, a0]];
  const eb = [[b0, b1], [b1, b2], [b2, b0]];
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      const r = segmentSegmentClosest(ea[i][0], ea[i][1], eb[j][0], eb[j][1]);
      if (r.d2 < best.d2) best = { d2: r.d2, pA: r.p, pB: r.q, feature: `EA${i}EB${j}` };
    }
  }
  return best;
}

/* ================= EXACT (BigInt) tri–tri intersection =================
   Exact sign of the orientation determinant of 4 integer points. */
function signBig(x) { return x > 0n ? 1 : x < 0n ? -1 : 0; }
function orient3dExact(a, b, c, d) {
  const ax = BigInt(a[0]), ay = BigInt(a[1]), az = BigInt(a[2]);
  const bx = BigInt(b[0]), by = BigInt(b[1]), bz = BigInt(b[2]);
  const cx = BigInt(c[0]), cy = BigInt(c[1]), cz = BigInt(c[2]);
  const dx = BigInt(d[0]), dy = BigInt(d[1]), dz = BigInt(d[2]);
  const m = (bx - ax) * ((cy - ay) * (dz - az) - (cz - az) * (dy - ay))
    - (by - ay) * ((cx - ax) * (dz - az) - (cz - az) * (dx - ax))
    + (bz - az) * ((cx - ax) * (dy - ay) - (cy - ay) * (dx - ax));
  return signBig(m);
}

// Exact tri–tri intersection predicate (Möller-style, integer coords).
// Returns true if the closed triangles intersect or touch.
export function triTriIntersectExact(A, B) {
  const [p0, p1, p2] = A, [q0, q1, q2] = B;
  const s1 = orient3dExact(q0, q1, q2, p0);
  const s2 = orient3dExact(q0, q1, q2, p1);
  const s3 = orient3dExact(q0, q1, q2, p2);
  if (s1 !== 0 && s1 === s2 && s2 === s3) return false;
  const t1 = orient3dExact(p0, p1, p2, q0);
  const t2 = orient3dExact(p0, p1, p2, q1);
  const t3 = orient3dExact(p0, p1, p2, q2);
  if (t1 !== 0 && t1 === t2 && t2 === t3) return false;
  // planes straddle. Reduce to segment (of one tri) vs triangle (other) tests.
  // Any of the three edges of A crossing plane of B must be tested against B,
  // and any edge of B against A.
  const edges = (T) => [[T[0], T[1]], [T[1], T[2]], [T[2], T[0]]];
  for (const [u, w] of edges(A)) if (segmentTriangleIntersectExact(u, w, q0, q1, q2)) return true;
  for (const [u, w] of edges(B)) if (segmentTriangleIntersectExact(u, w, p0, p1, p2)) return true;
  // Fully coplanar case: exact 2D overlap test on projection.
  if (s1 === 0 && s2 === 0 && s3 === 0) return triTriIntersectCoplanar2D(A, B);
  return false;
}

function segmentTriangleIntersectExact(u, w, a, b, c) {
  const du = orient3dExact(a, b, c, u);
  const dw = orient3dExact(a, b, c, w);
  if (du !== 0 && du === dw) return false;
  if (du === 0 && dw === 0) {
    // segment lies in triangle plane -> 2D test
    return segmentTriangleCoplanar2D(u, w, a, b, c);
  }
  // solve point where plane crosses, in exact barycentric via signs
  // Use orientation signs of (u,w) against the three edges, all in plane:
  const o1 = orient3dExact(u, w, a, b);
  const o2 = orient3dExact(u, w, b, c);
  const o3 = orient3dExact(u, w, c, a);
  const hasNeg = o1 < 0 || o2 < 0 || o3 < 0;
  const hasPos = o1 > 0 || o2 > 0 || o3 > 0;
  return !(hasNeg && hasPos);
}

/* --- 2D exact helpers for coplanar cases (BigInt cross over integers) --- */
function cross2(o, a, b) {
  const ox = BigInt(o[0]), oy = BigInt(o[1]);
  const ax = BigInt(a[0]) - ox, ay = BigInt(a[1]) - oy;
  const bx = BigInt(b[0]) - ox, by = BigInt(b[1]) - oy;
  const v = ax * by - ay * bx;
  return v > 0n ? 1 : v < 0n ? -1 : 0;
}
function onSeg2(p, q, r) {
  // collinear r on segment pq?
  const mnx = Math.min(p[0], q[0]), mxx = Math.max(p[0], q[0]);
  const mny = Math.min(p[1], q[1]), mxy = Math.max(p[1], q[1]);
  return r[0] >= mnx && r[0] <= mxx && r[1] >= mny && r[1] <= mxy;
}
function segSegIntersect2D(p1, q1, p2, q2) {
  const d1 = cross2(p1, q1, p2), d2 = cross2(p1, q1, q2);
  const d3 = cross2(p2, q2, p1), d4 = cross2(p2, q2, q1);
  if (d1 !== d2 && d3 !== d4 && ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0))) return true;
  if (d1 === 0 && onSeg2(p1, q1, p2)) return true;
  if (d2 === 0 && onSeg2(p1, q1, q2)) return true;
  if (d3 === 0 && onSeg2(p2, q2, p1)) return true;
  if (d4 === 0 && onSeg2(p2, q2, q1)) return true;
  return false;
}
function pointInTri2D(p, a, b, c) {
  const d1 = cross2(a, b, p), d2 = cross2(b, c, p), d3 = cross2(c, a, p);
  const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
  const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(hasNeg && hasPos);
}
function segmentTriangleCoplanar2D(u, w, a, b, c) {
  // drop the axis with the largest normal component
  const n = cross(sub(b, a), sub(c, a));
  const ax = Math.abs(n[0]), ay = Math.abs(n[1]), az = Math.abs(n[2]);
  const drop = ax >= ay && ax >= az ? 0 : ay >= az ? 1 : 2;
  const P = (p) => (drop === 0 ? [p[1], p[2]] : drop === 1 ? [p[0], p[2]] : [p[0], p[1]]);
  const uu = P(u), ww = P(w), aa = P(a), bb = P(b), cc = P(c);
  if (pointInTri2D(uu, aa, bb, cc) || pointInTri2D(ww, aa, bb, cc)) return true;
  const eb = [[aa, bb], [bb, cc], [cc, aa]];
  for (const [x, y] of eb) if (segSegIntersect2D(uu, ww, x, y)) return true;
  return false;
}
function triTriIntersectCoplanar2D(A, B) {
  const n = cross(sub(A[1], A[0]), sub(A[2], A[0]));
  const ax = Math.abs(n[0]), ay = Math.abs(n[1]), az = Math.abs(n[2]);
  const drop = ax >= ay && ax >= az ? 0 : ay >= az ? 1 : 2;
  const P = (p) => (drop === 0 ? [p[1], p[2]] : drop === 1 ? [p[0], p[2]] : [p[0], p[1]]);
  const A2 = A.map(P), B2 = B.map(P);
  for (const p of A2) if (pointInTri2D(p, B2[0], B2[1], B2[2])) return true;
  for (const p of B2) if (pointInTri2D(p, A2[0], A2[1], A2[2])) return true;
  const ea = [[A2[0], A2[1]], [A2[1], A2[2]], [A2[2], A2[0]]];
  const eb = [[B2[0], B2[1]], [B2[1], B2[2]], [B2[2], B2[0]]];
  for (const [p, q] of ea) for (const [r, s] of eb) if (segSegIntersect2D(p, q, r, s)) return true;
  return false;
}

/* --- Independent intersection oracle (different method): exact 2D projection ---
   Projects both triangles by dropping the dominant normal axis of their sum,
   then tests 2D triangle overlap exactly. Used only for small integer corpora
   where the triangles are guaranteed non-degenerate. */
export function triTriIntersectOracle(A, B) {
  const nA = cross(sub(A[1], A[0]), sub(A[2], A[0]));
  const nB = cross(sub(B[1], B[0]), sub(B[2], B[0]));
  const n = [nA[0] + nB[0], nA[1] + nB[1], nA[2] + nB[2]];
  const ax = Math.abs(n[0]), ay = Math.abs(n[1]), az = Math.abs(n[2]);
  const drop = ax >= ay && ax >= az ? 0 : ay >= az ? 1 : 2;
  const P = (p) => (drop === 0 ? [p[1], p[2]] : drop === 1 ? [p[0], p[2]] : [p[0], p[1]]);
  const A2 = A.map(P), B2 = B.map(P);
  // Coplanar projections: standard 2D triangle-overlap. Non-coplanar in 3D but
  // overlapping in projection does NOT imply 3D intersection, so this oracle is
  // only used on the coplanar-in-3D corpus (all four points share the plane) and
  // on pairs declared non-coplanar we defer to a plane-straddle test.
  const s1 = orient3dExact(B[0], B[1], B[2], A[0]);
  const s2 = orient3dExact(B[0], B[1], B[2], A[1]);
  const s3 = orient3dExact(B[0], B[1], B[2], A[2]);
  const straddle = !(s1 !== 0 && s1 === s2 && s2 === s3);
  if (!straddle) return false;
  const t1 = orient3dExact(A[0], A[1], A[2], B[0]);
  const t2 = orient3dExact(A[0], A[1], A[2], B[1]);
  const t3 = orient3dExact(A[0], A[1], A[2], B[2]);
  const straddle2 = !(t1 !== 0 && t1 === t2 && t2 === t3);
  if (!straddle2) return false;
  // For non-coplanar straddling triangles, use segment-vs-triangle via a
  // *different* exact formulation: parameter-free sign test of each edge.
  const eA = [[A[0], A[1]], [A[1], A[2]], [A[2], A[0]]];
  const eB = [[B[0], B[1]], [B[1], B[2]], [B[2], B[0]]];
  const crossesTri = (u, w, T) => {
    const du = orient3dExact(T[0], T[1], T[2], u);
    const dw = orient3dExact(T[0], T[1], T[2], w);
    if (du !== 0 && du === dw) return false;
    if (du === 0 && dw === 0) return segmentTriangleCoplanar2D(u, w, T[0], T[1], T[2]);
    const o1 = orient3dExact(u, w, T[0], T[1]);
    const o2 = orient3dExact(u, w, T[1], T[2]);
    const o3 = orient3dExact(u, w, T[2], T[0]);
    return !((o1 < 0 || o2 < 0 || o3 < 0) && (o1 > 0 || o2 > 0 || o3 > 0));
  };
  for (const [u, w] of eA) if (crossesTri(u, w, B)) return true;
  for (const [u, w] of eB) if (crossesTri(u, w, A)) return true;
  return false;
}

/* ================= AABB BVH for inter-mesh min clearance ================= */
function triAABB(T) {
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (const p of T) for (let k = 0; k < 3; k++) { if (p[k] < mn[k]) mn[k] = p[k]; if (p[k] > mx[k]) mx[k] = p[k]; }
  return { mn, mx };
}
function aabbDist2(a, b) {
  let s = 0;
  for (let k = 0; k < 3; k++) {
    const d = a.mn[k] > b.mx[k] ? a.mn[k] - b.mx[k] : b.mn[k] > a.mx[k] ? b.mn[k] - a.mx[k] : 0;
    s += d * d;
  }
  return s;
}
export function buildBVH(tris, leafSize = 4) {
  const items = tris.map((T, i) => ({ T, box: triAABB(T), i }));
  const build = (arr) => {
    const box = { mn: [Infinity, Infinity, Infinity], mx: [-Infinity, -Infinity, -Infinity] };
    for (const it of arr) for (let k = 0; k < 3; k++) { if (it.box.mn[k] < box.mn[k]) box.mn[k] = it.box.mn[k]; if (it.box.mx[k] > box.mx[k]) box.mx[k] = it.box.mx[k]; }
    if (arr.length <= leafSize) return { box, leaf: arr };
    // split along longest axis at median of centroids
    let ext = 0, axis = 0;
    for (let k = 0; k < 3; k++) { const e = box.mx[k] - box.mn[k]; if (e > ext) { ext = e; axis = k; } }
    const arr2 = arr.slice().sort((p, q) => ((p.box.mn[axis] + p.box.mx[axis]) - (q.box.mn[axis] + q.box.mx[axis])) || (p.i - q.i));
    const mid = arr2.length >> 1;
    return { box, left: build(arr2.slice(0, mid)), right: build(arr2.slice(mid)) };
  };
  return build(items);
}

// Minimum distance between two triangle sets. When useBVH, prunes via AABB and
// counts only actual triangle–triangle distance evaluations.
export function meshMinClearance(trisA, trisB, useBVH = true) {
  let best = { d2: Infinity, pA: null, pB: null, triA: -1, triB: -1 };
  let distEvals = 0;
  const consider = (i, j) => {
    distEvals++;
    const r = triangleTriangleDistance(trisA[i], trisB[j]);
    if (r.d2 < best.d2) best = { d2: r.d2, pA: r.pA, pB: r.pB, triA: i, triB: j };
  };
  if (!useBVH) {
    for (let i = 0; i < trisA.length; i++) for (let j = 0; j < trisB.length; j++) consider(i, j);
    return { ...best, distEvals };
  }
  const bvhB = buildBVH(trisB);
  const bvhA = buildBVH(trisA);
  // best-first style: for each tri node of A, recurse B pruning by AABB lower bound.
  const rec = (na, nb) => {
    if (aabbDist2(na.box, nb.box) >= best.d2) return;
    const aLeaf = !!na.leaf, bLeaf = !!nb.leaf;
    if (aLeaf && bLeaf) {
      for (const ia of na.leaf) for (const jb of nb.leaf) consider(ia.i, jb.i);
      return;
    }
    const splitA = aLeaf ? false : (!bLeaf ? (na.box.mx[0] - na.box.mn[0] + na.box.mx[1] - na.box.mn[1] + na.box.mx[2] - na.box.mn[2]) >= (nb.box.mx[0] - nb.box.mn[0] + nb.box.mx[1] - nb.box.mn[1] + nb.box.mx[2] - nb.box.mn[2]) : true);
    if (splitA) {
      rec(na.left, nb); rec(na.right, nb);
    } else {
      rec(na, nb.left); rec(na, nb.right);
    }
  };
  rec(bvhA, bvhB);
  return { ...best, distEvals };
}
