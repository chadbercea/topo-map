import { expect, test } from '@playwright/test';
import { fastForward, freeze, lockOn, running, squarePoint, start, tapAt, untilTraffic } from './helpers';

// What happens on a square stays with the square (ILI-1367): Scan is in its menu, and the mini
// game plays there. The satellite is the player's avatar (ILI-1397): on a square it isn't over,
// the menu is the move step; locked on, the square's actions.

test('a square ORION-3 is not over has no menu; a tap sends ORION-3, and on arrival the menu opens with Scan (ILI-1397, ILI-1437)', async ({ page, isMobile }) => {
  await start(page, '?debug');
  await running(page);
  await freeze(page);
  await tapAt(page, isMobile, await squarePoint(page, 5, 3)); // F4
  const anchor = page.getByTestId('square-anchor');
  await expect(page.getByTestId('selected-square')).toHaveText('F4');
  await expect(anchor).toHaveCount(0); // nothing until ORION-3 is over it
  expect(await page.evaluate(() => window.game.get().satellite.aim)).toBe('F4'); // on its way
  await fastForward(page, 30_000);
  await expect(anchor).toHaveAttribute('data-locked', 'true');
  await expect(anchor.getByTestId('lock-status')).toHaveText('ORION-3 locked on');
  const scan = anchor.getByTestId('scan-square');
  await expect(scan).toContainText('Scan F4');
  await scan.click();
  await expect.poll(() => page.evaluate(() => !!window.game.get().imagery.F4)).toBe(true);
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

test('ALPHA asking for imagery cues Scan on that square', async ({ page }) => {
  await start(page, '?debug');
  await running(page);
  await freeze(page);
  await lockOn(page, 'F2');
  await page.evaluate(() => window.game.addEvent({ id: 'imagery-F2-1', kind: 'request', square: 'F2', title: 'ALPHA requests imagery' }));
  await page.evaluate(() => window.game.selectSquare('F2'));
  const anchor = page.getByTestId('square-anchor');
  await expect(anchor).toContainText('ALPHA requests imagery');
  await expect(anchor.getByTestId('scan-square')).toHaveAttribute('data-cue', 'true');
});

test('the radio mini game plays in its square’s menu, at C2', async ({ page }) => {
  test.setTimeout(60_000);
  await start(page, '?debug');
  await page.waitForFunction(() => window.game);
  await freeze(page);
  await untilTraffic(page);
  await page.getByTestId('prompt').locator('[data-response=satellite]').click(); // ORION-3 listens (ILI-1435)
  await page.evaluate(() => {
    for (let i = 0; i < 400 && !window.game.get().minigame; i++) window.game.tick(100);
  });
  const anchor = page.getByTestId('square-anchor');
  await expect(anchor).toHaveAttribute('data-square', 'C2');
  await expect(anchor).toHaveAttribute('data-minigame', 'signal');
  await expect(anchor.getByTestId('minigame')).toContainText('LISTEN · C2');
});
