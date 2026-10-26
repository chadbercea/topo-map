import { expect, test } from '@playwright/test';
import { fastForward } from './helpers';

test('a wound shows in the team rows without the panel opening up, then heals', async ({ page }) => {
  await page.goto('?debug');
  await page.waitForFunction(() => window.game);
  const panel = page.getByTestId('team-panel');
  const before = (await panel.boundingBox())!;

  await page.evaluate(() => {
    const s = window.game.get();
    const operators = s.team.operators.map((o) => (o.id === 'gunner' ? { ...o, health: 50 } : o));
    window.game.set({ ...s, team: { ...s.team, operators } });
  });
  await fastForward(page, 200);
  const gunner = page.getByTestId('op-gunner');
  await expect(gunner).toHaveAttribute('data-condition', 'caution');
  await expect(gunner).toContainText('Okafor');
  await expect(page.getByTestId('team-rows').locator('li')).toHaveCount(5);
  await expect(page.getByTestId('readout')).toHaveCount(0);
  expect((await panel.boundingBox())!.height).toBeCloseTo(before.height, 0); // the panel keeps its size

  // The medic treats the gunner twice (50 → 85 → 100, 4 s each).
  await fastForward(page, 10_000);
  await expect(gunner).toHaveAttribute('data-condition', 'fine');
});

test('tapping the team header opens the full readout, and again closes it', async ({ page }) => {
  await page.goto('');
  const head = page.getByTestId('team-panel').getByRole('button', { name: /ALPHA/ });
  await head.click();
  await expect(page.getByTestId('readout').locator('li')).toHaveCount(5);
  await expect(page.getByTestId('op-medic')).toContainText('MEDS');
  await head.click();
  await expect(page.getByTestId('readout')).toHaveCount(0);
});
