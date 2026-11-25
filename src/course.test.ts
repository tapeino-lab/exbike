import { describe, expect, it } from 'vitest';
import { COURSES, heightAt, isCooler, isMud, lapX, slopeAt } from './course';

describe('courses', () => {
  for (const c of COURSES) {
    it(`${c.id}: ground profile is well formed`, () => {
      expect(c.ground[0]).toEqual([0, 0]);
      expect(c.ground[c.ground.length - 1]).toEqual([c.length, 0]);
      for (let i = 1; i < c.ground.length; i++) expect(c.ground[i][0]).toBeGreaterThan(c.ground[i - 1][0]);
      expect(c.length).toBeGreaterThan(4000);
    });

    it(`${c.id}: features sit inside the lap and on flat ground`, () => {
      for (const m of c.mud) {
        expect(m.x).toBeGreaterThanOrEqual(0);
        expect(m.x + m.len).toBeLessThanOrEqual(c.length);
        for (const l of m.lanes) expect(l).toBeGreaterThanOrEqual(0);
      }
      for (const k of c.coolers) {
        expect(k.lane).toBeGreaterThanOrEqual(0);
        expect(k.lane).toBeLessThan(4);
        expect(heightAt(c, k.x)).toBe(0);
      }
    });
  }
});

describe('ground lookup', () => {
  const c = COURSES[0];
  it('repeats every lap', () => {
    for (const x of [10, 500, 1234.5, 3000]) {
      expect(heightAt(c, x + c.length)).toBeCloseTo(heightAt(c, x));
      expect(slopeAt(c, x + 2 * c.length)).toBeCloseTo(slopeAt(c, x));
    }
    expect(lapX(c, -10)).toBeCloseTo(c.length - 10);
  });

  it('is continuous', () => {
    for (let x = 0; x < c.length; x += 1) {
      expect(Math.abs(heightAt(c, x + 1) - heightAt(c, x))).toBeLessThan(4);
    }
  });

  it('finds mud and coolers by lane', () => {
    const m = c.mud[0];
    expect(isMud(c, m.lanes[0], m.x + 1)).toBe(true);
    const other = [0, 1, 2, 3].find((l) => !m.lanes.includes(l)) ?? 0;
    expect(isMud(c, other, m.x + 1)).toBe(false);
    const k = c.coolers[0];
    expect(isCooler(c, k.lane, k.x + 1)).toBe(true);
    expect(isCooler(c, (k.lane + 1) % 4, k.x + 1)).toBe(false);
  });
});
