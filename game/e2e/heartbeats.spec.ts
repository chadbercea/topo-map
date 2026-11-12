import { expect, test } from '@playwright/test';
import { fastForward, freeze, running, start } from './helpers';

// The team panel is a drawer off the heartbeat strip (ILI-1396): closed by default, opened from
// the strip, and opened with an operator highlighted from their prompt.

test('the team panel is a bar at rest; a slot opens its table with them highlighted; one drawer at a time (ILI-1472)', async ({ page, isMobile }) => {
  await start(page, '?debug');
  await running(page);
  const strip = page.getByTestId('heartbeat-strip');
  if (isMobile) {
    // On a phone the map takes the screen (ILI-1461): the TEAM target opens the team panel.
    await expect(strip).toBeHidden();
    await page.getByTestId('tab-team').click();
    await expect(page.getByTestId('readout').locator('li')).toHaveCount(5);
    return;
  }
  // One panel: a bar at rest, the table a drawer out of it (ILI-1472). A slot opens it with that
  // operator highlighted; opening it closes the comms log, one drawer at a time.
  const panel = page.getByTestId('team-panel');
  await expect(panel).toHaveAttribute('data-state', 'min');
  await expect(panel.getByTestId('heartbeat-strip').locator('svg.ecg')).toHaveCount(5);
  await expect(page.getByTestId('readout')).toHaveCount(0);
  await page.getByTestId('log-toggle').click();
  await expect(page.locator('.hud')).toHaveAttribute('data-log', 'true');
  await page.getByTestId('hb-medic').click();
  await expect(panel).toHaveAttribute('data-state', 'full');
  await expect(page.getByTestId('op-medic')).toHaveAttribute('data-highlight', 'true');
  await expect(page.locator('.hud')).not.toHaveAttribute('data-log', /./);
  await expect(page.getByTestId('team-panel')).toHaveCount(1);
  await page.getByTestId('team-minimize').click();
  await expect(panel).toHaveAttribute('data-state', 'min');
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
test('the bar names each operator; the drawer\u2019s rows fill its width (ILI-1472)', async ({ page, isMobile }) => {
  test.skip(isMobile, 'a phone has no strip: its TEAM target says how the team is (ILI-1461)');
  await start(page, '?debug');
  await running(page);
  const strip = page.getByTestId('heartbeat-strip');
  await expect(strip.getByTestId('hb-lead')).toContainText('Reyes');
  const s = (await strip.boundingBox())!;
  expect(s.x + s.width).toBeLessThanOrEqual(page.viewportSize()!.width); // fits on a phone
  await page.getByTestId('team-expand').click();
  const panel = (await page.getByTestId('team-drawer').boundingBox())!;
  const row = (await page.getByTestId('op-lead').boundingBox())!;
  expect(panel.width - row.width).toBeLessThan(40); // the rows fill the drawer
});
