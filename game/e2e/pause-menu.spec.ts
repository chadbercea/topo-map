import { expect, test, type Page } from '@playwright/test';
import { fastForward, start } from './helpers';

const tick = async (page: Page) => Number(await page.getByTestId('tick').textContent());
const menu = (page: Page) => page.getByTestId('pause-menu');
const press = async (page: Page, name: string, isMobile: boolean) => {
  const button = page.getByRole('button', { name, exact: true });
  if (isMobile) await button.tap();
  else await button.click();
};

test('no briefing: the game opens live, and SITREP plus the code name in the stream start the clock', async ({ page, isMobile }) => {
  await page.goto('');
  await expect(page.getByTestId('briefing')).toHaveCount(0);
  if (isMobile) await page.getByTestId('tab-intel').click();
  await expect(page.getByTestId('intel-stream')).toBeVisible();
  await expect(page.getByTestId('intel-items').locator('li').first()).toBeVisible();
  const before = await page.getByTestId('intel-items').locator('li').count();
  expect(before).toBeGreaterThan(5); // the theater was already talking
  await expect(page.getByTestId('team-panel')).toHaveAttribute('data-linked', 'false');
  await page.waitForTimeout(1_600);
  await expect(page.getByTestId('clock')).toHaveText('4:00'); // no team, no clock

  if (isMobile) await page.getByTestId('tab-satcom').click();
  await press(page, 'Send SITREP', isMobile);
  await expect(page.getByTestId('sitrep-reply')).toContainText('Operating under BLACK BOX');
  // Search the stream for it by hand.
  if (isMobile) await page.getByTestId('tab-intel').click();
  await page.getByTestId('intel-filter').fill('BLACK BOX');
  await expect(page.getByTestId('team-panel')).toHaveAttribute('data-linked', 'true');
  const items = page.getByTestId('intel-items').locator('li');
  await expect(items.first()).toHaveAttribute('data-tags', /BLACK BOX/);
  for (const tags of await items.evaluateAll((li) => li.map((l) => l.getAttribute('data-tags')))) expect(tags).toContain('BLACK BOX');
  await expect.poll(() => page.getByTestId('clock').textContent(), { timeout: 5_000 }).not.toBe('4:00');
});

test('restart goes back to the desk at 4:00 with no link', async ({ page, isMobile }) => {
  await start(page, '?debug');
  await page.waitForFunction(() => window.game);
  await fastForward(page, 2_000); // well into the mission: 20+ ticks
  await press(page, 'Pause', isMobile);
  await press(page, 'Restart', isMobile);
  await expect(menu(page)).toHaveCount(0);
  await expect(page.getByTestId('sitrep')).toBeVisible();
  await expect(page.getByTestId('team-panel')).toHaveAttribute('data-linked', 'false');
  await expect(page.getByTestId('clock')).toHaveText('4:00');
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
  await press(page, 'Send SITREP', isMobile); // a new mission opens at the desk, no link
  await page.getByTestId('codename').click();
  await expect(page.getByTestId('team-panel')).toHaveAttribute('data-linked', 'true');
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
