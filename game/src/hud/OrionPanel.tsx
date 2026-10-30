import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { game, useGame } from '../sim/store';
import { CAPTURE, describe, lookSquare, orionSquare, satelliteBusy, satelliteStatus, slewMs, type CaptureMode } from '../sim/satellite';
import { freshness, targets } from '../sim/imagery';
import { nextBlind } from '../sim/progress';
import { CELL, squareAt, squareCenter } from '../map/grid';
import { gameSpan, zulu } from '../sim/gameTime';
import { bus, EV } from '../game/events';
import { Actions, Card, hasActions } from './SquareCard';
import { TargetMenu } from './TargetMenu';
import { OrionAvatar } from './OrionAvatar';
import { useTier } from './tier';
import { EnvWidget } from './EnvWidget';
import { SniperPanel } from './SniperPanel';
import { sniperGone } from '../sim/sniper';

const MODES: CaptureMode[] = ['photo', 'burst', 'video'];

// ORION-3, the imaging satellite (ILI-1219): the big panel down the right, where the whole scan
// happens. A square HQ picks on the map shows here, its details and Reposition (ILI-1228; there's no
// floating card); Reposition tasks ORION-3 (ILI-1250), and it moves with a countdown that
// runs down to nothing, then, on station, the larger square opens up with the ways to look
// (photo, burst, video); a capture runs its time, and what it saw stays in the picture. The
// picture has a fixed place at the panel's top (ILI-1229): with no square to show it holds a
// placeholder, where the Three.js satellite goes (ILI-1196). A strike ties it up. Phaser
// draws the picture into the frame.
export function OrionPanel() {
  const s = useGame((x) => x);
  const sat = s.satellite;
  const now = s.elapsedMs;
  const tied = s.minigame?.status === 'active';
  // The sniper's run plays out here (ILI-1253): its crosshairs in the picture, its panel under it.
  const sniping = s.sniper && !sniperGone(s.sniper, now) ? s.sniper : null;
  const aimAt = sniping && !sniping.done ? (sniping.shots.find((x) => x.atMs > now) ?? sniping.shots.at(-1)) : null;
  const square = orionSquare(s);
  const snap = square ? s.imagery[square] : undefined;
  const live = sat.state === 'onStation' || sat.state === 'capturing';

  const result = sat.state === 'idle' ? sat.result : null;
  const picked = lookSquare(s); // the square HQ is working
  // Contacts in it HQ can hit (ILI-1230). A tap on one of their fighters, here or on the map, or
  // on a contact's marker, opens their strikes (ILI-1250): there's no Strike button.
  const strikes = picked && !tied ? s.events.filter((e) => e.square === picked && e.kind === 'contact' && e.id.startsWith('contact-') && e.status !== 'resolved') : [];
  const opened = s.events.find((e) => e.id === s.openEvent);
  const striking = strikes.length > 0 && opened?.kind === 'contact' && opened.square === picked;
  const rowRef = useRef<HTMLDivElement>(null);
  // Where the strike panel goes, measured once the page has laid out (the phone's tab may have
  // only just switched to this panel), and again whenever that moves.
  const [spot, setSpot] = useState<React.CSSProperties>({ visibility: 'hidden' });
  useLayoutEffect(() => {
    if (!striking) return;
    const next = strikeSpot(rowRef.current, phone);
    if (JSON.stringify(next) !== JSON.stringify(spot)) setSpot(next);
  });
  const tier = useTier();
  const phone = tier === 'compact';
  // The larger square while ORION-3 is on it, or a picked square it has imagery of; else the
  // placeholder (ILI-1229).
  const showPicture = !!sniping || (!tied && (live || (sat.state === 'idle' && !!picked && !!snap)));
  const blind = nextBlind(s);
  const caption = tied
    ? 'Tied up by the intercept'
    : sat.state === 'slewing'
      ? `On its way to ${sat.aim}`
      : picked
        ? `No imagery of ${picked} · Reposition`
        : blind
          ? `Standing by over ${sat.aim} · no imagery of ${blind} ahead` // and it breathes on the map (ILI-1272)
          : `Standing by over ${sat.aim} · tap a square to task it`;
  const last = Object.values(s.imagery)
    .filter((x) => x.mode !== 'eyes')
    .sort((a, b) => b.atMs - a.atMs)[0];

  // The picture frame: Phaser's inset camera draws ORION-3's view of the square into it.
  const picRef = useRef<HTMLDivElement>(null);
  const sent = useRef('');
  useLayoutEffect(() => {
    const r = picRef.current?.getBoundingClientRect();
    // Only while the frame is wholly in the panel's view: Phaser draws over the page, so a frame
    // scrolled part out of the panel would paint over whatever is beside it.
    const view = picRef.current?.closest('.orion')?.getBoundingClientRect();
    const whole = !!r && !!view && r.top >= view.top - 1 && r.bottom <= view.bottom + 1;
    const frame = r && r.width && r.height && whole ? { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) } : null;
    const key = JSON.stringify(frame);
    if (key !== sent.current) bus.emit(EV.inset, frame);
    sent.current = key;
  });
  useEffect(() => () => void bus.emit(EV.inset, null), []);
  const [, redraw] = useState(0);
  // A new stage of the scan, or a new square, starts at the top of the panel: on a phone's small
  // sheet a scroll left over from tapping a capture would hide what comes next.
  const panelRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (panelRef.current) panelRef.current.scrollTop = 0;
  }, [sat.state, picked]);

  const head = sniping ? `sniper · ${sniping.square}` : tied ? 'tied up' : sat.state === 'idle' ? `over ${sat.aim}` : sat.state === 'slewing' ? `→ ${sat.aim}` : `${sat.aim} · ${sat.state === 'onStation' ? 'on station' : CAPTURE[sat.mode!].label.toLowerCase()}`;
  const travel = Math.max(1, sat.arriveMs - sat.startMs);
  const avatar = tied ? 'tied' : sat.state === 'slewing' ? 'slewing' : 'idle';
  const status = sniping ? 'Sniper' : tied ? 'Tied up' : sat.state === 'idle' ? 'Standby' : sat.state === 'slewing' ? 'Repositioning' : sat.state === 'onStation' ? 'On station' : CAPTURE[sat.mode!].label;
  const left = Math.max(0, sat.arriveMs - now);
  // Reposition, then shoot (ILI-1250): a scan *is* the photo, burst or video, so there's no Scan
  // step. Until ORION-3 is over the square HQ is working, its one button is a big Reposition;
  // once it's there, Photo, Burst and Video take its place.
  const away = picked ? slewMs(s, picked) : 0;
  const inPosition = live || sat.state === 'capturing' || (sat.state === 'idle' && !!picked && away === 0);

  return (
    <section ref={panelRef} className="panel orion" onScroll={() => redraw((n) => n + 1)} data-testid="satellite" data-state={sat.state} aria-label="ORION-3 imaging satellite">
      <h2>
        <span>ORION-3</span>
        <span className="where">
          {head} · {zulu(now)}
        </span>
      </h2>
      <p className="sr-only" data-testid="satellite-status">
        {tied ? 'ORION-3 · tied up' : satelliteStatus(s)}
      </p>

      {/* ORION-3 itself, always on screen above the picture (ILI-1235): the 3D satellite and its
          telemetry. */}
      <div className="o-satpanel" data-testid="orion-avatar" data-state={avatar}>
        <OrionAvatar state={avatar} fallback={<SatelliteMark />} />
        <dl className="o-telemetry">
          <div>
            <dt>Status</dt>
            <dd>{status}</dd>
          </div>
          <div>
            <dt>{sat.state === 'slewing' ? 'Heading' : 'Over'}</dt>
            <dd>{sat.aim}</dd>
          </div>
          <div>
            <dt>{sat.state === 'slewing' ? 'ETA' : sat.state === 'capturing' ? 'Left' : 'Last look'}</dt>
            <dd>{sat.state === 'slewing' ? gameSpan(left) : sat.state === 'capturing' ? gameSpan(sat.captureUntilMs - now) : last ? zulu(last.atMs) : '—'}</dd>
          </div>
        </dl>
      </div>

      {/* The AO's weather, three and three under the satellite it limits (ILI-1249); on a fold
          or phone it's the slim line along the bottom. */}
      {tier === 'wide' && <EnvWidget />}

      {/* The image area: always here, always the same size (ILI-1229). */}
      <div className="o-frame">
        {showPicture ? (
          <div ref={picRef} className="o-picture" data-testid="satellite-inset" data-state={sniping ? 'sniper' : live ? sat.state : 'imaged'} aria-label={`ORION-3's picture of ${square}`}>
            {/* The fighters it shows, each a tap away from its strikes (ILI-1250). Phaser draws the
                dots; these sit on them, in the square's width at the picture's middle. */}
            <div className="o-targets">
              {aimAt && square && (
                // OVERWATCH's crosshairs, moving to the next fighter it shoots (ILI-1253).
                <span
                  className="o-crosshair"
                  data-testid="sniper-crosshair"
                  style={{ left: `${50 + ((aimAt.x - squareCenter(square)!.x) / CELL) * 100}%`, top: `${50 + ((aimAt.y - squareCenter(square)!.y) / CELL) * 100}%` }}
                />
              )}
              {!sniping &&
                square &&
                targets(s)
                  .filter((t) => squareAt(t.x, t.y) === square)
                  .map((t, i) => {
                    const o = squareCenter(square)!;
                    return (
                      <button
                        key={i}
                        className="o-target"
                        style={{ left: `${50 + ((t.x - o.x) / CELL) * 100}%`, top: `${50 + ((t.y - o.y) / CELL) * 100}%` }}
                        onClick={() => game.openEvent(`contact-${t.contactId}`)}
                        aria-label={`Strike the fighters in ${square}`}
                        data-testid="target-pin"
                      />
                    );
                  })}
            </div>
          </div>
        ) : (
          <div className="o-placeholder" data-testid="orion-placeholder" data-state={tied ? 'tied' : sat.state}>
            <span className="o-caption">{caption}</span>
          </div>
        )}
      </div>

      {/* The sniper's panel, under its picture (ILI-1253). */}
      <SniperPanel />

      {/* ORION-3's buttons, always here under the picture (ILI-1230): each lit when it can be used.
          On station, Photo pulses: it's the next thing to do (ILI-1257). */}
      <div ref={rowRef} className="o-buttons" data-testid="orion-buttons" hidden={!!sniping}>
        {inPosition && !tied ? (
          <div className="modes" data-testid="capture-modes">
            {MODES.map((m) => (
              <button key={m} disabled={sat.state === 'capturing'} onClick={() => game.capture(m)} data-testid={`capture-${m}`} title={CAPTURE[m].what} data-cue={(m === 'photo' && sat.state === 'onStation') || undefined}>
                {CAPTURE[m].label}
                <small>{CAPTURE[m].ms ? gameSpan(CAPTURE[m].ms) : 'instant'}</small>
              </button>
            ))}
          </div>
        ) : (
          <button className="o-reposition" disabled={!picked || tied || sat.state !== 'idle' || satelliteBusy(s)} onClick={() => picked && game.lookAt(picked)} data-testid="look-here">
            {sat.state === 'slewing' && !tied ? `Repositioning to ${sat.aim}` : 'Reposition'}
            <small>{tied ? 'tied up by the intercept' : sat.state === 'slewing' ? gameSpan(left) : picked ? `to ${picked} · ${gameSpan(away)}` : 'pick a square'}</small>
          </button>
        )}
      </div>


      {!tied && sat.state === 'slewing' && (
        // Repositioning: the countdown decays to nothing, then the options appear.
        <div className="o-move" data-testid="orion-repositioning">
          <span className="decay" role="progressbar" aria-label="ORION-3 repositioning" aria-valuenow={Math.round((left / travel) * 100)}>
            <span style={{ width: `${(left / travel) * 100}%` }} />
          </span>
          <p className="o-line">
            Repositioning to {sat.aim} · <b>{gameSpan(left)}</b>
          </p>
        </div>
      )}



      {!tied && sat.state === 'capturing' && (
        <div className="o-row">
          <span className="bar" role="timer" aria-label="Capture time left">
            <span style={{ width: `${((sat.captureUntilMs - now) / CAPTURE[sat.mode!].ms) * 100}%` }} />
          </span>
          <span className="o-line">
            {CAPTURE[sat.mode!].label} · {gameSpan(sat.captureUntilMs - now)} · {sat.mode === 'video' ? 'live: watch them move' : 'three frames'}
          </span>
        </div>
      )}

      {picked && !tied && phone && hasActions(s, picked) && (
        // On a phone what HQ can do about the square is here too, first, where the sheet shows it (ILI-1228).
        <section className="action-panel in-sheet" data-testid="action-panel" data-square={picked} aria-label={`Act on ${picked}`}>
          <Actions s={s} square={picked} />
        </section>
      )}
      {picked && !tied && (
        <section className="square-card o-square" data-testid="square-card" data-square={picked} role="group" aria-label={`Square ${picked}`}>
          <Card s={s} square={picked} />
        </section>
      )}

      {!tied && sat.state === 'idle' && (
        <dl className="o-facts">
          {result && (
            <>
              <dt>Saw</dt>
              <dd data-testid="satellite-result">
                {result.square} · {CAPTURE[result.mode].label}: {describe(result)}
              </dd>
            </>
          )}
          <dt>Last look</dt>
          <dd>{last ? `${last.square} · ${last.mode} ${zulu(last.atMs)} · ${freshness(last, now)}` : 'none yet'}</dd>
        </dl>
      )}

      {striking && picked && (
        // The strike menu (ILI-1230, ILI-1233): a panel of its own, out of ORION-3's flow, so nothing
        // here moves when it opens. Every way to hit each contact in the square.
        <section className="strike-panel" data-testid="strike-menu" data-overlay="strike" style={spot} role="dialog" aria-label={`Strike ${picked}`}>
          <header className="ap-head">
            Strike <b>{picked}</b>
            <button className="x" onClick={() => game.dropEvent()} aria-label="Close strikes">
              ×
            </button>
          </header>
          {strikes.map((e) => (
            <div key={e.id} className="sc-event event-card" data-kind="contact" data-testid="event-card">
              <h3>CONTACT · {e.square}</h3>
              <p className="title">{e.title}</p>
              <TargetMenu contactId={e.id.slice('contact-'.length)} />
            </div>
          ))}
        </section>
      )}
    </section>
  );
}

// The strike panel's spot (ILI-1233): beside ORION-3's panel, its foot level with the buttons,
// rising over the map; on a phone (or wherever there's no room beside it) above the panel, the
// width of the screen.
const STRIKE_W = 320;
function strikeSpot(row: HTMLElement | null, phone: boolean): React.CSSProperties {
  const panel = row?.closest('.orion')?.getBoundingClientRect();
  if (!row || !panel?.height) return { visibility: 'hidden' }; // ORION-3 behind another tab
  // Level with the buttons, or the panel's visible foot when they're scrolled out of view (a
  // tap on a fighter in the picture leaves them below it on a short screen).
  const foot = Math.min(row.getBoundingClientRect().bottom, panel.bottom, innerHeight - 8);
  const left = panel.left - STRIKE_W - 12;
  if (!phone && left >= 8) return { left, bottom: innerHeight - foot, width: STRIKE_W, maxHeight: foot - 16 };
  return { left: 8, width: innerWidth - 16, bottom: innerHeight - panel.top + 8, maxHeight: panel.top - 16 };
}

// ORION-3 in outline, still: shown until the Three.js satellite loads, or without WebGL (ILI-1196).
function SatelliteMark() {
  return (
    <svg className="o-sat" viewBox="0 0 120 60" aria-hidden>
      <rect x="4" y="22" width="34" height="16" />
      <line x1="15" y1="22" x2="15" y2="38" />
      <line x1="26" y1="22" x2="26" y2="38" />
      <line x1="38" y1="30" x2="48" y2="30" />
      <rect x="48" y="20" width="24" height="20" />
      <line x1="72" y1="30" x2="82" y2="30" />
      <rect x="82" y="22" width="34" height="16" />
      <line x1="94" y1="22" x2="94" y2="38" />
      <line x1="105" y1="22" x2="105" y2="38" />
      <path d="M54 40 L60 50 L66 40" />
    </svg>
  );
}
