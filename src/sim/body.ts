// Body (cowl) recipes and their physical effect.
//
// A body is a loft of 5 to 7 cross-sections from nose to tail plus snap-on parts
// and paint. The recipe is small JSON, so a share link carries the whole design.
// This file only holds what the physics needs (weight, centre of gravity, size,
// durability); the mesh is built from the same recipe in src/body/mesh.ts.
//
// Everything here is plain arithmetic (no Math.pow or trig) so the car's mass is
// bit-identical on every machine.

export interface BodySection {
  /** Position along the car, mm forward of the chassis centre. */
  x: number;
  /** Half width, mm. */
  w: number;
  /** Top of the shell above the chassis floor, mm. */
  top: number;
  /** 0 = round (ellipse), 1 = boxy. */
  sq: number;
}

export type AddonKind = "wing" | "fin" | "intake" | "canopy" | "lightpod";

export interface BodyAddon {
  kind: AddonKind;
  /** mm forward of centre. */
  x: number;
  /** 0..1 size handle. */
  size: number;
}

export interface Decal {
  /** Sticker id from the sheet, or "upload:<id>" for a personal image. */
  sticker: string;
  /** Position along the body 0 (nose) .. 1 (tail). */
  u: number;
  /** Position around the body: 0 = top centre, ±1 = down the right/left side. */
  v: number;
  /** Size, fraction of body length. */
  size: number;
  /** Degrees. */
  rot: number;
  color: string;
  /** Mirror onto the other side. */
  mirror: boolean;
}

export interface Paint {
  base: string;
  /** Second colour for gradients. */
  base2: string;
  gradient: "none" | "nose-tail" | "top-bottom";
  finish: "gloss" | "metallic" | "matte" | "clear";
  decals: Decal[];
}

export interface BodyRecipe {
  v: 1;
  name: string;
  /** Preset this design started from. */
  base: string;
  /** Lightweight clear polycarbonate shell instead of ABS. */
  clear: boolean;
  sections: BodySection[];
  addons: BodyAddon[];
  /** Lightening holes drilled in the shell. Each saves weight and costs strength. */
  holes: number;
  paint: Paint;
}

export const BODY_LIMITS = {
  sections: [5, 7] as const,
  holes: 12,
  addons: 6,
  decals: 24,
};

/** Skirt height: the shell's lower edge above the chassis floor, mm. */
export const BODY_SKIRT = 6;

// ABS kit bodies are around 1 mm thick; clear polycarbonate bodies are thinner
// and lighter, which is why real racers run them (Tamiya setup guide).
const ABS = { thickness: 0.55, density: 0.00105 }; // mm, g/mm^3
const CLEAR = { thickness: 0.28, density: 0.0012 };

const ADDON_MASS: Record<AddonKind, number> = { wing: 2.2, fin: 0.6, intake: 0.8, canopy: 1.4, lightpod: 0.7 };
const ADDON_HEIGHT: Record<AddonKind, number> = { wing: 22, fin: 14, intake: 6, canopy: 12, lightpod: 5 };

/** Half-perimeter of the shell cross-section (side, over the top, other side), mm. */
function halfPerimeter(w: number, h: number, sq: number): number {
  // Ramanujan's ellipse perimeter blended towards a rectangle by squareness.
  const ell = (Math.PI * (3 * (w + h) - Math.sqrt((3 * w + h) * (w + 3 * h)))) / 2;
  const rect = 2 * w + 2 * h;
  return ell + (rect - ell) * sq;
}

/** Height of the shell's centroid above the skirt, mm. */
function centroidHeight(w: number, h: number, sq: number): number {
  const ell = 0.64 * h;
  const rect = (h * h + 2 * w * h) / (2 * w + 2 * h);
  return ell + (rect - ell) * sq;
}

export interface BodyProps {
  mass: number; // g
  /** Centre of mass, mm (x forward, y above floor). */
  comX: number;
  comY: number;
  length: number; // mm
  front: number; // mm forward of centre
  rear: number; // mm behind centre (positive)
  halfWidth: number; // mm
  top: number; // mm above floor, including addons
  frontalArea: number; // mm^2
  /** 0..1, how well it survives crashes (open mode). */
  toughness: number;
}

export function bodyProps(r: BodyRecipe): BodyProps {
  const mat = r.clear ? CLEAR : ABS;
  const secs = [...r.sections].sort((a, b) => b.x - a.x); // nose first
  let area = 0;
  let mx = 0;
  let my = 0;
  let halfWidth = 0;
  let top = 0;
  let frontal = 0;
  for (let i = 0; i < secs.length; i++) {
    const s = secs[i];
    const h = Math.max(1, s.top - BODY_SKIRT);
    halfWidth = Math.max(halfWidth, s.w);
    top = Math.max(top, s.top);
    frontal = Math.max(frontal, 2 * s.w * h * (0.78 + 0.2 * s.sq));
    if (i === 0) continue;
    const p = secs[i - 1];
    const ph = Math.max(1, p.top - BODY_SKIRT);
    const dx = p.x - s.x;
    const per = (halfPerimeter(p.w, ph, p.sq) + halfPerimeter(s.w, h, s.sq)) / 2;
    const a = per * dx;
    area += a;
    mx += a * (p.x + s.x) * 0.5;
    my += a * (BODY_SKIRT + (centroidHeight(p.w, ph, p.sq) + centroidHeight(s.w, h, s.sq)) / 2);
  }
  // Nose and tail caps.
  const cap = (s: BodySection) => 0.5 * 2 * s.w * Math.max(1, s.top - BODY_SKIRT);
  area += cap(secs[0]) * 0.6 + cap(secs[secs.length - 1]);

  const holes = Math.max(0, Math.min(BODY_LIMITS.holes, Math.round(r.holes)));
  // Each hole removes ~3% of the shell (10 mm holes in a ~20,000 mm^2 shell, plus the cut tabs).
  const shellMass = area * mat.thickness * mat.density * (1 - holes * 0.03);
  let mass = shellMass;
  let cx = mx / Math.max(area, 1);
  let cy = my / Math.max(area, 1);
  let addonTop = top;
  for (const ad of r.addons) {
    const m = ADDON_MASS[ad.kind] * (0.6 + 0.8 * ad.size);
    const y = top + ADDON_HEIGHT[ad.kind] * (0.4 + 0.6 * ad.size) * 0.5;
    cx = (cx * mass + ad.x * m) / (mass + m);
    cy = (cy * mass + y * m) / (mass + m);
    mass += m;
    const at = sectionTopAt(secs, ad.x) + ADDON_HEIGHT[ad.kind] * (0.4 + 0.6 * ad.size);
    if (ad.kind === "wing" || ad.kind === "fin" || ad.kind === "canopy") addonTop = Math.max(addonTop, at);
  }
  const front = secs[0].x;
  const rear = -secs[secs.length - 1].x;
  const toughness = Math.max(0.15, (r.clear ? 0.6 : 0.95) - holes * 0.04);
  return {
    mass,
    comX: cx,
    comY: cy,
    length: front + rear,
    front,
    rear,
    halfWidth,
    top: addonTop,
    frontalArea: frontal,
    toughness,
  };
}

/** Shell top height at a position along the car (linear between sections), mm. */
export function sectionTopAt(secsNoseFirst: BodySection[], x: number): number {
  const s = secsNoseFirst;
  if (x >= s[0].x) return s[0].top;
  for (let i = 1; i < s.length; i++) {
    if (x >= s[i].x) {
      const t = (x - s[i].x) / (s[i - 1].x - s[i].x || 1);
      return s[i].top + (s[i - 1].top - s[i].top) * t;
    }
  }
  return s[s.length - 1].top;
}

/** Keep a recipe inside what the editor and physics accept, fixing what it can. */
export function sanitizeRecipe(input: unknown, fallback: BodyRecipe): BodyRecipe {
  if (!input || typeof input !== "object") return fallback;
  const r = input as Partial<BodyRecipe>;
  const num = (v: unknown, lo: number, hi: number, d: number) =>
    typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d;
  const str = (v: unknown, d: string, max = 40) => (typeof v === "string" ? v.slice(0, max) : d);
  const color = (v: unknown, d: string) => (typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : d);
  const secsIn = Array.isArray(r.sections) ? r.sections.slice(0, BODY_LIMITS.sections[1]) : [];
  if (secsIn.length < BODY_LIMITS.sections[0]) return fallback;
  const sections = secsIn
    .map((s) => ({
      x: num(s?.x, -85, 85, 0),
      w: num(s?.w, 8, 54, 30),
      top: num(s?.top, BODY_SKIRT + 3, 62, 30),
      sq: num(s?.sq, 0, 1, 0.4),
    }))
    .sort((a, b) => b.x - a.x);
  for (let i = 1; i < sections.length; i++) {
    if (sections[i - 1].x - sections[i].x < 6) sections[i].x = sections[i - 1].x - 6;
  }
  const kinds: AddonKind[] = ["wing", "fin", "intake", "canopy", "lightpod"];
  const addons = (Array.isArray(r.addons) ? r.addons : [])
    .filter((a) => a && kinds.includes(a.kind as AddonKind))
    .slice(0, BODY_LIMITS.addons)
    .map((a) => ({ kind: a.kind as AddonKind, x: num(a.x, -80, 80, 0), size: num(a.size, 0, 1, 0.5) }));
  const p = (r.paint ?? {}) as Partial<Paint>;
  const decals = (Array.isArray(p.decals) ? p.decals : []).slice(0, BODY_LIMITS.decals).map((d) => ({
    sticker: str(d?.sticker, "num-1", 64),
    u: num(d?.u, 0, 1, 0.5),
    v: num(d?.v, -1, 1, 0),
    size: num(d?.size, 0.03, 0.6, 0.15),
    rot: num(d?.rot, -180, 180, 0),
    color: color(d?.color, "#ffffff"),
    mirror: Boolean(d?.mirror),
  }));
  return {
    v: 1,
    name: str(r.name, fallback.name, 32),
    base: str(r.base, fallback.base, 32),
    clear: Boolean(r.clear),
    sections,
    addons,
    holes: Math.round(num(r.holes, 0, BODY_LIMITS.holes, 0)),
    paint: {
      base: color(p.base, fallback.paint.base),
      base2: color(p.base2, fallback.paint.base2),
      gradient: p.gradient === "nose-tail" || p.gradient === "top-bottom" ? p.gradient : "none",
      finish: p.finish === "metallic" || p.finish === "matte" || p.finish === "clear" ? p.finish : "gloss",
      decals,
    },
  };
}
