// The sticker sheet: numbers, stripes and original logos, drawn as vectors so
// they stay sharp at any size. Each draws centred on the origin, `size` px wide.

import type { UploadLookup } from "./body.ts";

export interface StickerDef {
  id: string;
  name: string;
  group: "Numbers" | "Stripes" | "Shapes" | "Logos";
}

export const STICKERS: StickerDef[] = [
  ...Array.from({ length: 10 }, (_, i) => ({ id: `num-${i}`, name: `Number ${i}`, group: "Numbers" as const })),
  { id: "plate", name: "Number plate", group: "Numbers" },
  { id: "stripe-single", name: "Racing stripe", group: "Stripes" },
  { id: "stripe-double", name: "Twin stripes", group: "Stripes" },
  { id: "check", name: "Checker band", group: "Stripes" },
  { id: "speedlines", name: "Speed lines", group: "Stripes" },
  { id: "flame", name: "Flames", group: "Shapes" },
  { id: "star", name: "Star", group: "Shapes" },
  { id: "bolt", name: "Lightning bolt", group: "Shapes" },
  { id: "teeth", name: "Shark teeth", group: "Shapes" },
  { id: "arrow", name: "Arrow", group: "Shapes" },
  { id: "dot", name: "Dot", group: "Shapes" },
  { id: "sun", name: "Rising sun", group: "Shapes" },
  { id: "logo-rollout", name: "Rollout GP", group: "Logos" },
  { id: "logo-roller", name: "Roller Works", group: "Logos" },
  { id: "logo-volt", name: "Volt Cell", group: "Logos" },
  { id: "logo-wind", name: "Windcutter", group: "Logos" },
];

export function drawSticker(ctx: CanvasRenderingContext2D, id: string, size: number, color: string, uploads?: UploadLookup): void {
  const s = size;
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineJoin = "round";
  if (id.startsWith("upload:")) {
    const img = uploads?.(id.slice(7));
    if (img) {
      const w = "width" in img ? img.width : 1;
      const h = "height" in img ? img.height : 1;
      const k = s / Math.max(w, h);
      ctx.drawImage(img as CanvasImageSource, (-w * k) / 2, (-h * k) / 2, w * k, h * k);
    } else {
      ctx.globalAlpha = 0.4;
      ctx.fillRect(-s / 2, -s / 2, s, s);
      ctx.globalAlpha = 1;
    }
    return;
  }
  if (id.startsWith("num-")) {
    const n = id.slice(4);
    ctx.beginPath();
    ctx.arc(0, 0, s / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = contrast(color);
    ctx.font = `900 italic ${Math.round(s * 0.72)}px "Saira Condensed", "Arial Narrow", sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(n, 0, s * 0.04);
    return;
  }
  switch (id) {
    case "plate": {
      roundRect(ctx, -s / 2, -s * 0.32, s, s * 0.64, s * 0.1);
      ctx.fill();
      ctx.strokeStyle = contrast(color);
      ctx.lineWidth = s * 0.05;
      roundRect(ctx, -s * 0.42, -s * 0.24, s * 0.84, s * 0.48, s * 0.07);
      ctx.stroke();
      return;
    }
    case "stripe-single":
      ctx.fillRect(-s / 2, -s * 0.07, s, s * 0.14);
      return;
    case "stripe-double":
      ctx.fillRect(-s / 2, -s * 0.12, s, s * 0.07);
      ctx.fillRect(-s / 2, s * 0.05, s, s * 0.07);
      return;
    case "check": {
      const n = 10,
        cell = s / n;
      for (let i = 0; i < n; i++) for (let j = 0; j < 2; j++) if ((i + j) % 2 === 0) ctx.fillRect(-s / 2 + i * cell, (j - 1) * cell, cell, cell);
      return;
    }
    case "speedlines":
      for (let i = 0; i < 4; i++) {
        const w = s * (1 - i * 0.18);
        ctx.fillRect(-s / 2 + (s - w), -s * 0.2 + i * s * 0.12, w, s * 0.05);
      }
      return;
    case "flame": {
      ctx.beginPath();
      ctx.moveTo(-s / 2, 0);
      const tongues = 4;
      for (let i = 0; i < tongues; i++) {
        const y = (i / (tongues - 1) - 0.5) * s * 0.5;
        ctx.quadraticCurveTo(-s * 0.1, y - s * 0.12, s / 2 - i * s * 0.1, y);
        ctx.quadraticCurveTo(-s * 0.05, y + s * 0.05, -s / 2, y * 0.6);
      }
      ctx.closePath();
      ctx.fill();
      return;
    }
    case "star": {
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const r = i % 2 === 0 ? s / 2 : s * 0.2;
        const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
        ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      ctx.closePath();
      ctx.fill();
      return;
    }
    case "bolt": {
      ctx.beginPath();
      ctx.moveTo(-s * 0.5, -s * 0.1);
      ctx.lineTo(s * 0.05, -s * 0.22);
      ctx.lineTo(-s * 0.02, -s * 0.02);
      ctx.lineTo(s * 0.5, -s * 0.12);
      ctx.lineTo(-s * 0.08, s * 0.24);
      ctx.lineTo(-s * 0.02, s * 0.04);
      ctx.closePath();
      ctx.fill();
      return;
    }
    case "teeth": {
      ctx.beginPath();
      const n = 6;
      ctx.moveTo(-s / 2, -s * 0.12);
      for (let i = 0; i < n; i++) {
        const x0 = -s / 2 + (i / n) * s;
        ctx.lineTo(x0 + s / n / 2, s * 0.14);
        ctx.lineTo(x0 + s / n, -s * 0.12);
      }
      ctx.closePath();
      ctx.fill();
      return;
    }
    case "arrow": {
      ctx.beginPath();
      ctx.moveTo(s / 2, 0);
      ctx.lineTo(0, -s * 0.3);
      ctx.lineTo(0, -s * 0.12);
      ctx.lineTo(-s / 2, -s * 0.12);
      ctx.lineTo(-s / 2, s * 0.12);
      ctx.lineTo(0, s * 0.12);
      ctx.lineTo(0, s * 0.3);
      ctx.closePath();
      ctx.fill();
      return;
    }
    case "dot":
      ctx.beginPath();
      ctx.arc(0, 0, s / 2, 0, Math.PI * 2);
      ctx.fill();
      return;
    case "sun": {
      ctx.beginPath();
      ctx.arc(0, 0, s * 0.18, 0, Math.PI * 2);
      ctx.fill();
      for (let i = 0; i < 12; i++) {
        ctx.save();
        ctx.rotate((i / 12) * Math.PI * 2);
        ctx.beginPath();
        ctx.moveTo(s * 0.22, -s * 0.03);
        ctx.lineTo(s * 0.5, -s * 0.07);
        ctx.lineTo(s * 0.5, s * 0.07);
        ctx.lineTo(s * 0.22, s * 0.03);
        ctx.fill();
        ctx.restore();
      }
      return;
    }
    case "logo-rollout":
      logo(ctx, s, color, "ROLLOUT", "GP");
      return;
    case "logo-roller":
      logo(ctx, s, color, "ROLLER", "WORKS");
      return;
    case "logo-volt":
      logo(ctx, s, color, "VOLT", "CELL");
      return;
    case "logo-wind":
      logo(ctx, s, color, "WIND", "CUTTER");
      return;
    default:
      ctx.fillRect(-s / 4, -s / 4, s / 2, s / 2);
  }
}

function logo(ctx: CanvasRenderingContext2D, s: number, color: string, a: string, b: string) {
  roundRect(ctx, -s / 2, -s * 0.2, s, s * 0.4, s * 0.06);
  ctx.fill();
  ctx.fillStyle = contrast(color);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `900 italic ${Math.round(s * 0.2)}px "Saira Condensed", "Arial Narrow", sans-serif`;
  ctx.fillText(a, -s * 0.08, -s * 0.02);
  ctx.font = `700 italic ${Math.round(s * 0.12)}px "Saira Condensed", "Arial Narrow", sans-serif`;
  ctx.fillText(b, s * 0.33, s * 0.05);
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Black or white, whichever reads on `hex`. */
export function contrast(hex: string): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return "#111";
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255,
    g = (n >> 8) & 255,
    b = n & 255;
  return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? "#111111" : "#ffffff";
}
