import { expect, test } from '@playwright/test';
import { fastForward, start, openTeam } from './helpers';

test('the team panel shows every operator: heartbeat, status, ammo and meds, under TEAM (ILI-1223)', async ({ page, isMobile }) => {
  await start(page);
  await openTeam(page, isMobile); // the table is a drawer (ILI-1472)
  await expect(page.getByTestId('readout').locator('li')).toHaveCount(5);
  // Heartbeats are inline on the strip; the drawer drops its own column (ILI-1502). A phone's tab keeps it.
  await expect(page.getByTestId(isMobile ? 'readout' : 'heartbeat-strip').locator('svg.ecg')).toHaveCount(5);
  if (!isMobile) await expect(page.getByTestId('readout').locator('svg.ecg')).toHaveCount(0);
  // Ammo, meds and noise are labelled columns now (ILI-1472); the meters keep their names.
  if (!isMobile) await expect(page.getByTestId('team-drawer').locator('.team-cols')).toContainText(/Ammo.*Meds.*Noise/s);
  await expect(page.getByTestId('meds-medic').getByRole('meter')).toHaveAccessibleName(/meds/);
  await expect(page.getByTestId('team-title')).toHaveText('ALPHA TEAM');
  await expect(page.getByTestId('team-condition')).toHaveCount(0); // no team totals: each row has its own
});

test('a wound shows on the operator’s heartbeat and status, then heals', async ({ page, isMobile }) => {
  await start(page, '?debug');
  await page.waitForFunction(() => window.game);
  await openTeam(page, isMobile); // the table is a drawer (ILI-1472)
  await page.evaluate(() => {
    const s = window.game.get();
    const operators = s.team.operators.map((o) => (o.id === 'gunner' ? { ...o, health: 50 } : o));
    window.game.set({ ...s, team: { ...s.team, operators } });
  });
  await fastForward(page, 200);
  const gunner = page.getByTestId('op-gunner');
  await expect(gunner).toHaveAttribute('data-condition', 'caution');
  const beat = isMobile ? gunner : page.getByTestId('hb-gunner'); // the heartbeat, inline on the strip (ILI-1502)
  await expect(beat).toContainText('CAUTION');
  await expect(beat.locator('svg.ecg')).toHaveAttribute('data-condition', 'caution');

  // The medic treats the gunner twice (50 → 85 → 100, 4 s each).
  await fastForward(page, 10_000);
  await expect(gunner).toHaveAttribute('data-condition', 'fine');
});
