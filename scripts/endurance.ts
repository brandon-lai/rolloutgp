import RAPIER from "@dimforge/rapier3d-deterministic-compat";
import { Race } from "../src/sim/race.ts";
import { STARTER_BUILD } from "../src/sim/build.ts";
import { enduranceConfig } from "../src/game/formats.ts";
import { SUNDAY } from "../src/sim/tracks.ts";
async function main() {
  await RAPIER.init();
  for (const pitLap of [0, 8, 12, 16]) {
    const cfg = enduranceConfig({ ...STARTER_BUILD, motor: "mo-turbo", gear: "ge-4", rollers: { ...STARTER_BUILD.rollers, roller: "ro-13b" } }, "me", SUNDAY, 4);
    const race = new Race(RAPIER, cfg);
    let volts: string[] = [];
    while (!race.done) {
      race.tick();
      const me = race.runners[0];
      if (pitLap && me.lap === pitLap - 1 && !me.pitRequested && me.pitsLeft > 0) race.requestPit("you");
      if (race.step % (480 * 10) === 0) volts.push(me.car.volts.toFixed(2));
    }
    const st = race.standings().map((r) => `${r.entry.name}:${r.telemetry.finishTime?.toFixed(1) ?? "OUT"}${r.telemetry.pitAt ? "(pit " + r.telemetry.pitAt.toFixed(0) + ")" : ""}`);
    console.log(`pit lap ${pitLap || "never"}`, st.join("  "), "| my volts every 10s:", volts.join(" "));
    race.free();
  }
}
main();
