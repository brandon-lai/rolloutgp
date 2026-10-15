// A build is the car as the player assembled it: one choice per slot. This file
// checks that the parts fit together, runs the tech inspection, and turns the
// build into the physical spec the simulation runs.

import {
  part,
  hasPart,
  type BearingPart,
  type BrakePart,
  type ChassisPart,
  type DamperPart,
  type GearPart,
  type MotorPart,
  type RollerPart,
  type StayPart,
  type TirePart,
} from "./parts.ts";
import { bodyProps, sanitizeRecipe, type BodyRecipe, type BodyProps } from "./body.ts";
import { DEFAULT_BODY } from "./bodies.ts";
import { MM } from "./units.ts";

export interface Build {
  v: 1;
  name: string;
  chassis: string;
  motor: string;
  gear: string;
  tires: string;
  rollers: {
    roller: string;
    front: string;
    rear: string;
    side: string | null;
  };
  dampers: { part: string | null; mount: "front" | "rear" | "side" };
  brakes: { part: string | null; position: "rear" | "front" | "both"; gap: 1 | 2 | 3 };
  bearings: string;
  body: BodyRecipe;
}

export const STARTER_BUILD: Build = {
  v: 1,
  name: "Kit car",
  chassis: "ch-s2",
  motor: "mo-stock",
  gear: "ge-5",
  tires: "ti-std",
  rollers: { roller: "ro-9p", front: "st-f-stock", rear: "st-r-stock", side: null },
  dampers: { part: null, mount: "rear" },
  brakes: { part: null, position: "rear", gap: 2 },
  bearings: "be-plastic",
  body: DEFAULT_BODY,
};

/** Every part id a build uses (for ownership checks). */
export function partsInBuild(b: Build): string[] {
  const ids = [b.chassis, b.motor, b.gear, b.tires, b.rollers.roller, b.rollers.front, b.rollers.rear, b.bearings];
  if (b.rollers.side) ids.push(b.rollers.side);
  if (b.dampers.part) ids.push(b.dampers.part);
  if (b.brakes.part) ids.push(b.brakes.part);
  return ids;
}

// ----- Fit rules ----------------------------------------------------------------

export interface FitProblem {
  slot: string;
  message: string;
}

export function fitProblems(b: Build): FitProblem[] {
  const out: FitProblem[] = [];
  const ch = part<ChassisPart>(b.chassis);
  const mo = part<MotorPart>(b.motor);
  if (mo.shaft !== ch.shaft) {
    out.push({
      slot: "motor",
      message:
        ch.shaft === "double"
          ? `${ch.name} is a midship chassis: it needs a twin-shaft motor.`
          : `${ch.name} takes a single-shaft motor, not a twin-shaft one.`,
    });
  }
  for (const [key, pos] of [
    ["front", "front"],
    ["rear", "rear"],
  ] as const) {
    const st = part<StayPart>(b.rollers[key]);
    if (st.position !== pos) out.push({ slot: "rollers", message: `${st.name} is not a ${pos} stay.` });
    if (!st.fits.includes(ch.family)) out.push({ slot: "rollers", message: `${st.name} doesn't bolt onto ${ch.name}.` });
  }
  if (b.rollers.side) {
    const st = part<StayPart>(b.rollers.side);
    if (!ch.sideMounts) out.push({ slot: "rollers", message: `${ch.name} has no side stay mounts.` });
    else if (st.position !== "side") out.push({ slot: "rollers", message: `${st.name} is not a side stay.` });
  }
  if (b.dampers.part && b.dampers.mount === "side" && !b.rollers.side) {
    out.push({ slot: "dampers", message: "Side dampers hang off side stays. Fit side stays first." });
  }
  return out;
}

// ----- Tech inspection ------------------------------------------------------------

/** Official limits (Tamiya race regulations). */
export const REGULATION = {
  maxWidth: 105, // mm
  maxHeight: 70, // mm
  maxLength: 165, // mm
  minWeight: 90, // g, with batteries
  minClearance: 1, // mm
  tireDiameter: [22, 35] as const, // mm
};

export interface Inspection {
  width: number;
  length: number;
  height: number;
  weight: number;
  clearance: number;
  tireDiameter: number;
  checks: { id: string; label: string; value: string; limit: string; ok: boolean }[];
  legal: boolean;
}

const AXLE_Y = 10.5; // axle height above the chassis floor, mm
const BATTERY_MASS = 54; // two AA NiMH cells, g
const CHASSIS_Y = 9; // chassis tub centre of mass above floor, mm

export function inspect(b: Build): Inspection {
  const g = geometry(b);
  const r = REGULATION;
  const fmt = (v: number) => (Math.round(v * 10) / 10).toString();
  const checks = [
    { id: "width", label: "Width", value: `${fmt(g.width)} mm`, limit: `≤ ${r.maxWidth} mm`, ok: g.width <= r.maxWidth + 1e-6 },
    { id: "length", label: "Length", value: `${fmt(g.length)} mm`, limit: `≤ ${r.maxLength} mm`, ok: g.length <= r.maxLength + 1e-6 },
    { id: "height", label: "Height", value: `${fmt(g.height)} mm`, limit: `≤ ${r.maxHeight} mm`, ok: g.height <= r.maxHeight + 1e-6 },
    { id: "weight", label: "Weight", value: `${fmt(g.mass)} g`, limit: `≥ ${r.minWeight} g`, ok: g.mass >= r.minWeight },
    { id: "clearance", label: "Ground clearance", value: `${fmt(g.clearance)} mm`, limit: `≥ ${r.minClearance} mm`, ok: g.clearance >= r.minClearance },
    {
      id: "tires",
      label: "Tire diameter",
      value: `${g.ti.diameter} mm`,
      limit: `${r.tireDiameter[0]}–${r.tireDiameter[1]} mm`,
      ok: g.ti.diameter >= r.tireDiameter[0] && g.ti.diameter <= r.tireDiameter[1],
    },
  ];
  return {
    width: g.width,
    length: g.length,
    height: g.height,
    weight: g.mass,
    clearance: g.clearance,
    tireDiameter: g.ti.diameter,
    checks,
    legal: checks.every((c) => c.ok),
  };
}

// ----- Geometry and mass ------------------------------------------------------------

interface Mass {
  m: number; // g
  x: number;
  y: number;
  z: number; // mm
  /** Extra moment of inertia of the item about its own centre (g·mm²), per axis. */
  ix?: number;
  iy?: number;
  iz?: number;
}

interface RollerMount {
  x: number;
  y: number;
  z: number;
  r: number; // mm
}

function geometry(b: Build) {
  const ch = part<ChassisPart>(b.chassis);
  const mo = part<MotorPart>(b.motor);
  const ge = part<GearPart>(b.gear);
  const ti = part<TirePart>(b.tires);
  const ro = part<RollerPart>(b.rollers.roller);
  const stays = [part<StayPart>(b.rollers.front), part<StayPart>(b.rollers.rear)];
  if (b.rollers.side) stays.push(part<StayPart>(b.rollers.side));
  const be = part<BearingPart>(b.bearings);
  const body = bodyProps(b.body);

  const masses: Mass[] = [];
  const L = ch.length;
  masses.push({ m: ch.mass, x: 0, y: CHASSIS_Y, z: 0, ix: (ch.mass * (ch.tread * ch.tread + 16 * 16)) / 12, iy: (ch.mass * (L * L + ch.tread * ch.tread)) / 12, iz: (ch.mass * (L * L + 16 * 16)) / 12 });
  masses.push({ m: BATTERY_MASS, x: -2, y: ch.batteryY, z: 0, ix: (BATTERY_MASS * (30 * 30 + 15 * 15)) / 12, iy: (BATTERY_MASS * (50 * 50 + 30 * 30)) / 12, iz: (BATTERY_MASS * (50 * 50 + 15 * 15)) / 12 });
  masses.push({ m: mo.mass, x: ch.motorX, y: 12, z: 0 });
  masses.push({ m: ge.mass, x: ch.motorX * 0.5, y: 9, z: 0 });
  masses.push({ m: be.mass, x: 0, y: AXLE_Y, z: 0 });
  const half = ch.wheelbase / 2;
  for (const sx of [half, -half]) for (const sz of [ch.tread / 2, -ch.tread / 2]) masses.push({ m: ti.mass / 4, x: sx, y: AXLE_Y, z: sz });

  const rollers: RollerMount[] = [];
  for (const st of stays) {
    masses.push({ m: st.mass, x: st.x, y: 8, z: 0 });
    for (const y of st.tiers) {
      for (const side of [1, -1]) {
        rollers.push({ x: st.x, y, z: side * st.span, r: ro.diameter / 2 });
        masses.push({ m: ro.mass, x: st.x, y, z: side * st.span });
      }
    }
  }

  const damper = b.dampers.part ? part<DamperPart>(b.dampers.part) : null;
  const damperMounts: { x: number; y: number; z: number; m: number }[] = [];
  if (damper) {
    const mount = b.dampers.mount;
    const x = mount === "front" ? 60 : mount === "rear" ? -60 : 0;
    const z = mount === "side" ? 46 : 36;
    for (const side of [1, -1]) damperMounts.push({ x, y: 14, z: side * z, m: damper.each });
  }

  const brake = b.brakes.part ? part<BrakePart>(b.brakes.part) : null;
  const brakeMounts: { x: number; z: number; friction: number }[] = [];
  if (brake) {
    const pos = b.brakes.position;
    if (pos === "rear" || pos === "both") brakeMounts.push({ x: -66, z: 0, friction: brake.friction });
    if (pos === "front" || pos === "both") brakeMounts.push({ x: 66, z: 0, friction: brake.friction });
    masses.push({ m: brake.mass * brakeMounts.length, x: 0, y: 4, z: 0 });
  }

  masses.push({ m: body.mass, x: body.comX, y: body.comY, z: 0 });

  // Dampers are separate bodies in the sim; count them here for weight and balance.
  const all = [...masses, ...damperMounts.map((d) => ({ m: d.m, x: d.x, y: d.y, z: d.z }))];
  let m = 0,
    cx = 0,
    cy = 0,
    cz = 0;
  for (const it of all) {
    m += it.m;
    cx += it.m * it.x;
    cy += it.m * it.y;
    cz += it.m * it.z;
  }
  cx /= m;
  cy /= m;
  cz /= m;
  // Chassis-only inertia about the chassis body's centre of mass (dampers excluded:
  // they are their own bodies in the sim).
  let cm = 0,
    ccx = 0,
    ccy = 0,
    ccz = 0;
  for (const it of masses) {
    cm += it.m;
    ccx += it.m * it.x;
    ccy += it.m * it.y;
    ccz += it.m * it.z;
  }
  ccx /= cm;
  ccy /= cm;
  ccz /= cm;
  let Ix = 0,
    Iy = 0,
    Iz = 0;
  for (const it of masses) {
    const dx = it.x - ccx,
      dy = it.y - ccy,
      dz = it.z - ccz;
    Ix += it.m * (dy * dy + dz * dz) + (it.ix ?? 0);
    Iy += it.m * (dx * dx + dz * dz) + (it.iy ?? 0);
    Iz += it.m * (dx * dx + dy * dy) + (it.iz ?? 0);
  }
  // The body shell's own spread (a thin shell around the car).
  Ix += (body.mass * (body.halfWidth * body.halfWidth * 4 + 400)) / 12;
  Iy += (body.mass * (body.length * body.length + body.halfWidth * body.halfWidth * 4)) / 12;
  Iz += (body.mass * (body.length * body.length + 400)) / 12;

  const clearance = ti.diameter / 2 - AXLE_Y;
  const tireOuter = ch.tread / 2 + ti.width / 2;
  const rollerOuter = Math.max(...rollers.map((r) => Math.abs(r.z) + r.r));
  const width = 2 * Math.max(rollerOuter, tireOuter, body.halfWidth);
  const frontExt = Math.max(L / 2, body.front, ...rollers.filter((r) => r.x > 0).map((r) => r.x + r.r));
  const rearExt = Math.max(L / 2, body.rear, ...rollers.filter((r) => r.x < 0).map((r) => -r.x + r.r));
  const rollerTop = Math.max(...rollers.map((r) => r.y + 3));
  const height = clearance + Math.max(body.top, rollerTop, ti.diameter / 2 + AXLE_Y - clearance);

  return {
    ch,
    mo,
    ge,
    ti,
    ro,
    be,
    body,
    damper,
    rollers,
    damperMounts,
    brakeMounts,
    brakeGap: b.brakes.gap,
    mass: m,
    chassisMass: cm,
    com: { x: ccx, y: ccy, z: ccz },
    totalCom: { x: cx, y: cy, z: cz },
    inertia: { x: Ix, y: Iy, z: Iz },
    clearance,
    width,
    length: frontExt + rearExt,
    height,
  };
}

// ----- The spec the simulation runs -------------------------------------------------------

export interface V3 {
  x: number;
  y: number;
  z: number;
}

/**
 * Car spec in sim units (u = 100 mm, kg, seconds). Local frame: origin at the
 * centre of the chassis floor, +x forward, +y up, +z to the car's right.
 */
export interface CarSpec {
  mass: number; // chassis body only, kg (dampers are separate)
  totalMass: number; // kg
  com: V3; // u
  inertia: V3; // kg·u²
  wheelRadius: number; // u
  axleY: number; // u above the floor
  wheels: V3[]; // axle centres
  tire: { muLong: number; muLat: number; rolling: number };
  rollers: { x: number; y: number; z: number; r: number; friction: number; restitution: number }[];
  dampers: { x: number; y: number; z: number; mass: number }[];
  brakes: { x: number; z: number; gap: number; friction: number }[];
  /** Collision hulls: chassis tub and body shell. Flat xyz point lists, u. */
  hulls: number[][];
  motor: {
    /** Back-EMF / torque constant, V·s/rad = N·m/A. */
    k: number;
    /** Winding resistance, ohm. */
    resistance: number;
  };
  gear: number;
  efficiency: number;
  /** Drivetrain friction at the motor: constant N·m and N·m per rad/s. */
  drag: { torque: number; viscous: number };
  /** 0.5 * rho * Cd * A, in N per (m/s)^2. */
  aero: number;
  toughness: number;
  /** Rounded headline numbers for the garage, real units. */
  stats: {
    massG: number;
    topSpeedKmh: number;
    widthMm: number;
    comHeightMm: number;
    comXMm: number;
    clearanceMm: number;
  };
}

const NOMINAL_V = 3.0;

/** Battery: two AA NiMH cells. Game values close to real cells. */
export const BATTERY = {
  /** Open-circuit voltage when fresh, V. */
  fresh: 2.78,
  /** Open-circuit voltage when flat, V. */
  flat: 2.3,
  /** Internal resistance of the pack plus contacts, ohm. */
  resistance: 0.12,
  /** Usable charge, coulombs (1900 mAh). */
  capacity: 1.9 * 3600,
};

export function batteryVoltage(used: number): number {
  const f = Math.min(1, Math.max(0, used / BATTERY.capacity));
  // Flat plateau, then a knee in the last 15%.
  const plateau = BATTERY.fresh - (BATTERY.fresh - BATTERY.flat) * 0.45 * f;
  const knee = f > 0.85 ? ((f - 0.85) / 0.15) * (BATTERY.fresh - BATTERY.flat) * 0.55 : 0;
  return plateau - knee;
}

/** Turn a build into the physics spec. `variance` (−1..1) is this motor's sample spread. */
export function carSpec(b: Build, variance = 0): CarSpec {
  const g = geometry(b);
  const rpmToRad = (2 * Math.PI) / 60;
  const free = g.mo.freeRpm * (1 + 0.03 * variance) * rpmToRad;
  const stall = (g.mo.stallTorque / 1000) * (1 + 0.03 * variance);
  const k = NOMINAL_V / free;
  const resistance = NOMINAL_V / (stall / k);
  const mmToU = MM;
  const kg = (grams: number) => grams / 1000;
  // g·mm² -> kg·u²
  const inertia = (v: number) => kg(v) * mmToU * mmToU;
  const rollerFriction = (f: number) => f * g.be.rollerFriction;
  const tireR = g.ti.diameter / 2;

  // Theoretical top speed on a flat straight with a fresh battery, for the stats panel.
  const topSpeed = estimateTopSpeed({
    k,
    resistance,
    gear: g.ge.ratio,
    eff: g.ch.efficiency,
    rWheel: tireR / 1000,
    drag0: g.be.dragTorque / 1000,
    dragV: g.be.viscous / 1000 / ((10000 * 2 * Math.PI) / 60),
    massKg: kg(g.mass),
    rolling: g.ti.rolling,
    aero: 0.5 * 1.2 * 0.6 * g.body.frontalArea * 1e-6,
  });

  return {
    mass: kg(g.chassisMass),
    totalMass: kg(g.mass),
    com: { x: g.com.x * mmToU, y: g.com.y * mmToU, z: g.com.z * mmToU },
    inertia: { x: inertia(g.inertia.x), y: inertia(g.inertia.y), z: inertia(g.inertia.z) },
    wheelRadius: tireR * mmToU,
    axleY: AXLE_Y * mmToU,
    wheels: [
      { x: g.ch.wheelbase / 2, z: g.ch.tread / 2 },
      { x: g.ch.wheelbase / 2, z: -g.ch.tread / 2 },
      { x: -g.ch.wheelbase / 2, z: g.ch.tread / 2 },
      { x: -g.ch.wheelbase / 2, z: -g.ch.tread / 2 },
    ].map((w) => ({ x: w.x * mmToU, y: AXLE_Y * mmToU, z: w.z * mmToU })),
    tire: { muLong: g.ti.muLong, muLat: g.ti.muLat, rolling: g.ti.rolling },
    rollers: g.rollers.map((r) => ({
      x: r.x * mmToU,
      y: r.y * mmToU,
      z: r.z * mmToU,
      r: r.r * mmToU,
      friction: rollerFriction(g.ro.friction),
      restitution: g.ro.restitution,
    })),
    dampers: g.damperMounts.map((d) => ({ x: d.x * mmToU, y: d.y * mmToU, z: d.z * mmToU, mass: kg(d.m) })),
    brakes: g.brakeMounts.map((br) => ({ x: br.x * mmToU, z: br.z * mmToU, gap: g.brakeGap * mmToU, friction: br.friction })),
    hulls: [chassisHull(g.ch, g.ti), shellHull(g.body, rollerOuterMm(g.rollers))],
    motor: { k, resistance },
    gear: g.ge.ratio,
    efficiency: g.ch.efficiency,
    drag: { torque: g.be.dragTorque / 1000, viscous: g.be.viscous / 1000 / ((10000 * 2 * Math.PI) / 60) },
    aero: 0.5 * 1.2 * 0.6 * g.body.frontalArea * 1e-6,
    toughness: Math.min(g.ch.toughness, g.body.toughness),
    stats: {
      massG: Math.round(g.mass * 10) / 10,
      topSpeedKmh: Math.round(topSpeed * 3.6 * 10) / 10,
      widthMm: Math.round(g.width * 10) / 10,
      comHeightMm: Math.round((g.totalCom.y + g.clearance) * 10) / 10,
      comXMm: Math.round(g.totalCom.x * 10) / 10,
      clearanceMm: Math.round(g.clearance * 10) / 10,
    },
  };
}

/** Motor torque at the motor shaft (N·m) for a speed (rad/s) and pack voltage. Also returns current (A). */
export function motorTorque(spec: Pick<CarSpec, "motor">, omega: number, volts: number): { torque: number; current: number } {
  const { k, resistance } = spec.motor;
  const current = Math.max(0, (volts - k * omega) / (resistance + BATTERY.resistance));
  return { torque: k * current, current };
}

function estimateTopSpeed(p: {
  k: number;
  resistance: number;
  gear: number;
  eff: number;
  rWheel: number;
  drag0: number;
  dragV: number;
  massKg: number;
  rolling: number;
  aero: number;
}): number {
  // Bisection on the speed where drive force equals the losses.
  let lo = 0;
  let hi = 30;
  for (let i = 0; i < 50; i++) {
    const v = (lo + hi) / 2;
    const omega = (v / p.rWheel) * p.gear;
    const current = Math.max(0, (BATTERY.fresh - p.k * omega) / (p.resistance + BATTERY.resistance));
    const t = p.k * current - p.drag0 - p.dragV * omega;
    const drive = (t * p.gear * p.eff) / p.rWheel;
    const loss = p.rolling * p.massKg * 9.81 + p.aero * v * v;
    if (drive > loss) lo = v;
    else hi = v;
  }
  return lo;
}

// ----- Validation for builds that arrive from links or storage ---------------------------

export function sanitizeBuild(input: unknown): Build {
  const fb = STARTER_BUILD;
  if (!input || typeof input !== "object") return fb;
  const b = input as Partial<Build>;
  const pick = (id: unknown, slot: string, d: string) => {
    if (typeof id !== "string" || !hasPart(id)) return d;
    return part(id).slot === slot ? id : d;
  };
  const pickOpt = (id: unknown, slot: string) => (typeof id === "string" && hasPart(id) && part(id).slot === slot ? id : null);
  const r = (b.rollers ?? {}) as Partial<Build["rollers"]>;
  const dm = (b.dampers ?? {}) as Partial<Build["dampers"]>;
  const br = (b.brakes ?? {}) as Partial<Build["brakes"]>;
  const rollerId = pick(r.roller, "rollers", fb.rollers.roller);
  return {
    v: 1,
    name: typeof b.name === "string" && b.name.trim() ? b.name.slice(0, 32) : fb.name,
    chassis: pick(b.chassis, "chassis", fb.chassis),
    motor: pick(b.motor, "motor", fb.motor),
    gear: pick(b.gear, "gear", fb.gear),
    tires: pick(b.tires, "tires", fb.tires),
    rollers: {
      roller: part(rollerId).slot === "rollers" && (part(rollerId) as RollerPart).kind === "roller" ? rollerId : fb.rollers.roller,
      front: stayOr(r.front, "front", fb.rollers.front),
      rear: stayOr(r.rear, "rear", fb.rollers.rear),
      side: r.side ? stayOr(r.side, "side", "") || null : null,
    },
    dampers: {
      part: pickOpt(dm.part, "dampers"),
      mount: dm.mount === "front" || dm.mount === "side" ? dm.mount : "rear",
    },
    brakes: {
      part: pickOpt(br.part, "brakes"),
      position: br.position === "front" || br.position === "both" ? br.position : "rear",
      gap: br.gap === 1 || br.gap === 3 ? br.gap : 2,
    },
    bearings: pick(b.bearings, "bearings", fb.bearings),
    body: sanitizeRecipe(b.body, fb.body),
  };
}

function stayOr(id: unknown, position: StayPart["position"], d: string): string {
  if (typeof id !== "string" || !hasPart(id)) return d;
  const p = part(id);
  return p.slot === "rollers" && (p as StayPart).kind === "stay" && (p as StayPart).position === position ? id : d;
}

function rollerOuterMm(rollers: RollerMount[]): number {
  return Math.max(...rollers.map((r) => Math.abs(r.z) + r.r));
}

/**
 * Chassis tub: flat between the axles, with the bumpers swept up front and rear
 * like a real chassis, so it rides up a ramp instead of digging in.
 */
function chassisHull(ch: ChassisPart, ti: TirePart): number[] {
  const hz = ch.tread / 2 - ti.width / 2 - 2;
  const end = ch.length / 2 - 4;
  const flat = ch.wheelbase / 2 + 12;
  const pts: number[] = [];
  for (const sx of [1, -1])
    for (const sz of [1, -1]) {
      pts.push(sx * flat, 0, sz * hz);
      pts.push(sx * end, 8, sz * hz);
      pts.push(sx * end, 16, sz * hz);
    }
  return pts.map((v) => v * MM);
}

/**
 * Body shell for crashes. Kept 6 mm inside the roller line: on the real car the
 * rollers stand proud of the body, and if the shell could touch the wall first it
 * would shove the car over it from 40 mm up.
 */
function shellHull(body: BodyProps, rollerOuter: number): number[] {
  const hz = Math.max(20, Math.min(body.halfWidth, rollerOuter - 6));
  const front = body.front - 4;
  const rear = -(body.rear - 4);
  const lo = 10;
  const hi = Math.max(lo + 6, body.top - 2);
  const pts: number[] = [];
  for (const sz of [1, -1]) {
    pts.push(front, lo, sz * hz * 0.7, front - 18, hi * 0.6, sz * hz, rear, lo, sz * hz, rear, hi * 0.8, sz * hz, front * 0.2, hi, sz * hz * 0.85);
  }
  return pts.map((v) => v * MM);
}
