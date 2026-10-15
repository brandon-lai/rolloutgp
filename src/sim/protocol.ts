// Messages between the page and the simulation worker. The sim never waits on
// the screen: it steps on its own clock and streams car poses; the renderer
// interpolates between the last two frames.

import type { RaceConfig, RaceEvent, Telemetry, CarStatus } from "./race.ts";

/** Floats per car in a frame. */
export const CAR_STRIDE = 14;
// x y z qx qy qz qw  speedKmh  status  lap  volts  braking  ghost  distance(u)

export const STATUS_CODE: Record<CarStatus, number> = { racing: 0, finished: 1, out: 2, pitting: 3 };
export const STATUS_NAME: CarStatus[] = ["racing", "finished", "out", "pitting"];

export interface CarResult {
  id: string;
  name: string;
  color: string;
  status: CarStatus;
  telemetry: Telemetry;
  ghost: boolean;
}

export interface RaceResult {
  standings: CarResult[];
  log: RaceEvent[];
  time: number;
  /** Recorded frames at 30 Hz for a replay (fast simulations only). */
  replay?: { t: number[]; cars: Float32Array[] };
}

export type ToWorker =
  | { type: "race"; id: number; cfg: RaceConfig; ghosts: RaceConfig[]; speed: number }
  | { type: "speed"; id: number; speed: number }
  | { type: "pit"; id: number; car: string }
  | { type: "stop"; id: number }
  | { type: "simulate"; id: number; cfg: RaceConfig; replay: boolean };

export type FromWorker =
  | { type: "ready" }
  | { type: "frame"; id: number; t: number; cars: Float32Array; events: RaceEvent[] }
  | { type: "done"; id: number; result: RaceResult }
  | { type: "error"; id: number; message: string };
