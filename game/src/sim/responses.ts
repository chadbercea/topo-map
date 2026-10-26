import type { GameState } from './state';
import type { MiniGameKind } from './minigame';

// The response tree for radio calls (GDD: answer through a menu tree; options depend on
// capabilities and budget). Each call offers one to three responses; a response can move
// or hold the team, spend resources, close the map event, and lead to a follow-up call.

export type Capability = 'imagery' | 'strike';

export type Response = {
  id: string;
  label: string;
  requires?: { scans?: number; budget?: number; capability?: Capability };
  hold?: number; // ms the team waits after this answer, then moves on its own
  release?: boolean; // the team moves now
  spend?: { scans?: number; budget?: number };
  scan?: boolean; // image the call's square
  resolve?: boolean; // close the map event this call came from
  reply: string; // what the team radios back
  follow?: string; // next call in the tree
  minigame?: MiniGameKind; // HQ plays a mini game on the map; its result settles the call
};

export type CallNode = { text: (square: string) => string; holds: boolean; responses: Response[] };

// Placeholder tree until the mission script lands (ILI-1139).
export const TREE: Record<string, CallNode> = {
  contact: {
    text: (sq) => `Movement in ${sq}, can't ID it. Holding short. Your call.`,
    holds: true,
    responses: [
      { id: 'eyes', label: 'Get eyes on it', requires: { scans: 1, capability: 'imagery' }, spend: { scans: 1 }, scan: true, reply: 'Copy, waiting on imagery.', follow: 'contact-imaged' },
      { id: 'wait', label: 'Hold 20 s', hold: 20_000, reply: 'Holding. Moving in 20.' },
      { id: 'push', label: 'Push through', release: true, reply: 'Moving through. Expect contact.' },
    ],
  },
  'contact-imaged': {
    text: (sq) => `Imagery shows two technicals in ${sq}. Go around or hit them?`,
    holds: true,
    responses: [
      { id: 'bypass', label: 'Go around', release: true, resolve: true, reply: 'Going around.' },
      { id: 'strike', label: 'Drone strike', requires: { capability: 'strike', budget: 5_000 }, spend: { budget: 5_000 }, release: true, resolve: true, reply: 'Splash. Moving through.' },
    ],
  },
  request: {
    text: (sq) => `Need eyes on ${sq} before we move in. Holding.`,
    holds: true,
    responses: [
      { id: 'send', label: 'Send imagery', requires: { scans: 1, capability: 'imagery' }, spend: { scans: 1 }, minigame: 'gridScan', reply: 'Standing by for imagery.' },
      { id: 'refuse', label: 'Negative, push on', release: true, resolve: true, reply: 'Copy, moving without it.' },
    ],
  },
};

// Why a response can't be used right now, or null if it can.
export function blocked(s: GameState, r: Response): string | null {
  const need = r.requires;
  if (!need) return null;
  if (need.capability && !s.capabilities.includes(need.capability)) return need.capability === 'strike' ? 'Not unlocked' : 'Unavailable';
  if (need.scans && s.resources.scans < need.scans) return 'No scans left';
  if (need.budget && s.resources.budget < need.budget) return 'Over budget';
  return null;
}
