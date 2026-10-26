import type { Message } from './comms';
import type { GameState } from './state';
import type { System } from './systems';

// Client bonuses (GDD): mid-mission, the client offers extra pay for a side objective that
// pulls against the clock. This one is imagery: fresh imagery of a square before a deadline,
// which costs a scan from the same pool ALPHA needs.

export type SideJob = {
  square: string;
  reward: number;
  offerUntilMs: number; // answer by then or the offer lapses
  windowMs: number; // time to deliver once accepted
  deadlineMs: number | null;
  status: 'offered' | 'active' | 'done' | 'failed' | 'declined';
};

const client = (s: GameState, id: string, text: string, extra: Partial<Message> = {}): Message => ({
  id,
  from: 'CLIENT',
  text,
  atMs: s.elapsedMs,
  status: 'new',
  holds: false,
  ...extra,
});

export function offerJob(s: GameState, job: Omit<SideJob, 'deadlineMs' | 'status' | 'offerUntilMs'> & { answerMs: number }): GameState {
  const { answerMs, ...rest } = job;
  const offer = client(
    s,
    'client-offer',
    `Extra $${rest.reward.toLocaleString('en-US')} if you get us fresh imagery of the radar site in ${rest.square} in the next ${Math.round(rest.windowMs / 60_000)} minutes. Interested?`,
    { node: 'client-offer', square: rest.square, responses: CLIENT_RESPONSES },
  );
  return {
    ...s,
    sideJob: { ...rest, offerUntilMs: s.elapsedMs + answerMs, deadlineMs: null, status: 'offered' },
    comms: { ...s.comms, minimized: false, messages: [...s.comms.messages, offer] },
  };
}

export const CLIENT_RESPONSES = [
  { id: 'accept', label: 'Take the job', effect: 'accept-job' as const, reply: 'We’ll get you the imagery.' },
  { id: 'decline', label: 'Pass', effect: 'decline-job' as const, reply: 'Not this time. Our team comes first.' },
];

export function acceptJob(s: GameState): GameState {
  const j = s.sideJob;
  if (!j || j.status !== 'offered') return s;
  return {
    ...s,
    sideJob: { ...j, status: 'active', deadlineMs: s.elapsedMs + j.windowMs },
    events: [...s.events, { id: 'side-job', kind: 'request', square: j.square, title: 'Client: radar site imagery', atMs: s.elapsedMs, status: 'new' }],
  };
}

export const declineJob = (s: GameState): GameState => (s.sideJob?.status === 'offered' ? { ...s, sideJob: { ...s.sideJob, status: 'declined' } } : s);

// A won scan that imaged the square delivers the job.
export function deliverImagery(s: GameState, squares: string[]): GameState {
  const j = s.sideJob;
  if (!j || j.status !== 'active' || !squares.includes(j.square)) return s;
  return {
    ...s,
    sideJob: { ...j, status: 'done' },
    resources: { ...s.resources, budget: s.resources.budget + j.reward },
    stats: { ...s.stats, bonus: s.stats.bonus + j.reward },
    events: s.events.map((e) => (e.id === 'side-job' ? { ...e, status: 'resolved' as const } : e)),
    comms: { ...s.comms, messages: [...s.comms.messages, client(s, 'client-paid', `Imagery received. $${j.reward.toLocaleString('en-US')} bonus is on its way.`)] },
  };
}

export const sideJobSystem: System = (s) => {
  const j = s.sideJob;
  if (!j) return s;
  // Nobody answered: the offer lapses.
  if (j.status === 'offered' && s.elapsedMs >= j.offerUntilMs) {
    return {
      ...s,
      sideJob: { ...j, status: 'declined' },
      comms: { ...s.comms, messages: s.comms.messages.map((m) => (m.id === 'client-offer' && m.status === 'new' ? { ...m, status: 'read' as const } : m)) },
    };
  }
  if (j.status === 'active' && j.deadlineMs !== null && s.elapsedMs >= j.deadlineMs) {
    return {
      ...s,
      sideJob: { ...j, status: 'failed' },
      events: s.events.map((e) => (e.id === 'side-job' ? { ...e, status: 'resolved' as const } : e)),
      comms: { ...s.comms, messages: [...s.comms.messages, client(s, 'client-lapsed', 'Deadline’s passed. Forget the bonus.')] },
    };
  }
  return s;
};
