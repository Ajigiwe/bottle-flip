/**
 * Formal enumerations for game and bottle physics states.
 * Object.freeze prevents accidental mutation at runtime.
 */

export const GameState = Object.freeze({
  READY:    'READY',
  AIMING:   'AIMING',
  FLIGHT:   'FLIGHT',
  SETTLING: 'SETTLING',
  LANDED:   'LANDED',
  FAILED:   'FAILED',
});

export const GameMode = Object.freeze({
  LIVES: 'LIVES',       // endless classic mode
  TIMED: 'TIMED',       // 30-second blitz mode — score as many flips as possible
  CHALLENGE: 'CHALLENGE', // gauntlet mode — strict lives, tasks complete anywhere
});

/** States in which the bottle is actively moving (unsafe to reset mid-flight) */
export const ACTIVE_STATES = new Set([GameState.FLIGHT, GameState.SETTLING, GameState.AIMING]);
