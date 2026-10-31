import { describe, expect, it } from 'vitest';
import { squareCenter } from '../map/grid';
import { LOOT } from './missions/blackBox';
import type { GameState } from './state';
import { LOADOUT } from './team';
import { run, walking } from './testkit';

// The salvage convoy that cuts the exfil (ILI-1192): clear ground, the convoy left in. ALPHA
// weighs it on its own (ILI-1315): takes it for the haul, or swings wide to the alternate exfil.
const until = (s: GameState, done: (x: GameState) => boolean) => {
  for (let t = 0; t < 600_000 && !done(s); t += 100) s = run(s, 100);
  return s;
};
const withConvoy = (s0: GameState = walking()): GameState => ({ ...s0, script: { ...s0.script, fired: s0.script.fired.filter((f) => f !== 'convoy-on-exfil') } });
const toTheConvoy = (s0?: GameState) => until(withConvoy(s0), (x) => x.contacts.some((c) => c.id === 'convoy'));
// Down to 40% ammo: under the convoy's weight, and not yet low enough to ask for a resupply.
const lowAmmo = (s: GameState): GameState => ({ ...s, team: { ...s.team, operators: s.team.operators.map((o) => ({ ...o, ammo: Math.round(LOADOUT[o.role].ammo * 0.4) })) } });

describe('the salvage convoy on the exfil (ILI-1192, ILI-1315)', () => {
  it('pulls onto the exfil once the black box is out; HQ knows, and ALPHA isn\u2019t asked anything', () => {
    const s = toTheConvoy();
    expect(s.mission).toMatchObject({ phase: 'exfil', blackBox: true });
    expect(s.contacts.find((c) => c.id === 'convoy')).toMatchObject({ square: 'B1', status: 'revealed' });
    expect(s.events.some((e) => e.id === 'contact-convoy' && e.square === 'B1')).toBe(true);
    expect(s.comms.messages.some((m) => m.id === 'exfil-cut')).toBe(false);
    expect(s.team.holdFor).toBeNull();
  });

  it('a strong ALPHA takes it: fights for the haul and exfils at B1', () => {
    const s0 = toTheConvoy();
    const before = s0.resources.budget;
    const s = until(s0, (x) => x.phase === 'ended');
    expect(s.comms.messages.some((m) => /Contact in B1, a salvage convoy.*We'll take them\./.test(m.text))).toBe(true);
    expect(s.contacts.find((c) => c.id === 'convoy')?.status).toBe('cleared');
    expect(s.comms.messages.some((m) => m.id === 'convoy-loot')).toBe(true);
    expect(s.resources.budget).toBeGreaterThanOrEqual(before + LOOT);
    expect(s.mission.c).toBe('B1');
  });

  it('a spent ALPHA won\u2019t: it swings wide to the alternate exfil at A2 and gets out there', () => {
    const s0 = toTheConvoy(lowAmmo(walking()));
    const s1 = until(s0, (x) => x.mission.c !== 'B1');
    expect(s1.mission.c).toBe('A2');
    expect(s1.team.route.slice(-3)).toEqual(['C2', 'B2', 'A2']);
    expect(s1.comms.messages.some((m) => /alternate exfil at A2/.test(m.text))).toBe(true);
    const s = until({ ...s1, map: { ...s1.map, scanned: [...s1.map.scanned, 'B2', 'A2'] } }, (x) => x.phase === 'ended');
    expect(s.mission.phase).toBe('complete');
    expect(s.team.position).toEqual(squareCenter('A2'));
    expect(s.contacts.find((c) => c.id === 'convoy')?.status).toBe('revealed'); // left alone
  });
});
