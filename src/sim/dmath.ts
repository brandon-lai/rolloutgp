// Deterministic math for the simulation.
//
// Same build + same track + same seed must give the same race on every machine,
// because a ghost is stored as nothing more than that. IEEE 754 makes + - * / and
// sqrt bit-identical everywhere, but Math.sin, Math.cos and Math.atan2 are left to
// each JavaScript engine and differ in the last bits between browsers. Track
// geometry and the car model only ever use the functions in this file.

const TAU = Math.PI * 2;
const HALF_PI = Math.PI / 2;

/** sin(x) for |x| <= pi/2, Taylor series to x^17 (error < 1e-13). */
function sinCore(x: number): number {
  const x2 = x * x;
  return (
    x *
    (1 +
      x2 *
        (-1 / 6 +
          x2 *
            (1 / 120 +
              x2 *
                (-1 / 5040 +
                  x2 *
                    (1 / 362880 +
                      x2 * (-1 / 39916800 + x2 * (1 / 6227020800 + x2 * (-1 / 1307674368000 + x2 / 355687428096000))))))))
  );
}

export function dsin(x: number): number {
  // Reduce to [-pi, pi]; Math.round is exact.
  let r = x - TAU * Math.round(x / TAU);
  // Fold into [-pi/2, pi/2] using sin(pi - x) = sin(x).
  if (r > HALF_PI) r = Math.PI - r;
  else if (r < -HALF_PI) r = -Math.PI - r;
  return sinCore(r);
}

export function dcos(x: number): number {
  return dsin(x + HALF_PI);
}

/** atan(x) for |x| <= 1 by a series after two argument halvings (error < 1e-12). */
function atanCore(x: number): number {
  // atan(x) = 2 atan(x / (1 + sqrt(1 + x^2))); two halvings bring |x| under 0.2.
  const h1 = x / (1 + Math.sqrt(1 + x * x));
  const h2 = h1 / (1 + Math.sqrt(1 + h1 * h1));
  const y2 = h2 * h2;
  let term = h2;
  let sum = h2;
  for (let n = 1; n < 12; n++) {
    term *= -y2;
    sum += term / (2 * n + 1);
  }
  return 4 * sum;
}

export function datan2(y: number, x: number): number {
  if (x === 0 && y === 0) return 0;
  const ax = Math.abs(x);
  const ay = Math.abs(y);
  let a = ay <= ax ? atanCore(ay / ax) : HALF_PI - atanCore(ax / ay);
  if (x < 0) a = Math.PI - a;
  return y < 0 ? -a : a;
}

export const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** 0..1 ease with zero slope at both ends (cosine-free so it stays deterministic). */
export const smoothstep = (t: number) => {
  const u = clamp(t, 0, 1);
  return u * u * (3 - 2 * u);
};
/** Like smoothstep, also zero curvature at the ends, so lanes bend without a kink. */
export const smootherstep = (t: number) => {
  const u = clamp(t, 0, 1);
  return u * u * u * (u * (u * 6 - 15) + 10);
};
export const deg = (d: number) => (d * Math.PI) / 180;
