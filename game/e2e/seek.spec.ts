import { expect, test, type Page } from '@playwright/test';
import { boardCell, freeze, photo, squarePoint, start, tapAt } from './helpers';

// Image E3 so the checkpoint is found, then open its target menu.
async function targetE3(page: Page) {
  await start(page, '?debug');
  await page.waitForFunction(() => window.game?.get().team.holdFor);
  await freeze(page);
  await page.evaluate(() => window.game.respond(window.game.get().team.holdFor!, 'blind'));
  await photo(page, 'E3');
  await page.getByTestId('new-event').filter({ hasText: /E3/ }).click();
  await expect(page.getByTestId('event-card')).toContainText('A fortified checkpoint');
  await expect(page.getByTestId('target-menu')).toBeVisible();
}

// Cell i of square E3's board.
const e3Cell = (page: Page, i: number) => boardCell(page, 4, 2, i);

test('the target menu lists every weapon with its state, and ALPHA attacks', async ({ page }) => {
  await targetE3(page);
  await expect(page.getByTestId('fire-drone')).toContainText('1 use');
  await expect(page.getByTestId('fire-sniper')).toContainText('Ready');
  await expect(page.getByTestId('fire-heli')).toBeDisabled();
  await expect(page.getByTestId('fire-heli')).toContainText('Unlocks with upgrades');
  await expect(page.getByTestId('send-team')).toBeVisible();
  await expect(page.getByTestId('eyes')).toContainText('Fresh look');
});

test('sniper: the square opens with the fighters ORION-3 saw; a shot on one is a kill', async ({ page, isMobile }) => {
  await targetE3(page);
  await page.getByTestId('fire-sniper').click();
  const panel = page.getByTestId('minigame');
  await expect(panel).toContainText('SNIPER · E3');
  await expect(page.getByTestId('strike-eyes')).toHaveAttribute('data-eyes', 'fresh');
  await expect(panel).toContainText('8 rounds left');
  await tapAt(page, isMobile, await e3Cell(page, 5)); // a fighter is in cell 5
  await expect(page.getByTestId('minigame-progress')).toHaveText('1 down');
  await expect(panel).toContainText('7 rounds left');
});

test('drone, a fresh look, then the sniper finishes it', async ({ page, isMobile }) => {
  test.setTimeout(60_000); // a dozen real taps, and CI taps slowly
  await targetE3(page);
  await page.getByTestId('fire-drone').click();
  await tapAt(page, isMobile, await e3Cell(page, 5)); // 2x2 over 5, 6, 9, 10
  // Over at once: no after-action panel. REAPER-1's report is in the stream.
  await expect(page.getByTestId('minigame')).toHaveCount(0);
  await expect(page.getByTestId('intel-items')).toContainText('E3: 4 down, 1 still in there.');
  await expect(page.getByTestId('resources')).toContainText('$6,000'); // confirmed kills pay

  // The survivor ran for cover: look again to see where, then open it from its marker.
  await photo(page, 'E3');
  const cell = await page.evaluate(() => window.game.get().imagery.E3.seen[0].units[0]);
  await tapAt(page, isMobile, await squarePoint(page, 4, 2, 0.25, -0.25));
  await page.getByTestId('fire-sniper').click();
  await tapAt(page, isMobile, await e3Cell(page, cell)); // the last fighter, where the look shows it
  await expect(page.getByTestId('minigame')).toHaveCount(0);
  await expect(page.getByTestId('intel-items')).toContainText('E3: target destroyed.');
  await expect(page.getByTestId('intel-items')).toContainText(/KILL SITE\s*E3/); // ALPHA can search it
});

test('a drone strike is loud: the noise meter jumps', async ({ page, isMobile }) => {
  await targetE3(page);
  await expect(page.getByTestId('noise').getByRole('meter')).toHaveAttribute('aria-valuenow', '0');
  await page.getByTestId('fire-drone').click();
  await tapAt(page, isMobile, await e3Cell(page, 0));
  await expect.poll(async () => Number(await page.getByTestId('noise').getByRole('meter').getAttribute('aria-valuenow'))).toBeGreaterThan(30);
});
