import * as Phaser from 'phaser';
import { MapScene } from './MapScene';

import { DPR } from './dpr';

const size = () => ({ width: Math.round(innerWidth * DPR), height: Math.round(innerHeight * DPR) });

export function createGame(parent: HTMLElement) {
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    backgroundColor: '#0b0f0d',
    scale: { mode: Phaser.Scale.NONE, ...size(), zoom: 1 / DPR },
    render: { antialias: true, roundPixels: false },
    // The map is mostly still: 30 frames a second looks the same and halves the drawing work
    // for phone batteries. Under browser automation (CI's 2-core software renderer) 4: each
    // frame of the map costs ~65 ms to paint in software, and at 10 it took two thirds of the
    // page's main thread, so every click and evaluate queued behind it (ILI-1259: the long
    // flows ran 5x slower and timed out). Game time runs on its own step.
    fps: navigator.webdriver ? { limit: 4, target: 4 } : { limit: 30, target: 30 },
    banner: false,
    scene: [MapScene],
  });
  const onResize = () => {
    const { width, height } = size();
    game.scale.resize(width, height);
  };
  window.addEventListener('resize', onResize);
  game.events.once(Phaser.Core.Events.DESTROY, () => window.removeEventListener('resize', onResize));
  return game;
}
