import { expect, test } from '@playwright/test';
import { start } from './helpers';

test('walking blind into the hidden checkpoint is an ambush, and an ambush kills: the team goes down one by one and the mission is lost (ILI-1453)', async ({ page }) => {
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

  // Two seconds in: one down, called on the radio, and the rest still standing.
  await page.evaluate(() => {
    for (let i = 0; i < 20; i++) window.game.tick(100);
  });
  const two = await page.evaluate(() => window.game.get());
  expect(two.team.operators.filter((o) => o.health <= 0)).toHaveLength(1);
  expect(two.comms.messages.some((m) => /is down! 4 left\.$/.test(m.text))).toBe(true);

  // Faster than anything HQ can send: within about 6 s nobody is left, and the mission is over.
  await page.evaluate(() => {
    for (let i = 0; i < 50 && window.game.get().phase !== 'ended'; i++) window.game.tick(100);
  });
  const end = await page.evaluate(() => window.game.get());
  expect(end.team.operators.every((o) => o.health <= 0)).toBe(true);
  expect(end.phase).toBe('ended');
  expect(end.comms.messages.at(-1)?.text).toBe('ALPHA is not responding.');
  await expect(page.getByText('ALPHA walked into E3 without a look. No survivors.')).toBeVisible();
});
