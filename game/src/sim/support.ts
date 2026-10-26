import { squareAt } from '../map/grid';
import { treeCall } from './responses';
import { ammoLeft, LOADOUT, medsLeft } from './team';
import type { Message } from './comms';
import { REINFORCE_COST, RESUPPLY_COST } from './prices';
export { REINFORCE_COST, RESUPPLY_COST };
import type { GameState } from './state';
import type { System } from './systems';

// Support options (GDD): HQ sends what the team needs, paid from the budget. The team
// calls in when it's running low (team resources); a resupply bird refills everyone.

export const RESUPPLY_FLIGHT_MS = 20_000;
export const LOW = 0.35; // average share of ammo or meds left that counts as low

export type Inbound = { kind: 'resupply' | 'reinforcements'; arrivesMs: number };

export const REINFORCE_FLIGHT_MS = 30_000;
const SPARE_NAMES = ['Vance', 'Ibarra', 'Kowalski', 'Mensah', 'Novak', 'Duarte', 'Haugen', 'Sato'];

const standing = (s: GameState) => s.team.operators.filter((o) => o.health > 0);
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 1);
export const ammoLevel = (s: GameState) => avg(standing(s).map(ammoLeft));
export const medsLevel = (s: GameState) => avg(standing(s).map(medsLeft));

const radio = (s: GameState, from: string, id: string, text: string): Message => ({ id, from, text, atMs: s.elapsedMs, status: 'new', holds: false });

export const supportSystem: System = (s) => {
  let next = s;
  // Running low: the team asks once per shortage (not while a bird is already coming); a
  // refill ends the shortage.
  const low = ammoLevel(s) < LOW || medsLevel(s) < LOW;
  if (!low && s.flags.lowAsked) next = { ...next, flags: { ...next.flags, lowAsked: false } };
  const coming = s.inbound.some((i) => i.kind === 'resupply');
  if (low && !s.flags.lowAsked && !coming && !s.team.fight) {
    const what = ammoLevel(s) < LOW ? (medsLevel(s) < LOW ? 'ammo and meds' : 'ammo') : 'meds';
    const call = { ...treeCall(s, `low-${s.elapsedMs}`, 'low-supplies', squareAt(s.team.position.x, s.team.position.y) ?? '', undefined, what), holds: false };
    next = { ...next, flags: { ...next.flags, lowAsked: true }, comms: { ...next.comms, minimized: false, messages: [...next.comms.messages, call] } };
  }
  // Combat ineffective (two down, or the rest badly hurt): the team stops and asks for help.
  const down = s.team.operators.filter((o) => o.health <= 0).length;
  const hurt = avg(standing(s).map((o) => o.health)) < 40;
  // Asked once per state of the team: again only if more go down.
  const situation = `ineffective-${down}`;
  const reinforcing = s.inbound.some((i) => i.kind === 'reinforcements');
  if ((down >= 2 || hurt) && standing(s).length && !s.flags[situation] && !reinforcing && !s.team.fight && !s.team.treating && !next.team.holdFor) {
    const here = squareAt(s.team.position.x, s.team.position.y) ?? '';
    const call = treeCall(next, `ineffective-${s.elapsedMs}`, 'ineffective', here, undefined, down ? `${down} down` : 'everyone hurt');
    next = { ...next, flags: { ...next.flags, [situation]: true }, team: { ...next.team, holdFor: call.id, activity: 'Combat ineffective' }, comms: { ...next.comms, minimized: false, messages: [...next.comms.messages, call] } };
  }
  // Reinforcements landing: fresh contractors take the downed operators' places.
  const arrived = next.inbound.filter((i) => i.kind === 'reinforcements' && i.arrivesMs <= s.elapsedMs);
  if (arrived.length) {
    let spare = 0;
    next = {
      ...next,
      inbound: next.inbound.filter((i) => !arrived.includes(i)),
      team: {
        ...next.team,
        operators: next.team.operators.map((o) => {
          if (o.health > 0) return o;
          const name = SPARE_NAMES[(s.stats.lost.length + spare++) % SPARE_NAMES.length];
          return { ...o, id: `${o.role}-${s.elapsedMs}-${spare}`, name, health: 100, fatigue: 0, ...LOADOUT[o.role] };
        }),
      },
      comms: { ...next.comms, messages: [...next.comms.messages, radio(s, 'DUSTOFF-2', `reinforce-${s.elapsedMs}`, 'Replacements on the ground. ALPHA is back to strength.')] },
    };
  }
  // A bird arriving: everyone standing is topped up to a full load.
  const landed = next.inbound.filter((i) => i.kind === 'resupply' && i.arrivesMs <= s.elapsedMs);
  if (landed.length) {
    next = {
      ...next,
      inbound: next.inbound.filter((i) => !landed.includes(i)),
      team: {
        ...next.team,
        operators: next.team.operators.map((o) => (o.health > 0 ? { ...o, ...LOADOUT[o.role] } : o)),
      },
      comms: { ...next.comms, messages: [...next.comms.messages, radio(s, 'DUSTOFF-2', `resupply-${s.elapsedMs}`, 'Bundle on the ground. Full reload for ALPHA.')] },
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

export function sendReinforcements(s: GameState): GameState {
  if (s.resources.budget < REINFORCE_COST || s.inbound.some((i) => i.kind === 'reinforcements')) return s;
  return {
    ...s,
    resources: { ...s.resources, budget: s.resources.budget - REINFORCE_COST },
    inbound: [...s.inbound, { kind: 'reinforcements', arrivesMs: s.elapsedMs + REINFORCE_FLIGHT_MS }],
    comms: { ...s.comms, messages: [...s.comms.messages, radio(s, 'DUSTOFF-2', `reinforce-out-${s.elapsedMs}`, 'Reinforcements are up. Thirty seconds out.')] },
  };
}

// Every operator who goes down, kept for the wrap-up even after a replacement arrives.
export const casualtySystem: System = (s) => {
  const newlyDown = s.team.operators.filter((o) => o.health <= 0 && !s.stats.lost.includes(o.id));
  return newlyDown.length ? { ...s, stats: { ...s.stats, lost: [...s.stats.lost, ...newlyDown.map((o) => o.id)] } } : s;
};
