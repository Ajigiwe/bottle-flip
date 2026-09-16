/**
 * Bottle skins / cosmetics system.
 *
 * A skin is not just a paint job — every skin is a REAL container with its
 * own silhouette, weight curve and material feel (see the `shape` key,
 * resolved to PhysicsWorld.SHAPES). The renderer draws the matching
 * silhouette, and the physics world rebuilds the compound body from the
 * same profile, so what you see is exactly what tumbles.
 *
 * Skins unlock from progressive difficulty wins (D0 → D4): you have to
 * prove you can flip at harder levels to earn the fancier glassware.
 * `unlockScore` is kept as a fallback gate so saved best-scores from the
 * old score-gated system still grant everything they legitimately earned.
 *
 * The Golden Chalice is the grand prize of the Challenge Gauntlet — it is
 * never unlocked by score or difficulty, only by completing every task.
 */

export const SKINS = [
  {
    id: 'classic',
    name: 'Classic Water',
    desc: 'The 500ml original',
    icon: '💧',
    unlockScore: 0,
    unlockDifficulty: 0,
    shape: 'bottle',
    liquidGrad: ['rgba(56,189,248,0.35)', 'rgba(14,165,233,0.50)', 'rgba(2,132,199,0.65)'],
    liquidSurface: 'rgba(255,255,255,0.65)',
    capGrad: ['#1e293b', '#334155', '#0f172a'],
    labelColor: '#ffffff',
    glassAlpha: [0.28, 0.08, 0.03, 0.08, 0.25],
    borderAlpha: 0.45,
    glow: null,
    bodyFill: null,       // transparent PET — liquid shows through
    labelWord: 'PURE',
  },
  {
    id: 'wine',
    name: 'Bordeaux Red',
    desc: 'Heavy glass, long neck',
    icon: '🍷',
    unlockScore: 0,
    unlockDifficulty: 1,
    shape: 'wine',
    liquidGrad: ['rgba(127,29,29,0.55)', 'rgba(114,22,22,0.70)', 'rgba(69,10,10,0.85)'],
    liquidSurface: 'rgba(254,202,202,0.55)',
    capGrad: ['#3f0d12', '#5c1a1a', '#2a0709'],   // red wax capsule
    labelColor: '#fecaca',
    glassAlpha: [0.30, 0.10, 0.04, 0.10, 0.28],
    borderAlpha: 0.5,
    glow: 'rgba(153,27,27,0.45)',
    bodyFill: 'rgba(40,6,8,0.82)',   // dark green glass — hides the liquid line
    labelWord: 'CHÂTEAU',
  },
  {
    id: 'champagne',
    name: 'Champagne',
    desc: 'Sealed, heavy, celebratory',
    icon: '🍾',
    unlockScore: 0,
    unlockDifficulty: 2,
    shape: 'champagne',
    liquidGrad: ['rgba(253,224,71,0.40)', 'rgba(250,204,21,0.55)', 'rgba(202,138,4,0.70)'],
    liquidSurface: 'rgba(254,240,138,0.75)',
    capGrad: ['#7c7c7c', '#d4d4d4', '#525252'],   // foil
    labelColor: '#fde68a',
    glassAlpha: [0.26, 0.09, 0.04, 0.09, 0.24],
    borderAlpha: 0.5,
    glow: 'rgba(250,204,21,0.45)',
    bodyFill: 'rgba(46,38,10,0.75)',  // dark green glass
    labelWord: 'GRAND',
  },
  {
    id: 'feeder',
    name: 'Baby Bottle',
    desc: 'Wobbly teat, quick flips',
    icon: '🍼',
    unlockScore: 0,
    unlockDifficulty: 3,
    shape: 'feeder',
    liquidGrad: ['rgba(255,255,255,0.45)', 'rgba(255,237,213,0.60)', 'rgba(253,186,116,0.75)'],
    liquidSurface: 'rgba(255,255,255,0.85)',
    capGrad: ['#fbcfe8', '#f9a8d4', '#f472b6'],   // pink screw ring
    labelColor: '#f472b6',
    glassAlpha: [0.30, 0.10, 0.05, 0.10, 0.28],
    borderAlpha: 0.5,
    glow: 'rgba(244,114,182,0.40)',
    bodyFill: null,
    labelWord: 'MILK',
  },
  {
    id: 'tumbler',
    name: 'Steel Tumbler',
    desc: 'Wide, heavy, dead bounce',
    icon: '🥤',
    unlockScore: 0,
    unlockDifficulty: 4,
    shape: 'tumbler',
    liquidGrad: ['rgba(148,163,184,0.35)', 'rgba(100,116,139,0.50)', 'rgba(51,65,85,0.70)'],
    liquidSurface: 'rgba(226,232,240,0.7)',
    capGrad: ['#334155', '#64748b', '#1e293b'],   // lid
    labelColor: '#e2e8f0',
    glassAlpha: [0.20, 0.14, 0.10, 0.14, 0.20],   // brushed steel — milky, not clear
    borderAlpha: 0.6,
    glow: 'rgba(148,163,184,0.45)',
    bodyFill: 'rgba(148,163,184,0.55)',
    labelWord: 'STANLEY',
  },
  {
    id: 'chalice',
    name: 'Golden Chalice',
    desc: 'Grand prize — complete the Gauntlet',
    icon: '🏆',
    unlockScore: 0,
    unlockDifficulty: 0,
    shape: 'chalice',
    challengePrize: true,   // only the Challenge Gauntlet grants this
    liquidGrad: ['rgba(253,224,71,0.45)', 'rgba(250,204,21,0.60)', 'rgba(180,83,9,0.80)'],
    liquidSurface: 'rgba(254,243,199,0.8)',
    capGrad: ['#b45309', '#fbbf24', '#92400e'],   // polished gold
    labelColor: '#fef3c7',
    glassAlpha: [0.35, 0.15, 0.08, 0.15, 0.32],
    borderAlpha: 0.65,
    glow: 'rgba(251,191,36,0.55)',
    bodyFill: 'rgba(180,120,20,0.72)',   // solid gold — no liquid visible
    labelWord: 'CHAMPION',
  },
];

export class SkinSystem {
  constructor() {
    this.currentSkinId = localStorage.getItem('bottle_flip_skin') || 'classic';
    // Set by the game once ChallengeSystem state is loaded; only a completed
    // gauntlet flips this (see chalice.challengePrize).
    this.challengeUnlocked = false;
  }

  setChallengeUnlocked(done) {
    this.challengeUnlocked = !!done;
  }

  /**
   * A skin is unlocked when the player has beaten its difficulty at least
   * once this session, or (fallback for pre-existing saves) reached the
   * legacy score milestone. D0 skins are always available. Prize skins are
   * gated purely on their challenge.
   */
  isUnlocked(skin, bestScore, bestDifficulty = 0) {
    if (skin.challengePrize) return this.challengeUnlocked;
    return bestDifficulty >= (skin.unlockDifficulty || 0) ||
           bestScore >= (skin.unlockScore || 0);
  }

  getUnlocked(bestScore, bestDifficulty = 0) {
    return SKINS.filter(s => this.isUnlocked(s, bestScore, bestDifficulty));
  }

  getActive(bestScore, bestDifficulty = 0) {
    const unlocked = this.getUnlocked(bestScore, bestDifficulty);
    return unlocked.find(s => s.id === this.currentSkinId) ||
           unlocked[0] || SKINS[0];
  }

  select(id) {
    this.currentSkinId = id;
    localStorage.setItem('bottle_flip_skin', id);
  }
}
