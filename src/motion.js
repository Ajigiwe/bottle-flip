// Motion Controller: DeviceMotionEvent Accelerometer Sensing & Touch/Mouse Swipe Fallback

export class MotionController {
  constructor(physicsWorld, soundManager, onThrowTriggered) {
    this.physics = physicsWorld;
    this.sound = soundManager;
    this.onThrowTriggered = onThrowTriggered;

    this.isSensorEnabled = false;
    this.hasSensorPermission = false;

    // Gravity vector isolation for high-pass filtering
    this.gravityVector = { x: 0, y: 0, z: 0 };

    // Sensitivity level 1 to 10 (Default 5)
    this.sensitivityLevel = parseInt(localStorage.getItem('bottle_flip_sensitivity') || '5', 10);
    this.updateSensitivityParameters();

    this.lastFlickTime = 0;

    // Touch / Pointer drag state
    this.isDragging = false;
    this.dragStart = { x: 0, y: 0, time: 0 };
    this.dragCurrent = { x: 0, y: 0 };
    this.dragVelocityHistory = [];

    this.setupTouchListeners();
    this.autoInitSensorOnTouch();
  }

  autoInitSensorOnTouch() {
    const handler = () => {
      this.enableSensor();
      window.removeEventListener('touchstart', handler);
      window.removeEventListener('click', handler);
    };
    window.addEventListener('touchstart', handler, { once: true });
    window.addEventListener('click', handler, { once: true });
  }

  setSensitivityLevel(level) {
    this.sensitivityLevel = Math.max(1, Math.min(10, parseInt(level, 10)));
    localStorage.setItem('bottle_flip_sensitivity', this.sensitivityLevel.toString());
    this.updateSensitivityParameters();
  }

  updateSensitivityParameters() {
    // Level 1 = Low sensitivity (flickThreshold = 26.0 m/s^2)
    // Level 10 = High sensitivity (flickThreshold = 14.0 m/s^2)
    // Standard Level 5 = 20.0 m/s^2 (requires intentional flick)
    const norm = (this.sensitivityLevel - 1) / 9; // 0.0 to 1.0
    this.flickThreshold = 26.0 - norm * 12.0;

    // Swipe velocity multiplier scale
    this.swipeScaleVx = 0.30 + norm * 0.25;
    this.swipeScaleVy = 0.50 + norm * 0.30;
    this.minSwipeDist = 40 - norm * 18;
  }

  async requestPermission() {
    if (
      typeof DeviceMotionEvent !== 'undefined' &&
      typeof DeviceMotionEvent.requestPermission === 'function'
    ) {
      try {
        const response = await DeviceMotionEvent.requestPermission();
        if (response === 'granted') {
          this.hasSensorPermission = true;
          this.enableSensor();
          return true;
        }
      } catch (e) {
        console.warn('Sensor permission error:', e);
      }
      return false;
    } else if (typeof DeviceMotionEvent !== 'undefined') {
      this.hasSensorPermission = true;
      this.enableSensor();
      return true;
    }
    return false;
  }

  enableSensor() {
    if (this.isSensorEnabled) return;
    this.isSensorEnabled = true;

    window.addEventListener('devicemotion', this.handleDeviceMotion.bind(this), true);
  }

  disableSensor() {
    this.isSensorEnabled = false;
    window.removeEventListener('devicemotion', this.handleDeviceMotion.bind(this), true);
  }

  handleDeviceMotion(event) {
    if (this.physics.state !== 'READY') return;

    let ax = 0, ay = 0, az = 0;

    if (event.acceleration && event.acceleration.x !== null) {
      // Pure user acceleration excluding Earth gravity
      ax = event.acceleration.x || 0;
      ay = event.acceleration.y || 0;
      az = event.acceleration.z || 0;
    } else if (event.accelerationIncludingGravity) {
      // High-pass filter to isolate user flick force from constant 9.81m/s^2 gravity
      const rawX = event.accelerationIncludingGravity.x || 0;
      const rawY = event.accelerationIncludingGravity.y || 0;
      const rawZ = event.accelerationIncludingGravity.z || 0;

      const alpha = 0.82;
      this.gravityVector.x = alpha * this.gravityVector.x + (1 - alpha) * rawX;
      this.gravityVector.y = alpha * this.gravityVector.y + (1 - alpha) * rawY;
      this.gravityVector.z = alpha * this.gravityVector.z + (1 - alpha) * rawZ;

      ax = rawX - this.gravityVector.x;
      ay = rawY - this.gravityVector.y;
      az = rawZ - this.gravityVector.z;
    } else {
      return;
    }

    const flickMagnitude = Math.sqrt(ax * ax + ay * ay + az * az);
    const now = Date.now();

    // Requires intentional firm flick above threshold (prevents slight shake auto-flips)
    if (flickMagnitude > this.flickThreshold && now - this.lastFlickTime > 1400) {
      this.lastFlickTime = now;

      const norm = (this.sensitivityLevel - 1) / 9;
      const power = Math.min(22, flickMagnitude * (0.6 + norm * 0.3));
      
      const upwardVel = -Math.max(13, power * 0.85);
      const rightVel = Math.min(10, Math.max(-10, ax * 0.7 + 5));

      const flipSpin = -Math.min(0.24, 0.11 + Math.abs(upwardVel) * 0.007);

      this.sound.playWhoosh(power / 18);
      this.physics.throwBottle(rightVel, upwardVel, flipSpin);

      if (this.onThrowTriggered) {
        this.onThrowTriggered('SENSOR_FLICK');
      }
    }
  }

  setupTouchListeners() {
    const canvas = document.getElementById('game-canvas');
    if (!canvas) return;

    canvas.addEventListener('pointerdown', this.handlePointerDown.bind(this));
    canvas.addEventListener('pointermove', this.handlePointerMove.bind(this));
    canvas.addEventListener('pointerup', this.handlePointerUp.bind(this));
    canvas.addEventListener('pointercancel', this.handlePointerUp.bind(this));
  }

  handlePointerDown(e) {
    if (this.physics.state !== 'READY') return;

    const rect = e.target.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    this.isDragging = true;
    this.physics.state = 'AIMING';
    this.dragStart = { x, y, time: Date.now() };
    this.dragCurrent = { x, y };
    this.dragVelocityHistory = [];
  }

  handlePointerMove(e) {
    if (!this.isDragging || this.physics.state !== 'AIMING') return;

    const rect = e.target.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const now = Date.now();
    const dt = now - (this.dragCurrent.time || now);
    if (dt > 0) {
      const vx = (x - this.dragCurrent.x) / dt;
      const vy = (y - this.dragCurrent.y) / dt;
      this.dragVelocityHistory.push({ vx, vy, time: now });
      if (this.dragVelocityHistory.length > 5) {
        this.dragVelocityHistory.shift();
      }
    }

    this.dragCurrent = { x, y, time: now };
  }

  handlePointerUp(e) {
    if (!this.isDragging) return;
    this.isDragging = false;

    if (this.physics.state !== 'AIMING') return;

    const dx = this.dragCurrent.x - this.dragStart.x;
    const dy = this.dragCurrent.y - this.dragStart.y;
    const dt = Math.max(1, Date.now() - this.dragStart.time);

    if (dy < -this.minSwipeDist && dt < 800) {
      let avgVx = (dx / dt) * 14;
      let avgVy = (dy / dt) * 14;

      const throwVx = Math.min(16, Math.max(-6, avgVx * this.swipeScaleVx + 4.5));
      const throwVy = Math.max(-23, Math.min(-11, avgVy * this.swipeScaleVy));

      const throwSpeed = Math.abs(throwVy);
      const angularSpin = -(0.10 + throwSpeed * 0.0055);

      this.sound.playWhoosh(throwSpeed / 20);
      this.physics.throwBottle(throwVx, throwVy, angularSpin);

      if (this.onThrowTriggered) {
        this.onThrowTriggered('TOUCH_SWIPE');
      }
    } else {
      this.physics.state = 'READY';
    }
  }

  getAimTrajectory() {
    if (!this.isDragging || this.physics.state !== 'AIMING') return null;

    const dx = this.dragCurrent.x - this.dragStart.x;
    const dy = this.dragCurrent.y - this.dragStart.y;
    const dt = Math.max(1, Date.now() - this.dragStart.time);

    if (dy >= -15) return null;

    let avgVx = (dx / dt) * 14;
    let avgVy = (dy / dt) * 14;

    const vx = Math.min(16, Math.max(-6, avgVx * this.swipeScaleVx + 4.5));
    const vy = Math.max(-23, Math.min(-11, avgVy * this.swipeScaleVy));

    return { vx, vy, startX: this.dragStart.x, startY: this.dragStart.y };
  }
}
