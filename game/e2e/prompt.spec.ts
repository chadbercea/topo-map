import { expect, test } from '@playwright/test';
import { fastForward, freeze, running, start } from './helpers';

// Tier two (ILI-1391): ALPHA needing intel is the one prompt on screen, pinned to its square,
// following the map, answered right on it, and gone once handled.

const fadeIn = (page: import('@playwright/test').Page) => page.waitForTimeout(250);

test('ALPHA needing intel is a prompt pinned to its square; Scan answers it and it goes', async ({ page }) => {
  await start(page, '?debug&gauge');
  await running(page);
  await freeze(page);
  await fastForward(page, 3_000);
  const prompt = page.getByTestId('prompt');
  await expect(prompt).toHaveCount(1); // one at a time
  const square = await prompt.getAttribute('data-square');
  expect(square).toMatch(/^[A-H]\d$/);
  await expect(prompt.getByTestId('prompt-text')).toContainText(`needs intel on ${square}`);
  await expect(prompt.getByTestId('prompt-response')).toHaveText([`Scan ${square}`]);
  await expect(page.getByTestId('needs-hq')).not.toContainText('requests imagery'); // not doubled in the mission panel
  await expect(page.getByTestId('event-card-stack').filter({ hasText: 'requests imagery' })).toHaveCount(0); // nor in COMMS

  await prompt.getByTestId('prompt-response').click();
  await expect.poll(() => page.evaluate(() => window.game.get().satellite.aim)).toBe(square);
  await fastForward(page, 60_000);
  await expect.poll(() => page.evaluate((sq) => !!window.game.get().imagery[sq!], square)).toBe(true);
  await fastForward(page, 200);
  await expect(page.getByTestId('prompt').and(page.locator(`[data-square="${square}"]`))).toHaveCount(0);
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
