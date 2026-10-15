import { autoQuality } from "../render/quality.ts";
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Viewport } from "../render/viewport.ts";
import { uploadIds } from "../store/backup.ts";
import { getItem, putUpload, getUpload, setItem } from "../store/db.ts";
import { migrateProfile, newProfile, randomId, type Profile } from "../store/profile.ts";
import { Ctx, type AppCtx, type Screen } from "./state.tsx";
import { Home } from "./screens/Home.tsx";
const Garage = lazy(() => import("./screens/Garage.tsx").then(m => ({ default: m.Garage })));
const Tracks = lazy(() => import("./screens/Tracks.tsx").then(m => ({ default: m.Tracks })));
const RaceScreen = lazy(() => import("./screens/RaceScreen.tsx").then(m => ({ default: m.RaceScreen })));
const Results = lazy(() => import("./screens/Results.tsx").then(m => ({ default: m.Results })));
const Replay = lazy(() => import("./screens/Replay.tsx").then(m => ({ default: m.Replay })));
const BodyShop = lazy(() => import("./screens/BodyShop.tsx").then(m => ({ default: m.BodyShop })));
const CityScreen = lazy(() => import("./screens/CityScreen.tsx").then(m => ({ default: m.CityScreen })));
const SettingsScreen = lazy(() => import("./screens/Settings.tsx").then(m => ({ default: m.SettingsScreen })));
import { Incoming as IncomingModal } from "./screens/Incoming.tsx";
import { readHash, type Incoming } from "./share.ts";

const PROFILE_KEY = "profile";

export function App() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [viewport, setViewport] = useState<Viewport | null>(null);
  const [glError, setGlError] = useState<string | null>(null);
  const [screen, setScreen] = useState<Screen>({ name: "home" });
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [incoming, setIncoming] = useState<Incoming>(null);
  const uploads = useRef(new Map<string, ImageBitmap>());
  const [uploadsVersion, setUploadsVersion] = useState(0);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef<Profile | null>(null);
  const pendingWrite = useRef<Promise<boolean>>(Promise.resolve(true));
  const replacing = useRef(false);
  const persist = useCallback(() => {
    const value=latest.current;
    if(!value||replacing.current)return;
    pendingWrite.current=pendingWrite.current.then(()=>setItem(PROFILE_KEY,value)).catch(()=>false);
    void pendingWrite.current.then(ok=>{if(!ok)setToastMsg('Browser storage is unavailable. Download a save before closing this tab.');});
  },[]);
  const replaceSave = useCallback(async(operation:()=>Promise<Profile>)=>{
    if(replacing.current)throw new Error('A save operation is already in progress.');
    replacing.current=true;
    if(saveTimer.current)clearTimeout(saveTimer.current);
    try {
      await pendingWrite.current;
      const next=await operation();
      latest.current=next;setProfile(next);
    } finally {replacing.current=false;}
  },[]);

  // Load the profile.
  useEffect(() => {
    getItem<unknown>(PROFILE_KEY).then((raw) => {
      const p = raw ? migrateProfile(raw) : newProfile();
      latest.current = p;
      setProfile(p);
      // Load any personal sticker images used by saved designs.
      const ids = uploadIds(p);
      Promise.allSettled(
        [...ids].map(async (id) => {
          const blob = await getUpload(id);
          if (blob) uploads.current.set(id, await createImageBitmap(blob));
        }),
      ).then(() => setUploadsVersion((v) => v + 1));
    });
    readHash(location.hash).then((inc) => {
      if (inc) setIncoming(inc);
      if (location.hash) history.replaceState(null, "", location.pathname + location.search);
    });
  }, []);

  // Create the 3D viewport once.
  useEffect(() => {
    let vp: Viewport | null = null;
    let cancelled = false;
    Viewport.create(canvas.current!, autoQuality())
      .then((v) => {
        if (cancelled) return v.dispose();
        vp = v;
        v.onError=setGlError;
        setViewport(v);
        if (import.meta.env.DEV) (window as unknown as { __rollout?: unknown }).__rollout = { backend: v.backend };
      })
      .catch((e) => setGlError(String(e?.message ?? e)));
    return () => {
      cancelled = true;
      vp?.dispose();
    };
  }, []);

  useEffect(() => {
    if (viewport && profile) viewport.setQuality(profile.settings.quality);
  }, [viewport, profile?.settings.quality]);

  const save = useCallback((fn: (p: Profile) => Profile) => {
    const p=latest.current;
    if(replacing.current||!p)return;
    const next=fn(p);
    latest.current=next;setProfile(next);
    if(saveTimer.current)clearTimeout(saveTimer.current);
    saveTimer.current=setTimeout(persist,250);
  }, [persist]);

  // Flush on tab hide.
  useEffect(() => {
    const flush = () => {
      persist();
    };
    document.addEventListener("visibilitychange", flush);
    window.addEventListener("pagehide", flush);
    return () => {
      document.removeEventListener("visibilitychange", flush);
      window.removeEventListener("pagehide", flush);
    };
  }, [persist]);

  const toast = useCallback((msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg((m) => (m === msg ? null : m)), 2600);
  }, []);

  const addUpload = useCallback(async (blob: Blob) => {
    if (blob.size > 4_000_000) return null;
    try {
      const bmp = await createImageBitmap(blob, { resizeWidth: 512, resizeQuality: "high" });
      const id = randomId();
      // Store a downscaled PNG, not the original.
      const c = document.createElement("canvas");
      c.width = bmp.width;
      c.height = bmp.height;
      c.getContext("2d")!.drawImage(bmp, 0, 0);
      const png = await new Promise<Blob | null>((r) => c.toBlob(r, "image/png"));
      if (!png) { bmp.close(); return null; }
      if (!await putUpload(id, png)) setToastMsg("Sticker is available for this session only. Download a backup to keep it.");
      uploads.current.set(id, bmp);
      setUploadsVersion((v) => v + 1);
      return id;
    } catch {
      return null;
    }
  }, []);

  const go = useCallback((s: Screen) => setScreen(previous => {
    if ((s.name === 'garage' || s.name === 'body') && (previous.name === 'garage' || previous.name === 'body')) {
      return { ...s, returnTo: s.returnTo ?? previous.returnTo };
    }
    return s;
  }), []);

  // Development only: hooks for driving the app headlessly. Not in production builds.
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    (window as unknown as { __dev?: unknown }).__dev = {
      grant: (n: number) => save((p) => ({ ...p, tokens: p.tokens + n })),
      settings: (patch: Record<string, unknown>) => save((p) => ({ ...p, settings: { ...p.settings, ...patch } })),
      equip: (patch: Record<string, unknown>) =>
        save((p) => {
          const builds = [...p.builds];
          builds[p.active] = { ...builds[p.active], ...patch };
          const owned = Array.from(new Set([...p.owned, ...Object.values(patch).filter((v): v is string => typeof v === "string")]));
          return { ...p, builds, owned, seenIntro: true };
        }),
    };
  }, [save]);

  const ctx: AppCtx | null = useMemo(
    () =>
      profile
        ? { profile, save, replaceSave, viewport, screen, go, toast, uploads: uploads.current, addUpload, uploadsVersion }
        : null,
    [profile, save, replaceSave, viewport, screen, go, toast, addUpload, uploadsVersion],
  );

  return (
    <div className="stage">
      <canvas ref={canvas} className="gl" aria-label="3D view" />
      {glError && (
        <div className="modal-back">
          <div className="panel modal">
            <h2>3D isn't available</h2>
            <p>This browser couldn't start WebGPU or WebGL 2, which the races need. Try a recent Chrome, Edge, Firefox or Safari, and check hardware acceleration is on.</p>
            <p className="muted small">{glError}</p>
            <button className="btn primary" onClick={async()=>{
              const p=latest.current;
              if(p){const next={...p,settings:{...p.settings,quality:'low' as const}};await replaceSave(async()=>{await setItem(PROFILE_KEY,next);return next;});}
              location.reload();
            }}>Reload with Low graphics</button>
          </div>
        </div>
      )}
      {!ctx || !viewport ? (
        !glError && <div className="loading">Warming up the motor…</div>
      ) : (
        <Ctx.Provider value={ctx}>
          <div className="ui">
            <Suspense fallback={<div className="loading" role="status">Opening the garage…</div>}>
            {screen.name === "home" && <Home />}
            {screen.name === "garage" && <Garage />}
            {screen.name === "tracks" && <Tracks initial={screen.format} />}
            {screen.name === "race" && <RaceScreen key={screen.setup.cfg.seed + screen.setup.trackId} setup={screen.setup} />}
            {screen.name === "results" && <Results data={screen.data} />}
            {screen.name === "replay" && <Replay data={screen.data} />}
            {screen.name === "body" && <BodyShop initial={screen.recipe} />}
            {screen.name === "city" && <CityScreen initial={screen.course} />}
            {screen.name === "settings" && <SettingsScreen />}
            </Suspense>
            {incoming && <IncomingModal incoming={incoming} onClose={() => setIncoming(null)} />}
            {toastMsg && (
              <div className="toast" role="status">
                {toastMsg}
              </div>
            )}
          </div>
        </Ctx.Provider>
      )}
    </div>
  );
}
