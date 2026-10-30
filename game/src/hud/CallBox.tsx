import { useEffect, useState } from 'react';
import { useGame } from '../sim/store';
import { currentCall, waitingCalls } from '../sim/comms';
import { bus, EV } from '../game/events';
import { CommsStrip } from './CommsStrip';
import { Backpack } from './AskWindow';
import { useAskHidden } from './CommsPanel';

const LEAVE_MS = 300; // its way out, once ALPHA has read HQ's answer back

// ALPHA's call (ILI-1255): when the team needs HQ, a box slides out of TEAM's right end with
// ALPHA's SATCOM backpack and the link's signal (the strip that sat in COMMS, ILI-1236), in
// the orange of the flag that goes up on the map at the same moment, with the same backpack
// on it. Click it to open the ask, wherever the flag is. While HQ's answer is up the link it
// says so, and once ALPHA reads it back the box slides away. COMMS is the log; this is the call.
export function CallBox() {
  const callsign = useGame((s) => s.team.callsign);
  const calls = useGame((s) => waitingCalls(s.comms).length);
  const call = useGame((s) => currentCall(s.comms));
  const out = useGame((s) => {
    const f = s.comms.inFlight.at(-1);
    const m = f && s.comms.messages.find((x) => x.id === f.id);
    return f && m ? (f.responseId ? m.responses?.find((r) => r.id === f.responseId)?.label : 'Copy') : null;
  });
  const playing = useGame((s) => s.minigame?.status === 'active');
  const hidden = useAskHidden();
  const live = !!call || !!out;
  // Held on screen for its way out.
  const [shown, setShown] = useState(live);
  useEffect(() => {
    if (live) return setShown(true);
    const t = setTimeout(() => setShown(false), LEAVE_MS);
    return () => clearTimeout(t);
  }, [live]);
  if (!shown) return null;

  const who = call?.from ?? callsign;
  return (
    <section className="panel call-box" data-testid="call-box" data-leaving={!live || undefined} data-raised={(!!call && hidden) || undefined} aria-label={`${who} calling HQ`}>
      <h2>
        <span className="who">
          <Backpack /> {who}
          {calls > 1 && <span className="n">{calls}</span>}
        </span>
        {/* Incoming: the Answer over it, top right (cb-hit) */}
        <span className="what" data-testid="call-state" data-hidden={(!!call && !playing) || undefined}>
          {call ? (playing ? 'Holding' : 'Incoming') : `${out} · sending`}
        </span>
      </h2>
      <CommsStrip />
      {call && !playing && (
        <button className="cb-hit" onClick={() => bus.emit(EV.openAsk)} data-testid="answer-alpha" aria-label={`Answer ${who}`}>
          <span>Answer ›</span>
        </button>
      )}
    </section>
  );
}
