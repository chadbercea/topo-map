import type { GameState } from './state';
import type { Contact } from './contacts';
import { eyesOn } from './imagery';
import { countdown } from './gameTime';
import type { Message } from './comms';
import type { System } from './systems';

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
  if (s.elapsedMs < o.readyAtMs) return `Ready in ${countdown(o.readyAtMs - s.elapsedMs)}`; // m:ss, ticking down (ILI-1273)
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

// A weapon back from its cooldown says so on the radio (ILI-1273), so HQ knows the option is
// back without checking. Only those with a cooldown: the drone's one use and the sniper's fresh
// team every call never go away to come back.
export const CALLSIGN: Record<Weapon, string> = { drone: 'REAPER-1', sniper: 'OVERWATCH', heli: 'HAMMER-2' };
const BACK: Record<Weapon, string> = { drone: 'Rearmed and on station.', sniper: 'In position.', heli: 'Rearmed and back on station. Ready for tasking.' };

export const ordnanceSystem: System = (s, dt) => {
  let next = s;
  for (const w of WEAPONS) {
    const o = s.ordnance[w];
    if (!WEAPON[w].cooldownMs || !o.readyAtMs || s.elapsedMs - dt >= o.readyAtMs || s.elapsedMs < o.readyAtMs) continue;
    const m: Message = { id: `ready-${w}-${o.readyAtMs}`, from: CALLSIGN[w], text: BACK[w], atMs: s.elapsedMs, status: 'new', holds: false };
    next = { ...next, comms: { ...next.comms, messages: [...next.comms.messages, m] } };
  }
  return next;
};
