import { expect, test } from '@playwright/test';

test('walking blind into the hidden technicals is an ambush; the readout shows it and the medic patches them up', async ({ page }) => {
  await page.goto('?debug');
  await page.waitForFunction(() => window.game);

  // HQ waves ALPHA through every unimaged square until it runs into something.
  await page.evaluate(() => {
    const g = window.game;
    for (let i = 0; i < 3000 && !g.get().team.fight; i++) {
      g.tick(100);
      const hold = g.get().team.holdFor;
      const call = g.get().comms.messages.find((m) => m.id === hold && m.status === 'new');
      if (call?.node === 'unimaged') g.respond(call.id, 'blind');
    }
  });
  const panel = page.getByTestId('team-panel');
  await expect(panel).toContainText('Engaged in E3');
  await expect(page.getByTestId('comms-text')).toHaveText('Ambush in E3! Returning fire.');
  await expect(page.getByTestId('readout')).toBeAttached();

  await page.evaluate(() => {
    const done = () => window.game.get().comms.messages.some((m) => m.text === 'Patched up. Moving.');
    for (let i = 0; i < 2400 && !done(); i++) window.game.tick(100);
  });
  const radio = await page.evaluate(() => window.game.get().comms.messages.map((m) => m.text));
  expect(radio.some((t) => /^E3 clear\./.test(t))).toBe(true);
  expect(radio).toContain('Patched up. Moving.');
});
