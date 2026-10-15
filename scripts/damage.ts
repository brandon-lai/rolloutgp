import RAPIER from "@dimforge/rapier3d-deterministic-compat";
import { Race } from "../src/sim/race.ts";
import { STARTER_BUILD } from "../src/sim/build.ts";
import { trackById } from "../src/sim/tracks.ts";
async function main() {
  await RAPIER.init();
  for (const [name, b] of [["sprint", { ...STARTER_BUILD, motor: "mo-sprint", gear: "ge-35" }], ["sprint clear holed", { ...STARTER_BUILD, motor: "mo-sprint", gear: "ge-35", body: { ...STARTER_BUILD.body, clear: true, holes: 10 } }], ["turbo", { ...STARTER_BUILD, motor: "mo-turbo", gear: "ge-4" }], ["stock", STARTER_BUILD]] as const) {
    for (const t of ["sunday", "dragon", "grand"]) {
      const race = new Race(RAPIER, { track: trackById(t)!, entries: [{ id: "a", name, build: b, lane: 0, motorSeed: 1, color: "#fff" }], laps: 3, format: "heat", seed: 3, open: true });
      race.runToEnd();
      console.log(name.padEnd(20), t.padEnd(7), race.runners[0].telemetry.damage.join(", ") || "no damage", race.runners[0].telemetry.finishTime ?? "OUT", "maxImpact", race.runners[0].maxImpact.toFixed(0));
      race.free();
    }
  }
}
main();
