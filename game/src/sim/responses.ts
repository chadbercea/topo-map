import type { GameState } from './state';
import type { Message } from './comms';
import type { Effect } from './contacts';
import { satelliteBusy } from './satellite';
import { RESUPPLY_COST } from './prices';

// The response tree for radio calls (GDD: answer through a menu tree; options depend on
// capabilities and budget). Each call offers one to three responses; a response can move
// or hold the team, spend resources, decide what to do about a square, start a mini game,
// and lead to a follow-up call.

export type Capability = 'imagery' | 'strike';

export type Response = {
  id: string;
  label: string;
  requires?: { budget?: number; capability?: Capability };
  hold?: number; // ms the team waits after this answer, then moves on its own
  spend?: { budget?: number };
  effect?: Effect; // what it means for the square the call is about
  reply: string; // what the team radios back
  follow?: string; // next call in the tree
  look?: boolean; // HQ tasks ORION-3 to the square; the look settles the call
};

export type CallContext = { square: string; label?: string };
export type CallNode = {
  text: (c: CallContext) => string;
  responses: Response[];
};

// The tree's wording.
export const TREE: Record<string, CallNode> = {
  // ALPHA decides the rest itself and says so (ILI-1315): resupply is the one thing it asks.
  // The team running low or combat ineffective (support.ts): one resupply bird covers both.
  resupply: {
    text: ({ label }) => `${label}. We need a resupply bird.`,
    responses: [
      { id: 'resupply', label: `Send resupply ($${RESUPPLY_COST.toLocaleString('en-US')})`, requires: { budget: RESUPPLY_COST }, effect: 'resupply', reply: 'Copy, we\u2019ll watch for it.' },
      { id: 'push', label: 'Move on without', effect: 'pass', reply: 'Understood. Moving with what we have.' },
    ],
  },
};

// A call from the tree, about a square (and maybe a map event).
export function treeCall(s: GameState, id: string, node: string, square: string, eventId?: string, label?: string): Message {
  const n = TREE[node];
  return {
    id,
    from: s.team.callsign,
    text: n.text({ square, label }),
    atMs: s.elapsedMs,
    status: 'new',
    holds: true,
    node,
    square,
    label,
    eventId,
    responses: n.responses,
  };
}

// Why a response can't be used right now, or null if it can.
export function blocked(s: GameState, r: Response): string | null {
  const need = r.requires;
  if (!need) return null;
  if (need.capability && !s.capabilities.includes(need.capability)) return need.capability === 'strike' ? 'Not unlocked' : 'Unavailable';
  if (need.capability === 'imagery' && satelliteBusy(s)) return 'ORION-3 busy';
  if (need.budget && s.resources.budget < need.budget) return 'Over budget';
  return null;
}
