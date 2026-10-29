import { expect, test } from '@playwright/test';
import { squarePoint, start, tapAt } from './helpers';

test('a new event marks its square on the map; tapping the marker opens its square card beside it (ILI-1225)', async ({ page, isMobile }) => {
  await start(page, '?debug');
  await page.waitForFunction(() => window.game);
  await page.evaluate(() => window.game.addEvent({ id: 't', kind: 'contact', square: 'E2', title: 'Test contact' }));
  await expect(page.getByTestId('alerts')).toHaveCount(0); // no strip under the header any more

  // No intel stream any more: the task is a marker on its square (ILI-1225).
  const status = () => page.evaluate(() => window.game.get().events.find((e) => e.id === 't')?.status);
  await expect.poll(status).toBe('new');
  await expect(page.getByTestId('blockers')).not.toContainText('Test contact'); // not in the header any more

  // Marker sits in the square's top-right quarter (E2 = col 4, row 1; clear of the status widget).
  await tapAt(page, isMobile, await squarePoint(page, 4, 1, 0.25, -0.25));
  const card = page.getByTestId('square-card');
  await expect(card).toBeVisible(); // recon on the card; what to do about it beside it (ILI-1211)
  await expect(page.getByTestId('action-panel').getByTestId('event-card')).toContainText('Test contact');
  await expect.poll(status).toBe('seen'); // seen, so no longer flagged
  await expect(page.getByTestId('selected-square')).toHaveText('E2'); // the event opens its square's card

  if (!isMobile) {
    // Beside its square: the card's near edge is within a square's width of E2.
    const box = (await card.boundingBox())!;
    const e2 = await squarePoint(page, 4, 1);
    const side = await card.getAttribute('data-side');
    const near = side === 'left' ? box.x + box.width : box.x; // the edge that faces the square
    expect(Math.abs(near - e2.x)).toBeLessThan(140);
    expect(box.y).toBeLessThan(e2.y + 120);
  }

  await card.getByRole('button', { name: 'Close' }).click();
  await expect(card).toHaveCount(0);
  await expect(page.getByTestId('action-panel')).toHaveCount(0); // closing the card closes both
});

test('a report line that names a square in COMMS opens that square (ILI-1225)', async ({ page, isMobile }) => {
  await start(page, '?debug');
  await page.waitForFunction(() => window.game);
  await page.evaluate(() => window.game.addEvent({ id: 'r', kind: 'request', square: 'F2', title: 'Need imagery' }));
  await page.evaluate(() => {
    const s = window.game.get();
    window.game.set({ ...s, comms: { ...s.comms, messages: [...s.comms.messages, { id: 'hq-f2', from: 'HQ', text: 'Imagery wanted at F2.', atMs: s.elapsedMs, status: 'read', holds: false, square: 'F2' }] } });
  });
  if (isMobile) await page.getByTestId('tab-satcom').click();
  await page.getByTestId('comms-feed').getByRole('button', { name: 'Imagery wanted at F2.' }).click();
  await expect(page.getByTestId('selected-square')).toHaveText('F2');
  await expect(page.getByTestId('action-panel').getByTestId('event-card')).toContainText('REQUEST · F2');
});
