/**
 * Touch and keyboard controls.
 *
 * Two ways to play, both always active:
 * - Two hands: D-pad (up/down = lane, in the air = tilt) + A (accelerate) / B (turbo).
 * - One hand: keep the thumb on the A/B pad. A = accelerate, slide onto B = turbo,
 *   slide up/down = change lane (in the air: tilt). The thumb never has to leave the screen.
 */
import type { Input } from './sim';

/** Vertical slide (CSS px) for one lane change on the A/B pad. */
export const SWIPE_STEP = 26;
/** Vertical slide (CSS px) from the touch point that counts as tilting in the air. */
export const TILT_THRESHOLD = 14;

/** Tracks one thumb on the A/B pad and turns vertical slides into lane steps and tilt. */
export class Swipe {
  private anchorY: number;
  private restY: number;
  tilt: -1 | 0 | 1 = 0;

  constructor(y: number) {
    this.anchorY = y;
    this.restY = y;
  }

  /** Returns a lane step (-1 up, 1 down, 0 none) for the new thumb position. */
  move(y: number, airborne: boolean): -1 | 0 | 1 {
    const fromRest = y - this.restY;
    this.tilt = fromRest < -TILT_THRESHOLD ? 1 : fromRest > TILT_THRESHOLD ? -1 : 0;
    if (airborne) {
      this.anchorY = y;
      return 0;
    }
    // On the ground the tilt reference follows the thumb, so a tilt starts from where it is now.
    this.restY = y;
    const d = y - this.anchorY;
    if (d <= -SWIPE_STEP) {
      this.anchorY = y;
      return -1;
    }
    if (d >= SWIPE_STEP) {
      this.anchorY = y;
      return 1;
    }
    return 0;
  }
}

/** Frames before a held lane button repeats, and between repeats. */
const REPEAT_DELAY = 18;
const REPEAT_EVERY = 12;

export type Button = 'start' | 'select' | 'a' | 'b' | 'up' | 'down';

interface AbPointer {
  button: 'a' | 'b';
  swipe: Swipe;
}

export interface ControlElements {
  dpad: HTMLElement;
  ab: HTMLElement;
  a: HTMLElement;
  b: HTMLElement;
  start: HTMLElement;
  select: HTMLElement;
}

export class Controls {
  /** Set by the game every frame; lane steps are ignored in the air and slides tilt instead. */
  airborne = false;
  onPress: (b: Button) => void = () => {};

  private dpadPointers = new Map<number, { v: -1 | 0 | 1; h: -1 | 0 | 1 }>();
  private abPointers = new Map<number, AbPointer>();
  private keys = new Set<string>();
  private laneQueue = 0;
  private heldV: -1 | 0 | 1 = 0;
  private repeat = 0;

  constructor(private el: ControlElements) {
    this.bindDpad();
    this.bindAb();
    this.bindButton(el.start, 'start');
    this.bindButton(el.select, 'select');
    this.bindKeys();
  }

  /** Reads the controls for one simulation frame. */
  sample(): Input {
    let accel = this.keys.has('a');
    let turbo = this.keys.has('b');
    let swipeTilt = 0;
    for (const p of this.abPointers.values()) {
      if (p.button === 'a') accel = true;
      else turbo = true;
      swipeTilt += p.swipe.tilt;
    }
    let v = 0;
    let h = 0;
    for (const d of this.dpadPointers.values()) {
      v += d.v;
      h += d.h;
    }
    if (this.keys.has('up')) v -= 1;
    if (this.keys.has('down')) v += 1;
    if (this.keys.has('left')) h -= 1;
    if (this.keys.has('right')) h += 1;
    const vs = Math.sign(v) as -1 | 0 | 1;

    // Lane steps from the D-pad (with auto repeat) and from slides.
    let lane = 0;
    if (vs !== this.heldV) {
      this.heldV = vs;
      this.repeat = REPEAT_DELAY;
      lane = vs;
    } else if (vs !== 0 && --this.repeat <= 0) {
      this.repeat = REPEAT_EVERY;
      lane = vs;
    }
    if (lane === 0 && this.laneQueue !== 0) {
      lane = Math.sign(this.laneQueue);
      this.laneQueue -= lane;
    }
    if (this.airborne) {
      lane = 0;
      this.laneQueue = 0;
    }

    // Tilt: up / left / slide up lift the nose.
    const tiltSum = -vs - Math.sign(h) + swipeTilt;
    const tilt = this.airborne ? (Math.sign(tiltSum) as -1 | 0 | 1) : 0;

    return { accel: accel || turbo, turbo, lane: lane as -1 | 0 | 1, tilt };
  }

  private bindButton(el: HTMLElement, name: Button): void {
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      el.classList.add('down');
      this.onPress(name);
    });
    const up = () => el.classList.remove('down');
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('pointerleave', up);
  }

  private bindDpad(): void {
    const el = this.el.dpad;
    const update = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2);
      const dy = e.clientY - (r.top + r.height / 2);
      const dead = r.width * 0.1;
      const v: -1 | 0 | 1 = Math.abs(dy) > dead && Math.abs(dy) > Math.abs(dx) * 0.5 ? (dy < 0 ? -1 : 1) : 0;
      const h: -1 | 0 | 1 = Math.abs(dx) > dead && Math.abs(dx) > Math.abs(dy) * 0.5 ? (dx < 0 ? -1 : 1) : 0;
      const prev = this.dpadPointers.get(e.pointerId);
      this.dpadPointers.set(e.pointerId, { v, h });
      if (prev && prev.v !== v && v !== 0) this.onPress(v < 0 ? 'up' : 'down');
      this.showDpad();
    };
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      el.setPointerCapture(e.pointerId);
      this.dpadPointers.set(e.pointerId, { v: 0, h: 0 });
      update(e);
      const d = this.dpadPointers.get(e.pointerId);
      if (d && d.v !== 0) this.onPress(d.v < 0 ? 'up' : 'down');
    });
    el.addEventListener('pointermove', (e) => {
      if (this.dpadPointers.has(e.pointerId)) update(e);
    });
    const end = (e: PointerEvent) => {
      this.dpadPointers.delete(e.pointerId);
      this.showDpad();
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  }

  private showDpad(): void {
    let v = 0;
    let h = 0;
    for (const d of this.dpadPointers.values()) {
      v += d.v;
      h += d.h;
    }
    this.el.dpad.dataset.v = String(Math.sign(v));
    this.el.dpad.dataset.h = String(Math.sign(h));
  }

  /** Which of A / B the point is closer to (works for either hand layout). */
  private abButtonAt(x: number, y: number): 'a' | 'b' {
    const ra = this.el.a.getBoundingClientRect();
    const rb = this.el.b.getBoundingClientRect();
    const da = Math.hypot(x - (ra.left + ra.width / 2), (y - (ra.top + ra.height / 2)) * 0.3);
    const db = Math.hypot(x - (rb.left + rb.width / 2), (y - (rb.top + rb.height / 2)) * 0.3);
    return da <= db ? 'a' : 'b';
  }

  private bindAb(): void {
    const el = this.el.ab;
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      el.setPointerCapture(e.pointerId);
      const button = this.abButtonAt(e.clientX, e.clientY);
      this.abPointers.set(e.pointerId, { button, swipe: new Swipe(e.clientY) });
      this.onPress(button);
      this.showAb();
    });
    el.addEventListener('pointermove', (e) => {
      const p = this.abPointers.get(e.pointerId);
      if (!p) return;
      p.button = this.abButtonAt(e.clientX, e.clientY);
      const lane = p.swipe.move(e.clientY, this.airborne);
      if (lane !== 0) {
        this.laneQueue = Math.max(-2, Math.min(2, this.laneQueue + lane));
        this.onPress(lane < 0 ? 'up' : 'down');
      }
      this.showAb();
    });
    const end = (e: PointerEvent) => {
      this.abPointers.delete(e.pointerId);
      this.showAb();
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  }

  private showAb(): void {
    const held = new Set([...this.abPointers.values()].map((p) => p.button));
    this.el.a.classList.toggle('down', held.has('a'));
    this.el.b.classList.toggle('down', held.has('b'));
  }

  private bindKeys(): void {
    const map: Record<string, string> = {
      ArrowUp: 'up',
      ArrowDown: 'down',
      ArrowLeft: 'left',
      ArrowRight: 'right',
      KeyX: 'a',
      KeyK: 'a',
      KeyZ: 'b',
      KeyJ: 'b',
      Enter: 'start',
      ShiftLeft: 'select',
      ShiftRight: 'select',
    };
    window.addEventListener('keydown', (e) => {
      const k = map[e.code];
      if (!k) return;
      e.preventDefault();
      if (e.repeat) return;
      this.keys.add(k);
      if (k === 'start' || k === 'select' || k === 'a' || k === 'b' || k === 'up' || k === 'down') this.onPress(k);
    });
    window.addEventListener('keyup', (e) => {
      const k = map[e.code];
      if (k) this.keys.delete(k);
    });
    window.addEventListener('blur', () => this.keys.clear());
  }
}
