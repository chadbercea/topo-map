import { expect, test } from '@playwright/test';
import { start } from './helpers';

test('the mission clock starts at four hours of game time, and ?minutes= tunes it', async ({ page }) => {
  await start(page);
  await expect(page.getByTestId('clock')).toHaveText(/^(4:00|3:5\d)$/);
  await start(page, '?minutes=8');
  await expect(page.getByTestId('clock')).toHaveText(/^(5:20|5:1\d)$/);
});
