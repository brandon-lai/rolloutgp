// Track meshes from the same lane strips the physics uses: floors, white walls
// with a coloured top rail per lane, the start/finish line, the lane-change
// bridge's pillars and the legs the track stands on.

import { bevelBox } from "./models/parts.ts";
import * as THREE from "three/webgpu";
import { SAMPLE_STRIDE, TRACK_STAND, type TrackGeo } from "../sim/track/geometry.ts";

export const LANE_COLORS = [0xe8402a, 0xffd23f, 0x1f9bd1];
const RAIL_COLOR = 0xa52e29;

const FLOOR_THICK = 0.05;

interface Part {
  pos: number[];
  idx: number[];
}

const part = (): Part => ({ pos: [], idx: [] });

/** Sweep a 2D polyline (lateral, up) along a strip. Closed = loop the profile. */
function sweep(out: Part, data: Float64Array, count: number, profile: [number, number][], closed: boolean) {
  const base = out.pos.length / 3;
  const P = profile.length;
  for (let k = 0; k < count; k++) {
    const o = k * SAMPLE_STRIDE;
    for (const [lat, up] of profile) {
      out.pos.push(
        data[o] + data[o + 9] * lat + data[o + 6] * up,
        data[o + 1] + data[o + 10] * lat + data[o + 7] * up,
        data[o + 2] + data[o + 11] * lat + data[o + 8] * up,
      );
    }
  }
  const edges = closed ? P : P - 1;
  for (let k = 0; k < count - 1; k++) {
    const a = base + k * P,
      b = a + P;
    for (let j = 0; j < edges; j++) {
      const j2 = (j + 1) % P;
      out.idx.push(a + j, b + j, b + j2, a + j, b + j2, a + j2);
    }
  }
}

function mesh(p: Part, material: THREE.Material): THREE.Mesh {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(p.pos, 3));
  g.setIndex(p.idx);
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, material);
  m.receiveShadow = true;
  m.castShadow = true;
  return m;
}

export function trackObject(geo: TrackGeo): { object: THREE.Group; dispose(): void } {
  const g = new THREE.Group();
  const hw = geo.lane.width / 2;
  const WALL_HEIGHT = geo.lane.wall;
  const WALL_THICK = geo.lane.thick;
  const mats: THREE.Material[] = [];
  const mk = (p: THREE.MeshStandardMaterialParameters) => {
    const m = new THREE.MeshStandardMaterial(p);
    mats.push(m);
    return m;
  };
  const floorMat = mk({ color: 0x65686a, roughness: 0.48 });
  const wallMat = mk({ color: 0xdedcd3, roughness: 0.32 });
  const underMat = mk({ color: 0x3b4252, roughness: 0.9 });
  const floor = part(),
    walls = part(),
    under = part(),
    rails = part();
  // Each lane draws only its half of a shared wall, so neighbouring lanes' walls
  // sit back to back instead of overlapping (overlapping faces flicker).
  const t = WALL_THICK / 2;
  const top = WALL_HEIGHT * 0.9;
  for (const st of geo.strips) {
    sweep(floor, st.data, st.count, [[hw, 0], [-hw, 0]], false);
    sweep(walls, st.data, st.count, [[-hw - t, 0], [-hw - t, top], [-hw, top], [-hw, 0]], false);
    sweep(walls, st.data, st.count, [[hw, 0], [hw, top], [hw + t, top], [hw + t, 0]], false);
    sweep(rails, st.data, st.count, [[-hw, top], [-hw, WALL_HEIGHT-.008], [-hw-.008, WALL_HEIGHT], [-hw-t+.008,WALL_HEIGHT], [-hw - t, WALL_HEIGHT-.008], [-hw - t, top]], false);
    sweep(rails, st.data, st.count, [[hw + t, top], [hw + t, WALL_HEIGHT-.008], [hw+t-.008,WALL_HEIGHT], [hw+.008,WALL_HEIGHT], [hw, WALL_HEIGHT-.008], [hw, top]], false);
    sweep(under, st.data, st.count, [[-hw - t, 0], [-hw - t, -FLOOR_THICK], [hw + t, -FLOOR_THICK], [hw + t, 0]], false);
  }
  g.add(mesh(floor, floorMat), mesh(walls, wallMat), mesh(under, underMat), mesh(rails, mk({ color: RAIL_COLOR, roughness: 0.4 })));

  // Moulding seams follow the sampled lane frames, without changing collider data.
  const joints: THREE.Matrix4[] = [];
  for(const st of geo.strips) {
    let last=-Infinity;
    for(let k=0;k<st.count;k++) {
      const o=k*SAMPLE_STRIDE,d=st.data;
      if(d[o+12]-last<4.5)continue;
      last=d[o+12];
      const matrix=new THREE.Matrix4().makeBasis(new THREE.Vector3(d[o+3],d[o+4],d[o+5]),new THREE.Vector3(d[o+6],d[o+7],d[o+8]),new THREE.Vector3(d[o+9],d[o+10],d[o+11]));
      matrix.setPosition(d[o]+d[o+6]*.002,d[o+1]+d[o+7]*.002,d[o+2]+d[o+8]*.002);
      joints.push(matrix);
    }
  }
  const seams=new THREE.InstancedMesh(new THREE.BoxGeometry(.008,.003,geo.lane.width),mk({color:0x333536,roughness:.8}),joints.length);
  joints.forEach((m,i)=>seams.setMatrixAt(i,m));g.add(seams);

  // Start / finish: a checker band across every lane at s = 0.
  const tex = checkerTexture();
  const lineMat = mk({ map: tex, roughness: 0.6 });
  for (const st of geo.strips) {
    const o = 0;
    const d = st.data;
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(0.12, geo.lane.width), lineMat);
    plane.rotation.x = -Math.PI / 2;
    const yaw = Math.atan2(-d[o + 5], d[o + 3]);
    plane.rotation.z = yaw;
    plane.position.set(d[o], d[o + 1] + 0.002, d[o + 2]);
    g.add(plane);
  }

  // Lane-change bridge pillars.
  const pillarMat = mk({ color: 0xc9ced6, roughness: 0.5 });
  for (const p of geo.pillars) {
    const h = p.h + TRACK_STAND;
    const pillar = new THREE.Mesh(bevelBox(0.08, h, 0.08), pillarMat);
    pillar.position.set(p.x, p.y - h / 2 - FLOOR_THICK, p.z);
    pillar.castShadow = true;
    g.add(pillar);
  }

  // Legs under the track every ~0.8 m along each outer lane.
  const legMat = mk({ color: 0x2b303b, roughness: 0.7, metalness: 0.2 });
  const legGeo = bevelBox(0.06, 1, 0.06);
  const outer = geo.strips.length === 3 ? [0, 2] : [0];
  const legs: THREE.Matrix4[] = [];
  for (const si of outer) {
    const st = geo.strips[si];
    let last = -Infinity;
    for (let k = 0; k < st.count; k++) {
      const o = k * SAMPLE_STRIDE;
      if (st.data[o + 12] - last < 8) continue;
      last = st.data[o + 12];
      const y = st.data[o + 1];
      if (y > 0.5) continue; // bridge spans have their own pillars
      const h = y + TRACK_STAND - FLOOR_THICK;
      legs.push(new THREE.Matrix4().compose(new THREE.Vector3(st.data[o], y - FLOOR_THICK - h / 2, st.data[o + 2]), new THREE.Quaternion(), new THREE.Vector3(1, h, 1)));
    }
  }
  const legMesh = new THREE.InstancedMesh(legGeo, legMat, Math.max(1, legs.length));
  legs.forEach((m, i) => legMesh.setMatrixAt(i, m));
  legMesh.count = legs.length;
  g.add(legMesh);

  return {
    object: g,
    dispose() {
      g.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.geometry) m.geometry.dispose();
      });
      mats.forEach((m) => m.dispose());
      tex.dispose();
    },
  };
}

function checkerTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 256;
  const ctx = c.getContext("2d")!;
  const cell = 32;
  for (let y = 0; y < 256 / cell; y++)
    for (let x = 0; x < 2; x++) {
      ctx.fillStyle = (x + y) % 2 === 0 ? "#111" : "#f5f5f2";
      ctx.fillRect(x * cell, y * cell, cell, cell);
    }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
