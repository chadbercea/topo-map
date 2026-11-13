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

// Nothing about an enemy shows until ORION-3 has scanned the square it's in (ILI-1493, superseding
// 11-12's "scanned or not"): over an unscanned square it shows no fighters, no tag, no ping; the
// scan brings them up, and from then on it watches them live.
test('ORION-3 over an unscanned square shows no enemy until it scans it', async ({ page }) => {
  await start(page, '?debug');
  await running(page);
  await freeze(page);
  await page.evaluate(() => {
    window.game.selectSquare('E3');
    window.game.lookAt('E3');
  });
  await untilOnStation(page);
  await fastForward(page, 1_000);
  expect(await page.evaluate(() => !!window.game.get().imagery.E3)).toBe(false); // not scanned
  await expect.poll(() => page.evaluate(() => window.mapLiveCount())).toBe(0);
  expect(await page.evaluate(() => window.mapSightings().filter((x) => x.kind === 'hostile').length)).toBe(0);
  await expect(page.locator('[data-testid=contact-tag][data-square=E3]')).toHaveCount(0);
  expect(await page.evaluate(() => window.game.get().events.some((e) => e.kind === 'contact'))).toBe(false);

  await page.evaluate(() => window.game.scan('E3'));
  await fastForward(page, 200);
  await expect.poll(() => page.evaluate(() => window.mapLiveCount())).toBeGreaterThan(0);
  await expect.poll(() => page.evaluate(() => window.mapSightings().filter((x) => x.kind === 'hostile').length)).toBeGreaterThan(0);
  expect(await page.evaluate(() => window.game.get().events.some((e) => e.id === 'contact-checkpoint' && e.square === 'E3'))).toBe(true);
});
