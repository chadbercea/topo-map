import { describe, expect, it } from 'vitest';
import { kindOf, liveAlerts, ALERT_MS } from './comms';
import { initialState, MISSION_MS } from './state';
import { createStore } from './store';
import { step } from './systems';
import { asking, run } from './testkit';

describe('message kinds (ILI-1171)', () => {
  it('decision calls are calls; flagged news is an alert; everything else is log', () => {
    const s = asking();
    const call = s.comms.messages.find((m) => m.node === 'resupply')!;
    expect(kindOf(call)).toBe('call');
    expect(kindOf({ id: 'ambush', from: 'ALPHA', text: 'HQ, ALPHA, CONTACT, ambush, E3. TIC.', atMs: 0, status: 'new', holds: false, alert: true })).toBe('alert');
    expect(kindOf({ id: 'x', from: 'ALPHA', text: 'Moving in hard.', atMs: 0, status: 'read', holds: false })).toBe('log');
  });

  it('alerts stay up for a few seconds of mission time, then leave the screen', () => {
    const s0 = step(initialState(), 100);
    const ambush = { id: 'ambush', from: 'ALPHA', text: 'HQ, ALPHA, CONTACT, ambush, E3. TIC.', atMs: s0.elapsedMs, status: 'new' as const, holds: false, alert: true };
    const s = { ...s0, comms: { ...s0.comms, messages: [...s0.comms.messages, ambush] } };
    expect(liveAlerts(s.comms, s.elapsedMs).map((m) => m.id)).toContain('ambush');
    const later = run(s, ALERT_MS + 100);
    expect(liveAlerts(later.comms, later.elapsedMs).map((m) => m.id)).not.toContain('ambush');
  });

  it('a whole sharp playthrough opens far fewer cards than it sends messages', () => {
    const store = createStore(initialState());
    for (let t = 0; t < MISSION_MS && store.get().phase !== 'ended'; t += 100) {
      store.tick(100);
      const s = store.get();
      if (s.minigame?.status === 'active') continue;
      if (s.satellite.state === 'onStation') store.capture('photo');
      if (s.satellite.result) store.closeLook();
      const call = s.comms.messages.find((m) => m.id === s.team.holdFor && m.status === 'new');
      if (call?.responses) store.respond(call.id, call.responses[0].id);
    }
    const all = store.get().comms.messages;
    const cards = all.filter((m) => kindOf(m) === 'call');
    expect(cards.length).toBeLessThanOrEqual(all.length / 3);
    expect(cards.every((m) => m.responses)).toBe(true); // every card asks for an answer
  });
});
