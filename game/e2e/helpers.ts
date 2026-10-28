import type { Page } from '@playwright/test';
import type { Store } from '../src/sim/store';

// ?debug puts the game store on window for tests.
declare global {
  interface Window {
    game: Store;
    frozen?: boolean;
    mapCamera: () => { scrollX: number; scrollY: number; zoom: number; width: number; height: number; dpr: number };
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

// Cell i (0-15, row by row) of a seek-and-destroy board, with the camera closed in on it.
export function boardCell(page: Page, col: number, row: number, i: number) {
  return worldToScreen(page, col * CELL + ((i % 4) + 0.5) * (CELL / 4), row * CELL + (Math.floor(i / 4) + 0.5) * (CELL / 4));
}

export const squarePoint = (page: Page, col: number, row: number, dx = 0, dy = 0) =>
  worldToScreen(page, (col + 0.5 + dx) * CELL, (row + 0.5 + dy) * CELL);

export async function tapAt(page: Page, isMobile: boolean, p: { x: number; y: number }) {
  if (isMobile) await page.touchscreen.tap(p.x, p.y);
  else await page.mouse.click(p.x, p.y);
}

// ALPHA's ask arrives as an orange flag at its marker; click it to read the ask and answer
// (ILI-1200). If the flag is under the square card, the intel stream raises it (ILI-1203).
export async function openAsk(page: Page) {
  // On a phone the action panel covers the dock and raises the ask itself (ILI-1211).
  const panel = page.getByTestId('answer-alpha-panel');
  if (await panel.count()) return panel.click();
  const answer = page.getByTestId('answer-alpha');
  if (!(await answer.count())) return page.getByTestId('incoming').click();
  if (!(await answer.isVisible())) await page.getByTestId('tab-intel').click();
  await answer.click();
}

// HQ's answer takes the link's time to reach ALPHA (ILI-1209, LINK_MS): wait it out on a frozen clock.
export const linked = (page: Page) => fastForward(page, 2_500);
