import RAPIER from "@dimforge/rapier3d-deterministic-compat";
import { Race } from "../src/sim/race.ts";
import { RIVALS, rivalBuild } from "../src/game/rivals.ts";
import { trackById } from "../src/sim/tracks.ts";
async function main() {
  await RAPIER.init();
  const t = trackById(process.argv[2])!;
  const r = RIVALS.find((x) => x.id === process.argv[3])!;
  const b = rivalBuild(r, Number(process.argv[4]) as 1);
  for (const lane of [0, 1, 2]) for (const seed of [1, 2]) {
    const race = new Race(RAPIER, { track: t, entries: [{ id: "a", name: "a", build: b, lane, motorSeed: 3, color: "#fff" }], laps: 3, format: "heat", seed, maxTime: 90 });
    race.runToEnd(); const tl = race.runners[0].telemetry; race.free();
    const o = tl.courseOut;
    const prev = race.geo.features.filter((f) => f.end <= (o?.xh ?? 0)).slice(-1)[0];
    console.log(lane, seed, o ? `${o.cause} xh=${o.xh.toFixed(1)} lap${o.lap} ${o.speedKmh.toFixed(1)}km/h after ${prev?.name}(${prev?.end.toFixed(1)})` : `fin ${tl.finishTime}`, "top", tl.topKmh.toFixed(1), "maxair", Math.max(0, ...tl.jumps.map((j) => j.airtime)).toFixed(2));
  }
  console.log(race0features(t));
}
function race0features(_t: unknown) { return ""; }
main();
