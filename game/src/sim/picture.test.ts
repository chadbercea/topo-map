import { describe, expect, it } from 'vitest';
import { makeContact, moveContact } from './contacts';
import { postDecoded } from './intel';
import { knownTo } from './picture';
import { initialState, type GameState } from './state';
import { lockedStore, pulled, run, walking } from './testkit';

// ALPHA only reroutes on what it knows (ILI-1495): intel HQ sent it, or its own eyes. Never on the
// sim's ground truth, and never on what HQ found but kept to itself.
const checkpoint = () => ({ ...makeContact('checkpoint', 'E3', 'a fortified checkpoint', 1.6, [1, 5, 6, 9, 10]) });
const ahead = (): GameState => ({ ...walking(), contacts: [checkpoint()] }); // too strong to walk into
const until = (s: GameState, done: (x: GameState) => boolean, maxMs = 120_000) => {
  for (let t = 0; t < maxMs && !done(s); t += 100) s = run(s, 100);
  return s;
};
const weighed = (s: GameState) => s.comms.messages.some((m) => m.from === 'ALPHA' && /Contact in E3/.test(m.text));
// HQ analyzes E3 (ORION-3 locked on it): its package goes on the shelf. pull: and ALPHA pulls it
// down to its SATCOM devices (ILI-1499).
const scanned = (s: GameState, pull: boolean) => {
  const store = lockedStore(s);
  store.scan('E3');
  return pull ? pulled(store.get()) : store.get();
};

describe('ALPHA routes on its own picture (ILI-1495)', () => {
  it('a group nobody found: ALPHA never goes around it', () => {
    const s = until(ahead(), (x) => !!x.team.fight);
    expect(weighed(s)).toBe(false);
    expect(s.team.route).toContain('E3');
    expect(s.team.fight?.square).toBe('E3');
  });

  it('HQ found it and posted it, but ALPHA hasn’t pulled it yet: it doesn’t know (ILI-1499)', () => {
    const s0 = scanned(ahead(), false);
    expect(s0.contacts[0].status).toBe('revealed');
    expect(s0.intel.pushes.some((p) => p.square === 'E3' && p.state === 'posted')).toBe(true);
    expect(s0.team.known).toEqual({});
    const pulling = run(s0, 100); // it syncs, but the download takes a few seconds
    expect(pulling.intel.download).toBeTruthy();
    expect(pulling.team.known).toEqual({});
  });

  it('ALPHA pulls the package: now it knows, weighs it, and goes around', () => {
    const s0 = scanned(ahead(), true);
    expect(s0.team.known.checkpoint).toMatchObject({ square: 'E3', units: 5 });
    const s = until(s0, (x) => weighed(x));
    expect(s.comms.messages.some((m) => /Contact in E3, a fortified checkpoint\. Not taking that\. Going around via [A-H]\d\./.test(m.text))).toBe(true);
    expect(s.team.route).not.toContain('E3');
  });

  it('it goes by where it was told they are: moved off unseen, ALPHA still goes around E3', () => {
    let s = moveContact(scanned(ahead(), true), 'checkpoint', 'H1'); // the truth: gone
    s = until(s, (x) => weighed(x));
    expect(s.team.route).not.toContain('E3');
  });

  it('a newer photo showing the square empty takes them off ALPHA’s picture', () => {
    const told = scanned(ahead(), true);
    const empty = { ...moveContact(told, 'checkpoint', 'H1'), intel: { ...told.intel, graded: [] } };
    const s = scanned(empty, true);
    expect(s.team.known.checkpoint).toBeUndefined();
    expect(knownTo(s, 'E3')).toBeUndefined();
  });

  it('a square on video ALPHA has pulled the feed of keeps its picture live: what walks in, it knows', () => {
    const s0 = walking();
    const feed = { id: 'push-0', atMs: 0, source: 'IMINT' as const, square: 'E3', grade: 'video' as const, amount: 60, state: 'fed' as const };
    let s: GameState = { ...s0, contacts: [{ ...checkpoint(), square: 'H1' }], intel: { ...s0.intel, graded: ['E3'], live: ['E3'], pushes: [feed] } };
    s = run(s, 100);
    expect(s.team.known).toEqual({});
    s = run(moveContact(s, 'checkpoint', 'E3'), 100);
    expect(s.team.known.checkpoint).toMatchObject({ square: 'E3', units: 5 });
  });

  it('a video feed still on the shelf tells ALPHA nothing (ILI-1499)', () => {
    const s0 = walking();
    const feed = { id: 'push-0', atMs: 0, source: 'IMINT' as const, square: 'E3', grade: 'video' as const, amount: 60, state: 'posted' as const };
    const s: GameState = { ...s0, contacts: [checkpoint()], intel: { ...s0.intel, graded: ['E3'], live: ['E3'], pushes: [feed], syncedAt: 'G5', download: null } };
    const one = { ...s, team: { ...s.team, position: s0.team.position } };
    expect(run(one, 100).team.known).toEqual({}); // mid-square, on the move: not pulled yet
  });

  it('a decoded intercept with a fix, once ALPHA pulls it off the shelf, tells ALPHA where they are (ILI-1499)', () => {
    const s0 = initialState();
    const found = scanned({ ...s0, contacts: [checkpoint()] }, false);
    const s1: GameState = postDecoded(found, 'E3', 'checkpoint', 35);
    expect(s1.team.known.checkpoint).toBeUndefined(); // posted, not pulled
    const s2 = pulled(s1);
    expect(s2.team.known.checkpoint).toMatchObject({ square: 'E3' });
    expect(s2.contacts.find((c) => c.id === 'checkpoint')!.planKnown).toBe(true);
  });
});
