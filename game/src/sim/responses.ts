import type { GameState } from './state';
import type { Message } from './comms';
import type { Effect } from './contacts';
import { satelliteBusy } from './satellite';
import { FIXER_DISTRACTION, FIXER_GUIDE, REINFORCE_COST, RESUPPLY_COST } from './prices';

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
  timeout: Effect; // what the team does if HQ stays silent
};

export { FIXER_DISTRACTION, FIXER_GUIDE } from './prices';

// The tree's wording.
export const TREE: Record<string, CallNode> = {
  unimaged: {
    text: ({ square }) => `Holding short of ${square}. No imagery on it. Scan it, or tell us to push?`,
    timeout: 'blind',
    responses: [
      { id: 'send', label: 'Send imagery', requires: { capability: 'imagery' }, look: true, reply: 'Standing by for imagery.' },
      { id: 'blind', label: 'Push through', effect: 'blind', reply: 'Copy, moving in blind.' },
      // The local fixer (GDD PMC mechanics): a paid guide instead of a scan.
      { id: 'fixer', label: `Pay a fixer ($${FIXER_GUIDE.toLocaleString('en-US')})`, requires: { budget: FIXER_GUIDE }, spend: { budget: FIXER_GUIDE }, effect: 'guide', reply: 'Local says he knows the ground. Following him in.' },
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
  // The team running low (GDD team resources): HQ can send a resupply bird.
  'low-supplies': {
    text: ({ label }) => `Running low on ${label}. Can you get us a resupply?`,
    timeout: 'pass',
    responses: [
      { id: 'resupply', label: `Send a resupply bird ($${RESUPPLY_COST.toLocaleString('en-US')})`, requires: { budget: RESUPPLY_COST }, effect: 'resupply', reply: 'Copy, we\u2019ll watch for it.' },
      { id: 'no', label: 'Make it last', effect: 'pass', reply: 'Understood. Conserving.' },
    ],
  },
  // Combat ineffective (GDD support options): HQ can send reinforcements.
  ineffective: {
    text: ({ label }) => `We're combat ineffective, ${label}. We need reinforcements.`,
    timeout: 'pass',
    responses: [
      { id: 'reinforce', label: `Send reinforcements ($${REINFORCE_COST.toLocaleString('en-US')})`, requires: { budget: REINFORCE_COST }, effect: 'reinforce', reply: 'Copy. Holding for the bird.', hold: 30_000 },
      { id: 'push', label: 'Push on', effect: 'pass', reply: 'Understood. Moving with what we have.' },
    ],
  },
  'contact-observed': {
    text: ({ square, label }) => `Eyes on ${square}: ${label}, dug in, not moving. Target's painted for you. Hit it, or go around?`,
    timeout: 'push',
    responses: [
      { id: 'attack', label: 'Attack', effect: 'attack', reply: 'Moving in hard.' },
      { id: 'avoid', label: 'Go around', effect: 'avoid', reply: 'Going around.' },
      // The local fixer: a distraction pulls half of them away while ALPHA goes in.
      { id: 'distract', label: `Fixer distraction ($${FIXER_DISTRACTION.toLocaleString('en-US')})`, requires: { budget: FIXER_DISTRACTION }, spend: { budget: FIXER_DISTRACTION }, effect: 'distract', reply: 'Fixer is pulling them away. Going in now.' },
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
