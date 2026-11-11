import { expect, test } from '@playwright/test';
import { freeze, running, start, worldToScreen } from './helpers';

// Bracketed things get a panel (ILI-1411): an operator's is his row from the team table; a click
// pins it, on a 1px line; a second click closes it.
test('on the main map ALPHA is one target: hovering it shows ALPHA TEAM and its mini status; nothing pins (ILI-1443)', async ({ page, isMobile }) => {
  test.skip(isMobile, 'hover is a mouse thing');
  await start(page, '?debug');
  await running(page);
  await freeze(page);
  await page.waitForFunction(() => window.mapSightings().some((t) => t.id === 'team'));
  const team = await page.evaluate(() => window.mapSightings().find((t) => t.id === 'team')!);
  const at = await worldToScreen(page, team.x, team.y);
  await page.mouse.move(at.x, at.y);
  const panel = page.getByTestId('panel-team');
  await expect(panel.getByTestId('panel-team-title')).toHaveText('ALPHA TEAM');
  await expect(panel.getByTestId('panel-team-worst')).toHaveText('FINE');
  await expect(page.locator('[data-testid^=panel-op]')).toHaveCount(0); // no per-man panels on the main map
  await page.mouse.click(at.x, at.y);
  await expect(page.locator('.sighting-panel[data-pinned]')).toHaveCount(0); // nothing pins here
});
