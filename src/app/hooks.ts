import { useEffect, useRef, useState } from "react";
import { GarageView } from "../render/garageView.ts";
import { useApp } from "./state.tsx";
import type { Build } from "../sim/build.ts";

/** Show a build on the turntable, reusing the turntable if it's already up. */
export interface Placement {
  /** Car position on screen from centre, fraction of width (+ right) on wide screens. */
  x: number;
  /** Fraction of height (+ up) on wide screens. */
  y?: number;
  /** On phones (narrow), where the panels are bottom sheets. */
  mx?: number;
  my?: number;
}

export function useTurntable(build: Build | null, place: number | Placement = 0, showCog = false): GarageView | null {
  const pl: Placement = typeof place === "number" ? { x: place } : place;
  const [narrow,setNarrow]=useState(()=>window.innerWidth<=760);
  const [view,setView]=useState<GarageView|null>(null);
  useEffect(()=>{
    const query=matchMedia('(max-width: 760px)');
    const resize=()=>setNarrow(query.matches);resize();query.addEventListener('change',resize);
    return()=>query.removeEventListener('change',resize);
  },[]);
  const offset = narrow ? pl.mx ?? 0 : pl.x;
  const offsetY = narrow ? pl.my ?? 0.22 : pl.y ?? 0;
  const { viewport, uploads, uploadsVersion } = useApp();
  const ref = useRef<GarageView | null>(null);
  useEffect(() => {
    // No build means the screen is showing something else (a replay): leave it be.
    if (!viewport || build === null) return;
    let v = viewport.current instanceof GarageView ? viewport.current : null;
    if (!v) {
      v = new GarageView();
      v.attach(viewport.canvas);
      viewport.setView(v);
    }
    ref.current = v;
    setView(v);
  }, [viewport, build === null]);
  useEffect(() => {
    const v = ref.current;
    if (!v || !build || viewport?.current !== v) return;
    v.setBuild(build, (id) => uploads.get(id) ?? null);
  }, [build, uploads, uploadsVersion, viewport]);
  useEffect(() => {
    if (ref.current) {
      ref.current.offset = offset;
      ref.current.offsetY = offsetY;
      ref.current.showCog = showCog;
    }
  }, [offset, offsetY, showCog, viewport, view]);
  return view;
}
