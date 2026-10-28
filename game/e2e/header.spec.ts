import { expect, test } from '@playwright/test';
import { fastForward } from './helpers';

test('the status widget and the mission strip: deadline, progress, what to do, what is in the way (ILI-1216)', async ({ page, isMobile }) => {
  await page.goto('?debug');
  // The mission and its progress run along the map's foot; the clock sits in the widget.
  const strip = page.getByTestId('mission-strip');
  await expect(strip).toContainText('BLACK BOX');
  await expect(page.getByTestId('mission-timer').getByTestId('clock')).toBeVisible();
  await expect(strip.getByTestId('objective')).toBeAttached();
  await expect(page.getByTestId('phase-pips').locator('li[data-state="current"]')).toHaveCount(1);
  await expect(page.getByTestId('objective')).toContainText('Recover the black box at D3');
  await page.waitForFunction(() => window.game?.get().team.holdFor);
  await expect(page.getByTestId('blockers')).toContainText('ALPHA waiting on your call');
  await expect(page.getByTestId('blockers')).toContainText('No imagery ahead at F4');
  await fastForward(page, 3_000);
  await expect(page.getByTestId('clock')).toHaveText(/^3:5\d$/);

  if (isMobile) return; // the ground, weather and win conditions wait for a wider screen
  await expect(page.getByTestId('win-checks')).toContainText('5/5 alive');
  await expect(page.getByTestId('weather')).toContainText('High cloud');
  // A square's ground is on its card, not in the widget (ILI-1220).
  await expect(page.getByTestId('ground')).toHaveCount(0);
  await page.evaluate(() => window.game.selectSquare('E2'));
  await expect(page.getByTestId('square-elevation')).toHaveText(/^\d+–\d+ m$/);
  await expect(page.getByTestId('square-facts')).toContainText(/Features\s*town/);
});
