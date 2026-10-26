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
