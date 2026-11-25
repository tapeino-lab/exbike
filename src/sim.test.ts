import { describe, expect, it } from 'vitest';
import { autopilot } from './autopilot';
import { COURSES, type Course } from './course';
import { FPS, type Input, NO_INPUT, TUNING, formatTime, newRace, step } from './sim';

const flat: Course = {
  id: 'flat',
  name: 'FLAT',
  laps: 1,
  length: 3000,
  ground: [
    [0, 0],
    [3000, 0],
  ],
  mud: [{ x: 1000, len: 400, lanes: [2] }],
  coolers: [{ x: 600, lane: 0 }],
};

const ramp: Course = {
  id: 'ramp',
  name: 'RAMP',
  laps: 1,
  length: 3000,
  ground: [
    [0, 0],
    [300, 0],
    [380, 40],
    [390, 0],
    [3000, 0],
  ],
  mud: [],
  coolers: [],
};

const ACCEL: Input = { accel: true, turbo: false, lane: 0, tilt: 0 };
const TURBO: Input = { accel: true, turbo: true, lane: 0, tilt: 0 };

function started(course: Course) {
  const r = newRace(course);
  while (r.phase === 'countdown') step(r, NO_INPUT);
  return r;
}

describe('race', () => {
  it('counts down before the start', () => {
    const r = newRace(flat);
    for (let i = 0; i < TUNING.countdownSec * FPS - 1; i++) step(r, ACCEL);
    expect(r.phase).toBe('countdown');
    expect(r.bike.x).toBe(newRace(flat).bike.x);
    step(r, ACCEL);
    expect(r.phase).toBe('race');
    expect(r.events).toContain('go');
  });

  it('accelerates to top speed, faster with turbo', () => {
    const r = started(flat);
    for (let i = 0; i < 120; i++) step(r, ACCEL);
    expect(r.bike.v).toBeCloseTo(TUNING.vmax);
    for (let i = 0; i < 60; i++) step(r, TURBO);
    expect(r.bike.v).toBeCloseTo(TUNING.vmax * TUNING.turbo);
  });

  it('overheats with too much turbo and stalls for a while', () => {
    const r = started(flat);
    let frames = 0;
    while (r.bike.stall === 0 && frames < 1000) {
      step(r, TURBO);
      frames++;
    }
    expect(r.events).toContain('overheat');
    expect(frames / FPS).toBeGreaterThan(3.5);
    expect(frames / FPS).toBeLessThan(4.5);
    for (let i = 0; i < 60; i++) step(r, TURBO);
    expect(r.bike.throttle).toBe('none');
    for (let i = 0; i < TUNING.stallSec * FPS; i++) step(r, TURBO);
    expect(r.bike.stall).toBe(0);
  });

  it('cools down on a cooling arrow', () => {
    const r = started(flat);
    r.bike.lane = 0;
    r.bike.laneT = 0;
    while (r.bike.x < 550) step(r, TURBO);
    expect(r.bike.heat).toBeGreaterThan(10);
    let cooled = false;
    while (r.bike.x < 700) {
      step(r, ACCEL);
      if (r.events.includes('cool')) cooled = true;
    }
    expect(cooled).toBe(true);
    expect(r.bike.heat).toBeLessThan(5);
  });

  it('slows down in mud, only in its lane', () => {
    const r = started(flat);
    r.bike.lane = 2;
    r.bike.laneT = 2;
    while (r.bike.x < 1300) step(r, ACCEL);
    expect(r.bike.v).toBeLessThanOrEqual(TUNING.vmax * TUNING.mud + 1e-9);
    const r2 = started(flat);
    while (r2.bike.x < 1300) step(r2, ACCEL);
    expect(r2.bike.v).toBeCloseTo(TUNING.vmax);
  });

  it('changes lanes one at a time, within the track', () => {
    const r = started(flat);
    step(r, { ...ACCEL, lane: -1 });
    expect(r.bike.lane).toBe(0);
    expect(r.events).toContain('lane');
    for (let i = 0; i < 20; i++) step(r, ACCEL);
    step(r, { ...ACCEL, lane: -1 });
    expect(r.bike.lane).toBe(0);
    for (let i = 0; i < 3; i++) {
      for (let k = 0; k < 10; k++) step(r, ACCEL);
      step(r, { ...ACCEL, lane: 1 });
    }
    step(r, { ...ACCEL, lane: 1 });
    expect(r.bike.lane).toBe(3);
  });

  it('flies off a ramp and cannot change lanes in the air', () => {
    const r = started(ramp);
    let flew = false;
    while (r.bike.x < 400) {
      step(r, ACCEL);
      if (r.events.includes('takeoff')) flew = true;
    }
    expect(flew).toBe(true);
    expect(r.bike.air).toBe(true);
    const lane = r.bike.lane;
    step(r, { ...ACCEL, lane: 1 });
    expect(r.bike.lane).toBe(lane);
  });

  it('lands well with the nose level, rough without tilting, crashes nose-first', () => {
    const fly = (pilot: (angle: number) => -1 | 0 | 1) => {
      const r = started(ramp);
      const events: string[] = [];
      while (r.bike.x < 900) {
        step(r, { ...ACCEL, tilt: r.bike.air ? pilot(r.bike.angle) : 0 });
        events.push(...r.events);
      }
      return events;
    };
    expect(fly((a) => (a > 0.03 ? -1 : 0))).toContain('land-good');
    expect(fly(() => 0)).toContain('land-rough');
    expect(fly(() => -1)).toContain('crash');
    expect(fly(() => 1)).toContain('crash');
  });

  it('small hops land safely without tilting', () => {
    const bumps: Course = {
      ...ramp,
      ground: [
        [0, 0],
        [300, 0],
        [322, 5],
        [344, 0],
        [366, 5],
        [388, 0],
        [3000, 0],
      ],
    };
    const r = started(bumps);
    const events: string[] = [];
    while (r.bike.x < 600) {
      step(r, TURBO);
      events.push(...r.events);
    }
    expect(events).not.toContain('crash');
    expect(events).not.toContain('land-rough');
  });

  it('a crash costs time and then the bike goes on', () => {
    const r = started(flat);
    r.bike.air = true;
    r.bike.y = 20;
    r.bike.angle = -1;
    step(r, ACCEL);
    while (!r.events.includes('crash')) step(r, ACCEL);
    expect(r.bike.crash).toBeGreaterThan(0);
    for (let i = 0; i < TUNING.crashSec * FPS; i++) step(r, ACCEL);
    expect(r.bike.crash).toBe(0);
    for (let i = 0; i < 30; i++) step(r, ACCEL);
    expect(r.bike.v).toBeGreaterThan(0.5);
  });

  it('finishes after all laps', () => {
    const r = started({ ...flat, laps: 2, mud: [] });
    let laps = 0;
    while (r.phase === 'race' && r.frame < 10000) {
      step(r, ACCEL);
      if (r.events.includes('lap')) laps++;
    }
    expect(laps).toBe(1);
    expect(r.phase).toBe('finish');
    expect(r.events).toContain('finish');
    const time = r.frame;
    step(r, ACCEL);
    expect(r.frame).toBe(time);
  });

  it('is deterministic', () => {
    const run = () => {
      const r = started(COURSES[0]);
      for (let i = 0; i < 3000; i++) step(r, autopilot(r));
      return JSON.stringify(r.bike);
    };
    expect(run()).toBe(run());
  });

  it('the demo driver can finish the real course', () => {
    const r = started(COURSES[0]);
    let crashes = 0;
    while (r.phase === 'race' && r.frame < 60 * 60 * 6) {
      step(r, autopilot(r));
      if (r.events.includes('crash')) crashes++;
    }
    expect(r.phase).toBe('finish');
    expect(crashes).toBe(0);
    // Prints the lap time, handy when tuning the course.
    console.log(`demo: ${formatTime(r.frame)}, crashes ${crashes}`);
  });
});

describe('formatTime', () => {
  it('formats m:ss.cc', () => {
    expect(formatTime(0)).toBe('0:00.00');
    expect(formatTime(60 * 75 + 30)).toBe('1:15.50');
  });
});
