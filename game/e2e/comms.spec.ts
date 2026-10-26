import { expect, test } from '@playwright/test';
import { fastForward } from './helpers';

test('a contact call opens comms, holds the team, and pushing through sends it on', async ({ page, isMobile }) => {
  await page.goto('?debug');
  await page.waitForFunction(() => window.game);
  await fastForward(page, 15_000);

  const panel = page.getByTestId('team-panel');
  await expect(panel).toHaveAttribute('data-mode', 'C');
  await expect(page.getByTestId('comms')).toContainText('INCOMING · ALPHA');
  await expect(page.getByTestId('comms-text')).toHaveText(/Movement in E3/);
  await expect(panel).toContainText('Holding for HQ');

  const push = page.getByTestId('responses').getByRole('button', { name: 'Push through' });
  if (isMobile) await push.tap();
  else await push.click();
  await expect(page.getByTestId('comms')).toHaveCount(0);
  await expect(panel).toHaveAttribute('data-mode', 'A');
  await fastForward(page, 1_000);
  await expect(panel).not.toContainText('Holding for HQ');
});

test('comms can be minimized to a badge and reopened', async ({ page }) => {
  await page.goto('?debug');
  await page.waitForFunction(() => window.game);
  await fastForward(page, 3_000);
  await expect(page.getByTestId('comms-text')).toHaveText(/Boots on the ground/);
  await page.getByRole('button', { name: 'Minimize comms' }).click();
  await expect(page.getByTestId('comms')).toHaveCount(0);
  await page.getByTestId('comms-badge').click();
  await expect(page.getByTestId('comms-text')).toHaveText(/Boots on the ground/);
});

test('get eyes on it spends a scan and leads to a follow-up with a locked strike option', async ({ page }) => {
  await page.goto('?debug');
  await page.waitForFunction(() => window.game);
  await fastForward(page, 15_000);
  await expect(page.getByTestId('resources')).toContainText('scans 3');
  await page.getByTestId('responses').getByRole('button', { name: 'Get eyes on it' }).click();
  await expect(page.getByTestId('resources')).toContainText('scans 2');
  await expect(page.getByTestId('comms-text')).toHaveText(/two technicals in E3/);
  const strike = page.getByTestId('responses').getByRole('button', { name: /Drone strike/ });
  await expect(strike).toBeDisabled();
  await expect(strike).toContainText('Not unlocked');
  await page.getByTestId('responses').getByRole('button', { name: 'Go around' }).click();
  await expect(page.getByTestId('comms')).toHaveCount(0);
});
