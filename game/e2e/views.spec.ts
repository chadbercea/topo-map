import { expect, test } from '@playwright/test';
import { start } from './helpers';

test('map views live in the pause menu; switching changes the layers and is remembered', async ({ page }) => {
  await start(page, '?debug');
  const layers = page.getByTestId('layers');
  const views = page.getByTestId('map-views');
  await expect(views).toHaveCount(0); // not on the map
  await page.getByTestId('pause-toggle').click();
  await expect(layers).toHaveText('topo+city');

  await views.getByRole('button', { name: 'Relief' }).click();
  await expect(layers).toHaveText('relief+city');
  await expect(views.getByRole('button', { name: 'Relief' })).toHaveAttribute('aria-pressed', 'true');

  await views.getByRole('button', { name: 'City' }).click();
  await expect(layers).toHaveText('relief');

  await page.reload();
  await expect(page.getByTestId('layers')).toHaveText('relief');
});
