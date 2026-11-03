import { expect, test } from '@playwright/test';
import { askResupply, fastForward, freeze, photo, running, start } from './helpers';

// COMMS as a card stack (option D, ILI-1347): intel lands as small cards that run into ALPHA's
// gauge and fold into a pile; what wants HQ is an event card that waits for it.

test('a photo lands in COMMS as an intel card, then folds into the pile', async ({ page, isMobile }) => {
  await start(page, '?debug');
  await running(page);
  await freeze(page);
  await photo(page, 'F4'); // the square ALPHA is heading into: fed at once
  if (isMobile) await page.getByTestId('tab-satcom').click();
  const card = page.getByTestId('intel-card');
  await expect(card).toHaveCount(1);
  await expect(card).toContainText('IMINT');
  await expect(card).toContainText('F4');
  await expect(card).toContainText('→ gauge');
  await fastForward(page, 7_000);
  await expect(page.getByTestId('intel-card')).toHaveCount(0);
  const pile = page.getByTestId('intel-pile');
  await expect(pile).toContainText('1 intel fed');
  await pile.getByRole('button').click();
  await expect(page.getByTestId('intel-card')).toHaveCount(1);
});

test('a photo further along the route waits as a banked card', async ({ page, isMobile }) => {
  await start(page, '?debug');
  await running(page);
  await freeze(page);
  await photo(page, 'E3');
  if (isMobile) await page.getByTestId('tab-satcom').click();
  const card = page.getByTestId('intel-card');
  await expect(card).toHaveAttribute('data-fed', 'false');
  await expect(card).toContainText('banked · E3');
});

test('an event is a card that waits; tapping it opens its square, and answered it goes dim', async ({ page, isMobile }) => {
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
  await card.getByRole('button').click();
  await expect(page.getByTestId('selected-square')).toHaveText('C2');
  await page.evaluate(() => {
    const s = window.game.get();
    window.game.set({ ...s, events: s.events.map((e) => (e.id === 'traffic-x' ? { ...e, status: 'resolved' as const } : e)) });
  });
  if (isMobile) await page.getByTestId('tab-satcom').click();
  await expect(card).toHaveAttribute('data-open', 'false');
});

test('ALPHA asking is an event card in COMMS, waiting on HQ', async ({ page, isMobile }) => {
  await start(page, '?debug');
  await askResupply(page);
  await freeze(page);
  if (isMobile) await page.getByTestId('tab-satcom').click();
  const ask = page.getByTestId('event-card-stack').filter({ hasText: 'We need a resupply bird' });
  await expect(ask).toHaveAttribute('data-kind', 'ask');
  await expect(ask).toContainText('ALPHA asks');
  await expect(ask).toContainText('waiting on HQ');
});
