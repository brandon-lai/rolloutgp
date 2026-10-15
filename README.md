# Rollout GP

**Build a self-steering racer like the real thing, let it go, and run after it through the city.**

Live: **https://rolloutgp.vercel.app** · Repo: https://github.com/brandon-lai/rolloutgp

**Workshop realism candidate: local branch `refine/realism`, not deployed or visually approved.** The current pass cannot open a browser debugging port or local server, and GitHub push is blocked by DNS/authentication. The v1 screenshots described below are historical, not evidence for this candidate. See [verification status](docs/verification/STATUS.md).

Rollout GP is a browser game about the mini 4WD hobby: small battery cars that run in walled lanes and turn by bouncing their rollers off the walls. **You never steer.** Every race is decided in the garage, and the drama happens alongside the car. The game has two halves that share one garage:

- **Track mode.** Release the car on a walled 3-lane course and watch it from trackside. Heats, time trials against your ghost, endurance with a battery swap, and an elimination cup.
- **City run.** Release the car on a street course and chase it on foot in first person. Stay close for spirit points, throw the switch at forks, and when it flies off, run to it and put it back.

## How to play

1. **Garage.** Nine slots, mirroring a real kit: chassis, motor, gear ratio, wheels and tires, rollers and stays, mass dampers, brakes, bearings and grease, and the body. Each part changes the physics, not a stat bar. The **Inspect** tab runs the official tech inspection live (105 mm wide, 70 mm tall, 165 mm long, 90 g, 1 mm clearance, 22–35 mm tires). The **Test lane** runs three laps instantly and tells you what went wrong. Parts cost tokens, which you earn by racing. There are no real-money purchases.
2. **Race.** Pick a format and a track. The results show where the time went: lap times, speed round the lap, corner exits, airtime per jump, where the car flew off and why, and what to change.
3. **Body shop.** Shape the body (a loft of 5–7 cross-sections, edited by dragging handles in side and top view), add wings, fins, intakes, canopies and light pods, drill lightening holes, paint it, and put stickers on it. Share a body or a whole build as a link.
4. **City run.** WASD and mouse (click to capture the mouse), Shift to sprint, Space to jump, vault or climb, C to slide, E to put a crashed car back, F to switch the route (aim at a route flag while you're within 10 m of the car), Q to cheer. Gamepads work (sticks, A jump, B slide, X grab, Y cheer, RB switch, RT sprint). On phones: a virtual stick (push to the edge to sprint), drag to look, flick up to jump, flick down to slide, plus buttons.

## What's in v1

| PRD area | Status |
| --- | --- |
| Physics sim (phase 1) | Done. Rigid chassis on ray-cast wheels, rollers that turn the car off the walls, DC motor on a sagging battery, mass dampers on sliding joints, brake sponges, air drag, open-class crash damage. Fixed 480 Hz step, deterministic. |
| Garage + track (phase 3) | Done. All nine slots, 56 parts, 8 bodies (each in stock and clear), fit rules, live tech inspection, regulation/open class, the test lane with replay, heat / time trial / endurance / cup, three rival AIs (they're just builds), telemetry and advice, tokens and a parts shop. 4 courses plus the practice lane. |
| Cowl designer (phase 4) | Shape and paint editors, snap-on parts, lightening, decals (vector sheet plus personal image uploads), live regulation and CoG. Sharing is by link. **The public gallery isn't built:** it needs a backend and a moderation decision (see below). |
| City (phases 2 and 5) | One hand-built nine-block district, three street courses (two with forks), runner with stamina, jump, slide, vault and climb, tether ring and spirit multiplier, rescue, cheer, trail, glow, off-screen arrow and low close-up camera, first/third person and drone views, comfort settings, keyboard/mouse, gamepad and touch. |
| Online (phase 6) | Not in v1. Ghosts are local (re-simulated from build + seed). |

Out of scope: real-time multiplayer, a larger city, photogrammetry, player mesh uploads and monetisation. The owner’s realism request overrides the PRD’s earlier exclusion of photorealistic city *visual quality* on the existing district.

## Answers to the PRD's open questions

- **Name, and whether to say "Mini 4WD".** *Rollout GP.* "Rollout" is both what you do (release the car) and what the rollers do. Branding never uses "Mini 4WD", Tamiya, or any show name; the hobby is described generically ("self-steering mini racer"). Part names are original and descriptive ("Torque", "Sprint", "Two-tier front stay"). The settings screen states the game isn't affiliated with Tamiya or the show. Where a number is a real published spec, the part says so and cites the source, e.g. "Tamiya setup guide": that is a factual citation, not branding. Whether to keep those citations at all is a legal call (see the owner checklist).
- **Desktop-first or mobile from day one?** *Desktop-first, but every screen works at phone width from day one.* Garage panels become bottom sheets; the city run has touch controls; there is a fast-graphics setting. The garage, track races and body shop are just as good on a phone. The city run is best with a mouse or gamepad.
- **Should the cheer boost exist?** *Yes, kept small, and switchable.* It adds 0.32 V to the pack for about a second, only while you're within 10 m, with an 8-second cooldown: roughly 3% more speed for a moment. It never changes direction, so the car still decides its own line; the only directional influence is the route switch, which is a track switch, not steering. Settings has "Cheer boost: Off (purist)" for players who want the run to be all build.
- **Regulation or open mode by default?** *Regulation by default.* The tech inspection is what teaches the real hobby: going wide on rollers runs into the 105 mm cap, and big tires run into the 70 mm height limit. Open class is one switch in the garage's Inspect tab. It drops the limits and turns on crash damage (a lightened clear body cracks; a bent stay pulls a roller 3 mm inboard). City runs accept any build, as the PRD suggests.
- **Solo with async ghosts, or live racing?** *Solo with ghosts for v1.* The sim is deterministic, so a ghost is just the stored build plus the seed, re-simulated alongside you. Live heats need a backend and are phase 6.

## Other decisions, and why

- **Stack: Vite + React + TypeScript, deployed as a static site.** The PRD asks for Three.js (WebGPU renderer with WebGL 2 fallback), Rapier in a Web Worker, React for the UI and IndexedDB for saves. Nothing in v1 needs a server, so there isn't one.
- **The sim runs ten times life size with ten times gravity.** That is a pure change of units: every length and speed ×10, every time unchanged. It keeps a 150 mm car in the size range Rapier's tolerances are tuned for. One sim unit is 100 mm.
- **Rollers don't use Rapier's collisions.** A wall built from triangles has seams every few centimetres. A roller sliding along it at 30 km/h caught on each seam and was kicked off the wall: reproduced in isolation (one long quad: fine; the same wall split into 0.8 u quads: kicked), and Rapier's internal-edge flag didn't fix it. Rollers meet the lane's analytic wall surface through a small sequential-impulse solver instead (bounce and friction set by roller type). The chassis and body still use Rapier against the track mesh.
- **Determinism.** The deterministic Rapier build, a fixed step, and track geometry and car maths built only from + − × ÷ and √ (`src/sim/dmath.ts` has deterministic sin/cos/atan2). `Math.sin` differs in the last bits between browsers, and a ghost has to replay identically anywhere.
- **Cars don't collide with each other on the track.** On a 3-lane course a car that has lapped you shares your lane, and a rear-end would make one car's result depend on another's. Each car's run is decided by its own build alone.
- **The runner uses a small custom controller, not Rapier's character controller (a deviation from the PRD's table).** The city is all boxes, which a capsule-vs-box controller handles exactly. Running it on the main thread with no physics engine avoids loading a second 4 MB Rapier module there and keeps input lag at zero. The car still runs in the worker.
- **Banks pivot on the centre lane, and the track stands on 100 mm legs.** Pivoting on the inside edge doubled the outer lane's climb into the bank and launched cars at the top of it. Pivoting on the centre lane drops the inner lane, so the track stands on legs, like a real raised circuit.
- **Sharing is by link.** A build or body is a few hundred bytes of JSON, compressed into the URL hash, so no server is needed and everything coming in is sanitised. Personal sticker images stay on your device and are stripped from links (they'd make links huge, and they aren't moderated).
- **Endurance compresses the battery.** Real packs last most of an hour, so endurance races drain them 55 times faster (a labelled game value). The pit timing then matters: on Sunday Oval, never pitting costs about 4 s, pitting at lap 8 fades again at the end, and lap 12 is fastest.
- **Real numbers vs game values.** Regulation limits, motor speed ranges (Sprint 20,700–27,200 rpm; Rev twin 14,300–17,400 rpm), the 1.5 g and 4.2 g damper weights, and 5:1 / 3.5:1 gear behaviour come from published specs and are labelled "Real-world" in the garage. Everything else (stall torques, tire grip, roller drag, damage thresholds) is a game value tuned in simulation.

## Architecture

```
src/sim/        the deterministic simulation (runs in the worker, and in Node for tests)
  parts.ts      the catalog: 9 slots, 56 parts
  build.ts      fit rules, tech inspection, build -> physical spec (mass, CoG, inertia, motor constants)
  body.ts       body recipes and their mass / CoG / toughness
  car.ts        the car: ray-cast wheels, roller-wall solver, motor + battery, dampers, brakes
  track/        modular pieces -> swept lane strips (physics and render share them)
  race.ts       a race: laps, lane changes, course-outs, telemetry, pits, damage
  cityRun.ts    the car on a street course with forks, rescues and the cheer
  worker.ts     runs races on its own clock and streams poses
src/city/       the district layout, street courses, the runner controller
src/render/     three.js: tracks, cars, bodies + paint, the city, cameras, audio
src/app/        React screens: home, garage, races, results, body shop, city, settings
src/game/       formats, rivals, rewards, advice
src/store/      the save file (IndexedDB, with localStorage and memory fallbacks)
scripts/        dev tools: sweeps, traces and probes used to tune the physics
```

## Development

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # physics/tuning, compatibility, storage formats, models and worker recovery
npm run build      # typecheck + production build
npx tsx scripts/sweep.ts dragon   # every build variant on a track, all three lanes
```

In development builds only, `window.__dev` can grant tokens, equip parts and change settings, for driving flows headlessly. `?touch=1` forces the touch layout.

## Historical v1 verification (before the realism branch)

- **30 automated tests**, including the PRD's phase 1 exit criterion: gear ratio, rollers, tires, dampers and brakes each move lap times and course-outs the way the real hobby says they should. Also: determinism, fair lanes, every rival build legal, rewards, saves, share links, city course joins, runner collision, and crash damage.
- **Rendered and read** (headless Chrome on its software WebGL 2 renderer) at 1280×800 and 390×844: home, garage, track select, a live heat, results, replay, body shop, settings, the city run (first person, drone, touch layout) and a course-out in the city.
- **Not verified:** the WebGPU path on a real GPU (headless only exercises the WebGL 2 fallback); the PRD's performance targets (60 fps on a mid-range laptop for a 3-car heat, 30 fps on a recent phone); a real gamepad; real touch input; audio; motion comfort; whether chasing the car is fun for two minutes (the phase 2 exit criterion needs people).

## Owner checklist (things only you can do)

- [ ] **Play it on real hardware**, especially a phone and a mid-range laptop. Check the frame rate in a 3-car heat and in the city, and try the city run with a gamepad and with touch.
- [ ] **Decide on IP before launch or monetisation** (the PRD's top risk). The game uses original names and doesn't say "Mini 4WD" in its branding, but it cites Tamiya's published specs in part descriptions and mentions the hobby and the show generically. Get advice on whether to keep those citations.
- [ ] **Public gallery, leaderboards and online ghosts** need a backend. Your Supabase free tier is at its limit of two active projects (heatcheck and attn). Pausing one, or upgrading, frees a slot; then it needs a schema for shared bodies, ghosts and times with row-level security. Runs are deterministic, so the server can verify a submitted time by re-simulating build + seed. A public gallery also needs a moderation policy for names and stickers before it opens.
- [ ] Optional: a custom domain in Vercel.


## Workshop candidate: decisions and changes

The art direction is a graphite workshop and a restrained race broadcast: charcoal panels, warm neutral plastic, brushed metal, red identity accents and yellow selection highlights. System fonts avoid a third-party font request and keep the initial load self-contained. Panels have a sufficiently opaque dark base even over a bright scene; blur is secondary. Keyboard focus, radio/tab arrow navigation, designer handles and reduced-motion behavior were added. Touch layouts remain, and panel gaps now pass input to the 3D canvas. Phone overflow and rendered contrast still require the screenshot pass.

Lighting uses AgX and an original half-float HDR softbox panorama filtered through PMREM. A procedural HDR was chosen because it is reproducible, small and independent of external asset rights. The shared `three/webgpu` renderer uses r186 `RenderPipeline` and TSL bloom/DoF nodes; classic EffectComposer is not used. High/Ultra have highlight-only bloom, Ultra has macro DoF in the garage and track cameras (disabled overhead). Medium/Low render directly with the same PBR materials. Garage contact masks remain on Low; the city uses CSMShadowNode on High/Ultra. TAA/motion blur, SSR and screen-space AO have not been enabled without a runtime budget measurement.

Catalog dimensions drive the component generators, including actual 9–19 mm roller diameters and tire widths. Stationary pieces are merged by finish; wheels remain independent. The old roller trim exceeded its nominal diameter; the new generators are checked against the catalog at every tier. Body lofts remain recipe-driven, with clearcoat, tinted polycarbonate, texture-based seam/decal relief and actual lightening-hole cut edges. Source files and licence notes are in [ASSETS.md](ASSETS.md).

The garage loads a baked cutting mat/workbench, magnetic tray, screws, driver and calliper. Part thumbnails are rendered on demand with the existing renderer and cached. Tracks use unchanged lane samples with moulded wall tops and section seams. The hall has barriers, original event graphics, beams and ceiling panels. The existing city has material detail, storefronts and facade LODs; a skinned parametric runner and first-person arms replace the old torso capsule. The road surface now respects the sunken market pit instead of covering it with an asphalt plane. A sculpted Blender runner remains outstanding.

Launch fixes include complete sticker backups and restore, transaction-completion checks, malformed-save recovery, serialized autosaves around restore/delete, ghost-only sticker loading, cup progress preserved through retuning and the body shop, worker failure recovery for both modes, and clear error screens. Worker transport is the only changed file under `src/sim`; physics, parts, tracks, worker implementation and city collision/layout are byte-for-byte unchanged. All five sweeps and the rivals, city, endurance and damage harnesses were rerun; outputs are committed under `docs/verification/tuning/`. The physics worker bundle remains `worker-DwMzx2No.js`.

## Quality and performance budgets

New profiles auto-select Low on <=2 cores or <=2 GB reported memory, Medium on coarse pointers or conservative/unknown hardware, and High on >=8 cores and >=8 GB. Ultra is explicit. Existing Low/High choices are preserved by `migrateProfile`.

| Tier | DPR cap | Shadow map | Car paint/relief | Starter triangles | Equipped stress case triangles | Per-car target ceiling |
| --- | ---: | ---: | --- | ---: | ---: | ---: |
| Low | 1 | off | 256×128 | 21,736 | 30,616 | 40,000 |
| Medium | 1.25 | 1024 | 512×256 | 32,924 | 62,588 | 80,000 |
| High | 1.5 | 2048 | 1024×512 | 38,252 | 75,788 | 100,000 |
| Ultra | 2 | 2048 | 1024×512 | 48,908 | 102,188 | 140,000 |

Geometry counts come from `npm run models:budget`, including the shell/add-ons. The stress fixture has double stays, side rollers, dampers, brakes, ball bearings and twelve holes; it is not an exhaustive maximum over all recipes. The starter has 22 material meshes; the stress fixture has 23. These are source geometry counts, **not renderer draw counts**: transparent passes, shadows and postprocessing add work.

Runtime frame time / `renderer.info` draw calls / rendered triangles for **every tier remain unmeasured**. In dev, add `?stats=1`; the overlay and `canvas.dataset.metrics` expose those numbers, and are removed from production builds. Acceptance targets remain 60 fps on a mid-range laptop in a three-car heat and 30 fps on a recent phone. There is no basis to claim they are met yet.

Download budgets: <=450 kB gzip for initial home JS/CSS/HTML, <=100 kB raw for the optional workshop mesh, <=75 kB gzip for the city screen chunk. HTML references total approximately 372.2 kB gzip; the asynchronously loaded workshop loader/model adds approximately 43.7 kB. The city and other screens are lazy-loaded; the initial home does not load Rapier. Surface detail maps are 128/256 square; the city road-marking canvas is a deliberate 2048² exception to the per-car texture budget. No external texture downloads. Final measured bundle sizes are recorded in the verification status.

## Completing verification and deployment

Run the desktop/phone render matrix in `docs/verification/STATUS.md` against the baseline checkout and this branch. Inspect every image and fix defects before calling the result hyper-realistic or production-ready. Exercise WebGL 2 and WebGPU, all tiers, clear bodies, personal stickers, import/export/delete, cup retuning and city cameras. The renderer reports a failed frame and offers a Low-graphics reload rather than leaving a frozen scene silently interactive.

Push `refine/realism` through GitHub, verify the Vercel preview, then merge to `main` and push. Never run `vercel deploy`. Vite emits `/version.json` with the release candidate version and `VERCEL_GIT_COMMIT_SHA` (local builds use git HEAD); it has `no-store` caching so production can be compared with `git rev-parse HEAD`. Verify both HTTP 200 and the revision. No preview, merge or live revision match has been verified in this environment.

Additional owner/environment checklist:

- [ ] Restore usable GitHub authentication/network access and a browser-capable environment; complete preview verification and git-connected deployment.
- [ ] Complete and inspect before/after screenshots, especially garage, heat and city; approve the art against the requested macro-photography bar.
- [ ] Real-hardware WebGPU/WebGL, phone/laptop fps, gamepad, touch, audio and motion-comfort playtests.
- [ ] IP decision on the Tamiya spec citations; the original designs do not resolve that separate decision.
- [ ] Backend/moderation for public gallery, leaderboards and online ghosts; the owner decides whether to pause a Supabase project or upgrade.
- [ ] Blender availability for the sculpted character and baking pass. No paid API key or new service account was needed or requested.

## Reusable `refine` command

This repository packages a generic launch-pass skill and a portable CLI launcher. It contains no Rollout-specific physics or art assumptions. From any shell:

```sh
/path/to/rolloutgp/refine /path/to/existing-project
/path/to/rolloutgp/refine /path/to/existing-project --focus "Preserve the API; refine onboarding and mobile layouts"
/path/to/rolloutgp/refine /path/to/existing-project --print
/path/to/rolloutgp/refine /path/to/existing-project --ship
```

The command sends the packaged [.agents/skills/refine/SKILL.md](.agents/skills/refine/SKILL.md) to the installed Codex CLI over stdin with the target working directory and workspace-write sandbox. It preserves normal configured approvals. Default scope is local edits/commits; `--ship` authorizes the existing preview/merge/deploy workflow after verification. `--print` works without Codex. Add this repository to PATH to invoke it as `refine`, or invoke the absolute path. No global shell/profile configuration was changed. The skill validator and a launcher smoke test (including a path with spaces and a stub CLI) passed; no second agent was launched.
