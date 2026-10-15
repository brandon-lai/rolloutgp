// The car you see: chassis, wheels, rollers, stays, dampers, sponges and the
// body, all placed from the same spec the physics runs. Car-local frame:
// +x forward, +y up, +z right, sim units (1 = 100 mm).

import * as THREE from "three/webgpu";
import { carSpec, type Build } from "../sim/build.ts";
import { part, type ChassisPart, type RollerPart, type StayPart, type TirePart } from "../sim/parts.ts";
import { MM } from "../sim/units.ts";
import { bodyObject, type UploadLookup } from "./body.ts";

const CHASSIS_COLOR: Record<string, number> = {
  "ch-s2": 0x1d1f24,
  "ch-rx": 0x4a5260,
  "ch-vx": 0xe9e6dd,
  "ch-fx": 0x22345c,
  "ch-mx": 0xb8bec8,
  "ch-ax": 0x5c6f8a,
};

export class CarModel {
  readonly root = new THREE.Group();
  private readonly wheels: THREE.Object3D[] = [];
  private readonly radius: number;
  private spin = 0;
  private disposeBody: () => void;
  private readonly owned: THREE.Material[] = [];
  bodyCanvas: HTMLCanvasElement;

  constructor(build: Build, uploads?: UploadLookup) {
    const spec = carSpec(build);
    const ch = part<ChassisPart>(build.chassis);
    const ti = part<TirePart>(build.tires);
    const ro = part<RollerPart>(build.rollers.roller);
    this.radius = spec.wheelRadius;
    const mat = (p: THREE.MeshStandardMaterialParameters) => {
      const m = new THREE.MeshStandardMaterial(p);
      this.owned.push(m);
      return m;
    };

    // Chassis tub.
    const tubMat = mat({ color: CHASSIS_COLOR[ch.id] ?? 0x333333, roughness: 0.55 });
    const tubW = (ch.tread - ti.width - 4) * MM;
    const tub = new THREE.Mesh(new THREE.BoxGeometry((ch.length - 8) * MM, 12 * MM, tubW), tubMat);
    tub.position.y = 7 * MM;
    tub.castShadow = true;
    this.root.add(tub);
    // Bumpers.
    for (const sx of [1, -1]) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(8 * MM, 8 * MM, (ch.tread - 10) * MM), tubMat);
      b.position.set((sx * (ch.length / 2 - 6)) * MM, 8 * MM, 0);
      this.root.add(b);
    }

    // Wheels.
    const tireMat = mat({ color: ti.compound === "soft" ? 0x2b2b2b : ti.compound === "medium" ? 0x1a1a1a : 0x3a3f46, roughness: 0.9 });
    const hubMat = mat({ color: 0xf2f2f2, roughness: 0.4 });
    const tireGeo = new THREE.CylinderGeometry(spec.wheelRadius, spec.wheelRadius, ti.width * MM, 24, 1);
    tireGeo.rotateX(Math.PI / 2);
    const hubGeo = new THREE.CylinderGeometry(spec.wheelRadius * 0.62, spec.wheelRadius * 0.62, ti.width * MM * 1.04, 12, 1);
    hubGeo.rotateX(Math.PI / 2);
    for (const w of spec.wheels) {
      const g = new THREE.Group();
      g.position.set(w.x, w.y, w.z);
      const tire = new THREE.Mesh(tireGeo, tireMat);
      tire.castShadow = true;
      g.add(tire);
      const hub = new THREE.Mesh(hubGeo, hubMat);
      g.add(hub);
      // A spoke so the spin reads.
      const spoke = new THREE.Mesh(new THREE.BoxGeometry(spec.wheelRadius * 1.1, spec.wheelRadius * 0.18, ti.width * MM * 1.08), mat({ color: 0xe8402a }));
      g.add(spoke);
      this.root.add(g);
      this.wheels.push(g);
    }

    // Stays and rollers.
    const stayMat = mat({ color: 0x2a2d33, roughness: 0.7 });
    const rollerMat = mat(ro.type === "bearing" ? { color: 0xc7ccd4, metalness: 0.8, roughness: 0.25 } : { color: 0xf4f1ea, roughness: 0.5 });
    const ringMat = mat({ color: ro.type === "bearing" ? 0x2f80ed : 0xd0ccc4, metalness: 0.4, roughness: 0.4 });
    const stays = [part<StayPart>(build.rollers.front), part<StayPart>(build.rollers.rear)];
    if (build.rollers.side) stays.push(part<StayPart>(build.rollers.side));
    for (const st of stays) {
      for (const tier of st.tiers) {
        const plate = new THREE.Mesh(new THREE.BoxGeometry(12 * MM, 1.6 * MM, (st.span * 2 + 6) * MM), stayMat);
        plate.position.set(st.x * MM, (tier - 4) * MM, 0);
        this.root.add(plate);
        for (const side of [1, -1]) {
          const roller = new THREE.Mesh(new THREE.CylinderGeometry((ro.diameter / 2) * MM, (ro.diameter / 2) * MM, 6 * MM, 16), rollerMat);
          roller.position.set(st.x * MM, tier * MM, side * st.span * MM);
          roller.castShadow = true;
          this.root.add(roller);
          const ring = new THREE.Mesh(new THREE.CylinderGeometry((ro.diameter / 2 + 0.3) * MM, (ro.diameter / 2 + 0.3) * MM, 1.6 * MM, 16), ringMat);
          ring.position.copy(roller.position);
          this.root.add(ring);
        }
      }
    }

    // Mass dampers.
    const brass = mat({ color: 0xd4a72c, metalness: 0.85, roughness: 0.3 });
    for (const d of spec.dampers) {
      const r = (2.5 + d.mass * 400) * MM;
      const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 6 * MM, 14), brass);
      m.position.set(d.x, d.y, d.z);
      this.root.add(m);
    }

    // Brake sponges.
    if (build.brakes.part) {
      const color = build.brakes.part === "br-light" ? 0x9aa0a6 : build.brakes.part === "br-medium" ? 0xd7263d : 0x111111;
      const spongeMat = mat({ color, roughness: 1 });
      for (const br of spec.brakes) {
        const pad = new THREE.Mesh(new THREE.BoxGeometry(6 * MM, 3 * MM, 40 * MM), spongeMat);
        const groundY = -(spec.wheelRadius - spec.axleY);
        pad.position.set(br.x, groundY + br.gap + 1.5 * MM, br.z);
        this.root.add(pad);
      }
    }

    const body = bodyObject(build.body, uploads);
    this.bodyCanvas = body.canvas;
    this.root.add(body.object);
    this.disposeBody = body.dispose;
  }

  /** Spin the wheels for a ground speed (u/s) over dt seconds. */
  roll(speed: number, dt: number): void {
    this.spin -= (speed / this.radius) * dt;
    for (const w of this.wheels) w.rotation.z = this.spin;
  }

  setPose(x: number, y: number, z: number, qx: number, qy: number, qz: number, qw: number): void {
    this.root.position.set(x, y, z);
    this.root.quaternion.set(qx, qy, qz, qw);
  }

  dispose(): void {
    this.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
    });
    this.owned.forEach((m) => m.dispose());
    this.disposeBody();
  }
}
