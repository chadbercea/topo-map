import { expect, test } from '@playwright/test';
import { squarePoint, tapAt } from './helpers';

test('tapping a grid square selects it, tapping again clears it', async ({ page, isMobile }) => {
  await page.goto('?debug');
  const selected = page.getByTestId('selected-square');
  await expect(selected).toHaveText('—');
  const tap = async (col: number, row: number) => tapAt(page, isMobile, await squarePoint(page, col, row));
  await tap(2, 1);
  await expect(selected).toHaveText('C2');
  await tap(7, 4);
  await expect(selected).toHaveText('H5');
  await tap(7, 4);
  await expect(selected).toHaveText('—');
});
