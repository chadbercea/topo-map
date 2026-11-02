import { expect, test } from '@playwright/test';

// Castle House's website (ILI-1333): served at /game/castle-house/, in three acts (brochure,
// shift, pitch), loads clean, says it's satire, and every call to action in the pitch launches
// the game.
test('the Castle House site runs brochure to propaganda, says it is satire, and its calls to action launch the game', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/game/castle-house/');
  await expect(page.locator('h1')).toHaveText('Delivering assurance in a complex world.'); // act one
  await expect(page.locator('.ch-act2 .ch-turn.hard')).toContainText('seat'); // act two
  await expect(page.locator('#enlist .ch-shout')).toContainText('The chair is'); // act three
  await expect(page.locator('.ch-fiction')).toContainText('fictional company');
  const apply = page.getByTestId('apply');
  await expect(apply).toHaveCount(3);
  for (const a of await apply.all()) await expect(a).toHaveAttribute('href', '../');
  await apply.first().click();
  await expect(page).toHaveURL(/\/game\/$/); // into the game: the test
  expect(errors).toEqual([]);
});
