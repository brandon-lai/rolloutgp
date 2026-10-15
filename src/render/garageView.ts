import { disposeObject } from "./models/parts.ts";
import { reducedMotion, type Quality } from "./quality.ts";
// The car on a turntable: the home screen, the garage and the body shop. Drag to
// spin it; it idles round slowly on its own.

import * as THREE from "three/webgpu";
import { carSpec, type Build } from "../sim/build.ts";
import { CarModel } from "./car.ts";
import type { View } from "./viewport.ts";
import type { UploadLookup } from "./body.ts";
import { BODY_SKIRT } from "../sim/body.ts";
import { MM } from "../sim/units.ts";

export class GarageView implements View {
  macro = true;
  focusDistance = 7;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(32, 1, 0.05, 200);
  private car: CarModel | null = null;
  private readonly turntable = new THREE.Group();
  private readonly disposables: { dispose(): void }[] = [];
  private yaw = -0.6;
  private pitch = 0.32;
  private dist = 5.4;
  private spinVel = 0.25;
  private dragging = false;
  private canvas: HTMLCanvasElement | null = null;
  private cleanup: (() => void) | null = null;
  /** Where the car sits on screen, from centre: fraction of width (+ right). */
  offset = 0;
  /** ...and of height (+ up). */
  offsetY = 0;
  /** World width that must fit across the screen, u. */
  fitWidth = 2.5;
  private cogMarker: THREE.Mesh;
  private dead = false;
  private workshop: THREE.Object3D | null = null;
  showCog = false;

  constructor() {
    this.scene.background = new THREE.Color(0x191c1e);
    this.scene.fog = new THREE.Fog(0x191c1e, 14, 30);
    const hemi = new THREE.HemisphereLight(0xe5e9ec, 0x35312b, .35);
    const key = new THREE.DirectionalLight(0xfff6e7, 3.2);
    key.position.set(4, 7, 5);
    key.castShadow = true;
    key.shadow.bias = -.0001;
    key.shadow.normalBias = .002;
    key.shadow.mapSize.set(1024, 1024);
    const sc = key.shadow.camera as THREE.OrthographicCamera;
    sc.left = sc.bottom = -4;
    sc.right = sc.top = 4;
    const rim = new THREE.DirectionalLight(0xcbdce9, 1.5);
    rim.position.set(-5, 3, -4);
    this.scene.add(hemi, key, rim);

    const discMat = new THREE.MeshPhysicalMaterial({ color: 0x33383c, roughness: .38, metalness: .65, clearcoat: .25 });
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(1.35, 1.4, .1, 64), discMat);
    disc.position.y = -.17;disc.receiveShadow = true;
    const rimMat = new THREE.MeshStandardMaterial({color:0x9b9e9e,metalness:.85,roughness:.28});
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.36,.018,8,64),rimMat);
    ring.rotation.x=Math.PI/2;ring.position.y=-.125;
    const floorMat = new THREE.MeshStandardMaterial({color:0x282b2c,roughness:.75});
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(80,80),floorMat);
    floor.rotation.x=-Math.PI/2;floor.position.y=-.5;floor.receiveShadow=true;
    this.turntable.add(disc,ring);this.scene.add(this.turntable,floor);
    this.disposables.push(disc.geometry,discMat,ring.geometry,rimMat,floor.geometry,floorMat);
    // Load props after the hero is available. Failure leaves a complete turntable.
    void import('./workshopAsset.ts').then(m=>m.loadWorkshop()).then(model=>{
      if(this.dead){disposeObject(model);return;}
      this.workshop=model;this.scene.add(model);
    }).catch(()=>{});

    this.cogMarker = new THREE.Mesh(new THREE.SphereGeometry(0.06, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffd23f, depthTest: false }));
    this.cogMarker.renderOrder = 10;
    this.cogMarker.visible = false;
    this.scene.add(this.cogMarker);
  }

  /** Attach pointer controls to the canvas. */
  attach(canvas: HTMLCanvasElement): void {
    this.canvas = canvas;
    let lx = 0,
      ly = 0;
    const down = (e: PointerEvent) => {
      this.dragging = true;
      lx = e.clientX;
      ly = e.clientY;
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {
        /* pointer already gone */
      }
    };
    const move = (e: PointerEvent) => {
      if (!this.dragging) return;
      const dx = e.clientX - lx,
        dy = e.clientY - ly;
      lx = e.clientX;
      ly = e.clientY;
      this.yaw -= dx * 0.008;
      this.pitch = Math.min(1.2, Math.max(0.05, this.pitch + dy * 0.005));
      this.spinVel = -dx * 0.4;
    };
    const up = () => {
      this.dragging = false;
    };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      this.dist = Math.min(9, Math.max(2.6, this.dist * (1 + e.deltaY * 0.001)));
    };
    canvas.addEventListener("pointerdown", down);
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointercancel", up);
    canvas.addEventListener("wheel", wheel, { passive: false });
    this.cleanup = () => {
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", up);
      canvas.removeEventListener("pointercancel", up);
      canvas.removeEventListener("wheel", wheel);
    };
  }

  setBuild(build: Build, uploads?: UploadLookup): void {
    if (this.car) {
      this.turntable.remove(this.car.root);
      this.car.dispose();
    }
    this.car = new CarModel(build, uploads);
    // Rest the wheels on the disc: the car's origin is its floor, which sits one
    // ground clearance above the tires' contact patch.
    const spec = carSpec(build);
    this.car.root.position.y = -0.12 + (spec.wheelRadius - spec.axleY);
    this.turntable.add(this.car.root);
  }

  /** Centre of gravity, car-local mm, for the body shop's marker. */
  setCog(x: number, y: number): void {
    this.cogMarker.userData.local = new THREE.Vector3(x * MM, (y + BODY_SKIRT * 0) * MM, 0);
  }

  setQuality(q: Quality) { this.car?.setQuality(q); }

  update(dt: number): void {
    if (!this.dragging && !reducedMotion()) {
      this.spinVel += (0.25 - this.spinVel) * Math.min(1, dt * 1.5);
      this.yaw += this.spinVel * dt * 0.6;
    }
    this.turntable.rotation.y = this.yaw;
    const target = new THREE.Vector3(0, 0.15, 0);
    // Back off on narrow screens so the whole car (and some disc) fits across.
    const hfov = 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * this.camera.aspect);
    const fit = (this.fitWidth / 2) / Math.tan(hfov / 2);
    const dist = Math.max(this.dist, fit);
    this.camera.position.set(Math.sin(0.4) * dist * Math.cos(this.pitch), Math.sin(this.pitch) * dist + 0.2, Math.cos(0.4) * dist * Math.cos(this.pitch));
    this.camera.lookAt(target);
    this.focusDistance = this.camera.position.distanceTo(target);
    // Shift the picture so the car sits clear of the panels: offset is the car's
    // screen position from centre as a fraction of width (x) and height (y, up).
    const W = 1000 * this.camera.aspect;
    this.camera.setViewOffset(W, 1000, -this.offset * W, this.offsetY * 1000, W, 1000);
    this.camera.updateProjectionMatrix();
    if (this.car && this.cogMarker.userData.local) {
      this.cogMarker.visible = this.showCog;
      const p = (this.cogMarker.userData.local as THREE.Vector3).clone().applyMatrix4(this.car.root.matrixWorld);
      this.cogMarker.position.copy(p);
    }
  }

  dispose(): void {
    this.dead = true;
    if(this.workshop)disposeObject(this.workshop);
    disposeObject(this.cogMarker);
    this.cleanup?.();
    this.car?.dispose();
    this.disposables.forEach((d) => d.dispose());
    void this.canvas;
  }
}
