import { expect, test, type Page } from '@playwright/test';
import { freeze, photo, squarePoint, start, tapAt, openEvent, hasEvent } from './helpers';

// Image E3 so the checkpoint is found, then open its target menu.
async function targetE3(page: Page) {
  await start(page, '?debug');
  await page.waitForFunction(() => window.game?.get().team.holdFor);
  await freeze(page);
  await page.evaluate(() => window.game.respond(window.game.get().team.holdFor!, 'blind'));
  await photo(page, 'E3');
  await openEvent(page, 'contact', 'E3');
  await expect(page.getByTestId('event-card')).toContainText('A fortified checkpoint');
  await expect(page.getByTestId('target-menu')).toBeVisible();
}

// Cell i of the strike's board, in ORION-3's picture (ILI-1250).
const aim = (page: Page, i: number) => page.getByTestId('satellite').getByTestId('board-cell').nth(i).click();

test('the target menu lists every weapon with its state, and ALPHA attacks', async ({ page }) => {
  await targetE3(page);
  await expect(page.getByTestId('fire-drone')).toContainText('1 use');
  await expect(page.getByTestId('fire-sniper')).toContainText('Ready');
  await expect(page.getByTestId('fire-heli')).toBeDisabled();
  await expect(page.getByTestId('fire-heli')).toContainText('Unlocks with upgrades');
  await expect(page.getByTestId('send-team')).toBeVisible();
  await expect(page.getByTestId('eyes')).toContainText('Fresh look');
});

test('sniper: the square opens in ORION-3\u2019s picture with the fighters it saw; a shot on one is a kill', async ({ page }) => {
  await targetE3(page);
  const zoom = await page.evaluate(() => window.mapCamera().zoom);
  await page.getByTestId('fire-sniper').click();
  // It plays out in ORION-3's panel: the map doesn't close in (ILI-1250).
  const panel = page.getByTestId('satellite').getByTestId('minigame');
  await expect(panel).toContainText('SNIPER · E3');
  await expect(page.getByTestId('satellite-inset')).toHaveAttribute('data-state', 'strike');
  expect(await page.evaluate(() => window.mapCamera().zoom)).toBe(zoom);
  await expect(page.getByTestId('strike-eyes')).toHaveAttribute('data-eyes', 'fresh');
  await expect(panel).toContainText('8 rounds left');
  await aim(page, 5); // a fighter is in cell 5
  await expect(page.getByTestId('minigame-progress')).toHaveText('1 down');
  await expect(panel).toContainText('7 rounds left');
});

test('drone, a fresh look, then the sniper finishes it', async ({ page, isMobile }) => {
  test.setTimeout(60_000); // a dozen real taps, and CI taps slowly
  await targetE3(page);
  await page.getByTestId('fire-drone').click();
  await aim(page, 5); // 2x2 over 5, 6, 9, 10
  // Over at once: no after-action panel. REAPER-1's report is in the stream.
  await expect(page.getByTestId('minigame')).toHaveCount(0);
  await expect(page.getByTestId('comms-feed')).toContainText('E3: 4 down, 1 still in there.');
  await expect.poll(() => page.evaluate(() => window.game.get().resources.budget)).toBe(6_000); // confirmed kills pay

  // The survivor ran for cover: look again to see where, then open it from its marker.
  await photo(page, 'E3');
  const cell = await page.evaluate(() => window.game.get().imagery.E3.seen[0].units[0]);
  await tapAt(page, isMobile, await squarePoint(page, 4, 2, 0.25, -0.25));
  await page.getByTestId('fire-sniper').click();
  await aim(page, cell); // the last fighter, where the look shows it
  await expect(page.getByTestId('minigame')).toHaveCount(0);
  await expect(page.getByTestId('comms-feed')).toContainText('E3: target destroyed.');
  await expect.poll(() => hasEvent(page, 'site', 'E3')).toBe(true); // ALPHA can search it
});

test('a drone strike is loud: the enemy hears it, though no operator made it (ILI-1222)', async ({ page }) => {
  await targetE3(page);
  expect(await page.evaluate(() => window.game.get().noise)).toBe(0);
  await page.getByTestId('fire-drone').click();
  await aim(page, 0);
  await expect.poll(() => page.evaluate(() => window.game.get().noise)).toBeGreaterThan(30);
  expect(await page.evaluate(() => window.game.get().team.operators.every((o) => o.noise === 0))).toBe(true);
});
