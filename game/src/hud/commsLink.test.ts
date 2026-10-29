import { describe, expect, it } from 'vitest';
import { currentCall, LINK_MS, send } from '../sim/comms';
import type { MiniGame } from '../sim/minigame';
import { initialState } from '../sim/state';
import { run } from '../sim/testkit';
import { linkTraffic } from './commsLink';

// COMMS's link strip (ILI-1236) reads its traffic off the game.
describe('linkTraffic', () => {
  it('is idle with nothing on the link', () => {
    expect(linkTraffic(initialState())).toBe('idle');
  });

  it('is incoming while a call waits on HQ, sending while the answer is up the link, then idle', () => {
    const s = run(initialState(), 500);
    const call = currentCall(s.comms)!;
    expect(linkTraffic(s)).toBe('incoming');
    const sent = send(s, call.id, null);
    expect(linkTraffic(sent)).toBe('sending');
    expect(linkTraffic(run(sent, LINK_MS + 200))).not.toBe('sending');
  });

  it('is tied up while a strike runs', () => {
    const s = run(initialState(), 500);
    expect(linkTraffic({ ...s, minigame: { status: 'active' } as MiniGame })).toBe('tied');
  });
});
