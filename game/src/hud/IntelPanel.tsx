import { useState } from 'react';

// Placeholder for the analysts' intel panel (GDD: left side). Up to three projects, one
// per intel type; the pipeline and progress come with ILI-1126 / ILI-1151.
const TYPES = ['Imagery', 'Target', 'Signals'];

export function IntelPanel() {
  const [open, setOpen] = useState(false);
  return (
    <section className="panel intel" data-open={open} data-testid="intel-panel">
      <button className="panel-toggle" onClick={() => setOpen(!open)} aria-expanded={open}>
        <h2>INTEL</h2>
        <span className="chevron" aria-hidden>
          ▾
        </span>
      </button>
      <ul className="panel-body">
        {TYPES.map((t) => (
          <li key={t}>
            <span>{t}</span>
            <span className="bar" aria-label={`${t}: idle`}>
              <span style={{ width: '0%' }} />
            </span>
          </li>
        ))}
        <li className="note">Analysts idle</li>
      </ul>
    </section>
  );
}
