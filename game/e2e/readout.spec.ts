import { expect, test } from '@playwright/test';
import { fastForward } from './helpers';

test('a wound opens the full readout, then it settles back to Mode A', async ({ page }) => {
  await page.goto('?debug');
  await page.waitForFunction(() => window.game);
  const panel = page.getByTestId('team-panel');
  await expect(panel).toHaveAttribute('data-mode', 'A');
  await expect(page.getByTestId('readout')).toHaveCount(0);

  await page.evaluate(() => {
    const s = window.game.get();
    const operators = s.team.operators.map((o) => (o.id === 'gunner' ? { ...o, health: 50 } : o));
    window.game.set({ ...s, team: { ...s.team, operators } });
  });
  await fastForward(page, 200);
  await expect(panel).toHaveAttribute('data-mode', 'B');
  const gunner = page.getByTestId('op-gunner');
  await expect(gunner).toHaveAttribute('data-condition', 'caution');
  await expect(gunner).toContainText('Okafor');
  await expect(gunner).toContainText('CAUTION');
  await expect(page.getByTestId('op-medic')).toContainText('FINE');
  await expect(page.getByTestId('readout').locator('li')).toHaveCount(5);

  await fastForward(page, 6_000);
  await expect(panel).toHaveAttribute('data-mode', 'A');
});

test('tapping the team header pins the readout open', async ({ page }) => {
  await page.goto('');
  await page.getByTestId('team-panel').getByRole('button', { name: /ALPHA/ }).click();
  await expect(page.getByTestId('readout')).toBeVisible();
  await expect(page.getByTestId('team-panel')).toHaveAttribute('data-mode', 'B');
});
