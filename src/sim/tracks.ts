// The courses. Each is built from modular sections like a real kit track, in
// metres. Every 3-lane course has one lane changer, so over a 3-lap heat each car
// runs every lane once and covers exactly the same distance.

import type { Piece, TrackDef } from "./track/geometry.ts";
import { dcos, dsin, deg } from "./dmath.ts";

const R = 0.7; // standard corner radius at the centre lane, m

/**
 * Lengthen or shorten two straights (indices `a` and `b`, not parallel) so the
 * loop meets itself exactly. Lets a layout be authored by feel.
 */
function closeLoop(pieces: Piece[], a: number, b: number): Piece[] {
  const walk = (ps: Piece[]) => {
    let x = 0,
      z = 0,
      h = 0;
    const headings: number[] = [];
    for (const p of ps) {
      headings.push(h);
      if (p.kind === "corner") {
        const r = p.radius;
        const turn = Math.sign(p.angle);
        const cx = x + turn * r * -dsin(h),
          cz = z + turn * r * dcos(h);
        h += deg(p.angle);
        x = cx - turn * r * -dsin(h);
        z = cz - turn * r * dcos(h);
      } else {
        const L = p.kind === "lanechange" ? 3.4 : p.len;
        x += dcos(h) * L;
        z += dsin(h) * L;
      }
    }
    return { x, z, headings };
  };
  const { x, z, headings } = walk(pieces);
  const ax = dcos(headings[a]),
    az = dsin(headings[a]);
  const bx = dcos(headings[b]),
    bz = dsin(headings[b]);
  // Solve ax*da + bx*db = -x ; az*da + bz*db = -z
  const det = ax * bz - az * bx;
  const da = (-x * bz + z * bx) / det;
  const db = (-z * ax + x * az) / det;
  const out = pieces.map((p) => ({ ...p })) as Piece[];
  const pa = out[a],
    pb = out[b];
  if (pa.kind !== "straight" || pb.kind !== "straight") throw new Error("closeLoop needs straights");
  pa.len += da;
  pb.len += db;
  if (pa.len < 0.2 || pb.len < 0.2) throw new Error(`closeLoop: straights too short (${pa.len}, ${pb.len})`);
  return out;
}

export const PRACTICE: TrackDef = {
  id: "practice",
  name: "Practice lane",
  blurb: "One lane, one straight, two corners and one jump. Try a setup here before you race it.",
  lanes: 1,
  laps: 3,
  difficulty: 1,
  rewards: "A quick read on top speed, corner speed and jump control.",
  pieces: [
    { kind: "straight", len: 2.4 },
    { kind: "corner", radius: 0.6, angle: 180 },
    { kind: "straight", len: 0.6 },
    { kind: "dragon", len: 1.4, rise: 0.09, name: "Test jump" },
    { kind: "straight", len: 0.4 },
    { kind: "corner", radius: 0.6, angle: 180 },
  ],
};

export const SUNDAY: TrackDef = {
  id: "sunday",
  name: "Sunday Oval",
  blurb: "The shop's beginner track. A gentle climb, a lane changer, four corners.",
  lanes: 3,
  laps: 3,
  difficulty: 1,
  rewards: "Almost anything finishes. Top speed wins.",
  pieces: [
    { kind: "straight", len: 1.0 },
    { kind: "lanechange", len: 3.4 },
    { kind: "straight", len: 1.0 },
    { kind: "corner", radius: R, angle: 90 },
    { kind: "straight", len: 1.2 },
    { kind: "corner", radius: R, angle: 90 },
    { kind: "straight", len: 1.0 },
    { kind: "slope", len: 1.2, rise: 0.12 },
    { kind: "straight", len: 1.0 },
    { kind: "slope", len: 1.2, rise: -0.12 },
    { kind: "straight", len: 1.0 },
    { kind: "corner", radius: R, angle: 90 },
    { kind: "straight", len: 1.2 },
    { kind: "corner", radius: R, angle: 90 },
  ],
};

export const DRAGON: TrackDef = {
  id: "dragon",
  name: "Dragon Hill",
  blurb: "A dragon-back jump right before a corner, and a big climb on the far side.",
  lanes: 3,
  laps: 3,
  difficulty: 2,
  rewards: "Speed you can land. A car still in the air at Turn 1 is gone.",
  pieces: [
    { kind: "straight", len: 0.8 },
    { kind: "lanechange", len: 3.4 },
    { kind: "straight", len: 0.6 },
    { kind: "dragon", len: 1.6, rise: 0.08 },
    { kind: "straight", len: 0.6 },
    { kind: "corner", radius: R, angle: 90 },
    { kind: "straight", len: 2.0 },
    { kind: "corner", radius: R, angle: 90 },
    { kind: "straight", len: 0.8 },
    { kind: "slope", len: 1.4, rise: 0.18, name: "Big climb" },
    { kind: "straight", len: 1.2, },
    { kind: "slope", len: 1.4, rise: -0.18, name: "Big drop" },
    { kind: "straight", len: 2.2 },
    { kind: "corner", radius: R, angle: 90 },
    { kind: "straight", len: 2.0 },
    { kind: "corner", radius: R, angle: 90 },
  ],
};

export const BANK: TrackDef = {
  id: "bank",
  name: "Bank Run",
  blurb: "An 18° banked hairpin, a wave section, and two tight corners.",
  lanes: 3,
  laps: 3,
  difficulty: 3,
  rewards: "Cornering and a settled car. Bouncy cars lose time on the waves.",
  pieces: [
    { kind: "straight", len: 1.0 },
    { kind: "lanechange", len: 3.4 },
    { kind: "straight", len: 1.6 },
    { kind: "corner", radius: 0.8, angle: 180, bank: 18, name: "The Bank" },
    { kind: "straight", len: 0.8 },
    { kind: "wave", len: 2.4, bumps: 3, amp: 0.015 },
    { kind: "straight", len: 0.6 },
    { kind: "dragon", len: 1.4, rise: 0.07 },
    { kind: "straight", len: 0.8 },
    { kind: "corner", radius: 0.6, angle: 90 },
    { kind: "straight", len: 0.4 },
    { kind: "corner", radius: 0.6, angle: 90 },
  ],
};

export const GRAND: TrackDef = {
  id: "grand",
  name: "Grand Circuit",
  blurb: "The cup course. Long straights, an S-bend, the bank, the waves, a dragon back and a big hill.",
  lanes: 3,
  laps: 3,
  difficulty: 4,
  rewards: "Everything. Builds that are only fast, or only safe, lose here.",
  pieces: closeLoop(
    [
      { kind: "straight", len: 1.5 },
      { kind: "lanechange", len: 3.4 },
      { kind: "straight", len: 2.0 },
      { kind: "corner", radius: R, angle: 90 },
      { kind: "straight", len: 0.8 },
      { kind: "dragon", len: 1.6, rise: 0.08 },
      { kind: "straight", len: 0.8 },
      { kind: "corner", radius: R, angle: 90 },
      { kind: "straight", len: 1.0 },
      { kind: "corner", radius: 0.6, angle: -90, name: "S-bend left" },
      { kind: "straight", len: 0.8 },
      { kind: "corner", radius: 0.6, angle: 90, name: "S-bend right" },
      { kind: "wave", len: 2.4, bumps: 3, amp: 0.014 },
      { kind: "straight", len: 2.0 },
      { kind: "corner", radius: 1.0, angle: 90, bank: 15, name: "The Bank" },
      { kind: "straight", len: 0.8 },
      { kind: "slope", len: 1.2, rise: 0.18, name: "Big climb" },
      { kind: "straight", len: 0.8 },
      { kind: "slope", len: 1.2, rise: -0.18, name: "Big drop" },
      { kind: "straight", len: 2.0 },
      { kind: "corner", radius: R, angle: 90 },
    ],
    13,
    19,
  ),
};

export const TRACKS: TrackDef[] = [SUNDAY, DRAGON, BANK, GRAND];
export const ALL_TRACKS: TrackDef[] = [PRACTICE, ...TRACKS];

export function trackById(id: string): TrackDef | undefined {
  return ALL_TRACKS.find((t) => t.id === id);
}
