import { expect, test } from '@playwright/test';

// The design system (ILI-1324): served at /game/design/, every section there, no errors.
test('the design system page loads every section without errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/game/design/');
  await expect(page.locator('.ds-head h1')).toHaveText('PMC WAR ROOM');
  for (const id of ['foundations', 'motion', 'controls', 'map', 'wireframes', 'voice', 'patterns']) await expect(page.locator(`#${id}`)).toBeAttached();
  await expect(page.locator('#motion .feed-rack')).toBeVisible(); // the ORION-3 rack, saved from the title (ILI-1323)
  expect(errors).toEqual([]);
});
