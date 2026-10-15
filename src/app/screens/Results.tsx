import { useMemo } from "react";
import { useApp, type ResultsData, type RaceSetup } from "../state.tsx";
import { TopBar, SpeedChart, TrackMap, fmtTime } from "../ui.tsx";
import { advise } from "../../game/advice.ts";
import { buildTrack } from "../../sim/track/geometry.ts";
import { carSpec } from "../../sim/build.ts";
import { trackById } from "../../sim/tracks.ts";
import { PLAYER_ID, cupConfig, heatConfig, trialConfig, enduranceConfig, ghostConfig, CUP_ROUNDS } from "../../game/formats.ts";
import { activeBuild } from "../../store/profile.ts";
import { ordinal } from "../../game/session.ts";

export function Results({ data }: { data: ResultsData }) {
  const { go, profile } = useApp();
  const track = trackById(data.setup.trackId)!;
  const racers = data.result.standings.filter((s) => !s.ghost);
  const me = racers.find((s) => s.id === PLAYER_ID)!;
  const t = me.telemetry;
  const tips = useMemo(() => advise(t, data.setup.build, buildTrack(track).features, carSpec(data.setup.build).stats.topSpeedKmh), [t, data.setup.build, track]);
  const out = t.courseOut;

  function again() {
    const build = activeBuild(profile);
    const seed = (Math.random() * 1e9) >>> 0;
    const s = data.setup;
    let setup: RaceSetup;
    if (s.format === "cup" && data.cupNext) setup = { ...s, cup: data.cupNext, trackId: CUP_ROUNDS[data.cupNext.round].track.id, cfg: cupConfig(build, profile.owner, data.cupNext), build };
    else if (s.format === "heat") setup = { ...s, cfg: heatConfig(build, profile.owner, track, seed), build };
    else if (s.format === "trial") {
      const g = profile.ghosts[track.id];
      setup = { ...s, cfg: trialConfig(build, profile.owner, track, seed), ghosts: g ? [ghostConfig(g, profile.owner, track)] : [], build };
    } else if (s.format === "endurance") setup = { ...s, cfg: enduranceConfig(build, profile.owner, track, seed), build };
    else return go({ name: "tracks" });
    setup.cfg.open = !profile.settings.regulation;
    go({ name: "race", setup });
  }

  const cupNextTrack = data.cupNext ? CUP_ROUNDS[data.cupNext.round].track : null;

  return (
    <div className="results">
      <TopBar title={`${track.name} · results`} back={() => go({ name: "tracks", format: data.setup.format === "practice" ? undefined : data.setup.format })} />
      <div className="results-inner">
        <div className="row spread">
          <div>
            <div className="display" style={{ fontSize: 44 }}>
              {data.cupOver === "won" ? "Cup winner!" : t.finishTime !== null ? (racers.length > 1 ? `${ordinal(data.place)} place` : fmtTime(t.finishTime)) : "Course-out"}
            </div>
            {data.notes.map((n, i) => (
              <div key={i} className="muted">
                {n}
              </div>
            ))}
          </div>
          <div style={{ textAlign: "right" }}>
            <div className="reward num">+{data.reward}</div>
            <div className="small muted">tokens</div>
          </div>
        </div>

        <div className="podium">
          {racers.map((r, i) => (
            <div key={r.id} className={`p ${r.id === PLAYER_ID ? "me" : ""}`} style={{ ["--c" as string]: r.color }}>
              <div className="row spread">
                <span className="big">{r.telemetry.finishTime !== null ? i + 1 : "–"}</span>
                <b>{r.name}</b>
              </div>
              <div className="small num">{r.telemetry.finishTime !== null ? fmtTime(r.telemetry.finishTime) : `Out: ${r.telemetry.courseOut?.cause} at ${r.telemetry.courseOut?.feature}`}</div>
              <div className="small muted num">Top {r.telemetry.topKmh.toFixed(1)} km/h</div>
            </div>
          ))}
        </div>

        <div className="row">
          {data.cupNext && cupNextTrack ? (
            <>
              <button className="btn primary big" onClick={again}>
                <span>Round {data.cupNext.round + 1}: {cupNextTrack.name}</span>
              </button>
              <button className="btn" onClick={() => go({ name: "garage", returnTo: data })}>
                <span>Retune first</span>
              </button>
            </>
          ) : (
            <>
              {data.setup.format !== "cup" && (
                <button className="btn primary" onClick={again}>
                  <span>Race again</span>
                </button>
              )}
              <button className="btn yellow" onClick={() => go({ name: "garage" })}>
                <span>Rebuild in the garage</span>
              </button>
            </>
          )}
          <button className="btn" onClick={() => go({ name: "replay", data })} disabled={data.frames.t.length < 2}>
            <span>Watch replay</span>
          </button>
          {data.setup.format === "cup" && data.cupOver && (
            <button className="btn ghost" onClick={() => go({ name: "tracks", format: "cup" })}>
              <span>Back to the cup</span>
            </button>
          )}
        </div>

        <div className="cards">
          <div className="card">
            <h3>Where the time went</h3>
            {tips.map((tip, i) => (
              <div key={i} className={`tip ${tip.kind}`}>
                <span className="ic">{tip.kind === "warn" ? "!" : "i"}</span>
                <div>
                  <b>{tip.title}</b>
                  <div className="small muted">{tip.body}</div>
                </div>
              </div>
            ))}
          </div>
          <div className="card">
            <h3>{out ? "Where it flew off" : "Your lap times"}</h3>
            {out ? (
              <>
                <TrackMap track={track} height={150} marks={[{ x: out.pos.x, z: out.pos.z, color: "#e8402a" }]} />
                <p className="small">
                  Lap {out.lap}, {out.feature}, {out.speedKmh.toFixed(1)} km/h — {out.cause}.
                </p>
              </>
            ) : null}
            <table className="t">
              <thead>
                <tr>
                  <th>Lap</th>
                  <th>Time</th>
                </tr>
              </thead>
              <tbody>
                {t.laps.map((l, i) => (
                  <tr key={i}>
                    <td>{i + 1}</td>
                    <td className="num">{fmtTime(l)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="small muted">
              Top speed {t.topKmh.toFixed(1)} km/h · all four wheels left the track {t.hops} times
            </p>
            {t.pitAt !== null && <p className="small muted">Pitted for fresh batteries at {t.pitAt.toFixed(1)} s.</p>}
            {t.damage.length > 0 && <p className="small" style={{ color: "#ffb3a7" }}>Damage (open class): {t.damage.join(", ")}.</p>}
          </div>
        </div>

        <div className="card">
          <h3>Speed round the lap</h3>
          <SpeedChart t={t} track={track} />
        </div>

        <div className="cards">
          <div className="card">
            <h3>Corner exits</h3>
            <table className="t">
              <thead>
                <tr>
                  <th>Lap</th>
                  <th>Corner</th>
                  <th>Exit</th>
                </tr>
              </thead>
              <tbody>
                {t.corners.slice(0, 18).map((c, i) => (
                  <tr key={i}>
                    <td>{c.lap}</td>
                    <td>{c.feature}</td>
                    <td className="num">{c.exitKmh.toFixed(1)} km/h</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="card">
            <h3>Airtime</h3>
            {t.jumps.filter((j) => j.airtime >= 0.06).length === 0 && <p className="small muted">Never left the ground for long.</p>}
            <table className="t">
              <thead>
                <tr>
                  <th>Lap</th>
                  <th>Where</th>
                  <th>Air</th>
                  <th>Launch</th>
                </tr>
              </thead>
              <tbody>
                {t.jumps
                  .filter((j) => j.airtime >= 0.06)
                  .slice(0, 18)
                  .map((j, i) => (
                    <tr key={i}>
                      <td>{j.lap}</td>
                      <td>{j.feature}</td>
                      <td className="num">{(j.airtime * 1000).toFixed(0)} ms</td>
                      <td className="num">{j.launchKmh.toFixed(1)} km/h</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
