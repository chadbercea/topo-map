import { describe, expect, it } from 'vitest';
import { initialState, MISSION_MS } from './state';
import { createStore } from './store';
import { fed } from './testkit';

// Whole missions under simple HQ strategies, to catch the team getting stuck anywhere. ALPHA
// decides for itself (ILI-1315): HQ only scans, and answers its one question (resupply).
function play(strategy: 'sharp' | 'silent') {
  const store = createStore(fed(initialState())); // fed: these test the route, not the gauge (ILI-1314)
  for (let t = 0; t < MISSION_MS && store.get().phase === 'running'; t += 100) {
    store.tick(100);
    const s = store.get();
    const call = s.comms.messages.find((m) => m.id === s.team.holdFor && m.status === 'new');
    if (call?.responses) store.respond(call.id, call.responses[0].id);
    if (strategy === 'silent') continue;
    if (s.minigame?.status === 'active') continue;
    // Scan the route ahead of ALPHA, one square at a time.
    const ahead = s.team.route.slice(s.team.waypoint).find((sq) => !s.map.scanned.includes(sq));
    if (s.satellite.state === 'idle' && ahead) store.lookAt(ahead);
    if (s.satellite.state === 'onStation') store.capture('photo');
    if (s.satellite.result) store.closeLook();
    // It jams the patrol's radio to buy time.
    const signal = s.events.find((e) => e.kind === 'signal' && e.status !== 'resolved');
    if (signal) store.jam(signal.id);
  }
  return store.get();
}

describe('playthrough', () => {
  it('a sharp HQ scans ahead: ALPHA sees every contact coming, makes its own calls, and gets out', () => {
    const s = play('sharp');
    expect(s.mission.phase).toBe('complete');
    expect(s.comms.messages.some((m) => m.text.startsWith('Ambush'))).toBe(false);
    expect(s.comms.messages.some((m) => m.from === 'ALPHA' && /Going around via|We'll take them/.test(m.text))).toBe(true);
    expect(s.comms.messages.filter((m) => m.from === 'ALPHA' && m.responses).every((m) => m.node === 'resupply')).toBe(true); // nothing else asked
  });

  it('a silent HQ: ALPHA walks in blind, and the checkpoint it never heard about ambushes it', () => {
    const s = play('silent');
    expect(s.team.waypoint).toBeGreaterThan(1);
    expect(s.comms.messages.some((m) => m.text.startsWith('Ambush'))).toBe(true);
  });
});
