import { useEffect, useState } from 'react';
import { bus, EV, getSceneStatus, type SceneStatus } from '../game/events';
import { useGame } from '../sim/store';

// Dev readout, shown with ?debug. The browser tests read the game through it.
export function DebugPanel() {
  const [status, setStatus] = useState<SceneStatus | null>(getSceneStatus);
  const selected = useGame((s) => s.map.selected);
  const activity = useGame((s) => s.team.activity);
  const pos = useGame((s) => s.team.position);

  useEffect(() => {
    bus.on(EV.sceneStatus, setStatus);
    return () => {
      bus.off(EV.sceneStatus, setStatus);
    };
  }, []);

  return (
    <section className="panel debug" data-testid="scene-status">
      <h2>SCENE</h2>
      {status ? (
        <p>
          {status.width}×{status.height} · {status.renderer}
          <br />
          pointer: {status.pointer}
          <br />
          square: <span data-testid="selected-square">{selected ?? '—'}</span>
          <br />
          team:{' '}
          <span data-testid="team" data-x={pos.x.toFixed(1)} data-y={pos.y.toFixed(1)}>
            {activity}
          </span>
        </p>
      ) : (
        <p>starting…</p>
      )}
    </section>
  );
}
