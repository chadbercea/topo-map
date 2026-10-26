import { makeContact } from '../contacts';
import { registerMission, say, type MissionDef } from '../script';

// Operation Black Box, the MVP mission (GDD): infil at A, recover the downed drone's black
// box at B, exfil at C. Six minutes on the contract window.
export const BLACK_BOX: MissionDef = registerMission({
  id: 'black-box',
  name: 'Operation Black Box',
  durationMs: 6 * 60 * 1000,
  route: ['G5', 'F4', 'E3', 'D3', 'C2', 'B1'],

  contacts: () => [
    makeContact('technicals', 'E3', 'two technicals', 1, [5, 6, 9, 10]),
    makeContact('patrol', 'C2', 'a foot patrol', 0.7, [1, 7, 12]),
    makeContact('post', 'C3', 'an observation post', 0.5, [10, 11]),
  ],

  schedule: [
    { atMs: 3_000, id: 'insert', from: 'team', radio: 'Boots on the ground at G5.' },
    {
      atMs: 50_000,
      id: 'hq-traffic-c2',
      event: { id: 'traffic-c2', kind: 'signal', square: 'C2', title: 'Enemy radio traffic' },
      radio: 'Picking up enemy radio traffic near C2. Intercept it?',
    },
  ],

  feed: [
    { atMs: 0, project: { id: 'route-overwatch', type: 'imagery', title: 'Route overwatch', durationMs: 40_000 } },
    { atMs: 20_000, project: { id: 'radio-chatter', type: 'signals', title: 'Radio chatter', durationMs: 50_000 } },
    { atMs: 40_000, project: { id: 'checkpoint-photos', type: 'target', title: 'Checkpoint photos', durationMs: 45_000 } },
    { atMs: 90_000, project: { id: 'town-rooftops', type: 'imagery', title: 'Town rooftops', durationMs: 40_000 } },
    { atMs: 120_000, project: { id: 'patrol-net', type: 'signals', title: 'Patrol net', durationMs: 50_000 } },
    { atMs: 150_000, project: { id: 'vehicle-ids', type: 'target', title: 'Vehicle IDs', durationMs: 45_000 } },
  ],

  triggers: [
    // The first contact found by imagery or an intercept (a marker on the map, not an
    // ambush): HQ points at the options.
    {
      id: 'first-contact-hint',
      when: (s) => s.events.some((e) => e.kind === 'contact' && e.id.startsWith('contact-')) && !s.team.fight,
      then: (s) => say(s, 'HQ', 'hint-first-contact', 'Contact on the map. Tap it to hit it with ordnance, or let ALPHA decide when it gets there.'),
    },
    // The contract window, called out as it closes.
    {
      id: 'three-minutes',
      when: (s) => s.timer.remainingMs <= 180_000 && s.mission.phase !== 'complete',
      then: (s) => say(s, 'HQ', 'warn-3min', 'Three minutes on the contract window.'),
    },
    {
      id: 'one-minute',
      when: (s) => s.timer.remainingMs <= 60_000 && s.mission.phase !== 'complete',
      then: (s) =>
        say(s, 'HQ', 'warn-1min', s.mission.blackBox ? 'One minute. Get them to exfil.' : 'One minute, and no black box. This is slipping.'),
    },
  ],
});
