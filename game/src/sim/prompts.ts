import type { GameState } from './state';
import { openImageryRequest } from './imageryRequest';
import { lockedOn, slewMs } from './satellite';
import { countdown } from './gameTime';

// The HUD's tiers (ILI-1391). Tier one is always on and tiny (the mission timer, the team's
// heartbeat). Tier three is drawers HQ opens (the team, the comms log, square details). Tier two
// is this: the calls to action, each pinned to its spot on the map and gone once handled.
//
// Every call to action goes through this one queue. One shows at a time, the most urgent first,
// the others wait. A prompt is a map anchor, one line saying what's happening, and one to three
// responses. It's derived from the game's state, so it goes away the moment it's handled.

export type PromptKind = 'intel-needed';
export type PromptResponse = { id: string; label: string; disabled?: boolean };
export type Prompt = {
  id: string;
  kind: PromptKind;
  priority: number; // lower goes first
  atMs: number; // when it came up: the older of two at one priority goes first
  square: string; // where it's pinned on the map
  text: string;
  responses: PromptResponse[]; // one to three
};

// The order calls to action wait in (ILI-1391): an operator hurt, then what the team asks for,
// then enemy traffic, then finished analyst intel.
export const PRIORITY = { operatorHurt: 0, teamRequest: 1, enemyTraffic: 2, intelReady: 3 } as const;

type Source = (s: GameState) => Prompt[];

// ALPHA needs intel (ILI-1341, ILI-1349): out of it and holding, or running low on the move. It
// asks for a look at the next square on its route, and a scan there answers it.
const intelNeeded: Source = (s) => {
  const req = openImageryRequest(s);
  if (!req) return [];
  const holding = s.team.activity.startsWith('Holding');
  return [
    {
      id: req.id,
      kind: 'intel-needed',
      priority: PRIORITY.teamRequest,
      atMs: req.atMs,
      square: req.square,
      text: holding ? `${s.team.callsign} is holding: it needs intel on ${req.square} to move` : `${s.team.callsign} is low on intel: it needs a look at ${req.square}`,
      responses: [lookResponse(s, req.square)],
    },
  ];
};

// What getting a look at a square takes right now (ILI-1397): the satellite moves there first,
// a step the player sees, then the scan.
function lookResponse(s: GameState, square: string): PromptResponse {
  const sat = s.satellite;
  if (lockedOn(s, square)) return sat.state === 'capturing' ? { id: 'scan', label: 'ORION-3 busy', disabled: true } : { id: 'scan', label: `Scan ${square}` };
  if (sat.state === 'slewing' && sat.aim === square) return { id: 'move', label: `ORION-3 on its way · ${countdown(sat.arriveMs - s.elapsedMs)}`, disabled: true };
  if (sat.state === 'capturing') return { id: 'move', label: `ORION-3 busy over ${sat.aim}`, disabled: true };
  return { id: 'move', label: `Move ORION-3 here · ${countdown(slewMs(s, square))}` };
}

const SOURCES: Source[] = [intelNeeded];

// Most urgent first: by priority, then the one that's waited longest.
export const byUrgency = (a: Prompt, b: Prompt) => a.priority - b.priority || a.atMs - b.atMs;

// Every call to action, most urgent first.
export function promptQueue(s: GameState): Prompt[] {
  return SOURCES.flatMap((src) => src(s)).sort(byUrgency);
}

// The one on screen.
export const activePrompt = (s: GameState): Prompt | null => promptQueue(s)[0] ?? null;
