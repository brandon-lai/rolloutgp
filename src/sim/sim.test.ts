// The simulation's promises, from the PRD's phase 1 exit criterion: changing gear
// ratio, rollers and dampers must produce different, predictable lap times and
// course-outs. Plus determinism (a ghost is just a build and a seed), fair lanes,
// and the garage's tech inspection.

import { beforeAll, describe, expect, it } from "vitest";
import RAPIER from "@dimforge/rapier3d-deterministic-compat";
import { Race, type RaceConfig } from "./race.ts";
import { STARTER_BUILD, carSpec, fitProblems, inspect, sanitizeBuild, type Build } from "./build.ts";
import { ALL_TRACKS, BANK, DRAGON, PRACTICE, SUNDAY } from "./tracks.ts";
import { buildTrack } from "./track/geometry.ts";
import { datan2, dcos, dsin } from "./dmath.ts";

beforeAll(async () => {
  await RAPIER.init();
});

function run(build: Build, track = PRACTICE, lane = 0, extra: Partial<RaceConfig> = {}) {
  const race = new Race(RAPIER, {
    track,
    entries: [{ id: "a", name: "a", build, lane, motorSeed: 1, color: "#fff" }],
    laps: track.laps,
    format: "practice",
    seed: 7,
    maxTime: 90,
    ...extra,
  });
  race.runToEnd();
  const t = race.runners[0].telemetry;
  race.free();
  return t;
}

const kit = STARTER_BUILD;
const turbo: Build = { ...kit, motor: "mo-turbo", gear: "ge-4" };

describe("deterministic maths", () => {
  it("matches Math.sin/cos/atan2 closely", () => {
    for (let x = -20; x <= 20; x += 0.137) {
      expect(Math.abs(dsin(x) - Math.sin(x))).toBeLessThan(1e-12);
      expect(Math.abs(dcos(x) - Math.cos(x))).toBeLessThan(1e-12);
    }
    for (const [y, x] of [[1, 2], [-3, 0.5], [0.2, -4], [-1, -1], [0, 1], [1, 0]]) {
      expect(Math.abs(datan2(y, x) - Math.atan2(y, x))).toBeLessThan(1e-11);
    }
  });
});

describe("tracks", () => {
  it("every course closes and has walled lanes", () => {
    for (const t of ALL_TRACKS) {
      const g = buildTrack(t);
      expect(g.strips.length).toBe(t.lanes);
      expect(g.indices.length).toBeGreaterThan(1000);
    }
  });

  it("the lane changer sends each lane on to the next one", () => {
    const g = buildTrack(SUNDAY);
    expect(g.strips.map((s) => s.next)).toEqual([1, 2, 0]);
  });
});

describe("races are deterministic", () => {
  it("same build + track + seed gives the same race, step for step", () => {
    const a = run(turbo, DRAGON);
    const b = run(turbo, DRAGON);
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
  });
});

describe("phase 1: tuning changes results predictably", () => {
  it("lower gear ratios give a higher top speed and faster laps on a fast car", () => {
    const rev = (gear: string) => run({ ...kit, motor: "mo-rev", gear }, SUNDAY).finishTime!;
    const t5 = rev("ge-5"),
      t4 = rev("ge-4"),
      t35 = rev("ge-35");
    expect(t4).toBeLessThan(t5);
    expect(t35).toBeLessThan(t4);
  });

  it("ball-bearing rollers waste less speed on the walls than plastic ones", () => {
    const plastic = run(turbo, SUNDAY).finishTime!;
    const bearing = run({ ...turbo, rollers: { ...turbo.rollers, roller: "ro-13b" } }, SUNDAY).finishTime!;
    expect(bearing).toBeLessThan(plastic - 0.2);
  });

  it("hard, low-grip tires carry more speed out of corners than soft ones", () => {
    const exit = (tires: string) => {
      const t = run({ ...turbo, tires, rollers: { ...turbo.rollers, roller: "ro-13b" } }, BANK);
      return t.corners.reduce((s, c) => s + c.exitKmh, 0) / t.corners.length;
    };
    expect(exit("ti-arched")).toBeGreaterThan(exit("ti-std"));
    expect(exit("ti-std")).toBeGreaterThan(exit("ti-soft-low"));
  });

  it("mass dampers settle the car: fewer bounces on the waves", () => {
    // Bounces are chaotic run to run, so compare totals over all three lanes.
    const hops = (b: Build) => [0, 1, 2].reduce((s, lane) => s + run(b, BANK, lane).hops, 0);
    const none = hops(turbo);
    const damped = hops({ ...turbo, dampers: { part: "da-cyl", mount: "rear" } });
    expect(damped).toBeLessThan(none * 0.88);
  });

  it("brake sponges take speed off before a jump", () => {
    const launch = (b: Build) => {
      const t = run(b, DRAGON);
      const jumps = t.jumps.filter((j) => j.feature === "Dragon back" && j.airtime > 0.1);
      return jumps.reduce((s, j) => s + j.launchKmh, 0) / jumps.length;
    };
    const fast = { ...kit, motor: "mo-rev", gear: "ge-4" };
    expect(launch({ ...fast, brakes: { part: "br-strong", position: "both", gap: 1 } })).toBeLessThan(launch(fast) - 0.5);
  });

  it("too much speed flies off after the dragon back; a sane build lands it", () => {
    const sprint = run({ ...kit, motor: "mo-sprint", gear: "ge-35" }, DRAGON);
    expect(["Dragon back", "Turn 1"]).toContain(sprint.courseOut?.feature);
    const torque = run({ ...kit, motor: "mo-torque" }, DRAGON);
    expect(torque.finishTime).not.toBeNull();
  });
});

describe("lanes are fair", () => {
  it("a 3-lap heat covers the same distance from every lane", () => {
    const times = [0, 1, 2].map((lane) => run(kit, SUNDAY, lane).finishTime!);
    const spread = Math.max(...times) - Math.min(...times);
    expect(spread / times[0]).toBeLessThan(0.01);
  });
});

describe("garage rules", () => {
  it("the kit car passes tech inspection", () => {
    expect(inspect(kit).legal).toBe(true);
    expect(fitProblems(kit)).toEqual([]);
  });

  it("extra-wide plates with big rollers break the 105 mm width rule", () => {
    const wide: Build = { ...kit, rollers: { roller: "ro-19b", front: "st-f-xwide", rear: "st-r-xwide", side: null } };
    const ins = inspect(wide);
    expect(ins.width).toBeGreaterThan(105);
    expect(ins.checks.find((c) => c.id === "width")!.ok).toBe(false);
    // 19 mm rollers on the wide plate sit exactly at the limit, which is legal.
    const limit = inspect({ ...kit, rollers: { roller: "ro-19b", front: "st-f-wide", rear: "st-r-wide", side: null } });
    expect(limit.width).toBeCloseTo(105, 5);
    expect(limit.checks.find((c) => c.id === "width")!.ok).toBe(true);
  });

  it("midship chassis need twin-shaft motors", () => {
    expect(fitProblems({ ...kit, chassis: "ch-mx" }).map((p) => p.slot)).toContain("motor");
    expect(fitProblems({ ...kit, chassis: "ch-mx", motor: "mo-twin-rev" })).toEqual([]);
  });

  it("side dampers need side stays, and side stays need a chassis with mounts", () => {
    expect(fitProblems({ ...kit, dampers: { part: "da-cyl", mount: "side" } }).length).toBeGreaterThan(0);
    expect(fitProblems({ ...kit, rollers: { ...kit.rollers, side: "st-side" } }).length).toBeGreaterThan(0);
    expect(fitProblems({ ...kit, chassis: "ch-rx", rollers: { ...kit.rollers, side: "st-side" }, dampers: { part: "da-cyl", mount: "side" } })).toEqual([]);
  });

  it("clear bodies are lighter", () => {
    const abs = carSpec(kit).stats.massG;
    const clear = carSpec({ ...kit, body: { ...kit.body, clear: true } }).stats.massG;
    expect(clear).toBeLessThan(abs - 3);
  });

  it("builds from links and storage are cleaned, not trusted", () => {
    expect(sanitizeBuild(null)).toEqual(STARTER_BUILD);
    const junk = sanitizeBuild({ chassis: "nope", motor: 5, gear: "ge-35", body: { sections: "x" }, brakes: { part: "br-medium", gap: 9 } });
    expect(junk.chassis).toBe(kit.chassis);
    expect(junk.motor).toBe(kit.motor);
    expect(junk.gear).toBe("ge-35");
    expect(junk.brakes).toEqual({ part: "br-medium", position: "rear", gap: 2 });
    expect(junk.body).toEqual(kit.body);
    // Wrong-slot ids are rejected too.
    expect(sanitizeBuild({ motor: "ge-35" }).motor).toBe(kit.motor);
    const round = sanitizeBuild(JSON.parse(JSON.stringify(turbo)));
    expect(round).toEqual(turbo);
  });
});
