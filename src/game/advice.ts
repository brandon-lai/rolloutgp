// Reading the telemetry back as tuning advice. The PRD's rule: show where time
// was lost and why, so a player can say "I lost because I ran 3.5:1 on a twisty
// course" instead of staring at a stat bar.

import type { Build } from "../sim/build.ts";
import type { Telemetry } from "../sim/race.ts";
import type { Feature } from "../sim/track/geometry.ts";
import { TRACE_FIELDS } from "../sim/race.ts";
import { part, type GearPart, type TirePart } from "../sim/parts.ts";

export interface Tip {
  kind: "warn" | "info";
  title: string;
  body: string;
}

export function advise(t: Telemetry, build: Build, features: Feature[], topSpeedSpec: number): Tip[] {
  const tips: Tip[] = [];
  const laps = Math.max(1, t.laps.length + (t.finishTime === null ? 1 : 0));
  const gear = part<GearPart>(build.gear);
  const tires = part<TirePart>(build.tires);

  // Samples of the trace.
  const n = t.trace.length / TRACE_FIELDS;
  let braking = 0;
  for (let i = 0; i < n; i++) if (t.trace[i * TRACE_FIELDS + 5]) braking++;

  const out = t.courseOut;
  if (out) {
    const before = features.filter((f) => f.end <= out.xh + 0.5 && f.jump).slice(-1)[0];
    const recentJump = [...t.jumps].reverse().find((j) => j.lap === out.lap);
    const fromJump = recentJump && before && out.xh - before.end < 12 && recentJump.airtime > 0.12;
    if (out.cause === "stuck") {
      tips.push({
        kind: "warn",
        title: `Stuck at ${out.feature}`,
        body: "The car stopped making progress. Usually it is wedged on a wall top after a big landing. A settled car (mass dampers, brakes) lands upright.",
      });
    } else if (fromJump || out.cause === "flew off") {
      const j = recentJump;
      tips.push({
        kind: "warn",
        title: `Flew off at ${out.feature} (${out.speedKmh.toFixed(0)} km/h)`,
        body:
          j && j.airtime > 0.12
            ? `It left ${j.feature} at ${j.launchKmh.toFixed(0)} km/h and spent ${(j.airtime * 1000).toFixed(0)} ms in the air, so it was still flying when the walls turned. Fit brake sponges low at the rear to scrub speed on the ramp, or a higher gear (${gear.ratio > 4 ? "a torque motor" : "4.2:1 or 5:1"}) so it arrives slower.`
            : "It hit the wall hard enough to climb it. Wider plates with bearing rollers turn it sooner and softer; two-tier stays stop it tipping over the wall.",
      });
    } else if (out.cause === "rolled over" || out.cause === "hit the wall top") {
      tips.push({
        kind: "warn",
        title: `Rolled at ${out.feature}`,
        body: `A high centre of gravity tips over in fast corners and banks. Low-profile tires, a clear body, the AX chassis, or two-tier stays all help. ${tires.profile === "large" ? "Your large tires lift the whole car." : ""}`.trim(),
      });
    } else {
      tips.push({ kind: "warn", title: `Out at ${out.feature}`, body: `Course-out (${out.cause}) at ${out.speedKmh.toFixed(0)} km/h.` });
    }
  }

  const hopsPerLap = t.hops / laps;
  if (hopsPerLap > 9 && build.dampers.part === null) {
    tips.push({
      kind: "info",
      title: `Bouncy: ${hopsPerLap.toFixed(0)} hops a lap`,
      body: "All four wheels left the track that often. Mass dampers soak up landings so the rollers stay on the walls.",
    });
  }

  if (t.corners.length > 0 && t.topKmh > 0) {
    const avgExit = t.corners.reduce((s, c) => s + c.exitKmh, 0) / t.corners.length;
    if (avgExit < t.topKmh * 0.72) {
      tips.push({
        kind: "info",
        title: `Corners cost ${Math.round((1 - avgExit / t.topKmh) * 100)}% of your speed`,
        body: `Average corner exit ${avgExit.toFixed(1)} km/h against a ${t.topKmh.toFixed(1)} km/h top. Ball-bearing rollers waste less on the walls, and harder tires slide through instead of fighting the turn${tires.compound === "soft" ? " (yours are soft)" : ""}.`,
      });
    }
  }

  if (topSpeedSpec > 0 && t.topKmh < topSpeedSpec * 0.82 && !out) {
    tips.push({
      kind: "info",
      title: "Never reached top speed",
      body: `Peak ${t.topKmh.toFixed(1)} km/h of a possible ${topSpeedSpec.toFixed(1)}. The straights here are too short for ${gear.ratio}:1. A higher ratio or a torque motor accelerates harder.`,
    });
  }

  if (n > 0 && braking / n > 0.18) {
    tips.push({
      kind: "info",
      title: "Brakes dragging a lot",
      body: `The sponges were touching ${Math.round((braking / n) * 100)}% of the time. Raise them a millimetre if you don't need them before every slope.`,
    });
  }

  if (!out && tips.length === 0) {
    const best = Math.min(...t.laps);
    tips.push({
      kind: "info",
      title: "Clean run",
      body: `Best lap ${best.toFixed(2)} s. There's room for more speed: a lower gear ratio or a stronger motor. Watch the jumps when you add it.`,
    });
  }
  return tips;
}
