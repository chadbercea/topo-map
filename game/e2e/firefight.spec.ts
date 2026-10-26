import { expect, test } from '@playwright/test';
import { fastForward } from './helpers';

test('pushing through a contact leads to a firefight the readout shows, then the medic patches them up', async ({ page }) => {
  await page.goto('?debug');
  await page.waitForFunction(() => window.game);
  await fastForward(page, 15_000);
  await page.getByTestId('responses').getByRole('button', { name: 'Push through' }).click();

  // Walk on until contact.
  await page.evaluate(() => {
    for (let i = 0; i < 1200 && !window.game.get().team.fight; i++) window.game.tick(100);
  });
  const panel = page.getByTestId('team-panel');
  await expect(panel).toContainText('Engaged in E3');
  await expect(page.getByTestId('comms-text')).toHaveText('Contact! Engaging in E3.');
  await fastForward(page, 2_000);
  // Ammo and health draining: Mode B (on a phone the open comms window covers the readout).
  await expect(page.getByTestId('readout')).toBeAttached();

  // Fight, then the medic's rounds, until the team reports in.
  await page.evaluate(() => {
    const done = () => window.game.get().comms.messages.some((m) => m.text === 'Patched up. Moving.');
    for (let i = 0; i < 2400 && !done(); i++) window.game.tick(100);
  });
  const radio = await page.evaluate(() => window.game.get().comms.messages.map((m) => m.text));
  expect(radio.some((t) => /^E3 clear\./.test(t))).toBe(true);
  expect(radio).toContain('Patched up. Moving.');
});
