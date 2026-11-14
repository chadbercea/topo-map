import { earn } from '../sites';
import { contactIn, makeContact } from '../contacts';
import { dice, planArriveMs } from '../enemy';
import { squareAt } from '../../map/grid';
import { registerMission, say, type MissionDef } from '../script';

// The salvage convoy turns up on most runs, not all: the mission's dice (ILI-1454).
export const CONVOY_CHANCE = 0.7;
export const convoyComes = (seed: number) => dice(seed, 'convoy') < CONVOY_CHANCE;
export { LOOT } from '../prices'; // the convoy's haul, if ALPHA takes it
import { LOOT } from '../prices';
const LOOT_TEXT = `$${LOOT.toLocaleString('en-US')}`;

// Operation Black Box, the MVP mission (GDD): infil at A, recover the downed drone's black
// box at B, exfil at C. Four hours of game time on the contract window (ten real minutes).
export const BLACK_BOX: MissionDef = registerMission({
  id: 'black-box',
  name: 'Operation Black Box',
  satellite: 'ORION-3',
  durationMs: 10 * 60 * 1000,
  route: ['G5', 'F4', 'E3', 'D3', 'C2', 'B1'],
  // If the salvage convoy sits on B1, the long way out: west past it to A2 (~3.5 km all told).
  altExfil: ['B2', 'A2'],

  contacts: () => [
    // The static enemy checkpoint on the route (GDD event 1): dug in, too strong to walk
    // through. It's meant to be softened with seek and destroy.
    makeContact('checkpoint', 'E3', 'a fortified checkpoint', 1.6, [1, 5, 6, 9, 10]),
    // The enemy patrol hunting the drone too (GDD event 2): it moves on the crash site unless
    // it's dealt with first; when is the mission's dice (enemy.ts). Intercepting its radio gives
    // the plan away.
    makeContact('patrol', 'C2', 'a foot patrol', 0.7, [1, 7, 12], 'MOVING TO D3 FOR THE DRONE', 'D3'),
    makeContact('post', 'C3', 'an observation post', 0.5, [10, 11]),
  ],

  // Flavor only. Enemy radio traffic isn't scheduled: every live group talks on its net by the
  // rules in enemy.ts (ILI-1454).
  schedule: [{ atMs: 5_000, id: 'insert', from: 'team', radio: 'Boots on the ground at G5.' }],

  // The patrol's move on the crash site, once someone has found it.
  threats: (s) => {
    const p = s.contacts.find((c) => c.id === 'patrol');
    if (p?.status !== 'revealed' || p.square === p.planTo || s.mission.blackBox) return [];
    return [{ text: `Patrol moves on ${s.mission.b}`, atMs: planArriveMs(s, p) }];
  },
  triggers: [
    // The first contact found by imagery or an intercept (a marker on the map, not an
    // ambush): HQ points at the options.
    {
      id: 'first-contact-hint',
      when: (s) => s.events.some((e) => e.kind === 'contact' && e.id.startsWith('contact-')) && !s.team.fight,
      then: (s) => say(s, 'HQ', 'hint-first-contact', 'Contact on the map. Tap it to hit it with ordnance, or let ALPHA decide when it gets there.', true),
    },
    // The checkpoint found: HQ calls it what it is.
    {
      id: 'checkpoint-found',
      when: (s) => s.contacts.some((c) => c.id === 'checkpoint' && c.status === 'revealed'),
      // Folded into the target menu (ILI-1171) instead of a radio card.
      then: (s) => ({
        ...s,
        contacts: s.contacts.map((c) =>
          c.id === 'checkpoint' ? { ...c, note: 'Fortified' } : c,
        ),
      }),
    },
    // The patrol's move on the crash site is a rule now, not a trigger: enemy.ts planSystem.
    // ALPHA recovering the drive when the patrol walks in: the fight is at the crash site.
    {
      id: 'crash-site-contact',
      when: (s) => {
        const here = squareAt(s.team.position.x, s.team.position.y);
        return here === s.mission.b && !!contactIn(s, s.mission.b) && s.mission.phase === 'objective';
      },
      then: (s) => say(s, s.team.callsign, 'crash-site-hit', 'They\u2019re here for the drone too! Taking fire at the crash site.', true),
    },
    // The black box is out, and an enemy salvage convoy pulls onto the exfil with the loot
    // off the wreck (ILI-1192), on the runs the mission's dice say it comes (ILI-1454). Nobody
    // knows until ORION-3 sees it (ILI-1493): over the exfil, scanned, it's found as it pulls in
    // (satellite.ts); otherwise it's there for whoever looks, or walks in. Found, ALPHA weighs
    // it on the way and takes it for the haul, or swings wide to the alternate exfil (ILI-1315).
    {
      id: 'convoy-on-exfil',
      when: (s) => s.mission.blackBox && s.mission.phase === 'exfil' && !s.team.fight && convoyComes(s.seed),
      then: (s) => {
        const convoy = { ...makeContact('convoy', s.mission.c, 'a salvage convoy hauling loot', 0.8, [2, 3, 6]), note: `Loot ${LOOT_TEXT}` };
        return { ...s, contacts: [...s.contacts, convoy] };
      },
    },
    // ALPHA took the convoy and stands on its haul: the loot is the PMC's.
    {
      id: 'convoy-looted',
      when: (s) => s.contacts.some((c) => c.id === 'convoy' && c.status === 'cleared') && squareAt(s.team.position.x, s.team.position.y) === 'B1' && !s.team.fight,
      then: (s) => say(earn(s, LOOT), s.team.callsign, 'convoy-loot', `Convoy's ours. Loading the haul: ${LOOT_TEXT} in salvage.`),
    },
    // The contract window, called out as it closes, in the clock's real minutes (ILI-1251).
    {
      id: 'five-minutes',
      when: (s) => s.timer.remainingMs <= 300_000 && s.mission.phase !== 'complete',
      then: (s) => say(s, 'HQ', 'warn-5min', 'Five minutes on the contract window.'),
    },
    {
      id: 'one-minute',
      when: (s) => s.timer.remainingMs <= 60_000 && s.mission.phase !== 'complete',
      then: (s) =>
        say(s, 'HQ', 'warn-1min', s.mission.blackBox ? 'One minute. Get them to exfil.' : 'One minute, and no black box. This is slipping.'),
    },
  ],
});
