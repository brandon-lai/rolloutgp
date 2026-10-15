// The parts catalog. Nine slots, mirroring a real kit.
//
// Names are original and describe the real thing, so nothing here borrows a
// trademarked part name. Numbers come from published specs where one exists
// (`real` says where); everything else is a game value tuned in playtesting, and
// the garage labels it that way.
//
// All dimensions are real millimetres and grams; build.ts converts to sim units.

export type SlotId = "chassis" | "motor" | "gear" | "tires" | "rollers" | "dampers" | "brakes" | "bearings" | "body";

export const SLOTS: { id: SlotId; name: string; blurb: string }[] = [
  { id: "chassis", name: "Chassis", blurb: "Wheelbase, weight, balance, and which motors fit." },
  { id: "motor", name: "Motor", blurb: "Torque for twisty courses, RPM for long straights." },
  { id: "gear", name: "Gear ratio", blurb: "Low ratio = top speed. High ratio = acceleration." },
  { id: "tires", name: "Wheels & tires", blurb: "Hard tires slide, and with rollers that means faster corners." },
  { id: "rollers", name: "Rollers & stays", blurb: "Rollers do the steering. Wider runs a shorter line." },
  { id: "dampers", name: "Mass dampers", blurb: "Loose weights that soak up landings." },
  { id: "brakes", name: "Brakes", blurb: "Sponges that drag on slopes to slow the car before jumps." },
  { id: "bearings", name: "Bearings & grease", blurb: "Less friction in the drivetrain and rollers." },
  { id: "body", name: "Body", blurb: "Weight and centre of gravity. Clear bodies are lighter." },
];

export type ChassisFamily = "mid" | "front" | "rear";

interface Base {
  id: string;
  name: string;
  blurb: string;
  /** Grams. */
  mass: number;
  /** Price in race tokens. 0 = in the starter kit. */
  price: number;
  /** Where the numbers come from, when they are real. Absent = game value. */
  real?: string;
}

export interface ChassisPart extends Base {
  slot: "chassis";
  family: ChassisFamily;
  /** Single-shaft motors sit at one end; double-shaft (twin) motors sit in the middle. */
  shaft: "single" | "double";
  wheelbase: number; // mm, axle to axle
  tread: number; // mm, tire centre to tire centre
  length: number; // mm, bumper to bumper
  /** Motor centre, mm forward of the chassis centre. */
  motorX: number;
  /** Battery pack centre height above the chassis floor, mm. Lower = lower CoG. */
  batteryY: number;
  /** Fraction of motor torque that reaches the wheels. */
  efficiency: number;
  sideMounts: boolean;
  /** Crash strength, 0..1. Light chassis flex and crack first (open mode). */
  toughness: number;
}

export interface MotorPart extends Base {
  slot: "motor";
  shaft: "single" | "double";
  /** No-load speed at 3.0 V, rpm. */
  freeRpm: number;
  /** Stall torque at 3.0 V, mN·m. */
  stallTorque: number;
  /** Published speed range at peak efficiency, shown in the garage. */
  rpmRange?: [number, number];
}

export interface GearPart extends Base {
  slot: "gear";
  ratio: number;
}

export interface TirePart extends Base {
  slot: "tires";
  diameter: number; // mm
  width: number; // mm
  compound: "soft" | "medium" | "hard" | "super-hard";
  profile: "standard" | "low" | "large" | "arched";
  /** Grip coefficient forwards (traction) and sideways (scrub). */
  muLong: number;
  muLat: number;
  /** Rolling resistance coefficient. */
  rolling: number;
}

export interface RollerPart extends Base {
  slot: "rollers";
  kind: "roller";
  diameter: number; // mm
  type: "plastic" | "bearing";
  /** Effective sliding friction on the wall. Rollers roll, so this is really their bearing drag. */
  friction: number;
  restitution: number;
}

export interface StayPart extends Base {
  slot: "rollers";
  kind: "stay";
  position: "front" | "rear" | "side";
  /** Roller centre distance from the car's centreline, mm. */
  span: number;
  /** Roller centre, mm forward of the chassis centre (negative = behind). */
  x: number;
  /** Roller centre heights above the chassis floor, mm. Two entries = a two-tier stay. */
  tiers: number[];
  /** Families this plate bolts onto. */
  fits: ChassisFamily[];
}

export interface DamperPart extends Base {
  slot: "dampers";
  /** Mass of one damper, g. They come in pairs. */
  each: number;
}

export interface BrakePart extends Base {
  slot: "brakes";
  /** Sliding friction of the sponge on the track. */
  friction: number;
}

export interface BearingPart extends Base {
  slot: "bearings";
  /** Constant drivetrain friction torque at the motor, mN·m. */
  dragTorque: number;
  /** Speed-proportional loss at the motor, mN·m per 10,000 rpm. */
  viscous: number;
  /** Multiplier on roller friction (grease helps plastic rollers spin). */
  rollerFriction: number;
}

export type Part =
  | ChassisPart
  | MotorPart
  | GearPart
  | TirePart
  | RollerPart
  | StayPart
  | DamperPart
  | BrakePart
  | BearingPart;

const TAMIYA_GUIDE = "Tamiya setup guide";

export const CHASSIS: ChassisPart[] = [
  {
    id: "ch-s2",
    slot: "chassis",
    name: "S2 Classic",
    blurb: "Sturdy rear-motor kit chassis. Forgiving, a little heavy.",
    family: "rear",
    shaft: "single",
    wheelbase: 80,
    tread: 76,
    length: 150,
    motorX: -46,
    batteryY: 11,
    efficiency: 0.72,
    sideMounts: false,
    toughness: 0.9,
    mass: 38,
    price: 0,
    real: "Modelled on a rear-motor kit chassis; layout from the Tamiya chassis guide",
  },
  {
    id: "ch-rx",
    slot: "chassis",
    name: "RX Rear",
    blurb: "Modern rear-motor chassis with side stay mounts and a stiff tub.",
    family: "rear",
    shaft: "single",
    wheelbase: 80,
    tread: 76,
    length: 150,
    motorX: -46,
    batteryY: 10,
    efficiency: 0.75,
    sideMounts: true,
    toughness: 0.85,
    mass: 34,
    price: 140,
  },
  {
    id: "ch-vx",
    slot: "chassis",
    name: "VX Featherweight",
    blurb: "The lightest rear-motor tub. Quick, but flexes and cracks.",
    family: "rear",
    shaft: "single",
    wheelbase: 80,
    tread: 74,
    length: 148,
    motorX: -46,
    batteryY: 10,
    efficiency: 0.75,
    sideMounts: false,
    toughness: 0.55,
    mass: 27,
    price: 220,
  },
  {
    id: "ch-fx",
    slot: "chassis",
    name: "FX Front-Motor",
    blurb: "Motor in the nose. Front-heavy, so it dives less off crests.",
    family: "front",
    shaft: "single",
    wheelbase: 80,
    tread: 76,
    length: 150,
    motorX: 46,
    batteryY: 10,
    efficiency: 0.74,
    sideMounts: true,
    toughness: 0.8,
    mass: 33,
    price: 160,
  },
  {
    id: "ch-mx",
    slot: "chassis",
    name: "MX Midship",
    blurb: "Twin-shaft motor in the middle. Balanced and efficient.",
    family: "mid",
    shaft: "double",
    wheelbase: 82,
    tread: 77,
    length: 152,
    motorX: 0,
    batteryY: 10,
    efficiency: 0.79,
    sideMounts: false,
    toughness: 0.85,
    mass: 37,
    price: 260,
  },
  {
    id: "ch-ax",
    slot: "chassis",
    name: "AX Midship Low",
    blurb: "Twin-shaft with the batteries slung low. The lowest centre of gravity.",
    family: "mid",
    shaft: "double",
    wheelbase: 82,
    tread: 77,
    length: 152,
    motorX: 0,
    batteryY: 7,
    efficiency: 0.8,
    sideMounts: true,
    toughness: 0.75,
    mass: 31,
    price: 340,
  },
];

// Speeds are no-load at 3.0 V. Peak-efficiency ranges for the Sprint and Rev twin
// motors are the published figures the PRD cites; the rest are game values set
// so the lineup keeps its real-world ordering (torque < balance < rev < sprint).
export const MOTORS: MotorPart[] = [
  { id: "mo-stock", slot: "motor", shaft: "single", name: "Stock 130", blurb: "The kit motor. Gentle and kind to batteries.", freeRpm: 13500, stallTorque: 9, mass: 17, price: 0 },
  { id: "mo-torque", slot: "motor", shaft: "single", name: "Torque", blurb: "Pulls hard out of corners and up slopes. Modest top end.", freeRpm: 16500, stallTorque: 15, rpmRange: [12300, 14900], mass: 18, price: 90 },
  { id: "mo-balance", slot: "motor", shaft: "single", name: "Balance", blurb: "Between torque and rev. A safe all-rounder.", freeRpm: 18500, stallTorque: 13, rpmRange: [14100, 16600], mass: 18, price: 110 },
  { id: "mo-rev", slot: "motor", shaft: "single", name: "Rev", blurb: "High RPM, low torque. Loves long straights.", freeRpm: 21000, stallTorque: 10.5, rpmRange: [15800, 18800], mass: 18, price: 120 },
  { id: "mo-spark", slot: "motor", shaft: "single", name: "Spark", blurb: "A light, quick step up from Balance.", freeRpm: 20000, stallTorque: 13.5, mass: 18, price: 160 },
  { id: "mo-turbo", slot: "motor", shaft: "single", name: "Turbo", blurb: "Big power, big current. Fast and thirsty.", freeRpm: 24000, stallTorque: 15, rpmRange: [17200, 21200], mass: 19, price: 260 },
  {
    id: "mo-sprint",
    slot: "motor",
    shaft: "single",
    name: "Sprint",
    blurb: "The fastest can in the box. Will fly off anything it can.",
    freeRpm: 30000,
    stallTorque: 16,
    rpmRange: [20700, 27200],
    real: "Sprint-class motor: 20,700–27,200 rpm at peak efficiency (published spec)",
    mass: 19,
    price: 420,
  },
  { id: "mo-twin-stock", slot: "motor", shaft: "double", name: "Stock Twin", blurb: "Twin-shaft kit motor for midship chassis.", freeRpm: 13500, stallTorque: 9.5, mass: 18, price: 40 },
  { id: "mo-twin-torque", slot: "motor", shaft: "double", name: "Torque Twin", blurb: "Twin-shaft torque motor.", freeRpm: 16000, stallTorque: 15.5, mass: 19, price: 130 },
  {
    id: "mo-twin-rev",
    slot: "motor",
    shaft: "double",
    name: "Rev Twin",
    blurb: "Twin-shaft rev motor.",
    freeRpm: 20000,
    stallTorque: 11,
    rpmRange: [14300, 17400],
    real: "Rev twin-shaft class: 14,300–17,400 rpm at peak efficiency (published spec)",
    mass: 19,
    price: 170,
  },
  { id: "mo-twin-balance", slot: "motor", shaft: "double", name: "Balance Twin", blurb: "Twin-shaft all-rounder.", freeRpm: 18000, stallTorque: 13.5, mass: 19, price: 160 },
  { id: "mo-twin-turbo", slot: "motor", shaft: "double", name: "Turbo Twin", blurb: "The strongest twin-shaft motor.", freeRpm: 25000, stallTorque: 15.5, mass: 20, price: 380 },
];

export const GEARS: GearPart[] = [
  { id: "ge-5", slot: "gear", ratio: 5, name: "5:1 Standard", blurb: "Maximum acceleration. Slowest top speed.", mass: 3, price: 0, real: `5:1 favours acceleration (${TAMIYA_GUIDE})` },
  { id: "ge-42", slot: "gear", ratio: 4.2, name: "4.2:1 Climb", blurb: "Strong out of corners, still decent on straights.", mass: 3, price: 40 },
  { id: "ge-4", slot: "gear", ratio: 4, name: "4:1 Speed", blurb: "The balanced choice.", mass: 3, price: 50 },
  { id: "ge-37", slot: "gear", ratio: 3.7, name: "3.7:1 Super Speed", blurb: "Leans towards top speed.", mass: 3, price: 70 },
  { id: "ge-35", slot: "gear", ratio: 3.5, name: "3.5:1 Top Speed", blurb: "Highest top speed, slowest to get there.", mass: 3, price: 90, real: `3.5:1 favours top speed (${TAMIYA_GUIDE})` },
];

// Grip: "harder tires with less grip give more corner speed" because the rollers
// do the turning and the tires only scrub (Tamiya setup guide). Tire diameter is
// regulated to 22–35 mm.
export const TIRES: TirePart[] = [
  { id: "ti-std", slot: "tires", name: "Standard 26 mm", blurb: "Kit tires. Medium rubber.", diameter: 26, width: 9, compound: "medium", profile: "standard", muLong: 1.0, muLat: 0.95, rolling: 0.03, mass: 12, price: 0 },
  { id: "ti-hard-low", slot: "tires", name: "Low-Profile 24 mm Hard", blurb: "Small and hard. Low centre of gravity, slides through corners.", diameter: 24, width: 8, compound: "hard", profile: "low", muLong: 0.78, muLat: 0.6, rolling: 0.022, mass: 9, price: 70, real: `Hard tires corner faster on rollers (${TAMIYA_GUIDE})` },
  { id: "ti-soft-low", slot: "tires", name: "Low-Profile 24 mm Soft", blurb: "Small and grippy. Launches well, scrubs in corners.", diameter: 24, width: 8, compound: "soft", profile: "low", muLong: 1.25, muLat: 1.2, rolling: 0.035, mass: 10, price: 60 },
  { id: "ti-large-hard", slot: "tires", name: "Large 31 mm Hard", blurb: "More ground per turn = more top speed. Sits higher.", diameter: 31, width: 10, compound: "hard", profile: "large", muLong: 0.8, muLat: 0.62, rolling: 0.024, mass: 15, price: 90 },
  { id: "ti-large-soft", slot: "tires", name: "Large 31 mm Soft", blurb: "Big and grippy. Fast, tall and draggy in corners.", diameter: 31, width: 10, compound: "soft", profile: "large", muLong: 1.25, muLat: 1.15, rolling: 0.036, mass: 16, price: 80 },
  { id: "ti-arched", slot: "tires", name: "Arched 26 mm Super-Hard", blurb: "Rounded edge, barely any side grip. The cornering tire.", diameter: 26, width: 8, compound: "super-hard", profile: "arched", muLong: 0.68, muLat: 0.42, rolling: 0.02, mass: 10, price: 150 },
];

export const ROLLERS: RollerPart[] = [
  { id: "ro-9p", slot: "rollers", kind: "roller", name: "9 mm plastic", blurb: "Kit rollers. Grabby and bouncy.", diameter: 9, type: "plastic", friction: 0.07, restitution: 0.25, mass: 0.4, price: 0 },
  { id: "ro-11p", slot: "rollers", kind: "roller", name: "11 mm plastic", blurb: "A little wider than stock.", diameter: 11, type: "plastic", friction: 0.065, restitution: 0.24, mass: 0.5, price: 20 },
  { id: "ro-13p", slot: "rollers", kind: "roller", name: "13 mm plastic", blurb: "Cheap width.", diameter: 13, type: "plastic", friction: 0.06, restitution: 0.22, mass: 0.7, price: 30 },
  { id: "ro-13b", slot: "rollers", kind: "roller", name: "13 mm ball-bearing", blurb: "Spins freely, so walls barely slow the car.", diameter: 13, type: "bearing", friction: 0.022, restitution: 0.12, mass: 1.5, price: 90 },
  { id: "ro-17b", slot: "rollers", kind: "roller", name: "17 mm ball-bearing", blurb: "Wide and free-spinning.", diameter: 17, type: "bearing", friction: 0.02, restitution: 0.11, mass: 2.1, price: 130 },
  { id: "ro-19b", slot: "rollers", kind: "roller", name: "19 mm aluminium bearing", blurb: "The widest legal roller. Heavy, stable.", diameter: 19, type: "bearing", friction: 0.018, restitution: 0.1, mass: 2.8, price: 180 },
];

// Real FRP plates come in 9/11/13/17/19 mm roller fits (basic tune-up set). The
// spans below put a 19 mm roller on the wide plate exactly at the 105 mm cap.
export const STAYS: StayPart[] = [
  { id: "st-f-stock", slot: "rollers", kind: "stay", position: "front", name: "Kit front bumper", blurb: "Rollers on the bumper itself.", span: 42, x: 66, tiers: [9], fits: ["mid", "front", "rear"], mass: 0, price: 0 },
  { id: "st-r-stock", slot: "rollers", kind: "stay", position: "rear", name: "Kit rear bumper", blurb: "Rollers on the bumper itself.", span: 42, x: -66, tiers: [9], fits: ["mid", "front", "rear"], mass: 0, price: 0 },
  { id: "st-f-narrow", slot: "rollers", kind: "stay", position: "front", name: "FRP front plate, narrow", blurb: "Stiff plate, a touch wider than stock.", span: 44, x: 70, tiers: [9], fits: ["mid", "front", "rear"], mass: 2, price: 40 },
  { id: "st-r-narrow", slot: "rollers", kind: "stay", position: "rear", name: "FRP rear plate, narrow", blurb: "Stiff plate, a touch wider than stock.", span: 44, x: -70, tiers: [9], fits: ["mid", "front", "rear"], mass: 2, price: 40 },
  { id: "st-f-wide", slot: "rollers", kind: "stay", position: "front", name: "FRP front plate, wide", blurb: "Puts 19 mm rollers right at the width limit.", span: 43, x: 71, tiers: [9], fits: ["mid", "front", "rear"], mass: 2.5, price: 70 },
  { id: "st-r-wide", slot: "rollers", kind: "stay", position: "rear", name: "FRP rear plate, wide", blurb: "Puts 19 mm rollers right at the width limit.", span: 43, x: -71, tiers: [9], fits: ["mid", "front", "rear"], mass: 2.5, price: 70 },
  { id: "st-f-double", slot: "rollers", kind: "stay", position: "front", name: "Two-tier front stay", blurb: "A second roller up high stops the car tipping over the wall.", span: 42, x: 70, tiers: [9, 28], fits: ["mid", "front", "rear"], mass: 4, price: 120 },
  { id: "st-r-double", slot: "rollers", kind: "stay", position: "rear", name: "Two-tier rear stay", blurb: "A second roller up high stops the car tipping over the wall.", span: 42, x: -70, tiers: [9, 28], fits: ["mid", "front", "rear"], mass: 4, price: 120 },
  { id: "st-f-xwide", slot: "rollers", kind: "stay", position: "front", name: "Extra-wide front plate", blurb: "Open-class only: too wide for regulation with most rollers.", span: 47, x: 72, tiers: [9], fits: ["mid", "front", "rear"], mass: 3, price: 90 },
  { id: "st-r-xwide", slot: "rollers", kind: "stay", position: "rear", name: "Extra-wide rear plate", blurb: "Open-class only: too wide for regulation with most rollers.", span: 47, x: -72, tiers: [9], fits: ["mid", "front", "rear"], mass: 3, price: 90 },
  { id: "st-side", slot: "rollers", kind: "stay", position: "side", name: "Side stays", blurb: "Mid-car rollers that keep the body off the wall in tight turns.", span: 44, x: 0, tiers: [12], fits: ["front", "rear", "mid"], mass: 3, price: 80 },
];

// Damper masses are the real slim and cylindrical weights (Tamiya Avante kit).
export const DAMPERS: DamperPart[] = [
  { id: "da-slim", slot: "dampers", name: "Slim dampers (1.5 g)", blurb: "Light. Takes the edge off landings.", each: 1.5, mass: 3, price: 60, real: "1.5 g slim weight (Tamiya Avante kit)" },
  { id: "da-cyl", slot: "dampers", name: "Cylinder dampers (4.2 g)", blurb: "The standard landing fix.", each: 4.2, mass: 8.4, price: 100, real: "4.2 g cylindrical weight (Tamiya Avante kit)" },
  { id: "da-heavy", slot: "dampers", name: "Stacked dampers (8 g)", blurb: "Two cylinders stacked. Kills bounce, costs speed.", each: 8, mass: 16, price: 160 },
];

export const BRAKES: BrakePart[] = [
  { id: "br-light", slot: "brakes", name: "Gray sponge (light)", blurb: "Barely-there drag.", friction: 0.35, mass: 0.5, price: 30 },
  { id: "br-medium", slot: "brakes", name: "Red sponge (medium)", blurb: "The usual choice before a jump.", friction: 0.65, mass: 0.5, price: 50 },
  { id: "br-strong", slot: "brakes", name: "Black sponge (strong)", blurb: "Heavy drag on every slope.", friction: 1.0, mass: 0.5, price: 70 },
];

export const BEARINGS: BearingPart[] = [
  { id: "be-plastic", slot: "bearings", name: "Plastic bushings", blurb: "Kit bushings. The most friction.", dragTorque: 0.8, viscous: 0.4, rollerFriction: 1, mass: 0, price: 0 },
  { id: "be-brass", slot: "bearings", name: "Brass bushings", blurb: "Cheap, smoother.", dragTorque: 0.35, viscous: 0.2, rollerFriction: 1, mass: 1, price: 40 },
  { id: "be-ball", slot: "bearings", name: "Ball bearings", blurb: "Free-spinning axles.", dragTorque: 0.35, viscous: 0.2, rollerFriction: 1, mass: 2, price: 120 },
  { id: "be-ball-grease", slot: "bearings", name: "Ball bearings + F grease", blurb: "Bearings, and greased gears and rollers.", dragTorque: 0.25, viscous: 0.16, rollerFriction: 0.8, mass: 2, price: 170 },
];

export const ALL_PARTS: Part[] = [...CHASSIS, ...MOTORS, ...GEARS, ...TIRES, ...ROLLERS, ...STAYS, ...DAMPERS, ...BRAKES, ...BEARINGS];

const byId = new Map<string, Part>(ALL_PARTS.map((p) => [p.id, p]));

export function part<T extends Part = Part>(id: string): T {
  const p = byId.get(id);
  if (!p) throw new Error(`Unknown part ${id}`);
  return p as T;
}

export function hasPart(id: string): boolean {
  return byId.has(id);
}

/** Parts the player owns from the start: everything in the starter kit. */
export const STARTER_PARTS = ALL_PARTS.filter((p) => p.price === 0).map((p) => p.id);
