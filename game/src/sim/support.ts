import { squareAt } from '../map/grid';
import { treeCall } from './responses';
import { ammoLeft, LOADOUT, medsLeft } from './team';
import type { Message } from './comms';
import { RESUPPLY_COST } from './prices';
export { RESUPPLY_COST };
import type { GameState } from './state';
import type { System } from './systems';

// Support options (GDD): HQ sends what the team needs, paid from the budget. The team
// calls in when it's running low (team resources); a resupply bird refills everyone.

export const RESUPPLY_FLIGHT_MS = 20_000;
export const LOW = 0.35; // average share of ammo or meds left that counts as low

export type Inbound = { kind: 'resupply'; arrivesMs: number };

const standing = (s: GameState) => s.team.operators.filter((o) => o.health > 0);
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 1);
export const ammoLevel = (s: GameState) => avg(standing(s).map(ammoLeft));
export const medsLevel = (s: GameState) => avg(standing(s).map(medsLeft));

const radio = (s: GameState, from: string, id: string, text: string): Message => ({ id, from, text, atMs: s.elapsedMs, status: 'new', holds: false });

export const supportSystem: System = (s) => {
  let next = s;
  // Running low: the team asks, once per shortage (not while a bird is already coming).
  const low = ammoLevel(s) < LOW || medsLevel(s) < LOW;
  const asked = s.comms.messages.some((m) => m.node === 'low-supplies' && m.status === 'new');
  const coming = s.inbound.some((i) => i.kind === 'resupply');
  if (low && !asked && !coming && !s.team.fight) {
    const what = ammoLevel(s) < LOW ? (medsLevel(s) < LOW ? 'ammo and meds' : 'ammo') : 'meds';
    const call = { ...treeCall(s, `low-${s.elapsedMs}`, 'low-supplies', squareAt(s.team.position.x, s.team.position.y) ?? '', undefined, what), holds: false };
    next = { ...next, comms: { ...next.comms, minimized: false, messages: [...next.comms.messages, call] } };
  }
  // A bird arriving: everyone standing is topped up to a full load.
  const landed = next.inbound.filter((i) => i.arrivesMs <= s.elapsedMs);
  if (landed.length) {
    next = {
      ...next,
      inbound: next.inbound.filter((i) => !landed.includes(i)),
      team: {
        ...next.team,
        operators: next.team.operators.map((o) => (o.health > 0 ? { ...o, ...LOADOUT[o.role] } : o)),
      },
      comms: { ...next.comms, minimized: false, messages: [...next.comms.messages, radio(s, 'DUSTOFF-2', `resupply-${s.elapsedMs}`, 'Bundle on the ground. Full reload for ALPHA.')] },
    };
  }
  return next;
};

export function sendResupply(s: GameState): GameState {
  if (s.resources.budget < RESUPPLY_COST || s.inbound.some((i) => i.kind === 'resupply')) return s;
  return {
    ...s,
    resources: { ...s.resources, budget: s.resources.budget - RESUPPLY_COST },
    inbound: [...s.inbound, { kind: 'resupply', arrivesMs: s.elapsedMs + RESUPPLY_FLIGHT_MS }],
    comms: { ...s.comms, messages: [...s.comms.messages, radio(s, 'DUSTOFF-2', `resupply-out-${s.elapsedMs}`, `Resupply bird is up. Twenty seconds out.`)] },
  };
}
