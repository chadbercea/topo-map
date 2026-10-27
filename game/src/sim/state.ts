import { initialSatellite, type Satellite } from './satellite';
import type { Snapshot } from './imagery';
import { roster, vitalsFor, type Operator } from './team';
import type { SquareId } from '../map/grid';
import { squareCenter } from '../map/grid';
import type { MapEvent, Scheduled } from './events';
import { initialComms, type Comms } from './comms';
import type { Capability } from './responses';
import type { Fight, Treatment } from './firefight';
import type { MiniGame } from './minigame';
import type { Contact, Decision } from './contacts';
import { BLACK_BOX } from './missions/blackBox';
import type { MissionDef } from './script';
import type { Inbound } from './support';
import { initialOrdnance, type Ordnance } from './ordnance';
import { initialMission, type Mission } from './mission';
import { initialStream, type Stream } from './stream';
import type { Link } from './link';

// The whole game in one plain object. Systems never mutate it: each tick returns a new
// state, so React can tell what changed by reference and tests can compare snapshots.

// standby: HQ is at the desk, the theater's intel is flowing, and no team is linked yet; the
// mission clock starts when the player finds the team (ILI-1186). paused: pause menu open.
// ended: timer ran out. exited: player left the mission.
export type Phase = 'standby' | 'running' | 'paused' | 'ended' | 'exited';

export type MapView = 'topo' | 'relief';
export type Settings = { mapView: MapView; city: boolean };
export const DEFAULT_SETTINGS: Settings = { mapView: 'topo', city: true };

export type GameState = {
  tick: number;
  elapsedMs: number; // mission time actually played, excludes pauses
  theaterMs: number; // time at the desk, standby included: the intel stream runs on it
  link: Link; // HQ's satcom link to the team: SITREP, the code name, then linked
  stream: Stream; // the theater-wide intel stream on the left
  phase: Phase;
  timer: { remainingMs: number; totalMs: number }; // totalMs: this mission's length
  mission: Mission;
  team: {
    callsign: string;
    operators: Operator[];
    position: { x: number; y: number }; // world units
    route: SquareId[]; // squares the team walks through, in order
    waypoint: number; // index into route of the square it's heading for
    activity: string;
    holdFor: string | null; // radio call the team is waiting on HQ to answer
    holdUntilMs: number; // mission time a timed hold ends
    activeUntilMs: number; // the readout stays in Mode B until then (fights, wounds, healing)
    vitals: string; // health/ammo/meds last tick, to notice them changing
    fight: Fight | null;
    treating: Treatment | null; // the medic at work
    decisions: Record<string, Decision>; // what HQ decided about squares on the route
  };
  map: { cols: number; rows: number; scanned: string[]; selected: string | null };
  contacts: Contact[]; // hidden until imagery finds them
  events: MapEvent[];
  schedule: Scheduled[]; // events still to come, by mission time
  openEvent: string | null; // the event card on screen
  comms: Comms;
  minigame: MiniGame | null; // the mini game on the map, or its result until closed
  resources: { budget: number };
  satellite: Satellite; // ORION-3: where it's looking and what it's doing
  imagery: Record<string, Snapshot>; // the newest look at each square
  capabilities: Capability[]; // what the PMC can offer the team; gates responses
  ordnance: Ordnance;
  noise: number; // 0-100, how loud the PMC has been
  script: { mission: string; fired: string[] }; // the mission script and which triggers have run
  flags: Record<string, boolean>; // choices the mission script reacts to (jammed, ...)
  stats: { searched: number; decoded: number; lost: string[] }; // for the wrap-up; lost: ids of operators who went down
  inbound: Inbound[]; // support on its way
  alerted: boolean; // the enemy knows a PMC is in the area
  rng: number; // seed for chance in fights, kept in state so a mission replays exactly
  settings: Settings; // survives restart
};

// The mission being played; see missions/. Its route runs A (infil), B (the crash site), C (exfil).
export const MISSION: MissionDef = BLACK_BOX;
export const ROUTE: SquareId[] = MISSION.route;
export const MISSION_MS = MISSION.durationMs; // GDD: start with six minutes and tune by feel

// missionMs: the mission's length, the script's six minutes unless tuned (?minutes=). The
// sim starts running and linked; the game itself opens on standby (standby()).
export function initialState(settings: Settings = DEFAULT_SETTINGS, missionMs: number = MISSION_MS): GameState {
  const operators = roster();
  return {
    tick: 0,
    elapsedMs: 0,
    theaterMs: 0,
    link: { state: 'linked', codename: MISSION.codename, atMs: 0 },
    stream: initialStream(),
    phase: 'running',
    timer: { remainingMs: missionMs, totalMs: missionMs },
    mission: initialMission(ROUTE),
    team: {
      callsign: 'ALPHA',
      operators,
      position: squareCenter(ROUTE[0])!,
      route: ROUTE,
      waypoint: 1,
      activity: `Moving to ${ROUTE[1]}`,
      holdFor: null,
      holdUntilMs: 0,
      activeUntilMs: 0,
      vitals: vitalsFor(operators),
      fight: null,
      treating: null,
      decisions: {},
    },
    map: { cols: 8, rows: 5, scanned: [ROUTE[0]], selected: null }, // the insertion point is known ground
    contacts: MISSION.contacts(),
    events: [],
    schedule: MISSION.schedule,
    openEvent: null,
    comms: initialComms(),
    minigame: null,
    resources: { budget: 0 },
    satellite: initialSatellite(ROUTE[0]),
    imagery: {},
    capabilities: ['imagery'],
    ordnance: initialOrdnance(),
    noise: 0,
    script: { mission: MISSION.id, fired: [] },
    flags: {},
    stats: { searched: 0, decoded: 0, lost: [] },
    inbound: [],
    alerted: false,
    rng: 1234,
    settings,
  };
}

// The game as the player sits down to it (ILI-1186): no briefing. The theater's intel is
// already flowing, ALPHA is out there with no link yet, and the clock waits for the link.
export const standby = (settings?: Settings, missionMs?: number): GameState => ({
  ...initialState(settings, missionMs),
  phase: 'standby',
  link: { state: 'none', codename: MISSION.codename, atMs: 0 },
});
