import { useState } from 'react';
import { BUFF_EFFECT, INTEL_TYPES, ready } from '../sim/intel';
import { game, useGame } from '../sim/store';

const LABEL = { imagery: 'Imagery', target: 'Target', signals: 'Signals' } as const;

// Intel panel (GDD: left side). One row per intel type: what the analysts are working on,
// how far along it is, and a Send button once it's done.
export function IntelPanel() {
  const [open, setOpen] = useState(false);
  const projects = useGame((s) => s.intel.projects);
  const analysts = useGame((s) => s.intel.analysts);
  const waiting = INTEL_TYPES.filter((t) => ready(projects[t])).length;
  return (
    <section className="panel intel" data-open={open} data-testid="intel-panel">
      <button className="panel-toggle" onClick={() => setOpen(!open)} aria-expanded={open}>
        <h2>INTEL</h2>
        {waiting > 0 && <span className="ready-badge">{waiting} ready</span>}
        <span className="chevron" aria-hidden>
          ▾
        </span>
      </button>
      <ul className="panel-body">
        {INTEL_TYPES.map((t) => {
          const p = projects[t];
          const done = ready(p);
          return (
            <li key={t} data-testid={`intel-${t}`} data-ready={done}>
              <span className="type">{LABEL[t]}</span>
              <span className="title">{p ? p.title : 'Awaiting intel'}</span>
              {done ? (
                <button className="send" onClick={() => game.sendIntel(t)} title={BUFF_EFFECT[t]}>
                  Send to team
                </button>
              ) : (
                <span className="bar" role="meter" aria-label={`${LABEL[t]} progress`} aria-valuenow={Math.round((p?.progress ?? 0) * 100)}>
                  <span style={{ width: `${(p?.progress ?? 0) * 100}%` }} />
                </span>
              )}
            </li>
          );
        })}
        <li className="note">{analysts} analysts on shift</li>
      </ul>
    </section>
  );
}
