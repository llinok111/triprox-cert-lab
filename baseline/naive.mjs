// baseline/naive.mjs — brute-force O(|A|·|B|) minimum clearance.
// This is the对照 baseline for the BVH query in src/core.mjs.
// Run: node baseline/naive.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { meshMinClearance } from '../src/core.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const scene = JSON.parse(readFileSync(join(__dirname, '..', 'data', 'scene.json')));

const t = performance.now();
const r = meshMinClearance(scene.A, scene.B, false); // useBVH = false
const ms = performance.now() - t;
console.log(JSON.stringify({ method: 'brute', d2: r.d2, minDist: Math.sqrt(r.d2), distEvals: r.distEvals, ms }, null, 2));
