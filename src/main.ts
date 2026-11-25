import './style.css';
import { autopilot } from './autopilot';
import { COURSES } from './course';
import { type Button, Controls } from './input';
import { Renderer, W } from './render';
import { FPS, NO_INPUT, type Race, type RaceEvent, formatTime, newRace, step } from './sim';
import { makeSprites } from './sprites';
import { load, loadBest, save, saveBest } from './storage';
import { fetchLatestVersion, reloadToVersion } from './update';

type Mode = 'title' | 'race' | 'pause' | 'result';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const canvas = $<HTMLCanvasElement>('screen');
const renderer = new Renderer(canvas, makeSprites());
const controls = new Controls({
  dpad: $('dpad'),
  ab: $('ab'),
  a: $('a'),
  b: $('b'),
  start: $('start'),
  select: $('select'),
});
const debug = new URLSearchParams(location.search).has('debug');
const course = COURSES[0];

let mode: Mode = 'title';
let race: Race = newDemo();
let frameCount = 0;
let modeFrames = 0;
let best = loadBest(course.id);
let newRecord = false;
let message = { text: '', color: '#fff', frames: 0 };
let label = { text: '', color: '#fff', frames: 0 };

if (load('hand') === 'left') document.body.classList.add('left-hand');

function newDemo(): Race {
  const r = newRace(course);
  r.phase = 'race';
  r.countdown = 0;
  return r;
}

function setMode(m: Mode): void {
  mode = m;
  modeFrames = 0;
  if (m === 'title' || m === 'result') void checkUpdate();
}

function startRace(): void {
  race = newRace(course);
  renderer.follow(race, true);
  message.frames = 0;
  label.frames = 0;
  newRecord = false;
  setMode('race');
}

controls.onPress = (b: Button) => {
  switch (mode) {
    case 'title':
      if (b === 'start' || b === 'a') startRace();
      else if (b === 'select') {
        const left = document.body.classList.toggle('left-hand');
        save('hand', left ? 'left' : 'right');
        buzz(15);
      }
      break;
    case 'race':
      if (b === 'start') setMode('pause');
      break;
    case 'pause':
      if (b === 'start') setMode('race');
      else if (b === 'select') {
        race = newDemo();
        renderer.follow(race, true);
        setMode('title');
      }
      break;
    case 'result':
      if (modeFrames < 40) break;
      if (b === 'start' || b === 'a') startRace();
      else if (b === 'select') {
        race = newDemo();
        renderer.follow(race, true);
        setMode('title');
      }
      break;
  }
};

function buzz(pattern: number | number[]): void {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // Not supported (e.g. iPhone).
  }
}

function onEvent(e: RaceEvent): void {
  switch (e) {
    case 'lane':
      buzz(8);
      break;
    case 'land-good':
      buzz(12);
      label = { text: 'NICE!', color: '#ffd23c', frames: 40 };
      break;
    case 'land-rough':
      buzz(35);
      break;
    case 'crash':
      buzz([60, 40, 90]);
      break;
    case 'overheat':
      buzz(220);
      break;
    case 'cool':
      buzz(10);
      label = { text: 'COOL!', color: '#5ad0ff', frames: 40 };
      break;
    case 'lap': {
      const final = race.lap === course.laps - 1;
      message = { text: final ? 'FINAL LAP' : `LAP ${race.lap + 1}`, color: final ? '#ff4a3a' : '#ffffff', frames: 90 };
      buzz(20);
      break;
    }
    case 'finish':
      message = { text: 'FINISH!', color: '#ffd23c', frames: 999 };
      buzz([30, 30, 30]);
      if (best === null || race.frame < best) {
        best = race.frame;
        newRecord = true;
        saveBest(course.id, race.frame);
      }
      break;
    default:
      break;
  }
}

/** One fixed 1/60 s step. */
function tick(): void {
  frameCount++;
  modeFrames++;
  if (message.frames > 0) message.frames--;
  if (label.frames > 0) label.frames--;
  switch (mode) {
    case 'title':
      step(race, autopilot(race));
      if (race.phase === 'finish' && race.after > 60) race = newDemo();
      break;
    case 'race':
      controls.airborne = race.bike.air;
      step(race, controls.sample());
      race.events.forEach(onEvent);
      if (race.phase === 'finish' && race.after > 100) setMode('result');
      break;
    case 'result':
      step(race, NO_INPUT);
      break;
    case 'pause':
      controls.sample();
      break;
  }
  if (mode !== 'pause') renderer.follow(race);
}

function draw(): void {
  const blink = frameCount % 50 < 34;
  if (mode === 'title') {
    renderer.drawRace(race, frameCount, false);
    renderer.logo(44, frameCount);
    if (blink) renderer.bigText('PUSH START', 124, '#ffffff', 1);
    renderer.banner(
      [
        { text: best === null ? 'BEST --:--.--' : `BEST ${formatTime(best)}`, color: '#ffd23c' },
        { text: `SELECT: ${document.body.classList.contains('left-hand') ? 'LEFT' : 'RIGHT'} HAND`, color: '#c8c8d8' },
      ],
      150,
    );
    renderer.bigText(`V${__APP_VERSION__}`, 206, '#ffffff', 1);
    return;
  }

  renderer.drawRace(race, frameCount);

  if (race.phase === 'countdown') {
    const n = Math.ceil(race.countdown / FPS);
    renderer.bigText(String(n), 56, '#ffffff', 4);
  } else if (race.frame < 45 && race.phase === 'race') {
    renderer.bigText('GO!', 56, '#ffd23c', 4);
  }
  if (race.bike.stall > 0 && frameCount % 20 < 13) renderer.bigText('OVERHEAT!', 40, '#ff4a3a', 2);
  else if (message.frames > 0 && mode === 'race') renderer.bigText(message.text, 40, message.color, 2);
  if (label.frames > 0 && race.bike.crash === 0) renderer.bikeLabel(race, label.text, label.color);

  if (mode === 'pause') {
    renderer.banner(
      [
        { text: 'PAUSE', color: '#ffd23c', scale: 2 },
        { text: 'START: CONTINUE' },
        { text: 'SELECT: QUIT' },
      ],
      70,
    );
  } else if (mode === 'result') {
    const lines = [
      { text: 'FINISH!', color: '#ffd23c', scale: 2 },
      { text: `TIME ${formatTime(race.frame)}` },
      { text: `BEST ${best === null ? '--' : formatTime(best)}`, color: '#c8c8d8' },
    ];
    if (newRecord) lines.push({ text: blink ? 'NEW RECORD!' : '', color: '#ff4a3a' });
    if (modeFrames >= 40) lines.push({ text: blink ? 'PUSH START' : '', color: '#ffffff' });
    renderer.banner(lines, 52);
  }

  if (debug) {
    const b = race.bike;
    const info = `L${b.lane} V${b.v.toFixed(2)} H${b.heat.toFixed(0)} A${((b.angle * 180) / Math.PI).toFixed(0)} X${b.x.toFixed(0)}`;
    renderer.bigText(info, 14, '#ffffff', 1);
  }
}

/** Fits the screen into the top part of the device, keeping its pixel shape. */
function resize(): void {
  const wrap = $('screen-wrap');
  const availW = wrap.clientWidth;
  const availH = window.innerHeight * 0.48;
  let scale = Math.min(availW / W, availH / 216);
  if (scale >= 2) scale = Math.floor(scale * 2) / 2;
  canvas.style.width = `${Math.floor(240 * scale)}px`;
  canvas.style.height = `${Math.floor(216 * scale)}px`;
}
window.addEventListener('resize', resize);
resize();

document.addEventListener('visibilitychange', () => {
  if (document.hidden && mode === 'race') setMode('pause');
});
document.addEventListener('contextmenu', (e) => e.preventDefault());

let lastUpdateCheck = 0;
async function checkUpdate(): Promise<void> {
  const now = Date.now();
  if (now - lastUpdateCheck < 60_000) return;
  lastUpdateCheck = now;
  const latest = await fetchLatestVersion();
  if (latest && latest !== __APP_VERSION__ && mode === 'title') reloadToVersion(latest);
}

// Fixed-step game loop.
let last = performance.now();
let acc = 0;
const STEP_MS = 1000 / FPS;
function loop(now: number): void {
  acc += Math.min(100, now - last);
  last = now;
  while (acc >= STEP_MS) {
    tick();
    acc -= STEP_MS;
  }
  draw();
  requestAnimationFrame(loop);
}
renderer.follow(race, true);
requestAnimationFrame(loop);
void checkUpdate();
