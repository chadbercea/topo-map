import { CELL, parseSquare, type SquareId } from '../map/grid';
import type { Message } from './comms';
import type { GameState } from './state';
import type { System } from './systems';
import { BOARD } from './minigame';
import { confirmKills, eyesOn, groupOrigin, unitSpot } from './imagery';
import { makeNoise, NOISE } from './noise';
import { spendWeapon, weaponBlocked } from './ordnance';
import { CASH_PER_STRIKE_KILL, earn, markSite } from './sites';

// Air strikes: no mini game and no aiming. HQ picks the target and watches.
// - The drone (ILI-1252), REAPER-1, flies to the square on a countdown, then crosses it once,
//   west to east, and takes out every fighter in it, nearest first as it passes. One use.
// - The helicopter gun run (ILI-1254), HAMMER-2, comes in quicker and strafes up to three rows,
//   each a row where HQ can see fighters, turning back for each pass. Everyone in a row it
//   strafes goes down. It needs eyes on the target, and goes on cooldown after.
// Kills HQ has eyes on are confirmed and pay; the rest are found later. Both are loud.

export type AirWeapon = 'drone' | 'heli';
export const AIR = {
  drone: { callsign: 'REAPER-1', label: 'drone strike', flightMs: 10_000 },
  heli: { callsign: 'HAMMER-2', label: 'gun run', flightMs: 6_000 },
} as const satisfies Record<AirWeapon, { callsign: string; label: string; flightMs: number }>;
export const DRONE_CALLSIGN = AIR.drone.callsign;
export const FLIGHT_MS = AIR.drone.flightMs; // the drone's launch to target
export const CROSS_MS = 2_000; // one pass over the square
export const TURN_MS = 600; // the heli coming round for its next pass
export const HELI_PASSES = 3;
export const LINGER_MS = 3_000; // the panel's sign-off stays up, then it goes

export type Kill = { contactId: string; unit: number; x: number; y: number; atMs: number; seen: boolean };
// A pass over the square: along a row of its 4x4 (the drone flies its middle), one way or the other.
export type Pass = { row: number | null; east: boolean; startMs: number };

export type AirRun = {
  weapon: AirWeapon;
  square: SquareId;
  launchedMs: number;
  arriveMs: number;
  passes: Pass[] | null; // planned when it arrives
  kills: Kill[] | null; // each at the moment it passes over the fighter
  doneMs: number | null; // when the last pass ended
};

export const arrived = (r: AirRun, now: number) => now >= r.arriveMs;
export const airGone = (r: AirRun, now: number) => r.doneMs !== null && now >= r.doneMs + LINGER_MS;

// Where the aircraft is now, or null between passes and before or after: x, y in the world.
export function aircraftAt(r: AirRun, now: number) {
  const sq = parseSquare(r.square)!;
  for (const p of r.passes ?? []) {
    const t = (now - p.startMs) / CROSS_MS;
    if (t < 0 || t >= 1) continue;
    const across = p.east ? t : 1 - t;
    const y = p.row === null ? (sq.row + 0.5) * CELL : sq.row * CELL + (p.row + 0.5) * (CELL / BOARD);
    return { x: sq.col * CELL + across * CELL, y, east: p.east };
  }
  return null;
}

export function launch(s: GameState, weapon: AirWeapon, contactId: string): GameState {
  const c = s.contacts.find((x) => x.id === contactId);
  const prev = weapon === 'drone' ? s.drone : s.heli;
  const busy = prev && !airGone(prev, s.elapsedMs);
  if (!c || c.status !== 'revealed' || weaponBlocked(s, weapon, c) || busy) return s;
  return {
    ...spendWeapon(s, weapon),
    openEvent: null,
    [weapon]: { weapon, square: c.square, launchedMs: s.elapsedMs, arriveMs: s.elapsedMs + AIR[weapon].flightMs, passes: null, kills: null, doneMs: null },
  };
}
export const launchDrone = (s: GameState, contactId: string) => launch(s, 'drone', contactId);

// Every fighter actually in the square, where it stands, and whether HQ is watching it.
function fighters(s: GameState, square: SquareId) {
  const out: (Omit<Kill, 'atMs'> & { row: number })[] = [];
  for (const c of s.contacts) {
    if (c.square !== square || (c.status !== 'hidden' && c.status !== 'revealed')) continue;
    const eyes = eyesOn(s, c);
    const seen = c.status === 'revealed' && !!eyes && eyes.level !== 'stale';
    const o = groupOrigin(c, s.elapsedMs);
    for (const unit of c.units) out.push({ contactId: c.id, unit, ...unitSpot(o, unit), seen, row: Math.floor(unit / BOARD) });
  }
  return out;
}

// The passes, and who goes down on each, when it gets there.
function plan(s: GameState, r: AirRun): { passes: Pass[]; kills: Kill[] } {
  const all = fighters(s, r.square);
  const west = parseSquare(r.square)!.col * CELL;
  const when = (p: Pass, x: number) => p.startMs + Math.round(((p.east ? x - west : west + CELL - x) / CELL) * CROSS_MS);
  if (r.weapon === 'drone') {
    const pass: Pass = { row: null, east: true, startMs: r.arriveMs };
    return { passes: [pass], kills: all.map(({ row: _row, ...k }) => ({ ...k, atMs: when(pass, k.x) })).sort((a, b) => a.atMs - b.atMs) };
  }
  // The heli strafes the rows HQ can see fighters in, the fullest first.
  const counts = new Map<number, number>();
  for (const f of all) if (f.seen) counts.set(f.row, (counts.get(f.row) ?? 0) + 1);
  const rows = [...counts].sort((a, b) => b[1] - a[1] || a[0] - b[0]).slice(0, HELI_PASSES).map(([row]) => row);
  const passes = rows.map((row, i) => ({ row, east: i % 2 === 0, startMs: r.arriveMs + i * (CROSS_MS + TURN_MS) }));
  const kills = passes.flatMap((p) => all.filter((f) => f.row === p.row).map(({ row: _row, ...k }) => ({ ...k, atMs: when(p, k.x) })));
  return { passes, kills: kills.sort((a, b) => a.atMs - b.atMs) };
}

const report = (s: GameState, r: AirRun, text: string): Message => ({
  id: `${r.weapon}-${r.launchedMs}`,
  from: AIR[r.weapon].callsign,
  text,
  atMs: s.elapsedMs,
  status: 'new',
  holds: false,
});

// One aircraft's tick: on arrival its passes are planned and heard; each fighter goes down as
// it passes; when the last pass is over, contacts with nobody left are cleared and it reports.
function fly(s: GameState, r: AirRun): GameState {
  if (r.doneMs !== null || !arrived(r, s.elapsedMs)) return s;
  let next = s;
  let run = r;
  if (!run.passes) {
    run = { ...run, ...plan(s, run) };
    next = makeNoise(next, r.weapon === 'drone' ? NOISE.drone : NOISE.heli);
  }
  const kills = run.kills!;
  const landed = kills.filter((k) => k.atMs <= s.elapsedMs);
  next = {
    ...next,
    contacts: next.contacts.map((c) => {
      const down = landed.filter((k) => k.contactId === c.id).map((k) => k.unit);
      return down.length ? { ...c, units: c.units.filter((u) => !down.includes(u)) } : c;
    }),
  };
  for (const id of new Set(landed.map((k) => k.contactId))) next = confirmKills(next, id, landed.filter((k) => k.contactId === id).map((k) => k.unit));
  const end = Math.max(run.arriveMs, ...run.passes!.map((p) => p.startMs + CROSS_MS));
  if (s.elapsedMs < end) return { ...next, [r.weapon]: run };

  // Over: every contact it emptied is gone, with a kill site to search.
  const hit = new Set(kills.map((k) => k.contactId));
  const gone = new Set(next.contacts.filter((c) => hit.has(c.id) && !c.units.length).map((c) => c.id));
  for (const c of next.contacts.filter((x) => gone.has(x.id))) next = markSite(next, c);
  next = {
    ...next,
    contacts: next.contacts.map((c) => (gone.has(c.id) ? { ...c, status: 'cleared' as const } : c)),
    events: next.events.map((e) => (e.kind === 'contact' && gone.has(e.id.replace('contact-', '')) ? { ...e, status: 'resolved' as const } : e)),
  };
  const confirmed = kills.filter((k) => k.seen).length;
  next = earn(next, confirmed * CASH_PER_STRIKE_KILL);
  const left = next.contacts.filter((c) => c.square === r.square && (c.status === 'hidden' || c.status === 'revealed')).reduce((n, c) => n + c.units.length, 0);
  const pay = confirmed ? ` +$${(confirmed * CASH_PER_STRIKE_KILL).toLocaleString('en-US')}.` : kills.length ? ' Unconfirmed: no eyes on it.' : '';
  const text = !kills.length
    ? `${r.square}: nothing there. No targets.`
    : left
      ? `${r.square}: ${kills.length} down, ${left} still in there.${pay}`
      : `${r.square}: all targets neutralized. ${kills.length} down.${pay}`;
  return {
    ...next,
    [r.weapon]: { ...run, doneMs: s.elapsedMs },
    comms: { ...next.comms, messages: [...next.comms.messages, report(next, r, text)] },
  };
}

export const airSystem: System = (s) => {
  let next = s;
  if (next.drone) next = fly(next, next.drone);
  if (next.heli) next = fly(next, next.heli);
  return next;
};
