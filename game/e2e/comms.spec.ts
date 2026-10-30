import { expect, test } from '@playwright/test';
import { fastForward, freeze, start, untilOnStation, openAsk, linked, hasEvent } from './helpers';

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

test('COMMS is a list only; TEAM\u2019s call box answers ALPHA and slides away after the readback (ILI-1255)', async ({ page, isMobile }) => {
  await start(page, '?debug');
  await page.waitForFunction(() => window.game?.get().team.holdFor);
  await freeze(page);
  await expect(page.getByTestId('incoming').locator('.pack')).toHaveCount(1); // the backpack on the flag
  if (isMobile) await page.getByTestId('tab-satcom').click();
  await expect(page.getByTestId('satcom').locator('.thread')).toContainText('waiting on HQ');
  await expect(page.getByTestId('satcom').locator('.actions, .incoming-alert')).toHaveCount(0); // nothing to press in COMMS
  if (isMobile) await page.getByTestId('tab-team').click();
  const box = page.getByTestId('call-box');
  await expect(box).toBeVisible();
  await expect(box).toContainText('ALPHA');
  await box.getByTestId('answer-alpha').click();
  await expect(page.getByTestId('comms-text')).toHaveText(/Holding short of F4/);
  await page.getByTestId('responses').getByRole('button', { name: 'Move in blind' }).click();
  await expect(page.getByTestId('comms')).toHaveCount(0); // the flag came down with it
  // It goes up the link (ILI-1209): sending, then ALPHA reads it back and the box goes.
  await expect(page.getByTestId('call-state')).toHaveText('Move in blind · sending');
  await expect(page.getByTestId('sent')).toContainText('Move in blind · sending to ALPHA');
  await linked(page);
  await expect(box).toHaveCount(0);
  await expect(page.getByTestId('sent')).toHaveCount(0);
  if (isMobile) await page.getByTestId('tab-satcom').click();
  await expect(page.getByTestId('satcom').locator('.thread')).toContainText('Copy, moving in blind.');
  await expect(page.getByTestId('satcom').locator('.thread')).toContainText('HQ › Move in blind');
});

test('Look at it: a look at E3 finds the checkpoint and ALPHA asks to observe, attack or go around', async ({ page }) => {
  test.setTimeout(60_000); // a long flow, and CI's software renderer draws the satellite inset too
  await start(page, '?debug');
  await page.waitForFunction(() => window.game);
  await freeze(page);
  await fastForward(page, 500);
  await openAsk(page);
  await page.getByTestId('responses').getByRole('button', { name: 'Look at it' }).click();
  await linked(page);
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
  await linked(page);
  await untilOnStation(page);
  await page.getByTestId('capture-photo').click();
  await expect.poll(() => hasEvent(page, 'contact', 'E3')).toBe(true);

  // Now it holds short of the contact.
  await page.evaluate(() => {
    for (let i = 0; i < 600 && !window.game.get().comms.messages.some((m) => m.status === 'new' && m.node === 'contact'); i++) window.game.tick(100);
  });
  await openAsk(page);
  await expect(page.getByTestId('comms-text')).toHaveText(/Contact in E3, a fortified checkpoint, on our route/);
  const responses = page.getByTestId('responses');
  for (const name of ['Hold and watch', 'Attack', 'Go around']) await expect(responses.getByRole('button', { name })).toBeVisible();
  await responses.getByRole('button', { name: 'Go around' }).click();
  await linked(page);
  await expect.poll(() => page.evaluate(() => window.game.get().team.route)).toContain('E4');
});

test('news the map does not show lands in the stream as an alert', async ({ page, isMobile }) => {
  await start(page, '?debug');
  await page.waitForFunction(() => window.game);
  await page.evaluate(() => {
    window.game.set({ ...window.game.get(), noise: 70 });
    window.game.tick(100);
  });
  await expect(page.getByTestId('comms-feed')).toContainText('know a PMC is in the area');
  if (isMobile) await page.getByTestId('tab-satcom').click();
  await expect(page.getByTestId('comms-feed')).toContainText('Enemy radio net just lit up');
});

test('when the square card opens where ALPHA\u2019s flag was, the flag moves clear of it (ILI-1215)', async ({ page, isMobile }) => {
  test.skip(isMobile, 'the phone card docks across the top of the map, clear of ALPHA');
  await start(page, '?debug');
  await page.waitForFunction(() => window.game?.get().team.holdFor);
  await freeze(page);
  // H5 is ALPHA's right-hand neighbour on the map's edge: its card can only open to the left, over the flag's spot.
  await page.evaluate(() => window.game.selectSquare('H5'));
  await expect(page.getByTestId('square-card')).toBeVisible();
  await page.waitForTimeout(800);
  const flag = (await page.getByTestId('comms').boundingBox())!;
  const card = (await page.getByTestId('square-card').boundingBox())!;
  const apart = flag.x + flag.width <= card.x || card.x + card.width <= flag.x || flag.y + flag.height <= card.y || card.y + card.height <= flag.y;
  expect(apart).toBe(true);
  await expect(page.locator('[data-testid="call-box"][data-raised]')).toHaveCount(0); // in plain sight, so not raised elsewhere
  await page.getByTestId('incoming').click();
  await page.getByTestId('responses').getByRole('button', { name: 'Move in blind' }).click();
  await expect(page.getByTestId('comms')).toHaveCount(0);
});

test('the call box\u2019s strip follows the link: incoming while ALPHA waits, sending while the answer is up, then the box goes (ILI-1236, ILI-1255)', async ({ page, isMobile }) => {
  await start(page, '?debug');
  await page.waitForFunction(() => window.game?.get().team.holdFor);
  await freeze(page);
  if (isMobile) await page.getByTestId('tab-team').click();
  const strip = page.getByTestId('call-box').getByTestId('comms-avatar');
  await expect(strip).toBeVisible();
  await expect(strip).toHaveAttribute('data-state', 'incoming');
  await expect(page.getByTestId('comms-traffic')).toHaveText('incoming');
  await page.evaluate(() => window.game.respond(window.game.get().team.holdFor!, 'blind'));
  await expect(strip).toHaveAttribute('data-state', 'sending');
  await fastForward(page, 3_000);
  await expect(page.getByTestId('call-box')).toHaveCount(0);
});
