import RAPIER from "@dimforge/rapier3d-deterministic-compat";
import { Race } from "../src/sim/race.ts";
import { STARTER_BUILD, type Build } from "../src/sim/build.ts";
import { trackById } from "../src/sim/tracks.ts";
async function main() {
  await RAPIER.init();
  const track = trackById(process.argv[2] ?? "practice")!;
  const base: Partial<Build> = { motor: "mo-turbo", gear: "ge-4" };
  for (const [name, d] of [["none", null], ["slim rear", { part: "da-slim", mount: "rear" }], ["cyl rear", { part: "da-cyl", mount: "rear" }], ["cyl front", { part: "da-cyl", mount: "front" }], ["heavy rear", { part: "da-heavy", mount: "rear" }]] as const) {
    const build = { ...STARTER_BUILD, ...base, dampers: d ? (d as Build["dampers"]) : { part: null, mount: "rear" as const } };
    const race = new Race(RAPIER, { track, entries: [{ id: "a", name: "a", build, lane: 0, motorSeed: 1, color: "#f00" }], laps: 3, format: "practice", seed: 1, maxTime: 60 });
    // Count wheel-off events and total airtime, and measure peak bounce after landings.
    let hops = 0, air = 0, prevG = 4;
    while (!race.done) { race.tick(); const g = race.runners[0].car.grounded; if (g === 0 && prevG > 0) hops++; if (g === 0) air += 1 / 480; prevG = g; }
    const t = race.runners[0].telemetry;
    console.log(name.padEnd(11), "finish", t.finishTime, "hops", hops, "air", air.toFixed(2), "jumps>0.05:", t.jumps.filter((j) => j.airtime > 0.05).map((j) => `${j.airtime.toFixed(2)}`).join(" "));
  }
}
main();
