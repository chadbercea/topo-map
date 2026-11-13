import { expect, test } from '@playwright/test';

// The war room as an app (ILI-1335): installable (a manifest with the rook icons) and offline (a
// service worker keeps the game's build on the device). Automation skips the service worker unless
// the URL asks: ?sw.
test('the game is installable, and once loaded it plays offline', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium', 'service workers in chromium');
  await page.goto('/game/?sw&debug');
  // Installable: the manifest, its icons, the iOS tags.
  const href = await page.locator('link[rel=manifest]').getAttribute('href');
  const manifest = await (await page.request.get(new URL(href!, page.url()).toString())).json();
  expect(manifest).toMatchObject({ name: 'PMC War Room', start_url: '/game/', scope: '/game/', display: 'fullscreen' });
  expect(manifest.icons.map((i: { sizes: string }) => i.sizes)).toEqual(expect.arrayContaining(['192x192', '512x512']));
  for (const i of manifest.icons) expect((await page.request.get(new URL(i.src, new URL(href!, page.url())).toString())).ok()).toBe(true);
  await expect(page.locator('meta[name=apple-mobile-web-app-capable]')).toHaveAttribute('content', 'yes');
  // The service worker takes over and has the build.
  await page.waitForFunction(async () => !!(await navigator.serviceWorker.ready).active);
  await page.reload();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  // Offline: the game still loads and runs.
  await context.setOffline(true);
  await page.reload();
  await page.waitForFunction(() => window.game?.get().phase === 'running');
  await expect(page.getByTestId('mission-bar')).toBeVisible();
  await context.setOffline(false);
});

test('the Castle House site and the design system are not apps', async ({ page }) => {
  for (const path of ['/game/castle-house/', '/game/design/']) {
    await page.goto(path);
    await expect(page.locator('link[rel=manifest]')).toHaveCount(0);
  }
});
