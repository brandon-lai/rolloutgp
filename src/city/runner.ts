// The runner: you, on foot, in first person. Sprint (on stamina), jump, slide,
// vault low walls and climb onto crates and docks. The city is all boxes, so a
// small custom controller handles it exactly (see README for why not Rapier's).
//
// Units are metres here; the car's poses arrive in sim units and are divided
// by SCALE before they meet the runner.

import { RAMPS, cityBoxes, type Box, type Ramp } from "./layout.ts";

export interface RunnerInput {
  /** -1..1 strafe (right +) and forward (+). */
  moveX: number;
  moveY: number;
  /** Look deltas since last frame, radians. */
  lookX: number;
  lookY: number;
  sprint: boolean;
  jump: boolean; // pressed this frame
  slide: boolean; // pressed this frame
}

export const RUN = {
  walk: 2.4,
  jog: 5.4,
  sprint: 8.4, // m/s; a tuned car does 6-9 m/s
  accel: 28,
  airControl: 0.35,
  jump: 4.6,
  gravity: 9.81,
  radius: 0.32,
  height: 1.75,
  eye: 1.62,
  step: 0.42,
  staminaMax: 100,
  staminaDrain: 15, // per second of sprinting
  staminaRegen: 13,
  jumpCost: 6,
  vaultMax: 1.35, // obstacle top above feet
  climbMax: 2.45,
};

type Mode = "run" | "slide" | "vault" | "climb";

interface Solid {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  y0: number;
  y1: number;
}

function solidOf(b: Box): Solid {
  const swap = b.ry !== undefined && Math.abs(Math.abs(b.ry) - Math.PI / 2) < 1e-3;
  const hx = swap ? b.hz : b.hx;
  const hz = swap ? b.hx : b.hz;
  return { x0: b.x - hx, x1: b.x + hx, z0: b.z - hz, z1: b.z + hz, y0: b.y - b.hy, y1: b.y + b.hy };
}

export class CityCollision {
  readonly solids: Solid[];
  readonly ramps: Ramp[] = RAMPS;
  constructor() {
    this.solids = cityBoxes()
      .filter((b) => !b.visualOnly && !b.rx)
      .map(solidOf);
  }

  /** Highest walkable surface under (x, z) at or below `maxY`, m. */
  floor(x: number, z: number, maxY: number, r = 0): number {
    let best = -50;
    for (const s of this.solids) {
      if (x < s.x0 - r || x > s.x1 + r || z < s.z0 - r || z > s.z1 + r) continue;
      if (s.y1 <= maxY && s.y1 > best) best = s.y1;
    }
    for (const p of this.ramps) {
      if (x < p.x0 || x > p.x1 || z < p.z0 || z > p.z1) continue;
      const h = p.h0 + ((x - p.x0) / (p.x1 - p.x0)) * (p.h1 - p.h0);
      if (h <= maxY && h > best) best = h;
    }
    return best;
  }

  /** Push a vertical cylinder out of every solid it overlaps between feet+step and head. */
  pushOut(pos: { x: number; y: number; z: number }, r: number, height: number, step: number): boolean {
    let hit = false;
    for (const s of this.solids) {
      if (s.y1 <= pos.y + step || s.y0 >= pos.y + height) continue;
      const cx = Math.max(s.x0, Math.min(pos.x, s.x1));
      const cz = Math.max(s.z0, Math.min(pos.z, s.z1));
      const dx = pos.x - cx,
        dz = pos.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
      hit = true;
      if (d2 > 1e-9) {
        const d = Math.sqrt(d2);
        pos.x = cx + (dx / d) * r;
        pos.z = cz + (dz / d) * r;
      } else {
        // Centre inside the box: leave by the nearest face.
        const opts = [
          [s.x0 - r - pos.x, 0],
          [s.x1 + r - pos.x, 0],
          [0, s.z0 - r - pos.z],
          [0, s.z1 + r - pos.z],
        ];
        opts.sort((a, b) => Math.abs(a[0]) + Math.abs(a[1]) - (Math.abs(b[0]) + Math.abs(b[1])));
        pos.x += opts[0][0];
        pos.z += opts[0][1];
      }
    }
    return hit;
  }

  /** The nearest obstacle straight ahead within `reach`: its top and the far side. */
  ahead(x: number, z: number, dirX: number, dirZ: number, feet: number, reach: number): { top: number; through: number } | null {
    let best: { top: number; through: number; d: number } | null = null;
    for (const s of this.solids) {
      if (s.y1 <= feet + RUN.step || s.y0 > feet + 0.4) continue;
      // Ray against the box's XZ rectangle.
      const t = rayBox(x, z, dirX, dirZ, s);
      if (!t || t[0] > reach || t[0] < -0.05) continue;
      if (!best || t[0] < best.d) best = { top: s.y1, through: t[1], d: t[0] };
    }
    return best ? { top: best.top, through: best.through } : null;
  }
}

function rayBox(x: number, z: number, dx: number, dz: number, s: Solid): [number, number] | null {
  let t0 = -Infinity,
    t1 = Infinity;
  for (const [o, d, lo, hi] of [
    [x, dx, s.x0, s.x1],
    [z, dz, s.z0, s.z1],
  ]) {
    if (Math.abs(d) < 1e-9) {
      if (o < lo || o > hi) return null;
    } else {
      let a = (lo - o) / d,
        b = (hi - o) / d;
      if (a > b) [a, b] = [b, a];
      t0 = Math.max(t0, a);
      t1 = Math.min(t1, b);
    }
  }
  return t0 <= t1 ? [t0, t1] : null;
}

export class Runner {
  pos = { x: 0, y: 0, z: 0 };
  vel = { x: 0, y: 0, z: 0 };
  yaw = 0; // radians, 0 = looking +x
  pitch = 0;
  stamina = RUN.staminaMax;
  onGround = true;
  mode: Mode = "run";
  private modeT = 0;
  private from = { x: 0, y: 0, z: 0 };
  private to = { x: 0, y: 0, z: 0 };
  private exhausted = false;
  sprinting = false;
  /** Distance walked, for head bob. */
  stride = 0;
  readonly world: CityCollision;

  constructor(world: CityCollision, x: number, z: number, yaw: number) {
    this.world = world;
    this.pos = { x, y: world.floor(x, z, 5), z };
    this.yaw = yaw;
  }

  get crouch(): number {
    return this.mode === "slide" ? 1 : 0;
  }

  get speed(): number {
    return Math.hypot(this.vel.x, this.vel.z);
  }

  update(dt: number, inp: RunnerInput): void {
    this.yaw += inp.lookX;
    this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch + inp.lookY));
    const fx = Math.cos(this.yaw),
      fz = Math.sin(this.yaw);
    // Right of facing (heading increases turning right, matching the car's frame).
    const rx = -fz,
      rz = fx;

    if (this.mode === "vault" || this.mode === "climb") {
      this.modeT += dt;
      const dur = this.mode === "vault" ? 0.42 : 0.75;
      const u = Math.min(1, this.modeT / dur);
      const lift = this.mode === "vault" ? Math.sin(u * Math.PI) * 0.35 : 0;
      const yU = this.mode === "climb" ? Math.min(1, u * 1.6) : u;
      this.pos.x = this.from.x + (this.to.x - this.from.x) * (this.mode === "climb" ? Math.max(0, (u - 0.45) / 0.55) : u);
      this.pos.z = this.from.z + (this.to.z - this.from.z) * (this.mode === "climb" ? Math.max(0, (u - 0.45) / 0.55) : u);
      this.pos.y = this.from.y + (this.to.y - this.from.y) * yU + lift;
      if (u >= 1) {
        this.mode = "run";
        this.vel = { x: fx * RUN.jog, y: 0, z: fz * RUN.jog };
      }
      return;
    }

    // Stamina.
    const wants = inp.sprint && (Math.abs(inp.moveY) > 0.1 || Math.abs(inp.moveX) > 0.1);
    if (this.stamina <= 0) this.exhausted = true;
    if (this.exhausted && this.stamina > 25) this.exhausted = false;
    this.sprinting = wants && !this.exhausted && this.mode !== "slide";
    this.stamina = Math.max(0, Math.min(RUN.staminaMax, this.stamina + (this.sprinting ? -RUN.staminaDrain : RUN.staminaRegen) * dt));

    // Desired horizontal velocity.
    let mx = inp.moveX,
      my = inp.moveY;
    const ml = Math.hypot(mx, my);
    if (ml > 1) {
      mx /= ml;
      my /= ml;
    }
    const top = this.sprinting ? RUN.sprint : ml > 0.75 ? RUN.jog : RUN.walk + (RUN.jog - RUN.walk) * (ml / 0.75);
    let tx = (fx * my + rx * mx) * top,
      tz = (fz * my + rz * mx) * top;

    if (this.mode === "slide") {
      this.modeT += dt;
      tx = this.vel.x * 0.985;
      tz = this.vel.z * 0.985;
      if (this.modeT > 0.75) this.mode = "run";
    } else if (inp.slide && this.onGround && this.speed > RUN.jog * 0.9) {
      this.mode = "slide";
      this.modeT = 0;
    }

    const k = this.onGround ? RUN.accel : RUN.accel * RUN.airControl;
    const dvx = tx - this.vel.x,
      dvz = tz - this.vel.z;
    const dl = Math.hypot(dvx, dvz);
    const maxDv = k * dt;
    if (dl > maxDv) {
      this.vel.x += (dvx / dl) * maxDv;
      this.vel.z += (dvz / dl) * maxDv;
    } else {
      this.vel.x = tx;
      this.vel.z = tz;
    }

    // Vault / climb / jump.
    if (inp.jump || (this.sprinting && this.onGround)) {
      const ob = this.world.ahead(this.pos.x, this.pos.z, fx, fz, this.pos.y, 0.9);
      if (ob) {
        const h = ob.top - this.pos.y;
        if (h > RUN.step && h <= RUN.vaultMax && (inp.jump || this.sprinting)) {
          // Vault over to the far side if there's floor there, else onto the top.
          const far = { x: this.pos.x + fx * (ob.through + 0.55), z: this.pos.z + fz * (ob.through + 0.55) };
          const farFloor = this.world.floor(far.x, far.z, ob.top + 0.1);
          const land = farFloor < ob.top - 0.2 ? { ...far, y: farFloor } : { x: this.pos.x + fx * 0.9, z: this.pos.z + fz * 0.9, y: ob.top };
          this.mode = "vault";
          this.modeT = 0;
          this.from = { ...this.pos };
          this.to = land;
          return;
        }
        if (inp.jump && h > RUN.vaultMax && h <= RUN.climbMax) {
          this.mode = "climb";
          this.modeT = 0;
          this.from = { ...this.pos };
          this.to = { x: this.pos.x + fx * 0.85, y: ob.top, z: this.pos.z + fz * 0.85 };
          this.stamina = Math.max(0, this.stamina - RUN.jumpCost);
          return;
        }
      }
      if (inp.jump && this.onGround && this.stamina > RUN.jumpCost * 0.5) {
        this.vel.y = RUN.jump;
        this.onGround = false;
        this.stamina = Math.max(0, this.stamina - RUN.jumpCost);
      }
    }

    // Integrate.
    this.vel.y -= RUN.gravity * dt;
    const nx = this.pos.x + this.vel.x * dt;
    const nz = this.pos.z + this.vel.z * dt;
    let ny = this.pos.y + this.vel.y * dt;
    const p = { x: nx, y: this.pos.y, z: nz };
    const height = this.mode === "slide" ? 0.9 : RUN.height;
    this.world.pushOut(p, RUN.radius, height, RUN.step);
    // Hit a wall: lose the velocity into it.
    if (Math.abs(p.x - nx) > 1e-6) this.vel.x = 0;
    if (Math.abs(p.z - nz) > 1e-6) this.vel.z = 0;
    const floor = this.world.floor(p.x, p.z, this.pos.y + RUN.step, RUN.radius * 0.5);
    if (ny <= floor) {
      ny = floor;
      this.vel.y = 0;
      this.onGround = true;
    } else if (this.onGround && this.vel.y <= 0 && this.pos.y - floor < RUN.step) {
      // Stick to stairs and kerbs going down.
      ny = floor;
      this.vel.y = 0;
    } else this.onGround = false;
    this.pos = { x: p.x, y: ny, z: p.z };
    if (this.onGround) this.stride += this.speed * dt;
    // Fell off the world somehow: put the runner back on the street.
    if (this.pos.y < -20) this.pos = { x: 0, y: 0, z: -40 };
  }
}
