import { describe, expect, it } from 'vitest';
import { makeContact, moveContact } from './contacts';
import { postDecoded } from './intel';
import { knownTo } from './picture';
import { initialState, type GameState } from './state';
import { lockedStore, run, walking } from './testkit';

// ALPHA only reroutes on what it knows (ILI-1495): intel HQ sent it, or its own eyes. Never on the
// sim's ground truth, and never on what HQ found but kept to itself.
const checkpoint = () => ({ ...makeContact('checkpoint', 'E3', 'a fortified checkpoint', 1.6, [1, 5, 6, 9, 10]) });
const ahead = (): GameState => ({ ...walking(), contacts: [checkpoint()] }); // too strong to walk into
const until = (s: GameState, done: (x: GameState) => boolean, maxMs = 120_000) => {
  for (let t = 0; t < maxMs && !done(s); t += 100) s = run(s, 100);
  return s;
};
const weighed = (s: GameState) => s.comms.messages.some((m) => m.from === 'ALPHA' && /CONTACT E3/.test(m.text));
// HQ analyzes E3 (ORION-3 locked on it): ALPHA has it at once (ILI-1558).
const scanned = (s: GameState) => {
  const store = lockedStore(s);
  store.scan('E3');
  return store.get();
};

describe('ALPHA routes on its own picture (ILI-1495)', () => {
  it('a group nobody found: ALPHA never goes around it', () => {
    const s = until(ahead(), (x) => !!x.team.fight);
    expect(weighed(s)).toBe(false);
    expect(s.team.route).toContain('E3');
    expect(s.team.fight?.square).toBe('E3');
  });

  it('HQ analyzes it: ALPHA knows at once, weighs it, and goes around (ILI-1558)', () => {
    const s0 = scanned(ahead());
    expect(s0.team.known.checkpoint).toMatchObject({ square: 'E3', units: 5 });
    const s = until(s0, (x) => weighed(x));
    expect(s.comms.messages.some((m) => /CONTACT E3, a fortified checkpoint\. Too strong to take\. Moving around via [A-H]\d\./.test(m.text))).toBe(true);
    expect(s.team.route).not.toContain('E3');
  });

  it('it goes by where it was told they are: moved off unseen, ALPHA still goes around E3', () => {
    let s = moveContact(scanned(ahead()), 'checkpoint', 'H1'); // the truth: gone
    s = until(s, (x) => weighed(x));
    expect(s.team.route).not.toContain('E3');
  });

  it('a newer photo showing the square empty takes them off ALPHA’s picture', () => {
    const told = scanned(ahead());
    const empty = { ...moveContact(told, 'checkpoint', 'H1'), intel: { ...told.intel, graded: [] } };
    const s = scanned(empty);
    expect(s.team.known.checkpoint).toBeUndefined();
    expect(knownTo(s, 'E3')).toBeUndefined();
  });

  it('a square on video ALPHA has the feed of keeps its picture live: what walks in, it knows', () => {
    const s0 = walking();
    const feed = { id: 'push-0', atMs: 0, source: 'IMINT' as const, square: 'E3', grade: 'video' as const, amount: 60, state: 'fed' as const };
    let s: GameState = { ...s0, contacts: [{ ...checkpoint(), square: 'H1' }], intel: { ...s0.intel, graded: ['E3'], live: ['E3'], pushes: [feed] } };
    s = run(s, 100);
    expect(s.team.known).toEqual({});
    s = run(moveContact(s, 'checkpoint', 'E3'), 100);
    expect(s.team.known.checkpoint).toMatchObject({ square: 'E3', units: 5 });
  });

  it('a decoded intercept with a fix tells ALPHA where they are, at once (ILI-1558)', () => {
    const s0 = initialState();
    const found = scanned({ ...s0, contacts: [checkpoint()] });
    const s2: GameState = postDecoded(found, 'E3', 'checkpoint', 35);
    expect(s2.team.known.checkpoint).toMatchObject({ square: 'E3' });
    expect(s2.contacts.find((c) => c.id === 'checkpoint')!.planKnown).toBe(true);
  });
});
