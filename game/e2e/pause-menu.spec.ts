import { expect, test, type Page } from '@playwright/test';

const tick = async (page: Page) => Number(await page.getByTestId('tick').textContent());
const menu = (page: Page) => page.getByTestId('pause-menu');
const press = async (page: Page, name: string, isMobile: boolean) => {
  const button = page.getByRole('button', { name, exact: true });
  if (isMobile) await button.tap();
  else await button.click();
};

test('restart starts the mission over from 06:00', async ({ page, isMobile }) => {
  await page.goto('');
  await expect.poll(() => tick(page)).toBeGreaterThan(5);
  await press(page, 'Pause', isMobile);
  await press(page, 'Restart', isMobile);
  await expect(menu(page)).toHaveCount(0);
  expect(await tick(page)).toBeLessThan(5);
  await expect(page.getByTestId('clock')).toHaveText('06:00');
});

test('exit leaves the mission and start mission begins a new one', async ({ page, isMobile }) => {
  await page.goto('');
  await press(page, 'Pause', isMobile);
  await press(page, 'Exit', isMobile);
  await expect(menu(page)).toHaveAttribute('data-phase', 'exited');
  const frozen = await tick(page);
  await page.waitForTimeout(500);
  expect(await tick(page)).toBe(frozen);
  await press(page, 'Start mission', isMobile);
  await expect(menu(page)).toHaveCount(0);
  await expect.poll(() => tick(page)).toBeGreaterThan(0);
});

test('sound setting survives a reload', async ({ page, isMobile }) => {
  await page.goto('');
  await press(page, 'Pause', isMobile);
  await expect(page.getByTestId('sound')).toBeChecked();
  if (isMobile) await page.getByText('Sound', { exact: true }).tap();
  else await page.getByTestId('sound').uncheck();
  await expect(page.getByTestId('sound')).not.toBeChecked();
  await page.reload();
  await press(page, 'Pause', isMobile);
  await expect(page.getByTestId('sound')).not.toBeChecked();
});

test('Esc toggles the menu and hiding the tab pauses', async ({ page }) => {
  await page.goto('');
  await page.keyboard.press('Escape');
  await expect(menu(page)).toHaveAttribute('data-phase', 'paused');
  await page.keyboard.press('Escape');
  await expect(menu(page)).toHaveCount(0);

  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(menu(page)).toHaveAttribute('data-phase', 'paused');
});
