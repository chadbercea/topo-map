import { expect, test } from '@playwright/test';
import { squarePoint, tapAt } from './helpers';

test('selecting a square offers a scan that spends from the pool, which recharges', async ({ page, isMobile }) => {
  await page.goto('?debug');
  await page.waitForFunction(() => window.game);
  await expect(page.getByTestId('resources')).toContainText('scans 3/3');
  await tapAt(page, isMobile, await squarePoint(page, 3, 2)); // D3
  const actions = page.getByTestId('square-actions');
  await expect(actions).toContainText('D3');
  await expect(actions).toContainText('no imagery');
  await actions.getByRole('button', { name: /Scan/ }).click();
  await expect(page.getByTestId('minigame')).toContainText('SATELLITE GRID SCAN · D3');
  await expect(page.getByTestId('resources')).toContainText('scans 2/3');
  await expect(page.getByTestId('resources')).toContainText(/\+1 in \d+s/);
});
