import { useEffect, useState } from 'react';
import { bus, EV, getSceneStatus, type SceneStatus } from '../game/events';
import { MissionTimer } from './MissionTimer';
import { PauseMenu } from './PauseMenu';
import { useGame } from '../sim/store';

// Placeholder HUD: proves React sits over the canvas and hears the scene.
// The real radio, tools and team panels come with ILI-1118.
export function Hud() {
  const [status, setStatus] = useState<SceneStatus | null>(getSceneStatus);
  const selected = useGame((s) => s.map.selected);

  useEffect(() => {
    bus.on(EV.sceneStatus, setStatus);
    return () => {
      bus.off(EV.sceneStatus, setStatus);
    };
  }, []);

  return (
    <div className="hud">
      <section className="panel">
        <h2>PMC WAR ROOM</h2>
        <p>Shell build. Phaser scene with a React HUD.</p>
      </section>
      <div className="stack">
        <MissionTimer />
        <section className="panel" data-testid="scene-status">
          <h2>SCENE</h2>
          {status ? (
            <p>
              {status.width}×{status.height} · {status.renderer}
              <br />
              pointer: {status.pointer}
              <br />
              square: <span data-testid="selected-square">{selected ?? '—'}</span>
            </p>
          ) : (
            <p>starting…</p>
          )}
        </section>
      </div>
      <PauseMenu />
    </div>
  );
}
