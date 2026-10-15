// Check every rival build on every track it races: finishes? how fast?
import RAPIER from "@dimforge/rapier3d-deterministic-compat";
import { Race } from "../src/sim/race.ts";
import { RIVALS, rivalBuild } from "../src/game/rivals.ts";
import { TRACKS } from "../src/sim/tracks.ts";
import { inspect, fitProblems } from "../src/sim/build.ts";
async function main() {
  await RAPIER.init();
  for (const t of TRACKS) {
    const tier = t.difficulty as 1 | 2 | 3 | 4;
    for (const r of RIVALS) {
      for (const tt of [tier]) {
        const b = rivalBuild(r, tt);
        const ins = inspect(b);
        const cells: string[] = [];
        for (const lane of [0, 1, 2]) for (const seed of [1, 2]) {
          const race = new Race(RAPIER, { track: t, entries: [{ id: "a", name: "a", build: b, lane, motorSeed: 3, color: "#fff" }], laps: 3, format: "heat", seed, maxTime: 90 });
          race.runToEnd(); const tl = race.runners[0].telemetry; race.free();
          cells.push(tl.finishTime !== null ? tl.finishTime.toFixed(2) : `OUT@${tl.courseOut?.feature}`);
        }
        console.log(t.id.padEnd(8), r.id.padEnd(5), `T${tt}`, ins.legal ? "legal" : "ILLEGAL", fitProblems(b).length ? "FIT!" : "", cells.join(" "));
      }
    }
  }
}
main();
