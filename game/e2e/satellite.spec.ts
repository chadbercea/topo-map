import { expect, test } from '@playwright/test';
import { fastForward, freeze, squarePoint, tapAt, untilOnStation } from './helpers';

test('select a square, task ORION-3 there, take a burst: the look lands on the map', async ({ page, isMobile }) => {
  await page.goto('?debug');
  await page.waitForFunction(() => window.game);
  await freeze(page);
  await expect(page.getByTestId('satellite-status')).toHaveText('ORION-3 over G5');
  await tapAt(page, isMobile, await squarePoint(page, 4, 2)); // E3
  const actions = page.getByTestId('square-actions');
  await expect(actions).toContainText('E3');
  await expect(actions).toContainText('no imagery');
  await expect(page.getByTestId('look-here')).toHaveText(/Look here · \ds/);
  await page.getByTestId('look-here').click();

  const panel = page.getByTestId('satellite');
  await expect(panel).toContainText('Moving into position');
  await expect(page.getByTestId('satellite-status')).toContainText('ORION-3 to E3');
  await untilOnStation(page);
  await expect(panel).toHaveAttribute('data-state', 'onStation');
  await expect(page.getByTestId('capture-modes').getByRole('button')).toHaveCount(3);
  await page.getByTestId('capture-burst').click();
  await expect(panel).toHaveAttribute('data-state', 'capturing');
  await fastForward(page, 6_100);
  await expect(page.getByTestId('satellite-result')).toHaveText('Burst: 5 fighters, unaware. Downlinked to ALPHA.');
  await expect(page.getByTestId('alerts')).toContainText('E3'); // the checkpoint is found
  await panel.getByRole('button', { name: 'Close' }).click();
  await expect(panel).toHaveCount(0);
  await expect(page.getByTestId('satellite-status')).toHaveText('ORION-3 over E3');
});

test('ALPHA asks for imagery: Send imagery, then a photo on station lets it move', async ({ page }) => {
  await page.goto('?debug');
  await page.waitForFunction(() => window.game?.get().team.holdFor);
  await freeze(page);
  await page.getByTestId('responses').getByRole('button', { name: 'Send imagery' }).click();
  await expect(page.getByTestId('team-panel')).toContainText('Waiting on imagery');
  await untilOnStation(page);
  await page.getByTestId('capture-photo').click();
  await expect(page.getByTestId('satellite-result')).toContainText('Photo: nothing there');
  await fastForward(page, 1_000);
  await expect(page.getByTestId('team-panel')).toContainText('Moving to F4');
});

test('Cancel calls it off while it moves', async ({ page }) => {
  await page.goto('?debug');
  await page.waitForFunction(() => window.game);
  await freeze(page);
  await page.evaluate(() => window.game.lookAt('A1'));
  await page.getByTestId('satellite').getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByTestId('satellite')).toHaveCount(0);
});
