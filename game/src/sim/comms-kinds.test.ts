import { describe, expect, it } from 'vitest';
import { kindOf, liveAlerts, ALERT_MS } from './comms';
import { initialState, MISSION_MS } from './state';
import { createStore } from './store';
import { step } from './systems';
import { run } from './testkit';

describe('message kinds (ILI-1171)', () => {
  it('decision calls are calls; flagged news is an alert; everything else is log', () => {
    const s = run(initialState(), 500);
    const call = s.comms.messages.find((m) => m.node === 'unimaged')!;
    expect(kindOf(call)).toBe('call');
    const alerted = step({ ...initialState(), noise: 70 }, 100);
    expect(kindOf(alerted.comms.messages.find((m) => m.id === 'enemy-alerted')!)).toBe('alert');
    expect(kindOf({ id: 'x', from: 'ALPHA', text: 'Moving in hard.', atMs: 0, status: 'read', holds: false })).toBe('log');
  });

  it('alerts stay up for a few seconds of mission time, then leave the screen', () => {
    const s = step({ ...initialState(), noise: 70 }, 100);
    expect(liveAlerts(s.comms, s.elapsedMs).map((m) => m.id)).toContain('enemy-alerted');
    const later = run(s, ALERT_MS + 100);
    expect(liveAlerts(later.comms, later.elapsedMs).map((m) => m.id)).not.toContain('enemy-alerted');
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
      if (call?.responses) store.respond(call.id, call.node === 'unimaged' ? 'send' : call.node === 'site' ? 'search' : 'attack');
    }
    const all = store.get().comms.messages;
    const cards = all.filter((m) => kindOf(m) === 'call');
    expect(cards.length).toBeLessThanOrEqual(all.length / 3);
    expect(cards.every((m) => m.responses)).toBe(true); // every card asks for an answer
  });
});
