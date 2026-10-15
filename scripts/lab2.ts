// Car on the real practice-lane mesh, launched at a set speed and yaw.
import RAPIER from "@dimforge/rapier3d-deterministic-compat";
import { Car } from "../src/sim/car.ts";
import { STARTER_BUILD, carSpec } from "../src/sim/build.ts";
import { DT, GRAVITY, toKmh } from "../src/sim/units.ts";
import { addTrackColliders } from "../src/sim/race.ts";
import { buildTrack, locate } from "../src/sim/track/geometry.ts";
import { PRACTICE } from "../src/sim/tracks.ts";

async function main() {
  await RAPIER.init();
  const R = RAPIER;
  const yaw = Number(process.argv[2] ?? 5) * Math.PI / 180;
  const speed = Number(process.argv[3] ?? 25);
  const x0 = Number(process.argv[4] ?? 3);
  const forces = process.argv[5] !== "noforce";
  const world = new R.World({ x: 0, y: -GRAVITY, z: 0 });
  world.timestep = DT;
  const geo = buildTrack(PRACTICE);
  addTrackColliders(R, world, geo);
  const spec = carSpec(STARTER_BUILD);
  const q = { x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) };
  const car = new Car(R, world, spec, { x: x0, y: spec.wheelRadius - spec.axleY + 0.004, z: 0, qx: q.x, qy: q.y, qz: q.z, qw: q.w });
  car.running = false;
  car.body.setLinvel({ x: Math.cos(yaw) * speed, y: 0, z: -Math.sin(yaw) * speed }, true);
  let k = 0;
  for (let i = 0; i < 480 * Number(process.env.T ?? 0.5); i++) {
    if (forces) car.applyForces(DT);
    world.step();
    const c = car.body.worldCom();
    const l = locate(geo.strips[0], c.x, c.y, c.z, k); k = l.k;
    if (i % 6 === 0) {
      const w = car.body.angvel();
      console.log(`t ${(i * DT).toFixed(3)} xh ${l.xh.toFixed(2)} lat ${(l.lateral * 100).toFixed(1)}mm vert ${(l.vertical * 100).toFixed(1)} v ${toKmh(car.speed()).toFixed(1)} w(${w.x.toFixed(1)},${w.y.toFixed(1)},${w.z.toFixed(1)}) gnd ${car.grounded}`);
    }
  }
}
main();
