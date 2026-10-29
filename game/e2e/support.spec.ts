import { expect, test } from '@playwright/test';
import { fastForward, freeze, start, openAsk, linked } from './helpers';

test('running low, ALPHA asks for a resupply; the bird flies in and refills them', async ({ page }) => {
  await start(page, '?debug');
  await page.waitForFunction(() => window.game);
  await freeze(page); // mission time moves only by tick: a slow renderer can't run the bird in early
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
  await linked(page);
  // No Logistics panel (ILI-1231): the bird and the bill are in the game's state.
  await expect.poll(() => page.evaluate(() => window.game.get().inbound.length)).toBe(1);
  expect(await page.evaluate(() => window.game.get().resources.budget)).toBe(2_000);
  await fastForward(page, 20_500);
  await expect.poll(() => page.evaluate(() => window.game.get().inbound.length)).toBe(0);
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
  await linked(page);
  await expect.poll(() => page.evaluate(() => window.game.get().inbound.length)).toBe(1);
  await fastForward(page, 20_500);
  // Replacements are standing: no one down (each row shows its own status, ILI-1223).
  await expect(page.getByTestId('readout').locator('li[data-condition="down"]')).toHaveCount(0);
});
