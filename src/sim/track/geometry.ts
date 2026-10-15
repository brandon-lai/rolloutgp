// Track geometry: modular sections swept into walled lanes.
//
// A track is a list of pieces along a centreline (straights, corners, banked
// turns, slopes, jumps, waves and the lane-change bridge). Each lane is a
// U-shaped channel swept along the centreline at its lateral offset: a 115 mm
// floor between 50 mm walls, the official dimensions. The same sweep feeds the
// physics collider and the renderer, so what you see is exactly what the car hits.
//
// Pieces are authored in real metres; everything here is in sim units.

import { dcos, dsin, smootherstep, clamp, deg } from "../dmath.ts";
import { LANE_PITCH, LANE_WIDTH, SCALE, WALL_HEIGHT, WALL_THICK } from "../units.ts";

export type Piece =
  | { kind: "straight"; len: number }
  /** Positive angle turns right. Bank tilts the floor towards the inside, degrees. */
  | { kind: "corner"; radius: number; angle: number; bank?: number; name?: string }
  /** Flat, a straight ramp gaining `rise`, flat. Negative rise goes downhill. */
  | { kind: "slope"; len: number; rise: number; name?: string }
  /** Up a ramp to a sharp crest, a short top, then down. Cars fly off the crest. */
  | { kind: "dragon"; len: number; rise: number; name?: string }
  /** A run of bumps. */
  | { kind: "wave"; len: number; bumps: number; amp: number; name?: string }
  /** The lane changer (always 3.4 m): one lane climbs over the other two so every car runs every lane. */
  | { kind: "lanechange"; len: 3.4; name?: string };

export type FeatureKind = "corner" | "bank" | "slope" | "dragon" | "wave" | "lanechange" | "straight";

export interface Feature {
  kind: FeatureKind;
  name: string;
  /** Centreline horizontal distance range, u. */
  start: number;
  end: number;
  /** Is this somewhere a car can leave the ground? */
  jump: boolean;
}

/** Floats per sample in a strip. */
export const SAMPLE_STRIDE = 14;
// Sample layout: p(3) f(3) u(3) r(3) s(1) xh(1)
//   p  lane-centre floor point
//   f  forward tangent, u floor normal, r right
//   s  arc length along this lane from the start line
//   xh horizontal distance along the centreline (shared by all lanes)

export interface Strip {
  /** Sample data, SAMPLE_STRIDE floats each. */
  data: Float64Array;
  count: number;
  /** Strip a car on this one continues onto after the start line. */
  next: number;
  /** Total arc length, u. */
  length: number;
}

export interface TrackDef {
  id: string;
  name: string;
  blurb: string;
  lanes: 1 | 3;
  pieces: Piece[];
  /** Laps in a standard heat. Three, so every car runs every lane once. */
  laps: number;
  difficulty: 1 | 2 | 3 | 4;
  /** Short reading of what the course rewards, for the track picker. */
  rewards: string;
}

export interface TrackGeo {
  def: TrackDef;
  strips: Strip[];
  features: Feature[];
  /** Centreline horizontal length, u. */
  centreLength: number;
  /** One watertight mesh for the whole track (physics and render). */
  positions: Float32Array;
  indices: Uint32Array;
  /** Vertex count per strip, for colouring lanes in the renderer. */
  stripVertexRanges: [number, number][];
  /** Where the bridge's supports stand: centreline xh values. */
  pillars: { x: number; y: number; z: number; h: number }[];
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number; maxY: number };
}

const M = SCALE; // authored metres -> u

/** Lane-change layout (u along the piece). The bridge rises, crosses at height, falls. */
const LC = {
  len: 34,
  bridgeUp: [0.5, 6.5] as const,
  bridgeDown: [27.5, 33.5] as const,
  bridgeShift: [11.5, 25.5] as const,
  groundShift: [14, 23] as const,
  height: 1.32, // u (132 mm): clears a 70 mm car under the bridge and the 50 mm walls below
  round: 2.5,
};

interface CentreSample {
  x: number;
  y: number;
  z: number;
  heading: number; // radians, 0 = +x, increasing turns right
  bank: number; // radians, positive tilts towards the turn's inside
  turn: number; // +1 right, -1 left, 0 straight (for bank direction)
  xh: number;
  piece: number;
  t: number; // horizontal distance into the piece, u
}

/** Height profile of a piece relative to its entry height, and its slope. */
function pieceHeight(p: Piece, t: number): number {
  const L = pieceLen(p);
  switch (p.kind) {
    case "slope": {
      const H = p.rise * M;
      const flat = Math.min(0.6, L * 0.15);
      return rounded(
        [
          [0, 0],
          [flat, 0],
          [L - flat, H],
          [L, H],
        ],
        0.35,
        t,
      );
    }
    case "dragon": {
      // Ramp up, crest with almost no rounding (cars launch here), short top, ramp down.
      const H = p.rise * M;
      const up = L * 0.32;
      const top = L * 0.14;
      return rounded(
        [
          [0, 0],
          [0.3, 0],
          [0.3 + up, H],
          [0.3 + up + top, H],
          [L - 0.3, 0],
          [L, 0],
        ],
        0.12,
        t,
      );
    }
    case "wave": {
      const A = p.amp * M;
      const u = clamp(t / L, 0, 1);
      return (A * (1 - dcos(2 * Math.PI * p.bumps * u))) / 2;
    }
    default:
      return 0;
  }
}

function pieceLen(p: Piece): number {
  switch (p.kind) {
    case "corner":
      return Math.abs(deg(p.angle)) * p.radius * M;
    case "lanechange":
      return LC.len;
    default:
      return p.len * M;
  }
}

/** Piecewise-linear profile with each interior vertex rounded over ±d (quadratic Bézier). */
function rounded(pts: [number, number][], d: number, t: number): number {
  for (let i = 1; i < pts.length - 1; i++) {
    const [vx, vh] = pts[i];
    const dd = Math.min(d, (vx - pts[i - 1][0]) / 2, (pts[i + 1][0] - vx) / 2);
    if (t >= vx - dd && t <= vx + dd && dd > 0) {
      const ah = lineAt(pts[i - 1], pts[i], vx - dd);
      const bh = lineAt(pts[i], pts[i + 1], vx + dd);
      const u = (t - (vx - dd)) / (2 * dd);
      return (1 - u) * (1 - u) * ah + 2 * u * (1 - u) * vh + u * u * bh;
    }
  }
  for (let i = 1; i < pts.length; i++) {
    if (t <= pts[i][0]) return lineAt(pts[i - 1], pts[i], t);
  }
  return pts[pts.length - 1][1];
}

function lineAt(a: [number, number], b: [number, number], t: number): number {
  const span = b[0] - a[0];
  if (span <= 0) return b[1];
  return a[1] + ((b[1] - a[1]) * (t - a[0])) / span;
}

/** Sample step inside a piece, u. Fine where shape changes, coarse on flat straights. */
function stepFor(p: Piece): number {
  switch (p.kind) {
    case "straight":
      return 0.8;
    case "corner":
      return Math.max(0.12, Math.min(0.5, deg(3) * p.radius * M));
    case "lanechange":
      return 0.2;
    case "wave":
      return 0.1;
    default:
      return 0.1;
  }
}

/** Walk the pieces and sample the centreline. */
function sampleCentre(def: TrackDef): { samples: CentreSample[]; features: Feature[]; length: number } {
  const samples: CentreSample[] = [];
  const features: Feature[] = [];
  let x = 0,
    z = 0,
    y = 0,
    heading = 0,
    xh = 0;
  let cornerN = 0;
  def.pieces.forEach((p, pi) => {
    const L = pieceLen(p);
    const n = Math.max(1, Math.ceil(L / stepFor(p)));
    const y0 = y;
    const x0 = x,
      z0 = z,
      h0 = heading;
    const turn = p.kind === "corner" ? Math.sign(p.angle) : 0;
    const R = p.kind === "corner" ? p.radius * M : 0;
    // Turn centre for corners.
    const cx = x0 + turn * R * -dsin(h0);
    const cz = z0 + turn * R * dcos(h0);
    for (let i = pi === 0 ? 0 : 1; i <= n; i++) {
      const t = (L * i) / n;
      let px: number, pz: number, hd: number;
      if (p.kind === "corner") {
        const phi = t / R;
        hd = h0 + turn * phi;
        // position = centre - turn * R * right(heading)
        px = cx - turn * R * -dsin(hd);
        pz = cz - turn * R * dcos(hd);
      } else {
        hd = h0;
        px = x0 + dcos(h0) * t;
        pz = z0 + dsin(h0) * t;
      }
      let bank = 0;
      if (p.kind === "corner" && p.bank) {
        const u = t / L;
        // The floor twists into the bank over 40% of the corner at each end. Any
        // faster and the floor rotates more than the car's 2.5 mm of ground
        // clearance across the chassis, and the tub digs in (real bank changes are long).
        const ramp = 0.4;
        bank = deg(p.bank) * smootherstep(Math.min(u / ramp, (1 - u) / ramp, 1));
      }
      // A bank pivots on the centre lane: the outer lane climbs, the inner one dips.
      // (Pivoting on the inside edge doubles the outer lane's climb into the bank
      // and launches cars at the top of it.) The track stands on legs, so the dip
      // never reaches the floor.
      samples.push({ x: px, y: y0 + pieceHeight(p, t), z: pz, heading: hd, bank, turn, xh: xh + t, piece: pi, t });
    }
    // Exact end state for the next piece.
    if (p.kind === "corner") {
      heading = h0 + turn * (L / R);
      x = cx - turn * R * -dsin(heading);
      z = cz - turn * R * dcos(heading);
    } else {
      x = x0 + dcos(h0) * L;
      z = z0 + dsin(h0) * L;
    }
    y = y0 + pieceHeight(p, L);
    const name =
      ("name" in p && p.name) ||
      (p.kind === "corner" ? `Turn ${++cornerN}` : p.kind === "lanechange" ? "Lane change" : p.kind === "dragon" ? "Dragon back" : p.kind === "wave" ? "Wave section" : p.kind === "slope" ? (p.rise > 0 ? "Climb" : "Descent") : "Straight");
    const kind: FeatureKind = p.kind === "corner" ? (p.bank ? "bank" : "corner") : p.kind;
    if (p.kind !== "straight") {
      features.push({ kind, name, start: xh, end: xh + L, jump: p.kind === "dragon" || p.kind === "lanechange" || p.kind === "wave" || (p.kind === "slope" && p.rise > 0) });
    }
    xh += L;
  });
  // Closure check: a track that doesn't meet itself can't be raced.
  const gap = Math.hypot(x, z, y);
  const turned = heading / (2 * Math.PI);
  if (gap > 1e-6 || Math.abs(Math.abs(turned) - 1) > 1e-9) {
    throw new Error(`Track ${def.id} does not close: gap ${gap.toFixed(6)} u, turned ${turned.toFixed(6)} turns`);
  }
  return { samples, features, length: xh };
}

/** Lane offset (u, + = right) and extra height for lane `i` at a centreline sample. */
function laneShape(def: TrackDef, lane: number, c: CentreSample): { off: number; lift: number } {
  if (def.lanes === 1) return { off: 0, lift: 0 };
  const base = (lane - 1) * LANE_PITCH;
  const p = def.pieces[c.piece];
  if (p.kind !== "lanechange") {
    // Past the lane changer each lane runs on in the position it changed into.
    const lc = def.pieces.findIndex((q) => q.kind === "lanechange");
    if (lc >= 0 && c.piece > lc) return { off: (nextLane(def, lane) - 1) * LANE_PITCH, lift: 0 };
    return { off: base, lift: 0 };
  }
  const t = c.t;
  if (lane === 2) {
    // The bridge lane: rightmost lane climbs, crosses left over the others, comes down.
    const lift = rounded(
      [
        [0, 0],
        [LC.bridgeUp[0], 0],
        [LC.bridgeUp[1], LC.height],
        [LC.bridgeDown[0], LC.height],
        [LC.bridgeDown[1], 0],
        [LC.len, 0],
      ],
      LC.round,
      t,
    );
    const k = smootherstep((t - LC.bridgeShift[0]) / (LC.bridgeShift[1] - LC.bridgeShift[0]));
    return { off: base - 2 * LANE_PITCH * k, lift };
  }
  const k = smootherstep((t - LC.groundShift[0]) / (LC.groundShift[1] - LC.groundShift[0]));
  return { off: base + LANE_PITCH * k, lift: 0 };
}

/** Lane `i` continues as lane next(i) after the start line. */
function nextLane(def: TrackDef, lane: number): number {
  if (def.lanes === 1) return 0;
  return def.pieces.some((p) => p.kind === "lanechange") ? (lane + 1) % 3 : lane;
}

const memo = new Map<string, TrackGeo>();

export function buildTrack(def: TrackDef): TrackGeo {
  const cached = memo.get(def.id);
  if (cached && cached.def === def) return cached;
  const { samples: centre, features, length } = sampleCentre(def);
  const lanes = def.lanes;
  const strips: Strip[] = [];

  // Frames per lane: lane centre, forward, up, right.
  for (let lane = 0; lane < lanes; lane++) {
    const n = centre.length;
    const data = new Float64Array(n * SAMPLE_STRIDE);
    const px = new Float64Array(n),
      py = new Float64Array(n),
      pz = new Float64Array(n);
    // First pass: positions.
    for (let k = 0; k < n; k++) {
      const c = centre[k];
      const { off, lift } = laneShape(def, lane, c);
      // Base frame from heading, bank (pitch handled from neighbouring points below).
      const rx = -dsin(c.heading),
        rz = dcos(c.heading);
      const cb = dcos(c.bank),
        sb = dsin(c.bank);
      // Banked right vector: tilt so the inside of the turn is lower.
      // up_b = cb*Y + sb*inside, inside = turn*right ; right_b = cb*right - sb*turn*Y
      const brx = cb * rx,
        bry = -sb * c.turn,
        brz = cb * rz;
      const ux = sb * c.turn * rx,
        uy = cb,
        uz = sb * c.turn * rz;
      px[k] = c.x + brx * off + ux * lift;
      py[k] = c.y + bry * off + uy * lift;
      pz[k] = c.z + brz * off + uz * lift;
    }
    // Second pass: frames from the actual lane path (so slopes, lane shifts and the
    // bridge all tilt the walls correctly).
    let s = 0;
    for (let k = 0; k < n; k++) {
      const a = Math.max(0, k - 1),
        b = Math.min(n - 1, k + 1);
      let fx = px[b] - px[a],
        fy = py[b] - py[a],
        fz = pz[b] - pz[a];
      const fl = Math.sqrt(fx * fx + fy * fy + fz * fz) || 1;
      fx /= fl;
      fy /= fl;
      fz /= fl;
      const c = centre[k];
      // Desired up from bank, then orthogonalised against forward.
      const rx0 = -dsin(c.heading),
        rz0 = dcos(c.heading);
      const sb = dsin(c.bank),
        cb = dcos(c.bank);
      let ux = sb * c.turn * rx0,
        uy = cb,
        uz = sb * c.turn * rz0;
      const d = ux * fx + uy * fy + uz * fz;
      ux -= d * fx;
      uy -= d * fy;
      uz -= d * fz;
      const ul = Math.sqrt(ux * ux + uy * uy + uz * uz) || 1;
      ux /= ul;
      uy /= ul;
      uz /= ul;
      // right = forward x up
      const rx = fy * uz - fz * uy,
        ry = fz * ux - fx * uz,
        rz = fx * uy - fy * ux;
      if (k > 0) {
        const dx = px[k] - px[k - 1],
          dy = py[k] - py[k - 1],
          dz = pz[k] - pz[k - 1];
        s += Math.sqrt(dx * dx + dy * dy + dz * dz);
      }
      const o = k * SAMPLE_STRIDE;
      data[o] = px[k];
      data[o + 1] = py[k];
      data[o + 2] = pz[k];
      data[o + 3] = fx;
      data[o + 4] = fy;
      data[o + 5] = fz;
      data[o + 6] = ux;
      data[o + 7] = uy;
      data[o + 8] = uz;
      data[o + 9] = rx;
      data[o + 10] = ry;
      data[o + 11] = rz;
      data[o + 12] = s;
      data[o + 13] = c.xh;
    }
    strips.push({ data, count: n, next: nextLane(def, lane), length: s });
  }

  // Make each strip's last frame exactly the first frame of the strip it joins, so
  // the seams in the collider are watertight.
  for (const st of strips) {
    const nx = strips[st.next];
    const last = (st.count - 1) * SAMPLE_STRIDE;
    for (let j = 0; j < 12; j++) st.data[last + j] = nx.data[j];
  }

  const mesh = sweepMesh(strips);
  const pillars = bridgePillars(def, strips, centre);
  let minX = Infinity,
    maxX = -Infinity,
    minZ = Infinity,
    maxZ = -Infinity,
    maxY = 0;
  for (let i = 0; i < mesh.positions.length; i += 3) {
    minX = Math.min(minX, mesh.positions[i]);
    maxX = Math.max(maxX, mesh.positions[i]);
    maxY = Math.max(maxY, mesh.positions[i + 1]);
    minZ = Math.min(minZ, mesh.positions[i + 2]);
    maxZ = Math.max(maxZ, mesh.positions[i + 2]);
  }
  const geo: TrackGeo = {
    def,
    strips,
    features,
    centreLength: length,
    positions: mesh.positions,
    indices: mesh.indices,
    stripVertexRanges: mesh.ranges,
    pillars,
    bounds: { minX, maxX, minZ, maxZ, maxY },
  };
  memo.set(def.id, geo);
  return geo;
}

const FLOOR_THICK = 0.05;
/** The track stands on legs this high above the room floor, u (100 mm). */
export const TRACK_STAND = 1.0;

/**
 * Sweep the lane cross-section along every strip. The cross-section is a closed
 * U-channel (outer wall, wall top, inner wall, floor, ...), wound outward.
 */
function sweepMesh(strips: Strip[]): { positions: Float32Array; indices: Uint32Array; ranges: [number, number][] } {
  const hw = LANE_WIDTH / 2;
  // (lateral, up) around the channel, counter-clockwise seen from behind (looking along +forward).
  const profile: [number, number][] = [
    [-hw - WALL_THICK, -FLOOR_THICK],
    [hw + WALL_THICK, -FLOOR_THICK],
    [hw + WALL_THICK, WALL_HEIGHT],
    [hw, WALL_HEIGHT],
    [hw, 0],
    [-hw, 0],
    [-hw, WALL_HEIGHT],
    [-hw - WALL_THICK, WALL_HEIGHT],
  ];
  const P = profile.length;
  let total = 0;
  for (const st of strips) total += st.count;
  const positions = new Float32Array(total * P * 3);
  const idx: number[] = [];
  const ranges: [number, number][] = [];
  let v = 0;
  for (const st of strips) {
    const start = v;
    for (let k = 0; k < st.count; k++) {
      const o = k * SAMPLE_STRIDE;
      const d = st.data;
      for (const [lat, up] of profile) {
        positions[v * 3] = d[o] + d[o + 9] * lat + d[o + 6] * up;
        positions[v * 3 + 1] = d[o + 1] + d[o + 10] * lat + d[o + 7] * up;
        positions[v * 3 + 2] = d[o + 2] + d[o + 11] * lat + d[o + 8] * up;
        v++;
      }
    }
    for (let k = 0; k < st.count - 1; k++) {
      const a = start + k * P;
      const b = a + P;
      for (let j = 0; j < P; j++) {
        const j2 = (j + 1) % P;
        // Quad (a+j, a+j2, b+j2, b+j), wound so the normal faces out of the channel material.
        idx.push(a + j, b + j, b + j2, a + j, b + j2, a + j2);
      }
    }
    ranges.push([start, v]);
  }
  return { positions, indices: new Uint32Array(idx), ranges };
}

function bridgePillars(def: TrackDef, strips: Strip[], centre: CentreSample[]): TrackGeo["pillars"] {
  if (def.lanes !== 3) return [];
  const out: TrackGeo["pillars"] = [];
  const bridge = strips[2];
  let lastXh = -Infinity;
  for (let k = 0; k < bridge.count; k++) {
    const c = centre[k];
    const p = def.pieces[c.piece];
    if (p.kind !== "lanechange") continue;
    if (c.t < LC.bridgeUp[1] || c.t > LC.bridgeDown[0] || c.xh - lastXh < 3) continue;
    lastXh = c.xh;
    const o = k * SAMPLE_STRIDE;
    out.push({ x: bridge.data[o], y: bridge.data[o + 1], z: bridge.data[o + 2], h: bridge.data[o + 1] });
  }
  return out;
}

/** A lane frame at a strip index (for placing cars and cameras). */
export function frameAt(st: Strip, k: number) {
  const o = Math.max(0, Math.min(st.count - 1, k)) * SAMPLE_STRIDE;
  const d = st.data;
  return {
    p: { x: d[o], y: d[o + 1], z: d[o + 2] },
    f: { x: d[o + 3], y: d[o + 4], z: d[o + 5] },
    u: { x: d[o + 6], y: d[o + 7], z: d[o + 8] },
    r: { x: d[o + 9], y: d[o + 10], z: d[o + 11] },
    s: d[o + 12],
    xh: d[o + 13],
  };
}

export interface LanePos {
  k: number; // segment index (between sample k and k+1)
  s: number; // arc length along the strip
  lateral: number; // u right of lane centre
  vertical: number; // u above the floor
  dist: number; // distance from the lane-centre line
  xh: number;
}

/**
 * Locate a point relative to a strip, searching segments near `hint` first. Returns
 * the nearest point on the lane-centre polyline.
 */
export function locate(st: Strip, x: number, y: number, z: number, hint: number, back = 3, ahead = 40): LanePos {
  const d = st.data;
  let best: LanePos | null = null;
  let bestD2 = Infinity;
  const lo = Math.max(0, hint - back);
  const hi = Math.min(st.count - 2, hint + ahead);
  for (let k = lo; k <= hi; k++) {
    const o = k * SAMPLE_STRIDE;
    const o2 = o + SAMPLE_STRIDE;
    const ax = d[o],
      ay = d[o + 1],
      az = d[o + 2];
    const sx = d[o2] - ax,
      sy = d[o2 + 1] - ay,
      sz = d[o2 + 2] - az;
    const len2 = sx * sx + sy * sy + sz * sz || 1e-9;
    let t = ((x - ax) * sx + (y - ay) * sy + (z - az) * sz) / len2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const qx = ax + sx * t,
      qy = ay + sy * t,
      qz = az + sz * t;
    const dx = x - qx,
      dy = y - qy,
      dz = z - qz;
    const d2 = dx * dx + dy * dy + dz * dz;
    if (d2 < bestD2) {
      bestD2 = d2;
      // Interpolated frame for lateral/vertical.
      const ux = d[o + 6] + (d[o2 + 6] - d[o + 6]) * t,
        uy = d[o + 7] + (d[o2 + 7] - d[o + 7]) * t,
        uz = d[o + 8] + (d[o2 + 8] - d[o + 8]) * t;
      const rx = d[o + 9] + (d[o2 + 9] - d[o + 9]) * t,
        ry = d[o + 10] + (d[o2 + 10] - d[o + 10]) * t,
        rz = d[o + 11] + (d[o2 + 11] - d[o + 11]) * t;
      best = {
        k,
        s: d[o + 12] + (d[o2 + 12] - d[o + 12]) * t,
        lateral: dx * rx + dy * ry + dz * rz,
        vertical: dx * ux + dy * uy + dz * uz,
        dist: Math.sqrt(d2),
        xh: d[o + 13] + (d[o2 + 13] - d[o + 13]) * t,
      };
    }
  }
  return best!;
}
