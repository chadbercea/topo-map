import { expect, test, type Page } from '@playwright/test';
import { freeze, start, worldToScreen } from './helpers';

// Floating panels keep clear of each other, ALPHA and the square being worked (ILI-1215).
type Box = { x: number; y: number; width: number; height: number };
const hit = (a: Box, b: Box) => a.x < b.x + b.width - 1 && a.x + a.width - 1 > b.x && a.y < b.y + b.height - 1 && a.y + a.height - 1 > b.y;

async function workE3(page: Page) {
  await start(page, '?debug');
  await page.waitForFunction(() => window.game?.get().team.holdFor);
  await freeze(page);
  await page.evaluate(() => {
    const g = window.game;
    g.lookAt('E3');
    for (let i = 0; i < 300 && g.get().satellite.state === 'slewing'; i++) g.tick(100);
    g.capture('photo');
  });
  await expect(page.getByTestId('target-pin').first()).toBeAttached(); // the checkpoint's found: its fighters are in the picture (ILI-1250)
  await page.waitForTimeout(1200); // the camera, the card and the flag settle
}

async function check(page: Page, square: boolean) {
  const panels = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('[data-overlay]')]
      .filter((el) => getComputedStyle(el).visibility !== 'hidden')
      .map((el) => ({ name: el.dataset.overlay!, ...el.getBoundingClientRect().toJSON() }))
      .filter((b) => b.width && b.height),
  );
  // ALPHA's flag may only sit under a panel when nowhere is clear, and then its call is raised
  // where it can't be missed (TEAM's call box, ILI-1255).
  const raised = (await page.locator('[data-testid="call-box"][data-raised]').count()) > 0;
  for (let i = 0; i < panels.length; i++)
    for (let j = i + 1; j < panels.length; j++) {
      if (raised && (panels[i].name === 'flag' || panels[j].name === 'flag')) continue;
      expect(hit(panels[i], panels[j]), `${panels[i].name} overlaps ${panels[j].name}`).toBe(false);
    }
  const team = await page.evaluate(() => window.game.get().team.position);
  const a = await worldToScreen(page, team.x, team.y);
  const alpha = { x: a.x - 10, y: a.y - 10, width: 20, height: 20 };
  for (const p of panels) expect(hit(p, alpha), `${p.name} covers ALPHA`).toBe(false);
  if (!square) return;
  const tl = await worldToScreen(page, 4 * 200, 2 * 200);
  const br = await worldToScreen(page, 5 * 200, 3 * 200);
  const e3 = { x: tl.x, y: tl.y, width: br.x - tl.x, height: br.y - tl.y };
  for (const p of panels.filter((q) => q.name === 'card' || q.name === 'actions')) expect(hit(p, e3), `${p.name} covers E3`).toBe(false);
}

for (const [name, width, height] of [
  ['desktop', 1440, 900],
  ['fold upright', 750, 832],
  ['fold sideways', 832, 750],
] as const) {
  test(`${name}: working E3, nothing floating overlaps, covers ALPHA or covers E3`, async ({ page, isMobile }) => {
    test.skip(isMobile, 'sets its own viewport');
    await page.setViewportSize({ width, height });
    await workE3(page);
    await check(page, true);
  });
}

test('phone: working E3, nothing floating overlaps or covers ALPHA', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'the phone project');
  await workE3(page);
  await check(page, false);
});
