import { expect, test } from '@playwright/test';
import { start } from './helpers';

test('analysts work intel, and finished intel can be sent to the team as a buff', async ({ page }) => {
  await start(page, '?debug');
  await page.waitForFunction(() => window.game);
  const panel = page.getByTestId('intel-panel');
  await panel.getByRole('button').first().click(); // intel is a tab; open its drawer

  const imagery = page.getByTestId('intel-imagery');
  await expect(imagery).toContainText('Route overwatch');
  await expect(imagery.getByRole('meter')).toBeVisible();

  // Answer holds as they come so nothing else gets in the way, and run to 41 s.
  await page.evaluate(() => {
    for (let t = 0; t < 41_000; t += 100) {
      window.game.tick(100);
      const hold = window.game.get().team.holdFor;
      if (hold) window.game.respond(hold, window.game.get().comms.messages.find((m) => m.id === hold)!.responses!.at(-1)!.id);
    }
  });
  await expect(panel).toContainText('1 ready');
  await imagery.getByRole('button', { name: 'Send to team' }).click();
  await expect(imagery).toContainText('Awaiting intel');
  await expect(page.getByTestId('buffs')).toContainText('Route overwatch');
});
