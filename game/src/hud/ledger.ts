import { game } from '../sim/store';
import { wrapUp } from '../sim/wrapup';
import { unlockedWeapons, WEAPONS, type Weapon } from '../sim/ordnance';
import { UPGRADES, type UpgradeId } from '../sim/upgrades';

// Castle House's balance carries from mission to mission on this device (ILI-1316): saved when a
// mission ends, read back when the next one opens. Bankruptcy wipes it: a new PMC starts at zero.
// Storage can be missing (private mode), so fail quietly: the mission then opens at zero.
const KEY = 'pmc-war-room:balance';
const UNLOCKS = 'pmc-war-room:unlocks';
const UPGRADES_KEY = 'pmc-war-room:upgrades';

// The store's upgrades (ILI-1317): bought out of the balance carried forward, kept until
// bankruptcy.
export function loadUpgrades(): UpgradeId[] {
  try {
    const saved = JSON.parse(localStorage.getItem(UPGRADES_KEY) ?? '[]');
    return Array.isArray(saved) ? UPGRADES.map((u) => u.id).filter((id) => saved.includes(id)) : [];
  } catch {
    return [];
  }
}

// Why an upgrade can't be bought now, or null.
export function cantBuy(id: UpgradeId): string | null {
  if (loadUpgrades().includes(id)) return 'Owned';
  const u = UPGRADES.find((x) => x.id === id)!;
  return loadBalance() < u.price ? 'Not enough in the bank' : null;
}

export function buyUpgrade(id: UpgradeId): boolean {
  if (cantBuy(id)) return false;
  const u = UPGRADES.find((x) => x.id === id)!;
  try {
    localStorage.setItem(UPGRADES_KEY, JSON.stringify([...loadUpgrades(), id]));
    saveBalance(loadBalance() - u.price);
    return true;
  } catch {
    return false;
  }
}

// The capabilities carried in (ILI-1316): kept only by a mission that ended in the green. Under
// test automation everything's open, unless the URL asks (?unlocks): a test of something else
// isn't a test of buying it.
const automated = typeof navigator !== 'undefined' && navigator.webdriver === true && !new URLSearchParams(location.search).has('unlocks');
export function loadUnlocks(): Weapon[] {
  if (automated) return [...WEAPONS];
  try {
    const saved = JSON.parse(localStorage.getItem(UNLOCKS) ?? '[]');
    return Array.isArray(saved) ? WEAPONS.filter((w) => saved.includes(w)) : [];
  } catch {
    return [];
  }
}

export function loadBalance(): number {
  try {
    const n = Number(localStorage.getItem(KEY));
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

function saveBalance(n: number) {
  try {
    localStorage.setItem(KEY, String(n));
  } catch {
    // not kept; the next mission opens at zero
  }
}

// Watch for a mission's end and file its closing balance.
export function keepLedger() {
  let ended = false;
  game.subscribe(() => {
    const s = game.get();
    const now = s.phase === 'ended';
    if (now && !ended) {
      const closing = s.bankrupt ? 0 : wrapUp(s).budget;
      saveBalance(closing);
      try {
        localStorage.setItem(UNLOCKS, JSON.stringify(closing >= 0 && !s.bankrupt ? unlockedWeapons(s) : []));
        if (s.bankrupt) localStorage.setItem(UPGRADES_KEY, '[]'); // a new PMC starts with nothing (ILI-1317)
      } catch {
        // not kept
      }
    }
    ended = now;
  });
}
