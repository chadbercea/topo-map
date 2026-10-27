import { expect, test } from '@playwright/test';
import { fastForward, start, openAsk } from './helpers';

test('running low, ALPHA asks for a resupply; the bird flies in and refills them', async ({ page }) => {
  await start(page, '?debug');
  await page.waitForFunction(() => window.game);
  await page.evaluate(() => {
    const s = window.game.get();
    const operators = s.team.operators.map((o) => ({ ...o, ammo: 10 }));
    // Clear ground and money in the bank, so the only call is the resupply request.
    window.game.set({
      ...s,
      contacts: [],
      schedule: [],
      map: { ...s.map, scanned: [...s.team.route] },
      resources: { ...s.resources, budget: 6_000 },
      comms: { ...s.comms, messages: [] },
      team: { ...s.team, operators, holdFor: null },
    });
  });
  await fastForward(page, 300);
  await openAsk(page);
  await expect(page.getByTestId('comms-text')).toHaveText('Running low on ammo. We need a resupply bird.');
  await page.getByTestId('responses').getByRole('button', { name: /Send resupply/ }).click();
  await expect(page.getByTestId('inbound-resupply')).toContainText('resupply bird inbound');
  await expect(page.getByTestId('resources')).toContainText('$2,000');
  await fastForward(page, 20_500);
  await expect(page.getByTestId('inbound-resupply')).toHaveCount(0);
  const ammo = await page.evaluate(() => window.game.get().team.operators.every((o) => o.ammo > 100));
  expect(ammo).toBe(true);
});

test('combat ineffective: ALPHA asks for a resupply bird, and replacements arrive', async ({ page }) => {
  await start(page, '?debug');
  await page.waitForFunction(() => window.game);
  await page.evaluate(() => {
    const s = window.game.get();
    const operators = s.team.operators.map((o, i) => (i < 2 ? { ...o, health: 0 } : o));
    window.game.set({
      ...s,
      contacts: [],
      schedule: [],
      map: { ...s.map, scanned: [...s.team.route] },
      resources: { ...s.resources, budget: 9_000 },
      comms: { ...s.comms, messages: [] },
      team: { ...s.team, operators, holdFor: null },
    });
  });
  await fastForward(page, 300);
  await openAsk(page);
  await expect(page.getByTestId('comms-text')).toHaveText('Combat ineffective, 2 down. We need a resupply bird.');
  await page.getByTestId('responses').getByRole('button', { name: /Send resupply/ }).click();
  await expect(page.getByTestId('inbound-resupply')).toContainText('resupply bird inbound');
  await fastForward(page, 20_500);
  await expect(page.getByTestId('team-panel')).toContainText('5/5 fit');
});
