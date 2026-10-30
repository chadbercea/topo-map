import { expect, test } from '@playwright/test';
import { fastForward, start } from './helpers';

test('the mission panel: the deadline, the race, what to do, what needs HQ (ILI-1216, ILI-1245)', async ({ page, isMobile }) => {
  await page.goto('?debug');
  // The mission and its progress run along the map's foot; the clock sits in the widget.
  const strip = page.getByTestId('mission-strip');
  await expect(strip).toContainText('BLACK BOX');
  await expect(page.getByTestId('mission-timer').getByTestId('clock')).toBeVisible();
  await expect(strip.getByTestId('objective')).toBeAttached();
  // The race: time left on top, ALPHA's route under it with A, B and C marked.
  const race = page.getByTestId('race');
  await expect(race.locator('li')).toHaveText(['A', 'B', 'C']);
  await expect(race).toHaveAttribute('data-behind', 'false');
  await expect(page.getByTestId('objective')).toContainText('Recover the black box at D3');
  await page.waitForFunction(() => window.game?.get().team.holdFor);
  await expect(page.getByTestId('needs-hq')).toHaveText('ALPHA waiting on your call'); // only the most pressing
  await fastForward(page, 15_000);
  await expect(page.getByTestId('clock')).toHaveText(/^9:4[0-5]$/);

  if (isMobile) return; // the ground and weather wait for a wider screen
  await expect(page.getByTestId('conditions')).toContainText('High cloud');
  await expect(page.getByTestId('cloud-tile')).not.toHaveAttribute('data-warn', /./); // 60%: clear enough
  // A square's ground is on its card, not in the widget (ILI-1220).
  await expect(page.getByTestId('ground')).toHaveCount(0);
  await page.evaluate(() => window.game.selectSquare('E2'));
  await expect(page.getByTestId('square-elevation')).toHaveText(/^\d+–\d+ m$/);
  await expect(page.getByTestId('square-facts')).toContainText(/Features\s*town/);
});

test("the need line goes where it points: ALPHA's call, or the square (ILI-1271)", async ({ page }) => {
  await start(page, '?debug');
  await page.waitForFunction(() => window.game?.get().team.holdFor);
  const need = page.getByTestId('needs-hq');
  await expect(need).toHaveText('ALPHA waiting on your call');
  await need.click();
  await expect(page.getByTestId('comms-text')).toBeVisible(); // the call, open
  // Nothing waiting, unimaged ground ahead: the line picks that square.
  await page.evaluate(() => {
    window.frozen = true;
    const s = window.game.get();
    window.game.set({ ...s, comms: { ...s.comms, messages: [] }, team: { ...s.team, holdFor: null } });
  });
  await expect(need).toContainText('No imagery ahead at');
  const sq = (await need.textContent())!.match(/at (\w\d)/)![1];
  await need.click();
  await expect.poll(() => page.evaluate(() => window.game.get().map.selected)).toBe(sq);
});
