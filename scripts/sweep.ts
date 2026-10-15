// Run a set of builds on a track (all lanes) and print a compact table.
import RAPIER from "@dimforge/rapier3d-deterministic-compat";
import { Race } from "../src/sim/race.ts";
import { STARTER_BUILD, carSpec, type Build } from "../src/sim/build.ts";
import { trackById } from "../src/sim/tracks.ts";

export const VARIANTS: [string, (b: Build) => Build][] = [
  ["stock", (b) => b],
  ["torque 5:1", (b) => ({ ...b, motor: "mo-torque" })],
  ["torque 4:1", (b) => ({ ...b, motor: "mo-torque", gear: "ge-4" })],
  ["rev 5:1", (b) => ({ ...b, motor: "mo-rev" })],
  ["rev 3.5:1", (b) => ({ ...b, motor: "mo-rev", gear: "ge-35" })],
  ["turbo 4:1", (b) => ({ ...b, motor: "mo-turbo", gear: "ge-4" })],
  ["turbo 4:1 +brake", (b) => ({ ...b, motor: "mo-turbo", gear: "ge-4", brakes: { part: "br-medium", position: "rear", gap: 1 } })],
  ["turbo 4:1 +damp", (b) => ({ ...b, motor: "mo-turbo", gear: "ge-4", dampers: { part: "da-cyl", mount: "rear" } })],
  ["turbo 4:1 hard", (b) => ({ ...b, motor: "mo-turbo", gear: "ge-4", tires: "ti-hard-low" })],
  ["turbo 4:1 arched", (b) => ({ ...b, motor: "mo-turbo", gear: "ge-4", tires: "ti-arched" })],
  ["turbo 4:1 soft24", (b) => ({ ...b, motor: "mo-turbo", gear: "ge-4", tires: "ti-soft-low" })],
  ["turbo 4:1 bb13", (b) => ({ ...b, motor: "mo-turbo", gear: "ge-4", rollers: { ...b.rollers, roller: "ro-13b" } })],
  ["turbo 4:1 wide19", (b) => ({ ...b, motor: "mo-turbo", gear: "ge-4", rollers: { ...b.rollers, roller: "ro-19b", front: "st-f-wide", rear: "st-r-wide" } })],
  ["sprint 3.5:1", (b) => ({ ...b, motor: "mo-sprint", gear: "ge-35" })],
  ["sprint 3.5 +brake", (b) => ({ ...b, motor: "mo-sprint", gear: "ge-35", brakes: { part: "br-strong", position: "rear", gap: 1 } })],
  ["sprint 3.5 +br+da", (b) => ({ ...b, motor: "mo-sprint", gear: "ge-35", brakes: { part: "br-strong", position: "both", gap: 1 }, dampers: { part: "da-cyl", mount: "rear" } })],
  ["sprint 3.5 full", (b) => ({ ...b, motor: "mo-sprint", gear: "ge-35", tires: "ti-hard-low", rollers: { roller: "ro-19b", front: "st-f-wide", rear: "st-r-wide", side: null }, brakes: { part: "br-medium", position: "rear", gap: 1 }, dampers: { part: "da-cyl", mount: "rear" }, bearings: "be-ball-grease" })],
];

async function main() {
  await RAPIER.init();
  const track = trackById(process.argv[2] ?? "practice")!;
  const filter = process.argv[3];
  const lanes = track.lanes === 3 ? [0, 1, 2] : [0];
  for (const [name, f] of VARIANTS) {
    if (filter && !name.includes(filter)) continue;
    const build = f(STARTER_BUILD);
    const spec = carSpec(build);
    const cells: string[] = [];
    for (const lane of lanes) {
      const race = new Race(RAPIER, { track, entries: [{ id: "a", name, build, lane, motorSeed: 1, color: "#f00" }], laps: track.laps, format: "practice", seed: 1, maxTime: 90 });
      race.runToEnd();
      const t = race.runners[0].telemetry;
      const air = Math.max(0, ...t.jumps.map((j) => j.airtime));
      cells.push(t.finishTime !== null ? `${t.finishTime.toFixed(2)}s air${air.toFixed(2)}` : `OUT ${t.courseOut?.cause} @${t.courseOut?.feature} L${t.courseOut?.lap}`);
      race.free();
    }
    console.log(name.padEnd(18), `${spec.stats.topSpeedKmh}km/h`.padEnd(9), cells.map((c) => c.padEnd(34)).join(" "));
  }
}
main();
