// Fixed-step loop: the renderer hands over however much real time passed, and the sim
// advances in equal ticks, carrying the remainder to the next frame. Same input, same
// result, whatever the frame rate.

export const STEP_MS = 100; // 10 ticks a second
// Slow devices still keep real time (up to 10 ticks a frame); only a real stall, like a
// breakpoint, is cut short. Hiding the tab pauses the mission (PauseMenu), so no catch-up.
const MAX_FRAME_MS = 1000;

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
