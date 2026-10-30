import { expect, test } from '@playwright/test';
import { fastForward, start } from './helpers';

test('the team panel shows every operator: heartbeat, status, ammo and meds, under TEAM (ILI-1223)', async ({ page, isMobile }) => {
  await start(page);
  if (isMobile) await page.getByTestId('tab-team').click();
  await expect(page.getByTestId('readout').locator('li')).toHaveCount(5);
  await expect(page.getByTestId('readout').locator('svg.ecg')).toHaveCount(5);
  // Ammo and meds as pictures, not words (ILI-1265); the meters keep their names.
  await expect(page.getByTestId('op-medic')).not.toContainText('MEDS');
  await expect(page.getByTestId('meds-medic').locator('svg.cross')).toBeVisible();
  await expect(page.getByTestId('ammo-medic').locator('svg.rounds')).toBeVisible();
  await expect(page.getByTestId('meds-medic').getByRole('meter')).toHaveAccessibleName(/meds/);
  await expect(page.getByTestId('team-title')).toHaveText('ALPHA TEAM');
  await expect(page.getByTestId('team-condition')).toHaveCount(0); // no team totals: each row has its own
});

test('a wound shows on the operator’s heartbeat and status, then heals', async ({ page, isMobile }) => {
  await start(page, '?debug');
  await page.waitForFunction(() => window.game);
  if (isMobile) await page.getByTestId('tab-team').click();
  await page.evaluate(() => {
    const s = window.game.get();
    const operators = s.team.operators.map((o) => (o.id === 'gunner' ? { ...o, health: 50 } : o));
    window.game.set({ ...s, team: { ...s.team, operators } });
  });
  await fastForward(page, 200);
  const gunner = page.getByTestId('op-gunner');
  await expect(gunner).toHaveAttribute('data-condition', 'caution');
  await expect(gunner).toContainText('CAUTION');
  await expect(gunner.locator('svg.ecg')).toHaveAttribute('data-condition', 'caution');

  // The medic treats the gunner twice (50 → 85 → 100, 4 s each).
  await fastForward(page, 10_000);
  await expect(gunner).toHaveAttribute('data-condition', 'fine');
});
