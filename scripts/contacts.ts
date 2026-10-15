import RAPIER from "@dimforge/rapier3d-deterministic-compat";
import { Race } from "../src/sim/race.ts";
import { STARTER_BUILD, type Build } from "../src/sim/build.ts";
import { trackById } from "../src/sim/tracks.ts";
import { toKmh } from "../src/sim/units.ts";

async function main() {
  await RAPIER.init();
  const track = trackById(process.argv[2] ?? "practice")!;
  const patch = JSON.parse(process.argv[3] ?? "{}") as Partial<Build>;
  const [t0, t1] = [Number(process.argv[4]), Number(process.argv[5])];
  const build = { ...STARTER_BUILD, ...patch };
  const race = new Race(RAPIER, { track, entries: [{ id: "a", name: "a", build, lane: Number(process.env.LANE ?? 0), motorSeed: 1, color: "#f00" }], laps: 3, format: "practice", seed: 1, maxTime: t1 });
  const r = race.runners[0];
  const body = r.car.body;
  const names: string[] = [];
  for (let i = 0; i < body.numColliders(); i++) names.push(i === 0 ? "tub" : "shell");
  while (race.time < t1) {
    race.tick();
    if (race.time < t0) continue;
    const parts: string[] = [];
    for (let i = 0; i < body.numColliders(); i++) {
      const c = body.collider(i);
      race.world.contactPairsWith(c, (other) => {
        race.world.contactPair(c, other, (m, flipped) => {
          if (m.numContacts() === 0) return;
          const n = m.normal();
          const s = flipped ? -1 : 1;
          parts.push(`${names[i]} n(${(n.x * s).toFixed(2)},${(n.y * s).toFixed(2)},${(n.z * s).toFixed(2)}) d${m.contactDist(0).toFixed(4)} imp${m.contactImpulse(0).toFixed(4)}`);
        });
      });
    }
    const w = body.angvel();
    console.log(`t ${race.time.toFixed(4)} v ${toKmh(r.car.speed()).toFixed(1)} vert ${(r.vertical * 100).toFixed(1)} lat ${(r.lateral * 100).toFixed(1)} gnd ${r.car.grounded} w(${w.x.toFixed(1)},${w.y.toFixed(1)},${w.z.toFixed(1)}) ${parts.join(" | ")}`);
  }
}
main();
