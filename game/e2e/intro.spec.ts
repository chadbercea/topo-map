import { expect, test, type Locator } from '@playwright/test';

const press = (el: Locator, isMobile: boolean) => (isMobile ? el.tap() : el.click());

// The way in (ILI-1280, ILI-1290): Castle House's title screen with the clock held; START brings
// ORION-3 into focus; picking it wipes into the login, the war room powers on, ORION-3 links
// with ALPHA, and only then does the clock start, with ALPHA's first call. (Automation skips it
// unless the URL asks: ?intro.)
test('the title screen, then ORION-3; the clock starts with ALPHA’s first call', async ({ page, isMobile }) => {
  await page.goto('?intro&debug');
  await page.waitForFunction(() => window.game);
  await expect(page.getByText('CASTLE HOUSE', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.game.get().phase)).toBe('standby');
  await expect(page.getByTestId('intro-orion')).toHaveCount(0); // not until START

  await press(page.getByTestId('title-start'), isMobile);
  await expect(page.getByText('CASTLE HOUSE', { exact: true })).toHaveCount(0);
  const orion = page.getByTestId('intro-orion');
  await expect(orion).toBeVisible();
  await press(orion, isMobile);
  await expect(page.getByTestId('intro-login')).toContainText('OPERATOR AUTH');
  await expect(page.getByTestId('intro-link')).toContainText('SATCOM link established', { ignoreCase: true, timeout: 20_000 });
  expect(await page.evaluate(() => window.game.get().phase)).toBe('standby'); // still held

  await expect(page.getByTestId('intro')).toHaveCount(0, { timeout: 20_000 });
  await expect.poll(() => page.evaluate(() => window.game.get().phase)).toBe('running');
  await expect.poll(() => page.evaluate(() => window.game.get().team.holdFor)).not.toBeNull();
});

test('ABOUT and SETTINGS open over the title; Skip intro makes START go straight to the boot', async ({ page, isMobile }) => {
  await page.goto('?intro&debug');
  await page.waitForFunction(() => window.game);
  await press(page.getByTestId('title-about'), isMobile);
  await expect(page.getByTestId('title-about-panel')).toContainText('Castle House');
  await press(page.getByRole('button', { name: 'Back' }), isMobile);
  await expect(page.getByTestId('title-about-panel')).toHaveCount(0);

  await press(page.getByTestId('title-settings'), isMobile);
  const skip = page.getByTestId('skip-intro');
  await press(skip, isMobile);
  await expect(skip).toHaveAttribute('aria-pressed', 'true');
  await press(page.getByRole('button', { name: 'Back' }), isMobile);

  await press(page.getByTestId('title-start'), isMobile);
  await expect(page.getByTestId('intro-login')).toContainText('OPERATOR AUTH'); // no ORION-3 to pick
});

test('Exit from the pause menu goes back to the title screen', async ({ page, isMobile }) => {
  await page.goto('?intro&debug');
  await page.waitForFunction(() => window.game);
  await page.evaluate(() => window.game.setSettings({ skipIntro: true }));
  await press(page.getByTestId('title-start'), isMobile);
  await expect.poll(() => page.evaluate(() => window.game.get().phase), { timeout: 20_000 }).toBe('running');
  await page.evaluate(() => window.game.pause());
  await press(page.getByRole('button', { name: 'Exit' }), isMobile);
  await expect(page.getByTestId('title-start')).toBeVisible();
  expect(await page.evaluate(() => window.game.get().phase)).toBe('standby');
});

test('Exit from the After Action Report goes back to the title screen too', async ({ page, isMobile }) => {
  await page.goto('?intro&debug');
  await page.waitForFunction(() => window.game);
  await page.evaluate(() => window.game.setSettings({ skipIntro: true }));
  await press(page.getByTestId('title-start'), isMobile);
  await expect.poll(() => page.evaluate(() => window.game.get().phase), { timeout: 20_000 }).toBe('running');
  await page.evaluate(() => window.game.set({ ...window.game.get(), phase: 'ended' }));
  await press(page.getByRole('button', { name: 'Exit' }), isMobile);
  await expect(page.getByTestId('title-start')).toBeVisible();
  expect(await page.evaluate(() => window.game.get().phase)).toBe('standby');
});
