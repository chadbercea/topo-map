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
  // The status widget floats in the map's corner on purpose (ILI-1216); the rest stay clear.
  for (const id of ['mission-strip', 'team-panel', 'satcom']) {
    const p = await page.getByTestId(id).boundingBox();
    if (!p) continue; // on a phone the dock shows one of team and satcom at a time
    const overlaps = p.x < map.x + map.width && p.x + p.width > map.x && p.y < map.y + map.height && p.y + p.height > map.y;
    expect(overlaps, `${id} overlaps the map`).toBe(false);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
});

test('the team panel shows what the team is doing', async ({ page }) => {
  await start(page);
  await expect(page.getByTestId('team-title')).toHaveText('ALPHA TEAM'); // ILI-1248
  await expect(page.getByTestId('call-state')).toHaveText(/Moving to F4|Holding · needs intel/); // it sets off on its own (ILI-1315); said once, in ALPHA's box (ILI-1351)
});

test('layout D: mission and COMMS down the left, ORION-3 docked small on the map’s corner, the weather and TEAM along the bottom (ILI-1226, ILI-1350)', async ({ page, isMobile }) => {
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
  const view = page.viewportSize()!;
  const box = async (id: string) => (await page.getByTestId(id).boundingBox())!;
  const mission = await box('mission-strip');
  const comms = await box('satcom');
  const orion = await box('satellite');
  const env = await box('conditions');
  const team = await box('team-panel');
  const map = await box('map-area');
  // Top left the mission, the clock in it; COMMS under it.
  expect(mission.x).toBeLessThan(40);
  expect(mission.y).toBeLessThan(40);
  await expect(page.getByTestId('mission-strip').getByTestId('clock')).toBeVisible();
  expect(comms.x).toBeLessThan(40);
  expect(comms.y).toBeGreaterThan(mission.y + mission.height - 1);
  // The map runs to the right edge; ORION-3 sits small over its top-right corner, at rest: the
  // stepper, no picture (ILI-1350).
  expect(map.x + map.width).toBeGreaterThan(view.width - 40);
  expect(orion.x).toBeGreaterThan(map.x);
  expect(orion.x + orion.width).toBeGreaterThan(view.width - 40);
  expect(orion.y).toBeLessThan(80);
  expect(orion.width).toBeLessThanOrEqual(320);
  expect(orion.height).toBeLessThan(map.height / 2);
  await expect(page.getByTestId('satellite')).not.toHaveAttribute('data-lift');
  await expect(page.getByTestId('orion-steps')).toBeVisible();
  await expect(page.getByTestId('satellite-inset')).toHaveCount(0);
  await expect(page.getByTestId('satellite-status')).toHaveText('ORION-3 over G5');
  // The weather is the slim line along the bottom (ILI-1218), over TEAM.
  await expect(page.getByTestId('small-widgets').getByTestId('conditions')).toBeVisible();
  expect(env.y).toBeGreaterThan(comms.y + comms.height - 1);
  // Along the bottom: ALPHA's box at the left, then TEAM's table (ILI-1313), under COMMS and the map.
  const alpha = await box('call-box');
  expect(team.y).toBeGreaterThan(comms.y + comms.height - 1);
  expect(team.y + team.height).toBeGreaterThan(view.height - 40);
  expect(alpha.x).toBeLessThan(40);
  expect(team.x).toBeGreaterThanOrEqual(alpha.x + alpha.width - 1);
  await expect(page.getByTestId('resources')).toHaveCount(0); // no Logistics panel (ILI-1231)
});

test('ORION-3 lifts while it scans, and settles back after the shot is graded (ILI-1350)', async ({ page, isMobile }) => {
  test.skip(isMobile, 'on a phone ORION-3 is a tab in the sheet, which rises on its own');
  await start(page, '?debug');
  await page.waitForFunction(() => window.game);
  await page.evaluate(() => {
    window.frozen = true;
  });
  const sat = page.getByTestId('satellite');
  const rest = (await sat.boundingBox())!;
  await page.evaluate(() => window.game.lookAt('E3'));
  await expect(sat).toHaveAttribute('data-lift', 'true');
  await expect(page.getByTestId('orion-steps').locator('[aria-current="step"]')).toHaveText('Move');
  await page.evaluate(() => {
    const g = window.game;
    for (let i = 0; i < 300 && g.get().satellite.state === 'slewing'; i++) g.tick(100);
  });
  await expect(page.getByTestId('orion-steps').locator('[aria-current="step"]')).toHaveText('On station');
  await expect(page.getByTestId('capture-photo')).toBeVisible();
  expect((await sat.boundingBox())!.width).toBeGreaterThan(rest.width);
  await page.evaluate(() => {
    window.game.capture('photo');
    window.game.tick(1000);
  });
  await expect(page.getByTestId('orion-steps').locator('[aria-current="step"]')).toHaveText('Graded');
  await expect(sat).toHaveAttribute('data-lift', 'true'); // a moment to see what it got
  await page.evaluate(() => {
    for (let t = 0; t < 6000; t += 100) window.game.tick(100);
  });
  await expect(sat).not.toHaveAttribute('data-lift');
  await expect(sat).toContainText('E3 ·');
  await page.getByTestId('orion-open').click(); // HQ can open it by hand
  await expect(sat).toHaveAttribute('data-lift', 'true');
  await page.getByTestId('orion-settle').click();
  await expect(sat).not.toHaveAttribute('data-lift');
});
