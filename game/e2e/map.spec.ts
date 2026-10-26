import { expect, test, type Page } from '@playwright/test';

// Mirror MapScene's camera fit: the grid is centred in the map area between the panels.
const WORLD_W = 1600, WORLD_H = 1000, CELL = 200, MARGIN = 8;
async function screenPoint(page: Page, col: number, row: number) {
  const box = (await page.getByTestId('map-area').boundingBox())!;
  const zoom = Math.min((box.width - MARGIN * 2) / WORLD_W, (box.height - MARGIN * 2) / WORLD_H);
  return {
    x: box.x + box.width / 2 + ((col + 0.5) * CELL - WORLD_W / 2) * zoom,
    y: box.y + box.height / 2 + ((row + 0.5) * CELL - WORLD_H / 2) * zoom,
  };
}

test('tapping a grid square selects it, tapping again clears it', async ({ page, isMobile }) => {
  await page.goto('?debug');
  const selected = page.getByTestId('selected-square');
  await expect(selected).toHaveText('—');
  const tap = async (col: number, row: number) => {
    const { x, y } = await screenPoint(page, col, row);
    if (isMobile) await page.touchscreen.tap(x, y);
    else await page.mouse.click(x, y);
  };
  await tap(2, 1);
  await expect(selected).toHaveText('C2');
  await tap(7, 4);
  await expect(selected).toHaveText('H5');
  await tap(7, 4);
  await expect(selected).toHaveText('—');
});
