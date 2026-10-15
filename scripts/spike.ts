// Phase 1 spike: one car on the practice lane, print what happened.
import RAPIER from "@dimforge/rapier3d-deterministic-compat";
import { Race } from "../src/sim/race.ts";
import { STARTER_BUILD, carSpec, type Build } from "../src/sim/build.ts";
import { PRACTICE, trackById } from "../src/sim/tracks.ts";

async function main() {
  await RAPIER.init();
  const trackId = process.argv[2] ?? "practice";
  const track = trackById(trackId) ?? PRACTICE;
  const variants: [string, Partial<Build>][] = [
    ["stock", {}],
    ["gear 3.5", { gear: "ge-35" }],
    ["rev motor", { motor: "mo-rev" }],
    ["turbo 3.5", { motor: "mo-turbo", gear: "ge-35" }],
    ["sprint 3.5", { motor: "mo-sprint", gear: "ge-35" }],
    ["sprint 3.5 hard", { motor: "mo-sprint", gear: "ge-35", tires: "ti-hard-low" }],
  ];
  for (const [name, patch] of variants) {
    const build = { ...STARTER_BUILD, ...patch };
    const spec = carSpec(build);
    const t0 = performance.now();
    const race = new Race(RAPIER, { track, entries: [{ id: "a", name, build, lane: Number(process.env.LANE ?? 0), motorSeed: 1, color: "#f00" }], laps: 3, format: "practice", seed: 1, maxTime: 60 });
    race.runToEnd();
    const r = race.runners[0];
    const tl = r.telemetry;
    console.log(
      name.padEnd(18),
      `mass ${spec.stats.massG}g top~${spec.stats.topSpeedKmh}km/h`,
      `| laps ${tl.laps.map((x) => x.toFixed(2)).join(" ")}`,
      `| top ${tl.topKmh.toFixed(1)}`,
      tl.courseOut ? `| OUT ${tl.courseOut.cause} @${tl.courseOut.feature} lap${tl.courseOut.lap} ${tl.courseOut.speedKmh.toFixed(1)}km/h` : "",
      `| jumps ${tl.jumps.filter((j) => j.airtime > 0.05).map((j) => j.airtime.toFixed(2)).join(",")}`,
      `| ${(performance.now() - t0).toFixed(0)}ms`,
    );
    race.free();
  }
}
main();
