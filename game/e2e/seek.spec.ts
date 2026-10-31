import { expect, test, type Page } from '@playwright/test';
import { freeze, photo, start, openEvent, hasEvent, running } from './helpers';

// Image E3 so the checkpoint is found, then open its target menu.
async function targetE3(page: Page) {
  await start(page, '?debug');
  await running(page);
  await freeze(page);
  await photo(page, 'E3');
  await openEvent(page, 'contact', 'E3');
  await expect(page.getByTestId('event-card')).toContainText('A fortified checkpoint');
  await expect(page.getByTestId('target-menu')).toBeVisible();
}

test('the target menu lists every weapon with its state; no ALPHA attacks: HQ changes the odds, ALPHA decides (ILI-1315)', async ({ page }) => {
  await targetE3(page);
  await expect(page.getByTestId('fire-drone')).toContainText('1 use');
  await expect(page.getByTestId('fire-sniper')).toContainText('Ready');
  await expect(page.getByTestId('fire-heli')).toBeEnabled(); // unlocked from the start (ILI-1254)
  await expect(page.getByTestId('fire-heli')).toContainText('Ready');
  await expect(page.getByTestId('send-team')).toHaveCount(0);
  await expect(page.getByTestId('eyes')).toContainText('Fresh look');
});

test('sniper: OVERWATCH shoots on its own at the square\u2019s anchor, one fighter after another, then goes (ILI-1253, ILI-1303)', async ({ page }) => {
  await targetE3(page);
  const zoom = await page.evaluate(() => window.mapCamera().zoom);
  await page.getByTestId('fire-sniper').click();
  const panel = page.getByTestId('square-anchor').getByTestId('sniper-panel');
  await expect(panel).toContainText('OVERWATCH');
  await expect(panel).toContainText('sniper · E3');
  await expect(page.getByTestId('satellite').getByTestId('sniper-panel')).toHaveCount(0); // ORION-3 only watches
  expect(await page.evaluate(() => window.mapCamera().zoom)).toBe(zoom); // the map stays put
  await expect(page.getByTestId('sniper-line')).toHaveText('On target');
  const tick = (ms: number) => page.evaluate((ms) => { for (let t = 0; t < ms; t += 100) window.game.tick(100); }, ms);
  await tick(700);
  await expect(page.getByTestId('sniper-line')).toHaveText('Tango down');
  await expect(page.getByTestId('sniper-rounds')).toHaveAttribute('aria-label', '6 rounds left');
  await tick(500);
  await expect(page.getByTestId('sniper-line')).toHaveText('Racking');
  // Five seconds: five rounds, five down. Then the panel goes.
  await tick(4_000);
  await expect(page.getByTestId('comms-feed')).toContainText('E3: all targets down. 5 down.');
  await tick(700);
  await expect(panel).toHaveCount(0);
});

test('drone strike: its panel counts down to target, then it clears the square, Tango down by Tango down (ILI-1252)', async ({ page }) => {
  await targetE3(page);
  await page.getByTestId('fire-drone').click();
  await expect(page.getByTestId('minigame')).toHaveCount(0); // no board to aim on
  const panel = page.getByTestId('drone-panel');
  await expect(panel).toContainText('REAPER-1');
  await expect(panel).toContainText('drone strike · E3');
  await expect(page.getByTestId('drone-eta')).toHaveText('0:10');
  const tick = (ms: number) => page.evaluate((ms) => { for (let t = 0; t < ms; t += 100) window.game.tick(100); }, ms);
  await tick(5_000);
  await expect(page.getByTestId('drone-eta')).toHaveText('0:05');
  // Over the square: a Tango down for each fighter as it passes, then all of them.
  await tick(6_000);
  await expect(panel).toHaveAttribute('data-state', 'strike');
  const log = page.getByTestId('drone-log');
  await expect(log.getByText('Tango down').first()).toBeVisible();
  await tick(1_500);
  await expect(log.getByText('Tango down')).toHaveCount(5);
  await expect(log).toContainText('All targets neutralized');
  await expect(page.getByTestId('comms-feed')).toContainText('E3: all targets neutralized. 5 down.');
  await expect.poll(() => hasEvent(page, 'site', 'E3')).toBe(true); // ALPHA can search it
  await expect(page.getByTestId('action-panel')).toHaveCount(0); // but no card for it: the X marks are the aftermath
  // Then the panel goes.
  await tick(3_500);
  await expect(panel).toHaveCount(0);
});

test('a drone strike is loud: the enemy hears it, though no operator made it (ILI-1222)', async ({ page }) => {
  await targetE3(page);
  expect(await page.evaluate(() => window.game.get().noise)).toBe(0);
  await page.getByTestId('fire-drone').click();
  await page.evaluate(() => { for (let t = 0; t < 10_000; t += 100) window.game.tick(100); });
  await expect.poll(() => page.evaluate(() => window.game.get().noise)).toBeGreaterThan(30);
  expect(await page.evaluate(() => window.game.get().team.operators.every((o) => o.noise === 0))).toBe(true);
});

test('heli: HAMMER-2 counts down, strafes the rows it can see fighters in, Tango down by Tango down, then goes (ILI-1254)', async ({ page }) => {
  await targetE3(page);
  await page.getByTestId('fire-heli').click();
  const panel = page.getByTestId('heli-panel');
  await expect(panel).toContainText('HAMMER-2');
  await expect(panel).toContainText('gun run · E3');
  await expect(page.getByTestId('heli-eta')).toHaveText('0:06');
  const tick = (ms: number) => page.evaluate((ms) => { for (let t = 0; t < ms; t += 100) window.game.tick(100); }, ms);
  await tick(6_500);
  await expect(panel).toHaveAttribute('data-state', 'strike');
  await tick(2_000); // across the first row
  await expect(page.getByTestId('heli-log').getByText('Tango down').first()).toBeVisible();
  await tick(6_000);
  await expect(page.getByTestId('heli-log')).toContainText('All targets neutralized');
  await expect(page.getByTestId('comms-feed')).toContainText('E3: all targets neutralized. 5 down.');
  await tick(3_500);
  await expect(panel).toHaveCount(0);
});

test('a strike running on a square that isn’t picked keeps a chip there; a tap opens its anchor (ILI-1306)', async ({ page }) => {
  await targetE3(page);
  await page.getByTestId('fire-drone').click();
  await page.evaluate(() => window.game.closeSquare());
  const chip = page.getByTestId('busy-chip');
  await expect(chip).toHaveAttribute('data-square', 'E3');
  await expect(chip).toContainText(/REAPER-1 · 0:\d\d/);
  await chip.dispatchEvent('click');
  await expect(page.getByTestId('square-anchor')).toHaveAttribute('data-square', 'E3');
  await expect(page.getByTestId('square-anchor').getByTestId('drone-panel')).toBeVisible();
  await expect(chip).toHaveCount(0); // its square is picked: the anchor says it all
});
