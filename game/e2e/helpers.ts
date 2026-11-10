import { expect, type Page } from '@playwright/test';
import type { Store } from '../src/sim/store';

// ?debug puts the game store on window for tests.
declare global {
  interface Window {
    game: Store;
    frozen?: boolean;
    mapCamera: () => { scrollX: number; scrollY: number; zoom: number; width: number; height: number; dpr: number };
    mapSightings: () => { id: string; kind: string; x: number; y: number }[];
  }
}

// Open the game: it starts live, ALPHA on the ground and the clock running (ILI-1194).
export async function start(page: Page, query = '') {
  await page.goto(query);
  await page.getByTestId('team-panel').waitFor({ state: 'attached' });
}

// Advance mission time directly, so tests don't depend on CI's frame rate.
export const fastForward = (page: Page, ms: number) =>
  page.evaluate((ms) => {
    for (let t = 0; t < ms; t += 100) window.game.tick(100);
  }, ms);

// Wait (in mission time) for ORION-3 to get on station.
export const untilOnStation = (page: Page) =>
  page.evaluate(() => {
    for (let i = 0; i < 300 && window.game.get().satellite.state === 'slewing'; i++) window.game.tick(100);
  });

// Task ORION-3 to a square and take a photo there, straight through the store.
export const photo = (page: Page, square: string) =>
  page.evaluate((sq) => {
    const g = window.game;
    g.lookAt(sq);
    for (let i = 0; i < 300 && g.get().satellite.state === 'slewing'; i++) g.tick(100);
    g.capture('photo');
    g.closeLook();
  }, square);

// Stop the real-time clock (MapScene reads window.frozen) before tapping through a timed
// mini game: real taps take seconds on CI's software renderer. Time then moves only via tick.
export const freeze = (page: Page) =>
  page.evaluate(() => {
    window.frozen = true;
  });

const CELL = 200;

// The live camera, once it has stopped moving (it eases after ALPHA, and the map refits
// when panels grow).
async function settledCamera(page: Page) {
  let cam = await page.evaluate(() => window.mapCamera());
  for (let i = 0; i < 30; i++) {
    await page.waitForTimeout(100);
    const next = await page.evaluate(() => window.mapCamera());
    if (JSON.stringify(next) === JSON.stringify(cam)) break;
    cam = next;
  }
  return cam;
}

// A world point to CSS px on screen, through the camera as it is now.
export async function worldToScreen(page: Page, wx: number, wy: number) {
  const c = await settledCamera(page);
  const sx = c.width / 2 + (wx - c.scrollX - c.width / 2) * c.zoom;
  const sy = c.height / 2 + (wy - c.scrollY - c.height / 2) * c.zoom;
  return { x: sx / c.dpr, y: sy / c.dpr };
}

export const squarePoint = (page: Page, col: number, row: number, dx = 0, dy = 0) =>
  worldToScreen(page, (col + 0.5 + dx) * CELL, (row + 0.5 + dy) * CELL);

export async function tapAt(page: Page, isMobile: boolean, p: { x: number; y: number }) {
  if (isMobile) await page.touchscreen.tap(p.x, p.y);
  else await page.mouse.click(p.x, p.y);
}

// The game is up and the clock running: ALPHA walks its route on its own (ILI-1315: no
// opening question; under test the intel gauge is pinned full, ILI-1314).
export const running = (page: Page) => page.waitForFunction(() => window.game?.get().phase === 'running');

// ALPHA's one question since it decides for itself (ILI-1315): combat ineffective, it stops and
// asks for a resupply bird. Two operators down, a moment later, the call is up.
export async function askResupply(page: Page) {
  await running(page);
  await page.evaluate(() => {
    const s = window.game.get();
    const operators = s.team.operators.map((o, i) => (i < 2 ? { ...o, health: 0 } : o));
    window.game.set({ ...s, team: { ...s.team, operators } });
    for (let t = 0; t < 200; t += 100) window.game.tick(100);
  });
  await page.waitForFunction(() => window.game.get().team.holdFor);
}

// ALPHA's call is a prompt pinned to its marker (ILI-1393), answered right there.
export async function openAsk(page: Page) {
  const p = page.locator('[data-testid=prompt][data-kind=team-call]');
  await expect(p).toBeVisible();
  return p;
}

// HQ's answer takes the link's time to reach ALPHA (ILI-1209, LINK_MS): wait it out on a frozen clock.
export const linked = (page: Page) => fastForward(page, 2_500);

// Open the task (map event) of a kind on a square, as tapping its marker does (ILI-1225: no
// intel stream to open it from).
export const openEvent = (page: Page, kind: string, square: string) =>
  page.evaluate(([k, sq]) => {
    const e = window.game.get().events.find((x) => x.kind === k && x.square === sq && x.status !== 'resolved')!;
    window.game.openEvent(e.id);
  }, [kind, square] as const);

// A task (map event) of a kind on a square exists.
export const hasEvent = (page: Page, kind: string, square: string) =>
  page.evaluate(([k, sq]) => window.game.get().events.some((x) => x.kind === k && x.square === sq), [kind, square] as const);

// ORION-3 locked on a square (ILI-1397): nothing runs on a square it isn't over. For tests about
// what an action does, not the move step.
export const lockOn = (page: Page, square: string) =>
  page.evaluate((sq) => {
    const s = window.game.get();
    const from = { col: sq.charCodeAt(0) - 65, row: Number(sq.slice(1)) - 1 };
    window.game.set({ ...s, satellite: { ...s.satellite, state: 'idle', aim: sq, from, startMs: 0, arriveMs: 0, mode: null, callId: null, result: null } });
  }, square);
