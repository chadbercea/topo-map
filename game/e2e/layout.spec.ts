import { expect, test } from '@playwright/test';

test('panels sit around the map, never on it', async ({ page }) => {
  await page.goto('');
  const map = (await page.getByTestId('map-area').boundingBox())!;
  expect(map.width).toBeGreaterThan(200);
  expect(map.height).toBeGreaterThan(150);
  for (const id of ['intel-panel', 'mission-timer', 'team-panel']) {
    const p = (await page.getByTestId(id).boundingBox())!;
    const overlaps = p.x < map.x + map.width && p.x + p.width > map.x && p.y < map.y + map.height && p.y + p.height > map.y;
    expect(overlaps, `${id} overlaps the map`).toBe(false);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
});

test('the team panel shows what the team is doing', async ({ page }) => {
  await page.goto('');
  await expect(page.getByTestId('team-panel')).toContainText('ALPHA');
  await expect(page.getByTestId('team-panel')).toContainText('Moving to F4');
});

test('intel collapses into the top bar on a phone and opens on tap', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'phone layout only');
  await page.goto('');
  const panel = page.getByTestId('intel-panel');
  await expect(panel.getByText('Imagery')).toBeHidden();
  await panel.getByRole('button').tap();
  await expect(panel.getByText('Imagery')).toBeVisible();
});
