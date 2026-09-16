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
    this.stats = new CareerStats();
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
    this.daily = new DailyChallenge();  // seeded daily task + day streak

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

// ── Career Stats ─────────────────────────────────────────────────────────
//
// Lifetime aggregates for the stats screen. Existing keys ('bf_total_*',
// 'bf_max_streak') stay authoritative; new gauntlet counters live in one
// JSON blob ('bf_gauntlet_stats_v1'). Every value is integer-typed and
// defensively clamped on load.

const GAUNTLET_STATS_KEY = 'bf_gauntlet_stats_v1';

export class CareerStats {
  constructor() {
    this._load();
  }

  _load() {
    const int = (v) => {
      const n = parseInt(v, 10);
      return Number.isFinite(n) && n > 0 ? n : 0;
    };
    this.bullseyes = int(localStorage.getItem('bf_total_bullseyes'));
    this.landings = int(localStorage.getItem('bf_total_landings'));
    this.bestStreak = int(localStorage.getItem('bf_max_streak'));
    let g = {};
    try { g = JSON.parse(localStorage.getItem(GAUNTLET_STATS_KEY) || '{}') || {}; } catch (_) {}
    this.gauntletWins = int(g.wins);
    this.gauntletRuns = int(g.runs);
  }

  /** Refresh from storage (main.js owns the bf_total_* keys and writes them directly). */
  refresh() { this._load(); }

  _saveGauntlet() {
    localStorage.setItem(GAUNTLET_STATS_KEY, JSON.stringify({
      wins: this.gauntletWins, runs: this.gauntletRuns,
    }));
  }

  /** Count a gauntlet run the moment it begins. */
  startGauntletRun() {
    this.gauntletRuns++;
    this._saveGauntlet();
  }

  /** Count a won gauntlet run (cleared every task outstanding at start). */
  winGauntletRun() {
    this.gauntletWins++;
    this._saveGauntlet();
  }
}

// ── Daily Challenge ──────────────────────────────────────────────────────
//
// One seeded task per calendar day: the local date string drives a
// deterministic hash that picks both the task and its goal tier, so the
// same day always rolls the same challenge. Counters persist across games
// and sessions, and completing the daily extends a consecutive-day streak
// that raises the point prize.

const DAILY_STATE_KEY = 'bf_daily_v1';
const DAILY_STREAK_KEY = 'bf_daily_streak_v1';

function dateKeyStr(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}
const todayKey = () => dateKeyStr(0);

/** Shift a YYYY-MM-DD key by delta days (handles month/year boundaries). */
function shiftDateKey(key, delta) {
  const [y, m, d] = key.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + delta);
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${dt.getFullYear()}-${mm}-${dd}`;
}

/** FNV-1a → 32-bit unsigned seed from a date string. */
function hashSeed(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Tasks eligible for the daily roll. {goal} in descTemplate is filled in. */
export const DAILY_POOL = [
  { id: 'd-landings',   icon: '🍾', title: 'Warm-Up',       descTemplate: 'Land {goal} flips upright today',  goals: [5, 8, 12],      stat: 'landings' },
  { id: 'd-streak',     icon: '🔥', title: 'Hot Streak',    descTemplate: 'Reach a {goal}-flip streak today', goals: [3, 4, 5],       stat: 'maxStreak' },
  { id: 'd-bullseyes',  icon: '🎯', title: 'Sharpshooter',  descTemplate: 'Hit {goal} bullseyes today',       goals: [2, 3, 4],       stat: 'bullseyes' },
  { id: 'd-headstands', icon: '👑', title: 'Crown Day',     descTemplate: 'Land {goal} cap landings today',   goals: [1, 1, 2],       stat: 'headstands' },
  { id: 'd-points',     icon: '💎', title: 'Point Harvest', descTemplate: 'Earn {goal} points today',         goals: [400, 650, 900], stat: 'points' },
];

export class DailyChallenge {
  constructor() {
    this._date = todayKey();
    this._load();
  }

  _blankState(taskId, goal) {
    return {
      date: this._date, taskId, goal,
      landings: 0, maxStreak: 0, bullseyes: 0, headstands: 0, points: 0,
      done: false, claimed: false,
    };
  }

  _load(dateOverride) {
    // Refresh the date on every load so the daily re-rolls even if the app
    // was left open past midnight. (Tests may inject a fixed date.)
    this._date = dateOverride || todayKey();
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(DAILY_STATE_KEY) || 'null'); } catch (_) {}
    if (saved && saved.date === this._date && DAILY_POOL.some(e => e.id === saved.taskId)) {
      // Same day → restore counters so progress spans games and sessions.
      this.state = { ...this._blankState(saved.taskId, saved.goal || 1), ...saved, date: this._date };
    } else {
      // New day (or corrupted save) → roll a fresh seeded task.
      const { id, goal } = this._roll(this._date);
      this.state = this._blankState(id, goal);
      this._save();
    }
    this._streak = this._loadStreak();
  }

  _save() {
    localStorage.setItem(DAILY_STATE_KEY, JSON.stringify(this.state));
  }

  _loadStreak() {
    try {
      const s = JSON.parse(localStorage.getItem(DAILY_STREAK_KEY) || 'null');
      if (s && typeof s.count === 'number' && typeof s.last === 'string') {
        return { count: s.count, last: s.last };
      }
    } catch (_) {}
    return { count: 0, last: '' };
  }

  /** Deterministic pick from the date string. */
  _roll(dateKey) {
    const h = hashSeed('bottleflip-' + dateKey);
    const entry = DAILY_POOL[h % DAILY_POOL.length];
    const goal = entry.goals[Math.floor(h / DAILY_POOL.length) % entry.goals.length];
    return { id: entry.id, goal };
  }

  get entry() { return DAILY_POOL.find(e => e.id === this.state.taskId) || DAILY_POOL[0]; }
  get goal() { return this.state.goal; }
  get isDone() { return !!this.state.done; }
  get isClaimed() { return !!this.state.claimed; }

  /**
   * Streak as of right now: a run completed today or yesterday is still
   * alive; anything older has lapsed and reads as 0 until today's is done.
   */
  get liveStreak() { return this._liveStreakFor(todayKey()); }

  /** Liveness math relative to an explicit "today" (tests inject timelines). */
  _liveStreakFor(todayStr) {
    const { count, last } = this._streak;
    if (last === todayStr || last === shiftDateKey(todayStr, -1)) return count;
    return 0;
  }

  /** Prize scales with the streak: +200 base, +100 per streak day, cap +700. */
  prizeAmount() { return 200 + 100 * Math.min(this.liveStreak, 5); }
  prizeLabel() { return `+${this.prizeAmount()} bonus`; }

  /**
   * Feed one landing result into today's counters. Returns true on the
   * landing that completes the daily (streak advances at that moment).
   */
  recordLanding(result, ctx = {}) {
    if (this.state.done) return false;
    const s = this.state;
    if (result.isUpright) {
      s.landings++;
      if (typeof ctx.streak === 'number') s.maxStreak = Math.max(s.maxStreak, ctx.streak);
      if (result.isTarget) s.bullseyes++;
      if (result.isHeadstand) s.headstands++;
    }
    if (typeof ctx.points === 'number') s.points += ctx.points;

    const val = s[this.entry.stat] || 0;
    if (val >= s.goal) {
      s.done = true;
      this._advanceStreak();
      this._save();
      return true;
    }
    this._save();
    return false;
  }

  _advanceStreak() {
    if (this._streak.last === this._date) return; // already counted today
    this._streak = {
      count: this._streak.last === shiftDateKey(this._date, -1) ? this._streak.count + 1 : 1,
      last: this._date,
    };
    localStorage.setItem(DAILY_STREAK_KEY, JSON.stringify(this._streak));
  }

  claim() {
    this.state.claimed = true;
    this._save();
  }

  /** Progress ratio 0..1 for the progress bar. */
  ratio() {
    if (this.state.done) return 1;
    return Math.min(1, (this.state[this.entry.stat] || 0) / this.state.goal);
  }

  /** Human-readable progress, e.g. "3/5". */
  label() {
    if (this.state.done) return '✓';
    const val = Math.min(this.state[this.entry.stat] || 0, this.state.goal);
    return this.entry.stat === 'points' ? `${val}/${this.state.goal} pts` : `${val}/${this.state.goal}`;
  }
}
