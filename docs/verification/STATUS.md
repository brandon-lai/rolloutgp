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
