import { missionDef } from './script';
import type { GameState } from './state';
import { gameSpan } from './gameTime';
import { waitingCalls } from './comms';
import { condition } from './team';
import { ammoLevel, LOW, medsLevel } from './support';

// Mission progression at a glance (ILI-1173): where the mission is (phase pips), what ALPHA
// is doing now, and the one thing that presses next. Pure reads of the state, for the HUD.

export type Pip = { key: string; label: string; state: 'done' | 'current' | 'todo'; detail?: string };

const ORDER = ['infil', 'objective', 'exfil'] as const;

export function phasePips(s: GameState): Pip[] {
  const { mission } = s;
  const at = mission.phase === 'complete' ? ORDER.length : ORDER.indexOf(mission.phase);
  const pips: Pip[] = [
    { key: 'A', label: `A infil ${mission.a}` },
    { key: 'B', label: `B crash site ${mission.b}` },
    { key: 'C', label: `C exfil ${mission.c}` },
  ].map((p, i) => ({ ...p, state: i < at ? 'done' : i === at ? 'current' : 'todo' }));
  if (mission.phase === 'objective' && mission.recoverUntilMs !== null)
    pips[1].detail = `recovering · ${gameSpan(mission.recoverUntilMs - s.elapsedMs)}`;
  return pips;
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
  const text =
    mission.phase === 'infil' ? `Reach the crash site at ${mission.b}` : mission.phase === 'objective' ? `Hold ${mission.b} while the drive comes out` : `Get to exfil at ${mission.c}`;
  return { tone: 'objective', text };
}

export type Blocker = { tone: 'decision' | 'threat' | 'team'; text: string };

// What's stopping progress or pressing right now (ILI-1187), most urgent first: a call
// waiting on HQ, a fight, contacts and unimaged ground on the route ahead, the team's
// condition, and the enemy's alert.
export function blockers(s: GameState): Blocker[] {
  const out: Blocker[] = [];
  const calls = waitingCalls(s.comms);
  if (calls.length) out.push({ tone: 'decision', text: `${calls[0].from} waiting on your call${calls.length > 1 ? ` (+${calls.length - 1})` : ''}` });
  if (s.team.fight) out.push({ tone: 'threat', text: `${s.team.callsign} in contact` });
  const ahead = s.team.route.slice(s.team.waypoint);
  const contact = ahead.find((sq) => s.contacts.some((c) => c.square === sq && c.status === 'revealed'));
  if (contact) out.push({ tone: 'threat', text: `Contact on the route at ${contact}` });
  const blind = ahead.find((sq) => !s.map.scanned.includes(sq) && !s.imagery[sq]);
  if (blind) out.push({ tone: 'threat', text: `No imagery ahead at ${blind}` });
  const down = s.team.operators.filter((o) => condition(o) === 'down').length;
  const hurt = s.team.operators.filter((o) => condition(o) === 'caution' || condition(o) === 'danger').length;
  if (down) out.push({ tone: 'team', text: `${down} down` });
  if (hurt) out.push({ tone: 'team', text: `${hurt} wounded` });
  if (ammoLevel(s) < LOW) out.push({ tone: 'team', text: 'Low on ammo' });
  if (medsLevel(s) < LOW) out.push({ tone: 'team', text: 'Low on meds' });
  if (s.alerted) out.push({ tone: 'threat', text: 'Enemy alerted to the PMC' });
  return out;
}

// The win conditions, as the header's checklist: the black box, everyone home, at exfil.
export function winChecks(s: GameState) {
  const { mission, team } = s;
  return [
    { key: 'box', label: 'Black box', done: !!mission.blackBox },
    { key: 'team', label: `${team.operators.filter((o) => o.health > 0).length}/${team.operators.length} alive`, done: team.operators.every((o) => o.health > 0) },
    { key: 'exfil', label: `Exfil ${mission.c}`, done: mission.phase === 'complete' },
  ];
}
