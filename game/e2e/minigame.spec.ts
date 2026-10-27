import { expect, test } from '@playwright/test';
import { freeze, squarePoint, tapAt } from './helpers';

test('the grid scan dims the map to its targets; tapping them in order wins it', async ({ page, isMobile }) => {
  test.setTimeout(60_000); // a dozen real taps, and CI taps slowly
  await page.goto('?debug');
  await page.waitForFunction(() => window.game);
  await freeze(page);
  await page.evaluate(() => window.game.startMiniGame('gridScan', 'D3'));

  const panel = page.getByTestId('minigame');
  await expect(panel).toContainText('SATELLITE GRID SCAN · D3');
  await expect(panel).toContainText('Tap the squares in order');
  await expect(page.getByTestId('map-views')).toHaveCount(0);

  const targets = await page.evaluate(() => window.game.get().minigame!.targets);
  for (const [i, id] of targets.entries()) {
    const col = id.charCodeAt(0) - 65;
    const row = Number(id.slice(1)) - 1;
    await tapAt(page, isMobile, await squarePoint(page, col, row));
    if (i < targets.length - 1) await expect(page.getByTestId('minigame-progress')).toHaveText(`${i + 1}/${targets.length}`);
  }
  await expect(panel).toHaveAttribute('data-status', 'won');
  await expect(page.getByTestId('minigame-result')).toContainText('Scan complete');
  await panel.getByRole('button', { name: 'Close' }).click();
  await expect(panel).toHaveCount(0);
  await expect(page.getByTestId('map-views')).toBeVisible();
});

test('Abort fails the scan', async ({ page }) => {
  await page.goto('?debug');
  await page.waitForFunction(() => window.game);
  await page.evaluate(() => window.game.startMiniGame('gridScan', 'B2'));
  await page.getByTestId('minigame').getByRole('button', { name: 'Abort' }).click();
  await expect(page.getByTestId('minigame')).toHaveAttribute('data-status', 'lost');
  await expect(page.getByTestId('minigame-result')).toContainText('Scan failed');
});
