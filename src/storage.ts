/** Small wrappers around localStorage that never throw (private mode, blocked storage). */

const PREFIX = 'exbike.';

export function load(key: string): string | null {
  try {
    return localStorage.getItem(PREFIX + key);
  } catch {
    return null;
  }
}

export function save(key: string, value: string): void {
  try {
    localStorage.setItem(PREFIX + key, value);
  } catch {
    // Not saved; the game still works.
  }
}

/** Best time (in frames) for a course, or null. */
export function loadBest(courseId: string): number | null {
  const v = Number(load(`best.${courseId}`));
  return Number.isFinite(v) && v > 0 ? v : null;
}

export function saveBest(courseId: string, frames: number): void {
  save(`best.${courseId}`, String(frames));
}
