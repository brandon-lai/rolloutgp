import RAPIER from "@dimforge/rapier3d-deterministic-compat";
import { Race } from "../src/sim/race.ts";
import { STARTER_BUILD, type Build } from "../src/sim/build.ts";
import { trackById } from "../src/sim/tracks.ts";
async function main() {
  await RAPIER.init();
  const track = trackById(process.argv[2] ?? "bank")!;
  const base: Build = { ...STARTER_BUILD, motor: "mo-turbo", gear: "ge-4" };
  for (const [name, d] of [["none", null], ["cyl rear", { part: "da-cyl", mount: "rear" }], ["heavy rear", { part: "da-heavy", mount: "rear" }]] as const) {
    const res: number[] = [];
    for (let seed = 1; seed <= 6; seed++) for (const lane of [0, 1, 2]) {
      const build = { ...base, dampers: d ? (d as Build["dampers"]) : { part: null, mount: "rear" as const } };
      const race = new Race(RAPIER, { track, entries: [{ id: "a", name: "a", build, lane, motorSeed: 1, color: "#f00" }], laps: 3, format: "practice", seed, maxTime: 60 });
      race.runToEnd(); res.push(race.runners[0].telemetry.hops); race.free();
    }
    console.log(name.padEnd(11), "mean hops", (res.reduce((a, b) => a + b) / res.length).toFixed(1), res.join(","));
  }
}
main();
