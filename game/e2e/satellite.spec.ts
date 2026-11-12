import { expect, test } from '@playwright/test';
import { fastForward, freeze, start, untilOnStation, hasEvent, photo, worldToScreen, running } from './helpers';

test('pick a square, Reposition: ORION-3 moves, then on station the shots take its place (ILI-1219, ILI-1250)', async ({ page, isMobile }) => {
  test.setTimeout(60_000); // a long flow, and CI's software renderer draws ORION-3's picture too
  await start(page, '?debug');
  await page.waitForFunction(() => window.game);
  await page.waitForFunction(() => window.game.get().elapsedMs > 0); // the first tick: ALPHA's eyes give ORION-3 a look at G5
  await freeze(page);
  const sat = page.getByTestId('satellite');
  await expect(page.getByTestId('satellite-status')).toHaveText('ORION-3 over G5');
  // E3 is off screen on a phone (the camera stays on ALPHA); map.spec covers tapping squares.
  await page.evaluate(() => window.game.selectSquare('E3'));
  if (isMobile) await page.getByTestId('tab-orion').click(); // a picked square folds the sheet on a phone (ILI-1397)
  // Picking a square ORION-3 isn't over opens no menu (ILI-1437); ORION-3 offers Reposition.
  const card = page.getByTestId('square-card');
  await expect(page.getByTestId('square-anchor')).toHaveCount(0);
  // The picture stays on the square ORION-3 is over (ILI-1428): picking E3 doesn't move it.
  await expect(page.getByTestId('satellite-inset')).toHaveAttribute('aria-label', /picture of G5$/);
  // Not over E3 yet: Reposition in ORION-3's header, and the shots unlit under the picture (ILI-1465).
  await expect(page.getByTestId('look-here')).toHaveText(/^⇄ Reposition\s*to E3 · \d+:\d\d$/);
  await expect(sat.getByTestId('capture-scan')).toBeDisabled();
  await page.getByTestId('look-here').click();

  // ORION-3 repositions: one countdown, on its state line (ILI-1400), and nothing to press.
  // On a fold or phone its tab comes forward.
  const moving = sat.getByTestId('orion-state');
  await expect(moving).toHaveText(/^Repositioning · → E3 · \d+:\d\d$/);
  await expect(sat.getByTestId('orion-placeholder')).toContainText('On its way to E3, then take the photo');
  // The button row keeps its place under the picture, unlit while it moves; Reposition reads Moving.
  await expect(sat.getByTestId('capture-scan')).toBeDisabled();
  await expect(sat.getByTestId('capture-scan')).toContainText('on its way');
  await expect(sat.getByTestId('look-here')).toBeDisabled();
  await expect(sat.getByTestId('look-here')).toHaveText('Moving');
  await expect(sat.getByRole('button', { name: 'Cancel' })).toHaveCount(0); // no Cancel
  await expect(page.getByTestId('satellite-status')).toContainText('ORION-3 to E3');
  await expect(page.getByTestId('square-anchor')).toHaveCount(0); // its menu waits for the lock (ILI-1437)
  await untilOnStation(page);

  // On station the panel opens up: the larger square, and the ways to look.
  await expect(sat).toHaveAttribute('data-state', 'onStation');
  await expect(moving).toHaveText('On station · E3');
  await expect(sat.getByTestId('orion-placeholder')).toHaveCount(0);
  const picture = sat.getByTestId('satellite-inset');
  await expect(picture).toBeVisible();
  // Scan is the primary action (ILI-1432), lit and cued; Photo and Video wait for it (ILI-1465).
  await expect(sat.getByTestId('capture-modes').getByRole('button')).toHaveText([/^Scan E3/, /^Photo/, /^Video/, /^Strike/]);
  await expect(sat.getByTestId('capture-scan')).toHaveAttribute('data-cue', 'true');
  await expect(sat.getByTestId('capture-video')).toBeDisabled();
  await expect(sat.getByTestId('look-here')).toBeDisabled(); // it's there already
  await sat.getByTestId('capture-scan').click();
  await expect(sat.getByTestId('capture-scan')).toBeDisabled();
  await expect(sat.getByTestId('capture-video')).toBeEnabled();
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
  // The strikes are ORION-3's (ILI-1467): its Strike opens them in a flyout beside it; none at the square.
  await expect(page.getByTestId('action-panel')).toHaveCount(0); // nothing else to do here
  await expect(page.getByTestId('square-anchor').getByTestId('strike-menu')).toHaveCount(0);
  await sat.getByTestId('capture-strike').click();
  const act = page.getByTestId('strike-flyout').getByTestId('strike-menu');
  await expect(card.getByTestId('event-card')).toHaveCount(0);
  await expect(act.getByTestId('event-card')).toContainText('CONTACT · E3');
  await act.getByTestId('fire-sniper').scrollIntoViewIfNeeded();
  await expect(act.getByTestId('fire-sniper')).toBeVisible();
  await page.getByTestId('square-anchor').getByRole('button', { name: 'Close' }).click();
  await expect(page.getByTestId('square-anchor')).toHaveCount(0); // closed: the look is filed
  await expect(card).toHaveAttribute('data-square', 'E3'); // ORION-3 is still over it: its details stay in its view (ILI-1438)
  await expect(page.getByTestId('satellite-status')).toHaveText('ORION-3 over E3');
});

test('ORION-3\u2019s Strike is lit only over a square with fighters in view; a fighter\u2019s panel opens the same flyout (ILI-1444, ILI-1467)', async ({ page, isMobile }) => {
  await start(page, '?debug');
  await page.waitForFunction(() => window.game);
  await freeze(page);
  const sat = page.getByTestId('satellite');
  await page.evaluate(() => window.game.selectSquare('F4'));
  if (isMobile) await page.getByTestId('tab-orion').click(); // a picked square folds the sheet on a phone (ILI-1397)
  await expect(sat.getByTestId('look-here')).toBeEnabled();
  await photo(page, 'E3'); // finds the checkpoint
  await page.evaluate(() => window.game.selectSquare('E3'));
  await expect(page.getByTestId('strike-flyout')).toHaveCount(0);
  await expect(sat.getByTestId('capture-strike')).toBeEnabled(); // locked on E3, fighters in a fresh look
  const pins = sat.getByTestId('target-pin');
  await expect(pins).toHaveCount(5); // one per fighter it saw
  // A click in ORION-3's picture pins his full panel there (ILI-1444); its Strike opens the square's strikes.
  await page.evaluate(() => window.game.tick(100)); // ORION-3's live feed over E3
  await pins.first().click();
  const panel = page.locator('.sighting-panel[data-kind=hostile][data-pinned]');
  await expect(panel.getByTestId('panel-tango')).toHaveText(/^HOSTILE · TANGO-\d+$/);
  await expect(panel.getByTestId('panel-weapon')).not.toHaveText('█████'); // ORION-3 is over him: his weapon shows
  await panel.getByTestId('panel-strike').click();
  await expect(page.getByTestId('strike-flyout').getByTestId('fire-drone')).toBeVisible();
  await expect(page.getByTestId('square-anchor').getByTestId('strike-menu')).toHaveCount(0); // never at the square
  await expect(page.getByTestId('square-card')).toHaveAttribute('data-square', 'E3'); // its details stay in ORION-3
  // Firing closes the flyout; ORION-3's picture goes to targeting while the strike plays out.
  await page.getByTestId('fire-drone').click();
  await expect(page.getByTestId('strike-flyout')).toHaveCount(0);
  await expect(sat.getByTestId('targeting')).toContainText(/Targeting · Drone · REAPER-1/i);
  await expect(sat.getByTestId('targeting-line')).toHaveText(/^Impact 0:\d\d$/);
  await expect(sat.getByTestId('capture-strike')).toBeDisabled();
});

test('a fighter on the map opens its strikes too, from his pinned panel (ILI-1250, ILI-1411)', async ({ page, isMobile }) => {
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
  await page.mouse.move(p.x, p.y); // on the main map: a one-line tag (ILI-1443)
  await expect(page.locator('.sighting-panel[data-kind=hostile]').getByTestId('panel-tag')).toHaveText(/^HOSTILE · TANGO-\d+$/);
  await page.mouse.click(p.x, p.y); // a click picks his square: ORION-3 is over it, so its Strike is lit
  await page.getByTestId('capture-strike').click();
  await expect(page.getByTestId('strike-flyout').getByTestId('fire-sniper')).toBeVisible();
});

test('over a square it has already shot, no Reposition and no Rescan: the shots are there (ILI-1250)', async ({ page, isMobile }) => {
  await start(page, '?debug');
  await page.waitForFunction(() => window.game);
  await freeze(page);
  const sat = page.getByTestId('satellite');
  await photo(page, 'E3');
  await page.evaluate(() => window.game.selectSquare('E3'));
  if (isMobile) await page.getByTestId('tab-orion').click(); // a picked square folds the sheet on a phone (ILI-1397)
  await expect(sat.getByTestId('look-here')).toBeDisabled();
  // Already scanned and its intel sent (ILI-1432): Photo reads "sent", Video is there to press.
  await expect(sat.getByTestId('capture-photo')).toBeDisabled();
  await expect(sat.getByTestId('capture-photo')).toContainText('sent to ALPHA');
  await expect(sat.getByTestId('capture-video')).toBeEnabled();
  await expect(sat.getByTestId('capture-scan')).toBeDisabled(); // no Rescan: it's settled
  await expect(sat.getByTestId('capture-scan')).toContainText('settled');
  // A different square: Reposition lights up.
  await page.evaluate(() => window.game.selectSquare('F4'));
  await expect(sat.getByTestId('look-here')).toHaveText(/^⇄ Reposition\s*to F4/);
});

test('standing by, ORION-3 shows the square it is over; the next square ahead has no imagery (ILI-1272, ILI-1428)', async ({ page, isMobile }) => {
  await start(page, '?debug');
  await running(page);
  if (isMobile) await page.getByTestId('tab-orion').click();
  // Over G5 it shows G5, which ALPHA's own eyes have imaged (ILI-1428); ahead, F4 has nothing yet.
  await expect(page.getByTestId('satellite-inset')).toHaveAttribute('aria-label', /picture of G5$/);
  expect(await page.evaluate(() => !!window.game.get().imagery.F4)).toBe(false);
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
  await expect.poll(() => page.getByTestId('target-pin').count()).toBeGreaterThan(0); // the map brackets them on its next frame
  const n = await page.getByTestId('target-pin').count();
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
    g.scan('E3'); // video comes after the scan (ILI-1432)
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
  await expect(page.getByTestId('orion-detail').getByTestId('square-card')).toHaveAttribute('data-square', 'E3'); // the square's details: ORION-3's view (ILI-1438)
});
