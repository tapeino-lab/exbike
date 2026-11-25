/**
 * The race simulation. Pure and deterministic: the same course and the same inputs, frame by
 * frame, always give the same race (needed for ghosts and replay checks later).
 * Runs at a fixed 60 steps per second.
 */
import { type Course, LANES, heightAt, isCooler, isMud, slopeAt } from './course';

export const FPS = 60;

export const TUNING = {
  /** Top speed with the accelerator (world px per frame). */
  vmax: 2.6,
  /** Top speed with turbo, as a multiple of vmax. */
  turbo: 1.3,
  /** Top speed in mud, as a multiple of vmax. */
  mud: 0.45,
  accel: 0.045,
  /** Speed lost per frame when coasting. */
  drag: 0.02,
  /** Extra speed lost per frame in mud. */
  mudDrag: 0.06,
  /** How much slopes slow the bike down going up (and speed it up going down). */
  slope: 0.02,
  gravity: 0.075,
  /** Heat gained per second with turbo / accelerator, lost per second when coasting. */
  heatTurbo: 25,
  heatAccel: 1,
  heatCool: 12,
  /** Seconds the engine is dead after overheating. */
  stallSec: 3,
  /** Seconds lost to a crash. */
  crashSec: 2,
  /** Rotation per frame while tilting in the air (radians). */
  tiltRate: (2.6 * Math.PI) / 180,
  /** Landing windows: bike angle minus ground angle, in degrees (positive = nose higher). */
  goodNoseUp: 13,
  goodNoseDown: 10,
  okNoseUp: 32,
  okNoseDown: 22,
  /** Hops shorter than this (frames in the air) land safely within ±hopWindow degrees, without a NICE. */
  hopFrames: 32,
  hopWindow: 40,
  /** Speed kept after a rough landing. */
  roughKeep: 0.55,
  /** Frames for a lane change animation. */
  laneFrames: 8,
  countdownSec: 3,
};

export interface Input {
  accel: boolean;
  turbo: boolean;
  /** -1: move to the lane behind (up on screen), 1: to the lane in front. */
  lane: -1 | 0 | 1;
  /** In the air: 1 lifts the nose, -1 drops it. */
  tilt: -1 | 0 | 1;
}

export const NO_INPUT: Input = { accel: false, turbo: false, lane: 0, tilt: 0 };

export type RaceEvent =
  | 'lane'
  | 'takeoff'
  | 'land-good'
  | 'land-rough'
  | 'crash'
  | 'overheat'
  | 'cool'
  | 'lap'
  | 'finish'
  | 'go';

export interface Bike {
  x: number;
  /** Height above the world zero (not above the ground). */
  y: number;
  vy: number;
  /** Horizontal speed. */
  v: number;
  /** Pitch in radians, positive = nose up. */
  angle: number;
  air: boolean;
  /** Frames since takeoff. */
  airFrames: number;
  lane: number;
  /** Lane position for drawing, moves smoothly towards `lane`. */
  laneT: number;
  heat: number;
  /** Frames left with a dead engine. */
  stall: number;
  /** Frames left lying on the ground. */
  crash: number;
  /** Frames left showing the last landing result. */
  landShow: number;
  landGood: boolean;
  throttle: 'none' | 'accel' | 'turbo';
}

export type Phase = 'countdown' | 'race' | 'finish';

export interface Race {
  course: Course;
  phase: Phase;
  /** Frames left in the countdown. */
  countdown: number;
  /** Race frames (the clock). */
  frame: number;
  /** Frames since the finish. */
  after: number;
  lap: number;
  bike: Bike;
  /** Events raised by the last step. */
  events: RaceEvent[];
}

export const START_X = 60;

export function newRace(course: Course): Race {
  return {
    course,
    phase: 'countdown',
    countdown: TUNING.countdownSec * FPS,
    frame: 0,
    after: 0,
    lap: 0,
    bike: {
      x: START_X,
      y: heightAt(course, START_X),
      vy: 0,
      v: 0,
      angle: 0,
      air: false,
      airFrames: 0,
      lane: 1,
      laneT: 1,
      heat: 0,
      stall: 0,
      crash: 0,
      landShow: 0,
      landGood: false,
      throttle: 'none',
    },
    events: [],
  };
}

const DEG = Math.PI / 180;

export function finishX(race: Race): number {
  return START_X + race.course.length * race.course.laps;
}

/** Advances the race by one frame. */
export function step(race: Race, input: Input): void {
  race.events = [];
  if (race.phase === 'countdown') {
    race.countdown--;
    if (race.countdown <= 0) {
      race.phase = 'race';
      race.events.push('go');
    }
    return;
  }
  if (race.phase === 'race') race.frame++;
  else race.after++;

  const t = TUNING;
  const { course } = race;
  const b = race.bike;
  const inp = race.phase === 'race' ? input : NO_INPUT;
  const dt = 1 / FPS;

  b.throttle = 'none';
  if (b.landShow > 0) b.landShow--;

  if (b.crash > 0) {
    b.crash--;
    b.v = 0;
    b.heat = Math.max(0, b.heat - t.heatCool * dt);
    if (b.crash === 0) {
      b.y = heightAt(course, b.x);
      b.vy = 0;
      b.angle = Math.atan(slopeAt(course, b.x));
    }
    moveLaneT(b);
    return;
  }

  // Engine.
  let target = 0;
  if (b.stall > 0) {
    b.stall--;
    b.heat = (100 * b.stall) / (t.stallSec * FPS);
  } else if (inp.turbo) {
    b.throttle = 'turbo';
    target = t.vmax * t.turbo;
    b.heat += t.heatTurbo * dt;
  } else if (inp.accel) {
    b.throttle = 'accel';
    target = t.vmax;
    b.heat += t.heatAccel * dt;
  } else {
    b.heat = Math.max(0, b.heat - t.heatCool * dt);
  }
  if (b.heat >= 100) {
    b.heat = 100;
    b.stall = t.stallSec * FPS;
    b.throttle = 'none';
    race.events.push('overheat');
  }

  if (!b.air) {
    const mud = isMud(course, b.lane, b.x);
    if (mud) target = Math.min(target, t.vmax * t.mud);
    if (b.v < target) b.v = Math.min(target, b.v + t.accel);
    else b.v = Math.max(target, b.v - (mud ? t.mudDrag : t.drag));
    b.v = Math.max(0, b.v - t.slope * slopeAt(course, b.x));

    if (inp.lane !== 0 && Math.abs(b.laneT - b.lane) < 0.5) {
      const next = b.lane + inp.lane;
      if (next >= 0 && next < LANES) {
        b.lane = next;
        race.events.push('lane');
      }
    }
    if (isCooler(course, b.lane, b.x) && b.heat > 0 && b.stall === 0) {
      b.heat = 0;
      race.events.push('cool');
    }
  }
  moveLaneT(b);

  // Motion.
  b.x += b.v;
  const ground = heightAt(course, b.x);
  if (!b.air) {
    // Keep going along the previous slope; if that carries us above the ground, we fly.
    const flying = b.y + b.vy - t.gravity;
    if (flying > ground + 0.5 && b.vy > 0.3) {
      b.air = true;
      b.airFrames = 0;
      b.y = flying;
      b.vy -= t.gravity;
      race.events.push('takeoff');
    } else {
      const s = slopeAt(course, b.x);
      b.y = ground;
      b.vy = b.v * s;
      b.angle = Math.atan(s);
    }
  } else {
    b.airFrames++;
    b.vy -= t.gravity;
    b.y += b.vy;
    b.angle += inp.tilt * t.tiltRate;
    b.angle = Math.max(-80 * DEG, Math.min(80 * DEG, b.angle));
    if (b.y <= ground) land(race, ground);
  }

  // Laps and finish.
  const lap = Math.floor((b.x - START_X) / course.length);
  if (race.phase === 'race' && lap > race.lap) {
    race.lap = lap;
    if (lap >= course.laps) {
      race.phase = 'finish';
      race.events.push('finish');
    } else {
      race.events.push('lap');
    }
  }
}

function land(race: Race, ground: number): void {
  const t = TUNING;
  const b = race.bike;
  const s = slopeAt(race.course, b.x);
  const groundAngle = Math.atan(s);
  const diff = (b.angle - groundAngle) / DEG;
  b.air = false;
  b.y = ground;
  if (b.airFrames < t.hopFrames && Math.abs(diff) <= t.hopWindow) {
    // A small hop: just keep riding.
  } else if (diff <= t.goodNoseUp && diff >= -t.goodNoseDown) {
    race.events.push('land-good');
    b.landShow = 40;
    b.landGood = true;
  } else if (diff <= t.okNoseUp && diff >= -t.okNoseDown) {
    b.v *= t.roughKeep;
    race.events.push('land-rough');
    b.landShow = 40;
    b.landGood = false;
  } else {
    b.v = 0;
    b.crash = t.crashSec * FPS;
    race.events.push('crash');
  }
  b.angle = groundAngle;
  b.vy = b.v * s;
}

function moveLaneT(b: Bike): void {
  const d = b.lane - b.laneT;
  const stepSize = 1 / TUNING.laneFrames;
  b.laneT = Math.abs(d) <= stepSize ? b.lane : b.laneT + Math.sign(d) * stepSize;
}

/** Formats race frames as m:ss.cc. */
export function formatTime(frames: number): string {
  const cs = Math.floor((frames * 100) / FPS);
  const m = Math.floor(cs / 6000);
  const s = Math.floor((cs % 6000) / 100);
  const c = cs % 100;
  return `${m}:${String(s).padStart(2, '0')}.${String(c).padStart(2, '0')}`;
}
