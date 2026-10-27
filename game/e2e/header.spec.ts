import { expect, test } from '@playwright/test';
import { fastForward } from './helpers';

test('the header anchors the mission: deadline, progress, what to do, what is in the way', async ({ page, isMobile }) => {
  await page.goto('?debug');
  const header = page.getByTestId('mission-timer');
  await expect(header).toContainText('BLACK BOX');
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
  await expect(page.getByTestId('ground')).toContainText('G5'); // where ALPHA is
  await page.evaluate(() => window.game.selectSquare('E2'));
  await expect(page.getByTestId('ground')).toContainText(/E2 \d+–\d+ m/);
  await expect(page.getByTestId('ground')).toContainText('town');
});
