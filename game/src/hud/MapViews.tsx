import { game, useGame } from '../sim/store';
import type { MapView } from '../sim/state';

const VIEWS: { id: MapView; label: string }[] = [
  { id: 'topo', label: 'Topo' },
  { id: 'relief', label: 'Relief' },
];

// Map view switcher in the corner of the map: base view plus the city overlay.
export function MapViews() {
  const view = useGame((s) => s.settings.mapView);
  const city = useGame((s) => s.settings.city);
  return (
    <div className="panel views" role="group" aria-label="Map view" data-testid="map-views">
      {VIEWS.map((v) => (
        <button key={v.id} aria-pressed={view === v.id} onClick={() => game.setSettings({ mapView: v.id })}>
          {v.label}
        </button>
      ))}
      <span className="sep" />
      <button aria-pressed={city} onClick={() => game.setSettings({ city: !city })}>
        City
      </button>
    </div>
  );
}
