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
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(32, 1, 0.05, 200);
  private car: CarModel | null = null;
  private readonly turntable = new THREE.Group();
  private readonly disposables: { dispose(): void }[] = [];
  private yaw = -0.6;
  private pitch = 0.32;
  private dist = 7.2;
  private spinVel = 0.25;
  private dragging = false;
  private canvas: HTMLCanvasElement | null = null;
  private cleanup: (() => void) | null = null;
  /** Where the car sits on screen, from centre: fraction of width (+ right). */
  offset = 0;
  /** ...and of height (+ up). */
  offsetY = 0;
  /** World width that must fit across the screen, u. */
  fitWidth = 3.4;
  private cogMarker: THREE.Mesh;
  showCog = false;

  constructor() {
    this.scene.background = new THREE.Color(0x0d1b3e);
    this.scene.fog = new THREE.Fog(0x0d1b3e, 14, 30);
    const hemi = new THREE.HemisphereLight(0xdfe9ff, 0x1a2140, 1.4);
    const key = new THREE.DirectionalLight(0xffffff, 2.4);
    key.position.set(4, 7, 5);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    const sc = key.shadow.camera as THREE.OrthographicCamera;
    sc.left = sc.bottom = -4;
    sc.right = sc.top = 4;
    const rim = new THREE.DirectionalLight(0x7fb8ff, 1.4);
    rim.position.set(-5, 3, -4);
    this.scene.add(hemi, key, rim);

    // Turntable: a disc with a checker ring.
    const discMat = new THREE.MeshStandardMaterial({ color: 0x1d3a78, roughness: 0.6, metalness: 0.1 });
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.5, 0.12, 64), discMat);
    disc.position.y = -0.18;
    disc.receiveShadow = true;
    const ringTex = checkerRing();
    const ringMat = new THREE.MeshStandardMaterial({ map: ringTex, roughness: 0.7, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(ringGeometry(2.0, 2.4, 128, 16), ringMat);
    ring.position.y = -0.115;
    const floorMat = new THREE.MeshStandardMaterial({ color: 0x0b1530, roughness: 0.95 });
    const floor = new THREE.Mesh(new THREE.CircleGeometry(40, 48), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.24;
    floor.receiveShadow = true;
    this.turntable.add(disc, ring);
    this.scene.add(this.turntable, floor);
    this.disposables.push(disc.geometry, discMat, ring.geometry, ringMat, ringTex, floor.geometry, floorMat);

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

  update(dt: number): void {
    if (!this.dragging) {
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
    this.cleanup?.();
    this.car?.dispose();
    this.disposables.forEach((d) => d.dispose());
    void this.canvas;
  }
}

function checkerRing(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 32;
  const ctx = c.getContext("2d")!;
  for (let i = 0; i < 16; i++)
    for (let j = 0; j < 2; j++) {
      ctx.fillStyle = (i + j) % 2 ? "#f5f5f2" : "#111";
      ctx.fillRect(i * 16, j * 16, 16, 16);
    }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

/** Flat ring whose texture runs round it (u = angle), unlike RingGeometry's planar UVs. */
function ringGeometry(r0: number, r1: number, segs: number, repeat: number): THREE.BufferGeometry {
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= segs; i++) {
    const a = (i / segs) * Math.PI * 2;
    const c = Math.cos(a),
      s = Math.sin(a);
    pos.push(c * r0, 0, s * r0, c * r1, 0, s * r1);
    uv.push((i / segs) * repeat, 0, (i / segs) * repeat, 1);
    if (i < segs) {
      const k = i * 2;
      idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
