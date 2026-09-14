// Motion Controller: DeviceMotionEvent Accelerometer Sensing & Touch/Mouse Swipe Fallback

export class MotionController {
  constructor(physicsWorld, soundManager, onThrowTriggered) {
    this.physics = physicsWorld;
    this.sound = soundManager;
    this.onThrowTriggered = onThrowTriggered;

    this.isSensorEnabled = false;
    this.hasSensorPermission = false;

    // Flick sensitivity parameters
    this.flickThreshold = 14.0; // m/s^2 spike threshold
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
      // Non-iOS standard browsers (Android, Chrome mobile)
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

    // Check for rapid flick acceleration spike
    if (magnitude > this.flickThreshold && now - this.lastFlickTime > 1200) {
      this.lastFlickTime = now;

      // Translate acceleration magnitude & directional vectors into throw forces
      // Forward flick (negative Y on phone screen or positive Z) translates to upward launch
      const forwardForce = Math.min(28, magnitude * 0.95);
      const upwardVel = -Math.max(14, forwardForce * 0.9);
      const rightVel = Math.min(12, Math.max(-12, x * 1.2 + 6)); // Default rightward throw trajectory
      const flipSpin = -Math.min(0.35, 0.12 + magnitude * 0.008); // Flip torque

      this.sound.playWhoosh(magnitude / 15);
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

    // Only initiate drag if pointer starts near bottle or in canvas
    const bottlePos = this.physics.bottle.position;
    const dist = Math.hypot(x - bottlePos.x, y - bottlePos.y);

    if (dist < 180 || true) { // Allow dragging anywhere on screen for easy swipe
      this.isDragging = true;
      this.physics.state = 'AIMING';
      this.dragStart = { x, y, time: Date.now() };
      this.dragCurrent = { x, y };
      this.dragVelocityHistory = [];
    }
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

    // Upward drag is negative dy
    if (dy < -25 && dt < 800) {
      // Calculate release velocity vector
      let avgVx = (dx / dt) * 16;
      let avgVy = (dy / dt) * 16;

      // Cap and scale throw velocities for realistic trajectory arc
      const throwVx = Math.min(18, Math.max(-8, avgVx * 0.45 + 5)); // Rightward boost toward target
      const throwVy = Math.max(-26, Math.min(-10, avgVy * 0.75));

      // Calculate spin torque proportional to throw speed
      const throwSpeed = Math.hypot(throwVx, throwVy);
      const angularSpin = -(0.14 + throwSpeed * 0.007);

      this.sound.playWhoosh(throwSpeed / 18);
      this.physics.throwBottle(throwVx, throwVy, angularSpin);

      if (this.onThrowTriggered) {
        this.onThrowTriggered('TOUCH_SWIPE');
      }
    } else {
      // Cancel aim
      this.physics.state = 'READY';
    }
  }

  // Get aiming trajectory vector for canvas renderer
  getAimTrajectory() {
    if (!this.isDragging || this.physics.state !== 'AIMING') return null;

    const dx = this.dragCurrent.x - this.dragStart.x;
    const dy = this.dragCurrent.y - this.dragStart.y;
    const dt = Math.max(1, Date.now() - this.dragStart.time);

    if (dy >= 0) return null; // Only show trajectory on upward pull

    let avgVx = (dx / dt) * 16;
    let avgVy = (dy / dt) * 16;

    const vx = Math.min(18, Math.max(-8, avgVx * 0.45 + 5));
    const vy = Math.max(-26, Math.min(-10, avgVy * 0.75));

    return { vx, vy, startX: this.dragStart.x, startY: this.dragStart.y };
  }
}
