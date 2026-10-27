import { expect, test } from '@playwright/test';
import { fastForward, freeze, squarePoint, tapAt } from './helpers';

test('ALPHA holds short of unimaged ground and asks; Push through sends it on blind', async ({ page, isMobile }) => {
  await page.goto('?debug');
  await page.waitForFunction(() => window.game);
  await fastForward(page, 500);

  const panel = page.getByTestId('team-panel');
  await expect(page.getByTestId('comms')).toContainText('ALPHA · NEEDS A DECISION');
  await expect(page.getByTestId('call-deadline')).toHaveText(/00:(19|20)/); // the hold times out in 20 s
  await expect(page.getByTestId('comms-text')).toHaveText(/Holding short of F4\. No imagery/);

  const push = page.getByTestId('responses').getByRole('button', { name: 'Push through' });
  if (isMobile) await push.tap();
  else await push.click();
  await fastForward(page, 1_000);
  await expect(panel).toContainText('Moving to F4');
});

test('comms can be minimized to a badge and reopened', async ({ page }) => {
  await page.goto('?debug');
  await page.waitForFunction(() => window.game);
  await fastForward(page, 500);
  await page.getByRole('button', { name: 'Minimize comms' }).click();
  await expect(page.getByTestId('comms')).toHaveCount(0);
  await expect(page.getByTestId('comms-badge')).toContainText('ALPHA needs a decision');
  await page.getByTestId('comms-badge').click();
  await expect(page.getByTestId('comms-text')).toHaveText(/Holding short of F4/);
});

test('Send imagery: a won scan finds the checkpoint in E3 and ALPHA asks to observe, attack or go around', async ({ page, isMobile }) => {
  test.setTimeout(60_000); // a dozen real taps, and CI taps slowly
  await page.goto('?debug');
  await page.waitForFunction(() => window.game);
  await freeze(page);
  await fastForward(page, 500);
  await page.getByTestId('responses').getByRole('button', { name: 'Send imagery' }).click();
  await expect(page.getByTestId('minigame')).toContainText('SATELLITE GRID SCAN · F4');

  for (const id of await page.evaluate(() => window.game.get().minigame!.targets)) {
    await tapAt(page, isMobile, await squarePoint(page, id.charCodeAt(0) - 65, Number(id.slice(1)) - 1));
  }
  await expect(page.getByTestId('minigame')).toHaveAttribute('data-status', 'won');
  await page.getByTestId('minigame').getByRole('button', { name: 'Close' }).click();
  await expect(page.getByTestId('alerts')).toContainText('CONTACT E3');

  // ALPHA walks to F4, then holds short of the contact.
  await page.evaluate(() => {
    for (let i = 0; i < 600 && !window.game.get().team.holdFor; i++) window.game.tick(100);
  });
  await expect(page.getByTestId('comms-text')).toHaveText(/Contact in E3, a fortified checkpoint, on our route/);
  const responses = page.getByTestId('responses');
  for (const name of ['Observe', 'Attack', 'Go around']) await expect(responses.getByRole('button', { name })).toBeVisible();
  await responses.getByRole('button', { name: 'Go around' }).click();
  await expect.poll(() => page.evaluate(() => window.game.get().team.route)).toContain('E4');
});

test('the local fixer is on offer, greyed out until there is money for it', async ({ page }) => {
  await page.goto('?debug');
  await page.waitForFunction(() => window.game?.get().team.holdFor);
  const fixer = page.getByTestId('responses').getByRole('button', { name: /Pay a fixer/ });
  await expect(fixer).toBeDisabled();
  await expect(fixer).toContainText('Over budget');
  await page.evaluate(() => {
    const s = window.game.get();
    window.game.set({ ...s, resources: { ...s.resources, budget: 5_000 } });
  });
  await expect(fixer).toBeEnabled();
  await fixer.click();
  await expect(page.getByTestId('resources')).toContainText('$3,000');
});

test('news the map does not show is a banner, and the radio log keeps every message', async ({ page }) => {
  await page.goto('?debug');
  await page.waitForFunction(() => window.game);
  await page.evaluate(() => {
    window.game.set({ ...window.game.get(), noise: 70 });
    window.game.tick(100);
  });
  await expect(page.getByTestId('banner')).toContainText('know a PMC is in the area');
  await page.getByTestId('log-toggle').click();
  await expect(page.getByTestId('radio-log')).toContainText('Enemy radio net just lit up');
});
