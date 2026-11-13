import { expect, test, type Page } from '@playwright/test';
import { freeze, start } from './helpers';

// Touch and mouse on the map (ILI-1214): drag pans and doesn't select, a tap selects, pinch
// or the wheel zooms, and recentring puts the zoom back.
const camera = (page: Page) => page.evaluate(() => window.mapCamera());

// Real touch events through the DevTools protocol (Playwright's touchscreen only taps).
async function touch(page: Page, steps: { x: number; y: number }[][]) {
  const cdp = await page.context().newCDPSession(page);
  const send = (type: 'touchStart' | 'touchMove' | 'touchEnd', points: { x: number; y: number }[]) =>
    cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map((p, id) => ({ x: p.x, y: p.y, id })) });
  await send('touchStart', steps[0]);
  for (const s of steps.slice(1)) {
    await send('touchMove', s);
    await page.waitForTimeout(16);
  }
  await send('touchEnd', []);
}

// Where the gestures start: open map, off-centre, since ALPHA (and its call flag) sits in the
// middle now (ILI-1227).
const mid = async (page: Page) => {
  const b = (await page.getByTestId('map-area').boundingBox())!;
  return { x: b.x + b.width * 0.3, y: b.y + b.height * 0.3 }; // up and left of ALPHA: grid, not off its foot
};

test('drag pans the map without picking a square; a tap still picks one', async ({ page, isMobile }) => {
  await start(page, '?debug');
  await page.waitForFunction(() => window.game);
  await freeze(page);
  await page.waitForTimeout(500);
  const before = await camera(page);
  const m = await mid(page);
  if (isMobile) {
    await touch(page, Array.from({ length: 8 }, (_, i) => [{ x: m.x + 10 * i, y: m.y + 6 * i }]));
  } else {
    await page.mouse.move(m.x, m.y);
    await page.mouse.down();
    for (let i = 1; i <= 8; i++) await page.mouse.move(m.x + 10 * i, m.y + 6 * i);
    await page.mouse.up();
  }
  const after = await camera(page);
  expect(after.scrollX).toBeLessThan(before.scrollX); // dragged right: the map came along
  await expect(page.getByTestId('square-anchor')).toHaveCount(0); // a drag picks nothing
  await expect(page.getByTestId('recentre')).toBeVisible(); // over the map's corner (ILI-1227, ILI-1396)

  if (isMobile) await page.touchscreen.tap(m.x, m.y);
  else await page.mouse.click(m.x, m.y);
  // A tap picks the square and sends ORION-3 there; its menu waits for the lock (ILI-1437).
  await expect(page.getByTestId('selected-square')).not.toHaveText('—');
  await expect.poll(() => page.evaluate(() => window.game.get().satellite.aim === window.game.get().map.selected)).toBe(true);
});

test('the map keeps one fixed zoom: pinch and the wheel do nothing, and there are no zoom buttons (ILI-1484)', async ({ page, isMobile }) => {
  await start(page, '?debug');
  await page.waitForFunction(() => window.game);
  await freeze(page);
  await page.waitForTimeout(500);
  const fit = (await camera(page)).zoom;
  const m = await mid(page);
  if (isMobile) {
    await touch(page, Array.from({ length: 10 }, (_, i) => [{ x: m.x - 20 - 8 * i, y: m.y }, { x: m.x + 20 + 8 * i, y: m.y }]));
  } else {
    await page.mouse.move(m.x, m.y);
    for (let i = 0; i < 5; i++) await page.mouse.wheel(0, -200);
  }
  await page.waitForTimeout(300);
  expect((await camera(page)).zoom).toBe(fit);
  await expect(page.getByTestId('zoom-in')).toHaveCount(0);
  await expect(page.getByTestId('zoom-out')).toHaveCount(0);
});

test('on a phone the map takes the screen: a target slides its panel up, another swaps it, × closes it (ILI-1461)', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'the compact tier');
  await start(page, '?debug');
  const hud = page.locator('.hud');
  await expect(hud).toHaveAttribute('data-sheet', 'peek'); // nothing open: just the map and its targets
  const map = (await page.getByTestId('map-area').boundingBox())!;
  const view = page.viewportSize()!;
  expect(map.height).toBeGreaterThan(view.height * 0.8);
  await page.getByTestId('tab-team').click();
  await expect(page.getByTestId('team-panel')).toBeVisible();
  // Another target: the open one slides down as the new one slides up; one open at a time.
  await page.getByTestId('tab-orion').click();
  await expect(hud).toHaveAttribute('data-leaving', 'team');
  await expect(page.getByTestId('satellite')).toBeVisible();
  await expect(hud).not.toHaveAttribute('data-leaving', /./);
  await expect(page.getByTestId('team-panel')).toBeHidden();
  await page.getByTestId('sheet-close').click();
  await expect(page.getByTestId('satellite')).toBeHidden();
  await expect(hud).toHaveAttribute('data-sheet', 'peek');
});
