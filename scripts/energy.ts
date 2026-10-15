import RAPIER from "@dimforge/rapier3d-deterministic-compat";
import { Race } from "../src/sim/race.ts";
import { STARTER_BUILD } from "../src/sim/build.ts";
import { trackById } from "../src/sim/tracks.ts";
async function main() {
  await RAPIER.init();
  for (const tires of ["ti-std", "ti-arched", "ti-soft-low", "ti-hard-low"]) for (const roller of ["ro-9p", "ro-13b"]) {
    const build = { ...STARTER_BUILD, motor: "mo-turbo", gear: "ge-4", tires, rollers: { ...STARTER_BUILD.rollers, roller } };
    const race = new Race(RAPIER, { track: trackById(process.argv[2] ?? "practice")!, entries: [{ id: "a", name: "a", build, lane: 0, motorSeed: 1, color: "#f00" }], laps: 3, format: "practice", seed: 1, maxTime: 60 });
    race.runToEnd();
    const c = race.runners[0].car;
    console.log(tires.padEnd(12), roller, "finish", race.runners[0].telemetry.finishTime, "scrub", c.scrubWork.toFixed(1), "roller", c.rollerWork.toFixed(1), "corners", race.runners[0].telemetry.corners.map(x=>x.exitKmh).join(","));
  }
}
main();
