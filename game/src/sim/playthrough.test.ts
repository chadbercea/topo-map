import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, initialState, MISSION_MS, MISSION_SEED } from './state';
import { createStore } from './store';
import { answerIntel, fed } from './testkit';
import { activePrompt } from './prompts';

// Whole missions under simple HQ strategies, to catch the team getting stuck anywhere. ALPHA
// decides for itself (ILI-1315): HQ only analyzes, and answers its one question (resupply).
function play(strategy: 'sharp' | 'silent', seed = MISSION_SEED) {
  const store = createStore(fed(initialState(DEFAULT_SETTINGS, MISSION_MS, 0, [], [], seed))); // fed: these test the route, not the gauge (ILI-1314)
  for (let t = 0; t < MISSION_MS && store.get().phase === 'running'; t += 100) {
    store.tick(100);
    const s = store.get();
    const call = s.comms.messages.find((m) => m.id === s.team.holdFor && m.status === 'new');
    if (call?.responses) store.respond(call.id, call.responses[0].id);
    if (strategy === 'silent') continue;
    if (s.minigame?.status === 'active') continue;
    // No send step (ILI-1499): each Analyze posts its package on the shelf, and ALPHA pulls them
    // itself as it reaches each square or holds. It only acts on what it has pulled (ILI-1495).
    // Scan the route ahead of ALPHA, one square at a time.
    const ahead = s.team.route.slice(s.team.waypoint).find((sq) => !s.map.scanned.includes(sq));
    if (s.satellite.state === 'idle' && ahead) store.lookAt(ahead);
    // Box out, it keeps ORION-3 over the exfil: whatever pulls onto the LZ is seen (ILI-1493).
    else if (s.satellite.state === 'idle' && s.mission.blackBox && s.satellite.aim !== s.mission.c) store.lookAt(s.mission.c);
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

  // The player's intel decides how ALPHA does (ILI-1496). With nothing sent, every group is an
  // ambush: costly, sometimes fatal, but the mission can still be won. Across seeds, a sharp HQ
  // wins every time and loses nobody.
  it('a silent HQ: ALPHA walks in blind, every group is an ambush, and it pays in men; it can still get out', () => {
    const s = play('silent');
    expect(s.comms.messages.some((m) => m.text === 'Ambush in E3! Returning fire.')).toBe(true);
    expect(s.stats.lost.length).toBeGreaterThan(0);
  });

  it('across seeds: no intel is clearly costlier than a sharp HQ, but still winnable (ILI-1496)', () => {
    const seeds = Array.from({ length: 12 }, (_, i) => i + 1);
    const tally = (strategy: 'sharp' | 'silent') =>
      seeds.map((seed) => play(strategy, seed)).reduce((n, s) => ({ wins: n.wins + +(s.mission.phase === 'complete'), lost: n.lost + s.stats.lost.length }), { wins: 0, lost: 0 });
    const sharp = tally('sharp');
    const silent = tally('silent');
    expect(sharp).toEqual({ wins: seeds.length, lost: 0 });
    expect(silent.wins).toBeGreaterThan(seeds.length / 2); // possible
    expect(silent.wins).toBeLessThan(seeds.length); // but not safe
    expect(silent.lost).toBeGreaterThanOrEqual(seeds.length * 1.5); // and it costs men every time
  });

  // The real gauge, no pinning (ILI-1485, ILI-1499): HQ only works ALPHA's intel asks by hand
  // (click, Analyze) and ALPHA pulls each package off the shelf itself. The opening works (held at
  // the infil, released by its first pull within seconds) and the mission is won across seeds.
  it('unfed, HQ only answers the intel asks: ALPHA pulls each package, moves off the infil, and gets out', () => {
    for (const seed of Array.from({ length: 6 }, (_, i) => i + 1)) {
      const store = createStore(initialState(DEFAULT_SETTINGS, MISSION_MS, 0, [], [], seed));
      let moved = -1;
      for (let t = 0; t < MISSION_MS && store.get().phase === 'running'; t += 100) {
        store.tick(100);
        const s = store.get();
        if (moved < 0 && s.team.activity.startsWith('Moving')) moved = s.elapsedMs;
        const call = s.comms.messages.find((m) => m.id === s.team.holdFor && m.status === 'new');
        if (call?.responses) store.respond(call.id, call.responses[0].id);
        answerIntel(store, activePrompt(s));
        if (s.satellite.result) store.closeLook();
      }
      expect(moved).toBeGreaterThan(0);
      expect(moved).toBeLessThan(15_000);
      expect(store.get().mission.phase).toBe('complete');
    }
  });
});
