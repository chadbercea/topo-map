import { describe, expect, it } from 'vitest';
import { CASUALTY_PENALTY, outcomeOf, wrapUp } from './wrapup';
import { BANKRUPT_AT, DEPLOY, ESCROW_BOX, ESCROW_EXFIL } from './prices';
import { spend } from './sites';
import { initialState, MISSION_MS, type GameState } from './state';
import { run, walking } from './testkit';
import { createStore } from './store';

const until = (s: GameState, done: (x: GameState) => boolean, maxMs = 600_000) => {
  for (let t = 0; t < maxMs && !done(s); t += 100) s = run(s, 100);
  return s;
};
const finished = () => until(walking(), (x) => x.phase === 'ended');

describe('wrap-up and the P&L (ILI-1316)', () => {
  it('a clean exfil with the black box is a win: deployment up front, the contract out of escrow', () => {
    const s = finished();
    const w = wrapUp(s);
    expect(w.outcome).toBe('win');
    expect(w.objectives.every((o) => o.done)).toBe(true);
    expect(w.payout.find((p) => p.label === 'Deployment')?.amount).toBe(-DEPLOY);
    expect(w.payout.find((p) => p.label === 'Contract, out of escrow')?.amount).toBe(ESCROW_BOX + ESCROW_EXFIL);
    expect(w.budget).toBe(s.resources.budget);
    expect(w.pnl).toBe(w.budget - 0); // opened at zero
  });

  it('a mission opens in the red: the deployment is paid up front, on the balance carried in', () => {
    expect(initialState().resources.budget).toBe(-DEPLOY);
    expect(initialState(undefined, undefined, 250_000).resources.budget).toBe(250_000 - DEPLOY);
  });

  it('casualties complete the mission but are not a win, and cost money', () => {
    const s0 = finished();
    const s = { ...s0, team: { ...s0.team, operators: s0.team.operators.map((o, i) => (i === 0 ? { ...o, health: 0 } : o)) } };
    const w = wrapUp(s);
    expect(w.outcome).toBe('casualties');
    expect(w.objectives.find((o) => o.label === 'No casualties')?.done).toBe(false);
    expect(w.budget).toBe(s.resources.budget - CASUALTY_PENALTY);
  });

  it('time running out before exfil is a failure: nothing out of escrow, the deployment lost', () => {
    const s = run({ ...initialState(), timer: { remainingMs: 1_000, totalMs: 600_000 } }, 1_100);
    expect(s.phase).toBe('ended');
    const w = wrapUp(s);
    expect(w.outcome).toBe('failed');
    expect(w.reason).toBe('Time ran out before exfil.');
    expect(w.payout.find((p) => p.label === 'Contract, out of escrow')?.amount).toBe(0);
    expect(w.pnl).toBe(-DEPLOY);
  });

  it('losing the whole team ends the mission as a failure', () => {
    const s0 = walking();
    const s = run({ ...s0, team: { ...s0.team, operators: s0.team.operators.map((o) => ({ ...o, health: 0 })) } }, 100);
    expect(s.phase).toBe('ended');
    expect(outcomeOf(s)).toBe('failed');
    expect(wrapUp(s).reason).toBe('The team was lost.');
  });

  it('spending past the credit line is bankruptcy, mid-mission: the operation is over', () => {
    const s0 = walking();
    const s = spend({ ...s0, resources: { ...s0.resources, budget: BANKRUPT_AT + 10_000 } }, 40_000);
    expect(s.bankrupt).toBe(true);
    expect(s.phase).toBe('ended');
    expect(outcomeOf(s)).toBe('bankrupt');
    expect(wrapUp(s).reason).toMatch(/lost its credit/);
  });

  it('spending into the red is fine short of that: a resupply goes up with the balance negative', () => {
    const s0 = walking();
    const s = spend(s0, 40_000);
    expect(s.resources.budget).toBe(-DEPLOY - 40_000);
    expect(s.bankrupt).toBe(false);
    expect(s.resources.ledger.spent).toBe(-40_000);
  });

  it('the ten-minute clock is the limit', () => {
    expect(MISSION_MS).toBe(600_000);
  });
});

describe('mission length', () => {
  it('can be tuned, and Retry keeps the tuned length', () => {
    const store = createStore();
    store.setMissionLength(8);
    expect(store.get().timer).toEqual({ remainingMs: 480_000, totalMs: 480_000 });
    store.tick(100);
    store.restart();
    expect(store.get().timer.remainingMs).toBe(480_000);
    store.restart(300_000); // and a carried balance (ILI-1316)
    expect(store.get().resources.budget).toBe(300_000 - DEPLOY);
  });

  it('stays within 1 to 30 minutes', () => {
    const store = createStore();
    store.setMissionLength(0.1);
    expect(store.get().timer.totalMs).toBe(60_000);
    store.setMissionLength(99);
    expect(store.get().timer.totalMs).toBe(1_800_000);
  });
});
