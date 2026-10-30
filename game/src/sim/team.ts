// The MVP team (GDD: one five-man special operations unit) and each role's loadout.

export type Role = 'Squad lead' | 'Gunner' | 'Medic' | 'Commo' | 'Heavy gunner';

export type Rank = { title: string; abbr: string; grade: number }; // grade drives the rank icon

export type Operator = {
  id: string;
  name: string;
  role: Role;
  rank: Rank;
  health: number; // 0..100
  ammo: number; // rounds carried
  meds: number; // IFAKs and medical kits carried
  noise: number; // 0..100, how loud this operator has been with their weapon (ILI-1222); fades
  steps: number; // 0..100, their footfalls while the team moves (ILI-1266); gone soon after it stops
};

// GDD: everyone carries an IFAK and ammo; the medic has the least ammo and the most meds,
// the heavy gunner the most ammo and the least meds.
export const LOADOUT: Record<Role, { ammo: number; meds: number }> = {
  'Squad lead': { ammo: 210, meds: 2 },
  Gunner: { ammo: 300, meds: 2 },
  Medic: { ammo: 150, meds: 10 },
  Commo: { ammo: 210, meds: 2 },
  'Heavy gunner': { ammo: 600, meds: 1 },
};

const RANKS = {
  sfc: { title: 'Sergeant first class', abbr: 'SFC', grade: 7 },
  ssg: { title: 'Staff sergeant', abbr: 'SSG', grade: 6 },
  sgt: { title: 'Sergeant', abbr: 'SGT', grade: 5 },
} satisfies Record<string, Rank>;

const operator = (id: string, name: string, role: Role, rank: Rank): Operator => ({
  id,
  name,
  role,
  rank,
  health: 100,
  noise: 0,
  steps: 0,
  ...LOADOUT[role],
});

export const roster = (): Operator[] => [
  operator('lead', 'Reyes', 'Squad lead', RANKS.sfc),
  operator('gunner', 'Okafor', 'Gunner', RANKS.ssg),
  operator('medic', 'Lind', 'Medic', RANKS.ssg),
  operator('commo', 'Tanaka', 'Commo', RANKS.sgt),
  operator('heavy', 'Brandt', 'Heavy gunner', RANKS.sgt),
];

// Supply bars on the readout panel: share of this operator's own full load.
export const ammoLeft = (o: Operator) => o.ammo / LOADOUT[o.role].ammo;
export const medsLeft = (o: Operator) => o.meds / LOADOUT[o.role].meds;

// Heartbeat colour bands (GDD: green, yellow, red, like Resident Evil).
export type Condition = 'fine' | 'caution' | 'danger' | 'down';
export const condition = (o: Operator): Condition =>
  o.health <= 0 ? 'down' : o.health >= 70 ? 'fine' : o.health >= 35 ? 'caution' : 'danger';

// Health, ammo and meds as one string, so a tick can tell whether any of them changed.
export const vitalsFor = (ops: Operator[]) => ops.map((o) => `${o.health}|${o.ammo}|${o.meds}`).join(',');
