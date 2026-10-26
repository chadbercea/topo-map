import { describe, expect, it } from 'vitest';
import { BLACK_BOX } from './missions/blackBox';
import { missionDef, registerMission, say } from './script';
import { initialState, MISSION, type GameState } from './state';
import { step } from './systems';
import { reveal } from './contacts';
import { run, walking } from './testkit';

describe('mission script', () => {
  it('the game plays the Black Box script: route, clock, contacts, schedule and intel feed', () => {
    const s = initialState();
    expect(MISSION).toBe(BLACK_BOX);
    expect(missionDef('black-box')).toBe(BLACK_BOX);
    expect(s.team.route).toEqual(BLACK_BOX.route);
    expect(s.timer.remainingMs).toBe(BLACK_BOX.durationMs);
    expect(s.contacts.map((c) => c.id)).toEqual(['technicals', 'patrol', 'post']);
    expect(s.schedule).toBe(BLACK_BOX.schedule);
    expect(s.intel.queue).toBe(BLACK_BOX.feed);
    expect(s.script).toEqual({ mission: 'black-box', fired: [] });
  });

  it('each mission start gets fresh contacts', () => {
    expect(BLACK_BOX.contacts()).not.toBe(BLACK_BOX.contacts());
  });

  it('a trigger fires once, the first tick its condition holds', () => {
    let s = walking();
    s = reveal({ ...s, contacts: BLACK_BOX.contacts() }, ['E3'], 'ORION-3');
    s = step(s, 100);
    expect(s.script.fired).toContain('first-contact-hint');
    expect(s.comms.messages.filter((m) => m.id === 'hint-first-contact')).toHaveLength(1);
    expect(run(s, 1_000).comms.messages.filter((m) => m.id === 'hint-first-contact')).toHaveLength(1);
  });

  it('outcomes branch on what happened: the one-minute call depends on the black box', () => {
    const late = (blackBox: boolean): GameState => {
      const s = initialState();
      return step({ ...s, timer: { remainingMs: 60_000 }, mission: { ...s.mission, blackBox } }, 100);
    };
    expect(late(true).comms.messages.find((m) => m.id === 'warn-1min')?.text).toBe('One minute. Get them to exfil.');
    expect(late(false).comms.messages.find((m) => m.id === 'warn-1min')?.text).toMatch(/no black box/);
  });

  it('a mission is just data plus triggers: a new one can be registered and played', () => {
    const tiny = registerMission({
      ...BLACK_BOX,
      id: 'tiny',
      contacts: () => [],
      schedule: [],
      triggers: [{ id: 'hello', when: (s) => s.elapsedMs >= 500, then: (s) => say(s, 'HQ', 'hello', 'Hello from a test mission.') }],
    });
    const s = run({ ...walking(), script: { mission: tiny.id, fired: [] } }, 600);
    expect(s.comms.messages.find((m) => m.id === 'hello')?.text).toBe('Hello from a test mission.');
  });
});
