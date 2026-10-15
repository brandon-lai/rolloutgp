// A race on a walled track: the world, the cars, lap counting, course-outs and
// telemetry. Pure and deterministic: no clock, no DOM, no randomness beyond the
// seed. It runs in the Web Worker for live races and in Node for the tests.

import type RAPIER_NS from "@dimforge/rapier3d-deterministic-compat";
import { Car, GROUP, groups, quatFromBasis, type Pose, type WallSample } from "./car.ts";
import { carSpec, type Build } from "./build.ts";
import { buildTrack, frameAt, locate, TRACK_STAND, type TrackDef, type TrackGeo, type Feature } from "./track/geometry.ts";
import { DT, GRAVITY, LANE_WIDTH, STEP_HZ, WALL_HEIGHT, WALL_THICK, toKmh } from "./units.ts";
import { rng, hash } from "./rng.ts";

type Rapier = typeof RAPIER_NS;

export type RaceFormat = "heat" | "trial" | "endurance" | "practice" | "cup";

export interface Entry {
  id: string;
  name: string;
  build: Build;
  lane: number;
  /** Motor sample variance seed: fixed per owned motor so a car is repeatable. */
  motorSeed: number;
  /** Paint colour for the HUD and trail. */
  color: string;
  /** AI pit strategy for endurance: swap when the pack drops below this voltage. */
  pitBelowVolts?: number;
}

export interface RaceConfig {
  track: TrackDef;
  entries: Entry[];
  laps: number;
  format: RaceFormat;
  /** Seed for release jitter. Same config + same seed = same race. */
  seed: number;
  /** Battery drain multiplier (endurance compresses a long race). */
  drain?: number;
  /** Battery swaps allowed per car (endurance: one). */
  pitStops?: number;
  /** Open mode: no regulation, big crashes break parts. */
  open?: boolean;
  /** Give up after this long, seconds. */
  maxTime?: number;
}

export type CarStatus = "racing" | "finished" | "out" | "pitting";

export interface CourseOut {
  t: number;
  lap: number;
  xh: number;
  feature: string;
  speedKmh: number;
  cause: "flew off" | "landed outside" | "rolled over" | "stuck" | "fell" | "hit the wall top";
  pos: { x: number; y: number; z: number };
}

export interface JumpRecord {
  lap: number;
  feature: string;
  airtime: number; // s
  height: number; // mm above the floor at the peak
  launchKmh: number;
}

export interface Telemetry {
  /** Samples at 30 Hz: t, xh (centreline), lap, speed km/h, airborne, braking, volts, lateral mm. */
  trace: number[];
  laps: number[]; // lap times, s
  topKmh: number;
  corners: { lap: number; feature: string; exitKmh: number }[];
  jumps: JumpRecord[];
  courseOut: CourseOut | null;
  finishTime: number | null;
  pitAt: number | null;
  distance: number; // u travelled along the course
  /** Times all four wheels left the track (landing bounces included). Dampers cut this. */
  hops: number;
  damage: string[];
}

export const TRACE_FIELDS = 8;
const TRACE_HZ = 30;

interface Runner {
  entry: Entry;
  car: Car;
  strip: number;
  k: number;
  lap: number; // completed laps
  lapStart: number;
  status: CarStatus;
  /** Lane-centre arc length into the current strip. */
  s: number;
  xh: number;
  lateral: number;
  vertical: number;
  telemetry: Telemetry;
  airSince: number | null;
  airPeak: number;
  airLaunch: number;
  airFeature: Feature | null;
  lastProgressT: number;
  bestDistance: number;
  flippedFor: number;
  onWallFor: number;
  outFor: number;
  pitsLeft: number;
  pitRequested: boolean;
  pitUntil: number;
  featureIdx: number;
  /** After a course-out, keep simulating the car briefly so it visibly flies off. */
  coastUntil: number;
  wasGrounded: boolean;
}

export interface RaceEvent {
  t: number;
  car: string;
  kind: "lap" | "finish" | "out" | "pit" | "jump" | "damage";
  text: string;
}

export class Race {
  readonly cfg: RaceConfig;
  readonly geo: TrackGeo;
  readonly world: RAPIER_NS.World;
  readonly runners: Runner[] = [];
  private readonly queue: RAPIER_NS.EventQueue;
  step = 0;
  time = 0;
  done = false;
  readonly log: RaceEvent[] = [];
  private nextTrace = 0;

  constructor(R: Rapier, cfg: RaceConfig) {
    this.cfg = cfg;
    this.geo = buildTrack(cfg.track);
    const world = new R.World({ x: 0, y: -GRAVITY, z: 0 });
    world.timestep = DT;
    world.integrationParameters.numSolverIterations = 6;
    this.world = world;
    this.queue = new R.EventQueue(true);
    addTrackColliders(R, world, this.geo);

    const jitter = rng(cfg.seed >>> 0);
    for (const e of cfg.entries) {
      const variance = rng(e.motorSeed >>> 0)() * 2 - 1;
      const spec = carSpec(e.build, variance);
      const strip = this.geo.strips[Math.min(e.lane, this.geo.strips.length - 1)];
      const pose = startPose(this.geo, Math.min(e.lane, this.geo.strips.length - 1), spec.wheelRadius - spec.axleY, (jitter() - 0.5) * 0.02);
      const car = new Car(R, world, spec, pose);
      car.drain = cfg.drain ?? 1;
      car.running = true;
      const loc = locate(strip, pose.x, pose.y, pose.z, 0, 0, 40);
      const runnerIndex = this.runners.length;
      car.walls = (x, y, z) => this.wallSample(this.runners[runnerIndex], x, y, z);
      this.runners.push({
        entry: e,
        car,
        strip: Math.min(e.lane, this.geo.strips.length - 1),
        k: loc.k,
        lap: 0,
        lapStart: 0,
        status: "racing",
        s: loc.s,
        xh: loc.xh,
        lateral: 0,
        vertical: 0,
        telemetry: { trace: [], laps: [], topKmh: 0, corners: [], jumps: [], courseOut: null, finishTime: null, pitAt: null, distance: 0, hops: 0, damage: [] },
        airSince: null,
        airPeak: 0,
        airLaunch: 0,
        airFeature: null,
        lastProgressT: 0,
        bestDistance: 0,
        flippedFor: 0,
        onWallFor: 0,
        outFor: 0,
        pitsLeft: cfg.pitStops ?? 0,
        pitRequested: false,
        pitUntil: 0,
        featureIdx: 0,
        coastUntil: 0,
        wasGrounded: true,
      });
    }
  }

  /** Lane walls around a point, relative to the strip the car is on (and the next one at the start line). */
  private wallSample(r: Runner, x: number, y: number, z: number): WallSample | null {
    if (r.status === "pitting") return null;
    const strip = this.geo.strips[r.strip];
    let loc = locate(strip, x, y, z, r.k, 4, 12);
    let st = strip;
    if (loc.k >= strip.count - 3) {
      const next = this.geo.strips[strip.next];
      const nl = locate(next, x, y, z, 0, 0, 8);
      if (nl.dist < loc.dist) {
        loc = nl;
        st = next;
      }
    }
    if (loc.dist > 1.5) return null;
    const f = frameAt(st, loc.k);
    return { lateral: loc.lateral, vertical: loc.vertical, r: f.r, u: f.u, halfWidth: LANE_WIDTH / 2, wallHeight: WALL_HEIGHT };
  }

  /** Ask for a battery swap the next time this car crosses the start line. */
  requestPit(id: string): boolean {
    const r = this.runners.find((x) => x.entry.id === id);
    if (!r || r.pitsLeft <= 0 || r.status !== "racing") return false;
    r.pitRequested = true;
    return true;
  }

  /** Advance one fixed physics step. */
  tick(): void {
    if (this.done) return;
    for (const r of this.runners) {
      if (r.status === "racing" || (r.status === "out" && this.time < r.coastUntil)) r.car.applyForces(DT);
      if (r.status === "out" && this.time >= r.coastUntil) r.car.running = false;
    }
    this.world.step(this.queue);
    this.step++;
    this.time = this.step * DT;
    for (const r of this.runners) this.track(r);
    if (this.time >= this.nextTrace) {
      this.nextTrace += 1 / TRACE_HZ;
      for (const r of this.runners) this.trace(r);
    }
    this.queue.drainContactForceEvents(() => {});
    const maxT = this.cfg.maxTime ?? 240;
    if (this.runners.every((r) => r.status === "finished" || (r.status === "out" && this.time >= r.coastUntil)) || this.time > maxT) {
      this.done = true;
      for (const r of this.runners) {
        if (r.status === "racing" || r.status === "pitting") {
          r.status = "out";
          r.telemetry.courseOut = r.telemetry.courseOut ?? this.outRecord(r, "stuck");
        }
      }
    }
  }

  /** Run until done (tests, practice runs, ghosts). */
  runToEnd(maxSteps = STEP_HZ * 600): void {
    while (!this.done && this.step < maxSteps) this.tick();
  }

  private outRecord(r: Runner, cause: CourseOut["cause"]): CourseOut {
    const p = r.car.body.translation();
    return {
      t: this.time,
      lap: r.lap + 1,
      xh: r.xh,
      feature: this.featureAt(r.xh)?.name ?? "Straight",
      speedKmh: toKmh(r.car.speed()),
      cause,
      pos: { x: p.x, y: p.y, z: p.z },
    };
  }

  featureAt(xh: number): Feature | undefined {
    return this.geo.features.find((f) => xh >= f.start - 0.5 && xh <= f.end + 0.5);
  }

  private track(r: Runner): void {
    if (r.status === "finished" || r.status === "out") return;
    if (r.status === "pitting") {
      if (this.time >= r.pitUntil) {
        r.status = "racing";
        r.car.running = true;
        this.log.push({ t: this.time, car: r.entry.id, kind: "pit", text: `${r.entry.name} back out on fresh batteries` });
      }
      return;
    }
    const car = r.car;
    const com = car.body.worldCom();
    const strip = this.geo.strips[r.strip];
    let loc = locate(strip, com.x, com.y, com.z, r.k);
    // Crossed the start line onto the next strip?
    if (loc.k >= strip.count - 2 && loc.s >= strip.length - 1e-6) {
      const next = this.geo.strips[strip.next];
      const nl = locate(next, com.x, com.y, com.z, 0, 0, 20);
      if (nl.dist <= loc.dist + 0.05) {
        this.lapDone(r);
        if (r.status !== "racing") return;
        r.strip = strip.next;
        loc = nl;
      }
    }
    r.k = loc.k;
    const progressed = loc.s - r.s;
    r.s = loc.s;
    r.lateral = loc.lateral;
    r.vertical = loc.vertical;
    const prevXh = r.xh;
    r.xh = loc.xh;
    const dist = r.lap * this.geo.strips[0].length + loc.s;
    if (progressed > -1) r.telemetry.distance = dist;
    if (dist > r.bestDistance + 0.05) {
      r.bestDistance = dist;
      r.lastProgressT = this.time;
    }
    const sp = car.speed();
    const kmh = toKmh(sp);
    if (kmh > r.telemetry.topKmh) r.telemetry.topKmh = kmh;

    // Corner exits.
    for (const f of this.geo.features) {
      if ((f.kind === "corner" || f.kind === "bank") && prevXh < f.end && r.xh >= f.end && r.xh - prevXh < 5) {
        r.telemetry.corners.push({ lap: r.lap + 1, feature: f.name, exitKmh: Math.round(kmh * 10) / 10 });
      }
    }

    // Airtime.
    if (car.grounded === 0 && r.wasGrounded) r.telemetry.hops++;
    r.wasGrounded = car.grounded > 0;
    const airborne = car.grounded === 0 && loc.vertical > 0.04;
    if (airborne) {
      if (r.airSince === null) {
        r.airSince = this.time;
        r.airPeak = loc.vertical;
        r.airLaunch = kmh;
        r.airFeature = this.featureAt(r.xh) ?? null;
      }
      r.airPeak = Math.max(r.airPeak, loc.vertical);
    } else if (r.airSince !== null) {
      const air = this.time - r.airSince;
      if (air > 0.04) {
        const rec: JumpRecord = {
          lap: r.lap + 1,
          feature: r.airFeature?.name ?? "Bump",
          airtime: Math.round(air * 1000) / 1000,
          height: Math.round(r.airPeak * 1000) / 10, // mm (u*100)
          launchKmh: Math.round(r.airLaunch * 10) / 10,
        };
        r.telemetry.jumps.push(rec);
        if (air > 0.12) this.log.push({ t: this.time, car: r.entry.id, kind: "jump", text: `${r.entry.name}: ${(air * 1000).toFixed(0)} ms in the air at ${rec.feature}` });
      }
      r.airSince = null;
    }

    // Course-out checks.
    const hw = LANE_WIDTH / 2;
    const upDot = trackUpDot(car, strip, loc.k);
    let cause: CourseOut["cause"] | null = null;
    if (Math.abs(loc.lateral) > hw + WALL_THICK + 0.03) cause = r.airSince !== null || loc.vertical > WALL_HEIGHT ? "flew off" : "landed outside";
    else if (loc.vertical < -0.35) cause = "fell";
    else if (loc.dist > 4) cause = "flew off";
    if (!cause) {
      r.flippedFor = upDot < 0.25 ? r.flippedFor + DT : 0;
      if (r.flippedFor > 0.4) cause = "rolled over";
      r.onWallFor = Math.abs(loc.lateral) > hw && loc.vertical > WALL_HEIGHT * 0.5 && car.grounded === 0 ? r.onWallFor + DT : 0;
      if (r.onWallFor > 0.6) cause = "hit the wall top";
      if (this.time - r.lastProgressT > 2.5) cause = "stuck";
    }
    if (cause) {
      // Out only if it stays out briefly (a car skimming the wall top and dropping back in is still racing).
      r.outFor += DT;
      if (r.outFor > 0.05 || cause === "stuck" || cause === "rolled over") {
        r.status = "out";
        r.coastUntil = this.time + 2.5;
        r.telemetry.courseOut = this.outRecord(r, cause);
        this.log.push({ t: this.time, car: r.entry.id, kind: "out", text: `${r.entry.name} ${cause === "stuck" ? "got stuck" : cause} at ${r.telemetry.courseOut.feature}` });
      }
    } else r.outFor = 0;

    // AI pit strategy.
    const pb = r.entry.pitBelowVolts;
    if (pb && r.pitsLeft > 0 && !r.pitRequested && car.volts < pb) r.pitRequested = true;
  }

  private lapDone(r: Runner): void {
    const lapTime = this.time - r.lapStart;
    r.lapStart = this.time;
    r.lap++;
    r.telemetry.laps.push(Math.round(lapTime * 1000) / 1000);
    if (r.lap >= this.cfg.laps) {
      r.status = "finished";
      r.telemetry.finishTime = Math.round(this.time * 1000) / 1000;
      r.car.running = false;
      this.log.push({ t: this.time, car: r.entry.id, kind: "finish", text: `${r.entry.name} finished in ${this.time.toFixed(2)} s` });
      return;
    }
    this.log.push({ t: this.time, car: r.entry.id, kind: "lap", text: `${r.entry.name} lap ${r.lap}: ${lapTime.toFixed(2)} s` });
    if (r.pitRequested && r.pitsLeft > 0) {
      r.pitRequested = false;
      r.pitsLeft--;
      r.status = "pitting";
      r.pitUntil = this.time + 4;
      r.telemetry.pitAt = this.time;
      r.car.used = 0;
      r.car.running = false;
      const next = this.geo.strips[r.strip].next;
      const pose = startPose(this.geo, next, r.car.spec.wheelRadius - r.car.spec.axleY, 0);
      r.car.place(pose);
      r.strip = next;
      r.k = 0;
      r.s = 0;
      this.log.push({ t: this.time, car: r.entry.id, kind: "pit", text: `${r.entry.name} pits for fresh batteries` });
    }
  }

  private trace(r: Runner): void {
    const t = r.telemetry.trace;
    t.push(
      Math.round(this.time * 1000) / 1000,
      Math.round(r.xh * 100) / 100,
      r.lap + 1,
      Math.round(toKmh(r.car.speed()) * 10) / 10,
      r.car.grounded === 0 ? 1 : 0,
      r.car.braking ? 1 : 0,
      Math.round(r.car.volts * 100) / 100,
      Math.round(r.lateral * 1000) / 10,
    );
  }

  /** Order by finish time, then distance covered. */
  standings(): Runner[] {
    return [...this.runners].sort((a, b) => {
      const fa = a.telemetry.finishTime,
        fb = b.telemetry.finishTime;
      if (fa !== null && fb !== null) return fa - fb;
      if (fa !== null) return -1;
      if (fb !== null) return 1;
      return b.telemetry.distance - a.telemetry.distance;
    });
  }

  free(): void {
    this.world.free();
    this.queue.free();
  }
}

function trackUpDot(car: Car, strip: TrackGeo["strips"][number], k: number): number {
  const f = frameAt(strip, k);
  const q = car.body.rotation();
  // Car up = rotate(q, y)
  const ux = 2 * (q.x * q.y - q.w * q.z);
  const uy = 1 - 2 * (q.x * q.x + q.z * q.z);
  const uz = 2 * (q.y * q.z + q.w * q.x);
  return ux * f.u.x + uy * f.u.y + uz * f.u.z;
}

/** Car pose at the start line of a lane, wheels on the floor. */
export function startPose(geo: TrackGeo, lane: number, clearance: number, lateralJitter: number): Pose {
  const st = geo.strips[lane];
  // Centre the car ~90 mm past the line so its nose sits on it.
  let k = 0;
  while (k < st.count - 1 && st.data[k * 14 + 12] < 0.9) k++;
  const f = frameAt(st, k);
  const q = quatFromBasis(f.f, f.u);
  const lift = clearance + 0.004;
  return {
    x: f.p.x + f.u.x * lift + f.r.x * lateralJitter,
    y: f.p.y + f.u.y * lift + f.r.y * lateralJitter,
    z: f.p.z + f.u.z * lift + f.r.z * lateralJitter,
    qx: q.x,
    qy: q.y,
    qz: q.z,
    qw: q.w,
  };
}

export function addTrackColliders(R: Rapier, world: RAPIER_NS.World, geo: TrackGeo): void {
  const ground = world.createRigidBody(R.RigidBodyDesc.fixed());
  // The chassis and body still slide on this mesh (landings, bottoming out), and
  // without internal-edge fixing they catch on every floor seam.
  const flags = R.TriMeshFlags.FIX_INTERNAL_EDGES | R.TriMeshFlags.MERGE_DUPLICATE_VERTICES | R.TriMeshFlags.ORIENTED;
  world.createCollider(
    R.ColliderDesc.trimesh(geo.positions, geo.indices, flags)
      .setFriction(0.6)
      .setRestitution(0.15)
      .setCollisionGroups(groups(GROUP.TRACK, 0xffff)),
    ground,
  );
  // The floor the track sits on, for cars that fly off.
  const b = geo.bounds;
  const cx = (b.minX + b.maxX) / 2,
    cz = (b.minZ + b.maxZ) / 2;
  world.createCollider(
    R.ColliderDesc.cuboid((b.maxX - b.minX) / 2 + 40, 0.5, (b.maxZ - b.minZ) / 2 + 40)
      .setTranslation(cx, -TRACK_STAND - 0.5, cz)
      .setFriction(0.7)
      .setRestitution(0.2)
      .setCollisionGroups(groups(GROUP.WORLD, 0xffff)),
    ground,
  );
}

/** Stable per-motor seed: the same owned motor always runs the same. */
export function motorSeedFor(owner: string, motorId: string): number {
  return hash(`${owner}:${motorId}`);
}
