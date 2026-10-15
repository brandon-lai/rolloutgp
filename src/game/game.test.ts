import { beforeAll, describe, expect, it } from "vitest";
import RAPIER from "@dimforge/rapier3d-deterministic-compat";
import { settle } from "./session.ts";
import { advise } from "./advice.ts";
import { CUP_ROUNDS, PLAYER_ID } from "./formats.ts";
import { RIVALS, rivalBuild } from "./rivals.ts";
import { buyPart, canBuy, migrateProfile, newProfile, STARTING_TOKENS, CUP_REWARD } from "../store/profile.ts";
import { STARTER_BUILD, fitProblems, inspect } from "../sim/build.ts";
import type { RaceResult, CarResult } from "../sim/protocol.ts";
import type { Telemetry } from "../sim/race.ts";
import { Race } from "../sim/race.ts";
import { encode, decode, readHash } from "../app/share.ts";
import { COURSES, cityBoxes } from "../city/layout.ts";
import { buildTrack, frameAt } from "../sim/track/geometry.ts";
import { CityCollision, Runner } from "../city/runner.ts";
import { DRAGON, SUNDAY, trackById } from "../sim/tracks.ts";
import { CityRun } from "../sim/cityRun.ts";

beforeAll(async () => {
  await RAPIER.init();
});

const tele = (over: Partial<Telemetry> = {}): Telemetry => ({
  trace: [],
  laps: [3, 3, 3],
  topKmh: 20,
  corners: [],
  jumps: [],
  courseOut: null,
  finishTime: 9,
  pitAt: null,
  distance: 0,
  hops: 0,
  damage: [],
  ...over,
});

const car = (id: string, t: Partial<Telemetry>): CarResult => ({ id, name: id, color: "#fff", status: t.finishTime === null ? "out" : "finished", telemetry: tele(t), ghost: false });

const result = (standings: CarResult[]): RaceResult => ({ standings, log: [], time: 10 });

describe("settling races", () => {
  it("pays heats by place, scaled by track difficulty", () => {
    const p = newProfile("x");
    const first = settle(p, { format: "heat", trackId: "sunday", build: STARTER_BUILD, seed: 1, lane: 0 }, result([car(PLAYER_ID, {}), car("taku", { finishTime: 10 }), car("rina", { finishTime: 11 })]));
    expect(first.place).toBe(1);
    expect(first.reward).toBe(120);
    expect(first.profile.tokens).toBe(STARTING_TOKENS + 120);
    expect(first.profile.stats.wins).toBe(1);
    const grand = settle(p, { format: "heat", trackId: "grand", build: STARTER_BUILD, seed: 1, lane: 0 }, result([car(PLAYER_ID, {}), car("taku", { finishTime: 10 })]));
    expect(grand.reward).toBe(240);
    const out = settle(p, { format: "heat", trackId: "sunday", build: STARTER_BUILD, seed: 1, lane: 0 }, result([car("taku", { finishTime: 10 }), car(PLAYER_ID, { finishTime: null })]));
    expect(out.finished).toBe(false);
    expect(out.reward).toBe(15);
    expect(out.profile.stats.courseOuts).toBe(0); // no courseOut record in this fake telemetry
  });

  it("time trials award each medal once and keep the best run as the ghost", () => {
    let p = newProfile("x");
    const run = (time: number) => settle(p, { format: "trial", trackId: "sunday", build: STARTER_BUILD, seed: 42, lane: 0 }, result([car(PLAYER_ID, { finishTime: time })]));
    const bronze = run(13);
    expect(bronze.profile.medals.sunday).toBe(1);
    expect(bronze.profile.ghosts.sunday.time).toBe(13);
    expect(bronze.reward).toBe(60);
    p = bronze.profile;
    const gold = run(9.5);
    expect(gold.profile.medals.sunday).toBe(3);
    expect(gold.reward).toBe(100 + 160); // silver and gold, not bronze again
    expect(gold.profile.ghosts.sunday.seed).toBe(42);
    p = gold.profile;
    const slower = run(12);
    expect(slower.profile.ghosts.sunday.time).toBe(9.5);
    expect(slower.reward).toBeLessThan(20);
  });

  it("the cup advances the top two, eliminates the rest, and pays the trophy", () => {
    const p = newProfile("x");
    const cup = { round: 0, results: [], seed: 5 };
    const through = settle(p, { format: "cup", trackId: CUP_ROUNDS[0].track.id, cup, build: STARTER_BUILD, seed: 5, lane: 0 }, result([car("taku", { finishTime: 8 }), car(PLAYER_ID, { finishTime: 9 }), car("rina", { finishTime: 10 })]));
    expect(through.cupNext?.round).toBe(1);
    const third = settle(p, { format: "cup", trackId: CUP_ROUNDS[0].track.id, cup, build: STARTER_BUILD, seed: 5, lane: 0 }, result([car("taku", { finishTime: 8 }), car("rina", { finishTime: 9 }), car(PLAYER_ID, { finishTime: 10 })]));
    expect(third.cupOver).toBe("out");
    const final = settle(p, { format: "cup", trackId: CUP_ROUNDS[2].track.id, cup: { round: 2, results: [], seed: 5 }, build: STARTER_BUILD, seed: 5, lane: 0 }, result([car(PLAYER_ID, { finishTime: 8 }), car("rina", { finishTime: 9 })]));
    expect(final.cupOver).toBe("won");
    expect(final.reward).toBe(240 + CUP_REWARD);
    expect(final.profile.cups.length).toBe(1);
  });
});

describe("the save file", () => {
  it("repairs junk and keeps what's valid", () => {
    const p = migrateProfile({ owner: "abc", tokens: 500.7, owned: ["mo-turbo", "not-a-part"], builds: [{ motor: "mo-turbo" }, "junk"], settings: { fov: 400, cityView: "drone" } });
    expect(p.owner).toBe("abc");
    expect(p.tokens).toBe(500);
    expect(p.owned).toContain("mo-turbo");
    expect(p.owned).not.toContain("not-a-part");
    expect(p.owned).toContain("mo-stock"); // starter parts always owned
    expect(p.builds[0].motor).toBe("mo-turbo");
    expect(p.builds[1]).toEqual(STARTER_BUILD);
    expect(p.settings.fov).toBe(110);
    expect(p.settings.cityView).toBe("drone");
    expect(migrateProfile(null).tokens).toBe(STARTING_TOKENS);
  });

  it("buys parts with tokens, once", () => {
    const p = { ...newProfile("x"), tokens: 100 };
    expect(canBuy(p, "mo-torque")).toBe(true);
    const q = buyPart(p, "mo-torque");
    expect(q.tokens).toBe(10);
    expect(q.owned).toContain("mo-torque");
    expect(buyPart(q, "mo-torque")).toBe(q);
    expect(canBuy(q, "mo-sprint")).toBe(false);
    expect(buyPart(q, "mo-sprint")).toBe(q);
  });
});

describe("advice", () => {
  it("blames the jump and suggests brakes when the car flew off after one", () => {
    const features = buildTrack(DRAGON).features;
    const jump = features.find((f) => f.kind === "dragon")!;
    const tips = advise(
      tele({
        finishTime: null,
        laps: [],
        jumps: [{ lap: 1, feature: "Dragon back", airtime: 0.3, height: 120, launchKmh: 24 }],
        courseOut: { t: 3, lap: 1, xh: jump.end + 3, feature: "Turn 1", speedKmh: 20, cause: "flew off", pos: { x: 0, y: 0, z: 0 } },
      }),
      STARTER_BUILD,
      features,
      20,
    );
    expect(tips[0].kind).toBe("warn");
    expect(tips[0].body).toMatch(/brake/i);
  });

  it("suggests dampers for a bouncy car", () => {
    const tips = advise(tele({ hops: 60 }), STARTER_BUILD, buildTrack(SUNDAY).features, 20);
    expect(tips.some((t) => /damper/i.test(t.body))).toBe(true);
  });
});

describe("share links", () => {
  it("round-trip a build, and reject a tampered one safely", async () => {
    const b = { ...STARTER_BUILD, motor: "mo-turbo", name: "Mine" };
    const s = await encode(b);
    expect(await decode(s)).toEqual(b);
    const inc = await readHash(`#build=${s}`);
    expect(inc?.kind).toBe("build");
    expect(await readHash("#build=zzzz")).toBeNull();
    const evil = await encode({ ...b, motor: "rm -rf", body: { sections: [] } });
    const back = await readHash(`#build=${evil}`);
    expect(back?.kind === "build" && back.build.motor).toBe(STARTER_BUILD.motor);
  });
});

describe("rivals", () => {
  it("every rival build is legal and fits together", () => {
    for (const r of RIVALS)
      for (const t of [1, 2, 3, 4] as const) {
        const b = rivalBuild(r, t);
        expect(fitProblems(b), `${r.id} T${t}`).toEqual([]);
        expect(inspect(b).legal, `${r.id} T${t}`).toBe(true);
      }
  });
});

describe("open class durability", () => {
  const run = (open: boolean, build = STARTER_BUILD, track = "grand") => {
    const race = new Race(RAPIER, { track: trackById(track)!, entries: [{ id: "a", name: "a", build, lane: 0, motorSeed: 1, color: "#fff" }], laps: 3, format: "heat", seed: 3, open });
    race.runToEnd();
    const d = race.runners[0].telemetry.damage;
    race.free();
    return d;
  };
  it("a clean run breaks nothing; a crash in open class does; regulation never does", () => {
    expect(run(true)).toEqual([]);
    const crash = { ...STARTER_BUILD, motor: "mo-sprint", gear: "ge-35" };
    expect(run(true, crash, "sunday")).toContain("cracked body");
    expect(run(false, crash, "sunday")).toEqual([]);
  });
});

describe("the city", () => {
  it("every course segment joins the next exactly", () => {
    for (const c of COURSES) {
      const geos = c.segments.map((s) => buildTrack(s.def));
      c.segments.forEach((s, i) => {
        const g = geos[i].strips[0];
        const end = frameAt(g, g.count - 1);
        for (const n of s.next) {
          const st = frameAt(geos[n].strips[0], 0);
          expect(Math.hypot(end.p.x - st.p.x, end.p.y - st.p.y, end.p.z - st.p.z), `${c.id} ${i}->${n}`).toBeLessThan(1e-6);
        }
      });
    }
  });

  it("the runner can't walk through buildings, and walks down into the plaza", () => {
    const world = new CityCollision();
    const b = cityBoxes().find((x) => x.kind === "building")!;
    // Start just outside the building's west face, run east into it for 3 s.
    const r = new Runner(world, b.x - b.hx - 2, b.z, 0);
    for (let i = 0; i < 180; i++) r.update(1 / 60, { moveX: 0, moveY: 1, lookX: 0, lookY: 0, sprint: true, jump: false, slide: false });
    expect(r.pos.x).toBeLessThan(b.x - b.hx);
    // In the pit the floor is lower.
    expect(world.floor(58, 0, 5)).toBeCloseTo(-0.6, 5);
    expect(world.floor(0, -29, 5)).toBe(0);
  });

  it("a car completes a city course, takes the fork you set, and can be rescued", () => {
    const run = new CityRun(RAPIER, { courseId: "downtown", build: { ...STARTER_BUILD, motor: "mo-turbo", gear: "ge-4" }, motorSeed: 1, laps: 1 });
    run.setFork(0, 1);
    while (run.status !== "finished" && run.time < 120) {
      run.tick();
      if (run.status === "out") run.rescue();
    }
    const r = run.result();
    expect(r.finished).toBe(true);
    expect(r.forks).toEqual(["Long way"]);
    run.free();
  });
});
