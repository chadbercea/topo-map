import { expect, test } from '@playwright/test';
import { fastForward, freeze, lockOn, start } from './helpers';

// The mission bar (ILI-1464): one bar across the map's top, the client's deadline biggest, with the
// phase, what's next and the budget; on a phone just the deadline and budget. The
// objective is a marker on the map too; the race is in the debrief.

test('the mission bar: the client deadline, what’s next and the budget', async ({ page, isMobile }) => {
  await page.goto('?debug');
  await expect(page.getByTestId('mission-bar')).toBeVisible();
  const timer = page.getByTestId('timer');
  await expect(timer).toContainText('Client deadline');
  await expect(timer.getByTestId('clock')).toBeVisible();
  await expect(page.getByTestId('pause-toggle')).toHaveCount(0); // Escape pauses (ILI-1503)
  await expect(page.getByTestId('race')).toHaveCount(0); // the debrief's now
  await expect(page.getByTestId('needs-hq')).toHaveCount(0); // ALPHA needing intel is a prompt (ILI-1391)
  await expect(page.getByTestId('objective')).toContainText('Recover the black box at D3'); // the bar's Next cell, on a wide screen (a marker on the map too)
  await fastForward(page, 15_000);
  await expect(page.getByTestId('clock')).toHaveText(/^9:4[0-5]$/);

  if (isMobile) return; // the ground and weather wait for a wider screen
  await expect(page.getByTestId('conditions')).toContainText('High cloud');
  await expect(page.getByTestId('cloud-tile')).not.toHaveAttribute('data-warn', /./); // 60%: clear enough
  await expect(page.getByTestId('ground')).toHaveCount(0);
  await lockOn(page, 'E2'); // a square's details show once ORION-3 is over it (ILI-1437)
  await page.evaluate(() => window.game.selectSquare('E2'));
  await expect(page.getByTestId('square-elevation')).toHaveText(/^\d+–\d+ m$/);
  await expect(page.getByTestId('square-facts')).toContainText(/Features\s*town/);
});

test('no start card blocks the game: the brief is on the satellite screen now (ILI-1445)', async ({ page }) => {
  await start(page, '?debug&gauge');
  await page.waitForFunction(() => window.game?.get().phase === 'running');
  await freeze(page);
  await expect(page.getByTestId('start-card')).toHaveCount(0);
  await fastForward(page, 4_000);
  await expect(page.getByTestId('prompt')).toHaveCount(1); // ALPHA's intel ask on its grid square, straight up
});
