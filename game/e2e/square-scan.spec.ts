import { expect, test } from '@playwright/test';
import { fastForward, freeze, lockOn, running, squarePoint, start, tapAt, untilTraffic } from './helpers';

// The square's panel shows its details (ILI-1466); every satellite action is ORION-3's (ILI-1459):
// a tap sends ORION-3, and Scan is in ORION-3, not on the square. The mini game still plays there.

test('a tap opens the square\u2019s flyout and sends ORION-3; Scan is in ORION-3; the report lands on the square (ILI-1466, ILI-1475)', async ({ page, isMobile }) => {
  await start(page, '?debug');
  await running(page);
  await freeze(page);
  await tapAt(page, isMobile, await squarePoint(page, 5, 3)); // F4
  const anchor = page.getByTestId('square-anchor');
  await expect(page.getByTestId('selected-square')).toHaveText('F4');
  await expect(anchor.getByTestId('lock-status')).toHaveText(/ORION-3 on its way/); // its flyout opens at once (ILI-1475)
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
  // The scan report is ORION-3's, under its picture (ILI-1487); the flyout keeps what HQ can act on.
  await expect(page.getByTestId('satellite').getByTestId('intel-summary')).toHaveText(/^(clear|\d reports?)$/);
  await expect(anchor.getByTestId('square-intel')).toHaveCount(0);
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

test('the radio mini game plays in its square’s menu, at C2', async ({ page }) => {
  test.setTimeout(60_000);
  await start(page, '?debug');
  await page.waitForFunction(() => window.game);
  await freeze(page);
  await untilTraffic(page);
  await page.getByTestId('traffic-prompt').locator('[data-response=satellite]').click(); // ORION-3 listens (ILI-1435, ILI-1452)
  await page.evaluate(() => {
    for (let i = 0; i < 400 && !window.game.get().minigame; i++) window.game.tick(100);
  });
  const anchor = page.getByTestId('square-anchor');
  await expect(anchor).toHaveAttribute('data-square', 'C2');
  await expect(anchor).toHaveAttribute('data-minigame', 'signal');
  await expect(anchor.getByTestId('minigame')).toContainText('LISTEN · C2');
});
