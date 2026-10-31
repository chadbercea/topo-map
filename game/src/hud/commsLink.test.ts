import { describe, expect, it } from 'vitest';
import { currentCall, LINK_MS, send } from '../sim/comms';
import type { MiniGame } from '../sim/minigame';
import { initialState } from '../sim/state';
import { asking, run } from '../sim/testkit';
import { gearFor, linkTraffic } from './commsLink';

// COMMS's link strip (ILI-1236) reads its traffic off the game.
describe('linkTraffic', () => {
  it('is idle with nothing on the link', () => {
    expect(linkTraffic(initialState())).toBe('idle');
  });

  it('is incoming while a call waits on HQ, sending while the answer is up the link, then idle', () => {
    const s = asking();
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

// TEAM's box shows the team's gear for what it's doing when there's no call (ILI-1256).
describe('gearFor', () => {
  const s = initialState();
  it('is the map on the move', () => expect(gearFor(s)).toBe('map'));
  it('is the M4 in a fight', () => expect(gearFor({ ...s, team: { ...s.team, fight: {} as never } })).toBe('m4'));
  it('is the IFAK while the medic works, or the team is treating wounded', () => {
    expect(gearFor({ ...s, team: { ...s.team, treating: { patient: 'gunner', doneMs: 1 } } })).toBe('ifak');
    expect(gearFor({ ...s, team: { ...s.team, activity: 'Treating wounded' } })).toBe('ifak');
  });
});
