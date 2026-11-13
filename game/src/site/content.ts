// Castle House's site copy (ILI-1480), all in one place so it reads as one voice and is easy to
// review: earnest, cold, specific. Castle House's own words, recruiting the visitor as a
// contractor. Generic assets, no callsigns, no real firms, people, agencies or programmes.

export type SceneKey = 'satellite' | 'uav' | 'rotary' | 'airlift' | 'rifle' | 'medical' | 'comms' | 'nav';

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
  ['compensation', 'Compensation'],
];

export const ABOUT = {
  stamp: 'Who we are',
  title: ['We go where', 'our clients cannot.'],
  lede: 'Castle House is a private military support company. For seventeen years we have put selected, equipped and accountable teams on the ground for clients who need presence without exposure: intelligence before every move, air support on call, and a way out planned before the way in.',
  body: 'We are not the largest firm in the field. We are the one that brings its people home. That record is the only thing we sell, and every contractor we hire is hired to keep it.',
  file: [
    ['Established', '17 yrs'],
    ['Contractors', '2,400+'],
    ['Theatres', '6'],
    ['Forward bases', '14'],
    ['Ops centre', '24 / 7'],
    ['Clients left in the field', '0'],
  ] as [string, string][],
};

export const CAPABILITIES = {
  stamp: 'What we do',
  title: 'Four capabilities. One operations centre runs them all.',
  items: [
    {
      code: 'ISR',
      title: 'Intelligence, surveillance, reconnaissance',
      scene: 'satellite' as SceneKey,
      state: 'idle',
      text: 'Our own imaging constellation, signals collection and analysts on every contract. Ground is looked at before anyone walks it.',
      points: ['Satellite and airborne imagery', 'Signals intercept and direction-finding', 'All-source analysis cell'],
      read: [['Coverage', '24 / 7'], ['Revisit', '< 40 min'], ['Analysts', '180']] as [string, string][],
    },
    {
      code: 'AIR',
      title: 'Precision air support',
      scene: 'uav' as SceneKey,
      state: 'inbound',
      text: 'Armed UAVs and rotary-wing crews held on call, cleared and tasked by our own operations centre under strict rules of engagement.',
      points: ['Medium-altitude armed UAVs', 'Attack helicopter crews, NVG current', 'Positive identification on every engagement'],
      read: [['On call', 'Every contract'], ['Response', '< 12 min'], ['Crews', '64']] as [string, string][],
    },
    {
      code: 'MOB',
      title: 'Air mobility and extraction',
      scene: 'airlift' as SceneKey,
      state: 'enroute',
      text: 'Insertion, resupply and extraction by tactical airlift, day or night. Nobody is left where we put them.',
      points: ['Tactical airlift, short and rough strips', 'Casualty evacuation', 'Planned exfiltration on every contract'],
      read: [['Lift', 'Day / night'], ['Range', '900 km'], ['Airframes', '22']] as [string, string][],
    },
    {
      code: 'GND',
      title: 'Ground teams',
      scene: 'rifle' as SceneKey,
      state: 'on',
      text: 'Five-person teams, selected, trained and equipped to one standard, ready to deploy anywhere a client needs presence.',
      points: ['Protective and recovery operations', 'Reconnaissance and site security', 'Team medic on every team'],
      read: [['Team', '5'], ['Readiness', '72 h'], ['Teams', '310']] as [string, string][],
    },
  ],
};

export type Role = { code: string; title: string; posting: string; need: string };
export type Division = { code: string; name: string; text: string; rate: string; roles: Role[] };

export const DIVISIONS = {
  stamp: 'Divisions and roles',
  title: 'Four divisions. One standard across all of them.',
  items: [
    {
      code: 'GT',
      name: 'Ground Teams',
      text: 'The people on the ground. Rotational, five to a team.',
      rate: '$650',
      roles: [
        { code: 'GT-110', title: 'Field Operator', posting: 'Rotational · 8 / 8', need: 'Prior service or equivalent.' },
        { code: 'GT-120', title: 'Team Leader', posting: 'Rotational · 8 / 8', need: 'Led a section or team in the field.' },
        { code: 'GT-140', title: 'Team Medic', posting: 'Rotational · 8 / 8', need: 'Paramedic or combat medical qualification.' },
        { code: 'GT-160', title: 'Designated Marksman', posting: 'Rotational · 8 / 8', need: 'Documented long-range qualification.' },
      ],
    },
    {
      code: 'IS',
      name: 'ISR',
      text: 'What the teams know before they move, and while they do.',
      rate: '$580',
      roles: [
        { code: 'IS-210', title: 'Imagery Analyst', posting: 'Operations centre', need: 'Satellite or airborne imagery experience.' },
        { code: 'IS-230', title: 'Signals Specialist', posting: 'Operations centre', need: 'Intercept, direction-finding or EW background.' },
        { code: 'IS-250', title: 'Collection Manager', posting: 'Operations centre', need: 'Tasked sensors against requirements.' },
      ],
    },
    {
      code: 'AS',
      name: 'Air Support',
      text: 'Fires, lift and eyes overhead, flown by our own crews.',
      rate: '$720',
      roles: [
        { code: 'AS-310', title: 'UAV Pilot', posting: 'Forward base', need: 'Rated on medium-altitude platforms.' },
        { code: 'AS-320', title: 'Sensor Operator', posting: 'Forward base', need: 'Airborne EO/IR sensor experience.' },
        { code: 'AS-330', title: 'Rotary-Wing Crew', posting: 'Forward base', need: 'Pilot or crew chief, NVG current.' },
      ],
    },
    {
      code: 'OC',
      name: 'Operations Centre',
      text: 'One room that runs every team, asset and feed we have.',
      rate: '$610',
      roles: [
        { code: 'OC-410', title: 'Operations Controller', posting: 'Remote · secure site', need: 'Has run teams and assets from an ops room.' },
        { code: 'OC-420', title: 'Fires Coordinator', posting: 'Remote · secure site', need: 'Cleared fires under rules of engagement.' },
        { code: 'OC-440', title: 'Communications Specialist', posting: 'Remote · secure site', need: 'SATCOM and tactical radio networks.' },
      ],
    },
  ] as Division[],
};

export const STANDARDS: [string, string][] = [
  ['Discretion', 'We do not discuss clients, contracts or places. Neither will you.'],
  ['Intelligence first', 'Nobody moves into ground nobody has looked at.'],
  ['One standard', 'Every team is selected, trained and equipped the same way.'],
  ['Accountability', 'Every decision is logged, reviewed and owned by the person who made it.'],
  ['Nobody left', 'We plan the way out before we plan the way in.'],
];

// Selection: each stage, and the share of applicants still in at the end of it.
export const SELECTION = {
  stamp: 'Standards and selection',
  title: 'Of every hundred applicants, seventeen reach a first rotation.',
  standardsTitle: 'What we hold every contractor to',
  stages: [
    { title: 'Application', text: 'Service record, references and a short statement. Reviewed within 72 hours.', left: 100 },
    { title: 'Screening', text: 'Background, medical and psychological screening, conducted in confidence.', left: 58 },
    { title: 'Assessment', text: 'Ten days of physical, technical and decision-making work under pressure.', left: 21 },
    { title: 'Contract', text: 'Terms, rotation and division agreed in writing. Kit issued.', left: 18 },
    { title: 'First rotation', text: 'Integration with your team, then your first eight weeks.', left: 17 },
  ],
};

export const PAY = {
  stamp: 'Compensation',
  title: 'Paid for what the work asks of you.',
  ratesTitle: 'Day rate, from',
  terms: [
    ['Rotation', '8 weeks on · 8 home'],
    ['Travel', 'Paid both ways'],
    ['Cover', 'Medical, evacuation, life'],
    ['Cover from', 'Day one'],
    ['Rotation bonus', '10% on completion'],
    ['Kit', 'Issued, never bought'],
  ] as [string, string][],
  kitTitle: 'Issued on day one',
  kit: [
    { scene: 'medical' as SceneKey, state: 'on', label: 'Trauma kit' },
    { scene: 'nav' as SceneKey, state: 'on', label: 'Land navigation' },
    { scene: 'comms' as SceneKey, state: 'idle', label: 'Team SATCOM' },
  ],
};

export const APPLY = {
  stamp: 'Apply',
  title: ['Your next posting is classified.', 'Your contract isn’t.'],
  lede: 'Selection begins at our secure terminal. Applications are reviewed within 72 hours, in confidence.',
  terminal: [
    ['CASTLE HOUSE // SELECTION TERMINAL', ''],
    ['APPLICATIONS', 'OPEN'],
    ['DIVISIONS HIRING', '4 OF 4'],
    ['REVIEW', '72 H'],
    ['SCREENING', 'IN CONFIDENCE'],
  ] as [string, string][],
  cta: 'Begin selection',
};

export const FOOTER = '© Castle House Group. All postings are subject to screening. Castle House does not discuss clients, contracts or locations.';
