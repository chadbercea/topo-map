import type { Message } from './comms';
import type { GameState } from './state';
import type { System } from './systems';

// Noise (GDD): strikes can tell the enemy a PMC is in the area. Ordnance and fights make
// noise, it fades over time, and past the threshold the enemy is alerted for the rest of the
// mission: every live contact hardens and ambushes hit harder.

export const NOISE = { drone: 40, sniperRound: 6, heli: 50, firefight: 15 };
export const ALERT_AT = 60;
export const FADE_PER_S = 0.5;
export const ALERT_HARDEN = 1.25;
export const ALERT_AMBUSH = 1.5;

// Deniability (GDD): too much noise and the client threatens to disown the operation; keep
// going and it does. Disowned: the contract is void and the client cuts ordnance support.
export const WARN_AT = 75;
export const DISOWN_AT = 95;
export type Deniability = 'clean' | 'warned' | 'disowned';

export const makeNoise = (s: GameState, amount: number): GameState => ({ ...s, noise: Math.min(100, s.noise + amount) });

export const noiseSystem: System = (s, dt) => {
  let next = s.noise > 0 ? { ...s, noise: Math.max(0, s.noise - (FADE_PER_S * dt) / 1000) } : s;
  if (!s.alerted && s.noise >= ALERT_AT) next = alert(next);
  if (s.deniability === 'clean' && s.noise >= WARN_AT) next = client(next, 'warned', 'client-warning', 'This is getting loud. Keep it quiet or we don\u2019t know you.');
  if (s.deniability === 'warned' && s.noise >= DISOWN_AT) next = disown(next);
  return next;
};

function client(s: GameState, deniability: Deniability, id: string, text: string): GameState {
  const m: Message = { id, from: 'CLIENT', text, atMs: s.elapsedMs, status: 'new', holds: false };
  return { ...s, deniability, comms: { ...s.comms, minimized: false, messages: [...s.comms.messages, m] } };
}

function disown(s: GameState): GameState {
  const cut = (w: keyof GameState['ordnance']) => ({ ...s.ordnance[w], unlocked: false });
  return {
    ...client(s, 'disowned', 'client-disowned', 'We never heard of you. The contract is void, and so is your air support.'),
    ordnance: { drone: cut('drone'), sniper: cut('sniper'), heli: cut('heli') },
  };
}

function alert(s: GameState): GameState {
  const call: Message = {
    id: 'enemy-alerted',
    from: 'HQ',
    text: 'Enemy radio net just lit up. They know a PMC is in the area. Expect them ready.',
    atMs: s.elapsedMs,
    status: 'new',
    holds: false,
  };
  return {
    ...s,
    alerted: true,
    contacts: s.contacts.map((c) => (c.status === 'hidden' || c.status === 'revealed' ? { ...c, strength: c.strength * ALERT_HARDEN } : c)),
    comms: { ...s.comms, minimized: false, messages: [...s.comms.messages, call] },
  };
}
