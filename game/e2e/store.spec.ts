import { expect, test } from '@playwright/test';
import { running, start } from './helpers';

// The after-mission store (ILI-1317): from the report, upgrades bought with the balance carried
// forward, in play from the next mission.
test('the store: buy lean deployment out of the balance, and the next mission opens cheaper', async ({ page }) => {
  await start(page, '?debug');
  await running(page);
  // The mission ends with $1M on the books.
  await page.evaluate(() => {
    window.frozen = true;
    const s = window.game.get();
    window.game.set({ ...s, resources: { ...s.resources, budget: 1_000_000 }, phase: 'ended' });
  });
  await page.getByTestId('open-store').click();
  const store = page.getByTestId('store');
  await expect(store.getByTestId('store-balance')).toHaveText('$1M');
  await store.getByTestId('buy-lean').click();
  await expect(store.getByTestId('store-balance')).toHaveText('$600k');
  await expect(store.getByTestId('buy-lean')).toHaveText('Owned');
  await expect(store.getByTestId('buy-clients')).toBeDisabled(); // $750k: more than the bank holds now
  await store.getByRole('button', { name: 'Back to the report' }).click();
  await page.getByRole('button', { name: /Play again|Retry mission/ }).click();
  await expect.poll(() => page.evaluate(() => window.game.get().upgrades)).toEqual(['lean']);
  expect(await page.evaluate(() => window.game.get().resources.budget)).toBe(600_000 - 300_000);
});
