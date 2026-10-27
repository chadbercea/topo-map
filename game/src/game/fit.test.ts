import { describe, expect, it } from 'vitest';
import { clampCenter, fitCamera, followCenter } from './fit';

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

  it('follows ALPHA only when it nears the edge of the open map', () => {
    const zoom = 0.664;
    const center = { x: 800, y: 500 };
    // ALPHA a little right of centre, well inside: the camera stays put
    expect(followCenter(center, { x: 850, y: 420 }, open, phone, zoom)).toBe(center);
    // ALPHA at G5, off screen: the camera moves toward it, as far as the grid allows
    const next = followCenter(center, { x: 1300, y: 900 }, open, phone, zoom);
    expect(next.x).toBeGreaterThan(center.x);
    expect(next).toEqual(clampCenter(next, phone, zoom));
  });
});
