import { expect, test } from '@playwright/test';
import { freeze, photo, start } from './helpers';

// ALPHA's intel gauge (ILI-1314), played for real (?gauge; other tests pin it full): an orange
// bar by the team's name; empty, ALPHA holds even when HQ says go; a photo feeds it.
test('the intel gauge: empty, ALPHA holds; a photo feeds it and the bar fills', async ({ page, isMobile }) => {
  await start(page, '?debug&gauge');
  await page.waitForFunction(() => window.game?.get().team.holdFor);
  await freeze(page);
  if (isMobile) await page.getByTestId('tab-team').click();
  const bar = page.getByTestId('intel-gauge');
  await expect(bar).toHaveAttribute('aria-valuenow', '0');
  await expect(bar).toHaveAttribute('data-low', 'true');
  await page.evaluate(() => window.game.respond(window.game.get().team.holdFor!, 'blind'));
  await page.evaluate(() => { for (let t = 0; t < 4_000; t += 100) window.game.tick(100); });
  await expect(page.getByTestId('team-panel')).toContainText('Holding · needs intel');
  await photo(page, 'G5');
  await expect.poll(async () => Number(await bar.getAttribute('aria-valuenow'))).toBeGreaterThan(0);
});
