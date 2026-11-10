import type { GameState } from './state';
import { lockedOn } from './satellite';

// What a satellite can tell about one hostile fighter (ILI-1412): what he carries, what he's
// doing, how he's holding up. Never his rank, his ammo or his exact health: imagery can't see
// those.
export type Weapon = 'Rifle' | 'Machine gun' | 'RPG' | 'Sniper rifle';
export type Activity = 'Static' | 'Moving' | 'Firing';
export type Condition = 'Upright' | 'Limping';

// Each fighter's weapon is his for the mission: picked from his id, mostly riflemen.
const ARMS: [Weapon, number][] = [['Rifle', 0.6], ['Machine gun', 0.15], ['RPG', 0.15], ['Sniper rifle', 0.1]];
const hash = (id: string) => {
  let h = 2166136261;
  for (const ch of id) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return (h >>> 0) / 2 ** 32;
};
export function weaponOf(fighterId: string): Weapon {
  let r = hash(fighterId);
  for (const [w, p] of ARMS) if ((r -= p) < 0) return w;
  return 'Rifle';
}

export function activityOf(s: GameState, contactId: string): Activity {
  const c = s.contacts.find((x) => x.id === contactId);
  if (s.team.fight?.contactId === contactId) return 'Firing';
  return c?.move ? 'Moving' : 'Static';
}

// The group's real health in a fight (what's left of it), as a satellite would read it: men
// still upright, or hurt and slow. A fighter who's down is a kill site, not a fighter.
export function conditionOf(s: GameState, contactId: string): Condition {
  const f = s.team.fight;
  return f?.contactId === contactId && f.enemy / f.full < 0.5 ? 'Limping' : 'Upright';
}

// The satellite is over him: ORION-3 locked on his square, its picture live.
export const satOver = (s: GameState, square: string) => lockedOn(s, square) && !!s.imagery[square]?.live;
