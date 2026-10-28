import { expect, test } from '@playwright/test';
import { fastForward, freeze, start, untilOnStation, openAsk, linked } from './helpers';

test('pick a square, scan it, look on station: the larger square and the find on the card, the strikes beside it', async ({ page }) => {
  test.setTimeout(60_000); // a long flow, and CI's software renderer draws ORION-3's picture too
  await start(page, '?debug');
  await page.waitForFunction(() => window.game);
  await freeze(page);
  await expect(page.getByTestId('satellite-status')).toHaveText('ORION-3 over G5'); // the header's SAT line
  // E3 is off screen on a phone (the camera stays on ALPHA); map.spec covers tapping squares.
  await page.evaluate(() => window.game.selectSquare('E3'));
  // Picking a square pins its card: what HQ knows of it, and Scan. No picture yet.
  const card = page.getByTestId('square-card');
  await expect(card).toHaveAttribute('data-square', 'E3');
  await expect(page.getByTestId('square-status')).toHaveText('no imagery');
  await expect(page.getByTestId('square-facts')).toContainText(/Ground\s*\d+–\d+ m/);
  await expect(page.getByTestId('satellite-inset')).toHaveCount(0);
  await expect(page.getByTestId('look-here')).toHaveText(/Scan · \d+ min/);
  await page.getByTestId('look-here').click();

  // ORION-3 swings over: the countdown is in the card's header.
  await expect(page.getByTestId('square-status')).toHaveText(/ORION-3 \d+ min away/);
  await expect(page.getByTestId('satellite-status')).toContainText('ORION-3 to E3');
  await untilOnStation(page);
  // On station the card opens up to the larger square, with how to look under it.
  const sat = page.getByTestId('satellite');
  await expect(sat).toHaveAttribute('data-state', 'onStation');
  const picture = page.getByTestId('satellite-inset');
  await expect(picture).toBeVisible();
  const map = (await page.getByTestId('map-area').boundingBox())!;
  const box = (await card.boundingBox())!;
  expect(box.x + box.width).toBeLessThanOrEqual(map.x + map.width);
  await expect(card.getByTestId('capture-modes').getByRole('button')).toHaveCount(3);
  await page.getByTestId('capture-burst').click();
  await expect(sat).toHaveAttribute('data-state', 'capturing');
  await expect(picture).toHaveAttribute('data-state', 'capturing');
  await fastForward(page, 6_100);

  // The find, and what HQ can call in on it, right there.
  await expect(page.getByTestId('intel-items')).toContainText('E3 imaged (burst): 5 fighters, unaware'); // the contact's block on the card says what's there
  await expect(page.getByTestId('square-facts')).toContainText(/Found\s*.*checkpoint/i);
  await expect(page.getByTestId('intel-items')).toContainText(/CONTACT\s*E3/); // inline in the stream too
  // What to do about it is the action panel beside the card (ILI-1211), every strike in view.
  const act = page.getByTestId('action-panel');
  await expect(card.getByTestId('event-card')).toHaveCount(0);
  await expect(act.getByTestId('event-card')).toContainText('CONTACT · E3');
  await expect(act.getByTestId('fire-sniper')).toBeInViewport({ ratio: 1 });
  await expect(act.getByTestId('send-team')).toBeInViewport({ ratio: 1 });
  await card.getByRole('button', { name: 'Close' }).click();
  await expect(card).toHaveCount(0); // closed: the look is filed
  await expect(page.getByTestId('satellite-status')).toHaveText('ORION-3 over E3');
});

test('ALPHA asks for imagery: Look at it, then a photo on station lets it move', async ({ page }) => {
  await start(page, '?debug');
  await page.waitForFunction(() => window.game?.get().team.holdFor);
  await freeze(page);
  await openAsk(page);
  await page.getByTestId('responses').getByRole('button', { name: 'Look at it' }).click();
  await linked(page);
  await expect(page.getByTestId('team-panel')).toContainText('Waiting on the look');
  await untilOnStation(page);
  await page.getByTestId('capture-photo').click();
  await expect(page.getByTestId('satellite-result')).toContainText('Photo: nothing there');
  await fastForward(page, 1_000);
  await expect(page.getByTestId('team-panel')).toContainText('Moving to F4');
});

test('Cancel calls it off while it moves', async ({ page }) => {
  await start(page, '?debug');
  await page.waitForFunction(() => window.game);
  await freeze(page);
  await page.evaluate(() => window.game.lookAt('A1'));
  await page.getByTestId('square-card').getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByTestId('satellite')).toHaveAttribute('data-state', 'idle'); // it goes back to idle
});
