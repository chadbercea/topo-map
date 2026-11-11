import { expect, test } from '@playwright/test';
import { start } from './helpers';

test('panels leave a clear space between them (where a strike closes in)', async ({ page }) => {
  await start(page, '?debug');
  await page.waitForFunction(() => window.game);
  await page.evaluate(() => window.game.addEvent({ id: 'x', kind: 'contact', square: 'A1', title: 'Test' }));
  await expect.poll(() => page.evaluate(() => window.game.get().events.length)).toBe(1);
  await page.waitForTimeout(300); // let the map area refit
  const map = (await page.getByTestId('map-area').boundingBox())!;
  expect(map.width).toBeGreaterThan(200);
  expect(map.height).toBeGreaterThan(150);
  // The timer floats in the map's corner on purpose (ILI-1392); the rest stay clear.
  for (const id of ['team-panel', 'satcom']) {
    const p = await page.getByTestId(id).boundingBox();
    if (!p) continue; // on a phone the dock shows one of team and satcom at a time
    const overlaps = p.x < map.x + map.width && p.x + p.width > map.x && p.y < map.y + map.height && p.y + p.height > map.y;
    expect(overlaps, `${id} overlaps the map`).toBe(false);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
});

test('the team panel shows what the team is doing', async ({ page, isMobile }) => {
  await start(page);
  await expect(page.getByTestId('team-title')).toHaveText('ALPHA TEAM'); // ILI-1248
  await expect(page.getByTestId('team-panel')).toContainText(/Moving to F4|Holding · needs intel/); // it sets off on its own (ILI-1315)
  if (isMobile) return; // on a phone it's the TEAM tab of the sheet
  // Expanded by default; minimized, it's the strip of five heartbeats; never both (ILI-1439).
  const panel = page.getByTestId('team-panel');
  await expect(panel).toHaveAttribute('data-state', 'full');
  await expect(page.getByTestId('heartbeat-strip')).toHaveCount(0);
  await page.getByTestId('team-minimize').click();
  await expect(panel).toHaveAttribute('data-state', 'min'); // the same panel, folded
  await expect(panel.getByTestId('heartbeat-strip').locator('svg.ecg')).toHaveCount(5);
  await page.getByTestId('heartbeat-strip').click();
  await expect(panel).toHaveAttribute('data-state', 'full');
});

test('layout A: the map from the left edge with the timer and the comms log button in its corner, ENVIRONMENT over ORION-3 down the right, TEAM along the bottom (ILI-1226, ILI-1218, ILI-1392, ILI-1393)', async ({ page, isMobile }) => {
  await start(page);
  if (isMobile) {
    // One dock, three tabs: COMMS, ORION-3, TEAM; no INTEL (ILI-1225).
    await expect(page.getByTestId('tab-intel')).toHaveCount(0);
    for (const [tab, id] of [['satcom', 'satcom'], ['orion', 'satellite'], ['team', 'team-panel']] as const) {
      await page.getByTestId(`tab-${tab}`).click();
      await expect(page.getByTestId(id)).toBeVisible();
    }
    return;
  }
  await page.getByTestId('team-minimize').click(); // the strip, minimized (ILI-1439)
  const view = page.viewportSize()!;
  const box = async (id: string) => (await page.getByTestId(id).boundingBox())!;
  const timer = await box('timer');
  const logButton = await box('log-toggle');
  const orion = await box('satellite');
  const env = await box('conditions');
  const team = await box('team-panel'); // the team panel, minimized (ILI-1439)
  const map = await box('map-area');
  // No mission panel (ILI-1392) and COMMS a closed drawer (ILI-1393): the map runs from the left
  // edge; the timer is small in its top-left corner, the comms log's button under it.
  await expect(page.getByTestId('mission-strip')).toHaveCount(0);
  await expect(page.getByTestId('satcom')).toBeHidden();
  expect(map.x).toBeLessThan(40);
  expect(logButton.y).toBeGreaterThanOrEqual(timer.y + timer.height);
  expect(logButton.x - map.x).toBeLessThan(24);
  expect(timer.x - map.x).toBeLessThan(24);
  expect(timer.y - map.y).toBeLessThan(24);
  expect(timer.height).toBeLessThan(56);
  await expect(page.getByTestId('timer').getByTestId('clock')).toBeVisible();
  // ORION-3 down the right, right of the map.
  expect(orion.x).toBeGreaterThanOrEqual(map.x + map.width - 1);
  expect(orion.x + orion.width).toBeGreaterThan(view.width - 40);
  await expect(page.getByTestId('satellite-status')).toHaveText('ORION-3 over G5');
  // ENVIRONMENT is inside ORION-3, six tiles under the satellite and over the picture (ILI-1249).
  const sat = await box('orion-avatar');
  expect(env.x).toBeGreaterThanOrEqual(orion.x);
  expect(env.x + env.width).toBeLessThanOrEqual(orion.x + orion.width + 1);
  expect(env.y).toBeGreaterThanOrEqual(sat.y + sat.height - 1);
  await expect(page.getByTestId('satellite').getByTestId('conditions').locator('.env-tile')).toHaveCount(6);
  await expect(page.getByTestId('small-widgets')).toHaveCount(0);
  // Along the bottom: the heartbeat strip (ILI-1396), under the map. No ALPHA nav box (ILI-1395).
  await expect(page.getByTestId('call-box')).toHaveCount(0);
  expect(team.y).toBeGreaterThan(map.y + map.height - 1);
  expect(team.y + team.height).toBeGreaterThan(view.height - 40);
  expect(team.x).toBeLessThan(40);
  expect(team.x + team.width).toBeLessThanOrEqual(orion.x);
  await expect(page.getByTestId('resources')).toHaveCount(0); // no Logistics panel (ILI-1231)
});

test('no toolbox: the budget is a chip beside the clock, $10M less deployment, and strikes need no unlock (ILI-1405)', async ({ page }) => {
  await start(page, '?debug');
  await expect(page.getByTestId('toolbox-toggle')).toHaveCount(0);
  await expect(page.getByTestId('ability-bar')).toHaveCount(0);
  const chip = page.getByTestId('budget-chip');
  await expect(chip).toContainText('Budget');
  await expect(chip.getByTestId('balance')).toHaveText('$9.6M');
  // Measure once the HUD has powered on and the chips have stopped moving (ILI-1456: on CI's
  // slow renderer the power-on animation could still be scaling the clock).
  await expect(page.locator('.hud')).not.toHaveAttribute('data-boot', /.+/);
  // Measure both chips in the same frame (ILI-1456). Measured one after the other, the clock
  // could tick 10:00 → 9:59 in between, narrowing the timer and pulling the chip left of the old
  // box. Then wait until they've stopped moving.
  const boxes = () =>
    page.evaluate(() =>
      ['timer', 'budget-chip'].map((id) => {
        const r = document.querySelector(`[data-testid="${id}"]`)!.getBoundingClientRect();
        return { x: r.x, y: r.y, width: r.width };
      }),
    );
  const still = async () => {
    const before = JSON.stringify(await boxes());
    await page.waitForTimeout(150);
    return before === JSON.stringify(await boxes());
  };
  await expect.poll(still, { timeout: 10_000 }).toBe(true);
  const [t, b] = await boxes();
  expect(b.x).toBeGreaterThanOrEqual(t.x + t.width - 0.5); // beside it, on its row
  expect(Math.abs(b.y - t.y)).toBeLessThan(4);
  expect(await page.evaluate(() => Object.values(window.game.get().ordnance).every((o) => o.unlocked))).toBe(true);
});

test('one spacing rule: a 16 px margin and gutter everywhere, and every panel title on one line (ILI-1353)', async ({ page, isMobile }) => {
  test.skip(isMobile, 'a phone stacks a sheet; this is the wide layout');
  await start(page);
  await page.getByTestId('team-minimize').click(); // the strip, minimized (ILI-1439)
  await page.waitForTimeout(500);
  const view = page.viewportSize()!;
  const box = async (id: string) => (await page.getByTestId(id).boundingBox())!;
  const [orion, team, map] = await Promise.all(['satellite', 'team-panel', 'map-area'].map(box));
  await expect(page.getByTestId('intel-panel')).toHaveCount(0); // intel lands on the squares (ILI-1399)
  const near = (a: number, b: number) => expect(Math.abs(a - b)).toBeLessThanOrEqual(1);
  // The margin round the screen.
  near(map.x, 16); near(map.y, 16); near(orion.y, 16); // no mission panel (ILI-1392), COMMS a drawer (ILI-1393): the map takes the corner
  near(view.width - (orion.x + orion.width), 16); near(view.height - (orion.y + orion.height), 16); near(view.height - (team.y + team.height), 16);
  // The gutter, down and across.
  near(team.y - (map.y + map.height), 16);
  near(team.x, 16);
  near(orion.x - (map.x + map.width), 16);
  // Every panel's title the same distance in from its top edge.
  const inset = await page.evaluate(() =>
    ['satellite'].map((id) => {
      const p = document.querySelector(`[data-testid=${id}]`)!;
      const h = p.querySelector('h2')!;
      const pad = parseFloat(getComputedStyle(h).paddingTop);
      return Math.round(h.getBoundingClientRect().top + pad - p.getBoundingClientRect().top);
    }),
  );
  expect(new Set(inset).size, `title insets ${inset}`).toBe(1);
});
