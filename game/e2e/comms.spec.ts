import { expect, test } from '@playwright/test';
import { fastForward, freeze, start, untilOnStation, openAsk } from './helpers';

test('ALPHA holds short of unimaged ground and asks; Move in blind sends it on', async ({ page, isMobile }) => {
  await start(page, '?debug');
  await page.waitForFunction(() => window.game);
  await fastForward(page, 500);

  const panel = page.getByTestId('team-panel');
  await expect(page.getByTestId('comms')).toHaveAttribute('aria-label', 'ALPHA needs a decision'); // the ask beside ALPHA's marker
  await expect(page.getByTestId('call-deadline')).toHaveCount(0); // ALPHA waits: no countdown
  await openAsk(page);
  await expect(page.getByTestId('comms-text')).toHaveText(/Holding short of F4\. No imagery/);

  const push = page.getByTestId('responses').getByRole('button', { name: 'Move in blind' });
  if (isMobile) await push.tap();
  else await push.click();
  await fastForward(page, 1_000);
  await expect(panel).toContainText('Moving to F4');
});

test('ALPHA\u2019s ask flags at its marker and opens on a click; answering closes it, and the comms log keeps both sides', async ({ page }) => {
  await start(page, '?debug');
  await page.waitForFunction(() => window.game);
  await fastForward(page, 500);
  const ask = page.getByTestId('comms');
  // It arrives as a flag; the ask itself waits for HQ to open it.
  await expect(ask.getByTestId('incoming')).toHaveAccessibleName('Incoming from ALPHA');
  await expect(ask.getByTestId('comms-text')).toHaveCount(0);
  await openAsk(page);
  await expect(ask.getByTestId('comms-text')).toHaveText(/Holding short of F4/);
  await expect(page.getByTestId('satcom').locator('.thread')).toContainText('waiting on HQ');
  await ask.getByTestId('responses').getByRole('button').last().click();
  await expect(ask).toHaveCount(0);
  const log = page.getByTestId('satcom').locator('.thread');
  await expect(log).toContainText('Holding short of F4');
  await expect(log).toContainText('HQ › Move in blind');
});

test('Look at it: a look at E3 finds the checkpoint and ALPHA asks to observe, attack or go around', async ({ page }) => {
  test.setTimeout(60_000); // a long flow, and CI's software renderer draws the satellite inset too
  await start(page, '?debug');
  await page.waitForFunction(() => window.game);
  await freeze(page);
  await fastForward(page, 500);
  await openAsk(page);
  await page.getByTestId('responses').getByRole('button', { name: 'Look at it' }).click();
  await untilOnStation(page);
  await page.getByTestId('capture-photo').click(); // F4 is clear
  await page.getByTestId('square-card').getByRole('button', { name: 'Close' }).click();

  // ALPHA walks to F4 and asks about E3: look there too.
  await page.evaluate(() => {
    for (let i = 0; i < 600 && !window.game.get().team.holdFor; i++) window.game.tick(100);
  });
  await openAsk(page);
  await expect(page.getByTestId('comms-text')).toHaveText(/Holding short of E3/);
  await page.getByTestId('responses').getByRole('button', { name: 'Look at it' }).click();
  await untilOnStation(page);
  await page.getByTestId('capture-photo').click();
  await expect(page.getByTestId('intel-items')).toContainText(/CONTACT\s*E3/);

  // Now it holds short of the contact.
  await page.evaluate(() => {
    for (let i = 0; i < 600 && !window.game.get().comms.messages.some((m) => m.status === 'new' && m.node === 'contact'); i++) window.game.tick(100);
  });
  await openAsk(page);
  await expect(page.getByTestId('comms-text')).toHaveText(/Contact in E3, a fortified checkpoint, on our route/);
  const responses = page.getByTestId('responses');
  for (const name of ['Hold and watch', 'Attack', 'Go around']) await expect(responses.getByRole('button', { name })).toBeVisible();
  await responses.getByRole('button', { name: 'Go around' }).click();
  await expect.poll(() => page.evaluate(() => window.game.get().team.route)).toContain('E4');
});

test('news the map does not show lands in the stream as an alert, and the header flags the blocker', async ({ page, isMobile }) => {
  await start(page, '?debug');
  await page.waitForFunction(() => window.game);
  await page.evaluate(() => {
    window.game.set({ ...window.game.get(), noise: 70 });
    window.game.tick(100);
  });
  await expect(page.getByTestId('intel-items')).toContainText('know a PMC is in the area');
  await expect(page.getByTestId('blockers')).toContainText('Enemy alerted');
  if (isMobile) await page.getByTestId('tab-intel').click();
  await expect(page.getByTestId('intel-items')).toContainText('Enemy radio net just lit up');
});

test('when the square card covers ALPHA\u2019s flag, the intel stream raises the ask in orange', async ({ page, isMobile }) => {
  test.skip(isMobile, 'the phone card docks across the top of the map, clear of ALPHA');
  await start(page, '?debug');
  await page.waitForFunction(() => window.game?.get().team.holdFor);
  await freeze(page);
  await expect(page.getByTestId('incoming-alert')).toHaveCount(0); // the flag is in plain sight
  // H5 is ALPHA's right-hand neighbour on the map's edge: its card can only open to the left, over the flag.
  await page.evaluate(() => window.game.selectSquare('H5'));
  const alert = page.getByTestId('incoming-alert');
  await expect(alert).toContainText('INCOMING · ALPHA');
  await expect(alert).toContainText('Holding short of F4');
  await page.getByTestId('answer-alpha').click();
  // The ask opens over the card.
  await expect(page.getByTestId('comms-text')).toHaveText(/Holding short of F4/);
  await page.getByTestId('responses').getByRole('button', { name: 'Move in blind' }).click();
  await expect(page.getByTestId('incoming-alert')).toHaveCount(0);
});
