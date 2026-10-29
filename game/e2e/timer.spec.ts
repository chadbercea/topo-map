import { expect, test } from '@playwright/test';
import { start } from './helpers';

test('the mission clock starts at ten real minutes, and ?minutes= tunes it', async ({ page }) => {
  await start(page);
  await expect(page.getByTestId('clock')).toHaveText(/^(10:00|9:5\d)$/);
  await start(page, '?minutes=8');
  await expect(page.getByTestId('clock')).toHaveText(/^(8:00|7:5\d)$/);
});
