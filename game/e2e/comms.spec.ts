import { expect, test } from '@playwright/test';
import { askResupply, fastForward, freeze, start, openAsk, linked, photo, running } from './helpers';

// ALPHA decides for itself (ILI-1315); its one question is a resupply bird when it's combat
// ineffective. That's the ask these tests drive: the prompt at its marker (ILI-1393), the call
// box, the link.
const call = (page: import('@playwright/test').Page) => page.locator('[data-testid=prompt][data-kind=team-call]');

test('ALPHA doesn’t ask about unimaged ground: it walks on, and nothing waits on HQ (ILI-1315)', async ({ page }) => {
  await start(page, '?debug');
  await running(page);
  await fastForward(page, 3_000);
  await expect(call(page)).toHaveCount(0); // no call at ALPHA's marker
  await expect(page.getByTestId('team-panel')).toContainText('Moving to F4');
});

test('ALPHA’s call is a prompt at its marker, answered there; the comms log keeps both sides and has nothing to press (ILI-1393)', async ({ page, isMobile }) => {
  await start(page, '?debug');
  await askResupply(page);
  await freeze(page);
  const ask = await openAsk(page);
  await expect(ask.getByTestId('prompt-text')).toContainText('We need a resupply bird');
  const sq = await page.evaluate(() => {
    const { x, y } = window.game.get().team.position;
    return String.fromCharCode(65 + Math.floor(x / 200)) + (Math.floor(y / 200) + 1);
  });
  await expect(ask).toHaveAttribute('data-square', sq); // pinned where ALPHA is
  await expect(page.getByTestId('comms')).toHaveCount(0); // no flag window any more
  if (isMobile) await page.getByTestId('tab-satcom').click();
  else await page.getByTestId('log-toggle').click();
  const log = page.getByTestId('satcom').locator('.thread');
  await expect(log).toContainText('waiting on HQ');
  await expect(page.getByTestId('satcom').locator('button')).toHaveCount(0); // history only: nothing to press
  await ask.getByRole('button', { name: 'Move on without' }).click();
  await expect(call(page)).toHaveCount(0);
  await expect(log).toContainText('We need a resupply bird');
  await expect(log).toContainText('HQ › Move on without');
  // TEAM's call box follows the link (ILI-1209): sending, then ALPHA reads it back and the box goes back to the gear.
  if (isMobile) await page.getByTestId('tab-team').click();
  const box = page.getByTestId('call-box');
  await expect(page.getByTestId('call-state')).toHaveText('Move on without · sending');
  await linked(page);
  await expect(box).not.toHaveAttribute('data-call');
  await expect(box).toHaveAttribute('data-gear', /map|m4|ifak/);
  if (isMobile) await page.getByTestId('tab-satcom').click();
  await expect(log).toContainText('Understood. Moving with what we have.');
});

test('the comms log is a drawer, closed until HQ opens it (ILI-1393)', async ({ page, isMobile }) => {
  test.skip(isMobile, 'on a phone it is the COMMS tab of the sheet');
  await start(page, '?debug');
  await askResupply(page);
  await expect(page.getByTestId('satcom')).toBeHidden();
  await page.getByTestId('log-toggle').click();
  await expect(page.getByTestId('satcom')).toBeVisible();
  await page.getByTestId('log-toggle').click();
  await expect(page.getByTestId('satcom')).toBeHidden();
});

test('HQ finds the checkpoint in E3; heading into it, ALPHA weighs it and says it’s going around (ILI-1315)', async ({ page, isMobile }) => {
  await start(page, '?debug');
  await running(page);
  await freeze(page);
  await photo(page, 'E3');
  // ALPHA walks to F4; as it starts for E3 it decides, and says so.
  await page.evaluate(() => {
    for (let i = 0; i < 900 && window.game.get().team.route.includes('E3'); i++) window.game.tick(100);
  });
  if (isMobile) await page.getByTestId('tab-satcom').click();
  await expect(page.getByTestId('comms-feed')).toContainText(/Contact in E3, a fortified checkpoint\. Not taking that\. Going around via [A-H]\d\./);
  await expect(call(page)).toHaveCount(0); // it told HQ; it didn't ask
});

test('news the map does not show lands in the stream as an alert', async ({ page, isMobile }) => {
  await start(page, '?debug');
  await page.waitForFunction(() => window.game);
  await page.evaluate(() => {
    window.game.set({ ...window.game.get(), noise: 70 });
    window.game.tick(100);
  });
  await expect(page.getByTestId('comms-feed')).toContainText('know a PMC is in the area');
  if (isMobile) await page.getByTestId('tab-satcom').click();
  await expect(page.getByTestId('comms-feed')).toContainText('Enemy radio net just lit up');
});

test('the call box’s strip follows the link: incoming while ALPHA waits, sending while the answer is up, then the box goes back to the gear (ILI-1236, ILI-1255, ILI-1256)', async ({ page, isMobile }) => {
  await start(page, '?debug');
  await askResupply(page);
  await freeze(page);
  if (isMobile) await page.getByTestId('tab-team').click();
  const strip = page.getByTestId('call-box').getByTestId('comms-avatar');
  await expect(strip).toBeVisible();
  await expect(strip).toHaveAttribute('data-state', 'incoming');
  await expect(page.getByTestId('comms-traffic')).toHaveText('incoming');
  await page.evaluate(() => window.game.respond(window.game.get().team.holdFor!, 'push'));
  await expect(strip).toHaveAttribute('data-state', 'sending');
  await fastForward(page, 3_000);
  await expect(page.getByTestId('call-box')).not.toHaveAttribute('data-call');
});
