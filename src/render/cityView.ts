import { currentQuality, reducedMotion, type Quality } from "./quality.ts";
import { CSMShadowNode } from "three/addons/csm/CSMShadowNode.js";
import { runnerModel, animateRunner, firstPersonArms } from "./models/runner.ts";
import { disposeObject } from "./models/parts.ts";
import { districtDetails } from "./models/district.ts";
import { microSurface } from "./surface.ts";
// City run view. Scene units are metres here (the runner's world); the car and
// the course come from the sim in sim units and sit in a group scaled by 1/10.
//
// Keeping a 150 mm car readable in a city: a coloured trail and a soft glow, an
// off-screen arrow with a distance readout (HUD), and a camera that drops low
// and widens when you're close (the show's low tracking shot).

import * as THREE from "three/webgpu";
import type { Build } from "../sim/build.ts";
import { buildTrack, SAMPLE_STRIDE, type TrackGeo } from "../sim/track/geometry.ts";
import { SCALE } from "../sim/units.ts";
import { cityBoxes, LINES, PITCH, BLOCK, PIT, type Box, type CourseDef } from "../city/layout.ts";
import { Runner, CityCollision, RUN, type RunnerInput } from "../city/runner.ts";
import { CarModel } from "./car.ts";
import type { View } from "./viewport.ts";
import type { UploadLookup } from "./body.ts";
import { CITY_STRIDE } from "../sim/protocol.ts";
import type { Settings } from "../store/profile.ts";

export const TETHER = 10; // m: the "in range" ring round the car

interface CarFrame {
  t: number;
  d: Float32Array;
}

export interface CityHud {
  carDist: number;
  /** Car's bearing relative to where you're looking, radians (0 = dead ahead). */
  carBearing: number;
  carOnScreen: { x: number; y: number } | null;
  inRange: boolean;
  stamina: number;
  speed: number;
  /** Fork the crosshair is on: segment index and branch. */
  aim: { seg: number; branch: number; label: string } | null;
  nearCar: boolean;
}

export class CityView implements View {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(75, 1, 0.05, 1200);
  readonly runner: Runner;
  readonly collision = new CityCollision();
  readonly car: CarModel;
  private readonly carGroup = new THREE.Group();
  private readonly world = new THREE.Group();
  private readonly geos: TrackGeo[];
  private frames: CarFrame[] = [];
  private renderT = 0;
  private readonly disposables: { dispose(): void }[] = [];
  private trail: THREE.Line;
  private trailPts: THREE.Vector3[] = [];
  private glow: THREE.Sprite;
  private runnerBody: THREE.Group;
  private arms = firstPersonArms();
  private details: THREE.Group | null = null;
  private csmProjection = "";
  private csm: CSMShadowNode | null = null;
  private markers: { seg: number; branch: number; mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; pos: THREE.Vector3; label: string }[] = [];
  readonly forkChoice = new Map<number, number>();
  input: RunnerInput = { moveX: 0, moveY: 0, lookX: 0, lookY: 0, sprint: false, jump: false, slide: false };
  settings: Settings;
  hud: CityHud = { carDist: 0, carBearing: 0, carOnScreen: null, inRange: false, stamina: 100, speed: 0, aim: null, nearCar: false };
  /** Car world position (m) at the drawn moment. */
  readonly carPos = new THREE.Vector3();
  carStatus = 0;
  frozen = true;
  private bob = 0;
  private lowCam = 0;

  constructor(course: CourseDef, build: Build, settings: Settings, uploads?: UploadLookup) {
    this.settings = settings;
    this.scene.background = new THREE.Color(0xbac6cb);
    this.scene.fog = new THREE.Fog(0xbac6cb, 90, 330);
    const hemi = new THREE.HemisphereLight(0xe8f2ff, 0x6b6253, .65);
    const sun = new THREE.DirectionalLight(0xfff1d6, 3.2);
    sun.position.set(60, 120, 40);
    sun.castShadow = true;
    const sc = sun.shadow.camera as THREE.OrthographicCamera;
    sc.left = sc.bottom = -110;
    sc.right = sc.top = 110;
    sc.far = 400;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.bias = -0.0001;
    sun.shadow.normalBias = .015;
    if(["high","ultra"].includes(currentQuality())) {
      this.csm=new CSMShadowNode(sun,{cascades:3,maxFar:160,lightMargin:45});
      sun.shadow.shadowNode=this.csm;
    }
    this.scene.add(hemi, sun, sun.target);
    this.scene.add(this.world);

    this.buildCity();
    this.geos = course.segments.map((s) => buildTrack(s.def));
    this.buildCourse(course);

    this.car = new CarModel(build, uploads);
    this.carGroup.scale.setScalar(1 / SCALE);
    this.carGroup.add(this.car.root);
    this.scene.add(this.carGroup);

    // Trail and glow in the body's colour.
    const color = new THREE.Color(build.body.paint.base);
    const trailGeo = new THREE.BufferGeometry();
    trailGeo.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(160 * 3), 3));
    const trailMat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.85 });
    this.trail = new THREE.Line(trailGeo, trailMat);
    this.trail.frustumCulled = false;
    this.scene.add(this.trail);
    const glowTex = glowTexture();
    const glowMat = new THREE.SpriteMaterial({ map: glowTex, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.8 });
    this.glow = new THREE.Sprite(glowMat);
    this.glow.scale.setScalar(0.9);
    this.scene.add(this.glow);
    this.disposables.push(trailGeo, trailMat, glowTex, glowMat);

    // The runner's body (seen in third person and from the drone).
    this.runnerBody = runnerModel(currentQuality()==='low'?8:12);
    this.scene.add(this.runnerBody, this.camera);
    this.camera.add(this.arms);

    const s = course.runnerStart;
    const st = this.geos[0].strips[0];
    const yaw = Math.atan2(st.data[5], st.data[3]);
    this.runner = new Runner(this.collision, s.x, s.z, yaw);
    // Park the car at the start line until frames arrive.
    const o = 2 * SAMPLE_STRIDE;
    this.carPos.set(st.data[o] / SCALE, st.data[o + 1] / SCALE, st.data[o + 2] / SCALE);
    this.carGroup.position.set(0, 0, 0);
    this.car.setPose(st.data[o], st.data[o + 1] + 0.12, st.data[o + 2], 0, Math.sin(-yaw / 2), 0, Math.cos(-yaw / 2));
  }

  private buildCity() {
    const boxes = cityBoxes();
    this.details=districtDetails(boxes);this.world.add(this.details);
    const facadeTex = windowTexture();
    facadeTex.wrapS = facadeTex.wrapT = THREE.RepeatWrapping;
    const facadeDetail = microSurface(128,83);
    const rough=facadeDetail.roughness.image.data as Uint8Array;
    for(let y=22;y<86;y++)for(let x=26;x<102;x++){const i=(y*128+x)*4;rough[i]=rough[i+1]=rough[i+2]=80;}
    facadeDetail.roughness.flipY=true;
    const facadeMat = new THREE.MeshStandardMaterial({ map: facadeTex, vertexColors: true, roughness: .72, normalMap: facadeDetail.normal, roughnessMap:facadeDetail.roughness, normalScale:new THREE.Vector2(.3,.3) });
    this.disposables.push(facadeDetail.normal,facadeDetail.roughness);
    const plainMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 });
    const buildings = boxes.filter((b) => b.kind === "building");
    const plain = boxes.filter((b) => b.kind !== "building" && b.kind !== "ground");
    const bGeo = mergeBoxes(buildings, true);
    const pGeo = mergeBoxes(plain, false);
    const bMesh = new THREE.Mesh(bGeo, facadeMat);
    bMesh.castShadow = bMesh.receiveShadow = true;
    const pMesh = new THREE.Mesh(pGeo, plainMat);
    pMesh.castShadow = pMesh.receiveShadow = true;
    this.world.add(bMesh, pMesh);

    // Ground: asphalt with road markings, plaza paving, the pit.
    const roadTex = roadTexture();
    const asphalt = microSurface(256,42);
    asphalt.normal.repeat.set(400,400);asphalt.roughness.repeat.set(400,400);
    const roadMat = new THREE.MeshStandardMaterial({ map: roadTex, roughness: .94,normalMap:asphalt.normal,roughnessMap:asphalt.roughness,normalScale:new THREE.Vector2(.8,.8) });
    this.disposables.push(asphalt.normal,asphalt.roughness);
    // Use the existing ground rectangles so asphalt does not cover the sunken pit.
    const road = new THREE.Mesh(roadSurface(boxes), roadMat);
    road.receiveShadow = true;
    this.world.add(road);
    const paveMat = new THREE.MeshStandardMaterial({ color: 0xcdbfa6, roughness: 0.9 });
    const plaza = new THREE.Mesh(new THREE.PlaneGeometry(BLOCK, BLOCK - 5), paveMat);
    plaza.rotation.x = -Math.PI / 2;
    plaza.position.set(PITCH, 0.004, 0);
    plaza.receiveShadow = true;
    const pitMat = new THREE.MeshStandardMaterial({ color: 0x8a7f6e, roughness: 0.9 });
    const pit = new THREE.Mesh(new THREE.BoxGeometry(PIT.x1 - PIT.x0, 0.02, PIT.z1 - PIT.z0), pitMat);
    pit.position.set((PIT.x0 + PIT.x1) / 2, -PIT.depth + 0.006, 0);
    pit.receiveShadow = true;
    // Cut the plaza paving over the pit by drawing the pit walls.
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x9b917f, roughness: 0.9 });
    const pitWalls = new THREE.Group();
    for (const [x, z, w, d] of [
      [(PIT.x0 + PIT.x1) / 2, PIT.z0, PIT.x1 - PIT.x0, 0.2],
      [(PIT.x0 + PIT.x1) / 2, PIT.z1, PIT.x1 - PIT.x0, 0.2],
      [PIT.x0, 0, 0.2, PIT.z1 - PIT.z0],
      [PIT.x1, 0, 0.2, PIT.z1 - PIT.z0],
    ]) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, PIT.depth, d), wallMat);
      m.position.set(x, -PIT.depth / 2 + 0.01, z);
      pitWalls.add(m);
    }
    // Paving round the pit (four strips) instead of over it.
    const ring = new THREE.Group();
    const px0 = PITCH - BLOCK / 2,
      px1 = PITCH + BLOCK / 2,
      pz0 = -(BLOCK - 5) / 2,
      pz1 = (BLOCK - 5) / 2;
    for (const [x0, x1, z0, z1] of [
      [px0, px1, pz0, PIT.z0],
      [px0, px1, PIT.z1, pz1],
      [px0, PIT.x0, PIT.z0, PIT.z1],
      [PIT.x1, px1, PIT.z0, PIT.z1],
    ]) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), paveMat);
      m.rotation.x = -Math.PI / 2;
      m.position.set((x0 + x1) / 2, 0.004, (z0 + z1) / 2);
      m.receiveShadow = true;
      ring.add(m);
    }
    this.world.add(ring, pit, pitWalls);
    plaza.geometry.dispose();
    // Ramps into the pit.
    for (const r of this.collision.ramps) {
      const len = r.x1 - r.x0;
      const rise = r.h1 - r.h0;
      const m = new THREE.Mesh(new THREE.BoxGeometry(Math.hypot(len, rise), 0.06, r.z1 - r.z0), paveMat);
      m.position.set((r.x0 + r.x1) / 2, (r.h0 + r.h1) / 2 - 0.02, (r.z0 + r.z1) / 2);
      m.rotation.z = Math.atan2(rise, len);
      m.receiveShadow = true;
      this.world.add(m);
    }
    this.disposables.push(bGeo, pGeo, facadeTex, facadeMat, plainMat, roadTex, roadMat, paveMat, pitMat, wallMat);
  }

  private buildCourse(course: CourseDef) {
    const g = new THREE.Group();
    g.scale.setScalar(1 / SCALE);
    const boardMat = new THREE.MeshStandardMaterial({ color: 0xe9e1d0, roughness: 0.8 });
    const wallA = new THREE.MeshStandardMaterial({ color: 0xff7a00, roughness: 0.6 });
    for (const geo of this.geos) {
      const st = geo.strips[0];
      const hw = geo.lane.width / 2;
      const wall = geo.lane.wall;
      const t = 0.12;
      const floor = sweep(st.data, st.count, [[hw + t, 0], [-hw - t, 0]]);
      const walls = sweep(st.data, st.count, [[-hw - t, 0], [-hw - t, wall], [-hw, wall], [-hw, 0]], [[hw, 0], [hw, wall], [hw + t, wall], [hw + t, 0]]);
      const fm = new THREE.Mesh(floor, boardMat);
      const wm = new THREE.Mesh(walls, wallA);
      fm.receiveShadow = true;
      wm.castShadow = true;
      g.add(fm, wm);
      this.disposables.push(floor, walls);
    }
    this.disposables.push(boardMat, wallA);
    this.world.add(g);

    // Start/finish banner over the start.
    const st0 = this.geos[0].strips[0];
    const p0 = new THREE.Vector3(st0.data[0], st0.data[1], st0.data[2]).divideScalar(SCALE);
    const yaw = Math.atan2(st0.data[5], st0.data[3]);
    const arch = new THREE.Group();
    const archMat = new THREE.MeshStandardMaterial({ color: 0xe8402a, roughness: 0.5 });
    const bannerTex = textTexture("ROLLOUT GP · START", "#ffd23f", "#e8402a");
    const bannerMat = new THREE.MeshStandardMaterial({ map: bannerTex, roughness: 0.6, side: THREE.DoubleSide });
    for (const side of [-1, 1]) {
      const pole = new THREE.Mesh(new THREE.BoxGeometry(0.25, 4, 0.25), archMat);
      pole.position.set(0, 2, side * 3.5);
      arch.add(pole);
    }
    const banner = new THREE.Mesh(new THREE.PlaneGeometry(7.2, 1.1), bannerMat);
    banner.position.set(0, 3.6, 0);
    banner.rotation.y = -Math.PI / 2;
    arch.add(banner);
    arch.position.copy(p0);
    arch.rotation.y = -yaw;
    this.world.add(arch);
    this.disposables.push(archMat, bannerTex, bannerMat);

    // Fork markers: a flag 5 m into each branch, and a sign before the fork.
    course.segments.forEach((s, i) => {
      if (s.next.length < 2) return;
      s.next.forEach((n, b) => {
        const st = this.geos[n].strips[0];
        let k = 0;
        while (k < st.count - 1 && st.data[k * SAMPLE_STRIDE + 12] < 60) k++;
        const o = k * SAMPLE_STRIDE;
        const pos = new THREE.Vector3(st.data[o], st.data[o + 1], st.data[o + 2]).divideScalar(SCALE);
        const label = s.labels?.[b] ?? `Route ${b + 1}`;
        const tex = textTexture(label.toUpperCase(), "#ffffff", b === 0 ? "#1f9bd1" : "#7b2cbf");
        const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide });
        const flag = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.9), mat);
        flag.position.copy(pos).add(new THREE.Vector3(0, 2.1, 0));
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.1, 6), archMat);
        pole.position.copy(pos).add(new THREE.Vector3(0, 1.05, 0));
        this.world.add(flag, pole);
        this.markers.push({ seg: i, branch: b, mesh: flag, mat, pos: pos.clone().add(new THREE.Vector3(0, 2.1, 0)), label });
        this.disposables.push(tex, mat);
      });
      this.forkChoice.set(i, 0);
    });
  }

  /** A car frame from the worker. */
  pushCar(t: number, d: Float32Array): void {
    this.frames.push({ t, d });
    if (this.frames.length > 60) this.frames.splice(0, this.frames.length - 60);
  }

  setFork(seg: number, choice: number) {
    this.forkChoice.set(seg, choice);
  }

  setQuality(q: Quality) { this.car.setQuality(q); if(this.details)this.details.visible=q!=='low'; }

  update(dt: number): void {
    // Car: draw slightly in the past, interpolated.
    const f = this.frames;
    if (f.length) {
      const target = f[f.length - 1].t - 0.03;
      this.renderT = this.renderT === 0 ? target : this.renderT + (target - this.renderT) * Math.min(1, dt * 12);
      let a = f[0],
        b = f[0];
      for (let k = f.length - 1; k >= 0; k--)
        if (f[k].t <= this.renderT) {
          a = f[k];
          b = f[Math.min(f.length - 1, k + 1)];
          break;
        }
      const u = b.t > a.t ? Math.min(1, Math.max(0, (this.renderT - a.t) / (b.t - a.t))) : 0;
      const qa = new THREE.Quaternion(a.d[3], a.d[4], a.d[5], a.d[6]);
      qa.slerp(new THREE.Quaternion(b.d[3], b.d[4], b.d[5], b.d[6]), u);
      const x = a.d[0] + (b.d[0] - a.d[0]) * u,
        y = a.d[1] + (b.d[1] - a.d[1]) * u,
        z = a.d[2] + (b.d[2] - a.d[2]) * u;
      this.car.setPose(x, y, z, qa.x, qa.y, qa.z, qa.w);
      this.car.roll((a.d[7] / 3.6) * SCALE, dt);
      this.carPos.set(x / SCALE, y / SCALE, z / SCALE);
      this.carStatus = b.d[8];
    }
    // Trail.
    const last = this.trailPts[this.trailPts.length - 1];
    if (!last || last.distanceToSquared(this.carPos) > 0.04) {
      this.trailPts.push(this.carPos.clone().add(new THREE.Vector3(0, 0.05, 0)));
      if (this.trailPts.length > 160) this.trailPts.shift();
      const attr = this.trail.geometry.getAttribute("position") as THREE.BufferAttribute;
      for (let i = 0; i < 160; i++) {
        const p = this.trailPts[Math.max(0, Math.min(this.trailPts.length - 1, i - (160 - this.trailPts.length)))];
        attr.setXYZ(i, p.x, p.y, p.z);
      }
      attr.needsUpdate = true;
    }
    this.glow.position.copy(this.carPos).add(new THREE.Vector3(0, 0.12, 0));

    // Runner.
    if (!this.frozen) this.runner.update(dt, this.input);
    this.input.lookX = 0;
    this.input.lookY = 0;
    this.input.jump = false;
    this.input.slide = false;
    const r = this.runner;
    this.runnerBody.position.set(r.pos.x, r.pos.y, r.pos.z);
    this.runnerBody.rotation.y = -r.yaw + Math.PI / 2;
    animateRunner(this.runnerBody,r.stride,r.speed);
    this.arms.visible=this.settings.cityView === "first";
    this.arms.rotation.z=reducedMotion()?0:Math.sin(r.stride*2.4)*Math.min(.035,r.speed*.004);
    this.runnerBody.scale.y = r.mode === "slide" ? 0.55 : 1;

    // HUD numbers.
    const dx = this.carPos.x - r.pos.x,
      dz = this.carPos.z - r.pos.z;
    const dist = Math.hypot(dx, dz, this.carPos.y - r.pos.y);
    let bearing = Math.atan2(dz, dx) - r.yaw;
    bearing = Math.atan2(Math.sin(bearing), Math.cos(bearing));
    this.hud.carDist = dist;
    this.hud.carBearing = bearing;
    this.hud.inRange = dist <= TETHER;
    this.hud.stamina = r.stamina;
    this.hud.speed = r.speed;
    this.hud.nearCar = dist < 2.4;

    this.updateCamera(dt, dist);

    // Where the car is on screen (for the HUD's off-screen arrow).
    const sp = this.carPos.clone().project(this.camera);
    this.hud.carOnScreen = sp.z < 1 && Math.abs(sp.x) <= 1 && Math.abs(sp.y) <= 1 ? { x: sp.x, y: sp.y } : null;

    // Fork aiming: the marker nearest the crosshair, within 6 degrees and 45 m.
    const fwd = new THREE.Vector3();
    this.camera.getWorldDirection(fwd);
    let best: CityHud["aim"] = null;
    let bestAng = (6 * Math.PI) / 180;
    for (const m of this.markers) {
      const to = m.pos.clone().sub(this.camera.position);
      const d = to.length();
      if (d > 45) continue;
      const ang = to.normalize().angleTo(fwd);
      if (ang < bestAng) {
        bestAng = ang;
        best = { seg: m.seg, branch: m.branch, label: m.label };
      }
      const chosen = (this.forkChoice.get(m.seg) ?? 0) === m.branch;
      m.mat.opacity = chosen ? 1 : 0.35;
      m.mesh.lookAt(this.camera.position);
    }
    this.hud.aim = best;
  }

  private updateCamera(dt: number, dist: number) {
    const r = this.runner;
    const s = this.settings;
    // Close to the car: drop low and widen, like the show's tracking shot.
    const close = dist < 4 && this.carStatus === 0 ? 1 : 0;
    this.lowCam += (close - this.lowCam) * Math.min(1, dt * 3);
    const fov = s.fov + this.lowCam * 10 + (r.sprinting ? 4 : 0);
    this.camera.fov += (fov - this.camera.fov) * Math.min(1, dt * 5);
    const look = new THREE.Vector3(Math.cos(r.yaw) * Math.cos(r.pitch), Math.sin(r.pitch), Math.sin(r.yaw) * Math.cos(r.pitch));
    if (s.cityView === "first") {
      this.bob = s.headBob && !reducedMotion() && r.onGround ? Math.sin(r.stride * 2.4) * 0.045 * Math.min(1, r.speed / RUN.jog) : 0;
      const eye = r.mode === "slide" ? 0.75 : RUN.eye - this.lowCam * 0.55;
      this.camera.position.set(r.pos.x, r.pos.y + eye + this.bob, r.pos.z);
      this.camera.lookAt(this.camera.position.clone().add(look));
      this.runnerBody.visible = false;
    } else if (s.cityView === "third") {
      const back = new THREE.Vector3(-Math.cos(r.yaw), 0, -Math.sin(r.yaw));
      const target = new THREE.Vector3(r.pos.x, r.pos.y + 1.5, r.pos.z);
      this.camera.position.copy(target).addScaledVector(back, 3.4).add(new THREE.Vector3(0, 0.6 - r.pitch * 2, 0));
      this.camera.lookAt(target.clone().add(look.clone().multiplyScalar(4)));
      this.runnerBody.visible = true;
    } else {
      // Drone: high over the midpoint between you and the car, looking down.
      const mid = new THREE.Vector3((r.pos.x + this.carPos.x) / 2, 0, (r.pos.z + this.carPos.z) / 2);
      const h = 14 + Math.min(40, dist * 0.8);
      const want = mid.clone().add(new THREE.Vector3(-Math.cos(r.yaw) * h * 0.5, h, -Math.sin(r.yaw) * h * 0.5));
      this.camera.position.lerp(want, Math.min(1, dt * 3));
      this.camera.lookAt(mid);
      this.runnerBody.visible = true;
    }
    this.camera.updateProjectionMatrix();
    const projection=`${Math.round(this.camera.fov*4)}:${this.camera.aspect}`;
    if(this.csm?.camera && projection!==this.csmProjection){this.csm.updateFrustums();this.csmProjection=projection;}
  }

  dispose(): void {
    this.car.dispose();
    if(this.details)disposeObject(this.details);
    disposeObject(this.runnerBody);disposeObject(this.arms);this.csm?.dispose();
    this.disposables.forEach((d) => d.dispose());
    this.world.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
    });
  }
}

// ----- Geometry helpers -------------------------------------------------------------

export function roadSurface(boxes:Box[]):THREE.BufferGeometry {
  const positions:number[]=[],uv:number[]=[],indices:number[]=[];
  for(const b of boxes.filter(b=>b.kind==='ground')) {
    const start=positions.length/3;
    for(const [x,z] of [[b.x-b.hx,b.z+b.hz],[b.x+b.hx,b.z+b.hz],[b.x+b.hx,b.z-b.hz],[b.x-b.hx,b.z-b.hz]]) {
      positions.push(x,b.y+b.hy,z);uv.push((x+200)/400,(200-z)/400);
    }
    indices.push(start,start+1,start+2,start,start+2,start+3);
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();return g;
}

function sweep(data: Float64Array, count: number, ...profiles: [number, number][][]): THREE.BufferGeometry {
  const pos: number[] = [];
  const idx: number[] = [];
  for (const profile of profiles) {
    const base = pos.length / 3;
    const P = profile.length;
    for (let k = 0; k < count; k++) {
      const o = k * SAMPLE_STRIDE;
      for (const [lat, up] of profile) pos.push(data[o] + data[o + 9] * lat + data[o + 6] * up, data[o + 1] + data[o + 10] * lat + data[o + 7] * up, data[o + 2] + data[o + 11] * lat + data[o + 8] * up);
    }
    for (let k = 0; k < count - 1; k++) {
      const a = base + k * P,
        b = a + P;
      for (let j = 0; j < P - 1; j++) idx.push(a + j, b + j, b + j + 1, a + j, b + j + 1, a + j + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Merge boxes into one geometry with vertex colours (and window UVs for facades). */
function mergeBoxes(boxes: Box[], windows: boolean): THREE.BufferGeometry {
  const pos: number[] = [];
  const nor: number[] = [];
  const col: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const c = new THREE.Color();
  for (const b of boxes) {
    c.setHex(b.color).lerp(new THREE.Color(0xb4b1a7), .25);
    const swap = b.ry !== undefined && Math.abs(Math.abs(b.ry) - Math.PI / 2) < 1e-3;
    const hx = swap ? b.hz : b.hx,
      hz = swap ? b.hx : b.hz,
      hy = b.hy;
    const faces: [number[], number[], number[], number, number][] = [
      // normal, u-axis, v-axis, u-length, v-length
      [[1, 0, 0], [0, 0, -1], [0, 1, 0], hz * 2, hy * 2],
      [[-1, 0, 0], [0, 0, 1], [0, 1, 0], hz * 2, hy * 2],
      [[0, 0, 1], [1, 0, 0], [0, 1, 0], hx * 2, hy * 2],
      [[0, 0, -1], [-1, 0, 0], [0, 1, 0], hx * 2, hy * 2],
      [[0, 1, 0], [1, 0, 0], [0, 0, -1], hx * 2, hz * 2],
      [[0, -1, 0], [1, 0, 0], [0, 0, 1], hx * 2, hz * 2],
    ];
    for (const [n, ua, va, ul, vl] of faces) {
      const base = pos.length / 3;
      const center = [b.x + n[0] * hx, b.y + n[1] * hy, b.z + n[2] * hz];
      const roof = n[1] !== 0;
      const shade = roof ? 0.72 : 1;
      for (const [su, sv] of [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
      ]) {
        pos.push(center[0] + (ua[0] * su * ul) / 2 + (va[0] * sv * vl) / 2, center[1] + (ua[1] * su * ul) / 2 + (va[1] * sv * vl) / 2, center[2] + (ua[2] * su * ul) / 2 + (va[2] * sv * vl) / 2);
        nor.push(n[0], n[1], n[2]);
        col.push(c.r * shade, c.g * shade, c.b * shade);
        // Windows: one cell per 3.5 m across, 3.2 m up; the ground floor and roofs plain.
        if (windows && !roof) uv.push(((su + 1) / 2) * (ul / 3.5) + (b.style ?? 0) * 0.25, ((sv + 1) / 2) * (vl / 3.2));
        else uv.push(0.02, 0.02);
      }
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

function windowTexture(): THREE.CanvasTexture {
  // One cell = one window bay; the (0,0) corner stays plain wall for roofs.
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, 128, 128);
  ctx.fillStyle = "#3c4a5e";
  ctx.fillRect(26, 22, 76, 64);
  const reflection=ctx.createLinearGradient(0,22,0,86);
  reflection.addColorStop(0,"#8a9aa0");reflection.addColorStop(.45,"#697b80");reflection.addColorStop(1,"#25333a");
  ctx.fillStyle = reflection;ctx.fillRect(30,26,68,56);
  ctx.fillStyle="#b0b5b3";ctx.fillRect(62,26,2,56);ctx.fillRect(30,54,68,2);
  ctx.fillStyle = "#e9eef5";
  ctx.fillRect(18, 90, 92, 8);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function roadTexture(): THREE.CanvasTexture {
  // 400 m square, 4 px per metre... at 2048 px that's ~5 px/m: dashed centre
  // lines along every street and zebra crossings at the intersections.
  const N = 2048;
  const c = document.createElement("canvas");
  c.width = c.height = N;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#4a4f59";
  ctx.fillRect(0, 0, N, N);
  const px = (m: number) => ((m + 200) / 400) * N;
  ctx.fillStyle = "rgba(255,255,255,0.75)";
  for (const L of LINES) {
    for (let m = -100; m < 100; m += 6) {
      ctx.fillRect(px(L) - 1, px(m), 2, 3 * (N / 400));
      ctx.fillRect(px(m), px(L) - 1, 3 * (N / 400), 2);
    }
  }
  ctx.fillStyle = "rgba(255,255,255,0.6)";
  for (const a of LINES)
    for (const b of LINES)
      for (let k = -3; k <= 3; k++) {
        ctx.fillRect(px(a + k * 1.6), px(b - 8), 0.8 * (N / 400), 2.2 * (N / 400));
        ctx.fillRect(px(a + k * 1.6), px(b + 6), 0.8 * (N / 400), 2.2 * (N / 400));
      }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function glowTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.3, "rgba(255,255,255,0.5)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

function textTexture(text: string, fg: string, bg: string): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 160;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 512, 160);
  ctx.fillStyle = fg;
  ctx.font = '900 italic 72px "Saira Condensed", "Arial Narrow", sans-serif';
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 256, 84, 480);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export { CITY_STRIDE };
