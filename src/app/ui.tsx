// Shared UI pieces.

import { useEffect, useMemo, useRef, type ReactNode, type KeyboardEvent } from "react";
import { useApp } from "./state.tsx";
import { buildTrack, SAMPLE_STRIDE, type TrackDef } from "../sim/track/geometry.ts";
import { TRACE_FIELDS, type Telemetry } from "../sim/race.ts";

export function Tokens({ n }: { n: number }) {
  return (
    <span className="tokens num" aria-label={`${n} tokens`}>
      <i className="coin" aria-hidden />
      {n.toLocaleString()}
    </span>
  );
}

export function tabKeys(e:KeyboardEvent<HTMLDivElement>) {
  if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;
  const buttons=[...e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
  const current=buttons.indexOf(document.activeElement as HTMLButtonElement);
  if(current<0)return;e.preventDefault();
  const index=e.key==='Home'?0:e.key==='End'?buttons.length-1:(current+(e.key==='ArrowLeft'?-1:1)+buttons.length)%buttons.length;
  buttons[index].focus();buttons[index].click();
}

export function TopBar({ title, back, right }: { title: string; back?: () => void; right?: ReactNode }) {
  const { profile, go } = useApp();
  return (
    <div className="topbar">
      <button className="iconbtn" onClick={back ?? (() => go({ name: "home" }))} aria-label="Back">
        <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden>
          <path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <div className="title">{title}</div>
      {right}
      <Tokens n={profile.tokens} />
    </div>
  );
}

export function Seg<T extends string | number>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label?: string }) {
  return (
    <div className="seg" role="radiogroup" aria-label={label} onKeyDown={e=>{
      const keys=['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'];
      if(!keys.includes(e.key))return;e.preventDefault();
      const current=options.findIndex(o=>o.value===value),delta=['ArrowLeft','ArrowUp'].includes(e.key)?-1:1;
      const index=e.key==='Home'?0:e.key==='End'?options.length-1:(current+delta+options.length)%options.length;
      onChange(options[index].value);e.currentTarget.querySelectorAll<HTMLButtonElement>('button')[index]?.focus();
    }}>
      {options.map((o) => (
        <button key={String(o.value)} role="radio" tabIndex={o.value===value?0:-1} aria-checked={o.value === value} className={o.value === value ? "on" : ""} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Modal({ children, onClose, label }: { children: ReactNode; onClose?: () => void; label: string }) {
  const ref=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    const previous=document.activeElement as HTMLElement|null;
    (ref.current?.querySelector<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),[tabindex="0"]')??ref.current)?.focus();
    return()=>{if(previous?.isConnected)previous.focus();};
  },[]);
  return (
    <div ref={ref} tabIndex={-1} className="modal-back" role="dialog" aria-modal="true" aria-label={label} onClick={(e) => e.target === e.currentTarget && onClose?.()} onKeyDown={e=>{
      if(e.key==='Escape'&&onClose){e.preventDefault();onClose();}
      if(e.key!=='Tab')return;
      const items=[...e.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),a[href],[tabindex="0"]')].filter(el=>el.getClientRects().length);
      if(!items.length){e.preventDefault();return;}
      const i=items.indexOf(document.activeElement as HTMLElement);
      if(e.shiftKey&&i<=0){e.preventDefault();items[items.length-1].focus();}
      else if(!e.shiftKey&&(i===items.length-1||i<0)){e.preventDefault();items[0].focus();}
    }}>
      <div className="panel modal">{children}</div>
    </div>
  );
}

export function Dots({ n, of = 4 }: { n: number; of?: number }) {
  return (
    <span className="dots" aria-label={`Difficulty ${n} of ${of}`}>
      {Array.from({ length: of }, (_, i) => (
        <i key={i} className={i < n ? "on" : ""} />
      ))}
    </span>
  );
}

/** Top-down outline of a track from its middle lane, with optional markers. */
export function TrackMap({ track, marks = [], height = 110 }: { track: TrackDef; marks?: { x: number; z: number; color: string; label?: string }[]; height?: number }) {
  const { path, view } = useMemo(() => {
    const geo = buildTrack(track);
    const st = geo.strips[Math.floor(geo.strips.length / 2)];
    const pts: string[] = [];
    for (let k = 0; k < st.count; k += 2) {
      const o = k * SAMPLE_STRIDE;
      pts.push(`${st.data[o].toFixed(1)},${st.data[o + 2].toFixed(1)}`);
    }
    const b = geo.bounds;
    const pad = 4;
    return { path: "M" + pts.join("L") + "Z", view: `${b.minX - pad} ${b.minZ - pad} ${b.maxX - b.minX + pad * 2} ${b.maxZ - b.minZ + pad * 2}` };
  }, [track]);
  return (
    <svg viewBox={view} style={{ height }} role="img" aria-label={`${track.name} layout`}>
      <path d={path} fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth={7} strokeLinejoin="round" />
      <path d={path} fill="none" stroke="#dfe8ff" strokeWidth={2.4} strokeLinejoin="round" />
      {marks.map((m, i) => (
        <g key={i}>
          <circle cx={m.x} cy={m.z} r={3.4} fill={m.color} stroke="#0b1020" strokeWidth={1} />
        </g>
      ))}
    </svg>
  );
}

/** Speed against distance round the course, one line per lap, with feature bands. */
export function SpeedChart({ t, track, color = "#ffd23f" }: { t: Telemetry; track: TrackDef; color?: string }) {
  const data = useMemo(() => {
    const geo = buildTrack(track);
    const L = geo.centreLength;
    const n = t.trace.length / TRACE_FIELDS;
    const laps = new Map<number, [number, number, number][]>();
    let maxV = 10;
    for (let i = 0; i < n; i++) {
      const o = i * TRACE_FIELDS;
      const lap = t.trace[o + 2];
      const xh = t.trace[o + 1];
      const v = t.trace[o + 3];
      const air = t.trace[o + 4];
      maxV = Math.max(maxV, v);
      if (!laps.has(lap)) laps.set(lap, []);
      laps.get(lap)!.push([xh / L, v, air]);
    }
    return { laps, maxV: Math.ceil(maxV / 5) * 5, features: geo.features.map((f) => ({ ...f, a: f.start / L, b: f.end / L })) };
  }, [t, track]);
  const W = 640,
    H = 200,
    padL = 34,
    padB = 22;
  const x = (u: number) => padL + u * (W - padL - 6);
  const y = (v: number) => H - padB - (v / data.maxV) * (H - padB - 8);
  const lapColors = ["#7fb8ff", "#ffd23f", "#ff8a73", "#7fe3b0"];
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Speed through each lap">
      {data.features.map((f, i) => (
        <g key={i}>
          <rect x={x(f.a)} y={6} width={Math.max(1, x(f.b) - x(f.a))} height={H - padB - 6} fill={f.jump ? "rgba(232,64,42,0.14)" : "rgba(31,155,209,0.12)"} />
          <text x={x(f.a) + 2} y={16} fontSize={9} fill="#9fb0d0">
            {f.name}
          </text>
        </g>
      ))}
      {[0, 0.5, 1].map((g) => (
        <g key={g}>
          <line x1={padL} x2={W - 6} y1={y(data.maxV * g)} y2={y(data.maxV * g)} stroke="rgba(255,255,255,0.08)" />
          <text x={4} y={y(data.maxV * g) + 4} fontSize={10} fill="#9fb0d0">
            {Math.round(data.maxV * g)}
          </text>
        </g>
      ))}
      {[...data.laps.entries()].map(([lap, pts]) => (
        <polyline
          key={lap}
          fill="none"
          stroke={data.laps.size === 1 ? color : lapColors[(lap - 1) % lapColors.length]}
          strokeWidth={1.8}
          points={pts.filter((p, i) => i === 0 || p[0] >= pts[i - 1][0]).map((p) => `${x(p[0]).toFixed(1)},${y(p[1]).toFixed(1)}`).join(" ")}
        />
      ))}
      <text x={W - 8} y={H - 6} fontSize={10} fill="#9fb0d0" textAnchor="end">
        km/h against distance round the lap · red bands = jumps
      </text>
    </svg>
  );
}

export function fmtTime(s: number | null | undefined): string {
  if (s === null || s === undefined || !Number.isFinite(s)) return "—";
  return s.toFixed(2) + " s";
}
