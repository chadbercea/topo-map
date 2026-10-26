import { expect, test, type Page } from '@playwright/test';

// Mirror MapScene's camera fit to find a square's centre on screen.
const WORLD_W = 1600, WORLD_H = 1000, CELL = 200, MARGIN = 24;
function screenPoint(page: Page, col: number, row: number) {
  const { width, height } = page.viewportSize()!;
  const zoom = Math.min((width - MARGIN * 2) / WORLD_W, (height - MARGIN * 2) / WORLD_H);
  return {
    x: width / 2 + ((col + 0.5) * CELL - WORLD_W / 2) * zoom,
    y: height / 2 + ((row + 0.5) * CELL - WORLD_H / 2) * zoom,
  };
}

test('tapping a grid square selects it, tapping again clears it', async ({ page, isMobile }) => {
  await page.goto('');
  const selected = page.getByTestId('selected-square');
  await expect(selected).toHaveText('—');
  const tap = async (col: number, row: number) => {
    const { x, y } = screenPoint(page, col, row);
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
