import type { GameState } from './state';
import type { MiniGameKind } from './minigame';
import type { Message } from './comms';
import type { Effect } from './contacts';

// The response tree for radio calls (GDD: answer through a menu tree; options depend on
// capabilities and budget). Each call offers one to three responses; a response can move
// or hold the team, spend resources, decide what to do about a square, start a mini game,
// and lead to a follow-up call.

export type Capability = 'imagery' | 'strike';

export type Response = {
  id: string;
  label: string;
  requires?: { scans?: number; budget?: number; capability?: Capability };
  hold?: number; // ms the team waits after this answer, then moves on its own
  spend?: { scans?: number; budget?: number };
  effect?: Effect; // what it means for the square the call is about
  reply: string; // what the team radios back
  follow?: string; // next call in the tree
  minigame?: MiniGameKind; // HQ plays a mini game on the map; its result settles the call
};

export type CallContext = { square: string; label?: string };
export type CallNode = {
  text: (c: CallContext) => string;
  responses: Response[];
  timeout: Effect; // what the team does if HQ stays silent
};

// Placeholder wording until the mission script lands (ILI-1139).
export const TREE: Record<string, CallNode> = {
  unimaged: {
    text: ({ square }) => `Holding short of ${square}. No imagery on it. Scan it, or tell us to push?`,
    timeout: 'blind',
    responses: [
      { id: 'send', label: 'Send imagery', requires: { scans: 1, capability: 'imagery' }, spend: { scans: 1 }, minigame: 'gridScan', reply: 'Standing by for imagery.' },
      { id: 'blind', label: 'Push through', effect: 'blind', reply: 'Copy, moving in blind.' },
    ],
  },
  contact: {
    text: ({ square, label }) => `Contact in ${square}, ${label}, on our route. Observe, hit it, or go around?`,
    timeout: 'push',
    responses: [
      { id: 'observe', label: 'Observe', effect: 'observe', reply: 'Copy, eyes on. Give us a few.', follow: 'contact-observed' },
      { id: 'attack', label: 'Attack', effect: 'attack', reply: 'Moving in hard.' },
      { id: 'avoid', label: 'Go around', effect: 'avoid', reply: 'Going around.' },
    ],
  },
  site: {
    text: ({ square }) => `At the kill site in ${square}. Want us to search it? It'll cost us time.`,
    timeout: 'pass',
    responses: [
      { id: 'search', label: 'Search it', effect: 'search', reply: 'Searching. Give us fifteen.' },
      { id: 'pass', label: 'Keep moving', effect: 'pass', reply: 'Moving on.' },
    ],
  },
  'contact-observed': {
    text: ({ square, label }) => `Eyes on ${square}: ${label}, dug in, not moving. Hit it or go around?`,
    timeout: 'push',
    responses: [
      { id: 'attack', label: 'Attack', effect: 'attack', reply: 'Moving in hard.' },
      { id: 'avoid', label: 'Go around', effect: 'avoid', reply: 'Going around.' },
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
  if (need.scans && s.resources.scans < need.scans) return 'No scans left';
  if (need.budget && s.resources.budget < need.budget) return 'Over budget';
  return null;
}
