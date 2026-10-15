// One renderer for the whole app (WebGPU where the browser has it, WebGL 2
// otherwise, through the same three.js code path). Screens swap the View it draws.

import * as THREE from "three/webgpu";
import { pass, uniform, add } from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { dof } from 'three/addons/tsl/display/DepthOfFieldNode.js';
import { QUALITY, autoQuality, setRenderQuality, type Quality } from './quality.ts';
import { studioHDR } from './lighting.ts';

export interface View {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  /** Called every frame before drawing. dt in seconds (clamped). */
  update(dt: number): void;
  focusDistance?: number;
  macro?: boolean;
  setQuality?(q: Quality): void;
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
  quality: Quality = autoQuality();
  private environment: THREE.RenderTarget | null = null;
  private pipeline: THREE.RenderPipeline | null = null;
  private effects: { dispose(): void }[] = [];
  private focus = uniform(7);
  private aperture = uniform(0);
  private overlay: HTMLOutputElement | null = null;
  private diagnosticAt = 0;
  private frameMs = 16.7;
  onError?: (message:string)=>void;

  private constructor(canvas: HTMLCanvasElement, renderer: THREE.WebGPURenderer) {
    this.canvas = canvas;
    this.renderer = renderer;
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(canvas);
  }

  static async create(canvas: HTMLCanvasElement, quality: Quality): Promise<Viewport> {
    const renderer = new THREE.WebGPURenderer({ canvas, antialias: true, alpha: false, powerPreference: "high-performance" });
    await renderer.init();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, QUALITY[quality].dpr));
    renderer.toneMapping = THREE.AgXToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = QUALITY[quality].shadow > 0;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    const vp = new Viewport(canvas, renderer);
    const backend = (renderer as unknown as { backend?: { isWebGPUBackend?: boolean } }).backend;
    vp.backend = backend?.isWebGPUBackend ? "webgpu" : "webgl2";
    vp.quality = quality;
    setRenderQuality(quality);
    const hdr = studioHDR();
    const pmrem = new THREE.PMREMGenerator(renderer);
    vp.environment = pmrem.fromEquirectangular(hdr);
    pmrem.dispose(); hdr.dispose();
    if (import.meta.env.DEV) {
      vp.overlay = document.createElement('output');
      vp.overlay.className = 'frame-stats';
      vp.overlay.hidden = new URLSearchParams(location.search).get('stats') !== '1';
      document.body.append(vp.overlay);
    }
    renderer.info.autoReset = false;
    vp.resize();
    renderer.setAnimationLoop(() => vp.frame());
    return vp;
  }

  setView(v: View | null): void {
    if (this.view && this.view !== v) this.view.dispose();
    this.clearPipeline();
    this.view = v;
    if (v) {
      v.scene.environment = this.environment?.texture ?? null;
      v.scene.environmentIntensity = .8;
      this.configureView();
    }
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
    try {
      v.update(dt);
      this.focus.value = v.focusDistance ?? 7;
      this.aperture.value = v.macro ? 1.1 : 0;
      this.renderer.info.reset();
      if (this.pipeline) this.pipeline.render();
      else this.renderer.render(v.scene, v.camera);
    } catch(error) {
      // A failed render must not leave an interactive HUD over a frozen image.
      this.renderer.setAnimationLoop(null);
      this.onError?.(String(error instanceof Error?error.message:error));
      return;
    }
    if (import.meta.env.DEV) {
      this.frameMs = this.frameMs * .9 + raw * 1000 * .1;
      if (this.overlay && now - this.diagnosticAt > 500) {
        this.diagnosticAt = now;
        const r = this.renderer.info.render;
        this.overlay.textContent = `${this.quality} · ${this.backend} · ${this.frameMs.toFixed(1)} ms · ${r.drawCalls} draws · ${r.triangles.toLocaleString()} triangles`;
        this.canvas.dataset.metrics = JSON.stringify({ quality: this.quality, backend: this.backend, frameMs: this.frameMs, draws: r.drawCalls, triangles: r.triangles });
      }
    }
  }

  private clearPipeline() {
    this.pipeline?.dispose(); this.pipeline = null;
    this.effects.forEach(e => e.dispose()); this.effects = [];
  }

  private configureView() {
    const v = this.view;
    if (!v) return;
    const config = QUALITY[this.quality];
    v.setQuality?.(this.quality);
    v.scene.traverse(o => {
      const light = o as THREE.DirectionalLight;
      if (!light.isDirectionalLight) return;
      if (light.shadow.mapSize.x !== config.shadow && config.shadow > 0) {
        light.shadow.map?.dispose(); light.shadow.map = null;
        light.shadow.mapSize.setScalar(config.shadow);
      }
    });
    if (!config.bloom) return;
    const scenePass = pass(v.scene, v.camera);
    this.effects.push(scenePass);
    const color = scenePass.getTextureNode('output');
    const glow = bloom(color, .12, .35, 1.5);
    this.effects.push(glow);
    let output = color.add(glow);
    if (config.dof && v.macro !== undefined) {
      const lens = dof(color, scenePass.getViewZNode(), this.focus, .7, this.aperture);
      this.effects.push(lens);
      output = add(lens as unknown as THREE.Node<"vec4">, glow);
    }
    this.pipeline = new THREE.RenderPipeline(this.renderer, output);
  }

  setQuality(q: Quality): void {
    if (this.quality === q) return;
    this.quality = q;
    setRenderQuality(q);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, QUALITY[q].dpr));
    this.renderer.shadowMap.enabled = QUALITY[q].shadow > 0;
    this.clearPipeline(); this.configureView(); this.resize();
  }

  dispose(): void {
    this.renderer.setAnimationLoop(null);
    this.observer.disconnect();
    this.view?.dispose();
    this.clearPipeline();
    this.environment?.dispose();
    this.overlay?.remove();
    this.renderer.dispose();
  }
}
