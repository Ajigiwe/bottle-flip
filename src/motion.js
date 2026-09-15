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

    // Power percentage exposed to renderer (null when not aiming)
    this._powerPercent = null;

    // Store bound handler so disableSensor can correctly remove the same ref
    this._motionHandler = this.handleDeviceMotion.bind(this);

    this.setupTouchListeners();
    this.autoInitSensorOnTouch();
  }

  requiresPermissionPrompt() {
    return (
      typeof DeviceMotionEvent !== 'undefined' &&
      typeof DeviceMotionEvent.requestPermission === 'function' &&
      !this.hasSensorPermission
    );
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
    const norm = (this.sensitivityLevel - 1) / 9; // 0.0 → 1.0
    // Lowered threshold range (14.0 down to 6.0 m/s²) so phone flicks register naturally
    this.flickThreshold = 14.0 - norm * 8.0;
    this.swipeScaleVx = 0.30 + norm * 0.25;
    this.swipeScaleVy = 0.50 + norm * 0.30;
    this.minSwipeDist = 40 - norm * 18;
    this._maxThrowVy = 23;
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
    window.addEventListener('devicemotion', this._motionHandler, true);
  }

  disableSensor() {
    this.isSensorEnabled = false;
    window.removeEventListener('devicemotion', this._motionHandler, true);
  }

  handleDeviceMotion(event) {
    if (this.physics.state !== 'READY') return;

    let ax = 0, ay = 0, az = 0;
    const acc = event.acceleration;
    const accGravity = event.accelerationIncludingGravity;

    // Check if hardware linear acceleration is non-zero
    if (acc && acc.x !== null && acc.x !== undefined && (acc.x !== 0 || acc.y !== 0 || acc.z !== 0)) {
      ax = acc.x;
      ay = acc.y;
      az = acc.z;
    } else if (accGravity && accGravity.x !== null && accGravity.x !== undefined) {
      const rawX = accGravity.x || 0;
      const rawY = accGravity.y || 0;
      const rawZ = accGravity.z || 0;

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

    if (flickMagnitude > this.flickThreshold && now - this.lastFlickTime > 900) {
      this.lastFlickTime = now;

      const norm = (this.sensitivityLevel - 1) / 9;
      const power = Math.min(22, flickMagnitude * (0.8 + norm * 0.4));
      const upwardVel = -Math.max(13, power * 0.85);
      const rightVel = Math.min(10, Math.max(-10, ax * 0.8)); // Directionally clean throw
      const flipSpin = -Math.min(0.24, 0.11 + Math.abs(upwardVel) * 0.007);

      this.sound.playWhoosh(power / 18);
      this.physics.throwBottle(rightVel, upwardVel, flipSpin);
      if (this.onThrowTriggered) this.onThrowTriggered('SENSOR_FLICK');
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
    this.isDragging = true;
    this.physics.state = 'AIMING';
    this.dragStart = { x: e.clientX - rect.left, y: e.clientY - rect.top, time: Date.now() };
    this.dragCurrent = { ...this.dragStart };
    this.dragVelocityHistory = [];
    this._powerPercent = 0;
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
      if (this.dragVelocityHistory.length > 5) this.dragVelocityHistory.shift();
    }

    this.dragCurrent = { x, y, time: now };

    // Update live power%
    const dy = this.dragCurrent.y - this.dragStart.y;
    if (dy < 0) {
      const avgVy = (dy / Math.max(1, now - this.dragStart.time)) * 14;
      const throwVy = Math.max(-this._maxThrowVy, Math.min(-11, avgVy * this.swipeScaleVy));
      this._powerPercent = Math.min(1, Math.abs(throwVy) / this._maxThrowVy);
    } else {
      this._powerPercent = 0;
    }
  }

  handlePointerUp(e) {
    if (!this.isDragging) return;
    this.isDragging = false;
    this._powerPercent = null;

    if (this.physics.state !== 'AIMING') return;

    const dx = this.dragCurrent.x - this.dragStart.x;
    const dy = this.dragCurrent.y - this.dragStart.y;
    const dt = Math.max(1, Date.now() - this.dragStart.time);

    if (dy < -this.minSwipeDist && dt < 800) {
      const avgVx = (dx / dt) * 14;
      const avgVy = (dy / dt) * 14;
      const throwVx = Math.min(16, Math.max(-6, avgVx * this.swipeScaleVx + 4.5));
      const throwVy = Math.max(-this._maxThrowVy, Math.min(-11, avgVy * this.swipeScaleVy));
      const angularSpin = -(0.10 + Math.abs(throwVy) * 0.0055);

      this.sound.playWhoosh(Math.abs(throwVy) / 20);
      this.physics.throwBottle(throwVx, throwVy, angularSpin);
      if (this.onThrowTriggered) this.onThrowTriggered('TOUCH_SWIPE');
    } else {
      this.physics.state = 'READY';
    }
  }

  /** Returns current power as 0–1, or null when not aiming. Used by renderer. */
  getPowerPercent() {
    return this._powerPercent;
  }

  getAimTrajectory() {
    if (!this.isDragging || this.physics.state !== 'AIMING') return null;

    const dx = this.dragCurrent.x - this.dragStart.x;
    const dy = this.dragCurrent.y - this.dragStart.y;
    const dt = Math.max(1, Date.now() - this.dragStart.time);

    if (dy >= -15) return null;

    const avgVx = (dx / dt) * 14;
    const avgVy = (dy / dt) * 14;
    const vx = Math.min(16, Math.max(-6, avgVx * this.swipeScaleVx + 4.5));
    const vy = Math.max(-this._maxThrowVy, Math.min(-11, avgVy * this.swipeScaleVy));

    return { vx, vy, startX: this.dragStart.x, startY: this.dragStart.y };
  }
}
