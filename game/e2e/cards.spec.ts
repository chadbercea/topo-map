import { expect, test } from '@playwright/test';
import { askResupply, fastForward, freeze, photo, running, start } from './helpers';

// COMMS as a card stack (option D, ILI-1347): what wants HQ is an event card that waits for it.
// Intel lands in INTEL under ORION-3 (IA v2 draft A, ILI-1363).

test('a scan settles its square: a stamp on the map, its report in ORION-3, and no Scan again (ILI-1399, ILI-1487)', async ({ page }) => {
  await start(page, '?debug');
  await running(page);
  await freeze(page);
  await photo(page, 'F4'); // the square ALPHA is heading into
  await expect(page.getByTestId('intel-panel')).toHaveCount(0); // results live on the map now
  await page.evaluate(() => window.game.selectSquare('F4'));
  // Satellite intel is ORION-3's (ILI-1487): its scan report sits under its picture, not on the square's flyout.
  const report = page.getByTestId('satellite').getByTestId('square-intel');
  await expect(report.getByTestId('intel-summary')).toHaveText(/^(cleared|\d reports?)$/); // one scan settles it
  await expect(report.getByTestId('square-intel-item').first()).toHaveAttribute('data-kind', /^(GEOINT|SIGINT|HUMINT|MASINT|OSINT)$/);
  await expect(page.getByTestId('square-anchor').getByTestId('square-intel')).toHaveCount(0); // nothing in both places
  await expect(page.getByTestId('satellite').getByTestId('capture-scan')).toBeDisabled();
});

test('an event is a card that waits, a record only: nothing on it starts anything (ILI-1348, ILI-1393)', async ({ page, isMobile }) => {
  await start(page, '?debug');
  await running(page);
  await freeze(page);
  await page.evaluate(() => {
    window.game.addEvent({ id: 'traffic-x', kind: 'signal', square: 'C2', title: 'Enemy radio traffic' });
    window.game.addEvent({ id: 'building-G4', kind: 'building', square: 'G4', title: 'A building worth a search' });
    window.game.addEvent({ id: 'contact-x', kind: 'contact', square: 'F4', title: 'Two technicals' });
  });
  await fastForward(page, 60_000); // they never expire
  if (isMobile) await page.getByTestId('tab-satcom').click();
  else await page.getByTestId('log-toggle').click();
  const card = page.getByTestId('event-card-stack').filter({ hasText: 'Enemy radio traffic' });
  await expect(card).toHaveAttribute('data-open', 'true');
  await expect(page.getByTestId('card-act')).toHaveCount(0);
  await expect(page.getByTestId('satcom').locator('button')).toHaveCount(0);
  await page.evaluate(() => {
    const s = window.game.get();
    window.game.set({ ...s, events: s.events.map((e) => (e.id === 'traffic-x' ? { ...e, status: 'resolved' as const } : e)) });
  });
  await expect(card).toHaveAttribute('data-open', 'false');
});

test('ALPHA asking is a card in the log; HQ answers at the prompt, and the card follows (ILI-1348, ILI-1393)', async ({ page, isMobile }) => {
  await start(page, '?debug');
  await askResupply(page);
  await freeze(page);
  if (isMobile) await page.getByTestId('tab-satcom').click();
  else await page.getByTestId('log-toggle').click();
  const ask = page.getByTestId('event-card-stack').filter({ hasText: 'We need a resupply bird' });
  await expect(ask).toHaveAttribute('data-kind', 'ask');
  await expect(ask).toContainText('ALPHA asks');
  await expect(ask).toContainText('waiting on HQ');
  await expect(ask.getByTestId('card-responses')).toHaveCount(0);
  await page.locator('[data-testid=prompt][data-kind=team-call]').getByRole('button', { name: 'Move on without' }).click();
  await expect(ask).toContainText('HQ › Move on without · sending');
  await expect(page.getByTestId('comms')).toHaveCount(0); // the flag came down with it
  await fastForward(page, 2_500);
  await expect(ask).toHaveAttribute('data-open', 'false');
  await expect(ask).toContainText('HQ › Move on without');
});

test('answering ALPHA somewhere else closes its card too (ILI-1348)', async ({ page, isMobile }) => {
  await start(page, '?debug');
  await askResupply(page);
  await freeze(page);
  await page.evaluate(() => {
    const s = window.game.get();
    const call = s.comms.messages.find((m) => m.id === s.team.holdFor)!;
    window.game.respond(call.id, call.responses![0].id);
  });
  if (isMobile) await page.getByTestId('tab-satcom').click();
  const ask = page.getByTestId('event-card-stack').filter({ hasText: 'We need a resupply bird' });
  await expect(ask.getByTestId('card-responses')).toHaveCount(0);
  await expect(ask).toContainText('sending');
});
