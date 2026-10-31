// Castle House's money, in one place (no imports, so anything can use it) (ILI-1316). A mission
// starts in the red: putting the team and the satellite network in the field is paid up front.
// The contract's money sits in escrow and comes out as the job gets done; the field pays on
// the spot; support costs what it costs, and HQ can spend into the red as far as it likes,
// until the PMC's credit runs out. The balance carries from mission to mission. Starting
// values are Claude's picks, for Chad to tune by feel.

export const DEPLOY = 400_000; // the team ($250k) and the ORION-3 network ($150k), up front
export const ESCROW_BOX = 750_000; // out of escrow when the black box is recovered
export const ESCROW_EXFIL = 750_000; // and the rest at exfil
export const CASH_PER_STRIKE_KILL = 15_000;
export const CASH_PER_TEAM_KILL = 10_000;
export const SEARCH_CASH = 25_000; // a swept kill site's documents
export const LOOT = 200_000; // the salvage convoy's haul
export const RESUPPLY_COST = 40_000;
export const CASUALTY_PENALTY = 100_000; // per operator down, at the end
export const BANKRUPT_AT = -4_000_000; // the PMC's credit line: below this it's shut down

// Capabilities (ILI-1316): none to start. Each is bought in order, sniper, drone, heli, once
// the balance can cover it; then every call costs, into the red if HQ likes. Unlocks carry to
// the next mission only if it ends in the green.
export const UNLOCK = { sniper: 250_000, drone: 750_000, heli: 1_500_000 } as const;
export const PER_CALL = { sniper: 10_000, drone: 150_000, heli: 625_000 } as const;
export const LEVELS = ['sniper', 'drone', 'heli'] as const;

// Where the mission's money went, for the P&L.
export type Ledger = { opening: number; deploy: number; escrow: number; field: number; spent: number };
export const openLedger = (opening: number): Ledger => ({ opening, deploy: -DEPLOY, escrow: 0, field: 0, spent: 0 });
