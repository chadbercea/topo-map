import { earn } from './sites';
import { ESCROW_BOX } from './prices';
import { escrow } from './upgrades';
import { squareAt, type SquareId } from '../map/grid';
import type { Message } from './comms';
import type { GameState } from './state';
import type { System } from './systems';
import { callExfil, flyExfil, squareClear } from './exfil';

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

export const RECOVER_MS = 33_000;

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

  // At the crash site, where its marker is, not just over the square's edge: pull the drive.
  const atWreck = team.route.slice(0, team.waypoint).includes(mission.b);
  if (mission.phase === 'infil' && atWreck && quiet) {
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
    // Half the contract comes out of escrow with the black box (ILI-1316).
    return {
      ...earn(s, escrow(s, ESCROW_BOX), 'escrow'),
      mission: { ...mission, phase: 'exfil', blackBox: true, recoverUntilMs: null },
      comms: {
        ...s.comms,
        messages: [
          ...s.comms.messages,
          radio(s, 'got-black-box', `Got the black box, and some paperwork. Heading for exfil at ${mission.c}.`),
          { ...radio(s, 'escrow-box', `Client confirms the black box. $${escrow(s, ESCROW_BOX).toLocaleString('en-US')} out of escrow.`), from: 'HQ' },
        ],
      },
    };
  }
  // In the exfil square with the drive and nobody left in it: the transport's called in, and the
  // sequence plays out from there (ILI-1264).
  if (s.exfil) return flyExfil(s);
  if (mission.phase === 'exfil' && here === mission.c && !team.fight && !team.holdFor && squareClear(s, mission.c)) return callExfil(s);
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
