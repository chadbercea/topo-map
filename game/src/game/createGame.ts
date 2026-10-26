import * as Phaser from 'phaser';
import { MapScene } from './MapScene';

export function createGame(parent: HTMLElement) {
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    backgroundColor: '#0b0f0d',
    scale: { mode: Phaser.Scale.RESIZE, width: '100%', height: '100%' },
    // Crisp lines on high-DPI phones without the cost of full antialiasing everywhere.
    render: { antialias: true, roundPixels: false },
    banner: false,
    scene: [MapScene],
  });
}
