import * as Phaser from 'phaser';
import { bus, EV, type SceneStatus } from './events';
import { createLoop } from '../sim/loop';
import { game } from '../sim/store';
import { CELL, COLS, ROWS, squareAt, squareId, parseSquare, WORLD_H, WORLD_W } from '../map/grid';
import { generateTerrain, traceContours, type ContourLine } from '../map/terrain';
import { DPR } from './dpr';

const TEAL = 0x35d0a5;
const MARGIN = 24 * DPR; // 24 CSS px around the grid

// The theater map: contour lines of the fictional terrain under the A1–H5 grid. The camera
// fits the grid to the screen; line widths and labels are redrawn per zoom so they stay crisp.
export class MapScene extends Phaser.Scene {
  private contours: ContourLine[] = [];
  private terrain?: Phaser.GameObjects.Image;
  private gridGfx!: Phaser.GameObjects.Graphics;
  private selectGfx!: Phaser.GameObjects.Graphics;
  private labels: Phaser.GameObjects.Text[] = [];
  private pointer = 'none';
  private unsubscribe?: () => void;
  // Phaser owns the frame clock; the sim advances in fixed ticks from it.
  private loop = createLoop((dt) => game.tick(dt));

  constructor() {
    super('map');
  }

  create() {
    this.contours = traceContours(generateTerrain());
    this.gridGfx = this.add.graphics();
    this.selectGfx = this.add.graphics();
    for (let c = 0; c < COLS; c++)
      for (let r = 0; r < ROWS; r++)
        this.labels.push(
          this.add
            .text(c * CELL, r * CELL, squareId(c, r), { fontFamily: 'JetBrains Mono, monospace', fontSize: `${11 * DPR}px`, color: '#6f8a7d' })
        );

    this.scale.on(Phaser.Scale.Events.RESIZE, this.layout, this);
    this.input.on(Phaser.Input.Events.POINTER_DOWN, this.onDown, this);
    this.input.on(Phaser.Input.Events.POINTER_MOVE, this.track, this);
    this.unsubscribe = game.subscribe(() => this.drawSelection());
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.layout, this);
      this.unsubscribe?.();
    });

    this.layout();
  }

  update(_time: number, delta: number) {
    this.loop.advance(delta);
  }

  private get zoom() {
    return this.cameras.main.zoom;
  }

  private layout() {
    const { width, height } = this.scale;
    const cam = this.cameras.main;
    cam.setZoom(Math.min((width - MARGIN * 2) / WORLD_W, (height - MARGIN * 2) / WORLD_H));
    cam.centerOn(WORLD_W / 2, WORLD_H / 2);
    this.drawTerrain();
    this.drawGrid();
    this.drawSelection();
    this.labels.forEach((label, i) => {
      label.setScale(1 / this.zoom);
      const c = Math.floor(i / ROWS);
      const r = i % ROWS;
      label.setPosition(c * CELL + (4 * DPR) / this.zoom, r * CELL + (3 * DPR) / this.zoom);
    });
    this.status();
  }

  // Thousands of contour segments are too many to redraw every frame, so they're baked
  // into a texture at screen resolution once per resize and shown as a single image.
  private bakedScale = 0;

  private drawTerrain() {
    const s = Math.min(2 * DPR, this.zoom);
    if (s === this.bakedScale) return;
    this.bakedScale = s;
    const g = this.make.graphics({}, false);
    for (const line of this.contours) {
      g.lineStyle((line.index ? 1.4 : 0.8) * DPR, TEAL, line.index ? 0.38 : 0.16);
      for (const ring of line.rings) {
        if (ring.length < 2) continue;
        g.beginPath();
        g.moveTo(ring[0][0] * s, ring[0][1] * s);
        for (let i = 1; i < ring.length; i++) g.lineTo(ring[i][0] * s, ring[i][1] * s);
        g.strokePath();
      }
    }
    if (this.textures.exists('terrain')) this.textures.remove('terrain');
    g.generateTexture('terrain', Math.ceil(WORLD_W * s), Math.ceil(WORLD_H * s));
    g.destroy();
    this.terrain?.destroy();
    this.terrain = this.add.image(0, 0, 'terrain').setOrigin(0).setScale(1 / s).setDepth(-1);
  }

  private drawGrid() {
    const g = this.gridGfx.clear().lineStyle(DPR / this.zoom, TEAL, 0.45);
    for (let c = 0; c <= COLS; c++) g.lineBetween(c * CELL, 0, c * CELL, WORLD_H);
    for (let r = 0; r <= ROWS; r++) g.lineBetween(0, r * CELL, WORLD_W, r * CELL);
  }

  private drawSelection() {
    const g = this.selectGfx.clear();
    const id = game.get().map.selected;
    const sq = id && parseSquare(id);
    if (!sq) return;
    g.fillStyle(TEAL, 0.12).fillRect(sq.col * CELL, sq.row * CELL, CELL, CELL);
    g.lineStyle((2 * DPR) / this.zoom, TEAL, 0.95).strokeRect(sq.col * CELL, sq.row * CELL, CELL, CELL);
  }

  private onDown(p: Phaser.Input.Pointer) {
    this.track(p);
    if (game.get().phase !== 'running') return;
    const id = squareAt(p.worldX, p.worldY);
    if (id) game.selectSquare(id);
  }

  private track(p: Phaser.Input.Pointer) {
    this.pointer = `${p.wasTouch ? 'touch' : 'mouse'} ${Math.round(p.x / DPR)},${Math.round(p.y / DPR)}`;
    this.status();
  }

  private status() {
    const s: SceneStatus = {
      width: Math.round(this.scale.width / DPR),
      height: Math.round(this.scale.height / DPR),
      renderer: this.game.renderer.type === Phaser.WEBGL ? 'WebGL' : 'Canvas',
      pointer: this.pointer,
    };
    bus.emit(EV.sceneStatus, s);
  }
}
