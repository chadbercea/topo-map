import { expect, test, type Page } from '@playwright/test';
import { boardCell, tapAt } from './helpers';

// Win the opening scan so the technicals in E3 are found, then open their target menu.
async function targetE3(page: Page) {
  await page.goto('?debug');
  await page.waitForFunction(() => window.game?.get().team.holdFor);
  await page.evaluate(() => {
    const g = window.game;
    g.respond(g.get().team.holdFor!, 'send');
    for (const t of g.get().minigame!.targets) g.tapMiniGame(t);
    g.closeMiniGame();
  });
  await page.getByTestId('alerts').getByRole('button', { name: /E3/ }).click();
  await expect(page.getByTestId('event-card')).toContainText('Two technicals');
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

test('drone: one blast over all four fighters destroys the target', async ({ page, isMobile }) => {
  await targetE3(page);
  await page.getByTestId('fire-drone').click();
  await tapAt(page, isMobile, await e3Cell(page, 5)); // 2x2 over 5, 6, 9, 10
  await expect(page.getByTestId('minigame')).toHaveAttribute('data-status', 'won');
  await expect(page.getByTestId('minigame-result')).toContainText('Target destroyed. 4 down.');
});
