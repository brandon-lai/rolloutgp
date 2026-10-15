import { useMemo, useState, type ReactNode } from "react";
import { useApp } from "../state.tsx";
import { useTurntable } from "../hooks.ts";
import { TopBar, Seg, fmtTime } from "../ui.tsx";
import { activeBuild, buyBody, buyPart, canBuy, MAX_BUILDS } from "../../store/profile.ts";
import { STARTER_BUILD, carSpec, fitProblems, inspect, type Build } from "../../sim/build.ts";
import {
  BEARINGS,
  BRAKES,
  CHASSIS,
  DAMPERS,
  GEARS,
  MOTORS,
  ROLLERS,
  SLOTS,
  STAYS,
  TIRES,
  part,
  type Part,
  type SlotId,
  type StayPart,
  type ChassisPart,
  type MotorPart,
  type TirePart,
  type RollerPart,
  type GearPart,
  type BearingPart,
  type DamperPart,
  type BrakePart,
} from "../../sim/parts.ts";
import { BODY_PRESETS } from "../../sim/bodies.ts";
import { bodyProps } from "../../sim/body.ts";
import { fastSim } from "../../sim/client.ts";
import { PRACTICE } from "../../sim/tracks.ts";
import { trialConfig } from "../../game/formats.ts";
import { advise, type Tip } from "../../game/advice.ts";
import { buildTrack } from "../../sim/track/geometry.ts";
import type { RaceResult } from "../../sim/protocol.ts";
import { buildLink } from "../share.ts";
import { RaceView } from "../../render/raceView.ts";

type Tab = "parts" | "inspect" | "test" | "builds";

export function Garage() {
  const { profile, save, go, toast, viewport } = useApp();
  const build = activeBuild(profile);
  const [tab, setTab] = useState<Tab>("parts");
  const [slot, setSlot] = useState<SlotId | null>(null);
  const [watching, setWatching] = useState(false);
  useTurntable(watching ? null : build, { x: -0.2, mx: 0, my: 0.3 }, tab === "inspect");

  const setBuild = (fn: (b: Build) => Build) =>
    save((p) => {
      const builds = [...p.builds];
      builds[p.active] = fn(builds[p.active]);
      return { ...p, builds };
    });

  const spec = useMemo(() => carSpec(build), [build]);
  const ins = useMemo(() => inspect(build), [build]);
  const fit = useMemo(() => fitProblems(build), [build]);

  const [test, setTest] = useState<{ result: RaceResult; tips: Tip[]; build: Build } | null>(null);
  const [testing, setTesting] = useState(false);

  async function runTest() {
    setTesting(true);
    try {
      const cfg = trialConfig(build, profile.owner, PRACTICE, 12345);
      const result = await fastSim.simulate(cfg, true);
      const me = result.standings[0];
      const tips = advise(me.telemetry, build, buildTrack(PRACTICE).features, spec.stats.topSpeedKmh);
      setTest({ result, tips, build });
    } catch (e) {
      toast("The test run failed: " + String(e));
    } finally {
      setTesting(false);
    }
  }

  function watch() {
    if (!test?.result.replay || !viewport) return;
    const geo = buildTrack(PRACTICE);
    const v = new RaceView(geo, [{ build: test.build }]);
    v.mode = "chase";
    v.loadReplay(test.result.replay.t, test.result.replay.cars);
    v.onReplayEnd = () => {
      setWatching(false);
    };
    viewport.setView(v);
    setWatching(true);
  }

  if (watching) {
    return (
      <div className="screen">
        <TopBar title="Practice lane replay" back={() => setWatching(false)} />
        <div className="hud-bottom">
          <span className="chip">Replaying your test run</span>
          <button className="btn" onClick={() => setWatching(false)}>
            <span>Back to garage</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="screen">
      <TopBar title="Garage" />
      <div className="sidepanel panel">
        <div className="tabs" role="tablist">
          {(
            [
              ["parts", "Parts"],
              ["inspect", "Inspect"],
              ["test", "Test lane"],
              ["builds", "Builds"],
            ] as [Tab, string][]
          ).map(([id, label]) => (
            <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? "on" : ""} onClick={() => (setTab(id), setSlot(null))}>
              {label}
            </button>
          ))}
        </div>

        {tab === "parts" && !slot && (
          <div className="scroll">
            <div className="slots">
              {SLOTS.map((s, i) => {
                const problem = fit.find((f) => f.slot === s.id);
                return (
                  <button key={s.id} className="slot" onClick={() => setSlot(s.id)}>
                    <span className="n">{i + 1}</span>
                    <span style={{ minWidth: 0 }}>
                      <div className="label">{s.name}</div>
                      <div className="value">{slotSummary(build, s.id)}</div>
                      {problem && <div className="warn">{problem.message}</div>}
                    </span>
                    <span aria-hidden>›</span>
                  </button>
                );
              })}
            </div>
            <div className="section">
              <Stats spec={spec} />
            </div>
          </div>
        )}

        {tab === "parts" && slot && (
          <SlotPicker
            slot={slot}
            build={build}
            onBack={() => setSlot(null)}
            setBuild={setBuild}
            onBuy={(id) => {
              if (!canBuy(profile, id)) return toast("Not enough tokens yet. Race to earn more.");
              save((p) => buyPart(p, id));
              toast(`Bought ${part(id).name}`);
            }}
            onBuyBody={(id) => {
              const pr = BODY_PRESETS.find((b) => b.id === id)!;
              if (profile.tokens < pr.price) return toast("Not enough tokens yet.");
              save((p) => buyBody(p, id));
              toast(`Bought the ${pr.name} body`);
            }}
          />
        )}

        {tab === "inspect" && (
          <div className="scroll">
            <div className="section">
              <div className="row spread">
                <h3>Tech inspection</h3>
                <Seg
                  label="Class"
                  value={profile.settings.regulation ? "reg" : "open"}
                  options={[
                    { value: "reg", label: "Regulation" },
                    { value: "open", label: "Open" },
                  ]}
                  onChange={(v) => save((p) => ({ ...p, settings: { ...p.settings, regulation: v === "reg" } }))}
                />
              </div>
              <p className="small muted">
                {profile.settings.regulation
                  ? "Official limits apply. An illegal car can't enter track races."
                  : "Open class: no limits, show-style builds allowed. Big crashes can crack the body or bend a stay."}
              </p>
              <div className="checks">
                {ins.checks.map((c) => (
                  <Check key={c.id} label={c.label} value={c.value} limit={c.limit} ok={c.ok} />
                ))}
              </div>
              {!ins.legal && profile.settings.regulation && <p className="chip bad" style={{ marginTop: 10 }}>Fails inspection</p>}
              {ins.legal && <p className="chip good" style={{ marginTop: 10 }}>Passes inspection</p>}
            </div>
            <div className="section">
              <h3>Balance</h3>
              <Stats spec={spec} detail />
              <p className="small muted">The yellow dot on the car is its centre of gravity. Lower is steadier in banks and corners; further back lifts the nose over crests.</p>
            </div>
          </div>
        )}

        {tab === "test" && (
          <div className="scroll">
            <div className="section">
              <h3>Practice lane</h3>
              <p className="small muted">One lane: a straight, two corners and a jump, three laps. Runs instantly, so you can try a change before you race it.</p>
              <div className="row">
                <button className="btn primary" onClick={runTest} disabled={testing}>
                  <span>{testing ? "Running…" : test ? "Run again" : "Run 3 laps"}</span>
                </button>
                {test?.result.replay && (
                  <button className="btn" onClick={watch}>
                    <span>Watch it</span>
                  </button>
                )}
              </div>
            </div>
            {test && <TestResult test={test} current={build} />}
          </div>
        )}

        {tab === "builds" && (
          <div className="scroll">
            <div className="section">
              <div className="field">
                <label htmlFor="bname">Name this build</label>
                <input id="bname" type="text" maxLength={32} value={build.name} onChange={(e) => setBuild((b) => ({ ...b, name: e.target.value.slice(0, 32) }))} />
              </div>
            </div>
            <div className="partlist">
              {profile.builds.map((b, i) => (
                <button key={i} className={`part ${i === profile.active ? "on" : ""}`} onClick={() => save((p) => ({ ...p, active: i }))}>
                  <span className="pname">{b.name || `Build ${i + 1}`}</span>
                  <span className="small muted">{i === profile.active ? "Racing this" : ""}</span>
                  <span className="pblurb">
                    {part(b.motor).name} · {part<GearPart>(b.gear).ratio}:1 · {part(b.tires).name}
                  </span>
                </button>
              ))}
            </div>
            <div className="panel-foot">
              <button
                className="btn small"
                disabled={profile.builds.length >= MAX_BUILDS}
                onClick={() => save((p) => ({ ...p, builds: [...p.builds, { ...p.builds[p.active], name: `${p.builds[p.active].name} copy`.slice(0, 32) }], active: p.builds.length }))}
              >
                <span>Duplicate</span>
              </button>
              <button className="btn small" disabled={profile.builds.length >= MAX_BUILDS} onClick={() => save((p) => ({ ...p, builds: [...p.builds, { ...STARTER_BUILD, name: "Kit car" }], active: p.builds.length }))}>
                <span>New from kit</span>
              </button>
              <button
                className="btn small"
                onClick={async () => {
                  const link = await buildLink(build);
                  try {
                    await navigator.clipboard.writeText(link);
                    toast("Link copied. Anyone can load this build.");
                  } catch {
                    prompt("Copy this link", link);
                  }
                }}
              >
                <span>Share link</span>
              </button>
              <button
                className="btn small ghost"
                disabled={profile.builds.length <= 1}
                onClick={() => {
                  if (!confirm(`Delete "${build.name}"?`)) return;
                  save((p) => {
                    const builds = p.builds.filter((_, i) => i !== p.active);
                    return { ...p, builds, active: 0 };
                  });
                }}
              >
                <span>Delete</span>
              </button>
            </div>
          </div>
        )}

        <div className="panel-foot">
          <button className="btn primary grow" onClick={() => go({ name: "tracks" })}>
            <span>Race this car</span>
          </button>
          <button className="btn yellow" onClick={() => go({ name: "body" })}>
            <span>Body shop</span>
          </button>
        </div>
      </div>
    </div>
  );
}

function Check({ label, value, limit, ok }: { label: string; value: string; limit: string; ok: boolean }) {
  return (
    <>
      <span>{label}</span>
      <span className="num">
        {value} <span className="muted small">({limit})</span>
      </span>
      <span className={ok ? "ok" : "no"}>{ok ? "OK" : "FAIL"}</span>
    </>
  );
}

function Stats({ spec, detail }: { spec: ReturnType<typeof carSpec>; detail?: boolean }) {
  const s = spec.stats;
  return (
    <div className="statgrid">
      <div className="stat">
        <div className="k">Top speed</div>
        <div className="v num">
          {s.topSpeedKmh}
          <span className="small muted"> km/h</span>
        </div>
      </div>
      <div className="stat">
        <div className="k">Weight</div>
        <div className="v num">
          {s.massG}
          <span className="small muted"> g</span>
        </div>
      </div>
      <div className="stat">
        <div className="k">Width</div>
        <div className="v num">
          {s.widthMm}
          <span className="small muted"> mm</span>
        </div>
      </div>
      {detail && (
        <>
          <div className="stat">
            <div className="k">CoG height</div>
            <div className="v num">
              {s.comHeightMm}
              <span className="small muted"> mm</span>
            </div>
          </div>
          <div className="stat">
            <div className="k">CoG fore/aft</div>
            <div className="v num">
              {s.comXMm > 0 ? "+" : ""}
              {s.comXMm}
              <span className="small muted"> mm</span>
            </div>
          </div>
          <div className="stat">
            <div className="k">Clearance</div>
            <div className="v num">
              {s.clearanceMm}
              <span className="small muted"> mm</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function TestResult({ test, current }: { test: { result: RaceResult; tips: Tip[]; build: Build }; current: Build }) {
  const t = test.result.standings[0].telemetry;
  const stale = JSON.stringify(test.build) !== JSON.stringify(current);
  return (
    <>
      <div className="section">
        {stale && <p className="chip gold">You've changed the car since this run</p>}
        <div className="statgrid" style={{ marginTop: 8 }}>
          <div className="stat">
            <div className="k">Finish</div>
            <div className="v num">{t.finishTime !== null ? t.finishTime.toFixed(2) : "OUT"}</div>
          </div>
          <div className="stat">
            <div className="k">Top speed</div>
            <div className="v num">{t.topKmh.toFixed(1)}</div>
          </div>
          <div className="stat">
            <div className="k">Longest air</div>
            <div className="v num">{(Math.max(0, ...t.jumps.map((j) => j.airtime)) * 1000).toFixed(0)} ms</div>
          </div>
        </div>
        <table className="t" style={{ marginTop: 10 }}>
          <thead>
            <tr>
              <th>Lap</th>
              <th>Time</th>
              <th>Jump air</th>
            </tr>
          </thead>
          <tbody>
            {t.laps.map((l, i) => (
              <tr key={i}>
                <td>{i + 1}</td>
                <td className="num">{fmtTime(l)}</td>
                <td className="num">{(Math.max(0, ...t.jumps.filter((j) => j.lap === i + 1).map((j) => j.airtime)) * 1000).toFixed(0)} ms</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="section">
        {test.tips.map((tip, i) => (
          <div key={i} className={`tip ${tip.kind}`}>
            <span className="ic">{tip.kind === "warn" ? "!" : "i"}</span>
            <div>
              <b>{tip.title}</b>
              <div className="small muted">{tip.body}</div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

// ----- Slot picker --------------------------------------------------------------

function slotSummary(b: Build, slot: SlotId): string {
  switch (slot) {
    case "chassis":
      return part(b.chassis).name;
    case "motor":
      return part(b.motor).name;
    case "gear":
      return part(b.gear).name;
    case "tires":
      return part(b.tires).name;
    case "rollers": {
      const r = part<RollerPart>(b.rollers.roller);
      return `${r.name} · ${part<StayPart>(b.rollers.front).name.replace(/ \(front\)/, "")}${b.rollers.side ? " + sides" : ""}`;
    }
    case "dampers":
      return b.dampers.part ? `${part(b.dampers.part).name}, ${b.dampers.mount}` : "None";
    case "brakes":
      return b.brakes.part ? `${part(b.brakes.part).name}, ${b.brakes.position}, ${b.brakes.gap} mm` : "None";
    case "bearings":
      return part(b.bearings).name;
    case "body":
      return `${b.body.name}${b.body.clear ? " (clear)" : ""}`;
  }
}

function specLine(p: Part): string[] {
  switch (p.slot) {
    case "chassis": {
      const c = p as ChassisPart;
      return [`${c.family === "mid" ? "Midship" : c.family === "front" ? "Front motor" : "Rear motor"}`, `${c.shaft === "double" ? "twin-shaft" : "single-shaft"} motors`, `${c.mass} g`, `wheelbase ${c.wheelbase} mm`, c.sideMounts ? "side mounts" : ""];
    }
    case "motor": {
      const m = p as MotorPart;
      return [`${(m.freeRpm / 1000).toFixed(1)}k rpm free`, `${m.stallTorque} mN·m stall`, m.shaft === "double" ? "twin-shaft" : "single-shaft", m.rpmRange ? `${m.rpmRange[0].toLocaleString()}–${m.rpmRange[1].toLocaleString()} rpm at peak eff.` : ""];
    }
    case "gear":
      return [`${(p as GearPart).ratio}:1`];
    case "tires": {
      const t = p as TirePart;
      return [`${t.diameter} mm`, t.compound, `grip ${t.muLong.toFixed(2)} / side ${t.muLat.toFixed(2)}`, `${t.mass} g set`];
    }
    case "rollers": {
      if ((p as RollerPart).kind === "roller") {
        const r = p as RollerPart;
        return [`${r.diameter} mm`, r.type === "bearing" ? "ball-bearing" : "plastic", `drag ${r.friction}`];
      }
      const s = p as StayPart;
      return [`${s.position}`, `span ${s.span} mm`, s.tiers.length > 1 ? "two-tier" : "", `${s.mass} g`];
    }
    case "dampers":
      return [`${(p as DamperPart).each} g each, pair`];
    case "brakes":
      return [`friction ${(p as BrakePart).friction}`];
    case "bearings": {
      const b = p as BearingPart;
      return [`drag ${b.dragTorque} mN·m`, b.rollerFriction < 1 ? "greased rollers" : ""];
    }
  }
  return [];
}

function PartRow({ p, on, owned, problem, onPick, onBuy }: { p: Part; on: boolean; owned: boolean; problem?: string; onPick: () => void; onBuy: () => void }) {
  return (
    <div className={`part ${on ? "on" : ""} ${owned ? "" : "locked"}`} role="group" aria-label={p.name}>
      <span className="pname">{p.name}</span>
      <span>
        {on ? (
          <span className="chip gold">Fitted</span>
        ) : owned ? (
          <button className="btn small" onClick={onPick}>
            <span>Fit</span>
          </button>
        ) : (
          <button className="btn small yellow" onClick={onBuy}>
            <span>Buy · {p.price}</span>
          </button>
        )}
      </span>
      <span className="pblurb">{p.blurb}</span>
      <span className="pspec">
        {specLine(p)
          .filter(Boolean)
          .map((s, i) => (
            <span key={i}>{s}</span>
          ))}
      </span>
      {p.real && <span className="real">Real-world: {p.real}</span>}
      {problem && <span className="pblurb" style={{ color: "#ffb3a7" }}>{problem}</span>}
    </div>
  );
}

function SlotPicker({
  slot,
  build,
  onBack,
  setBuild,
  onBuy,
  onBuyBody,
}: {
  slot: SlotId;
  build: Build;
  onBack: () => void;
  setBuild: (fn: (b: Build) => Build) => void;
  onBuy: (id: string) => void;
  onBuyBody: (id: string) => void;
}) {
  const { profile, go } = useApp();
  const owned = new Set(profile.owned);
  const meta = SLOTS.find((s) => s.id === slot)!;
  const ch = part<ChassisPart>(build.chassis);
  const list = (parts: Part[], current: string | null, apply: (id: string) => void, problemFor?: (p: Part) => string | undefined) =>
    parts.map((p) => <PartRow key={p.id} p={p} on={current === p.id} owned={owned.has(p.id)} problem={problemFor?.(p)} onPick={() => apply(p.id)} onBuy={() => onBuy(p.id)} />);

  let body: ReactNode = null;
  switch (slot) {
    case "chassis":
      body = list(CHASSIS, build.chassis, (id) =>
        setBuild((b) => {
          const next = part<ChassisPart>(id);
          // Swap to the matching motor shaft if the old one won't fit.
          const mo = part<MotorPart>(b.motor);
          const motor = mo.shaft === next.shaft ? b.motor : next.shaft === "double" ? "mo-twin-stock" : "mo-stock";
          const side = next.sideMounts ? b.rollers.side : null;
          const dampers = !side && b.dampers.mount === "side" ? { ...b.dampers, mount: "rear" as const } : b.dampers;
          return { ...b, chassis: id, motor, rollers: { ...b.rollers, side }, dampers };
        }),
      );
      break;
    case "motor":
      body = list(
        MOTORS.filter((m) => m.shaft === ch.shaft).concat(MOTORS.filter((m) => m.shaft !== ch.shaft)),
        build.motor,
        (id) => setBuild((b) => ({ ...b, motor: id })),
        (p) => ((p as MotorPart).shaft !== ch.shaft ? `Doesn't fit the ${ch.name} (${ch.shaft === "double" ? "needs twin-shaft" : "needs single-shaft"}).` : undefined),
      );
      break;
    case "gear":
      body = list(GEARS, build.gear, (id) => setBuild((b) => ({ ...b, gear: id })));
      break;
    case "tires":
      body = list(TIRES, build.tires, (id) => setBuild((b) => ({ ...b, tires: id })));
      break;
    case "bearings":
      body = list(BEARINGS, build.bearings, (id) => setBuild((b) => ({ ...b, bearings: id })));
      break;
    case "rollers":
      body = (
        <>
          <h3>Rollers</h3>
          {list(ROLLERS, build.rollers.roller, (id) => setBuild((b) => ({ ...b, rollers: { ...b.rollers, roller: id } })))}
          <h3 style={{ marginTop: 10 }}>Front stay</h3>
          {list(
            STAYS.filter((s) => s.position === "front"),
            build.rollers.front,
            (id) => setBuild((b) => ({ ...b, rollers: { ...b.rollers, front: id } })),
          )}
          <h3 style={{ marginTop: 10 }}>Rear stay</h3>
          {list(
            STAYS.filter((s) => s.position === "rear"),
            build.rollers.rear,
            (id) => setBuild((b) => ({ ...b, rollers: { ...b.rollers, rear: id } })),
          )}
          <h3 style={{ marginTop: 10 }}>Side stays</h3>
          <div className="row">
            <Seg
              label="Side stays"
              value={build.rollers.side ? "on" : "off"}
              options={[
                { value: "off", label: "None" },
                { value: "on", label: "Fitted" },
              ]}
              onChange={(v) => {
                if (v === "on" && !owned.has("st-side")) return onBuy("st-side");
                setBuild((b) => ({ ...b, rollers: { ...b.rollers, side: v === "on" ? "st-side" : null }, dampers: v === "off" && b.dampers.mount === "side" ? { ...b.dampers, mount: "rear" } : b.dampers }));
              }}
            />
            {!ch.sideMounts && <span className="small muted">{ch.name} has no side mounts.</span>}
            {!owned.has("st-side") && <span className="small muted">Side stays: {part("st-side").price} tokens</span>}
          </div>
        </>
      );
      break;
    case "dampers":
      body = (
        <>
          <div className="row">
            <span className="fieldlabel">Mount</span>
            <Seg
              label="Damper mount"
              value={build.dampers.mount}
              options={[
                { value: "front", label: "Front" },
                { value: "rear", label: "Rear" },
                { value: "side", label: "Side" },
              ]}
              onChange={(v) => setBuild((b) => ({ ...b, dampers: { ...b.dampers, mount: v } }))}
            />
          </div>
          <button className={`part ${build.dampers.part === null ? "on" : ""}`} onClick={() => setBuild((b) => ({ ...b, dampers: { ...b.dampers, part: null } }))}>
            <span className="pname">No dampers</span>
          </button>
          {list(DAMPERS, build.dampers.part, (id) => setBuild((b) => ({ ...b, dampers: { ...b.dampers, part: id } })))}
        </>
      );
      break;
    case "brakes":
      body = (
        <>
          <div className="row">
            <span className="fieldlabel">Where</span>
            <Seg
              label="Brake position"
              value={build.brakes.position}
              options={[
                { value: "rear", label: "Rear" },
                { value: "front", label: "Front" },
                { value: "both", label: "Both" },
              ]}
              onChange={(v) => setBuild((b) => ({ ...b, brakes: { ...b.brakes, position: v } }))}
            />
          </div>
          <div className="row">
            <span className="fieldlabel">Height off the track</span>
            <Seg
              label="Brake height"
              value={build.brakes.gap}
              options={[
                { value: 1, label: "1 mm" },
                { value: 2, label: "2 mm" },
                { value: 3, label: "3 mm" },
              ]}
              onChange={(v) => setBuild((b) => ({ ...b, brakes: { ...b.brakes, gap: v } }))}
            />
          </div>
          <p className="small muted">Lower sponges touch on more of every slope: more speed scrubbed before jumps, more time lost everywhere else.</p>
          <button className={`part ${build.brakes.part === null ? "on" : ""}`} onClick={() => setBuild((b) => ({ ...b, brakes: { ...b.brakes, part: null } }))}>
            <span className="pname">No brakes</span>
          </button>
          {list(BRAKES, build.brakes.part, (id) => setBuild((b) => ({ ...b, brakes: { ...b.brakes, part: id } })))}
        </>
      );
      break;
    case "body":
      body = (
        <>
          <div className="row">
            <span className="fieldlabel">Shell</span>
            <Seg
              label="Body material"
              value={build.body.clear ? "clear" : "abs"}
              options={[
                { value: "abs", label: "Stock (ABS)" },
                { value: "clear", label: "Clear (light)" },
              ]}
              onChange={(v) => setBuild((b) => ({ ...b, body: { ...b.body, clear: v === "clear" } }))}
            />
          </div>
          <p className="small muted">This body: {bodyProps(build.body).mass.toFixed(1)} g. Clear shells are lighter, which stresses the motor less, but crack sooner in open class.</p>
          {BODY_PRESETS.map((pr) => {
            const own = profile.bodies.includes(pr.id);
            const on = build.body.base === pr.id && build.body.name === pr.name;
            return (
              <div key={pr.id} className={`part ${on ? "on" : ""}`}>
                <span className="pname">{pr.name}</span>
                <span>
                  {on ? (
                    <span className="chip gold">Fitted</span>
                  ) : own ? (
                    <button className="btn small" onClick={() => setBuild((b) => ({ ...b, body: { ...pr.recipe, clear: b.body.clear } }))}>
                      <span>Fit</span>
                    </button>
                  ) : (
                    <button className="btn small yellow" onClick={() => onBuyBody(pr.id)}>
                      <span>Buy · {pr.price}</span>
                    </button>
                  )}
                </span>
                <span className="pblurb">{pr.style}</span>
              </div>
            );
          })}
          {profile.designs.length > 0 && <h3 style={{ marginTop: 10 }}>Your designs</h3>}
          {profile.designs.map((d, i) => (
            <div key={i} className={`part ${JSON.stringify(build.body) === JSON.stringify(d) ? "on" : ""}`}>
              <span className="pname">{d.name}</span>
              <button className="btn small" onClick={() => setBuild((b) => ({ ...b, body: d }))}>
                <span>Fit</span>
              </button>
              <span className="pblurb">From {d.base}</span>
            </div>
          ))}
          <button className="btn yellow" onClick={() => go({ name: "body", recipe: build.body })}>
            <span>Edit this body in the body shop</span>
          </button>
        </>
      );
      break;
  }
  const problem = fitProblems(build).filter((f) => f.slot === slot);
  return (
    <>
      <div className="panel-head">
        <button className="iconbtn" onClick={onBack} aria-label="Back to slots">
          ‹
        </button>
        <div className="grow">
          <h3>{meta.name}</h3>
          <div className="small muted">{meta.blurb}</div>
        </div>
      </div>
      <div className="scroll">
        <div className="partlist">
          {problem.map((p, i) => (
            <p key={i} className="chip bad">
              {p.message}
            </p>
          ))}
          {body}
        </div>
      </div>
    </>
  );
}
