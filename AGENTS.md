# Rollout GP invariants

Read README.md, ASSETS.md and docs/verification/STATUS.md before editing.

- Build on the existing game. Never steer the car. Track and city share a garage.
- Do not change simulation behavior, catalog values or track/city collision geometry. Saved ghosts replay build + seed. Render assets never become colliders or change mass/CoG.
- If src/sim must change, explain why in the commit, run every test plus sweep (each track), rivals.ts, citysim.ts, endurance.ts and damage.ts, and record results.
- Catalog dimensions drive car visuals: 105 mm width, 70 mm height, 165 mm length; roller/tire sizes and clearance must agree. 1 sim unit = 100 mm. City renders in metres with the car scaled 1/10.
- Body shells remain procedural recipe lofts. Preserve designs, stickers and URL-hash links. New persisted fields go through migrateProfile. Frozen a2d8cdf compatibility fixtures must keep loading.
- Use three/webgpu and TSL RenderPipeline; never classic EffectComposer. Keep WebGL 2 working. Quality tiers must have a complete Low rendering path.
- Original designs only; no brand/anime lookalikes. Record asset source, license, tool and generator in ASSETS.md. Commit reproducible generators; shipped assets go in public/models.
- No analytics. Personal stickers remain local and are excluded from shared links.
- Test/build after each stage; read desktop/phone screenshots. Document unavailable GPU, device, touch and gamepad tests honestly.
- Dev hooks and frame diagnostics stay behind import.meta.env.DEV.
- Deploy only by GitHub push. Never vercel deploy. Ignore .env* and node_modules. Verify preview before merging main; verify production commit and HTTP 200.
- Owner authorization is required only for irreversible external actions: spending money, new service accounts/terms, deleting cloud resources, or pausing/deleting Vercel/Supabase resources.
