import { cutShell } from "./models/shellCuts.ts";
import { microSurface } from "./surface.ts";
import { bevelBox } from "./models/parts.ts";
import { QUALITY, currentQuality } from "./quality.ts";
// Body (cowl) mesh and paint from a recipe.
//
// The shell is a loft through the recipe's cross-sections (superellipses, so a
// "squareness" handle runs from round to boxy), smoothed between sections with a
// Catmull-Rom curve. Paint is drawn onto a canvas laid out along the body (u =
// nose to tail, v = round the shell), which is how decals wrap the shape.

import * as THREE from "three/webgpu";
import { BODY_SKIRT, sectionTopAt, type BodyRecipe, type BodySection, type Decal } from "../sim/body.ts";
import { MM } from "../sim/units.ts";
import { drawSticker } from "./stickers.ts";

const RING = 28; // points around each cross-section
const BETWEEN = 6; // interpolated rings between authored sections
const TEX_W = 1024;
const TEX_H = 512;

interface Ring {
  x: number;
  w: number;
  top: number;
  sq: number;
}

function catmull(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t,
    t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

/** Smooth rings nose to tail. */
export function bodyRings(sections: BodySection[]): Ring[] {
  const s = [...sections].sort((a, b) => b.x - a.x);
  const out: Ring[] = [];
  for (let i = 0; i < s.length - 1; i++) {
    const p0 = s[Math.max(0, i - 1)],
      p1 = s[i],
      p2 = s[i + 1],
      p3 = s[Math.min(s.length - 1, i + 2)];
    for (let j = 0; j < BETWEEN; j++) {
      const t = j / BETWEEN;
      out.push({
        x: p1.x + (p2.x - p1.x) * t,
        w: Math.min(Math.max(p1.w,p2.w), Math.max(Math.min(p1.w,p2.w), catmull(p0.w, p1.w, p2.w, p3.w, t))),
        top: Math.min(Math.max(p1.top,p2.top), Math.max(Math.min(p1.top,p2.top), catmull(p0.top, p1.top, p2.top, p3.top, t))),
        sq: Math.min(1, Math.max(0, catmull(p0.sq, p1.sq, p2.sq, p3.sq, t))),
      });
    }
  }
  const last = s[s.length - 1];
  out.push({ x: last.x, w: last.w, top: last.top, sq: last.sq });
  return out;
}

/** Point on a cross-section. a: 0 = right skirt, 0.5 = top centre, 1 = left skirt. */
export function sectionPoint(r: Ring, a: number): { y: number; z: number } {
  const n = 2 + r.sq * 7;
  const th = a * Math.PI;
  const c = Math.cos(th),
    sn = Math.sin(th);
  const z = r.w * Math.sign(c) * Math.pow(Math.abs(c), 2 / n);
  const y = BODY_SKIRT + (r.top - BODY_SKIRT) * Math.pow(Math.abs(sn), 2 / n);
  return { y, z };
}

/** Shell geometry in sim units (car-local: +x forward, +y up, +z right). */
export function shellGeometry(recipe: BodyRecipe): THREE.BufferGeometry {
  const rings = bodyRings(recipe.sections);
  const front = rings[0].x,
    rear = rings[rings.length - 1].x;
  const len = front - rear;
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  for (const r of rings) {
    for (let k = 0; k <= RING; k++) {
      const a = k / RING;
      const p = sectionPoint(r, a);
      pos.push(r.x * MM, p.y * MM, p.z * MM);
      uv.push((front - r.x) / len, 1 - a);
    }
  }
  const row = RING + 1;
  for (let i = 0; i < rings.length - 1; i++) {
    for (let k = 0; k < RING; k++) {
      const a = i * row + k,
        b = a + row;
      idx.push(a, a + 1, b, a + 1, b + 1, b);
    }
  }
  // Nose cap: fan to a point just ahead of the first ring, low down.
  const n0 = rings[0];
  const nose = pos.length / 3;
  pos.push(n0.x * MM, (BODY_SKIRT + (n0.top - BODY_SKIRT) * 0.35) * MM, 0);
  uv.push(0, 0.5);
  for (let k = 0; k < RING; k++) idx.push(nose, k + 1, k);
  // Tail panel.
  const lastStart = (rings.length - 1) * row;
  const lt = rings[rings.length - 1];
  const tail = pos.length / 3;
  pos.push(lt.x * MM, (BODY_SKIRT + (lt.top - BODY_SKIRT) * 0.45) * MM, 0);
  uv.push(1, 0.5);
  for (let k = 0; k < RING; k++) idx.push(tail, lastStart + k, lastStart + k + 1);

  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  const holes = Array.from({ length: recipe.holes }, (_, i) => ({
    u: .25 + Math.floor(i/2) / Math.max(1, Math.ceil(recipe.holes/2)) * .55,
    v: .5 + (i%2===0?1:-1)*.3, rx: 5/len, ry: 5/girth(recipe),
  }));
  return cutShell(g, holes, (recipe.clear ? .28 : .55) * MM);
}

/** Girth of the widest section, mm (for undistorted decals). */
function girth(recipe: BodyRecipe): number {
  let best = 0;
  for (const s of recipe.sections) best = Math.max(best, Math.PI * Math.sqrt((s.w * s.w + (s.top - BODY_SKIRT) ** 2) / 2));
  return best;
}

export type UploadLookup = (id: string) => HTMLImageElement | ImageBitmap | null;

/** Paint the livery onto a canvas: base, gradient, holes, decals. */
export function paintCanvas(recipe: BodyRecipe, uploads?: UploadLookup, canvas?: HTMLCanvasElement): HTMLCanvasElement {
  const c = canvas ?? document.createElement("canvas");
  c.width = QUALITY[currentQuality()].texture;
  c.height = c.width / 2;
  const ctx = c.getContext("2d")!;
  ctx.scale(c.width / TEX_W, c.height / TEX_H);
  const p = recipe.paint;
  ctx.globalAlpha = 1;
  if (p.gradient === "nose-tail") {
    const g = ctx.createLinearGradient(0, 0, TEX_W, 0);
    g.addColorStop(0, p.base);
    g.addColorStop(1, p.base2);
    ctx.fillStyle = g;
  } else if (p.gradient === "top-bottom") {
    const g = ctx.createLinearGradient(0, 0, 0, TEX_H);
    g.addColorStop(0, p.base2);
    g.addColorStop(0.5, p.base);
    g.addColorStop(1, p.base2);
    ctx.fillStyle = g;
  } else ctx.fillStyle = p.base;
  ctx.fillRect(0, 0, TEX_W, TEX_H);

  const rings = bodyRings(recipe.sections);
  const length = rings[0].x - rings[rings.length - 1].x;
  // Decals are sized by body length; v pixels cover more millimetres than u
  // pixels, so squash y to keep stickers round.
  const ky = TEX_H / girth(recipe) / (TEX_W / length);

  const draw = (d: Decal, mirrored: boolean) => {
    const v = mirrored ? -d.v : d.v;
    ctx.save();
    ctx.translate(d.u * TEX_W, (0.5 + v * 0.5) * TEX_H);
    ctx.scale(1, ky);
    ctx.rotate(((mirrored ? -d.rot : d.rot) * Math.PI) / 180);
    const size = d.size * TEX_W;
    if (mirrored) ctx.scale(1, -1);
    drawSticker(ctx, d.sticker, size, d.color, uploads);
    ctx.restore();
  };
  for (const d of p.decals) {
    draw(d, false);
    if (d.mirror && Math.abs(d.v) > 0.02) draw(d, true);
  }
  return c;
}

export function finishMaterial(recipe: BodyRecipe, map: THREE.Texture): THREE.MeshPhysicalMaterial {
  const f = recipe.paint.finish;
  const detail = microSurface(Math.min(256, QUALITY[currentQuality()].texture));
  const m = new THREE.MeshPhysicalMaterial({ map, side: THREE.DoubleSide,
    metalness: f === 'metallic' ? .55 : 0,
    roughness: f === 'matte' ? .72 : .26,
    clearcoat: f === 'matte' ? .05 : 1,
    clearcoatRoughness: .12,
    roughnessMap: detail.roughness, normalMap: detail.normal,
    normalScale: new THREE.Vector2(.15,.15),
  });
  if (f === 'clear') {
    m.transmission = currentQuality() === 'low' ? 0 : .82;
    m.thickness = .28 * MM;
    m.ior = 1.58;
    m.attenuationColor.set(recipe.paint.base);
    m.attenuationDistance = .08;
    m.roughness = .12;
    if (currentQuality() === 'low') { m.transparent = true; m.opacity = .45; }
  }
  return m;
}

/** Snap-on parts: wings, fins, intakes, canopies, light pods. */
export function addonMeshes(recipe: BodyRecipe, accent: THREE.Material, glass: THREE.Material): THREE.Object3D[] {
  const out: THREE.Object3D[] = [];
  const secs = [...recipe.sections].sort((a, b) => b.x - a.x);
  const halfW = Math.max(...secs.map((s) => s.w));
  for (const ad of recipe.addons) {
    const top = sectionTopAt(secs, ad.x);
    const s = ad.size;
    if (ad.kind === "wing") {
      const g = new THREE.Group();
      const lift = 6 + 16 * s;
      const chord = 14 + 12 * s;
      const span = halfW * 2 * (0.75 + 0.2 * s);
      const plate = new THREE.Mesh(bevelBox(chord * MM, 1.4 * MM, span * MM), accent);
      plate.position.set(ad.x * MM, (top + lift) * MM, 0);
      plate.rotation.z = -0.12;
      g.add(plate);
      for (const side of [1, -1]) {
        const strut = new THREE.Mesh(bevelBox(6 * MM, lift * MM, 1.4 * MM), accent);
        strut.position.set(ad.x * MM, (top + lift / 2) * MM, side * span * 0.32 * MM);
        g.add(strut);
        const end = new THREE.Mesh(bevelBox((chord + 4) * MM, (6 + 4 * s) * MM, 1.2 * MM), accent);
        end.position.set(ad.x * MM, (top + lift) * MM, (side * span) / 2 * MM);
        g.add(end);
      }
      out.push(g);
    } else if (ad.kind === "fin") {
      const h = 14 * (0.4 + 0.6 * s);
      const shape = new THREE.Shape();
      shape.moveTo(14, 0);
      shape.lineTo(-10, 0);
      shape.lineTo(-14, h);
      shape.lineTo(14, 0);
      const geo = new THREE.ExtrudeGeometry(shape, { depth: 1.6, bevelEnabled: false });
      geo.scale(MM, MM, MM);
      geo.translate(0, 0, -0.8 * MM);
      const fin = new THREE.Mesh(geo, accent);
      fin.position.set(ad.x * MM, (top - 1) * MM, 0);
      out.push(fin);
    } else if (ad.kind === "intake") {
      const box = new THREE.Mesh(bevelBox((16 + 10 * s) * MM, (5 + 4 * s) * MM, (18 + 10 * s) * MM), accent);
      box.position.set(ad.x * MM, (top + 1.5) * MM, 0);
      out.push(box);
      const mouth = new THREE.Mesh(bevelBox(1 * MM, (3 + 3 * s) * MM, (14 + 8 * s) * MM), new THREE.MeshStandardMaterial({ color: 0x0b0d12, roughness: 0.9 }));
      mouth.position.set((ad.x + (8 + 5 * s)) * MM, (top + 2) * MM, 0);
      out.push(mouth);
    } else if (ad.kind === "canopy") {
      const geo = new THREE.SphereGeometry(1, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2);
      const cn = new THREE.Mesh(geo, glass);
      cn.scale.set((20 + 16 * s) * MM, (6 + 8 * s) * MM, (12 + 8 * s) * MM);
      cn.position.set(ad.x * MM, (top - 2) * MM, 0);
      out.push(cn);
    } else if (ad.kind === "lightpod") {
      for (const side of [1, -1]) {
        const lamp = new THREE.Mesh(new THREE.CylinderGeometry((3 + 2 * s) * MM, (3 + 2 * s) * MM, 2 * MM, 12), new THREE.MeshStandardMaterial({ color: 0xfff6c8, emissive: 0xffe066, emissiveIntensity: 0.6 }));
        lamp.rotation.z = Math.PI / 2;
        const frontX = secs[0].x;
        lamp.position.set((frontX - 4) * MM, (secs[0].top * 0.8) * MM, side * secs[0].w * 0.55 * MM);
        out.push(lamp);
      }
    }
  }
  return out;
}

/** The whole body: shell + addons, with a disposer. */
export function bodyObject(recipe: BodyRecipe, uploads?: UploadLookup): { object: THREE.Group; dispose(): void; canvas: HTMLCanvasElement } {
  const canvas = paintCanvas(recipe, uploads);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const mat = finishMaterial(recipe, tex);
  const detailCanvas = document.createElement('canvas');
  detailCanvas.width = TEX_W; detailCanvas.height = TEX_H;
  const ctx = detailCanvas.getContext('2d')!;
  ctx.fillStyle = '#808080'; ctx.fillRect(0,0,TEX_W,TEX_H);
  ctx.strokeStyle = '#606060'; ctx.lineWidth = 2;
  for (const y of [TEX_H*.24,TEX_H*.76]) { ctx.beginPath(); ctx.moveTo(80,y); ctx.lineTo(940,y); ctx.stroke(); }
  const length = recipe.sections[0].x-recipe.sections[recipe.sections.length-1].x;
  for (const d of recipe.paint.decals) for (const mirror of d.mirror ? [1,-1] : [1]) {
    ctx.save();ctx.translate(d.u*TEX_W,(.5+d.v*.5*mirror)*TEX_H);
    ctx.scale(1,TEX_H/girth(recipe)/(TEX_W/length));ctx.rotate(d.rot*Math.PI/180*mirror);
    drawSticker(ctx,d.sticker,d.size*TEX_W,'#aaaaaa',uploads);ctx.restore();
  }
  const pixels = ctx.getImageData(0,0,TEX_W,TEX_H);
  const normal = new Uint8Array(pixels.data.length);
  const height = (x: number, y: number) => pixels.data[((Math.max(0,Math.min(TEX_H-1,y)))*TEX_W+Math.max(0,Math.min(TEX_W-1,x)))*4]/255;
  for(let y=0;y<TEX_H;y++) for(let x=0;x<TEX_W;x++) {
    const i=(y*TEX_W+x)*4;
    normal[i]=128+(height(x-1,y)-height(x+1,y))*35;
    normal[i+1]=128+(height(x,y+1)-height(x,y-1))*35;
    normal[i+2]=255;normal[i+3]=255;
  }
  mat.normalMap?.dispose();
  mat.normalMap = new THREE.DataTexture(normal,TEX_W,TEX_H);
  mat.normalMap.needsUpdate = true;
  mat.normalScale.set(.5,.5);
  const shell = new THREE.Mesh(shellGeometry(recipe), mat);
  shell.castShadow = true;
  const accent = new THREE.MeshPhysicalMaterial({ color: recipe.paint.base2, roughness: 0.3, metalness: 0.05, clearcoat: 1 });
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x263139, roughness: 0.14, metalness: 0.1, clearcoat: 1 });
  const g = new THREE.Group();
  g.add(shell);
  for (const a of addonMeshes(recipe, accent, glass)) {
    a.traverse((o) => ((o as THREE.Mesh).castShadow = true));
    g.add(a);
  }
  return {
    object: g,
    canvas,
    dispose() {
      g.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.geometry) m.geometry.dispose();
      });
      tex.dispose();
      mat.roughnessMap?.dispose(); mat.normalMap?.dispose();
      mat.dispose();
      accent.dispose();
      glass.dispose();
    },
  };
}
