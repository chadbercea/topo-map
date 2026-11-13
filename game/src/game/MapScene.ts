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
import { shownEvents } from '../sim/events';
import { DPR } from './dpr';
import { BOARD } from '../sim/minigame';
import { lockedOn, observed, orionSquare, satellitePoint } from '../sim/satellite';
import { teamStatus } from '../sim/team';
import { searchingIn } from '../sim/buildings';
import { shelfState, squareFindings } from '../sim/intel';
import { knownIn, knownSquare, orionScanned } from '../sim/contacts';
import { follows, freshness, GHOST_MS, groupOrigin, shownAt, unitSpot } from '../sim/imagery';
import { AIR, aircraftAt } from '../sim/air';
import { aboard, transportAt, TRANSPORT } from '../sim/exfil';
import { sightings, type Sighting } from '../sim/sightings';
import { panelled, pins } from '../hud/pins';
import { isImageryRequest } from '../sim/imageryRequest';
import { intro, MAP_BOOT } from '../hud/intro';
import { setCellSize } from '../hud/scale';

const TEAL = 0x35d0a5;
const TEAM = 0xf2c14e; // the mission's points and route, in amber
const OPS = TEAL; // the team's dots, in the map's green (ILI-1409)
// Each operator's ping comes on its own random gap, re-rolled every time (ILI-1409).
const nextGap = () => 2000 + Math.random() * 3000;
// The team's formation, in gaps: along the heading (forward +), across it. Point man first.
const WEDGE: [number, number][] = [[1.4, 0], [0.4, -1], [0.4, 1], [-0.7, -0.5], [-0.8, 0.6]];
const EVENT_COLOR = { contact: 0xe5484d, request: 0xf2c14e, site: 0xb8c4bf, signal: 0x8fb8ff, building: 0xf2c14e } as const;
const WATER = 0x5fa8d3;
// The rivers and streams, smoothed so they read as water, not as a staircase of samples; worked
// out once, for the map's bake and ORION-3's (ILI-1483).
let water: { river: boolean; pts: [number, number][] }[] | undefined;
const waterLines = () =>
  (water ??= theaterWater().lines.map((l) => {
    let p = l.pts;
    for (let n = 0; n < 2; n++)
      p = p.length < 3 ? p : [p[0], ...p.slice(0, -1).flatMap((a, i) => [[a[0] * 0.75 + p[i + 1][0] * 0.25, a[1] * 0.75 + p[i + 1][1] * 0.25], [a[0] * 0.25 + p[i + 1][0] * 0.75, a[1] * 0.25 + p[i + 1][1] * 0.75]] as [number, number][]).slice(1), p[p.length - 1]];
    return { river: l.flow >= RIVER, pts: p };
  }));
const FLASH_MS = 2_500; // a new event's square flashes this long, in mission time
const BLIND_MS = 4_000; // a square moved into blind shows what ALPHA found this long (ILI-1309)
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
// One fixed zoom, the whole-map fit (ILI-1484): no wheel, no pinch, no buttons. A drag pans it;
// close-ups are ORION-3's job (ILI-1436).
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
  private wipeGfx!: Phaser.GameObjects.Graphics; // a new scan's wipe over its square (ILI-1423)
  private scansSeen = new Set<string>();
  private wipes = new Map<string, number>(); // square -> when its wipe started
  private dotGfx!: Phaser.GameObjects.Graphics; // the team's dots: the map only
  private arrowGfx!: Phaser.GameObjects.Graphics; // the team as tiny heading arrows: ORION-3's picture only (ILI-1419)
  private bracketGfx!: Phaser.GameObjects.Graphics; // four corners round everything HQ can interact with (ILI-1410)
  private insetBracketGfx!: Phaser.GameObjects.Graphics; // the same, at ORION-3's picture's scale (ILI-1415)
  private opSpots = new Map<string, { x: number; y: number }>(); // where each operator's dot was drawn this frame
  private seen: Sighting[] = [];
  private teamLabel!: Phaser.GameObjects.Text;
  private missionGfx!: Phaser.GameObjects.Graphics;
  private missionLabels: Phaser.GameObjects.Text[] = [];
  private stampGfx!: Phaser.GameObjects.Graphics; // what each scan settled, on its square (ILI-1399)
  private stamps = new Map<string, Phaser.GameObjects.Text>();
  private pkgTags = new Map<string, Phaser.GameObjects.Text>(); // each square's intel package: posted, coming down, ALPHA has it (ILI-1499)
  private stampKey = '';
  private markerGfx!: Phaser.GameObjects.Graphics;
  private blindGfx!: Phaser.GameObjects.Graphics;
  private blindLabels: Phaser.GameObjects.Text[] = [];
  private fightGfx!: Phaser.GameObjects.Graphics;
  private modeGfx!: Phaser.GameObjects.Graphics;
  private droneGfx!: Phaser.GameObjects.Graphics;
  private airLabels!: Record<'drone' | 'heli', Phaser.GameObjects.Text>;
  private exfilLabel!: Phaser.GameObjects.Text;
  private hoverLabel!: Phaser.GameObjects.Text; // what a hovered ping is (ILI-1297)
  private hovered: string | null = null;
  private intelGfx!: Phaser.GameObjects.Graphics; // what ORION-3 and ALPHA have seen
  private seenGfx!: Phaser.GameObjects.Graphics; // how old each square's look is: a photo's draining bar, a feed's brackets (ILI-1468)
  private seenTags = new Map<string, Phaser.GameObjects.Text>();
  private satGfx!: Phaser.GameObjects.Graphics; // ORION-3's reticle
  private modeLabels: Phaser.GameObjects.Text[] = [];
  private labels: Phaser.GameObjects.Text[] = [];
  private pointer = 'none';
  private unsubscribe?: () => void;
  // ORION-3's picture's own copies of the marks (ILI-1471), drawn at its zoom so a mark is the same
  // 1 px, same-size thing there as on the map: the picture shows more ground, never bigger marks.
  private static TWINS = ['gridGfx', 'selectGfx', 'missionGfx', 'routeGfx', 'intelGfx', 'satGfx', 'markerGfx', 'blindGfx', 'fightGfx', 'modeGfx', 'droneGfx', 'wipeGfx'] as const;
  private twins = new Map<(typeof MapScene.TWINS)[number], Phaser.GameObjects.Graphics>();
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
    this.stampGfx = this.add.graphics();
    this.routeGfx = this.add.graphics();
    this.intelGfx = this.add.graphics();
    this.seenGfx = this.add.graphics();
    this.satGfx = this.add.graphics();
    this.markerGfx = this.add.graphics();
    this.blindGfx = this.add.graphics();
    this.fightGfx = this.add.graphics();
    this.modeGfx = this.add.graphics();
    this.droneGfx = this.add.graphics();
    const airLabel = (color = '#e5484d') =>
      this.add
        .text(0, 0, '', { fontFamily: 'JetBrains Mono, monospace', fontSize: `${10 * DPR}px`, color, stroke: '#0b0f0d', strokeThickness: 3 * DPR })
        .setOrigin(0.5, 0)
        .setVisible(false);
    this.airLabels = { drone: airLabel(), heli: airLabel() };
    this.exfilLabel = airLabel('#ff8a2a');
    this.hoverLabel = this.add
      .text(0, 0, '', { fontFamily: 'JetBrains Mono, monospace', fontSize: `${10 * DPR}px`, color: '#e5484d', backgroundColor: '#0b0f0de6', padding: { x: 6 * DPR, y: 3 * DPR } })
      .setOrigin(0, 1)
      .setDepth(10)
      .setVisible(false);
    this.teamGfx = this.add.graphics();
    this.dotGfx = this.add.graphics();
    this.arrowGfx = this.add.graphics();
    this.cameras.main.ignore(this.arrowGfx);
    this.bracketGfx = this.add.graphics();
    this.wipeGfx = this.add.graphics();
    for (const sq of game.get().map.scanned) this.scansSeen.add(sq);
    this.insetBracketGfx = this.add.graphics();
    this.cameras.main.ignore(this.insetBracketGfx); // only ORION-3's picture draws these (ILI-1415)
    this.teamLabel = this.add.text(0, 0, game.get().team.callsign, {
      fontFamily: 'JetBrains Mono, monospace',
      fontSize: `${11 * DPR}px`,
      color: '#35d0a5',
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
    // Its own copies of the marks (ILI-1471): each twin sits just over its original, the map's
    // camera ignores the twins, the picture ignores the originals.
    for (const k of MapScene.TWINS) {
      const orig = this[k];
      const twin = this.add.graphics().setDepth(orig.depth);
      this.cameras.main.ignore(twin);
      this.inset.ignore(orig);
      this.twins.set(k, twin);
    }
    this.inset.ignore(this.teamGfx); // the picture shows the team as its own arrows (ILI-1419)
    this.inset.ignore([...this.labels, this.teamLabel, this.airLabels.drone, this.airLabels.heli, this.exfilLabel, this.hoverLabel]); // the caption names the square; ORION-3's panel has its own hovers
    this.inset.ignore([this.stampGfx, this.bracketGfx, this.dotGfx, this.seenGfx]); // a square's INTEL / CLEAR tag is a map note; the satellite doesn't see it (ILI-1407)
    // ?debug: tests read the live camera to turn world points into screen taps.
    if (new URLSearchParams(location.search).has('debug'))
      Object.assign(window, {
        mapSightings: () => pins.seen(), // what's bracketed, in world points (ILI-1410)
        mapSeenTags: () => Object.fromEntries([...this.seenTags].map(([k, l]) => [k, l.text])), // photo ages and feeds on the map (ILI-1468)
        mapLiveCount: () => this.liveCount, // fighters drawn live under ORION-3
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
    // Touch and mouse (ILI-1214): drag pans, a tap (released where it went down) selects. The
    // zoom is fixed (ILI-1484): no pinch, no wheel.
    this.input.addPointer(1);
    this.input.on(Phaser.Input.Events.POINTER_DOWN, this.onDown, this);
    this.input.on(Phaser.Input.Events.POINTER_MOVE, this.onMove, this);
    this.input.on(Phaser.Input.Events.POINTER_UP, this.onUp, this);
    this.input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.onUp, this);
    this.input.on(Phaser.Input.Events.GAME_OUT, () => {
      this.hovered = null; // off the map: no ping is hovered (ILI-1297)
      this.input.manager.canvas.style.cursor = '';
    });
    this.unsubscribe = game.subscribe(() => {
      this.drawSelection();
      this.applyView();
      this.placeInset();
    });
    // The map boot (ILI-1462): on the way in after the login, and on every restart.
    const offIntro = intro.subscribe(() => intro.get() === 'map' && this.startBoot());
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      offIntro();
      this.scale.off(Phaser.Scale.Events.RESIZE, this.layout, this);
      bus.off(EV.mapRect, this.layout, this);
      bus.off(EV.inset, this.placeInset, this);
      bus.off(EV.recentre, this.recentre, this);
      this.unsubscribe?.();
    });

    this.layout();
  }

  // Draw into ORION-3's picture's copies at its zoom (ILI-1471): swap the twins in, draw, swap back.
  private forInset(draw: () => void) {
    if (!this.inset.visible) return;
    const self = this as unknown as Record<string, Phaser.GameObjects.Graphics>;
    const saved = new Map<string, Phaser.GameObjects.Graphics>();
    for (const [k, twin] of this.twins) (saved.set(k, self[k]), (self[k] = twin));
    this.drawZoom = this.inset.zoom;
    try {
      draw();
    } finally {
      this.drawZoom = null;
      for (const [k, g] of saved) self[k] = g;
    }
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
    this.settle();
    this.drawTeam(_time);
    const st = game.get();
    const key = `${st.team.waypoint}|${st.team.route.join()}|${st.map.scanned.length}|${st.contacts.map((c) => knownSquare(st, c) ?? '')}`;
    if (key !== this.routeKey) {
      this.routeKey = key;
      this.drawRoute();
    }
    // Exfil can move (ILI-1192): the A/B/C markers follow it. Every frame: the objective pulses (ILI-1392).
    this.drawMission(_time);
    const stampKey = `${st.intel.graded.join()}|${st.intel.pushes.map((p) => p.state[1]).join('')}|${st.contacts.filter((c) => c.status === 'revealed').length}|${this.zoom}`;
    if (stampKey !== this.stampKey) {
      this.stampKey = stampKey;
      this.drawStamps();
    }
    this.drawMarkers(_time);
    this.drawFight(_time);
    this.drawIntel();
    this.drawSeen(_time);
    this.drawPlans();
    this.drawSatellite(_time);
    this.drawMiniGame(_time);
    this.drawBrackets();
    this.drawWipes(_time);
    this.drawStrikes();
    this.drawBlind();
    this.forInset(() => {
      this.drawSelection();
      this.drawRoute();
      this.drawMission(_time);
      this.drawMarkers(_time);
      this.drawFight(_time);
      this.drawIntel();
      this.drawPlans();
      this.drawSatellite(_time);
      this.drawMiniGame(_time);
      this.drawWipes(_time);
      this.drawStrikes();
      this.drawBlind();
    });
    this.reveal();
  }

  // The map boot (ILI-1462): the system coming up for the first time. The ground fades up as the
  // camera settles in on ALPHA, the grid lines draw, then what's known pops in: the team, the
  // mission's points, everything else that's marked. The beat after it, with only the map on
  // screen, and the panels are the HUD's (intro.ts, styles.css). No input on the map meanwhile.
  private bootAt: number | null = null;
  private startBoot() {
    this.bootAt = performance.now();
    this.shownAll = false;
    this.camCenter = null; // layout() centres on ALPHA again
    if (this.panned) bus.emit(EV.panned, (this.panned = false));
    this.layout();
    if (!reducedMotion()) this.cameras.main.fadeIn(MAP_BOOT.settle * 0.8, 11, 15, 13);
    this.settle();
    this.reveal();
  }
  private get bootT() {
    return this.bootAt === null ? Infinity : performance.now() - this.bootAt;
  }
  // The camera eases in to its fit while the ground fades up; the grid draws after it.
  private settle() {
    if (this.bootAt === null) return;
    const t = this.bootT;
    const { settle, grid, pop } = MAP_BOOT;
    if (reducedMotion() || t >= settle + grid + pop) {
      this.bootAt = null;
      this.layout(); // the fit, the full grid and its labels
      return;
    }
    const k = 1 - Math.pow(1 - Math.min(1, t / settle), 3);
    const cam = this.cameras.main;
    cam.setZoom(this.fitZoom * (0.82 + 0.18 * k));
    if (this.camCenter) cam.centerOn(this.camCenter.x, this.camCenter.y);
    this.drawGrid(Math.max(0, Math.min(1, (t - settle) / grid)));
    this.labels.forEach((label) => label.setScale(1 / this.zoom));
  }
  // Each group of marks shows once its time comes: on, a blink off, on again, like the panels.
  private shownAll = true;
  private reveal() {
    if (this.bootAt === null && this.shownAll) return;
    this.shownAll = this.bootAt === null;
    const t = this.bootT;
    const { settle, grid } = MAP_BOOT;
    const on = (at: number) => {
      const u = t - at;
      return u >= 0 && !(u > 90 && u < 170);
    };
    const id = this.cameras.main.id;
    const show = (o: Phaser.GameObjects.GameObject, v: boolean) => void (o.cameraFilter = v ? o.cameraFilter & ~id : o.cameraFilter | id);
    const marks = settle + grid;
    this.labels.forEach((l) => show(l, on(settle + grid * 0.6)));
    for (const o of [this.teamGfx, this.dotGfx, this.teamLabel]) show(o, on(marks + MAP_BOOT.team));
    for (const o of [this.missionGfx, ...this.missionLabels, this.exfilLabel]) show(o, on(marks + MAP_BOOT.mission));
    const known = [this.routeGfx, this.stampGfx, ...this.stamps.values(), ...this.pkgTags.values(), this.seenGfx, ...this.seenTags.values(), this.markerGfx, this.intelGfx, this.blindGfx, ...this.blindLabels, this.fightGfx, this.modeGfx, ...this.modeLabels, this.droneGfx, this.airLabels.drone, this.airLabels.heli, this.bracketGfx, this.satGfx, this.selectGfx, this.wipeGfx];
    for (const o of known) show(o, on(marks + MAP_BOOT.known));
  }

  // Air strikes (ILI-1252, ILI-1254): the aircraft crosses the square on each pass, with its
  // callsign under it as in its panel, and each fighter
  // it passes becomes a red X, which stays as the aftermath. The sniper's kills (ILI-1253) are
  // X marks too, and its misses rings.
  // Only what HQ can watch (ILI-1515): the fight shows while ORION-3 is locked on its square or a
  // live feed covers it; the X marks after, too, while a look taken since the kill holds. No
  // static marker stands in for it.
  private drawStrikes() {
    const g = this.droneGfx.clear();
    const s = game.get();
    const now = s.elapsedMs;
    const px = DPR / this.zoom;
    const r = 5 * px;
    const watching = (sq: string) => observed(s, sq);
    const cross = (x: number, y: number, atMs: number) => {
      const sq = squareAt(x, y);
      const look = sq ? s.imagery[sq] : undefined;
      if (!sq || !(watching(sq) || (look && look.atMs >= atMs && freshness(look, now) !== 'stale'))) return;
      g.lineStyle(px, 0xe5484d, 1).lineBetween(x - r, y - r, x + r, y + r).lineBetween(x - r, y + r, x + r, y - r);
    };
    // OVERWATCH's crosshairs on the map, on the fighter it shoots next (ILI-1303).
    const sniperSeen = !!s.sniper && watching(s.sniper.square);
    const aim = s.sniper && !s.sniper.done && sniperSeen ? s.sniper.shots.find((x) => x.atMs > now) : null;
    if (aim) {
      const cr = 12 * px;
      for (const [w, c, a] of [[px, 0xe5484d, 1]] as const) {
        g.lineStyle(w, c, a).strokeCircle(aim.x, aim.y, cr);
        g.lineBetween(aim.x - cr * 1.5, aim.y, aim.x - cr * 0.5, aim.y).lineBetween(aim.x + cr * 0.5, aim.y, aim.x + cr * 1.5, aim.y);
        g.lineBetween(aim.x, aim.y - cr * 1.5, aim.x, aim.y - cr * 0.5).lineBetween(aim.x, aim.y + cr * 0.5, aim.x, aim.y + cr * 1.5);
      }
    }
    for (const shot of s.sniper?.shots ?? []) {
      if (shot.atMs > now) continue;
      if (shot.hit) cross(shot.x, shot.y, shot.atMs);
      else if (sniperSeen) g.lineStyle(px, 0xcfe8dc, 0.6).strokeCircle(shot.x, shot.y, r);
    }
    // Every vehicle is the same outlined triangle pointing the way it's going, in the map's
    // wireframe over a dark halo so it reads on the contours, with its callsign under it
    // (ILI-1289, ILI-1294): REAPER-1, HAMMER-2, the exfil transport.
    const arrow = (x: number, y: number, z: number, dir: number, color: number) => {
      for (const [w, c, a] of [[px, color, 1]])
        g.lineStyle(w, c, a).strokeTriangle(x + z * dir, y, x - z * dir, y - z * 0.8, x - z * dir, y + z * 0.8);
    };
    for (const w of ['drone', 'heli'] as const) {
      const run = w === 'drone' ? s.drone : s.heli;
      const label = this.airLabels[w];
      for (const k of run?.kills ?? []) if (k.atMs <= now) cross(k.x, k.y, k.atMs);
      const at = run && watching(run.square) && aircraftAt(run, now);
      if (!at) {
        if (this.onMain) label.setVisible(false);
        continue;
      }
      const z = 7 * px;
      const dir = at.east ? 1 : -1;
      arrow(at.x, at.y, z, dir, 0xe5484d);
      if (this.onMain) label.setText(AIR[w].callsign).setScale(1 / this.zoom).setPosition(at.x, at.y + z * 1.1).setVisible(true);
    }
    // The exfil transport (ILI-1264): an orange arrow into the square, down at the marker while
    // ALPHA boards, then out the other side.
    const t = s.exfil && transportAt(s.exfil, now);
    if (!t) {
      if (this.onMain) this.exfilLabel.setVisible(false);
    }
    else {
      const z = 9 * px;
      const dir = t.east ? 1 : -1;
      arrow(t.x, t.y, z, dir, 0xff8a2a);
      // Under it; down at the marker, under the marker's own label (drawMission).
      if (this.onMain) this.exfilLabel.setText(TRANSPORT.callsign).setScale(1 / this.zoom).setPosition(t.x, t.y + (t.down ? 32 * px : z * 1.1)).setVisible(true);
    }
  }

  // Moving in blind, paid out (ILI-1309): when ALPHA reaches a square HQ sent it into blind,
  // the square flashes what it found there, green and CLEAR or red and CONTACT, fading out
  // over a few seconds of mission time.
  private drawBlind() {
    const g = this.blindGfx.clear();
    const { map, elapsedMs: now } = game.get();
    const px = DPR / this.zoom;
    const shown = map.blind.filter((b) => now - b.atMs < BLIND_MS);
    shown.forEach((b, i) => {
      const sq = parseSquare(b.square)!;
      const color = b.found ? 0xe5484d : TEAL;
      const a = 1 - (now - b.atMs) / BLIND_MS;
      g.fillStyle(color, 0.18 * a).fillRect(sq.col * CELL, sq.row * CELL, CELL, CELL);
      g.lineStyle(px, color, a).strokeRect(sq.col * CELL, sq.row * CELL, CELL, CELL);
      if (!this.onMain) return;
      const label = (this.blindLabels[i] ??= this.add
        .text(0, 0, '', { fontFamily: 'JetBrains Mono, monospace', fontSize: `${12 * DPR}px`, fontStyle: 'bold', stroke: '#0b0f0d', strokeThickness: 4 * DPR })
        .setOrigin(0.5, 0.5)
        .setDepth(10));
      this.inset.ignore(label);
      label
        .setText(`${b.square} · ${b.found ? 'CONTACT' : 'CLEAR'}`)
        .setColor(b.found ? '#e5484d' : '#35d0a5')
        .setAlpha(Math.min(1, a * 1.5))
        .setScale(1 / this.zoom)
        .setPosition((sq.col + 0.5) * CELL, (sq.row + 0.5) * CELL)
        .setVisible(true);
    });
    if (this.onMain) this.blindLabels.slice(shown.length).forEach((l) => l.setVisible(false));
  }

  // Mini game mode: the signal pulses where it comes from.
  private drawMiniGame(time: number) {
    const g = this.modeGfx.clear();
    const m = game.get().minigame;
    if (this.onMain) this.modeLabels.forEach((l) => l.setVisible(false));
    if (!m) return;
    // Roughly where the signal comes from: the square and its neighbours, pulsing.
    const sq = parseSquare(m.square)!;
    const a = 0.08 + 0.08 * Math.abs(Math.sin(time / 300));
    g.fillStyle(0x8fb8ff, a).fillRect((sq.col - 1) * CELL, (sq.row - 1) * CELL, CELL * 3, CELL * 3);
    g.lineStyle(DPR / this.zoom, 0x8fb8ff, 0.7).strokeRect((sq.col - 1) * CELL, (sq.row - 1) * CELL, CELL * 3, CELL * 3);
  }

  // What HQ has seen (ILI-1167): each look's fighters at the positions they were seen in.
  // Live (video, ALPHA's eyes) and fresh looks are crisp; older ones turn to ghosts with a
  // ring for how far they may have gone, then to faint last-known marks. Heading arrows
  // show who was moving, and where to.
  private drawIntel() {
    const g = this.intelGfx.clear();
    const st = game.get();
    const { imagery, contacts, elapsedMs: now } = st;
    const px = DPR / this.zoom;
    // The square ORION-3 is locked on is watched live (ILI-1468): every fighter there is drawn where
    // he is now, once ORION-3 has scanned it. Over a square it hasn't, nothing about an enemy shows
    // (ILI-1493, superseding 11-12's "scanned or not").
    const aim = st.satellite.aim;
    const watched = st.satellite.state !== 'slewing' && lockedOn(st, aim) && orionScanned(st, aim) ? aim : null;
    const live = (c: (typeof contacts)[number]) => {
      if (!watched || (c.status !== 'revealed' && c.status !== 'hidden') || !c.units.length) return null;
      const o = groupOrigin(c, now);
      return squareAt(o.x + CELL / 2, o.y + CELL / 2) === watched ? o : null;
    };
    const drawn = new Set<string>();
    if (this.onMain) this.liveCount = 0;
    for (const c of contacts) {
      const o = live(c);
      if (!o) continue;
      drawn.add(c.id);
      if (this.onMain) this.liveCount += c.units.length;
      for (const u of c.units) {
        const { x, y } = unitSpot(o, u);
        g.lineStyle(px, 0xe5484d, 1).strokeCircle(x, y, 5 * px);
      }
    }
    for (const snap of Object.values(imagery)) {
      const age = freshness(snap, now);
      // Old looks fade as they age (ILI-1430): full while live, then smoothly down to faint at stale.
      const alpha = age === 'live' ? 1 : age === 'stale' ? 0.18 : Math.max(0.18, 1 - ((now - snap.atMs) / GHOST_MS) * 0.82);
      for (const seen of snap.seen) {
        const c = contacts.find((x) => x.id === seen.contactId);
        if (!c || c.status === 'cleared' || drawn.has(c.id)) continue;
        // Live looks follow them; anything else shows where they were.
        const o = shownAt(snap, seen, c, now);
        if (!o) continue; // out of the picture: the fog closes over it (ILI-1416)
        const units = follows(snap) ? c.units : seen.units;
        let cx = 0;
        let cy = 0;
        for (const u of units) {
          const { x, y } = unitSpot(o, u);
          cx += x / units.length;
          cy += y / units.length;
          // A red outline ring over a dark halo, not a filled dot (ILI-1442).
          g.lineStyle(px, 0xe5484d, alpha).strokeCircle(x, y, 5 * px);
          if (age === 'ghost') g.lineStyle(px, 0xe5484d, 0.35).strokeCircle(x, y, (CELL / BOARD) * 0.45);
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
          g.lineStyle(px, 0xe5484d, alpha).lineBetween(cx, cy, ex, ey);
          g.lineBetween(ex, ey, ex - ux * h - uy * h * 0.6, ey - uy * h + ux * h * 0.6);
          g.lineBetween(ex, ey, ex - ux * h + uy * h * 0.6, ey - uy * h - ux * h * 0.6);
        }
      }
    }
  }

  // How up to date each square's look is (ILI-1468). A photo square: a bar along its foot that
  // drains as the photo ages, to empty when it goes stale, and a PHOTO · m:ss tag counting up. A
  // square on video: corner brackets, ORION-3's frame, and FEED · LIVE with a blinking dot, for as
  // long as the feed runs. The satellite's picture doesn't show these: they're map notes.
  private drawSeen(time: number) {
    const st = game.get();
    const g = this.seenGfx.clear();
    const px = DPR / this.zoom;
    const now = st.elapsedMs;
    const feeds = new Set(st.intel.live ?? []);
    const want = new Map<string, { text: string; color: string; bg: string; x: number; y: number }>();
    for (const snap of Object.values(st.imagery)) {
      if (snap.mode !== 'photo' || snap.live || feeds.has(snap.square)) continue;
      const p = parseSquare(snap.square);
      if (!p) continue;
      const x = p.col * CELL;
      const y = p.row * CELL;
      const left = Math.max(0, 1 - (now - snap.atMs) / GHOST_MS);
      const stale = left <= 0;
      const inset = 6 * px;
      const w = CELL - inset * 2;
      const h = 3 * px;
      const by = y + CELL - inset - h;
      g.fillStyle(0xf2c14e, 0.18).fillRect(x + inset, by, w, h);
      if (left > 0) g.fillStyle(0xf2c14e, 0.95).fillRect(x + inset, by, w * left, h);
      const secs = Math.floor((now - snap.atMs) / 1000);
      want.set(`p:${snap.square}`, { text: stale ? 'PHOTO · STALE' : `PHOTO · ${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`, color: stale ? '#6f8a7d' : '#f2c14e', bg: '#0b0f0dd9', x: x + CELL - 8 * px, y: y + 8 * px }); // top right: the INTEL / CLEAR stamp has the foot's left
    }
    for (const sq of feeds) {
      const p = parseSquare(sq);
      if (!p) continue;
      const x = p.col * CELL;
      const y = p.row * CELL;
      const k = CELL * 0.14;
      const i = 3 * px;
      g.lineStyle(px, TEAL, 0.95);
      for (const [cx, cy, dx, dy] of [[x + i, y + i, 1, 1], [x + CELL - i, y + i, -1, 1], [x + i, y + CELL - i, 1, -1], [x + CELL - i, y + CELL - i, -1, -1]] as const) {
        g.lineBetween(cx, cy, cx + dx * k, cy);
        g.lineBetween(cx, cy, cx, cy + dy * k);
      }
      const blink = Math.floor(time / 600) % 2 === 0;
      want.set(`f:${sq}`, { text: `${blink ? '●' : '○'} FEED · LIVE`, color: '#0b0f0d', bg: '#35d0a5', x: x + CELL - 8 * px, y: y + 8 * px });
    }
    for (const [key, label] of this.seenTags) if (!want.has(key)) (label.destroy(), this.seenTags.delete(key));
    for (const [key, w] of want) {
      let label = this.seenTags.get(key);
      if (!label) {
        label = this.add.text(0, 0, '', { fontFamily: 'JetBrains Mono, monospace', fontSize: `${9.5 * DPR}px`, padding: { x: 5 * DPR, y: 2 * DPR } });
        label.setOrigin(1, 0);
        this.inset.ignore(label);
        this.seenTags.set(key, label);
      }
      label.setText(w.text).setColor(w.color).setBackgroundColor(w.bg).setScale(1 / this.zoom).setPosition(w.x, w.y);
    }
  }

  // A decoded plan (ILI-1169): a dashed red route from where the contact was last seen to
  // where it means to go.
  private drawPlans() {
    const g = this.intelGfx;
    const st = game.get();
    const { contacts } = st;
    const px = DPR / this.zoom;
    for (const c of contacts) {
      if (!c.planKnown || !c.planTo) continue;
      const seenAt = knownSquare(st, c); // from where it was last seen, never where it really is (ILI-1493)
      if (!seenAt) continue;
      if (seenAt === c.planTo) continue; // it's there
      const a = squareCenter(seenAt)!;
      const b = squareCenter(c.planTo)!;
      const d = Math.hypot(b.x - a.x, b.y - a.y);
      const ux = (b.x - a.x) / d;
      const uy = (b.y - a.y) / d;
      g.lineStyle(px, 0xe5484d, 0.8);
      for (let t = 0; t < d; t += 14 * px) g.lineBetween(a.x + ux * t, a.y + uy * t, a.x + ux * Math.min(d, t + 8 * px), a.y + uy * Math.min(d, t + 8 * px));
      const h = 9 * px;
      g.lineBetween(b.x, b.y, b.x - ux * h - uy * h * 0.6, b.y - uy * h + ux * h * 0.6);
      g.lineBetween(b.x, b.y, b.x - ux * h + uy * h * 0.6, b.y - uy * h - ux * h * 0.6);
    }
  }

  // ORION-3's reticle, the player's avatar (ILI-1397): its footprint on the square it's over.
  // Locked on, it's solid: a bright outline and corner brackets. Swinging over, the brackets ride
  // a dashed track to the dashed square it will lock on. A square HQ picked that it isn't over
  // shows a ghost reticle, dashed, until HQ moves it there. A pulse while it captures.
  private drawSatellite(time: number) {
    const g = this.satGfx.clear();
    const s = game.get();
    const { satellite: sat, elapsedMs } = s;
    const px = DPR / this.zoom;
    const p = satellitePoint(sat, elapsedMs);
    const x = p.col * CELL;
    const y = p.row * CELL;
    const slewing = sat.state === 'slewing';
    const dashedRect = (rx: number, ry: number, alpha: number) => {
      const dash = 10 * px;
      const gap = 7 * px;
      g.lineStyle(px, TEAL, alpha);
      for (const [ax, ay, bx, by] of [[rx, ry, rx + CELL, ry], [rx + CELL, ry, rx + CELL, ry + CELL], [rx + CELL, ry + CELL, rx, ry + CELL], [rx, ry + CELL, rx, ry]]) {
        const len = Math.hypot(bx - ax, by - ay);
        const ux = (bx - ax) / len;
        const uy = (by - ay) / len;
        for (let t = 0; t < len; t += dash + gap) g.lineBetween(ax + ux * t, ay + uy * t, ax + ux * Math.min(len, t + dash), ay + uy * Math.min(len, t + dash));
      }
    };
    if (slewing) {
      const to = parseSquare(sat.aim)!;
      const d = Math.hypot((to.col - p.col) * CELL, (to.row - p.row) * CELL) || 1;
      const ax = x + CELL / 2;
      const ay = y + CELL / 2;
      const ux = ((to.col - p.col) * CELL) / d;
      const uy = ((to.row - p.row) * CELL) / d;
      g.lineStyle(px, TEAL, 0.85);
      for (let t = 0; t < d; t += 12 * px) g.lineBetween(ax + ux * t, ay + uy * t, ax + ux * Math.min(d, t + 6 * px), ay + uy * Math.min(d, t + 6 * px));
      dashedRect(to.col * CELL, to.row * CELL, 0.8);
    } else {
      // Locked on: solid.
      g.fillStyle(TEAL, 0.07).fillRect(x, y, CELL, CELL);
      g.lineStyle(px, TEAL, 0.7).strokeRect(x, y, CELL, CELL);
    }
    // The ghost: picked, and neither where it is nor where it's going.
    const picked = s.map.selected && parseSquare(s.map.selected);
    if (picked && !s.minigame && s.map.selected !== sat.aim) dashedRect(picked.col * CELL, picked.row * CELL, 0.45 + 0.2 * Math.abs(Math.sin(time / 400)));
    if (sat.state === 'capturing') g.fillStyle(TEAL, 0.06 + 0.06 * Math.abs(Math.sin(time / 250))).fillRect(x, y, CELL, CELL);
    const k = CELL * 0.22;
    g.lineStyle(px, TEAL, 0.95);
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
      g.lineStyle(DPR / this.zoom, 0xe5484d, 1 - t).strokeCircle(position.x, position.y, r * (1 + t * 2.5));
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
    const st = game.get();
    const { openEvent, elapsedMs } = st;
    const events = shownEvents(st); // only where ORION-3 has looked (ILI-1519)
    const px = (DPR * 1) / this.zoom;
    for (const e of events) {
      if (e.status === 'resolved' || e.kind === 'site') continue; // a kill site's X marks are enough (ILI-1252)
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
      if (e.id === openEvent) g.lineStyle(px, color, 0.95).strokeRect(sq.col * CELL, sq.row * CELL, CELL, CELL);
      // The grid square ALPHA needs intel on (ILI-1450): outlined in amber and pulsing, so the
      // player knows where to click, until its intel is sent.
      else if (isImageryRequest(e)) g.lineStyle(px, color, 0.45 + 0.5 * Math.abs(Math.sin(time / 450))).strokeRect(sq.col * CELL, sq.row * CELL, CELL, CELL);
      if (e.status === 'new') {
        // Pulse until the player looks at it.
        const t = (time % 1200) / 1200;
        g.lineStyle(DPR / this.zoom, color, 1 - t).strokeCircle(x, y, r * (1 + t * 1.6));
      }
      g.lineStyle(px, color, 1).strokeCircle(x, y, r);
      g.lineStyle(px, color, e.id === openEvent ? 1 : 0.7).strokeCircle(x, y, r * 0.45);
    }
    // Hovered (ILI-1297): a ring round the ping and a tag saying what it is.
    const hover = events.find((e) => e.id === this.hovered && e.status !== 'resolved');
    if (this.onMain) this.hoverLabel.setVisible(!!hover);
    if (hover && this.onMain) {
      const { x, y } = this.markerPos(hover.square);
      const color = EVENT_COLOR[hover.kind];
      g.lineStyle(px, color, 0.9).strokeCircle(x, y, r * 1.7);
      this.hoverLabel
        .setText(`${hover.square} · ${hover.title}`)
        .setColor(`#${color.toString(16).padStart(6, '0')}`)
        .setScale(1 / this.zoom)
        .setPosition(x + r * 1.6, y - r * 1.2);
    }
  }

  // The bracketed thing under a point that gets a panel (ILI-1411): an operator, a fighter, a kill
  // site, the wreck. Nothing without brackets answers (ILI-1410).
  private sightingAt(x: number, y: number) {
    const hit = (12 * DPR) / this.zoom; // the dot, and a margin for thumbs
    const reach = (t: Sighting) => (t.kind === 'team' ? hit * 2.4 : t.kind === 'wreck' ? hit * 1.6 : hit);
    const near = this.seen.filter((t) => panelled(t) && t.kind !== 'operator' && Math.hypot(t.x - x, t.y - y) <= reach(t)); // the main map's targets (ILI-1443)
    return near.sort((p, q) => Math.hypot(p.x - x, p.y - y) - Math.hypot(q.x - x, q.y - y))[0] ?? null;
  }

  // Four corner brackets round everything HQ can interact with, and nothing else (ILI-1410).
  private drawBrackets() {
    const s = game.get();
    this.seen = sightings(s, this.opSpots);
    pins.setSeen(this.seen);
    // The main map is the overview (ILI-1443): ALPHA is one target; each man is ORION-3's.
    this.bracketsInto(this.bracketGfx.clear(), this.seen.filter((t) => t.kind !== 'operator'), DPR / this.zoom, DPR / this.zoom);
    // ORION-3's picture gets them too (ILI-1415): sized to wrap the dots as drawn (they're drawn
    // for the map's zoom), with a line as thin as the map's at the picture's zoom.
    const g = this.insetBracketGfx.clear();
    const id = this.inset.visible ? orionSquare(s) : null;
    const sq = id ? parseSquare(id) : null;
    if (!sq) return;
    const pad = CELL * 0.25; // the sliver of neighbours round the square
    const inView = this.seen.filter((t) => t.kind !== 'team' && t.x >= sq.col * CELL - pad && t.x <= (sq.col + 1) * CELL + pad && t.y >= sq.row * CELL - pad && t.y <= (sq.row + 1) * CELL + pad);
    this.bracketsInto(g, inView, DPR / this.zoom, DPR / this.inset.zoom, true);
  }

  // A scan of a square nobody had scanned (ILI-1423): the intro's wipe, on the square. It snaps
  // black, then a bright bar sweeps across and the square comes back with what the scan found.
  private drawWipes(time: number) {
    const scanned = game.get().map.scanned;
    if (scanned.length < this.scansSeen.size) this.scansSeen = new Set(scanned); // a new mission
    for (const sq of scanned) {
      if (this.scansSeen.has(sq)) continue;
      this.scansSeen.add(sq);
      if (!reducedMotion()) this.wipes.set(sq, time);
    }
    const g = this.wipeGfx.clear();
    const BLACK = 120;
    const SWEEP = 480;
    const px = DPR / this.zoom;
    for (const [sq, at] of this.wipes) {
      const t = time - at;
      const p = parseSquare(sq);
      if (!p || t > BLACK + SWEEP) {
        this.wipes.delete(sq);
        continue;
      }
      const x0 = p.col * CELL;
      const y0 = p.row * CELL;
      if (t < BLACK) {
        g.fillStyle(0x0b0f0d, t / BLACK).fillRect(x0, y0, CELL, CELL);
        continue;
      }
      const k = (t - BLACK) / SWEEP;
      const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2; // the intro's ease, near enough
      const bar = x0 + e * CELL;
      g.fillStyle(0x0b0f0d, 1).fillRect(bar, y0, x0 + CELL - bar, CELL);
      g.lineStyle(px, TEAL, 1).lineBetween(bar, y0, bar, y0 + CELL);
    }
  }

  // Four corner brackets round each thing. px: one CSS pixel at the zoom the things are drawn for;
  // line: one CSS pixel at the zoom of the camera that shows these brackets.
  // picture: ORION-3's, where operators are arrows drawn at its own zoom (ILI-1419).
  private bracketsInto(g: Phaser.GameObjects.Graphics, things: Sighting[], px: number, line: number, picture = false) {
    const s = game.get();
    const eventColor = (id: string) => EVENT_COLOR[s.events.find((e) => e.id === id)?.kind ?? 'request'];
    for (const t of things) {
      const [half, color] =
        t.kind === 'team' ? [26, TEAL]
        : t.kind === 'operator' ? [7, TEAL]
        : t.kind === 'hostile' || t.kind === 'site' ? [8, 0xe5484d]
        : t.kind === 'wreck' ? [16, TEAM]
        : t.kind === 'aircraft' ? [14, t.id === 'air:exfil' ? 0xff8a2a : 0xe5484d]
        : t.kind === 'signal' ? [MARKER_R * 1.3 + 4, EVENT_COLOR.signal]
        : [MARKER_R + 4, eventColor(t.id)];
      const size = picture ? line : px; // the picture's brackets are its own size, like every mark there (ILI-1471)
      const h = half * size;
      const k = Math.max(3, half * 0.4) * size; // each corner's arms
      const { x, y } = t;
      g.lineStyle(line, color, t.age === 'ghost' ? 0.45 : 0.9);
      for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
        const cx = x + sx * h;
        const cy = y + sy * h;
        g.lineBetween(cx, cy, cx - sx * k, cy).lineBetween(cx, cy, cx, cy - sy * k);
      }
    }
  }

  // The ping under a point, for a click (ILI-1489): an event's marker; a contact's callout dot (its
  // tag's dot sits a quarter down its square's middle, PromptLayer); or a fighter, which is his
  // contact's. ALPHA's intel ask's marker is part of its square (ILI-1451): not a ping.
  private pingAt(x: number, y: number) {
    const s = game.get();
    const open = (e: (typeof s.events)[number] | undefined) => (e && e.status !== 'resolved' && e.kind !== 'site' && !isImageryRequest(e) ? e : undefined);
    const hit = ((MARKER_R + 8) * DPR) / this.zoom; // a little more than drawn, so a near miss isn't a square click
    const shown = shownEvents(s); // only where ORION-3 has looked (ILI-1519)
    const marker = shown.find((e) => open(e) && Math.hypot(this.markerPos(e.square).x - x, this.markerPos(e.square).y - y) <= hit * 1.2);
    if (marker) return marker;
    const dot = shown.find((e) => {
      if (e.kind !== 'contact' || e.status === 'resolved') return false;
      const c = squareCenter(e.square)!;
      return Math.hypot(c.x - x, c.y - CELL * 0.25 - y) <= hit;
    });
    if (dot) return dot;
    const thing = this.sightingAt(x, y);
    if (thing?.kind === 'hostile') return open(shown.find((e) => e.id === `contact-${thing.id.split(':')[0]}`));
    return undefined;
  }

  private eventAt(x: number, y: number) {
    const hit = ((MARKER_R + 6) * DPR) / this.zoom; // a little bigger than drawn, for thumbs
    return shownEvents(game.get()).find((e) => e.status !== 'resolved' && e.kind !== 'site' && Math.hypot(this.markerPos(e.square).x - x, this.markerPos(e.square).y - y) <= hit);
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
    const w = Math.round(frame.width * DPR);
    const h = Math.round(frame.height * DPR);
    this.inset.setViewport(Math.round(frame.x * DPR), Math.round(frame.y * DPR), w, h).setVisible(true);
    // The square fills the frame's shorter side (ILI-1206, ILI-1354), a sliver of its neighbours
    // round it: whole in a wide frame or a tall one.
    const z = Math.min(w, h) / CELL;
    const was = this.inset.zoom;
    this.inset.setZoom(z);
    this.inset.centerOn((sq.col + 0.5) * CELL, (sq.row + 0.5) * CELL);
    if (z !== was || !this.insetGrid) {
      this.insetGrid = true;
      this.forInset(() => this.drawGrid());
    }
    this.bakeInsetGround((sq.col + 0.5) * CELL, (sq.row + 0.5) * CELL, w, h);
  }

  // ORION-3's ground, crisp (ILI-1483): the map's baked layers are sized for the map's zoom, so the
  // picture, zoomed in further, showed them stretched and soft. The picture gets its own bake of
  // just what it shows, at its own zoom, one texture pixel to a screen pixel; it ignores the map's.
  // Lines keep the map's screen weights: the picture magnifies ground, not line widths (ILI-1471).
  private insetGround?: Phaser.GameObjects.Image;
  private insetGroundKey = '';
  private bakeInsetGround(cx: number, cy: number, w: number, h: number) {
    const z = this.inset.zoom;
    const { city, mapView } = game.get().settings;
    const relief = mapView === 'relief';
    const area = { x: cx - w / z / 2, y: cy - h / z / 2, w: w / z, h: h / z };
    const key = [area.x, area.y, w, h, z, city, relief].join();
    if (key === this.insetGroundKey) return;
    this.insetGroundKey = key;
    const g = this.make.graphics({}, false);
    const X = (x: number) => (x - area.x) * z;
    const Y = (y: number) => (y - area.y) * z;
    // Only what crosses the picture: a line's bounds overlap it.
    const near = (pts: [number, number][]) => {
      let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
      for (const [x, y] of pts) (x0 = Math.min(x0, x)), (y0 = Math.min(y0, y)), (x1 = Math.max(x1, x)), (y1 = Math.max(y1, y));
      return x1 >= area.x - 8 && x0 <= area.x + area.w + 8 && y1 >= area.y - 8 && y0 <= area.y + area.h + 8;
    };
    const stroke = (pts: [number, number][]) => {
      g.beginPath();
      g.moveTo(X(pts[0][0]), Y(pts[0][1]));
      for (let i = 1; i < pts.length; i++) g.lineTo(X(pts[i][0]), Y(pts[i][1]));
      g.strokePath();
    };
    if (!relief) g.fillStyle(0x0b0f0d, 1).fillRect(0, 0, w, h); // the near background; in relief the relief shows through
    const dim = relief ? 0.35 : 1; // as applyView dims the map's contours over relief
    for (const line of this.contours) {
      g.lineStyle((line.index ? 1.4 : 0.8) * DPR, TEAL, (line.index ? 0.38 : 0.16) * dim);
      for (const ring of line.rings) if (ring.length >= 2 && near(ring)) stroke(ring);
    }
    for (const l of waterLines()) {
      if (!near(l.pts)) continue;
      g.lineStyle((l.river ? 2.6 : 1.2) * DPR, WATER, l.river ? 0.8 : 0.55);
      stroke(l.pts);
    }
    if (city) {
      g.lineStyle(3 * DPR, 0xb8c4bf, 0.45);
      this.city.roads.filter(near).forEach(stroke);
      g.lineStyle(1 * DPR, 0xb8c4bf, 0.3);
      this.city.streets.filter(near).forEach(stroke);
    }
    if (this.textures.exists('inset-ground')) this.textures.remove('inset-ground');
    g.generateTexture('inset-ground', Math.max(1, Math.ceil(w)), Math.max(1, Math.ceil(h)));
    g.destroy();
    this.insetGround?.destroy();
    this.insetGround = this.add.image(area.x, area.y, 'inset-ground').setOrigin(0).setScale(1 / z).setDepth(-0.9);
    this.cameras.main.ignore(this.insetGround);
  }

  // The zoom marks are drawn for: the map's camera, or ORION-3's while its picture's own copies
  // are drawn (ILI-1471: marks are a fixed size on screen in both).
  private drawZoom: number | null = null;
  private insetGrid = false;
  private liveCount = 0;
  private get zoom() {
    return this.drawZoom ?? this.cameras.main.zoom;
  }
  private get onMain() {
    return this.drawZoom === null;
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
    if (!this.camCenter || typing() || this.bootAt !== null) return;
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
    cam.setZoom(zoom);
    setCellSize((CELL * zoom) / DPR); // the HUD grows with the squares (ILI-1498)
    // Keep where the camera was, or start centred on ALPHA (ILI-1227).
    const screen = { w: width, h: height };
    const z = cam.zoom; // the fit
    const start = this.camCenter ?? clampCenter({ x: WORLD_W / 2, y: WORLD_H / 2 }, screen, z, cover);
    this.camCenter = this.camCenter ? clampCenter(start, screen, z, cover, PAN) : centreOn(game.get().team.position, area, screen, z, cover, PAN);
    this.camTarget = this.camCenter;
    cam.centerOn(this.camCenter.x, this.camCenter.y);
    bus.emit(EV.camera);
    this.drawTerrain();
    if (this.bootAt === null) this.drawGrid();
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
    // Baked as near the map's zoom as one texture allows, so the map's edges aren't soft (ILI-1483).
    const far = Math.min(Math.max(FAR_SCALE * DPR, this.baseZoom), MAX_TEXTURE / Math.max(COARSE.w, COARSE.h));
    this.farTerrain ??= this.bakeContours('terrain-far', this.farContours, COARSE, far, (0.8 * far) / this.baseZoom).setDepth(-5);
    this.drawWater(s);
    this.drawCity(s);
    // ORION-3's picture has its own crisp bake of its ground (bakeInsetGround).
    this.inset.ignore([this.terrain, this.farTerrain, this.waterImg!, this.cityImg!]);
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
    for (const { river, pts } of waterLines()) {
      g.lineStyle((river ? 2.6 : 1.2) * DPR, WATER, river ? 0.8 : 0.55);
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
  // While the map boots (ILI-1462) the lines draw in across the screen, p from 0 to 1: down from
  // the top and in from the left, each line a little after the one before it.
  private drawGrid(p = 1) {
    const g = this.gridGfx.clear().lineStyle(DPR / this.zoom, TEAL, 0.45);
    const c0 = Math.floor(COARSE.x / CELL);
    const c1 = Math.ceil((COARSE.x + COARSE.w) / CELL);
    const r0 = Math.floor(COARSE.y / CELL);
    const r1 = Math.ceil((COARSE.y + COARSE.h) / CELL);
    if (p >= 1) {
      for (let c = c0; c <= c1; c++) g.lineBetween(c * CELL, r0 * CELL, c * CELL, r1 * CELL);
      for (let r = r0; r <= r1; r++) g.lineBetween(c0 * CELL, r * CELL, c1 * CELL, r * CELL);
      return;
    }
    const cam = this.cameras.main;
    const w = cam.width / cam.zoom;
    const h = cam.height / cam.zoom;
    const x0 = cam.midPoint.x - w / 2;
    const y0 = cam.midPoint.y - h / 2;
    const grow = (i: number, n: number) => Math.max(0, Math.min(1, p * 1.6 - (i / n) * 0.6));
    const cols = [Math.floor(x0 / CELL), Math.ceil((x0 + w) / CELL)];
    const rows = [Math.floor(y0 / CELL), Math.ceil((y0 + h) / CELL)];
    for (let c = cols[0]; c <= cols[1]; c++) {
      const k = grow(c - cols[0], cols[1] - cols[0]);
      if (k > 0) g.lineBetween(c * CELL, y0, c * CELL, y0 + h * k);
    }
    for (let r = rows[0]; r <= rows[1]; r++) {
      const k = grow(r - rows[0], rows[1] - rows[0]);
      if (k > 0) g.lineBetween(x0, r * CELL, x0 + w * k, r * CELL);
    }
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
      g.lineStyle(DPR / this.zoom, TEAL, 0.7).lineBetween(x + CELL - t, y + 4 / this.zoom, x + CELL - 4 / this.zoom, y + 4 / this.zoom);
      g.lineBetween(x + CELL - 4 / this.zoom, y + 4 / this.zoom, x + CELL - 4 / this.zoom, y + t);
    }
    const id = game.get().map.selected;
    const sq = id && parseSquare(id);
    if (!sq) return;
    g.fillStyle(TEAL, 0.12).fillRect(sq.col * CELL, sq.row * CELL, CELL, CELL);
    g.lineStyle(DPR / this.zoom, TEAL, 0.95).strokeRect(sq.col * CELL, sq.row * CELL, CELL, CELL);
  }

  // What's known about every scanned square, on the square itself (ILI-1399): a CLEAR stamp when
  // the scan found nothing; an INTEL tag when it found something (fighters and buildings have
  // their own markers too). Its reports open from the square's menu.
  private drawStamps() {
    const s = game.get();
    const g = this.stampGfx.clear();
    const px = DPR / this.zoom;
    for (const [sq, label] of this.stamps) if (!s.intel.graded.includes(sq)) (label.destroy(), this.stamps.delete(sq));
    for (const [sq, tag] of this.pkgTags) if (!shelfState(s, sq)) (tag.destroy(), this.pkgTags.delete(sq));
    for (const sq of s.intel.graded) {
      const p = parseSquare(sq);
      if (!p) continue;
      const found = squareFindings(s, sq) !== 'clear';
      const x = p.col * CELL + 8 * px;
      const y = (p.row + 1) * CELL - 8 * px;
      const color = found ? '#f2c14e' : '#35d0a5';
      const text = found ? '◆ INTEL' : '✓ CLEAR';
      const label = this.stamps.get(sq) ?? this.add.text(0, 0, '', { fontFamily: 'JetBrains Mono, monospace', fontSize: `${10 * DPR}px`, color }).setOrigin(0, 1);
      if (!this.stamps.has(sq)) {
        this.stamps.set(sq, label);
        this.inset.ignore(label);
      }
      label.setText(text).setColor(color).setScale(1 / this.zoom).setPosition(x + 4 * px, y - 2 * px).setAlpha(found ? 1 : 0.75);
      const w = label.width / this.zoom + 8 * px;
      const h = label.height / this.zoom + 4 * px;
      g.fillStyle(0x0b0f0d, 0.85).fillRect(x, y - h, w, h);
      g.lineStyle(px, found ? TEAM : TEAL, found ? 0.9 : 0.6).strokeRect(x, y - h, w, h);
      this.drawPackage(sq, x + w + 3 * px, y);
    }
    // A package can be on the shelf for a square that isn't settled (a video's, a sighting's).
    for (const sq of new Set(s.intel.pushes.map((p) => p.square ?? ''))) {
      const q = !s.intel.graded.includes(sq) && parseSquare(sq);
      if (q) this.drawPackage(sq, q.col * CELL + 8 * px, (q.row + 1) * CELL - 8 * px);
    }
  }

  // The square's intel package (ILI-1499), a 1 px tag beside its stamp, in plain words (ILI-1509):
  // POSTED while it waits on the shelf for ALPHA, DOWNLOADING while the team pulls it, ✓ RECEIVED
  // once ALPHA has it. Still: no motion.
  private drawPackage(sq: string, x: number, y: number) {
    const state = shelfState(game.get(), sq);
    if (!state) return;
    const px = DPR / this.zoom;
    const g = this.stampGfx;
    const color = state === 'posted' ? '#f2c14e' : '#35d0a5';
    const text = state === 'posted' ? 'POSTED' : state === 'pulling' ? 'DOWNLOADING' : '✓ RECEIVED';
    const tag = this.pkgTags.get(sq) ?? this.add.text(0, 0, '', { fontFamily: 'JetBrains Mono, monospace', fontSize: `${10 * DPR}px`, color }).setOrigin(0, 1);
    if (!this.pkgTags.has(sq)) {
      this.pkgTags.set(sq, tag);
      this.inset.ignore(tag);
    }
    tag.setText(text).setColor(color).setScale(1 / this.zoom).setPosition(x + 4 * px, y - 2 * px);
    const w = tag.width / this.zoom + 8 * px;
    const h = tag.height / this.zoom + 4 * px;
    g.fillStyle(0x0b0f0d, 0.85).fillRect(x, y - h, w, h);
    g.lineStyle(px, state === 'posted' ? TEAM : TEAL, 0.9).strokeRect(x, y - h, w, h);
  }

  // The mission's three points: A infil, B crash site, C exfil. The objective is a marker on the
  // map, not text in a panel (ILI-1392): the point ALPHA is working toward now (the black box,
  // then the exfil) gets a pulsing diamond and says it's the objective.
  private drawMission(time = 0) {
    const { a, b, c, phase } = game.get().mission;
    const g = this.missionGfx.clear();
    const goal = phase === 'exfil' || phase === 'complete' ? 'C' : 'B';
    const points: [string, string, string][] = [['A', a, 'INFIL'], ['B', b, 'BLACK BOX'], ['C', c, 'EXFIL']];
    points.forEach(([letter, sq, name], i) => {
      const p = squareCenter(sq)!;
      const r = (14 * DPR) / this.zoom;
      const now = letter === goal;
      g.lineStyle(DPR / this.zoom, TEAM, 0.9).strokeCircle(p.x, p.y, r);
      if (now) {
        const k = r * (1.9 + 0.25 * Math.sin(time / 350));
        const pts = [new Phaser.Math.Vector2(p.x, p.y - k), new Phaser.Math.Vector2(p.x + k, p.y), new Phaser.Math.Vector2(p.x, p.y + k), new Phaser.Math.Vector2(p.x - k, p.y)];
        g.lineStyle(DPR / this.zoom, TEAM, 0.95).strokePoints(pts, true);
        g.lineStyle(DPR / this.zoom, TEAM, 0.95).strokeCircle(p.x, p.y, r * 0.35);
      }
      if (!this.onMain) return;
      const label = (this.missionLabels[i] ??= this.add
        .text(0, 0, '', { fontFamily: 'JetBrains Mono, monospace', fontSize: `${10 * DPR}px`, color: '#f2c14e' })
        .setOrigin(0.5, 0));
      label.setText(now ? `OBJECTIVE · ${name}` : `${letter} · ${name}`).setScale(1 / this.zoom).setPosition(p.x, p.y + r * (now ? 2.3 : 1.2));
      this.inset.ignore(label);
    });
  }

  // The route's state (ILI-1173): walked legs faint, imaged legs ahead solid, unimaged legs
  // dashed (ALPHA will stop and ask), and a leg into a known contact red.
  private drawRoute() {
    const s = game.get();
    const { route, waypoint, position } = s.team;
    const w = DPR / this.zoom;
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
      const contact = knownIn(s, id).length > 0; // where HQ last saw it (ILI-1493)
      const pts = n === 0 && current ? [position, ...current] : n === 0 ? [position, to] : legPath(route[waypoint + n - 1], id);
      g.lineStyle(w, contact ? EVENT_COLOR.contact : TEAM, contact ? 0.8 : 0.55);
      trail(pts, !contact && !s.map.scanned.includes(id));
      g.lineStyle(w, contact ? EVENT_COLOR.contact : TEAM, 0.8).strokeCircle(to.x, to.y, (3 * DPR) / this.zoom);
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

  private lastTeam = { x: NaN, y: NaN };
  private heading = -Math.PI / 2; // the way the team faces, radians; eased toward its next step

  // ALPHA is five people, not a dot (ILI-1210): one per operator, in a loose wedge facing where the team
  // is headed. Each drifts a little on its own and pings on its own beat, so the team reads as
  // alive. The downed stay in the group, dim and hollow. Reduced motion: still and quiet.
  private pings = new Map<string, { at: number; next: number }>(); // each operator's last ping and next (ILI-1409)

  private drawTeam(time = 0) {
    const st = game.get();
    const { position, path, route, waypoint, operators } = st.team;
    // Those aboard the exfil transport are off the map, one at a time (ILI-1264).
    const gone = st.exfil ? aboard(st.exfil, operators.map((o) => o.id), st.elapsedMs) : [];
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
    // Inside a building, searching (ILI-1418): the team is off the map. With ORION-3 over the
    // square, the building it went into shows as a small outline; the tag stays at the door.
    const inside = searchingIn(st);
    if (inside) {
      const g = this.teamGfx.clear();
      this.dotGfx.clear();
      this.arrowGfx.clear();
      this.opSpots.clear();
      if (lockedOn(st, inside)) {
        const w = 16 * u;
        const h = 11 * u;
        const { x, y } = position;
        g.fillStyle(0x0b0f0d, 0.85).fillRect(x - w / 2, y - h / 2, w, h);
        g.lineStyle(u, 0xb8c4bf, 0.95).strokeRect(x - w / 2, y - h / 2, w, h);
      }
      const tag = `${st.team.callsign} · SEARCHING`;
      if (this.teamLabel.text !== tag) this.teamLabel.setText(tag).setColor('#35d0a5');
      this.teamLabel.setScale(1 / this.zoom).setPosition(position.x + 14 * u, position.y - 18 * u).setVisible(true);
      return;
    }
    const gap = 11 * u;
    const fx = Math.cos(this.heading);
    const fy = Math.sin(this.heading);
    const g = this.teamGfx.clear();
    // The leg to the next waypoint (ILI-1395): from the marker, so the map says where ALPHA is
    // going. Pushing into contact (HQ said attack or push) is a heavy solid line; otherwise it
    // sneaks, a light dashed one.
    const goal = route[waypoint] && squareCenter(route[waypoint]);
    if (goal && !st.exfil) {
      const pushing = ['attack', 'push'].includes(st.team.decisions[route[waypoint]] ?? '');
      const pts = [position, ...(st.team.pathTo === route[waypoint] ? path : []), goal];
      if (pushing) {
        g.lineStyle(u, OPS, 0.9);
        for (let i = 1; i < pts.length; i++) g.lineBetween(pts[i - 1].x, pts[i - 1].y, pts[i].x, pts[i].y);
      } else {
        g.lineStyle(u, OPS, 0.85);
        for (let i = 1; i < pts.length; i++) this.dashed(g, pts[i - 1], pts[i], 7 * u, i);
      }
    }
    this.opSpots.clear();
    const dots = this.dotGfx.clear();
    const arrows = this.arrowGfx.clear();
    // ORION-3 is a special view of the team (ILI-1419): each operator a tiny arrow the way they're
    // heading, sized for the picture's zoom, much smaller than RAVEN-6's.
    const iu = DPR / this.inset.zoom;
    const arrow = (x: number, y: number, down: boolean) => {
      const z = 3.5 * iu;
      // HAMMER-2's shape (ILI-1424): a plain outlined triangle, no notch, no fill.
      const tip = { x: x + fx * z, y: y + fy * z };
      const l = { x: x - fx * z + fy * z * 0.8, y: y - fy * z - fx * z * 0.8 };
      const r = { x: x - fx * z - fy * z * 0.8, y: y - fy * z + fx * z * 0.8 };
      arrows.lineStyle(iu, OPS, down ? 0.45 : 1).strokeTriangle(tip.x, tip.y, l.x, l.y, r.x, r.y);
    };
    operators.forEach((o, i) => {
      if (gone.includes(o.id)) return;
      const [along, across] = WEDGE[i % WEDGE.length];
      const k = i * 1.7 + 0.4; // each one's own rhythm
      const dx = still ? 0 : Math.sin(time / (900 + i * 170) + k) * 0.28 + Math.sin(time / 2300 + k * 2) * 0.18;
      const dy = still ? 0 : Math.cos(time / (1100 + i * 130) + k) * 0.28;
      const a = (along + dx) * gap;
      const c = (across + dy) * gap;
      const x = position.x + fx * a - fy * c;
      const y = position.y + fy * a + fx * c;
      this.opSpots.set(o.id, { x, y });
      const down = o.health <= 0;
      if (!down && !still) {
        let p = this.pings.get(o.id);
        if (!p) this.pings.set(o.id, (p = { at: -Infinity, next: time + nextGap() }));
        if (time >= p.next) (p.at = time), (p.next = time + nextGap());
        const t = (time - p.at) / 900; // 0..1 over the ring's life
        if (t < 1) dots.lineStyle(u, OPS, 0.7 * (1 - t)).strokeCircle(x, y, (3 + 11 * t) * u);
      }
      if (down) dots.lineStyle(u, OPS, 0.45).strokeCircle(x, y, 2.6 * u);
      else dots.lineStyle(u, OPS, 1).strokeCircle(x, y, 3.2 * u);
      arrow(x, y, down);
    });
    // No intel bar floating on the marker any more (cut 11-12, buggy). ALPHA running low still shows
    // as the amber intel-needed tag on the square it needs.
    // Its status tag (ILI-1395): what ALPHA is doing, on the marker itself.
    const status = teamStatus(st);
    const tag = `${st.team.callsign} · ${status.toUpperCase()}`;
    if (this.teamLabel.text !== tag) this.teamLabel.setText(tag).setColor(status === 'In contact' ? '#e5484d' : '#35d0a5');
    if (moved || this.teamLabel.scale !== 1 / this.zoom) this.teamLabel.setScale(1 / this.zoom).setPosition(position.x + 16 * u, position.y - 22 * u);
    this.teamLabel.setVisible(gone.length < operators.length); // all aboard: ALPHA is off the map
  }

  // A finger (or the mouse) down on the map: it may become a drag, and only a release without
  // one is a tap. A second finger is ignored (no pinch, ILI-1484).
  private drag: { id: number; x: number; y: number; from: { x: number; y: number }; moved: boolean } | null = null;
  private onDown(p: Phaser.Input.Pointer) {
    this.track(p);
    if (game.get().phase !== 'running' || this.bootAt !== null) return;
    if (this.fingers().length > 1) {
      // A second finger: the first finger's touch is no longer a tap, and nothing zooms.
      if (this.drag) this.drag.moved = true;
      return;
    }
    if (this.camCenter) this.drag = { id: p.id, x: p.x, y: p.y, from: { ...this.camCenter }, moved: false };
  }

  private onMove(p: Phaser.Input.Pointer) {
    this.track(p);
    // A mouse over a ping names it (ILI-1297); touch gets the card on a tap instead.
    if (!p.wasTouch && !p.isDown) {
      const thing = this.sightingAt(p.worldX, p.worldY);
      pins.hover(thing?.id ?? null, 'map');
      this.hovered = thing ? null : (this.eventAt(p.worldX, p.worldY)?.id ?? null);
      this.input.manager.canvas.style.cursor = thing || this.hovered ? 'pointer' : '';
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
    const drag = this.drag;
    this.drag = null;
    if (!drag || drag.id !== p.id || drag.moved || game.get().phase !== 'running' || game.get().minigame?.kind === 'signal') return;
    // Nothing pins on the main map (ILI-1443): that's ORION-3's picture's job. A click here falls
    // through to the event or the square (which sends ORION-3).
    // A ping targets the ping (ILI-1489): its square's panel opens on that item, with its actions,
    // and a click on it never falls through to the square (which would pick the square instead, or
    // close its open panel).
    const ping = this.pingAt(p.worldX, p.worldY);
    if (ping) {
      game.openEvent(ping.id);
      if (!lockedOn(game.get(), ping.square)) game.lookAt(ping.square); // its actions run with ORION-3 on it (ILI-1397)
      return;
    }
    // A square: picked, and if ORION-3 isn't over it, ORION-3 goes (ILI-1437); its menu opens on
    // the lock.
    const id = squareAt(p.worldX, p.worldY);
    if (!id) return;
    game.selectSquare(id);
    if (game.get().map.selected === id && !lockedOn(game.get(), id)) game.lookAt(id);
  }

  private fingers() {
    return this.input.manager.pointers.filter((q) => q.isDown);
  }

  // Put the camera's centre somewhere by hand (a drag): within two squares of the
  // AO, and it stops following ALPHA until recentred.
  private moveCamera(c: { x: number; y: number }) {
    const { width, height } = this.scale;
    const cam = this.cameras.main;
    this.camCenter = this.camTarget = clampCenter(c, { w: width, h: height }, cam.zoom, this.cover(getMapRect(), height), PAN);
    cam.centerOn(this.camCenter.x, this.camCenter.y);
    if (!this.panned) bus.emit(EV.panned, (this.panned = true));
    bus.emit(EV.camera);
  }

  private fitZoom = 1;

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

