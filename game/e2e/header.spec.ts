import { expect, test } from '@playwright/test';
import { fastForward, freeze, lockOn, start } from './helpers';

// The mission panel is broken up (ILI-1392): only the timer is left, small, in the map's corner;
// the objective is a start card and a marker on the map; the race is in the debrief.

test('only the timer is left: the client deadline, small, in the map’s corner, with pause', async ({ page, isMobile }) => {
  await page.goto('?debug');
  await expect(page.getByTestId('mission-strip')).toHaveCount(0);
  const timer = page.getByTestId('timer');
  await expect(timer).toContainText('Client deadline');
  await expect(timer.getByTestId('clock')).toBeVisible();
  await expect(timer.getByTestId('pause-toggle')).toBeVisible();
  await expect(page.getByTestId('race')).toHaveCount(0); // the debrief's now
  await expect(page.getByTestId('needs-hq')).toHaveCount(0); // ALPHA needing intel is a prompt (ILI-1391)
  await expect(page.getByTestId('objective')).toContainText('Recover the black box at D3'); // for a screen reader; on the map it's a marker
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
