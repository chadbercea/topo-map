import { expect, test } from '@playwright/test';
import { squarePoint, start, tapAt } from './helpers';

test('a new event lands inline in the intel stream and on its square; tapping the marker opens its square card beside it', async ({ page, isMobile }) => {
  await start(page, '?debug');
  await page.waitForFunction(() => window.game);
  await page.evaluate(() => window.game.addEvent({ id: 't', kind: 'contact', square: 'G2', title: 'Test contact' }));
  await expect(page.getByTestId('alerts')).toHaveCount(0); // no strip under the header any more

  const flag = page.getByTestId('new-event');
  await expect(flag).toContainText(/CONTACT\s*G2/);
  await expect(flag).toContainText('Test contact');
  await expect(page.getByTestId('blockers')).not.toContainText('Test contact'); // not in the header any more

  // Marker sits in the square's top-right quarter (G2 = col 6, row 1).
  await tapAt(page, isMobile, await squarePoint(page, 6, 1, 0.25, -0.25));
  const card = page.getByTestId('square-card');
  await expect(card).toBeVisible(); // recon on the card; what to do about it beside it (ILI-1211)
  await expect(page.getByTestId('action-panel').getByTestId('event-card')).toContainText('Test contact');
  await expect(flag).toHaveCount(0); // seen, so no longer flagged
  await expect(page.getByTestId('selected-square')).toHaveText('G2'); // the event opens its square's card

  if (!isMobile) {
    // Beside its square: the card's near edge is within a square's width of G2.
    const box = (await card.boundingBox())!;
    const g2 = await squarePoint(page, 6, 1);
    const side = await card.getAttribute('data-side');
    const near = side === 'left' ? box.x + box.width : box.x; // the edge that faces the square
    expect(Math.abs(near - g2.x)).toBeLessThan(140);
    expect(box.y).toBeLessThan(g2.y + 120);
  }

  await card.getByRole('button', { name: 'Close' }).click();
  await expect(card).toHaveCount(0);
  await expect(page.getByTestId('action-panel')).toHaveCount(0); // closing the card closes both
});

test('opening it from the intel stream opens the same card', async ({ page }) => {
  await start(page, '?debug');
  await page.waitForFunction(() => window.game);
  await page.evaluate(() => window.game.addEvent({ id: 'r', kind: 'request', square: 'F2', title: 'Need imagery' }));
  await page.getByTestId('new-event').click();
  await expect(page.getByTestId('action-panel').getByTestId('event-card')).toContainText('REQUEST · F2');
});
