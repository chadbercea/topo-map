import { expect, test } from '@playwright/test';
import { freeze, start } from './helpers';

test('the objective leads ALPHA from the crash site to exfil, and the mission completes', async ({ page }) => {
  await start(page, '?debug');
  await page.waitForFunction(() => window.game);
  await freeze(page);
  await expect(page.getByTestId('objective')).toContainText('Recover the black box at D3');

  // Clear ground the whole way, so nothing stops the walk.
  await page.evaluate(() => {
    const s = window.game.get();
    window.game.set({ ...s, contacts: [], schedule: [], map: { ...s.map, scanned: [...s.team.route] } });
  });
  await page.evaluate(() => {
    for (let i = 0; i < 6000 && window.game.get().mission.phase !== 'exfil'; i++) window.game.tick(100);
  });
  await expect(page.getByTestId('objective')).toContainText('Exfil at B1 with the black box');
  await page.evaluate(() => {
    for (let i = 0; i < 6000 && window.game.get().phase !== 'ended'; i++) window.game.tick(100);
  });
  const wrap = page.getByTestId('wrapup');
  await expect(wrap).toHaveAttribute('data-outcome', 'win');
  await expect(wrap).toContainText('MISSION SUCCESS');
  await expect(wrap).toContainText('Black box recovered. Everyone came home.');
  await expect(page.getByTestId('budget')).toHaveText('$20,000');
  await wrap.getByRole('button', { name: 'Play again' }).click();
  await expect(wrap).toHaveCount(0);
  await expect(page.getByTestId('clock')).toHaveText('06:00');
});

test('running out of time fails the mission; the wrap-up offers a retry', async ({ page }) => {
  await start(page, '?debug');
  await page.waitForFunction(() => window.game);
  await page.evaluate(() => {
    const s = window.game.get();
    window.game.set({ ...s, timer: { remainingMs: 500, totalMs: 360_000 } });
    for (let i = 0; i < 10; i++) window.game.tick(100);
  });
  const wrap = page.getByTestId('wrapup');
  await expect(wrap).toHaveAttribute('data-outcome', 'failed');
  await expect(wrap).toContainText('Time ran out before exfil.');
  await expect(wrap.getByRole('button', { name: 'Retry mission' })).toBeVisible();
});
