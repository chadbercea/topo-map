import { expect, test } from '@playwright/test';
import { freeze, running, start } from './helpers';

// The comms log button lights up orange only for what moves the game forward (ILI-1413): an
// alert or a call that needs HQ, not routine chatter. Opening the log clears it.
test('comms log: orange and a count for an alert, nothing for chatter', async ({ page, isMobile }) => {
  test.skip(isMobile, 'a phone has the COMMS tab instead of the button');
  await start(page, '?debug');
  await running(page);
  await freeze(page);
  const button = page.getByTestId('log-toggle');
  const say = (id: string, alert: boolean) =>
    page.evaluate(
      ({ id, alert }) => {
        const s = window.game.get();
        window.game.set({ ...s, comms: { ...s.comms, messages: [...s.comms.messages, { id, from: 'ALPHA', text: id, atMs: s.elapsedMs, status: 'read', holds: false, alert }] } });
      },
      { id, alert },
    );
  await say('chatter', false);
  await expect(button).not.toHaveAttribute('data-update', 'true');
  await expect(page.getByTestId('comms-new')).toHaveCount(0);
  await say('news', true);
  await expect(button).toHaveAttribute('data-update', 'true');
  await expect(page.getByTestId('comms-new')).toHaveText('1 new');
  await button.click(); // open the log
  await button.click(); // and close it: seen
  await expect(page.getByTestId('comms-new')).toHaveCount(0);
});
