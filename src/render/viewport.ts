// One renderer for the whole app (WebGPU where the browser has it, WebGL 2
// otherwise, through the same three.js code path). Screens swap the View it draws.

import * as THREE from "three/webgpu";

export interface View {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  /** Called every frame before drawing. dt in seconds (clamped). */
  update(dt: number): void;
  dispose(): void;
}

export class Viewport {
  readonly renderer: THREE.WebGPURenderer;
  readonly canvas: HTMLCanvasElement;
  private view: View | null = null;
  private last = performance.now();
  private observer: ResizeObserver;
  backend: "webgpu" | "webgl2" = "webgl2";
  /** Frames per second, smoothed, for the settings screen. */
  fps = 60;

  private constructor(canvas: HTMLCanvasElement, renderer: THREE.WebGPURenderer) {
    this.canvas = canvas;
    this.renderer = renderer;
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(canvas);
  }

  static async create(canvas: HTMLCanvasElement, quality: "high" | "low"): Promise<Viewport> {
    const renderer = new THREE.WebGPURenderer({ canvas, antialias: quality === "high", alpha: false, powerPreference: "high-performance" });
    await renderer.init();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, quality === "high" ? 2 : 1));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = quality === "high";
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    const vp = new Viewport(canvas, renderer);
    const backend = (renderer as unknown as { backend?: { isWebGPUBackend?: boolean } }).backend;
    vp.backend = backend?.isWebGPUBackend ? "webgpu" : "webgl2";
    vp.resize();
    renderer.setAnimationLoop(() => vp.frame());
    return vp;
  }

  setView(v: View | null): void {
    if (this.view && this.view !== v) this.view.dispose();
    this.view = v;
    this.resize();
  }

  get current(): View | null {
    return this.view;
  }

  private resize(): void {
    const w = this.canvas.clientWidth || 1;
    const h = this.canvas.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    if (this.view) {
      this.view.camera.aspect = w / h;
      this.view.camera.updateProjectionMatrix();
    }
  }

  private frame(): void {
    const now = performance.now();
    const raw = (now - this.last) / 1000;
    this.last = now;
    if (raw > 0) this.fps = this.fps * 0.95 + (1 / raw) * 0.05;
    const dt = Math.min(0.1, raw);
    const v = this.view;
    if (!v) return;
    v.update(dt);
    this.renderer.render(v.scene, v.camera);
  }

  setQuality(q: "high" | "low"): void {
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, q === "high" ? 2 : 1));
    this.renderer.shadowMap.enabled = q === "high";
    this.resize();
  }

  dispose(): void {
    this.renderer.setAnimationLoop(null);
    this.observer.disconnect();
    this.view?.dispose();
    this.renderer.dispose();
  }
}
