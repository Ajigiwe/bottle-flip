/**
 * Challenge Gauntlet — a series of tasks the player completes to earn prizes.
 *
 * Tasks are plain predicates evaluated over a session of landing results,
 * so they work in ANY game mode (they simply watch what happens). The
 * gauntlet itself lives on the home screen: players check progress, and each
 * completed task grants a prize the moment it is finished.
 *
 * Progress persists in localStorage under 'bf_challenges_v1' as a map of
 * taskId → { done: bool, claimed: bool }. Session counters are collected
 * between resets.
 */

const STORAGE_KEY = 'bf_challenges_v1';

export const CHALLENGE_TIERS = Object.freeze({
  BRONZE: 'bronze',
  SILVER: 'silver',
  GOLD:   'gold',
});

export const TIER_META = Object.freeze({
  bronze: { label: 'BRONZE', icon: '🥉', color: '#cd7f32' },
  silver: { label: 'SILVER', icon: '🥈', color: '#a8b4c4' },
  gold:   { label: 'GOLD',   icon: '🥇', color: '#fbbf24' },
});

/**
 * The gauntlet. Ordered easy → hard; each task names the prize it grants.
 * All tasks are verifiable from landing/throw events alone.
 */
export const CHALLENGES = [
  {
    id: 'first-flip',
    tier: 'bronze',
    icon: '🍾',
    title: 'Pop the Cork',
    desc: 'Land 1 flip upright',
    goal: 1,
    prize: { kind: 'points', amount: 100, label: '+100 start-of-game bonus' },
  },
  {
    id: 'streak-3',
    tier: 'bronze',
    icon: '🔥',
    title: 'On a Roll',
    desc: 'Reach a 3-flip streak',
    goal: 3,
    prize: { kind: 'points', amount: 250, label: '+250 bonus' },
  },
  {
    id: 'bullseye-1',
    tier: 'bronze',
    icon: '🎯',
    title: 'Dead Eye',
    desc: 'Land on the bullseye once',
    goal: 1,
    prize: { kind: 'points', amount: 250, label: '+250 bonus' },
  },
  {
    id: 'streak-5',
    tier: 'silver',
    icon: '🌋',
    title: 'Unstoppable',
    desc: 'Reach a 5-flip streak',
    goal: 5,
    prize: { kind: 'points', amount: 500, label: '+500 bonus' },
  },
  {
    id: 'headstand',
    tier: 'silver',
    icon: '👑',
    title: 'The Headstand',
    desc: 'Land upside-down on the cap',
    goal: 1,
    prize: { kind: 'points', amount: 750, label: '+750 bonus' },
  },
  {
    id: 'bullseye-5',
    tier: 'silver',
    icon: '🏹',
    title: 'Sniper',
    desc: 'Hit the bullseye 5 times (lifetime)',
    goal: 5,
    prize: { kind: 'points', amount: 500, label: '+500 bonus' },
  },
  {
    id: 'difficulty-2',
    tier: 'silver',
    icon: '🌬️',
    title: 'Into the Wind',
    desc: 'Reach difficulty D2 in one session',
    goal: 2,
    prize: { kind: 'points', amount: 750, label: '+750 bonus' },
  },
  {
    id: 'streak-8',
    tier: 'gold',
    icon: '☄️',
    title: 'Lava Streak',
    desc: 'Reach an 8-flip streak',
    goal: 8,
    prize: { kind: 'points', amount: 1000, label: '+1000 bonus' },
  },
  {
    id: 'score-1500',
    tier: 'gold',
    icon: '💎',
    title: 'High Roller',
    desc: 'Score 1500 points in one game',
    goal: 1500,
    prize: { kind: 'points', amount: 1000, label: '+1000 bonus' },
  },
  {
    id: 'gauntlet-master',
    tier: 'gold',
    icon: '🏆',
    title: 'Gauntlet Master',
    desc: 'Complete all other challenges',
    goal: 9,
    prize: { kind: 'skin', skinId: 'chalice', label: '🏆 Golden Chalice skin' },
  },
];

export class ChallengeSystem {
  constructor() {
    this._load();
    // Session counters (reset when a new game starts; bullseye count is
    // lifetime and lives in its own persisted counter).
    this._session = {
      streak: 0,
      maxStreak: 0,
      score: 0,
      difficulty: 0,
      landings: 0,
      bullseyes: 0,
      headstands: 0,
    };
    this._lifetimeBullseyes = parseInt(localStorage.getItem('bf_total_bullseyes') || '0', 10);
    this.onUnlocked = null;   // (challenge) => void
    this._listenersBound = false;
  }

  _load() {
    let saved = {};
    try {
      saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    } catch (_) { /* corrupted save → start fresh */ }
    this.progress = {};
    for (const c of CHALLENGES) {
      const p = saved[c.id] || {};
      this.progress[c.id] = { done: !!p.done, claimed: !!p.claimed };
    }
  }

  _save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.progress));
  }

  /** Reset per-session counters (called when a new game starts). */
  resetSession() {
    this._session = {
      streak: 0,
      maxStreak: 0,
      score: 0,
      difficulty: 0,
      landings: 0,
      bullseyes: 0,
      headstands: 0,
    };
  }

  /**
   * Feed one landing result into the tracker. Evaluates every incomplete
   * task afterwards and returns the list of newly-completed challenges.
   */
  recordLanding(result, ctx = {}) {
    const s = this._session;
    if (result.isUpright) {
      s.landings++;
      s.streak = ctx.streak ?? s.streak + 1;
      s.maxStreak = Math.max(s.maxStreak, s.streak);
      if (result.isTarget) { s.bullseyes++; this._lifetimeBullseyes++; }
      if (result.isHeadstand) s.headstands++;
    } else {
      s.streak = 0;
    }
    if (typeof ctx.score === 'number') s.score = Math.max(s.score, ctx.score);
    if (typeof ctx.difficulty === 'number') s.difficulty = Math.max(s.difficulty, ctx.difficulty);

    return this._evaluate();
  }

  _progressFor(c) {
    const s = this._session;
    switch (c.id) {
      case 'first-flip':     return s.landings;
      case 'streak-3':
      case 'streak-5':
      case 'streak-8':       return s.maxStreak;
      case 'bullseye-1':     return s.bullseyes;
      case 'bullseye-5':     return this._lifetimeBullseyes;
      case 'headstand':      return s.headstands;
      case 'difficulty-2':   return s.difficulty;
      case 'score-1500':     return s.score;
      case 'gauntlet-master': return this.completedCount;
      default:               return 0;
    }
  }

  _evaluate() {
    const newly = [];
    for (const c of CHALLENGES) {
      const p = this.progress[c.id];
      if (!p || p.done) continue;
      if (this._progressFor(c) >= c.goal) {
        p.done = true;
        newly.push(c);
      }
    }
    if (newly.length) this._save();
    return newly;
  }

  /** Mark a challenge's prize as granted. */
  claim(id) {
    const p = this.progress[id];
    if (p) { p.claimed = true; this._save(); }
  }

  get completedCount() {
    return CHALLENGES.filter(c => this.progress[c.id]?.done).length;
  }

  /** Progress 0..1 toward a specific challenge (for progress bars). */
  ratioFor(c) {
    if (this.progress[c.id]?.done) return 1;
    return Math.min(1, this._progressFor(c) / c.goal);
  }

  /** Human-readable current progress, e.g. "3/5". */
  progressLabel(c) {
    if (this.progress[c.id]?.done) return '✓';
    const val = Math.min(this._progressFor(c), c.goal);
    return c.goal >= 100 ? `${val}/${c.goal} pts` : `${val}/${c.goal}`;
  }

  /** Prize bookkeeping hooks (points prizes are added by the game). */
  totalBonusPoints() {
    return CHALLENGES.reduce((sum, c) => {
      if (c.prize.kind === 'points' && this.progress[c.id]?.done && !this.progress[c.id]?.claimed) {
        return sum + c.prize.amount;
      }
      return sum;
    }, 0);
  }
}
