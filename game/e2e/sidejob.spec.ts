import { expect, test } from '@playwright/test';
import { fastForward, freeze, photo, start } from './helpers';

test('the client calls with a side job behind ALPHA’s call; take it, image G2, get paid', async ({ page }) => {
  await start(page, '?debug');
  await page.waitForFunction(() => window.game);
  await freeze(page);
  await fastForward(page, 90_000);

  // If ALPHA is holding on a call of its own, the client's offer waits behind it.
  const more = page.getByTestId('more-calls');
  if (await more.isVisible()) await more.click();
  await expect(page.getByTestId('comms-text')).toContainText('Extra $10,000');
  await page.getByTestId('responses').getByRole('button', { name: 'Take the job' }).click();
  await expect(page.getByTestId('side-job')).toContainText('side job: G2 imagery');

  const before = await page.evaluate(() => window.game.get().resources.budget);
  await photo(page, 'G2');
  await expect(page.getByTestId('side-job')).toHaveCount(0);
  await expect(page.getByTestId('resources')).toContainText(`$${(before + 10_000).toLocaleString('en-US')}`);
});

test('a second waiting call can be brought up with the more control', async ({ page }) => {
  await start(page, '?debug');
  await page.waitForFunction(() => window.game?.get().team.holdFor);
  // ALPHA is holding short of F4; the client calls on top.
  await page.evaluate(() => {
    const s = window.game.get();
    // Jump to 1:30, with ALPHA's call re-stamped so it doesn't time out in the jump.
    const messages = s.comms.messages.map((m) => (m.id === s.team.holdFor ? { ...m, atMs: 89_000 } : m));
    window.game.set({ ...s, elapsedMs: 89_900, comms: { ...s.comms, messages } });
    window.game.tick(100);
  });
  await expect(page.getByTestId('comms-text')).toHaveText(/Holding short of F4/);
  await page.getByTestId('more-calls').click();
  await expect(page.getByTestId('comms-text')).toContainText('Extra $10,000');
});
