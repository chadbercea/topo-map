import { expect, test } from '@playwright/test';
import { fastForward, freeze, start, untilOnStation, openAsk, linked, hasEvent, photo, worldToScreen } from './helpers';

test('pick a square: its anchor gets eyes on it; ORION-3 moves, then on station the shots are in its panel (ILI-1219, ILI-1302)', async ({ page, isMobile }) => {
  test.setTimeout(60_000); // a long flow, and CI's software renderer draws ORION-3's picture too
  await start(page, '?debug');
  await page.waitForFunction(() => window.game);
  await freeze(page);
  const sat = page.getByTestId('satellite');
  await expect(page.getByTestId('satellite-status')).toHaveText('ORION-3 over G5');
  // E3 is off screen on a phone (the camera stays on ALPHA); map.spec covers tapping squares.
  await page.evaluate(() => window.game.selectSquare('E3'));
  // Picking a square opens its anchor on the map: what HQ knows of it, and Get eyes on it.
  // ORION-3's panel doesn't follow: it shows where the satellite is looking.
  const card = page.getByTestId('square-card');
  await expect(card).toHaveAttribute('data-square', 'E3');
  await expect(sat.getByTestId('square-card')).toHaveCount(0);
  await expect(page.getByTestId('square-status')).toHaveText('no imagery');
  await expect(page.getByTestId('square-facts')).toContainText(/Elevation\s*\d+–\d+ m/);
  await expect(page.getByTestId('satellite-inset')).toHaveCount(0);
  const eyes = card.getByTestId('look-here');
  await expect(eyes).toHaveText(/^Get eyes on E3\s*ORION-3 · on station in \d+:\d\d$/);
  await eyes.click();

  // ORION-3 repositions, in its own panel: a countdown that runs down. On a fold or phone its
  // tab comes forward.
  const moving = page.getByTestId('orion-repositioning');
  await expect(moving).toBeVisible();
  await expect(moving).toContainText(/Repositioning to E3 · \d+:\d\d/);
  await expect(sat.getByTestId('orion-placeholder')).toContainText('On station over E3 in'); // counting down in the frame (ILI-1269)
  await expect(sat.getByTestId('capture-photo')).toBeDisabled(); // nothing to shoot on the way
  await expect(eyes).toBeDisabled();
  await expect(eyes).toContainText('ORION-3 on its way');
  await expect(page.getByTestId('satellite-status')).toContainText('ORION-3 to E3');
  await expect(page.getByTestId('square-status')).toHaveText(/ORION-3 \d+:\d\d away/);
  await untilOnStation(page);

  // On station the panel opens up: the larger square, and the ways to look.
  await expect(sat).toHaveAttribute('data-state', 'onStation');
  await expect(moving).toHaveCount(0);
  await expect(sat.getByTestId('orion-placeholder')).toHaveCount(0);
  const picture = sat.getByTestId('satellite-inset');
  await expect(picture).toBeVisible();
  await expect(sat.getByTestId('capture-modes').getByRole('button')).toHaveCount(3);
  await expect(eyes).toContainText('ORION-3 is over E3');
  await sat.getByTestId('capture-burst').click();
  await expect(sat).toHaveAttribute('data-state', 'capturing');
  await expect(picture).toHaveAttribute('data-state', 'capturing');
  await fastForward(page, 6_100);

  // What it saw stays in ORION-3's panel; the find and the strikes are at the square.
  await expect(sat.getByTestId('satellite-result')).toContainText('Burst: 5 fighters, unaware');
  await expect(sat.getByTestId('satellite-inset')).toHaveCount(1); // the picture stays up
  await expect(page.getByTestId('comms-feed')).toContainText('E3 collection complete (burst): 5 fighters, unaware');
  await expect(page.getByTestId('square-facts')).toContainText(/Contacts\s*\d+ · .*checkpoint/i);
  await expect.poll(() => hasEvent(page, 'contact', 'E3')).toBe(true);
  const act = card.getByTestId('strike-menu');
  await expect(act.getByTestId('event-card')).toContainText('CONTACT · E3');
  await expect(sat.getByTestId('strike-menu')).toHaveCount(0); // nothing to strike in ORION-3
  await act.getByTestId('send-team').scrollIntoViewIfNeeded();
  await expect(act.getByTestId('fire-sniper')).toBeVisible();
  if (!isMobile) await expect(act.getByTestId('send-team')).toBeInViewport({ ratio: 1 });
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

test('a fighter in ORION-3\u2019s picture opens its square\u2019s anchor, with the strikes; there\u2019s no Strike button (ILI-1250, ILI-1302)', async ({ page, isMobile }) => {
  await start(page, '?debug');
  await page.waitForFunction(() => window.game);
  await freeze(page);
  const sat = page.getByTestId('satellite');
  await photo(page, 'E3'); // finds the checkpoint
  await page.evaluate(() => window.game.closeSquare());
  await page.evaluate(() => window.game.lookAt('E3')); // ORION-3 back over it, its picture up
  if (isMobile) await page.getByTestId('tab-orion').click();
  await expect(sat.getByTestId('strike-menu')).toHaveCount(0);
  const pins = sat.getByTestId('target-pin');
  await expect(pins).toHaveCount(5); // one per fighter it saw
  await pins.first().click();
  const card = page.getByTestId('square-card');
  await expect(card).toHaveAttribute('data-square', 'E3');
  await expect(card.getByTestId('strike-menu').getByTestId('fire-drone')).toBeVisible();
  await expect(sat.getByTestId('strike-menu')).toHaveCount(0);
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

test('over the square already: its anchor says so, and the shots are in ORION-3; a different square gets eyes on it (ILI-1250, ILI-1302)', async ({ page, isMobile }) => {
  await start(page, '?debug');
  await page.waitForFunction(() => window.game);
  await freeze(page);
  const sat = page.getByTestId('satellite');
  await photo(page, 'E3');
  await page.evaluate(() => window.game.selectSquare('E3'));
  const eyes = page.getByTestId('square-card').getByTestId('look-here');
  await expect(eyes).toBeDisabled();
  await expect(eyes).toContainText('ORION-3 is over E3');
  if (isMobile) await page.getByTestId('tab-orion').click();
  await sat.getByTestId('capture-photo').click();
  await expect(sat.getByTestId('satellite-result')).toContainText('Photo:');
  // A different square: Get eyes on it.
  await page.evaluate(() => window.game.selectSquare('F4'));
  await expect(eyes).toBeEnabled();
  await expect(eyes).toContainText('Get eyes on F4');
});

test('standing by, ORION-3 names the next square ahead with no imagery (ILI-1272)', async ({ page, isMobile }) => {
  await start(page, '?debug');
  await page.waitForFunction(() => window.game?.get().team.holdFor);
  if (isMobile) await page.getByTestId('tab-orion').click();
  await expect(page.getByTestId('orion-placeholder')).toHaveText('Standing by over G5 · no imagery of F4 ahead');
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

test('a photo\'s fighters are counted at the square (ILI-1270, ILI-1302)', async ({ page, isMobile }) => {
  await start(page, '?debug');
  await page.waitForFunction(() => window.game);
  await freeze(page);
  await page.evaluate(() => {
    const g = window.game;
    g.selectSquare('E3');
    g.lookAt('E3');
    for (let i = 0; i < 300 && g.get().satellite.state === 'slewing'; i++) g.tick(100);
    g.capture('photo');
    g.tick(3000);
  });
  if (isMobile) await page.getByTestId('tab-orion').click();
  const n = await page.getByTestId('target-pin').count();
  expect(n).toBeGreaterThan(0);
  // Said at the square, over its strikes (ILI-1302).
  await expect(page.getByTestId('square-card').getByTestId('fighters-marked')).toHaveText(`${n} ${n === 1 ? 'fighter' : 'fighters'} marked`);
});
