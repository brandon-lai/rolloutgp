// The city: one hand-built district of nine blocks on a street grid, plus the
// street courses that run through it. Pure data and arithmetic, shared by the
// car's physics (in the worker), the runner's physics and the renderer.
//
// Everything here is in metres; convert with SCALE for the sim.
//
// Layout: blocks are 44 m squares (2.5 m of sidewalk round the edge), streets
// are 14 m wide. Block centres sit at -58, 0, +58 on each axis; street
// centrelines at +-29 (between blocks) and +-87 (the outer ring).

import { rng } from "../sim/rng.ts";
import type { Piece, TrackDef } from "../sim/track/geometry.ts";

export const BLOCK = 44;
export const STREET = 14;
export const PITCH = BLOCK + STREET; // 58
export const SIDEWALK = 2.5;
export const CURB = 0.12;
export const LINES = [-87, -29, 29, 87];

export type BoxKind = "building" | "sidewalk" | "ground" | "prop" | "roof" | "ramp" | "wall";

export interface Box {
  kind: BoxKind;
  /** Centre, m. */
  x: number;
  y: number;
  z: number;
  /** Half extents, m. */
  hx: number;
  hy: number;
  hz: number;
  /** Rotation about x (ramps tilt along z) and y, radians. */
  rx?: number;
  ry?: number;
  color: number;
  /** Building facade style (window pattern), 0..3. */
  style?: number;
  /** Runner-only (car ignores): stair ramps, invisible helpers. */
  runnerOnly?: boolean;
  /** Visual-only (no collision). */
  visualOnly?: boolean;
}

const FACADE = [0xe9d8c2, 0xc8d3df, 0xd9a48f, 0xb7c9a8, 0xf0e2a8, 0xa9b4c8, 0xe6c3d0, 0xcfcfcf];

/** Sunken market plaza in the east block (x 46..70, z -12..12, 0.6 m deep). */
export const PIT = { x0: 46, x1: 70, z0: -12, z1: 12, depth: 0.6 };

let cache: Box[] | null = null;

export function cityBoxes(): Box[] {
  if (cache) return cache;
  const out: Box[] = [];
  const R = rng(20261014);
  const box = (b: Box) => out.push(b);

  // Ground: one huge slab, split round the plaza pit.
  const G = 200;
  const pit = PIT;
  box({ kind: "ground", x: 0, y: -0.5, z: -(G + 0) / 2 + pit.z0 / 2 - 0, hx: G, hy: 0.5, hz: (G + pit.z0) / 2, color: 0x4a4f59 });
  box({ kind: "ground", x: 0, y: -0.5, z: (G + pit.z1) / 2, hx: G, hy: 0.5, hz: (G - pit.z1) / 2, color: 0x4a4f59 });
  box({ kind: "ground", x: (-G + pit.x0) / 2, y: -0.5, z: (pit.z0 + pit.z1) / 2, hx: (G + pit.x0) / 2, hy: 0.5, hz: (pit.z1 - pit.z0) / 2, color: 0x4a4f59 });
  box({ kind: "ground", x: (G + pit.x1) / 2, y: -0.5, z: (pit.z0 + pit.z1) / 2, hx: (G - pit.x1) / 2, hy: 0.5, hz: (pit.z1 - pit.z0) / 2, color: 0x4a4f59 });
  box({ kind: "ground", x: (pit.x0 + pit.x1) / 2, y: -pit.depth - 0.5, z: (pit.z0 + pit.z1) / 2, hx: (pit.x1 - pit.x0) / 2, hy: 0.5, hz: (pit.z1 - pit.z0) / 2, color: 0x8a7f6e });

  for (const bi of [-1, 0, 1])
    for (const bj of [-1, 0, 1]) {
      const cx = bi * PITCH,
        cz = bj * PITCH;
      const half = BLOCK / 2;
      const plaza = bi === 1 && bj === 0;
      // Sidewalk ring (four strips), except where the plaza opens to the streets.
      const sw = (x: number, z: number, hx: number, hz: number) => box({ kind: "sidewalk", x, y: CURB / 2, z, hx, hy: CURB / 2, hz, color: 0xb9b6ae });
      if (!plaza) {
        sw(cx, cz - half + SIDEWALK / 2, half, SIDEWALK / 2);
        sw(cx, cz + half - SIDEWALK / 2, half, SIDEWALK / 2);
        sw(cx - half + SIDEWALK / 2, cz, SIDEWALK / 2, half - SIDEWALK);
        sw(cx + half - SIDEWALK / 2, cz, SIDEWALK / 2, half - SIDEWALK);
      } else {
        // Plaza: sidewalks only on the north and south edges (the course runs through east-west).
        sw(cx, cz - half + SIDEWALK / 2, half, SIDEWALK / 2);
        sw(cx, cz + half - SIDEWALK / 2, half, SIDEWALK / 2);
      }

      const inner = half - SIDEWALK - 0.5;
      if (plaza) {
        // Buildings along the north and south edges, shops facing the plaza.
        for (const side of [-1, 1]) {
          for (let k = 0; k < 3; k++) {
            const w = 11 + R() * 2;
            const x = cx - inner + 7 + k * 14;
            const h = 6 + R() * 10;
            box({ kind: "building", x, y: h / 2, z: cz + side * (inner - 3.5), hx: w / 2 - 0.5, hy: h / 2, hz: 3.5, color: FACADE[Math.floor(R() * FACADE.length)], style: Math.floor(R() * 4) });
          }
        }
        // Low planters to vault.
        for (const side of [-1, 1]) box({ kind: "wall", x: cx, y: 0.45, z: cz + side * 13.5, hx: 9, hy: 0.45, hz: 0.4, color: 0x9a8f7f });
        continue;
      }

      const centre = bi === 0 && bj === 0;
      const warehouse = bi === 0 && bj === 1;
      if (centre) {
        // Four buildings with a cross of alleys: the runner's shortcut.
        const alley = 4;
        for (const sx of [-1, 1])
          for (const sz of [-1, 1]) {
            const w = inner - alley / 2;
            const h = 14 + R() * 18;
            box({ kind: "building", x: cx + sx * (alley / 2 + w / 2), y: h / 2, z: cz + sz * (alley / 2 + w / 2), hx: w / 2, hy: h / 2, hz: w / 2, color: FACADE[Math.floor(R() * FACADE.length)], style: Math.floor(R() * 4) });
          }
        // Crates and a dumpster in the alleys.
        box({ kind: "prop", x: cx + 1, y: 0.6, z: cz - 10, hx: 0.6, hy: 0.6, hz: 0.6, color: 0xb07a3c });
        box({ kind: "prop", x: cx - 1, y: 0.7, z: cz + 9, hx: 0.9, hy: 0.7, hz: 0.5, color: 0x2f6b3f });
        continue;
      }
      if (warehouse) {
        // A long low warehouse with a loading dock you can climb onto, and a
        // ramp up to its roof.
        const h = 5.5;
        box({ kind: "building", x: cx, y: h / 2, z: cz + 4, hx: inner, hy: h / 2, hz: inner - 6, color: 0x9fa7b3, style: 3 });
        box({ kind: "prop", x: cx, y: 0.6, z: cz - inner + 3, hx: inner - 6, hy: 0.6, hz: 2.4, color: 0x7d838c });
        // Crates up to the dock and the roof.
        box({ kind: "prop", x: cx - inner + 3, y: 0.55, z: cz - inner + 2, hx: 0.6, hy: 0.55, hz: 0.6, color: 0xb07a3c });
        box({ kind: "prop", x: cx + inner - 4, y: 2.0, z: cz - inner + 3.5, hx: 1.2, hy: 2.0, hz: 1.2, color: 0x6c5b45 });
        continue;
      }

      // Ordinary blocks: buildings round the edge with an alley through the middle.
      const ns = R() < 0.5;
      const alley = 3.5;
      for (const side of [-1, 1]) {
        const parts = 2 + Math.floor(R() * 2);
        const span = inner * 2;
        const depth = inner - alley / 2;
        for (let k = 0; k < parts; k++) {
          const len = span / parts;
          const h = 7 + R() * 22;
          const along = -inner + len * (k + 0.5);
          const across = side * (alley / 2 + depth / 2);
          const x = ns ? cx + across : cx + along;
          const z = ns ? cz + along : cz + across;
          const hx = ns ? depth / 2 : len / 2 - 0.3;
          const hz = ns ? len / 2 - 0.3 : depth / 2;
          box({ kind: "building", x, y: h / 2, z, hx, hy: h / 2, hz, color: FACADE[Math.floor(R() * FACADE.length)], style: Math.floor(R() * 4) });
        }
      }
      // Something to vault in the alley.
      box({ kind: "wall", x: cx, y: 0.5, z: cz, hx: ns ? 1.6 : 0.3, hy: 0.5, hz: ns ? 0.3 : 1.6, color: 0x8b8f96 });
    }

  // Street furniture: benches and bollards along the sidewalks.
  for (const x of LINES)
    for (let k = -2; k <= 2; k++) {
      if (R() < 0.45) continue;
      box({ kind: "prop", x: x + (R() < 0.5 ? -1 : 1) * (STREET / 2 + 1.2), y: 0.25, z: k * PITCH + 14, hx: 0.25, hy: 0.25, hz: 0.25, color: 0x3c4150 });
    }
  cache = out;
  return out;
}

/** Walkable slopes for the runner (the car's course has its own steps). Height runs h0 -> h1 along x. */
export interface Ramp {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  h0: number;
  h1: number;
}

export const RAMPS: Ramp[] = [
  // Steps down into the plaza on its west side, and a ramp out on the east.
  { x0: PIT.x0, x1: PIT.x0 + 5, z0: -5, z1: 5, h0: 0, h1: -PIT.depth },
  { x0: PIT.x1 - 6, x1: PIT.x1, z0: -5, z1: 5, h0: -PIT.depth, h1: 0 },
];

// ----- Street courses ----------------------------------------------------------

export const COURSE_LANE = 0.34; // m
export const COURSE_WALL = 0.08; // m
const R_CORNER = 5; // m, corner radius at intersections
const BOARD = 0.01; // the course boards sit 1 cm above the road

export interface CourseSegment {
  def: TrackDef;
  /** Segments this one leads to; two = a fork the runner can switch. */
  next: number[];
  /** For a fork, what each branch is called. */
  labels?: string[];
}

export interface CourseDef {
  id: string;
  name: string;
  blurb: string;
  laps: number;
  difficulty: 1 | 2 | 3;
  segments: CourseSegment[];
  /** Where the runner starts, m. */
  runnerStart: { x: number; z: number };
}

interface Feature {
  /** Index of the leg (between polyline points) the feature sits on. */
  leg: number;
  /** Distance from the leg's start point, m. */
  at: number;
  piece: Piece;
}

/**
 * Pieces for a path through the street grid: a polyline of orthogonal moves,
 * with 90-degree corners of radius R at each interior point, and features
 * dropped into the straights.
 */
function streetPieces(pts: [number, number][], features: Feature[] = [], startCorner = false, endCorner = false): Piece[] {
  const out: Piece[] = [];
  const dir = (a: [number, number], b: [number, number]) => [Math.sign(b[0] - a[0]), Math.sign(b[1] - a[1])];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i],
      b = pts[i + 1];
    const len = Math.abs(b[0] - a[0]) + Math.abs(b[1] - a[1]);
    const cornerAtStart = i > 0 || startCorner;
    const cornerAtEnd = i < pts.length - 2 || endCorner;
    let straight = len - (cornerAtStart ? R_CORNER : 0) - (cornerAtEnd ? R_CORNER : 0);
    const legStart = cornerAtStart ? R_CORNER : 0;
    const fs = features.filter((f) => f.leg === i).sort((p, q) => p.at - q.at);
    let pos = legStart;
    for (const f of fs) {
      const flen = "len" in f.piece ? f.piece.len : 0;
      const gap = f.at - pos;
      if (gap > 0.01) out.push({ kind: "straight", len: gap });
      out.push(f.piece);
      pos = f.at + flen;
      straight -= gap + flen;
    }
    if (straight > 0.01) out.push({ kind: "straight", len: straight });
    if (i < pts.length - 2) {
      const d0 = dir(a, b);
      const d1 = dir(b, pts[i + 2]);
      // Heading increases turning right (towards +z when heading +x): cross(d0, d1) > 0.
      const cross = d0[0] * d1[1] - d0[1] * d1[0];
      out.push({ kind: "corner", radius: R_CORNER, angle: cross > 0 ? 90 : -90 });
    }
  }
  return out;
}

function headingOf(a: [number, number], b: [number, number]): number {
  const dx = Math.sign(b[0] - a[0]),
    dz = Math.sign(b[1] - a[1]);
  return dx > 0 ? 0 : dx < 0 ? 180 : dz > 0 ? 90 : -90;
}

function seg(id: string, name: string, pts: [number, number][], y: number, features: Feature[] = []): TrackDef {
  return {
    id,
    name,
    blurb: "",
    lanes: 1,
    laps: 1,
    difficulty: 1,
    rewards: "",
    pieces: streetPieces(pts, features),
    laneWidth: COURSE_LANE,
    wallHeight: COURSE_WALL,
    start: { x: pts[0][0], y, z: pts[0][1], heading: headingOf(pts[0], pts[1]) },
    open: true,
  };
}

// Downtown Loop: round the centre block, with a fork at the north-east corner:
// turn right onto the east street with its ramp jump, or switch the car onto the
// long way round the east block: no jump, but half again as far, and away from
// your alley shortcut.
const DOWNTOWN: CourseDef = {
  id: "downtown",
  name: "Downtown Loop",
  blurb: "Round the central block. At the north-east corner the car takes the ramp jump unless you switch it onto the long way round.",
  laps: 3,
  difficulty: 1,
  runnerStart: { x: -24, z: -32 },
  segments: [
    // Start on the north street heading east, to the fork 12 m short of the corner.
    { def: seg("dt-0", "North street", [[-16, -29], [17, -29]], BOARD), next: [1, 2], labels: ["Ramp jump", "Long way"] },
    // Branch A: right at the corner, down the east street, right onto the south street.
    {
      def: seg("dt-a", "East street", [[17, -29], [29, -29], [29, 29], [24, 29]], BOARD, [{ leg: 1, at: 20, piece: { kind: "kicker", len: 5, rise: 0.3, ramp: 1.4, name: "Street ramp" } }]),
      next: [3],
    },
    // Branch B: straight on, round the east block, back along the south street.
    { def: seg("dt-b", "Long way", [[17, -29], [87, -29], [87, 29], [24, 29]], BOARD), next: [3] },
    // South street west, up the west street, back to the start.
    { def: seg("dt-3", "West side", [[24, 29], [-29, 29], [-29, -29], [-16, -29]], BOARD), next: [0] },
  ],
};

// Market Stairs: clockwise round the east block. At the fork on the west street
// the car can turn right through the sunken plaza (down a flight of steps, up a
// ramp) or stay on the street round the north side.
const MARKET: CourseDef = {
  id: "market",
  name: "Market Stairs",
  blurb: "Three laps round the east block. Switch the car down the plaza steps (shorter, and a big jump) or keep it on the street.",
  laps: 3,
  difficulty: 2,
  runnerStart: { x: 24, z: 25 },
  segments: [
    { def: seg("mk-0", "West street", [[29, 22], [29, 10]], BOARD), next: [1, 2], labels: ["Plaza steps", "Street"] },
    {
      def: seg(
        "mk-a",
        "Plaza",
        [
          [29, 10],
          [29, 0],
          [87, 0],
          [87, 12],
        ],
        BOARD,
        [
          { leg: 1, at: PIT.x0 - 29, piece: { kind: "stairs", len: 3, steps: 4, drop: -PIT.depth, name: "Plaza steps" } },
          { leg: 1, at: PIT.x1 - 29 - 7, piece: { kind: "slope", len: 7, rise: PIT.depth, name: "Plaza ramp" } },
        ],
      ),
      next: [3],
    },
    {
      def: seg(
        "mk-b",
        "North street",
        [
          [29, 10],
          [29, -29],
          [87, -29],
          [87, 12],
        ],
        BOARD,
      ),
      next: [3],
    },
    {
      def: seg(
        "mk-3",
        "South side",
        [
          [87, 12],
          [87, 29],
          [29, 29],
          [29, 22],
        ],
        BOARD,
      ),
      next: [0],
    },
  ],
};

// Dock Run: the outer ring past the warehouse, with a kicker ramp on the south
// avenue. No fork: just speed, a jump, and a long way round for the runner.
const DOCK: CourseDef = {
  id: "dock",
  name: "Dock Run",
  blurb: "Two big laps of the outer ring with a kicker jump on the south avenue. The car is faster than you on these straights: cut through the blocks.",
  laps: 2,
  difficulty: 3,
  runnerStart: { x: -84, z: -62 },
  segments: [
    {
      def: seg(
        "dk-0",
        "Outer ring",
        [
          [-87, -60],
          [-87, -87],
          [87, -87],
          [87, 87],
          [-87, 87],
          [-87, -60],
        ],
        BOARD,
        [{ leg: 3, at: 60, piece: { kind: "kicker", len: 6, rise: 0.35, ramp: 2.2, name: "Dock kicker" } }],
      ),
      next: [0],
    },
  ],
};

export const COURSES: CourseDef[] = [DOWNTOWN, MARKET, DOCK];

export function courseById(id: string): CourseDef | undefined {
  return COURSES.find((c) => c.id === id);
}

/** The course boards should sit at road height except inside the plaza pit. */
export function groundY(x: number, z: number): number {
  const p = PIT;
  if (x > p.x0 && x < p.x1 && z > p.z0 && z < p.z1) return -p.depth;
  return 0;
}
