// Print a car's state through a run, for debugging the physics.
import RAPIER from "@dimforge/rapier3d-deterministic-compat";
import { Race } from "../src/sim/race.ts";
import { STARTER_BUILD, type Build } from "../src/sim/build.ts";
import { trackById } from "../src/sim/tracks.ts";
import { toKmh } from "../src/sim/units.ts";
import { rotate } from "../src/sim/car.ts";
import { frameAt } from "../src/sim/track/geometry.ts";

async function main() {
  await RAPIER.init();
  const track = trackById(process.argv[2] ?? "practice")!;
  const patch = JSON.parse(process.argv[3] ?? "{}") as Partial<Build>;
  const until = Number(process.argv[4] ?? 6);
  const every = Number(process.argv[5] ?? 0.05);
  const build = { ...STARTER_BUILD, ...patch };
  const race = new Race(RAPIER, { track, entries: [{ id: "a", name: "a", build, lane: Number(process.env.LANE ?? 0), motorSeed: 1, color: "#f00" }], laps: 3, format: "practice", seed: 1, maxTime: until });
  const r = race.runners[0];
  let next = 0;
  while (!race.done && race.time < until) {
    race.tick();
    if (race.time >= next) {
      next += every;
      const q = r.car.body.rotation();
      const f = rotate(q, { x: 1, y: 0, z: 0 });
      const u = rotate(q, { x: 0, y: 1, z: 0 });
      const fr = frameAt(race.geo.strips[r.strip], r.k);
      const yaw = Math.asin(Math.max(-1, Math.min(1, f.x * fr.r.x + f.y * fr.r.y + f.z * fr.r.z))) * 57.3;
      const roll = Math.acos(Math.max(-1, Math.min(1, u.x * fr.u.x + u.y * fr.u.y + u.z * fr.u.z))) * 57.3;
      const ft = race.featureAt(r.xh)?.name ?? "";
      console.log(
        `t ${race.time.toFixed(2)} xh ${r.xh.toFixed(2).padStart(6)} lat ${(r.lateral * 100).toFixed(1).padStart(6)}mm vert ${(r.vertical * 100).toFixed(1).padStart(6)}mm v ${toKmh(r.car.speed()).toFixed(1).padStart(5)} yaw ${yaw.toFixed(1).padStart(6)} tilt ${roll.toFixed(1).padStart(5)} gnd ${r.car.grounded} ${r.car.braking ? "B" : " "} V ${r.car.volts.toFixed(2)} I ${r.car.current.toFixed(1)} ${r.status} ${ft}`,
      );
    }
  }
  console.log(JSON.stringify({ laps: r.telemetry.laps, out: r.telemetry.courseOut }));
}
main();
