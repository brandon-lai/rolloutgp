// The player's save: tokens, owned parts and bodies, garage builds, ghosts and
// settings. Progression is earned by racing; there is nothing to buy with money.

import { STARTER_BUILD, partsInBuild, sanitizeBuild, type Build } from "../sim/build.ts";
import { ALL_PARTS, STARTER_PARTS, part } from "../sim/parts.ts";
import { BODY_PRESETS, presetById } from "../sim/bodies.ts";
import { sanitizeRecipe, type BodyRecipe } from "../sim/body.ts";
import { DEFAULT_BODY } from "../sim/bodies.ts";

export interface Settings {
  /** Field of view in city mode, degrees. */
  fov: number;
  headBob: boolean;
  vignette: boolean;
  cityView: "first" | "third" | "drone";
  /** The cheer boost (a small, short voltage bump while in range). */
  cheer: boolean;
  volume: number; // 0..1
  quality: "high" | "low";
  /** Regulation (Tamiya limits) or open class in the garage. */
  regulation: boolean;
  mouseSensitivity: number;
}

export interface Ghost {
  time: number;
  build: Build;
  seed: number;
  lane: number;
  at: string;
}

export interface Profile {
  v: 1;
  /** Random id: seeds each owned motor's sample spread, so your car is repeatable. */
  owner: string;
  tokens: number;
  owned: string[];
  bodies: string[];
  builds: Build[];
  active: number;
  designs: BodyRecipe[];
  ghosts: Record<string, Ghost>;
  /** Time-trial medals earned per track: 0 none .. 3 gold. */
  medals: Record<string, number>;
  cups: string[];
  city: Record<string, { score: number; time: number }>;
  stats: { races: number; wins: number; courseOuts: number; cityRuns: number };
  settings: Settings;
  seenIntro: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  fov: 75,
  headBob: true,
  vignette: true,
  cityView: "first",
  cheer: true,
  volume: 0.7,
  quality: "high",
  regulation: true,
  mouseSensitivity: 1,
};

export const STARTING_TOKENS = 150;
export const MAX_BUILDS = 6;

export function newProfile(owner = randomId()): Profile {
  return {
    v: 1,
    owner,
    tokens: STARTING_TOKENS,
    owned: [...STARTER_PARTS],
    bodies: BODY_PRESETS.filter((b) => b.price === 0).map((b) => b.id),
    builds: [{ ...STARTER_BUILD }],
    active: 0,
    designs: [],
    ghosts: {},
    medals: {},
    cups: [],
    city: {},
    stats: { races: 0, wins: 0, courseOuts: 0, cityRuns: 0 },
    settings: { ...DEFAULT_SETTINGS },
    seenIntro: false,
  };
}

export function randomId(): string {
  const a = new Uint32Array(2);
  try {
    crypto.getRandomValues(a);
  } catch {
    a[0] = (Math.random() * 2 ** 32) >>> 0;
    a[1] = (Math.random() * 2 ** 32) >>> 0;
  }
  return a[0].toString(36) + a[1].toString(36);
}

/** Bring a stored profile up to date, repairing anything invalid. */
export function migrateProfile(input: unknown): Profile {
  if (!input || typeof input !== "object") return newProfile();
  const p = input as Partial<Profile>;
  const base = newProfile(typeof p.owner === "string" && p.owner ? p.owner : undefined);
  const known = new Set(ALL_PARTS.map((x) => x.id));
  const owned = Array.from(new Set([...(Array.isArray(p.owned) ? p.owned.filter((id) => known.has(id)) : []), ...STARTER_PARTS]));
  const bodies = Array.from(new Set([...(Array.isArray(p.bodies) ? p.bodies.filter((id) => presetById(id)) : []), ...base.bodies]));
  const builds = (Array.isArray(p.builds) ? p.builds : []).slice(0, MAX_BUILDS).map((b) => sanitizeBuild(b));
  const s = (p.settings ?? {}) as Partial<Settings>;
  return {
    ...base,
    tokens: typeof p.tokens === "number" && Number.isFinite(p.tokens) ? Math.max(0, Math.floor(p.tokens)) : base.tokens,
    owned,
    bodies,
    builds: builds.length ? builds : base.builds,
    active: typeof p.active === "number" && Number.isInteger(p.active) && p.active >= 0 && p.active < Math.max(1, builds.length) ? p.active : 0,
    designs: (Array.isArray(p.designs) ? p.designs : []).slice(0, 24).map((d) => sanitizeRecipe(d, DEFAULT_BODY)),
    ghosts: typeof p.ghosts === "object" && p.ghosts ? Object.fromEntries(Object.entries(p.ghosts).filter(([, g]) => g && typeof g === "object" && Number.isFinite(g.time) && g.time > 0 && Number.isInteger(g.seed) && Number.isInteger(g.lane) && g.lane >= 0 && g.lane < 3).map(([k, g]) => [k, { ...g, build: sanitizeBuild(g.build) }])) : {},
    medals: typeof p.medals === "object" && p.medals ? p.medals : {},
    cups: Array.isArray(p.cups) ? p.cups.filter((c) => typeof c === "string") : [],
    city: typeof p.city === "object" && p.city ? p.city : {},
    stats: { ...base.stats, ...(p.stats ?? {}) },
    settings: {
      fov: typeof s.fov === "number" && Number.isFinite(s.fov) ? Math.min(110, Math.max(55, s.fov)) : DEFAULT_SETTINGS.fov,
      headBob: s.headBob ?? DEFAULT_SETTINGS.headBob,
      vignette: s.vignette ?? DEFAULT_SETTINGS.vignette,
      cityView: s.cityView === "third" || s.cityView === "drone" ? s.cityView : "first",
      cheer: s.cheer ?? DEFAULT_SETTINGS.cheer,
      volume: typeof s.volume === "number" && Number.isFinite(s.volume) ? Math.min(1, Math.max(0, s.volume)) : DEFAULT_SETTINGS.volume,
      quality: s.quality === "low" ? "low" : "high",
      regulation: s.regulation ?? true,
      mouseSensitivity: typeof s.mouseSensitivity === "number" && Number.isFinite(s.mouseSensitivity) ? Math.min(3, Math.max(0.2, s.mouseSensitivity)) : 1,
    },
    seenIntro: Boolean(p.seenIntro),
  };
}

export function activeBuild(p: Profile): Build {
  return p.builds[p.active] ?? p.builds[0] ?? STARTER_BUILD;
}

/** Parts in a build the player doesn't own (a shared link can contain them). */
export function missingParts(p: Profile, b: Build): string[] {
  const owned = new Set(p.owned);
  return partsInBuild(b).filter((id) => !owned.has(id));
}

export function canBuy(p: Profile, id: string): boolean {
  if (p.owned.includes(id)) return false;
  return p.tokens >= part(id).price;
}

export function buyPart(p: Profile, id: string): Profile {
  if (!canBuy(p, id)) return p;
  return { ...p, tokens: p.tokens - part(id).price, owned: [...p.owned, id] };
}

export function buyBody(p: Profile, id: string): Profile {
  const b = presetById(id);
  if (!b || p.bodies.includes(id) || p.tokens < b.price) return p;
  return { ...p, tokens: p.tokens - b.price, bodies: [...p.bodies, id] };
}

// ----- Rewards ----------------------------------------------------------------------

export const DIFFICULTY_PAY = [1, 1, 1.3, 1.6, 2];

export function heatReward(place: number, finished: boolean, difficulty: number): number {
  const base = !finished ? 15 : place === 1 ? 120 : place === 2 ? 70 : 40;
  return Math.round(base * DIFFICULTY_PAY[difficulty]);
}

export function enduranceReward(place: number, finished: boolean): number {
  if (!finished) return 30;
  return place === 1 ? 300 : place === 2 ? 180 : 100;
}

export const CUP_REWARD = 600;

/** Time-trial targets (seconds for 3 laps) per track: bronze, silver, gold. */
export const TRIAL_TARGETS: Record<string, [number, number, number]> = {
  practice: [5.4, 4.6, 4.0],
  sunday: [13.5, 10.8, 9.6],
  dragon: [17.5, 14.2, 13.0],
  bank: [14.0, 11.2, 10.0],
  grand: [22.5, 18.0, 16.2],
};

export function medalFor(track: string, time: number): number {
  const t = TRIAL_TARGETS[track];
  if (!t) return 0;
  return time <= t[2] ? 3 : time <= t[1] ? 2 : time <= t[0] ? 1 : 0;
}

/** Tokens for improving your medal on a track (each medal pays once). */
export function trialReward(prevMedal: number, medal: number, difficulty: number): number {
  const pay = [0, 60, 100, 160];
  let t = 0;
  for (let m = prevMedal + 1; m <= medal; m++) t += pay[m];
  return Math.round(t * DIFFICULTY_PAY[difficulty]) || (medal > 0 ? 10 : 5);
}

export function cityReward(score: number, firstFinish: boolean): number {
  return Math.round(Math.max(10, score / 40)) + (firstFinish ? 150 : 0);
}
