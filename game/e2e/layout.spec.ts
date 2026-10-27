import { expect, test } from '@playwright/test';
import { start } from './helpers';

test('panels leave a clear space between them (where a strike closes in)', async ({ page }) => {
  await start(page, '?debug');
  await page.waitForFunction(() => window.game);
  await page.evaluate(() => window.game.addEvent({ id: 'x', kind: 'contact', square: 'A1', title: 'Test' }));
  await expect(page.getByTestId('new-event')).toHaveCount(1); // inline in the stream (a phone's dock may be on another tab)
  await page.waitForTimeout(300); // let the map area refit
  const map = (await page.getByTestId('map-area').boundingBox())!;
  expect(map.width).toBeGreaterThan(200);
  expect(map.height).toBeGreaterThan(150);
  for (const id of ['mission-timer', 'team-panel', 'satcom', 'intel-stream']) {
    const p = await page.getByTestId(id).boundingBox();
    if (!p) continue; // on a phone the dock shows one of stream, team and satcom at a time
    const overlaps = p.x < map.x + map.width && p.x + p.width > map.x && p.y < map.y + map.height && p.y + p.height > map.y;
    expect(overlaps, `${id} overlaps the map`).toBe(false);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
});

test('the team panel shows what the team is doing', async ({ page }) => {
  await start(page);
  await expect(page.getByTestId('team-panel')).toContainText('ALPHA');
  await expect(page.getByTestId('team-panel')).toContainText(/Holding short of F4|Holding for HQ/); // first call: imagery for F4
});

test('the war room: intel then comms down the left, the team bottom right, ORION-3 a line in the header', async ({ page, isMobile }) => {
  await start(page);
  if (isMobile) {
    // One dock, three tabs.
    await expect(page.getByTestId('tab-orion')).toHaveCount(0);
    for (const [tab, id] of [['intel', 'intel-stream'], ['satcom', 'satcom'], ['team', 'team-panel']] as const) {
      await page.getByTestId(`tab-${tab}`).click();
      await expect(page.getByTestId(id)).toBeVisible();
    }
    return;
  }
  const view = page.viewportSize()!;
  const stream = (await page.getByTestId('intel-stream').boundingBox())!;
  const comms = (await page.getByTestId('satcom').boundingBox())!;
  const team = (await page.getByTestId('team-panel').boundingBox())!;
  expect(stream.x).toBeLessThan(40);
  expect(comms.x).toBeLessThan(40);
  expect(comms.y).toBeGreaterThan(stream.y + stream.height - 1); // under the stream
  expect(team.x).toBeGreaterThan(view.width * 0.4);
  expect(team.x + team.width).toBeGreaterThan(view.width - 40);
  expect(team.y + team.height).toBeGreaterThan(view.height - 40);
  // ORION-3 has no panel: its status is a line in the header.
  await expect(page.getByTestId('mission-timer').getByTestId('satellite-status')).toHaveText('ORION-3 over G5');
});
