import { expect, test } from '@playwright/test';
import { fastForward, freeze, lockOn, start, untilTraffic, openEvent, hasEvent } from './helpers';
import type { Page } from '@playwright/test';

// Events show only on ground ORION-3's analysts have been through (ILI-1519): mark C2 analyzed.
const analyzed = (page: Page, sq: string) =>
  page.evaluate((sq) => {
    const s = window.game.get();
    window.game.set({ ...s, intel: { ...s.intel, graded: [...s.intel.graded, sq] } });
  }, sq);

test('intercept: get ORION-3 in range through the prompt, follow their wave, and what is decoded reaches ALPHA at once (ILI-1394, ILI-1558)', async ({ page }) => {
  test.setTimeout(60_000); // a long flow, and CI's software renderer draws the satellite inset too
  await start(page, '?debug');
  await page.waitForFunction(() => window.game);
  await freeze(page);
  await untilTraffic(page);
  await analyzed(page, 'C2');
  // One square, one panel (ILI-1580): a Traffic badge on C2 (an edge marker while C2 is off the
  // open map, which pans to it); a click on the badge opens C2's card, where Listen and Jam are.
  const edge = page.locator('[data-testid=edge-marker][data-square=C2]');
  if (await edge.count()) await edge.click();
  await page.getByTestId('traffic-prompt').click();
  await expect(page.getByTestId('square-anchor')).toHaveAttribute('data-square', 'C2');
  const item = page.getByTestId('square-anchor').locator('[data-testid=intel-item][data-kind=signal]');
  await expect(item.getByTestId('traffic-item')).toHaveText('Enemy radio traffic near C2');
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
  await expect(page.getByTestId('transcript')).toContainText(/[A-Z]{3}/); // who's talking: the group nearest the signal (rolled map, ILI-1544)

  // Follow the hops to the end (straight through the store: a slider per hop is slow on CI).
  await page.evaluate(() => {
    const g = window.game;
    for (let i = 0; i < 300 && g.get().minigame?.status === 'active'; i++) {
      g.tune(g.get().minigame!.signal!.target);
      g.tick(100);
    }
  });
  // Over: no after-action panel, and no send step: what came through reaches ALPHA at once
  // (ILI-1558): the patrol's plan is known.
  await expect(panel).toHaveCount(0);
  await expect(item).toHaveCount(0); // the intercept ran: the traffic's resolved
  expect(await page.evaluate(() => window.game.get().intel.pushes.some((p) => p.source === 'SIGINT'))).toBe(true);
  // The group that talked: its plan is known (no authored patrol since the rolled map, ILI-1544).
  await page.evaluate(() => { for (let i = 0; i < 600 && !window.game.get().contacts.some((c) => c.planKnown); i++) window.game.tick(100); });
  await expect.poll(() => page.evaluate(() => window.game.get().contacts.some((c) => c.planKnown))).toBe(true);
  expect(await hasEvent(page, 'contact', 'C2')).toBe(false); // no contact marker on unscanned ground
});

test('the traffic stays in its square\u2019s list when a more urgent prompt comes up (ILI-1452, ILI-1491)', async ({ page }) => {
  await start(page, '?debug');
  await page.waitForFunction(() => window.game);
  await freeze(page);
  await untilTraffic(page);
  await analyzed(page, 'C2');
  await page.evaluate(() => window.game.selectSquare('C2'));
  const item = page.getByTestId('square-anchor').locator('[data-testid=intel-item][data-kind=signal]');
  await expect(item).toBeVisible();
  // ALPHA asks for a resupply: the queue's most urgent prompt now (ILI-1535 cut the operator one).
  // The traffic stays on C2's list beside it.
  await page.evaluate(() => {
    const s = window.game.get();
    window.game.set({ ...s, team: { ...s.team, operators: s.team.operators.map((o, i) => (i < 2 ? { ...o, health: 0 } : o)) } });
    for (let t = 0; t < 200; t += 100) window.game.tick(100);
  });
  await expect(page.locator('[data-testid=prompt][data-kind=team-call]')).toBeVisible();
  await expect(item).toBeVisible();
  await expect.poll(() => hasEvent(page, 'signal', 'C2')).toBe(true);
});

test('jam instead: the traffic is gone, and HQ says what it costs', async ({ page }) => {
  await start(page, '?debug');
  await page.waitForFunction(() => window.game);
  await untilTraffic(page);
  await analyzed(page, 'C2');
  await lockOn(page, 'C2'); // ORION-3 over it, or nothing runs there (ILI-1397)
  await openEvent(page, 'signal', 'C2'); // its line in C2's list, open on the choice (ILI-1491)
  await page.getByTestId('square-anchor').getByTestId('traffic-jam').click();
  await expect(page.getByTestId('square-anchor').locator('[data-kind=signal]')).toHaveCount(0);
  const log = await page.evaluate(() => window.game.get().comms.messages.map((m) => m.text));
  expect(log.some((t) => /jamming enemy net near C2/.test(t))).toBe(true);
});
