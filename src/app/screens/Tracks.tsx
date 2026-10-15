import { useMemo, useState } from "react";
import { useApp, type RaceSetup } from "../state.tsx";
import { TopBar, TrackMap, Dots, fmtTime, Seg } from "../ui.tsx";
import { FORMATS, TRACK_ORDER, CUP_ROUNDS, cupConfig, enduranceConfig, ghostConfig, heatConfig, trialConfig, ENDURANCE, type Format, type CupState } from "../../game/formats.ts";
import { rivalsFor, RIVALS } from "../../game/rivals.ts";
import { activeBuild, missingParts, TRIAL_TARGETS, CUP_REWARD } from "../../store/profile.ts";
import { fitProblems, inspect } from "../../sim/build.ts";
import { part } from "../../sim/parts.ts";
import { useTurntable } from "../hooks.ts";

export function Tracks({ initial }: { initial?: Format }) {
  const { profile, go, save, toast } = useApp();
  const [format, setFormat] = useState<Format>(initial ?? "heat");
  const [trackId, setTrackId] = useState(TRACK_ORDER[0].id);
  const build = activeBuild(profile);
  useTurntable(build, { x: 0.3, mx: 0, my: 0.3 });
  const track = format === "cup" ? CUP_ROUNDS[0].track : TRACK_ORDER.find((t) => t.id === trackId)!;
  const seed = useMemo(() => (Math.random() * 1e9) >>> 0, [format, trackId]);
  const missing = missingParts(profile, build);
  const fit = fitProblems(build);
  const ins = inspect(build);
  const illegal = profile.settings.regulation && !ins.legal;

  const blocked = missing.length > 0 ? `You don't own: ${missing.map((id) => part(id).name).join(", ")}. Buy them in the garage, or switch builds.` : fit.length > 0 ? fit[0].message : illegal ? `Fails tech inspection (${ins.checks.filter((c) => !c.ok).map((c) => c.label.toLowerCase()).join(", ")}). Fix it, or switch to open class in the garage.` : null;

  function start() {
    if (blocked) return toast(blocked);
    let setup: RaceSetup;
    if (format === "heat") setup = { format, trackId: track.id, cfg: heatConfig(build, profile.owner, track, seed), ghosts: [], build };
    else if (format === "trial") {
      const g = profile.ghosts[track.id];
      setup = { format, trackId: track.id, cfg: trialConfig(build, profile.owner, track, seed), ghosts: g ? [ghostConfig(g, profile.owner, track)] : [], build };
    } else if (format === "endurance") setup = { format, trackId: track.id, cfg: enduranceConfig(build, profile.owner, track, seed), ghosts: [], build };
    else {
      const cup: CupState = { round: 0, results: [], seed };
      setup = { format, trackId: CUP_ROUNDS[0].track.id, cfg: cupConfig(build, profile.owner, cup), ghosts: [], cup, build };
    }
    save((p) => ({ ...p, stats: { ...p.stats, races: p.stats.races + 1 } }));
    go({ name: "race", setup });
  }

  const rivals = format === "heat" || format === "endurance" ? rivalsFor(track.difficulty, format === "endurance" ? seed + 1 : seed) : format === "cup" ? RIVALS : [];
  const ghost = profile.ghosts[track.id];
  const medal = profile.medals[track.id] ?? 0;
  const targets = TRIAL_TARGETS[track.id];

  return (
    <div className="screen">
      <TopBar title="Race" />
      <div className="sidepanel left panel" style={{ width: "min(720px, calc(100% - 32px))" }}>
        <div className="panel-head" style={{ flexWrap: "wrap" }}>
          <Seg label="Format" value={format} options={FORMATS.map((f) => ({ value: f.id, label: f.name }))} onChange={setFormat} />
        </div>
        <div className="scroll">
          <div className="section">
            <p style={{ margin: 0 }}>{FORMATS.find((f) => f.id === format)!.blurb}</p>
            <p className="small muted" style={{ margin: "4px 0 0" }}>
              Tests: {FORMATS.find((f) => f.id === format)!.tests}
            </p>
          </div>
          {format !== "cup" ? (
            <div className="trackgrid">
              {TRACK_ORDER.map((t) => (
                <button key={t.id} className={`trackcard ${t.id === trackId ? "on" : ""}`} onClick={() => setTrackId(t.id)} aria-pressed={t.id === trackId}>
                  <div className="row spread">
                    <b className="display" style={{ fontSize: 22 }}>
                      {t.name}
                    </b>
                    <Dots n={t.difficulty} />
                  </div>
                  <TrackMap track={t} />
                  <span className="small muted">{t.rewards}</span>
                  {format === "trial" && (
                    <span className="small">
                      Best {fmtTime(profile.ghosts[t.id]?.time)} · {["no medal", "bronze", "silver", "gold"][profile.medals[t.id] ?? 0]}
                    </span>
                  )}
                </button>
              ))}
            </div>
          ) : (
            <div className="section">
              <h3>The Rollout Cup</h3>
              <ol>
                {CUP_ROUNDS.map((r, i) => (
                  <li key={i} style={{ marginBottom: 6 }}>
                    <b>{r.track.name}</b> <span className="muted small">— top {r.advance} {i === CUP_ROUNDS.length - 1 ? "wins the cup" : "go through"}</span>
                  </li>
                ))}
              </ol>
              <p className="small muted">Win it for {CUP_REWARD} tokens. You can retune between rounds. {profile.cups.length > 0 ? `You've won it ${profile.cups.length} time${profile.cups.length > 1 ? "s" : ""}.` : ""}</p>
            </div>
          )}
          <div className="section">
            <h3>{format === "cup" ? "Opponents" : track.name}</h3>
            {format !== "cup" && <p className="small" style={{ marginTop: 6 }}>{track.blurb}</p>}
            {format === "trial" && targets && (
              <p className="small">
                Medals: bronze {targets[0]} s · silver {targets[1]} s · gold {targets[2]} s. {ghost ? `Your ghost (${ghost.time.toFixed(2)} s) races with you.` : "Your best run becomes your ghost."}
                {medal > 0 && ` You have ${["", "bronze", "silver", "gold"][medal]}.`}
              </p>
            )}
            {format === "endurance" && (
              <p className="small">
                {ENDURANCE.laps} laps with the battery draining fast. You get one battery swap: press <b>Pit</b> and the car stops for fresh cells next time it crosses the line. Pit too early and you'll fade again; too late and you'll crawl.
              </p>
            )}
            {rivals.length > 0 && (
              <div className="partlist" style={{ padding: 0, marginTop: 8 }}>
                {rivals.map((r) => (
                  <div key={r.id} className="part">
                    <span className="pname" style={{ color: r.color }}>
                      {r.name}
                    </span>
                    <span />
                    <span className="pblurb">{r.style}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="panel-foot">
          {blocked && (
            <p className="small" style={{ color: "#ffb3a7", width: "100%", margin: 0 }}>
              {blocked}
            </p>
          )}
          <button className="btn primary big grow" onClick={start} disabled={Boolean(blocked)}>
            <span>Release · {build.name}</span>
          </button>
          <button className="btn" onClick={() => go({ name: "garage" })}>
            <span>Garage</span>
          </button>
        </div>
      </div>
    </div>
  );
}
