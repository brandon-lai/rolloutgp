import RAPIER from "@dimforge/rapier3d-deterministic-compat";
import { CityRun } from "../src/sim/cityRun.ts";
import { STARTER_BUILD, type Build } from "../src/sim/build.ts";
import { COURSES } from "../src/city/layout.ts";
async function main() {
  await RAPIER.init();
  const builds: [string, Build][] = [
    ["stock", STARTER_BUILD],
    ["turbo4", { ...STARTER_BUILD, motor: "mo-turbo", gear: "ge-4", rollers: { ...STARTER_BUILD.rollers, roller: "ro-13b" } }],
    ["sprint35", { ...STARTER_BUILD, motor: "mo-sprint", gear: "ge-35" }],
  ];
  for (const c of COURSES) for (const [name, build] of builds) for (const fork of [0, 1]) {
    if (fork === 1 && !c.segments.some((s) => s.next.length > 1)) continue;
    const run = new CityRun(RAPIER, { courseId: c.id, build, motorSeed: 1 });
    for (const [s] of run.forks) run.setFork(s, fork);
    let outAt = -1;
    const t0 = performance.now();
    while (run.status !== "finished" && run.time < 400) {
      run.tick();
      if (run.status === "out" && outAt < 0) outAt = run.time;
      if (run.status === "out" && run.time - outAt > 2) { run.rescue(); outAt = -1; }
    }
    const r = run.result();
    console.log(c.id.padEnd(9), name.padEnd(9), `fork${fork}`, r.finished ? `fin ${r.time.toFixed(1)}s` : `NOT FINISHED t=${run.time.toFixed(0)}`, `outs ${r.courseOuts}`, `top ${r.topKmh.toFixed(1)}`, `laps ${r.laps.map((l) => l.toFixed(1)).join(",")}`, `jumps ${r.jumps.map((j) => j.airtime.toFixed(2)).join(",")}`, `${((performance.now() - t0) / 1000).toFixed(1)}s cpu`);
    run.free();
  }
}
main();
