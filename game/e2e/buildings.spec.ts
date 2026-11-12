import { expect, test } from '@playwright/test';
import { freeze, lockOn, running, start } from './helpers';

// Buildings (ILI-1316): one a scan turned up gets a callout tag on its square (ILI-1469); its Search
// sends ALPHA to search it, and what it finds pays on the spot.
test('a building’s tag sends ALPHA to search it; ALPHA reports the find and it pays', async ({ page, isMobile }) => {
  await start(page, '?debug');
  await running(page);
  await freeze(page);
  await lockOn(page, 'G4');
  await page.evaluate(() => {
    const s = window.game.get();
    window.game.set({ ...s, events: [...s.events, { id: 'building-G4', kind: 'building', square: 'G4', title: 'A building worth a search', atMs: 0, status: 'new' }] });
    window.game.selectSquare('G4');
  });
  const anchor = page.getByTestId('square-anchor');
  await expect(anchor).toContainText('BUILDING · G4');
  const before = await page.evaluate(() => window.game.get().resources.budget);
  const tag = page.locator('[data-testid=place-tag][data-square=G4]');
  await expect(tag).toContainText('Building · G4');
  await expect(anchor.getByTestId('send-search')).toHaveCount(0); // not in the square's panel: it's read-only
  await tag.getByTestId('send-search').click();
  await expect(tag.getByTestId('search-going')).toHaveText('ALPHA on its way');
  await expect(anchor).toContainText('ALPHA is on its way to search it');
  await page.evaluate(() => {
    for (let i = 0; i < 1500 && !window.game.get().comms.messages.some((m) => m.id === 'found-building-G4'); i++) window.game.tick(100);
  });
  if (isMobile) await page.getByTestId('tab-satcom').click();
  await expect(page.getByTestId('comms-feed')).toContainText(/Building in G4 searched: .*\+\$[\d,]+, and intel to keep us moving\./);
  expect(await page.evaluate(() => window.game.get().resources.budget)).toBeGreaterThan(before);
});

// ALPHA at work on a square (ILI-1427): a bar fills while it searches; then the find takes its place.
test('a search shows its bar filling in the square menu, then the find in its place', async ({ page, isMobile }) => {
  test.skip(isMobile, 'the square menu on a phone is covered by the map spec');
  await start(page, '?debug');
  await running(page);
  await freeze(page);
  await lockOn(page, 'G4');
  await page.evaluate(() => {
    const s = window.game.get();
    window.game.set({ ...s, events: [...s.events, { id: 'building-G4', kind: 'building', square: 'G4', title: 'A building worth a search', atMs: 0, status: 'new' }] });
    window.game.selectSquare('G4');
  });
  await page.locator('[data-testid=place-tag][data-square=G4]').getByTestId('send-search').click();
  await page.evaluate(() => {
    for (let i = 0; i < 1500 && !window.game.get().team.activity.startsWith('Searching'); i++) window.game.tick(100);
    for (let i = 0; i < 50; i++) window.game.tick(100); // five seconds in
    if (window.game.get().map.selected !== 'G4') window.game.selectSquare('G4');
  });
  await expect(page.getByTestId('orion-detail').getByTestId('work-bar')).toContainText('ALPHA searching the building'); // ORION-3's view (ILI-1438)
  await page.evaluate(() => {
    for (let i = 0; i < 400 && !window.game.get().comms.messages.some((m) => m.id === 'found-building-G4'); i++) window.game.tick(100);
  });
  await expect(page.getByTestId('orion-detail').getByTestId('work-found')).toContainText(/ALPHA found .* · \+\$[\d,]+/);
  await expect(page.getByTestId('orion-detail').getByTestId('work-bar')).toHaveCount(0);
});
