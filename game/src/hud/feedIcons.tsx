import type { ReactNode } from 'react';
import { Backpack } from './AskWindow';

// COMMS's line icons (ILI-1258), 12 px, in the line's colour: who or what a line is from, at a
// glance. Drawn in the HUD's line style, like ENVIRONMENT's.
export type Tier = 'chatter' | 'comms' | 'sat' | 'sigint' | 'intel' | 'humint' | 'strike' | 'alert';

const Svg = ({ children }: { children: ReactNode }) => (
  <svg className="f-icon" viewBox="0 0 16 16" width="12" height="12" aria-hidden>
    <g fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      {children}
    </g>
  </svg>
);

// ORION-3: the bus and its two panels.
const Sat = () => (
  <Svg>
    <rect x="6" y="6" width="4" height="4" />
    <path d="M6 8H1.5M10 8h4.5M2 5.5v5M14 5.5v5M8 10v2.5M6.5 14h3" />
  </Svg>
);
// SIGINT: a mast and the signal off it.
const Wave = () => (
  <Svg>
    <path d="M8 8v6.5M5.5 14.5h5M5 5.5a4 4 0 0 0 0 5M11 5.5a4 4 0 0 1 0 5M3 3.5a7 7 0 0 0 0 9M13 3.5a7 7 0 0 1 0 9" />
    <circle cx="8" cy="8" r="0.8" />
  </Svg>
);
// IMINT and HQ's own intel: an eye.
const Eye = () => (
  <Svg>
    <path d="M1.5 8s2.5-4.5 6.5-4.5S14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8z" />
    <circle cx="8" cy="8" r="2" />
  </Svg>
);
// HUMINT: a person.
const Person = () => (
  <Svg>
    <circle cx="8" cy="5" r="2.5" />
    <path d="M3 14.5c0-3 2.2-5 5-5s5 2 5 5" />
  </Svg>
);
// A strike: crosshairs.
const Cross = () => (
  <Svg>
    <circle cx="8" cy="8" r="5" />
    <path d="M8 1v4M8 11v4M1 8h4M11 8h4" />
  </Svg>
);
// An alert: the warning triangle.
const Warn = () => (
  <Svg>
    <path d="M8 2 15 14H1z" />
    <path d="M8 6.5v3.5M8 12v.2" />
  </Svg>
);

// Always a cell, so chatter (no icon) lines up with the rest.
export function FeedIcon({ tier }: { tier: Tier }) {
  return <span className="f-ic">{icon(tier)}</span>;
}

function icon(tier: Tier) {
  switch (tier) {
    case 'comms':
      return <Backpack />;
    case 'sat':
      return <Sat />;
    case 'sigint':
      return <Wave />;
    case 'intel':
      return <Eye />;
    case 'humint':
      return <Person />;
    case 'strike':
      return <Cross />;
    case 'alert':
      return <Warn />;
    default:
      return null;
  }
}
