/**
 * Achievement badge system.
 * Checks game stats after each event and returns newly unlocked achievements.
 */

const STORAGE_KEY = 'bottle_flip_achievements';

export const ACHIEVEMENTS = [
  {
    id: 'first_flip',
    name: 'First Flip',
    desc: 'Land your first bottle upright',
    icon: '🍾',
    check: (s) => s.totalLandings >= 1,
  },
  {
    id: 'bullseye_1',
    name: 'Sharpshooter',
    desc: 'Hit the bullseye target',
    icon: '🎯',
    check: (s) => s.totalBullseyes >= 1,
  },
  {
    id: 'streak_3',
    name: 'Hat Trick',
    desc: 'Reach a 3-flip streak',
    icon: '🎩',
    check: (s) => s.maxStreak >= 3,
  },
  {
    id: 'streak_5',
    name: 'On Fire',
    desc: 'Reach a 5-flip streak',
    icon: '🔥',
    check: (s) => s.maxStreak >= 5,
  },
  {
    id: 'score_500',
    name: 'Point Guard',
    desc: 'Score 500 pts in one game',
    icon: '⭐',
    check: (s) => s.sessionScore >= 500,
  },
  {
    id: 'score_1000',
    name: 'High Roller',
    desc: 'Score 1000 pts in one game',
    icon: '💎',
    check: (s) => s.sessionScore >= 1000,
  },
  {
    id: 'bullseye_5',
    name: 'Sniper',
    desc: 'Hit 5 total bullseyes',
    icon: '🏹',
    check: (s) => s.totalBullseyes >= 5,
  },
  {
    id: 'timed_complete',
    name: 'Speed Demon',
    desc: 'Finish a Timed Blitz game',
    icon: '⚡',
    check: (s) => s.completedTimedMode,
  },
  {
    id: 'cap_landing',
    name: 'Cap Master',
    desc: 'Land upside down on the bottle cap',
    icon: '👑',
    check: (s) => s.hasCapLanding,
  },
];

export class AchievementSystem {
  constructor() {
    this.unlocked = new Set(this._load());
    // Persistent all-time stats
    this.stats = {
      totalLandings: 0,
      totalBullseyes: 0,
      maxStreak: 0,
      sessionScore: 0,
      completedTimedMode: false,
    };
  }

  _load() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    } catch {
      return [];
    }
  }

  _save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...this.unlocked]));
  }

  /** Call with a partial stats patch; returns array of newly unlocked Achievement objects. */
  updateStats(patch) {
    Object.assign(this.stats, patch);
    const newlyUnlocked = [];
    for (const ach of ACHIEVEMENTS) {
      if (!this.unlocked.has(ach.id) && ach.check(this.stats)) {
        this.unlocked.add(ach.id);
        newlyUnlocked.push(ach);
      }
    }
    if (newlyUnlocked.length > 0) this._save();
    return newlyUnlocked;
  }

  resetSession() {
    this.stats.sessionScore = 0;
    this.stats.completedTimedMode = false;
  }

  getAll() {
    return ACHIEVEMENTS.map(a => ({ ...a, isUnlocked: this.unlocked.has(a.id) }));
  }
}
