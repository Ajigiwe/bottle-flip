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
    this.ground = null;

    this.bottleWidth = 34;
    this.bottleHeight = 112;

    this.uprightTolerance = 0.32; // ~18.3 degrees in radians for realistic landing tolerance
    this.settleTimer = 0;
    this.flightTime = 0;

    this.targetOffsetX = 0;

    this.onLandingCallback = null;
    this.onCollisionCallback = null;

    this.initWorld();
    this.setupCollisionEvents();
  }

  initWorld() {
    World.clear(this.engine.world, false);

    // Ground Plane
    const groundHeight = 60;
    this.ground = Bodies.rectangle(
      this.width / 2,
      this.height - groundHeight / 2,
      this.width * 2,
      groundHeight,
      {
        isStatic: true,
        friction: 0.95,
        restitution: 0.2,
        label: 'ground'
      }
    );

    // Single Main Table
    this.createSingleTable();

    // Bottle Body
    this.spawnBottle();

    const worldBodies = [this.ground, this.table];
    if (this.leftBumper) worldBodies.push(this.leftBumper);
    if (this.rightBumper) worldBodies.push(this.rightBumper);

    World.add(this.engine.world, worldBodies);
  }

  createSingleTable() {
    const platformHeight = 20;
    const tableWidth = Math.min(780, Math.max(320, this.width * 0.92));

    const tableX = this.width / 2;
    const tableY = this.height - 200;

    if (this.table) World.remove(this.engine.world, this.table);
    this.table = Bodies.rectangle(tableX, tableY, tableWidth, platformHeight, {
      isStatic: true,
      friction: 0.95,
      restitution: 0.15,
      label: 'table'
    });
    this.table.customData = { width: tableWidth, height: platformHeight };

    // Edge bumpers
    const bumperW = 8;
    const bumperH = 30;
    this.leftBumper = Bodies.rectangle(
      tableX - tableWidth / 2 - bumperW / 2 + 2,
      tableY - bumperH / 2 + platformHeight / 2,
      bumperW,
      bumperH,
      { isStatic: true, restitution: 0.3, friction: 0.2, label: 'bumper' }
    );

    this.rightBumper = Bodies.rectangle(
      tableX + tableWidth / 2 + bumperW / 2 - 2,
      tableY - bumperH / 2 + platformHeight / 2,
      bumperW,
      bumperH,
      { isStatic: true, restitution: 0.3, friction: 0.2, label: 'bumper' }
    );

    this.targetOffsetX = tableWidth * 0.25;
  }

  spawnBottle() {
    if (this.bottle) {
      World.remove(this.engine.world, this.bottle);
    }

    const tablePos = this.table.position;
    const tableWidth = this.table.customData.width;
    const platformHeight = this.table.customData.height;

    // Start bottle on left side of table
    const bottleX = tablePos.x - tableWidth * 0.35;
    const bottleY = tablePos.y - platformHeight / 2 - this.bottleHeight / 2;

    this.bottle = Bodies.rectangle(bottleX, bottleY, this.bottleWidth, this.bottleHeight, {
      chamfer: { radius: [4, 4, 10, 10] },
      friction: 0.92,
      frictionAir: 0.0018, // Low air friction for smooth realistic rotational momentum
      restitution: 0.22,
      density: 0.0022,
      label: 'bottle'
    });

    // Realistic rotational inertia
    Body.setInertia(this.bottle, 3400);

    this.updateCenterOfMass();

    // Calculate maximum bottom Y across ALL vertices and position flush on table
    const tableTopY = tablePos.y - platformHeight / 2;
    let bottleBottomY = -Infinity;
    for (let i = 0; i < this.bottle.vertices.length; i++) {
      if (this.bottle.vertices[i].y > bottleBottomY) {
        bottleBottomY = this.bottle.vertices[i].y;
      }
    }

    const deltaY = tableTopY - bottleBottomY;
    Body.setPosition(this.bottle, {
      x: this.bottle.position.x,
      y: this.bottle.position.y + deltaY
    });

    World.add(this.engine.world, this.bottle);
    this.state = 'READY';
    this.flightTime = 0;
    this.settleTimer = 0;
  }

  updateCenterOfMass() {
    if (!this.bottle) return;
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
      const pairs = event.pairs;
      for (let i = 0; i < pairs.length; i++) {
        const { bodyA, bodyB } = pairs[i];
        if (bodyA === this.bottle || bodyB === this.bottle) {
          const other = bodyA === this.bottle ? bodyB : bodyA;
          const speed = Vector.magnitude(this.bottle.velocity);
          if (this.onCollisionCallback) {
            this.onCollisionCallback(other, speed);
          }
        }
      }
    });
  }

  update(deltaTime = 1000 / 60) {
    Engine.update(this.engine, deltaTime);

    if (this.state === 'FLIGHT' || this.state === 'SETTLING') {
      this.flightTime += deltaTime;

      const linearSpeed = Vector.magnitude(this.bottle.velocity);
      const angularSpeed = Math.abs(this.bottle.angularVelocity);

      if (linearSpeed < 0.35 && angularSpeed < 0.06 && this.flightTime > 300) {
        this.settleTimer += deltaTime;

        if (this.settleTimer > 350) {
          this.evaluateLanding();
        }
      } else {
        this.settleTimer = 0;
        if (linearSpeed > 0.6) {
          this.state = 'FLIGHT';
        } else {
          this.state = 'SETTLING';
        }
      }

      if (
        this.bottle.position.y > this.height + 200 ||
        this.bottle.position.x < -100 ||
        this.bottle.position.x > this.width + 100
      ) {
        this.state = 'FAILED';
        if (this.onLandingCallback) {
          this.onLandingCallback({
            isUpright: false,
            isTarget: false,
            reason: 'OUT_OF_BOUNDS'
          });
        }
      }
    }
  }

  evaluateLanding() {
    const angle = this.bottle.angle;
    const twoPi = Math.PI * 2;
    const normalizedAngle = ((angle % twoPi) + twoPi) % twoPi;

    const isUpright =
      normalizedAngle < this.uprightTolerance ||
      normalizedAngle > twoPi - this.uprightTolerance;

    const bottlePos = this.bottle.position;
    const tablePos = this.table.position;
    const tableWidth = this.table.customData?.width || 600;

    const isOnTable =
      isUpright &&
      Math.abs(bottlePos.x - tablePos.x) < tableWidth / 2 + 15 &&
      bottlePos.y < tablePos.y + 10;

    const targetX = tablePos.x + this.targetOffsetX;
    const isTargetHit = isOnTable && Math.abs(bottlePos.x - targetX) < 48;

    const isOnGround = isUpright && bottlePos.y >= this.height - 120;

    if (isUpright && (isOnTable || isOnGround)) {
      this.state = 'LANDED';
      if (this.onLandingCallback) {
        this.onLandingCallback({
          isUpright: true,
          isTable: isOnTable,
          isTarget: isTargetHit,
          isOnGround: isOnGround,
          accuracy: Math.abs(bottlePos.x - targetX)
        });
      }
    } else {
      this.state = 'FAILED';
      if (this.onLandingCallback) {
        this.onLandingCallback({
          isUpright: false,
          isTarget: false,
          reason: 'TUMBLED'
        });
      }
    }
  }

  resize(newWidth, newHeight) {
    this.width = newWidth;
    this.height = newHeight;
    this.initWorld();
  }

  repositionTargetSpot() {
    const tableWidth = this.table.customData?.width || 600;
    this.targetOffsetX = (Math.random() * 0.7 - 0.35) * (tableWidth * 0.7);
  }
}
