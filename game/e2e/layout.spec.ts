import { expect, test } from '@playwright/test';
import { start } from './helpers';

test('panels leave a clear space between them (where a strike closes in)', async ({ page }) => {
  await start(page, '?debug');
  await page.waitForFunction(() => window.game);
  await page.evaluate(() => window.game.addEvent({ id: 'x', kind: 'contact', square: 'A1', title: 'Test' }));
  await expect(page.getByTestId('alerts')).toBeVisible();
  await page.waitForTimeout(300); // let the map area refit
  const map = (await page.getByTestId('map-area').boundingBox())!;
  expect(map.width).toBeGreaterThan(200);
  expect(map.height).toBeGreaterThan(150);
  for (const id of ['mission-timer', 'team-panel', 'alerts']) {
    const p = (await page.getByTestId(id).boundingBox())!;
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

test('panels hug the edges: each covers at most half a grid square, so every centre shows', async ({ page }) => {
  await start(page, '?debug');
  await page.waitForFunction(() => window.game?.get().team.holdFor); // ALPHA's first call is up
  await expect(page.getByTestId('comms')).toBeVisible();
  await page.waitForTimeout(300); // let the layout settle
  const half = await page.evaluate(() => (100 * window.mapCamera().zoom) / window.mapCamera().dpr); // CSS px
  const height = page.viewportSize()!.height;
  for (const id of ['mission-timer', 'team-panel']) {
    const b = (await page.getByTestId(id).boundingBox())!;
    expect(b.y + b.height, `${id} bottom`).toBeLessThanOrEqual(half);
  }
  const call = (await page.getByTestId('comms').boundingBox())!;
  expect(call.y, 'call card top').toBeGreaterThanOrEqual(height - half);
});
