import { expect, test } from '@playwright/test';
import { fastForward, freeze, start, untilOnStation } from './helpers';

test('ALPHA holds short of unimaged ground and asks; Push through sends it on blind', async ({ page, isMobile }) => {
  await start(page, '?debug');
  await page.waitForFunction(() => window.game);
  await fastForward(page, 500);

  const panel = page.getByTestId('team-panel');
  await expect(page.getByTestId('comms')).toContainText('ALPHA · NEEDS A DECISION');
  await expect(page.getByTestId('call-deadline')).toHaveCount(0); // ALPHA waits: no countdown
  await expect(page.getByTestId('comms-text')).toHaveText(/Holding short of F4\. No imagery/);

  const push = page.getByTestId('responses').getByRole('button', { name: 'Push through' });
  if (isMobile) await push.tap();
  else await push.click();
  await fastForward(page, 1_000);
  await expect(panel).toContainText('Moving to F4');
});

test('comms can be minimized to a badge and reopened', async ({ page }) => {
  await start(page, '?debug');
  await page.waitForFunction(() => window.game);
  await fastForward(page, 500);
  await page.getByRole('button', { name: 'Minimize comms' }).click();
  await expect(page.getByTestId('comms')).toHaveCount(0);
  await expect(page.getByTestId('comms-badge')).toContainText('ALPHA needs a decision');
  await page.getByTestId('comms-badge').click();
  await expect(page.getByTestId('comms-text')).toHaveText(/Holding short of F4/);
});

test('Send imagery: a look at E3 finds the checkpoint and ALPHA asks to observe, attack or go around', async ({ page }) => {
  await start(page, '?debug');
  await page.waitForFunction(() => window.game);
  await freeze(page);
  await fastForward(page, 500);
  await page.getByTestId('responses').getByRole('button', { name: 'Send imagery' }).click();
  await untilOnStation(page);
  await page.getByTestId('capture-photo').click(); // F4 is clear
  await page.getByTestId('satellite').getByRole('button', { name: 'Close' }).click();

  // ALPHA walks to F4 and asks about E3: look there too.
  await page.evaluate(() => {
    for (let i = 0; i < 600 && !window.game.get().team.holdFor; i++) window.game.tick(100);
  });
  await expect(page.getByTestId('comms-text')).toHaveText(/Holding short of E3/);
  await page.getByTestId('responses').getByRole('button', { name: 'Send imagery' }).click();
  await untilOnStation(page);
  await page.getByTestId('capture-photo').click();
  await expect(page.getByTestId('alerts')).toContainText('CONTACT E3');

  // Now it holds short of the contact.
  await page.evaluate(() => {
    for (let i = 0; i < 600 && !window.game.get().comms.messages.some((m) => m.status === 'new' && m.node === 'contact'); i++) window.game.tick(100);
  });
  await expect(page.getByTestId('comms-text')).toHaveText(/Contact in E3, a fortified checkpoint, on our route/);
  const responses = page.getByTestId('responses');
  for (const name of ['Observe', 'Attack', 'Go around']) await expect(responses.getByRole('button', { name })).toBeVisible();
  await responses.getByRole('button', { name: 'Go around' }).click();
  await expect.poll(() => page.evaluate(() => window.game.get().team.route)).toContain('E4');
});

test('news the map does not show is a banner, and the radio log keeps every message', async ({ page }) => {
  await start(page, '?debug');
  await page.waitForFunction(() => window.game);
  await page.evaluate(() => {
    window.game.set({ ...window.game.get(), noise: 70 });
    window.game.tick(100);
  });
  await expect(page.getByTestId('banner')).toContainText('know a PMC is in the area');
  await page.getByTestId('log-toggle').click();
  await expect(page.getByTestId('radio-log')).toContainText('Enemy radio net just lit up');
});
