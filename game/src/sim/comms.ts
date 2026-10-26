import type { GameState } from './state';
import type { System } from './systems';

// Radio traffic from the team (GDD: text only, clearly marked as incoming). Calls come from
// a timed script, from map events, and from the team reaching its objective. A call that
// "holds" stops the team until HQ answers, or until it gives up waiting and pushes on.

export type MessageStatus = 'new' | 'read' | 'dismissed';

export type Message = {
  id: string;
  from: string;
  text: string;
  atMs: number;
  status: MessageStatus;
  holds: boolean; // the team waits on this call
  eventId?: string;
};

export type Comms = {
  messages: Message[];
  minimized: boolean;
  lastWaypoint: number; // to notice the team arriving somewhere
};

export const HOLD_TIMEOUT_MS = 20_000; // the team pushes on if HQ stays silent this long
export const CHATTER_MS = 8_000; // routine calls mark themselves read after this

// Placeholder script until the mission script lands (ILI-1139).
const TIMED: { atMs: number; id: string; text: string }[] = [
  { atMs: 3_000, id: 'insert', text: 'Boots on the ground at G5. Moving to F4.' },
];

const EVENT_CALLS: Record<string, (square: string) => string> = {
  contact: (sq) => `Movement in ${sq}, can't ID it. Holding short. Your call.`,
  request: (sq) => `Need eyes on ${sq} before we move in. Holding.`,
};

export const initialComms = (): Comms => ({ messages: [], minimized: false, lastWaypoint: 1 });

const call = (s: GameState, id: string, text: string, holds = false, eventId?: string): Message => ({
  id,
  from: s.team.callsign,
  text,
  atMs: s.elapsedMs,
  status: 'new',
  holds,
  eventId,
});

export const commsSystem: System = (s) => {
  const { comms, team } = s;
  const have = new Set(comms.messages.map((m) => m.id));
  const incoming: Message[] = [];

  for (const t of TIMED) if (t.atMs <= s.elapsedMs && !have.has(t.id)) incoming.push(call(s, t.id, t.text));
  for (const e of s.events)
    if (!have.has(`event-${e.id}`) && EVENT_CALLS[e.kind])
      incoming.push(call(s, `event-${e.id}`, EVENT_CALLS[e.kind](e.square), true, e.id));
  if (team.waypoint !== comms.lastWaypoint && team.waypoint >= team.route.length)
    incoming.push(call(s, 'in-position', `In position at ${team.route.at(-1)}. Holding.`));

  // Age out: chatter marks itself read; an unanswered hold times out and the team moves.
  let holdFor = team.holdFor;
  let messages = comms.messages.map((m) => {
    if (m.status !== 'new') return m;
    const age = s.elapsedMs - m.atMs;
    if (!m.holds && age >= CHATTER_MS) return { ...m, status: 'read' as const };
    return m;
  });
  const timedOut = messages.find((m) => m.holds && m.id === holdFor && s.elapsedMs - m.atMs >= HOLD_TIMEOUT_MS);
  if (timedOut) {
    holdFor = null;
    messages = messages.map((m) => (m === timedOut ? { ...m, status: 'read' as const } : m));
    incoming.push(call(s, `${timedOut.id}-timeout`, 'No word from HQ. Pushing on.'));
  }

  const holder = incoming.find((m) => m.holds);
  if (holder && !holdFor) holdFor = holder.id;

  if (!incoming.length && holdFor === team.holdFor && messages.every((m, i) => m === comms.messages[i]) && team.waypoint === comms.lastWaypoint)
    return s;

  return {
    ...s,
    team: { ...team, holdFor, activity: holdFor ? 'Holding for HQ' : team.activity },
    comms: {
      messages: [...messages, ...incoming],
      // A new call always opens the comms window.
      minimized: incoming.length ? false : comms.minimized,
      lastWaypoint: team.waypoint,
    },
  };
};

// The call on screen in the comms window: the oldest unanswered hold, else the newest new call.
export function currentCall(c: Comms): Message | undefined {
  const fresh = c.messages.filter((m) => m.status === 'new');
  return fresh.find((m) => m.holds) ?? fresh.at(-1);
}

// HQ acknowledges a call. If the team was holding on it, it moves again.
export function confirm(s: GameState, id: string): GameState {
  const m = s.comms.messages.find((x) => x.id === id);
  if (!m || m.status !== 'new') return s;
  const released = s.team.holdFor === id;
  const messages = s.comms.messages.map((x) => (x.id === id ? { ...x, status: 'read' as const } : x));
  if (released) messages.push(call(s, `${id}-ack`, 'Copy, moving.'));
  // Mark the ack read straight away: it answers HQ, nobody needs to open it.
  const settled = released ? messages.map((x) => (x.id === `${id}-ack` ? { ...x, status: 'read' as const } : x)) : messages;
  const next = released ? nextHold(settled) : s.team.holdFor;
  return {
    ...s,
    team: { ...s.team, holdFor: next, activity: next ? 'Holding for HQ' : s.team.activity },
    comms: { ...s.comms, messages: settled },
  };
}

// Dismiss hides a call without answering it; a holding team keeps waiting (and times out).
export function dismiss(s: GameState, id: string): GameState {
  const m = s.comms.messages.find((x) => x.id === id);
  if (!m || m.status !== 'new') return s;
  return {
    ...s,
    comms: { ...s.comms, messages: s.comms.messages.map((x) => (x.id === id ? { ...x, status: 'dismissed' as const } : x)) },
  };
}

const nextHold = (messages: Message[]) => messages.find((m) => m.holds && m.status === 'new')?.id ?? null;
