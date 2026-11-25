/**
 * Course data. The ground profile is shared by all four lanes (ramps span the whole track);
 * mud and cooling arrows belong to single lanes. Units are world pixels; height grows upwards.
 */

export const LANES = 4;

export interface Mud {
  x: number;
  len: number;
  lanes: number[];
}

export interface Cooler {
  x: number;
  lane: number;
}

export interface Course {
  id: string;
  name: string;
  laps: number;
  /** Length of one lap. */
  length: number;
  /** Ground profile as [x, height] points, x ascending from 0 to length, height 0 at both ends. */
  ground: [number, number][];
  mud: Mud[];
  coolers: Cooler[];
}

/** Small helper to describe a ground profile as a sequence of pieces. */
class GroundBuilder {
  readonly pts: [number, number][] = [[0, 0]];
  x = 0;
  h = 0;

  flat(len: number): this {
    return this.to(len, this.h);
  }

  /** Straight slope over `len` to height `h`. */
  to(len: number, h: number): this {
    this.x += len;
    this.h = h;
    this.pts.push([this.x, h]);
    return this;
  }

  /** A ramp that goes up, stays on top, and comes back down to the ground. */
  ramp(up: number, height: number, top: number, down: number): this {
    this.to(up, height);
    if (top > 0) this.flat(top);
    return this.to(down, 0);
  }

  /** A row of small bumps. */
  whoops(count: number, width: number, height: number, gap: number): this {
    for (let i = 0; i < count; i++) {
      this.ramp(width / 2, height, 0, width / 2);
      if (gap > 0 && i < count - 1) this.flat(gap);
    }
    return this;
  }
}

/** The first course. */
function buildDustValley(): Course {
  const g = new GroundBuilder();
  const mark: Record<string, number> = {};
  g.flat(420);
  g.ramp(60, 14, 30, 60); // warm-up ramp
  g.flat(260);
  mark.whoops = g.x;
  g.whoops(5, 44, 5, 6);
  g.flat(280);
  mark.mud1 = g.x - 220;
  // Kicker over a gap onto a landing ramp.
  g.to(90, 34).to(14, 0);
  g.flat(150);
  g.to(26, 18).to(120, 0);
  g.flat(300);
  mark.cool1 = g.x - 200;
  // Table top.
  g.ramp(80, 28, 170, 80);
  g.flat(260);
  mark.mud2 = g.x - 240;
  // Double ramp.
  g.ramp(50, 20, 0, 18);
  g.flat(110);
  g.ramp(50, 20, 0, 60);
  g.flat(320);
  mark.whoops2 = g.x;
  g.whoops(7, 40, 5, 0);
  g.flat(260);
  mark.cool2 = g.x - 150;
  // The big one: a tall kicker over a long gap onto a long landing slope.
  g.to(110, 44).flat(12).to(12, 0);
  g.flat(230);
  g.to(24, 24).to(170, 0);
  g.flat(280);
  mark.mud3 = g.x - 250;
  g.ramp(70, 18, 40, 70);
  g.flat(220);
  g.whoops(4, 50, 9, 20);
  g.flat(420);

  return {
    id: 'dust-valley',
    name: 'DUST VALLEY',
    laps: 3,
    length: g.x,
    ground: g.pts,
    mud: [
      { x: mark.mud1, len: 150, lanes: [1, 2] },
      { x: mark.mud2, len: 140, lanes: [0, 3] },
      { x: mark.mud3, len: 170, lanes: [1, 2, 3] },
    ],
    coolers: [
      { x: mark.cool1, lane: 0 },
      { x: mark.cool1 + 40, lane: 3 },
      { x: mark.cool2, lane: 1 },
      { x: mark.whoops - 120, lane: 2 },
    ],
  };
}

export const COURSES: Course[] = [buildDustValley()];

/** Position within the current lap. */
export function lapX(course: Course, x: number): number {
  const m = x % course.length;
  return m < 0 ? m + course.length : m;
}

/** Index of the profile segment containing lap position `lx`. */
function segmentAt(course: Course, lx: number): number {
  const pts = course.ground;
  let lo = 0;
  let hi = pts.length - 2;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (pts[mid][0] <= lx) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/** Ground height at world x (laps repeat). */
export function heightAt(course: Course, x: number): number {
  const lx = lapX(course, x);
  const i = segmentAt(course, lx);
  const [x0, h0] = course.ground[i];
  const [x1, h1] = course.ground[i + 1];
  if (x1 === x0) return h1;
  return h0 + ((h1 - h0) * (lx - x0)) / (x1 - x0);
}

/** Ground slope (dh/dx) at world x. */
export function slopeAt(course: Course, x: number): number {
  const lx = lapX(course, x);
  const i = segmentAt(course, lx);
  const [x0, h0] = course.ground[i];
  const [x1, h1] = course.ground[i + 1];
  if (x1 === x0) return 0;
  return (h1 - h0) / (x1 - x0);
}

/** Whether lane `lane` has mud at world x. */
export function isMud(course: Course, lane: number, x: number): boolean {
  const lx = lapX(course, x);
  return course.mud.some((m) => m.lanes.includes(lane) && lx >= m.x && lx < m.x + m.len);
}

/** Width of a cooling arrow pad. */
export const COOLER_LEN = 24;

/** Whether lane `lane` has a cooling arrow at world x. */
export function isCooler(course: Course, lane: number, x: number): boolean {
  const lx = lapX(course, x);
  return course.coolers.some((c) => c.lane === lane && lx >= c.x && lx < c.x + COOLER_LEN);
}
