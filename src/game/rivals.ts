// Opponents are just other builds: nobody steers, so there is no driving AI.
// Three rivals, each with a build philosophy that maps to the real choice
// between top speed and cornering (the show's two brothers), plus an all-rounder.

import { STARTER_BUILD, type Build } from "../sim/build.ts";
import { presetById } from "../sim/bodies.ts";
import type { BodyRecipe } from "../sim/body.ts";

export interface Rival {
  id: string;
  name: string;
  color: string;
  style: string;
  /** Builds for difficulty tiers 1..4. */
  tiers: Record<1 | 2 | 3 | 4, Partial<Build>>;
  body: string;
  paint: [string, string];
}

const bb = (roller: string, front = "st-f-narrow", rear = "st-r-narrow") => ({ roller, front, rear, side: null });

export const RIVALS: Rival[] = [
  {
    id: "taku",
    name: "Taku",
    color: "#e8402a",
    style: "Top speed. Lowest gears in the box, hope for the best on the jumps.",
    body: "arrow",
    paint: ["#e8402a", "#111111"],
    tiers: {
      1: { motor: "mo-rev", gear: "ge-4" },
      2: { motor: "mo-rev", gear: "ge-37", rollers: bb("ro-13b") },
      3: { motor: "mo-turbo", gear: "ge-4", rollers: bb("ro-13b"), brakes: { part: "br-medium", position: "rear", gap: 1 } },
      4: { motor: "mo-turbo", gear: "ge-42", rollers: bb("ro-19b", "st-f-wide", "st-r-wide"), bearings: "be-ball", brakes: { part: "br-medium", position: "rear", gap: 1 }, dampers: { part: "da-slim", mount: "rear" } },
    },
  },
  {
    id: "rina",
    name: "Rina",
    color: "#1f9bd1",
    style: "Cornering. Hard tires, wide bearing rollers, never flies off.",
    body: "shark",
    paint: ["#1f9bd1", "#e8f4fb"],
    tiers: {
      1: { motor: "mo-torque", gear: "ge-4", tires: "ti-hard-low" },
      2: { motor: "mo-balance", gear: "ge-4", tires: "ti-arched", rollers: bb("ro-13b") },
      3: { motor: "mo-spark", gear: "ge-4", tires: "ti-arched", rollers: bb("ro-19b", "st-f-wide", "st-r-wide"), dampers: { part: "da-cyl", mount: "rear" } },
      4: { motor: "mo-turbo", gear: "ge-42", tires: "ti-arched", rollers: bb("ro-19b", "st-f-wide", "st-r-wide"), dampers: { part: "da-cyl", mount: "rear" }, brakes: { part: "br-medium", position: "rear", gap: 1 }, bearings: "be-ball-grease" },
    },
  },
  {
    id: "oda",
    name: "Mr. Oda",
    color: "#ffd23f",
    style: "The shop owner. Sensible, balanced, annoyingly consistent.",
    body: "comet",
    paint: ["#ffd23f", "#7b2cbf"],
    tiers: {
      1: { motor: "mo-balance", gear: "ge-5" },
      2: { motor: "mo-balance", gear: "ge-4", rollers: bb("ro-13p"), bearings: "be-brass" },
      3: { motor: "mo-spark", gear: "ge-4", rollers: bb("ro-13b"), bearings: "be-ball", dampers: { part: "da-slim", mount: "rear" } },
      4: { motor: "mo-turbo", gear: "ge-42", rollers: bb("ro-17b", "st-f-wide", "st-r-wide"), bearings: "be-ball", dampers: { part: "da-cyl", mount: "rear" }, brakes: { part: "br-light", position: "both", gap: 1 } },
    },
  },
];

export function rivalBuild(r: Rival, tier: 1 | 2 | 3 | 4): Build {
  const preset = presetById(r.body);
  const body: BodyRecipe = preset
    ? { ...preset.recipe, paint: { ...preset.recipe.paint, base: r.paint[0], base2: r.paint[1] } }
    : STARTER_BUILD.body;
  return { ...STARTER_BUILD, name: `${r.name}'s car`, ...r.tiers[tier], body };
}

/** The two rivals for a heat (their builds come from the track's difficulty tier). */
export function rivalsFor(_difficulty: number, seed: number): Rival[] {
  const i = seed % RIVALS.length;
  return [RIVALS[i], RIVALS[(i + 1) % RIVALS.length]];
}

export const RIVAL_PIT_VOLTS = 2.42;
