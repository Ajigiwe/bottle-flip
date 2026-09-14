// Motion Controller: DeviceMotionEvent Accelerometer Sensing & Touch/Mouse Swipe Fallback

export class MotionController {
  constructor(physicsWorld, soundManager, onThrowTriggered) {
    this.physics = physicsWorld;
    this.sound = soundManager;
    this.onThrowTriggered = onThrowTriggered;

    this.isSensorEnabled = false;
    this.hasSensorPermission = false;

    // Tuned lower sensitivity parameters for controlled, realistic flicking
    this.flickThreshold = 18.5; // Higher m/s^2 spike threshold (requires deliberate flick)
    this.lastFlickTime = 0;

    // Touch / Pointer drag state
    this.isDragging = false;
    this.dragStart = { x: 0, y: 0, time: 0 };
    this.dragCurrent = { x: 0, y: 0 };
    this.dragVelocityHistory = [];

    this.setupTouchListeners();
  }

  // Request motion permission for iOS 13+ inside a user tap gesture
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

    // Check for firm, deliberate flick acceleration spike
    if (magnitude > this.flickThreshold && now - this.lastFlickTime > 1200) {
      this.lastFlickTime = now;

      // Dampened force scaling for smooth, controlled throws
      const forwardForce = Math.min(22, magnitude * 0.7);
      const upwardVel = -Math.max(12, forwardForce * 0.75);
      const rightVel = Math.min(8, Math.max(-8, x * 0.8 + 4));
      const flipSpin = -Math.min(0.25, 0.08 + magnitude * 0.005);

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

    // Require deliberate upward swipe (> 35px drag distance)
    if (dy < -35 && dt < 800) {
      // Calculate smoothed & dampened throw velocities
      let avgVx = (dx / dt) * 14;
      let avgVy = (dy / dt) * 14;

      const throwVx = Math.min(14, Math.max(-6, avgVx * 0.35 + 4.5));
      const throwVy = Math.max(-20, Math.min(-9, avgVy * 0.52));

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

  // Get aiming trajectory vector for canvas renderer
  getAimTrajectory() {
    if (!this.isDragging || this.physics.state !== 'AIMING') return null;

    const dx = this.dragCurrent.x - this.dragStart.x;
    const dy = this.dragCurrent.y - this.dragStart.y;
    const dt = Math.max(1, Date.now() - this.dragStart.time);

    if (dy >= -15) return null;

    let avgVx = (dx / dt) * 14;
    let avgVy = (dy / dt) * 14;

    const vx = Math.min(14, Math.max(-6, avgVx * 0.35 + 4.5));
    const vy = Math.max(-20, Math.min(-9, avgVy * 0.52));

    return { vx, vy, startX: this.dragStart.x, startY: this.dragStart.y };
  }
}
