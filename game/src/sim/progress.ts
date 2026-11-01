import { missionDef } from './script';
import type { GameState } from './state';
import { waitingCalls } from './comms';
import { condition } from './team';
import { ammoLevel, LOW, medsLevel } from './support';
import { squareCenter, type SquareId } from '../map/grid';
import { BASE_SPEED } from './movement';
import { RECOVER_MS } from './mission';

// Mission progression at a glance (ILI-1173): how far along the route ALPHA is, what it's
// doing now, and the one thing that presses next. Pure reads of the state, for the HUD.

export type Race = { walked: number; needMs: number; behind: boolean; marks: { key: 'A' | 'B' | 'C'; square: string; at: number }[] };

// Slopes, detours and holds: how much longer the walk really takes than flat ground at full pace.
const DRAG = 1.25;

// The race (ILI-1245): ALPHA's progress along its route as a fraction of the whole walk, with
// A, B and C marked on the same scale, to lay against the contract window's time left. Measured
// square centre to square centre; the ground's detours are close enough for a bar. Behind when
// the walk left (plus the recovery, if the box isn't out yet) needs more than the time left.
export function race(s: GameState): Race {
  const { route, waypoint, position } = s.team;
  const pts = route.map((sq) => squareCenter(sq)!);
  const legs = pts.slice(1).map((p, i) => Math.hypot(p.x - pts[i].x, p.y - pts[i].y));
  const total = legs.reduce((a, b) => a + b, 0) || 1;
  const upTo = (i: number) => legs.slice(0, i).reduce((a, b) => a + b, 0);
  let walked = upTo(route.length - 1);
  if (waypoint < route.length) {
    const to = pts[waypoint];
    const left = Math.min(legs[waypoint - 1] ?? 0, Math.hypot(to.x - position.x, to.y - position.y));
    walked = upTo(waypoint) - left;
  }
  const { a, b, c } = s.mission;
  const at = (sq: string, fallback: number) => {
    const i = route.indexOf(sq as (typeof route)[number]);
    return i < 0 ? fallback : upTo(i) / total;
  };
  const recovering = s.mission.blackBox ? 0 : s.mission.recoverUntilMs !== null ? Math.max(0, s.mission.recoverUntilMs - s.elapsedMs) : RECOVER_MS;
  const needMs = ((total - walked) / BASE_SPEED) * 1000 * DRAG + recovering;
  return {
    walked: Math.max(0, Math.min(1, walked / total)),
    needMs,
    behind: s.mission.phase !== 'complete' && needMs > s.timer.remainingMs,
    marks: [
      { key: 'A', square: a, at: 0 },
      { key: 'B', square: b, at: at(b, 0.5) },
      { key: 'C', square: c, at: 1 },
    ],
  };
}

export type Pressing = { tone: 'threat' | 'support' | 'objective'; text: string; atMs?: number };

// The single most pressing thing beyond the call card (which speaks for itself): a known
// threat with an ETA, support inbound, else the objective itself.
export function nextUp(s: GameState): Pressing {
  const threat = missionDef(s.script.mission)
    ?.threats?.(s)
    .filter((t) => t.atMs > s.elapsedMs)
    .sort((a, b) => a.atMs - b.atMs)[0];
  if (threat) return { tone: 'threat', ...threat };
  const inbound = [...s.inbound].sort((a, b) => a.arrivesMs - b.arrivesMs)[0];
  if (inbound) return { tone: 'support', text: 'Resupply lands', atMs: inbound.arrivesMs };
  const { mission } = s;
  const text = mission.phase === 'infil' ? `Reach the crash site at ${mission.b}` : mission.phase === 'objective' ? `Hold ${mission.b} while the drive comes out` : `Get to exfil at ${mission.c}`;
  return { tone: 'objective', text };
}

// go: where tapping it takes HQ (ILI-1271): the square it's about, or ALPHA's waiting call.
export type Blocker = { tone: 'decision' | 'threat' | 'team'; text: string; go?: { square?: SquareId; ask?: true } };

// What's stopping progress or pressing right now (ILI-1187), most urgent first: a look ALPHA
// is waiting on with ORION-3 in place (ILI-1257), a call waiting on HQ, a fight, contacts and unimaged ground on the route ahead, the team's
// condition, and the enemy's alert.
// The next square on ALPHA's way with no imagery: where a look would do the most good (ILI-1272).
export const nextBlind = (s: GameState): SquareId | undefined => s.team.route.slice(s.team.waypoint).find((sq) => !s.map.scanned.includes(sq) && !s.imagery[sq]);

export function blockers(s: GameState): Blocker[] {
  const out: Blocker[] = [];
  // ALPHA waiting on a look ORION-3 is in place for (ILI-1257): the shot is the next thing to do.
  const sat = s.satellite;
  if (sat.callId && sat.state === 'onStation') out.push({ tone: 'decision', text: `ORION-3 on station over ${sat.aim}: take the shot`, go: { square: sat.aim } });
  const calls = waitingCalls(s.comms);
  if (calls.length) out.push({ tone: 'decision', text: `${calls[0].from} waiting on your decision${calls.length > 1 ? ` (+${calls.length - 1})` : ''}`, go: { ask: true } });
  if (s.team.fight) out.push({ tone: 'threat', text: `${s.team.callsign} in contact` });
  // Teaching through play (ILI-1318): what ALPHA needs from HQ right now, and where.
  const w = s.team.waitFor;
  if (w && s.elapsedMs < w.untilMs) out.push({ tone: 'decision', text: `${s.team.callsign} holding short of ${w.square}: soften them up`, go: { square: w.square } });
  if (s.team.activity === 'Holding · needs intel') {
    const at = s.team.route.slice(s.team.waypoint).find((sq) => !s.map.scanned.includes(sq)) ?? s.team.route[s.team.waypoint];
    if (at) out.push({ tone: 'decision', text: `${s.team.callsign} needs intel: scan ahead at ${at}`, go: { square: at } });
  }
  const ahead = s.team.route.slice(s.team.waypoint);
  const contact = ahead.find((sq) => s.contacts.some((c) => c.square === sq && c.status === 'revealed'));
  if (contact) out.push({ tone: 'threat', text: `Contact on the route at ${contact}`, go: { square: contact } });
  const blind = nextBlind(s);
  if (blind) out.push({ tone: 'threat', text: `No imagery ahead at ${blind}`, go: { square: blind } });
  const down = s.team.operators.filter((o) => condition(o) === 'down').length;
  const hurt = s.team.operators.filter((o) => condition(o) === 'caution' || condition(o) === 'danger').length;
  if (down) out.push({ tone: 'team', text: `${down} down` });
  if (hurt) out.push({ tone: 'team', text: `${hurt} wounded` });
  if (ammoLevel(s) < LOW) out.push({ tone: 'team', text: 'Low on ammo' });
  if (medsLevel(s) < LOW) out.push({ tone: 'team', text: 'Low on meds' });
  if (s.alerted) out.push({ tone: 'threat', text: 'Enemy alerted to the PMC' });
  return out;
}
