import { squareAt } from '../map/grid';
import type { GameState } from './state';
import type { System } from './systems';
import type { Operator, Role } from './team';
import type { Message } from './comms';

// Contact resolves on its own (GDD: the player doesn't control the team). Walking into a
// square with an uncleared contact starts a firefight: everyone with ammo shoots, rounds
// drain by role, the enemy wears down, and hits land on the team. Afterwards the medic
// treats the wounded one at a time, spending time and meds. A downed operator stays down.

export type Fight = { eventId: string; square: string; enemy: number; startedMs: number };
export type Treatment = { patient: string; doneMs: number };

const ENEMY_STRENGTH = 100;
const ROUNDS_PER_S: Record<Role, number> = { 'Squad lead': 3, Gunner: 6, Medic: 2, Navigator: 3, 'Heavy gunner': 9 };
const HIT_PER_ROUND = 0.45; // enemy strength removed per round fired
const ENEMY_DPS = 16; // total health per second the enemy deals at full strength
const TREAT_MS = 4_000;
const TREAT_HP = 35;
const WOUNDED_BELOW = 90; // the medic only bothers below this

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

  // Contact: the team is standing in a square with an uncleared contact.
  if (!team.fight && !team.treating) {
    const here = squareAt(team.position.x, team.position.y);
    const contact = s.events.find((e) => e.kind === 'contact' && e.status !== 'resolved' && e.square === here);
    if (contact) return {
      ...s,
      team: {
        ...team,
        holdFor: null,
        fight: { eventId: contact.id, square: contact.square, enemy: ENEMY_STRENGTH, startedMs: s.elapsedMs },
        activity: `Engaged in ${contact.square}`,
      },
      comms: { ...s.comms, minimized: false, messages: [...s.comms.messages, radio(s, `fight-${contact.id}`, `Contact! Engaging in ${contact.square}.`)] },
    };
  }

  if (team.fight) {
    const fight = team.fight;
    let rng = s.rng;
    let fired = 0;
    let operators = team.operators.map((o) => {
      if (!alive(o) || o.ammo <= 0) return o;
      const rounds = Math.min(o.ammo, ROUNDS_PER_S[o.role] * secs);
      fired += rounds;
      return { ...o, ammo: o.ammo - rounds };
    });
    const enemy = Math.max(0, fight.enemy - fired * HIT_PER_ROUND);

    // The enemy hits back in proportion to what's left of it, on a random standing operator.
    const standing = operators.filter(alive);
    if (standing.length) {
      let r: number;
      [r, rng] = nextRandom(rng);
      const target = standing[Math.floor(r * standing.length)];
      const dmg = ENEMY_DPS * (fight.enemy / ENEMY_STRENGTH) * secs;
      operators = operators.map((o) => (o === target ? { ...o, health: Math.max(0, o.health - dmg) } : o));
    }

    const outOfAmmo = operators.every((o) => !alive(o) || o.ammo <= 0);
    if (enemy > 0 && !outOfAmmo && operators.some(alive)) {
      return { ...s, rng, team: { ...team, operators, fight: { ...fight, enemy } } };
    }

    // Fight over: the contact is cleared (or the team breaks contact, out of ammo).
    const wounded = operators.filter((o) => alive(o) && o.health < WOUNDED_BELOW).length;
    const down = operators.filter((o) => !alive(o)).length;
    const text = outOfAmmo && enemy > 0
      ? `Out of ammo, breaking contact in ${fight.square}.`
      : `${fight.square} clear. ${wounded ? `${wounded} wounded` : 'No wounded'}${down ? `, ${down} down` : ''}.`;
    return {
      ...s,
      rng,
      events: enemy <= 0 ? s.events.map((e) => (e.id === fight.eventId ? { ...e, status: 'resolved' as const } : e)) : s.events,
      team: { ...team, operators, fight: null, activity: wounded ? 'Treating wounded' : team.activity },
      comms: { ...s.comms, messages: [...s.comms.messages, radio(s, `fight-${fight.eventId}-end`, text)] },
    };
  }

  // Treatment: the medic works through the wounded, worst first.
  return treat(s);
};

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
