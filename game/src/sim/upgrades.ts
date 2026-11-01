import { BANKRUPT_AT, DEPLOY, PER_CALL } from './prices';
import type { GameState } from './state';

// The after-mission store (ILI-1317): what a private military corporation buys to do its job
// better, from the start of the next mission. Bought once each, out of the balance carried
// forward, and only while it covers the price; kept mission to mission until the PMC goes
// bankrupt. Each one changes the game where it says. Starting values are Claude's picks, for
// Chad to tune by feel.

export type UpgradeId = 'satellites' | 'analysts' | 'video2' | 'medical' | 'training' | 'rates' | 'turnaround' | 'lean' | 'credit' | 'clients';
export type Upgrade = { id: UpgradeId; group: string; name: string; what: string; price: number };

export const UPGRADES: Upgrade[] = [
  { id: 'satellites', group: 'Intel collection', name: 'More satellites', what: 'Faster revisits: ORION-3 slews 30% faster.', price: 300_000 },
  { id: 'analysts', group: 'Intel collection', name: 'More analysts', what: 'Photo intel is worth 50% more to ALPHA.', price: 400_000 },
  { id: 'video2', group: 'Intel collection', name: 'A second video feed', what: 'Video can be used twice a mission.', price: 600_000 },
  { id: 'medical', group: 'The teams', name: 'Field hospital', what: 'The team carries 50% more meds.', price: 250_000 },
  { id: 'training', group: 'The teams', name: 'Training', what: 'The team moves 15% faster on foot.', price: 350_000 },
  { id: 'rates', group: 'Support contracts', name: 'Better rates', what: 'Every strike costs 25% less.', price: 500_000 },
  { id: 'turnaround', group: 'Support contracts', name: 'Quick turnaround', what: 'The heli comes back in half the time.', price: 300_000 },
  { id: 'lean', group: 'Logistics', name: 'Lean deployment', what: 'Putting the team in the field costs 25% less.', price: 400_000 },
  { id: 'credit', group: 'The business', name: 'A bigger credit line', what: 'Bankrupt at −$6M instead of −$4M.', price: 500_000 },
  { id: 'clients', group: 'The business', name: 'Better clients', what: 'Contracts pay 20% more.', price: 750_000 },
];

const has = (owned: readonly string[], id: UpgradeId) => owned.includes(id);
const own = (s: GameState, id: UpgradeId) => has(s.upgrades, id);

// What each one changes, read where the game needs it.
export const deployCost = (owned: readonly string[]) => (has(owned, 'lean') ? DEPLOY * 0.75 : DEPLOY);
export const slewFactor = (s: GameState) => (own(s, 'satellites') ? 0.7 : 1);
export const photoFactor = (s: GameState) => (own(s, 'analysts') ? 1.5 : 1);
export const videos = (s: GameState) => (own(s, 'video2') ? 2 : 1);
export const medsFactor = (owned: readonly string[]) => (has(owned, 'medical') ? 1.5 : 1);
export const speedFactor = (s: GameState) => (own(s, 'training') ? 1.15 : 1);
export const perCall = (s: GameState, w: keyof typeof PER_CALL) => (own(s, 'rates') ? PER_CALL[w] * 0.75 : PER_CALL[w]);
export const cooldownFactor = (s: GameState) => (own(s, 'turnaround') ? 0.5 : 1);
export const bankruptAt = (s: GameState) => (own(s, 'credit') ? -6_000_000 : BANKRUPT_AT);
export const escrow = (s: GameState, amount: number) => (own(s, 'clients') ? amount * 1.2 : amount);
