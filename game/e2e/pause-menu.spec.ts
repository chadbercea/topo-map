import { expect, test, type Page } from '@playwright/test';
import { fastForward, start } from './helpers';

const tick = async (page: Page) => Number(await page.getByTestId('tick').textContent());
const menu = (page: Page) => page.getByTestId('pause-menu');
const press = async (page: Page, name: string, isMobile: boolean) => {
  const button = page.getByRole('button', { name, exact: true });
  if (isMobile) await button.tap();
  else await button.click();
};

test('no briefing: the game opens live, ALPHA on the ground and the clock running', async ({ page, isMobile }) => {
  await page.goto('?debug');
  await expect(page.getByTestId('briefing')).toHaveCount(0);
  await expect(page.getByTestId('sitrep')).toHaveCount(0);
  await expect(page.getByTestId('objective')).toContainText('Recover the black box at D3');
  if (isMobile) await page.getByTestId('tab-team').click();
  await expect(page.getByTestId('readout').locator('li')).toHaveCount(5);
  if (isMobile) await page.getByTestId('tab-satcom').click();
  // Only this mission's intel: the analysts' notes on the crash to start with.
  await expect(page.getByTestId('comms-feed')).toContainText('downed recon drone');
  await expect(page.getByTestId('comms-feed')).not.toContainText('COPPER VEIL');
  // The clock is running on its own; once it's seen ticking, drive it past a second rather
  // than wait on CI's slow frames.
  await expect.poll(() => tick(page), { timeout: 15_000 }).toBeGreaterThan(0);
  await fastForward(page, 3_000);
  await expect(page.getByTestId('clock')).not.toHaveText('10:00');
});

test('restart starts the mission over, live, at 10:00', async ({ page, isMobile }) => {
  await start(page, '?debug');
  await page.waitForFunction(() => window.game);
  await fastForward(page, 2_000); // well into the mission: 20+ ticks
  await press(page, 'Pause', isMobile);
  await press(page, 'Restart', isMobile);
  await expect(menu(page)).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => window.game.get().elapsedMs)).toBeLessThan(2_000);
  await expect(page.getByTestId('objective')).toContainText('Recover the black box at D3');
});

test('exit leaves the mission and start mission begins a new one', async ({ page, isMobile }) => {
  await start(page);
  await press(page, 'Pause', isMobile);
  await press(page, 'Exit', isMobile);
  await expect(menu(page)).toHaveAttribute('data-phase', 'exited');
  const frozen = await tick(page);
  await page.waitForTimeout(500);
  expect(await tick(page)).toBe(frozen);
  await press(page, 'Start mission', isMobile);
  await expect(menu(page)).toHaveCount(0);
  await expect.poll(() => tick(page)).toBeGreaterThan(0); // a new mission, running
});

test('Esc toggles the menu and hiding the tab pauses', async ({ page }) => {
  await start(page);
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
