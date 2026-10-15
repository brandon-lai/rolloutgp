// The race hall: a big floor, soft daylight, a sun for shadows, and some
// banners so the room reads as an event and not a void.

import * as THREE from "three/webgpu";
import { TRACK_STAND } from "../sim/track/geometry.ts";

export function hallEnvironment(scene: THREE.Scene, bounds: { minX: number; maxX: number; minZ: number; maxZ: number }): () => void {
  const disposables: { dispose(): void }[] = [];
  scene.background = new THREE.Color(0xbcd7ee);
  scene.fog = new THREE.Fog(0xbcd7ee, 120, 420);

  const cx = (bounds.minX + bounds.maxX) / 2;
  const cz = (bounds.minZ + bounds.maxZ) / 2;
  const span = Math.max(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ);

  const hemi = new THREE.HemisphereLight(0xeaf4ff, 0x8a7a66, 1.6);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff3dd, 2.2);
  sun.position.set(cx + span * 0.4, 60, cz + span * 0.25);
  sun.target.position.set(cx, 0, cz);
  sun.castShadow = true;
  const sc = sun.shadow.camera as THREE.OrthographicCamera;
  sc.left = -span * 0.65;
  sc.right = span * 0.65;
  sc.top = span * 0.65;
  sc.bottom = -span * 0.65;
  sc.near = 1;
  sc.far = 200;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0004;
  scene.add(sun, sun.target);

  // Floor: a warm hall floor with a faint tile grid.
  const tex = floorTexture();
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(40, 40);
  const floorMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(800, 800), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(cx, -TRACK_STAND, cz);
  floor.receiveShadow = true;
  scene.add(floor);
  disposables.push(floor.geometry, floorMat, tex);

  // A low barrier around the track area and a few banners.
  const ring = Math.max(18, span * 0.62);
  const bannerColors = [0xe8402a, 0xffd23f, 0x1f9bd1, 0xffffff];
  const bannerGeo = new THREE.BoxGeometry(14, 3.2, 0.3);
  const poleGeo = new THREE.BoxGeometry(0.25, 5, 0.25);
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x333944, roughness: 0.6 });
  disposables.push(bannerGeo, poleGeo, poleMat);
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const mat = new THREE.MeshStandardMaterial({ color: bannerColors[i % bannerColors.length], roughness: 0.6 });
    disposables.push(mat);
    const b = new THREE.Mesh(bannerGeo, mat);
    b.position.set(cx + Math.cos(a) * ring * 1.6, -TRACK_STAND + 4.2, cz + Math.sin(a) * ring * 1.6);
    b.lookAt(cx, b.position.y, cz);
    scene.add(b);
    for (const side of [-1, 1]) {
      const pole = new THREE.Mesh(poleGeo, poleMat);
      pole.position.copy(b.position).add(new THREE.Vector3(Math.cos(a + Math.PI / 2) * side * 7, -1.6, Math.sin(a + Math.PI / 2) * side * 7));
      scene.add(pole);
    }
  }
  return () => disposables.forEach((d) => d.dispose());
}

function floorTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#c9b99f";
  ctx.fillRect(0, 0, 64, 64);
  ctx.strokeStyle = "rgba(90,70,50,0.18)";
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, 62, 62);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
