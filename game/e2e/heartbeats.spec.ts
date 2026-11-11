import { expect, test } from '@playwright/test';
import { fastForward, freeze, running, start } from './helpers';

// The team panel is a drawer off the heartbeat strip (ILI-1396): closed by default, opened from
// the strip, and opened with an operator highlighted from their prompt.

test('the team panel is expanded by default; minimized it is the strip; they swap, never both (ILI-1396, ILI-1439)', async ({ page, isMobile }) => {
  await start(page, '?debug');
  await running(page);
  const strip = page.getByTestId('heartbeat-strip');
  if (isMobile) {
    // On a phone it's the TEAM tab of the sheet: the strip opens it.
    await expect(strip.locator('svg.ecg')).toHaveCount(5);
    await strip.click();
    await expect(page.getByTestId('readout').locator('li')).toHaveCount(5);
    return;
  }
  // One panel, two states: never a second panel (ILI-1439).
  const panel = page.getByTestId('team-panel');
  await expect(panel).toHaveAttribute('data-state', 'full');
  await expect(page.getByTestId('readout').locator('li')).toHaveCount(5);
  await expect(strip).toHaveCount(0);
  await page.getByTestId('team-minimize').click();
  await expect(panel).toHaveAttribute('data-state', 'min');
  await expect(page.getByTestId('team-panel')).toHaveCount(1);
  await expect(panel.getByTestId('heartbeat-strip').locator('svg.ecg')).toHaveCount(5); // five heartbeats, in the same panel
  await expect(page.getByTestId('readout')).toHaveCount(0);
  await strip.click();
  await expect(panel).toHaveAttribute('data-state', 'full');
  await expect(strip).toHaveCount(0);
});

test('an operator hit is a prompt; it opens the team panel with them highlighted', async ({ page }) => {
  await start(page, '?debug');
  await running(page);
  await freeze(page);
  await page.evaluate(() => {
    const s = window.game.get();
    window.game.set({ ...s, team: { ...s.team, operators: s.team.operators.map((o) => (o.id === 'gunner' ? { ...o, health: 10 } : o)) } });
  });
  await fastForward(page, 100);
  const prompt = page.locator('[data-testid=prompt][data-kind=operator]');
  await expect(prompt.getByTestId('prompt-text')).toContainText('Gunner hit, medic needs time');
  await prompt.getByRole('button', { name: 'Open team' }).click();
  await expect(page.getByTestId('team-panel')).toBeVisible();
  await expect(page.getByTestId('op-gunner')).toHaveAttribute('data-highlight', 'true');
  await expect(prompt).toHaveCount(0); // seen to
});

// Names and status on the strip; the drawer as wide as its rows (ILI-1406).
test('the strip names each operator with their status; the open drawer hugs its rows', async ({ page, isMobile }) => {
  await start(page, '?debug');
  await running(page);
  if (!isMobile) await page.getByTestId('team-minimize').click(); // the strip (ILI-1439)
  const strip = page.getByTestId('heartbeat-strip');
  await expect(strip.getByTestId('hb-lead')).toContainText('Reyes');
  await expect(strip.getByTestId('hb-lead')).toContainText('FINE');
  const s = (await strip.boundingBox())!;
  expect(s.x + s.width).toBeLessThanOrEqual(page.viewportSize()!.width); // fits on a phone
  if (isMobile) return; // on a phone the drawer is the TEAM tab of the sheet
  await strip.click(); // expanded again (ILI-1439)
  const panel = (await page.getByTestId('team-panel').boundingBox())!;
  const row = (await page.getByTestId('op-lead').boundingBox())!;
  expect(panel.width - row.width).toBeLessThan(40); // no dead space beside the rows
});
