/// <reference lib="webworker" />
// The simulation worker. Runs races on a fixed physics step, decoupled from the
// frame rate, and streams poses to the page.

import RAPIER from "@dimforge/rapier3d-deterministic-compat";
import { Race } from "./race.ts";
import { CAR_STRIDE, STATUS_CODE, type CarResult, type FromWorker, type RaceResult, type ToWorker } from "./protocol.ts";
import { DT } from "./units.ts";

declare const self: DedicatedWorkerGlobalScope;

const ready = RAPIER.init();

interface Live {
  id: number;
  race: Race;
  ghosts: Race[];
  speed: number;
  /** Sim time we should have reached, s. */
  target: number;
  last: number;
  logSent: number;
  timer: ReturnType<typeof setTimeout> | null;
}

let live: Live | null = null;

const post = (m: FromWorker, transfer: Transferable[] = []) => self.postMessage(m, transfer);

function packFrame(main: Race, ghosts: Race[]): Float32Array {
  const all = [...main.runners.map((r) => ({ r, ghost: 0 })), ...ghosts.flatMap((g) => g.runners.map((r) => ({ r, ghost: 1 })))];
  const out = new Float32Array(all.length * CAR_STRIDE);
  all.forEach(({ r, ghost }, i) => {
    const t = r.car.body.translation();
    const q = r.car.body.rotation();
    const o = i * CAR_STRIDE;
    out[o] = t.x;
    out[o + 1] = t.y;
    out[o + 2] = t.z;
    out[o + 3] = q.x;
    out[o + 4] = q.y;
    out[o + 5] = q.z;
    out[o + 6] = q.w;
    out[o + 7] = (r.car.speed() / 10) * 3.6;
    out[o + 8] = STATUS_CODE[r.status];
    out[o + 9] = r.lap;
    out[o + 10] = r.car.volts;
    out[o + 11] = r.car.braking ? 1 : 0;
    out[o + 12] = ghost;
    out[o + 13] = r.telemetry.distance;
  });
  return out;
}

function results(race: Race, ghosts: Race[]): RaceResult {
  const toResult = (r: Race["runners"][number], ghost: boolean): CarResult => ({
    id: r.entry.id,
    name: r.entry.name,
    color: r.entry.color,
    status: r.status,
    telemetry: r.telemetry,
    ghost,
  });
  return {
    standings: [...race.standings().map((r) => toResult(r, false)), ...ghosts.flatMap((g) => g.runners.map((r) => toResult(r, true)))],
    log: race.log,
    time: race.time,
  };
}

function stopLive() {
  if (!live) return;
  if (live.timer) clearTimeout(live.timer);
  live.race.free();
  live.ghosts.forEach((g) => g.free());
  live = null;
}

function loop() {
  const L = live;
  if (!L) return;
  const now = performance.now();
  const dt = Math.min(0.1, (now - L.last) / 1000);
  L.last = now;
  L.target += dt * L.speed;
  // Catch up to the target time in fixed steps; cap work per tick so a slow
  // machine slows the race down instead of freezing the page.
  let steps = 0;
  const maxSteps = Math.ceil((0.05 * L.speed) / DT) + 8;
  while (L.race.time + DT <= L.target && !L.race.done && steps < maxSteps) {
    L.race.tick();
    for (const g of L.ghosts) if (!g.done) g.tick();
    steps++;
  }
  if (steps >= maxSteps) L.target = L.race.time;
  const events = L.race.log.slice(L.logSent);
  L.logSent = L.race.log.length;
  const cars = packFrame(L.race, L.ghosts);
  post({ type: "frame", id: L.id, t: L.race.time, cars, events }, [cars.buffer]);
  if (L.race.done) {
    post({ type: "done", id: L.id, result: results(L.race, L.ghosts) });
    stopLive();
    return;
  }
  L.timer = setTimeout(loop, 8);
}

self.onmessage = async (ev: MessageEvent<ToWorker>) => {
  const m = ev.data;
  try {
    await ready;
    switch (m.type) {
      case "race": {
        stopLive();
        const race = new Race(RAPIER, m.cfg);
        const ghosts = m.ghosts.map((g) => new Race(RAPIER, g));
        live = { id: m.id, race, ghosts, speed: m.speed, target: 0, last: performance.now(), logSent: 0, timer: null };
        loop();
        break;
      }
      case "speed":
        if (live && live.id === m.id) {
          live.speed = m.speed;
          live.last = performance.now();
        }
        break;
      case "pit":
        if (live && live.id === m.id) live.race.requestPit(m.car);
        break;
      case "stop":
        if (live && live.id === m.id) stopLive();
        break;
      case "simulate": {
        const race = new Race(RAPIER, m.cfg);
        const replayT: number[] = [];
        const replayCars: Float32Array[] = [];
        let nextFrame = 0;
        while (!race.done) {
          race.tick();
          if (m.replay && race.time >= nextFrame) {
            nextFrame += 1 / 30;
            replayT.push(race.time);
            replayCars.push(packFrame(race, []));
          }
        }
        const result = results(race, []);
        if (m.replay) result.replay = { t: replayT, cars: replayCars };
        race.free();
        post({ type: "done", id: m.id, result });
        break;
      }
    }
  } catch (e) {
    post({ type: "error", id: m.id, message: e instanceof Error ? e.message : String(e) });
  }
};

ready.then(() => post({ type: "ready" }));
