import { expect, test } from '@playwright/test';
import { start } from './helpers';

test('scene fills the screen and hears input, with no errors', async ({ page, isMobile }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

  await start(page, '?debug');
  const canvas = page.locator('canvas:not(.o-sat-3d > canvas, .call-box canvas)'); // the map's; ORION-3's avatar (ILI-1196) and the call box's strip (ILI-1236, ILI-1255) have their own
  await expect(canvas).toHaveCount(1);
  const vp = page.viewportSize()!;
  await expect.poll(() => canvas.evaluate((c) => [c.clientWidth, c.clientHeight])).toEqual([vp.width, vp.height]);

  const status = page.getByTestId('scene-status');
  await expect(status).toContainText(`${vp.width}×${vp.height}`);
  // Tap open map, clear of what floats over it (the timer in its corner, ILI-1392).
  const at = await page.evaluate(() => {
    const b = document.querySelector('[data-testid=map-area]')!.getBoundingClientRect();
    for (const fy of [0.1, 0.3, 0.5]) for (const fx of [0.5, 0.75, 0.25]) {
      const p = { x: b.x + b.width * fx, y: b.y + b.height * fy };
      if (document.elementFromPoint(p.x, p.y)?.tagName === 'CANVAS') return p;
    }
    throw new Error('no open map to tap');
  });
  if (isMobile) await page.touchscreen.tap(at.x, at.y);
  else await page.mouse.click(at.x, at.y);
  await expect(status).toContainText(isMobile ? 'pointer: touch' : 'pointer: mouse');

  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  expect(errors).toEqual([]);
});
