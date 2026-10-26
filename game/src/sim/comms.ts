import type { GameState } from './state';
import type { System } from './systems';
import { blocked, TREE, treeCall, type Response } from './responses';
import { startMiniGame } from './minigame';
import { applyEffect } from './contacts';

// Radio traffic from the team (GDD: text only, clearly marked as incoming). Calls come from
// the mission script (events.ts, script.ts), from the team stopping short of a square
// (contacts.ts), and from the team reaching its objective. A call that "holds" stops the team until HQ answers, or until it
// gives up waiting and does what its tree node says.

export type MessageStatus = 'new' | 'read' | 'dismissed';

export type Message = {
  id: string;
  from: string;
  text: string;
  atMs: number;
  status: MessageStatus;
  holds: boolean; // the team waits on this call
  eventId?: string;
  node?: string; // response tree node it came from
  square?: string;
  label?: string;
  responses?: Response[]; // from the response tree; none means a plain "Copy"
  answer?: string; // id of the response HQ sent
};

export type Comms = {
  messages: Message[];
  queued: Message[]; // calls that come in later (an observation's report), by atMs
  minimized: boolean;
  lastWaypoint: number; // to notice the team arriving somewhere
};

export const HOLD_TIMEOUT_MS = 20_000; // the team pushes on if HQ stays silent this long
export const CHATTER_MS = 8_000; // routine calls mark themselves read after this



export const initialComms = (): Comms => ({ messages: [], queued: [], minimized: false, lastWaypoint: 1 });

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
  const incoming: Message[] = [];

  const due = comms.queued.filter((m) => m.atMs <= s.elapsedMs);
  incoming.push(...due.map((m) => ({ ...m, atMs: s.elapsedMs })));
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
  let decided = s;
  if (timedOut) {
    holdFor = null;
    messages = messages.map((m) => (m === timedOut ? { ...m, status: 'read' as const } : m));
    incoming.push(call(s, `${timedOut.id}-timeout`, 'No word from HQ. Pushing on.'));
    // Silence means the node's default: push on blind, or walk into the contact.
    if (timedOut.node && timedOut.square) decided = applyEffect(s, TREE[timedOut.node].timeout, timedOut.square);
  }

  const holder = incoming.find((m) => m.holds);
  if (holder && !holdFor) holdFor = holder.id;

  if (!incoming.length && holdFor === team.holdFor && messages.every((m, i) => m === comms.messages[i]) && team.waypoint === comms.lastWaypoint)
    return s;

  return {
    ...decided,
    // Only a new hold changes what the team says it's doing.
    team: { ...decided.team, holdFor, activity: holdFor && holdFor !== team.holdFor ? 'Holding for HQ' : decided.team.activity },
    comms: {
      messages: [...messages, ...incoming],
      queued: comms.queued.filter((m) => !due.includes(m)),
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

// HQ answers a call with one of its responses. Applies the effects, radios the team's
// reply, and opens the follow-up call if the tree has one.
export function respond(s: GameState, id: string, responseId: string): GameState {
  const m = s.comms.messages.find((x) => x.id === id);
  const r = m?.responses?.find((x) => x.id === responseId);
  if (!m || !r || m.status !== 'new' || blocked(s, r)) return s;

  // The answer goes back to whoever called: the team replies to HQ, HQ replies to the client.
  const reply: Message = { ...call(s, `${id}-${r.id}`, r.reply), status: 'read', from: m.from === s.team.callsign ? s.team.callsign : 'HQ' };
  // A follow-up waits for its hold (an observation) before it comes in; see followSystem.
  const follow = r.follow && m.square ? treeCall(s, `${id}-${r.follow}`, r.follow, m.square, m.eventId, m.label) : undefined;
  const messages = [
    ...s.comms.messages.map((x) => (x.id === id ? { ...x, status: 'read' as const, answer: r.id } : x)),
    reply,
    ...(follow ? [follow] : []),
  ];

  let holdFor = s.team.holdFor === id ? null : s.team.holdFor;
  if (follow) holdFor = follow.id;
  else if (holdFor === null) holdFor = nextHold(messages);
  const holdUntilMs = r.hold ? s.elapsedMs + r.hold : s.team.holdUntilMs;

  let answered: GameState = {
    ...s,
    team: { ...s.team, holdFor, holdUntilMs, activity: holdFor ? 'Holding for HQ' : r.hold ? 'Holding' : s.team.activity },
    resources: {
      ...s.resources,
      scans: s.resources.scans - (r.spend?.scans ?? 0),
      budget: s.resources.budget - (r.spend?.budget ?? 0),
    },
    comms: { ...s.comms, messages },
  };
  if (r.effect && m.square) answered = applyEffect(answered, r.effect, m.square);
  if (follow) {
    // Observing takes time: the follow-up call comes in when the observation ends.
    const atMs = Math.max(answered.team.holdUntilMs, s.elapsedMs);
    answered = { ...answered, comms: { ...answered.comms, messages: answered.comms.messages.filter((x) => x.id !== follow.id), queued: [...answered.comms.queued, { ...follow, atMs }] } };
  }
  return r.minigame && m.square ? startMiniGame(answered, r.minigame, m.square, id, m.eventId) : answered;
}
