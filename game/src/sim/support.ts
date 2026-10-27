import { squareAt } from '../map/grid';
import { treeCall } from './responses';
import { ammoLeft, LOADOUT, medsLeft } from './team';
import type { Message } from './comms';
import { RESUPPLY_COST } from './prices';
export { RESUPPLY_COST };
import type { GameState } from './state';
import type { System } from './systems';

// Support (GDD, folded into one order in ILI-1178): HQ sends a resupply bird, paid from the
// budget. It reloads everyone standing and brings replacements for anyone down. The team
// asks when it's running low, and stops and asks when it's combat ineffective.

export const RESUPPLY_FLIGHT_MS = 20_000;
export const LOW = 0.35; // average share of ammo or meds left that counts as low

export type Inbound = { kind: 'resupply'; arrivesMs: number };

const SPARE_NAMES = ['Vance', 'Ibarra', 'Kowalski', 'Mensah', 'Novak', 'Duarte', 'Haugen', 'Sato'];

const standing = (s: GameState) => s.team.operators.filter((o) => o.health > 0);
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 1);
export const ammoLevel = (s: GameState) => avg(standing(s).map(ammoLeft));
export const medsLevel = (s: GameState) => avg(standing(s).map(medsLeft));

const radio = (s: GameState, from: string, id: string, text: string): Message => ({ id, from, text, atMs: s.elapsedMs, status: 'new', holds: false });

// What the team needs, in its own words, or null if it's fine. Ineffective (two down, or
// the rest badly hurt) stops the team until HQ answers; running low doesn't.
function need(s: GameState): { what: string; key: string; holds: boolean } | null {
  const down = s.team.operators.filter((o) => o.health <= 0).length;
  const hurt = avg(standing(s).map((o) => o.health)) < 40;
  if ((down >= 2 || hurt) && standing(s).length) return { what: `Combat ineffective, ${down ? `${down} down` : 'everyone hurt'}`, key: `ineffective-${down}`, holds: true };
  const ammo = ammoLevel(s) < LOW;
  const meds = medsLevel(s) < LOW;
  if (ammo || meds) return { what: `Running low on ${ammo ? (meds ? 'ammo and meds' : 'ammo') : 'meds'}`, key: 'low', holds: false };
  return null;
}

export const supportSystem: System = (s) => {
  let next = s;
  // Asked once per situation (again only if it gets worse); a reload ends a shortage.
  const n = need(s);
  if (!n && s.flags.low) next = { ...next, flags: { ...next.flags, low: false } };
  const coming = s.inbound.length > 0;
  if (n && !s.flags[n.key] && !coming && !s.team.fight && !s.team.treating && !(n.holds && next.team.holdFor)) {
    const here = squareAt(s.team.position.x, s.team.position.y) ?? '';
    const call = { ...treeCall(next, `resupply-${s.elapsedMs}`, 'resupply', here, undefined, n.what), holds: n.holds };
    next = {
      ...next,
      flags: { ...next.flags, [n.key]: true },
      team: n.holds ? { ...next.team, holdFor: call.id, activity: 'Combat ineffective' } : next.team,
      comms: { ...next.comms, minimized: false, messages: [...next.comms.messages, call] },
    };
  }
  // The bird lands: a full reload for everyone standing, and fresh contractors in the
  // downed operators' places.
  const landed = next.inbound.filter((i) => i.arrivesMs <= s.elapsedMs);
  if (landed.length) {
    let spare = 0;
    const replaced = next.team.operators.some((o) => o.health <= 0);
    next = {
      ...next,
      inbound: next.inbound.filter((i) => !landed.includes(i)),
      team: {
        ...next.team,
        operators: next.team.operators.map((o) => {
          if (o.health > 0) return { ...o, ...LOADOUT[o.role] };
          const name = SPARE_NAMES[(s.stats.lost.length + spare++) % SPARE_NAMES.length];
          return { ...o, id: `${o.role}-${s.elapsedMs}-${spare}`, name, health: 100, ...LOADOUT[o.role] };
        }),
      },
      comms: {
        ...next.comms,
        messages: [...next.comms.messages, radio(s, 'DUSTOFF-2', `resupply-${s.elapsedMs}`, replaced ? 'Bird on the ground: full reload and replacements. ALPHA is back to strength.' : 'Bundle on the ground. Full reload for ALPHA.')],
      },
    };
  }
  return next;
};

export function sendResupply(s: GameState): GameState {
  if (s.resources.budget < RESUPPLY_COST || s.inbound.length) return s;
  return {
    ...s,
    resources: { ...s.resources, budget: s.resources.budget - RESUPPLY_COST },
    inbound: [...s.inbound, { kind: 'resupply', arrivesMs: s.elapsedMs + RESUPPLY_FLIGHT_MS }],
    comms: { ...s.comms, messages: [...s.comms.messages, radio(s, 'DUSTOFF-2', `resupply-out-${s.elapsedMs}`, 'Resupply bird is up. Twenty seconds out.')] },
  };
}

// Every operator who goes down, kept for the wrap-up even after a replacement arrives.
export const casualtySystem: System = (s) => {
  const newlyDown = s.team.operators.filter((o) => o.health <= 0 && !s.stats.lost.includes(o.id));
  return newlyDown.length ? { ...s, stats: { ...s.stats, lost: [...s.stats.lost, ...newlyDown.map((o) => o.id)] } } : s;
};
