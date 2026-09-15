/**
 * Bottle skin / cosmetics system.
 * Skins unlock based on the player's all-time best score.
 */

export const SKINS = [
  {
    id: 'classic',
    name: 'Classic',
    desc: 'Always available',
    icon: '💧',
    unlockScore: 0,
    liquidGrad: ['rgba(56,189,248,0.35)', 'rgba(14,165,233,0.50)', 'rgba(2,132,199,0.65)'],
    liquidSurface: 'rgba(255,255,255,0.65)',
    capGrad: ['#1e293b', '#334155', '#0f172a'],
    labelColor: '#ffffff',
    glassAlpha: [0.28, 0.08, 0.03, 0.08, 0.25],
    borderAlpha: 0.45,
    glow: null,
  },
  {
    id: 'neon',
    name: 'Neon Rush',
    desc: 'Unlock at 200 pts best score',
    icon: '🟣',
    unlockScore: 200,
    liquidGrad: ['rgba(168,85,247,0.35)', 'rgba(139,46,246,0.50)', 'rgba(109,18,220,0.65)'],
    liquidSurface: 'rgba(232,121,249,0.7)',
    capGrad: ['#2d1260', '#4c1d95', '#150a38'],
    labelColor: '#e879f9',
    glassAlpha: [0.22, 0.06, 0.03, 0.06, 0.22],
    borderAlpha: 0.5,
    glow: 'rgba(168,85,247,0.55)',
  },
  {
    id: 'gold',
    name: 'Gold Rush',
    desc: 'Unlock at 500 pts best score',
    icon: '🟡',
    unlockScore: 500,
    liquidGrad: ['rgba(251,191,36,0.35)', 'rgba(234,160,14,0.50)', 'rgba(202,132,5,0.65)'],
    liquidSurface: 'rgba(253,224,71,0.7)',
    capGrad: ['#451a03', '#78350f', '#292000'],
    labelColor: '#fbbf24',
    glassAlpha: [0.25, 0.08, 0.03, 0.08, 0.25],
    borderAlpha: 0.55,
    glow: 'rgba(251,191,36,0.55)',
  },
  {
    id: 'inferno',
    name: 'Inferno',
    desc: 'Unlock at 1000 pts best score',
    icon: '🔴',
    unlockScore: 1000,
    liquidGrad: ['rgba(239,68,68,0.35)', 'rgba(220,38,38,0.50)', 'rgba(185,28,28,0.65)'],
    liquidSurface: 'rgba(252,165,165,0.7)',
    capGrad: ['#450a0a', '#991b1b', '#300000'],
    labelColor: '#f87171',
    glassAlpha: [0.22, 0.07, 0.03, 0.07, 0.22],
    borderAlpha: 0.5,
    glow: 'rgba(239,68,68,0.55)',
  },
];

export class SkinSystem {
  constructor() {
    this.currentSkinId = localStorage.getItem('bottle_flip_skin') || 'classic';
  }

  getUnlocked(bestScore) {
    return SKINS.filter(s => s.unlockScore <= bestScore);
  }

  getActive(bestScore) {
    const unlocked = this.getUnlocked(bestScore);
    return unlocked.find(s => s.id === this.currentSkinId) || SKINS[0];
  }

  select(id) {
    this.currentSkinId = id;
    localStorage.setItem('bottle_flip_skin', id);
  }
}
