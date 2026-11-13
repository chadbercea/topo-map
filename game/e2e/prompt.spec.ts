import { expect, test } from '@playwright/test';
import { fastForward, freeze, running, squarePoint, start, tapAt } from './helpers';

// Tier two (ILI-1391): ALPHA needing intel is the one prompt on screen, pinned to its grid square
// (ILI-1450), following the map, worked by the player step by step (ILI-1451), and gone once handled.

const fadeIn = (page: import('@playwright/test').Page) => page.waitForTimeout(250);

test('ALPHA needing intel points at the grid square, not a big button; the player clicks it, scans and sends the photo, and nothing happens unless they act (ILI-1450, ILI-1451)', async ({ page, isMobile }) => {
  await start(page, '?debug&gauge');
  await running(page);
  await freeze(page);
  await fastForward(page, 3_000);
  const tag = page.getByTestId('prompt');
  await expect(tag).toHaveCount(1); // one at a time
  await expect(tag).toHaveAttribute('data-kind', 'intel-needed');
  await expect(tag).toHaveAttribute('data-square', 'F4'); // pinned to the grid square ALPHA needs
  await expect(tag).toHaveAttribute('data-step', 'click');
  await expect(tag.getByTestId('prompt-text')).toHaveText('ALPHA needs route intel · click F4');
  await expect(page.getByTestId('prompt-response')).toHaveCount(0); // no big Scan grids button
  await expect(page.getByTestId('needs-hq')).toHaveCount(0); // no mission panel to double it (ILI-1392)
  await expect(page.getByTestId('event-card-stack').filter({ hasText: 'requests imagery' })).toHaveCount(0); // nor in COMMS

  // Left alone, nothing moves for the player.
  const aim = await page.evaluate(() => window.game.get().satellite.aim);
  await fastForward(page, 30_000);
  expect(await page.evaluate(() => window.game.get().satellite.aim)).toBe(aim);
  await expect(tag).toHaveAttribute('data-step', 'click');

  // Step 1: click F4 on the map. It's picked, and ORION-3 goes.
  await tapAt(page, isMobile, await squarePoint(page, 5, 3));
  await expect(page.getByTestId('selected-square')).toHaveText('F4');
  await expect(tag).toHaveAttribute('data-step', 'moving');
  await expect(tag.getByTestId('prompt-text')).toHaveText('ORION-3 moving to F4…');

  // Step 2: on its way. Locked on, it waits for the player: no scan by itself.
  await fastForward(page, 30_000);
  await expect(tag).toHaveAttribute('data-step', 'analyze');
  await expect(tag.getByTestId('prompt-text')).toHaveText('Analyze F4 in ORION-3');
  expect(await page.evaluate(() => !!window.game.get().imagery.F4)).toBe(false);

  // Step 3: Analyze in ORION-3, pulsing. Its package goes on the shelf and ALPHA pulls it (ILI-1499):
  // no send step. F4's ask is answered and the tag goes.
  if (isMobile) await page.getByTestId('tab-orion').click(); // a picked square folds the sheet on a phone (ILI-1397)
  const sat = page.getByTestId('satellite');
  await expect(sat.getByTestId('capture-scan')).toHaveAttribute('data-cue', /.*/);
  await sat.getByTestId('capture-scan').click();
  await fastForward(page, 200);
  await expect.poll(() => page.evaluate(() => window.game.get().events.some((e) => e.id.startsWith('imagery-F4') && e.status !== 'resolved'))).toBe(false);
  await expect(page.locator('[data-testid=prompt][data-square=F4]')).toHaveCount(0);
});

test('the prompt follows its square when the map moves', async ({ page, isMobile }) => {
  test.skip(isMobile, 'drag panning is covered on desktop');
  await start(page, '?debug&gauge');
  await running(page);
  await freeze(page);
  await fastForward(page, 3_000);
  const prompt = page.getByTestId('prompt');
  await expect(prompt).toBeVisible();
  await fadeIn(page);
  const before = (await prompt.boundingBox())!;
  // Grab open map: the first spot where nothing sits over the canvas.
  const area = await page.evaluate(() => {
    const b = document.querySelector('[data-testid=map-area]')!.getBoundingClientRect();
    for (const fy of [0.6, 0.5, 0.4, 0.3, 0.7])
      for (const fx of [0.3, 0.4, 0.6, 0.7]) {
        const p = { x: b.x + b.width * fx, y: b.y + b.height * fy };
        if (document.elementFromPoint(p.x, p.y)?.tagName === 'CANVAS') return p;
      }
    throw new Error('no open map to drag');
  });
  await page.mouse.move(area.x, area.y);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(area.x + 10 * i, area.y + 6 * i);
  await page.mouse.up();
  await fadeIn(page);
  const after = (await prompt.boundingBox())!;
  expect(Math.hypot(after.x - before.x, after.y - before.y)).toBeGreaterThan(20);
});
