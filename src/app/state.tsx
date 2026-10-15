// App-wide state: the profile (persisted), the 3D viewport, navigation, uploads
// for personal stickers, and toasts.

import { createContext, useContext } from "react";
import type { Profile } from "../store/profile.ts";
import type { Viewport } from "../render/viewport.ts";
import type { RaceConfig } from "../sim/race.ts";
import type { RaceResult } from "../sim/protocol.ts";
import type { Format, CupState } from "../game/formats.ts";
import type { Build } from "../sim/build.ts";
import type { BodyRecipe } from "../sim/body.ts";

export interface RaceSetup {
  format: Format | "practice";
  trackId: string;
  cfg: RaceConfig;
  ghosts: RaceConfig[];
  cup?: CupState;
  /** Build the player raced (for telemetry advice). */
  build: Build;
}

export interface ResultsData {
  setup: RaceSetup;
  result: RaceResult;
  reward: number;
  notes: string[];
  place: number;
  cupNext?: CupState;
  cupOver?: "won" | "out";
  /** Recorded frames from the live race, for the replay. */
  frames: { t: number[]; cars: Float32Array[] };
}

export type Screen =
  | { name: "home" }
  | { name: "garage"; tab?: string }
  | { name: "tracks"; format?: Format }
  | { name: "race"; setup: RaceSetup }
  | { name: "results"; data: ResultsData }
  | { name: "replay"; data: ResultsData }
  | { name: "body"; recipe?: BodyRecipe }
  | { name: "city"; course?: string }
  | { name: "settings" };

export interface AppCtx {
  profile: Profile;
  save: (fn: (p: Profile) => Profile) => void;
  viewport: Viewport | null;
  screen: Screen;
  go: (s: Screen) => void;
  toast: (msg: string) => void;
  uploads: Map<string, ImageBitmap>;
  addUpload: (blob: Blob) => Promise<string | null>;
  uploadsVersion: number;
}

export const Ctx = createContext<AppCtx | null>(null);

export function useApp(): AppCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("no app context");
  return c;
}
