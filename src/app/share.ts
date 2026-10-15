// Share links: a build or a body is small JSON, so the link carries the whole
// thing in its hash (nothing is uploaded anywhere). Compressed when the browser
// can; everything that comes back in is sanitised before use.

import { sanitizeBuild, type Build } from "../sim/build.ts";
import { sanitizeRecipe, type BodyRecipe } from "../sim/body.ts";
import { DEFAULT_BODY } from "../sim/bodies.ts";

function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(s: string): Uint8Array {
  const b = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i);
  return out;
}

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Response(new Blob([bytes as BlobPart]).stream().pipeThrough(stream));
  return new Uint8Array(await out.arrayBuffer());
}

export async function encode(value: unknown): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify(value));
  if (typeof CompressionStream !== "undefined") {
    try {
      return "z" + b64url(await pipe(json, new CompressionStream("deflate-raw")));
    } catch {
      /* fall through */
    }
  }
  return "j" + b64url(json);
}

export async function decode(s: string): Promise<unknown> {
  if (s.length > 20000) throw new Error("Link too long");
  const kind = s[0];
  const bytes = fromB64url(s.slice(1));
  let json: Uint8Array;
  if (kind === "z") json = await pipe(bytes, new DecompressionStream("deflate-raw"));
  else if (kind === "j") json = bytes;
  else throw new Error("Unknown link format");
  if (json.length > 100000) throw new Error("Link too large");
  return JSON.parse(new TextDecoder().decode(json));
}

export async function buildLink(b: Build): Promise<string> {
  // Personal uploaded images are not in the link (they live on this device only).
  const clean: Build = { ...b, body: stripUploads(b.body) };
  return `${location.origin}${location.pathname}#build=${await encode(clean)}`;
}

export async function bodyLink(r: BodyRecipe): Promise<string> {
  return `${location.origin}${location.pathname}#body=${await encode(stripUploads(r))}`;
}

export function stripUploads(r: BodyRecipe): BodyRecipe {
  return { ...r, paint: { ...r.paint, decals: r.paint.decals.filter((d) => !d.sticker.startsWith("upload:")) } };
}

export type Incoming = { kind: "build"; build: Build } | { kind: "body"; body: BodyRecipe } | null;

/** Read a shared build or body from the page's hash, if there is one. */
export async function readHash(hash: string): Promise<Incoming> {
  const m = /^#(build|body)=([A-Za-z0-9_-]+)$/.exec(hash);
  if (!m) return null;
  try {
    const v = await decode(m[2]);
    if (m[1] === "build") return { kind: "build", build: sanitizeBuild(v) };
    return { kind: "body", body: stripUploads(sanitizeRecipe(v, DEFAULT_BODY)) };
  } catch {
    return null;
  }
}
