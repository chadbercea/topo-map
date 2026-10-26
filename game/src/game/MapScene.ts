import * as Phaser from 'phaser';
import { bus, EV, type SceneStatus } from './events';

// Empty map scene: a faint grid so the canvas is visibly alive, and a crosshair that
// follows the last pointer or touch so input can be checked on desktop and phone.
export class MapScene extends Phaser.Scene {
  private grid!: Phaser.GameObjects.Graphics;
  private cross!: Phaser.GameObjects.Graphics;
  private pointer = 'none';

  constructor() {
    super('map');
  }

  create() {
    this.grid = this.add.graphics();
    this.cross = this.add.graphics();

    this.scale.on(Phaser.Scale.Events.RESIZE, this.layout, this);
    this.input.on(Phaser.Input.Events.POINTER_DOWN, this.track, this);
    this.input.on(Phaser.Input.Events.POINTER_MOVE, this.track, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.layout, this);
    });

    this.layout();
  }

  private layout() {
    const { width, height } = this.scale;
    const step = 64;
    this.grid.clear().lineStyle(1, 0x35d0a5, 0.12);
    for (let x = (width % step) / 2; x <= width; x += step) this.grid.lineBetween(x, 0, x, height);
    for (let y = (height % step) / 2; y <= height; y += step) this.grid.lineBetween(0, y, width, y);
    this.status();
  }

  private track(p: Phaser.Input.Pointer) {
    this.cross.clear().lineStyle(1, 0x35d0a5, 0.8);
    this.cross.lineBetween(p.x - 12, p.y, p.x + 12, p.y).lineBetween(p.x, p.y - 12, p.x, p.y + 12);
    this.pointer = `${p.wasTouch ? 'touch' : 'mouse'} ${Math.round(p.x)},${Math.round(p.y)}`;
    this.status();
  }

  private status() {
    const s: SceneStatus = {
      width: Math.round(this.scale.width),
      height: Math.round(this.scale.height),
      renderer: this.game.renderer.type === Phaser.WEBGL ? 'WebGL' : 'Canvas',
      pointer: this.pointer,
    };
    bus.emit(EV.sceneStatus, s);
  }
}
