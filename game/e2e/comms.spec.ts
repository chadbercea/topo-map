import { expect, test } from '@playwright/test';
import { fastForward } from './helpers';

test('a contact call opens comms, holds the team, and HQ can send it on', async ({ page, isMobile }) => {
  await page.goto('?debug');
  await page.waitForFunction(() => window.game);
  await fastForward(page, 15_000);

  const panel = page.getByTestId('team-panel');
  await expect(panel).toHaveAttribute('data-mode', 'C');
  await expect(page.getByTestId('comms')).toContainText('INCOMING · ALPHA');
  await expect(page.getByTestId('comms-text')).toHaveText(/Movement in E3/);
  await expect(panel).toContainText('Holding for HQ');

  const proceed = page.getByRole('button', { name: 'Copy, proceed' });
  if (isMobile) await proceed.tap();
  else await proceed.click();
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
