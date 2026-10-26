import { useState } from 'react';
import { useGame } from '../sim/store';

const clock = (ms: number) => {
  const s = Math.floor(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

// The radio log (ILI-1171): every message the mission has sent, newest first, for when you
// want the record. Nothing here interrupts play.
export function RadioLog() {
  const [open, setOpen] = useState(false);
  const messages = useGame((s) => s.comms.messages);
  return (
    <>
      <button className="log-toggle" onClick={() => setOpen(!open)} aria-expanded={open} data-testid="log-toggle">
        radio log ({messages.length})
      </button>
      {open && (
        <section className="panel radio-log" data-testid="radio-log" aria-label="Radio log">
          <h2>
            RADIO LOG
            <button onClick={() => setOpen(false)} aria-label="Close radio log">
              ✕
            </button>
          </h2>
          <ol>
            {[...messages].reverse().map((m) => (
              <li key={m.id}>
                <span className="t">{clock(m.atMs)}</span> <b>{m.from}</b> {m.text}
              </li>
            ))}
          </ol>
        </section>
      )}
    </>
  );
}
