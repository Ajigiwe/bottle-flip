/**
 * Local leaderboard — persists top 5 scores with dates in localStorage.
 */

const STORAGE_KEY = 'bottle_flip_leaderboard';
const MAX_ENTRIES = 5;

export class Leaderboard {
  constructor() {
    this._entries = this._load();
  }

  _load() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    } catch {
      return [];
    }
  }

  _save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this._entries));
  }

  /**
   * Submit a score. Returns the rank (0-indexed) it landed at, or -1 if not in top 5.
   */
  submit(score, mode = 'LIVES') {
    if (score <= 0) return -1;
    const entry = {
      score,
      mode,
      date: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }),
    };
    this._entries.push(entry);
    this._entries.sort((a, b) => b.score - a.score);
    this._entries = this._entries.slice(0, MAX_ENTRIES);
    this._save();
    return this._entries.findIndex(e => e.score === score && e.date === entry.date);
  }

  getEntries() {
    return [...this._entries];
  }

  isHighScore(score) {
    if (score <= 0) return false;
    if (this._entries.length < MAX_ENTRIES) return true;
    return score > (this._entries[MAX_ENTRIES - 1]?.score ?? 0);
  }

  clearAll() {
    this._entries = [];
    this._save();
  }
}
