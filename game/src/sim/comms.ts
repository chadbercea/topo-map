import type { GameState } from './state';
import type { System } from './systems';
import { blocked, treeCall, type Response } from './responses';
import { lookAt } from './satellite';
import { applyEffect } from './contacts';

// Radio traffic from the team (GDD: text only, clearly marked as incoming). Calls come from
// the mission script (events.ts, script.ts), from the team stopping short of a square
// (contacts.ts), and from the team reaching its objective. A call that "holds" stops the team
// until HQ answers. It waits as long as it takes: the mission clock is the only pressure.

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
  alert?: boolean; // news the map doesn't show: a short banner, not a card
};

// What a message is for (ILI-1171). Only calls that need an answer open the comms card;
// alerts show as a short banner; everything else goes to the radio log only.
export type MessageKind = 'call' | 'alert' | 'log';
export const kindOf = (m: Message): MessageKind => (m.holds || m.responses ? 'call' : m.alert ? 'alert' : 'log');
export const ALERT_MS = 6_000; // how long an alert banner stays up, in mission time

export type Comms = {
  messages: Message[];
  queued: Message[]; // calls that come in later (an observation's report), by atMs
  inFlight: Sent[]; // HQ's answers on their way up the link to the team
  minimized: boolean;
  lastWaypoint: number; // to notice the team arriving somewhere
};

export const CHATTER_MS = 8_000; // routine calls mark themselves read after this

// The link (ILI-1209): HQ's answer takes a moment to reach the team. Until it lands the team
// keeps doing what it was doing; then it reads the order back and acts on it.
export const LINK_MS = 2_500;
export type Sent = { id: string; responseId: string | null; atMs: number }; // null: a plain Copy
export const sending = (c: Comms, id: string) => c.inFlight.find((x) => x.id === id);



export const initialComms = (): Comms => ({ messages: [], queued: [], inFlight: [], minimized: false, lastWaypoint: 1 });

const call = (s: GameState, id: string, text: string, holds = false, eventId?: string): Message => ({
  id,
  from: s.team.callsign,
  text,
  atMs: s.elapsedMs,
  status: 'new',
  holds,
  eventId,
});

export const commsSystem: System = (st) => {
  const s = deliver(st);
  const { comms, team } = s;
  const incoming: Message[] = [];

  const due = comms.queued.filter((m) => m.atMs <= s.elapsedMs);
  incoming.push(...due.map((m) => ({ ...m, atMs: s.elapsedMs })));
  if (team.waypoint !== comms.lastWaypoint && team.waypoint >= team.route.length)
    incoming.push(call(s, 'in-position', `In position at ${team.route.at(-1)}. Holding.`));

  // Age out: chatter marks itself read. Holds wait for HQ.
  let holdFor = team.holdFor;
  const messages = comms.messages.map((m) => {
    if (m.status !== 'new') return m;
    const age = s.elapsedMs - m.atMs;
    if (!m.holds && age >= CHATTER_MS) return { ...m, status: 'read' as const };
    return m;
  });

  const holder = incoming.find((m) => m.holds);
  if (holder && !holdFor) holdFor = holder.id;

  if (!incoming.length && holdFor === team.holdFor && messages.every((m, i) => m === comms.messages[i]) && team.waypoint === comms.lastWaypoint)
    return s;

  return {
    ...s,
    // Only a new hold changes what the team says it's doing.
    team: { ...team, holdFor, activity: holdFor && holdFor !== team.holdFor ? 'Holding for HQ' : team.activity },
    comms: {
      ...comms,
      messages: [...messages, ...incoming],
      queued: comms.queued.filter((m) => !due.includes(m)),
      // A new call always opens the comms window.
      minimized: incoming.some((m) => kindOf(m) === 'call') ? false : comms.minimized,
      lastWaypoint: team.waypoint,
    },
  };
};

// The call on screen in the comms card: the oldest unanswered hold, else the newest call
// waiting for an answer. Log lines and alerts never take the card.
export function currentCall(c: Comms): Message | undefined {
  const fresh = waitingCalls(c);
  return fresh.find((m) => m.holds) ?? fresh.at(-1);
}

// Calls still waiting on HQ: an answer on its way up the link no longer waits.
export const waitingCalls = (c: Comms) => c.messages.filter((m) => m.status === 'new' && kindOf(m) === 'call' && !sending(c, m.id));

// HQ answers a call: a reply (responseId), or a plain Copy (null). It goes up the link and
// lands LINK_MS later (deliver).
export function send(s: GameState, id: string, responseId: string | null): GameState {
  const m = s.comms.messages.find((x) => x.id === id);
  if (!m || m.status !== 'new' || sending(s.comms, id)) return s;
  if (responseId !== null) {
    const r = m.responses?.find((x) => x.id === responseId);
    if (!r || blocked(s, r)) return s;
  }
  return { ...s, comms: { ...s.comms, inFlight: [...s.comms.inFlight, { id, responseId, atMs: s.elapsedMs + LINK_MS }] } };
}

// Answers that have reached the team take effect: the reply's effects and the team's readback
// (respond), or the go-ahead (confirm). One that can no longer be carried out (the budget
// went elsewhere meanwhile) drops, and the call waits on HQ again.
function deliver(s: GameState): GameState {
  const due = s.comms.inFlight.filter((x) => x.atMs <= s.elapsedMs);
  if (!due.length) return s;
  let next: GameState = { ...s, comms: { ...s.comms, inFlight: s.comms.inFlight.filter((x) => !due.includes(x)) } };
  for (const x of due) next = x.responseId === null ? confirm(next, x.id) : respond(next, x.id, x.responseId);
  return next;
}

// Alerts still on screen: the newest few raised in the last few seconds.
export const liveAlerts = (c: Comms, now: number) => c.messages.filter((m) => m.alert && now - m.atMs < ALERT_MS).slice(-3);

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

// Dismiss hides a call without answering it; a holding team keeps waiting.
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
  return r.look && m.square ? lookAt(answered, m.square, id) : answered;
}
