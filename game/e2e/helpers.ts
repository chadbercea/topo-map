import type { Page } from '@playwright/test';
import type { Store } from '../src/sim/store';

// ?debug puts the game store on window for tests.
declare global {
  interface Window {
    game: Store;
    frozen?: boolean;
  }
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

// Mirror MapScene's camera fit: the grid is centred in the map area between the panels.
const WORLD_W = 1600, WORLD_H = 1000, CELL = 200, MARGIN = 8;

// The map area resizes when panels grow (a radio call, the readout); wait for it to settle.
async function mapBox(page: Page) {
  let box = (await page.getByTestId('map-area').boundingBox())!;
  for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(100);
    const next = (await page.getByTestId('map-area').boundingBox())!;
    if (next.x === box.x && next.y === box.y && next.width === box.width && next.height === box.height) break;
    box = next;
  }
  return box;
}

// view: the world rect the camera fits (all of it, or a seek-and-destroy square with margin).
export async function worldToScreen(page: Page, wx: number, wy: number, view = { x: 0, y: 0, w: WORLD_W, h: WORLD_H }) {
  const box = await mapBox(page);
  const zoom = Math.min((box.width - MARGIN * 2) / view.w, (box.height - MARGIN * 2) / view.h);
  const cx = view.x + view.w / 2;
  const cy = view.y + view.h / 2;
  return { x: box.x + box.width / 2 + (wx - cx) * zoom, y: box.y + box.height / 2 + (wy - cy) * zoom };
}

// Cell i (0-15, row by row) of a seek-and-destroy board, with the camera closed in on it.
export function boardCell(page: Page, col: number, row: number, i: number) {
  const pad = CELL * 0.25;
  const view = { x: col * CELL - pad, y: row * CELL - pad, w: CELL + pad * 2, h: CELL + pad * 2 };
  return worldToScreen(page, col * CELL + ((i % 4) + 0.5) * (CELL / 4), row * CELL + (Math.floor(i / 4) + 0.5) * (CELL / 4), view);
}

export const squarePoint = (page: Page, col: number, row: number, dx = 0, dy = 0) =>
  worldToScreen(page, (col + 0.5 + dx) * CELL, (row + 0.5 + dy) * CELL);

export async function tapAt(page: Page, isMobile: boolean, p: { x: number; y: number }) {
  if (isMobile) await page.touchscreen.tap(p.x, p.y);
  else await page.mouse.click(p.x, p.y);
}
