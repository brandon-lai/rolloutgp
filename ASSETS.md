# Asset inventory

All new designs are original project work. They are owned by the project; no separate redistribution licence is granted (the repository has no top-level open-source licence). No Tamiya/anime shapes, marks, traced liveries, external art libraries or text-to-3D services were used. three.js and meshoptimizer are MIT-licensed tooling, not sources of car designs.

| Shipped file or runtime asset | Source / licence | Tool and reproducible source | Size / loading |
| --- | --- | --- | --- |
| `public/models/workshop.glb` | Original project artwork; project-owned | TypeScript + three GLTFExporter; `src/render/models/workshop.ts`, `tools/models/bake.ts`, `tools/models/compress.ts` | 93,920 bytes; 4,360 triangles, 5 material meshes; asynchronous garage load |
| Chassis tubs, ribs, battery bays/cells, screw bosses, motor cans, gears, spoked wheels, tires, bearing rollers, stays, dampers, brake sponges, bushings/bearings | Original project artwork; project-owned | `src/render/models/parts.ts`, catalog inputs from `src/sim/parts.ts`; assembly `src/render/car.ts` | Generated for the equipped build, tiered tessellation; no separate downloads |
| Cowl and snap-on parts | Original procedural game design; project-owned | `src/render/body.ts`, `src/render/models/shellCuts.ts`, player recipe | Loft remains procedural. Paint/normal maps 256×128, 512×256 or 1024×512; uploads remain local |
| Softbox HDR panorama | Original analytic lighting; project-owned | `src/render/lighting.ts` | Runtime 512×256 RGBA half-float, PMREM once per renderer; no HDR network request |
| Surface roughness/normal maps | Original deterministic signals; project-owned | `src/render/surface.ts` | 128 or 256 square; generated only for scenes that use them |
| Track sections, seams, legs, bridge supports | Original project geometry, sampled from unchanged lane definitions | `src/render/track.ts` | Sweeps and instancing; never colliders |
| Event hall, barriers, practical ceiling panels, banners and floor | Original project artwork; project-owned | `src/render/env.ts` | Props merged by material; banner 1024×128, floor 128×128 |
| Existing district facades, asphalt, kerbs, road markings, storefronts and cornices | Original project blockout plus original dressing; project-owned | `src/render/cityView.ts`, `src/render/models/district.ts` | City code lazy-loaded; dressing disappears after 65 m and on Low. Road marking canvas 2048²; facade tile 128² |
| Articulated runner and first-person arms | Original parametric substitute; project-owned | `src/render/models/runner.ts` | Runner 2,820 triangles at 12 segments, one skinned mesh / four materials; Low uses 8 segments. Procedural joint gait, no downloaded animation |
| Part thumbnails | Renderings of original catalog meshes; project-owned | `src/render/thumbnails.ts`, `src/app/PartThumbnail.tsx` | 192×128 WebP data URLs, created for visible rows and cached for renderer lifetime |
| `public/icon.svg` | Existing project artwork from v1; retained | Authored SVG in repository | 950 bytes |
| `public/og.png` | Existing project social image from commit `ae3f3f1`; retained | Original generation script was not committed | 314,262 bytes, fetched by social crawlers, not the home scene. Not an after screenshot |
| Built-in sticker sheet | Existing original vector drawings; project-owned | `src/render/stickers.ts` | Canvas drawing code; no external texture files |
| Sound | Existing synthesized sound; project-owned | `src/render/audio.ts` | Web Audio synthesis; no samples |

## Regeneration and validation

```sh
npm run models:bake
npm run models:budget
```

The bake uses GLTFExporter, welds duplicate vertices, then writes lossless `EXT_meshopt_compression`. Its encoder decodes and compares every buffer byte before writing. The shipped file was also parsed with the same GLTFLoader + MeshoptDecoder used by the browser: 5 meshes / 4,360 triangles. The extension follows the [Khronos specification](https://github.com/KhronosGroup/glTF/blob/main/extensions/2.0/Vendor/EXT_meshopt_compression/README.md). No fallback uncompressed payload is shipped. The loader/decoder are dynamically imported, so they do not block the first car render. If that optional asset fails, the turntable remains usable.

The requested `@gltf-transform/cli` could not be installed in this restricted shell (uncached package/network unavailable), so the narrow, checked geometry-only exporter is used instead. `toktx` is unavailable. The GLB has no image textures to transcode; runtime catalog thumbnails use WebP. There are no unused `.blend` files or unloaded model files.

Blender installation was attempted and blocked by Homebrew/cache write permissions. No Blender sculpt or AO/curvature bake has been produced. The parametric runner is functional, but does not fulfil the requested sculpted character quality. Cars still need tire lettering and motor label artwork; the current sidewall moulding uses geometric marks. Those details, art approval and pixel verification remain unfinished; see `docs/verification/STATUS.md`.
