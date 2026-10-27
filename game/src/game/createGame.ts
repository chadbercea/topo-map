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
    // for phone batteries. Under browser automation (CI's 2-core software renderer) 10 is
    // plenty, and leaves the CPU for the page and the test. Game time runs on its own step.
    fps: navigator.webdriver ? { limit: 10, target: 10 } : { limit: 30, target: 30 },
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
