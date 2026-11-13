import { GRADE_LABEL, holdScan, pushVideo, settled } from './intel';
import { hearTraffic, heardTraffic } from './enemy';
import { maybeBuilding } from './buildings';
import { slewFactor } from './upgrades';
import { parseSquare, squareId, type SquareId } from '../map/grid';
import type { Message } from './comms';
import { reveal } from './contacts';
import { awarenessOf, record, snapshot, type Awareness, type CaptureMode } from './imagery';
import { countdown, gameSpan } from './gameTime';

export type { CaptureMode };
import type { GameState } from './state';
import type { System } from './systems';

// ORION-3 (ILI-1167). HQ tasks the satellite to a square; it takes time to swing over,
// in proportion to how far it has to move, so where to look is the decision. On station,
// HQ picks how to look: a photo (where they are now) or video (live, who is moving and where
// to, and the satellite is tied up while it runs; once a session, ILI-1314). What it sees goes on
// the map as a snapshot that ages, and down to ALPHA as known ground.

export const CAPTURE: Record<CaptureMode, { ms: number; label: string; what: string }> = {
  photo: { ms: 0, label: 'Photo', what: 'Who is there and where, right now' },
  video: { ms: 15_000, label: 'Video', what: 'Live: who is moving and where to. Once: a permanent intel feed to ALPHA' },
};

export const SLEW_MS_PER_SQUARE = 2_000;
export const SETTLE_MS = 2_000;

export type Point = { col: number; row: number };
export type SatelliteState = 'idle' | 'slewing' | 'onStation' | 'capturing';
export type LookResult = { square: SquareId; mode: CaptureMode; fighters: number; moving: number; awareness: Awareness | null };

export type Satellite = {
  state: SatelliteState;
  from: Point; // where it was looking when tasked
  aim: SquareId; // where it's looking, or swinging to
  startMs: number;
  arriveMs: number;
  mode: CaptureMode | null;
  captureUntilMs: number;
  callId: string | null; // ALPHA's call waiting on this look
  result: LookResult | null; // the last look, for the panel until closed
  watching?: SquareId | null; // a look was taken here: its picture stays live while ORION-3 stays over (ILI-1423, ILI-1430)
};

const at = (sq: SquareId): Point => parseSquare(sq)!;

export const initialSatellite = (over: SquareId): Satellite => ({
  state: 'idle',
  from: at(over),
  aim: over,
  startMs: 0,
  arriveMs: 0,
  mode: null,
  captureUntilMs: 0,
  callId: null,
  result: null,
});

// Where the satellite is looking now, in squares (fractional while it swings).
export function satellitePoint(sat: Satellite, now: number): Point {
  const to = at(sat.aim);
  if (sat.state !== 'slewing' || sat.arriveMs <= sat.startMs) return to;
  const t = Math.min(1, (now - sat.startMs) / (sat.arriveMs - sat.startMs));
  return { col: sat.from.col + (to.col - sat.from.col) * t, row: sat.from.row + (to.row - sat.from.row) * t };
}

// How long it takes to get on station over a square from where it's looking now.
export function slewMs(s: GameState, square: SquareId): number {
  const p = satellitePoint(s.satellite, s.elapsedMs);
  const to = at(square);
  const d = Math.hypot(to.col - p.col, to.row - p.row);
  if (d < 0.01) return 0;
  return Math.round(((SETTLE_MS + d * SLEW_MS_PER_SQUARE) * slewFactor(s)) / 100) * 100; // more satellites, faster revisits (ILI-1317)
}

// Capturing, or listening in on enemy traffic (ILI-1394): that's what pulls it off scanning for ALPHA.
// The satellite's name on this mission (ILI-1401): from the mission's config, never hardcoded.
export const satName = (s: GameState) => s.mission.satellite;

export const satelliteBusy = (s: GameState) => s.satellite.state === 'capturing' || (s.minigame?.status === 'active' && s.minigame.via === 'satellite');

// The satellite is the player's avatar (ILI-1397): nothing runs on a square it isn't locked on.
// Locked means it's over the square and not on its way somewhere: tapping any other square
// offers the move first.
export const lockedOn = (s: GameState, square: SquareId): boolean => s.satellite.state !== 'slewing' && s.satellite.aim === square && slewMs(s, square) === 0;

// The square the card is on (ILI-1201, ILI-1203): the one HQ picked (or whose event it
// opened), else the one ORION-3 is working, else its last look until HQ closes it. Nothing
// while a mini game is up.
// The square ORION-3's panel shows (ILI-1219): where it's tasked; idle, the square HQ picked
// (ILI-1228, ILI-1308) or just looked at. Nothing when none is (the placeholder, ILI-1229), or while the
// intercept has it tied up. The sniper's run plays out at its square's anchor (ILI-1303).
// It can only see what it's over (ILI-1428): picking another square never moves the picture;
// only moving ORION-3 does.
export function orionSquare(s: GameState): SquareId | null {
  if (s.minigame) return null;
  return s.satellite.aim;
}

export function lookSquare(s: GameState): SquareId | null {
  const sat = s.satellite;
  if (s.minigame) return null;
  if (s.map.selected) return s.map.selected;
  if (sat.state !== 'idle') return sat.aim;
  return sat.result?.square ?? null;
}

const radio = (s: GameState, from: string, id: string, text: string, status: Message['status'] = 'read'): Message => ({
  id,
  from,
  text,
  atMs: s.elapsedMs,
  status,
  holds: false,
});

const log = (s: GameState, m: Message): GameState => ({ ...s, comms: { ...s.comms, messages: [...s.comms.messages, m] } });

// Task ORION-3 to a square. ALPHA's call (if it asked) waits on the look.
export function lookAt(s: GameState, square: SquareId, callId?: string): GameState {
  if (satelliteBusy(s) || !parseSquare(square)) return s;
  const ms = slewMs(s, square);
  const sat: Satellite = {
    ...s.satellite,
    state: ms === 0 ? 'onStation' : 'slewing',
    from: satellitePoint(s.satellite, s.elapsedMs),
    aim: square,
    startMs: s.elapsedMs,
    arriveMs: s.elapsedMs + ms,
    mode: null,
    callId: callId ?? null,
    result: null,
    watching: null, // and ends any live feed (ILI-1423)
  };
  // Leaving a square it was watching live (ILI-1423): that picture stops being live and ages
  // from now like any other look.
  const was = s.satellite.watching;
  const left = was && was !== square && s.imagery[was]?.live && !(s.intel.live ?? []).includes(was) ? { ...s.imagery, [was]: { ...s.imagery[was]!, live: false, atMs: s.elapsedMs } } : s.imagery;
  const next: GameState = {
    ...s,
    imagery: left,
    satellite: sat, // the picked square stays picked: its anchor shows ORION-3 on its way (ILI-1302)
    team: callId ? { ...s.team, holdFor: callId, activity: 'Waiting on the look' } : s.team,
  };
  return log(next, radio(s, satName(s), `slew-${s.elapsedMs}`, ms ? `Slewing to ${square}. On station in ${countdown(ms)}.` : `On station over ${square}. Ready for collection.`));
}

// Scan a square (ILI-1367), from its square menu: the photo, now. Only once ORION-3 is locked on
// (ILI-1397): it never moves the satellite by itself, the move is its own visible step.
export function scan(s: GameState): GameState {
  return s.satellite.state === 'onStation' ? capture(s, 'photo') : s;
}

// On station: take the picture.
export function capture(s: GameState, mode: CaptureMode): GameState {
  // On station, or idle and still locked on (ILI-1432: Photo and Video come after the Scan).
  const sat0 = s.satellite;
  const ready = sat0.state === 'onStation' || (sat0.state === 'idle' && lockedOn(s, sat0.aim));
  if (!ready || (mode === 'video' && (!settled(s, sat0.aim) || (s.intel.live ?? []).includes(sat0.aim)))) return s;
  const sat = { ...s.satellite, state: 'capturing' as const, mode, captureUntilMs: s.elapsedMs + CAPTURE[mode].ms };
  const next = { ...s, satellite: sat };
  return mode === 'photo' ? finishLook(next) : next;
}

// Call it off: the satellite stops over the square it's crossing (ILI-1397: it's locked there,
// not on where it was going), and ALPHA moves on without imagery.
export function cancelLook(s: GameState): GameState {
  const sat = s.satellite;
  if (sat.state === 'idle') return s;
  const p = satellitePoint(sat, s.elapsedMs);
  const here = { col: Math.round(p.col), row: Math.round(p.row) };
  const next: GameState = {
    ...s,
    satellite: { ...sat, state: 'idle', from: here, aim: squareId(here.col, here.row), mode: null, callId: null },
    team: sat.callId && s.team.holdFor === sat.callId ? { ...s.team, holdFor: null } : s.team,
  };
  return sat.callId ? log(next, radio(s, s.team.callsign, `look-cancel-${s.elapsedMs}`, 'No imagery. Moving anyway.')) : next;
}

export const closeLook = (s: GameState) => (s.satellite.result ? { ...s, satellite: { ...s.satellite, result: null } } : s);

function finishLook(s: GameState): GameState {
  const sat = s.satellite;
  const mode = sat.mode!;
  const square = sat.aim;
  const snap = snapshot(s, square, mode, false);
  let next = record(s, snap);
  next = reveal({ ...next, map: { ...next.map, scanned: [...new Set([...next.map.scanned, square])] } }, [square], satName(s));
  const fighters = snap.seen.reduce((n, x) => n + x.units.length, 0);
  const moving = snap.seen.filter((x) => x.to).reduce((n, x) => n + x.units.length, 0);
  const contacts = snap.seen.map((x) => s.contacts.find((c) => c.id === x.contactId)!);
  const awareness = contacts.length ? awarenessOf(s, contacts[0]) : null;
  const result: LookResult = { square, mode, fighters, moving, awareness };
  next = {
    ...next,
    satellite: { ...sat, state: 'idle', from: at(square), mode: null, callId: null, result, watching: square }, // it keeps watching what it's over (ILI-1430)
    team: sat.callId && next.team.holdFor === sat.callId ? { ...next.team, holdFor: null } : next.team,
  };
  // To the analysts, and what it was worth to ALPHA (ILI-1314): a photo's grade feeds its
  // gauge for ten seconds; video, once, is a permanent feed.
  let pushed: string;
  if (mode === 'video') {
    next = pushVideo(next);
    if (heardTraffic(next.intel.pushes.at(-1)?.items)) next = hearTraffic(next, square);
    pushed = `Analysts: live feed to ${s.team.callsign} for the rest of the op`;
  } else {
    if (!fighters) next = maybeBuilding(next, square); // the hunt: empty ground can turn up a building (ILI-1316)
    // A scan (ILI-1432): the analysts hold its intel until HQ sends it to ALPHA with Photo.
    const p = holdScan(next, square, fighters);
    next = p.next;
    // Their radio traffic is one of a scan's rewards (ILI-1359): a SIGINT report that heard something.
    if (heardTraffic(next.intel.pushes.at(-1)?.items)) next = hearTraffic(next, square);
    pushed = `Analysts: ${GRADE_LABEL[p.grade]}, ready for ${s.team.callsign} on Photo`;
  }
  next = log(next, radio(s, satName(s), `look-${s.elapsedMs}`, `${square} collection complete (${CAPTURE[mode].label.toLowerCase()}): ${describe(result)}. ${pushed}.`));
  return sat.callId ? log(next, radio(s, s.team.callsign, `look-${s.elapsedMs}-team`, 'Imagery received.')) : next;
}

export function describe(r: LookResult): string {
  if (!r.fighters) return 'nothing there';
  const moving = r.moving ? `, ${r.moving} moving` : '';
  return `${r.fighters} fighter${r.fighters === 1 ? '' : 's'}${moving}${r.awareness ? `, ${r.awareness}` : ''}`;
}

export const satelliteSystem: System = (s) => {
  const sat = s.satellite;
  if (sat.state === 'slewing' && s.elapsedMs >= sat.arriveMs) {
    // It says what's next (ILI-1257): the shot is HQ's to take, always by hand (ILI-1451).
    return log({ ...s, satellite: { ...sat, state: 'onStation' } }, radio(s, satName(s), `station-${s.elapsedMs}`, `On station over ${sat.aim}. Ready for collection.`));
  }
  // Video is real time (ILI-1423): once it's run on a square, the picture stays live for as long
  // as ORION-3 stays over it. No rescan.
  // The square ORION-3 is over is the one live square on the map (ILI-1430): once it's looked
  // there, it follows what moves for as long as it stays.
  // Video squares are live for good (ILI-1432), wherever ORION-3 is.
  let next = s;
  for (const sq of s.intel.live ?? []) next = record(next, snapshot(next, sq, 'video', true));
  if (sat.state !== 'capturing') return sat.watching && sat.watching === sat.aim && sat.state !== 'slewing' && !(s.intel.live ?? []).includes(sat.aim) ? record(next, snapshot(next, sat.aim, next.imagery[sat.aim]?.mode === 'video' ? 'video' : 'photo', true)) : next;
  if (s.elapsedMs >= sat.captureUntilMs) return finishLook(next);
  // Video is live: the map follows them while it runs.
  return sat.mode === 'video' ? record(next, snapshot(next, sat.aim, 'video', true)) : next;
};

// One line for the mission bar.
export function satelliteStatus(s: GameState): string {
  const sat = s.satellite;
  const secs = gameSpan;
  switch (sat.state) {
    case 'idle':
      return `${satName(s)} over ${sat.aim}`;
    case 'slewing':
      return `${satName(s)} to ${sat.aim} · ${countdown(sat.arriveMs - s.elapsedMs)}`;
    case 'onStation':
      return `${satName(s)} on station ${sat.aim}`;
    case 'capturing':
      return `${satName(s)} ${sat.mode} ${sat.aim} · ${secs(sat.captureUntilMs - s.elapsedMs)}`;
  }
}
