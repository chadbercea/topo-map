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
  await expect(page.getByTestId('team-title')).toHaveText('TEAM'); // not the callsign (ILI-1223)
  await expect(page.getByTestId('team-panel')).toContainText(/Holding short of F4|Holding for HQ/); // first call: imagery for F4
});

test('layout A: mission and COMMS down the left, ORION-3 down the right, small widgets and TEAM along the bottom (ILI-1226)', async ({ page, isMobile }) => {
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
  const small = await box('small-widgets');
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
  // Along the bottom: the small widgets, then TEAM, under COMMS and the map.
  for (const b of [small, team]) {
    expect(b.y).toBeGreaterThan(comms.y + comms.height - 1);
    expect(b.y + b.height).toBeGreaterThan(view.height - 40);
  }
  expect(small.x).toBeLessThan(40);
  expect(team.x).toBeGreaterThan(small.x + small.width - 1);
  expect(team.x + team.width).toBeLessThanOrEqual(orion.x);
  await expect(page.getByTestId('weather')).toBeVisible();
  await expect(page.getByTestId('resources')).toContainText('Budget');
});
