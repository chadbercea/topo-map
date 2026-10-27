import { expect, test, type Page } from '@playwright/test';
import { boardCell, freeze, photo, squarePoint, tapAt } from './helpers';

// Image E3 so the checkpoint is found, then open its target menu.
async function targetE3(page: Page) {
  await page.goto('?debug');
  await page.waitForFunction(() => window.game?.get().team.holdFor);
  await freeze(page);
  await page.evaluate(() => window.game.respond(window.game.get().team.holdFor!, 'blind'));
  await photo(page, 'E3');
  await page.getByTestId('alerts').getByRole('button', { name: /E3/ }).click();
  await expect(page.getByTestId('event-card')).toContainText('A fortified checkpoint');
  await expect(page.getByTestId('target-menu')).toBeVisible();
}

// Cell i of square E3's board.
const e3Cell = (page: Page, i: number) => boardCell(page, 4, 2, i);

test('the target menu lists every weapon with its state, and Send ALPHA in', async ({ page }) => {
  await targetE3(page);
  await expect(page.getByTestId('fire-drone')).toContainText('1 use');
  await expect(page.getByTestId('fire-sniper')).toContainText('Ready');
  await expect(page.getByTestId('fire-heli')).toBeDisabled();
  await expect(page.getByTestId('fire-heli')).toContainText('Unlocks with upgrades');
  await expect(page.getByTestId('send-team')).toBeVisible();
});

test('sniper: the square becomes a board; a shot on a fighter is a kill', async ({ page, isMobile }) => {
  await targetE3(page);
  await page.getByTestId('fire-sniper').click();
  const panel = page.getByTestId('minigame');
  await expect(panel).toContainText('SNIPER · E3');
  await expect(panel).toContainText('8 rounds left');
  await tapAt(page, isMobile, await e3Cell(page, 5)); // a fighter is in cell 5
  await expect(page.getByTestId('minigame-progress')).toHaveText('1 down');
  await expect(panel).toContainText('7 rounds left');
});

test('drone then sniper: the blast takes four of the checkpoint, the sniper finishes it', async ({ page, isMobile }) => {
  test.setTimeout(60_000); // a dozen real taps, and CI taps slowly
  await targetE3(page);
  await page.getByTestId('fire-drone').click();
  await tapAt(page, isMobile, await e3Cell(page, 5)); // 2x2 over 5, 6, 9, 10
  await expect(page.getByTestId('minigame')).toHaveAttribute('data-status', 'lost');
  await expect(page.getByTestId('minigame-result')).toContainText('4 down. The rest are still in E3.');
  await expect(page.getByTestId('resources')).toContainText('$6,000'); // confirmed kills pay
  await page.getByTestId('minigame').getByRole('button', { name: 'Close' }).click();

  // Seen now, so no alert: open it again from its marker in E3's corner.
  await tapAt(page, isMobile, await squarePoint(page, 4, 2, 0.25, -0.25));
  await page.getByTestId('fire-sniper').click();
  await tapAt(page, isMobile, await e3Cell(page, 1)); // the last fighter
  await expect(page.getByTestId('minigame')).toHaveAttribute('data-status', 'won');
  await expect(page.getByTestId('minigame-result')).toContainText('Target destroyed.');
  await page.getByTestId('minigame').getByRole('button', { name: 'Close' }).click();
  await expect(page.getByTestId('alerts')).toContainText('KILL SITE E3'); // ALPHA can search it
});

test('a drone strike is loud: the noise meter jumps', async ({ page, isMobile }) => {
  await targetE3(page);
  await expect(page.getByTestId('noise').getByRole('meter')).toHaveAttribute('aria-valuenow', '0');
  await page.getByTestId('fire-drone').click();
  await tapAt(page, isMobile, await e3Cell(page, 0));
  await expect.poll(async () => Number(await page.getByTestId('noise').getByRole('meter').getAttribute('aria-valuenow'))).toBeGreaterThan(30);
});
