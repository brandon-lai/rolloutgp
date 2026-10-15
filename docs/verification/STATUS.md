# Realism pass verification

Baseline: a2d8cdf; clean main; Node v22.22.2; npm install succeeded; 30 tests passed; build passed without warnings.
Baseline bundles: main JS 1,227.72 kB (353.95 kB gzip); CSS 16.06 kB (4.22 kB gzip); worker 4,425.38 kB.
There are only ten commit subjects in this repository, all reviewed.

## Environment blockers

- `gh auth status`: stored token reported invalid.
- `git ls-remote origin HEAD`: github.com DNS resolution failed in the restricted shell.
- `npm run dev -- --host 127.0.0.1`: listen EPERM. Local servers are unavailable.
- Supplied probe with GL=1 against production: Chrome never opened its debugging port.
- No before screenshots were produced. No pixel review, runtime draw counts, preview or production deployment is claimed.
- Baseline screenshots must be captured from a2d8cdf in an isolated checkout before final comparison.

## Required render matrix

At both 1280×800 and 390×844, capture and read: home; garage Parts, Inspect, Test lane, Builds; each of nine part pickers; track select; live heat; results; replay; body shop Shape, Parts, Paint, Stickers, Save; settings; city course picker; city first person, third person, drone, forced touch (`?touch=1`).
Repeat after each visual stage. Add Low/Medium/High/Ultra in garage, a three-car heat and city. Test clear shells, 12 holes, uploaded stickers, all body presets and extreme legal roller/tire sizes. Check missing assets, render errors, overflow, contrast, focus and camera clipping. Do not infer fps from SwiftShader.

Renderer foundation: 35 tests pass. Build passes. Entry 937.87 kB (269.60 gzip), shared car/render chunk 252.04 kB (67.95 gzip); city screen 36.80 kB (13.96 gzip) now lazy. Worker hash remains DwMzx2No. Pixel verification blocked as above. Branch push attempted and failed at GitHub DNS resolution.

`brew install --cask blender` attempted: denied writes to Homebrew directories/cache. Blender assets cannot be generated in this sandbox. No account or API key was used.

Car stage: 37 tests and build pass. New tests check every tire/roller at all tiers against the catalog and finite shell geometry with cutouts. Workshop stage: 37 tests and build pass. Workshop GLB 93,920 bytes / 4,360 triangles, meshopt roundtrip verified by its generator. Initial JS remains split; workshop loader 70.91 kB (20.64 gzip), city 36.85 kB (13.99 gzip). Screenshots remain blocked. gltf-transform CLI install failed (package not cached / network unavailable); a small geometry-only EXT_meshopt exporter using the existing meshoptimizer library is committed instead. Blender remains unavailable; these are original parametric props.

Track/hall stage: 37 tests and build pass. Renderer-only joints follow the original lane samples; bevels stay on the wall tops. Event hall uses merged props and a shared material per surface. Race view chunk 9.77 kB (4.05 gzip); worker unchanged. Pixel and runtime budgets still unverified.

City stage: 37 tests and build pass. City chunk 47.98 kB (17.93 gzip), loaded only on entering the city. Facade detail has a 65 m LOD cutoff; high/ultra use the r186 CSMShadowNode. Original runner is a skinned parametric mesh with joint animation and first-person arms, not the requested Blender-sculpted character; that asset-quality work remains unfinished. No changes in src/city or src/sim. Pixel review remains blocked.

## Final local candidate

40 tests pass across five files; `npm run build` passes without warnings. This includes frozen current-format profile/share compatibility, malformed progress recovery, backup parsing, catalog dimensions at all tiers, real shell openings, the open market pit, and failed-worker recovery. `npm install --offline --ignore-scripts` succeeds. No online dependency audit is claimed.

The UI stage adds graphite panels, tabular numbers, keyboard controls/focus trapping, reduced-motion handling, responsive placement and canvas input between panels. Final review also corrected clear-body materials, ghost material ownership, repeated hub geometry, tiered relief resolution, and autosave races during restore/delete. Render-frame errors expose recovery. These are implementation checks; no new screen has been visually approved.

Measured build sizes (decimal kB; Vite gzip estimates):

| File | Raw | Gzip |
| --- | ---: | ---: |
| Entry JS | 940.90 | 270.66 |
| Shared geometry/render chunk | 267.24 | 70.92 |
| Shared UI | 48.12 | 17.70 |
| CSS | 17.88 | 4.66 |
| Lazy city screen | 48.45 | 18.09 |
| Optional workshop loader/decoder | 70.91 | 20.65 |
| Workshop GLB | 93.92 | 23.01 |
| Unchanged physics worker | 4,425.38 | deferred until simulation |

Summing actual HTML references (entry, modulepreloads and CSS) with Node's default gzip gives approximately **372.2 kB**. The optional workshop loader/model adds approximately **43.7 kB** and can load after the home turntable appears. Both fit the 450 kB home budget. Compression settings on Vercel may differ. The GLB parses with GLTFLoader + MeshoptDecoder: five meshes, 4,360 triangles. `models:bake` regenerates identical bytes. No new textures are downloaded. Per-tier source geometry counts and target ceilings are in README; runtime frame time/draw calls/triangles are unmeasured for every tier.

All required tuning harnesses completed with exit code 0 using `node --import tsx scripts/<name>.ts` (tsx CLI IPC is blocked here). See `tuning/`: sweeps for practice/sunday/dragon/bank/grand, rivals, citysim, endurance and damage. All rival builds remain legal. Some Grand rivals course out; stock dock exceeds the harness's 400-second limit. These are recorded outcomes, not newly tuned behavior. Endurance lap-12 pit is 81.7 s versus 85.7 s without a pit. Only worker transport in `src/sim/client.ts` changed; worker bytecode still hashes to `DwMzx2No`. `src/city` and the rest of `src/sim` are unchanged from a2d8cdf.

Production JS was checked for `__dev`, `__rollout`, `__workerError` and `dataset.metrics`; none are present. Full diff review and `git diff --check` completed. The generic refine skill validates, and a stub-CLI smoke test checks its project-path and prompt forwarding without launching another agent.

Shipping remains blocked: no before/after screenshots, preview, merge, production revision check or actual browser render has been completed. The branch must not be called production-ready or visually hyper-realistic yet. In addition to the render matrix, finish the sculpted runner/Blender bake and tire-lettering/motor-label artwork. Real GPU/WebGPU, real-device fps, gamepad, touch, audio and motion comfort require separate playtests. GitHub authentication/network and local browser/server restrictions must be resolved before preview verification and deployment.
