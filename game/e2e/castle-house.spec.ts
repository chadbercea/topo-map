import { expect, test } from '@playwright/test';
import { BANNED } from '../src/site/banned';

// Castle House's recruitment site (ILI-1336, rebuilt in ILI-1480): served at /game/castle-house/,
// it's Castle House's own site. The hero is the title screen's rook and globe; wireframes load as
// they scroll into view; Begin selection goes to the secure terminal.
test('the Castle House recruitment site: in-fiction, live wireframes, Begin selection opens the terminal', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/game/castle-house/');
  const hero = page.getByTestId('intro-hero');
  await expect(hero).toContainText('CASTLE HOUSE');
  await expect(hero).toHaveCSS('position', 'fixed');
  for (const id of ['about', 'capabilities', 'divisions', 'selection', 'compensation', 'apply']) await expect(page.locator(`#${id}`)).toHaveCount(1);
  const text = (await page.locator('body').innerText()) + (await page.title()) + ((await page.locator('meta[name=description]').getAttribute('content')) ?? '');
  for (const banned of BANNED) expect(text, `${banned}`).not.toMatch(banned);
  for (const w of await page.getByTestId('wire').all()) await w.scrollIntoViewIfNeeded();
  await expect.poll(() => page.locator('.ch-wire-3d canvas').count()).toBeGreaterThanOrEqual(3);
  await page.getByTestId('capability').nth(1).click();
  await expect(page.getByTestId('capability').nth(1)).toHaveAttribute('aria-selected', 'true');
  const apply = page.getByTestId('apply');
  for (const a of await apply.all()) await expect(a).toHaveAttribute('href', '../');
  await page.evaluate(() => scrollTo(0, 0));
  await expect(apply.first()).toHaveText('Begin selection');
  await apply.first().click();
  await expect(page).toHaveURL(/\/game\/$/);
  expect(errors).toEqual([]);
});
