import Matter from 'matter-js';

const { Engine, World, Bodies, Body, Vector, Events } = Matter;

export class PhysicsWorld {
  constructor(canvasWidth, canvasHeight) {
    this.width = canvasWidth;
    this.height = canvasHeight;

    this.engine = Engine.create({
      gravity: { x: 0, y: 1.6, scale: 0.0012 }
    });

    this.liquidFill = 0.5; // 0.0 to 1.0
    this.state = 'READY'; // READY, AIMING, FLIGHT, SETTLING, LANDED, FAILED

    this.bottle = null;
    this.table = null;
    this.leftBumper = null;
    this.rightBumper = null;
    this.leftWall = null;
    this.rightWall = null;
    this.ground = null;

    this.bottleWidth = 46;
    this.bottleHeight = 100;

    this.uprightTolerance = 0.45; // ~25.8 degrees forgiving landing window
    this.settleTimer = 0;
    this.flightTime = 0;

    this.targetOffsetX = 0;
    this._targetDir = 1;       // moving target oscillation direction
    this._targetSpeed = 0;     // px per frame — increases with difficulty

    // Difficulty
    this.difficulty = 0;       // increments every 5 successful flips
    this.successCount = 0;
    this.windForce = 0;        // horizontal wind applied during flight

    this.onLandingCallback = null;
    this.onCollisionCallback = null;

    this.initWorld();
    this.setupCollisionEvents();
  }

  // ── World Setup ─────────────────────────────────────────────────────────

  initWorld() {
    World.clear(this.engine.world, false);

    const groundHeight = 60;
    this.ground = Bodies.rectangle(
      this.width / 2,
      this.height - groundHeight / 2,
      this.width * 2,
      groundHeight,
      { isStatic: true, friction: 0.95, restitution: 0.2, label: 'ground' }
    );

    // Side walls — enable wall bounces for trick shots
    const wallH = this.height * 2;
    this.leftWall = Bodies.rectangle(-25, this.height / 2, 50, wallH, {
      isStatic: true, restitution: 0.45, friction: 0.1, label: 'wall'
    });
    this.rightWall = Bodies.rectangle(this.width + 25, this.height / 2, 50, wallH, {
      isStatic: true, restitution: 0.45, friction: 0.1, label: 'wall'
    });

    this.createSingleTable();
    this.spawnBottle();

    World.add(this.engine.world, [
      this.ground,
      this.leftWall,
      this.rightWall,
      this.table,
      ...(this.leftBumper ? [this.leftBumper] : []),
      ...(this.rightBumper ? [this.rightBumper] : []),
    ]);
  }

  createSingleTable() {
    const platformHeight = 20;
    // Table width shrinks slightly with difficulty (max 20% narrower)
    const shrinkFactor = Math.max(0.78, 1 - this.difficulty * 0.044);
    const tableWidth = Math.min(780, Math.max(260, this.width * 0.92 * shrinkFactor));

    const tableX = this.width / 2;
    const tableY = this.height - 200;

    if (this.table) World.remove(this.engine.world, this.table);
    this.table = Bodies.rectangle(tableX, tableY, tableWidth, platformHeight, {
      isStatic: true, friction: 0.95, restitution: 0.15, label: 'table'
    });
    this.table.customData = { width: tableWidth, height: platformHeight };

    const bumperW = 8;
    const bumperH = 30;
    if (this.leftBumper) World.remove(this.engine.world, this.leftBumper);
    if (this.rightBumper) World.remove(this.engine.world, this.rightBumper);

    this.leftBumper = Bodies.rectangle(
      tableX - tableWidth / 2 - bumperW / 2 + 2,
      tableY - bumperH / 2 + platformHeight / 2,
      bumperW, bumperH,
      { isStatic: true, restitution: 0.3, friction: 0.2, label: 'bumper' }
    );
    this.rightBumper = Bodies.rectangle(
      tableX + tableWidth / 2 + bumperW / 2 - 2,
      tableY - bumperH / 2 + platformHeight / 2,
      bumperW, bumperH,
      { isStatic: true, restitution: 0.3, friction: 0.2, label: 'bumper' }
    );

    this.targetOffsetX = tableWidth * 0.25;
    // Moving target speed scales with difficulty
    this._targetSpeed = this.difficulty * 0.55;
  }

  spawnBottle() {
    if (this.bottle) World.remove(this.engine.world, this.bottle);

    const tablePos = this.table.position;
    const tableWidth = this.table.customData.width;
    const platformHeight = this.table.customData.height;

    const bottleX = tablePos.x - tableWidth * 0.35;
    const bottleY = tablePos.y - platformHeight / 2 - this.bottleHeight / 2;

    // Water level (0.0 to 1.0) directly affects bottle physics:
    // 0% (Empty): Light density (0.0011), higher bounce (0.16), lower inertia (2800)
    // 50% (Standard): Medium density (0.0025), medium bounce (0.08), medium inertia (4500)
    // 100% (Full): Heavy density (0.0042), low bounce (0.03), heavy inertia (6200)
    const baseDensity = 0.0011 + this.liquidFill * 0.0031;
    const restitution = Math.max(0.03, 0.16 - this.liquidFill * 0.13);

    this.bottle = Bodies.rectangle(bottleX, bottleY, this.bottleWidth, this.bottleHeight, {
      chamfer: { radius: [2, 2, 2, 2] }, // Equal 2px squarer chamfer for both cap and base stability
      friction: 0.95,
      frictionAir: 0.0014,
      restitution,
      density: baseDensity,
      label: 'bottle'
    });

    const baseInertia = 2800 + this.liquidFill * 3400;
    Body.setInertia(this.bottle, baseInertia);
    this.updateCenterOfMass();

    const tableTopY = tablePos.y - platformHeight / 2;
    let bottleBottomY = -Infinity;
    for (const v of this.bottle.vertices) {
      if (v.y > bottleBottomY) bottleBottomY = v.y;
    }
    Body.setPosition(this.bottle, {
      x: this.bottle.position.x,
      y: this.bottle.position.y + (tableTopY - bottleBottomY)
    });

    // Keep bottle perfectly still on the table until the player throws it.
    Body.setStatic(this.bottle, true);

    World.add(this.engine.world, this.bottle);
    this.state = 'READY';
    this.flightTime = 0;
    this.settleTimer = 0;
  }

  // ── Physics Helpers ──────────────────────────────────────────────────────

  updateCenterOfMass() {
    if (!this.bottle) return;
    // Water fill shifts center of mass towards the bottom
    const shiftY = (this.liquidFill - 0.5) * (this.bottleHeight * 0.35);
    Body.setCentre(this.bottle, { x: 0, y: shiftY }, true);
  }

  setLiquidFill(fillRatio) {
    this.liquidFill = fillRatio;
    this.spawnBottle();
  }

  throwBottle(velocityX, velocityY, angularVelocity) {
    if (this.state !== 'READY' && this.state !== 'AIMING') return;
    Body.setStatic(this.bottle, false);
    Body.setVelocity(this.bottle, { x: velocityX, y: velocityY });
    Body.setAngularVelocity(this.bottle, angularVelocity);
    this.state = 'FLIGHT';
    this.flightTime = 0;
    this.settleTimer = 0;
  }

  setupCollisionEvents() {
    Events.on(this.engine, 'collisionStart', (event) => {
      for (const pair of event.pairs) {
        const { bodyA, bodyB } = pair;
        if (bodyA === this.bottle || bodyB === this.bottle) {
          const other = bodyA === this.bottle ? bodyB : bodyA;
          const speed = Vector.magnitude(this.bottle.velocity);
          if (this.onCollisionCallback) this.onCollisionCallback(other, speed);

          // Instant loss if bottle hits table or ground flat on its side
          if ((this.state === 'FLIGHT' || this.state === 'SETTLING') && (other === this.table || other === this.ground)) {
            if (!this.isCurrentlyUpright()) {
              this.state = 'FAILED';
              if (this.onLandingCallback) {
                this.onLandingCallback({ isUpright: false, isTarget: false, reason: 'SIDE_LANDING' });
              }
            }
          }
        }
      }
    });
  }

  isCurrentlyUpright() {
    if (!this.bottle) return false;
    const angle = this.bottle.angle;
    const twoPi = Math.PI * 2;
    const norm = ((angle % twoPi) + twoPi) % twoPi;
    const isUprightBase = norm < this.uprightTolerance || norm > twoPi - this.uprightTolerance;
    const isHeadstand = Math.abs(norm - Math.PI) < this.uprightTolerance;
    return isUprightBase || isHeadstand;
  }

  // ── Per-Frame Update ──────────────────────────────────────────────────────

  update(deltaTime = 1000 / 60) {
    // Apply wind during flight
    if ((this.state === 'FLIGHT' || this.state === 'SETTLING') && this.windForce !== 0 && this.bottle) {
      Body.applyForce(this.bottle, this.bottle.position, {
        x: this.windForce * this.bottle.mass * 0.001,
        y: 0
      });
    }

    Engine.update(this.engine, deltaTime);

    // Animate moving target when idle
    if (this.state === 'READY' && this._targetSpeed > 0) {
      const tableWidth = this.table.customData?.width || 600;
      const limit = tableWidth * 0.38;
      this.targetOffsetX += this._targetDir * this._targetSpeed;
      if (this.targetOffsetX > limit || this.targetOffsetX < -limit) {
        this._targetDir *= -1;
      }
    }

    if (this.state === 'FLIGHT' || this.state === 'SETTLING') {
      this.flightTime += deltaTime;

      const linearSpeed = Vector.magnitude(this.bottle.velocity);
      const angularSpeed = Math.abs(this.bottle.angularVelocity);
      const upright = this.isCurrentlyUpright();

      // DAMP ROTATIONAL ROCKING ON TOUCHDOWN:
      if (upright && this.bottle && this.bottle.position.y > this.table.position.y - 120) {
        Body.setAngularVelocity(this.bottle, this.bottle.angularVelocity * 0.65);
      }

      // Fast landing lock: if upright/headstand, register landing in ~80ms before it can tip
      const maxLinear = upright ? 1.6 : 0.35;
      const maxAngular = upright ? 0.30 : 0.06;
      const requiredSettleTime = upright ? 80 : 260;

      if (linearSpeed < maxLinear && angularSpeed < maxAngular && this.flightTime > 180) {
        this.settleTimer += deltaTime;
        if (this.settleTimer > requiredSettleTime) this.evaluateLanding();
      } else {
        this.settleTimer = 0;
        this.state = linearSpeed > 0.6 ? 'FLIGHT' : 'SETTLING';
      }

      // Self-righting pendulum assist for BOTH upright (0/2pi) and headstand (pi)
      if (this.state === 'SETTLING' && this.bottle) {
        const rawAngle = this.bottle.angle;
        const twoPi = Math.PI * 2;
        const normAngle = ((rawAngle % twoPi) + twoPi) % twoPi;
        const baseTilt = normAngle > Math.PI ? normAngle - twoPi : normAngle;
        const capTilt = normAngle - Math.PI;

        if (Math.abs(baseTilt) < 0.55) {
          Body.setAngularVelocity(this.bottle, this.bottle.angularVelocity * 0.80 - baseTilt * 0.035);
        } else if (Math.abs(capTilt) < 0.55) {
          Body.setAngularVelocity(this.bottle, this.bottle.angularVelocity * 0.80 - capTilt * 0.035);
        }
      }

      // Out-of-bounds check (walls now exist but top/bottom still relevant)
      if (this.bottle.position.y > this.height + 200) {
        this.state = 'FAILED';
        if (this.onLandingCallback) {
          this.onLandingCallback({ isUpright: false, isTarget: false, reason: 'OUT_OF_BOUNDS' });
        }
      }
    }
  }

  // ── Landing Evaluation ───────────────────────────────────────────────────

  evaluateLanding() {
    const angle = this.bottle.angle;
    const twoPi = Math.PI * 2;
    const normalizedAngle = ((angle % twoPi) + twoPi) % twoPi;

    const isUprightBase =
      normalizedAngle < this.uprightTolerance ||
      normalizedAngle > twoPi - this.uprightTolerance;

    const isHeadstand = Math.abs(normalizedAngle - Math.PI) < this.uprightTolerance;
    const isUpright = isUprightBase || isHeadstand;

    const bottlePos = this.bottle.position;
    const tablePos = this.table.position;
    const tableWidth = this.table.customData?.width || 600;
    const platformHeight = this.table.customData?.height || 20;
    const tableTopY = tablePos.y - platformHeight / 2;

    // Strict Table Surface Bounds:
    // 1. Must be horizontally INSIDE table edges (not stuck to or leaning on side walls/bumpers!)
    const isHorizontallyOnTable = Math.abs(bottlePos.x - tablePos.x) <= (tableWidth / 2 - 8);

    // 2. Must be resting ON TOP of the table surface
    const isVerticallyOnTable = bottlePos.y < tableTopY + 10 && bottlePos.y > tableTopY - this.bottleHeight - 15;

    const isOnTable = isUpright && isHorizontallyOnTable && isVerticallyOnTable;

    const targetX = tablePos.x + this.targetOffsetX;
    const isTargetHit = isOnTable && Math.abs(bottlePos.x - targetX) < 48;

    if (isOnTable) {
      this.state = 'LANDED';
      
      // Freeze bottle in position so it never wobbles or falls after landing
      Body.setStatic(this.bottle, true);
      Body.setVelocity(this.bottle, { x: 0, y: 0 });
      Body.setAngularVelocity(this.bottle, 0);

      // Update difficulty every 5 successes
      this.successCount++;
      if (this.successCount % 5 === 0) {
        this.difficulty = Math.min(5, this.difficulty + 1);
        // Gradually increase wind
        this.windForce = (Math.random() > 0.5 ? 1 : -1) * this.difficulty * 0.8;
        // Rebuild table with narrowed width + faster target
        World.remove(this.engine.world, this.table);
        if (this.leftBumper) World.remove(this.engine.world, this.leftBumper);
        if (this.rightBumper) World.remove(this.engine.world, this.rightBumper);
        this.createSingleTable();
        World.add(this.engine.world, [
          this.table,
          ...(this.leftBumper ? [this.leftBumper] : []),
          ...(this.rightBumper ? [this.rightBumper] : []),
        ]);
      }

      if (this.onLandingCallback) {
        this.onLandingCallback({
          isUpright: true,
          isHeadstand,
          isTable: isOnTable,
          isTarget: isTargetHit,
          isOnGround,
          accuracy: Math.abs(bottlePos.x - targetX),
          difficulty: this.difficulty,
        });
      }
    } else {
      this.state = 'FAILED';
      if (this.onLandingCallback) {
        this.onLandingCallback({ isUpright: false, isTarget: false, reason: 'TUMBLED' });
      }
    }
  }

  // ── Resize & Utilities ───────────────────────────────────────────────────

  resize(newWidth, newHeight) {
    this.width = newWidth;
    this.height = newHeight;
    this.initWorld();
  }

  repositionTargetSpot() {
    const tableWidth = this.table.customData?.width || 600;
    this.targetOffsetX = (Math.random() * 0.7 - 0.35) * (tableWidth * 0.7);
  }

  resetDifficulty() {
    this.difficulty = 0;
    this.successCount = 0;
    this.windForce = 0;
    this._targetSpeed = 0;
  }
}
