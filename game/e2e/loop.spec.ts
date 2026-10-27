import { expect, test, type Page } from '@playwright/test';
import { start } from './helpers';

const tick = async (page: Page) => Number(await page.getByTestId('tick').textContent());

test('mission clock runs in real time and freezes on pause', async ({ page, isMobile }) => {
  await start(page);
  await expect(page.getByTestId('clock')).toHaveText('06:00');

  // The clock advances and never outruns real time (10 ticks a second). CI renders on the
  // CPU at a frame or so a second, so exact real-time pacing is covered by the unit tests
  // (same ticks at any frame rate), not here.
  await expect.poll(() => tick(page), { timeout: 15_000 }).toBeGreaterThan(0);
  const t0 = await tick(page);
  await page.waitForTimeout(1500);
  const ran = (await tick(page)) - t0;
  expect(ran).toBeGreaterThan(0);
  expect(ran).toBeLessThanOrEqual(20);

  const pause = page.getByTestId('pause-toggle');
  if (isMobile) await pause.tap();
  else await pause.click();
  await expect(page.getByTestId('pause-menu')).toHaveAttribute('data-phase', 'paused');
  const frozen = await tick(page);
  await page.waitForTimeout(1000);
  expect(await tick(page)).toBe(frozen);

  if (isMobile) await page.getByRole('button', { name: 'Resume' }).tap();
  else await page.keyboard.press('p');
  await expect(page.getByTestId('pause-menu')).toHaveCount(0);
  await expect(page.getByTestId('mission-timer')).toHaveAttribute('data-phase', 'running');
  await expect.poll(() => tick(page)).toBeGreaterThan(frozen);
});
