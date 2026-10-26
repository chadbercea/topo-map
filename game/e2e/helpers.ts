import type { Page } from '@playwright/test';

// Mirror MapScene's camera fit: the grid is centred in the map area between the panels.
const WORLD_W = 1600, WORLD_H = 1000, CELL = 200, MARGIN = 8;

export async function worldToScreen(page: Page, wx: number, wy: number) {
  const box = (await page.getByTestId('map-area').boundingBox())!;
  const zoom = Math.min((box.width - MARGIN * 2) / WORLD_W, (box.height - MARGIN * 2) / WORLD_H);
  return { x: box.x + box.width / 2 + (wx - WORLD_W / 2) * zoom, y: box.y + box.height / 2 + (wy - WORLD_H / 2) * zoom };
}

export const squarePoint = (page: Page, col: number, row: number, dx = 0, dy = 0) =>
  worldToScreen(page, (col + 0.5 + dx) * CELL, (row + 0.5 + dy) * CELL);

export async function tapAt(page: Page, isMobile: boolean, p: { x: number; y: number }) {
  if (isMobile) await page.touchscreen.tap(p.x, p.y);
  else await page.mouse.click(p.x, p.y);
}
