import { expect, test, type Locator } from '@playwright/test';
import { freeze, start } from './helpers';

// The medium tier (ILI-1213): a fold open either way, a tablet, a phone on its side. The map
// on the left, the panels in a rail on the right behind tabs; a picked square's anchor floats
// over the map beside it, with its strikes (ILI-1302).
const SIZES = [
  ['fold upright', 750, 832],
  ['fold sideways', 832, 750],
  ['tablet', 820, 1180],
  ['phone sideways', 844, 390],
] as const;

const box = async (l: Locator) => (await l.boundingBox())!;
const inside = (b: { x: number; y: number; width: number; height: number }, w: number, h: number) => b.x >= 0 && b.y >= 0 && b.x + b.width <= w + 0.5 && b.y + b.height <= h + 0.5;

for (const [name, width, height] of SIZES) {
  test(`${name} (${width}×${height}): the map and a side rail; a picked square's anchor over the map`, async ({ page, isMobile }) => {
    test.skip(isMobile, 'sets its own viewport');
    await page.setViewportSize({ width, height });
    await start(page, '?debug');
    await page.waitForFunction(() => window.game?.get().team.holdFor);
    await freeze(page);
    await expect(page.locator('.hud')).toHaveAttribute('data-tier', 'medium');

    // The rail: tabs, and one panel at a time under them, right of the map.
    const tabs = page.locator('.dock-tabs');
    await expect(tabs).toBeVisible();
    const rail = await box(tabs);
    const map = await box(page.getByTestId('map-area'));
    expect(map.x + map.width).toBeLessThanOrEqual(rail.x);
    await page.getByTestId('tab-satcom').click();
    await expect(page.getByTestId('satcom')).toBeVisible();
    await expect(page.getByTestId('team-panel')).toBeHidden();

    // ALPHA's flag is at its marker in the open map, not parked at the map's foot.
    await expect(page.getByTestId('comms')).toHaveAttribute('data-pinned', 'true');

    // Open E3 with the checkpoint found: its anchor floats over the map, its strikes in it,
    // inside the screen.
    await page.evaluate(() => {
      const g = window.game;
      g.lookAt('E3');
      for (let i = 0; i < 300 && g.get().satellite.state === 'slewing'; i++) g.tick(100);
      g.capture('photo');
      g.selectSquare('E3');
    });
    const card = page.getByTestId('square-card');
    await expect(card).toHaveAttribute('data-square', 'E3');
    const c = await box(card);
    expect(c.x + c.width).toBeLessThanOrEqual(rail.x + 1); // over the map, not in the rail
    const menu = card.getByTestId('strike-menu');
    await menu.getByTestId('fire-sniper').scrollIntoViewIfNeeded();
    await expect(menu.getByTestId('fire-sniper')).toBeVisible();
    expect(inside(await box(menu.getByTestId('fire-sniper')), width, height)).toBe(true);

    await card.getByRole('button', { name: 'Close' }).click();
    await expect(card).toHaveCount(0);
  });
}

test('the tier follows the width alone: a near-square screen keeps its layout as it turns', async ({ page, isMobile }) => {
  test.skip(isMobile, 'sets its own viewport');
  await start(page, '?debug');
  for (const [w, h, tier] of [[690, 700, 'compact'], [700, 690, 'medium'], [1199, 1250, 'medium'], [1200, 1150, 'wide']] as const) {
    await page.setViewportSize({ width: w, height: h });
    await expect(page.locator('.hud')).toHaveAttribute('data-tier', tier);
  }
});
