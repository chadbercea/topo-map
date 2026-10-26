// Fixed-step loop: the renderer hands over however much real time passed, and the sim
// advances in equal ticks, carrying the remainder to the next frame. Same input, same
// result, whatever the frame rate.

export const STEP_MS = 100; // 10 ticks a second
const MAX_FRAME_MS = 250; // after a stall (tab switch, breakpoint) don't fast-forward

export function createLoop(tick: (dtMs: number) => void, stepMs = STEP_MS) {
  let carry = 0;
  return {
    advance(frameMs: number) {
      carry += Math.min(Math.max(frameMs, 0), MAX_FRAME_MS);
      let ticks = 0;
      while (carry >= stepMs) {
        carry -= stepMs;
        tick(stepMs);
        ticks++;
      }
      return ticks;
    },
    reset() {
      carry = 0;
    },
  };
}
