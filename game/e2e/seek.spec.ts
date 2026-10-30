import { expect, test, type Page } from '@playwright/test';
import { freeze, photo, start, openEvent, hasEvent } from './helpers';

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

test('the target menu lists every weapon with its state, and ALPHA attacks', async ({ page }) => {
  await targetE3(page);
  await expect(page.getByTestId('fire-drone')).toContainText('1 use');
  await expect(page.getByTestId('fire-sniper')).toContainText('7 rounds');
  await expect(page.getByTestId('fire-heli')).toBeDisabled();
  await expect(page.getByTestId('fire-heli')).toContainText('Unlocks with upgrades');
  await expect(page.getByTestId('send-team')).toBeVisible();
  await expect(page.getByTestId('eyes')).toContainText('Fresh look');
});

test('sniper: OVERWATCH shoots on its own in ORION-3\u2019s panel, crosshairs to each fighter, then goes (ILI-1253)', async ({ page }) => {
  await targetE3(page);
  const zoom = await page.evaluate(() => window.mapCamera().zoom);
  await page.getByTestId('fire-sniper').click();
  const sat = page.getByTestId('satellite');
  const panel = sat.getByTestId('sniper-panel');
  await expect(panel).toContainText('OVERWATCH');
  await expect(panel).toContainText('sniper · E3');
  await expect(page.getByTestId('satellite-inset')).toHaveAttribute('data-state', 'sniper');
  await expect(sat.getByTestId('sniper-crosshair')).toBeVisible();
  await expect(sat.getByTestId('orion-buttons')).toBeHidden();
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
  await expect(sat.getByTestId('orion-buttons')).toBeVisible();
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
