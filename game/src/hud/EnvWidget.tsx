import type { ReactNode } from 'react';
import { useGame } from '../sim/store';
import { imageryOk, weather, type Weather } from '../sim/conditions';

const COMPASS: Record<string, number> = { N: 0, NE: 45, E: 90, SE: 135, S: 180, SW: 225, W: 270, NW: 315 };
const CLOUD_WARN = 70; // cloud cover where the tile warns that ORION-3 could soon be blind (imageryOk: under 80)

// ENVIRONMENT (ILI-1218): the AO's conditions, each reading an icon and a value: sky,
// visibility, wind (the arrow points where it blows), temperature, light and cloud cover. On a
// wide screen a six-stack, three and three, inside ORION-3 under the satellite (ILI-1249): the
// weather is what limits the picture, so it sits beside it, and the cloud tile warns as cover
// nears what would blind the satellite. On a fold or phone (slim) one line of icons and values.
export function EnvWidget({ slim = false }: { slim?: boolean }) {
  const s = useGame((x) => x);
  const wx = weather(s);
  const cloud = !imageryOk(wx) ? 'red' : wx.cloudPct >= CLOUD_WARN ? 'amber' : undefined;
  const tiles: { key: string; label: string; icon: ReactNode; value: string; warn?: string }[] = [
    { key: 'sky', label: 'Sky', icon: <Cloud />, value: wx.sky },
    { key: 'vis', label: 'Visibility', icon: <Eye />, value: `${wx.visibilityKm} km` },
    { key: 'wind', label: 'Wind', icon: <Arrow deg={(COMPASS[wx.wind.from] ?? 0) + 180} />, value: `${wx.wind.from} ${wx.wind.kmh}` },
    { key: 'temp', label: 'Temp', icon: <Thermo />, value: `${wx.tempC}°C` },
    { key: 'light', label: 'Light', icon: wx.light === 'Day' ? <Sun /> : <Moon dawn={wx.light === 'First light'} />, value: wx.light },
    { key: 'cloud', label: 'Cloud cover', icon: <Cloud />, value: `${wx.cloudPct}%`, warn: cloud },
  ];

  if (slim)
    return (
      <section className="panel small-widget env slim" data-testid="conditions" aria-label="Environment">
        <p className="wx" data-testid="weather">
          {tiles.slice(0, 5).map((t) => (
            <span key={t.key} className="env-bit" title={t.label}>
              {t.icon}
              {t.value}
            </span>
          ))}
        </p>
      </section>
    );

  return (
    <dl className="env-stack" data-testid="conditions" data-wx={wx.light} aria-label={`Environment: ${describe(wx)}`}>
      {tiles.map((t) => (
        <div key={t.key} className="env-tile" data-key={t.key} data-warn={t.warn} title={t.label} data-testid={t.key === 'cloud' ? 'cloud-tile' : undefined}>
          <dt>
            {t.icon}
            <span className="sr-only">{t.label}</span>
          </dt>
          <dd>{t.value}</dd>
        </div>
      ))}
    </dl>
  );
}

// The whole readout in one line, for screen readers and tests.
const describe = (w: Weather) => `${w.sky} · vis ${w.visibilityKm} km · wind ${w.wind.from} ${w.wind.kmh} km/h · ${w.tempC}°C · ${w.light} · cloud ${w.cloudPct}%`;

// Line icons, 16 px, in the text's colour.
const Icon = ({ children, style }: { children: ReactNode; style?: React.CSSProperties }) => (
  <svg className="env-icon" viewBox="0 0 16 16" aria-hidden style={style}>
    {children}
  </svg>
);
const Cloud = () => (
  <Icon>
    <path d="M4.5 12.5h7a2.75 2.75 0 0 0 .4-5.47A4 4 0 0 0 4.2 7.6 2.5 2.5 0 0 0 4.5 12.5Z" />
  </Icon>
);
const Eye = () => (
  <Icon>
    <path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8Z" />
    <circle cx="8" cy="8" r="2" />
  </Icon>
);
const Arrow = ({ deg }: { deg: number }) => (
  <Icon style={{ transform: `rotate(${deg}deg)` }}>
    <path d="M8 14V2.5M4 6.5 8 2.5l4 4" />
  </Icon>
);
const Thermo = () => (
  <Icon>
    <path d="M6.5 9.3V3a1.5 1.5 0 0 1 3 0v6.3a3 3 0 1 1-3 0Z" />
    <path d="M8 6v5" />
  </Icon>
);
const Sun = () => (
  <Icon>
    <circle cx="8" cy="8" r="3" />
    <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3 3l1.4 1.4M11.6 11.6 13 13M3 13l1.4-1.4M11.6 4.4 13 3" />
  </Icon>
);
const Moon = ({ dawn }: { dawn: boolean }) => (
  <Icon>
    <path d="M12.5 10.5A5.5 5.5 0 0 1 5.5 3.5a5.5 5.5 0 1 0 7 7Z" />
    {dawn && <path d="M1 14.5h14" />}
  </Icon>
);
