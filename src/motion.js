// Motion Controller: DeviceMotionEvent Accelerometer Sensing & Touch/Mouse Swipe Fallback

export class MotionController {
  constructor(physicsWorld, soundManager, onThrowTriggered) {
    this.physics = physicsWorld;
    this.sound = soundManager;
    this.onThrowTriggered = onThrowTriggered;

    this.isSensorEnabled = false;
    this.hasSensorPermission = false;

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
  }

  setSensitivityLevel(level) {
    this.sensitivityLevel = Math.max(1, Math.min(10, parseInt(level, 10)));
    localStorage.setItem('bottle_flip_sensitivity', this.sensitivityLevel.toString());
    this.updateSensitivityParameters();
  }

  updateSensitivityParameters() {
    // Level 1 = Firm/Low sensitivity (flickThreshold = 25.0)
    // Level 10 = High sensitivity (flickThreshold = 11.0)
    // Standard Level 5 = 18.0 m/s^2
    const norm = (this.sensitivityLevel - 1) / 9; // 0.0 to 1.0
    this.flickThreshold = 25.0 - norm * 14.0;

    // Swipe velocity multiplier scale (0.25 at L1 to 0.55 at L10)
    this.swipeScaleVx = 0.25 + norm * 0.25;
    this.swipeScaleVy = 0.40 + norm * 0.30;
    this.minSwipeDist = 45 - norm * 20; // 45px drag at L1, 25px at L10
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

    const accel = event.acceleration || event.accelerationIncludingGravity;
    if (!accel || accel.x === null) return;

    const x = accel.x || 0;
    const y = accel.y || 0;
    const z = accel.z || 0;

    const magnitude = Math.sqrt(x * x + y * y + z * z);
    const now = Date.now();

    if (magnitude > this.flickThreshold && now - this.lastFlickTime > 1200) {
      this.lastFlickTime = now;

      const norm = (this.sensitivityLevel - 1) / 9;
      const forwardForce = Math.min(26, magnitude * (0.6 + norm * 0.35));
      const upwardVel = -Math.max(12, forwardForce * 0.75);
      const rightVel = Math.min(10, Math.max(-10, x * (0.6 + norm * 0.4) + 4));
      const flipSpin = -Math.min(0.3, 0.08 + magnitude * 0.005);

      this.sound.playWhoosh(magnitude / 20);
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
      const throwVy = Math.max(-24, Math.min(-9, avgVy * this.swipeScaleVy));

      const throwSpeed = Math.hypot(throwVx, throwVy);
      const angularSpin = -(0.09 + throwSpeed * 0.005);

      this.sound.playWhoosh(throwSpeed / 22);
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
    const vy = Math.max(-24, Math.min(-9, avgVy * this.swipeScaleVy));

    return { vx, vy, startX: this.dragStart.x, startY: this.dragStart.y };
  }
}
