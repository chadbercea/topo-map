import type { ReactNode } from 'react';
import { Foundations } from './Foundations';
import { Motion } from './Motion';
import { Controls } from './Controls';
import { MapLanguage } from './MapLanguage';
import { Wireframes } from './Wireframes';
import { Voice } from './Voice';
import { Patterns } from './Patterns';

const SECTIONS = [
  ['foundations', 'Foundations', 'ILI-1325'],
  ['motion', 'Panels and motion', 'ILI-1326'],
  ['controls', 'Controls', 'ILI-1327'],
  ['map', 'The map', 'ILI-1328'],
  ['wireframes', '3D wireframes', 'ILI-1329'],
  ['voice', 'Voice and comms', 'ILI-1330'],
  ['patterns', 'Patterns', 'ILI-1331'],
] as const;

// The page (ILI-1324): a header, the sections down the page, and a nav to them.
export function DesignSystem() {
  return (
    <div className="ds">
      <header className="ds-head">
        <a className="ds-back" href="../">
          ‹ Back to the game
        </a>
        <h1>PMC WAR ROOM</h1>
        <p className="ds-sub">Design system · Castle House</p>
        <p className="ds-lede">
          The game's look, motion, controls, map, 3D, voice and patterns, built from the game's own stylesheet, components and scenes. If it's here, it's how the game does it.
        </p>
        <nav className="ds-nav" aria-label="Sections">
          {SECTIONS.map(([id, name], i) => (
            <a key={id} href={`#${id}`}>
              <i>{String(i + 1).padStart(2, '0')}</i> {name}
            </a>
          ))}
        </nav>
      </header>
      <main>
        <Foundations />
        <Motion />
        <Controls />
        <MapLanguage />
        <Wireframes />
        <Voice />
        <Patterns />
      </main>
      <footer className="ds-foot">PMC War Room · a game by Chad Bercea · design system built from the game's code</footer>
    </div>
  );
}

// A section of the page: its number, title and what it's for.
export function Section({ id, title, intro, children }: { id: string; title: string; intro: string; children: ReactNode }) {
  const i = SECTIONS.findIndex(([x]) => x === id);
  return (
    <section className="ds-section" id={id} aria-labelledby={`${id}-h`}>
      <h2 id={`${id}-h`}>
        <i>{String(i + 1).padStart(2, '0')}</i> {title} <small>{SECTIONS[i][2]}</small>
      </h2>
      <p className="ds-intro">{intro}</p>
      {children}
    </section>
  );
}

// One specimen: a live sample, its name, and the rule for it.
export function Spec({ name, rule, children, wide }: { name: string; rule: ReactNode; children: ReactNode; wide?: boolean }) {
  return (
    <figure className="ds-spec" data-wide={wide || undefined}>
      <div className="ds-stage">{children}</div>
      <figcaption>
        <b>{name}</b>
        <span>{rule}</span>
      </figcaption>
    </figure>
  );
}
