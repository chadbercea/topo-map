import type { GameState } from './state';
import type { Contact } from './contacts';
import { eyesOn } from './imagery';
import { gameSpan } from './gameTime';

// Ordnance for strikes (GDD, reworked in ILI-1168): the drone strike is one use, clears the
// whole square (ILI-1252, drone.ts), and can fire blind; the sniper takes them out itself,
// seven rounds a call, at fighters HQ can see (ILI-1253, sniper.ts); the helicopter
// gun run strafes up to three rows it can see fighters in (ILI-1254, air.ts), and goes on
// cooldown after.

export type Weapon = 'drone' | 'sniper' | 'heli';
export const WEAPONS: Weapon[] = ['drone', 'sniper', 'heli'];

export type WeaponState = { unlocked: boolean; uses: number | null; readyAtMs: number }; // uses null: unlimited
export type Ordnance = Record<Weapon, WeaponState>;

// runMs: from the call until it's done; cooldownMs: then until it can be called again.
export const WEAPON = {
  drone: { name: 'Drone strike', cooldownMs: 0, runMs: 15_000 }, // air.ts
  sniper: { name: 'Sniper', cooldownMs: 0, runMs: 5_000 }, // sniper.ts
  heli: { name: 'Helicopter gun run', cooldownMs: 60_000, runMs: 14_000 }, // air.ts
} satisfies Record<Weapon, { name: string; cooldownMs: number; runMs: number }>;

export const initialOrdnance = (): Ordnance => ({
  drone: { unlocked: true, uses: 1, readyAtMs: 0 },
  sniper: { unlocked: true, uses: null, readyAtMs: 0 }, // a fresh sniper every call (ILI-1253)
  heli: { unlocked: true, uses: null, readyAtMs: 0 }, // unlocked from the start (ILI-1254)
});

// Weapons that only fire at fighters HQ can see; the drone can guess.
export const NEEDS_EYES: Record<Weapon, boolean> = { drone: false, sniper: true, heli: true };

// Why a weapon can't fire right now (at this contact, if given), or null if it can.
export function weaponBlocked(s: GameState, w: Weapon, c?: Contact): string | null {
  const o = s.ordnance[w];
  if (!o.unlocked) return 'Unlocks with upgrades';
  if (o.uses === 0) return 'Used';
  if (s.elapsedMs < o.readyAtMs) return `Ready in ${gameSpan(o.readyAtMs - s.elapsedMs)}`;
  if (s.sniper && !s.sniper.done) return 'Busy';
  if (c && NEEDS_EYES[w]) {
    const eyes = eyesOn(s, c);
    if (!eyes || eyes.level === 'stale') return 'No eyes on target';
  }
  return null;
}

export function spendWeapon(s: GameState, w: Weapon): GameState {
  const o = s.ordnance[w];
  return {
    ...s,
    ordnance: { ...s.ordnance, [w]: { ...o, uses: o.uses === null ? null : o.uses - 1, readyAtMs: s.elapsedMs + WEAPON[w].runMs + WEAPON[w].cooldownMs } },
  };
}
