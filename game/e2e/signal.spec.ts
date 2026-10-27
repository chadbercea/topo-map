import { expect, test } from '@playwright/test';
import { fastForward, freeze } from './helpers';

test('intercept: tune with the dial controls, lock on, shift the cipher until it reads, send', async ({ page }) => {
  test.setTimeout(60_000); // up to a dozen clicks, and CI clicks slowly
  await page.goto('?debug');
  await page.waitForFunction(() => window.game);
  await freeze(page);
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
  // The short way round the alphabet: forward, or back if that's fewer clicks.
  const shift = await page.evaluate(() => window.game.get().minigame!.signal!.shift);
  const [button, clicks] = shift <= 13 ? ['Shift forward', shift] : ['Shift back', 26 - shift];
  for (let i = 0; i < clicks; i++) await page.getByRole('button', { name: button }).click();
  await expect(page.getByTestId('cipher')).toHaveText('PATROL AT C2 MOVING TO D3 FOR THE DRONE');
  await panel.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(panel).toHaveAttribute('data-status', 'won');
  await panel.getByRole('button', { name: 'Close' }).click();
  await expect(page.getByTestId('alerts')).toContainText('CONTACT C2');
});

test('jam instead: the traffic is gone, and HQ says what it costs', async ({ page }) => {
  await page.goto('?debug');
  await page.waitForFunction(() => window.game);
  await fastForward(page, 50_000);
  await page.getByTestId('alerts').getByRole('button', { name: /SIGNAL C2/ }).click();
  await page.getByRole('button', { name: 'Jam', exact: true }).click();
  await expect(page.getByTestId('event-card')).toHaveCount(0);
  const log = await page.evaluate(() => window.game.get().comms.messages.map((m) => m.text));
  expect(log.some((t) => /Jamming their net near C2/.test(t))).toBe(true);
});
