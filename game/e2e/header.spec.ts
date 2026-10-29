import { expect, test } from '@playwright/test';
import { fastForward } from './helpers';

test('the mission panel: the deadline, the race, what to do, what needs HQ (ILI-1216, ILI-1245)', async ({ page, isMobile }) => {
  await page.goto('?debug');
  // The mission and its progress run along the map's foot; the clock sits in the widget.
  const strip = page.getByTestId('mission-strip');
  await expect(strip).toContainText('BLACK BOX');
  await expect(page.getByTestId('mission-timer').getByTestId('clock')).toBeVisible();
  await expect(strip.getByTestId('objective')).toBeAttached();
  // The race: time left on top, ALPHA's route under it with A, B and C marked.
  const race = page.getByTestId('race');
  await expect(race.locator('li')).toHaveText(['A', 'B', 'C']);
  await expect(race).toHaveAttribute('data-behind', 'false');
  await expect(page.getByTestId('objective')).toContainText('Recover the black box at D3');
  await page.waitForFunction(() => window.game?.get().team.holdFor);
  await expect(page.getByTestId('needs-hq')).toHaveText('ALPHA waiting on your call'); // only the most pressing
  await fastForward(page, 15_000);
  await expect(page.getByTestId('clock')).toHaveText(/^9:4[0-5]$/);

  if (isMobile) return; // the ground and weather wait for a wider screen
  await expect(page.getByTestId('weather')).toContainText('High cloud');
  // A square's ground is on its card, not in the widget (ILI-1220).
  await expect(page.getByTestId('ground')).toHaveCount(0);
  await page.evaluate(() => window.game.selectSquare('E2'));
  await expect(page.getByTestId('square-elevation')).toHaveText(/^\d+–\d+ m$/);
  await expect(page.getByTestId('square-facts')).toContainText(/Features\s*town/);
});
