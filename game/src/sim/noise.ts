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

export const makeNoise = (s: GameState, amount: number): GameState => ({ ...s, noise: Math.min(100, s.noise + amount) });

export const noiseSystem: System = (s, dt) => {
  let next = s.noise > 0 ? { ...s, noise: Math.max(0, s.noise - (FADE_PER_S * dt) / 1000) } : s;
  if (!s.alerted && s.noise >= ALERT_AT) next = alert(next);
  return next;
};

function alert(s: GameState): GameState {
  const call: Message = {
    id: 'enemy-alerted',
    from: 'HQ',
    text: 'Enemy radio net just lit up: they heard the strikes. They know a PMC is in the area.',
    atMs: s.elapsedMs,
    status: 'new',
    holds: false,
    alert: true,
  };
  return {
    ...s,
    alerted: true,
    contacts: s.contacts.map((c) => (c.status === 'hidden' || c.status === 'revealed' ? { ...c, strength: c.strength * ALERT_HARDEN } : c)),
    comms: { ...s.comms, messages: [...s.comms.messages, call] },
  };
}
