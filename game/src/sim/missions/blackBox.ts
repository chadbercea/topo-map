import { contactIn, makeContact, moveContact, startMove } from '../contacts';
import { squareAt } from '../../map/grid';
import { registerMission, say, type MissionDef } from '../script';

export const PATROL_MOVES_MS = 150_000;
export const PATROL_JAMMED_MS = 240_000; // jamming its net slows it down
export const PATROL_WALK_MS = 30_000; // it's on the move this long before it gets there

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
    makeContact('patrol', 'C2', 'a foot patrol', 0.7, [1, 7, 12], 'MOVING TO D3 FOR THE DRONE', 'D3'),
    makeContact('post', 'C3', 'an observation post', 0.5, [10, 11]),
  ],

  schedule: [
    { atMs: 3_000, id: 'insert', from: 'team', radio: 'Boots on the ground at G5.' },
    {
      atMs: 50_000,
      id: 'hq-traffic-c2',
      event: { id: 'traffic-c2', kind: 'signal', square: 'C2', title: 'Enemy radio traffic' },
      radio: 'Picking up enemy radio traffic near C2. Intercept it?',
      alert: true,
    },
  ],


  // The patrol's move on the crash site, once someone has found it.
  threats: (s) => {
    const p = s.contacts.find((c) => c.id === 'patrol');
    if (p?.status !== 'revealed' || s.script.fired.includes('patrol-moves') || s.mission.blackBox) return [];
    return [{ text: `Patrol moves on ${s.mission.b}`, atMs: p.move?.arriveMs ?? (s.flags.jammed ? PATROL_JAMMED_MS : PATROL_MOVES_MS) }];
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
          c.id === 'checkpoint' ? { ...c, note: 'Fortified: too strong for ALPHA to walk through. Soften it with ordnance first, or go around.' } : c,
        ),
      }),
    },
    // The patrol reaches the crash site, unless it's already dead or ALPHA has the drive.
    // Jamming its net (signal card) slows it down.
    // It sets off from C2 half a minute before it gets there: a burst or video of it then
    // shows it moving, and where to.
    {
      id: 'patrol-sets-off',
      when: (s) => {
        const p = s.contacts.find((c) => c.id === 'patrol');
        const due = (s.flags.jammed ? PATROL_JAMMED_MS : PATROL_MOVES_MS) - PATROL_WALK_MS;
        return s.elapsedMs >= due && !!p && !p.move && (p.status === 'hidden' || p.status === 'revealed') && !s.mission.blackBox;
      },
      then: (s) => startMove(s, 'patrol', s.mission.b, s.elapsedMs + PATROL_WALK_MS),
    },
    {
      id: 'patrol-moves',
      when: (s) => {
        const p = s.contacts.find((c) => c.id === 'patrol');
        const due = p?.move?.arriveMs ?? (s.flags.jammed ? PATROL_JAMMED_MS : PATROL_MOVES_MS);
        return s.elapsedMs >= due && !!p && (p.status === 'hidden' || p.status === 'revealed') && !s.mission.blackBox;
      },
      then: (s) => {
        const known = s.contacts.find((c) => c.id === 'patrol')!.status === 'revealed';
        const moved = moveContact(s, 'patrol', s.mission.b);
        // HQ announces it when it knows the patrol: the marker goes with it.
        const next = known ? { ...moved, events: moved.events.map((e) => (e.id === 'contact-patrol' ? { ...e, square: s.mission.b } : e)) } : moved;
        // HQ only knows if someone found it; otherwise it's a surprise at the crash site.
        return known
          ? say(next, 'HQ', 'patrol-at-crash-site', `Patrol moving onto the crash site in ${s.mission.b}: nobody stopped it. Hit it before ALPHA gets there.`, true)
          : next;
      },
    },
    // ALPHA recovering the drive when the patrol walks in: the fight is at the crash site.
    {
      id: 'crash-site-contact',
      when: (s) => {
        const here = squareAt(s.team.position.x, s.team.position.y);
        return here === s.mission.b && !!contactIn(s, s.mission.b) && s.mission.phase === 'objective';
      },
      then: (s) => say(s, s.team.callsign, 'crash-site-hit', 'They\u2019re here for the drone too! Taking fire at the crash site.', true),
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
