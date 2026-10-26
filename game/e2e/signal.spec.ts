import { expect, test } from '@playwright/test';
import { fastForward } from './helpers';

test('intercept: tune with the dial controls, lock on, shift the cipher until it reads, send', async ({ page }) => {
  await page.goto('?debug');
  await page.waitForFunction(() => window.game);
  await fastForward(page, 50_000);
  await page.getByTestId('alerts').getByRole('button', { name: /SIGNAL C2/ }).click();
  await page.getByRole('button', { name: 'Intercept' }).click();

  const panel = page.getByTestId('minigame');
  await expect(panel).toContainText('SIGNAL INTERCEPT · C2');
  await expect(page.getByTestId('signal-tune')).toBeVisible();

  // Coarse with the slider, then the fine button: the dial follows.
  const target = await page.evaluate(() => window.game.get().minigame!.signal!.target);
  await page.getByTestId('dial').fill(String(Math.round((target - 0.1) * 10) / 10));
  await page.getByRole('button', { name: 'Up 0.1 MHz' }).click();
  await expect(page.getByTestId('freq')).toHaveText(`${target.toFixed(1)} MHz`);
  await expect(page.getByTestId('signal-tune')).toContainText('LOCKING');
  await fastForward(page, 1_600);

  await expect(page.getByTestId('signal-decode')).toBeVisible();
  const shift = await page.evaluate(() => window.game.get().minigame!.signal!.shift);
  for (let i = 0; i < shift; i++) await page.getByRole('button', { name: 'Shift forward' }).click();
  await expect(page.getByTestId('cipher')).toHaveText('PATROL AT C2 HOLD POSITION');
  await panel.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(panel).toHaveAttribute('data-status', 'won');
  await panel.getByRole('button', { name: 'Close' }).click();
  await expect(page.getByTestId('alerts')).toContainText('CONTACT C2');
});
