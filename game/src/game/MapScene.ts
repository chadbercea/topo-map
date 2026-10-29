import * as Phaser from 'phaser';
import { bus, EV, getMapRect, setProjector, type InsetRect, type SceneStatus } from './events';
import { centreOn, clampCenter, fitCamera, PAN } from './fit';
import { createLoop } from '../sim/loop';
import { game } from '../sim/store';
import { CELL, COLS, ROWS, squareAt, squareCenter, squareId, parseSquare, WORLD_H, WORLD_W } from '../map/grid';
import { COARSE, FINE, outerTheater, theater, traceContours, type Area, type ContourLine, type Terrain } from '../map/terrain';
import { generateCity, type City } from '../map/city';
import { legPath, theaterWater } from '../map/paths';
import { RIVER } from '../map/water';
import { hillshade } from '../map/relief';
import type { Settings } from '../sim/state';
import { DPR } from './dpr';
import { BOARD } from '../sim/minigame';
import { orionSquare, satellitePoint } from '../sim/satellite';
import { eyesOn, freshness, groupOrigin, targets, unitSpot } from '../sim/imagery';
import { CROSS_MS, DRONE_CALLSIGN, droneArrived, droneAt } from '../sim/drone';

const TEAL = 0x35d0a5;
const TEAM = 0xf2c14e; // the team stands out from the map in amber
// The team's formation, in gaps: along the heading (forward +), across it. Point man first.
const WEDGE: [number, number][] = [[1.4, 0], [0.4, -1], [0.4, 1], [-0.7, -0.5], [-0.8, 0.6]];
const PING_MS = [2300, 3100, 2700, 3700, 4300]; // each operator's own beat
const EVENT_COLOR = { contact: 0xe5484d, request: 0xf2c14e, site: 0xb8c4bf, signal: 0x8fb8ff } as const;
const WATER = 0x5fa8d3;
const FLASH_MS = 2_500; // a new event's square flashes this long, in mission time
const MARKER_R = 9; // CSS px
const MARGIN = 8 * DPR; // 8 CSS px between the grid and the panels
const MAX_TEXTURE = 4096;
const FAR_SCALE = 0.2; // texture px per world unit for the coarse layer, before DPR
const MAX_FRAME_MS = 100; // the most sim time one rendered frame may advance
// Browser tests set window.frozen to stop the clock while they tap through a timed mini
// game, so a slow renderer can't run the timer out; time then moves only via game.tick.
const frozen = () => (window as { frozen?: boolean }).frozen === true;
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// The theater map: contour lines of the fictional terrain under the A1–H5 grid. The camera
// fits the grid to the screen; line widths and labels are redrawn per zoom so they stay crisp.
const PAN_SPEED = 700; // CSS px a second, while a key is held
const DRAG_PX = 8; // CSS px a finger can wander and still count as a tap
const MAX_ZOOM = 3; // pinch or wheel in up to 3x the whole-map fit
// Keys go to whatever has focus first: no panning while typing or on the signal dial.
const typing = () => {
  const el = document.activeElement;
  return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement;
};

export class MapScene extends Phaser.Scene {
  private contours: ContourLine[] = [];
  private farContours: ContourLine[] = [];
  private terrain?: Phaser.GameObjects.Image; // fine contours, over the grid and its margin
  private farTerrain?: Phaser.GameObjects.Image; // coarse contours, out to the screen edges
  private nearBg!: Phaser.GameObjects.Graphics; // hides the coarse layer under the fine one
  private relief!: Phaser.GameObjects.Image;
  private farRelief!: Phaser.GameObjects.Image;
  private cityImg?: Phaser.GameObjects.Image;
  private waterImg?: Phaser.GameObjects.Image;
  private city!: City;
  private shown?: Settings;
  private gridGfx!: Phaser.GameObjects.Graphics;
  private selectGfx!: Phaser.GameObjects.Graphics;
  private routeGfx!: Phaser.GameObjects.Graphics;
  private teamGfx!: Phaser.GameObjects.Graphics;
  private teamLabel!: Phaser.GameObjects.Text;
  private missionGfx!: Phaser.GameObjects.Graphics;
  private missionLabels: Phaser.GameObjects.Text[] = [];
  private markerGfx!: Phaser.GameObjects.Graphics;
  private fightGfx!: Phaser.GameObjects.Graphics;
  private modeGfx!: Phaser.GameObjects.Graphics;
  private droneGfx!: Phaser.GameObjects.Graphics;
  private droneLabel!: Phaser.GameObjects.Text;
  private boardGfx!: Phaser.GameObjects.Graphics; // a strike's board: ORION-3's picture only (ILI-1250)
  private intelGfx!: Phaser.GameObjects.Graphics; // what ORION-3 and ALPHA have seen
  private satGfx!: Phaser.GameObjects.Graphics; // ORION-3's reticle
  private modeLabels: Phaser.GameObjects.Text[] = [];
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
    this.farContours = traceContours(outerTheater());
    this.city = generateCity();
    this.farRelief = this.makeRelief(outerTheater(), 'relief-far', -6);
    this.nearBg = this.add.graphics().fillStyle(0x0b0f0d, 1).fillRect(FINE.x, FINE.y, FINE.w, FINE.h).setDepth(-3);
    this.relief = this.makeRelief(theater(), 'relief', -4);
    this.gridGfx = this.add.graphics();
    this.selectGfx = this.add.graphics();
    this.missionGfx = this.add.graphics();
    this.routeGfx = this.add.graphics();
    this.intelGfx = this.add.graphics();
    this.satGfx = this.add.graphics();
    this.markerGfx = this.add.graphics();
    this.fightGfx = this.add.graphics();
    this.modeGfx = this.add.graphics();
    this.boardGfx = this.add.graphics();
    this.droneGfx = this.add.graphics();
    this.droneLabel = this.add
      .text(0, 0, '', { fontFamily: 'JetBrains Mono, monospace', fontSize: `${10 * DPR}px`, color: '#e5484d', stroke: '#0b0f0d', strokeThickness: 3 * DPR })
      .setOrigin(0.5, 0)
      .setVisible(false);
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

    // ORION-3's inset: a second camera on the square it's looking at. Taps go to the map.
    this.inset = this.cameras.add(0, 0, 1, 1).setVisible(false).setBackgroundColor(0x0b0f0d);
    this.inset.inputEnabled = false;
    this.inset.ignore([...this.labels, this.teamLabel, this.droneLabel]); // the caption names the square
    this.cameras.main.ignore(this.boardGfx); // a strike plays out in ORION-3's picture, not on the map (ILI-1250)
    // ?debug: tests read the live camera to turn world points into screen taps.
    if (new URLSearchParams(location.search).has('debug'))
      Object.assign(window, {
        mapCamera: () => {
          const c = this.cameras.main;
          return { scrollX: c.scrollX, scrollY: c.scrollY, zoom: c.zoom, width: c.width, height: c.height, dpr: DPR };
        },
      });

    setProjector((x, y) => {
      const c = this.cameras.main;
      return { x: (c.width / 2 + (x - c.scrollX - c.width / 2) * c.zoom) / DPR, y: (c.height / 2 + (y - c.scrollY - c.height / 2) * c.zoom) / DPR };
    });
    this.scale.on(Phaser.Scale.Events.RESIZE, this.layout, this);
    bus.on(EV.mapRect, this.layout, this);
    bus.on(EV.inset, this.placeInset, this);
    // WASD and the arrow keys pan the map (ILI-1205); F goes back to ALPHA. No key capture,
    // so they never swallow a key a button or the signal dial needs.
    this.keys = this.input.keyboard!.addKeys('W,A,S,D,UP,LEFT,DOWN,RIGHT,F', false) as Record<string, Phaser.Input.Keyboard.Key>;
    this.keys.F.on('down', () => !typing() && this.recentre());
    bus.on(EV.recentre, this.recentre, this);
    // Touch and mouse (ILI-1214): drag pans, a tap (released where it went down) selects, two
    // fingers pinch-zoom, and so does the wheel.
    this.input.addPointer(1);
    this.input.on(Phaser.Input.Events.POINTER_DOWN, this.onDown, this);
    this.input.on(Phaser.Input.Events.POINTER_MOVE, this.onMove, this);
    this.input.on(Phaser.Input.Events.POINTER_UP, this.onUp, this);
    this.input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.onUp, this);
    this.input.on(Phaser.Input.Events.POINTER_WHEEL, (p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) => this.zoomAt(Math.exp(-dy * 0.0015), p.x, p.y));
    this.unsubscribe = game.subscribe(() => {
      this.drawSelection();
      this.applyView();
      this.placeInset();
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.layout, this);
      bus.off(EV.mapRect, this.layout, this);
      bus.off(EV.inset, this.placeInset, this);
      bus.off(EV.recentre, this.recentre, this);
      this.unsubscribe?.();
    });

    this.layout();
  }

  // Elapsed time: wall time, but never more than Phaser's smoothed delta and never more
  // than MAX_FRAME_MS. With the 30 fps cap Phaser's delta runs ahead of wall time (the
  // clock ran fast); on a slow renderer (CI) the smoothed delta keeps the sim in slow motion.
  private lastFrame: number | null = null;
  update(_time: number, delta: number) {
    const now = performance.now();
    if (!frozen()) this.loop.advance(this.lastFrame === null ? 0 : Math.min(now - this.lastFrame, delta, MAX_FRAME_MS));
    this.lastFrame = now;
    this.pan(delta);
    this.follow(delta);
    this.drawTeam(_time);
    const st = game.get();
    const key = `${st.team.waypoint}|${st.team.route.join()}|${st.map.scanned.length}|${st.contacts.filter((c) => c.status === 'revealed').map((c) => c.square)}`;
    if (key !== this.routeKey) {
      this.routeKey = key;
      this.drawRoute();
    }
    // Exfil can move (ILI-1192): the A/B/C markers follow it.
    const points = `${st.mission.a}|${st.mission.b}|${st.mission.c}`;
    if (points !== this.missionKey) {
      this.missionKey = points;
      this.drawMission();
    }
    this.drawMarkers(_time);
    this.drawFight(_time);
    this.drawIntel();
    this.drawPlans();
    this.drawSatellite(_time);
    this.drawMiniGame(_time);
    this.drawDrone();
  }

  // The drone strike (ILI-1252): a tiny drone crosses the square west to east, and each fighter
  // it passes becomes a red X, which stays as the aftermath.
  private drawDrone() {
    const g = this.droneGfx.clear();
    const { drone: d, elapsedMs: now } = game.get();
    if (!d || !droneArrived(d, now)) return void this.droneLabel.setVisible(false);
    const px = DPR / this.zoom;
    for (const k of d.kills ?? []) {
      if (k.atMs > now) continue;
      const r = 5 * px;
      g.lineStyle(3.5 * px, 0x0b0f0d, 0.8).lineBetween(k.x - r, k.y - r, k.x + r, k.y + r).lineBetween(k.x - r, k.y + r, k.x + r, k.y - r);
      g.lineStyle(2 * px, 0xe5484d, 1).lineBetween(k.x - r, k.y - r, k.x + r, k.y + r).lineBetween(k.x - r, k.y + r, k.x + r, k.y - r);
    }
    if (now >= d.arriveMs + CROSS_MS) return void this.droneLabel.setVisible(false);
    // REAPER-1: a triangle, nose east, with its callsign under it, as in its panel.
    const sq = parseSquare(d.square)!;
    const x = sq.col * CELL + droneAt(d, now) * CELL;
    const y = (sq.row + 0.5) * CELL;
    const s = 7 * px;
    g.fillStyle(0xe5484d, 1).fillTriangle(x + s, y, x - s, y - s * 0.8, x - s, y + s * 0.8);
    g.lineStyle(1.5 * px, 0x0b0f0d, 0.9).strokeTriangle(x + s, y, x - s, y - s * 0.8, x - s, y + s * 0.8);
    this.droneLabel.setText(DRONE_CALLSIGN).setScale(1 / this.zoom).setPosition(x, y + s * 1.3).setVisible(true);
  }

  // Mini game mode: seek and destroy draws its board; the signal pulses where it comes from.
  private drawMiniGame(time: number) {
    const g = this.modeGfx.clear();
    this.boardGfx.clear();
    const m = game.get().minigame;
    this.modeLabels.forEach((l) => l.setVisible(false));
    if (!m) return;
    if (m.kind === 'seekDestroy') return this.drawBoard(this.boardGfx, m);
    if (m.kind === 'signal') {
      // Roughly where the signal comes from: the square and its neighbours, pulsing.
      const sq = parseSquare(m.square)!;
      const a = 0.08 + 0.08 * Math.abs(Math.sin(time / 300));
      g.fillStyle(0x8fb8ff, a).fillRect((sq.col - 1) * CELL, (sq.row - 1) * CELL, CELL * 3, CELL * 3);
      g.lineStyle((1.5 * DPR) / this.zoom, 0x8fb8ff, 0.7).strokeRect((sq.col - 1) * CELL, (sq.row - 1) * CELL, CELL * 3, CELL * 3);
      return;
    }
  }

  // Strike: the target square with the fighters HQ can see in it, in ORION-3's picture. Live eyes follow them;
  // an older look shows where they were, fading with its age. Misses ring, kills cross out.
  private drawBoard(g: Phaser.GameObjects.Graphics, m: NonNullable<ReturnType<typeof game.get>['minigame']>) {
    const sq = parseSquare(m.square)!;
    const x0 = sq.col * CELL;
    const y0 = sq.row * CELL;
    const cell = CELL / BOARD;
    for (let c = 0; c < COLS; c++)
      for (let r = 0; r < ROWS; r++) if (c !== sq.col || r !== sq.row) g.fillStyle(0x0b0f0d, 0.65).fillRect(c * CELL, r * CELL, CELL, CELL);
    const px = DPR / this.inset.zoom; // drawn for ORION-3's picture
    g.lineStyle(1 * px, 0xe5484d, 0.5);
    for (let i = 1; i < BOARD; i++) {
      g.lineBetween(x0 + i * cell, y0, x0 + i * cell, y0 + CELL);
      g.lineBetween(x0, y0 + i * cell, x0 + CELL, y0 + i * cell);
    }
    g.lineStyle(2 * px, 0xe5484d, 0.95).strokeRect(x0, y0, CELL, CELL);
    const centre = (i: number) => ({ x: x0 + (i % BOARD + 0.5) * cell, y: y0 + (Math.floor(i / BOARD) + 0.5) * cell });
    const c = game.get().contacts.find((x) => x.id === m.contactId);
    const live = m.eyes === 'live' && c ? (eyesOn(game.get(), c)?.units ?? []) : null;
    const alpha = m.eyes === 'live' || m.eyes === 'fresh' ? 1 : m.eyes === 'ghost' ? 0.45 : 0.2;
    for (const i of live ?? m.spotted ?? []) {
      const p = centre(i);
      g.fillStyle(0x0b0f0d, 0.8 * alpha).fillCircle(p.x, p.y, cell * 0.2);
      g.fillStyle(0xe5484d, alpha).fillCircle(p.x, p.y, cell * 0.14);
      if (m.eyes !== 'live') g.lineStyle(1 * px, 0xe5484d, 0.5 * alpha).strokeCircle(p.x, p.y, cell * 0.32);
    }
    for (const shot of m.shots ?? []) {
      const p = centre(shot.cell);
      const k = cell * 0.28;
      if (shot.hit) {
        g.fillStyle(0xe5484d, 0.35).fillRect(p.x - cell / 2, p.y - cell / 2, cell, cell);
        g.lineStyle(3 * px, 0xe5484d, 1).lineBetween(p.x - k, p.y - k, p.x + k, p.y + k).lineBetween(p.x - k, p.y + k, p.x + k, p.y - k);
      } else {
        g.lineStyle(1.5 * px, 0xcfe8dc, 0.6).strokeCircle(p.x, p.y, k * 0.6);
      }
    }
  }

  // What HQ has seen (ILI-1167): each look's fighters at the positions they were seen in.
  // Live (video, ALPHA's eyes) and fresh looks are crisp; older ones turn to ghosts with a
  // ring for how far they may have gone, then to faint last-known marks. Heading arrows
  // show who was moving, and where to.
  private drawIntel() {
    const g = this.intelGfx.clear();
    const { imagery, contacts, elapsedMs: now, minigame } = game.get();
    const board = minigame?.kind === 'seekDestroy' && minigame.status === 'active' ? minigame.contactId : null;
    const px = DPR / this.zoom;
    for (const snap of Object.values(imagery)) {
      const age = freshness(snap, now);
      const alpha = age === 'live' || age === 'fresh' ? 1 : age === 'ghost' ? 0.45 : 0.18;
      for (const seen of snap.seen) {
        const c = contacts.find((x) => x.id === seen.contactId);
        if (!c || c.status === 'cleared' || c.id === board) continue; // a strike draws its own
        // Live looks follow them; anything else shows where they were.
        const o = snap.live ? groupOrigin(c, now) : seen;
        const units = snap.live ? c.units : seen.units;
        let cx = 0;
        let cy = 0;
        for (const u of units) {
          const { x, y } = unitSpot(o, u);
          cx += x / units.length;
          cy += y / units.length;
          g.fillStyle(0x0b0f0d, alpha * 0.8).fillCircle(x, y, 7 * px);
          g.fillStyle(0xe5484d, alpha).fillCircle(x, y, 5 * px);
          if (age === 'ghost') g.lineStyle(1 * px, 0xe5484d, 0.35).strokeCircle(x, y, (CELL / BOARD) * 0.45);
        }
        const to = seen.to && squareCenter(seen.to);
        if (to && units.length && age !== 'stale') {
          const d = Math.hypot(to.x - cx, to.y - cy) || 1;
          const len = Math.min(d, CELL * 0.45);
          const ex = cx + ((to.x - cx) / d) * len;
          const ey = cy + ((to.y - cy) / d) * len;
          const ux = (ex - cx) / len;
          const uy = (ey - cy) / len;
          const h = 7 * px;
          g.lineStyle(1.5 * px, 0xe5484d, alpha).lineBetween(cx, cy, ex, ey);
          g.lineBetween(ex, ey, ex - ux * h - uy * h * 0.6, ey - uy * h + ux * h * 0.6);
          g.lineBetween(ex, ey, ex - ux * h + uy * h * 0.6, ey - uy * h - ux * h * 0.6);
        }
      }
    }
  }

  // A decoded plan (ILI-1169): a dashed red route from where the contact was last seen to
  // where it means to go.
  private drawPlans() {
    const g = this.intelGfx;
    const { contacts, events } = game.get();
    const px = DPR / this.zoom;
    for (const c of contacts) {
      if (!c.planKnown || !c.planTo || (c.status !== 'hidden' && c.status !== 'revealed')) continue;
      const seenAt = events.find((e) => e.id === `contact-${c.id}`)?.square ?? c.square;
      if (seenAt === c.planTo) continue; // it's there
      const a = squareCenter(seenAt)!;
      const b = squareCenter(c.planTo)!;
      const d = Math.hypot(b.x - a.x, b.y - a.y);
      const ux = (b.x - a.x) / d;
      const uy = (b.y - a.y) / d;
      g.lineStyle(2 * px, 0xe5484d, 0.8);
      for (let t = 0; t < d; t += 14 * px) g.lineBetween(a.x + ux * t, a.y + uy * t, a.x + ux * Math.min(d, t + 8 * px), a.y + uy * Math.min(d, t + 8 * px));
      const h = 9 * px;
      g.lineBetween(b.x, b.y, b.x - ux * h - uy * h * 0.6, b.y - uy * h + ux * h * 0.6);
      g.lineBetween(b.x, b.y, b.x - ux * h + uy * h * 0.6, b.y - uy * h - ux * h * 0.6);
    }
  }

  // ORION-3's reticle: corner brackets where it looks, a dashed track while it swings over,
  // and a pulse while it captures.
  private drawSatellite(time: number) {
    const g = this.satGfx.clear();
    const { satellite: sat, elapsedMs } = game.get();
    const px = DPR / this.zoom;
    const p = satellitePoint(sat, elapsedMs);
    const x = p.col * CELL;
    const y = p.row * CELL;
    const working = sat.state !== 'idle';
    if (sat.state === 'slewing') {
      const to = parseSquare(sat.aim)!;
      const d = Math.hypot((to.col - p.col) * CELL, (to.row - p.row) * CELL) || 1;
      const ax = x + CELL / 2;
      const ay = y + CELL / 2;
      const ux = ((to.col - p.col) * CELL) / d;
      const uy = ((to.row - p.row) * CELL) / d;
      g.lineStyle(2 * px, TEAL, 0.85);
      for (let t = 0; t < d; t += 12 * px) g.lineBetween(ax + ux * t, ay + uy * t, ax + ux * Math.min(d, t + 6 * px), ay + uy * Math.min(d, t + 6 * px));
      g.lineStyle(2 * px, TEAL, 0.7).strokeRect(to.col * CELL, to.row * CELL, CELL, CELL);
    }
    if (sat.state === 'capturing') g.fillStyle(TEAL, 0.06 + 0.06 * Math.abs(Math.sin(time / 250))).fillRect(x, y, CELL, CELL);
    const k = CELL * 0.18;
    g.lineStyle((working ? 2 : 1.2) * px, TEAL, working ? 0.95 : 0.4);
    for (const [cx, cy, dx, dy] of [[x, y, 1, 1], [x + CELL, y, -1, 1], [x + CELL, y + CELL, -1, -1], [x, y + CELL, 1, -1]]) {
      g.lineBetween(cx, cy, cx + dx * k, cy);
      g.lineBetween(cx, cy, cx, cy + dy * k);
    }
  }

  // A firefight: red rings pulsing out from the team.
  private drawFight(time: number) {
    const g = this.fightGfx.clear();
    const { fight, position } = game.get().team;
    if (!fight) return;
    const r = (10 * DPR) / this.zoom;
    for (const phase of [0, 0.5]) {
      const t = ((time / 700 + phase) % 1);
      g.lineStyle((2 * DPR) / this.zoom, 0xe5484d, 1 - t).strokeCircle(position.x, position.y, r * (1 + t * 2.5));
    }
  }

  // Markers sit in the top-right corner of their square, clear of the team's route line.
  private markerPos(square: string) {
    const c = squareCenter(square)!;
    return { x: c.x + CELL * 0.25, y: c.y - CELL * 0.25 };
  }

  private drawMarkers(time: number) {
    const g = this.markerGfx.clear();
    const r = (MARKER_R * DPR) / this.zoom;
    const { events, openEvent, minigame, elapsedMs } = game.get();
    const board = minigame?.kind === 'seekDestroy' && minigame.status === 'active' ? minigame.square : null;
    const px = (DPR * 1) / this.zoom;
    for (const e of events) {
      if (e.status === 'resolved' || e.square === board || e.kind === 'site') continue; // its board is open; a kill site's X marks are enough (ILI-1252)
      const { x, y } = this.markerPos(e.square);
      const color = EVENT_COLOR[e.kind];
      const sq = parseSquare(e.square)!;
      // Where it happened (ILI-1189): a new event flashes its whole square for a moment, and
      // the square of the open card stays outlined, so the card and its ground read as one.
      const age = elapsedMs - e.atMs;
      if (e.status === 'new' && age < FLASH_MS) {
        const a = 0.35 * (1 - age / FLASH_MS) * (0.6 + 0.4 * Math.abs(Math.sin(time / 120)));
        g.fillStyle(color, a).fillRect(sq.col * CELL, sq.row * CELL, CELL, CELL);
      }
      if (e.id === openEvent) g.lineStyle(3 * px, color, 0.95).strokeRect(sq.col * CELL, sq.row * CELL, CELL, CELL);
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

  private targetAt(x: number, y: number) {
    const hit = ((7 + 6) * DPR) / this.zoom; // the dot, and a margin for thumbs
    return targets(game.get()).find((t) => Math.hypot(t.x - x, t.y - y) <= hit)?.contactId;
  }

  private eventAt(x: number, y: number) {
    const hit = ((MARKER_R + 6) * DPR) / this.zoom; // a little bigger than drawn, for thumbs
    return game
      .get()
      .events.find((e) => e.status !== 'resolved' && e.kind !== 'site' && Math.hypot(this.markerPos(e.square).x - x, this.markerPos(e.square).y - y) <= hit);
  }

  // The larger square (ILI-1203): ORION-3's picture of the square it's tasked to (or last
  // looked at), drawn into the ORION-3 panel's picture frame (ILI-1219); the map doesn't move.
  private inset!: Phaser.Cameras.Scene2D.Camera;
  private insetFrame: InsetRect = null;
  private placeInset(frame: InsetRect = this.insetFrame) {
    this.insetFrame = frame;
    const id = orionSquare(game.get());
    const sq = id ? parseSquare(id) : null;
    if (!sq || !frame) return void this.inset.setVisible(false);
    const h = Math.round(frame.height * DPR);
    this.inset.setViewport(Math.round(frame.x * DPR), Math.round(frame.y * DPR), Math.round(frame.width * DPR), h).setVisible(true);
    this.inset.setZoom(h / CELL); // the square fills the height (ILI-1206), a sliver of its neighbours either side
    this.inset.centerOn((sq.col + 0.5) * CELL, (sq.row + 0.5) * CELL);
  }

  private get zoom() {
    return this.cameras.main.zoom;
  }

  // Keep ALPHA, the team HQ has selected, centred in the open map (ILI-1227): ease after it as
  // it walks, over about a sixth of a second, until HQ pans by hand.
  private camCenter: { x: number; y: number } | null = null;
  private camTarget: { x: number; y: number } | null = null;
  private follow(delta: number) {
    if (this.panned || !this.camCenter || !this.camTarget) return;
    const { width, height } = this.scale;
    const r = getMapRect();
    const area = this.openArea(r, width, height);
    const cam = this.cameras.main;
    this.camTarget = centreOn(game.get().team.position, area, { w: width, h: height }, cam.zoom, this.cover(r, height), PAN);
    const dx = this.camTarget.x - this.camCenter.x;
    const dy = this.camTarget.y - this.camCenter.y;
    if (!dx && !dy) return;
    const k = reducedMotion() ? 1 : Math.min(1, delta / 150);
    this.camCenter = Math.hypot(dx, dy) * cam.zoom < 0.5 ? this.camTarget : { x: this.camCenter.x + dx * k, y: this.camCenter.y + dy * k };
    cam.centerOn(this.camCenter.x, this.camCenter.y);
    bus.emit(EV.camera);
  }

  // Pan by hand (ILI-1205): while a direction key is held the map slides that way, up to two
  // squares past the AO, and stops following ALPHA until F (or the HUD's button) recentres.
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private panned = false;
  private pan(delta: number) {
    if (!this.camCenter || typing()) return;
    const k = this.keys;
    const dx = (k.D.isDown || k.RIGHT.isDown ? 1 : 0) - (k.A.isDown || k.LEFT.isDown ? 1 : 0);
    const dy = (k.S.isDown || k.DOWN.isDown ? 1 : 0) - (k.W.isDown || k.UP.isDown ? 1 : 0);
    if (!dx && !dy) return;
    const cam = this.cameras.main;
    const step = (PAN_SPEED * DPR * Math.min(delta, 50)) / 1000 / cam.zoom;
    const { width, height } = this.scale;
    const next = { x: this.camCenter.x + dx * step, y: this.camCenter.y + dy * step };
    this.camCenter = this.camTarget = clampCenter(next, { w: width, h: height }, cam.zoom, this.cover(getMapRect(), height), PAN);
    cam.centerOn(this.camCenter.x, this.camCenter.y);
    if (!this.panned) bus.emit(EV.panned, (this.panned = true));
    bus.emit(EV.camera);
  }

  private recentre() {
    if (this.userZoom !== 1) {
      this.userZoom = 1;
      this.layout();
    }
    const { width, height } = this.scale;
    const r = getMapRect();
    const area = this.openArea(r, width, height);
    this.camTarget = centreOn(game.get().team.position, area, { w: width, h: height }, this.cameras.main.zoom, this.cover(r, height), PAN);
    if (this.panned) bus.emit(EV.panned, (this.panned = false));
  }

  // Where ALPHA is centred, in device px: the open map.
  private openArea(r: ReturnType<typeof getMapRect>, width: number, height: number) {
    return r ? { x: r.x * DPR, y: r.y * DPR, w: r.width * DPR, h: r.height * DPR } : { x: 0, y: 0, w: width, h: height };
  }

  // The open part of the screen the grid covers, in device px (ILI-1186): below the mission
  // bar, right of a docked intel stream, left of a side rail, above the bottom-right panels or
  // the phone's dock.
  private cover(r: ReturnType<typeof getMapRect>, height: number) {
    return {
      left: (r?.coverLeft ?? 0) * DPR,
      top: (r?.coverTop ?? 0) * DPR,
      bottom: r?.coverBottom !== undefined ? r.coverBottom * DPR : height,
      right: r?.coverRight !== undefined ? r.coverRight * DPR : undefined,
    };
  }

  // Zoom first, then draw: the grid fills the viewport (fit.ts), and lines, labels and the
  // terrain bake are drawn for that zoom.
  private layout() {
    const { width, height } = this.scale;
    const r = getMapRect();
    const area = r
      ? { x: r.x * DPR, y: r.y * DPR, w: r.width * DPR, h: r.height * DPR }
      : { x: 0, y: 0, w: width, h: height };
    const cam = this.cameras.main;
    const cover = this.cover(r, height);
    const { zoom } = fitCamera({ w: width, h: height }, area, { x: 0, y: 0, w: WORLD_W, h: WORLD_H }, MARGIN, cover);
    this.baseZoom = this.fitZoom = zoom;
    cam.setZoom(zoom * this.userZoom);
    // Keep where the camera was, or start centred on ALPHA (ILI-1227).
    const screen = { w: width, h: height };
    const z = cam.zoom; // the fit, times any pinch
    const start = this.camCenter ?? clampCenter({ x: WORLD_W / 2, y: WORLD_H / 2 }, screen, z, cover);
    this.camCenter = this.camCenter ? clampCenter(start, screen, z, cover, PAN) : centreOn(game.get().team.position, area, screen, z, cover, PAN);
    this.camTarget = this.camCenter;
    cam.centerOn(this.camCenter.x, this.camCenter.y);
    bus.emit(EV.camera);
    this.drawTerrain();
    this.drawGrid();
    this.drawSelection();
    this.drawMission();
    this.lastTeam = { x: NaN, y: NaN }; // zoom changed: redraw at the new scale
    this.drawTeam();
    this.labels.forEach((label, i) => {
      label.setScale(1 / this.zoom);
      const c = Math.floor(i / ROWS);
      const r = i % ROWS;
      label.setPosition(c * CELL + (4 * DPR) / this.zoom, r * CELL + (3 * DPR) / this.zoom);
    });
    this.placeInset();
    this.status();
  }

  // Thousands of contour segments are too many to redraw every frame, so they're baked
  // into a texture at screen resolution once per resize and shown as a single image.
  private bakedScale = 0;
  private baseZoom = 1;

  private drawTerrain() {
    // Two layers fill the screen: the fine contours over the grid and its margin, and the
    // coarse ones out to the edges. Textures stay under 4096 px a side (the safe limit on
    // phones); the coarse layer is dimmed and faint, so a lower resolution doesn't show.
    // Bake scales come in steps (x1.25), so small zoom changes, like the layout settling as
    // the panels report in, don't trigger a re-bake.
    const want = Math.min(2 * DPR, this.baseZoom, MAX_TEXTURE / Math.max(FINE.w, FINE.h));
    const s = Math.pow(1.25, Math.ceil(Math.log(want) / Math.log(1.25)));
    if (s === this.bakedScale) return;
    this.bakedScale = s;
    this.terrain?.destroy();
    this.terrain = this.bakeContours('terrain', this.contours, FINE, s, 1).setDepth(-2);
    // The coarse layer: bake it once, at a fixed modest scale. Line weight scales with
    // bake-to-screen ratio so the lines look as fine as the near ones. Not dimmed any more
    // (ILI-1193): the map runs on past the play area with no visible edge.
    const far = FAR_SCALE * DPR;
    this.farTerrain ??= this.bakeContours('terrain-far', this.farContours, COARSE, far, (0.8 * far) / this.baseZoom).setDepth(-5);
    this.drawWater(s);
    this.drawCity(s);
    this.shown = undefined;
    this.applyView();
  }

  private bakeContours(key: string, lines: ContourLine[], area: Area, s: number, weight: number, dim = 1) {
    const g = this.make.graphics({}, false);
    const X = (x: number) => (x - area.x) * s;
    const Y = (y: number) => (y - area.y) * s;
    for (const line of lines) {
      g.lineStyle((line.index ? 1.4 : 0.8) * DPR * weight, TEAL, (line.index ? 0.38 : 0.16) * dim);
      for (const ring of line.rings) {
        if (ring.length < 2) continue;
        g.beginPath();
        g.moveTo(X(ring[0][0]), Y(ring[0][1]));
        for (let i = 1; i < ring.length; i++) g.lineTo(X(ring[i][0]), Y(ring[i][1]));
        g.strokePath();
      }
    }
    if (this.textures.exists(key)) this.textures.remove(key);
    g.generateTexture(key, Math.ceil(area.w * s), Math.ceil(area.h * s));
    g.destroy();
    return this.add.image(area.x, area.y, key).setOrigin(0).setScale(1 / s);
  }

  // Relief view: one pixel per height sample, stretched over the layer. Sample i sits at
  // its world position, so the image starts half a sample up and left of the layer.
  private makeRelief(t: Terrain, key: string, depth: number) {
    const canvas = document.createElement('canvas');
    canvas.width = t.cols;
    canvas.height = t.rows;
    canvas.getContext('2d')!.putImageData(new ImageData(hillshade(t) as ImageDataArray, t.cols, t.rows), 0, 0);
    this.textures.addCanvas(key, canvas);
    return this.add.image(t.x0 - t.sample / 2, t.y0 - t.sample / 2, key).setOrigin(0).setScale(t.sample).setDepth(depth);
  }

  // Rivers and streams (ILI-1191), baked like the contours, under the town's roads; smoothed
  // so they read as water, not as a staircase of samples.
  private drawWater(s: number) {
    const g = this.make.graphics({}, false);
    const smooth = (pts: [number, number][]) => {
      let p = pts;
      for (let n = 0; n < 2; n++)
        p = p.length < 3 ? p : [p[0], ...p.slice(0, -1).flatMap((a, i) => [[a[0] * 0.75 + p[i + 1][0] * 0.25, a[1] * 0.75 + p[i + 1][1] * 0.25], [a[0] * 0.25 + p[i + 1][0] * 0.75, a[1] * 0.25 + p[i + 1][1] * 0.75]] as [number, number][]).slice(1), p[p.length - 1]];
      return p;
    };
    for (const l of theaterWater().lines) {
      const river = l.flow >= RIVER;
      g.lineStyle((river ? 2.6 : 1.2) * DPR, WATER, river ? 0.8 : 0.55);
      const pts = smooth(l.pts);
      g.beginPath();
      g.moveTo((pts[0][0] - FINE.x) * s, (pts[0][1] - FINE.y) * s);
      for (let i = 1; i < pts.length; i++) g.lineTo((pts[i][0] - FINE.x) * s, (pts[i][1] - FINE.y) * s);
      g.strokePath();
    }
    if (this.textures.exists('water')) this.textures.remove('water');
    g.generateTexture('water', Math.ceil(FINE.w * s), Math.ceil(FINE.h * s));
    g.destroy();
    this.waterImg?.destroy();
    this.waterImg = this.add.image(FINE.x, FINE.y, 'water').setOrigin(0).setScale(1 / s).setDepth(-1.5);
  }

  // City overlay, baked like the contours: highways and streets.
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
    if (this.textures.exists('city')) this.textures.remove('city');
    g.generateTexture('city', Math.ceil(WORLD_W * s), Math.ceil(WORLD_H * s));
    g.destroy();
    this.cityImg?.destroy();
    this.cityImg = this.add.image(0, 0, 'city').setOrigin(0).setScale(1 / s).setDepth(-1);
  }

  // Show the chosen view: contours alone, or relief with faint contours; city on top.
  private applyView() {
    const settings = game.get().settings;
    if (settings === this.shown || !this.terrain || !this.farTerrain || !this.cityImg) return;
    this.shown = settings;
    const relief = settings.mapView === 'relief';
    // Layers, back to front: far relief, far contours, near relief (opaque, so it hides the
    // far contours under it), near background (topo view: does the same job), near contours.
    this.relief.setVisible(relief);
    this.farRelief.setVisible(relief);
    this.nearBg.setVisible(!relief);
    this.terrain.setAlpha(relief ? 0.35 : 1);
    this.farTerrain.setAlpha(relief ? 0.35 : 1);
    this.cityImg.setVisible(settings.city);
    this.status();
  }

  // Ground outside the grid stays on screen but dimmed, so the eye lands on the theater. The
  // coarse layer is baked dimmed; this only dims the fine layer's margin around the grid,
  // which keeps full-screen layers (expensive on phones without much GPU) to a minimum.
  // The grid runs on past the play area across all the ground there is (ILI-1193), so the
  // screen never shows its edge. Only A1-H5 are labelled and in play.
  private drawGrid() {
    const g = this.gridGfx.clear().lineStyle(DPR / this.zoom, TEAL, 0.45);
    const c0 = Math.floor(COARSE.x / CELL);
    const c1 = Math.ceil((COARSE.x + COARSE.w) / CELL);
    const r0 = Math.floor(COARSE.y / CELL);
    const r1 = Math.ceil((COARSE.y + COARSE.h) / CELL);
    for (let c = c0; c <= c1; c++) g.lineBetween(c * CELL, r0 * CELL, c * CELL, r1 * CELL);
    for (let r = r0; r <= r1; r++) g.lineBetween(c0 * CELL, r * CELL, c1 * CELL, r * CELL);
  }

  private drawSelection() {
    const g = this.selectGfx.clear();
    // Imaged squares stay faintly lit, with a corner tick, like the prototype's "clear".
    for (const id of game.get().map.scanned) {
      const sq = parseSquare(id);
      if (!sq) continue;
      const x = sq.col * CELL;
      const y = sq.row * CELL;
      const t = CELL * 0.12;
      g.fillStyle(TEAL, 0.07).fillRect(x, y, CELL, CELL);
      g.lineStyle((1.5 * DPR) / this.zoom, TEAL, 0.7).lineBetween(x + CELL - t, y + 4 / this.zoom, x + CELL - 4 / this.zoom, y + 4 / this.zoom);
      g.lineBetween(x + CELL - 4 / this.zoom, y + 4 / this.zoom, x + CELL - 4 / this.zoom, y + t);
    }
    const id = game.get().map.selected;
    const sq = id && parseSquare(id);
    if (!sq) return;
    g.fillStyle(TEAL, 0.12).fillRect(sq.col * CELL, sq.row * CELL, CELL, CELL);
    g.lineStyle((2 * DPR) / this.zoom, TEAL, 0.95).strokeRect(sq.col * CELL, sq.row * CELL, CELL, CELL);
  }

  // The mission's three points: A infil, B crash site, C exfil.
  private drawMission() {
    const { a, b, c } = game.get().mission;
    const g = this.missionGfx.clear();
    const points: [string, string, string][] = [['A', a, 'INFIL'], ['B', b, 'CRASH SITE'], ['C', c, 'EXFIL']];
    points.forEach(([letter, sq, name], i) => {
      const p = squareCenter(sq)!;
      const r = (14 * DPR) / this.zoom;
      g.lineStyle((2 * DPR) / this.zoom, TEAM, 0.9).strokeCircle(p.x, p.y, r);
      const label = (this.missionLabels[i] ??= this.add
        .text(0, 0, '', { fontFamily: 'JetBrains Mono, monospace', fontSize: `${10 * DPR}px`, color: '#f2c14e' })
        .setOrigin(0.5, 0));
      label.setText(`${letter} · ${name}`).setScale(1 / this.zoom).setPosition(p.x, p.y + r * 1.2);
      this.inset.ignore(label);
    });
  }

  // The route's state (ILI-1173): walked legs faint, imaged legs ahead solid, unimaged legs
  // dashed (ALPHA will stop and ask), and a leg into a known contact red.
  private drawRoute() {
    const s = game.get();
    const { route, waypoint, position } = s.team;
    const w = (1.5 * DPR) / this.zoom;
    const g = this.routeGfx.clear();
    // The way it goes over the ground (ILI-1191): legs walked, the rest of this leg from
    // where ALPHA stands, then the legs ahead.
    const trail = (pts: { x: number; y: number }[], dash: boolean) => {
      for (let i = 1; i < pts.length; i++)
        if (dash) this.dashed(g, pts[i - 1], pts[i], (6 * DPR) / this.zoom, i);
        else g.lineBetween(pts[i - 1].x, pts[i - 1].y, pts[i].x, pts[i].y);
    };
    g.lineStyle(w, TEAM, 0.2);
    for (let i = 1; i < waypoint; i++) trail(legPath(route[i - 1], route[i]), false);
    const current = s.team.pathTo === route[waypoint] ? s.team.path : null;
    route.slice(waypoint).forEach((id, n) => {
      const to = squareCenter(id)!;
      const contact = s.contacts.some((c) => c.square === id && c.status === 'revealed');
      const pts = n === 0 && current ? [position, ...current] : n === 0 ? [position, to] : legPath(route[waypoint + n - 1], id);
      g.lineStyle(w, contact ? EVENT_COLOR.contact : TEAM, contact ? 0.8 : 0.55);
      trail(pts, !contact && !s.map.scanned.includes(id));
      g.fillStyle(contact ? EVENT_COLOR.contact : TEAM, 0.8).fillCircle(to.x, to.y, (3 * DPR) / this.zoom);
    });
  }

  private dashed(g: Phaser.GameObjects.Graphics, a: { x: number; y: number }, b: { x: number; y: number }, dash: number, n = 0) {
    if (n % 2) return; // along a path's short steps, every other step makes the dash
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (!len) return;
    const ux = (b.x - a.x) / len;
    const uy = (b.y - a.y) / len;
    for (let d = 0; d < len; d += dash * 2) {
      const e = Math.min(d + dash, len);
      g.lineBetween(a.x + ux * d, a.y + uy * d, a.x + ux * e, a.y + uy * e);
    }
  }

  // The route redraws when the team moves, and when a scan or a reveal changes a leg's state.
  private routeKey = '';
  private missionKey = '';

  private lastTeam = { x: NaN, y: NaN };
  private heading = -Math.PI / 2; // the way the team faces, radians; eased toward its next step

  // ALPHA is five people, not a dot (ILI-1210): one per operator, in a loose wedge facing where the team
  // is headed. Each drifts a little on its own and pings on its own beat, so the team reads as
  // alive. The downed stay in the group, dim and hollow. Reduced motion: still and quiet.
  private drawTeam(time = 0) {
    const { position, path, route, waypoint, operators } = game.get().team;
    const moved = position.x !== this.lastTeam.x || position.y !== this.lastTeam.y;
    if (moved) {
      this.lastTeam = position;
      this.drawRoute();
    }
    const next = path[0] ?? (route[waypoint] && squareCenter(route[waypoint]));
    if (next && Math.hypot(next.x - position.x, next.y - position.y) > 1) {
      const want = Math.atan2(next.y - position.y, next.x - position.x);
      const turn = Math.atan2(Math.sin(want - this.heading), Math.cos(want - this.heading));
      this.heading += reducedMotion() ? turn : turn * 0.06;
    }
    const still = reducedMotion();
    const u = DPR / this.zoom; // one CSS pixel in world units
    const gap = 11 * u;
    const fx = Math.cos(this.heading);
    const fy = Math.sin(this.heading);
    const g = this.teamGfx.clear();
    operators.forEach((o, i) => {
      const [along, across] = WEDGE[i % WEDGE.length];
      const k = i * 1.7 + 0.4; // each one's own rhythm
      const dx = still ? 0 : Math.sin(time / (900 + i * 170) + k) * 0.28 + Math.sin(time / 2300 + k * 2) * 0.18;
      const dy = still ? 0 : Math.cos(time / (1100 + i * 130) + k) * 0.28;
      const a = (along + dx) * gap;
      const c = (across + dy) * gap;
      const x = position.x + fx * a - fy * c;
      const y = position.y + fy * a + fx * c;
      const down = o.health <= 0;
      if (!down && !still) {
        const every = PING_MS[i % PING_MS.length];
        const t = ((time + i * 611) % every) / 900; // 0..1 over the ring's life
        if (t < 1) g.lineStyle(1.2 * u, TEAM, 0.7 * (1 - t)).strokeCircle(x, y, (3 + 11 * t) * u);
      }
      if (down) g.lineStyle(1.2 * u, TEAM, 0.45).strokeCircle(x, y, 2.6 * u);
      else g.fillStyle(TEAM, 1).fillCircle(x, y, 3.2 * u).lineStyle(1.2 * u, 0x0b0f0d, 1).strokeCircle(x, y, 3.2 * u);
    });
    if (moved || this.teamLabel.scale !== 1 / this.zoom) this.teamLabel.setScale(1 / this.zoom).setPosition(position.x + 16 * u, position.y - 22 * u);
  }

  // A finger (or the mouse) down on the map: it may become a drag or a pinch, and only a release
  // without either is a tap.
  private drag: { id: number; x: number; y: number; from: { x: number; y: number }; moved: boolean } | null = null;
  private pinch: { d: number; zoom: number } | null = null;
  private onDown(p: Phaser.Input.Pointer) {
    this.track(p);
    if (game.get().phase !== 'running') return;
    const [a, b] = this.fingers();
    if (a && b) {
      // A second finger: pinch, and the first finger's touch is no longer a tap.
      this.pinch = { d: Phaser.Math.Distance.Between(a.x, a.y, b.x, b.y), zoom: this.userZoom };
      if (this.drag) this.drag.moved = true;
      return;
    }
    if (this.camCenter) this.drag = { id: p.id, x: p.x, y: p.y, from: { ...this.camCenter }, moved: false };
  }

  private onMove(p: Phaser.Input.Pointer) {
    this.track(p);
    const [a, b] = this.fingers();
    if (this.pinch && a && b) {
      const d = Phaser.Math.Distance.Between(a.x, a.y, b.x, b.y);
      this.zoomAt((this.pinch.zoom * d) / this.pinch.d / this.userZoom, (a.x + b.x) / 2, (a.y + b.y) / 2);
      return;
    }
    const drag = this.drag;
    if (!drag || drag.id !== p.id || !p.isDown) return;
    const dx = p.x - drag.x;
    const dy = p.y - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < DRAG_PX * DPR) return;
    drag.moved = true;
    const zoom = this.cameras.main.zoom;
    this.moveCamera({ x: drag.from.x - dx / zoom, y: drag.from.y - dy / zoom });
  }

  private onUp(p: Phaser.Input.Pointer) {
    if (this.pinch) {
      // Lifting a finger ends the pinch; the lines and labels redraw for the new zoom.
      if (this.fingers().length < 2) {
        this.pinch = null;
        this.drag = null;
        this.layout();
      }
      return;
    }
    const drag = this.drag;
    this.drag = null;
    if (!drag || drag.id !== p.id || drag.moved || game.get().phase !== 'running' || game.get().minigame?.kind === 'signal') return;
    // A fighter HQ can see opens its strikes (ILI-1250).
    const target = this.targetAt(p.worldX, p.worldY);
    if (target) return game.openEvent(`contact-${target}`);
    const event = this.eventAt(p.worldX, p.worldY);
    if (event) return game.openEvent(event.id);
    const id = squareAt(p.worldX, p.worldY);
    if (id) game.selectSquare(id);
  }

  private fingers() {
    return this.input.manager.pointers.filter((q) => q.isDown);
  }

  // Put the camera's centre somewhere by hand (a drag or a zoom): within two squares of the
  // AO, and it stops following ALPHA until recentred.
  private moveCamera(c: { x: number; y: number }) {
    const { width, height } = this.scale;
    const cam = this.cameras.main;
    this.camCenter = this.camTarget = clampCenter(c, { w: width, h: height }, cam.zoom, this.cover(getMapRect(), height), PAN);
    cam.centerOn(this.camCenter.x, this.camCenter.y);
    if (!this.panned) bus.emit(EV.panned, (this.panned = true));
    bus.emit(EV.camera);
  }

  // Zoom by a factor about a screen point (device px), keeping the ground under it still:
  // between the whole-map fit and MAX_ZOOM times it.
  private userZoom = 1;
  private fitZoom = 1;
  private relayout?: Phaser.Time.TimerEvent;
  private zoomAt(factor: number, sx: number, sy: number) {
    if (!this.camCenter) return;
    const next = Phaser.Math.Clamp(this.userZoom * factor, 1, MAX_ZOOM);
    if (next === this.userZoom) return;
    const cam = this.cameras.main;
    const at = cam.getWorldPoint(sx, sy);
    this.userZoom = next;
    cam.setZoom(this.fitZoom * next);
    const { width, height } = this.scale;
    this.moveCamera({ x: at.x - (sx - width / 2) / cam.zoom, y: at.y - (sy - height / 2) / cam.zoom });
    // Redraw lines and labels for the new zoom once it settles (not every wheel notch).
    this.relayout?.remove();
    if (!this.pinch) this.relayout = this.time.delayedCall(150, () => this.layout());
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
