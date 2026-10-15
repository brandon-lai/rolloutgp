// Race formats: heat, time trial, endurance and the elimination cup. Each turns
// the player's build and a track into a RaceConfig for the simulation.

import type { Build } from "../sim/build.ts";
import type { Entry, RaceConfig } from "../sim/race.ts";
import { motorSeedFor } from "../sim/race.ts";
import type { TrackDef } from "../sim/track/geometry.ts";
import { SUNDAY, BANK, GRAND, DRAGON, trackById } from "../sim/tracks.ts";
import { RIVALS, RIVAL_PIT_VOLTS, rivalBuild, rivalsFor, type Rival } from "./rivals.ts";
import type { Ghost } from "../store/profile.ts";

export type Format = "heat" | "trial" | "endurance" | "cup";

export const FORMATS: { id: Format; name: string; blurb: string; tests: string }[] = [
  { id: "heat", name: "Heat", blurb: "Three cars, one per lane, three laps. Every car runs every lane.", tests: "A balanced build" },
  { id: "trial", name: "Time trial", blurb: "Solo, three laps, against medal times and your own ghost.", tests: "Raw setup" },
  { id: "endurance", name: "Endurance", blurb: "24 laps with heavy battery drain and one battery swap. You call the pit stop.", tests: "Efficiency and durability" },
  { id: "cup", name: "Elimination cup", blurb: "Three rounds on three tracks. Top two go through. Retune between rounds.", tests: "Adapting setups between rounds" },
];

export const PLAYER_ID = "you";
export const PLAYER_COLOR = "#ffffff";

export function playerEntry(build: Build, owner: string, lane: number): Entry {
  return { id: PLAYER_ID, name: "You", build, lane, motorSeed: motorSeedFor(owner, build.motor), color: PLAYER_COLOR };
}

function rivalEntry(r: Rival, tier: 1 | 2 | 3 | 4, lane: number, pit = false): Entry {
  return {
    id: r.id,
    name: r.name,
    build: rivalBuild(r, tier),
    lane,
    motorSeed: 1000 + RIVALS.indexOf(r),
    color: r.color,
    pitBelowVolts: pit ? RIVAL_PIT_VOLTS : undefined,
  };
}

export function heatConfig(build: Build, owner: string, track: TrackDef, seed: number, tier?: 1 | 2 | 3 | 4): RaceConfig {
  const t = tier ?? (track.difficulty as 1 | 2 | 3 | 4);
  const [a, b] = rivalsFor(track.difficulty, seed);
  const playerLane = seed % 3;
  const lanes = [0, 1, 2].filter((l) => l !== playerLane);
  return {
    track,
    entries: [playerEntry(build, owner, playerLane), rivalEntry(a, t, lanes[0]), rivalEntry(b, t, lanes[1])],
    laps: track.laps,
    format: "heat",
    seed,
    maxTime: 120,
  };
}

export function trialConfig(build: Build, owner: string, track: TrackDef, seed: number): RaceConfig {
  return { track, entries: [playerEntry(build, owner, 0)], laps: track.laps, format: "trial", seed, maxTime: 120 };
}

/** A ghost is just a stored build + seed, re-simulated alongside you. */
export function ghostConfig(g: Ghost, owner: string, track: TrackDef): RaceConfig {
  return { track, entries: [{ ...playerEntry(g.build, owner, g.lane), id: "ghost", name: "Ghost" }], laps: track.laps, format: "trial", seed: g.seed, maxTime: 120 };
}

export const ENDURANCE = {
  laps: 24,
  /** Compresses an hour of battery into a few minutes (game value). */
  drain: 55,
};

export function enduranceConfig(build: Build, owner: string, track: TrackDef, seed: number): RaceConfig {
  const [a, b] = rivalsFor(track.difficulty, seed + 1);
  const t = Math.max(1, Math.min(4, track.difficulty)) as 1 | 2 | 3 | 4;
  return {
    track,
    entries: [playerEntry(build, owner, 0), rivalEntry(a, t, 1, true), rivalEntry(b, t, 2, true)],
    laps: ENDURANCE.laps,
    format: "endurance",
    seed,
    drain: ENDURANCE.drain,
    pitStops: 1,
    maxTime: 600,
  };
}

export interface CupState {
  round: number; // 0-based
  results: { track: string; place: number; time: number | null }[];
  seed: number;
}

export const CUP_ROUNDS: { track: TrackDef; tier: 1 | 2 | 3 | 4; advance: number }[] = [
  { track: SUNDAY, tier: 2, advance: 2 },
  { track: BANK, tier: 3, advance: 2 },
  { track: GRAND, tier: 4, advance: 1 },
];

export function cupConfig(build: Build, owner: string, cup: CupState): RaceConfig {
  const round = CUP_ROUNDS[cup.round];
  return { ...heatConfig(build, owner, round.track, cup.seed + cup.round * 7, round.tier), format: "cup" };
}

export const TRACK_ORDER = [SUNDAY, DRAGON, BANK, GRAND];

export function trackOrDefault(id: string | null | undefined): TrackDef {
  return (id && trackById(id)) || SUNDAY;
}
