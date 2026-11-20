// Deterministic sample generator. Produces data/scene.json (two UV-sphere meshes)
// and data/exact-cases.json (integer triangle pairs for the exact predicate corpus).
// Same command twice -> byte-identical files (fixed PRNG, sorted keys via stable build).
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, '..', 'data');
mkdirSync(dataDir, { recursive: true });

/* ---- deterministic PRNG (mulberry32) ---- */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---- UV sphere triangles ---- */
function uvSphere(center, radius, lon, lat) {
  const pos = [];
  const P = (i, j) => {
    const theta = (j / lat) * Math.PI;      // 0..pi
    const phi = (i / lon) * 2 * Math.PI;    // 0..2pi
    return [
      center[0] + radius * Math.sin(theta) * Math.cos(phi),
      center[1] + radius * Math.cos(theta),
      center[2] + radius * Math.sin(theta) * Math.sin(phi),
    ];
  };
  const tris = [];
  for (let j = 0; j < lat; j++) {
    for (let i = 0; i < lon; i++) {
      const a = P(i, j), b = P(i + 1, j), c = P(i + 1, j + 1), d = P(i, j + 1);
      if (j !== 0) tris.push([a, b, d]);
      if (j !== lat - 1) tris.push([b, c, d]);
    }
  }
  return tris;
}

const A = uvSphere([0, 0, 0], 1.0, 14, 10);
const B = uvSphere([3.2, 0.0, 0.0], 1.0, 14, 10);

const scene = { note: 'triangle soups as [vertex,vertex,vertex] arrays', A, B };
writeFileSync(join(dataDir, 'scene.json'), JSON.stringify(scene));

/* ---- exact integer triangle corpus ---- */
const R = rng(20261120);
const ri = (lo, hi) => lo + Math.floor(R() * (hi - lo + 1));
function area2(t) {
  const [a, b, c] = t;
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  return Math.abs(n[0]) + Math.abs(n[1]) + Math.abs(n[2]);
}
function randTri(cx, cy, cz, spread) {
  let t;
  do {
    t = [
      [cx + ri(-spread, spread), cy + ri(-spread, spread), cz + ri(-spread, spread)],
      [cx + ri(-spread, spread), cy + ri(-spread, spread), cz + ri(-spread, spread)],
      [cx + ri(-spread, spread), cy + ri(-spread, spread), cz + ri(-spread, spread)],
    ];
  } while (area2(t) === 0);
  return t;
}
const cases = [];
for (let k = 0; k < 2000; k++) {
  if (k % 2 === 0) {
    // both near a shared center -> chance of intersecting
    const cx = ri(0, 12), cy = ri(0, 12), cz = ri(0, 12);
    cases.push({ A: randTri(cx, cy, cz, 3), B: randTri(cx, cy, cz, 3) });
  } else {
    // far apart centers -> mostly disjoint
    cases.push({ A: randTri(ri(0, 6), ri(0, 6), ri(0, 6), 2), B: randTri(ri(30, 40), ri(30, 40), ri(30, 40), 2) });
  }
}
writeFileSync(join(dataDir, 'exact-cases.json'), JSON.stringify({ note: 'exact integer tri pairs', cases }));

const total = A.length + B.length;
console.log(`scene: A=${A.length} tris, B=${B.length} tris (total ${total}); exact cases=${cases.length}`);
