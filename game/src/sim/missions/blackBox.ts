import { contactIn, makeContact, moveContact } from '../contacts';
import { squareAt } from '../../map/grid';
import { registerMission, say, type MissionDef } from '../script';

export const PATROL_MOVES_MS = 150_000;

// Operation Black Box, the MVP mission (GDD): infil at A, recover the downed drone's black
// box at B, exfil at C. Six minutes on the contract window.
export const BLACK_BOX: MissionDef = registerMission({
  id: 'black-box',
  name: 'Operation Black Box',
  durationMs: 6 * 60 * 1000,
  route: ['G5', 'F4', 'E3', 'D3', 'C2', 'B1'],

  contacts: () => [
    // The static enemy checkpoint on the route (GDD event 1): dug in, too strong to walk
    // through. It's meant to be softened with seek and destroy.
    makeContact('checkpoint', 'E3', 'a fortified checkpoint', 1.6, [1, 5, 6, 9, 10]),
    // The enemy patrol hunting the drone too (GDD event 2): it moves on the crash site at
    // 2:30 unless it's dealt with first. Intercepting its radio gives the plan away.
    makeContact('patrol', 'C2', 'a foot patrol', 0.7, [1, 7, 12], 'MOVING TO D3 FOR THE DRONE'),
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
    // The checkpoint found: HQ calls it what it is.
    {
      id: 'checkpoint-found',
      when: (s) => s.contacts.some((c) => c.id === 'checkpoint' && c.status === 'revealed'),
      then: (s) =>
        say(s, 'HQ', 'checkpoint-brief', 'That\u2019s a fortified checkpoint in E3. Too strong for ALPHA to walk through. Soften it with ordnance first, or go around.'),
    },
    // The patrol reaches the crash site, unless it's already dead or ALPHA has the drive.
    {
      id: 'patrol-moves',
      when: (s) => {
        const p = s.contacts.find((c) => c.id === 'patrol');
        return s.elapsedMs >= PATROL_MOVES_MS && !!p && (p.status === 'hidden' || p.status === 'revealed') && !s.mission.blackBox;
      },
      then: (s) => {
        const known = s.contacts.find((c) => c.id === 'patrol')!.status === 'revealed';
        const next = moveContact(s, 'patrol', s.mission.b);
        // HQ only knows if someone found it; otherwise it's a surprise at the crash site.
        return known ? say(next, 'HQ', 'patrol-at-crash-site', `The patrol is moving onto the crash site in ${s.mission.b}. Hit it before ALPHA gets there.`) : next;
      },
    },
    // ALPHA recovering the drive when the patrol walks in: the fight is at the crash site.
    {
      id: 'crash-site-contact',
      when: (s) => {
        const here = squareAt(s.team.position.x, s.team.position.y);
        return here === s.mission.b && !!contactIn(s, s.mission.b) && s.mission.phase === 'objective';
      },
      then: (s) => say(s, s.team.callsign, 'crash-site-hit', 'They\u2019re here for the drone too! Taking fire at the crash site.'),
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
