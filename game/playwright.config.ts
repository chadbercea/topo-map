import { defineConfig, devices } from '@playwright/test';

// Smoke tests run against the production build, served the way Vercel serves it (under /game/).
export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  // The browsers render on the CPU (no GPU in CI); more workers starve the frame clock.
  workers: 2,
  // CI's software renderer is slow with the full war room on screen (stream, team panel
  // heartbeats, water): many tests ran 25-38 s against the old 30 s default.
  timeout: 60_000,
  reporter: [['list']],
  use: { baseURL: 'http://localhost:4173/game/', trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1440, height: 900 } } },
    // Phone size and touch at 1x pixels: at the iPhone's 3x the software compositor can't keep up.
    { name: 'phone', use: { ...devices['iPhone 13'], deviceScaleFactor: 1, browserName: 'chromium' } },
  ],
  webServer: {
    command: 'npm run build && npx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173/game/',
    reuseExistingServer: false,
  },
});
