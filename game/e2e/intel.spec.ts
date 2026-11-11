import { expect, test } from '@playwright/test';
import { freeze, photo, start, running } from './helpers';

// ALPHA's intel gauge (ILI-1314), played for real (?gauge; other tests pin it full). The bar is
// off the HUD with the mission panel (ILI-1392): what it said is the prompt now (ILI-1391).
test('intel: empty, ALPHA holds and the prompt asks for a look; a photo feeds it', async ({ page }) => {
  await start(page, '?debug&gauge');
  await running(page);
  await freeze(page);
  const fuel = () => page.evaluate(() => window.game.get().intel.fuel);
  expect(await fuel()).toBe(0);
  await page.evaluate(() => { for (let t = 0; t < 4_000; t += 100) window.game.tick(100); });
  await expect(page.getByTestId('intel-gauge')).toHaveCount(0);
  // It asks HQ for imagery (ILI-1349): the prompt on the map (ILI-1391).
  await expect(page.getByTestId('prompt')).toHaveAttribute('data-square', 'F4'); // on the grid square it needs (ILI-1450)
  await expect(page.getByTestId('prompt')).toHaveAttribute('data-step', 'click');
  await expect(page.getByTestId('prompt-text')).toHaveText('ALPHA needs route intel · click F4');
  await expect(page.getByTestId('prompt-response')).toHaveCount(0); // no button: the player works the grid (ILI-1451)
  await photo(page, 'G5');
  await expect.poll(fuel).toBeGreaterThan(0);
});
