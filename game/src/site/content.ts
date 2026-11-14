// Castle House's site copy (ILI-1480, cut to a brochure in ILI-1526), all in one place so it
// reads as one voice and is easy to review: earnest, cold, specific, and short. Castle House's own
// words, recruiting the visitor as a contractor. Generic assets, no callsigns, no real firms,
// people, agencies or programmes. Each section's picture is a shot: one of the line-drawn models,
// framed tight and moved by the scroll (studio.ts).

export type SceneKey = 'satellite' | 'uav' | 'rotary' | 'airlift' | 'rifle' | 'marksman' | 'medical' | 'comms' | 'nav' | 'drop' | 'constellation';

// How a model is framed as its stage scrolls up the screen, from entering (first value) to
// leaving (second). zoom: 1 fits the whole model, 2 is twice as close (cropped by the frame).
// yaw: its turn, radians. pitch: the camera lifted, radians. pan: the frame slid across and up,
// in model radii [x from, x to, y from, y to] (positive x puts the model right of centre).
export type Shot = {
  scene: SceneKey;
  state?: string;
  color?: string;
  opacity?: number;
  fov?: number;
  zoom: [number, number];
  yaw: [number, number];
  pitch?: [number, number];
  pan?: [number, number, number, number];
  roll?: number;
  spin?: number; // the slow idle turn, radians a second (0: none)
};

export const HERO = {
  name: 'CASTLE HOUSE',
  line: 'Private military support · now recruiting',
  status: 'RECRUITING · selection intake open',
};

export const NAV: [string, string][] = [
  ['about', 'Who we are'],
  ['capabilities', 'What we do'],
  ['divisions', 'Divisions'],
  ['selection', 'Selection'],
  ['compensation', 'Pay'],
];

export const ABOUT = {
  stamp: 'Who we are',
  title: ['We go where', 'our clients cannot.'],
  lede: 'Seventeen years of selected, equipped, accountable teams. We bring our people home.',
  file: [
    ['17', 'Years in the field'],
    ['2,400+', 'Contractors'],
    ['0', 'Clients left behind'],
  ] as [string, string][],
  shot: { scene: 'constellation', color: '--accent', opacity: 0.9, zoom: [1.25, 2.2], yaw: [-1.1, 0.9], pitch: [0.25, -0.1], pan: [0.55, -0.15, 0.1, -0.05], spin: 0.06 } as Shot,
};

export type Capability = { code: string; title: string; name: string; text: string; read: [string, string][]; shot: Shot };

export const CAPABILITIES = {
  stamp: 'What we do',
  title: 'Four capabilities. One operations centre.',
  items: [
    {
      code: 'ISR',
      title: 'Seen first.',
      name: 'Intelligence, surveillance, reconnaissance',
      text: 'Our own imaging constellation. Nobody walks ground we haven’t looked at.',
      read: [['Revisit', '< 40 min'], ['Analysts', '180']],
      shot: { scene: 'satellite', state: 'idle', zoom: [1.5, 2.8], yaw: [-0.9, 1.4], pitch: [0.3, -0.2], pan: [0.35, 0.05, 0.25, -0.1] },
    },
    {
      code: 'AIR',
      title: 'Overhead, on call.',
      name: 'Precision air support',
      text: 'Armed UAVs and rotary crews, cleared by our own operations centre.',
      read: [['Response', '< 12 min'], ['Crews', '64']],
      shot: { scene: 'uav', state: 'inbound', zoom: [1.7, 3.4], yaw: [0.6, -1.6], pitch: [0.35, -0.15], pan: [0.6, -0.4, 0.2, -0.1], roll: 0.12 },
    },
    {
      code: 'MOB',
      title: 'In. And out.',
      name: 'Air mobility and extraction',
      text: 'Insertion, resupply and extraction, day or night.',
      read: [['Range', '900 km'], ['Airframes', '22']],
      shot: { scene: 'airlift', state: 'enroute', zoom: [1.8, 3.2], yaw: [-1.8, -0.2], pitch: [0.2, 0], pan: [0.8, -0.5, 0.15, -0.05] },
    },
    {
      code: 'GND',
      title: 'Five to a team.',
      name: 'Ground teams',
      text: 'Selected, trained and equipped to one standard. Ready in 72 hours.',
      read: [['Readiness', '72 h'], ['Teams', '310']],
      shot: { scene: 'rifle', zoom: [1.6, 3.2], yaw: [-0.4, 1.1], pitch: [0.15, -0.1], pan: [0.5, -0.3, 0.05, -0.05], roll: -0.18 },
    },
  ] as Capability[],
};

export type Role = { code: string; title: string; posting: string };
export type Division = { code: string; name: string; text: string; rate: string; roles: Role[]; shot: Shot };

export const DIVISIONS = {
  stamp: 'Divisions',
  title: 'Four divisions. One standard.',
  items: [
    {
      code: 'GT',
      name: 'Ground Teams',
      text: 'The people on the ground.',
      rate: '$650',
      shot: { scene: 'marksman', state: 'aiming', zoom: [2.6, 3.4], yaw: [1.2, 1.9], pan: [0.2, -0.2, 0, 0] },
      roles: [
        { code: 'GT-110', title: 'Field Operator', posting: 'Rotational' },
        { code: 'GT-120', title: 'Team Leader', posting: 'Rotational' },
        { code: 'GT-140', title: 'Team Medic', posting: 'Rotational' },
        { code: 'GT-160', title: 'Designated Marksman', posting: 'Rotational' },
      ],
    },
    {
      code: 'IS',
      name: 'ISR',
      text: 'What the teams know before they move.',
      rate: '$580',
      shot: { scene: 'comms', state: 'tied', zoom: [2, 2.6], yaw: [-0.5, 0.4], pan: [0.1, -0.1, 0, 0] },
      roles: [
        { code: 'IS-210', title: 'Imagery Analyst', posting: 'Ops centre' },
        { code: 'IS-230', title: 'Signals Specialist', posting: 'Ops centre' },
        { code: 'IS-250', title: 'Collection Manager', posting: 'Ops centre' },
      ],
    },
    {
      code: 'AS',
      name: 'Air Support',
      text: 'Fires, lift and eyes overhead.',
      rate: '$720',
      shot: { scene: 'rotary', zoom: [2.4, 3.2], yaw: [0.4, -0.5], pan: [0.15, -0.15, 0, 0] },
      roles: [
        { code: 'AS-310', title: 'UAV Pilot', posting: 'Forward base' },
        { code: 'AS-320', title: 'Sensor Operator', posting: 'Forward base' },
        { code: 'AS-330', title: 'Rotary-Wing Crew', posting: 'Forward base' },
      ],
    },
    {
      code: 'OC',
      name: 'Operations Centre',
      text: 'One room runs every team and asset.',
      rate: '$610',
      shot: { scene: 'nav', zoom: [2, 2.6], yaw: [-0.6, 0.6], pitch: [0.2, 0], pan: [0.1, -0.1, 0, 0] },
      roles: [
        { code: 'OC-410', title: 'Operations Controller', posting: 'Secure site' },
        { code: 'OC-420', title: 'Fires Coordinator', posting: 'Secure site' },
        { code: 'OC-440', title: 'Communications Specialist', posting: 'Secure site' },
      ],
    },
  ] as Division[],
};

// What every contractor is held to: a word each.
export const STANDARDS = ['Discretion', 'Intelligence first', 'One standard', 'Accountability', 'Nobody left'];

// Selection: each stage, and the share of applicants still in at the end of it.
export const SELECTION = {
  stamp: 'Selection',
  big: '17',
  title: 'of every hundred applicants reach a first rotation.',
  stages: [
    { title: 'Application', left: 100 },
    { title: 'Screening', left: 58 },
    { title: 'Assessment', left: 21 },
    { title: 'Contract', left: 18 },
    { title: 'First rotation', left: 17 },
  ],
  shot: { scene: 'nav', opacity: 0.35, zoom: [2.2, 3.4], yaw: [-1.2, 1.6], pitch: [0.6, 0.1], pan: [0.35, -0.2, 0.2, -0.2], spin: 0.04 } as Shot,
};

export const PAY = {
  stamp: 'Compensation',
  title: 'Paid for what the work asks.',
  ratesTitle: 'Day rate, from',
  terms: [
    ['Rotation', '8 weeks on · 8 home'],
    ['Travel', 'Paid both ways'],
    ['Cover', 'From day one'],
    ['Kit', 'Issued, never bought'],
  ] as [string, string][],
  kitTitle: 'Issued on day one',
  kit: [
    { label: 'Trauma kit', shot: { scene: 'medical', zoom: [2, 2.8], yaw: [-0.8, 0.8], pitch: [0.3, 0] } as Shot },
    { label: 'Team SATCOM', shot: { scene: 'comms', state: 'idle', zoom: [1.9, 2.6], yaw: [0.6, -0.6], pitch: [0.2, 0] } as Shot },
    { label: 'Land navigation', shot: { scene: 'nav', zoom: [1.9, 2.6], yaw: [-0.5, 0.9], pitch: [0.4, 0.1] } as Shot },
  ],
};

export const APPLY = {
  stamp: 'Apply',
  title: ['Your next posting is classified.', 'Your contract isn’t.'],
  lede: 'Reviewed within 72 hours, in confidence.',
  terminal: [
    ['APPLICATIONS', 'OPEN'],
    ['DIVISIONS HIRING', '4 OF 4'],
    ['REVIEW', '72 H'],
  ] as [string, string][],
  cta: 'Begin selection',
  shot: { scene: 'satellite', state: 'idle', opacity: 0.55, zoom: [1.6, 2.6], yaw: [-1.4, 0.8], pitch: [0.4, -0.1], pan: [0.55, 0.25, 0.3, -0.1], spin: 0.05 } as Shot,
};

export const FOOTER = '© Castle House Group. All postings subject to screening. We do not discuss clients, contracts or locations.';
