import { expect, test } from '@playwright/test';
import { BANNED } from '../src/site/banned';

// Castle House's recruitment site (ILI-1336, rebuilt in ILI-1480): served at /game/castle-house/,
// it's Castle House's own site. It opens on the rook and the globe, framed (ILI-1531); the framed models
// (ILI-1526) load as they scroll into view; Begin selection goes to the secure terminal.
test('the Castle House recruitment site: in-fiction, live framed models, Begin selection opens the terminal', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/game/castle-house/');
  await expect(page.getByTestId('opener')).toContainText('Hold the line');
  for (const id of ['about', 'capabilities', 'divisions', 'selection', 'compensation', 'apply']) await expect(page.locator(`#${id}`)).toHaveCount(1);
  const text = (await page.locator('body').innerText()) + (await page.title()) + ((await page.locator('meta[name=description]').getAttribute('content')) ?? '');
  for (const banned of BANNED) expect(text, `${banned}`).not.toMatch(banned);
  for (const w of await page.getByTestId('stage').all()) await w.scrollIntoViewIfNeeded();
  await expect.poll(() => page.locator('.ch-stage canvas').count()).toBeGreaterThanOrEqual(3);
  const apply = page.getByTestId('apply');
  for (const a of await apply.all()) await expect(a).toHaveAttribute('href', '../');
  const begin = apply.filter({ hasText: 'Begin selection' });
  await begin.scrollIntoViewIfNeeded();
  await begin.click();
  await expect(page).toHaveURL(/\/game\/$/);
  expect(errors).toEqual([]);
});
