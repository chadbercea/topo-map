import { expect, test } from '@playwright/test';
import { freeze, photo, running, start } from './helpers';

// The satellite panel's priority ladder (ILI-1400): at every measured size and in every state
// it never scrolls, and rank 1 (the buttons) is always in view; what ranks lowest drops first.
for (const [name, width, height] of [['desktop', 1440, 900], ['tablet landscape', 1180, 820], ['short tablet', 1024, 640], ['phone', 390, 844]] as const) {
  test(`${name}: ORION-3 never scrolls and its buttons are always in view`, async ({ page, isMobile }) => {
    test.skip(isMobile, 'sets its own viewport');
    await page.setViewportSize({ width, height });
    await start(page, '?debug');
    await running(page);
    await freeze(page);
    const tabbed = (await page.locator('.hud').getAttribute('data-tier')) !== 'wide';
    const check = async () => {
      if (tabbed) await page.getByTestId('tab-orion').click();
      const r = await page.evaluate(() => {
        const o = document.querySelector('[data-testid=satellite]') as HTMLElement;
        const b = (o.querySelector('[data-testid=orion-buttons]') as HTMLElement).getBoundingClientRect();
        const p = o.getBoundingClientRect();
        return { scroll: o.scrollHeight - o.clientHeight, inView: b.height > 0 && b.top >= p.top - 1 && b.bottom <= p.bottom + 1 };
      });
      expect(r.scroll).toBeLessThanOrEqual(0);
      expect(r.inView).toBe(true);
    };
    await check();
    await page.evaluate(() => window.game.selectSquare('E3'));
    await check();
    await page.evaluate(() => window.game.lookAt('E3'));
    await check();
    await photo(page, 'E3');
    await page.evaluate(() => window.game.selectSquare('E3'));
    await check();
  });
}

test('on a phone ORION-3 has no 3D satellite: its glyph and name head the panel, with the state line and Reposition (ILI-1461)', async ({ page, isMobile }) => {
  test.skip(isMobile, 'sets its own viewport');
  await page.setViewportSize({ width: 390, height: 844 });
  await start(page, '?debug');
  await running(page);
  await page.getByTestId('tab-orion').click();
  await expect(page.getByTestId('orion-avatar')).toBeHidden();
  await expect(page.getByTestId('satellite').locator('.o-name-text')).toBeVisible();
  await expect(page.getByTestId('satellite').locator('.o-icon')).toBeVisible();
  await expect(page.getByTestId('orion-state')).toBeVisible();
  await expect(page.getByTestId('look-here')).toBeVisible();
});
