import { describe, expect, it } from 'vitest';
import { initialState, type GameState } from './state';
import { createStore } from './store';
import { step } from './systems';
import { run } from './testkit';
import { wrapUp } from './wrapup';

// At 1:30 the client calls with a side job.
const offered = () => createStore(step({ ...initialState(), elapsedMs: 89_900 }, 100));

describe('client side job', () => {
  it('the client offers a bonus for fresh imagery of G2, against a deadline', () => {
    const s = offered().get();
    expect(s.sideJob).toMatchObject({ square: 'G2', reward: 10_000, status: 'offered' });
    const offer = s.comms.messages.find((m) => m.id === 'client-offer')!;
    expect(offer).toMatchObject({ from: 'CLIENT', holds: false });
    expect(offer.text).toMatch(/Extra \$10,000 .* radar site in G2 in the next 2 minutes/);
    expect(offer.responses?.map((r) => r.label)).toEqual(['Take the job', 'Pass']);
  });

  it('taking it starts the clock and marks G2; HQ answers the client', () => {
    const store = offered();
    store.respond('client-offer', 'accept');
    const s = store.get();
    expect(s.sideJob).toMatchObject({ status: 'active', deadlineMs: s.elapsedMs + 120_000 });
    expect(s.events.find((e) => e.id === 'side-job')).toMatchObject({ square: 'G2', kind: 'request' });
    expect(s.comms.messages.find((m) => m.id === 'client-offer-accept')?.from).toBe('HQ');
    expect(s.team.holdFor).not.toBe('client-offer'); // ALPHA doesn't wait on the client
  });

  it('a won scan of G2 in time pays the bonus, and the wrap-up lists it', () => {
    const store = offered();
    store.respond('client-offer', 'accept');
    store.manualScan('G2');
    for (const sq of store.get().minigame!.targets) store.tapMiniGame(sq);
    const s: GameState = store.get();
    expect(s.sideJob?.status).toBe('done');
    expect(s.resources.budget).toBe(10_000);
    expect(s.comms.messages.find((m) => m.id === 'client-paid')?.text).toMatch(/\$10,000 bonus/);
    expect(wrapUp({ ...s, mission: { ...s.mission, phase: 'complete', blackBox: true } }).payout).toContainEqual({ label: 'Client bonus', amount: 10_000 });
  });

  it('missing the deadline fails it', () => {
    const store = offered();
    store.respond('client-offer', 'accept');
    const s = run(store.get(), 120_100);
    expect(s.sideJob?.status).toBe('failed');
    expect(s.comms.messages.some((m) => m.id === 'client-lapsed')).toBe(true);
  });

  it('passing, or not answering, declines it', () => {
    const pass = offered();
    pass.respond('client-offer', 'decline');
    expect(pass.get().sideJob?.status).toBe('declined');
    const silent = run(offered().get(), 30_100);
    expect(silent.sideJob?.status).toBe('declined');
  });
});
