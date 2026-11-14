import { rollContacts } from '../roll';
import { registerMission, say, type MissionDef } from '../script';

// Operation Black Box, the MVP mission (GDD): infil at A, recover the downed drone's black
// box at B, exfil at C. Four hours of game time on the contract window (ten real minutes).
export const BLACK_BOX: MissionDef = registerMission({
  id: 'black-box',
  name: 'Operation Black Box',
  satellite: 'ORION-3',
  durationMs: 10 * 60 * 1000,
  route: ['G5', 'F4', 'E3', 'D3', 'C2', 'B1'],
  // If ALPHA won't take a fight on B1, the long way out: west past it to A2 (~3.5 km all told).
  altExfil: ['B2', 'A2'],

  // What's on the ground is rolled square by square at mission start (roll.ts, ILI-1544): no
  // authored checkpoint, patrol or convoy. The insert square is G5.
  contacts: (seed) => rollContacts(seed, 'G5'),

  // Flavor only. Enemy radio traffic isn't scheduled: every live group talks on its net by the
  // rules in enemy.ts (ILI-1454).
  schedule: [{ atMs: 5_000, id: 'insert', from: 'team', radio: 'HQ, ALPHA, on the ground at G5.' }],

  triggers: [
    // The first contact found by imagery or an intercept (a marker on the map, not an
    // ambush): HQ points at the options.
    {
      id: 'first-contact-hint',
      when: (s) => s.events.some((e) => e.kind === 'contact' && e.id.startsWith('contact-')) && !s.team.fight,
      then: (s) => say(s, 'HQ', 'hint-first-contact', 'CONTACT ON THE MAP · STRIKE ▸ ON ITS ALERT, OR LET ALPHA DECIDE', true),
    },
    // A fight at the crash site while ALPHA recovers the drive.
    {
      id: 'crash-site-contact',
      when: (s) => s.team.fight?.square === s.mission.b && s.mission.phase === 'objective',
      then: (s) => say(s, s.team.callsign, 'crash-site-hit', `HQ, ${s.team.callsign}, CONTACT at the crash site. TIC.`, true),
    },
    // The contract window, called out as it closes, in the clock's real minutes (ILI-1251).
    {
      id: 'five-minutes',
      when: (s) => s.timer.remainingMs <= 300_000 && s.mission.phase !== 'complete',
      then: (s) => say(s, 'HQ', 'warn-5min', 'ALL STATIONS, HQ, 5 minutes remaining.'),
    },
    {
      id: 'one-minute',
      when: (s) => s.timer.remainingMs <= 60_000 && s.mission.phase !== 'complete',
      then: (s) =>
        say(s, 'HQ', 'warn-1min', s.mission.blackBox ? 'ALL STATIONS, HQ, 1 minute remaining.' : 'ALL STATIONS, HQ, 1 minute remaining. Black box not secured.'),
    },
  ],
});
