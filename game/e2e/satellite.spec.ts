import { expect, test } from '@playwright/test';
import { fastForward, freeze, start, untilOnStation, hasEvent, photo, worldToScreen, running } from './helpers';

test('pick a square, Reposition: ORION-3 moves, then on station the shots take its place (ILI-1219, ILI-1250)', async ({ page, isMobile }) => {
  test.setTimeout(60_000); // a long flow, and CI's software renderer draws ORION-3's picture too
  await start(page, '?debug');
  await page.waitForFunction(() => window.game);
  await freeze(page);
  const sat = page.getByTestId('satellite');
  await expect(page.getByTestId('satellite-status')).toHaveText('ORION-3 over G5');
  // E3 is off screen on a phone (the camera stays on ALPHA); map.spec covers tapping squares.
  await page.evaluate(() => window.game.selectSquare('E3'));
  if (isMobile) await page.getByTestId('tab-orion').click(); // a picked square folds the sheet on a phone (ILI-1397)
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

  // ORION-3 repositions: one countdown, on its state line (ILI-1400), and nothing to press.
  // On a fold or phone its tab comes forward.
  const moving = sat.getByTestId('orion-state');
  await expect(moving).toHaveText(/^Repositioning · → E3 · \d+:\d\d$/);
  await expect(sat.getByTestId('orion-placeholder')).toContainText('On its way to E3, then take the photo');
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
  await expect(moving).toHaveText('On station · E3');
  await expect(sat.getByTestId('orion-placeholder')).toHaveCount(0);
  const picture = sat.getByTestId('satellite-inset');
  await expect(picture).toBeVisible();
  await expect(sat.getByTestId('capture-modes').getByRole('button')).toHaveCount(2); // Photo and Video: no burst (ILI-1314)
  await expect(sat.getByTestId('look-here')).toHaveCount(0); // the shots took its place
  await sat.getByTestId('capture-video').click();
  await expect(sat).toHaveAttribute('data-state', 'capturing');
  await expect(picture).toHaveAttribute('data-state', 'capturing');
  await fastForward(page, 15_100);

  // What it saw stays in the panel; the find is on the card, the strikes beside it.
  await expect(sat.getByTestId('satellite-result')).toContainText(/Video: 5 fighters/);
  await expect(sat.getByTestId('satellite-inset')).toHaveCount(1); // the picture stays up
  await expect(page.getByTestId('comms-feed')).toContainText(/E3 collection complete \(video\): 5 fighters.*Analysts: live feed to ALPHA/);
  await expect(page.getByTestId('square-facts')).toContainText(/Contacts\s*\d+ · .*checkpoint/i);
  await expect.poll(() => hasEvent(page, 'contact', 'E3')).toBe(true);
  // The strikes aren't ORION-3's: they're at the square, in its anchor on the map (ILI-1302, ILI-1308).
  await expect(page.getByTestId('action-panel')).toHaveCount(0); // nothing else to do here
  await expect(sat.getByTestId('strike-menu')).toHaveCount(0);
  const act = page.getByTestId('square-anchor').getByTestId('strike-menu');
  await expect(card.getByTestId('event-card')).toHaveCount(0);
  await expect(act.getByTestId('event-card')).toContainText('CONTACT · E3');
  await act.getByTestId('fire-sniper').scrollIntoViewIfNeeded();
  await expect(act.getByTestId('fire-sniper')).toBeVisible();
  await page.getByTestId('square-anchor').getByRole('button', { name: 'Close' }).click();
  await expect(card).toHaveCount(0); // closed: the look is filed
  await expect(page.getByTestId('satellite-status')).toHaveText('ORION-3 over E3');
});

test('a fighter in ORION-3\u2019s picture opens its square\u2019s strikes at the square; there\u2019s no Strike button (ILI-1250, ILI-1308)', async ({ page, isMobile }) => {
  await start(page, '?debug');
  await page.waitForFunction(() => window.game);
  await freeze(page);
  const sat = page.getByTestId('satellite');
  await page.evaluate(() => window.game.selectSquare('F4'));
  if (isMobile) await page.getByTestId('tab-orion').click(); // a picked square folds the sheet on a phone (ILI-1397)
  await expect(sat.getByTestId('look-here')).toBeEnabled();
  await photo(page, 'E3'); // finds the checkpoint
  await page.evaluate(() => window.game.selectSquare('E3'));
  await expect(sat.getByTestId('strike-menu')).toHaveCount(0);
  await expect(sat.getByTestId('strike-toggle')).toHaveCount(0);
  const pins = sat.getByTestId('target-pin');
  await expect(pins).toHaveCount(5); // one per fighter it saw
  await pins.first().click();
  const anchor = page.getByTestId('square-anchor');
  await expect(anchor).toHaveAttribute('data-square', 'E3');
  await expect(anchor.getByTestId('strike-menu').getByTestId('fire-drone')).toBeVisible();
  await expect(sat.getByTestId('strike-menu')).toHaveCount(0); // never in ORION-3
  await expect(page.getByTestId('square-card')).toHaveAttribute('data-square', 'E3'); // its details stay in ORION-3
});

test('a fighter on the map opens its strikes too (ILI-1250)', async ({ page, isMobile }) => {
  test.skip(isMobile, 'a phone taps them in ORION-3\u2019s picture');
  await start(page, '?debug');
  await page.waitForFunction(() => window.game);
  await freeze(page);
  await photo(page, 'E3');
  await page.evaluate(() => window.game.closeSquare());
  const spots = await page.evaluate(() => {
    const seen = window.game.get().imagery.E3!.seen[0];
    return seen.units.map((u) => ({ x: seen.x + ((u % 4) + 0.5) * 50, y: seen.y + (Math.floor(u / 4) + 0.5) * 50 }));
  });
  // A fighter in open map: the timer and the log button sit in the map's corner (ILI-1392, ILI-1393).
  let p = await worldToScreen(page, spots[0].x, spots[0].y);
  for (const s of spots) {
    const q = await worldToScreen(page, s.x, s.y);
    if (await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.tagName === 'CANVAS', q)) {
      p = q;
      break;
    }
  }
  await page.mouse.click(p.x, p.y);
  await expect(page.getByTestId('strike-menu').getByTestId('fire-sniper')).toBeVisible();
});

test('over a square it has already shot, no Reposition and no Rescan: the shots are there (ILI-1250)', async ({ page, isMobile }) => {
  await start(page, '?debug');
  await page.waitForFunction(() => window.game);
  await freeze(page);
  const sat = page.getByTestId('satellite');
  await photo(page, 'E3');
  await page.evaluate(() => window.game.selectSquare('E3'));
  if (isMobile) await page.getByTestId('tab-orion').click(); // a picked square folds the sheet on a phone (ILI-1397)
  await expect(sat.getByTestId('look-here')).toHaveCount(0);
  await sat.getByTestId('capture-photo').click();
  await expect(sat.getByTestId('satellite-result')).toContainText('Photo:');
  // A different square: back to Reposition.
  await page.evaluate(() => window.game.selectSquare('F4'));
  await expect(sat.getByTestId('look-here')).toHaveText(/^Reposition\s*to F4/);
  await expect(sat.getByTestId('capture-modes')).toHaveCount(0);
});

test('standing by, ORION-3 names the next square ahead with no imagery (ILI-1272)', async ({ page, isMobile }) => {
  await start(page, '?debug');
  await running(page);
  if (isMobile) await page.getByTestId('tab-orion').click();
  await expect(page.getByTestId('orion-placeholder')).toHaveText('Standing by over G5 · no imagery of F4 ahead');
});

test("a slew counts down once, on ORION-3's state line, then the photo (ILI-1269, ILI-1400)", async ({ page, isMobile }) => {
  await start(page, '?debug');
  await page.waitForFunction(() => window.game);
  await freeze(page);
  await page.evaluate(() => {
    window.game.selectSquare('E3');
    window.game.lookAt('E3');
  });
  if (isMobile) await page.getByTestId('tab-orion').click();
  const state = page.getByTestId('orion-state');
  await expect(state).toHaveText(/· 0:\d\d$/);
  const first = await state.textContent();
  await page.evaluate(() => window.game.tick(2000));
  await expect(state).not.toHaveText(first!);
  await expect(page.getByTestId('orion-placeholder')).toContainText('then take the photo');
  // One countdown in the panel: not in the frame, not on the button.
  await expect(page.getByTestId('orion-placeholder')).not.toContainText(/\d:\d\d/);
  await expect(page.getByTestId('look-here')).not.toContainText(/\d:\d\d/);
});

test('a photo says how many fighters it marked (ILI-1270)', async ({ page, isMobile }) => {
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
  await expect(page.getByTestId('square-anchor').getByTestId('fighters-marked')).toHaveText(`${n} ${n === 1 ? 'fighter' : 'fighters'} marked`);
});

test('ORION-3 never scrolls, and nothing in it moves through a scan; the picture stays up after the shot (ILI-1354, ILI-1400)', async ({ page, isMobile }) => {
  test.skip(isMobile, 'a picked square folds the phone sheet (ILI-1397); the ladder spec covers the phone size');
  await start(page, '?debug');
  await page.waitForFunction(() => window.game);
  await freeze(page);
  const look = () =>
    page.evaluate(() => {
      const o = document.querySelector('[data-testid=satellite]')!;
      return { scroll: o.scrollHeight - o.clientHeight, buttons: Math.round(document.querySelector('[data-testid=orion-buttons]')!.getBoundingClientRect().top) };
    });
  const seen: { scroll: number; buttons: number }[] = [await look()];
  await page.evaluate(() => window.game.selectSquare('E3'));
  seen.push(await look());
  await page.evaluate(() => {
    window.game.lookAt('E3');
    window.game.tick(1000);
  });
  seen.push(await look());
  await page.evaluate(() => {
    const g = window.game;
    for (let i = 0; i < 300 && g.get().satellite.state === 'slewing'; i++) g.tick(100);
    g.capture('video');
    g.tick(2000);
  });
  seen.push(await look());
  await page.evaluate(() => {
    for (let t = 0; t < 30_000; t += 100) window.game.tick(100);
  });
  seen.push(await look());
  for (const s of seen) expect(s.scroll).toBe(0);
  expect(new Set(seen.map((s) => s.buttons)).size).toBe(1); // the buttons never move
  await expect(page.getByTestId('satellite-inset')).toHaveCount(1); // the zoomed square is still up
  await expect(page.getByTestId('satellite-result')).toContainText(/Video: 5 fighters/);
  await expect(page.getByTestId('square-anchor').getByTestId('square-card')).toHaveAttribute('data-square', 'E3'); // the square's details: its menu, tier three (ILI-1400)
});
