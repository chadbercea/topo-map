import { squareAt, type SquareId } from '../map/grid';
import { boostIntel } from './intel';
import type { Message } from './comms';
import type { GameState } from './state';
import type { System } from './systems';

// The MVP mission (GDD): infiltrate at A, move to B and recover the downed drone's black
// box hard drive (plus whatever else the team finds), then move to C for exfil.

export type MissionPhase = 'infil' | 'objective' | 'exfil' | 'complete';
export type Mission = {
  name: string;
  a: SquareId; // infil
  b: SquareId; // the crash site
  c: SquareId; // exfil
  phase: MissionPhase;
  blackBox: boolean;
  recoverUntilMs: number | null;
};

export const RECOVER_MS = 20_000;

export const initialMission = (route: SquareId[]): Mission => ({
  name: 'Operation Black Box',
  a: route[0],
  b: route[3],
  c: route[route.length - 1],
  phase: 'infil',
  blackBox: false,
  recoverUntilMs: null,
});

export const isMissionPoint = (s: GameState, sq: SquareId) => sq === s.mission.b || sq === s.mission.c;

const radio = (s: GameState, id: string, text: string): Message => ({ id, from: s.team.callsign, text, atMs: s.elapsedMs, status: 'new', holds: false });

export const missionSystem: System = (s, dt) => {
  const { mission, team } = s;
  const here = squareAt(team.position.x, team.position.y);
  const quiet = !team.fight && !team.treating && !team.holdFor;

  // The whole team down: the mission is lost.
  if (team.operators.every((o) => o.health <= 0)) {
    return { ...s, phase: 'ended', comms: { ...s.comms, messages: [...s.comms.messages, { ...radio(s, 'team-lost', `${team.callsign} is not responding.`), from: 'HQ' }] } };
  }

  // At the crash site: pull the drive.
  if (mission.phase === 'infil' && here === mission.b && quiet) {
    return {
      ...s,
      mission: { ...mission, phase: 'objective', recoverUntilMs: s.elapsedMs + RECOVER_MS },
      team: { ...team, holdUntilMs: s.elapsedMs + RECOVER_MS, activity: `Recovering the black box at ${mission.b}` },
      comms: { ...s.comms, messages: [...s.comms.messages, radio(s, 'at-crash-site', `At the crash site in ${mission.b}. Pulling the drive.`)] },
    };
  }
  // A fight or the medic at work stops the recovery; it picks up again after.
  if (mission.phase === 'objective' && mission.recoverUntilMs !== null && (team.fight || team.treating)) {
    return { ...s, mission: { ...mission, recoverUntilMs: mission.recoverUntilMs + dt } };
  }
  if (mission.phase === 'objective' && mission.recoverUntilMs !== null && s.elapsedMs >= mission.recoverUntilMs) {
    const next = boostIntel(s, 'target', 0.3); // documents from the wreck
    return {
      ...next,
      mission: { ...mission, phase: 'exfil', blackBox: true, recoverUntilMs: null },
      comms: {
        ...next.comms,
        messages: [...next.comms.messages, radio(s, 'got-black-box', `Got the black box, and some paperwork. Heading for exfil at ${mission.c}.`)],
      },
    };
  }
  // At exfil with the drive: mission complete.
  if (mission.phase === 'exfil' && here === mission.c && team.waypoint >= team.route.length && quiet) {
    return {
      ...s,
      phase: 'ended',
      mission: { ...mission, phase: 'complete' },
      comms: { ...s.comms, messages: [...s.comms.messages, radio(s, 'exfil', `At ${mission.c}. Bird's on the ground. We're out.`)] },
    };
  }
  return s;
};

export function objectiveText(m: Mission): string {
  switch (m.phase) {
    case 'infil':
      return `Recover the black box at ${m.b}`;
    case 'objective':
      return `Recovering the black box at ${m.b}`;
    case 'exfil':
      return `Exfil at ${m.c} with the black box`;
    case 'complete':
      return 'Mission complete';
  }
}
