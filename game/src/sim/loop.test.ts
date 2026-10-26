import { describe, expect, it } from 'vitest';
import { createLoop } from './loop';

describe('createLoop', () => {
  it('runs whole ticks and carries the remainder', () => {
    const ticks: number[] = [];
    const loop = createLoop((dt) => ticks.push(dt), 100);
    expect(loop.advance(250)).toBe(2);
    expect(loop.advance(50)).toBe(1); // 50 carried + 50
    expect(ticks).toEqual([100, 100, 100]);
  });

  it('gives the same ticks whatever the frame rate', () => {
    const count = (frameMs: number, frames: number) => {
      let n = 0;
      const loop = createLoop(() => n++, 100);
      for (let i = 0; i < frames; i++) loop.advance(frameMs);
      return n;
    };
    expect(count(1000 / 60, 600)).toBe(count(1000 / 30, 300)); // 10 s either way
    expect(count(1000 / 60, 600)).toBe(100);
  });

  it('keeps real time through slow frames but caps a long stall', () => {
    let n = 0;
    const loop = createLoop(() => n++, 100);
    loop.advance(600);
    expect(n).toBe(6);
    n = 0;
    loop.advance(10_000);
    expect(n).toBe(10);
  });

  it('ignores negative frame times and can reset the carry', () => {
    let n = 0;
    const loop = createLoop(() => n++, 100);
    loop.advance(-500);
    loop.advance(90);
    loop.reset();
    loop.advance(20);
    expect(n).toBe(0);
  });
});
