// Check every city course's segments join up exactly.
import { COURSES } from "../src/city/layout.ts";
import { buildTrack, frameAt } from "../src/sim/track/geometry.ts";
for (const c of COURSES) {
  const geos = c.segments.map((s) => buildTrack(s.def));
  c.segments.forEach((s, i) => {
    const g = geos[i];
    const end = frameAt(g.strips[0], g.strips[0].count - 1);
    for (const n of s.next) {
      const st = frameAt(geos[n].strips[0], 0);
      const gap = Math.hypot(end.p.x - st.p.x, end.p.y - st.p.y, end.p.z - st.p.z);
      const dir = end.f.x * st.f.x + end.f.y * st.f.y + end.f.z * st.f.z;
      console.log(c.id, `${s.def.id} -> ${c.segments[n].def.id}`, "gap", gap.toExponential(2), "dir", dir.toFixed(4), "len", (g.strips[0].length / 10).toFixed(1) + "m");
    }
  });
}
