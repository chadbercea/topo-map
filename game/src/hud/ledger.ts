import { WEAPONS, type Weapon } from '../sim/ordnance';
import { OPENING_BUDGET } from '../sim/prices';

// Every mission opens fresh (ILI-1405): $10M in the bank, the sniper, drone and heli all on
// call (each call still costs), no upgrades. Nothing carries from mission to mission.
export const opening = (): [number, Weapon[], string[]] => [OPENING_BUDGET, [...WEAPONS], []];

// The balance, unlocks and upgrades an older build saved on this device (ILI-1316, ILI-1317):
// cleared, so an old debt never comes back. Storage can be missing (private mode).
const OLD = ['pmc-war-room:balance', 'pmc-war-room:unlocks', 'pmc-war-room:upgrades'];
export function clearOldSaves() {
  try {
    OLD.forEach((k) => localStorage.removeItem(k));
  } catch {
    // nothing to clear
  }
}
