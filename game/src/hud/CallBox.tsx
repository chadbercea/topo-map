import { useGame } from '../sim/store';
import { currentCall, waitingCalls } from '../sim/comms';
import { bus, EV } from '../game/events';
import { CommsStrip } from './CommsStrip';
import { WireAvatar } from './OrionAvatar';
import { Backpack } from './AskWindow';
import { useAskHidden } from './CommsPanel';
import { gearFor, type Gear } from './commsLink';

const LOAD = {
  map: () => import('./mapScene'),
  m4: () => import('./m4Scene'),
  ifak: () => import('./ifakScene'),
} satisfies Record<Gear, unknown>;

// ALPHA's box on TEAM's right end (ILI-1255, ILI-1256). Always up. With no call it's in the
// HUD's base colour, with the team's gear in 3D for what it's doing (Gear) and the RELAY-7 link
// idle beside it. When ALPHA needs HQ the whole box turns the flag's orange, the gear gives way
// to the SATCOM backpack turning quicker, and the box opens the ask (the flag on the map says
// the same, with the same backpack). While HQ's answer is up the link it says so; once ALPHA
// reads it back the box goes back to the gear.
export function CallBox() {
  const callsign = useGame((s) => s.team.callsign);
  const activity = useGame((s) => s.team.activity);
  const gear = useGame(gearFor);
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

  const who = call?.from ?? callsign;
  return (
    <section
      className="panel call-box"
      data-testid="call-box"
      data-call={live || undefined}
      data-gear={live ? undefined : gear}
      data-raised={(!!call && hidden) || undefined}
      aria-label={live ? `${who} calling HQ` : `${callsign}: ${activity}`}
    >
      <h2>
        <span className="who">
          <Backpack /> {who}
          {calls > 1 && <span className="n">{calls}</span>}
        </span>
        {/* Incoming: the Answer over it, top right (cb-hit) */}
        <span className="what" data-testid="call-state" data-hidden={(!!call && !playing) || undefined}>
          {call ? (playing ? 'Holding' : 'Incoming') : out ? `${out} · sending` : activity}
        </span>
      </h2>
      <CommsStrip showGear={!live} gear={<WireAvatar key={gear} state="on" fallback={null} load={LOAD[gear]} className="c-terminal c-gear" />} />
      {call && !playing && (
        <button className="cb-hit" onClick={() => bus.emit(EV.openAsk)} data-testid="answer-alpha" aria-label={`Answer ${who}`}>
          <span>Answer ›</span>
        </button>
      )}
    </section>
  );
}
