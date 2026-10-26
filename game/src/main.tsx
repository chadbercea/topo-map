import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createGame } from './game/createGame';
import { Hud } from './hud/Hud';
import './styles.css';

// Phaser and React each own one layer. The game is created once, outside React,
// so StrictMode's double mount never spins up a second canvas.
const game = createGame(document.getElementById('game')!);

createRoot(document.getElementById('hud')!).render(
  <StrictMode>
    <Hud />
  </StrictMode>,
);

if (import.meta.hot) import.meta.hot.dispose(() => game.destroy(true));
