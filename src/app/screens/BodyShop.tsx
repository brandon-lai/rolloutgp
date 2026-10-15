import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useApp } from "../state.tsx";
import { TopBar, Seg } from "../ui.tsx";
import { useTurntable } from "../hooks.ts";
import { activeBuild } from "../../store/profile.ts";
import { BODY_LIMITS, BODY_SKIRT, bodyProps, sanitizeRecipe, type AddonKind, type BodyRecipe, type Decal } from "../../sim/body.ts";
import { BODY_PRESETS, DEFAULT_BODY } from "../../sim/bodies.ts";
import { carSpec, inspect, REGULATION } from "../../sim/build.ts";
import { STICKERS, drawSticker } from "../../render/stickers.ts";
import { bodyLink } from "../share.ts";

type Tab = "shape" | "parts" | "paint" | "stickers" | "save";

const PALETTE = ["#e8402a", "#ff7a00", "#ffd23f", "#2bb673", "#1f9bd1", "#1f6feb", "#7b2cbf", "#ff5fa2", "#f4f4f4", "#9aa0a6", "#3b4252", "#111111"];

export function BodyShop({ initial }: { initial?: BodyRecipe }) {
  const { profile, save, toast, addUpload, uploads, uploadsVersion } = useApp();
  const build = activeBuild(profile);
  const [draft, setDraft] = useState<BodyRecipe>(() => initial ?? build.body);
  const [tab, setTab] = useState<Tab>("shape");
  const [sel, setSel] = useState(0);
  const [decalSel, setDecalSel] = useState<number | null>(null);
  const previewBuild = useMemo(() => ({ ...build, body: draft }), [build, draft]);
  const view = useTurntable(previewBuild, { x: -0.2, mx: 0, my: 0.3 }, true);
  const spec = useMemo(() => carSpec(previewBuild), [previewBuild]);
  const ins = useMemo(() => inspect(previewBuild), [previewBuild]);
  const props = useMemo(() => bodyProps(draft), [draft]);
  useEffect(() => {
    view?.setCog(spec.stats.comXMm, spec.stats.comHeightMm - spec.stats.clearanceMm);
  }, [view, spec]);
  void uploadsVersion;

  const set = (fn: (r: BodyRecipe) => BodyRecipe) => setDraft((r) => sanitizeRecipe(fn(r), r));
  const secs = useMemo(() => [...draft.sections].sort((a, b) => b.x - a.x), [draft.sections]);

  const checks = ins.checks.filter((c) => c.id === "height" || c.id === "length" || c.id === "width" || c.id === "weight");

  return (
    <div className="screen">
      <TopBar title="Body shop" />
      <div className="sidepanel panel">
        <div className="tabs" role="tablist">
          {(
            [
              ["shape", "Shape"],
              ["parts", "Parts"],
              ["paint", "Paint"],
              ["stickers", "Stickers"],
              ["save", "Save"],
            ] as [Tab, string][]
          ).map(([id, label]) => (
            <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? "on" : ""} onClick={() => setTab(id)}>
              {label}
            </button>
          ))}
        </div>
        <div className="scroll">
          <div className="section">
            <div className="row" style={{ gap: 6 }}>
              {checks.map((c) => (
                <span key={c.id} className={`chip ${c.ok ? "good" : "bad"}`}>
                  {c.label} {c.value}
                </span>
              ))}
              <span className="chip">Body {props.mass.toFixed(1)} g</span>
              <span className="chip gold">CoG {spec.stats.comHeightMm} mm up</span>
            </div>
          </div>

          {tab === "shape" && (
            <>
              <div className="section">
                <h3>Side view</h3>
                <p className="small muted">Drag the handles: up and down sets the height of each cross-section, sideways moves it along the car. The dashed line is the {REGULATION.maxHeight} mm limit.</p>
                <SideEditor recipe={draft} clearance={spec.stats.clearanceMm} sel={sel} setSel={setSel} onChange={set} />
              </div>
              <div className="section">
                <h3>Top view</h3>
                <p className="small muted">Drag to set the side-pod width at each section.</p>
                <TopEditor recipe={draft} sel={sel} setSel={setSel} onChange={set} />
              </div>
              <div className="section">
                <div className="row spread">
                  <h3>Section {sel + 1}</h3>
                  <div className="row">
                    <button className="btn small" disabled={draft.sections.length >= BODY_LIMITS.sections[1]} onClick={() => set((r) => addSection(r, sel))}>
                      <span>Add</span>
                    </button>
                    <button className="btn small ghost" disabled={draft.sections.length <= BODY_LIMITS.sections[0]} onClick={() => (set((r) => ({ ...r, sections: secs.filter((_, i) => i !== sel) })), setSel(0))}>
                      <span>Remove</span>
                    </button>
                  </div>
                </div>
                <div className="field" style={{ marginTop: 8 }}>
                  <label htmlFor="sq">Round ↔ boxy</label>
                  <input
                    id="sq"
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={secs[sel]?.sq ?? 0.5}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      set((r) => ({ ...r, sections: secs.map((s, i) => (i === sel ? { ...s, sq: v } : s)) }));
                    }}
                  />
                </div>
                <div className="field" style={{ marginTop: 8 }}>
                  <label htmlFor="nose">Nose height</label>
                  <input id="nose" type="range" min={BODY_SKIRT + 3} max={40} value={secs[0].top} onChange={(e) => set((r) => ({ ...r, sections: secs.map((s, i) => (i === 0 ? { ...s, top: Number(e.target.value) } : s)) }))} />
                </div>
                <div className="field" style={{ marginTop: 8 }}>
                  <label htmlFor="pods">Side-pod width (middle sections)</label>
                  <input
                    id="pods"
                    type="range"
                    min={24}
                    max={54}
                    value={Math.round(secs[Math.floor(secs.length / 2)].w)}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      set((r) => ({ ...r, sections: secs.map((s, i) => (i > 0 && i < secs.length - 1 ? { ...s, w: v } : s)) }));
                    }}
                  />
                </div>
              </div>
            </>
          )}

          {tab === "parts" && (
            <>
              <div className="section">
                <h3>Snap-on parts</h3>
                <div className="row" style={{ marginTop: 8 }}>
                  {(["wing", "fin", "intake", "canopy", "lightpod"] as AddonKind[]).map((k) => (
                    <button key={k} className="btn small" disabled={draft.addons.length >= BODY_LIMITS.addons} onClick={() => set((r) => ({ ...r, addons: [...r.addons, { kind: k, x: k === "wing" ? -66 : k === "lightpod" ? 60 : 0, size: 0.5 }] }))}>
                      <span>+ {k === "lightpod" ? "light pods" : k}</span>
                    </button>
                  ))}
                </div>
              </div>
              {draft.addons.map((a, i) => (
                <div key={i} className="section">
                  <div className="row spread">
                    <b style={{ textTransform: "capitalize" }}>{a.kind === "lightpod" ? "Light pods" : a.kind}</b>
                    <button className="btn small ghost" onClick={() => set((r) => ({ ...r, addons: r.addons.filter((_, j) => j !== i) }))}>
                      <span>Remove</span>
                    </button>
                  </div>
                  <div className="field" style={{ marginTop: 6 }}>
                    <label>Position (tail ↔ nose)</label>
                    <input type="range" min={-80} max={80} value={a.x} onChange={(e) => set((r) => ({ ...r, addons: r.addons.map((b, j) => (j === i ? { ...b, x: Number(e.target.value) } : b)) }))} />
                  </div>
                  <div className="field" style={{ marginTop: 6 }}>
                    <label>Size</label>
                    <input type="range" min={0} max={1} step={0.01} value={a.size} onChange={(e) => set((r) => ({ ...r, addons: r.addons.map((b, j) => (j === i ? { ...b, size: Number(e.target.value) } : b)) }))} />
                  </div>
                </div>
              ))}
              <div className="section">
                <h3>Lightening</h3>
                <p className="small muted">Drill holes to drop weight. Each one weakens the shell: in open class, a lightened body cracks on big crashes.</p>
                <div className="field">
                  <label htmlFor="holes">
                    Holes: {draft.holes} · toughness {Math.round(props.toughness * 100)}%
                  </label>
                  <input id="holes" type="range" min={0} max={BODY_LIMITS.holes} value={draft.holes} onChange={(e) => set((r) => ({ ...r, holes: Number(e.target.value) }))} />
                </div>
                <div className="row" style={{ marginTop: 8 }}>
                  <span className="fieldlabel grow">Shell</span>
                  <Seg
                    label="Shell material"
                    value={draft.clear ? "clear" : "abs"}
                    options={[
                      { value: "abs", label: "Stock (ABS)" },
                      { value: "clear", label: "Clear" },
                    ]}
                    onChange={(v) => set((r) => ({ ...r, clear: v === "clear" }))}
                  />
                </div>
              </div>
            </>
          )}

          {tab === "paint" && (
            <>
              <div className="section">
                <h3>Base colour</h3>
                <ColorRow value={draft.paint.base} onChange={(c) => set((r) => ({ ...r, paint: { ...r.paint, base: c } }))} />
                <h3 style={{ marginTop: 12 }}>Second colour</h3>
                <p className="small muted">Used by gradients, wings and fins.</p>
                <ColorRow value={draft.paint.base2} onChange={(c) => set((r) => ({ ...r, paint: { ...r.paint, base2: c } }))} />
              </div>
              <div className="section">
                <div className="row spread">
                  <span className="fieldlabel">Gradient</span>
                  <Seg
                    label="Gradient"
                    value={draft.paint.gradient}
                    options={[
                      { value: "none", label: "None" },
                      { value: "nose-tail", label: "Nose → tail" },
                      { value: "top-bottom", label: "Top → sides" },
                    ]}
                    onChange={(g) => set((r) => ({ ...r, paint: { ...r.paint, gradient: g } }))}
                  />
                </div>
                <div className="row spread" style={{ marginTop: 10 }}>
                  <span className="fieldlabel">Finish</span>
                  <Seg
                    label="Finish"
                    value={draft.paint.finish}
                    options={[
                      { value: "gloss", label: "Gloss" },
                      { value: "metallic", label: "Metallic" },
                      { value: "matte", label: "Matte" },
                      { value: "clear", label: "Clear" },
                    ]}
                    onChange={(f) => set((r) => ({ ...r, paint: { ...r.paint, finish: f } }))}
                  />
                </div>
              </div>
            </>
          )}

          {tab === "stickers" && (
            <>
              <div className="section">
                <h3>Sticker sheet</h3>
                <div className="stickers" style={{ marginTop: 8 }}>
                  {STICKERS.map((s) => (
                    <button
                      key={s.id}
                      title={s.name}
                      aria-label={`Add ${s.name}`}
                      disabled={draft.paint.decals.length >= BODY_LIMITS.decals}
                      onClick={() => {
                        set((r) => ({ ...r, paint: { ...r.paint, decals: [...r.paint.decals, { sticker: s.id, u: 0.45, v: s.id.startsWith("stripe") || s.id === "check" ? 0 : 0.7, size: s.group === "Stripes" ? 0.5 : 0.16, rot: 0, color: "#ffffff", mirror: s.group !== "Stripes" }] } }));
                        setDecalSel(draft.paint.decals.length);
                      }}
                    >
                      <StickerPreview id={s.id} />
                    </button>
                  ))}
                  <label className="btn small" style={{ aspectRatio: "auto" }}>
                    <span>Upload</span>
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      className="sr-only"
                      onChange={async (e) => {
                        const f = e.target.files?.[0];
                        if (!f) return;
                        const id = await addUpload(f);
                        if (!id) return toast("That image couldn't be used (4 MB max, PNG/JPEG/WebP).");
                        set((r) => ({ ...r, paint: { ...r.paint, decals: [...r.paint.decals, { sticker: `upload:${id}`, u: 0.4, v: 0.7, size: 0.22, rot: 0, color: "#ffffff", mirror: true }] } }));
                        toast("Personal stickers stay on this device and aren't included in share links.");
                      }}
                    />
                  </label>
                </div>
              </div>
              {draft.paint.decals.map((d, i) => (
                <DecalEditor
                  key={i}
                  d={d}
                  open={decalSel === i}
                  onOpen={() => setDecalSel(decalSel === i ? null : i)}
                  onChange={(nd) => set((r) => ({ ...r, paint: { ...r.paint, decals: r.paint.decals.map((x, j) => (j === i ? nd : x)) } }))}
                  onRemove={() => set((r) => ({ ...r, paint: { ...r.paint, decals: r.paint.decals.filter((_, j) => j !== i) } }))}
                  uploads={uploads}
                />
              ))}
            </>
          )}

          {tab === "save" && (
            <>
              <div className="section">
                <div className="field">
                  <label htmlFor="bname2">Name</label>
                  <input id="bname2" type="text" maxLength={32} value={draft.name} onChange={(e) => set((r) => ({ ...r, name: e.target.value }))} />
                </div>
              </div>
              <div className="section">
                <h3>Start from</h3>
                <div className="row" style={{ marginTop: 8 }}>
                  {BODY_PRESETS.filter((p) => profile.bodies.includes(p.id)).map((p) => (
                    <button key={p.id} className="btn small" onClick={() => setDraft({ ...p.recipe })}>
                      <span>{p.name}</span>
                    </button>
                  ))}
                </div>
                <p className="small muted">Buy more bodies in the garage (slot 9).</p>
              </div>
            </>
          )}
        </div>
        <div className="panel-foot">
          <button
            className="btn primary grow"
            onClick={() => {
              save((p) => {
                const builds = [...p.builds];
                builds[p.active] = { ...builds[p.active], body: draft };
                const designs = [draft, ...p.designs.filter((d) => d.name !== draft.name)].slice(0, 24);
                return { ...p, builds, designs };
              });
              toast(`"${draft.name}" fitted to ${build.name} and saved`);
            }}
          >
            <span>Fit to my car</span>
          </button>
          <button
            className="btn"
            onClick={async () => {
              const link = await bodyLink(draft);
              try {
                await navigator.clipboard.writeText(link);
                toast("Body link copied");
              } catch {
                prompt("Copy this link", link);
              }
            }}
          >
            <span>Share</span>
          </button>
          <button className="btn ghost" onClick={() => setDraft(DEFAULT_BODY)}>
            <span>Reset</span>
          </button>
        </div>
      </div>
    </div>
  );
}

function addSection(r: BodyRecipe, at: number): BodyRecipe {
  const s = [...r.sections].sort((a, b) => b.x - a.x);
  const a = s[Math.min(at, s.length - 2)],
    b = s[Math.min(at, s.length - 2) + 1];
  const mid = { x: (a.x + b.x) / 2, w: (a.w + b.w) / 2, top: (a.top + b.top) / 2, sq: (a.sq + b.sq) / 2 };
  return { ...r, sections: [...s, mid].sort((p, q) => q.x - p.x) };
}

// ----- Handle editors -------------------------------------------------------------

const VX = (x: number) => 100 - x; // mm along -> svg x (nose on the left)

function useDrag(onMove: (dx: number, dy: number, e: PointerEvent) => void) {
  const svgRef = useRef<SVGSVGElement>(null);
  const start = (e: ReactPointerEvent) => {
    const svg = svgRef.current!;
    const target = e.currentTarget as Element;
    try {
      target.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    const toLocal = (ev: PointerEvent) => {
      const pt = svg.createSVGPoint();
      pt.x = ev.clientX;
      pt.y = ev.clientY;
      return pt.matrixTransform(svg.getScreenCTM()!.inverse());
    };
    const move = (ev: PointerEvent) => {
      const p = toLocal(ev);
      onMove(p.x, p.y, ev);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  return { svgRef, start };
}

function SideEditor({ recipe, clearance, sel, setSel, onChange }: { recipe: BodyRecipe; clearance: number; sel: number; setSel: (i: number) => void; onChange: (fn: (r: BodyRecipe) => BodyRecipe) => void }) {
  const secs = [...recipe.sections].sort((a, b) => b.x - a.x);
  const H = 80;
  const Y = (top: number) => H - (top + clearance);
  const dragIdx = useRef(0);
  const { svgRef, start } = useDrag((x, y) => {
    const i = dragIdx.current;
    const top = Math.max(BODY_SKIRT + 3, Math.min(62, H - y - clearance));
    const nx = Math.max(-85, Math.min(85, 100 - x));
    onChange((r) => {
      const s = [...r.sections].sort((a, b) => b.x - a.x);
      // Keep order: can't pass a neighbour.
      const lo = i < s.length - 1 ? s[i + 1].x + 6 : -85;
      const hi = i > 0 ? s[i - 1].x - 6 : 85;
      s[i] = { ...s[i], top, x: Math.max(lo, Math.min(hi, nx)) };
      return { ...r, sections: s };
    });
  });
  const path = secs.map((s, i) => `${i ? "L" : "M"}${VX(s.x)},${Y(s.top)}`).join("");
  return (
    <div className="handles">
      <svg ref={svgRef} viewBox={`0 0 200 ${H}`} aria-label="Body side profile editor">
        <line x1={0} x2={200} y1={H - REGULATION.maxHeight} y2={H - REGULATION.maxHeight} stroke="#e8402a" strokeDasharray="3 3" strokeWidth={0.6} />
        <line x1={0} x2={200} y1={H} y2={H} stroke="#9fb0d0" strokeWidth={0.6} />
        <path d={`${path}L${VX(secs[secs.length - 1].x)},${Y(BODY_SKIRT)}L${VX(secs[0].x)},${Y(BODY_SKIRT)}Z`} fill="rgba(255,210,63,0.18)" stroke="#ffd23f" strokeWidth={1} />
        {secs.map((s, i) => (
          <circle
            key={i}
            cx={VX(s.x)}
            cy={Y(s.top)}
            r={i === sel ? 4.4 : 3.6}
            fill={i === sel ? "#ffd23f" : "#fff"}
            stroke="#0b1020"
            strokeWidth={1}
            style={{ cursor: "grab", touchAction: "none" }}
            onPointerDown={(e) => {
              dragIdx.current = i;
              setSel(i);
              start(e);
            }}
          />
        ))}
        <text x={4} y={H - REGULATION.maxHeight - 2} fontSize={5} fill="#ff9e8f">
          {REGULATION.maxHeight} mm
        </text>
        <text x={4} y={H - 2} fontSize={5} fill="#9fb0d0">
          nose
        </text>
        <text x={186} y={H - 2} fontSize={5} fill="#9fb0d0">
          tail
        </text>
      </svg>
    </div>
  );
}

function TopEditor({ recipe, sel, setSel, onChange }: { recipe: BodyRecipe; sel: number; setSel: (i: number) => void; onChange: (fn: (r: BodyRecipe) => BodyRecipe) => void }) {
  const secs = [...recipe.sections].sort((a, b) => b.x - a.x);
  const H = 60;
  const C = 30;
  const S = 0.5; // mm -> svg
  const dragIdx = useRef(0);
  const { svgRef, start } = useDrag((_x, y) => {
    const i = dragIdx.current;
    const w = Math.max(8, Math.min(54, Math.abs(C - y) / S));
    onChange((r) => {
      const s = [...r.sections].sort((a, b) => b.x - a.x);
      s[i] = { ...s[i], w };
      return { ...r, sections: s };
    });
  });
  const upper = secs.map((s, i) => `${i ? "L" : "M"}${VX(s.x)},${C - s.w * S}`).join("");
  const lower = [...secs].reverse().map((s) => `L${VX(s.x)},${C + s.w * S}`).join("");
  return (
    <div className="handles">
      <svg ref={svgRef} viewBox={`0 0 200 ${H}`} aria-label="Body width editor">
        <line x1={0} x2={200} y1={C - 52.5 * S} y2={C - 52.5 * S} stroke="#e8402a" strokeDasharray="3 3" strokeWidth={0.6} />
        <line x1={0} x2={200} y1={C + 52.5 * S} y2={C + 52.5 * S} stroke="#e8402a" strokeDasharray="3 3" strokeWidth={0.6} />
        <path d={`${upper}${lower}Z`} fill="rgba(31,155,209,0.2)" stroke="#1f9bd1" strokeWidth={1} />
        {secs.map((s, i) => (
          <circle
            key={i}
            cx={VX(s.x)}
            cy={C - s.w * S}
            r={i === sel ? 4.4 : 3.6}
            fill={i === sel ? "#ffd23f" : "#fff"}
            stroke="#0b1020"
            strokeWidth={1}
            style={{ cursor: "grab", touchAction: "none" }}
            onPointerDown={(e) => {
              dragIdx.current = i;
              setSel(i);
              start(e);
            }}
          />
        ))}
        <text x={4} y={8} fontSize={5} fill="#ff9e8f">
          105 mm width limit
        </text>
      </svg>
    </div>
  );
}

function ColorRow({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="swatches" style={{ marginTop: 8 }}>
      {PALETTE.map((c) => (
        <button key={c} className={`swatch ${c === value ? "on" : ""}`} style={{ background: c }} aria-label={`Colour ${c}`} onClick={() => onChange(c)} />
      ))}
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)} aria-label="Custom colour" style={{ width: 44, height: 32, padding: 0, border: 0, background: "transparent" }} />
    </div>
  );
}

function StickerPreview({ id }: { id: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current!;
    const ctx = c.getContext("2d")!;
    ctx.clearRect(0, 0, 64, 64);
    ctx.save();
    ctx.translate(32, 32);
    drawSticker(ctx, id, 52, "#ffffff");
    ctx.restore();
  }, [id]);
  return <canvas ref={ref} width={64} height={64} />;
}

function DecalEditor({ d, open, onOpen, onChange, onRemove, uploads }: { d: Decal; open: boolean; onOpen: () => void; onChange: (d: Decal) => void; onRemove: () => void; uploads: Map<string, ImageBitmap> }) {
  const name = d.sticker.startsWith("upload:") ? (uploads.has(d.sticker.slice(7)) ? "Your image" : "Missing image") : STICKERS.find((s) => s.id === d.sticker)?.name ?? d.sticker;
  return (
    <div className="section">
      <div className="row spread">
        <button className="iconbtn" style={{ padding: "0 10px", fontWeight: 700 }} onClick={onOpen} aria-expanded={open}>
          {name} {open ? "▴" : "▾"}
        </button>
        <button className="btn small ghost" onClick={onRemove}>
          <span>Remove</span>
        </button>
      </div>
      {open && (
        <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
          <Slider label="Along the body" min={0} max={1} step={0.005} value={d.u} onChange={(u) => onChange({ ...d, u })} />
          <Slider label="Round the body (top ↔ side)" min={-1} max={1} step={0.01} value={d.v} onChange={(v) => onChange({ ...d, v })} />
          <Slider label="Size" min={0.03} max={0.6} step={0.005} value={d.size} onChange={(size) => onChange({ ...d, size })} />
          <Slider label="Rotation" min={-180} max={180} step={1} value={d.rot} onChange={(rot) => onChange({ ...d, rot })} />
          {!d.sticker.startsWith("upload:") && <ColorRow value={d.color} onChange={(color) => onChange({ ...d, color })} />}
          <div className="row">
            <span className="fieldlabel grow">Mirror to the other side</span>
            <Seg label="Mirror" value={d.mirror ? "on" : "off"} options={[{ value: "on", label: "On" }, { value: "off", label: "Off" }]} onChange={(v) => onChange({ ...d, mirror: v === "on" })} />
          </div>
        </div>
      )}
    </div>
  );
}

function Slider({ label, min, max, step, value, onChange }: { label: string; min: number; max: number; step: number; value: number; onChange: (v: number) => void }) {
  return (
    <div className="field">
      <label>{label}</label>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </div>
  );
}
