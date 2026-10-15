// The car's side of a city run: the same car physics on a street course of
// segments that can fork (the runner throws the switch) and rejoin, in a world
// of streets, sidewalks and buildings it can fly off into. When it courses out
// it stays where it lands until the runner picks it up (rescue) and puts it back
// on the course for a time penalty.

import type RAPIER_NS from "@dimforge/rapier3d-deterministic-compat";
import { Car, GROUP, groups, quatFromBasis, type Pose, type WallSample } from "./car.ts";
import { carSpec, type Build } from "./build.ts";
import { buildTrack, frameAt, locate, SAMPLE_STRIDE, type TrackGeo } from "./track/geometry.ts";
import { DT, GRAVITY, SCALE, toKmh } from "./units.ts";
import { rng } from "./rng.ts";
import { cityBoxes, courseById, type CourseDef } from "../city/layout.ts";

type Rapier = typeof RAPIER_NS;

export interface CityConfig {
  courseId: string;
  build: Build;
  motorSeed: number;
  laps?: number;
}

export type CityStatus = "racing" | "out" | "carried" | "finished";

export interface CityEvent {
  t: number;
  kind: "lap" | "out" | "rescue" | "finish" | "fork" | "cheer" | "jump";
  text: string;
}

export interface CityResult {
  time: number;
  finished: boolean;
  courseOuts: number;
  penalty: number;
  topKmh: number;
  laps: number[];
  jumps: { feature: string; airtime: number; launchKmh: number }[];
  forks: string[];
}

export const RESCUE_PENALTY = 5; // s

export class CityRun {
  readonly course: CourseDef;
  readonly geos: TrackGeo[];
  readonly world: RAPIER_NS.World;
  readonly car: Car;
  readonly laps: number;
  seg = 0;
  k = 0;
  lap = 0;
  status: CityStatus = "racing";
  time = 0;
  step = 0;
  penalty = 0;
  courseOuts = 0;
  topKmh = 0;
  lateral = 0;
  vertical = 0;
  /** Branch chosen at each fork segment (index into its next list). */
  readonly forks = new Map<number, number>();
  readonly log: CityEvent[] = [];
  /** Where the car left the course (segment, sample) so a rescue can put it back. */
  private outAt: { seg: number; k: number } | null = null;
  private lastGood = { seg: 0, k: 0 };
  private lapStart = 0;
  private lapTimes: number[] = [];
  private lastProgressT = 0;
  private best = 0;
  private airSince: number | null = null;
  private airLaunch = 0;
  private wasGrounded = true;
  private jumps: CityResult["jumps"] = [];
  private forkLog: string[] = [];
  private queue: RAPIER_NS.EventQueue;

  constructor(R: Rapier, cfg: CityConfig) {
    const course = courseById(cfg.courseId);
    if (!course) throw new Error(`Unknown course ${cfg.courseId}`);
    this.course = course;
    this.laps = cfg.laps ?? course.laps;
    this.geos = course.segments.map((s) => buildTrack(s.def));
    const world = new R.World({ x: 0, y: -GRAVITY, z: 0 });
    world.timestep = DT;
    world.integrationParameters.numSolverIterations = 6;
    this.world = world;
    this.queue = new R.EventQueue(true);

    // City: every solid box the car could land on or hit.
    const fixed = world.createRigidBody(R.RigidBodyDesc.fixed());
    for (const b of cityBoxes()) {
      if (b.runnerOnly || b.visualOnly) continue;
      const cd = R.ColliderDesc.cuboid(b.hx * SCALE, b.hy * SCALE, b.hz * SCALE)
        .setTranslation(b.x * SCALE, b.y * SCALE, b.z * SCALE)
        .setFriction(b.kind === "ground" ? 0.8 : 0.5)
        .setRestitution(0.2)
        .setCollisionGroups(groups(GROUP.WORLD, 0xffff));
      if (b.ry) cd.setRotation({ x: 0, y: Math.sin(b.ry / 2), z: 0, w: Math.cos(b.ry / 2) });
      world.createCollider(cd, fixed);
    }
    // Course boards: the lane floors only. The low walls are handled by the
    // roller solver; as triangles they would cross the other branch at forks.
    for (const g of this.geos) {
      const { positions, indices } = floorMesh(g);
      world.createCollider(
        R.ColliderDesc.trimesh(positions, indices, R.TriMeshFlags.FIX_INTERNAL_EDGES | R.TriMeshFlags.MERGE_DUPLICATE_VERTICES)
          .setFriction(0.6)
          .setRestitution(0.15)
          .setCollisionGroups(groups(GROUP.TRACK, 0xffff)),
        fixed,
      );
    }

    const variance = rng(cfg.motorSeed >>> 0)() * 2 - 1;
    const spec = carSpec(cfg.build, variance);
    const pose = this.poseAt(0, 2, spec.wheelRadius - spec.axleY);
    this.car = new Car(R, world, spec, pose);
    this.car.running = true;
    this.car.walls = (x, y, z) => this.wallSample(x, y, z);
    for (let i = 0; i < course.segments.length; i++) if (course.segments[i].next.length > 1) this.forks.set(i, 0);
  }

  /** A pose on segment `seg` at sample `k`, wheels on the boards. */
  private poseAt(seg: number, k: number, clearance: number): Pose {
    const st = this.geos[seg].strips[0];
    const f = frameAt(st, k);
    const q = quatFromBasis(f.f, f.u);
    const lift = clearance + 0.006;
    return { x: f.p.x + f.u.x * lift, y: f.p.y + f.u.y * lift, z: f.p.z + f.u.z * lift, qx: q.x, qy: q.y, qz: q.z, qw: q.w };
  }

  private nextSeg(seg: number): number {
    const s = this.course.segments[seg];
    if (s.next.length === 0) return -1;
    return s.next[this.forks.get(seg) ?? 0] ?? s.next[0];
  }

  private wallSample(x: number, y: number, z: number): WallSample | null {
    if (this.status !== "racing") return null;
    const g = this.geos[this.seg];
    const st = g.strips[0];
    let loc = locate(st, x, y, z, this.k, 4, 14);
    let geo = g;
    let lst = st;
    if (loc.k >= st.count - 3) {
      const n = this.nextSeg(this.seg);
      if (n >= 0) {
        const ng = this.geos[n];
        const nl = locate(ng.strips[0], x, y, z, 0, 0, 10);
        if (nl.dist < loc.dist) {
          loc = nl;
          geo = ng;
          lst = ng.strips[0];
        }
      }
    }
    if (loc.dist > 3) return null;
    const f = frameAt(lst, loc.k);
    return { lateral: loc.lateral, vertical: loc.vertical, r: f.r, u: f.u, halfWidth: geo.lane.width / 2, wallHeight: geo.lane.wall };
  }

  setFork(seg: number, choice: number): void {
    if (!this.forks.has(seg)) return;
    this.forks.set(seg, choice);
  }

  /** A small, short voltage bump (the runner shouting it on). */
  cheer(): void {
    if (this.status !== "racing") return;
    this.car.boost = Math.min(0.5, this.car.boost + 0.32);
    this.log.push({ t: this.time, kind: "cheer", text: "Go! Go!" });
  }

  /** Pick the car up and put it back on the course where it left. */
  rescue(): boolean {
    if (this.status !== "out" && this.status !== "carried") return false;
    const at = this.outAt ?? this.lastGood;
    const st = this.geos[at.seg].strips[0];
    // A metre back from where it left, so it doesn't fly straight off again.
    let k = at.k;
    const s0 = st.data[k * SAMPLE_STRIDE + 12];
    while (k > 0 && s0 - st.data[k * SAMPLE_STRIDE + 12] < 10) k--;
    this.seg = at.seg;
    this.k = k;
    const spec = this.car.spec;
    this.car.place(this.poseAt(at.seg, k, spec.wheelRadius - spec.axleY));
    this.car.running = true;
    this.status = "racing";
    this.penalty += RESCUE_PENALTY;
    this.outAt = null;
    this.lastProgressT = this.time;
    this.best = this.distance();
    this.log.push({ t: this.time, kind: "rescue", text: `Back on the course (+${RESCUE_PENALTY} s)` });
    return true;
  }

  /** The runner has the car in hand: stop it where it is. */
  pickUp(): void {
    if (this.status !== "out") return;
    this.status = "carried";
    this.car.running = false;
  }

  distance(): number {
    const st = this.geos[this.seg].strips[0];
    return this.lap * 100000 + this.seg * 10000 + st.data[this.k * SAMPLE_STRIDE + 12];
  }

  tick(): void {
    if (this.status === "finished") return;
    if (this.status === "racing" || this.status === "out") this.car.applyForces(DT);
    if (this.status === "carried") {
      this.car.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      this.car.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    }
    this.world.step(this.queue);
    this.queue.drainContactForceEvents(() => {});
    this.step++;
    this.time = this.step * DT;
    if (this.status === "racing") this.track();
    else if (this.status === "out") {
      // Motor winds down once it's off the course.
      if (this.time - (this.outTime ?? this.time) > 1.2) this.car.running = false;
    }
  }

  private outTime: number | null = null;

  private track(): void {
    const car = this.car;
    const com = car.body.worldCom();
    const g = this.geos[this.seg];
    const st = g.strips[0];
    let loc = locate(st, com.x, com.y, com.z, this.k, 3, 40);
    if (loc.k >= st.count - 2 && loc.s >= st.length - 1e-6) {
      const n = this.nextSeg(this.seg);
      if (n >= 0) {
        const nl = locate(this.geos[n].strips[0], com.x, com.y, com.z, 0, 0, 20);
        if (nl.dist <= loc.dist + 0.05) {
          if (this.course.segments[this.seg].next.length > 1) {
            const label = this.course.segments[this.seg].labels?.[this.forks.get(this.seg) ?? 0] ?? "";
            this.forkLog.push(label);
            this.log.push({ t: this.time, kind: "fork", text: `Took the ${label.toLowerCase()} route` });
          }
          if (n === 0) {
            const lapTime = this.time - this.lapStart;
            this.lapStart = this.time;
            this.lapTimes.push(lapTime);
            this.lap++;
            if (this.lap >= this.laps) {
              this.status = "finished";
              car.running = false;
              this.log.push({ t: this.time, kind: "finish", text: `Finished in ${(this.time + this.penalty).toFixed(1)} s` });
              return;
            }
            this.log.push({ t: this.time, kind: "lap", text: `Lap ${this.lap}: ${lapTime.toFixed(1)} s` });
          }
          this.seg = n;
          loc = nl;
        }
      }
    }
    this.k = loc.k;
    this.lateral = loc.lateral;
    this.vertical = loc.vertical;
    const d = this.distance();
    if (d > this.best + 0.05) {
      this.best = d;
      this.lastProgressT = this.time;
    }
    const kmh = toKmh(car.speed());
    this.topKmh = Math.max(this.topKmh, kmh);

    // Airtime (for the log).
    if (car.grounded === 0 && this.wasGrounded) {
      this.airSince = this.time;
      this.airLaunch = kmh;
    }
    if (car.grounded > 0 && this.airSince !== null) {
      const air = this.time - this.airSince;
      if (air > 0.15 && air < 3) {
        const feat = this.geos[this.seg].features.find((f) => loc.xh >= f.start - 30 && loc.xh <= f.end + 5);
        this.jumps.push({ feature: feat?.name ?? "Bump", airtime: air, launchKmh: this.airLaunch });
        this.log.push({ t: this.time, kind: "jump", text: `${(air * 1000).toFixed(0)} ms in the air` });
      }
      this.airSince = null;
    }
    this.wasGrounded = car.grounded > 0;

    const hw = g.lane.width / 2;
    let out = false;
    if (Math.abs(loc.lateral) > hw + 0.25) out = true;
    else if (loc.vertical < -0.6) out = true;
    else if (loc.dist > 4) out = true;
    else if (this.time - this.lastProgressT > 3) out = true;
    if (!out) this.lastGood = { seg: this.seg, k: this.k };
    if (out) {
      this.airSince = null;
      this.status = "out";
      this.courseOuts++;
      this.outAt = { ...this.lastGood };
      this.outTime = this.time;
      this.log.push({ t: this.time, kind: "out", text: "Course-out! Go and get it" });
    }
  }

  result(): CityResult {
    return {
      time: this.time + this.penalty,
      finished: this.status === "finished",
      courseOuts: this.courseOuts,
      penalty: this.penalty,
      topKmh: this.topKmh,
      laps: this.lapTimes,
      jumps: this.jumps,
      forks: this.forkLog,
    };
  }

  free(): void {
    this.world.free();
    this.queue.free();
  }
}

/** Just the lane floor of a segment as a mesh (u). */
function floorMesh(g: TrackGeo): { positions: Float32Array; indices: Uint32Array } {
  const st = g.strips[0];
  const hw = g.lane.width / 2 + 0.05;
  const pos = new Float32Array(st.count * 2 * 3);
  const idx: number[] = [];
  for (let k = 0; k < st.count; k++) {
    const o = k * SAMPLE_STRIDE;
    const d = st.data;
    for (let j = 0; j < 2; j++) {
      const lat = j === 0 ? hw : -hw;
      pos[(k * 2 + j) * 3] = d[o] + d[o + 9] * lat;
      pos[(k * 2 + j) * 3 + 1] = d[o + 1] + d[o + 10] * lat;
      pos[(k * 2 + j) * 3 + 2] = d[o + 2] + d[o + 11] * lat;
    }
    if (k < st.count - 1) {
      const a = k * 2,
        b = a + 2;
      idx.push(a, b, b + 1, a, b + 1, a + 1);
    }
  }
  return { positions: pos, indices: new Uint32Array(idx) };
}
