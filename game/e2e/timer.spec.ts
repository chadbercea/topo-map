import { expect, test } from '@playwright/test';

test('the mission clock starts at six minutes, and ?minutes= tunes it', async ({ page }) => {
  await page.goto('');
  await expect(page.getByTestId('clock')).toHaveText(/^0(6:00|5:5\d)$/);
  await page.goto('?minutes=8');
  await expect(page.getByTestId('clock')).toHaveText(/^0(8:00|7:5\d)$/);
});
