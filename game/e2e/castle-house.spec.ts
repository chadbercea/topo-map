import { expect, test } from '@playwright/test';

// Castle House's website (ILI-1333): served at /game/castle-house/, in three acts (brochure,
// shift, pitch), loads clean, says it's satire, and every call to action in the pitch launches
// the game.
test('the Castle House site runs brochure to propaganda, says it is satire, and its calls to action launch the game', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/game/castle-house/');
  // The game's intro is the hero, fixed; the page slides up over it (ILI-1447).
  const hero = page.getByTestId('intro-hero');
  await expect(hero).toContainText('CASTLE HOUSE');
  await expect(hero).toHaveCSS('position', 'fixed');
  await page.evaluate(() => scrollTo(0, innerHeight * 0.6));
  await expect.poll(() => page.locator('.ch-intro-scrim').evaluate((el) => Number(getComputedStyle(el).opacity))).toBeGreaterThan(0.3);
  await expect(page.locator('.ch-hero1 h1')).toHaveText('Delivering assurance in a complex world.'); // act one
  await expect(page.locator('.ch-act2 .ch-turn.hard')).toContainText('seat'); // act two
  await expect(page.locator('#enlist .ch-shout')).toContainText('The chair is'); // act three
  await expect(page.locator('.ch-fiction')).toContainText('fictional company');
  const apply = page.getByTestId('apply');
  await expect(apply).toHaveCount(4); // the hero's, and the pitch's three
  for (const a of await apply.all()) await expect(a).toHaveAttribute('href', '../');
  await page.evaluate(() => scrollTo(0, 0)); // back to the hero: its Take the test launches the game
  await apply.first().click();
  await expect(page).toHaveURL(/\/game\/$/); // into the game: the test
  expect(errors).toEqual([]);
});
