import { expect, test } from '@playwright/test';
import { freeze, running, start, tapAt, worldToScreen } from './helpers';

// Bracketed things get a panel (ILI-1411): an operator's is his row from the team table; a click
// pins it, on a 1px line; a second click closes it.
test("an operator's panel pins on a click and closes on the next", async ({ page, isMobile }) => {
  await start(page, '?debug');
  await running(page);
  await freeze(page);
  await page.waitForFunction(() => window.mapSightings().some((t) => t.id === 'op:lead'));
  const lead = await page.evaluate(() => window.mapSightings().find((t) => t.id === 'op:lead')!);
  const at = await worldToScreen(page, lead.x, lead.y);
  await tapAt(page, isMobile, at);
  const panel = page.getByTestId('panel-op:lead');
  await expect(panel).toBeVisible();
  await expect(panel).toHaveAttribute('data-pinned', 'true');
  await expect(panel).toContainText('Reyes');
  await expect(page.locator('.sighting-lines line')).toHaveCount(1);
  await tapAt(page, isMobile, at);
  if (!isMobile) {
    // Unpinned, but the mouse is still over him: it's his hover panel now, until the mouse leaves.
    await expect(panel).not.toHaveAttribute('data-pinned', 'true');
    await expect(page.locator('.sighting-lines line')).toHaveCount(0);
    await page.mouse.move(at.x + 200, at.y + 200);
  }
  await expect(panel).toHaveCount(0);
});
