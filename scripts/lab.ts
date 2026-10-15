// Isolated physics lab: one car driving into a straight wall at an angle.
import RAPIER from "@dimforge/rapier3d-deterministic-compat";
import { Car, GROUP, groups } from "../src/sim/car.ts";
import { STARTER_BUILD, carSpec } from "../src/sim/build.ts";
import { DT, GRAVITY, toKmh } from "../src/sim/units.ts";

async function main() {
  await RAPIER.init();
  const R = RAPIER;
  const angle = Number(process.argv[2] ?? 10) * Math.PI / 180;
  const speed = Number(process.argv[3] ?? 35);
  const mode = process.argv[4] ?? "full";
  const world = new R.World({ x: 0, y: -GRAVITY, z: 0 });
  world.timestep = DT;
  const g = world.createRigidBody(R.RigidBodyDesc.fixed());
  if ((process.env.WALL ?? "box") !== "lane") world.createCollider(R.ColliderDesc.cuboid(50, 0.05, 50).setTranslation(0, -0.05, 0).setFriction(0.6).setCollisionGroups(groups(GROUP.TRACK, 0xffff)), g);
  // Wall along x at z = -1 (car's left), 0.5 tall, 0.12 thick.
  const wallType = process.env.WALL ?? "box";
  if (wallType === "box") world.createCollider(R.ColliderDesc.cuboid(50, 0.25, 0.06).setTranslation(0, 0.25, -1.06).setFriction(0.6).setCollisionGroups(groups(GROUP.TRACK, 0xffff)), g);
  else if (wallType === "slab") {
    // Extruded wall like the lane sweep: inner face, top, outer face, plus a floor strip.
    const v = new Float32Array([
      -50, 0, -1, 50, 0, -1, 50, 0.5, -1, -50, 0.5, -1,
      -50, 0.5, -1.12, 50, 0.5, -1.12, 50, 0, -1.12, -50, 0, -1.12,
    ]);
    const idx = new Uint32Array([0, 1, 2, 0, 2, 3, 3, 2, 5, 3, 5, 4, 4, 5, 6, 4, 6, 7]);
    world.createCollider(R.ColliderDesc.trimesh(v, idx).setFriction(0.6).setCollisionGroups(groups(GROUP.TRACK, 0xffff)), g);
  } else if (wallType === "lane") {
    // Wall + floor in ONE trimesh, like the lane sweep (floor strip at y=0 from z=-1 to z=1).
    const v = new Float32Array([
      -50, 0, -1, 50, 0, -1, 50, 0.5, -1, -50, 0.5, -1,
      -50, 0.5, -1.12, 50, 0.5, -1.12, 50, 0, -1.12, -50, 0, -1.12,
      -50, 0, 1, 50, 0, 1,
    ]);
    const idx = new Uint32Array([0, 1, 2, 0, 2, 3, 3, 2, 5, 3, 5, 4, 4, 5, 6, 4, 6, 7, 0, 8, 9, 0, 9, 1]);
    world.createCollider(R.ColliderDesc.trimesh(v, idx).setFriction(0.6).setCollisionGroups(groups(GROUP.TRACK, 0xffff)), g);
  } else if (wallType === "split") {
    // Inner wall face split into 0.8 u quads, like the sweep.
    const verts: number[] = [];
    const idx: number[] = [];
    const seg = Number(process.env.SEG ?? 0.8);
    for (let x = -20, i = 0; x <= 40; x += seg, i++) {
      verts.push(x, 0, -1, x, 0.5, -1);
      if (i > 0) {
        const a = (i - 1) * 2, b = i * 2;
        idx.push(a, b, b + 1, a, b + 1, a + 1);
      }
    }
    world.createCollider(R.ColliderDesc.trimesh(new Float32Array(verts), new Uint32Array(idx), Number(process.env.TF ?? 0)).setFriction(0.6).setCollisionGroups(groups(GROUP.TRACK, 0xffff)), g);
  } else {
    const v = new Float32Array([-50, 0, -1, 50, 0, -1, 50, 0.5, -1, -50, 0.5, -1]);
    world.createCollider(R.ColliderDesc.trimesh(v, new Uint32Array([0, 1, 2, 0, 2, 3])).setFriction(0.6).setCollisionGroups(groups(GROUP.TRACK, 0xffff)), g);
  }
  const spec = carSpec(STARTER_BUILD);
  // Heading rotated left by `angle` (towards -z): rotation about +y by +angle turns +x towards -z.
  const q = { x: 0, y: Math.sin(angle / 2), z: 0, w: Math.cos(angle / 2) };
  const car = new Car(R, world, spec, { x: 0, y: spec.wheelRadius - spec.axleY + 0.004, z: 0, qx: q.x, qy: q.y, qz: q.z, qw: q.w });
  car.running = false;
  car.body.setLinvel({ x: Math.cos(angle) * speed, y: 0, z: -Math.sin(angle) * speed }, true);
  for (let i = 0; i < 480 * 0.6; i++) {
    if (mode === "full") car.applyForces(DT);
    world.step();
    if (i % 6 === 0) {
      const t = car.body.translation(), w = car.body.angvel(), r = car.body.rotation();
      const upY = 1 - 2 * (r.x * r.x + r.z * r.z);
      console.log(`t ${(i * DT).toFixed(3)} z ${(t.z * 100).toFixed(1)}mm y ${(t.y * 100).toFixed(1)} v ${toKmh(car.speed()).toFixed(1)} w(${w.x.toFixed(1)},${w.y.toFixed(1)},${w.z.toFixed(1)}) upY ${upY.toFixed(3)} gnd ${car.grounded}`);
    }
  }
}
main();
