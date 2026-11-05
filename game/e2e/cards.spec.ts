import { expect, test } from '@playwright/test';
import { askResupply, fastForward, freeze, photo, running, start } from './helpers';

// COMMS as a card stack (option D, ILI-1347): what wants HQ is an event card that waits for it.
// Intel lands in INTEL under ORION-3 (IA v2 draft A, ILI-1363).

test('a photo lands in INTEL under ORION-3 as typed reports, not in COMMS (ILI-1363)', async ({ page, isMobile }) => {
  await start(page, '?debug');
  await running(page);
  await freeze(page);
  await photo(page, 'F4'); // the square ALPHA is heading into: fed at once
  if (isMobile) await page.getByTestId('tab-orion').click();
  const items = page.getByTestId('intel-item');
  await expect(items.first()).toBeVisible();
  await expect(items.first()).toContainText('F4');
  await expect(items.first()).toHaveAttribute('data-kind', /^(GEOINT|SIGINT|HUMINT|MASINT|OSINT)$/);
  await expect(page.getByTestId('intel-latest')).toContainText('from F4');
  await expect(page.getByTestId('intel-card')).toHaveCount(0);
});

test('a photo further along the route shows as banked intel', async ({ page, isMobile }) => {
  await start(page, '?debug');
  await running(page);
  await freeze(page);
  await photo(page, 'E3');
  if (isMobile) await page.getByTestId('tab-orion').click();
  await expect(page.getByTestId('intel-item').first()).toHaveAttribute('data-banked', 'true');
  await expect(page.getByTestId('intel-item').first()).toContainText('banked');
});

test('an event is a card that waits; tapping radio traffic starts Listen, and answered it goes dim (ILI-1348)', async ({ page, isMobile }) => {
  await start(page, '?debug');
  await running(page);
  await freeze(page);
  await page.evaluate(() => window.game.addEvent({ id: 'traffic-x', kind: 'signal', square: 'C2', title: 'Enemy radio traffic' }));
  await fastForward(page, 60_000); // it never expires
  if (isMobile) await page.getByTestId('tab-satcom').click();
  const card = page.getByTestId('event-card-stack').filter({ hasText: 'Enemy radio traffic' });
  await expect(card).toHaveAttribute('data-open', 'true');
  await expect(card).toHaveAttribute('data-newest', 'true');
  await expect(card).toContainText('Listen ›');
  await card.getByTestId('card-act').click();
  await expect(page.getByTestId('minigame')).toContainText('LISTEN · C2');
  await page.evaluate(() => {
    const s = window.game.get();
    window.game.set({ ...s, minigame: null, events: s.events.map((e) => (e.id === 'traffic-x' ? { ...e, status: 'resolved' as const } : e)) });
  });
  if (isMobile) await page.getByTestId('tab-satcom').click();
  await expect(card).toHaveAttribute('data-open', 'false');
});

test('an imagery request card sends ORION-3 to its square (ILI-1348)', async ({ page, isMobile }) => {
  await start(page, '?debug');
  await running(page);
  await freeze(page);
  await page.evaluate(() => window.game.addEvent({ id: 'req-f2', kind: 'request', square: 'F2', title: 'Imagery wanted' }));
  if (isMobile) await page.getByTestId('tab-satcom').click();
  const card = page.getByTestId('event-card-stack').filter({ hasText: 'Imagery wanted' });
  await expect(card).toContainText('Scan ›');
  await card.getByTestId('card-act').click();
  await expect.poll(() => page.evaluate(() => window.game.get().satellite.aim)).toBe('F2');
});

test('a building card sends ALPHA to search it, and the card is answered (ILI-1348)', async ({ page, isMobile }) => {
  await start(page, '?debug');
  await running(page);
  await freeze(page);
  await page.evaluate(() => window.game.addEvent({ id: 'building-G4', kind: 'building', square: 'G4', title: 'A building worth a search' }));
  if (isMobile) await page.getByTestId('tab-satcom').click();
  const card = page.getByTestId('event-card-stack').filter({ hasText: 'A building worth a search' });
  await card.getByTestId('card-act').click();
  await expect.poll(() => page.evaluate(() => window.game.get().searching)).toEqual(['G4']);
  if (isMobile) await page.getByTestId('tab-satcom').click();
  await expect(card).toHaveAttribute('data-open', 'false');
});

test('a contact card opens its square’s strikes (ILI-1348)', async ({ page, isMobile }) => {
  await start(page, '?debug');
  await running(page);
  await freeze(page);
  await page.evaluate(() => window.game.addEvent({ id: 'contact-x', kind: 'contact', square: 'F4', title: 'Two technicals' }));
  if (isMobile) await page.getByTestId('tab-satcom').click();
  await page.getByTestId('event-card-stack').filter({ hasText: 'Two technicals' }).getByTestId('card-act').click();
  await expect(page.getByTestId('selected-square')).toHaveText('F4');
  await expect(page.getByTestId('strike-menu').getByTestId('event-card')).toContainText('Two technicals'); // a contact's actions are its strikes
});

test('ALPHA asking is an event card HQ answers right on it (ILI-1348)', async ({ page, isMobile }) => {
  await start(page, '?debug');
  await askResupply(page);
  await freeze(page);
  if (isMobile) await page.getByTestId('tab-satcom').click();
  const ask = page.getByTestId('event-card-stack').filter({ hasText: 'We need a resupply bird' });
  await expect(ask).toHaveAttribute('data-kind', 'ask');
  await expect(ask).toContainText('ALPHA asks');
  await expect(ask).toContainText('waiting on HQ');
  await ask.getByTestId('card-responses').getByRole('button', { name: 'Move on without' }).click();
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
