// Simulation scale.
//
// A real car is 150 mm long and the lanes are 115 mm wide. Physics engines are
// tuned for objects around a metre, so the sim runs ten times larger with gravity
// ten times stronger. That is a pure change of units: every length and speed is
// x10, every time is unchanged, so a car flies exactly as far (in car lengths) and
// for exactly as long as the real one would.
//
// Sim length unit "u" = 100 mm. Mass stays in kg.

export const SCALE = 10; // sim units per real metre
export const MM = 1 / 100; // sim units per real millimetre
export const GRAVITY = 9.81 * SCALE; // u/s^2

/** Physics steps per second. Fixed, and independent of the screen. */
export const STEP_HZ = 480;
export const DT = 1 / STEP_HZ;

/** Real speed (m/s) from a sim speed (u/s). */
export const toMps = (u: number) => u / SCALE;
export const toKmh = (u: number) => (u / SCALE) * 3.6;

// Official track dimensions (Tamiya regulations): 115 mm lanes, 50 mm walls.
export const LANE_WIDTH = 115 * MM;
export const WALL_HEIGHT = 50 * MM;
export const WALL_THICK = 12 * MM;
/** Lane centre to lane centre. */
export const LANE_PITCH = LANE_WIDTH + WALL_THICK;
