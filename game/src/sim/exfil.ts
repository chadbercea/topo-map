import { CELL, parseSquare, squareCenter, type SquareId } from '../map/grid';
import type { Message } from './comms';
import type { GameState } from './state';

// The exfil (ILI-1264), played out instead of an instant end. Once ALPHA is in the exfil square
// with the black box and the square is clear, the transport's pilot confirms on the radio and
// RAVEN-6 flies in on a countdown. It comes into the square to the marker and waits; when ALPHA
// is at the marker the five board one at a time, it lifts out of the square, the panel calls
// the extraction good, and the After Action Report follows. The contract clock stops at the call.

export const TRANSPORT = { callsign: 'RAVEN-6', label: 'exfil' } as const;
export const EXFIL_FLIGHT_MS = 10_000; // the call to the square's edge
export const ENTER_MS = 2_500; // the edge to the marker
export const BOARD_MS = 900; // one operator aboard
export const LEAVE_MS = 2_500; // the marker out of the square
export const SIGNOFF_MS = 3_000; // "Successful extraction" before the report

export type ExfilRun = {
  square: SquareId;
  calledMs: number;
  arriveMs: number; // at the square's edge
  boardMs: number | null; // boarding starts (ALPHA at the marker, with the bird down)
  liftMs: number | null; // the last one aboard; it lifts
};
export type ExfilStage = 'enroute' | 'landing' | 'waiting' | 'boarding' | 'leaving' | 'done';

export const landedMs = (r: ExfilRun) => r.arriveMs + ENTER_MS;
export const outMs = (r: ExfilRun) => (r.liftMs === null ? null : r.liftMs + LEAVE_MS);

export function exfilStage(r: ExfilRun, now: number): ExfilStage {
  if (now < r.arriveMs) return 'enroute';
  if (now < landedMs(r)) return 'landing';
  if (r.boardMs === null) return 'waiting';
  if (r.liftMs === null || now < r.liftMs) return 'boarding';
  return now < outMs(r)! ? 'leaving' : 'done';
}

// Who's aboard now, in boarding order: one every BOARD_MS from the start.
export function aboard(r: ExfilRun, ids: string[], now: number): string[] {
  if (r.boardMs === null) return [];
  return ids.slice(0, Math.max(0, Math.min(ids.length, Math.floor((now - r.boardMs) / BOARD_MS))));
}

// Where the transport is, and which way it faces: in from the square's west edge to the marker,
// down there, then out over the east edge. Null before it reaches the square and after it's gone.
export function transportAt(r: ExfilRun, now: number): { x: number; y: number; east: boolean; down: boolean } | null {
  const sq = parseSquare(r.square)!;
  const mid = squareCenter(r.square)!;
  const west = sq.col * CELL;
  if (now < r.arriveMs) return null;
  if (now < landedMs(r)) {
    const t = (now - r.arriveMs) / ENTER_MS;
    return { x: west + (mid.x - west) * t, y: mid.y, east: true, down: false };
  }
  if (r.liftMs === null || now < r.liftMs) return { ...mid, east: true, down: true };
  const t = (now - r.liftMs) / LEAVE_MS;
  return t < 1 ? { x: mid.x + (west + CELL - mid.x) * t, y: mid.y, east: true, down: false } : null;
}

// Anyone still in the square: the transport won't come in while there is.
export const squareClear = (s: GameState, sq: SquareId) => !s.contacts.some((c) => c.square === sq && (c.status === 'hidden' || c.status === 'revealed') && c.units.length > 0);

const say = (s: GameState, id: string, from: string, text: string): GameState => {
  const m: Message = { id, from, text, atMs: s.elapsedMs, status: 'new', holds: false };
  return { ...s, comms: { ...s.comms, messages: [...s.comms.messages, m] } };
};

export function callExfil(s: GameState): GameState {
  const c = s.mission.c;
  const next: GameState = {
    ...s,
    exfil: { square: c, calledMs: s.elapsedMs, arriveMs: s.elapsedMs + EXFIL_FLIGHT_MS, boardMs: null, liftMs: null },
    team: { ...s.team, activity: `Exfil at ${c}: ${TRANSPORT.callsign} inbound` },
  };
  return say(next, 'exfil-called', TRANSPORT.callsign, `${s.team.callsign}, ${TRANSPORT.callsign}. ${c} is clear, we're inbound for your exfil. Ten seconds out.`);
}

// One tick of the sequence, from the call on.
export function flyExfil(s: GameState): GameState {
  const r = s.exfil!;
  const now = s.elapsedMs;
  const { team } = s;
  const atMarker = team.waypoint >= team.route.length && !team.fight;
  if (r.boardMs === null) {
    if (now < landedMs(r) || !atMarker) return s;
    const ids = team.operators.map((o) => o.id);
    const next = { ...s, exfil: { ...r, boardMs: now, liftMs: now + ids.length * BOARD_MS }, team: { ...team, activity: `Boarding ${TRANSPORT.callsign}` } };
    return say(next, 'exfil-down', TRANSPORT.callsign, `On the ground at ${r.square}. Get aboard.`);
  }
  if (r.liftMs !== null && now >= r.liftMs && !s.comms.messages.some((m) => m.id === 'exfil')) {
    return say({ ...s, team: { ...team, activity: `Aboard ${TRANSPORT.callsign}` } }, 'exfil', team.callsign, `All aboard. ${TRANSPORT.callsign} lifting from ${r.square}. We're out.`);
  }
  if (outMs(r) !== null && now >= outMs(r)! + SIGNOFF_MS) return { ...s, phase: 'ended', mission: { ...s.mission, phase: 'complete' } };
  return s;
}
