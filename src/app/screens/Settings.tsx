import { useState } from "react";
import { exportBackup, importBackup } from "../../store/backup.ts";
import { useApp } from "../state.tsx";
import { TopBar, Seg } from "../ui.tsx";
import { useTurntable } from "../hooks.ts";
import { activeBuild, newProfile, type Settings } from "../../store/profile.ts";
import { clearAll, setItem } from "../../store/db.ts";
import { audio } from "../../render/audio.ts";

export function SettingsScreen() {
  const [busy, setBusy] = useState(false);
  const { profile, save, replaceSave, toast, viewport, uploads } = useApp();
  useTurntable(activeBuild(profile), { x: -0.2, mx: 0, my: 0.3 });
  const s = profile.settings;
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => save((p) => ({ ...p, settings: { ...p.settings, [k]: v } }));

  async function exportSave() {
    setBusy(true);
    try {
      const blob = new Blob([JSON.stringify(await exportBackup(profile))], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "rollout-gp-save.json";
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    } catch { toast("Couldn't export the save. Try again."); }
    finally { setBusy(false); }
  }

  return (
    <div className="screen">
      <TopBar title="Settings" />
      <div className="sidepanel panel">
        <div className="scroll">
          <div className="section">
            <h3>City run comfort</h3>
            <div className="field" style={{ marginTop: 10 }}>
              <label htmlFor="fov">Field of view: {s.fov}°</label>
              <input id="fov" type="range" min={55} max={110} value={s.fov} onChange={(e) => set("fov", Number(e.target.value))} />
            </div>
            <div className="row" style={{ marginTop: 10 }}>
              <span className="fieldlabel grow">View</span>
              <Seg
                label="City camera"
                value={s.cityView}
                options={[
                  { value: "first", label: "First person" },
                  { value: "third", label: "Third person" },
                  { value: "drone", label: "Drone" },
                ]}
                onChange={(v) => set("cityView", v)}
              />
            </div>
            <div className="row" style={{ marginTop: 10 }}>
              <span className="fieldlabel grow">Head bob</span>
              <Seg label="Head bob" value={s.headBob ? "on" : "off"} options={[{ value: "on", label: "On" }, { value: "off", label: "Off" }]} onChange={(v) => set("headBob", v === "on")} />
            </div>
            <div className="row" style={{ marginTop: 10 }}>
              <span className="fieldlabel grow">Sprint vignette</span>
              <Seg label="Vignette" value={s.vignette ? "on" : "off"} options={[{ value: "on", label: "On" }, { value: "off", label: "Off" }]} onChange={(v) => set("vignette", v === "on")} />
            </div>
            <div className="field" style={{ marginTop: 10 }}>
              <label htmlFor="sens">Look sensitivity: {s.mouseSensitivity.toFixed(1)}×</label>
              <input id="sens" type="range" min={0.2} max={3} step={0.1} value={s.mouseSensitivity} onChange={(e) => set("mouseSensitivity", Number(e.target.value))} />
            </div>
            <div className="row" style={{ marginTop: 10 }}>
              <span className="fieldlabel grow">Cheer boost</span>
              <Seg label="Cheer" value={s.cheer ? "on" : "off"} options={[{ value: "on", label: "On" }, { value: "off", label: "Off (purist)" }]} onChange={(v) => set("cheer", v === "on")} />
            </div>
            <p className="small muted">The cheer gives your car a small, short speed bump when you're close to it. Turn it off if you want the car's run to be all build.</p>
          </div>
          <div className="section">
            <h3>Sound and graphics</h3>
            <div className="field" style={{ marginTop: 10 }}>
              <label htmlFor="vol">Volume: {Math.round(s.volume * 100)}%</label>
              <input
                id="vol"
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={s.volume}
                onChange={(e) => {
                  set("volume", Number(e.target.value));
                  audio.setVolume(Number(e.target.value));
                }}
              />
            </div>
            <div className="row" style={{ marginTop: 10 }}>
              <span className="fieldlabel grow">Quality</span>
              <Seg label="Quality" value={s.quality} options={[{ value: "low", label: "Low" }, { value: "medium", label: "Medium" }, { value: "high", label: "High" }, { value: "ultra", label: "Ultra" }]} onChange={(v) => set("quality", v)} />
            </div>
            <p className="small muted">Rendering with {viewport?.backend === "webgpu" ? "WebGPU" : "WebGL 2"} · {Math.round(viewport?.fps ?? 0)} fps</p>
          </div>
          <div className="section">
            <h3>Your save</h3>
            <p className="small muted">Builds, ghosts and personal stickers stay in this browser. No analytics or tracking. Backups include your sticker images; share links omit them.</p>
            <div className="row">
              <button className="btn small" onClick={exportSave} disabled={busy}>
                <span>Download save</span>
              </button>
              <label className="btn small">
                <span>Restore save</span>
                <input type="file" accept="application/json,.json" aria-label="Restore save" disabled={busy} className="sr-only" onChange={async e => {
                  const file = e.target.files?.[0]; e.target.value = '';
                  if (!file) return;
                  if (file.size > 64_000_000) return toast('Save file is too large (64 MB maximum).');
                  if (!confirm('Replace your current garage with this backup? Download your current save first if you want to keep it.')) return;
                  setBusy(true);
                  try { const data=JSON.parse(await file.text()); await replaceSave(()=>importBackup(data)); location.reload(); }
                  catch (error) { toast(String(error)); setBusy(false); }
                }} />
              </label>
              <button
                disabled={busy}
                className="btn small ghost"
                onClick={async () => {
                  if (!confirm("Delete all your builds, parts, tokens and designs? This can't be undone.")) return;
                  setBusy(true);
                  try {
                  await replaceSave(async()=>{
                    await clearAll();
                    const fresh = newProfile();
                    await setItem("profile", fresh);
                    return fresh;
                  });
                  for (const image of uploads.values()) image.close();
                  uploads.clear();
                  toast("Save deleted. Fresh kit car in the garage.");
                  } catch (error) { toast(String(error)); } finally { setBusy(false); }
                }}
              >
                <span>Delete all data</span>
              </button>
            </div>
          </div>
          <div className="section small muted">
            <p>Rollout GP · v1.1.0-rc.1 · workshop preview</p>
            <p>
              Rollout GP is an original game inspired by the self-steering mini 4WD hobby and the 90s anime about it. Part names, cars and characters are original. Not affiliated with Tamiya or any show.
            </p>
            <p>Real-world numbers (regulation limits, motor speed ranges, damper weights) come from the hobby's published specs; everything else is a game value, labelled where it matters.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
