import { expect, test } from '@playwright/test';
import { fastForward, freeze, openEvent, running, start } from './helpers';

// What happens on a square stays with the square (ILI-1367): Scan is in its menu, and the mini
// game plays there. Reposition stays ORION-3's own control.

test('picking any square opens its menu with Scan, which takes the photo on arrival', async ({ page }) => {
  await start(page, '?debug');
  await running(page);
  await freeze(page);
  await page.evaluate(() => window.game.selectSquare('F4'));
  const anchor = page.getByTestId('square-anchor');
  await expect(anchor).toHaveAttribute('data-square', 'F4');
  const scan = anchor.getByTestId('scan-square');
  await expect(scan).toContainText('Scan F4');
  await scan.click();
  await expect(scan).toContainText('Scanning F4');
  await fastForward(page, 60_000);
  await expect.poll(() => page.evaluate(() => !!window.game.get().imagery.F4)).toBe(true);
});

test('ALPHA asking for imagery cues Scan on that square', async ({ page }) => {
  await start(page, '?debug');
  await running(page);
  await freeze(page);
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
  await fastForward(page, 83_000);
  await openEvent(page, 'signal', 'C2');
  await page.getByRole('button', { name: 'Listen' }).click();
  const anchor = page.getByTestId('square-anchor');
  await expect(anchor).toHaveAttribute('data-square', 'C2');
  await expect(anchor).toHaveAttribute('data-minigame', 'signal');
  await expect(anchor.getByTestId('minigame')).toContainText('LISTEN · C2');
});
