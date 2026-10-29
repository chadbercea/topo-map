import { expect, test } from '@playwright/test';
import { start } from './helpers';

test('scene fills the screen and hears input, with no errors', async ({ page, isMobile }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

  await start(page, '?debug');
  const canvas = page.locator('canvas:not(.o-sat-3d > canvas, .satcom canvas)'); // the map's; ORION-3's avatar (ILI-1196) and COMMS's strip (ILI-1236) have their own
  await expect(canvas).toHaveCount(1);
  const vp = page.viewportSize()!;
  await expect.poll(() => canvas.evaluate((c) => [c.clientWidth, c.clientHeight])).toEqual([vp.width, vp.height]);

  const status = page.getByTestId('scene-status');
  await expect(status).toContainText(`${vp.width}×${vp.height}`);
  // Tap the open map near its top, clear of ALPHA's ask window.
  const map = (await page.getByTestId('map-area').boundingBox())!;
  const at = { x: map.x + map.width / 2, y: map.y + 40 };
  if (isMobile) await page.touchscreen.tap(at.x, at.y);
  else await page.mouse.click(at.x, at.y);
  await expect(status).toContainText(isMobile ? 'pointer: touch' : 'pointer: mouse');

  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  expect(errors).toEqual([]);
});
