import { expect, test } from '@playwright/test';
import { fastForward, freeze, lockOn, running, squarePoint, start, tapAt } from './helpers';

// The square's panel shows its details (ILI-1466); every satellite action is ORION-3's (ILI-1459):
// a tap sends ORION-3, and Scan is in ORION-3, not on the square. The mini game has its own panel (ILI-1547).

test('a tap opens the square\u2019s flyout and sends ORION-3; Scan is in ORION-3; the report lands on the square (ILI-1466, ILI-1475)', async ({ page, isMobile }) => {
  await start(page, '?debug');
  await running(page);
  await freeze(page);
  await tapAt(page, isMobile, await squarePoint(page, 5, 3)); // F4
  const anchor = page.getByTestId('square-anchor');
  await expect(page.getByTestId('selected-square')).toHaveText('F4');
  await expect(anchor.getByTestId('lock-status')).toHaveText(/^SLEWING · F4 · \d:\d\d$/); // its flyout opens at once (ILI-1475), counting ORION-3 in
  expect(await page.evaluate(() => window.game.get().satellite.aim)).toBe('F4'); // on its way
  await fastForward(page, 30_000);
  await expect(anchor).toHaveAttribute('data-locked', 'true');
  await expect(anchor.getByTestId('lock-status')).toHaveText('ORION-3 locked on');
  // Read-only: no intel until something has looked, and no Scan here.
  await expect(anchor.getByTestId('intel-none')).toBeVisible(); // nothing to act on here yet
  await expect(anchor.getByRole('button', { name: /scan/i })).toHaveCount(0);
  if (isMobile) await page.getByTestId('tab-orion').click();
  await page.getByTestId('satellite').getByTestId('capture-scan').click();
  await expect.poll(() => page.evaluate(() => !!window.game.get().imagery.F4)).toBe(true);
  // The square's flyout owns the report (ILI-1548); ORION-3 has no Analysis block.
  await expect(page.getByTestId('satellite').getByTestId('square-intel')).toHaveCount(0);
  await expect(anchor.getByTestId('intel-list')).toBeVisible();
});

test('the menu grows out of the square’s edge (ILI-1397)', async ({ page, isMobile }) => {
  test.skip(isMobile, 'on a phone the menu is a strip along the map’s foot');
  await start(page, '?debug');
  await running(page);
  await freeze(page);
  await lockOn(page, 'F4'); // the menu shows once ORION-3 is over it (ILI-1437)
  await page.evaluate(() => window.game.selectSquare('F4'));
  const box = (await page.getByTestId('square-anchor').boundingBox())!;
  const sq = await page.evaluate(() => {
    const el = document.querySelector('[data-testid=square-anchor]') as HTMLElement;
    return el.dataset.side;
  });
  expect(['right', 'left', 'below', 'above']).toContain(sq);
  await expect(page.getByTestId('anchor-leader')).toHaveCount(0); // flush: no leader line needed
  expect(box.width).toBeGreaterThan(0);
});

test('ALPHA asking for imagery shows on the square, and cues Scan in ORION-3', async ({ page, isMobile }) => {
  await start(page, '?debug');
  await running(page);
  await freeze(page);
  await lockOn(page, 'F2');
  await page.evaluate(() => window.game.addEvent({ id: 'imagery-F2-1', kind: 'request', square: 'F2', title: 'ALPHA requests imagery' }));
  await page.evaluate(() => window.game.selectSquare('F2'));
  const anchor = page.getByTestId('square-anchor');
  await expect(anchor).toContainText('ALPHA requests imagery');
  if (isMobile) await page.getByTestId('tab-orion').click();
  await expect(page.getByTestId('satellite').getByTestId('capture-scan')).toHaveAttribute('data-cue', 'true');
});
