import { expect, test } from '@playwright/test';
import { squarePoint, start, tapAt } from './helpers';

test('a new event flags an alert and a marker; tapping the marker opens its card', async ({ page, isMobile }) => {
  await start(page, '?debug');
  await page.waitForFunction(() => window.game);
  await page.evaluate(() => window.game.addEvent({ id: 't', kind: 'contact', square: 'G2', title: 'Test contact' }));

  const alerts = page.getByTestId('alerts');
  await expect(alerts).toContainText('CONTACT G2 · Test contact');

  // Marker sits in the square's top-right quarter (G2 = col 6, row 1), near ALPHA so it's on
  // screen on a phone too.
  await tapAt(page, isMobile, await squarePoint(page, 6, 1, 0.25, -0.25));
  const card = page.getByTestId('event-card');
  await expect(card).toContainText('Test contact');
  await expect(alerts).toHaveCount(0); // seen, so no longer flagged
  await expect(page.getByTestId('selected-square')).toHaveText('—'); // the marker took the tap

  await card.getByRole('button', { name: 'Close' }).click();
  await expect(card).toHaveCount(0);
});

test('tapping an alert opens the same card', async ({ page }) => {
  await start(page, '?debug');
  await page.waitForFunction(() => window.game);
  await page.evaluate(() => window.game.addEvent({ id: 'r', kind: 'request', square: 'F2', title: 'Need imagery' }));
  await page.getByTestId('alerts').getByRole('button').click();
  await expect(page.getByTestId('event-card')).toContainText('REQUEST · F2');
});
