import { describe, expect, it } from 'vitest';
import { cues } from './cues';
import { initialState, type GameState } from '../sim/state';
import { createStore } from '../sim/store';
import { run, walking } from '../sim/testkit';
import { makeContact } from '../sim/contacts';

const msg = (s: GameState, from: string, alert = true): GameState => ({
  ...s,
  comms: { ...s.comms, messages: [...s.comms.messages, { id: `m${s.comms.messages.length}`, from, text: 'x', atMs: 0, status: 'new', holds: false, alert }] },
});

describe('sound cues', () => {
  it('calls and alerts blip, with a different tone for the client and HQ; log lines stay quiet', () => {
    const s = initialState();
    expect(cues(s, msg(s, 'ALPHA'))).toEqual(['radio']);
    expect(cues(s, msg(s, 'CLIENT'))).toEqual(['client']);
    expect(cues(s, msg(s, 'HQ'))).toEqual(['hq']);
    expect(cues(s, msg(s, 'ALPHA', false))).toEqual([]);
  });

  it('ORION-3 pings when it gets on station and when a look comes down', () => {
    const store = createStore(walking());
    store.lookAt('D3');
    let a = store.get();
    for (let i = 0; i < 200 && store.get().satellite.state === 'slewing'; i++) (a = store.get()), store.tick(100);
    expect(cues(a, store.get())).toContain('ping');
    const b = store.get();
    store.capture('photo');
    expect(cues(b, store.get())).toContain('ping');
  });

  it('a sniper shot cracks, a kill thumps, a drone booms', () => {
    const s0 = walking();
    const withContact = { ...s0, contacts: [{ ...makeContact('t', 'E3', 'x', 1, [5]), status: 'revealed' as const, painted: true }] };
    const sniper = createStore(withContact);
    sniper.fire('t', 'sniper');
    const a = sniper.get();
    sniper.tapMiniGame('E3', 0);
    expect(cues(a, sniper.get())).toEqual(['shot']);
    sniper.set(run(sniper.get(), 1_300));
    const b = sniper.get();
    sniper.tapMiniGame('E3', b.contacts[0].units[0]); // the miss sent it to cover: aim where it is now
    expect(cues(b, sniper.get())).toContain('hit');
    const drone = createStore(withContact);
    drone.fire('t', 'drone');
    const c = drone.get();
    drone.tapMiniGame('E3', 5);
    expect(cues(c, drone.get())).toContain('boom');
  });

  it('a fight opens with a burst; the mission ends with a chime or a sting', () => {
    const s = walking();
    expect(cues(s, { ...s, team: { ...s.team, fight: { contactId: 'x', eventId: 'x', square: 'E3', enemy: 1, full: 1, startedMs: 0 } } })).toContain('burst');
    expect(cues(s, { ...s, phase: 'ended', mission: { ...s.mission, phase: 'complete' } })).toContain('win');
    expect(cues(s, { ...s, phase: 'ended' })).toContain('fail');
  });
});
