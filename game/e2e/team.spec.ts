import { expect, test } from '@playwright/test';
import { start, linked } from './helpers';

test('the team moves along its route on its own and stops when paused', async ({ page }) => {
  await start(page, '?debug');
  await page.waitForFunction(() => window.game?.get().team.holdFor);
  // ALPHA opens by asking for imagery of F4; wave it through.
  await page.evaluate(() => window.game.respond(window.game.get().team.holdFor!, 'blind'));
  await linked(page);
  const team = page.getByTestId('team');
  await expect(team).toHaveText(/Moving to F4/);
  const where = async () => [Number(await team.getAttribute('data-x')), Number(await team.getAttribute('data-y'))];
  const from = await where();
  await expect.poll(where, { timeout: 15_000 }).not.toEqual(from);

  await page.keyboard.press('Escape');
  const paused = await where();
  await page.waitForTimeout(800);
  expect(await where()).toEqual(paused);
});
