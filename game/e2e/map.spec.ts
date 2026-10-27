import { expect, test } from '@playwright/test';
import { squarePoint, start, tapAt } from './helpers';

test('tapping a grid square selects it, tapping again clears it', async ({ page, isMobile }) => {
  await start(page, '?debug');
  const selected = page.getByTestId('selected-square');
  await expect(selected).toHaveText('—');
  const tap = async (col: number, row: number) => tapAt(page, isMobile, await squarePoint(page, col, row));
  // Squares near the top middle: on a phone the grid runs well past the screen's edges, and
  // the panels cover the bottom.
  await tap(3, 1);
  await expect(selected).toHaveText('D2');
  await tap(4, 1);
  await expect(selected).toHaveText('E2');
  await tap(4, 1);
  await expect(selected).toHaveText('—');
});
