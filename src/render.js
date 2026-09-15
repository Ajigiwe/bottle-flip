import confetti from 'canvas-confetti';
import { EffectsEngine } from './effects.js';

export class GameRenderer {
  constructor(canvas, physicsWorld, motionController, skinSystem) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.physics = physicsWorld;
    this.motion = motionController;
    this.skinSystem = skinSystem;

    this.effects = new EffectsEngine();

    this.bubbles = [];
    this.sloshAngle = 0;
    this.sloshVelocity = 0;

    this._initBubbles();
    this.resizeCanvas();
    window.addEventListener('resize', this.resizeCanvas.bind(this));
  }

  _initBubbles() {
    this.bubbles = [];
    for (let i = 0; i < 10; i++) {
      this.bubbles.push({
        x: (Math.random() - 0.5) * 18,
        y: Math.random() * 40,
        r: Math.random() * 1.5 + 0.8,
        speed: Math.random() * 0.3 + 0.15,
        offset: Math.random() * Math.PI * 2,
      });
    }
  }

  resizeCanvas() {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.canvas.width = this.width;
    this.canvas.height = this.height;

    this.effects.resize(this.width, this.height);

    if (this.physics) {
      const safeToRebuild = !['FLIGHT', 'SETTLING', 'AIMING'].includes(this.physics.state);
      if (safeToRebuild) {
        this.physics.resize(this.width, this.height);
      } else {
        this.physics.width = this.width;
        this.physics.height = this.height;
      }
    }
  }

  // ── Master Render ────────────────────────────────────────────────────────

  render(streak = 0, bestScore = 0) {
    const ctx = this.ctx;

    // Screen shake transform wraps everything
    ctx.save();
    this.effects.applyShake(ctx);

    // 1. Offscreen background + animated dust
    this.effects.drawBackground(ctx, this.width, this.height);

    // 2. Table
    this.drawSingleMainTable();

    // 3. Ripples on table surface
    this.effects.drawRipples(ctx);

    // 4. Trajectory preview arc
    this.drawTrajectory();

    // 5. Spin trail (drawn behind bottle)
    this.effects.drawTrail(ctx);

    // 6. Bottle (with active skin)
    this.drawCleanBottle(this.skinSystem?.getActive(bestScore));

    // 7. Fire aura (drawn in front of bottle)
    this.effects.drawFire(ctx);

    // 8. Pooled landing particles
    this.effects.drawParticles(ctx);

    // 9. Power meter overlay (while aiming)
    this.drawPowerMeter();

    // 10. Wind indicator (when wind is active)
    this.drawWindIndicator();

    ctx.restore();

    // Feed fire each frame while airborne
    const bottle = this.physics.bottle;
    if (bottle && (this.physics.state === 'FLIGHT' || this.physics.state === 'SETTLING')) {
      const centre = this._bottleCentre();
      this.effects.recordTrail(centre.x, centre.y);
      this.effects.feedFire(centre.x, centre.y, streak);
    } else {
      this.effects.clearTrail();
    }
  }

  // ── Table ────────────────────────────────────────────────────────────────

  drawSingleMainTable() {
    const ctx = this.ctx;
    const table = this.physics.table;
    if (!table) return;

    const pos = table.position;
    const w = table.customData?.width || 500;
    const h = 16;
    const floorY = this.height - 60;
    const legWidth = 14;
    const legHeight = Math.max(20, floorY - (pos.y + h / 2));

    ctx.save();
    ctx.translate(pos.x, pos.y);

    const legLeftX = -w / 2 + 20;
    const legRightX = w / 2 - 20 - legWidth;

    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.beginPath();
    ctx.ellipse(legLeftX + legWidth / 2, legHeight + h / 2 + 2, 18, 5, 0, 0, Math.PI * 2);
    ctx.ellipse(legRightX + legWidth / 2, legHeight + h / 2 + 2, 18, 5, 0, 0, Math.PI * 2);
    ctx.fill();

    const legGrad = ctx.createLinearGradient(0, h / 2, 0, h / 2 + legHeight);
    legGrad.addColorStop(0, '#1f1915');
    legGrad.addColorStop(1, '#0c0908');
    ctx.fillStyle = legGrad;
    ctx.fillRect(legLeftX, h / 2, legWidth, legHeight);
    ctx.fillRect(legRightX, h / 2, legWidth, legHeight);

    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    ctx.strokeRect(legLeftX, h / 2, legWidth, legHeight);
    ctx.strokeRect(legRightX, h / 2, legWidth, legHeight);

    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(0, h / 2 + 6, w / 2 + 4, 10, 0, 0, Math.PI * 2);
    ctx.fill();

    const frontGrad = ctx.createLinearGradient(0, h / 2 - 4, 0, h / 2 + 6);
    frontGrad.addColorStop(0, '#2d221b');
    frontGrad.addColorStop(1, '#17110d');
    ctx.fillStyle = frontGrad;
    ctx.fillRect(-w / 2, h / 2 - 4, w, 10);

    const topGrad = ctx.createLinearGradient(-w / 2, -h / 2, w / 2, h / 2);
    topGrad.addColorStop(0, '#3d2f26');
    topGrad.addColorStop(0.5, '#49392e');
    topGrad.addColorStop(1, '#30241d');
    ctx.fillStyle = topGrad;
    ctx.beginPath();
    ctx.roundRect(-w / 2, -h / 2, w, h, [2, 2, 4, 4]);
    ctx.fill();

    ctx.strokeStyle = 'rgba(255,255,255,0.035)';
    ctx.lineWidth = 1;
    for (let i = -w / 2 + 12; i < w / 2; i += 28) {
      ctx.beginPath();
      ctx.moveTo(i, -h / 2);
      ctx.lineTo(i + 14, h / 2);
      ctx.stroke();
    }

    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(-w / 2 + 2, -h / 2);
    ctx.lineTo(w / 2 - 2, -h / 2);
    ctx.stroke();

    // Bullseye target (pulses if target is moving)
    const targetX = this.physics.targetOffsetX;
    const isMoving = this.physics._targetSpeed > 0;
    ctx.save();
    ctx.translate(targetX, -h / 2 + 1);

    if (isMoving) {
      // Pulsing cyan glow for moving target
      const pulse = 0.5 + 0.5 * Math.sin(Date.now() * 0.006);
      ctx.shadowColor = '#38bdf8';
      ctx.shadowBlur = 6 + pulse * 10;
    }

    ctx.strokeStyle = 'rgba(56,189,248,0.7)';
    ctx.lineWidth = 1.5;
    if (!isMoving) { ctx.shadowColor = '#38bdf8'; ctx.shadowBlur = 8; }
    ctx.beginPath();
    ctx.ellipse(0, 0, 26, 5, 0, 0, Math.PI * 2);
    ctx.stroke();

    ctx.shadowBlur = 0;
    ctx.fillStyle = '#38bdf8';
    ctx.beginPath();
    ctx.ellipse(0, 0, 3.5, 1.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.restore();
  }

  /**
   * Centre of the bottle's rendered silhouette. For compound Matter bodies
   * the body position is the centre of MASS (pulled towards the heavy base),
   * not the silhouette centre — so compute it from the vertices instead.
   */
  _bottleCentre() {
    const bottle = this.physics.bottle;
    if (!bottle?.vertices?.length) return { x: 0, y: 0 };
    let cx = 0, cy = 0;
    for (const v of bottle.vertices) { cx += v.x; cy += v.y; }
    cx /= bottle.vertices.length; cy /= bottle.vertices.length;
    return { x: cx, y: cy };
  }

  // ── Trajectory Arc ───────────────────────────────────────────────────────

  drawTrajectory() {
    const traj = this.motion.getAimTrajectory();
    if (!traj) return;

    const { x: cx, y: cy } = this._bottleCentre();
    if (cx === 0 && cy === 0) return;

    let currX = cx, currY = cy;
    let vx = traj.vx, vy = traj.vy;

    // True physics arc: Matter applies gravity.y × gravity.scale × Δt² per
    // tick, and the preview steps at 1.5 ticks — mirror that exactly.
    const grav = this.physics.engine.gravity;
    const gStep = grav.y * grav.scale * (1000 / 60) * (1000 / 60) * 1.5;
    this.ctx.fillStyle = 'rgba(255,255,255,0.85)';
    for (let i = 0; i < 24; i++) {
      currX += vx * 1.5;
      currY += vy * 1.5;
      vy += gStep;
      const radius = Math.max(1.2, 3.6 - i * 0.1);
      this.ctx.beginPath();
      this.ctx.arc(currX, currY, radius, 0, Math.PI * 2);
      this.ctx.fill();
    }
  }

  // ── Power Meter ──────────────────────────────────────────────────────────

  drawPowerMeter() {
    const power = this.motion.getPowerPercent();
    if (power === null) return;

    const { x: cx, y: cy } = this._bottleCentre();
    if (cx === 0 && cy === 0) return;

    const ctx = this.ctx;
    const radius = 30;
    const startAngle = -Math.PI / 2;
    const endAngle = startAngle + (Math.PI * 2 * power);

    // Background ring
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.stroke();

    // Power arc — green → yellow → red
    const hue = Math.round(120 - power * 120);
    ctx.strokeStyle = `hsl(${hue}, 85%, 55%)`;
    ctx.lineWidth = 3.5;
    ctx.shadowColor = `hsl(${hue}, 85%, 55%)`;
    ctx.shadowBlur = 8;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(cx, cy, radius, startAngle, endAngle);
    ctx.stroke();

    // Power % label
    ctx.shadowBlur = 0;
    ctx.fillStyle = `hsl(${hue}, 85%, 70%)`;
    ctx.font = `bold 10px "Space Grotesk", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${Math.round(power * 100)}%`, cx, cy + radius + 14);

    ctx.restore();
  }

  // ── Wind Indicator ───────────────────────────────────────────────────────

  drawWindIndicator() {
    const wind = this.physics.windForce;
    if (!wind || Math.abs(wind) < 0.1) return;

    const ctx = this.ctx;
    const intensity = Math.min(1, Math.abs(wind) / 4);
    const dir = wind > 0 ? 1 : -1;

    ctx.save();
    ctx.globalAlpha = 0.55 + 0.3 * intensity;
    ctx.fillStyle = '#94a3b8';
    ctx.font = `600 11px "Plus Jakarta Sans", sans-serif`;
    ctx.textAlign = dir > 0 ? 'left' : 'right';
    ctx.textBaseline = 'top';
    const arrows = dir > 0 ? '→ → →'.slice(0, 1 + Math.round(intensity * 4)) : '← ← ←'.slice(0, 1 + Math.round(intensity * 4));
    ctx.fillText(`WIND ${arrows}`, dir > 0 ? 16 : this.width - 16, this.height - 130);
    ctx.restore();
  }

  // ── Bottle ────────────────────────────────────────────────────────────────

  drawCleanBottle(skin) {
    const bottle = this.physics.bottle;
    if (!bottle?.vertices?.length) return;

    const ctx = this.ctx;
    // Compound bodies: silhouette centre from vertices, not body.position
    // (which is the centre of mass and sits low in the base).
    const centre = this._bottleCentre();
    const cx = centre.x, cy = centre.y;

    const angle = bottle.angle;
    const w = this.physics.bottleWidth || 46;
    const h = this.physics.bottleHeight || 100;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);

    // Skin glow
    if (skin?.glow) {
      ctx.shadowColor = skin.glow;
      ctx.shadowBlur = 14;
    }

    // Drop shadow
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(0, h / 2 + 2, w / 2 - 2, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    const capW = Math.round(w * 0.42), capH = 12, neckW = Math.round(w * 0.36), neckH = 10;
    const shoulderY = -h / 2 + capH + neckH;
    const baseY = h / 2;

    const fill = this.physics.liquidFill;
    if (fill > 0.02) {
      const liquidHeight = (h - (capH + neckH + 12)) * fill;
      const liquidTopY = baseY - 6 - liquidHeight;

      const targetSlosh = -bottle.angularVelocity * 3.5;
      this.sloshVelocity += (targetSlosh - this.sloshAngle) * 0.12;
      this.sloshVelocity *= 0.85;
      this.sloshAngle += this.sloshVelocity;

      ctx.save();
      ctx.beginPath();
      ctx.roundRect(-w / 2 + 2, shoulderY + 2, w - 4, baseY - shoulderY - 8, [0, 0, 6, 6]);
      ctx.clip();

      const liq = skin?.liquidGrad || ['rgba(56,189,248,0.35)', 'rgba(14,165,233,0.50)', 'rgba(2,132,199,0.65)'];
      const liquidGrad = ctx.createLinearGradient(0, liquidTopY, 0, baseY);
      liquidGrad.addColorStop(0, liq[0]);
      liquidGrad.addColorStop(0.5, liq[1]);
      liquidGrad.addColorStop(1, liq[2]);

      ctx.fillStyle = liquidGrad;
      ctx.beginPath();
      ctx.moveTo(-w, baseY + 10);
      ctx.lineTo(-w, liquidTopY + Math.sin(this.sloshAngle) * 5);
      ctx.bezierCurveTo(
        -w / 4, liquidTopY + Math.sin(this.sloshAngle + 1) * 4,
        w / 4, liquidTopY - Math.sin(this.sloshAngle + 1) * 4,
        w, liquidTopY - Math.sin(this.sloshAngle) * 5
      );
      ctx.lineTo(w, baseY + 10);
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = skin?.liquidSurface || 'rgba(255,255,255,0.65)';
      ctx.lineWidth = 1.2;
      ctx.stroke();

      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      this.bubbles.forEach((b) => {
        b.y -= b.speed;
        if (b.y < -liquidHeight / 2) b.y = liquidHeight / 2;
        const bx = b.x + Math.sin(b.offset + Date.now() * 0.002) * 2;
        const by = baseY - 12 - (b.y + liquidHeight / 2);
        if (by > liquidTopY + 4 && by < baseY - 4) {
          ctx.beginPath();
          ctx.arc(bx, by, b.r, 0, Math.PI * 2);
          ctx.fill();
        }
      });
      ctx.restore();
    }

    // Glass body
    const ga = skin?.glassAlpha || [0.28, 0.08, 0.03, 0.08, 0.25];
    const glassGrad = ctx.createLinearGradient(-w / 2, 0, w / 2, 0);
    glassGrad.addColorStop(0, `rgba(255,255,255,${ga[0]})`);
    glassGrad.addColorStop(0.2, `rgba(255,255,255,${ga[1]})`);
    glassGrad.addColorStop(0.5, `rgba(255,255,255,${ga[2]})`);
    glassGrad.addColorStop(0.8, `rgba(255,255,255,${ga[3]})`);
    glassGrad.addColorStop(1, `rgba(255,255,255,${ga[4]})`);

    const borderA = skin?.borderAlpha ?? 0.45;
    ctx.fillStyle = glassGrad;
    ctx.strokeStyle = `rgba(255,255,255,${borderA})`;
    ctx.lineWidth = 1.2;

    ctx.beginPath();
    ctx.moveTo(-neckW / 2, shoulderY);
    ctx.lineTo(-w / 2 + 3, shoulderY + 8);
    ctx.lineTo(-w / 2 + 1, baseY - 6);
    ctx.quadraticCurveTo(-w / 2 + 1, baseY - 1, -w / 2 + 6, baseY - 1);
    ctx.lineTo(w / 2 - 6, baseY - 1);
    ctx.quadraticCurveTo(w / 2 - 1, baseY - 1, w / 2 - 1, baseY - 6);
    ctx.lineTo(w / 2 - 3, shoulderY + 8);
    ctx.lineTo(neckW / 2, shoulderY);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Label
    const labelH = 20, labelY = 0;
    ctx.save();
    const labelCol = skin?.labelColor || '#ffffff';
    const labelGrad = ctx.createLinearGradient(-w / 2, labelY, w / 2, labelY);
    labelGrad.addColorStop(0, 'rgba(255,255,255,0.15)');
    labelGrad.addColorStop(0.5, 'rgba(255,255,255,0.25)');
    labelGrad.addColorStop(1, 'rgba(255,255,255,0.15)');
    ctx.fillStyle = labelGrad;
    ctx.fillRect(-w / 2 + 1, labelY - labelH / 2, w - 2, labelH);
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 0.8;
    ctx.strokeRect(-w / 2 + 1, labelY - labelH / 2, w - 2, labelH);
    ctx.fillStyle = labelCol;
    ctx.font = '600 7px "Space Grotesk", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // Manual letter-spacing (non-standard ctx.letterSpacing avoided)
    const word = 'PURE';
    const gap = 3.5;
    const totalW = (word.length - 1) * gap;
    let lx = -totalW / 2;
    for (const ch of word) { ctx.fillText(ch, lx, labelY); lx += gap; }
    ctx.restore();

    // Neck
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fillRect(-neckW / 2 + 1, -h / 2 + capH, neckW - 2, neckH);
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 1;
    ctx.strokeRect(-neckW / 2 + 1, -h / 2 + capH, neckW - 2, neckH);

    // Cap
    const cap = skin?.capGrad || ['#1e293b', '#334155', '#0f172a'];
    const capGrad = ctx.createLinearGradient(-capW / 2, 0, capW / 2, 0);
    capGrad.addColorStop(0, cap[0]);
    capGrad.addColorStop(0.5, cap[1]);
    capGrad.addColorStop(1, cap[2]);
    ctx.fillStyle = capGrad;
    ctx.beginPath();
    ctx.roundRect(-capW / 2, -h / 2, capW, capH, 3);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 1;
    ctx.strokeRect(-capW / 2, -h / 2, capW, capH);

    // Highlight streak
    ctx.strokeStyle = 'rgba(255,255,255,0.65)';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(-w / 2 + 4, shoulderY + 10);
    ctx.lineTo(-w / 2 + 4, baseY - 8);
    ctx.stroke();

    ctx.restore();
  }

  // ── Landing Effects ──────────────────────────────────────────────────────

  triggerLandingParticles(x, y, isUpright, combo = 1) {
    this.effects.triggerLandingBurst(x, y, isUpright, combo);

    if (isUpright) {
      // Ripple on the table surface
      const tablePos = this.physics.table?.position;
      if (tablePos) this.effects.triggerRipple(x, tablePos.y - 8);
    }

    if (isUpright && combo >= 2) {
      try {
        confetti({
          particleCount: Math.min(80, 25 + combo * 12),
          spread: 65,
          origin: { x: x / this.width, y: y / this.height }
        });
      } catch (_) {}
    }
  }

  triggerCapConfetti(x, y) {
    try {
      confetti({
        particleCount: 120,
        spread: 110,
        origin: { x: x / this.width, y: y / this.height },
        colors: ['#ffd700', '#ff007f', '#00e5ff', '#ffffff', '#764ba2']
      });
    } catch (_) {}
  }

  triggerScreenShake(intensity = 12) {
    this.effects.triggerShake(intensity);
  }
}
