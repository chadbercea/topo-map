import { expect, test } from '@playwright/test';
import { askResupply, fastForward, freeze, start, openAsk, linked, photo, running } from './helpers';

// ALPHA decides for itself (ILI-1315); its one question is a resupply bird when it's combat
// ineffective. That's the ask these tests drive: the flag, the call box, the link.

test('ALPHA doesn’t ask about unimaged ground: it walks on, and nothing waits on HQ (ILI-1315)', async ({ page }) => {
  await start(page, '?debug');
  await running(page);
  await fastForward(page, 3_000);
  await expect(page.getByTestId('comms')).toHaveCount(0); // no ask beside ALPHA's marker
  await expect(page.getByTestId('team-panel')).toContainText('Moving to F4');
});

test('ALPHA’s ask flags at its marker and opens on a click; answering closes it, and the comms log keeps both sides', async ({ page }) => {
  await start(page, '?debug');
  await askResupply(page);
  await freeze(page);
  const ask = page.getByTestId('comms');
  // It arrives as a flag; the ask itself waits for HQ to open it.
  await expect(ask.getByTestId('incoming')).toHaveAccessibleName('Incoming from ALPHA');
  await expect(ask.getByTestId('comms-text')).toHaveCount(0);
  await openAsk(page);
  await expect(ask.getByTestId('comms-text')).toHaveText(/We need a resupply bird/);
  await expect(page.getByTestId('satcom').locator('.thread')).toContainText('waiting on HQ');
  await ask.getByTestId('responses').getByRole('button', { name: 'Move on without' }).click();
  await expect(ask).toHaveCount(0);
  const log = page.getByTestId('satcom').locator('.thread');
  await expect(log).toContainText('We need a resupply bird');
  await expect(log).toContainText('HQ › Move on without');
});

test('COMMS is a list only; TEAM’s call box answers ALPHA and goes back to the gear after the readback (ILI-1255, ILI-1256)', async ({ page, isMobile }) => {
  await start(page, '?debug');
  await askResupply(page);
  await freeze(page);
  await expect(page.getByTestId('incoming').locator('.pack')).toHaveCount(1); // the backpack on the flag
  if (isMobile) await page.getByTestId('tab-satcom').click();
  await expect(page.getByTestId('satcom').locator('.thread')).toContainText('waiting on HQ');
  await expect(page.getByTestId('satcom').locator('.actions, .incoming-alert')).toHaveCount(0); // nothing to press in COMMS
  if (isMobile) await page.getByTestId('tab-team').click();
  const box = page.getByTestId('call-box');
  await expect(box).toBeVisible();
  await expect(box).toContainText('ALPHA');
  await box.getByTestId('answer-alpha').click();
  await expect(page.getByTestId('comms-text')).toHaveText(/We need a resupply bird/);
  await page.getByTestId('responses').getByRole('button', { name: 'Move on without' }).click();
  await expect(page.getByTestId('comms')).toHaveCount(0); // the flag came down with it
  // It goes up the link (ILI-1209): sending, then ALPHA reads it back and the box goes.
  await expect(page.getByTestId('call-state')).toHaveText('Move on without · sending');
  await expect(page.getByTestId('sent')).toContainText('Move on without · sending to ALPHA');
  await linked(page);
  await expect(box).not.toHaveAttribute('data-call'); // back to the team's gear (ILI-1256)
  await expect(box).toHaveAttribute('data-gear', /map|m4|ifak/);
  await expect(page.getByTestId('sent')).toHaveCount(0);
  if (isMobile) await page.getByTestId('tab-satcom').click();
  await expect(page.getByTestId('satcom').locator('.thread')).toContainText('Understood. Moving with what we have.');
  await expect(page.getByTestId('satcom').locator('.thread')).toContainText('HQ › Move on without');
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
  await expect(page.getByTestId('comms')).toHaveCount(0); // it told HQ; it didn't ask
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

test('when the square card opens where ALPHA’s flag was, the flag moves clear of it (ILI-1215)', async ({ page, isMobile }) => {
  test.skip(isMobile, 'the phone card docks across the top of the map, clear of ALPHA');
  await start(page, '?debug');
  await askResupply(page);
  await freeze(page);
  // H5 is ALPHA's right-hand neighbour on the map's edge: its card can only open to the left, over the flag's spot.
  await page.evaluate(() => window.game.selectSquare('H5'));
  await expect(page.getByTestId('square-card')).toBeVisible();
  await page.waitForTimeout(800);
  const flag = (await page.getByTestId('comms').boundingBox())!;
  const card = (await page.getByTestId('square-card').boundingBox())!;
  const apart = flag.x + flag.width <= card.x || card.x + card.width <= flag.x || flag.y + flag.height <= card.y || card.y + card.height <= flag.y;
  expect(apart).toBe(true);
  await expect(page.locator('[data-testid="call-box"][data-raised]')).toHaveCount(0); // in plain sight, so not raised elsewhere
  await page.getByTestId('incoming').click();
  await page.getByTestId('responses').getByRole('button', { name: 'Move on without' }).click();
  await expect(page.getByTestId('comms')).toHaveCount(0);
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
