import { expect, test } from '@playwright/test';

// Castle House's recruitment site (ILI-1336): served at /game/castle-house/, it's Castle House's
// own site. It recruits the visitor as a contractor and never mentions the game, a test, fiction
// or any one mission. Wireframe scenes load as they scroll into view; Apply begins selection at the
// secure terminal.
test('the Castle House recruitment site: in-fiction, mission-neutral, varied, with live wireframes; Apply begins selection', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/game/castle-house/');
  // The rook and globe hero, fixed; the page slides up over it (ILI-1447).
  const hero = page.getByTestId('intro-hero');
  await expect(hero).toContainText('CASTLE HOUSE');
  await expect(hero).toHaveCSS('position', 'fixed');
  await page.evaluate(() => scrollTo(0, innerHeight * 0.6));
  await expect.poll(() => page.locator('.ch-intro-scrim').evaluate((el) => Number(getComputedStyle(el).opacity))).toBeGreaterThan(0.3);
  // A real PMC's recruiting site: who we are, capabilities, divisions, standards, selection, reach, pay, apply.
  for (const id of ['about', 'capabilities', 'divisions', 'standards', 'selection', 'reach', 'compensation', 'apply']) await expect(page.locator(`#${id}`)).toHaveCount(1);
  await expect(page.getByTestId('posting')).toHaveCount(8);
  // Nothing about the game, a test, fiction or the current mission, anywhere, title and meta included.
  const text = (await page.locator('body').innerText()) + (await page.title()) + ((await page.locator('meta[name=description]').getAttribute('content')) ?? '');
  for (const banned of [/\bgame\b/i, /\btest\b/i, /fiction/i, /satire/i, /player/i, /black box/i, /\bALPHA\b/, /ORION/i, /escrow/i, /ten minutes/i, /the chair is/i, /the team is moving/i]) expect(text, `${banned}`).not.toMatch(banned);
  // Live wireframes below the hero, mounted as they come into view.
  for (const w of await page.getByTestId('wire').all()) await w.scrollIntoViewIfNeeded();
  await expect(page.getByTestId('wire')).toHaveCount(7);
  await expect.poll(() => page.locator('.ch-wire-3d canvas').count()).toBeGreaterThanOrEqual(3);
  // Apply begins selection at the secure terminal.
  const apply = page.getByTestId('apply');
  for (const a of await apply.all()) await expect(a).toHaveAttribute('href', '../');
  await page.evaluate(() => scrollTo(0, 0));
  await expect(apply.first()).toHaveText('Begin selection');
  await apply.first().click();
  await expect(page).toHaveURL(/\/game\/$/);
  expect(errors).toEqual([]);
});
