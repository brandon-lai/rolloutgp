// Pre-made bodies: original designs covering the show-era styles. No copies of any
// real car. Each one comes in a stock (ABS) and a clear (lightweight) version.

import type { BodyRecipe, Paint } from "./body.ts";

const paint = (base: string, base2: string, extra: Partial<Paint> = {}): Paint => ({
  base,
  base2,
  gradient: "none",
  finish: "gloss",
  decals: [],
  ...extra,
});

export interface BodyPreset {
  id: string;
  name: string;
  style: string;
  price: number;
  recipe: BodyRecipe;
}

const preset = (id: string, name: string, style: string, price: number, r: Omit<BodyRecipe, "v" | "name" | "base" | "clear" | "holes">): BodyPreset => ({
  id,
  name,
  style,
  price,
  recipe: { v: 1, name, base: id, clear: false, holes: 0, ...r },
});

export const BODY_PRESETS: BodyPreset[] = [
  preset("sunrise", "Sunrise", "Fully cowled wedge", 0, {
    sections: [
      { x: 76, w: 34, top: 14, sq: 0.3 },
      { x: 50, w: 42, top: 22, sq: 0.45 },
      { x: 15, w: 44, top: 32, sq: 0.5 },
      { x: -20, w: 44, top: 36, sq: 0.55 },
      { x: -50, w: 43, top: 33, sq: 0.6 },
      { x: -74, w: 40, top: 28, sq: 0.7 },
    ],
    addons: [{ kind: "wing", x: -66, size: 0.35 }],
    paint: paint("#e8402a", "#ffd23f", {
      gradient: "nose-tail",
      decals: [
        { sticker: "stripe-double", u: 0.42, v: 0, size: 0.5, rot: 0, color: "#ffffff", mirror: false },
        { sticker: "num-7", u: 0.55, v: 0.75, size: 0.16, rot: 0, color: "#ffffff", mirror: true },
      ],
    }),
  }),
  preset("arrow", "Arrow", "Open-cockpit racer", 80, {
    sections: [
      { x: 78, w: 28, top: 12, sq: 0.2 },
      { x: 45, w: 38, top: 19, sq: 0.35 },
      { x: 10, w: 45, top: 24, sq: 0.45 },
      { x: -25, w: 45, top: 25, sq: 0.5 },
      { x: -55, w: 44, top: 24, sq: 0.55 },
      { x: -75, w: 42, top: 22, sq: 0.6 },
    ],
    addons: [
      { kind: "canopy", x: -8, size: 0.55 },
      { kind: "intake", x: -40, size: 0.5 },
    ],
    paint: paint("#1f6feb", "#0b1d3a", {
      decals: [
        { sticker: "stripe-single", u: 0.5, v: 0, size: 0.55, rot: 0, color: "#f4f4f4", mirror: false },
        { sticker: "num-3", u: 0.3, v: 0, size: 0.14, rot: 0, color: "#ffffff", mirror: false },
      ],
    }),
  }),
  preset("formula", "Formula", "F1-style open wheeler", 120, {
    sections: [
      { x: 80, w: 14, top: 13, sq: 0.25 },
      { x: 52, w: 18, top: 18, sq: 0.3 },
      { x: 18, w: 34, top: 26, sq: 0.45 },
      { x: -18, w: 40, top: 30, sq: 0.5 },
      { x: -52, w: 30, top: 27, sq: 0.55 },
      { x: -74, w: 22, top: 22, sq: 0.6 },
    ],
    addons: [
      { kind: "wing", x: 72, size: 0.5 },
      { kind: "wing", x: -70, size: 0.75 },
      { kind: "canopy", x: 6, size: 0.35 },
    ],
    paint: paint("#f4f4f4", "#d7263d", {
      gradient: "nose-tail",
      decals: [{ sticker: "num-1", u: 0.12, v: 0, size: 0.12, rot: 0, color: "#111111", mirror: false }],
    }),
  }),
  preset("shark", "Shark", "Aero shark with a dorsal fin", 160, {
    sections: [
      { x: 78, w: 26, top: 11, sq: 0.15 },
      { x: 48, w: 40, top: 20, sq: 0.25 },
      { x: 12, w: 46, top: 30, sq: 0.3 },
      { x: -22, w: 46, top: 34, sq: 0.3 },
      { x: -52, w: 42, top: 30, sq: 0.35 },
      { x: -76, w: 34, top: 24, sq: 0.4 },
    ],
    addons: [
      { kind: "fin", x: -48, size: 0.9 },
      { kind: "fin", x: -60, size: 0.5 },
    ],
    paint: paint("#5a6b7d", "#dfe6ee", {
      gradient: "top-bottom",
      finish: "metallic",
      decals: [{ sticker: "teeth", u: 0.12, v: 0.7, size: 0.18, rot: 0, color: "#ffffff", mirror: true }],
    }),
  }),
  preset("hauler", "Hauler", "Boxy truck", 100, {
    sections: [
      { x: 74, w: 40, top: 30, sq: 0.85 },
      { x: 52, w: 44, top: 40, sq: 0.9 },
      { x: 25, w: 45, top: 44, sq: 0.95 },
      { x: -10, w: 45, top: 42, sq: 0.95 },
      { x: -45, w: 45, top: 40, sq: 0.95 },
      { x: -72, w: 44, top: 38, sq: 0.95 },
    ],
    addons: [{ kind: "lightpod", x: 30, size: 0.7 }],
    paint: paint("#2a9d8f", "#264653", {
      finish: "matte",
      decals: [
        { sticker: "check", u: 0.65, v: 0.85, size: 0.3, rot: 0, color: "#ffffff", mirror: true },
        { sticker: "num-9", u: 0.25, v: 0, size: 0.16, rot: 0, color: "#ffffff", mirror: false },
      ],
    }),
  }),
  preset("comet", "Comet", "Low sleek coupe", 140, {
    sections: [
      { x: 78, w: 32, top: 10, sq: 0.25 },
      { x: 46, w: 43, top: 17, sq: 0.35 },
      { x: 10, w: 46, top: 26, sq: 0.4 },
      { x: -24, w: 46, top: 28, sq: 0.45 },
      { x: -54, w: 45, top: 24, sq: 0.5 },
      { x: -76, w: 43, top: 20, sq: 0.6 },
    ],
    addons: [{ kind: "wing", x: -68, size: 0.55 }],
    paint: paint("#7b2cbf", "#ff9e00", {
      gradient: "nose-tail",
      finish: "metallic",
      decals: [{ sticker: "flame", u: 0.2, v: 0.55, size: 0.32, rot: 0, color: "#ffd166", mirror: true }],
    }),
  }),
  preset("bolt", "Bolt", "Wedge with side pods", 200, {
    sections: [
      { x: 80, w: 30, top: 12, sq: 0.4 },
      { x: 55, w: 46, top: 18, sq: 0.5 },
      { x: 20, w: 47, top: 25, sq: 0.6 },
      { x: -15, w: 47, top: 31, sq: 0.6 },
      { x: -45, w: 45, top: 31, sq: 0.65 },
      { x: -62, w: 42, top: 29, sq: 0.7 },
      { x: -76, w: 38, top: 25, sq: 0.75 },
    ],
    addons: [
      { kind: "intake", x: 0, size: 0.7 },
      { kind: "wing", x: -66, size: 0.6 },
    ],
    paint: paint("#ffd23f", "#111111", {
      decals: [
        { sticker: "bolt", u: 0.45, v: 0.7, size: 0.3, rot: -10, color: "#111111", mirror: true },
        { sticker: "num-5", u: 0.3, v: 0, size: 0.15, rot: 0, color: "#111111", mirror: false },
      ],
    }),
  }),
  preset("ridge", "Ridge", "Tall show-style racer with a big wing", 240, {
    sections: [
      { x: 76, w: 30, top: 16, sq: 0.3 },
      { x: 46, w: 42, top: 26, sq: 0.4 },
      { x: 12, w: 46, top: 36, sq: 0.45 },
      { x: -22, w: 46, top: 40, sq: 0.5 },
      { x: -52, w: 44, top: 36, sq: 0.55 },
      { x: -74, w: 40, top: 30, sq: 0.6 },
    ],
    addons: [
      { kind: "wing", x: -64, size: 1 },
      { kind: "fin", x: -30, size: 0.4 },
      { kind: "canopy", x: 4, size: 0.5 },
    ],
    paint: paint("#06d6a0", "#118ab2", {
      gradient: "top-bottom",
      decals: [
        { sticker: "star", u: 0.35, v: 0.75, size: 0.2, rot: 0, color: "#ffffff", mirror: true },
        { sticker: "num-8", u: 0.18, v: 0, size: 0.14, rot: 0, color: "#ffffff", mirror: false },
      ],
    }),
  }),
];

export const DEFAULT_BODY = BODY_PRESETS[0].recipe;

export function presetById(id: string): BodyPreset | undefined {
  return BODY_PRESETS.find((p) => p.id === id);
}
