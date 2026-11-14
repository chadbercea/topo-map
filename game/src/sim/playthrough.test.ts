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
  }
  return store.get();
}

describe('playthrough', () => {
  // The map is rolled per seed (ILI-1544), so these hold across seeds, not on one fixed layout.
  const seeds = Array.from({ length: 12 }, (_, i) => i + 1);
  const tally = (strategy: 'sharp' | 'silent') =>
    seeds.map((seed) => play(strategy, seed)).reduce((n, s) => ({ wins: n.wins + +(s.mission.phase === 'complete'), lost: n.lost + s.stats.lost.length, ambushes: n.ambushes + s.comms.messages.filter((m) => m.text.startsWith('Ambush')).length }), { wins: 0, lost: 0, ambushes: 0 });

  it('a sharp HQ scans ahead: ALPHA makes its own calls on what it was sent, and gets out on nearly every seed', () => {
    const s = play('sharp');
    expect(s.comms.messages.filter((m) => m.from === 'ALPHA' && m.responses).every((m) => m.node === 'resupply')).toBe(true); // nothing else asked
    // Groups beside the route can see ALPHA too (ILI-1544), and this HQ only scans the route itself:
    // it can still lose a map to a flank ambush, never by ALPHA getting stuck.
    const runs = seeds.map((seed) => play('sharp', seed));
    expect(runs.filter((r) => r.mission.phase === 'complete').length).toBeGreaterThanOrEqual((seeds.length * 2) / 3); // 9 of 12 since exfil locks resupply (ILI-1545)
    for (const r of runs) if (r.mission.phase !== 'complete') expect(r.team.operators.every((o) => o.health <= 0)).toBe(true);
  });

  // The player's intel decides how ALPHA does (ILI-1496). With nothing sent, every group it meets is
  // an ambush, and it pays for it in men; the mission can still be won.
  it('a silent HQ: every group ALPHA meets is an ambush, and across seeds it costs more men than a sharp HQ', () => {
    const s = play('silent', 5);
    const fights = s.comms.messages.filter((m) => /^Ambush|^Contact! Engaging/.test(m.text));
    expect(fights.length).toBeGreaterThan(0);
    expect(fights.every((m) => m.text.startsWith('Ambush'))).toBe(true);
    const sharp = tally('sharp');
    const silent = tally('silent');
    expect(silent.ambushes).toBeGreaterThan(sharp.ambushes);
    expect(silent.lost).toBeGreaterThan(sharp.lost);
    expect(silent.wins).toBeGreaterThan(seeds.length / 2); // still possible
  });

  // The real gauge, no pinning (ILI-1485, ILI-1499): HQ only works ALPHA's intel asks by hand
  // (click, Analyze) and ALPHA pulls each package off the shelf itself. The opening works (held at
  // the infil, released by its first pull within seconds) and the mission is won across seeds.
  it('unfed, HQ only answers the intel asks: ALPHA pulls each package, moves off the infil, and never stalls', () => {
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
      // Out, or lost in a fight on the harder rolled map (ILI-1544): never stuck on the way.
      const end = store.get();
      expect(end.mission.phase === 'complete' || end.team.operators.every((o) => o.health <= 0)).toBe(true);
    }
  });
});
