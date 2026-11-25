import { describe, expect, it } from 'vitest';
import { SWIPE_STEP, Swipe, TILT_THRESHOLD } from './input';

describe('one-hand swipe', () => {
  it('turns vertical slides into one lane step per SWIPE_STEP', () => {
    const s = new Swipe(300);
    expect(s.move(300 - SWIPE_STEP / 2, false)).toBe(0);
    expect(s.move(300 - SWIPE_STEP, false)).toBe(-1);
    expect(s.move(300 - SWIPE_STEP * 1.5, false)).toBe(0);
    expect(s.move(300 - SWIPE_STEP * 2, false)).toBe(-1);
    expect(s.move(300 - SWIPE_STEP, false)).toBe(1);
  });

  it('tilts instead of changing lanes in the air', () => {
    const s = new Swipe(300);
    expect(s.move(300 - SWIPE_STEP * 2, true)).toBe(0);
    expect(s.tilt).toBe(1);
    expect(s.move(300 + TILT_THRESHOLD + 1, true)).toBe(0);
    expect(s.tilt).toBe(-1);
    expect(s.move(300, true)).toBe(0);
    expect(s.tilt).toBe(0);
  });

  it('does not change lane right after landing because of an air slide', () => {
    const s = new Swipe(300);
    s.move(250, true);
    expect(s.move(255, false)).toBe(0);
  });
});
