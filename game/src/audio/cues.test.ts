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

  it('a scan pings as it starts and on every square imaged', () => {
    const store = createStore(walking());
    const a = store.get();
    store.startMiniGame('gridScan', 'D3');
    const b = store.get();
    expect(cues(a, b)).toContain('ping');
    store.tapMiniGame(b.minigame!.targets[0]);
    expect(cues(b, store.get())).toContain('ping');
  });

  it('a sniper shot cracks, a kill thumps, a drone booms', () => {
    const s0 = walking();
    const withContact = { ...s0, contacts: [{ ...makeContact('t', 'E3', 'x', 1, [5]), status: 'revealed' as const }] };
    const sniper = createStore(withContact);
    sniper.fire('t', 'sniper');
    const a = sniper.get();
    sniper.tapMiniGame('E3', 0);
    expect(cues(a, sniper.get())).toEqual(['shot']);
    sniper.set(run(sniper.get(), 1_300));
    const b = sniper.get();
    sniper.tapMiniGame('E3', 5);
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
