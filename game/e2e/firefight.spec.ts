import { expect, test } from '@playwright/test';
import { start } from './helpers';

test('walking blind into the hidden checkpoint is an ambush; the team panel goes red and the medic patches them up', async ({ page }) => {
  await start(page, '?debug');
  await page.waitForFunction(() => window.game);

  // HQ scans nothing: ALPHA walks on through unimaged ground (ILI-1315) until it runs into something.
  await page.evaluate(() => {
    const g = window.game;
    for (let i = 0; i < 3000 && !g.get().team.fight; i++) g.tick(100);
  });
  const panel = page.getByTestId('team-panel');
  await expect(panel).toContainText('Engaged in E3');
  const log = await page.evaluate(() => window.game.get().comms.messages.map((m) => m.text));
  expect(log).toContain('Ambush in E3! Returning fire.');
  await expect(panel).toHaveAttribute('data-fight', 'true'); // the team panel goes red
  await expect(page.getByTestId('comms-feed')).toContainText('Ambush in E3');

  await page.evaluate(() => {
    const done = () => window.game.get().comms.messages.some((m) => m.text === 'Patched up. Moving.');
    for (let i = 0; i < 2400 && !done(); i++) window.game.tick(100);
  });
  const radio = await page.evaluate(() => window.game.get().comms.messages.map((m) => m.text));
  expect(radio.some((t) => /^E3 clear\./.test(t))).toBe(true);
  expect(radio).toContain('Patched up. Moving.');
});
