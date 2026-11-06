import type { GameState } from './state';
import { openImageryRequest } from './imageryRequest';
import { lockedOn, satelliteBusy, slewMs } from './satellite';
import { ANTENNA_MS } from './signal';
import { currentCall } from './comms';
import { blocked } from './responses';
import { squareAt } from '../map/grid';
import { countdown } from './gameTime';

// The HUD's tiers (ILI-1391). Tier one is always on and tiny (the mission timer, the team's
// heartbeat). Tier three is drawers HQ opens (the team, the comms log, square details). Tier two
// is this: the calls to action, each pinned to its spot on the map and gone once handled.
//
// Every call to action goes through this one queue. One shows at a time, the most urgent first,
// the others wait. A prompt is a map anchor, one line saying what's happening, and one to three
// responses. It's derived from the game's state, so it goes away the moment it's handled.

export type PromptKind = 'intel-needed' | 'enemy-traffic' | 'intel-ready' | 'team-call';
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

// Enemy traffic (ILI-1394): to listen, get an asset in range. Each way's cost is on its button
// before HQ commits: ORION-3 goes there and is tied up while it listens, off scanning for ALPHA;
// or ALPHA holds and sets up the antenna, which burns mission clock. Once it's in place the
// intercept starts by itself; no button starts it.
const enemyTraffic: Source = (s) =>
  s.events
    .filter((e) => e.kind === 'signal' && e.status !== 'resolved' && !(s.minigame?.status === 'active' && s.minigame.eventId === e.id))
    .map((e) => {
      const l = s.listen?.eventId === e.id ? s.listen : null;
      const sat = s.satellite;
      const responses: PromptResponse[] = l
        ? [
            l.via === 'satellite'
              ? { id: 'satellite', label: sat.state === 'slewing' ? `ORION-3 on its way · ${countdown(sat.arriveMs - s.elapsedMs)}` : 'ORION-3 in range', disabled: true }
              : { id: 'antenna', label: `Antenna up in ${countdown(l.readyMs - s.elapsedMs)}`, disabled: true },
          ]
        : [
            satelliteBusy(s)
              ? { id: 'satellite', label: 'ORION-3 busy', disabled: true }
              : { id: 'satellite', label: lockedOn(s, e.square) ? 'ORION-3 listens · off ALPHA’s route' : `ORION-3 · ${countdown(slewMs(s, e.square))} there, off ALPHA’s route` },
            { id: 'antenna', label: `ALPHA sets up antenna · holds ${countdown(ANTENNA_MS)}`, disabled: !!s.listen },
          ];
      return { id: e.id, kind: 'enemy-traffic' as const, priority: PRIORITY.enemyTraffic, atMs: e.atMs, square: e.square, text: l ? `Getting in range of their traffic near ${e.square}` : `Enemy radio traffic near ${e.square}. Get an asset in range to listen`, responses };
    });

// Decoded traffic (ILI-1394): a marker on the map, for HQ to send to ALPHA.
const intelReady: Source = (s) =>
  s.decoded.map((d) => ({ id: d.id, kind: 'intel-ready' as const, priority: PRIORITY.intelReady, atMs: d.atMs, square: d.square, text: `Decoded: “${d.text}”`, responses: [{ id: 'send', label: `Send to ${s.team.callsign}` }] }));

// ALPHA on the radio (ILI-1393): its call is a prompt pinned to where it is, answered right there.
// Not in the comms log any more, which is history only.
const teamCall: Source = (s) => {
  const m = currentCall(s.comms);
  if (!m) return [];
  const responses: PromptResponse[] = m.responses?.length ? m.responses.slice(0, 3).map((r) => ({ id: r.id, label: r.label, disabled: !!blocked(s, r) })) : [{ id: 'copy', label: 'Copy' }];
  const { x, y } = s.team.position;
  return [{ id: m.id, kind: 'team-call', priority: PRIORITY.teamRequest, atMs: m.atMs, square: squareAt(x, y) ?? s.team.route[0], text: `${m.from}: “${m.text}”`, responses }];
};

const SOURCES: Source[] = [intelNeeded, teamCall, enemyTraffic, intelReady];

// Most urgent first: by priority, then the one that's waited longest.
export const byUrgency = (a: Prompt, b: Prompt) => a.priority - b.priority || a.atMs - b.atMs;

// Every call to action, most urgent first.
export function promptQueue(s: GameState): Prompt[] {
  return SOURCES.flatMap((src) => src(s)).sort(byUrgency);
}

// The one on screen.
export const activePrompt = (s: GameState): Prompt | null => promptQueue(s)[0] ?? null;
