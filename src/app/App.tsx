import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Viewport } from "../render/viewport.ts";
import { getItem, putUpload, getUpload, setItem } from "../store/db.ts";
import { migrateProfile, newProfile, randomId, type Profile } from "../store/profile.ts";
import { Ctx, type AppCtx, type Screen } from "./state.tsx";
import { Home } from "./screens/Home.tsx";
import { Garage } from "./screens/Garage.tsx";
import { Tracks } from "./screens/Tracks.tsx";
import { RaceScreen } from "./screens/RaceScreen.tsx";
import { Results } from "./screens/Results.tsx";
import { Replay } from "./screens/Replay.tsx";
import { BodyShop } from "./screens/BodyShop.tsx";
import { CityScreen } from "./screens/CityScreen.tsx";
import { SettingsScreen } from "./screens/Settings.tsx";
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

  // Load the profile.
  useEffect(() => {
    getItem<unknown>(PROFILE_KEY).then((raw) => {
      const p = raw ? migrateProfile(raw) : newProfile();
      latest.current = p;
      setProfile(p);
      // Load any personal sticker images used by saved designs.
      const ids = new Set<string>();
      for (const b of p.builds) for (const d of b.body.paint.decals) if (d.sticker.startsWith("upload:")) ids.add(d.sticker.slice(7));
      for (const r of p.designs) for (const d of r.paint.decals) if (d.sticker.startsWith("upload:")) ids.add(d.sticker.slice(7));
      Promise.all(
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
    Viewport.create(canvas.current!, "high")
      .then((v) => {
        if (cancelled) return v.dispose();
        vp = v;
        setViewport(v);
        (window as unknown as { __rollout?: unknown }).__rollout = { backend: v.backend };
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
    setProfile((p) => {
      if (!p) return p;
      const next = fn(p);
      latest.current = next;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        if (latest.current) setItem(PROFILE_KEY, latest.current);
      }, 250);
      return next;
    });
  }, []);

  // Flush on tab hide.
  useEffect(() => {
    const flush = () => {
      if (latest.current) setItem(PROFILE_KEY, latest.current);
    };
    document.addEventListener("visibilitychange", flush);
    window.addEventListener("pagehide", flush);
    return () => {
      document.removeEventListener("visibilitychange", flush);
      window.removeEventListener("pagehide", flush);
    };
  }, []);

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
      if (png) await putUpload(id, png);
      uploads.current.set(id, bmp);
      setUploadsVersion((v) => v + 1);
      return id;
    } catch {
      return null;
    }
  }, []);

  const go = useCallback((s: Screen) => setScreen(s), []);

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
        ? { profile, save, viewport, screen, go, toast, uploads: uploads.current, addUpload, uploadsVersion }
        : null,
    [profile, save, viewport, screen, go, toast, addUpload, uploadsVersion],
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
          </div>
        </div>
      )}
      {!ctx || !viewport ? (
        !glError && <div className="loading">Warming up the motor…</div>
      ) : (
        <Ctx.Provider value={ctx}>
          <div className="ui">
            {screen.name === "home" && <Home />}
            {screen.name === "garage" && <Garage />}
            {screen.name === "tracks" && <Tracks initial={screen.format} />}
            {screen.name === "race" && <RaceScreen key={screen.setup.cfg.seed + screen.setup.trackId} setup={screen.setup} />}
            {screen.name === "results" && <Results data={screen.data} />}
            {screen.name === "replay" && <Replay data={screen.data} />}
            {screen.name === "body" && <BodyShop initial={screen.recipe} />}
            {screen.name === "city" && <CityScreen initial={screen.course} />}
            {screen.name === "settings" && <SettingsScreen />}
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
