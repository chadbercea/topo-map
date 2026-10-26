import { expect, test } from '@playwright/test';

test('too much noise: the client warns, then disowns the operation', async ({ page }) => {
  await page.goto('?debug');
  await page.waitForFunction(() => window.game);
  const spike = (noise: number) =>
    page.evaluate((noise) => {
      window.game.set({ ...window.game.get(), noise });
      window.game.tick(100);
    }, noise);

  await spike(80);
  await expect(page.getByTestId('deniability')).toContainText('warning, keep it quiet');
  await spike(98);
  await expect(page.getByTestId('deniability')).toContainText('DISOWNED');
  const log = await page.evaluate(() => window.game.get().comms.messages.map((m) => `${m.from}: ${m.text}`));
  expect(log.some((t) => t.startsWith('CLIENT: We never heard of you.'))).toBe(true);
});
