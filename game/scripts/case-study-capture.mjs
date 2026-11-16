// Captures stills (and a gameplay recording) of PMC War Room for the case study (ILI-1576).
//
// Serve the topo-map build the way Vercel does first:
//   (in topo-map) npm run build --prefix game && mkdir -p site/game && cp *.html site/ && cp -r game/dist/. site/game/
//   python3 -m http.server 4510 --directory site
// then (in game/): BASE=http://127.0.0.1:4510 node scripts/case-study-capture.mjs [group ...]
//
// Groups: pages, design, intro, game. No args runs them all. Output: case-study/assets/.
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const BASE = process.env.BASE ?? 'http://127.0.0.1:4510';
const OUT = new URL('../../case-study/assets/', import.meta.url).pathname;
const W = 1440;
const H = 900;
const only = process.argv.slice(2);
const want = (g) => !only.length || only.includes(g);

const browser = await chromium.launch();
// ?debug adds a SCENE readout to the HUD; keep it out of the pictures.
const ctx = async (opts = {}) => {
  const c = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2, ...opts });
  await c.addInitScript(() => {
    addEventListener('DOMContentLoaded', () => {
      const st = document.createElement('style');
      st.textContent = '[data-testid=scene-status]{display:none!important}';
      document.head.append(st);
    });
  });
  return c;
};
// Mission time moves in 100 ms ticks, so a capture doesn't wait on the frame rate.
const tick = (p, ms) => p.evaluate((ms) => { for (let t = 0; t < ms; t += 100) window.game.tick(100); }, ms);
const onStation = (p) => p.evaluate(() => { for (let i = 0; i < 400 && window.game.get().satellite.state === 'slewing'; i++) window.game.tick(100); });
const shot = async (page, name, opts = {}) => {
  const path = `${OUT}${name}.jpg`;
  await page.screenshot({ path, type: 'jpeg', quality: 85, ...opts });
  console.log('  ', name);
};

// The four prototypes the build went through, the project overview, and the pages around the game.
async function pages() {
  await mkdir(`${OUT}pivot`, { recursive: true });
  await mkdir(`${OUT}pages`, { recursive: true });
  const c = await ctx();
  const p = await c.newPage();
  for (const [file, name, wait] of [
    ['topo-map.html', 'pivot/1-survey-map', 8000],
    ['headgate.html', 'pivot/2-headgate', 4000],
    ['ground-truth.html', 'pivot/3-ground-truth', 4000],
    ['war-room.html', 'pivot/4-war-room-prototype', 4000],
    ['index.html', 'pages/project-overview', 3000],
    ['game/castle-house/', 'pages/castle-house', 5000],
    ['game/review/', 'pages/review-hub', 2000],
    ['game/wireframe/', 'pages/wireframe', 2000],
  ]) {
    await p.goto(`${BASE}/${file}`);
    await p.waitForTimeout(wait);
    await shot(p, name);
    if (name.startsWith('pages/')) await shot(p, `${name}-full`, { fullPage: true });
  }
  await c.close();
}

// The design system, one still per section.
async function design() {
  await mkdir(`${OUT}design`, { recursive: true });
  const c = await ctx();
  const p = await c.newPage();
  await p.goto(`${BASE}/game/design/`);
  await p.waitForTimeout(4000);
  await shot(p, 'design/top');
  const ids = await p.$$eval('section[id]', (s) => s.map((x) => x.id));
  for (const id of ids) {
    const el = p.locator(`section#${id}`);
    await el.scrollIntoViewIfNeeded();
    await p.waitForTimeout(1500);
    await el.screenshot({ path: `${OUT}design/${id}.jpg`, type: 'jpeg', quality: 85 });
    console.log('   design/' + id);
  }
  await c.close();
}

// The way in: title, ORION-3, the tasking panel, the login, the HUD powering on.
async function intro() {
  await mkdir(`${OUT}game`, { recursive: true });
  const c = await ctx();
  const p = await c.newPage();
  await p.goto(`${BASE}/game/?intro&debug`);
  await p.waitForFunction(() => window.game);
  await p.waitForTimeout(5000);
  await shot(p, 'game/01-title');
  await p.getByTestId('title-start').click();
  const orion = p.getByTestId('intro-orion');
  await orion.waitFor();
  await p.waitForTimeout(3500);
  await shot(p, 'game/02-orion-3');
  await orion.click();
  await p.getByTestId('intro-tasking').waitFor();
  await p.getByTestId('tasking-expand').click();
  await p.waitForTimeout(1200);
  await shot(p, 'game/03-tasking');
  await p.getByTestId('tasking-accept').click();
  await p.getByTestId('intro-login').waitFor();
  await p.waitForTimeout(1500);
  await shot(p, 'game/04-login');
  await p.getByTestId('intro').waitFor({ state: 'detached', timeout: 30_000 });
  await p.waitForTimeout(600);
  await shot(p, 'game/05-power-on');
  await p.waitForTimeout(4000);
  await shot(p, 'game/06-live');
  await c.close();
}

// Play: ORION-3 analyzes the ground ahead, a threat and its strike options, a strike, radio traffic
// and the intercept mini game; then a blind walk into a hidden group, and the wrap-up.
async function game() {
  await mkdir(`${OUT}game`, { recursive: true });
  const c = await ctx();
  const p = await c.newPage();
  await p.goto(`${BASE}/game/?debug`);
  await p.waitForFunction(() => window.game);
  await p.getByTestId('team-panel').waitFor({ state: 'attached' });
  await p.waitForTimeout(4000);
  await p.evaluate(() => window.game.lookAt('F4'));
  await onStation(p);
  await p.waitForTimeout(2500);
  await shot(p, 'game/07-orion-on-f4');
  await p.evaluate(() => window.game.capture('photo'));
  await p.waitForTimeout(2500);
  await shot(p, 'game/08-analyzed-f4');
  await p.evaluate(() => window.game.closeLook());
  await p.evaluate(() => window.game.lookAt('E3'));
  await onStation(p);
  await p.evaluate(() => window.game.capture('photo'));
  await p.waitForTimeout(2000);
  await shot(p, 'game/09-e3-contact');
  await p.evaluate(() => { window.game.closeLook(); window.game.selectSquare('E3'); });
  await p.waitForTimeout(2000);
  await shot(p, 'game/10-e3-square-card');
  await p.evaluate(() => window.game.fire('group-e3', 'heli'));
  for (let i = 0; i < 6; i++) { await tick(p, 1000); await p.waitForTimeout(400); }
  await shot(p, 'game/11-strike');
  await p.evaluate(() => { window.game.closeSquare(); window.game.addEvent({ id: 'traffic-c2', kind: 'signal', square: 'C2', title: 'Enemy radio traffic' }); });
  await p.waitForTimeout(2000);
  await shot(p, 'game/12-radio-traffic');
  await p.evaluate(() => window.game.selectSquare('C2'));
  await p.waitForTimeout(1500);
  await shot(p, 'game/13-radio-square-card');
  const listen = p.getByText(/^LISTEN/i).first();
  if (await listen.count()) {
    await listen.click();
    await p.waitForTimeout(1200);
    await shot(p, 'game/14-traffic-card');
    await p.getByText(/^SEND ORION-3/i).first().click();
    await p.evaluate(() => { for (let i = 0; i < 600 && !window.game.get().minigame; i++) window.game.tick(100); });
    await p.waitForTimeout(2500);
    await shot(p, 'game/15-intercept');
  } else console.log('   (no Listen button found)');
  await c.close();

  // Blind: ALPHA walks on without a look and meets a group nobody found.
  const c2 = await ctx();
  const q = await c2.newPage();
  await q.goto(`${BASE}/game/?debug`);
  await q.waitForFunction(() => window.game);
  await q.getByTestId('team-panel').waitFor({ state: 'attached' });
  await q.waitForTimeout(3000);
  await q.evaluate(() => { window.game.setWalkFree(true); for (let i = 0; i < 6000 && !window.game.get().team.fight; i++) window.game.tick(100); });
  await tick(q, 2500);
  await q.waitForTimeout(1500);
  await shot(q, 'game/16-blind-contact');
  // Then the client's clock runs out: the wrap-up and its grade.
  await q.evaluate(() => { for (let i = 0; i < 7000 && window.game.get().phase !== 'ended'; i++) window.game.tick(100); });
  await q.waitForTimeout(3000);
  await shot(q, 'game/17-wrap-up');
  await c2.close();
}

if (want('pages')) await pages();
if (want('design')) await design();
if (want('intro')) await intro();
if (want('game')) await game();
await browser.close();
