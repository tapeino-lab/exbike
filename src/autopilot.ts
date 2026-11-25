/** A simple driver for the title-screen demo. */
import { heightAt, slopeAt } from './course';
import { TUNING, type Input, type Race } from './sim';

/** Ground slope where a flying bike will come down. */
export function landingSlope(race: Race): number {
  const b = race.bike;
  let { x, y, vy } = b;
  for (let i = 0; i < 400; i++) {
    x += b.v;
    vy -= TUNING.gravity;
    y += vy;
    if (y <= heightAt(race.course, x)) break;
  }
  return slopeAt(race.course, x);
}

export function autopilot(race: Race): Input {
  const b = race.bike;
  const turbo = b.heat < 55 && b.stall === 0;
  let tilt: -1 | 0 | 1 = 0;
  if (b.air) {
    const diff = b.angle - Math.atan(landingSlope(race));
    tilt = diff > 0.06 ? -1 : diff < -0.06 ? 1 : 0;
  }
  // Wander between lanes now and then.
  const lane = race.frame % 240 === 120 ? (b.lane < 2 ? 1 : -1) : 0;
  return { accel: true, turbo, lane, tilt };
}
