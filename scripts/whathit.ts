import RAPIER from "@dimforge/rapier3d-deterministic-compat";
import { Race } from "../src/sim/race.ts";
import { STARTER_BUILD, type Build } from "../src/sim/build.ts";
import { trackById } from "../src/sim/tracks.ts";
import { rotate } from "../src/sim/car.ts";
async function main() {
  await RAPIER.init();
  const track = trackById(process.argv[2])!;
  const patch = JSON.parse(process.argv[3] ?? "{}") as Partial<Build>;
  const t0 = Number(process.argv[4]);
  const race = new Race(RAPIER, { track, entries: [{ id: "a", name: "a", build: { ...STARTER_BUILD, ...patch }, lane: Number(process.env.LANE ?? 0), motorSeed: 1, color: "#f00" }], laps: 3, format: "practice", seed: 1, maxTime: t0 + 1 });
  while (race.time < t0) race.tick();
  const car = race.runners[0].car;
  const t = car.body.translation(), q = car.body.rotation();
  const f = rotate(q, { x: 1, y: 0, z: 0 });
  const geo = race.geo;
  const per = 8;
  for (const dy of [0.02, 0.08, 0.15, 0.3]) for (const dz of [-0.4, 0, 0.4]) {
    const r = rotate(q, { x: 0, y: dy, z: dz });
    const ray = new RAPIER.Ray({ x: t.x + r.x, y: t.y + r.y, z: t.z + r.z }, f);
    const hit = race.world.castRayAndGetNormal(ray, 2, true, undefined, undefined, undefined, car.body);
    if (!hit) { console.log(`dy ${dy} dz ${dz}: none`); continue; }
    const tri = hit.featureId ?? -1;
    const v0 = geo.indices[tri * 3];
    // which strip and sample, which profile edge
    let strip = -1, local = 0;
    geo.stripVertexRanges.forEach(([a, b], i) => { if (v0 >= a && v0 < b) { strip = i; local = v0 - a; } });
    const sample = Math.floor(local / per), edge = local % per;
    console.log(`dy ${dy} dz ${dz}: toi ${hit.timeOfImpact.toFixed(3)} n(${hit.normal.x.toFixed(2)},${hit.normal.y.toFixed(2)},${hit.normal.z.toFixed(2)}) tri ${tri} strip ${strip} sample ${sample} edge ${edge} collider ${hit.collider.handle}`);
  }
}
main();
async function near() {
  await RAPIER.init();
  const { buildTrack } = await import("../src/sim/track/geometry.ts");
  const geo = buildTrack(trackById("sunday")!);
  const [hx, hy, hz] = process.env.P!.split(",").map(Number);
  const P = geo.positions;
  for (let tri = 0; tri < geo.indices.length / 3; tri++) {
    let cx = 0, cy = 0, cz = 0;
    for (let j = 0; j < 3; j++) { const v = geo.indices[tri * 3 + j]; cx += P[v * 3] / 3; cy += P[v * 3 + 1] / 3; cz += P[v * 3 + 2] / 3; }
    if (Math.hypot(cx - hx, cy - hy, cz - hz) < 0.35) {
      const v0 = geo.indices[tri * 3];
      let strip = -1, local = 0;
      geo.stripVertexRanges.forEach(([a, b], i) => { if (v0 >= a && v0 < b) { strip = i; local = v0 - a; } });
      console.log(`tri ${tri} strip ${strip} sample ${Math.floor(local / 8)} edge ${local % 8} c(${cx.toFixed(2)},${cy.toFixed(2)},${cz.toFixed(2)})`);
    }
  }
}
if (process.env.P) near();
