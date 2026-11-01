import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createGame } from './game/createGame';
import { Hud } from './hud/Hud';
import { loadSettings, saveSettings } from './hud/settings';
import { game } from './sim/store';
import { intro } from './hud/intro';
import { keepLedger, loadBalance, loadUnlocks, loadUpgrades } from './hud/ledger';
import './styles.css';

// Phaser and React each own one layer. The game is created once, outside React,
// so StrictMode's double mount never spins up a second canvas.
// ?minutes=8 tunes the mission length (GDD: tune by feel; ten minutes by default since ILI-1251).
const minutes = Number(new URLSearchParams(location.search).get('minutes'));
if (minutes > 0) game.setMissionLength(minutes);

const saved = loadSettings();
if (saved) game.setSettings(saved);
let settings = game.get().settings;
game.subscribe(() => {
  if (game.get().settings !== settings) saveSettings((settings = game.get().settings));
});

// Castle House's terminal idles, the clock held, until HQ logs in (ILI-1280).
if (navigator.webdriver) document.documentElement.dataset.automated = '';
// Under test automation ALPHA's intel gauge is pinned full, so a test of something else isn't
// a test of keeping the team fed; ?gauge plays it for real (ILI-1314).
if (navigator.webdriver && !new URLSearchParams(location.search).has('gauge')) game.setIntelBase(100);
// The balance Castle House carries in, and keeping it when the mission ends (ILI-1316).
game.setOpening(loadBalance(), loadUnlocks(), loadUpgrades());
keepLedger();
intro.idle();

const phaser = createGame(document.getElementById('game')!);

createRoot(document.getElementById('hud')!).render(
  <StrictMode>
    <Hud />
  </StrictMode>,
);

if (import.meta.hot) import.meta.hot.dispose(() => phaser.destroy(true));
