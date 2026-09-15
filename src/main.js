import './style.css';
import { PhysicsWorld } from './physics.js';
import { MotionController } from './motion.js';
import { GameRenderer } from './render.js';
import { soundManager } from './audio.js';
import { Leaderboard } from './leaderboard.js';
import { AchievementSystem } from './achievements.js';
import { SkinSystem, SKINS } from './skinSystem.js';
import { GameMode } from './gameState.js';

const TIMED_DURATION = 30; // seconds for blitz mode

class BottleFlipGame {
  constructor() {
    this.canvas = document.getElementById('game-canvas');
    this.score = 0;
    this.streak = 0;
    this.lives = 3;
    this.bestScore = parseInt(localStorage.getItem('bottle_flip_best') || '0', 10);
    this.gameActive = false;
    this.gameMode = GameMode.LIVES;

    // Timed mode
    this.timeLeft = TIMED_DURATION;
    this._timerInterval = null;

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

    // Audio initial state
    if (soundManager.isMuted) {
      this.audioSvgOn.classList.add('hidden');
      this.audioSvgOff.classList.remove('hidden');
    }

    this._bindEvents();
    this._renderSkinPicker();
    this._renderAchievements();
    this._renderLeaderboard();
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
        this.gameMode = btn.dataset.mode === 'TIMED' ? GameMode.TIMED : GameMode.LIVES;
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
    this.gameActive = true;

    this.scoreVal.textContent = '0';
    this.streakVal.textContent = '0';
    this.streakCard.classList.remove('active-streak');
    this.updateFlipsDisplay();
    this.achievements.resetSession();
    this.physics.resetDifficulty();

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
    document.getElementById('lives-card')?.classList.toggle('hidden', !isLives);
    this.timerCard?.classList.toggle('hidden', isLives);
    if (isLives) {
      this.timerCard?.classList.remove('timer-danger');
    }
    if (this.difficultyVal) {
      this.difficultyVal.textContent = `D${this.physics?.difficulty ?? 0}`;
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
      if (isBullseye) this._totalBullseyes++;
      this._maxStreak = Math.max(this._maxStreak, this.streak);

      this._saveStats();

      const multiplier = Math.min(this.streak, 5);
      const points = (isBullseye ? 150 : 50) * multiplier;
      this.score += points;

      if (this.score > this.bestScore) {
        this.bestScore = this.score;
        localStorage.setItem('bottle_flip_best', this.bestScore.toString());
        this.bestVal.textContent = this.bestScore;
        if (this.homeBestVal) this.homeBestVal.textContent = this.bestScore;
      }

      this.scoreVal.textContent = this.score;
      this.streakVal.textContent = `${this.streak}`;
      if (this.streak >= 2) this.streakCard.classList.add('active-streak');
      if (this.difficultyVal) this.difficultyVal.textContent = `D${this.physics.difficulty}`;

      // Audio
      if (isBullseye) {
        soundManager.playBullseye();
      } else {
        soundManager.playSuccess(this.streak);
      }
      if (this.streak >= 3) soundManager.playCrowdCheer(Math.min(this.streak, 5));
      soundManager.vibrateStreak(this.streak);

      // Visuals
      this.renderer.triggerLandingParticles(bottlePos.x, bottlePos.y, true, this.streak);

      const title = isBullseye ? '🎯 BULLSEYE!' : (this.streak >= 3 ? '🔥 ON FIRE!' : '✅ PERFECT LANDING!');
      const sub = `+${points} PTS • STREAK x${this.streak}${result.difficulty > 0 ? ` • D${result.difficulty}` : ''}`;
      this.showToast(title, sub, false);

      // Achievements
      const newAch = this.achievements.updateStats({
        totalLandings: this._totalLandings,
        totalBullseyes: this._totalBullseyes,
        maxStreak: this._maxStreak,
        sessionScore: this.score,
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
      this.renderer.triggerScreenShake(10);
      this.renderer.triggerLandingParticles(bottlePos.x, bottlePos.y, false, 0);

      this.showToast('❌ MISSED', 'Keep trying!', true);
      setTimeout(() => this.resetBottle(), 1200);
    }
  }

  _triggerGameOver() {
    this.gameActive = false;
    clearInterval(this._timerInterval);
    soundManager.stopBgMusic();

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
      this.gameoverModeVal.textContent = this.gameMode === GameMode.TIMED ? '⚡ TIMED BLITZ' : '❤️ CLASSIC LIVES';
    }
    this.gameoverScreen.classList.remove('hidden');
  }

  resetBottle() {
    this.physics.spawnBottle();
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
      const isUnlocked = this.bestScore >= s.unlockScore;
      const isActive = this.skinSystem.currentSkinId === s.id;
      return `
        <button class="skin-card ${isActive ? 'active' : ''} ${!isUnlocked ? 'locked' : ''}"
                data-skin="${s.id}" ${!isUnlocked ? 'disabled' : ''}>
          <span class="skin-icon">${s.icon}</span>
          <span class="skin-name">${s.name}</span>
          <span class="skin-desc">${isUnlocked ? (isActive ? '✓ Active' : 'Tap to use') : s.desc}</span>
        </button>
      `;
    }).join('');

    grid.addEventListener('click', (e) => {
      const btn = e.target.closest('.skin-card:not([disabled])');
      if (!btn) return;
      soundManager.playClick();
      this.skinSystem.select(btn.dataset.skin);
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

// Register Service Worker for PWA offline caching
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

window.addEventListener('DOMContentLoaded', () => {
  new BottleFlipGame();
});

