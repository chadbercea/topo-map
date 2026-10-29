import { expect, test } from '@playwright/test';
import { freeze, squarePoint, start, tapAt, worldToScreen } from './helpers';

test('tapping a grid square selects it and opens its zoomed view; tapping again clears it', async ({ page, isMobile }) => {
  await start(page, '?debug');
  const selected = page.getByTestId('selected-square');
  await expect(selected).toHaveText('—');
  const tap = async (col: number, row: number) => tapAt(page, isMobile, await squarePoint(page, col, row));
  // Squares next to ALPHA (G5): the camera keeps ALPHA centred (ILI-1227), so they're in view.
  await tap(6, 3);
  await expect(selected).toHaveText('G4');
  if (isMobile) {
    // On a phone the square's zoomed view and card take most of the map: Close clears it.
    await page.getByTestId('square-card').getByRole('button', { name: 'Close' }).click();
    await expect(selected).toHaveText('—');
    return;
  }
  await tap(5, 3);
  await expect(selected).toHaveText('F4');
  await tap(5, 3);
  await expect(selected).toHaveText('—');
});

test('the camera follows ALPHA where the grid runs off the open map, keeping it clear of the panels', async ({ page }) => {
  test.setTimeout(90_000); // the walk is thousands of ticks (more since ILI-1251 slowed it); a loaded CI runner took 31 s on desktop before that
  await start(page, '?debug');
  await page.waitForFunction(() => window.game);
  await freeze(page);
  // Clear ground the whole way, so nothing stops the walk.
  await page.evaluate(() => {
    const s = window.game.get();
    window.game.set({ ...s, contacts: [], schedule: [], map: { ...s.map, scanned: [...s.team.route] }, comms: { ...s.comms, messages: [] }, team: { ...s.team, holdFor: null }, script: { ...s.script, fired: [...s.script.fired, 'convoy-on-exfil'] } }); // no convoy on the exfil (ILI-1192)
  });
  // Where ALPHA is on screen, and the open map's box (the space between the panels).
  const where = async () => {
    const { x, y } = await page.evaluate(() => window.game.get().team.position);
    return { p: await worldToScreen(page, x, y), box: (await page.getByTestId('map-area').boundingBox())!, view: page.viewportSize()! };
  };
  const check = async () => {
    await page.waitForTimeout(400); // the camera eases after ALPHA
    const { p, box, view } = await where();
    expect(p.x >= 0 && p.x <= view.width && p.y >= 0 && p.y <= view.height, 'ALPHA on screen').toBe(true);
    // Centred in the open map (ILI-1227), give or take the ease.
    expect(Math.abs(p.x - (box.x + box.width / 2)), 'ALPHA centred across').toBeLessThan(box.width * 0.1);
    expect(Math.abs(p.y - (box.y + box.height / 2)), 'ALPHA centred down').toBeLessThan(box.height * 0.1);
    // The grid runs off the open map (a phone's sides; on desktop under ORION-3's column,
    // ILI-1226): the camera keeps ALPHA across the open map.
    expect(p.x >= box.x && p.x <= box.x + box.width, 'ALPHA across the open map').toBe(true);
  };
  const scroll0 = await page.evaluate(() => window.mapCamera().scrollX);
  await check(); // at the start, on G5
  for (const waypoint of [3, 5]) {
    // walk to D3, then on to B1 (the far corner from the start)
    await page.evaluate((w) => {
      for (let i = 0; i < 3000 && window.game.get().team.waypoint < w; i++) window.game.tick(100);
    }, waypoint);
    await check();
  }
  const moved = (await page.evaluate(() => window.mapCamera().scrollX)) !== scroll0;
  expect(moved).toBe(true); // desktop too, since layout A narrowed the open map (ILI-1226)
});

test('WASD pans the map on both axes; Recentre in TEAM (or F) goes back to ALPHA (ILI-1227)', async ({ page, isMobile }) => {
  await start(page, '?debug');
  await page.waitForFunction(() => window.game);
  await freeze(page);
  const cam = () => page.evaluate(() => window.mapCamera());
  const hold = async (key: string, ms: number) => {
    await page.keyboard.down(key);
    await page.waitForTimeout(ms);
    await page.keyboard.up(key);
  };
  if (isMobile) await page.getByTestId('tab-team').click();
  const team = page.getByTestId('team-panel');
  const panel = await team.boundingBox();
  await expect(page.getByTestId('recentre')).toHaveCount(0); // on ALPHA: nothing to recentre
  const before = await cam();
  await hold('a', 500);
  await hold('w', 500);
  const after = await cam();
  expect(after.scrollX).toBeLessThan(before.scrollX); // panned left
  expect(after.scrollY).toBeLessThan(before.scrollY); // and up
  // The button shows in TEAM's title line, and the panel doesn't move or change size.
  await expect(team.getByTestId('recentre')).toBeVisible();
  expect(await team.boundingBox()).toEqual(panel);
  await team.getByTestId('recentre').click();
  await expect(page.getByTestId('recentre')).toHaveCount(0);
  await expect.poll(async () => Math.abs((await cam()).scrollX - before.scrollX), { timeout: 5_000 }).toBeLessThan(2);
  // F does the same.
  await hold('d', 400);
  await expect(team.getByTestId('recentre')).toBeVisible();
  await page.keyboard.press('f');
  await expect(page.getByTestId('recentre')).toHaveCount(0);
});
