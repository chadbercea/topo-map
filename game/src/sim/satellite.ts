import { parseSquare, type SquareId } from '../map/grid';
import type { Message } from './comms';
import { reveal } from './contacts';
import { awarenessOf, record, snapshot, type Awareness, type CaptureMode } from './imagery';
import { gameSpan } from './gameTime';

export type { CaptureMode };
import type { GameState } from './state';
import type { System } from './systems';

// ORION-3 (ILI-1167). HQ tasks the satellite to a square; it takes time to swing over,
// in proportion to how far it has to move, so where to look is the decision. On station,
// HQ picks how to look: a photo (where they are now), a burst (who is moving, and where
// to) or video (live, and the satellite is tied up while it runs). What it sees goes on
// the map as a snapshot that ages, and down to ALPHA as known ground.

export const CAPTURE: Record<CaptureMode, { ms: number; label: string; what: string }> = {
  photo: { ms: 0, label: 'Photo', what: 'Who is there and where, right now' },
  burst: { ms: 6_000, label: 'Burst', what: 'Plus who is moving, and where to' },
  video: { ms: 15_000, label: 'Video', what: 'Live: they move on your map while it runs' },
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
  return Math.round((SETTLE_MS + d * SLEW_MS_PER_SQUARE) / 100) * 100;
}

export const satelliteBusy = (s: GameState) => s.satellite.state === 'capturing';

// The square the card is on (ILI-1201, ILI-1203): the one HQ picked (or whose event it
// opened), else the one ORION-3 is working, else its last look until HQ closes it. Nothing
// while a mini game is up.
// The square ORION-3's panel shows (ILI-1219): where it's tasked; idle, the square HQ picked
// (ILI-1228) or just looked at. Nothing when none is (the placeholder, ILI-1229), or while the
// intercept has it tied up; the sniper's run while it shoots (ILI-1253).
export function orionSquare(s: GameState): SquareId | null {
  const sat = s.satellite;
  if (s.minigame) return null;
  if (s.sniper && !s.sniper.done) return s.sniper.square; // it plays out in its picture (ILI-1253)
  if (sat.state !== 'idle') return sat.aim;
  return s.map.selected ?? sat.result?.square ?? null;
}

export function lookSquare(s: GameState): SquareId | null {
  const sat = s.satellite;
  if (s.minigame) return null;
  if (s.sniper && !s.sniper.done) return s.sniper.square; // it plays out in its picture (ILI-1253)
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
  };
  const next: GameState = {
    ...s,
    satellite: sat,
    map: { ...s.map, selected: null },
    team: callId ? { ...s.team, holdFor: callId, activity: 'Waiting on the look' } : s.team,
  };
  return log(next, radio(s, 'ORION-3', `slew-${s.elapsedMs}`, ms ? `Moving to ${square}. On station in ${gameSpan(ms)}.` : `On station over ${square}. Ready to shoot.`));
}

// On station: take the picture.
export function capture(s: GameState, mode: CaptureMode): GameState {
  if (s.satellite.state !== 'onStation') return s;
  const sat = { ...s.satellite, state: 'capturing' as const, mode, captureUntilMs: s.elapsedMs + CAPTURE[mode].ms };
  const next = { ...s, satellite: sat };
  return mode === 'photo' ? finishLook(next) : next;
}

// Call it off: the satellite stays where it is, and ALPHA moves on without imagery.
export function cancelLook(s: GameState): GameState {
  const sat = s.satellite;
  if (sat.state === 'idle') return s;
  const here = satellitePoint(sat, s.elapsedMs);
  const next: GameState = {
    ...s,
    satellite: { ...sat, state: 'idle', from: here, mode: null, callId: null },
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
  next = reveal({ ...next, map: { ...next.map, scanned: [...new Set([...next.map.scanned, square])] } }, [square], 'ORION-3');
  const fighters = snap.seen.reduce((n, x) => n + x.units.length, 0);
  const moving = snap.seen.filter((x) => x.to).reduce((n, x) => n + x.units.length, 0);
  const contacts = snap.seen.map((x) => s.contacts.find((c) => c.id === x.contactId)!);
  const awareness = contacts.length ? awarenessOf(s, contacts[0]) : null;
  const result: LookResult = { square, mode, fighters, moving, awareness };
  next = {
    ...next,
    satellite: { ...sat, state: 'idle', from: at(square), mode: null, callId: null, result },
    team: sat.callId && next.team.holdFor === sat.callId ? { ...next.team, holdFor: null } : next.team,
  };
  next = log(next, radio(s, 'ORION-3', `look-${s.elapsedMs}`, `${square} imaged (${CAPTURE[mode].label.toLowerCase()}): ${describe(result)}. Downlinked to ${s.team.callsign}.`));
  return sat.callId ? log(next, radio(s, s.team.callsign, `look-${s.elapsedMs}-team`, 'Imagery received.')) : next;
}

export function describe(r: LookResult): string {
  if (!r.fighters) return 'nothing there';
  const moving = r.moving ? `, ${r.moving} moving` : '';
  return `${r.fighters} fighter${r.fighters === 1 ? '' : 's'}${moving}${r.awareness ? `, ${r.awareness}` : ''}`;
}

export const satelliteSystem: System = (s) => {
  const sat = s.satellite;
  if (sat.state === 'slewing' && s.elapsedMs >= sat.arriveMs)
    // It says what's next (ILI-1257): the shot is HQ's to take.
    return log({ ...s, satellite: { ...sat, state: 'onStation' } }, radio(s, 'ORION-3', `station-${s.elapsedMs}`, `On station over ${sat.aim}. Ready to shoot.`));
  if (sat.state !== 'capturing') return s;
  if (s.elapsedMs >= sat.captureUntilMs) return finishLook(s);
  // Video is live: the map follows them while it runs.
  return sat.mode === 'video' ? record(s, snapshot(s, sat.aim, 'video', true)) : s;
};

// One line for the mission bar.
export function satelliteStatus(s: GameState): string {
  const sat = s.satellite;
  const secs = gameSpan;
  switch (sat.state) {
    case 'idle':
      return `ORION-3 over ${sat.aim}`;
    case 'slewing':
      return `ORION-3 to ${sat.aim} · ${secs(sat.arriveMs - s.elapsedMs)}`;
    case 'onStation':
      return `ORION-3 on station ${sat.aim}`;
    case 'capturing':
      return `ORION-3 ${sat.mode} ${sat.aim} · ${secs(sat.captureUntilMs - s.elapsedMs)}`;
  }
}
