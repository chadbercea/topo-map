import * as Phaser from 'phaser';
import { bus, EV, getMapRect, type SceneStatus } from './events';
import { createLoop } from '../sim/loop';
import { game } from '../sim/store';
import { CELL, COLS, ROWS, squareAt, squareCenter, squareId, parseSquare, WORLD_H, WORLD_W } from '../map/grid';
import { SAMPLE, theater, traceContours, type ContourLine } from '../map/terrain';
import { generateCity, type City } from '../map/city';
import { hillshade } from '../map/relief';
import type { Settings } from '../sim/state';
import { DPR } from './dpr';

const TEAL = 0x35d0a5;
const TEAM = 0xf2c14e; // the team stands out from the map in amber
const EVENT_COLOR = { contact: 0xe5484d, request: 0xf2c14e } as const;
const MARKER_R = 9; // CSS px
const MARGIN = 8 * DPR; // 8 CSS px between the grid and the panels

// The theater map: contour lines of the fictional terrain under the A1–H5 grid. The camera
// fits the grid to the screen; line widths and labels are redrawn per zoom so they stay crisp.
export class MapScene extends Phaser.Scene {
  private contours: ContourLine[] = [];
  private terrain?: Phaser.GameObjects.Image;
  private relief!: Phaser.GameObjects.Image;
  private cityImg?: Phaser.GameObjects.Image;
  private city!: City;
  private shown?: Settings;
  private gridGfx!: Phaser.GameObjects.Graphics;
  private selectGfx!: Phaser.GameObjects.Graphics;
  private routeGfx!: Phaser.GameObjects.Graphics;
  private teamGfx!: Phaser.GameObjects.Graphics;
  private teamLabel!: Phaser.GameObjects.Text;
  private markerGfx!: Phaser.GameObjects.Graphics;
  private labels: Phaser.GameObjects.Text[] = [];
  private pointer = 'none';
  private unsubscribe?: () => void;
  // Phaser owns the frame clock; the sim advances in fixed ticks from it.
  private loop = createLoop((dt) => game.tick(dt));

  constructor() {
    super('map');
  }

  create() {
    this.contours = traceContours(theater());
    this.city = generateCity();
    this.relief = this.makeRelief();
    this.gridGfx = this.add.graphics();
    this.selectGfx = this.add.graphics();
    this.routeGfx = this.add.graphics();
    this.markerGfx = this.add.graphics();
    this.teamGfx = this.add.graphics();
    this.teamLabel = this.add.text(0, 0, game.get().team.callsign, {
      fontFamily: 'JetBrains Mono, monospace',
      fontSize: `${11 * DPR}px`,
      color: '#f2c14e',
    });
    for (let c = 0; c < COLS; c++)
      for (let r = 0; r < ROWS; r++)
        this.labels.push(
          this.add
            .text(c * CELL, r * CELL, squareId(c, r), { fontFamily: 'JetBrains Mono, monospace', fontSize: `${11 * DPR}px`, color: '#6f8a7d' })
        );

    this.scale.on(Phaser.Scale.Events.RESIZE, this.layout, this);
    bus.on(EV.mapRect, this.layout, this);
    this.input.on(Phaser.Input.Events.POINTER_DOWN, this.onDown, this);
    this.input.on(Phaser.Input.Events.POINTER_MOVE, this.track, this);
    this.unsubscribe = game.subscribe(() => {
      this.drawSelection();
      this.applyView();
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.layout, this);
      bus.off(EV.mapRect, this.layout, this);
      this.unsubscribe?.();
    });

    this.layout();
  }

  update(_time: number, delta: number) {
    this.loop.advance(delta);
    this.drawTeam();
    this.drawMarkers(_time);
  }

  // Markers sit in the top-right corner of their square, clear of the team's route line.
  private markerPos(square: string) {
    const c = squareCenter(square)!;
    return { x: c.x + CELL * 0.25, y: c.y - CELL * 0.25 };
  }

  private drawMarkers(time: number) {
    const g = this.markerGfx.clear();
    const r = (MARKER_R * DPR) / this.zoom;
    const { events, openEvent } = game.get();
    for (const e of events) {
      if (e.status === 'resolved') continue;
      const { x, y } = this.markerPos(e.square);
      const color = EVENT_COLOR[e.kind];
      if (e.status === 'new') {
        // Pulse until the player looks at it.
        const t = (time % 1200) / 1200;
        g.lineStyle((2 * DPR) / this.zoom, color, 1 - t).strokeCircle(x, y, r * (1 + t * 1.6));
      }
      g.fillStyle(0x0b0f0d, 0.9).fillCircle(x, y, r);
      g.lineStyle((2 * DPR) / this.zoom, color, 1).strokeCircle(x, y, r);
      g.fillStyle(color, e.id === openEvent ? 1 : 0.7).fillCircle(x, y, r * 0.45);
    }
  }

  private eventAt(x: number, y: number) {
    const hit = ((MARKER_R + 6) * DPR) / this.zoom; // a little bigger than drawn, for thumbs
    return game
      .get()
      .events.find((e) => e.status !== 'resolved' && Math.hypot(this.markerPos(e.square).x - x, this.markerPos(e.square).y - y) <= hit);
  }

  private get zoom() {
    return this.cameras.main.zoom;
  }

  // Fit the grid into the space the HUD leaves for the map (whole screen until it reports).
  private layout() {
    const { width, height } = this.scale;
    const r = getMapRect();
    const area = r
      ? { x: r.x * DPR, y: r.y * DPR, w: r.width * DPR, h: r.height * DPR }
      : { x: 0, y: 0, w: width, h: height };
    const cam = this.cameras.main;
    const zoom = Math.max(0.01, Math.min((area.w - MARGIN * 2) / WORLD_W, (area.h - MARGIN * 2) / WORLD_H));
    cam.setZoom(zoom);
    // Put the world's centre on the area's centre rather than the screen's.
    cam.centerOn(
      WORLD_W / 2 - (area.x + area.w / 2 - width / 2) / zoom,
      WORLD_H / 2 - (area.y + area.h / 2 - height / 2) / zoom,
    );
    this.drawTerrain();
    this.drawGrid();
    this.drawSelection();
    this.lastTeam = { x: NaN, y: NaN }; // zoom changed: redraw at the new scale
    this.drawTeam();
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
    this.drawCity(s);
    this.shown = undefined;
    this.applyView();
  }

  // Relief view: one pixel per height sample, stretched over the world. Sample i sits at
  // world i * SAMPLE, so the image starts half a sample up and left of the origin.
  private makeRelief() {
    const t = theater();
    const canvas = document.createElement('canvas');
    canvas.width = t.cols;
    canvas.height = t.rows;
    canvas.getContext('2d')!.putImageData(new ImageData(hillshade(t) as ImageDataArray, t.cols, t.rows), 0, 0);
    this.textures.addCanvas('relief', canvas);
    return this.add.image(-SAMPLE / 2, -SAMPLE / 2, 'relief').setOrigin(0).setScale(SAMPLE).setDepth(-2);
  }

  // City overlay, baked like the contours: highways, streets, building footprints.
  private drawCity(s: number) {
    const g = this.make.graphics({}, false);
    const line = (pts: [number, number][]) => {
      g.beginPath();
      g.moveTo(pts[0][0] * s, pts[0][1] * s);
      for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0] * s, pts[i][1] * s);
      g.strokePath();
    };
    g.lineStyle(3 * DPR, 0xb8c4bf, 0.45);
    this.city.roads.forEach(line);
    g.lineStyle(1 * DPR, 0xb8c4bf, 0.3);
    this.city.streets.forEach(line);
    g.fillStyle(0xb8c4bf, 0.5);
    for (const b of this.city.blocks) g.fillRect(b.x * s, b.y * s, b.w * s, b.h * s);
    if (this.textures.exists('city')) this.textures.remove('city');
    g.generateTexture('city', Math.ceil(WORLD_W * s), Math.ceil(WORLD_H * s));
    g.destroy();
    this.cityImg?.destroy();
    this.cityImg = this.add.image(0, 0, 'city').setOrigin(0).setScale(1 / s).setDepth(-1);
  }

  // Show the chosen view: contours alone, or relief with faint contours; city on top.
  private applyView() {
    const settings = game.get().settings;
    if (settings === this.shown || !this.terrain || !this.cityImg) return;
    this.shown = settings;
    const relief = settings.mapView === 'relief';
    this.relief.setVisible(relief);
    this.terrain.setAlpha(relief ? 0.35 : 1);
    this.cityImg.setVisible(settings.city);
    this.status();
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

  // The route still ahead of the team: a thin amber line through the waypoint squares.
  private drawRoute() {
    const { route, waypoint, position } = game.get().team;
    const g = this.routeGfx.clear().lineStyle((1.5 * DPR) / this.zoom, TEAM, 0.55);
    const points = [position, ...route.slice(waypoint).map((id) => squareCenter(id)!)];
    for (let i = 1; i < points.length; i++) g.lineBetween(points[i - 1].x, points[i - 1].y, points[i].x, points[i].y);
    g.fillStyle(TEAM, 0.8);
    for (const p of points.slice(1)) g.fillCircle(p.x, p.y, (3 * DPR) / this.zoom);
  }

  private lastTeam = { x: NaN, y: NaN };

  private drawTeam() {
    const { position } = game.get().team;
    if (position.x === this.lastTeam.x && position.y === this.lastTeam.y) return;
    this.lastTeam = position;
    const r = (6 * DPR) / this.zoom;
    this.teamGfx
      .clear()
      .fillStyle(TEAM, 0.25)
      .fillCircle(position.x, position.y, r * 2)
      .fillStyle(TEAM, 1)
      .fillCircle(position.x, position.y, r)
      .lineStyle((1.5 * DPR) / this.zoom, 0x0b0f0d, 1)
      .strokeCircle(position.x, position.y, r);
    this.teamLabel.setScale(1 / this.zoom).setPosition(position.x + r * 1.8, position.y - r * 2.6);
    this.drawRoute();
  }

  private onDown(p: Phaser.Input.Pointer) {
    this.track(p);
    if (game.get().phase !== 'running') return;
    const event = this.eventAt(p.worldX, p.worldY);
    if (event) return game.openEvent(event.id);
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
      layers: [game.get().settings.mapView, game.get().settings.city && 'city'].filter(Boolean).join('+'),
    };
    bus.emit(EV.sceneStatus, s);
  }
}
