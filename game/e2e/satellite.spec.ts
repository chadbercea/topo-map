import { expect, test } from '@playwright/test';
import { fastForward, freeze, start, untilOnStation, openAsk, linked, hasEvent, photo, worldToScreen } from './helpers';

test('pick a square, Reposition: ORION-3 moves, then on station the shots take its place (ILI-1219, ILI-1250)', async ({ page, isMobile }) => {
  test.setTimeout(60_000); // a long flow, and CI's software renderer draws ORION-3's picture too
  await start(page, '?debug');
  await page.waitForFunction(() => window.game);
  await freeze(page);
  const sat = page.getByTestId('satellite');
  await expect(page.getByTestId('satellite-status')).toHaveText('ORION-3 over G5');
  // E3 is off screen on a phone (the camera stays on ALPHA); map.spec covers tapping squares.
  await page.evaluate(() => window.game.selectSquare('E3'));
  // Picking a square pins its card: what HQ knows of it, and Reposition. No picture anywhere yet.
  const card = page.getByTestId('square-card');
  await expect(card).toHaveAttribute('data-square', 'E3');
  await expect(page.getByTestId('square-status')).toHaveText('no imagery');
  await expect(page.getByTestId('square-facts')).toContainText(/Elevation\s*\d+–\d+ m/);
  // The image area holds its place: the placeholder (later the Three.js satellite, ILI-1229).
  await expect(page.getByTestId('satellite-inset')).toHaveCount(0);
  await expect(sat.getByTestId('orion-placeholder')).toContainText('No imagery of E3 · Reposition');
  // Not over E3 yet: one big Reposition, and no shots to take (ILI-1250).
  await expect(page.getByTestId('look-here')).toHaveText(/^Reposition\s*to E3 · \d+:\d\d$/);
  await expect(sat.getByTestId('capture-modes')).toHaveCount(0);
  await page.getByTestId('look-here').click();

  // ORION-3 repositions, in its own panel: a countdown that runs down, and nothing to press
  // but Cancel. On a fold or phone its tab comes forward.
  const moving = page.getByTestId('orion-repositioning');
  await expect(moving).toBeVisible();
  await expect(moving).toContainText(/Repositioning to E3 · \d+ min/);
  await expect(sat.getByTestId('orion-placeholder')).toContainText('On its way to E3');
  // The button row keeps its place under the picture: Reposition, unlit while it moves.
  await expect(sat.getByTestId('capture-modes')).toHaveCount(0);
  await expect(sat.getByTestId('look-here')).toBeDisabled();
  await expect(sat.getByTestId('look-here')).toContainText('Repositioning to E3');
  await expect(sat.getByRole('button', { name: 'Cancel' })).toHaveCount(0); // no Cancel
  await expect(page.getByTestId('satellite-status')).toContainText('ORION-3 to E3');
  await expect(page.getByTestId('square-status')).toHaveText(/ORION-3 \d+:\d\d away/); // the square, in the same panel (ILI-1228)
  await untilOnStation(page);

  // On station the panel opens up: the larger square, and the ways to look.
  await expect(sat).toHaveAttribute('data-state', 'onStation');
  await expect(moving).toHaveCount(0);
  await expect(sat.getByTestId('orion-placeholder')).toHaveCount(0);
  const picture = sat.getByTestId('satellite-inset');
  await expect(picture).toBeVisible();
  await expect(sat.getByTestId('capture-modes').getByRole('button')).toHaveCount(3);
  await expect(sat.getByTestId('look-here')).toHaveCount(0); // the shots took its place
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
  // The strikes are ORION-3's too (ILI-1230): a tap on a fighter in its picture opens them (ILI-1250).
  await expect(page.getByTestId('action-panel')).toHaveCount(0); // nothing else to do here
  await sat.getByTestId('target-pin').first().click();
  const act = sat.getByTestId('strike-menu');
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

test('a fighter in ORION-3\u2019s picture opens its strikes; there\u2019s no Strike button (ILI-1250)', async ({ page }) => {
  await start(page, '?debug');
  await page.waitForFunction(() => window.game);
  await freeze(page);
  const sat = page.getByTestId('satellite');
  await page.evaluate(() => window.game.selectSquare('F4'));
  await expect(sat.getByTestId('look-here')).toBeEnabled();
  await photo(page, 'E3'); // finds the checkpoint
  await page.evaluate(() => window.game.selectSquare('E3'));
  await expect(sat.getByTestId('strike-menu')).toHaveCount(0);
  await expect(sat.getByTestId('strike-toggle')).toHaveCount(0);
  const pins = sat.getByTestId('target-pin');
  await expect(pins).toHaveCount(5); // one per fighter it saw
  await pins.first().click();
  await expect(sat.getByTestId('strike-menu').getByTestId('fire-drone')).toBeVisible();
  await sat.getByTestId('strike-menu').getByRole('button', { name: 'Close strikes' }).click();
  await expect(sat.getByTestId('strike-menu')).toHaveCount(0);
  await expect(page.getByTestId('square-card')).toHaveAttribute('data-square', 'E3'); // the square stays picked
});

test('a fighter on the map opens its strikes too (ILI-1250)', async ({ page, isMobile }) => {
  test.skip(isMobile, 'a phone taps them in ORION-3\u2019s picture');
  await start(page, '?debug');
  await page.waitForFunction(() => window.game);
  await freeze(page);
  await photo(page, 'E3');
  await page.evaluate(() => window.game.closeSquare());
  const spot = await page.evaluate(() => {
    const seen = window.game.get().imagery.E3!.seen[0];
    const u = seen.units[0];
    return { x: seen.x + ((u % 4) + 0.5) * 50, y: seen.y + (Math.floor(u / 4) + 0.5) * 50 };
  });
  const p = await worldToScreen(page, spot.x, spot.y);
  await page.mouse.click(p.x, p.y);
  await expect(page.getByTestId('strike-menu').getByTestId('fire-sniper')).toBeVisible();
});

test('over a square it has already shot, no Reposition and no Rescan: the shots are there (ILI-1250)', async ({ page }) => {
  await start(page, '?debug');
  await page.waitForFunction(() => window.game);
  await freeze(page);
  const sat = page.getByTestId('satellite');
  await photo(page, 'E3');
  await page.evaluate(() => window.game.selectSquare('E3'));
  await expect(sat.getByTestId('look-here')).toHaveCount(0);
  await sat.getByTestId('capture-photo').click();
  await expect(sat.getByTestId('satellite-result')).toContainText('Photo:');
  // A different square: back to Reposition.
  await page.evaluate(() => window.game.selectSquare('F4'));
  await expect(sat.getByTestId('look-here')).toHaveText(/^Reposition\s*to F4/);
  await expect(sat.getByTestId('capture-modes')).toHaveCount(0);
});

test("a slew counts down in ORION-3's frame, then the photo (ILI-1269)", async ({ page, isMobile }) => {
  await start(page, '?debug');
  await page.waitForFunction(() => window.game);
  await freeze(page);
  await page.evaluate(() => {
    window.game.selectSquare('E3');
    window.game.lookAt('E3');
  });
  if (isMobile) await page.getByTestId('tab-orion').click();
  const eta = page.getByTestId('orion-eta');
  await expect(eta).toHaveText(/^0:\d\d$/);
  const first = await eta.textContent();
  await page.evaluate(() => window.game.tick(2000));
  await expect(eta).not.toHaveText(first!);
  await expect(page.getByTestId('orion-placeholder')).toContainText('then take the photo');
});
