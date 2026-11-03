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
  await expect(page.getByTestId('team-panel')).toContainText(/Moving to F4|Holding · needs intel/); // it sets off on its own (ILI-1315)
});

test('layout A: mission and COMMS down the left, ENVIRONMENT over ORION-3 down the right, TEAM along the bottom (ILI-1226, ILI-1218)', async ({ page, isMobile }) => {
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
  // Along the bottom: ALPHA's box at the left, then TEAM's table (ILI-1313), under COMMS and the map.
  const alpha = await box('call-box');
  expect(team.y).toBeGreaterThan(comms.y + comms.height - 1);
  expect(team.y + team.height).toBeGreaterThan(view.height - 40);
  expect(alpha.x).toBeLessThan(40);
  expect(team.x).toBeGreaterThanOrEqual(alpha.x + alpha.width - 1);
  expect(team.x + team.width).toBeLessThanOrEqual(orion.x);
  await expect(page.getByTestId('resources')).toHaveCount(0); // no Logistics panel (ILI-1231)
});
