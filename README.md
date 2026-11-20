# triprox-cert-lab — inter-mesh minimum clearance with an exact intersection cross-check

**Promise:** on a 252×252-triangle scene (63,504 tri-pairs) a BVH min-clearance query makes **937 triangle–triangle distance evaluations — 1.48 % of the 63,504 brute-force baseline** — while returning the *exact same* clearance (`d2Match = 0`), i.e. **~41.6× faster** (median 1.75 ms vs 72.7 ms, same host); and on a 2,000-pair integer corpus the exact BigInt tri–tri intersection predicate agrees with an independently-implemented oracle **0 disagreements (353 intersecting)**.

Upstream: none

## What it is

A small, honest geometry tool for one real job: **how far apart are two triangle meshes, and exactly where is the closest pair?** Useful for collision-free placement, clearance/draft checks, and near-miss detection. The same `src/core.mjs` powers the browser demo, `bench/verify.mjs` and `bench/bench.mjs` — so the number you drag to on screen is the number node asserts.

## How to run (one command each)

```bash
node tools/gen-sample.mjs          # regenerate data/ deterministically
node bench/verify.mjs              # 11 assertions, prints real values, exit 0
node bench/bench.mjs               # timings -> bench/result.json
node baseline/naive.mjs            # the O(|A|·|B|) brute baseline
python3 -m http.server 4173        # open http://localhost:4173 for the 3D demo
```

## Evidence (real numbers from `bench/result.json` and `bench/verify.mjs`)

| Claim | Measured | Baseline |
| --- | --- | --- |
| tri–tri distance evaluations, one clearance query | **937** | 63,504 (all pairs) |
| prune ratio | **1.475 %** (≤ 2 % target) | 100 % |
| clearance agreement BVH vs brute | **d2 match = 0** | — |
| min clearance on scene | √1.44 = **1.2** (A[152]↔B[140]) | — |
| per-query wall time (median of 9×50-query batches) | **1.748 ms** | 72.69 ms (median of 9×3-query batches) |
| speedup | **41.6×** | 1× |
| cold first BVH query (process start) | 27.5 ms | — |
| exact predicate vs independent oracle (2,000 integer pairs) | **0 / 2,000 disagreements** (353 intersecting) | — |
| distance vs independent double oracle | max rel **2.55e-15** | — |
| witness points \|pA−pB\|² vs reported d² | max rel **0** ; bary clamp 1.11e-16 | — |
| scale invariance 1e-6…1e6 (distance) | max rel d² **2.75e-14**, 0 decision flips | — |

## 本轮创新

**B 档.** The ledger has swept-sphere TOI, mesh self-intersection, winding number and per-vertex tangent/normal certificates, but **no inter-mesh minimum-clearance tool and no triangle–triangle distance with a witness pair**. New here: (1) a **minimum-distance query that returns the actual closest witness points on the two meshes**, so the "clearance" is auditable, not just a scalar; (2) an **exact (BigInt) tri–tri intersection predicate cross-checked against a structurally different exact oracle** on integer corpora; (3) the browser slider recomputes the same `core.mjs` clearance live, so *what you see is what node verifies*. Different from the swept-collide / selfint line: this is **between two meshes**, distance-valued, with witnesses.

## Known limitations (disclosed, not hidden)

- **Distance is computed in IEEE double.** The *exact* part is only the sign-level tri–tri intersection predicate (BigInt, integer coordinates). We do **not** claim exact distances.
- **Scale-invariance caveat:** the strict 1e-6…1e6 distance test is asserted only for pairs with base d² > 1e-2 (clear separation). Near-touching pairs are numerically ill-conditioned at 1e-6 by float cancellation, so they are excluded from the strict scale assertion. The exact predicate is exercised across integer multipliers 1…1000 (homogeneous sign). `segmentSegmentClosest` uses a **relative** parallel threshold (`1e-12·a·e`), not an absolute epsilon — an absolute epsilon was the actual scale bug found and fixed during this build.
- **Feature-label ties:** 16 / 920 separated (sample×scale) cases pick a different *equally-minimal* feature label while d² is unchanged — a tie, not an error.
- **BVH timing RSD ≈ 13.8 %** on 1.75 ms/query: per-query cost is small relative to jitter on a 4-core shared VM. The **median** is the headline and is stable (1.56–1.75 ms); p95 over 9 samples is the max sample. Numbers are host-specific.
- Scene is a synthetic 252×252 UV-sphere pair; real assets with degenerate/sliver triangles may need the exact predicate only on integer-scaled coordinates.

## License

MIT. Original work; no upstream copied.
