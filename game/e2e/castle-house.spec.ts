import { expect, test } from '@playwright/test';

// Castle House's recruitment site (ILI-1455): served at /game/castle-house/, loads clean, says
// it's satire, and every call to action launches the game: the recruitment test.
test('the Castle House recruitment site: the game intro as hero, open roles, the test, satire said, and every call to action launches the game', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/game/castle-house/');
  // The game's intro is the hero, fixed; the page slides up over it (ILI-1447).
  const hero = page.getByTestId('intro-hero');
  await expect(hero).toContainText('CASTLE HOUSE');
  await expect(hero).toHaveCSS('position', 'fixed');
  await page.evaluate(() => scrollTo(0, innerHeight * 0.6));
  await expect.poll(() => page.locator('.ch-intro-scrim').evaluate((el) => Number(getComputedStyle(el).opacity))).toBeGreaterThan(0.3);
  // A recruitment site (ILI-1455): the lead, three open roles, the package, the test, the FAQ.
  await expect(page.locator('#top .ch-shout')).toContainText('The chair is');
  await expect(page.locator('.ch-role')).toHaveCount(3);
  await expect(page.locator('.ch-role h3').first()).toHaveText('Remote Operations Analyst');
  await expect(page.locator('#test .ch-steps li')).toHaveCount(3);
  await expect(page.locator('#faq')).toContainText('Is this a real job?');
  for (const a of await page.locator('.ch-role-apply').all()) await expect(a).toHaveAttribute('href', '../');
  await expect(page.locator('.ch-fiction')).toContainText('fictional company');
  const apply = page.getByTestId('apply');
  await expect(apply).toHaveCount(4); // the hero's, the nav's, the test's and the close's
  for (const a of await apply.all()) await expect(a).toHaveAttribute('href', '../');
  await page.evaluate(() => scrollTo(0, 0)); // back to the hero: its Take the test launches the game
  await apply.first().click();
  await expect(page).toHaveURL(/\/game\/$/); // into the game: the test
  expect(errors).toEqual([]);
});
