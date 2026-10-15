import { useEffect, useRef, useState } from "react";
import { useApp, type ResultsData } from "../state.tsx";
import { RaceView, type CameraMode } from "../../render/raceView.ts";
import { buildTrack } from "../../sim/track/geometry.ts";
import { TopBar, Seg } from "../ui.tsx";
import { PLAYER_ID } from "../../game/formats.ts";

export function Replay({ data }: { data: ResultsData }) {
  const { viewport, go, uploads } = useApp();
  const ref = useRef<RaceView | null>(null);
  const [cam, setCam] = useState<CameraMode>("tv");
  const [rate, setRate] = useState(1);
  const [ended, setEnded] = useState(false);
  useEffect(() => {
    if (!viewport) return;
    const s = data.setup;
    const entries = [...s.cfg.entries, ...s.ghosts.flatMap((g) => g.entries.map((e) => ({ ...e, ghost: true })))];
    const v = new RaceView(buildTrack(s.cfg.track), entries.map((e) => ({ build: e.build, ghost: "ghost" in e && e.ghost === true })), (id) => uploads.get(id) ?? null);
    v.follow = Math.max(0, s.cfg.entries.findIndex((e) => e.id === PLAYER_ID));
    v.loadReplay(data.frames.t, data.frames.cars);
    v.onReplayEnd = () => setEnded(true);
    ref.current = v;
    viewport.setView(v);
  }, [viewport, data, uploads]);
  return (
    <div className="screen">
      <TopBar title="Replay" back={() => go({ name: "results", data })} />
      <div className="hud-bottom">
        <span className="chip">{ended ? "End of the race" : "Replaying"}</span>
        <div className="row">
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
              if (ref.current) ref.current.mode = c;
            }}
          />
          <Seg
            label="Replay speed"
            value={rate}
            options={[
              { value: 0.25, label: "¼×" },
              { value: 1, label: "1×" },
              { value: 2, label: "2×" },
            ]}
            onChange={(r) => {
              setRate(r);
              if (ref.current) ref.current.replayRate = r;
            }}
          />
          <button
            className="btn"
            onClick={() => {
              const v = ref.current;
              if (!v) return;
              v.loadReplay(data.frames.t, data.frames.cars);
              v.onReplayEnd = () => setEnded(true);
              setEnded(false);
            }}
          >
            <span>Restart</span>
          </button>
          <button className="btn primary" onClick={() => go({ name: "results", data })}>
            <span>Results</span>
          </button>
        </div>
      </div>
    </div>
  );
}
