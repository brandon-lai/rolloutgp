// Page-side handle on the simulation worker.

import type { FromWorker, RaceResult, ToWorker } from "./protocol.ts";
import type { RaceConfig, RaceEvent } from "./race.ts";

export interface LiveRace {
  id: number;
  setSpeed(speed: number): void;
  pit(car: string): void;
  stop(): void;
  done: Promise<RaceResult>;
}

type FrameHandler = (t: number, cars: Float32Array, events: RaceEvent[]) => void;

class SimClient {
  private worker: Worker | null = null;
  private nextId = 1;
  private waiting = new Map<number, { resolve: (r: RaceResult) => void; reject: (e: Error) => void }>();
  private frames = new Map<number, FrameHandler>();

  private get w(): Worker {
    if (!this.worker) {
      this.worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
      this.worker.onmessage = (ev: MessageEvent<FromWorker>) => this.onMessage(ev.data);
      this.worker.onerror = (ev) => {
        console.error("worker error", ev);
        (globalThis as { __workerError?: string }).__workerError = ev.message || "worker failed to load";
        for (const [, w] of this.waiting) w.reject(new Error(ev.message || "Simulation worker failed"));
        this.waiting.clear();
      };
    }
    return this.worker;
  }

  private send(m: ToWorker) {
    this.w.postMessage(m);
  }

  private onMessage(m: FromWorker) {
    if (m.type === "frame") this.frames.get(m.id)?.(m.t, m.cars, m.events);
    else if (m.type === "done") {
      this.waiting.get(m.id)?.resolve(m.result);
      this.waiting.delete(m.id);
      this.frames.delete(m.id);
    } else if (m.type === "error") {
      this.waiting.get(m.id)?.reject(new Error(m.message));
      this.waiting.delete(m.id);
      this.frames.delete(m.id);
    }
  }

  /** Start a live race; frames stream to `onFrame`. */
  race(cfg: RaceConfig, ghosts: RaceConfig[], speed: number, onFrame: FrameHandler): LiveRace {
    const id = this.nextId++;
    this.frames.set(id, onFrame);
    const done = new Promise<RaceResult>((resolve, reject) => this.waiting.set(id, { resolve, reject }));
    this.send({ type: "race", id, cfg, ghosts, speed });
    return {
      id,
      setSpeed: (s) => this.send({ type: "speed", id, speed: s }),
      pit: (car) => this.send({ type: "pit", id, car }),
      stop: () => {
        this.send({ type: "stop", id });
        this.frames.delete(id);
        this.waiting.delete(id);
      },
      done,
    };
  }

  /** Run a race to the end as fast as possible (test lane, ghosts). */
  simulate(cfg: RaceConfig, replay = false): Promise<RaceResult> {
    const id = this.nextId++;
    const done = new Promise<RaceResult>((resolve, reject) => this.waiting.set(id, { resolve, reject }));
    this.send({ type: "simulate", id, cfg, replay });
    return done;
  }
}

/** Live races (one at a time). */
export const liveSim = new SimClient();
/** Fast, run-to-the-end simulations (test lane, ghosts) on their own worker so they never stall a live race. */
export const fastSim = new SimClient();
