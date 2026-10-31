import { expect, test } from '@playwright/test';
import { running, start } from './helpers';

// Capability unlocks (ILI-1316), played for real (?unlocks; other tests open everything): the
// ability bar shows the balance and the three capabilities, locked; in the green the sniper can
// be bought, and then it's a price per call.
test('the ability bar: locked in the red; in the green, buy the sniper and it costs per call', async ({ page }) => {
  await start(page, '?debug&unlocks');
  await running(page);
  const bar = page.getByTestId('ability-bar');
  await expect(bar.getByTestId('balance')).toHaveText('−$400k'); // deployment up front
  await expect(bar.getByTestId('ability-sniper')).toHaveAttribute('data-state', 'locked');
  await expect(bar.getByTestId('ability-sniper')).toContainText('Unlock $250k');
  await page.evaluate(() => {
    window.frozen = true;
    const s = window.game.get();
    window.game.set({ ...s, resources: { ...s.resources, budget: 300_000 } });
  });
  await expect(bar.getByTestId('ability-sniper')).toHaveAttribute('data-state', 'buyable');
  await expect(bar.getByTestId('ability-drone')).toHaveAttribute('data-state', 'locked'); // the sniper first
  await bar.getByTestId('ability-sniper').click();
  await expect(bar.getByTestId('ability-sniper')).toHaveAttribute('data-state', 'ready');
  await expect(bar.getByTestId('ability-sniper')).toContainText('$10k / call');
  await expect(bar.getByTestId('balance')).toHaveText('$50k');
});
