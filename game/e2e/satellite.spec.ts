import { expect, test } from '@playwright/test';
import { fastForward, freeze, start, untilOnStation } from './helpers';

test('select a square, task ORION-3 there, take a burst: the look lands on the map', async ({ page, isMobile }) => {
  test.setTimeout(60_000); // a long flow, and CI's software renderer draws the satellite inset too
  await start(page, '?debug');
  await page.waitForFunction(() => window.game);
  await freeze(page);
  await expect(page.getByTestId('satellite-status')).toHaveText('ORION-3 over G5');
  // E3 is off screen on a phone (the camera stays on ALPHA); map.spec covers tapping squares.
  await page.evaluate(() => window.game.selectSquare('E3'));
  const actions = page.getByTestId('square-actions');
  await expect(actions).toContainText('E3');
  await expect(actions).toContainText('no imagery');
  await expect(page.getByTestId('look-here')).toHaveText(/Look · \d+ min/);
  await page.getByTestId('look-here').click();

  const panel = page.getByTestId('satellite');
  await expect(panel).toContainText('Moving to E3');
  await expect(page.getByTestId('satellite-status')).toContainText('ORION-3 to E3');
  await untilOnStation(page);
  await expect(panel).toHaveAttribute('data-state', 'onStation');
  // The view comes up in an inset over the map's corner; the map itself stays put.
  const inset = page.getByTestId('satellite-inset');
  await expect(inset).toContainText('ORION-3 · E3 · ON STATION');
  const map = (await page.getByTestId('map-area').boundingBox())!;
  const box = (await inset.boundingBox())!;
  expect(box.x + box.width).toBeLessThanOrEqual(map.x + map.width);
  await expect(page.getByTestId('capture-modes').getByRole('button')).toHaveCount(3);
  await page.getByTestId('capture-burst').click();
  await expect(panel).toHaveAttribute('data-state', 'capturing');
  await expect(inset).toHaveAttribute('data-state', 'capturing');
  await fastForward(page, 6_100);
  await expect(page.getByTestId('satellite-result')).toHaveText('E3 · Burst: 5 fighters, unaware. Downlinked to ALPHA.');
  await expect(page.getByTestId('intel-items')).toContainText(/CONTACT\s*E3/); // the checkpoint is found, inline in the stream
  if (isMobile) await page.getByTestId('tab-orion').click(); // the new contact brought the intel tab forward
  await panel.getByRole('button', { name: 'Close' }).click();
  await expect(page.getByTestId('satellite-result')).toHaveCount(0); // closed: the panel stays, the look is filed
  await expect(page.getByTestId('satellite-status')).toHaveText('ORION-3 over E3');
  await expect(page.getByTestId('satellite-inset')).toHaveCount(0);
});

test('ALPHA asks for imagery: Look at it, then a photo on station lets it move', async ({ page }) => {
  await start(page, '?debug');
  await page.waitForFunction(() => window.game?.get().team.holdFor);
  await freeze(page);
  await page.getByTestId('responses').getByRole('button', { name: 'Look at it' }).click();
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
  await page.getByTestId('satellite').getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByTestId('satellite')).toHaveAttribute('data-state', 'idle'); // its panel stays, idle
});
