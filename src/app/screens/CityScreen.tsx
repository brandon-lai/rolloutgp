import { useEffect, useRef, useState, type MutableRefObject, type PointerEvent as ReactPointerEvent } from "react";
import { useApp } from "../state.tsx";
import { TopBar, Modal } from "../ui.tsx";
import { useTurntable } from "../hooks.ts";
import { COURSES, courseById, type CourseDef } from "../../city/layout.ts";
import { CityView, TETHER } from "../../render/cityView.ts";
import { liveSim, type LiveCity } from "../../sim/client.ts";
import { activeBuild, cityReward, missingParts } from "../../store/profile.ts";
import { motorSeedFor } from "../../sim/race.ts";
import type { CityEvent, CityResult } from "../../sim/cityRun.ts";
import { audio } from "../../render/audio.ts";
import { part } from "../../sim/parts.ts";

const CHEER_COOLDOWN = 8;

export function CityScreen({ initial }: { initial?: string }) {
  const { profile } = useApp();
  const [course, setCourse] = useState<CourseDef | null>(initial ? courseById(initial) ?? null : null);
  const [runKey, setRunKey] = useState(0);
  if (!course) return <CoursePicker onPick={setCourse} />;
  return <CityRunScreen key={runKey} course={course} onAgain={() => setRunKey((k) => k + 1)} onCourses={() => setCourse(null)} cheerOn={profile.settings.cheer} />;
}

function CoursePicker({ onPick }: { onPick: (c: CourseDef) => void }) {
  const { profile, go } = useApp();
  const build = activeBuild(profile);
  useTurntable(build, { x: 0.3, mx: 0, my: 0.3 });
  const missing = missingParts(profile, build);
  return (
    <div className="screen">
      <TopBar title="City run" />
      <div className="sidepanel left panel" style={{ width: "min(620px, calc(100% - 32px))" }}>
        <div className="scroll">
          <div className="section">
            <p style={{ margin: 0 }}>
              Release your car on a street course and chase it on foot. Stay within {TETHER} m to build your <b>spirit</b> multiplier, throw the switch at forks, and when it flies off, run to it and put it back (+5 s).
            </p>
            <p className="small muted" style={{ marginBottom: 0 }}>
              Keyboard: WASD to move, mouse to look, Shift sprint, Space jump/vault/climb, C slide, E pick up, F switch route (aim at a route flag), Q cheer. Gamepad and touch work too.
            </p>
          </div>
          <div className="partlist">
            {COURSES.map((c) => {
              const best = profile.city[c.id];
              return (
                <button key={c.id} className="part" onClick={() => onPick(c)} disabled={missing.length > 0}>
                  <span className="pname display" style={{ fontSize: 22 }}>
                    {c.name}
                  </span>
                  <span className="small muted">
                    {c.laps} laps{best ? ` · best ${best.score.toLocaleString()}` : ""}
                  </span>
                  <span className="pblurb">{c.blurb}</span>
                </button>
              );
            })}
          </div>
          {missing.length > 0 && (
            <div className="section small" style={{ color: "#ffb3a7" }}>
              Your active build uses parts you don't own ({missing.map((id) => part(id).name).join(", ")}).{" "}
              <button className="btn small" onClick={() => go({ name: "garage" })}>
                <span>Garage</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface HudState {
  t: number;
  lap: number;
  status: number;
  speed: number;
  penalty: number;
  dist: number;
  bearing: number;
  onScreen: { x: number; y: number } | null;
  inRange: boolean;
  stamina: number;
  spirit: number;
  mult: number;
  aim: { seg: number; branch: number; label: string } | null;
  nearCar: boolean;
  cheerReady: number;
}

function CityRunScreen({ course, onAgain, onCourses, cheerOn }: { course: CourseDef; onAgain: () => void; onCourses: () => void; cheerOn: boolean }) {
  const { viewport, profile, save, uploads, go } = useApp();
  const viewRef = useRef<CityView | null>(null);
  const liveRef = useRef<LiveCity | null>(null);
  const [count, setCount] = useState<number | null>(3);
  const [hud, setHud] = useState<HudState | null>(null);
  const [events, setEvents] = useState<CityEvent[]>([]);
  const [done, setDone] = useState<{ r: CityResult; score: number; reward: number; best: boolean } | null>(null);
  const [locked, setLocked] = useState(false);
  // Touch controls on coarse pointers (phones, tablets); ?touch=1 forces them.
  const touch = typeof window !== "undefined" && (matchMedia("(pointer: coarse)").matches || new URLSearchParams(location.search).get("touch") === "1");
  const spiritRef = useRef({ spirit: 0, mult: 1, cheerAt: -99, lastT: 0 });
  const keys = useRef(new Set<string>());
  const stick = useRef({ x: 0, y: 0, sprint: false });
  const build = activeBuild(profile);
  const settings = profile.settings;

  // Scene.
  useEffect(() => {
    if (!viewport) return;
    const v = new CityView(course, build, settings, (id) => uploads.get(id) ?? null);
    viewRef.current = v;
    viewport.setView(v);
    audio.start(settings.volume);
    return () => {
      liveRef.current?.stop();
      audio.stop();
      if (document.pointerLockElement) document.exitPointerLock();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewport]);

  useEffect(() => {
    if (viewRef.current) viewRef.current.settings = settings;
  }, [settings]);

  // Countdown, then release.
  useEffect(() => {
    if (count === null) return;
    if (count === 0) {
      audio.beep(880, 0.35);
      release();
      const t = setTimeout(() => setCount(null), 600);
      return () => clearTimeout(t);
    }
    audio.beep(440, 0.15);
    const t = setTimeout(() => setCount(count - 1), 800);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count]);

  function release() {
    const v = viewRef.current;
    if (!v) return;
    v.frozen = false;
    let lastUi = 0;
    const live = liveSim.city({ courseId: course.id, build, motorSeed: motorSeedFor(profile.owner, build.motor) }, (t, car, evs) => {
      v.pushCar(t, car);
      const sp = spiritRef.current;
      const dt = Math.max(0, t - sp.lastT);
      sp.lastT = t;
      const inRange = v.hud.inRange && car[8] === 0;
      // Spirit: in range, the multiplier climbs to x4; out of range it sinks back.
      sp.mult = inRange ? Math.min(4, sp.mult + dt * 0.12) : Math.max(1, sp.mult - dt * 0.5);
      if (inRange) sp.spirit += dt * 10 * sp.mult;
      audio.motor(car[7], car[8] === 0);
      if (evs.length) {
        setEvents((old) => [...old, ...evs].slice(-4));
        for (const e of evs) if (e.kind === "out") audio.crash();
      }
      const now = performance.now();
      if (now - lastUi > 100) {
        lastUi = now;
        setHud({
          t: t + car[13],
          lap: car[9],
          status: car[8],
          speed: car[7],
          penalty: car[13],
          dist: v.hud.carDist,
          bearing: v.hud.carBearing,
          onScreen: v.hud.carOnScreen,
          inRange: v.hud.inRange,
          stamina: v.hud.stamina,
          spirit: sp.spirit,
          mult: sp.mult,
          aim: v.hud.aim,
          nearCar: v.hud.nearCar,
          cheerReady: Math.max(0, CHEER_COOLDOWN - (t - sp.cheerAt)),
        });
      }
    });
    liveRef.current = live;
    live.done
      .then((r) => {
        audio.stop();
        const sp = spiritRef.current;
        const score = Math.max(0, Math.round(sp.spirit + 6000 - r.time * 25 - r.courseOuts * 150));
        const prev = profile.city[course.id];
        const best = !prev || score > prev.score;
        const reward = cityReward(score, !prev);
        save((p) => ({
          ...p,
          tokens: p.tokens + reward,
          city: best ? { ...p.city, [course.id]: { score, time: r.time } } : p.city,
          stats: { ...p.stats, cityRuns: p.stats.cityRuns + 1 },
        }));
        v.frozen = true;
        if (document.pointerLockElement) document.exitPointerLock();
        setDone({ r, score, reward, best });
      })
      .catch(() => {});
  }

  // Actions.
  const act = {
    interact() {
      const v = viewRef.current,
        live = liveRef.current;
      if (!v || !live || !hudRef.current) return;
      if (v.hud.nearCar && (v.carStatus === 1 || v.carStatus === 2)) {
        live.rescue();
        audio.thud();
      }
    },
    switchRoute() {
      const v = viewRef.current,
        live = liveRef.current;
      if (!v || !live) return;
      const aim = v.hud.aim;
      if (!aim || !v.hud.inRange) return;
      v.setFork(aim.seg, aim.branch);
      live.fork(aim.seg, aim.branch);
      audio.beep(660, 0.08);
    },
    cheer() {
      const v = viewRef.current,
        live = liveRef.current;
      const sp = spiritRef.current;
      if (!v || !live || !cheerOn) return;
      if (!v.hud.inRange || sp.lastT - sp.cheerAt < CHEER_COOLDOWN) return;
      sp.cheerAt = sp.lastT;
      live.cheer();
      audio.cheer();
    },
  };
  const hudRef = useRef(hud);
  hudRef.current = hud;

  // Keyboard and mouse.
  useEffect(() => {
    const v = () => viewRef.current;
    const sens = 0.0022 * settings.mouseSensitivity;
    const down = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const k = e.key.toLowerCase();
      keys.current.add(k);
      const view = v();
      if (!view) return;
      if (k === " ") {
        view.input.jump = true;
        e.preventDefault();
      }
      if (k === "c" || k === "control") view.input.slide = true;
      if (k === "e") act.interact();
      if (k === "f") act.switchRoute();
      if (k === "q") act.cheer();
    };
    const up = (e: KeyboardEvent) => keys.current.delete(e.key.toLowerCase());
    const move = (e: MouseEvent) => {
      const view = v();
      if (!view || document.pointerLockElement !== viewport?.canvas) return;
      view.input.lookX += e.movementX * sens;
      view.input.lookY -= e.movementY * sens;
    };
    const lockChange = () => setLocked(document.pointerLockElement === viewport?.canvas);
    const click = () => {
      if (!touch && viewport && document.pointerLockElement !== viewport.canvas) viewport.canvas.requestPointerLock?.();
      else act.switchRoute();
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("mousemove", move);
    document.addEventListener("pointerlockchange", lockChange);
    viewport?.canvas.addEventListener("click", click);
    // Poll held keys and gamepads every frame.
    let raf = 0;
    const pads = { a: false, b: false, x: false, y: false, rb: false };
    const tick = () => {
      const view = v();
      if (view) {
        const k = keys.current;
        let mx = (k.has("d") || k.has("arrowright") ? 1 : 0) - (k.has("a") || k.has("arrowleft") ? 1 : 0);
        let my = (k.has("w") || k.has("arrowup") ? 1 : 0) - (k.has("s") || k.has("arrowdown") ? 1 : 0);
        let sprint = k.has("shift");
        if (stick.current.x || stick.current.y) {
          mx = stick.current.x;
          my = stick.current.y;
          sprint = stick.current.sprint;
        }
        const gp = navigator.getGamepads?.().find((g) => g && g.connected);
        if (gp) {
          const dz = (a: number) => (Math.abs(a) < 0.15 ? 0 : a);
          if (dz(gp.axes[0]) || dz(gp.axes[1])) {
            mx = dz(gp.axes[0]);
            my = -dz(gp.axes[1]);
          }
          view.input.lookX += dz(gp.axes[2] ?? 0) * 0.05 * settings.mouseSensitivity;
          view.input.lookY -= dz(gp.axes[3] ?? 0) * 0.04 * settings.mouseSensitivity;
          sprint = sprint || (gp.buttons[7]?.value ?? 0) > 0.4 || Boolean(gp.buttons[10]?.pressed);
          const btn = (i: number) => Boolean(gp.buttons[i]?.pressed);
          if (btn(0) && !pads.a) view.input.jump = true;
          if (btn(1) && !pads.b) view.input.slide = true;
          if (btn(2) && !pads.x) act.interact();
          if (btn(3) && !pads.y) act.cheer();
          if (btn(5) && !pads.rb) act.switchRoute();
          pads.a = btn(0);
          pads.b = btn(1);
          pads.x = btn(2);
          pads.y = btn(3);
          pads.rb = btn(5);
        }
        view.input.moveX = mx;
        view.input.moveY = my;
        view.input.sprint = sprint;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("mousemove", move);
      document.removeEventListener("pointerlockchange", lockChange);
      viewport?.canvas.removeEventListener("click", click);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewport, settings.mouseSensitivity]);

  // Touch look: drag anywhere on the right two-thirds.
  useEffect(() => {
    if (!touch || !viewport) return;
    const canvas = viewport.canvas;
    let id: number | null = null,
      lx = 0,
      ly = 0,
      sx = 0,
      sy = 0,
      st = 0;
    const down = (e: PointerEvent) => {
      if (e.clientX < window.innerWidth * 0.35) return;
      id = e.pointerId;
      lx = sx = e.clientX;
      ly = sy = e.clientY;
      st = performance.now();
    };
    const move = (e: PointerEvent) => {
      if (e.pointerId !== id || !viewRef.current) return;
      viewRef.current.input.lookX += (e.clientX - lx) * 0.006 * settings.mouseSensitivity;
      viewRef.current.input.lookY -= (e.clientY - ly) * 0.005 * settings.mouseSensitivity;
      lx = e.clientX;
      ly = e.clientY;
    };
    const up = (e: PointerEvent) => {
      if (e.pointerId !== id) return;
      id = null;
      // A quick flick up jumps, a flick down slides.
      const dx = e.clientX - sx,
        dy = e.clientY - sy;
      if (performance.now() - st < 260 && Math.abs(dy) > 45 && Math.abs(dy) > Math.abs(dx) * 1.5 && viewRef.current) {
        if (dy < 0) viewRef.current.input.jump = true;
        else viewRef.current.input.slide = true;
      }
    };
    canvas.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      canvas.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, [touch, viewport, settings.mouseSensitivity]);

  const h = hud;
  const arrowStyle = (() => {
    if (!h || h.onScreen) return null;
    const a = h.bearing;
    const r = 0.36;
    const x = 50 + Math.sin(a) * r * 100;
    // Keep clear of the HUD panels along the top.
    const y = Math.max(26, 50 - Math.cos(a) * r * 100);
    return { left: `${x}%`, top: `${y}%`, transform: `rotate(${a}rad)` };
  })();
  const outStatus = h && (h.status === 1 || h.status === 2);

  return (
    <div className="screen">
      <div className="vignette" style={{ opacity: settings.vignette && h && keys.current.has("shift") ? 1 : 0 }} />
      {settings.cityView === "first" && <div className="crosshair" />}
      {arrowStyle && (
        <svg className="arrow" viewBox="0 0 54 54" style={arrowStyle} aria-hidden>
          <path d="M27 4 L44 40 L27 32 L10 40 Z" fill={outStatus ? "#e8402a" : "#ffd23f"} stroke="#0b1020" strokeWidth="2" />
        </svg>
      )}
      <div className="hud-top">
        <div className="panel standings" style={{ minWidth: 200 }}>
          <div className="row spread small muted">
            <span>{course.name}</span>
            <span>
              Lap {Math.min(course.laps, (h?.lap ?? 0) + 1)}/{course.laps}
            </span>
          </div>
          <div className="display num" style={{ fontSize: 34 }}>
            {(h?.t ?? 0).toFixed(1)}
            <span className="small muted"> s</span>
          </div>
          {h && h.penalty > 0 && <div className="small" style={{ color: "#ffb3a7" }}>+{h.penalty} s in rescues</div>}
          <div className="small muted" style={{ marginTop: 4 }}>Stamina</div>
          <div className="bar">
            <i style={{ width: `${h?.stamina ?? 100}%`, background: (h?.stamina ?? 100) < 25 ? "#e8402a" : undefined }} />
          </div>
        </div>
        <div className="panel gauge" style={{ textAlign: "right" }}>
          <div className="small muted">Spirit</div>
          <div className="speed num" style={{ color: h?.inRange ? "#ffd23f" : undefined }}>
            ×{(h?.mult ?? 1).toFixed(1)}
          </div>
          <div className="small num">{Math.round(h?.spirit ?? 0).toLocaleString()} pts</div>
          <div className="small" style={{ color: h?.inRange ? "#7fe3b0" : "#9fb0d0" }}>
            Car {h ? `${h.dist.toFixed(0)} m` : "—"} · {h?.inRange ? "in range" : "out of range"}
          </div>
        </div>
      </div>

      {h && outStatus && !h.nearCar && <div className="prompt">Course-out! Run to your car ({h.dist.toFixed(0)} m)</div>}
      {h && outStatus && h.nearCar && <div className="prompt">{touch ? "Tap GRAB" : "Press E"} to put it back on the course (+5 s)</div>}
      {h && !outStatus && h.aim && (
        <div className="prompt">{h.inRange ? `${touch ? "Tap SWITCH" : "Press F / click"}: send it ${h.aim.label.toLowerCase()}` : `Get within ${TETHER} m of your car to switch routes`}</div>
      )}

      {!touch && !locked && count === null && !done && (
        <div className="prompt" style={{ top: "40%" }}>
          Click to look around
        </div>
      )}

      {count !== null && (
        <div className="countdown" aria-live="assertive">
          {count === 0 ? "GO!" : count}
        </div>
      )}

      <div className="hud-bottom" style={{ justifyContent: "flex-start" }}>
        <div className="ticker" aria-live="polite">
          {events.map((e, i) => (
            <div key={`${e.t}-${i}`} className={`ev ${e.kind === "out" ? "out" : e.kind === "finish" ? "finish" : ""}`}>
              {e.text}
            </div>
          ))}
        </div>
      </div>
      {!touch && (
        <div style={{ position: "absolute", right: 16, bottom: 16 }} className="row">
          {cheerOn && <span className="chip">{h && h.cheerReady > 0 ? `Cheer ${h.cheerReady.toFixed(0)} s` : "Q: cheer"}</span>}
          <button className="btn ghost small" onClick={() => (liveRef.current?.stop(), onCourses())}>
            <span>Quit</span>
          </button>
        </div>
      )}

      {touch && !done && <TouchControls stick={stick} view={viewRef} act={act} cheerOn={cheerOn} onQuit={() => (liveRef.current?.stop(), onCourses())} />}

      {done && (
        <Modal label="City run results">
          <h2>{done.r.finished ? "Finished!" : "Run over"}</h2>
          <div className="statgrid">
            <div className="stat">
              <div className="k">Time</div>
              <div className="v num">{done.r.time.toFixed(1)} s</div>
            </div>
            <div className="stat">
              <div className="k">Course-outs</div>
              <div className="v num">{done.r.courseOuts}</div>
            </div>
            <div className="stat">
              <div className="k">Score</div>
              <div className="v num">{done.score.toLocaleString()}</div>
            </div>
          </div>
          <p className="small muted">
            Score = 6,000 + spirit points − 25 per second − 150 per course-out. {done.best ? "New best on this course." : ""} Top speed {done.r.topKmh.toFixed(1)} km/h
            {done.r.forks.length ? `; routes: ${done.r.forks.join(", ").toLowerCase()}` : ""}.
          </p>
          <div className="reward num">+{done.reward} tokens</div>
          <div className="row" style={{ marginTop: 14 }}>
            <button className="btn primary" onClick={onAgain}>
              <span>Run it again</span>
            </button>
            <button className="btn" onClick={onCourses}>
              <span>Courses</span>
            </button>
            <button className="btn yellow" onClick={() => go({ name: "garage" })}>
              <span>Garage</span>
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function TouchControls({
  stick,
  view,
  act,
  cheerOn,
  onQuit,
}: {
  stick: MutableRefObject<{ x: number; y: number; sprint: boolean }>;
  view: MutableRefObject<CityView | null>;
  act: { interact(): void; switchRoute(): void; cheer(): void };
  cheerOn: boolean;
  onQuit: () => void;
}) {
  const knob = useRef<HTMLElement>(null);
  const base = useRef<HTMLDivElement>(null);
  const onStick = (e: ReactPointerEvent) => {
    const el = base.current!;
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2,
      cy = r.top + r.height / 2;
    let dx = (e.clientX - cx) / (r.width / 2),
      dy = (e.clientY - cy) / (r.height / 2);
    const l = Math.hypot(dx, dy);
    if (l > 1) {
      dx /= l;
      dy /= l;
    }
    stick.current = { x: dx, y: -dy, sprint: l > 0.92 };
    if (knob.current) knob.current.style.transform = `translate(${dx * 38}px, ${dy * 38}px)`;
  };
  const release = () => {
    stick.current = { x: 0, y: 0, sprint: false };
    if (knob.current) knob.current.style.transform = "";
  };
  return (
    <>
      <div
        ref={base}
        className="stick"
        onPointerDown={(e) => {
          try {
            (e.target as Element).setPointerCapture(e.pointerId);
          } catch {
            /* ignore */
          }
          onStick(e);
        }}
        onPointerMove={(e) => e.buttons && onStick(e)}
        onPointerUp={release}
        onPointerCancel={release}
        aria-label="Move (push to the edge to sprint)"
      >
        <i ref={knob} />
      </div>
      <div className="touchbtns">
        <button onPointerDown={() => view.current && (view.current.input.jump = true)}>Jump</button>
        <button onPointerDown={() => view.current && (view.current.input.slide = true)}>Slide</button>
        <button onPointerDown={() => act.interact()}>Grab</button>
        <button onPointerDown={() => act.switchRoute()}>Switch</button>
        {cheerOn && <button onPointerDown={() => act.cheer()}>Cheer</button>}
        <button onPointerDown={onQuit}>Quit</button>
      </div>
    </>
  );
}
