import Matter from 'matter-js';

const { Engine, World, Bodies, Body, Vector, Events } = Matter;

/**
 * Realistic bottle-flip physics.
 *
 * Stability comes from the simulation itself, not post-hoc corrections:
 *  - The bottle is a tapered compound body (wide flat base, narrow neck+cap
 *    on top) like a real 500ml bottle, so the base gives an honest tip-over
 *    angle and the water fill genuinely moves the centre of mass.
 *  - No rotational damping, no self-righting assist, no fast landing lock.
 *    The bottle wobbles, tips and falls like the real thing.
 *  - Landing is evaluated only after the bottle has genuinely come to rest
 *    (low speed + low spin for a sustained window), then the pose is judged.
 *  - While aiming, a static sensor proxy stands in for display so the idle
 *    bottle can't drift; on throw the real dynamic bottle replaces it.
 */
export class PhysicsWorld {
  constructor(canvasWidth, canvasHeight) {
    this.width = canvasWidth;
    this.height = canvasHeight;

    // Slightly softer than true gravity reads better at this pixel scale;
    // scale tuned so a full flip arc takes ~0.8–1.0s like a real throw.
    // High solver iteration counts minimise penetration/jitter artefacts so
    // post-plant behaviour is dominated by clean physical tipping rather
    // than chaotic edge-bouncing (which would make outcomes non-reproducible).
    this.engine = Engine.create({
      gravity: { x: 0, y: 1.6, scale: 0.0012 },
      positionIterations: 10,
      velocityIterations: 8,
    });

    this.liquidFill = 0.5; // 0.0 to 1.0
    this.state = 'READY'; // READY, AIMING, FLIGHT, SETTLING, LANDED, FAILED

    this.bottle = null;      // dynamic tapered compound body; enters the world on throw
    this.table = null;
    this.leftBumper = null;
    this.rightBumper = null;
    this.leftWall = null;
    this.rightWall = null;
    this.ground = null;

    // Bottle silhouette (px), shared with the renderer so physics and art
    // stay aligned: base 50 wide, 100 tall ≈ a real 500ml bottle
    // (65mm diameter, 210mm tall ≈ 31% width ratio). The renderer derives
    // capW/neckW from these same w/h values — see drawCleanBottle().
    this.bottleWidth = 50;
    this.bottleHeight = 100;
    // Real 500ml PET bottle weights: empty ≈ 19–25g, full ≈ 520g (500ml
    // water ≈ 500g + bottle). bottleMassG reports the current fill's weight.
    this.bottleEmptyMassG = 22;   // grams
    this.bottleFullMassG = 522;   // grams
    this.bottleMassG = this.bottleEmptyMassG;
    this.capHeight = 12;
    this.neckWidth = 24;
    this.neckHeight = 10;
    this.shoulderWidth = 34;

    // Honest tip-over window. A 50px-wide base standing 100px tall tips past
    // ~14° from vertical; chamfered base edges and surface flex buy a few
    // more degrees, matching how real bottles recover from ~20° wobbles.
    // This replaces the old unrealistic 26° tolerance that let bottles stand
    // on their edges.
    this.uprightTolerance = 0.34; // radians (~19.5°)
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
    this._touchedTable = false; // bottle has contacted the table this throw (reserved for effects)

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
    // Table narrows gently with difficulty — floors at 82% of full width so
    // every level keeps room for a fair landing zone.
    const shrinkFactor = Math.max(0.82, 1 - this.difficulty * 0.036);
    const tableWidth = Math.min(780, Math.max(280, this.width * 0.92 * shrinkFactor));

    const tableX = this.width / 2;
    const tableY = this.height - 200;

    if (this.table) World.remove(this.engine.world, this.table);
    this.table = Bodies.rectangle(tableX, tableY, tableWidth, platformHeight, {
      isStatic: true, friction: 0.98, restitution: 0.05, label: 'table'
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
    // Moving target speed scales with difficulty (capped so D5 stays readable)
    this._targetSpeed = Math.min(2.2, this.difficulty * 0.45);
  }

  // ── Bottle Construction ─────────────────────────────────────────────────

  /**
   * Build the bottle as a compound body matching its silhouette:
   * cap + neck + tapered shoulder + wide flat base. The base part is given
   * extra density (the water lives there), so the centre of mass sits low
   * for real geometric reasons — upright landings are genuinely stable and
   * the bottle tips over honestly when its centre of mass passes the base.
   */
  _buildBottleBody(density, restitution) {
    const h = this.bottleHeight;
    const capH = this.capHeight;
    const neckH = this.neckHeight;
    const neckW = this.neckWidth;
    const shoulderW = this.shoulderWidth;
    const baseW = this.bottleWidth;
    const bodyH = h - capH - neckH;   // main body region below the neck
    const halfBody = bodyH / 2;

    const capY = -h / 2 + capH / 2;
    const neckY = -h / 2 + capH + neckH / 2;
    const shoulderY = -h / 2 + capH + neckH + halfBody / 2;
    const baseY = -h / 2 + capH + neckH + halfBody + halfBody / 2;

    // Water fill mass concentrates in the lower body (up to ~3x the density
    // of the empty upper shell at 100% fill). This is what makes a real
    // partially-filled bottle land and stay upright.
    const fillDensity = density * (1 + this.liquidFill * 2.0);

    const parts = [
      Bodies.rectangle(0, capY, neckW + 4, capH, { density }),
      Bodies.rectangle(0, neckY, neckW, neckH, { density }),
      // Shoulder tapers outward from the neck to the full base width,
      // mirroring the drawn silhouette.
      Bodies.trapezoid(0, shoulderY, baseW, halfBody, shoulderW / baseW, { density }),
      // Lower body: full-width slab holding the liquid mass.
      Bodies.rectangle(0, baseY, baseW, halfBody, {
        density: fillDensity,
        chamfer: { radius: 3 }, // soften base edges like real moulded plastic
      }),
    ];

    // Compound parts do NOT inherit the parent label — collision pairs
    // report raw labels like "Rectangle Body", which broke thud sounds,
    // slam detection and touchdown tracking. Tag every part.
    for (const part of parts) part.label = 'bottle';

    const bottle = Body.create({
      parts,
      // High contact friction is what makes real flips work: the flat base
      // slapping the table absorbs the residual rotation impulsively (grip),
      // instead of the bottle skating off on its edge.
      friction: 1.5,
      frictionStatic: 1.8,
      frictionAir: 0.0012,
      restitution,            // dead: real bottles thud, they don't bounce
      label: 'bottle',
    });

    // Report actual weight for HUD/debug (grams): scale sim mass to the
    // real 500ml-bottle curve (22g empty → 522g full).
    this.bottleMassG = Math.round(
      this.bottleEmptyMassG + (this.bottleFullMassG - this.bottleEmptyMassG) * this.liquidFill
    );

    return bottle;
  }

  spawnBottle() {
    if (this.bottle) World.remove(this.engine.world, this.bottle);

    const tablePos = this.table.position;
    const tableWidth = this.table.customData.width;
    const platformHeight = this.table.customData.height;

    const bottleX = tablePos.x - tableWidth * 0.35;

    // Water fill affects physics like the real thing:
    // empty = light, slightly bouncy, high CoM (hardest to land)
    // half-full = low CoM sweet spot (real-world easiest)
    // full = heavy, dead bounce (needs committed throws)
    const baseDensity = 0.0011 + this.liquidFill * 0.0031;
    // Real bottles clatter and skid on wood — they barely bounce at all.
    // Near-zero restitution is what lets post-touchdown rocking decay to
    // genuine rest instead of sustaining endless micro-bounces.
    const restitution = 0.01;

    this.bottle = this._buildBottleBody(baseDensity, restitution);
    // Centre of mass already sits low via per-part densities; a small extra
    // nudge with fill makes half-full bottles extra planted (the sweet spot).

    // Place flush on the table top using the actual bottom-most vertex.
    const tableTopY = tablePos.y - platformHeight / 2;
    let bottleBottomY = -Infinity;
    for (const v of this.bottle.vertices) {
      if (v.y > bottleBottomY) bottleBottomY = v.y;
    }
    Body.setPosition(this.bottle, {
      x: bottleX,
      y: this.bottle.position.y + (tableTopY - bottleBottomY),
    });

    // The bottle stays OUT of the world while aiming: the renderer draws the
    // body object's (frozen) vertices, and no simulation cost or drift is
    // possible until the throw adds it back to the world.

    this.state = 'READY';
    this.flightTime = 0;
    this.settleTimer = 0;
  }

  // ── Physics Helpers ──────────────────────────────────────────────────────

  updateCenterOfMass() {
    if (!this.bottle) return;
    // Gentle extra CoM shift with fill, layered on top of the real mass
    // distribution from per-part densities.
    const shiftY = (this.liquidFill - 0.5) * (this.bottleHeight * 0.12);
    Body.setCentre(this.bottle, { x: 0, y: shiftY }, true);
  }

  setLiquidFill(fillRatio) {
    this.liquidFill = fillRatio;
    this.spawnBottle();
  }

  throwBottle(velocityX, velocityY, angularVelocity) {
    if (this.state !== 'READY' && this.state !== 'AIMING') return;

    Body.setVelocity(this.bottle, { x: velocityX, y: velocityY });
    Body.setAngularVelocity(this.bottle, angularVelocity);
    World.add(this.engine.world, this.bottle);

    this._touchedTable = false;
    this._verdictIssued = false;
    this.state = 'FLIGHT';
    this.flightTime = 0;
    this.settleTimer = 0;
  }

  setupCollisionEvents() {
    Events.on(this.engine, 'collisionStart', (event) => {
      for (const pair of event.pairs) {
        const { bodyA, bodyB } = pair;
        // Compound-body parts carry the 'bottle' label themselves (parent
        // labels do not propagate to parts), so match on label, not identity.
        const bottleHit = bodyA.label === 'bottle' ? bodyA : bodyB.label === 'bottle' ? bodyB : null;
        if (!bottleHit) continue;
        const other = bottleHit === bodyA ? bodyB : bodyA;

        // Only react to bottle-vs-world contacts; ignore part-vs-part pairs.
        if (other.label === 'bottle') continue;
        if (this.state !== 'FLIGHT' && this.state !== 'SETTLING') continue;

        const speed = Vector.magnitude(this.bottle.velocity);
        if (this.onCollisionCallback) this.onCollisionCallback(other, speed);

        // A violent BROADSIDE slam is already lost — a bottle hitting the
        // table sideways at high speed never stands back up. The gates are
        // set beyond honest landings: matched touches arrive at ~2.5–4 speed
        // with mid-rotation tilt (and can still wobble upright from ~20°),
        // so only a fast AND clearly broadside impact (46°+) insta-fails.
        // Slower or steeper contacts are left to the rest-based verdict.
        if (other === this.table || other === this.ground) {
          if (other === this.table) this._touchedTable = true;
          const twoPi = Math.PI * 2;
          const norm = ((this.bottle.angle % twoPi) + twoPi) % twoPi;
          const tilt = norm > Math.PI ? twoPi - norm : norm;
          const broadside = tilt > 0.8 && tilt < Math.PI - 0.8;
          const isSlam = speed > 4.5 && broadside;
          if (isSlam) {
            this.state = 'FAILED';
            if (this.onLandingCallback) {
              this.onLandingCallback({ isUpright: false, isTarget: false, reason: 'SIDE_LANDING' });
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
    // Apply wind during flight only.
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

      // Judge ONLY at genuine rest, and only after the bottle has really
      // landed (touchdown delay) — a verdict can never fire mid-air, however
      // calm the flight looks. With near-zero restitution and high base
      // grip, post-touchdown wobble decays deterministically, so the resting
      // pose is a stable function of the throw. A bottle that plants steeply
      // and wobbles back upright succeeds, one that comes to rest tipped
      // fails, exactly like real life.
      if (this.state === 'FLIGHT' || this.state === 'SETTLING') {
        // Touchdown delay: no verdict before real table contact plus a
        // minimum flight time. A matched flip arc is 0.7–1.4s; 500ms is well
        // inside any real throw, so this never decides an outcome — it just
        // makes "instant verdicts" physically impossible.
        const touchdownDelayPassed = this._touchedTable && this.flightTime >= 500;

        // Judged once it has genuinely come to rest: near-zero linear AND
        // angular speed, held for a sustained window.
        const atRest = linearSpeed < 0.35 && angularSpeed < 0.06;
        if (atRest && touchdownDelayPassed) {
          this.settleTimer += deltaTime;
          if (this.settleTimer > 250) {
            // A slowly-toppling bottle also passes the speed gates while it
            // creeps through 20°–60° (topple torque is tiny at first). Only
            // accept the verdict in a pose where rest is PHYSICALLY stable:
            // the upright family, the headstand family, or on its side.
            // Anything between is unstable — it must keep falling, so keep
            // simulating until it reaches a real resting pose.
            const twoPi = Math.PI * 2;
            const norm = ((this.bottle.angle % twoPi) + twoPi) % twoPi;
            const tilt = norm > Math.PI ? twoPi - norm : norm;
            const uprightish = tilt < this.uprightTolerance * 1.05;
            const headstandish = Math.abs(norm - Math.PI) < this.uprightTolerance * 1.2;
            const onSide = tilt > 1.6; // ~92°+ → lying on its side
            if (uprightish || headstandish || onSide) {
              this._verdictIssued = true;
              this.evaluateLanding();
            } else {
              this.settleTimer = 0;
            }
          }
        } else {
          this.settleTimer = 0;
          this.state = linearSpeed > 0.6 ? 'FLIGHT' : 'SETTLING';
        }
      }

      // Out-of-bounds check
      if (this.state === 'FLIGHT' || this.state === 'SETTLING') {
        if (this.bottle.position.y > this.height + 200) {
          this.state = 'FAILED';
          if (this.onLandingCallback) {
            this.onLandingCallback({ isUpright: false, isTarget: false, reason: 'OUT_OF_BOUNDS' });
          }
        }
      }

      // Stalemate failsafe: if the bottle is still bouncing/rocking after 8s
      // (micro-jitter can ping-pong forever in a discrete solver), judge the
      // current pose instead of leaving the player hanging.
      if (!this._verdictIssued && this.flightTime > 8000) {
        this._verdictIssued = true;
        this.evaluateLanding();
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
    // 1. Must be horizontally INSIDE table edges (not leaning on walls/bumpers).
    const isHorizontallyOnTable = Math.abs(bottlePos.x - tablePos.x) <= (tableWidth / 2 - 8);

    // 2. Must be resting ON TOP of the table surface.
    const isVerticallyOnTable = bottlePos.y < tableTopY + 10 && bottlePos.y > tableTopY - this.bottleHeight - 15;

    const isOnTable = isUpright && isHorizontallyOnTable && isVerticallyOnTable;

    const targetX = tablePos.x + this.targetOffsetX;
    const isTargetHit = isOnTable && Math.abs(bottlePos.x - targetX) < 48;

    if (isOnTable) {
      this.state = 'LANDED';

      // Update difficulty every 5 successes
      this.successCount++;
      if (this.successCount % 5 === 0) {
        this.difficulty = Math.min(5, this.difficulty + 1);
        // Wind ramps on a curve so early levels feel calm and D5 is gusty
        // but still landable: 0, 0.5, 1.1, 1.7, 2.3, 2.8 (random direction).
        const windTable = [0, 0.5, 1.1, 1.7, 2.3, 2.8];
        this.windForce = (Math.random() > 0.5 ? 1 : -1) * windTable[this.difficulty];
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
          isOnGround: false,
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
