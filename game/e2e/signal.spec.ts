import { expect, test } from '@playwright/test';
import { fastForward, freeze, start, openEvent, hasEvent } from './helpers';

test('intercept: follow their wave with the slider until the message is through', async ({ page }) => {
  test.setTimeout(60_000); // a long flow, and CI's software renderer draws the satellite inset too
  await start(page, '?debug');
  await page.waitForFunction(() => window.game);
  await freeze(page);
  await fastForward(page, 83_000);
  await openEvent(page, 'signal', 'C2');
  await page.getByRole('button', { name: 'Listen' }).click();

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
  // Over: no after-action panel. The decode is a SIGINT report in the stream, and C2's card is
  // back, where Scan sends ORION-3 to see them.
  await expect(panel).toHaveCount(0);
  await expect(page.getByTestId('comms-feed')).toContainText('PATROL AT C2 MOVING TO D3');
  await expect(page.getByTestId('square-card')).toHaveAttribute('data-square', 'C2');
  await page.getByTestId('look-here').click();
  await expect(page.getByTestId('satellite')).toContainText('ORION-3 to C2');
  await expect.poll(() => hasEvent(page, 'contact', 'C2')).toBe(true);
});

test('jam instead: the traffic is gone, and HQ says what it costs', async ({ page }) => {
  await start(page, '?debug');
  await page.waitForFunction(() => window.game);
  await fastForward(page, 83_000);
  await openEvent(page, 'signal', 'C2');
  await page.getByRole('button', { name: 'Jam', exact: true }).click();
  await expect(page.getByTestId('event-card')).toHaveCount(0);
  const log = await page.evaluate(() => window.game.get().comms.messages.map((m) => m.text));
  expect(log.some((t) => /Jamming their net near C2/.test(t))).toBe(true);
});
