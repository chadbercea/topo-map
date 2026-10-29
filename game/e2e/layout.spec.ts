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

test('the war room: COMMS down the left, the team bottom right, ORION-3 a line in the header (ILI-1225)', async ({ page, isMobile }) => {
  await start(page);
  if (isMobile) {
    // One dock, two tabs: no INTEL (ILI-1225).
    await expect(page.getByTestId('tab-intel')).toHaveCount(0);
    for (const [tab, id] of [['satcom', 'satcom'], ['team', 'team-panel']] as const) {
      await page.getByTestId(`tab-${tab}`).click();
      await expect(page.getByTestId(id)).toBeVisible();
    }
    return;
  }
  const view = page.viewportSize()!;
  await expect(page.getByTestId('intel-stream')).toHaveCount(0);
  const comms = (await page.getByTestId('satcom').boundingBox())!;
  const team = (await page.getByTestId('team-panel').boundingBox())!;
  expect(comms.x).toBeLessThan(40);
  expect(comms.y).toBeLessThan(40); // the full left side
  expect(comms.y + comms.height).toBeGreaterThan(view.height - 40);
  expect(team.x).toBeGreaterThan(view.width * 0.4);
  expect(team.x + team.width).toBeGreaterThan(view.width - 40);
  expect(team.y + team.height).toBeGreaterThan(view.height - 40);
  // ORION-3 has no panel: its status is a line in the header.
  await expect(page.getByTestId('mission-timer').getByTestId('satellite-status')).toHaveText('ORION-3 over G5');
});
