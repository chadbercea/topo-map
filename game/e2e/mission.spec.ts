import { expect, test } from '@playwright/test';

test('the objective leads ALPHA from the crash site to exfil, and the mission completes', async ({ page }) => {
  await page.goto('?debug');
  await page.waitForFunction(() => window.game);
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
  await expect(page.getByTestId('pause-menu')).toContainText('MISSION COMPLETE');
});
