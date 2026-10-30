import { expect, test } from '@playwright/test';

// The way in (ILI-1280): Castle House idles with the clock held; picking ORION-3 wipes into the
// login, the war room powers on, ORION-3 links with ALPHA, and only then does the clock start,
// with ALPHA's first call. (Automation skips it unless the URL asks: ?intro.)
test('Castle House idles until ORION-3 is picked; the clock starts with ALPHA’s first call', async ({ page, isMobile }) => {
  await page.goto('?intro&debug');
  await page.waitForFunction(() => window.game);
  await expect(page.getByText('CASTLE HOUSE', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.game.get().phase)).toBe('standby');

  const orion = page.getByTestId('intro-orion');
  if (isMobile) await orion.tap();
  else await orion.click();
  await expect(page.getByTestId('intro-login')).toContainText('OPERATOR AUTH');
  await expect(page.getByTestId('intro-link')).toContainText('SATCOM link established', { ignoreCase: true, timeout: 10_000 });
  expect(await page.evaluate(() => window.game.get().phase)).toBe('standby'); // still held

  await expect(page.getByTestId('intro')).toHaveCount(0, { timeout: 10_000 });
  await expect.poll(() => page.evaluate(() => window.game.get().phase)).toBe('running');
  await expect.poll(() => page.evaluate(() => window.game.get().team.holdFor)).not.toBeNull();
});
