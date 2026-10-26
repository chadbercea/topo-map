import { expect, test } from '@playwright/test';

test('scene fills the screen and hears input, with no errors', async ({ page, isMobile }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

  await page.goto('');
  const canvas = page.locator('canvas');
  await expect(canvas).toHaveCount(1);
  const vp = page.viewportSize()!;
  await expect.poll(() => canvas.evaluate((c) => [c.clientWidth, c.clientHeight])).toEqual([vp.width, vp.height]);

  const status = page.getByTestId('scene-status');
  await expect(status).toContainText(`${vp.width}×${vp.height}`);
  if (isMobile) await page.touchscreen.tap(vp.width / 2, vp.height / 2);
  else await page.mouse.click(vp.width / 2, vp.height / 2);
  await expect(status).toContainText(isMobile ? 'pointer: touch' : 'pointer: mouse');

  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  expect(errors).toEqual([]);
});
