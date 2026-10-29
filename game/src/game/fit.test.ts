import { describe, expect, it } from 'vitest';
import { centreOn, clampCenter, fitCamera, PAN } from './fit';

const phone = { w: 390, h: 664 };
const open = { x: 16, y: 120, w: 358, h: 300 }; // the map between the panels
const whole = { x: 0, y: 0, w: 1600, h: 1000 };

describe('camera fit', () => {
  it('covers the viewport: on a phone the height decides, and the grid runs off the sides', () => {
    const { zoom } = fitCamera(phone, open, whole, 8);
    expect(zoom).toBeCloseTo(0.664);
    expect(1600 * zoom).toBeGreaterThan(phone.w);
  });

  it('the centre never lets the view past the grid', () => {
    const zoom = 0.664;
    expect(clampCenter({ x: 0, y: 0 }, phone, zoom)).toEqual({ x: 390 / 2 / zoom, y: 500 });
    expect(clampCenter({ x: 1600, y: 500 }, phone, zoom).x).toBeCloseTo(1600 - 390 / 2 / zoom);
    // 16:10 at an exact fit: nowhere to go
    expect(clampCenter({ x: 100, y: 900 }, { w: 1440, h: 900 }, 0.9)).toEqual({ x: 800, y: 500 });
  });

  it("keeps ALPHA centred in the open map, even near the AO's edge (ILI-1227)", () => {
    const zoom = 0.664;
    const screen = { x: (a: { x: number }, c: { x: number }) => (a.x - c.x) * zoom + phone.w / 2 };
    const mid = open.x + open.w / 2;
    // ALPHA a little right of centre: the camera centres it all the same
    expect(screen.x({ x: 850 }, centreOn({ x: 850, y: 420 }, open, phone, zoom, undefined, PAN))).toBeCloseTo(mid);
    // ALPHA on the AO's edge (B1's corner): the hand-pan room lets the camera centre it there too
    const corner = { x: 210, y: 90 };
    expect(screen.x(corner, centreOn(corner, open, phone, zoom, undefined, PAN))).toBeCloseTo(mid);
  });

  it('panning by hand goes two squares past the AO on both axes, and no further (ILI-1205)', () => {
    const screen = { w: 1440, h: 900 };
    // 16:10 at an exact fit is pinned on the AO, but the hand-pan room moves both ways.
    expect(clampCenter({ x: 100, y: 900 }, screen, 0.9, undefined, PAN)).toEqual({ x: 400, y: 900 });
    expect(clampCenter({ x: -5000, y: -5000 }, screen, 0.9, undefined, PAN)).toEqual({ x: -400 + 720 / 0.9, y: -400 + 450 / 0.9 });
  });

  it('recentres ALPHA in the open map', () => {
    const zoom = 0.664;
    const c = centreOn({ x: 800, y: 500 }, open, phone, zoom);
    expect((800 - c.x) * zoom + phone.w / 2).toBeCloseTo(open.x + open.w / 2);
  });
});
