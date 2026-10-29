import { expect, test } from '@playwright/test';
import { fastForward, freeze, start, untilOnStation, openAsk, linked, hasEvent } from './helpers';

test('pick a square, Scan: ORION-3 repositions, then on station the larger square and the captures are in its panel (ILI-1219)', async ({ page, isMobile }) => {
  test.setTimeout(60_000); // a long flow, and CI's software renderer draws ORION-3's picture too
  await start(page, '?debug');
  await page.waitForFunction(() => window.game);
  await freeze(page);
  const sat = page.getByTestId('satellite');
  await expect(page.getByTestId('satellite-status')).toHaveText('ORION-3 over G5');
  // E3 is off screen on a phone (the camera stays on ALPHA); map.spec covers tapping squares.
  await page.evaluate(() => window.game.selectSquare('E3'));
  // Picking a square pins its card: what HQ knows of it, and Scan. No picture anywhere yet.
  const card = page.getByTestId('square-card');
  await expect(card).toHaveAttribute('data-square', 'E3');
  await expect(page.getByTestId('square-status')).toHaveText('no imagery');
  await expect(page.getByTestId('square-facts')).toContainText(/Elevation\s*\d+–\d+ m/);
  // The image area holds its place: the placeholder (later the Three.js satellite, ILI-1229).
  await expect(page.getByTestId('satellite-inset')).toHaveCount(0);
  await expect(sat.getByTestId('orion-placeholder')).toContainText('No imagery of E3 · Scan');
  await expect(page.getByTestId('look-here')).toHaveText(/Scan · \d+ min/);
  await page.getByTestId('look-here').click();

  // ORION-3 repositions, in its own panel: a countdown that runs down, and nothing to press
  // but Cancel. On a fold or phone its tab comes forward.
  const moving = page.getByTestId('orion-repositioning');
  await expect(moving).toBeVisible();
  await expect(moving).toContainText(/Repositioning to E3 · \d+ min/);
  await expect(sat.getByTestId('orion-placeholder')).toContainText('On its way to E3');
  await expect(sat.getByTestId('capture-modes')).toHaveCount(0);
  await expect(page.getByTestId('satellite-status')).toContainText('ORION-3 to E3');
  await expect(page.getByTestId('square-status')).toHaveText(/ORION-3 \d+ min away/); // the square, in the same panel (ILI-1228)
  await untilOnStation(page);

  // On station the panel opens up: the larger square, and the ways to look.
  await expect(sat).toHaveAttribute('data-state', 'onStation');
  await expect(moving).toHaveCount(0);
  await expect(sat.getByTestId('orion-placeholder')).toHaveCount(0);
  const picture = sat.getByTestId('satellite-inset');
  await expect(picture).toBeVisible();
  await expect(sat.getByTestId('capture-modes').getByRole('button')).toHaveCount(3);
  await sat.getByTestId('capture-burst').click();
  await expect(sat).toHaveAttribute('data-state', 'capturing');
  await expect(picture).toHaveAttribute('data-state', 'capturing');
  await fastForward(page, 6_100);

  // What it saw stays in the panel; the find is on the card, the strikes beside it.
  await expect(sat.getByTestId('satellite-result')).toContainText('Burst: 5 fighters, unaware');
  await expect(sat.getByTestId('satellite-inset')).toHaveCount(1); // the picture stays up
  await expect(page.getByTestId('comms-feed')).toContainText('E3 imaged (burst): 5 fighters, unaware');
  await expect(page.getByTestId('square-facts')).toContainText(/Contacts\s*\d+ · .*checkpoint/i);
  await expect.poll(() => hasEvent(page, 'contact', 'E3')).toBe(true);
  const act = page.getByTestId('action-panel');
  await expect(card.getByTestId('event-card')).toHaveCount(0);
  await expect(act.getByTestId('event-card')).toContainText('CONTACT · E3');
  if (isMobile) {
    // A phone: in ORION-3's sheet, under the square, a scroll (or a pull on the grip) away.
    await act.getByTestId('send-team').scrollIntoViewIfNeeded();
    await expect(act.getByTestId('fire-sniper')).toBeVisible();
  } else {
    await expect(act.getByTestId('fire-sniper')).toBeInViewport({ ratio: 1 });
    await expect(act.getByTestId('send-team')).toBeInViewport({ ratio: 1 });
  }
  await card.getByRole('button', { name: 'Close' }).click();
  await expect(card).toHaveCount(0); // closed: the look is filed
  await expect(page.getByTestId('satellite-status')).toHaveText('ORION-3 over E3');
});

test('ALPHA asks for imagery: Look at it, then a photo on station lets it move', async ({ page }) => {
  await start(page, '?debug');
  await page.waitForFunction(() => window.game?.get().team.holdFor);
  await freeze(page);
  await openAsk(page);
  await page.getByTestId('responses').getByRole('button', { name: 'Look at it' }).click();
  await linked(page);
  await expect(page.getByTestId('team-panel')).toContainText('Waiting on the look');
  await untilOnStation(page);
  await page.getByTestId('satellite').getByTestId('capture-photo').click();
  await expect(page.getByTestId('satellite-result')).toContainText('Photo: nothing there');
  await fastForward(page, 1_000);
  await expect(page.getByTestId('team-panel')).toContainText('Moving to F4');
});

test('Cancel calls it off while it moves', async ({ page }) => {
  await start(page, '?debug');
  await page.waitForFunction(() => window.game);
  await freeze(page);
  await page.evaluate(() => window.game.lookAt('A1'));
  await page.getByTestId('satellite').getByRole('button', { name: 'Cancel' }).click(); // in ORION-3's panel (ILI-1219)
  await expect(page.getByTestId('satellite')).toHaveAttribute('data-state', 'idle'); // it goes back to idle
});
