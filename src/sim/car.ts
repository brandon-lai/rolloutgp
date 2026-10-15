// The car as a rigid body.
//
// Nobody steers. The car is a rigid chassis on four ray-cast wheels, and it turns
// only because its rollers (real cylinder colliders at their real mount points)
// hit the lane walls. The tires just push and scrub: grippy tires fight the turn,
// which is why hard tires corner faster (Tamiya setup guide). Mass dampers are
// separate bodies on sliding joints, brake sponges drag only where the track
// rises to meet them (slope transitions), and the motor is a DC motor fed by a
// battery that sags under load.

import type RAPIER_NS from "@dimforge/rapier3d-deterministic-compat";
import type { CarSpec } from "./build.ts";
import { batteryVoltage, motorTorque } from "./build.ts";
import { GRAVITY, SCALE } from "./units.ts";

type Rapier = typeof RAPIER_NS;
type World = RAPIER_NS.World;
type RigidBody = RAPIER_NS.RigidBody;

/** Collision groups: membership in the high 16 bits, filter in the low 16. */
export const GROUP = {
  TRACK: 0x0001,
  CAR: 0x0002,
  RAY: 0x0004,
  NONE: 0x0008,
  WORLD: 0x0010, // the floor around the track, city buildings
};
export const groups = (member: number, filter: number) => ((member & 0xffff) << 16) | (filter & 0xffff);

// Tire compliance: the rubber squashes ~0.6 mm under the car's weight.
const TIRE_STATIC_SQUASH = 0.006; // u
const TIRE_DAMPING_RATIO = 0.3;
const WHEEL_DROOP = 0.015; // u of ray beyond the tire, so a wheel "touches" a hair early
// Sponge pads: about as stiff as a tire where the track bends up into them (at
// the bottom of a ramp the car's own momentum presses the pad down hard, which is
// what makes the drag big), but foam doesn't spring back: damping only while
// compressing, so the pad drags without bouncing the car.
const SPONGE_STIFFNESS_FACTOR = 1.0;
const SPONGE_MAX_LOAD = 4; // multiples of car weight
// How much of each wheel's sideways slip the tire removes per step (impulse relaxation).
const LATERAL_RELAX = 0.65;
// Mass damper sliding joint: ±2.5 mm of travel, soft spring, strong damping.
const DAMPER_TRAVEL = 0.02; // u
const DAMPER_HZ = 20;
const DAMPER_DAMPING_RATIO = 1.5;

export interface Pose {
  x: number;
  y: number;
  z: number;
  /** Quaternion. */
  qx: number;
  qy: number;
  qz: number;
  qw: number;
}

/** Where a point sits relative to the lane walls the car is running between. */
export interface WallSample {
  /** u right of the lane centre. */
  lateral: number;
  /** u above the lane floor. */
  vertical: number;
  /** Lane right and up vectors at that point. */
  r: Vec;
  u: Vec;
  /** Half the lane width, u. */
  halfWidth: number;
  /** Wall height above the floor, u. */
  wallHeight: number;
}

export type WallSampler = (x: number, y: number, z: number) => WallSample | null;

export interface WheelContact {
  grounded: boolean;
  load: number; // sim force units
}

export class Car {
  readonly body: RigidBody;
  readonly dampers: RigidBody[] = [];
  readonly spec: CarSpec;
  private readonly world: World;
  private readonly k: number;
  private readonly c: number;
  /** Charge drawn from the battery, coulombs. */
  used = 0;
  /** Multiplier on battery drain (endurance races compress an hour into minutes). */
  drain = 1;
  volts = 0;
  current = 0;
  motorRpm = 0;
  /** Extra voltage from a cheer (city mode), decays to zero. */
  boost = 0;
  /** Motor running? Cars sit still until released. */
  running = false;
  grounded = 0;
  braking = false;
  readonly wheels: WheelContact[];
  /** Lane walls for the rollers. Set by whoever owns the course (race or city run). */
  walls: WallSampler | null = null;
  /** Energy lost to tire side scrub (sim units), for telemetry. */
  scrubWork = 0;
  /** Energy lost to roller friction on the walls (sim units). */
  rollerWork = 0;
  /** Roller-on-wall impulse this step (sim units), for telemetry and sounds. */
  wallImpulse = 0;
  private readonly ray: RAPIER_NS.Ray;
  private readonly prevCompression: number[];
  private readonly prevSponge: number[];
  private readonly rayGroups = groups(GROUP.RAY, GROUP.TRACK | GROUP.WORLD);

  constructor(R: Rapier, world: World, spec: CarSpec, pose: Pose, collisionMembership = GROUP.CAR) {
    this.world = world;
    this.spec = spec;
    const rbDesc = R.RigidBodyDesc.dynamic()
      .setTranslation(pose.x, pose.y, pose.z)
      .setRotation({ x: pose.qx, y: pose.qy, z: pose.qz, w: pose.qw })
      .setAdditionalMassProperties(spec.mass, spec.com, spec.inertia, { x: 0, y: 0, z: 0, w: 1 })
      .setCcdEnabled(true)
      .setCanSleep(false)
      .setAngularDamping(0.02);
    this.body = world.createRigidBody(rbDesc);
    const carGroups = groups(collisionMembership, GROUP.TRACK | GROUP.WORLD | GROUP.CAR);

    // Rollers are not Rapier colliders: they meet the lane walls through
    // solveRollers(), against the lane's smooth wall surface. A wall built from
    // triangles has seams every few centimetres, and a roller sliding along it at
    // 30 km/h catches on each one and gets kicked off the wall.
    // Chassis tub and body shell: hard plastic.
    spec.hulls.forEach((pts, i) => {
      const cd = R.ColliderDesc.convexHull(new Float32Array(pts))!
        .setDensity(0)
        .setFriction(i === 0 ? 0.35 : 0.3)
        .setFrictionCombineRule(R.CoefficientCombineRule.Min)
        .setRestitution(0.25)
        .setActiveEvents(R.ActiveEvents.CONTACT_FORCE_EVENTS)
        .setContactForceEventThreshold(40)
        .setCollisionGroups(carGroups);
      world.createCollider(cd, this.body);
    });

    // Mass dampers: loose weights on a short vertical slide.
    const q = { x: pose.qx, y: pose.qy, z: pose.qz, w: pose.qw };
    for (const d of spec.dampers) {
      const wp = rotate(q, d);
      const desc = R.RigidBodyDesc.dynamic()
        .setTranslation(pose.x + wp.x, pose.y + wp.y, pose.z + wp.z)
        .setRotation(q)
        .setAdditionalMassProperties(d.mass, { x: 0, y: 0, z: 0 }, { x: d.mass * 1e-4, y: d.mass * 1e-4, z: d.mass * 1e-4 }, { x: 0, y: 0, z: 0, w: 1 })
        .setCanSleep(false);
      const db = world.createRigidBody(desc);
      world.createCollider(R.ColliderDesc.ball(0.04).setDensity(0).setCollisionGroups(groups(GROUP.NONE, 0)), db);
      const jd = R.JointData.prismatic({ x: d.x, y: d.y, z: d.z }, { x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 });
      jd.limitsEnabled = true;
      jd.limits = [-DAMPER_TRAVEL, DAMPER_TRAVEL];
      const joint = world.createImpulseJoint(jd, this.body, db, true) as RAPIER_NS.PrismaticImpulseJoint;
      const w = 2 * Math.PI * DAMPER_HZ;
      const stiff = d.mass * w * w;
      joint.configureMotorPosition(0, stiff, 2 * DAMPER_DAMPING_RATIO * Math.sqrt(stiff * d.mass));
      this.dampers.push(db);
    }

    const perWheel = (spec.totalMass * GRAVITY) / 4;
    this.k = perWheel / TIRE_STATIC_SQUASH;
    this.c = 2 * TIRE_DAMPING_RATIO * Math.sqrt(this.k * (spec.totalMass / 4));
    this.wheels = spec.wheels.map(() => ({ grounded: false, load: 0 }));
    this.prevCompression = spec.wheels.map(() => 0);
    this.prevSponge = spec.brakes.map(() => 0);
    this.ray = new R.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 });
    this.volts = batteryVoltage(0);
  }

  /** Apply tire, motor, brake and air forces for one step. Call before world.step(). */
  applyForces(dt: number): void {
    const s = this.spec;
    const b = this.body;
    const t = b.translation();
    const q = b.rotation();
    const v = b.linvel();
    const w = b.angvel();
    const fwd = rotate(q, { x: 1, y: 0, z: 0 });
    const up = rotate(q, { x: 0, y: 1, z: 0 });
    const right = rotate(q, { x: 0, y: 0, z: 1 });
    const comL = s.com;
    const comW = add(t, rotate(q, comL));
    const r = s.wheelRadius;

    // --- Wheels: find the ground under each tire.
    let grounded = 0;
    let totalLoad = 0;
    let vLongSum = 0;
    const contacts: { p: Vec; n: Vec; load: number; fg: Vec; lg: Vec; vLong: number; vLat: number }[] = [];
    for (let i = 0; i < s.wheels.length; i++) {
      const wl = s.wheels[i];
      const origin = add(t, rotate(q, wl));
      this.ray.origin = origin;
      this.ray.dir = { x: -up.x, y: -up.y, z: -up.z };
      const hit = this.world.castRayAndGetNormal(this.ray, r + WHEEL_DROOP, true, undefined, this.rayGroups, undefined, b);
      const wc = this.wheels[i];
      if (!hit) {
        wc.grounded = false;
        wc.load = 0;
        this.prevCompression[i] = 0;
        continue;
      }
      const d = hit.timeOfImpact;
      const compression = r - d;
      const cdot = (compression - this.prevCompression[i]) / dt;
      this.prevCompression[i] = compression;
      let load = compression > 0 ? this.k * compression + this.c * cdot : 0;
      if (load < 0) load = 0;
      const n = hit.normal;
      const p = { x: origin.x - up.x * d, y: origin.y - up.y * d, z: origin.z - up.z * d };
      const vp = pointVel(v, w, comW, p);
      const fg = norm(sub(fwd, scale(n, dot(fwd, n))));
      const lg = norm(sub(right, scale(n, dot(right, n))));
      const vLong = dot(vp, fg);
      const vLat = dot(vp, lg);
      wc.grounded = load > 0;
      wc.load = load;
      if (load > 0) {
        grounded++;
        totalLoad += load;
        vLongSum += vLong;
      }
      contacts.push({ p, n, load, fg, lg, vLong, vLat });
    }
    this.grounded = grounded;

    // --- Motor: DC motor on a sagging battery, through the gears to the wheels.
    const rReal = r / SCALE;
    const vLong = grounded > 0 ? vLongSum / grounded / SCALE : dot(v, fwd) / SCALE;
    const omega = Math.max(0, (vLong / rReal) * s.gear);
    const volts = batteryVoltage(this.used) + this.boost;
    let driveForce = 0;
    if (this.running) {
      const m = motorTorque(s, omega, volts);
      this.current = m.current;
      this.used += m.current * dt * this.drain;
      const net = m.torque - s.drag.torque - s.drag.viscous * omega;
      driveForce = ((net * s.gear * s.efficiency) / rReal) * SCALE; // sim force units
    } else {
      this.current = 0;
    }
    this.volts = volts;
    this.motorRpm = (omega * 60) / (2 * Math.PI);
    if (this.boost > 0) this.boost = Math.max(0, this.boost - dt * 0.25);

    // --- Tires: suspension, drive, rolling resistance, side scrub.
    const shareMass = grounded > 0 ? s.totalMass / grounded : 0;
    for (const c of contacts) {
      if (c.load <= 0) continue;
      const frac = c.load / totalLoad;
      let fLong = driveForce * frac;
      // Rolling resistance (smooth sign so a stopped car doesn't jitter).
      fLong -= (s.tire.rolling * c.load * c.vLong) / (Math.abs(c.vLong) + 0.5);
      const maxLong = s.tire.muLong * c.load;
      if (fLong > maxLong) fLong = maxLong;
      else if (fLong < -maxLong) fLong = -maxLong;
      // Side scrub as an impulse that removes part of the slip, capped by grip.
      let jLat = -c.vLat * shareMass * LATERAL_RELAX;
      const maxLat = s.tire.muLat * c.load * dt;
      if (jLat > maxLat) jLat = maxLat;
      else if (jLat < -maxLat) jLat = -maxLat;
      this.scrubWork += Math.abs(jLat * c.vLat);
      const jx = up.x * c.load * dt + c.fg.x * fLong * dt + c.lg.x * jLat;
      const jy = up.y * c.load * dt + c.fg.y * fLong * dt + c.lg.y * jLat;
      const jz = up.z * c.load * dt + c.fg.z * fLong * dt + c.lg.z * jLat;
      b.applyImpulseAtPoint({ x: jx, y: jy, z: jz }, c.p, true);
    }

    // --- Brake sponges: a pad hanging just above the floor. On the flat it never
    // touches; where the track bends upwards under it (slope transitions) it drags.
    this.braking = false;
    for (let i = 0; i < s.brakes.length; i++) {
      const br = s.brakes[i];
      const reach = 0.1 + (s.wheelRadius - s.axleY) - br.gap; // from 10 mm above floor down to the pad
      const origin = add(t, rotate(q, { x: br.x, y: 0.1, z: br.z }));
      this.ray.origin = origin;
      this.ray.dir = { x: -up.x, y: -up.y, z: -up.z };
      const hit = this.world.castRayAndGetNormal(this.ray, reach + 0.01, true, undefined, this.rayGroups, undefined, b);
      if (!hit || hit.timeOfImpact >= reach) {
        this.prevSponge[i] = 0;
        continue;
      }
      const pen = reach - hit.timeOfImpact;
      const pdot = (pen - this.prevSponge[i]) / dt;
      this.prevSponge[i] = pen;
      const N = Math.min(SPONGE_MAX_LOAD * s.totalMass * GRAVITY, Math.max(0, this.k * SPONGE_STIFFNESS_FACTOR * pen + (pdot > 0 ? this.c * pdot : 0)));
      const p = { x: origin.x - up.x * hit.timeOfImpact, y: origin.y - up.y * hit.timeOfImpact, z: origin.z - up.z * hit.timeOfImpact };
      const vp = pointVel(v, w, comW, p);
      const n = hit.normal;
      const vt = sub(vp, scale(n, dot(vp, n)));
      const sp = Math.sqrt(dot(vt, vt));
      const drag = br.friction * N;
      // Sliding friction; never more than would stop the pad this step.
      const jd = Math.min(drag * dt, sp * s.totalMass * 0.5);
      const dir = sp > 1e-6 ? scale(vt, -1 / sp) : { x: 0, y: 0, z: 0 };
      b.applyImpulseAtPoint(
        { x: n.x * N * dt + dir.x * jd, y: n.y * N * dt + dir.y * jd, z: n.z * N * dt + dir.z * jd },
        p,
        true,
      );
      if (N > 0) this.braking = true;
    }

    this.solveRollers(dt);

    // --- Air drag.
    const sp2 = (v.x * v.x + v.y * v.y + v.z * v.z) / (SCALE * SCALE);
    if (sp2 > 1e-6) {
      const sp = Math.sqrt(sp2);
      const f = s.aero * sp2 * SCALE; // sim force units
      b.applyImpulse({ x: (-v.x / (sp * SCALE)) * f * dt, y: (-v.y / (sp * SCALE)) * f * dt, z: (-v.z / (sp * SCALE)) * f * dt }, true);
    }
  }

  /**
   * Rollers against the lane walls: a small sequential-impulse solver. Each roller
   * that is inside a wall gets a normal impulse (bounce set by the roller type), a
   * little positional push-out, and sliding friction along the wall (bearing
   * rollers spin freely, so barely any). Two passes so front and rear rollers
   * pressing on the same wall settle together.
   */
  private solveRollers(dt: number): void {
    this.wallImpulse = 0;
    const walls = this.walls;
    if (!walls) return;
    const s = this.spec;
    const b = this.body;
    const q = b.rotation();
    const t = b.translation();
    const comW = add(t, rotate(q, s.com));
    const invM = 1 / s.mass;
    const inv = { x: 1 / s.inertia.x, y: 1 / s.inertia.y, z: 1 / s.inertia.z };
    // World-space inverse inertia applied to a vector.
    const invI = (v: Vec): Vec => {
      const l = rotateInv(q, v);
      return rotate(q, { x: l.x * inv.x, y: l.y * inv.y, z: l.z * inv.z });
    };
    const hits: { p: Vec; n: Vec; pen: number; e: number; mu: number; acc: number }[] = [];
    for (const r of s.rollers) {
      const p = add(t, rotate(q, r));
      const w = walls(p.x, p.y, p.z);
      if (!w) continue;
      // Above the wall top a roller can't hold the car in: that is how cars fly out.
      if (w.vertical > w.wallHeight - 0.01 || w.vertical < -0.1) continue;
      let pen: number;
      let n: Vec;
      if (w.lateral > 0) {
        pen = w.lateral + r.r - w.halfWidth;
        n = scale(w.r, -1);
      } else {
        pen = -w.lateral + r.r - w.halfWidth;
        n = w.r;
      }
      // Speculative margin: start resolving a hair before contact so fast rollers don't sink in.
      if (pen < -0.004) continue;
      hits.push({ p, n, pen, e: r.restitution, mu: r.friction, acc: 0 });
    }
    if (hits.length === 0) return;
    for (let pass = 0; pass < 3; pass++) {
      for (const h of hits) {
        const v = b.linvel();
        const w = b.angvel();
        const rel = sub(h.p, comW);
        const vp = pointVel(v, w, comW, h.p);
        const vn = dot(vp, h.n);
        const rn = cross(rel, h.n);
        const kN = invM + dot(rn, invI(rn));
        // Target normal velocity. Not touching yet: only stop it closing the gap this
        // step. Touching: bounce (first pass), plus a gentle push-out of any overlap.
        let target: number;
        if (h.pen < 0) target = h.pen / dt;
        else {
          const bounce = pass === 0 && vn < -0.3 ? -h.e * vn : 0;
          const push = h.pen > 0.002 ? (0.25 * (h.pen - 0.002)) / dt : 0;
          target = Math.max(bounce, push);
        }
        let j = vn < target ? (target - vn) / kN : 0;
        // Accumulated impulse stays non-negative (walls only push).
        const prev = h.acc;
        h.acc = Math.max(0, prev + j);
        j = h.acc - prev;
        if (j === 0) continue;
        // Friction along the wall face, capped by the normal impulse.
        const vt = sub(vp, scale(h.n, vn));
        const vtl = Math.sqrt(dot(vt, vt));
        let ft: Vec = { x: 0, y: 0, z: 0 };
        if (vtl > 1e-5) {
          const tdir = scale(vt, 1 / vtl);
          const rt = cross(rel, tdir);
          const kT = invM + dot(rt, invI(rt));
          const jt = Math.min(h.mu * j, vtl / kT);
          ft = scale(tdir, -jt);
          this.rollerWork += jt * vtl;
        }
        b.applyImpulseAtPoint({ x: h.n.x * j + ft.x, y: h.n.y * j + ft.y, z: h.n.z * j + ft.z }, h.p, true);
        this.wallImpulse += j;
      }
    }
  }

  pose(): Pose {
    const t = this.body.translation();
    const q = this.body.rotation();
    return { x: t.x, y: t.y, z: t.z, qx: q.x, qy: q.y, qz: q.z, qw: q.w };
  }

  /** Speed, u/s. */
  speed(): number {
    const v = this.body.linvel();
    return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
  }

  /** Teleport (rescues, resets). */
  place(p: Pose): void {
    const q = { x: p.qx, y: p.qy, z: p.qz, w: p.qw };
    this.body.setTranslation({ x: p.x, y: p.y, z: p.z }, true);
    this.body.setRotation(q, true);
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.spec.dampers.forEach((d, i) => {
      const wp = rotate(q, d);
      const db = this.dampers[i];
      db.setTranslation({ x: p.x + wp.x, y: p.y + wp.y, z: p.z + wp.z }, true);
      db.setRotation(q, true);
      db.setLinvel({ x: 0, y: 0, z: 0 }, true);
      db.setAngvel({ x: 0, y: 0, z: 0 }, true);
    });
    this.prevCompression.fill(0);
    this.prevSponge.fill(0);
  }

  remove(): void {
    for (const d of this.dampers) this.world.removeRigidBody(d);
    this.world.removeRigidBody(this.body);
  }

  /** Battery state 0..1. */
  charge(): number {
    return 1 - this.used / (1.9 * 3600);
  }
}

// ----- Small vector helpers (plain arithmetic, deterministic) ----------------------

export interface Vec {
  x: number;
  y: number;
  z: number;
}

export function rotate(q: { x: number; y: number; z: number; w: number }, v: Vec): Vec {
  // v' = v + 2w(q×v) + 2 q×(q×v)
  const tx = 2 * (q.y * v.z - q.z * v.y);
  const ty = 2 * (q.z * v.x - q.x * v.z);
  const tz = 2 * (q.x * v.y - q.y * v.x);
  return {
    x: v.x + q.w * tx + (q.y * tz - q.z * ty),
    y: v.y + q.w * ty + (q.z * tx - q.x * tz),
    z: v.z + q.w * tz + (q.x * ty - q.y * tx),
  };
}

const add = (a: Vec, b: Vec): Vec => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const sub = (a: Vec, b: Vec): Vec => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const scale = (a: Vec, s: number): Vec => ({ x: a.x * s, y: a.y * s, z: a.z * s });
const dot = (a: Vec, b: Vec) => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a: Vec, b: Vec): Vec => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
/** Inverse rotation (conjugate quaternion). */
function rotateInv(q: { x: number; y: number; z: number; w: number }, v: Vec): Vec {
  return rotate({ x: -q.x, y: -q.y, z: -q.z, w: q.w }, v);
}
const norm = (a: Vec): Vec => {
  const l = Math.sqrt(dot(a, a)) || 1;
  return { x: a.x / l, y: a.y / l, z: a.z / l };
};
function pointVel(v: Vec, w: Vec, com: Vec, p: Vec): Vec {
  const rx = p.x - com.x,
    ry = p.y - com.y,
    rz = p.z - com.z;
  return { x: v.x + (w.y * rz - w.z * ry), y: v.y + (w.z * rx - w.x * rz), z: v.z + (w.x * ry - w.y * rx) };
}

/** Quaternion that turns the car's +x/+y/+z onto the given forward and up. */
export function quatFromBasis(f: Vec, u: Vec): { x: number; y: number; z: number; w: number } {
  // right = f x u
  const r = { x: f.y * u.z - f.z * u.y, y: f.z * u.x - f.x * u.z, z: f.x * u.y - f.y * u.x };
  // Rotation matrix columns: x->f, y->u, z->r
  const m00 = f.x,
    m10 = f.y,
    m20 = f.z;
  const m01 = u.x,
    m11 = u.y,
    m21 = u.z;
  const m02 = r.x,
    m12 = r.y,
    m22 = r.z;
  const tr = m00 + m11 + m22;
  let x, y, z, w;
  if (tr > 0) {
    const S = Math.sqrt(tr + 1) * 2;
    w = 0.25 * S;
    x = (m21 - m12) / S;
    y = (m02 - m20) / S;
    z = (m10 - m01) / S;
  } else if (m00 > m11 && m00 > m22) {
    const S = Math.sqrt(1 + m00 - m11 - m22) * 2;
    w = (m21 - m12) / S;
    x = 0.25 * S;
    y = (m01 + m10) / S;
    z = (m02 + m20) / S;
  } else if (m11 > m22) {
    const S = Math.sqrt(1 + m11 - m00 - m22) * 2;
    w = (m02 - m20) / S;
    x = (m01 + m10) / S;
    y = 0.25 * S;
    z = (m12 + m21) / S;
  } else {
    const S = Math.sqrt(1 + m22 - m00 - m11) * 2;
    w = (m10 - m01) / S;
    x = (m02 + m20) / S;
    y = (m12 + m21) / S;
    z = 0.25 * S;
  }
  return { x, y, z, w };
}
