import { useState } from "react";
import { useApp } from "../state.tsx";
import { useTurntable } from "../hooks.ts";
import { activeBuild } from "../../store/profile.ts";
import { Tokens, Modal } from "../ui.tsx";

export function Home() {
  const { profile, go, save } = useApp();
  const build = activeBuild(profile);
  useTurntable(build, { x: -0.1, y: 0.02, mx: 0, my: 0.04 });
  const [intro, setIntro] = useState(!profile.seenIntro);
  return (
    <div className="home">
      <div className="brand">
        <div className="logo" aria-label="Rollout GP">
          Rollout
          <br />
          <span className="gp">GP</span>
        </div>
        <div className="checker" aria-hidden />
        <p className="tagline">Build a self-steering racer like the real thing, let it go, and run after it through the city. You never steer.</p>
        <div className="row" style={{ marginTop: 14 }}>
          <Tokens n={profile.tokens} />
          <span className="chip">{build.name}</span>
        </div>
      </div>
      <nav className="menu" aria-label="Main menu">
        <button className="btn primary big" onClick={() => go({ name: "tracks" })}>
          <span>Race</span>
          <span className="sub">Heats, time trials, endurance, the cup</span>
        </button>
        <button className="btn yellow big" onClick={() => go({ name: "city" })}>
          <span>City run</span>
          <span className="sub">Release it downtown and chase it</span>
        </button>
        <button className="btn big" onClick={() => go({ name: "garage" })}>
          <span>Garage</span>
          <span className="sub">Nine slots, a test lane, the parts shop</span>
        </button>
        <div className="row">
          <button className="btn grow" onClick={() => go({ name: "body" })}>
            <span>Body shop</span>
          </button>
          <button className="btn ghost" onClick={() => go({ name: "settings" })}>
            <span>Settings</span>
          </button>
        </div>
      </nav>
      <div className="home-foot">An original game about a real hobby. Not affiliated with any toy or anime brand.</div>
      {intro && (
        <Modal label="How it works">
          <h2>You never steer.</h2>
          <p>
            These cars run in walled lanes and turn by bouncing their <b>rollers</b> off the walls. Every race is decided in the <b>garage</b>: motor, gears, tires, rollers, dampers, brakes, body.
          </p>
          <p>
            Release it on the track and read the telemetry: where it lost speed, how long it flew, where it came off. Or take it to the <b>city</b>, let it go, and run after it.
          </p>
          <div className="row" style={{ marginTop: 16 }}>
            <button
              className="btn primary"
              onClick={() => {
                setIntro(false);
                save((p) => ({ ...p, seenIntro: true }));
                go({ name: "garage" });
              }}
            >
              <span>Open the garage</span>
            </button>
            <button
              className="btn ghost"
              onClick={() => {
                setIntro(false);
                save((p) => ({ ...p, seenIntro: true }));
              }}
            >
              <span>Look around</span>
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
