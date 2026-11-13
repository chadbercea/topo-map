import { expect, test, type Locator } from '@playwright/test';
import { askResupply, freeze, start, running } from './helpers';

// The medium tier (ILI-1213): a fold open either way, a tablet, a phone on its side. The map
// on the left, the panels in a rail on the right behind tabs; a picked square shows in
// ORION-3's tab, its actions floating over the map (ILI-1228).
// Held upright (taller than wide) the medium tier docks ORION-3 under the map instead (ILI-1461):
// see the fold test below.
const SIZES = [
  ['fold sideways', 832, 750],
  ['tablet sideways', 1180, 820],
  ['phone sideways', 844, 390],
] as const;

const box = async (l: Locator) => (await l.boundingBox())!;
const inside = (b: { x: number; y: number; width: number; height: number }, w: number, h: number) => b.x >= 0 && b.y >= 0 && b.x + b.width <= w + 0.5 && b.y + b.height <= h + 0.5;

for (const [name, width, height] of SIZES) {
  test(`${name} (${width}×${height}): the map and a side rail; a picked square is in ORION-3's tab, its actions over the map`, async ({ page, isMobile }) => {
    test.skip(isMobile, 'sets its own viewport');
    await page.setViewportSize({ width, height });
    await start(page, '?debug');
    await running(page);
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

    // ALPHA's call is a prompt at its marker in the open map (ILI-1393).
    await askResupply(page); // ALPHA's one question (ILI-1315)
    await expect(page.locator('[data-testid=prompt][data-kind=team-call]')).toBeInViewport();

    // Open E3 with the checkpoint found: ORION-3's tab comes forward with the square in it, and
    // what HQ can do about it floats over the map, both inside the screen.
    await page.evaluate(() => {
      const g = window.game;
      g.selectSquare('E3');
      g.lookAt('E3');
      for (let i = 0; i < 300 && g.get().satellite.state === 'slewing'; i++) g.tick(100);
      g.capture('photo');
    });
    await expect(page.locator('.hud')).toHaveAttribute('data-tab', 'orion');
    // Its details are in ORION-3's view with its picture (ILI-1438); the map menu has the actions.
    await expect(page.getByTestId('square-anchor').getByTestId('square-card')).toHaveAttribute('data-square', 'E3');
    const sat = await box(page.getByTestId('satellite'));
    expect(sat.x).toBeGreaterThanOrEqual(rail.x - 1); // in the rail
    const card = page.getByTestId('square-anchor');
    // Its strikes open from the square's own Strike (ILI-1482: a fighter's panel is read-only).
    // The scan may have heard their radio (ILI-1359): its card set aside, out of a small screen's way.
    await page.evaluate(() => window.game.get().events.filter((e) => e.kind === 'signal').forEach((e) => window.game.dismissTraffic(e.id)));
    await card.locator('[data-testid=contact-tag][data-square=E3]').getByTestId('contact-strike').click();
    const menu = page.getByTestId('strike-flyout').getByTestId('strike-menu'); // the strike menu by its square (ILI-1474)
    await menu.getByTestId('fire-sniper').scrollIntoViewIfNeeded();
    await expect(menu.getByTestId('fire-sniper')).toBeVisible();
    expect(inside(await box(menu.getByTestId('fire-sniper')), width, height)).toBe(true);

    await page.getByTestId('strike-back').click(); // back to the square's report (11-12)
    await expect(page.getByTestId('strike-flyout')).toHaveCount(0);
    await card.getByRole('button', { name: 'Close' }).click();
    await expect(card).toHaveCount(0);
    await expect(page.getByTestId('satellite')).toBeVisible();
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

// A fold upright, a tablet held tall (ILI-1461): the mission bar on top, the map, ORION-3 docked
// under it with every satellite action, and the team and comms strips along the bottom. No tabs.
for (const [name, width, height] of [['fold upright', 884, 1104], ['tablet upright', 820, 1180], ['small fold upright', 750, 832]] as const) {
  test(`${name} (${width}×${height}): ORION-3 docked under the map, team and comms along the bottom`, async ({ page, isMobile }) => {
    test.skip(isMobile, 'sets its own viewport');
    await page.setViewportSize({ width, height });
    await start(page, '?debug');
    await running(page);
    await freeze(page);
    const hud = page.locator('.hud');
    await expect(hud).toHaveAttribute('data-tier', 'medium');
    await expect(hud).toHaveAttribute('data-layout', 'fold');
    await expect(page.locator('.dock-tabs')).toBeHidden();
    const bar = await box(page.getByTestId('mission-bar'));
    const map = await box(page.getByTestId('map-area'));
    const orion = await box(page.getByTestId('satellite'));
    const strip = await box(page.getByTestId('comms-strip'));
    const team = await box(page.getByTestId('team-panel'));
    expect(bar.width).toBeGreaterThan(width - 40); // across the top
    expect(orion.y).toBeGreaterThanOrEqual(map.y + map.height - 1); // under the map
    expect(orion.width).toBeGreaterThan(width - 40);
    expect(strip.y).toBeGreaterThanOrEqual(orion.y + orion.height - 1); // the bottom edge
    expect(Math.abs(team.y - strip.y)).toBeLessThan(2);
    for (const b of [bar, orion, strip, team]) expect(inside(b, width, height)).toBe(true);
    // The picture on the left, the buttons beside it.
    const pic = await box(page.getByTestId('satellite-inset'));
    const buttons = await box(page.getByTestId('orion-buttons'));
    expect(buttons.x).toBeGreaterThanOrEqual(pic.x + pic.width - 1);
    await expect(page.getByTestId('capture-scan')).toBeVisible();
    await expect(page.getByTestId('mission-bar').getByTestId('conditions')).toBeVisible(); // the weather under the bar (ILI-1473)
  });
}
