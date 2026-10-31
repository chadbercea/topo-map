import { useSyncExternalStore } from 'react';
import { game } from '../sim/store';

// The way into the war room (ILI-1280). Castle House's title screen comes first (ILI-1290):
// START, ABOUT, SETTINGS over the blurred globe. START brings ORION-3 into focus, and the
// terminal idles until HQ picks it (ILI-1283); a wipe (ILI-1284) opens on the login, the panels power on, ORION-3 links with
// ALPHA, and only then does the clock start, with ALPHA's first call (ILI-1282). A restart
// replays the short half: panels, link, go (ILI-1285). No briefing: nothing on the way in says
// what the mission is.

export type Stage = 'title' | 'idle' | 'wipe' | 'login' | 'panels' | 'link' | 'live';

export const WIPE_MS = 520;
export const LOGIN_LINES = [
  ['CASTLE HOUSE // SECURE SUPPORT TERMINAL', ''],
  ['OPERATOR AUTH', 'VERIFIED'],
  ['ORION-3 UPLINK', 'ACQUIRED'],
  ['SATCOM RELAY-7', 'ONLINE'],
  ['ORDNANCE NET', 'ONLINE'],
  ['WAR ROOM', 'ONLINE'],
] as const;
export const LINE_MS = 230;
const LOGIN_MS = LOGIN_LINES.length * LINE_MS + 450;
const PANELS_MS = 1_800; // the last panel's rows are in (styles.css, power-on)
const LINK_MS = 1_100;

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
  // HQ picks ORION-3: wipe, login, panels, link, go.
  engage() {
    if (stage !== 'idle' && stage !== 'title') return;
    run([['wipe', WIPE_MS], ['login', LOGIN_MS], ['panels', PANELS_MS], ['link', LINK_MS], ['live', 0]]);
  },
  // Restart, Retry, Play again: the mission over, and the war room powers back on.
  reboot() {
    game.restart();
    if (!introOn) return;
    game.standby();
    run([['panels', PANELS_MS], ['link', LINK_MS], ['live', 0]]);
  },
  // Exit, from the pause menu: the mission over, back to the title screen.
  home() {
    timers.forEach(clearTimeout);
    game.restart();
    game.standby();
    set('title');
  },
};

export const useIntro = () => useSyncExternalStore(intro.subscribe, intro.get);
