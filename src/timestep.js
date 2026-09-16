// ── Single source of truth for the physics timestep ─────────────────────────
//
// Matter's solver — and every per-tick threshold in physics.js (rest gates,
// near-miss tracking, verdict timing) — is calibrated for fixed 16.6ms steps.
// The browser game and the node sim MUST step the world with the same quanta
// or they drift: raw rAF deltas produce oversized, unstable steps whose
// per-tick velocities swing and whose verdicts wobble (the classic
// "glitching after a few flips" bug, and matter's high-delta warning).
//
// Rules of the house:
//  - Never hardcode 1000/60. Import FIXED_STEP_MS.
//  - Never feed raw frame deltas into PhysicsWorld.update. Go through the
//    SimClock (browser) or stepUntil (sim/tests/headless drivers).

/** The one physics timestep, in ms. Equals matter's Engine._deltaMax. */
export const FIXED_STEP_MS = 1000 / 60;

/**
 * Simulation clock for frame-driven consumers (the rAF game loop).
 *
 * Real elapsed time accumulates and is drained in exact FIXED_STEP_MS
 * quanta, so the world sees precisely the step sequence the headless sim
 * uses — the game can never drift from the sim's calibrated behaviour.
 *
 *   const clock = new SimClock();
 *   // each animation frame:
 *   clock.advance(realDtMs, (dt) => physics.update(dt));
 */
export class SimClock {
  constructor() {
    this._accum = 0;
    this.ticks = 0; // total fixed steps simulated (diagnostics/tests)
  }

  reset() {
    this._accum = 0;
    this.ticks = 0;
  }

  /**
   * Feed real elapsed ms; calls `step(FIXED_STEP_MS)` 0..maxSteps times.
   * Returns the number of steps taken.
   *
   * Spike clamping (100ms) keeps a background-tab return from dumping a
   * huge backlog at once, and the maxSteps cap with backlog drop means a
   * slow frame can never death-spiral the loop — physics time dilates
   * slightly instead of teleporting bodies in giant unstable steps.
   */
  advance(elapsedMs, step, maxSteps = 4) {
    this._accum += Math.min(Math.max(elapsedMs, 0), 100);
    let steps = 0;
    while (this._accum >= FIXED_STEP_MS && steps < maxSteps) {
      step(FIXED_STEP_MS);
      this._accum -= FIXED_STEP_MS;
      steps++;
      this.ticks++;
    }
    if (steps === maxSteps) this._accum = 0; // drop uncatchable backlog
    return steps;
  }
}

/**
 * Drive `step(FIXED_STEP_MS)` in exact quanta until `done()` returns truthy
 * or `maxSteps` is reached. This is the sim/test-driver idiom — the world
 * sees the identical step sequence the browser game loop produces.
 *
 * Returns { steps, timedOut }: `steps` counts simulated ticks (including
 * the one that satisfied `done()`), `timedOut` is true only when the cap
 * was hit without `done()` ever firing.
 */
export function stepUntil(step, done, maxSteps = 1200) {
  let steps = 0;
  while (steps < maxSteps && !done()) {
    step(FIXED_STEP_MS);
    steps++;
  }
  return { steps, timedOut: steps >= maxSteps && !done() };
}
