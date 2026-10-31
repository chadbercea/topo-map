import { expect, test } from '@playwright/test';
import { freeze, running, start } from './helpers';

// Buildings (ILI-1316): one a scan turned up is pinged on its square; its anchor sends ALPHA to
// search it, and what it finds pays on the spot.
test('a building’s anchor sends ALPHA to search it; ALPHA reports the find and it pays', async ({ page, isMobile }) => {
  await start(page, '?debug');
  await running(page);
  await freeze(page);
  await page.evaluate(() => {
    const s = window.game.get();
    window.game.set({ ...s, events: [...s.events, { id: 'building-G4', kind: 'building', square: 'G4', title: 'A building worth a search', atMs: 0, status: 'new' }] });
    window.game.selectSquare('G4');
  });
  const anchor = page.getByTestId('square-anchor');
  await expect(anchor).toContainText('BUILDING · G4');
  const before = await page.evaluate(() => window.game.get().resources.budget);
  await anchor.getByTestId('send-search').click();
  await expect(anchor).toContainText('ALPHA is on its way to search it');
  await page.evaluate(() => {
    for (let i = 0; i < 1500 && !window.game.get().comms.messages.some((m) => m.id === 'found-building-G4'); i++) window.game.tick(100);
  });
  if (isMobile) await page.getByTestId('tab-satcom').click();
  await expect(page.getByTestId('comms-feed')).toContainText(/Building in G4 searched: .*\+\$[\d,]+, and intel to keep us moving\./);
  expect(await page.evaluate(() => window.game.get().resources.budget)).toBeGreaterThan(before);
});
