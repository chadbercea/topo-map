import { useSyncExternalStore } from 'react';
import { game } from '../sim/store';
import { opening } from './ledger';
import { pins } from './pins';

// The way into the war room (ILI-1280). Castle House's title screen comes first (ILI-1290):
// START, ABOUT, SETTINGS over the blurred globe. START brings ORION-3 into focus, and the
// terminal idles until HQ picks it (ILI-1283); a wipe (ILI-1284) opens on the login. Then the
// system boots for the first time (ILI-1462): the map loads and the camera settles, the grid
// draws, what's known pops in (the team, the objective, the exfil), a beat with just the map, and
// then the panels, one at a time, each working as it lands. Only once everything is in does the
// clock start. A restart replays the whole map boot, without the login. No briefing: nothing on
// the way in says what the mission is.

export type Stage = 'title' | 'idle' | 'wipe' | 'login' | 'map' | 'panels' | 'live'; // no SATCOM link step (ILI-1433)

export const WIPE_MS = 520;
// The satellite's line carries its name on this mission (ILI-1401): SATELLITE is swapped for it.
export const LOGIN_LINES = [
  ['CASTLE HOUSE // SECURE SUPPORT TERMINAL', ''],
  ['OPERATOR AUTH', 'VERIFIED'],
  ['SATELLITE UPLINK', 'ACQUIRED'],
  ['SATCOM RELAY-7', 'ONLINE'],
  ['ORDNANCE NET', 'ONLINE'],
  ['WAR ROOM', 'ONLINE'],
] as const;
export const LINE_MS = 230;
const LOGIN_MS = LOGIN_LINES.length * LINE_MS + 450;
// The map boot (ILI-1462), in ms from its start; MapScene plays it. The camera settles as the
// ground fades up, the grid draws, the known marks pop in one group after another, then a beat.
export const MAP_BOOT = { settle: 1_300, grid: 1_100, team: 0, mission: 250, known: 500, pop: 900, beat: 1_500 } as const;
export const MAP_MS = MAP_BOOT.settle + MAP_BOOT.grid + MAP_BOOT.pop + MAP_BOOT.beat;
// Then the panels, panel by panel and line by line (ILI-1307): about 7 s, never all at once.
const PANELS_MS = 7_000; // styles.css, .hud[data-boot='first']
// The login only on the way in: a restart's map boot has no login to fade out of.
let loggedIn = false;
export const fromLogin = () => loggedIn;

// Under test automation the HUD opens live, as it always has, unless the URL asks for the intro.
const automated = typeof navigator !== 'undefined' && navigator.webdriver === true;
const asked = typeof location !== 'undefined' && new URLSearchParams(location.search).has('intro');
export const introOn = !automated || asked;

let stage: Stage = 'live';
const listeners = new Set<() => void>();
const set = (s: Stage) => {
  stage = s;
  listeners.forEach((l) => l());
};
let timers: ReturnType<typeof setTimeout>[] = [];
const run = (steps: [Stage, number][]) => {
  timers.forEach(clearTimeout);
  let at = 0;
  timers = steps.map(([s, ms]) => {
    const t = setTimeout(() => {
      set(s);
      if (s === 'live') game.go();
    }, at);
    at += ms;
    return t;
  });
};

export const intro = {
  get: () => stage,
  subscribe(l: () => void) {
    listeners.add(l);
    return () => void listeners.delete(l);
  },
  // Page load: the title screen, the clock held.
  idle() {
    if (!introOn) return;
    game.standby();
    set('title');
  },
  // START: ORION-3 comes into focus to be picked; with Skip intro on, straight into the boot.
  start() {
    if (stage !== 'title') return;
    if (game.get().settings.skipIntro) intro.engage();
    else set('idle');
  },
  // HQ picks ORION-3: wipe, login, the map boot, the panels, go.
  engage() {
    if (stage !== 'idle' && stage !== 'title') return;
    loggedIn = true;
    run([['wipe', WIPE_MS], ['login', LOGIN_MS], ['map', MAP_MS], ['panels', PANELS_MS], ['live', 0]]);
  },
  // Restart, Retry, Play again: the mission over, and the whole map boot again, without the login.
  reboot() {
    (pins.clear(), game.restart(...opening()));
    if (!introOn) return;
    game.standby();
    loggedIn = false;
    run([['map', MAP_MS], ['panels', PANELS_MS], ['live', 0]]);
  },
  // Exit, from the pause menu: the mission over, back to the title screen.
  home() {
    timers.forEach(clearTimeout);
    (pins.clear(), game.restart(...opening()));
    game.standby();
    set('title');
  },
};

export const useIntro = () => useSyncExternalStore(intro.subscribe, intro.get);
