/** Draws the game screen (240x216 pixels, scaled up by CSS). */
import { COOLER_LEN, type Course, LANES, heightAt, isMud, lapX, slopeAt } from './course';
import { drawText, drawTextCentered, textWidth } from './font';
import { type Race, START_X, TUNING, formatTime } from './sim';
import { BIKE_AX, BIKE_AY, type Sprites } from './sprites';

export const W = 240;
export const H = 216;

const HUD_H = 12;
const FOOT_Y = 204;
/** Screen y of the back edge of lane 0 at ground height 0. */
const BASE = 100;
const LANE_H = 20;
/** Each lane further forward is drawn this much further left (oblique view). */
const SKEW = 5;
const TRACK_BOTTOM = BASE + LANES * LANE_H;

const C = {
  sky: '#78c8ff',
  skyLow: '#b4e4ff',
  cloud: '#ffffff',
  mountain: '#6c9ad0',
  mountainLight: '#8cb4e0',
  stand: '#5a5a6e',
  standStep: '#6e6e84',
  roof: '#d64040',
  board: '#1e3c8c',
  boardText: '#ffd23c',
  dirt: ['#dca060', '#d4964f'],
  dirtUp: ['#eab474', '#e2aa66'],
  dirtDown: ['#b87c40', '#b07438'],
  laneLine: '#f0cc94',
  edge: '#ffffff',
  wall: '#8a5424',
  wallDark: '#6c3e18',
  mud: '#5c3a1c',
  mudLight: '#74502a',
  grass: '#4cb04c',
  grassDark: '#3c943c',
  hay: '#f0d060',
  hayDark: '#c8a838',
  cooler: '#ffffff',
  coolerBack: '#38b8f0',
  hud: '#101018',
  text: '#ffffff',
  yellow: '#ffd23c',
  red: '#ff4a3a',
  shadow: 'rgba(40,20,0,0.35)',
};

const CROWD = ['#ff6a5a', '#ffd23c', '#5ad0ff', '#ffffff', '#9a7cff', '#5ae07a', '#ff9ad0', '#f0a050'];

/** Small deterministic hash for scenery details. */
function hash(n: number): number {
  let x = (n | 0) * 374761393;
  x = (x ^ (x >>> 13)) * 1274126177;
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}

export class Renderer {
  camX = 0;
  private ctx: CanvasRenderingContext2D;

  constructor(
    canvas: HTMLCanvasElement,
    private sprites: Sprites,
  ) {
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('2d context unavailable');
    this.ctx = ctx;
    ctx.imageSmoothingEnabled = false;
  }

  /** Moves the camera towards the bike; `snap` jumps there at once. */
  follow(race: Race, snap = false): void {
    const b = race.bike;
    const target = b.x - (80 - b.v * 9);
    this.camX = snap ? target : this.camX + (target - this.camX) * 0.12;
  }

  /** Draws the world (scenery, track, bike) and the HUD. */
  drawRace(race: Race, frameCount: number, showHud = true): void {
    const ctx = this.ctx;
    ctx.imageSmoothingEnabled = false;
    this.drawScenery(race.course, frameCount);
    this.drawTrack(race, frameCount);
    if (showHud) this.drawHud(race, frameCount);
  }

  private drawScenery(course: Course, frameCount: number): void {
    const ctx = this.ctx;
    const cam = this.camX;
    // Sky.
    ctx.fillStyle = C.sky;
    ctx.fillRect(0, 0, W, BASE);
    ctx.fillStyle = C.skyLow;
    ctx.fillRect(0, 44, W, 20);
    // Clouds drift slowly.
    for (let i = 0; i < 4; i++) {
      const span = W + 60;
      const x = ((((i * 97 - cam * 0.05 - frameCount * 0.05) % span) + span) % span) - 40;
      const y = 18 + ((i * 13) % 20);
      ctx.fillStyle = C.cloud;
      ctx.fillRect(x, y, 26, 5);
      ctx.fillRect(x + 5, y - 3, 14, 3);
      ctx.fillRect(x + 4, y + 5, 18, 2);
    }
    // Mountains (far, slow).
    for (let sx = 0; sx < W; sx++) {
      const wx = sx + cam * 0.15;
      const h = 14 + Math.sin(wx * 0.021) * 9 + Math.sin(wx * 0.053) * 5;
      ctx.fillStyle = C.mountain;
      ctx.fillRect(sx, 64 - h, 1, h);
      if (Math.sin(wx * 0.021) > 0.6) {
        ctx.fillStyle = C.mountainLight;
        ctx.fillRect(sx, 64 - h, 1, 2);
      }
    }
    // Grandstand with crowd (middle distance).
    const standTop = 62;
    ctx.fillStyle = C.stand;
    ctx.fillRect(0, standTop, W, BASE - standTop);
    const par = cam * 0.5;
    for (let row = 0; row < 6; row++) {
      const y = standTop + 4 + row * 4;
      ctx.fillStyle = C.standStep;
      ctx.fillRect(0, y + 2, W, 1);
      const shift = Math.floor(par) + row * 7;
      for (let sx = 0; sx < W; sx += 2) {
        const n = sx + shift - (shift % 2);
        const r = hash(n * 31 + row);
        if (r < 0.75) {
          const bob = (frameCount >> 4) % 2 === 0 && r < 0.2 ? -1 : 0;
          ctx.fillStyle = CROWD[Math.floor(r * 97) % CROWD.length];
          ctx.fillRect(sx - (par % 2), y + bob, 1, 2);
        }
      }
    }
    ctx.fillStyle = C.roof;
    ctx.fillRect(0, standTop - 3, W, 3);
    // Advertising boards along the track (track speed, so they read as close).
    ctx.fillStyle = C.board;
    ctx.fillRect(0, BASE - 9, W, 9);
    const boardSpan = 160;
    const first = Math.floor(cam / boardSpan) * boardSpan;
    for (let wx = first; wx < cam + W + boardSpan; wx += boardSpan) {
      const sx = Math.round(wx - cam);
      const lx = lapX(course, wx);
      const label = lx < boardSpan ? 'EX-BIKE' : (wx / boardSpan) % 2 === 0 ? 'TURBO OIL' : 'DIRT 2026';
      drawText(ctx, label, sx + 8, BASE - 8, C.boardText);
      ctx.fillStyle = '#0c2460';
      ctx.fillRect(sx, BASE - 9, 1, 9);
    }
  }

  /** Screen y of lane edge `edge` (0 = back of lane 0, 4 = front of lane 3) at screen x. */
  private edgeY(course: Course, edge: number, sx: number): number {
    return Math.round(BASE + edge * LANE_H - heightAt(course, this.camX + sx + edge * SKEW));
  }

  private drawTrack(race: Race, frameCount: number): void {
    const ctx = this.ctx;
    const { course, bike } = race;
    const cam = this.camX;
    const bikeLane = Math.min(LANES - 1, Math.max(0, Math.round(bike.laneT)));

    // Front wall (sides of the ramps) and grass in front of the track.
    ctx.fillStyle = C.grass;
    ctx.fillRect(0, TRACK_BOTTOM, W, FOOT_Y - TRACK_BOTTOM);
    for (let sx = 0; sx < W; sx += 1) {
      const top = this.edgeY(course, LANES, sx);
      ctx.fillStyle = C.wall;
      ctx.fillRect(sx, top, 1, TRACK_BOTTOM + 3 - top);
      ctx.fillStyle = C.wallDark;
      ctx.fillRect(sx, TRACK_BOTTOM + 2, 1, 2);
    }
    // Grass texture and hay bales.
    ctx.fillStyle = C.grassDark;
    for (let sx = 0; sx < W; sx += 1) {
      const n = Math.floor(sx + cam);
      if (hash(n) < 0.18) ctx.fillRect(sx, TRACK_BOTTOM + 6 + Math.floor(hash(n + 7) * 12), 1, 2);
    }
    const hayGap = 90;
    for (let wx = Math.floor((cam - 40) / hayGap) * hayGap; wx < cam + W + 40; wx += hayGap) {
      const sx = Math.round(wx - cam - LANES * SKEW);
      ctx.fillStyle = C.hay;
      ctx.fillRect(sx, TRACK_BOTTOM + 6, 14, 8);
      ctx.fillStyle = C.hayDark;
      ctx.fillRect(sx, TRACK_BOTTOM + 9, 14, 1);
      ctx.fillRect(sx, TRACK_BOTTOM + 13, 14, 1);
    }

    // Lanes, back to front, with the bike drawn right after its own lane.
    for (let j = 0; j < LANES; j++) {
      for (let sx = 0; sx < W; sx++) {
        const top = this.edgeY(course, j, sx);
        const bottom = this.edgeY(course, j + 1, sx);
        const wx = cam + sx + (j + 0.5) * SKEW;
        const s = slopeAt(course, wx);
        const shade = j % 2;
        let col = s > 0.05 ? C.dirtUp[shade] : s < -0.05 ? C.dirtDown[shade] : C.dirt[shade];
        if (isMud(course, j, wx)) col = hash(Math.floor(wx / 3) + j * 999) < 0.3 ? C.mudLight : C.mud;
        ctx.fillStyle = col;
        ctx.fillRect(sx, top, 1, bottom - top);
        if (j > 0 && (Math.floor(wx) >> 2) % 2 === 0) {
          ctx.fillStyle = C.laneLine;
          ctx.fillRect(sx, top, 1, 1);
        }
        if (j === 0) {
          ctx.fillStyle = C.edge;
          ctx.fillRect(sx, top, 1, 1);
        }
      }
      this.drawLaneMarks(course, j);
      if (j === bikeLane) this.drawBike(race, frameCount);
    }
    // Front edge line.
    ctx.fillStyle = C.edge;
    for (let sx = 0; sx < W; sx++) ctx.fillRect(sx, this.edgeY(course, LANES, sx) - 1, 1, 1);
  }

  /** Cooling arrows and the start line on lane j. */
  private drawLaneMarks(course: Course, j: number): void {
    const ctx = this.ctx;
    const cam = this.camX;
    const L = course.length;
    const lap0 = Math.floor(cam / L) * L;
    for (const base of [lap0 - L, lap0, lap0 + L]) {
      // Start / finish line: checkered.
      const lineX = base + START_X;
      for (let dx = 0; dx < 6; dx++) {
        const sx = Math.round(lineX + dx - cam - (j + 0.5) * SKEW);
        if (sx < 0 || sx >= W) continue;
        const top = this.edgeY(course, j, sx);
        const bottom = this.edgeY(course, j + 1, sx);
        for (let y = top; y < bottom; y += 2) {
          ctx.fillStyle = ((y - top) / 2 + Math.floor(dx / 2)) % 2 === 0 ? '#ffffff' : '#141414';
          ctx.fillRect(sx, y, 1, Math.min(2, bottom - y));
        }
      }
      for (const c of course.coolers) {
        if (c.lane !== j) continue;
        const sx0 = Math.round(base + c.x - cam - (j + 0.5) * SKEW);
        if (sx0 < -COOLER_LEN || sx0 > W) continue;
        for (let dx = 0; dx < COOLER_LEN; dx++) {
          const sx = sx0 + dx;
          if (sx < 0 || sx >= W) continue;
          const top = this.edgeY(course, j, sx) + 3;
          const bottom = this.edgeY(course, j + 1, sx) - 3;
          ctx.fillStyle = C.coolerBack;
          ctx.fillRect(sx, top, 1, bottom - top);
          // Two chevrons ">>".
          const mid = (top + bottom) / 2;
          for (const cx of [4, 13]) {
            const k = dx - cx;
            if (k >= 0 && k < 6) {
              ctx.fillStyle = C.cooler;
              ctx.fillRect(sx, Math.round(mid - 5 + k), 1, 2);
              ctx.fillRect(sx, Math.round(mid + 4 - k), 1, 2);
            }
          }
        }
      }
    }
  }

  private drawBike(race: Race, frameCount: number): void {
    const ctx = this.ctx;
    const b = race.bike;
    const k = b.laneT + 0.5;
    const sx = b.x - this.camX - k * SKEW;
    const laneY = BASE + k * LANE_H;
    const groundY = laneY - heightAt(race.course, b.x);
    const sy = laneY - b.y;

    // Shadow on the ground while flying.
    if (b.air) {
      const w = Math.max(6, 16 - (b.y - heightAt(race.course, b.x)) * 0.15);
      ctx.fillStyle = C.shadow;
      ctx.fillRect(Math.round(sx - w / 2), Math.round(groundY - 1), Math.round(w), 2);
    }

    if (b.crash > 0) {
      const t = TUNING.crashSec * 60 - b.crash;
      this.blit(this.sprites.bikeOnly, sx, groundY, -Math.PI / 2 + 0.2, BIKE_AX, BIKE_AY - 4);
      // Rider tumbles forward and rolls to a stop.
      const roll = Math.min(t, 40);
      const rx = sx + 6 + roll * 0.7;
      const ry = groundY - 4 - Math.max(0, Math.sin(Math.min(1, t / 30) * Math.PI) * 14);
      this.blit(this.sprites.rider, rx, ry, t < 40 ? t * 0.35 : 0, 5, 5);
      return;
    }

    const spin = b.v > 0.05 ? Math.floor(frameCount * b.v * 0.5) % 4 : 0;
    // Shake a little when the engine is dead.
    const shake = b.stall > 0 && frameCount % 6 < 3 ? 1 : 0;
    this.blit(this.sprites.bike[spin], sx, sy - shake, b.angle, BIKE_AX, BIKE_AY);

    // Exhaust puffs with turbo.
    if (b.throttle === 'turbo' && !b.air && frameCount % 4 < 2) {
      ctx.fillStyle = '#f0f0f0';
      ctx.fillRect(Math.round(sx - 13 - (frameCount % 8)), Math.round(sy - 6), 3, 2);
    }
    if (b.stall > 0 && frameCount % 10 < 6) {
      ctx.fillStyle = '#9a9aa4';
      ctx.fillRect(Math.round(sx - 2 + ((frameCount >> 2) % 3)), Math.round(sy - 26 - ((frameCount >> 1) % 6)), 3, 3);
    }
  }

  /** Draws a sprite rotated by `angle` (radians, counter-clockwise) around its anchor. */
  private blit(img: HTMLCanvasElement, x: number, y: number, angle: number, ax: number, ay: number): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(Math.round(x), Math.round(y));
    if (angle !== 0) ctx.rotate(-angle);
    ctx.drawImage(img, -ax, -ay);
    ctx.restore();
  }

  private drawHud(race: Race, frameCount: number): void {
    const ctx = this.ctx;
    const { course, bike } = race;
    // Top bar: time and lap.
    ctx.fillStyle = C.hud;
    ctx.fillRect(0, 0, W, HUD_H);
    drawText(ctx, 'TIME', 4, 3, C.yellow);
    drawText(ctx, formatTime(race.frame), 32, 3, C.text);
    const lap = `LAP ${Math.min(race.lap + 1, course.laps)}/${course.laps}`;
    drawText(ctx, lap, W - 4 - textWidth(lap), 3, C.text);

    // Bottom bar: engine temperature and course map.
    ctx.fillStyle = C.hud;
    ctx.fillRect(0, FOOT_Y, W, H - FOOT_Y);
    drawText(ctx, 'TEMP', 4, FOOT_Y + 3, C.yellow);
    const gx = 31;
    const gw = 64;
    ctx.fillStyle = '#3a3a48';
    ctx.fillRect(gx, FOOT_Y + 3, gw, 7);
    const heat = Math.min(100, bike.heat);
    const filled = Math.round((gw - 2) * (heat / 100));
    const hot = heat > 75;
    const blink = bike.stall > 0 || (hot && frameCount % 16 < 8);
    for (let i = 0; i < filled; i++) {
      const f = i / (gw - 2);
      ctx.fillStyle = f < 0.5 ? '#5ae07a' : f < 0.75 ? '#ffd23c' : '#ff4a3a';
      if (blink && bike.stall > 0) ctx.fillStyle = frameCount % 8 < 4 ? '#ff4a3a' : '#ffffff';
      ctx.fillRect(gx + 1 + i, FOOT_Y + 4, 1, 5);
    }

    // Course map: the ground profile of one lap and the bike's position.
    const mx = 104;
    const mw = W - mx - 4;
    const my = FOOT_Y + 9;
    ctx.fillStyle = '#5a5a6e';
    ctx.fillRect(mx, my, mw, 1);
    for (let i = 0; i < mw; i++) {
      const h = heightAt(course, START_X + (i / mw) * course.length);
      if (h > 1) {
        const hh = Math.max(1, Math.round(h / 8));
        ctx.fillStyle = '#9a9ab0';
        ctx.fillRect(mx + i, my - hh, 1, hh);
      }
    }
    const progress = (((bike.x - START_X) % course.length) + course.length) % course.length;
    const px = mx + Math.round((progress / course.length) * mw);
    ctx.fillStyle = C.red;
    ctx.fillRect(px - 1, my - 6, 3, 3);
    ctx.fillRect(px, my - 3, 1, 3);
  }

  /** A full-width dark band with centred lines of text. */
  banner(lines: { text: string; color?: string; scale?: number }[], y: number): void {
    const ctx = this.ctx;
    const height = lines.reduce((s, l) => s + 7 * (l.scale ?? 1) + 4, 6);
    ctx.fillStyle = 'rgba(10,10,20,0.72)';
    ctx.fillRect(0, y, W, height);
    let cy = y + 5;
    for (const l of lines) {
      const s = l.scale ?? 1;
      drawTextCentered(ctx, l.text, W / 2, cy, l.color ?? C.text, s);
      cy += 7 * s + 4;
    }
  }

  /** Big centred text with a shadow. */
  bigText(text: string, y: number, color: string = C.yellow, scale = 3): void {
    drawTextCentered(this.ctx, text, W / 2, y, color, scale, '#000');
  }

  /** Small text near the bike (e.g. NICE!). */
  bikeLabel(race: Race, text: string, color: string): void {
    const b = race.bike;
    const k = b.laneT + 0.5;
    const sx = b.x - this.camX - k * SKEW;
    const sy = BASE + k * LANE_H - b.y - 34;
    drawTextCentered(this.ctx, text, sx, Math.max(HUD_H + 2, sy), color);
  }

  /** The title logo. */
  logo(y: number, frameCount: number): void {
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(10,10,20,0.6)';
    ctx.fillRect(0, y - 6, W, 50);
    drawTextCentered(ctx, 'EX-BIKE', W / 2 + 2, y + 2, C.red, 4, C.red);
    drawTextCentered(ctx, 'EX-BIKE', W / 2, y, C.yellow, 4, '#000');
    const sub = 'MOTOCROSS TIME ATTACK';
    drawTextCentered(ctx, sub, W / 2, y + 34, frameCount % 60 < 50 ? C.text : C.yellow);
  }

  get colors(): typeof C {
    return C;
  }
}
