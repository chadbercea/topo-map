import { expect, test, type Page } from '@playwright/test';

const tick = async (page: Page) => Number(await page.getByTestId('tick').textContent());

test('mission clock runs in real time and freezes on pause', async ({ page, isMobile }) => {
  await page.goto('');
  await expect(page.getByTestId('clock')).toHaveText('06:00');

  // 10 ticks a second, measured after warm-up so page load and terrain baking don't count.
  await expect.poll(() => tick(page)).toBeGreaterThan(10);
  const start = await tick(page);
  await page.waitForTimeout(1500);
  const ran = (await tick(page)) - start;
  expect(ran).toBeGreaterThanOrEqual(10);
  expect(ran).toBeLessThanOrEqual(20);
  await expect(page.getByTestId('clock')).toHaveText(/05:5\d/);

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
