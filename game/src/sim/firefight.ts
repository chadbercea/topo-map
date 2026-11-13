import { squareAt } from '../map/grid';
import type { GameState } from './state';
import type { System } from './systems';
import type { Operator, Role } from './team';
import type { Message } from './comms';
import { contactIn, effectiveStrength } from './contacts';
import { confirmKills, FRESH_MS, GHOST_MS, type Freshness } from './imagery';
import { CASH_PER_TEAM_KILL, earn, markSite } from './sites';
import { ALERT_AMBUSH, makeNoise, NOISE, NOISE_PER_ROUND } from './noise';

// Contact resolves on its own (GDD: the player doesn't control the team). Walking into a
// square with a live contact starts a firefight. What decides it is what ALPHA knew going in
// (ILI-1496), its own picture (picture.ts), never HQ's map:
// - It knew, and went in to take them: it has the initiative, and they fight at a fraction of
//   their strength. The fresher its intel, the bigger the edge (live or fresh, ghost, stale).
// - It didn't know: an ambush. They get the first volley: for the opening seconds ALPHA is getting
//   into cover and barely shooting back, and they fight harder throughout (harder still once the
//   enemy is alerted). Costly, wounds and likely a man down, but survivable (no longer the
//   instant wipe of ILI-1453). HQ's intel is what turns one into the other.
// In a fight, everyone with ammo shoots, rounds drain by role, the enemy wears down, and hits
// land on the team. Afterwards the medic treats the wounded one at a time, spending time and
// meds. A downed operator stays down.

export type Fight = { contactId: string; eventId: string; square: string; enemy: number; full: number; units: number; startedMs: number; ambush?: boolean; coverUntilMs?: number };
export type Treatment = { patient: string; doneMs: number };

const ENEMY_STRENGTH = 100;
const ROUNDS_PER_S: Record<Role, number> = { 'Squad lead': 3, Gunner: 6, Medic: 2, Commo: 3, 'Heavy gunner': 9 };
const HIT_PER_ROUND = 0.45; // enemy strength removed per round fired
const ENEMY_DPS = 16; // total health per second the enemy deals at full strength
const TREAT_MS = 4_000;
const TREAT_HP = 35;
const WOUNDED_BELOW = 90; // the medic only bothers below this

// What ALPHA's intel is worth in the fight (ILI-1496), as the enemy's strength over its own.
// Going in on them with intel, by how old it is (the map's freshness bands, imagery.ts):
export const INITIATIVE: Record<Freshness, number> = { live: 0.5, fresh: 0.5, ghost: 0.65, stale: 0.8 };
// Walked into them blind: they fight harder, and for the first seconds ALPHA is getting into
// cover, returning a fraction of its fire. An alerted enemy is readier still (ALERT_AMBUSH).
export const AMBUSH_EDGE = 1.15;
export const AMBUSH_COVER_MS = 3_000;
export const COVER_FIRE = 0.25;
export const VOLLEY_DPS = 28; // their aimed first volley, per their full strength

// How fresh ALPHA's intel on a square is: live while a video feed or ORION-3's watch is on it,
// else the age of what it was sent.
export function intelAge(s: GameState, square: string, atMs: number): Freshness {
  const sat = s.satellite;
  if ((s.intel.live ?? []).includes(square) || (sat.watching === square && sat.aim === square && sat.state !== 'slewing')) return 'live';
  const age = s.elapsedMs - atMs;
  return age < FRESH_MS ? 'fresh' : age < GHOST_MS ? 'ghost' : 'stale';
}

// Small seeded generator kept in state so fights replay the same way.
export function nextRandom(seed: number): [number, number] {
  let t = (seed + 0x6d2b79f5) >>> 0;
  const next = t;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return [((t ^ (t >>> 14)) >>> 0) / 4294967296, next];
}

const alive = (o: Operator) => o.health > 0;

const radio = (s: GameState, id: string, text: string): Message => ({
  id,
  from: s.team.callsign,
  text,
  atMs: s.elapsedMs,
  status: 'new',
  holds: false,
});

export const firefightSystem: System = (s, dt) => {
  const { team } = s;
  const secs = dt / 1000;

  // Contact: the team is standing in a square with a live contact.
  if (!team.fight && !team.treating) {
    const here = squareAt(team.position.x, team.position.y);
    const contact = here ? contactIn(s, here) : undefined;
    if (contact) {
      // What ALPHA knew of them going in (ILI-1496): its own picture, not HQ's map.
      const told = team.known[contact.id];
      const known = told?.square === contact.square ? told : undefined; // told it was somewhere else: a surprise here
      const ambush = !known;
      const initiative = known && team.decisions[contact.square] === 'attack' ? INITIATIVE[intelAge(s, contact.square, known.atMs)] : 1;
      const edge = ambush ? AMBUSH_EDGE * (s.alerted ? ALERT_AMBUSH : 1) : initiative;
      const enemy = ENEMY_STRENGTH * effectiveStrength(contact) * edge;
      const text = ambush ? `Ambush in ${contact.square}! Returning fire.` : `Contact! Engaging in ${contact.square}.`;
      return {
        ...makeNoise(s, NOISE.firefight),
        contacts: ambush ? s.contacts.map((c) => (c === contact ? { ...c, status: 'revealed' as const } : c)) : s.contacts,
        team: {
          ...team,
          known: { ...team.known, [contact.id]: { square: contact.square, units: contact.units.length, atMs: s.elapsedMs } }, // in contact: ALPHA sees them itself (ILI-1495)
          holdFor: null,
          fight: { contactId: contact.id, eventId: `contact-${contact.id}`, square: contact.square, enemy, full: enemy, units: contact.units.length, startedMs: s.elapsedMs, ...(ambush ? { ambush: true, coverUntilMs: s.elapsedMs + AMBUSH_COVER_MS } : {}) },
          activity: ambush ? `Ambushed in ${contact.square}` : `Engaged in ${contact.square}`,
        },
        // An ambush is news nobody saw coming: a banner. A planned fight shows on the map.
        comms: { ...s.comms, messages: [...s.comms.messages, { ...radio(s, `fight-${contact.id}`, text), alert: ambush }] },
      };
    }
  }

  if (team.fight) {
    const fight = team.fight;
    let rng = s.rng;
    let fired = 0;
    const covering = fight.coverUntilMs !== undefined && s.elapsedMs < fight.coverUntilMs; // ambushed: getting into cover
    let operators = team.operators.map((o) => {
      if (!alive(o) || o.ammo <= 0) return o;
      const rounds = Math.min(o.ammo, ROUNDS_PER_S[o.role] * secs * (covering ? COVER_FIRE : 1));
      fired += rounds;
      return { ...o, ammo: o.ammo - rounds, noise: Math.min(100, o.noise + rounds * NOISE_PER_ROUND) }; // whoever fires is heard
    });
    const enemy = Math.max(0, fight.enemy - fired * HIT_PER_ROUND);

    // The enemy hits back in proportion to what's left of it, on a random standing operator. Their
    // first volley in an ambush is aimed: it stays on whoever it hit until he's down.
    const standing = operators.filter(alive);
    if (standing.length) {
      let r: number;
      [r, rng] = nextRandom(rng);
      const hit = covering ? standing.filter((o) => o.health < 100).sort((a, b) => a.health - b.health)[0] : undefined;
      const target = hit ?? standing[Math.floor(r * standing.length)];
      const dmg = (covering ? VOLLEY_DPS * (fight.full / ENEMY_STRENGTH) : ENEMY_DPS * (fight.enemy / ENEMY_STRENGTH)) * secs; // weaker as it wears down
      operators = operators.map((o) => (o === target ? { ...o, health: Math.max(0, o.health - dmg) } : o));
    }

    // Nobody left: the fight is where it ends (missionSystem calls it; the wrap-up names it).
    if (!operators.some(alive)) return { ...s, rng, team: { ...team, operators, fight: { ...fight, enemy } } };
    const outOfAmmo = operators.every((o) => !alive(o) || o.ammo <= 0);
    if (enemy > 0 && !outOfAmmo && operators.some(alive)) {
      return dropFighters({ ...s, rng, team: { ...team, operators, fight: { ...fight, enemy } } });
    }

    // Fight over: the contact is cleared (or the team breaks contact, out of ammo).
    const wounded = operators.filter((o) => alive(o) && o.health < WOUNDED_BELOW).length;
    const down = operators.filter((o) => !alive(o)).length;
    // The team cleared it: its fighters are confirmed kills, and the spot is a kill site.
    const cleared = enemy <= 0 ? s.contacts.find((c) => c.id === fight.contactId) : undefined;
    const pay = cleared ? fight.units * CASH_PER_TEAM_KILL : 0;
    const after: GameState = cleared ? markSite(earn(s, pay), cleared) : s;
    const text = outOfAmmo && enemy > 0
      ? `Out of ammo, breaking contact in ${fight.square}.`
      : `${fight.square} clear. ${wounded ? `${wounded} wounded` : 'No wounded'}${down ? `, ${down} down` : ''}.${pay ? ` +$${pay.toLocaleString('en-US')}.` : ''}`;
    return {
      ...after,
      rng,
      events: enemy <= 0 ? after.events.map((e) => (e.id === fight.eventId ? { ...e, status: 'resolved' as const } : e)) : after.events,
      contacts: enemy <= 0 ? after.contacts.map((c) => (c.id === fight.contactId ? { ...c, status: 'cleared' as const, units: [] } : c)) : after.contacts,
      team: { ...team, operators, fight: null, activity: wounded ? 'Treating wounded' : team.activity },
      comms: { ...s.comms, messages: [...s.comms.messages, radio(s, `fight-${fight.eventId}-end`, text)] },
    };
  }

  // Treatment: the medic works through the wounded, worst first.
  return treat(s);
};

// Fighters fall as the fight wears them down, so whoever is watching sees them drop (ILI-1275).
function dropFighters(s: GameState): GameState {
  const fight = s.team.fight!;
  const c = s.contacts.find((x) => x.id === fight.contactId);
  const keep = Math.ceil((fight.units * fight.enemy) / fight.full);
  if (!c || c.units.length <= keep) return s;
  const dead = c.units.slice(keep);
  const next = { ...s, contacts: s.contacts.map((x) => (x === c ? { ...x, units: x.units.slice(0, keep) } : x)) };
  return confirmKills(next, c.id, dead);
}

function treat(s: GameState): GameState {
  const { team } = s;
  const medic = team.operators.find((o) => o.role === 'Medic' && alive(o));
  const patients = team.operators.filter((o) => alive(o) && o.health < WOUNDED_BELOW).sort((a, b) => a.health - b.health);

  if (team.treating) {
    if (s.elapsedMs < team.treating.doneMs) return s;
    // Treatment done: the medic's kit if there's one, else the patient's own IFAK.
    const id = team.treating.patient;
    const useMedic = medic && medic.meds > 0;
    const operators = team.operators.map((o) => {
      let next = o;
      if (o.id === id) next = { ...next, health: Math.min(100, o.health + TREAT_HP) };
      if (useMedic ? o.id === medic!.id : o.id === id) next = { ...next, meds: Math.max(0, next.meds - 1) };
      return next;
    });
    const after = { ...s, team: { ...team, operators, treating: null } };
    // Last patient done (or out of kits): say so; next tick the team walks on.
    return needsTreatment(after) ? after : { ...after, comms: { ...s.comms, messages: [...s.comms.messages, radio(s, `treated-${s.elapsedMs}`, 'Patched up. Moving.')] } };
  }

  if (!needsTreatment(s)) return s;
  const next = patients[0];
  // Without a medic, wounded patch themselves up, slower.
  const ms = medic ? TREAT_MS : TREAT_MS * 2;
  return { ...s, team: { ...team, treating: { patient: next.id, doneMs: s.elapsedMs + ms }, activity: 'Treating wounded' } };
}

function needsTreatment(s: GameState) {
  const ops = s.team.operators;
  const medic = ops.find((o) => o.role === 'Medic' && alive(o));
  const patients = ops.filter((o) => alive(o) && o.health < WOUNDED_BELOW);
  const kits = (medic?.meds ?? 0) + patients.reduce((n, p) => n + p.meds, 0);
  return patients.length > 0 && kits > 0;
}
