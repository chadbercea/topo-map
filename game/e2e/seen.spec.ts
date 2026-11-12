import { expect, test } from '@playwright/test';
import { fastForward, freeze, photo, running, start, untilOnStation } from './helpers';

// The map only shows what's been seen (ILI-1468): a photo square says how old its look is, with a
// draining bar and a PHOTO · m:ss tag; a square on video gets ORION-3's brackets and FEED · LIVE.
test('a photo square shows its age; a video square shows its feed', async ({ page }) => {
  await start(page, '?debug');
  await running(page);
  await freeze(page);
  await photo(page, 'E3');
  // While ORION-3 stays over E3 its look is live; once it moves off, the photo starts to age.
  await page.evaluate(() => window.game.lookAt('H5'));
  await expect.poll(() => page.evaluate(() => window.mapSeenTags()['p:E3'])).toMatch(/^PHOTO · 0:0\d$/);
  await fastForward(page, 30_000);
  await expect.poll(() => page.evaluate(() => window.mapSeenTags()['p:E3'])).toMatch(/^PHOTO · 0:3\d$/);
  await fastForward(page, 80_000);
  await expect.poll(() => page.evaluate(() => window.mapSeenTags()['p:E3'])).toBe('PHOTO · STALE');

  await page.evaluate(() => {
    window.game.selectSquare('F4');
    window.game.lookAt('F4');
  });
  await untilOnStation(page);
  await page.evaluate(() => window.game.scan('F4'));
  await fastForward(page, 1_000);
  await page.evaluate(() => window.game.capture('video'));
  await fastForward(page, 16_000);
  await expect.poll(() => page.evaluate(() => window.mapSeenTags()['f:F4'])).toMatch(/^[●○] FEED · LIVE$/);
  expect(await page.evaluate(() => window.mapSeenTags()['p:F4'])).toBeUndefined(); // live: no age
});
