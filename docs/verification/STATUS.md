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
