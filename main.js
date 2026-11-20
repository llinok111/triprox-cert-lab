// main.js — rendering + interaction only. All geometry math comes from src/core.mjs.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { meshMinClearance } from './src/core.mjs';

const app = document.getElementById('app');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b0f14);
const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.01, 1000);
camera.position.set(1.5, 1.2, 4.2);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(1.6, 0, 0);

scene.add(new THREE.AmbientLight(0xffffff, 0.55));
const dl = new THREE.DirectionalLight(0xffffff, 1.1); dl.position.set(3, 5, 4); scene.add(dl);
const grid = new THREE.GridHelper(20, 20, 0x24374a, 0x18242f); grid.position.y = -1.6; scene.add(grid);

function geoFromTriangleSoup(tris) {
  const pos = new Float32Array(tris.length * 9);
  let k = 0;
  for (const t of tris) for (const v of t) { pos[k++] = v[0]; pos[k++] = v[1]; pos[k++] = v[2]; }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

const data = await (await fetch('./data/scene.json')).json();
const meshA = new THREE.Mesh(geoFromTriangleSoup(data.A), new THREE.MeshStandardMaterial({ color: 0x3f9cff, metalness: 0.2, roughness: 0.5, flatShading: true }));
const meshB = new THREE.Mesh(geoFromTriangleSoup(data.B), new THREE.MeshStandardMaterial({ color: 0xffa53f, metalness: 0.2, roughness: 0.5, flatShading: true }));
scene.add(meshA, meshB);

// translate mesh B: keep original center, slider shifts it along X.
const bx0 = 3.2;
const sep = document.getElementById('sep');
const sepv = document.getElementById('sepv');
const clr = document.getElementById('clr');
const pairEl = document.getElementById('pair');

const trisBWorld = () => data.B.map((t) => t.map((v) => [v[0] + meshB.position.x - bx0, v[1], v[2]]));

function recompute() {
  const x = (sep.value - 120) / 100; // -2.00 .. +3.00 offset
  meshB.position.x = bx0 + x;
  sepv.textContent = meshB.position.x.toFixed(3);
  const bWorld = trisBWorld();
  const r = meshMinClearance(data.A, bWorld, true);
  if (r.d2 === Infinity) { clr.textContent = 'n/a'; pairEl.textContent = '—'; return; }
  clr.textContent = Math.sqrt(r.d2).toFixed(5);
  pairEl.textContent = `A[${r.triA}] ↔ B[${r.triB}]`;
  // highlight witness points
  if (witnessA) scene.remove(witnessA);
  if (witnessB) scene.remove(witnessB);
  witnessA = new THREE.Mesh(sphereGeo, sphereMatA); witnessA.position.set(...r.pA);
  witnessB = new THREE.Mesh(sphereGeo, sphereMatB); witnessB.position.set(...r.pB);
  scene.add(witnessA, witnessB);
}
const sphereGeo = new THREE.SphereGeometry(0.03, 12, 12);
const sphereMatA = new THREE.MeshBasicMaterial({ color: 0x7fd1ff });
const sphereMatB = new THREE.MeshBasicMaterial({ color: 0xffd479 });
let witnessA = null, witnessB = null;

sep.addEventListener('input', recompute);
recompute();

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

renderer.setAnimationLoop(() => {
  controls.update();
  renderer.render(scene, camera);
});
