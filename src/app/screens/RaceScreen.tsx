import { useEffect, useRef, useState } from "react";
import { useApp, type RaceSetup } from "../state.tsx";
import { RaceView, type CameraMode } from "../../render/raceView.ts";
import { buildTrack } from "../../sim/track/geometry.ts";
import { liveSim, type LiveRace } from "../../sim/client.ts";
import { CAR_STRIDE, STATUS_NAME } from "../../sim/protocol.ts";
import type { RaceEvent } from "../../sim/race.ts";
import { Modal, Seg } from "../ui.tsx";
import { PLAYER_ID } from "../../game/formats.ts";
import { settle } from "../../game/session.ts";
import { trackById } from "../../sim/tracks.ts";
import { audio } from "../../render/audio.ts";

interface Row {
  id: string;
  name: string;
  color: string;
  lap: number;
  status: string;
  dist: number;
  speed: number;
  volts: number;
  ghost: boolean;
}

export function RaceScreen({ setup }: { setup: RaceSetup }) {
  const { viewport, go, save, profile, uploads } = useApp();
  const viewRef = useRef<RaceView | null>(null);
  const liveRef = useRef<LiveRace | null>(null);
  const framesRef = useRef<{ t: number[]; cars: Float32Array[] }>({ t: [], cars: [] });
  const [error, setError] = useState<string | null>(null);
  const [count, setCount] = useState<number | null>(3);
  const [rows, setRows] = useState<Row[]>([]);
  const [events, setEvents] = useState<RaceEvent[]>([]);
  const [speed, setSpeed] = useState(1);
  const [cam, setCam] = useState<CameraMode>("tv");
  const [pitAsked, setPitAsked] = useState(false);
  const [t, setT] = useState(0);
  const track = trackById(setup.trackId)!;
  const entries = [...setup.cfg.entries, ...setup.ghosts.flatMap((g) => g.entries.map((e) => ({ ...e, ghost: true })))];
  const meIndex = setup.cfg.entries.findIndex((e) => e.id === PLAYER_ID);

  // Build the scene.
  useEffect(() => {
    if (!viewport) return;
    const geo = buildTrack(setup.cfg.track);
    const v = new RaceView(
      geo,
      entries.map((e) => ({ build: e.build, ghost: "ghost" in e && e.ghost === true })),
      (id) => uploads.get(id) ?? null,
    );
    v.follow = Math.max(0, meIndex);
    viewRef.current = v;
    viewport.setView(v);
    audio.start(profile.settings.volume);
    return () => {
      liveRef.current?.stop();
      audio.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewport]);

  // Countdown, then release.
  useEffect(() => {
    if (count === null) return;
    if (count === 0) {
      audio.beep(880, 0.35);
      const timer = setTimeout(() => setCount(null), 600);
      release();
      return () => clearTimeout(timer);
    }
    audio.beep(440, 0.15);
    const timer = setTimeout(() => setCount(count - 1), 800);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count]);

  function release() {
    const v = viewRef.current;
    if (!v) return;
    let lastUi = 0;
    const live = liveSim.race(setup.cfg, setup.ghosts, speed, (time, cars, evs) => {
      v.pushFrame(time, cars);
      const f = framesRef.current;
      if (f.t.length === 0 || time - f.t[f.t.length - 1] >= 1 / 30) {
        f.t.push(time);
        f.cars.push(cars);
      }
      if (evs.length) {
        setEvents((old) => [...old, ...evs].slice(-5));
        for (const e of evs) if (e.kind === "out") audio.crash();
      }
      const me = meIndex * CAR_STRIDE;
      audio.motor(cars[me + 7] ?? 0, cars[me + 8] === 0);
      const now = performance.now();
      if (now - lastUi > 120) {
        lastUi = now;
        setT(time);
        setRows(
          entries.map((e, i) => {
            const o = i * CAR_STRIDE;
            return {
              id: e.id,
              name: e.name,
              color: e.color,
              lap: cars[o + 9],
              status: STATUS_NAME[cars[o + 8]] ?? "racing",
              dist: cars[o + 13],
              speed: cars[o + 7],
              volts: cars[o + 10],
              ghost: cars[o + 12] === 1,
            };
          }),
        );
      }
    });
    liveRef.current = live;
    live.done
      .then((result) => {
        audio.stop();
        const settled = settle(profile, { format: setup.format, trackId: setup.trackId, cup: setup.cup, build: setup.build, seed: setup.cfg.seed, lane: setup.cfg.entries[meIndex]?.lane ?? 0 }, result);
        save(() => settled.profile);
        go({
          name: "results",
          data: { setup, result, reward: settled.reward, notes: settled.notes, place: settled.place, cupNext: settled.cupNext, cupOver: settled.cupOver, frames: framesRef.current },
        });
      })
      .catch(e => { audio.stop(); setError(String(e)); });
  }

  const setSpeedBoth = (s: number) => {
    setSpeed(s);
    liveRef.current?.setSpeed(s);
    if (viewRef.current) viewRef.current.speed = s;
  };

  const ordered = [...rows].filter((r) => !r.ghost).sort((a, b) => {
    const rank = (r: Row) => (r.status === "out" ? 0 : 1);
    if (rank(a) !== rank(b)) return rank(b) - rank(a);
    return b.dist - a.dist;
  });
  const me = rows.find((r) => r.id === PLAYER_ID);
  const laps = setup.cfg.laps;

  return (
    <div className="screen">
      {error && <Modal label="Race interrupted"><h2>Race interrupted</h2><p>{error}</p><button className="btn primary" onClick={() => go({ name: "tracks" })}>Back to tracks</button></Modal>}
      <div className="hud-top">
        <div className="panel standings" aria-label="Standings">
          <div className="row spread small muted" style={{ marginBottom: 4 }}>
            <span>{track.name}</span>
            <span className="num">{t.toFixed(1)} s</span>
          </div>
          {ordered.map((r, i) => (
            <button
              key={r.id}
              className={`standing ${r.id === PLAYER_ID ? "me" : ""} ${r.status === "out" ? "out" : ""}`}
              style={{ appearance: "none", border: 0, background: "transparent", width: "100%", textAlign: "left", cursor: "pointer" }}
              onClick={() => {
                const idx = entries.findIndex((e) => e.id === r.id);
                if (viewRef.current && idx >= 0) viewRef.current.follow = idx;
              }}
            >
              <span className="pos">{i + 1}</span>
              <span className="sw" style={{ background: r.color }} />
              <span>{r.name}</span>
              <span className="num small">{r.status === "finished" ? "FIN" : r.status === "out" ? "OUT" : r.status === "pitting" ? "PIT" : `L${Math.min(laps, r.lap + 1)}/${laps}`}</span>
            </button>
          ))}
        </div>
        {me && (
          <div className="panel gauge" aria-label="Your car">
            <div>
              <span className="speed num">{me.speed.toFixed(1)}</span>
              <span className="unit">km/h</span>
            </div>
            <div className="small muted" style={{ margin: "6px 0 4px" }}>
              Battery {me.volts.toFixed(2)} V
            </div>
            <div className="bar">
              <i style={{ width: `${Math.max(0, Math.min(100, ((me.volts - 2.2) / 0.6) * 100))}%`, background: me.volts < 2.45 ? "#e8402a" : undefined }} />
            </div>
          </div>
        )}
      </div>
      {count !== null && (
        <div className="countdown" aria-live="assertive">
          {count === 0 ? "GO!" : count}
        </div>
      )}
      <div className="hud-bottom">
        <div className="ticker" aria-live="polite">
          {events.map((e, i) => (
            <div key={`${e.t}-${i}`} className={`ev ${e.kind}`}>
              {e.text}
            </div>
          ))}
        </div>
        <div className="row">
          {setup.format === "endurance" && (
            <button
              className="btn yellow"
              disabled={pitAsked || me?.status !== "racing"}
              onClick={() => {
                liveRef.current?.pit(PLAYER_ID);
                setPitAsked(true);
              }}
            >
              <span>{pitAsked ? "Pit called" : "Pit for batteries"}</span>
            </button>
          )}
          <Seg
            label="Camera"
            value={cam}
            options={[
              { value: "tv", label: "TV" },
              { value: "chase", label: "Chase" },
              { value: "overhead", label: "Overhead" },
            ]}
            onChange={(c) => {
              setCam(c);
              if (viewRef.current) viewRef.current.mode = c;
            }}
          />
          <Seg
            label="Speed"
            value={speed}
            options={[
              { value: 1, label: "1×" },
              { value: 2, label: "2×" },
              { value: 4, label: "4×" },
            ]}
            onChange={setSpeedBoth}
          />
          <button
            className="btn ghost small"
            onClick={() => {
              liveRef.current?.stop();
              go({ name: "tracks", format: setup.format === "practice" ? undefined : setup.format });
            }}
          >
            <span>Quit</span>
          </button>
        </div>
      </div>
    </div>
  );
}
