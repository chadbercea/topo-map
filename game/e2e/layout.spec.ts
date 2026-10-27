import { expect, test } from '@playwright/test';
import { start } from './helpers';

test('panels leave a clear space between them (where a strike closes in)', async ({ page }) => {
  await start(page, '?debug');
  await page.waitForFunction(() => window.game);
  await page.evaluate(() => window.game.addEvent({ id: 'x', kind: 'contact', square: 'A1', title: 'Test' }));
  await expect(page.getByTestId('new-event')).toBeVisible();
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

test('the war room: intel down the left, the team bottom right, satcom right of it', async ({ page, isMobile }) => {
  await start(page);
  if (isMobile) {
    // One dock, three tabs.
    for (const [tab, id] of [['intel', 'intel-stream'], ['team', 'team-panel'], ['satcom', 'satcom']] as const) {
      await page.getByTestId(`tab-${tab}`).click();
      await expect(page.getByTestId(id)).toBeVisible();
    }
    return;
  }
  const view = page.viewportSize()!;
  const stream = (await page.getByTestId('intel-stream').boundingBox())!;
  const team = (await page.getByTestId('team-panel').boundingBox())!;
  const satcom = (await page.getByTestId('satcom').boundingBox())!;
  expect(stream.x).toBeLessThan(40);
  expect(stream.height).toBeGreaterThan(view.height * 0.6);
  expect(team.x).toBeGreaterThan(view.width * 0.4);
  expect(satcom.x + satcom.width).toBeGreaterThan(view.width - 40);
  expect(satcom.x).toBeGreaterThan(team.x + team.width - 1);
  expect(satcom.y + satcom.height).toBeGreaterThan(view.height - 40);
  expect(team.y + team.height).toBeGreaterThan(view.height - 40);
});
