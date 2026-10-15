import { buildTrack } from "../src/sim/track/geometry.ts";
import { trackById } from "../src/sim/tracks.ts";
const geo = buildTrack(trackById(process.argv[2])!);
const [hx, hy, hz] = process.argv[3].split(",").map(Number);
const P = geo.positions;
for (let tri = 0; tri < geo.indices.length / 3; tri++) {
  let cx = 0, cy = 0, cz = 0;
  for (let j = 0; j < 3; j++) { const v = geo.indices[tri * 3 + j]; cx += P[v * 3] / 3; cy += P[v * 3 + 1] / 3; cz += P[v * 3 + 2] / 3; }
  if (Math.hypot(cx - hx, cy - hy, cz - hz) < Number(process.argv[4] ?? 0.35)) {
    const v0 = geo.indices[tri * 3];
    let strip = -1, local = 0;
    geo.stripVertexRanges.forEach(([a, b], i) => { if (v0 >= a && v0 < b) { strip = i; local = v0 - a; } });
    console.log(`tri ${tri} strip ${strip} sample ${Math.floor(local / 8)} edge ${local % 8} c(${cx.toFixed(2)},${cy.toFixed(2)},${cz.toFixed(2)})`);
  }
}
