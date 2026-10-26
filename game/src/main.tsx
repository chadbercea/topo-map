import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createGame } from './game/createGame';
import { Hud } from './hud/Hud';
import { loadSettings, saveSettings } from './hud/settings';
import { game } from './sim/store';
import { play, setMuted, unlockAudio } from './audio/sfx';
import { cues } from './audio/cues';
import './styles.css';

// Phaser and React each own one layer. The game is created once, outside React,
// so StrictMode's double mount never spins up a second canvas.
// ?minutes=8 tunes the mission length (GDD: start with six minutes and tune by feel).
const minutes = Number(new URLSearchParams(location.search).get('minutes'));
if (minutes > 0) game.setMissionLength(minutes);

const saved = loadSettings();
if (saved) game.setSettings(saved);
// Sound: browsers need a touch before audio can start; after that, state changes cue sounds.
for (const ev of ['pointerdown', 'keydown']) window.addEventListener(ev, unlockAudio, { once: true });
let heard = game.get();
setMuted(!heard.settings.sound);
game.subscribe(() => {
  const now = game.get();
  setMuted(!now.settings.sound);
  for (const sfx of cues(heard, now)) play(sfx);
  heard = now;
});

let settings = game.get().settings;
game.subscribe(() => {
  if (game.get().settings !== settings) saveSettings((settings = game.get().settings));
});

const phaser = createGame(document.getElementById('game')!);

createRoot(document.getElementById('hud')!).render(
  <StrictMode>
    <Hud />
  </StrictMode>,
);

if (import.meta.hot) import.meta.hot.dispose(() => phaser.destroy(true));
