import { expect, test } from '@playwright/test';
import { fastForward, freeze, lockOn, start, untilTraffic, openEvent, hasEvent } from './helpers';

test('intercept: get ORION-3 in range through the prompt, follow their wave, and what is decoded goes on the shelf for ALPHA (ILI-1394, ILI-1499)', async ({ page }) => {
  test.setTimeout(60_000); // a long flow, and CI's software renderer draws the satellite inset too
  await start(page, '?debug');
  await page.waitForFunction(() => window.game);
  await freeze(page);
  await untilTraffic(page);
  // Enemy traffic is a line of C2's intel list (ILI-1491): no card or tag of its own on the map.
  await expect(page.getByTestId('traffic-prompt')).toHaveCount(0);
  await page.evaluate(() => window.game.selectSquare('C2'));
  const item = page.getByTestId('square-anchor').locator('[data-testid=intel-item][data-kind=signal]');
  await expect(item.getByTestId('traffic-item')).toHaveText('Enemy radio traffic near C2');
  await expect(item.getByTestId('traffic-choice')).toHaveCount(0); // the choice opens on a click
  await item.getByTestId('traffic-item').click();
  await expect(item.getByTestId('traffic-listen')).toHaveText([/^Send ORION-3 to C2 · \d:\d\d$/]); // HQ's job: no antenna (ILI-1435)
  await expect(item.getByTestId('traffic-hint')).toHaveText("Only ORION-3 can listen, and only from over C2. Send it; the intercept starts once it's locked on."); // ILI-1492
  await expect(item.getByTestId('traffic-jam')).toBeDisabled(); // ORION-3 isn't over C2
  await expect(page.getByRole('button', { name: 'Listen', exact: true })).toHaveCount(0); // no button starts it
  await item.locator('[data-response=satellite]').click();
  await expect(item.getByTestId('traffic-listen')).toHaveText([/ORION-3 on its way/]);
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
  // Over: no after-action panel, and no send step: what came through goes on the shelf for ALPHA
  // to pull (ILI-1499); pulled, the patrol's plan is known.
  await expect(panel).toHaveCount(0);
  await expect(item).toHaveCount(0); // the intercept ran: the traffic's resolved
  expect(await page.evaluate(() => window.game.get().intel.pushes.some((p) => p.source === 'SIGINT'))).toBe(true);
  await page.evaluate(() => { for (let i = 0; i < 600 && !window.game.get().contacts.find((c) => c.id === 'patrol')?.planKnown; i++) window.game.tick(100); });
  await expect.poll(() => page.evaluate(() => window.game.get().contacts.find((c) => c.id === 'patrol')?.planKnown)).toBe(true);
  expect(await hasEvent(page, 'contact', 'C2')).toBe(false); // no contact marker on unscanned ground
});

test('the traffic stays in its square\u2019s list when a more urgent prompt comes up (ILI-1452, ILI-1491)', async ({ page }) => {
  await start(page, '?debug');
  await page.waitForFunction(() => window.game);
  await freeze(page);
  await untilTraffic(page);
  await page.evaluate(() => window.game.selectSquare('C2'));
  const item = page.getByTestId('square-anchor').locator('[data-testid=intel-item][data-kind=signal]');
  await expect(item).toBeVisible();
  // An operator hit: the most urgent prompt there is. The traffic stays on C2's list beside it.
  await page.evaluate(() => {
    const s = window.game.get();
    window.game.set({ ...s, team: { ...s.team, operators: s.team.operators.map((o, i) => (i === 1 ? { ...o, health: 10 } : o)) } });
  });
  await expect(page.getByTestId('prompt')).toHaveAttribute('data-kind', 'operator');
  await expect(item).toBeVisible();
  await expect.poll(() => hasEvent(page, 'signal', 'C2')).toBe(true);
});

test('jam instead: the traffic is gone, and HQ says what it costs', async ({ page }) => {
  await start(page, '?debug');
  await page.waitForFunction(() => window.game);
  await untilTraffic(page);
  await lockOn(page, 'C2'); // ORION-3 over it, or nothing runs there (ILI-1397)
  await openEvent(page, 'signal', 'C2'); // its line in C2's list, open on the choice (ILI-1491)
  await page.getByTestId('square-anchor').getByTestId('traffic-jam').click();
  await expect(page.getByTestId('square-anchor').locator('[data-kind=signal]')).toHaveCount(0);
  const log = await page.evaluate(() => window.game.get().comms.messages.map((m) => m.text));
  expect(log.some((t) => /Jamming their net near C2/.test(t))).toBe(true);
});
