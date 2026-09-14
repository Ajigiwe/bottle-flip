import './style.css';
import { PhysicsWorld } from './physics.js';
import { MotionController } from './motion.js';
import { GameRenderer } from './render.js';
import { soundManager } from './audio.js';

class BottleFlipGame {
  constructor() {
    this.canvas = document.getElementById('game-canvas');
    this.score = 0;
    this.streak = 0;
    this.bestScore = parseInt(localStorage.getItem('bottle_flip_best') || '0', 10);

    this.initUI();
    this.initGame();
  }

  initUI() {
    this.scoreVal = document.getElementById('score-val');
    this.streakVal = document.getElementById('streak-val');
    this.bestVal = document.getElementById('best-val');
    this.homeBestVal = document.getElementById('home-best-val');
    this.streakCard = document.getElementById('streak-card');

    this.bestVal.textContent = this.bestScore;
    if (this.homeBestVal) this.homeBestVal.textContent = this.bestScore;

    // Screens & Modals
    this.homeScreen = document.getElementById('home-screen');
    this.howModal = document.getElementById('how-modal');
    this.hintOverlay = document.getElementById('hint-overlay');
    this.sensorModal = document.getElementById('sensor-modal');
    this.resultToast = document.getElementById('result-toast');
    this.toastTitle = document.getElementById('toast-title');
    this.toastSub = document.getElementById('toast-sub');

    // Home Action Buttons
    this.startGameBtn = document.getElementById('start-game-btn');
    this.homeHowBtn = document.getElementById('home-how-btn');
    this.homeNavBtn = document.getElementById('home-nav-btn');
    this.howToPlayBtn = document.getElementById('how-to-play-btn');
    this.closeHowBtn = document.getElementById('close-how-btn');

    // Game Controls
    this.resetBtn = document.getElementById('reset-btn');
    this.audioToggleBtn = document.getElementById('audio-toggle-btn');
    this.audioSvgOn = document.getElementById('audio-svg-on');
    this.audioSvgOff = document.getElementById('audio-svg-off');

    this.grantSensorBtn = document.getElementById('grant-sensor-btn');
    this.skipSensorBtn = document.getElementById('skip-sensor-btn');
    this.fillSelector = document.getElementById('fill-selector');

    if (soundManager.isMuted) {
      this.audioSvgOn.classList.add('hidden');
      this.audioSvgOff.classList.remove('hidden');
    }

    // Home Screen Events
    this.startGameBtn.addEventListener('click', () => {
      soundManager.playClick();
      this.homeScreen.classList.add('hidden');
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

    // Game Control Events
    this.resetBtn.addEventListener('click', () => {
      soundManager.playClick();
      this.resetBottle();
    });

    this.audioToggleBtn.addEventListener('click', () => {
      const isMuted = soundManager.toggleMute();
      if (isMuted) {
        this.audioSvgOn.classList.add('hidden');
        this.audioSvgOff.classList.remove('hidden');
      } else {
        this.audioSvgOn.classList.remove('hidden');
        this.audioSvgOff.classList.add('hidden');
      }
    });

    this.grantSensorBtn.addEventListener('click', async () => {
      soundManager.playClick();
      const granted = await this.motionController.requestPermission();
      if (granted) {
        this.showToast('SENSOR ENABLED', 'Flick your phone to throw!');
      } else {
        this.showToast('SENSOR DENIED', 'Using Touch/Swipe Controls');
      }
      this.sensorModal.classList.add('hidden');
    });

    this.skipSensorBtn.addEventListener('click', () => {
      soundManager.playClick();
      this.sensorModal.classList.add('hidden');
    });

    this.fillSelector.addEventListener('click', (e) => {
      const btn = e.target.closest('.segment-btn');
      if (!btn) return;

      soundManager.playClick();
      document.querySelectorAll('.segment-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const fill = parseFloat(btn.dataset.fill);
      this.physics.setLiquidFill(fill);
      this.resetBottle();
    });
  }

  initGame() {
    this.physics = new PhysicsWorld(window.innerWidth, window.innerHeight);

    this.motionController = new MotionController(
      this.physics,
      soundManager,
      (type) => this.handleThrowTriggered(type)
    );

    this.renderer = new GameRenderer(this.canvas, this.physics, this.motionController);

    this.physics.onCollisionCallback = (otherBody, speed) => {
      if (speed > 1.2) {
        soundManager.playThud(speed, false);
      }
    };

    this.physics.onLandingCallback = (result) => this.handleLandingResult(result);

    this.lastTime = performance.now();
    requestAnimationFrame(this.gameLoop.bind(this));
  }

  handleThrowTriggered(type) {
    if (this.hintOverlay) {
      this.hintOverlay.classList.add('hidden');
    }
  }

  handleLandingResult(result) {
    const bottlePos = this.physics.bottle.position;

    if (result.isUpright && (result.isTable || result.isTarget || result.isOnGround)) {
      this.streak++;
      const points = (result.isTarget ? 150 : 50) * Math.min(this.streak, 5);
      this.score += points;

      if (this.score > this.bestScore) {
        this.bestScore = this.score;
        localStorage.setItem('bottle_flip_best', this.bestScore.toString());
        this.bestVal.textContent = this.bestScore;
        if (this.homeBestVal) this.homeBestVal.textContent = this.bestScore;
      }

      this.scoreVal.textContent = this.score;
      this.streakVal.textContent = `${this.streak}`;

      if (this.streak >= 2) {
        this.streakCard.classList.add('active-streak');
      }

      soundManager.playSuccess(this.streak);
      this.renderer.triggerLandingParticles(bottlePos.x, bottlePos.y, true, this.streak);

      const title = result.isTarget ? 'BULLSEYE LANDING!' : 'PERFECT LANDING!';
      const sub = `+${points} PTS • STREAK x${this.streak}`;
      this.showToast(title, sub, false);

      setTimeout(() => {
        this.physics.repositionTargetSpot();
        this.resetBottle();
      }, 1400);
    } else {
      this.streak = 0;
      this.streakVal.textContent = `0`;
      this.streakCard.classList.remove('active-streak');

      soundManager.playCrash(1.5);
      this.renderer.triggerLandingParticles(bottlePos.x, bottlePos.y, false, 0);

      this.showToast('FAILED FLIP', 'Bottle tumbled over', true);

      setTimeout(() => {
        this.resetBottle();
      }, 1500);
    }
  }

  resetBottle() {
    this.physics.spawnBottle();
  }

  showToast(title, subtitle, isFail = false) {
    this.toastTitle.textContent = title;
    this.toastSub.textContent = subtitle;

    if (isFail) {
      this.resultToast.classList.add('fail');
    } else {
      this.resultToast.classList.remove('fail');
    }

    this.resultToast.classList.remove('hidden');
    setTimeout(() => {
      this.resultToast.classList.add('hidden');
    }, 1200);
  }

  gameLoop(timestamp) {
    const dt = Math.min(50, timestamp - this.lastTime);
    this.lastTime = timestamp;

    this.physics.update(dt);
    this.renderer.render();

    requestAnimationFrame(this.gameLoop.bind(this));
  }
}

window.addEventListener('DOMContentLoaded', () => {
  new BottleFlipGame();
});
