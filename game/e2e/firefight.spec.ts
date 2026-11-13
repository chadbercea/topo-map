import { expect, test } from '@playwright/test';
import { start } from './helpers';

test('walking blind into the hidden checkpoint is an ambush: their first volley drops a man, and it costs the team, but ALPHA comes out of it (ILI-1496)', async ({ page }) => {
  await start(page, '?debug');
  await page.waitForFunction(() => window.game);

  // HQ scans nothing: ALPHA walks on through unimaged ground (ILI-1315) until it runs into something.
  await page.evaluate(() => {
    const g = window.game;
    for (let i = 0; i < 3000 && !g.get().team.fight; i++) g.tick(100);
  });
  const panel = page.getByTestId('team-panel');
  await expect(panel).toContainText('Ambushed in E3');
  await expect(panel).toHaveAttribute('data-fight', 'true'); // the team panel goes red
  await expect(page.getByTestId('comms-feed')).toContainText('Ambush in E3');

  // The opening seconds: their volley is aimed, on one man, and ALPHA is getting into cover.
  await page.evaluate(() => {
    for (let i = 0; i < 25; i++) window.game.tick(100);
  });
  const early = await page.evaluate(() => window.game.get());
  expect(early.team.operators.filter((o) => o.health <= 0)).toHaveLength(1); // the first man it hit is down
  expect(early.team.operators.filter((o) => o.health > 0 && o.health < 100).length).toBeLessThanOrEqual(1); // and it's on the next

  // It fights its way out: men lost, shown on the team's instruments, but the mission goes on.
  await page.evaluate(() => {
    for (let i = 0; i < 900 && window.game.get().team.fight; i++) window.game.tick(100);
  });
  const end = await page.evaluate(() => window.game.get());
  expect(end.team.fight).toBeNull();
  expect(end.stats.lost.length).toBeGreaterThan(0);
  expect(end.team.operators.some((o) => o.health > 0)).toBe(true);
  expect(end.phase).toBe('running');
  await expect(panel).not.toHaveAttribute('data-fight', 'true');
});
