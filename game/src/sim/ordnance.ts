import type { GameState } from './state';

// Ordnance for seek and destroy (GDD): the drone strike is one use, a 2x2 blast; the
// sniper keeps working but slowly, one round at a time; the helicopter gun run unlocks
// through upgrades, so it shows as locked for now. Each goes on cooldown after a run.

export type Weapon = 'drone' | 'sniper' | 'heli';
export const WEAPONS: Weapon[] = ['drone', 'sniper', 'heli'];

export type WeaponState = { unlocked: boolean; uses: number | null; readyAtMs: number }; // uses null: unlimited
export type Ordnance = Record<Weapon, WeaponState>;

export const WEAPON = {
  drone: { name: 'Drone strike', cooldownMs: 0, runMs: 8_000, rounds: 1, cycleMs: 0 },
  sniper: { name: 'Sniper', cooldownMs: 30_000, runMs: 15_000, rounds: 8, cycleMs: 1_200 },
  heli: { name: 'Helicopter gun run', cooldownMs: 60_000, runMs: 10_000, rounds: 3, cycleMs: 600 },
} satisfies Record<Weapon, { name: string; cooldownMs: number; runMs: number; rounds: number; cycleMs: number }>;

export const initialOrdnance = (): Ordnance => ({
  drone: { unlocked: true, uses: 1, readyAtMs: 0 },
  sniper: { unlocked: true, uses: null, readyAtMs: 0 },
  heli: { unlocked: false, uses: null, readyAtMs: 0 },
});

// Why a weapon can't fire right now, or null if it can.
export function weaponBlocked(s: GameState, w: Weapon): string | null {
  const o = s.ordnance[w];
  if (!o.unlocked) return s.deniability === 'disowned' ? 'Client cut support' : 'Unlocks with upgrades';
  if (o.uses === 0) return 'Used';
  if (s.elapsedMs < o.readyAtMs) return `Ready in ${Math.ceil((o.readyAtMs - s.elapsedMs) / 1000)}s`;
  if (s.minigame?.status === 'active') return 'Busy';
  return null;
}

export function spendWeapon(s: GameState, w: Weapon): GameState {
  const o = s.ordnance[w];
  return {
    ...s,
    ordnance: { ...s.ordnance, [w]: { ...o, uses: o.uses === null ? null : o.uses - 1, readyAtMs: s.elapsedMs + WEAPON[w].runMs + WEAPON[w].cooldownMs } },
  };
}
