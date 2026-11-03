import { expect, test } from '@playwright/test';
import { freeze, photo, start, running } from './helpers';

// ALPHA's intel gauge (ILI-1314), played for real (?gauge; other tests pin it full): an orange
// bar by the team's name; empty, ALPHA holds even when HQ says go; a photo feeds it.
test('the intel gauge: empty, ALPHA holds; a photo feeds it and the bar fills', async ({ page, isMobile }) => {
  await start(page, '?debug&gauge');
  await running(page);
  await freeze(page);
  if (isMobile) await page.getByTestId('tab-team').click();
  const bar = page.getByTestId('intel-gauge');
  await expect(bar).toHaveAttribute('aria-valuenow', '0');
  await expect(bar).toHaveAttribute('data-low', 'true');
  await page.evaluate(() => { for (let t = 0; t < 4_000; t += 100) window.game.tick(100); });
  await expect(page.getByTestId('call-state')).toHaveText('Holding · needs intel');
  // It asks HQ for imagery (ILI-1349): a card in COMMS, and the line under the mission points there.
  await expect(page.getByTestId('needs-hq')).toHaveText('ALPHA requests imagery of F4');
  if (isMobile) await page.getByTestId('tab-satcom').click();
  await expect(page.getByTestId('event-card-stack').filter({ hasText: 'ALPHA requests imagery' })).toContainText('Scan ›');
  await page.getByTestId('needs-hq').click();
  await expect.poll(() => page.evaluate(() => window.game.get().map.selected)).toBe('F4');
  if (isMobile) await page.getByTestId('tab-team').click();
  await photo(page, 'G5');
  await expect.poll(async () => Number(await bar.getAttribute('aria-valuenow'))).toBeGreaterThan(0);
});

// The loop on the bar (ILI-1339): a scan ahead shows as a hollow segment until ALPHA heads
// into that square; fed, ALPHA walks and the fill runs.
test('the intel gauge shows banked intel and ALPHA walking it down', async ({ page }) => {
  await start(page, '?debug&gauge');
  await running(page);
  await freeze(page);
  const bar = page.getByTestId('intel-gauge');
  await photo(page, 'E3'); // past F4, the leg ALPHA is on: banked
  // The scan brought ORION-3 forward on a phone; the gauge is with the mission, in view anyway (ILI-1340).
  await expect(bar).toBeInViewport();
  await expect(page.getByTestId('intel-banked')).toBeVisible();
  await expect(bar).not.toHaveAttribute('data-walking', 'true');
  await photo(page, 'F4'); // the square it's heading into: on the gauge now
  await page.evaluate(() => { for (let t = 0; t < 1_000; t += 100) window.game.tick(100); });
  await expect(bar).toHaveAttribute('data-walking', 'true');
});
