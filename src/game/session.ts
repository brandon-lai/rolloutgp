// Turning a finished race into rewards, ghosts, medals and cup progress. Pure,
// so it is tested without a browser.

import type { Profile } from "../store/profile.ts";
import { CUP_REWARD, enduranceReward, heatReward, medalFor, trialReward } from "../store/profile.ts";
import type { RaceResult } from "../sim/protocol.ts";
import { CUP_ROUNDS, PLAYER_ID, type CupState, type Format } from "./formats.ts";
import { trackById } from "../sim/tracks.ts";
import type { Build } from "../sim/build.ts";

export interface Settled {
  profile: Profile;
  reward: number;
  notes: string[];
  place: number;
  finished: boolean;
  /** Cup: the next round's state if the player went through. */
  cupNext?: CupState;
  cupOver?: "won" | "out";
}

export function settle(
  p: Profile,
  setup: { format: Format | "practice"; trackId: string; cup?: CupState; build: Build; seed: number; lane: number },
  result: RaceResult,
): Settled {
  const racers = result.standings.filter((s) => !s.ghost);
  const idx = racers.findIndex((s) => s.id === PLAYER_ID);
  const me = racers[idx];
  const place = idx + 1;
  const finished = me?.telemetry.finishTime !== null && me?.telemetry.finishTime !== undefined;
  const track = trackById(setup.trackId);
  const difficulty = track?.difficulty ?? 1;
  const notes: string[] = [];
  let reward = 0;
  let next: Profile = {
    ...p,
    stats: {
      ...p.stats,
      wins: p.stats.wins + (place === 1 && finished && racers.length > 1 ? 1 : 0),
      courseOuts: p.stats.courseOuts + (me?.telemetry.courseOut ? 1 : 0),
    },
  };
  let cupNext: CupState | undefined;
  let cupOver: Settled["cupOver"];

  if (setup.format === "heat") {
    reward = heatReward(place, finished, difficulty);
    notes.push(finished ? `${ordinal(place)} of ${racers.length}` : "Course-out: participation tokens");
  } else if (setup.format === "endurance") {
    reward = enduranceReward(place, finished);
    notes.push(finished ? `${ordinal(place)} in the endurance race` : "Didn't make the distance");
  } else if (setup.format === "trial") {
    const time = me?.telemetry.finishTime ?? null;
    if (time !== null) {
      const prev = p.medals[setup.trackId] ?? 0;
      const medal = medalFor(setup.trackId, time);
      reward = trialReward(prev, Math.max(prev, medal), difficulty);
      if (medal > prev) {
        next = { ...next, medals: { ...next.medals, [setup.trackId]: medal } };
        notes.push(`New ${["", "bronze", "silver", "gold"][medal]} medal`);
      }
      const ghost = p.ghosts[setup.trackId];
      if (!ghost || time < ghost.time) {
        next = { ...next, ghosts: { ...next.ghosts, [setup.trackId]: { time, build: setup.build, seed: setup.seed, lane: setup.lane, at: new Date().toISOString() } } };
        const by = ghost ? ghost.time - time : 0;
        notes.push(ghost ? `New best by ${by < 0.01 ? by.toFixed(3) : by.toFixed(2)} s: this run is your ghost now` : "This run is your ghost now");
      }
    } else {
      reward = 5;
      notes.push("No time: the car didn't finish");
    }
  } else if (setup.format === "cup" && setup.cup) {
    const round = CUP_ROUNDS[setup.cup.round];
    const through = finished && place <= round.advance;
    const results = [...setup.cup.results, { track: setup.trackId, place: finished ? place : 0, time: me?.telemetry.finishTime ?? null }];
    reward = heatReward(place, finished, round.track.difficulty);
    if (!through) {
      cupOver = "out";
      notes.push(finished ? `Eliminated in round ${setup.cup.round + 1} (${ordinal(place)})` : `Eliminated in round ${setup.cup.round + 1}: course-out`);
    } else if (setup.cup.round === CUP_ROUNDS.length - 1) {
      cupOver = "won";
      reward += CUP_REWARD;
      next = { ...next, cups: [...next.cups, new Date().toISOString()] };
      notes.push("You won the Rollout Cup!");
    } else {
      cupNext = { round: setup.cup.round + 1, results, seed: setup.cup.seed };
      notes.push(`Through to round ${setup.cup.round + 2}: ${CUP_ROUNDS[setup.cup.round + 1].track.name}`);
    }
  }

  next = { ...next, tokens: next.tokens + reward };
  return { profile: next, reward, notes, place, finished, cupNext, cupOver };
}

export function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
