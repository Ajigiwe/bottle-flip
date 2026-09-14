// Motion Controller: DeviceMotionEvent Accelerometer Sensing & Touch/Mouse Swipe Fallback

export class MotionController {
  constructor(physicsWorld, soundManager, onThrowTriggered) {
    this.physics = physicsWorld;
    this.sound = soundManager;
    this.onThrowTriggered = onThrowTriggered;

    this.isSensorEnabled = false;
    this.hasSensorPermission = false;

    // Previous accelerometer vector for delta-jerk calculations
    this.prevAccel = { x: 0, y: 0, z: 0 };

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
    // Auto-listen to devicemotion on any user touch/click
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
    // Level 1 = Low sensitivity (deltaThreshold = 18.0)
    // Level 10 = High sensitivity (deltaThreshold = 7.0)
    // Standard Level 5 = 11.5
    const norm = (this.sensitivityLevel - 1) / 9; // 0.0 to 1.0
    this.flickThreshold = 18.0 - norm * 11.0;

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

    // Support both acceleration and accelerationIncludingGravity across Android and iOS
    const accel = event.acceleration || event.accelerationIncludingGravity;
    if (!accel) return;

    const ax = accel.x || 0;
    const ay = accel.y || 0;
    const az = accel.z || 0;

    // Calculate delta acceleration (jerk / flick spike)
    const dax = ax - this.prevAccel.x;
    const day = ay - this.prevAccel.y;
    const daz = az - this.prevAccel.z;

    this.prevAccel = { x: ax, y: ay, z: az };

    const deltaMagnitude = Math.sqrt(dax * dax + day * day + daz * daz);
    const rawMagnitude = Math.sqrt(ax * ax + ay * ay + az * az);
    const totalIntensity = Math.max(deltaMagnitude, rawMagnitude * 0.6);

    const now = Date.now();

    // Trigger flick when delta acceleration magnitude crosses sensitivity threshold
    if (totalIntensity > this.flickThreshold && now - this.lastFlickTime > 1100) {
      this.lastFlickTime = now;

      // Realistic velocity & flip torque coupling
      const norm = (this.sensitivityLevel - 1) / 9;
      const power = Math.min(22, totalIntensity * (0.65 + norm * 0.3));
      
      const upwardVel = -Math.max(13, power * 0.85);
      const rightVel = Math.min(10, Math.max(-10, dax * 0.7 + 5));

      // Natural 360-degree flip angular velocity
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

      // Tune angular spin to complete a smooth, realistic 360 flip arc
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
