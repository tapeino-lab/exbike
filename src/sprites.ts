/** Pixel-art sprites, drawn once into small offscreen canvases. */

export const BIKE_W = 24;
export const BIKE_H = 22;
/** Ground contact point inside the bike sprite (between the wheels). */
export const BIKE_AX = 12;
export const BIKE_AY = 21;

export interface RiderColors {
  suit: string;
  suitDark: string;
  helmet: string;
  visor: string;
}

export const PLAYER_COLORS: RiderColors = {
  suit: '#e83a30',
  suitDark: '#9c1c18',
  helmet: '#ffffff',
  visor: '#2b2b40',
};

const BLACK = '#141414';
const TIRE = '#2a2a2a';
const GRAY = '#8a8a96';
const SILVER = '#d0d4dc';
const WHITE = '#f6f6f6';
const ENGINE = '#4a4a52';
const GLOVE = '#ffffff';
const BOOT = '#1d1d1d';

function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('2d context unavailable');
  return [c, ctx];
}

class Pixels {
  constructor(private ctx: CanvasRenderingContext2D) {}

  px(x: number, y: number, c: string): void {
    this.ctx.fillStyle = c;
    this.ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
  }

  rect(x: number, y: number, w: number, h: number, c: string): void {
    this.ctx.fillStyle = c;
    this.ctx.fillRect(x, y, w, h);
  }

  line(x0: number, y0: number, x1: number, y1: number, c: string, thick = 1): void {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    for (let i = 0; i <= n; i++) {
      const x = x0 + ((x1 - x0) * i) / n;
      const y = y0 + ((y1 - y0) * i) / n;
      this.px(x, y, c);
      if (thick > 1) {
        this.px(x + 1, y, c);
        this.px(x, y + 1, c);
      }
    }
  }

  disc(cx: number, cy: number, r: number, c: string): void {
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
        if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r) this.px(x, y, c);
      }
    }
  }

  ring(cx: number, cy: number, r: number, inner: number, c: string): void {
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
        const d = (x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2;
        if (d <= r * r && d > inner * inner) this.px(x, y, c);
      }
    }
  }
}

function wheel(p: Pixels, cx: number, cy: number, spin: number): void {
  p.ring(cx, cy, 4, 2.6, TIRE);
  p.ring(cx, cy, 2.6, 1.8, GRAY);
  // Spokes that turn with the wheel.
  for (let i = 0; i < 2; i++) {
    const a = spin + (i * Math.PI) / 2;
    p.px(cx - 0.5 + Math.cos(a) * 1.6, cy - 0.5 + Math.sin(a) * 1.6, SILVER);
    p.px(cx - 0.5 - Math.cos(a) * 1.6, cy - 0.5 - Math.sin(a) * 1.6, SILVER);
  }
  p.px(cx - 0.5, cy - 0.5, SILVER);
}

/** The bike with its rider, facing right. `frame` (0-3) turns the wheels. */
function drawBike(p: Pixels, col: RiderColors, frame: number, rider: boolean): void {
  const spin = (frame * Math.PI) / 4;
  const rear = { x: 5.5, y: 17 };
  const front = { x: 19.5, y: 17 };
  // Swing arm, engine, frame.
  p.line(6, 16, 11, 14, GRAY);
  p.rect(9, 13, 5, 3, ENGINE);
  p.px(10, 16, ENGINE);
  p.line(7, 12, 16, 12, WHITE);
  p.line(9, 11, 15, 11, WHITE);
  p.line(1, 11, 8, 12, col.suit); // rear fender
  p.line(13, 11, 16, 11, col.suit); // tank
  // Front fork, fender, number plate, handlebar.
  p.line(19, 16, 16, 9, SILVER);
  p.line(17, 11, 22, 12, col.suit);
  p.rect(16, 9, 2, 2, WHITE);
  p.line(15, 8, 17, 8, BLACK);
  wheel(p, rear.x, rear.y, spin);
  wheel(p, front.x, front.y, spin);
  if (!rider) return;
  // Rider standing on the pegs, leaning forward.
  p.line(11, 13, 13, 10, col.suitDark, 2); // shin
  p.line(13, 10, 9, 8, col.suitDark, 2); // thigh
  p.px(10, 14, BOOT);
  p.px(11, 14, BOOT);
  p.line(9, 8, 12, 4, col.suit, 2); // back
  p.line(13, 5, 16, 8, col.suit); // arm
  p.px(16, 8, GLOVE);
  p.disc(13.5, 3, 2.6, col.helmet);
  p.rect(14, 2, 2, 2, col.visor);
  p.line(11, 1, 13, 0, col.suit); // helmet stripe
}

export interface Sprites {
  bike: HTMLCanvasElement[];
  bikeOnly: HTMLCanvasElement;
  rider: HTMLCanvasElement;
}

export function makeSprites(col: RiderColors = PLAYER_COLORS): Sprites {
  const bike = [0, 1, 2, 3].map((f) => {
    const [c, ctx] = makeCanvas(BIKE_W, BIKE_H);
    drawBike(new Pixels(ctx), col, f, true);
    return c;
  });
  const [bikeOnly, bctx] = makeCanvas(BIKE_W, BIKE_H);
  drawBike(new Pixels(bctx), col, 0, false);
  // A rider curled up, for crashes.
  const [rider, rctx] = makeCanvas(10, 10);
  const p = new Pixels(rctx);
  p.disc(5, 5, 3.5, col.suit);
  p.disc(6.5, 3.5, 2.4, col.helmet);
  p.rect(7, 3, 2, 1, col.visor);
  p.px(2, 7, BOOT);
  p.px(3, 8, BOOT);
  return { bike, bikeOnly, rider };
}
