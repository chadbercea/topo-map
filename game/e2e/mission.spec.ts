import { expect, test } from '@playwright/test';
import { freeze, start } from './helpers';

test('the objective leads ALPHA from the crash site to exfil, and the mission completes', async ({ page }) => {
  await start(page, '?debug');
  await page.waitForFunction(() => window.game);
  await freeze(page);
  await expect(page.getByTestId('objective')).toContainText('Recover the black box at D3');

  // Clear ground the whole way, so nothing stops the walk.
  await page.evaluate(() => {
    const s = window.game.get();
    window.game.set({ ...s, contacts: [], schedule: [], map: { ...s.map, scanned: [...s.team.route] }, comms: { ...s.comms, messages: [] }, team: { ...s.team, holdFor: null }, script: { ...s.script, fired: [...s.script.fired, 'convoy-on-exfil'] } }); // no convoy on the exfil (ILI-1192)
  });
  await page.evaluate(() => {
    for (let i = 0; i < 6000 && window.game.get().mission.phase !== 'exfil'; i++) window.game.tick(100);
  });
  await expect(page.getByTestId('objective')).toContainText('Exfil at B1 with the black box');

  // In B1 and it's clear: SKYHOOK-1 confirms and the orange exfil panel counts it in (ILI-1264).
  await page.evaluate(() => {
    for (let i = 0; i < 7000 && !window.game.get().exfil; i++) window.game.tick(100);
  });
  const exfil = page.getByTestId('exfil-panel');
  await expect(exfil).toHaveAttribute('data-stage', 'enroute');
  await expect(exfil).toContainText('en route');
  await expect(page.getByTestId('exfil-eta')).toHaveText('0:10');
  // It comes in, ALPHA boards one at a time, it lifts out: the extraction is called good.
  await page.evaluate(() => {
    for (let i = 0; i < 2000 && window.game.get().exfil?.boardMs == null; i++) window.game.tick(100);
    window.game.tick(1000);
  });
  await expect(exfil).toHaveAttribute('data-stage', 'boarding');
  await expect(page.getByTestId('exfil-log')).toContainText('aboard');
  await page.evaluate(() => {
    const g = window.game;
    for (let i = 0; i < 200 && !(g.get().exfil?.liftMs && g.get().elapsedMs > g.get().exfil!.liftMs! + 2_600); i++) g.tick(100);
  });
  await expect(exfil).toHaveAttribute('data-stage', 'done');
  await expect(exfil).toContainText('Successful extraction');
  await expect(page.getByTestId('wrapup')).toHaveCount(0);
  await page.evaluate(() => {
    for (let i = 0; i < 7000 && window.game.get().phase !== 'ended'; i++) window.game.tick(100);
  });
  const wrap = page.getByTestId('wrapup');
  await expect(wrap).toContainText('AFTER ACTION REPORT');
  // The report notes the extraction; the band's SKYHOOK-1 panel is gone (ILI-1528).
  await expect(wrap.getByTestId('aar-exfil')).toContainText('Successful extraction');
  await expect(page.getByTestId('exfil-panel')).toHaveCount(0);
  await expect(wrap).toHaveAttribute('data-outcome', 'win');
  await expect(wrap).toContainText('MISSION SUCCESS');
  await expect(wrap).toContainText('Black box recovered. Everyone came home.');
  // The P&L (ILI-1316): −$400,000 up front, $1,500,000 out of escrow on a clean run, on $10M (ILI-1405).
  await expect(page.getByTestId('pnl')).toHaveText('$1,100,000');
  await expect(page.getByTestId('budget')).toHaveText('$11,100,000');
  await wrap.getByRole('button', { name: /^Next contract \(2 of 3\)/ }).click(); // a three-contract campaign (ILI-1566)
  await expect(wrap).toHaveCount(0);
  await expect(page.getByTestId('objective')).toContainText('Recover the black box at D3'); // the next contract, live
  await expect(page.getByTestId('clock')).toHaveText('10:00');
});

test('running out of time fails the mission; the wrap-up offers a retry', async ({ page }) => {
  await start(page, '?debug');
  await page.waitForFunction(() => window.game);
  await page.evaluate(() => {
    const s = window.game.get();
    window.game.set({ ...s, timer: { remainingMs: 500, totalMs: 600_000 } });
    for (let i = 0; i < 10; i++) window.game.tick(100);
  });
  const wrap = page.getByTestId('wrapup');
  await expect(wrap).toHaveAttribute('data-outcome', 'failed');
  await expect(wrap).toContainText('Time ran out before exfil.');
  await expect(wrap.getByRole('button', { name: 'Retry contract' })).toBeVisible();
});
