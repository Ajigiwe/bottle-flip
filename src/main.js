import './style.css';
import { PhysicsWorld } from './physics.js';
import { MotionController } from './motion.js';
import { GameRenderer } from './render.js';
import { soundManager } from './audio.js';
import { Leaderboard } from './leaderboard.js';
import { AchievementSystem } from './achievements.js';
import { SkinSystem, SKINS } from './skinSystem.js';
import { GameMode } from './gameState.js';
import { ChallengeSystem, CHALLENGES, TIER_META } from './challenges.js';

const TIMED_DURATION = 30; // seconds for blitz mode
const CHALLENGE_LIVES = 5; // gauntlet mode: tight budget, every miss hurts

class BottleFlipGame {
  constructor() {
    this.canvas = document.getElementById('game-canvas');
    this.score = 0;
    this.streak = 0;
    this.lives = 3;
    this.bestScore = parseInt(localStorage.getItem('bottle_flip_best') || '0', 10);
    // Highest difficulty ever beaten (persists) — gates cosmetic unlocks.
    this.bestDifficulty = parseInt(localStorage.getItem('bf_best_difficulty') || '0', 10);
    this.gameActive = false;
    this.gameMode = GameMode.LIVES;

    // Timed mode
    this.timeLeft = TIMED_DURATION;
    this._timerInterval = null;

    // Challenge Gauntlet
    this.challenges = new ChallengeSystem();
    this.stats = this.challenges.stats; // career stats (bullseyes, streak, gauntlet runs)
    this.challengeLives = CHALLENGE_LIVES;
    this._challengePointsPool = 0; // bonus points claimed during this game
    this._dailyBankedPoints = 0;   // daily-challenge prize banked this game

    // Subsystems
    this.leaderboard = new Leaderboard();
    this.achievements = new AchievementSystem();
    this.skinSystem = new SkinSystem();

    // Persistent stats for achievements
    this._totalLandings = parseInt(localStorage.getItem('bf_total_landings') || '0', 10);
    this._totalBullseyes = parseInt(localStorage.getItem('bf_total_bullseyes') || '0', 10);
    this._maxStreak = parseInt(localStorage.getItem('bf_max_streak') || '0', 10);

    this.initUI();
    this.initGame();

    // Dev-only handle for in-page integration testing.
    if (import.meta.env.DEV) window.__flipPure = this;
  }

  // ── UI Setup ─────────────────────────────────────────────────────────────

  initUI() {
    // HUD values
    this.scoreVal    = document.getElementById('score-val');
    this.streakVal   = document.getElementById('streak-val');
    this.bestVal     = document.getElementById('best-val');
    this.homeBestVal = document.getElementById('home-best-val');
    this.streakCard  = document.getElementById('streak-card');
    this.livesVal    = document.getElementById('lives-val');
    this.timerVal    = document.getElementById('timer-val');
    this.timerCard   = document.getElementById('timer-card');
    this.difficultyVal = document.getElementById('difficulty-val');

    this.bestVal.textContent = this.bestScore;
    if (this.homeBestVal) this.homeBestVal.textContent = this.bestScore;

    // Screens
    this.homeScreen      = document.getElementById('home-screen');
    this.gameoverScreen  = document.getElementById('gameover-screen');
    this.settingsModal   = document.getElementById('settings-modal');
    this.howModal        = document.getElementById('how-modal');
    this.hintOverlay     = document.getElementById('hint-overlay');
    this.sensorModal     = document.getElementById('sensor-modal');
    this.resultToast     = document.getElementById('result-toast');
    this.toastTitle      = document.getElementById('toast-title');
    this.toastSub        = document.getElementById('toast-sub');
    this.leaderboardModal  = document.getElementById('leaderboard-modal');
    this.achievementsModal = document.getElementById('achievements-modal');
    this.skinsModal        = document.getElementById('skins-modal');
    this.challengesModal   = document.getElementById('challenges-modal');
    this.challengeBanner   = document.getElementById('challenge-banner');
    this.challengeLivesVal = document.getElementById('challenge-lives-val');
    this.achToast          = document.getElementById('ach-toast');
    this.achToastText      = document.getElementById('ach-toast-text');

    // Game-over
    this.gameoverScoreVal = document.getElementById('gameover-score-val');
    this.gameoverBestVal  = document.getElementById('gameover-best-val');
    this.gameoverModeVal  = document.getElementById('gameover-mode-val');
    this.gameoverPlayBtn  = document.getElementById('gameover-play-btn');
    this.gameoverHomeBtn  = document.getElementById('gameover-home-btn');
    this.shareBtn         = document.getElementById('share-btn');

    // Buttons
    this.startGameBtn    = document.getElementById('start-game-btn');
    this.homeHowBtn      = document.getElementById('home-how-btn');
    this.homeNavBtn      = document.getElementById('home-nav-btn');
    this.settingsBtn     = document.getElementById('settings-btn');
    this.closeSettingsBtn = document.getElementById('close-settings-btn');
    this.howToPlayBtn    = document.getElementById('how-to-play-btn');
    this.closeHowBtn     = document.getElementById('close-how-btn');
    this.sensitivitySlider  = document.getElementById('sensitivity-slider');
    this.sensitivityDisplay = document.getElementById('sensitivity-display');
    this.resetBtn        = document.getElementById('reset-btn');
    this.audioToggleBtn  = document.getElementById('audio-toggle-btn');
    this.audioSvgOn      = document.getElementById('audio-svg-on');
    this.audioSvgOff     = document.getElementById('audio-svg-off');
    this.grantSensorBtn  = document.getElementById('grant-sensor-btn');
    this.skipSensorBtn   = document.getElementById('skip-sensor-btn');
    this.fillSelector    = document.getElementById('fill-selector');
    this.modeSelector    = document.getElementById('mode-selector');
    this.lbBtn           = document.getElementById('leaderboard-btn');
    this.closeLbBtn      = document.getElementById('close-lb-btn');
    this.achBtn          = document.getElementById('achievements-btn');
    this.closeAchBtn     = document.getElementById('close-ach-btn');
    this.skinsBtn        = document.getElementById('skins-btn');
    this.closeSkinsBtn   = document.getElementById('close-skins-btn');
    this.challengesBtn   = document.getElementById('challenges-btn');
    this.questsBtn       = this.challengesBtn;
    this.closeChallengesBtn = document.getElementById('close-challenges-btn');
    this.statsBtn        = document.getElementById('stats-btn');
    this.closeStatsBtn   = document.getElementById('close-stats-btn');
    this.statsModal      = document.getElementById('stats-modal');

    // Audio initial state
    if (soundManager.isMuted) {
      this.audioSvgOn.classList.add('hidden');
      this.audioSvgOff.classList.remove('hidden');
    }

    this._bindEvents();
    this._updateQuestBadge();
    this._renderSkinPicker();
    this._renderAchievements();
    this._renderLeaderboard();
    this._syncChallengeState();
    this._renderChallenges();
  }

  _bindEvents() {
    // Home
    this.startGameBtn.addEventListener('click', () => {
      soundManager.playClick();
      this.startNewGame();
    });
    this.homeNavBtn.addEventListener('click', () => {
      soundManager.playClick();
      this.homeScreen.classList.remove('hidden');
    });
    this.homeHowBtn.addEventListener('click', () => {
      soundManager.playClick();
      this.howModal.classList.remove('hidden');
    });
    this.howToPlayBtn.addEventListener('click', () => {
      soundManager.playClick();
      this.howModal.classList.remove('hidden');
    });
    this.closeHowBtn.addEventListener('click', () => {
      soundManager.playClick();
      this.howModal.classList.add('hidden');
    });

    // Settings
    this.settingsBtn.addEventListener('click', () => {
      soundManager.playClick();
      this.settingsModal.classList.remove('hidden');
    });
    this.closeSettingsBtn.addEventListener('click', () => {
      soundManager.playClick();
      this.settingsModal.classList.add('hidden');
    });

    // Sensitivity slider
    if (this.sensitivitySlider) {
      const saved = localStorage.getItem('bottle_flip_sensitivity') || '5';
      this.sensitivitySlider.value = saved;
      this.updateSensitivityLabel(saved);
      this.sensitivitySlider.addEventListener('input', (e) => {
        this.updateSensitivityLabel(e.target.value);
        if (this.motionController) this.motionController.setSensitivityLevel(e.target.value);
      });
    }

    // Game controls
    this.resetBtn.addEventListener('click', () => {
      soundManager.playClick();
      this.resetBottle();
    });
    this.audioToggleBtn.addEventListener('click', () => {
      const muted = soundManager.toggleMute();
      this.audioSvgOn.classList.toggle('hidden', muted);
      this.audioSvgOff.classList.toggle('hidden', !muted);
    });

    // Sensor
    this.enableSensorBtn = document.getElementById('enable-sensor-btn');
    this.enableSensorBtn?.addEventListener('click', async () => {
      soundManager.playClick();
      const granted = await this.motionController.requestPermission();
      this.showToast(granted ? 'SENSOR ENABLED' : 'SENSOR DENIED',
        granted ? 'Flick your phone to throw!' : 'Using Touch/Swipe Controls');
      this.settingsModal.classList.add('hidden');
    });

    this.grantSensorBtn.addEventListener('click', async () => {
      soundManager.playClick();
      const granted = await this.motionController.requestPermission();
      this.showToast(granted ? 'SENSOR ENABLED' : 'SENSOR DENIED',
        granted ? 'Flick your phone to throw!' : 'Using Touch/Swipe Controls');
      this.sensorModal.classList.add('hidden');
    });
    this.skipSensorBtn.addEventListener('click', () => {
      soundManager.playClick();
      this.sensorModal.classList.add('hidden');
    });

    // Water fill
    this.fillSelector.addEventListener('click', (e) => {
      const btn = e.target.closest('.segment-btn');
      if (!btn) return;
      soundManager.playClick();
      document.querySelectorAll('.segment-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      this.physics.setLiquidFill(parseFloat(btn.dataset.fill));
      this.resetBottle();
    });

    // Game mode selector
    if (this.modeSelector) {
      this.modeSelector.addEventListener('click', (e) => {
        const btn = e.target.closest('.mode-btn');
        if (!btn) return;
        soundManager.playClick();
        document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.gameMode =
          btn.dataset.mode === 'TIMED' ? GameMode.TIMED :
          btn.dataset.mode === 'CHALLENGE' ? GameMode.CHALLENGE : GameMode.LIVES;
        this._syncModeUI();
      });
    }

    // Leaderboard
    this.lbBtn?.addEventListener('click', () => {
      soundManager.playClick();
      this._renderLeaderboard();
      this.leaderboardModal.classList.remove('hidden');
    });
    this.closeLbBtn?.addEventListener('click', () => {
      soundManager.playClick();
      this.leaderboardModal.classList.add('hidden');
    });

    // Achievements
    this.achBtn?.addEventListener('click', () => {
      soundManager.playClick();
      this._renderAchievements();
      this.achievementsModal.classList.remove('hidden');
    });
    this.closeAchBtn?.addEventListener('click', () => {
      soundManager.playClick();
      this.achievementsModal.classList.add('hidden');
    });

    // Skins
    this.skinsBtn?.addEventListener('click', () => {
      soundManager.playClick();
      this._renderSkinPicker();
      this.skinsModal.classList.remove('hidden');
    });
    this.closeSkinsBtn?.addEventListener('click', () => {
      soundManager.playClick();
      this.skinsModal.classList.add('hidden');
    });

    // Challenges
    this.challengesBtn?.addEventListener('click', () => {
      soundManager.playClick();
      this._renderChallenges();
      this.challengesModal.classList.remove('hidden');
    });
    this.closeChallengesBtn?.addEventListener('click', () => {
      soundManager.playClick();
      this.challengesModal.classList.add('hidden');
    });

    // Stats
    this.statsBtn?.addEventListener('click', () => {
      soundManager.playClick();
      this._renderStats();
      this.statsModal.classList.remove('hidden');
    });
    this.closeStatsBtn?.addEventListener('click', () => {
      soundManager.playClick();
      this.statsModal.classList.add('hidden');
    });

    // Game over
    this.gameoverPlayBtn?.addEventListener('click', () => {
      soundManager.playClick();
      this.gameoverScreen.classList.add('hidden');
      this.startNewGame();
    });
    this.gameoverHomeBtn?.addEventListener('click', () => {
      soundManager.playClick();
      this.gameoverScreen.classList.add('hidden');
      this.homeScreen.classList.remove('hidden');
    });

    // Share
    this.shareBtn?.addEventListener('click', () => {
      soundManager.playClick();
      this._shareScore();
    });
  }

  // ── Game Lifecycle ────────────────────────────────────────────────────────

  startNewGame() {
    this.score = 0;
    this.streak = 0;
    this.totalFlips = 0;
    this.timeLeft = TIMED_DURATION;
    this.challengeLives = CHALLENGE_LIVES;
    this._challengePointsPool = 0;
    this.gameActive = true;

    this.scoreVal.textContent = '0';
    this.streakVal.textContent = '0';
    this.streakCard.classList.remove('active-streak');
    this.updateFlipsDisplay();
    this.achievements.resetSession();
    this.challenges.resetSession();
    this._gauntletWon = false; // one win counted per run
    if (this.gameMode === GameMode.CHALLENGE) this.stats.startGauntletRun();
    // Roll a new daily task if the calendar day (or the task) changed.
    this.challenges.daily._load();

    // Bank the daily prize if today's task was completed earlier but not
    // yet claimed (e.g. the app was closed right after finishing it).
    if (this.challenges.daily.isDone && !this.challenges.daily.isClaimed) {
      this.challenges.daily.claim();
      const dailyPrize = this.challenges.daily.prizeAmount();
      this._dailyBankedPoints = dailyPrize;
      this.score += dailyPrize;
    }

    this.physics.resetDifficulty();

    // Bank any challenge bonuses completed earlier but not yet claimed
    // (e.g. the app was closed right after finishing a task).
    const banked = this.challenges.totalBonusPoints();
    if (banked > 0) {
      this._challengePointsPool += banked;
      this.score += banked;
      for (const c of CHALLENGES) {
        const p = this.challenges.progress[c.id];
        if (c.prize.kind === 'points' && p?.done && !p.claimed) this.challenges.claim(c.id);
      }
      this.scoreVal.textContent = this.score;
    }

    this.homeScreen.classList.add('hidden');
    this.gameoverScreen.classList.add('hidden');

    // Prompt iOS / mobile users for motion sensor permissions if needed
    if (this.motionController && this.motionController.requiresPermissionPrompt()) {
      this.sensorModal?.classList.remove('hidden');
    }

    this._syncModeUI();

    if (this.gameMode === GameMode.TIMED) {
      this._startTimer();
    }

    soundManager.startBgMusic();
    this.resetBottle();
  }

  _startTimer() {
    clearInterval(this._timerInterval);
    this.timeLeft = TIMED_DURATION;
    this._updateTimerDisplay();
    this._timerInterval = setInterval(() => {
      this.timeLeft = Math.max(0, this.timeLeft - 1);
      this._updateTimerDisplay();
      if (this.timeLeft <= 0) {
        clearInterval(this._timerInterval);
        this.achievements.updateStats({ completedTimedMode: true });
        this._triggerGameOver();
      }
    }, 1000);
  }

  _updateTimerDisplay() {
    if (this.timerVal) {
      this.timerVal.textContent = `${this.timeLeft}s`;
      if (this.timeLeft <= 10) {
        this.timerCard?.classList.add('timer-danger');
      }
    }
  }

  _syncModeUI() {
    const isLives = this.gameMode === GameMode.LIVES;
    const isChallenge = this.gameMode === GameMode.CHALLENGE;
    document.getElementById('lives-card')?.classList.toggle('hidden', !isLives);
    this.timerCard?.classList.toggle('hidden', isLives || isChallenge);
    if (isLives) {
      this.timerCard?.classList.remove('timer-danger');
    }
    if (this.difficultyVal) {
      this.difficultyVal.textContent = `D${this.physics?.difficulty ?? 0}`;
    }
    // Challenge banner: only during an active gauntlet run.
    const showBanner = isChallenge && this.gameActive;
    this.challengeBanner?.classList.toggle('hidden', !showBanner);
    if (showBanner) this._updateChallengeBanner();
  }

  _updateChallengeBanner() {
    if (this.challengeLivesVal) {
      this.challengeLivesVal.textContent = `${this.challengeLives}`;
    }      const taskEl = document.getElementById('challenge-next-task');
      if (taskEl) {
        const next = CHALLENGES.find(c => !this.challenges.progress[c.id]?.done);
        taskEl.textContent = next
          ? `${next.icon} ${next.title} · ${this.challenges.progressLabel(next)}`
          : `🏆 All challenges complete! · ${this.stats.gauntletWins} wins`;
      }
  }

  updateSensitivityLabel(val) {
    const v = parseInt(val, 10);
    let desc = 'Standard';
    if (v <= 2) desc = 'Very Low';
    else if (v <= 4) desc = 'Low / Firm';
    else if (v === 5) desc = 'Standard';
    else if (v <= 7) desc = 'Medium High';
    else if (v <= 9) desc = 'High';
    else desc = 'Ultra Sensitive';
    if (this.sensitivityDisplay) this.sensitivityDisplay.textContent = `Lvl ${v} (${desc})`;
  }

  updateFlipsDisplay() {
    if (!this.livesVal) return;
    this.livesVal.textContent = `${this.totalFlips || 0}`;
  }

  // ── Game Initialisation ───────────────────────────────────────────────────

  initGame() {
    this.physics = new PhysicsWorld(window.innerWidth, window.innerHeight);
    // Start from the saved skin; the active skin IS the container — physics
    // silhouette, weight and restitution all come from its shape profile.
    const skin = this.skinSystem.getActive(this.bestScore, this.bestDifficulty);
    this.physics.setShape(skin.shape);

    this.motionController = new MotionController(
      this.physics, soundManager, (type) => this.handleThrowTriggered(type)
    );
    if (this.sensitivitySlider) {
      this.motionController.setSensitivityLevel(this.sensitivitySlider.value);
    }

    this.renderer = new GameRenderer(this.canvas, this.physics, this.motionController, this.skinSystem);

    this.physics.onCollisionCallback = (other, speed) => {
      if (speed > 1.2) soundManager.playThud(speed, false);
    };

    this.physics.onLandingCallback = (result) => this.handleLandingResult(result);

    this.lastTime = performance.now();
    requestAnimationFrame(this.gameLoop.bind(this));
  }

  handleThrowTriggered(type) {
    this.hintOverlay?.classList.add('hidden');
    this.totalFlips++;
    this.updateFlipsDisplay();
  }

  // ── Landing Result ────────────────────────────────────────────────────────

  handleLandingResult(result) {
    if (!this.gameActive) return;

    const bottlePos = this.physics.bottle.position;

    if (result.isUpright && (result.isTable || result.isTarget || result.isOnGround)) {
      this.streak++;
      this._totalLandings++;
      const isBullseye = result.isTarget;
      const isHeadstand = result.isHeadstand;
      if (isBullseye) this._totalBullseyes++;
      if (isHeadstand) this._hasCapLanding = true;
      this._maxStreak = Math.max(this._maxStreak, this.streak);

      this._saveStats();

      const multiplier = Math.min(this.streak, 5);
      const basePoints = isHeadstand ? 500 : (isBullseye ? 150 : 50);
      const points = basePoints * multiplier;
      this.score += points;

      // Challenge Gauntlet: feed the landing in; newly-completed tasks
      // grant their prizes immediately.
      const completed = this.challenges.recordLanding(result, {
        streak: this.streak,
        score: this.score,
        difficulty: this.physics.difficulty,
        points,
      });
      for (const c of completed) this._grantChallengePrize(c);

      // Daily challenge: same landing stream feeds today's task.
      const dailyDone = this.challenges.daily.recordLanding(result, { streak: this.streak, points });
      if (dailyDone) this._grantDailyPrize();
      this._updateChallengeBanner();
      this._updateQuestBadge();

      // Gauntlet run won: every challenge finished during this run.
      if (this.gameMode === GameMode.CHALLENGE && !this._gauntletWon
          && CHALLENGES.every(c => this.challenges.progress[c.id]?.done)) {
        this._gauntletWon = true;
        this.stats.winGauntletRun();
      }

      const newBest = this.score > this.bestScore;
      if (newBest) {
        this.bestScore = this.score;
        localStorage.setItem('bottle_flip_best', this.bestScore.toString());
        this.bestVal.textContent = this.bestScore;
        if (this.homeBestVal) this.homeBestVal.textContent = this.bestScore;
      }
      // Record the highest difficulty beaten for skin unlocks.
      if (this.physics.difficulty > this.bestDifficulty) {
        this.bestDifficulty = this.physics.difficulty;
        localStorage.setItem('bf_best_difficulty', this.bestDifficulty.toString());
      }

      this.scoreVal.textContent = this.score;
      this.streakVal.textContent = `${this.streak}`;
      if (this.streak >= 2) this.streakCard.classList.add('active-streak');
      if (this.difficultyVal) this.difficultyVal.textContent = `D${this.physics.difficulty}`;

      // Audio
      if (isHeadstand || isBullseye) {
        soundManager.playBullseye();
      } else {
        soundManager.playSuccess(this.streak);
      }
      if (this.streak >= 3 || isHeadstand) soundManager.playCrowdCheer(5);
      soundManager.vibrateStreak(this.streak);

      // Visuals
      this.renderer.triggerLandingParticles(bottlePos.x, bottlePos.y, true, this.streak);
      if (isHeadstand) {
        this.renderer.triggerCapConfetti(bottlePos.x, bottlePos.y);
      }

      const title = isHeadstand ? '👑 CAP LANDING!' : (isBullseye ? '🎯 BULLSEYE!' : (this.streak >= 3 ? '🔥 ON FIRE!' : '✅ PERFECT LANDING!'));
      const sub = `+${points} PTS • ${isHeadstand ? 'LEGENDARY HEADSTAND! ' : ''}STREAK x${this.streak}${result.difficulty > 0 ? ` • D${result.difficulty}` : ''}`;
      this.showToast(title, sub, false);

      // Achievements
      const newAch = this.achievements.updateStats({
        totalLandings: this._totalLandings,
        totalBullseyes: this._totalBullseyes,
        maxStreak: this._maxStreak,
        sessionScore: this.score,
        hasCapLanding: this._hasCapLanding,
      });
      newAch.forEach(a => this._showAchievementToast(a));

      setTimeout(() => {
        this.physics.repositionTargetSpot();
        this.resetBottle();
      }, 1400);

    } else {
      this.streak = 0;
      this.streakVal.textContent = '0';
      this.streakCard.classList.remove('active-streak');

      soundManager.playCrash(1.5);
      this.renderer.triggerLandingParticles(bottlePos.x, bottlePos.y, false, 0);

      // Challenge gauntlet: strict life budget — run out and the run ends.
      if (this.gameMode === GameMode.CHALLENGE) {
        this.challengeLives--;
        this._updateChallengeBanner();
        if (this.challengeLives <= 0) {
          this.showToast('💀 GAUNTLET FAILED', 'Out of lives — tasks kept', true);
          setTimeout(() => this._triggerGameOver(), 1600);
          return;
        }
      }

      // Near miss: the bottle stood nearly upright at rest before toppling.
      if (result.nearMiss) {
        this.showToast('😰 SO CLOSE!', 'It nearly stood — then toppled!', true);
      } else {
        this.showToast('❌ MISSED', 'Keep trying!', true);
      }
      // Let the failed pose sit on screen a beat longer than a success so
      // the player can see HOW it fell before the reset.
      setTimeout(() => this.resetBottle(), 1900);
    }
  }

  _triggerGameOver() {
    this.gameActive = false;
    clearInterval(this._timerInterval);
    soundManager.stopBgMusic();
    this.challengeBanner?.classList.add('hidden');
    this.stats.refresh(); // stats modal + gameover read lifetime counters

    // Submit to leaderboard
    this.leaderboard.submit(this.score, this.gameMode);
    this._renderLeaderboard();

    // Update achievement stats for timed mode completion
    if (this.gameMode === GameMode.TIMED) {
      this.achievements.updateStats({ completedTimedMode: true });
    }

    if (this.gameoverScoreVal) this.gameoverScoreVal.textContent = this.score;
    if (this.gameoverBestVal) this.gameoverBestVal.textContent = this.bestScore;
    if (this.gameoverModeVal) {
      this.gameoverModeVal.textContent =
        this.gameMode === GameMode.TIMED ? '⚡ TIMED BLITZ' :
        this.gameMode === GameMode.CHALLENGE ? '🏆 CHALLENGE GAUNTLET' : '♾️ CLASSIC LIVES';
    }
    this.gameoverScreen.classList.remove('hidden');
  }

  resetBottle() {
    this.physics.spawnBottle();
  }

  // ── Challenge Gauntlet ─────────────────────────────────────────────────

  /** Grant a challenge's prize the moment its task completes. */
  _grantChallengePrize(challenge) {
    const p = this.challenges.progress[challenge.id];
    if (!p || p.claimed) return;
    this.challenges.claim(challenge.id);

    if (challenge.prize.kind === 'points') {
      this._challengePointsPool += challenge.prize.amount;
      this.score += challenge.prize.amount;
      this.scoreVal.textContent = this.score;
      if (this.score > this.bestScore) {
        this.bestScore = this.score;
        localStorage.setItem('bottle_flip_best', this.bestScore.toString());
        this.bestVal.textContent = this.bestScore;
        if (this.homeBestVal) this.homeBestVal.textContent = this.bestScore;
      }
    } else if (challenge.prize.kind === 'skin') {
      this.skinSystem.setChallengeUnlocked(true);
      this._syncChallengeState();
      this._renderSkinPicker();
      this.renderer.triggerCapConfetti(window.innerWidth / 2, window.innerHeight / 2);
    }

    this._showChallengeToast(challenge);
    soundManager.playCrowdCheer(8);
  }

  /** Grant the daily challenge's prize the moment today's task completes. */
  _grantDailyPrize() {
    const d = this.challenges.daily;
    if (d.isClaimed) return;
    d.claim();

    const amount = d.prizeAmount();
    this._dailyBankedPoints += amount;
    this.score += amount;
    this.scoreVal.textContent = this.score;
    if (this.score > this.bestScore) {
      this.bestScore = this.score;
      localStorage.setItem('bottle_flip_best', this.bestScore.toString());
      this.bestVal.textContent = this.bestScore;
      if (this.homeBestVal) this.homeBestVal.textContent = this.bestScore;
    }

    const streakDays = d.liveStreak;
    this._showChallengeToast({
      tier: 'gold',
      title: `Daily ${d.entry.title}${streakDays > 1 ? ` (🔥 ${streakDays}-day streak!)` : ''}`,
      prize: { label: `+${amount} bonus` },
    });
    soundManager.playCrowdCheer(8);
  }

  /** Persist the challenge-unlocked flag into the skin system + skin picker. */
  _syncChallengeState() {
    this.skinSystem.setChallengeUnlocked(this.challenges.completedCount >= CHALLENGES.length);
  }

  _showChallengeToast(challenge) {
    if (!this.achToast || !this.achToastText) return;
    const meta = TIER_META[challenge.tier];
    this.achToastText.textContent = `${meta.icon} CHALLENGE: ${challenge.title} — ${challenge.prize.label}`;
    this.achToast.classList.remove('hidden');
    clearTimeout(this._challengeToastTimeout);
    this._challengeToastTimeout = setTimeout(() => this.achToast.classList.add('hidden'), 2800);
  }

  // ── Challenge Modal Render ──────────────────────────────────────────

  _renderChallenges() {
    const grid = document.getElementById('challenges-grid');
    if (!grid) return;
    grid.innerHTML = this._dailyCardHtml() + CHALLENGES.map(c => {
      const meta = TIER_META[c.tier];
      const done = this.challenges.progress[c.id]?.done;
      const ratio = this.challenges.ratioFor(c);
      const isPrize = c.prize.kind === 'skin';
      return `
        <div class="challenge-card ${done ? 'done' : ''} tier-${c.tier}">
          <div class="challenge-head">
            <span class="challenge-icon">${done ? '✅' : c.icon}</span>
            <div class="challenge-titles">
              <span class="challenge-title">${c.title}</span>
              <span class="challenge-desc">${c.desc}</span>
            </div>
            <span class="challenge-tier" style="color:${meta.color}">${meta.label}</span>
          </div>
          <div class="challenge-bar"><div class="challenge-fill" style="width:${Math.round(ratio * 100)}%"></div></div>
          <div class="challenge-foot">
            <span class="challenge-progress">${this.challenges.progressLabel(c)}</span>
            <span class="challenge-prize">${isPrize ? '🏆' : '💰'} ${c.prize.label}</span>
          </div>
        </div>
      `;
    }).join('');
  }

  // ── Stats Screen Render ─────────────────────────────────────────────

  _renderStats() {
    const grid = document.getElementById('stats-grid');
    if (!grid) return;
    this.stats.refresh();
    const cards = [
      { icon: '🎯', label: 'CAREER BULLSEYES', value: this.stats.bullseyes },
      { icon: '🔥', label: 'BEST STREAK',       value: this.stats.bestStreak },
      { icon: '🏆', label: 'GAUNTLET RUNS WON', value: this.stats.gauntletWins },
      { icon: '🍾', label: 'TOTAL LANDINGS',    value: this.stats.landings },
      { icon: '⚔️', label: 'GAUNTLET RUNS',     value: this.stats.gauntletRuns },
    ];
    const winRate = this.stats.gauntletRuns > 0
      ? Math.round(100 * this.stats.gauntletWins / this.stats.gauntletRuns)
      : null;
    grid.innerHTML = cards.map(c => `
      <div class="stat-card">
        <span class="stat-icon">${c.icon}</span>
        <span class="stat-value">${c.value}</span>
        <span class="stat-label">${c.label}</span>
      </div>
    `).join('') + (winRate !== null ? `
      <div class="stat-card stat-card-wide">
        <span class="stat-label">GAUNTLET WIN RATE</span>
        <div class="stat-bar"><div class="stat-fill" style="width:${winRate}%"></div></div>
        <span class="stat-value stat-value-small">${winRate}%</span>
      </div>
    ` : '');
  }
  _dailyCardHtml() {
    const d = this.challenges.daily;
    const e = d.entry;
    const desc = e.descTemplate.replace('{goal}', d.goal);
    const streakDays = d.liveStreak;
    return `
      <div class="challenge-card daily tier-gold ${d.isDone ? 'done' : ''}">
        <div class="challenge-head">
          <span class="challenge-icon">${d.isDone ? '✅' : e.icon}</span>
          <div class="challenge-titles">
            <span class="challenge-title">Daily — ${e.title}</span>
            <span class="challenge-desc">${desc}</span>
          </div>
          <span class="challenge-tier daily-streak">🔥 ${streakDays}-day streak</span>
        </div>
        <div class="challenge-bar"><div class="challenge-fill" style="width:${Math.round(d.ratio() * 100)}%"></div></div>
        <div class="challenge-foot">
          <span class="challenge-progress">${d.label()}</span>
          <span class="challenge-prize">💰 ${d.prizeLabel()}${streakDays > 0 && !d.isDone ? ' (streak bonus)' : ''}</span>
        </div>
      </div>
    `;
  }

  /** Red dot on the QUESTS button while today's daily is unfinished. */
  _updateQuestBadge() {
    this.questsBtn?.classList.toggle('has-notification', !this.challenges.daily.isDone);
  }

  // ── Toast Notifications ───────────────────────────────────────────────────

  showToast(title, subtitle, isFail = false) {
    this.toastTitle.textContent = title;
    this.toastSub.textContent = subtitle;
    this.resultToast.classList.toggle('fail', isFail);
    this.resultToast.classList.remove('hidden');
    clearTimeout(this._toastTimeout);
    this._toastTimeout = setTimeout(() => this.resultToast.classList.add('hidden'), 1200);
  }

  _showAchievementToast(ach) {
    if (!this.achToast || !this.achToastText) return;
    this.achToastText.textContent = `${ach.icon} ${ach.name} — ${ach.desc}`;
    this.achToast.classList.remove('hidden');
    clearTimeout(this._achToastTimeout);
    this._achToastTimeout = setTimeout(() => this.achToast.classList.add('hidden'), 2800);
  }

  // ── Share Score ───────────────────────────────────────────────────────────

  async _shareScore() {
    const modeLabel = this.gameMode === GameMode.TIMED ? 'Timed Blitz' : 'Classic';
    const text = `🍾 I scored ${this.score} pts in Flip Pure (${modeLabel} mode)! Can you beat me?`;
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Flip Pure', text, url: window.location.href });
      } catch (_) {}
    } else {
      try {
        await navigator.clipboard.writeText(text);
        this.showToast('📋 COPIED!', 'Score copied to clipboard');
      } catch (_) {}
    }
  }

  // ── Leaderboard Render ────────────────────────────────────────────────────

  _renderLeaderboard() {
    const list = document.getElementById('lb-list');
    if (!list) return;
    const entries = this.leaderboard.getEntries();
    if (entries.length === 0) {
      list.innerHTML = '<li class="lb-empty">No scores yet. Play a game!</li>';
      return;
    }
    list.innerHTML = entries.map((e, i) => `
      <li class="lb-entry ${i === 0 ? 'lb-first' : ''}">
        <span class="lb-rank">${['🥇','🥈','🥉','4.','5.'][i]}</span>
        <span class="lb-score">${e.score}</span>
        <span class="lb-meta">${e.mode || ''} · ${e.date}</span>
      </li>
    `).join('');
  }

  // ── Achievements Render ────────────────────────────────────────────────────

  _renderAchievements() {
    const grid = document.getElementById('ach-grid');
    if (!grid) return;
    const all = this.achievements.getAll();
    grid.innerHTML = all.map(a => `
      <div class="ach-badge ${a.isUnlocked ? 'unlocked' : 'locked'}" title="${a.desc}">
        <span class="ach-icon">${a.isUnlocked ? a.icon : '🔒'}</span>
        <span class="ach-name">${a.name}</span>
      </div>
    `).join('');
  }

  // ── Skin Picker Render ────────────────────────────────────────────────────

  _renderSkinPicker() {
    const grid = document.getElementById('skins-grid');
    if (!grid) return;
    grid.innerHTML = SKINS.map(s => {
      const isUnlocked = this.skinSystem.isUnlocked(s, this.bestScore, this.bestDifficulty);
      const isActive = this.skinSystem.currentSkinId === s.id;
      const lockText = s.unlockDifficulty > 0 && !(this.bestDifficulty >= s.unlockDifficulty)
        ? `Beat difficulty D${s.unlockDifficulty} to unlock`
        : s.desc;
      return `
        <button class="skin-card ${isActive ? 'active' : ''} ${!isUnlocked ? 'locked' : ''}"
                data-skin="${s.id}" ${!isUnlocked ? 'disabled' : ''}>
          <span class="skin-icon">${s.icon}</span>
          <span class="skin-name">${s.name}</span>
          <span class="skin-desc">${isUnlocked ? (isActive ? '✓ Active' : lockText) : `🔒 ${lockText}`}</span>
        </button>
      `;
    }).join('');

    grid.addEventListener('click', (e) => {
      const btn = e.target.closest('.skin-card:not([disabled])');
      if (!btn) return;
      soundManager.playClick();
      this.skinSystem.select(btn.dataset.skin);
      // The selected skin IS the container: rebuild the physics body with
      // the new shape immediately, even mid-session.
      const skin = SKINS.find(s => s.id === btn.dataset.skin);
      if (skin && this.physics) this.physics.setShape(skin.shape);
      this._renderSkinPicker(); // re-render to update active state
    });
  }

  // ── Persistent Stats ──────────────────────────────────────────────────────

  _saveStats() {
    localStorage.setItem('bf_total_landings', this._totalLandings);
    localStorage.setItem('bf_total_bullseyes', this._totalBullseyes);
    localStorage.setItem('bf_max_streak', this._maxStreak);
  }

  // ── Game Loop ─────────────────────────────────────────────────────────────

  gameLoop(timestamp) {
    const dt = Math.min(50, timestamp - this.lastTime);
    this.lastTime = timestamp;

    this.physics.update(dt);
    this.renderer.render(this.streak, this.bestScore);

    requestAnimationFrame(this.gameLoop.bind(this));
  }
}

// Register Service Worker for PWA offline caching.
// In dev (`vite` serves source directly, no build) skip entirely — dev URLs
// (/src/*.js) are not the hashed production assets the SW precaches.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

window.addEventListener('DOMContentLoaded', () => {
  new BottleFlipGame();
});

