import { expect, test } from '@playwright/test';
import { fastForward, freeze, lockOn, start, openEvent, hasEvent } from './helpers';

test('intercept: get ORION-3 in range through the prompt, follow their wave, and send what is decoded to ALPHA (ILI-1394)', async ({ page, isMobile }) => {
  test.setTimeout(60_000); // a long flow, and CI's software renderer draws the satellite inset too
  await start(page, '?debug');
  await page.waitForFunction(() => window.game);
  await freeze(page);
  await fastForward(page, 83_000);
  // Enemy traffic is a card at C2, in its own lane (ILI-1394, ILI-1452).
  const traffic = page.getByTestId('traffic-prompt');
  await expect(traffic).toHaveAttribute('data-kind', 'enemy-traffic');
  await expect(traffic).toHaveAttribute('data-square', 'C2');
  await expect(traffic.getByTestId('prompt-response')).toHaveText([/^ORION-3 listens · \d:\d\d there$/]); // HQ's job: no antenna (ILI-1435)
  await expect(page.getByRole('button', { name: 'Listen', exact: true })).toHaveCount(0); // no button starts it
  await traffic.locator('[data-response=satellite]').click();
  await expect(traffic.getByTestId('prompt-response')).toHaveText([/ORION-3 on its way/]);
  // In range, the intercept starts by itself.
  await page.evaluate(() => {
    for (let i = 0; i < 400 && !window.game.get().minigame; i++) window.game.tick(100);
  });

  const panel = page.getByTestId('minigame');
  await expect(panel).toContainText('LISTEN · C2');
  await expect(panel).toContainText('lay your line over theirs');

  // Lay the line on theirs with the slider, then let some words through.
  const target = await page.evaluate(() => window.game.get().minigame!.signal!.target);
  await page.getByTestId('dial').fill(String(target));
  await expect(page.getByTestId('match')).toHaveText('RECEIVING 100%');
  await fastForward(page, 1_500);
  await expect(page.getByTestId('transcript')).toContainText('PAT');

  // Follow the hops to the end (straight through the store: a slider per hop is slow on CI).
  await page.evaluate(() => {
    const g = window.game;
    for (let i = 0; i < 300 && g.get().minigame?.status === 'active'; i++) {
      g.tune(g.get().minigame!.signal!.target);
      g.tick(100);
    }
  });
  // Over: no after-action panel. What came through is a marker on the map, for HQ to send to
  // ALPHA (ILI-1394); sent, the patrol's plan is known.
  await expect(panel).toHaveCount(0);
  await expect(traffic).toHaveCount(0); // the intercept ran: the card's gone
  const prompt = page.getByTestId('prompt');
  await expect(prompt).toHaveAttribute('data-kind', 'intel-ready');
  await expect(prompt.getByTestId('prompt-text')).toContainText('PATROL AT C2 MOVING TO D3');
  await prompt.getByTestId('prompt-response').click();
  await expect.poll(() => page.evaluate(() => window.game.get().contacts.find((c) => c.id === 'patrol')?.planKnown)).toBe(true);
  if (isMobile) await page.getByTestId('tab-satcom').click();
  await expect(page.getByTestId('comms-feed')).toContainText('Sent to ALPHA');
  await expect.poll(() => hasEvent(page, 'contact', 'C2')).toBe(true);
});

test('the traffic card stays when a more urgent prompt comes up, until HQ dismisses it (ILI-1452)', async ({ page }) => {
  await start(page, '?debug');
  await page.waitForFunction(() => window.game);
  await freeze(page);
  await fastForward(page, 83_000);
  const traffic = page.getByTestId('traffic-prompt');
  await expect(traffic).toHaveAttribute('data-kind', 'enemy-traffic');
  // An operator hit: the most urgent prompt there is. The traffic card stays up beside it.
  await page.evaluate(() => {
    const s = window.game.get();
    window.game.set({ ...s, team: { ...s.team, operators: s.team.operators.map((o, i) => (i === 1 ? { ...o, health: 10 } : o)) } });
  });
  await expect(page.getByTestId('prompt')).toHaveAttribute('data-kind', 'operator');
  await expect(traffic).toBeVisible();
  await expect(traffic).toHaveAttribute('data-square', 'C2');
  // Dismissed: the card goes, the traffic stays on the map for HQ to act on later.
  await traffic.getByTestId('traffic-dismiss').click();
  await expect(traffic).toHaveCount(0);
  await expect.poll(() => hasEvent(page, 'signal', 'C2')).toBe(true);
});

test('jam instead: the traffic is gone, and HQ says what it costs', async ({ page }) => {
  await start(page, '?debug');
  await page.waitForFunction(() => window.game);
  await fastForward(page, 83_000);
  await lockOn(page, 'C2'); // ORION-3 over it, or nothing runs there (ILI-1397)
  await openEvent(page, 'signal', 'C2');
  await page.getByRole('button', { name: 'Jam', exact: true }).click();
  await expect(page.getByTestId('event-card')).toHaveCount(0);
  const log = await page.evaluate(() => window.game.get().comms.messages.map((m) => m.text));
  expect(log.some((t) => /Jamming their net near C2/.test(t))).toBe(true);
});
