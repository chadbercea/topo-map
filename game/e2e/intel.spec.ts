import { expect, test } from '@playwright/test';
import { freeze, photo, start, running } from './helpers';

// Fresh intel (ILI-1532), played for real (?gauge; other tests let ALPHA walk free): with none on
// the square ahead, ALPHA holds and the prompt asks for a look there.
test('intel: no fresh intel on F4, ALPHA holds and the prompt asks for a look', async ({ page }) => {
  await start(page, '?debug&gauge');
  await running(page);
  await freeze(page);
  const fresh = () => page.evaluate(() => window.game.get().intel.graded.includes('F4'));
  expect(await fresh()).toBe(false);
  await page.evaluate(() => { for (let t = 0; t < 4_000; t += 100) window.game.tick(100); });
  await expect(page.getByTestId('intel-gauge')).toHaveCount(0);
  // It asks HQ for imagery (ILI-1349): the prompt on the map (ILI-1391).
  await expect(page.getByTestId('prompt')).toHaveAttribute('data-square', 'F4'); // on the grid square it needs (ILI-1450)
  await expect(page.getByTestId('prompt')).toHaveAttribute('data-step', 'click');
  await expect(page.getByTestId('prompt-text')).toHaveText('ALPHA needs route intel · click F4');
  await expect(page.getByTestId('prompt-response')).toHaveCount(0); // no button: the player works the grid (ILI-1451)
  await photo(page, 'F4');
  await expect.poll(fresh).toBe(true);
});
