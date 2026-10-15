import RAPIER from "@dimforge/rapier3d-deterministic-compat";
import { Race } from "../src/sim/race.ts";
import { STARTER_BUILD, type Build } from "../src/sim/build.ts";
import { trackById } from "../src/sim/tracks.ts";
import { rotate } from "../src/sim/car.ts";
import { frameAt } from "../src/sim/track/geometry.ts";
async function main() {
  await RAPIER.init();
  const track = trackById(process.argv[2])!;
  const patch = JSON.parse(process.argv[3] ?? "{}") as Partial<Build>;
  const [t0, t1, every] = [Number(process.argv[4]), Number(process.argv[5]), Number(process.argv[6] ?? 0.02)];
  const race = new Race(RAPIER, { track, entries: [{ id: "a", name: "a", build: { ...STARTER_BUILD, ...patch }, lane: Number(process.env.LANE ?? 0), motorSeed: 1, color: "#f00" }], laps: 3, format: "practice", seed: 1, maxTime: t1 + 1 });
  let next = t0;
  while (race.time < t1) {
    race.tick();
    if (race.time < next) continue;
    next += every;
    const r = race.runners[0], car = r.car, b = car.body;
    const t = b.translation(), q = b.rotation(), up = rotate(q, { x: 0, y: 1, z: 0 });
    const fr = frameAt(race.geo.strips[r.strip], r.k);
    const parts: string[] = [];
    car.spec.wheels.forEach((w, i) => {
      const o = rotate(q, w);
      const ray = new RAPIER.Ray({ x: t.x + o.x, y: t.y + o.y, z: t.z + o.z }, { x: -up.x, y: -up.y, z: -up.z });
      const hit = race.world.castRayAndGetNormal(ray, 0.5, true, undefined, undefined, undefined, b);
      if (hit) {
        const hp = { x: ray.origin.x + ray.dir.x * hit.timeOfImpact, y: ray.origin.y + ray.dir.y * hit.timeOfImpact, z: ray.origin.z + ray.dir.z * hit.timeOfImpact };
        // height of hit point above lane floor plane at car frame
        const dh = (hp.x - fr.p.x) * fr.u.x + (hp.y - fr.p.y) * fr.u.y + (hp.z - fr.p.z) * fr.u.z;
        const lat = (hp.x - fr.p.x) * fr.r.x + (hp.y - fr.p.y) * fr.r.y + (hp.z - fr.p.z) * fr.r.z;
        parts.push(`w${i} toi${hit.timeOfImpact.toFixed(3)} n(${hit.normal.x.toFixed(2)},${hit.normal.y.toFixed(2)},${hit.normal.z.toFixed(2)}) hitH${(dh * 100).toFixed(1)} hitLat${(lat * 100).toFixed(1)}`);
      } else parts.push(`w${i} -`);
    });
    console.log(`t ${race.time.toFixed(3)} strip ${r.strip} k ${r.k} lat ${(r.lateral * 100).toFixed(1)} vert ${(r.vertical * 100).toFixed(1)} | ${parts.join(" | ")}`);
  }
}
main();
