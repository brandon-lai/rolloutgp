import type { Quality } from "./quality.ts";
// The trackside view of a race: the track, the cars, and cameras that follow
// the action like a TV broadcast. Car poses arrive from the worker as frames;
// the view draws a moment slightly in the past and interpolates between the two
// frames around it, so motion is smooth whatever the frame rate.

import * as THREE from "three/webgpu";
import type { Build } from "../sim/build.ts";
import { CAR_STRIDE } from "../sim/protocol.ts";
import type { TrackGeo } from "../sim/track/geometry.ts";
import { SAMPLE_STRIDE } from "../sim/track/geometry.ts";
import { CarModel } from "./car.ts";
import { hallEnvironment } from "./env.ts";
import { trackObject } from "./track.ts";
import type { View } from "./viewport.ts";
import type { UploadLookup } from "./body.ts";

export type CameraMode = "tv" | "chase" | "overhead";

interface Frame {
  t: number;
  cars: Float32Array;
}

interface Station {
  pos: THREE.Vector3;
  /** Point on the track this station covers. */
  covers: THREE.Vector3;
}

export class RaceView implements View {
  macro = true;
  focusDistance = 10;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(40, 1, 0.05, 900);
  readonly cars: CarModel[] = [];
  private frames: Frame[] = [];
  private renderT = 0;
  private readonly geo: TrackGeo;
  private readonly disposeTrack: () => void;
  private readonly disposeEnv: () => void;
  private stations: Station[] = [];
  private station = 0;
  private stationSince = 0;
  mode: CameraMode = "tv";
  /** Index of the car the cameras follow. */
  follow = 0;
  private camPos = new THREE.Vector3();
  private camLook = new THREE.Vector3();
  private camInit = false;
  /** Playback speed (for interpolation lag). */
  speed = 1;
  /** Replay: frames are all known; renderT is driven by the clock. */
  replay = false;
  replayRate = 1;
  onReplayEnd?: () => void;

  constructor(geo: TrackGeo, builds: { build: Build; ghost?: boolean }[], uploads?: UploadLookup) {
    this.geo = geo;
    const t = trackObject(geo);
    this.scene.add(t.object);
    this.disposeTrack = t.dispose;
    this.disposeEnv = hallEnvironment(this.scene, geo.bounds);
    for (const b of builds) {
      const m = new CarModel(b.build, uploads);
      if (b.ghost) m.setGhost();
      this.scene.add(m.root);
      this.cars.push(m);
    }
    this.buildStations();
    // Park cars at the start until the first frame arrives.
    this.camera.position.set(geo.bounds.minX - 10, 14, (geo.bounds.minZ + geo.bounds.maxZ) / 2);
    this.camera.lookAt((geo.bounds.minX + geo.bounds.maxX) / 2, 0, (geo.bounds.minZ + geo.bounds.maxZ) / 2);
  }

  /** Trackside camera spots: one outside each feature, plus along the straights. */
  private buildStations() {
    const st = this.geo.strips[0];
    const cx = (this.geo.bounds.minX + this.geo.bounds.maxX) / 2;
    const cz = (this.geo.bounds.minZ + this.geo.bounds.maxZ) / 2;
    let lastS = -Infinity;
    for (let k = 0; k < st.count; k++) {
      const o = k * SAMPLE_STRIDE;
      const s = st.data[o + 12];
      if (s - lastS < 24) continue;
      lastS = s;
      const p = new THREE.Vector3(st.data[o], st.data[o + 1], st.data[o + 2]);
      // Stand outside the track, away from its middle.
      const out = new THREE.Vector3(p.x - cx, 0, p.z - cz).normalize();
      const pos = p.clone().addScaledVector(out, 8).add(new THREE.Vector3(0, 6, 0));
      this.stations.push({ pos, covers: p });
    }
  }

  pushFrame(t: number, cars: Float32Array): void {
    this.frames.push({ t, cars });
    if (!this.replay && this.frames.length > 90) this.frames.splice(0, this.frames.length - 90);
  }

  /** Load a whole recorded run for replay. */
  loadReplay(ts: number[], cars: Float32Array[]): void {
    this.replay = true;
    this.frames = ts.map((t, i) => ({ t, cars: cars[i] }));
    this.renderT = 0;
  }

  reset(): void {
    this.frames = [];
    this.renderT = 0;
    this.camInit = false;
  }

  /** Interpolated pose of car i at time t. */
  private sample(i: number, t: number): Float32Array | null {
    const f = this.frames;
    if (f.length === 0) return null;
    let a = f[0],
      b = f[0];
    for (let k = f.length - 1; k >= 0; k--) {
      if (f[k].t <= t) {
        a = f[k];
        b = f[Math.min(f.length - 1, k + 1)];
        break;
      }
    }
    const o = i * CAR_STRIDE;
    if (o + CAR_STRIDE > a.cars.length || o + CAR_STRIDE > b.cars.length) return null;
    const u = b.t > a.t ? Math.min(1, Math.max(0, (t - a.t) / (b.t - a.t))) : 0;
    const out = new Float32Array(CAR_STRIDE);
    for (let j = 0; j < CAR_STRIDE; j++) out[j] = a.cars[o + j];
    for (let j = 0; j < 3; j++) out[j] = a.cars[o + j] + (b.cars[o + j] - a.cars[o + j]) * u;
    const qa = new THREE.Quaternion(a.cars[o + 3], a.cars[o + 4], a.cars[o + 5], a.cars[o + 6]);
    const qb = new THREE.Quaternion(b.cars[o + 3], b.cars[o + 4], b.cars[o + 5], b.cars[o + 6]);
    qa.slerp(qb, u);
    out[3] = qa.x;
    out[4] = qa.y;
    out[5] = qa.z;
    out[6] = qa.w;
    out[7] = a.cars[o + 7] + (b.cars[o + 7] - a.cars[o + 7]) * u;
    return out;
  }

  /** Latest pose data per car (for the HUD). */
  latest(): Float32Array | null {
    return this.frames.length ? this.frames[this.frames.length - 1].cars : null;
  }

  get time(): number {
    return this.renderT;
  }

  setQuality(q: Quality) { this.cars.forEach(car => car.setQuality(q)); }

  update(dt: number): void {
    const f = this.frames;
    if (f.length > 0) {
      if (this.replay) {
        this.renderT = Math.min(f[f.length - 1].t, this.renderT + dt * this.replayRate);
        if (this.renderT >= f[f.length - 1].t && this.onReplayEnd) {
          const cb = this.onReplayEnd;
          this.onReplayEnd = undefined;
          cb();
        }
      } else {
        // Draw ~2 frames behind the newest so there is always a pair to blend.
        const target = f[f.length - 1].t - 0.035 * Math.max(1, this.speed);
        this.renderT = this.renderT === 0 ? target : this.renderT + (target - this.renderT) * Math.min(1, dt * 12) + dt * this.speed * 0;
      }
    }
    for (let i = 0; i < this.cars.length; i++) {
      const s = this.sample(i, this.renderT);
      if (!s) continue;
      this.cars[i].setPose(s[0], s[1], s[2], s[3], s[4], s[5], s[6]);
      this.cars[i].roll(((s[7] / 3.6) * 10) * (s[8] === 2 ? 0.3 : 1), dt * (this.replay ? this.replayRate : this.speed));
    }
    this.updateCamera(dt);
  }

  private updateCamera(dt: number): void {
    const car = this.cars[this.follow]?.root;
    if (!car) return;
    const target = car.position;
    const desired = new THREE.Vector3();
    const look = target.clone();
    if (this.mode === "overhead") {
      const b = this.geo.bounds;
      const cx = (b.minX + b.maxX) / 2,
        cz = (b.minZ + b.maxZ) / 2;
      const span = Math.max(b.maxX - b.minX, b.maxZ - b.minZ);
      desired.set(cx, span * 0.95 + 8, cz + span * 0.55);
      look.set(cx, 0, cz);
      this.camera.fov = 38;
    } else if (this.mode === "chase") {
      const back = new THREE.Vector3(-1, 0, 0).applyQuaternion(car.quaternion);
      back.y = 0;
      back.normalize();
      desired.copy(target).addScaledVector(back, 3.6).add(new THREE.Vector3(0, 1.8, 0));
      look.add(new THREE.Vector3(0, 0.2, 0));
      this.camera.fov = 55;
    } else {
      // TV: hold a station for at least 1.5 s, cut to the nearest one after.
      this.stationSince += dt;
      let best = this.station,
        bestD = Infinity;
      this.stations.forEach((s, i) => {
        const d = s.covers.distanceTo(target);
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      });
      if (best !== this.station && this.stationSince > 1.5) {
        this.station = best;
        this.stationSince = 0;
        this.camInit = false;
      }
      const s = this.stations[this.station];
      if (s) desired.copy(s.pos);
      const dist = desired.distanceTo(target);
      // Zoom so about half a metre of real track is in frame round the car.
      this.camera.fov = Math.max(12, Math.min(50, (Math.atan2(2.6, dist) * 360) / Math.PI));
    }
    if (!this.camInit) {
      this.camPos.copy(desired);
      this.camLook.copy(look);
      this.camInit = true;
    } else {
      const k = this.mode === "tv" ? 1 : Math.min(1, dt * 6);
      this.camPos.lerp(desired, k);
      this.camLook.lerp(look, Math.min(1, dt * 10));
    }
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camLook);
    this.focusDistance = this.camera.position.distanceTo(target);
    this.macro = this.mode !== "overhead";
    this.camera.updateProjectionMatrix();
  }

  dispose(): void {
    this.cars.forEach((c) => c.dispose());
    this.disposeTrack();
    this.disposeEnv();
  }
}
