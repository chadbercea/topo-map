import { expect, test } from '@playwright/test';

test('the team moves along its route on its own and stops when paused', async ({ page }) => {
  await page.goto('?debug');
  const team = page.getByTestId('team');
  await expect(team).toHaveText(/Moving to F4/);
  const where = async () => [Number(await team.getAttribute('data-x')), Number(await team.getAttribute('data-y'))];
  const start = await where();
  await expect.poll(where, { timeout: 15_000 }).not.toEqual(start);

  await page.keyboard.press('Escape');
  const paused = await where();
  await page.waitForTimeout(800);
  expect(await where()).toEqual(paused);
});
