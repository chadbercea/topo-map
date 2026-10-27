import { expect, test } from '@playwright/test';
import { start } from './helpers';

test('panels sit around the map, never on it', async ({ page }) => {
  await start(page, '?debug');
  await page.waitForFunction(() => window.game);
  await page.evaluate(() => window.game.addEvent({ id: 'x', kind: 'contact', square: 'A1', title: 'Test' }));
  await expect(page.getByTestId('alerts')).toBeVisible();
  await page.waitForTimeout(300); // let the map area refit
  const map = (await page.getByTestId('map-area').boundingBox())!;
  expect(map.width).toBeGreaterThan(200);
  expect(map.height).toBeGreaterThan(150);
  for (const id of ['intel-panel', 'mission-timer', 'team-panel', 'map-views', 'alerts']) {
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

test('intel is a tab that opens its drawer on tap', async ({ page }) => {
  await start(page);
  const panel = page.getByTestId('intel-panel');
  await expect(panel.getByText('Imagery')).toBeHidden();
  await panel.getByRole('button').click();
  await expect(panel.getByText('Imagery')).toBeVisible();
});
