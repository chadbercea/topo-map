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

const mid = async (page: Page) => {
  const b = (await page.getByTestId('map-area').boundingBox())!;
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
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
  await expect(page.getByTestId('square-card')).toHaveCount(0);
  await expect(page.getByTestId('recentre')).toBeVisible();

  if (isMobile) await page.touchscreen.tap(m.x, m.y);
  else await page.mouse.click(m.x, m.y);
  await expect(page.getByTestId('square-card')).toBeVisible();
});

test('pinch (or the wheel) zooms in, and recentring zooms back out', async ({ page, isMobile }) => {
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
  await expect.poll(async () => (await camera(page)).zoom).toBeGreaterThan(fit * 1.3);
  await expect.poll(async () => (await camera(page)).zoom).toBeLessThanOrEqual(fit * 3 + 1e-6);
  await page.getByTestId('recentre').click();
  await expect.poll(async () => (await camera(page)).zoom).toBeCloseTo(fit, 5);
});

test('on a phone the dock is a bottom sheet: the grip folds it to its tabs, a tab opens it', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'the bottom sheet is the compact tier');
  await start(page, '?debug');
  await page.getByTestId('tab-team').click();
  await expect(page.getByTestId('team-panel')).toBeVisible();
  const map = (await page.getByTestId('map-area').boundingBox())!.height;
  await page.getByTestId('sheet-handle').click();
  await expect(page.getByTestId('team-panel')).toBeHidden();
  await expect.poll(async () => (await page.getByTestId('map-area').boundingBox())!.height).toBeGreaterThan(map + 100); // the map gets the room
  await page.getByTestId('tab-team').click();
  await expect(page.getByTestId('team-panel')).toBeVisible();
});
