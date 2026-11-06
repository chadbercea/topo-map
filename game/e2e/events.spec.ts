import { expect, test } from '@playwright/test';
import { lockOn, squarePoint, start, tapAt } from './helpers';

test('a new event marks its square on the map; tapping the marker picks it: its details in ORION-3, its actions beside it (ILI-1228)', async ({ page, isMobile }) => {
  await start(page, '?debug');
  await page.waitForFunction(() => window.game);
  await lockOn(page, 'F4'); // ORION-3 over F4, so its actions show (ILI-1397)
  await page.evaluate(() => window.game.addEvent({ id: 't', kind: 'contact', square: 'F4', title: 'Test contact' }));
  await expect(page.getByTestId('alerts')).toHaveCount(0); // no strip under the header any more

  // No intel stream any more: the task is a marker on its square (ILI-1225).
  const status = () => page.evaluate(() => window.game.get().events.find((e) => e.id === 't')?.status);
  await expect.poll(status).toBe('new');
  await expect(page.getByTestId('needs-hq')).toHaveCount(0); // no mission panel any more (ILI-1392)

  // Marker sits in the square's top-right quarter (F4 = col 5, row 3: next to ALPHA, in view).
  await tapAt(page, isMobile, await squarePoint(page, 5, 3, 0.25, -0.25));
  if (isMobile) await page.getByTestId('tab-orion').click(); // a picked square folds the sheet on a phone (ILI-1397)
  const card = page.getByTestId('square-card');
  const act = page.getByTestId('action-panel');
  await expect(page.getByTestId('satellite').getByTestId('square-card')).toBeVisible(); // in ORION-3's panel
  await expect(act.getByTestId('event-card')).toContainText('Test contact');
  await expect.poll(status).toBe('seen'); // seen, so no longer flagged
  await expect(page.getByTestId('selected-square')).toHaveText('F4'); // the event picks its square

  if (!isMobile) {
    // The actions float beside the square (any side, ILI-1302): the anchor's nearest point
    // within a square's width of F4's centre, plus room for the marker's label it keeps clear of.
    const box = (await page.getByTestId('square-anchor').boundingBox())!;
    const f4 = await squarePoint(page, 5, 3);
    const dx = Math.max(box.x - f4.x, 0, f4.x - (box.x + box.width));
    const dy = Math.max(box.y - f4.y, 0, f4.y - (box.y + box.height));
    expect(Math.hypot(dx, dy)).toBeLessThan(220);
  }

  await card.getByRole('button', { name: 'Close' }).click();
  await expect(card).toHaveCount(0);
  await expect(act).toHaveCount(0); // unpicking the square closes its actions
});

test('a report line that names a square in COMMS opens that square (ILI-1225)', async ({ page, isMobile }) => {
  await start(page, '?debug');
  await page.waitForFunction(() => window.game);
  await lockOn(page, 'F2');
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
