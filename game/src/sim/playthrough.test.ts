import { describe, expect, it } from 'vitest';
import { initialState, MISSION_MS } from './state';
import { createStore } from './store';

// Whole missions under simple HQ strategies, to catch the team getting stuck anywhere.
function play(strategy: 'sharp' | 'silent') {
  const store = createStore(initialState());
  for (let t = 0; t < MISSION_MS && store.get().team.waypoint < store.get().team.route.length; t += 100) {
    store.tick(100);
    if (strategy === 'silent') continue;
    const s = store.get();
    if (s.minigame?.status === 'active') {
      store.tapMiniGame(s.minigame.targets[s.minigame.hits]); // a perfect scan
      continue;
    }
    if (s.minigame) store.closeMiniGame();
    const call = s.comms.messages.find((m) => m.id === s.team.holdFor && m.status === 'new');
    if (!call?.responses) continue;
    const pick = call.node === 'unimaged' ? (s.resources.scans ? 'send' : 'blind') : 'attack';
    store.respond(call.id, pick);
  }
  return store.get();
}

describe('playthrough', () => {
  it('a sharp HQ scans ahead, finds both contacts and gets ALPHA to the end of the route', () => {
    const s = play('sharp');
    expect(s.team.waypoint).toBe(s.team.route.length);
    expect(s.contacts.filter((c) => c.square === 'E3' || c.square === 'C2').every((c) => c.status === 'cleared')).toBe(true);
    expect(s.comms.messages.some((m) => m.text.startsWith('Ambush'))).toBe(false);
    expect(s.team.operators.every((o) => o.health > 0)).toBe(true);
  });

  it('a silent HQ still gets ALPHA there, but through ambushes', () => {
    const s = play('silent');
    expect(s.team.waypoint).toBe(s.team.route.length);
    expect(s.comms.messages.filter((m) => m.text.startsWith('Ambush')).length).toBe(2);
  });
});
