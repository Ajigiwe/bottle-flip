/**
 * Visual Effects Engine
 *
 * Handles all supplementary rendering effects:
 *  - Offscreen static background (drawn once, blitted every frame)
 *  - Animated background dust / sparkle particles
 *  - Screen shake (translate + decay)
 *  - Table landing ripple rings
 *  - Bottle spin trail (fading arc)
 *  - Streak fire aura particles (≥3 streak)
 *  - Object-pooled general particles (replaces splice-heavy array in render.js)
 */

// ─── Particle Pool ──────────────────────────────────────────────────────────

const POOL_SIZE = 200;

class ParticlePool {
  constructor() {
    this._pool = [];
    this._active = [];
    for (let i = 0; i < POOL_SIZE; i++) {
      this._pool.push(this._make());
    }
  }

  _make() {
    return { x: 0, y: 0, vx: 0, vy: 0, radius: 0, color: '#fff', alpha: 0, alive: false };
  }

  acquire() {
    const p = this._pool.pop() || this._make();
    p.alive = true;
    this._active.push(p);
    return p;
  }

  update(ctx) {
    for (let i = this._active.length - 1; i >= 0; i--) {
      const p = this._active[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.14;
      p.alpha -= 0.025;

      if (p.alpha <= 0) {
        p.alive = false;
        this._pool.push(p);
        this._active.splice(i, 1);
        continue;
      }

      ctx.save();
      ctx.globalAlpha = Math.max(0, p.alpha);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  spawn(x, y, color, count = 1) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 5 + 2;
      const p = this.acquire();
      p.x = x;
      p.y = y;
      p.vx = Math.cos(angle) * speed;
      p.vy = Math.sin(angle) * speed - 1.2;
      p.radius = Math.random() * 3 + 1.5;
      p.color = color;
      p.alpha = 1.0;
    }
  }
}

// ─── Effects Engine ──────────────────────────────────────────────────────────

export class EffectsEngine {
  constructor() {
    // Offscreen background canvas
    this._bgCanvas = null;
    this._bgCtx = null;
    this._bgDirty = true;

    // Background animated dust
    this._dust = [];

    // Screen shake
    this._shakeIntensity = 0;
    this._shakeDecay = 0.87;

    // Table ripples
    this._ripples = [];

    // Spin trail (stores recent bottle centroid positions)
    this._trail = [];
    this._maxTrail = 20;

    // Fire aura particles
    this._fire = [];
    this._maxFire = 150;

    // Pooled landing particles
    this.particles = new ParticlePool();
  }

  // ── Resize ────────────────────────────────────────────────────────────────

  resize(width, height) {
    if (!this._bgCanvas) {
      this._bgCanvas = document.createElement('canvas');
      this._bgCtx = this._bgCanvas.getContext('2d');
    }
    this._bgCanvas.width = width;
    this._bgCanvas.height = height;
    this._bgDirty = true;
    this._initDust(width, height);
  }

  // ── Background ────────────────────────────────────────────────────────────

  _initDust(w, h, count = 50) {
    this._dust = [];
    for (let i = 0; i < count; i++) {
      this._dust.push({
        x: Math.random() * w,
        y: Math.random() * h,
        r: Math.random() * 1.4 + 0.3,
        baseAlpha: Math.random() * 0.35 + 0.05,
        vx: (Math.random() - 0.5) * 0.12,
        vy: -(Math.random() * 0.14 + 0.04),
        phase: Math.random() * Math.PI * 2,
        phaseSpeed: Math.random() * 0.025 + 0.008,
      });
    }
  }

  _renderStaticBg(width, height) {
    if (!this._bgDirty || !this._bgCtx) return;
    const ctx = this._bgCtx;

    const grad = ctx.createRadialGradient(
      width / 2, height * 0.32, 60,
      width / 2, height * 0.5, Math.max(width, height) * 0.75
    );
    grad.addColorStop(0, '#1a2233');
    grad.addColorStop(0.55, '#0f1420');
    grad.addColorStop(1, '#070a10');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);

    const floorY = height - 60;
    const floorGrad = ctx.createLinearGradient(0, floorY, 0, height);
    floorGrad.addColorStop(0, '#0a0d14');
    floorGrad.addColorStop(1, '#040508');
    ctx.fillStyle = floorGrad;
    ctx.fillRect(0, floorY, width, 60);

    ctx.strokeStyle = 'rgba(255,255,255,0.03)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, floorY);
    ctx.lineTo(width, floorY);
    ctx.stroke();

    this._bgDirty = false;
  }

  drawBackground(ctx, width, height) {
    // Blit pre-rendered static layer
    if (this._bgCanvas && this._bgCanvas.width === width) {
      this._renderStaticBg(width, height);
      ctx.drawImage(this._bgCanvas, 0, 0);
    } else {
      // Fallback gradient if offscreen canvas not ready
      const grad = ctx.createRadialGradient(width / 2, height * 0.32, 60, width / 2, height * 0.5, Math.max(width, height) * 0.75);
      grad.addColorStop(0, '#1a2233');
      grad.addColorStop(0.55, '#0f1420');
      grad.addColorStop(1, '#070a10');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);
    }

    // Animate dust on top
    for (const d of this._dust) {
      d.x += d.vx;
      d.y += d.vy;
      d.phase += d.phaseSpeed;
      if (d.y < -4) { d.y = height + 4; d.x = Math.random() * width; }
      if (d.x < -4) d.x = width + 4;
      if (d.x > width + 4) d.x = -4;

      const alpha = d.baseAlpha * (0.6 + 0.4 * Math.sin(d.phase));
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = '#c7d8ff';
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  // ── Screen Shake ─────────────────────────────────────────────────────────

  triggerShake(intensity = 12) {
    this._shakeIntensity = Math.max(this._shakeIntensity, intensity);
  }

  /** Call once per frame inside ctx.save() / ctx.restore() block */
  applyShake(ctx) {
    if (this._shakeIntensity < 0.4) { this._shakeIntensity = 0; return; }
    ctx.translate(
      (Math.random() - 0.5) * this._shakeIntensity * 2,
      (Math.random() - 0.5) * this._shakeIntensity * 2
    );
    this._shakeIntensity *= this._shakeDecay;
  }

  // ── Table Ripple ─────────────────────────────────────────────────────────

  triggerRipple(x, y) {
    this._ripples.push({ x, y, r: 0, alpha: 0.75 });
  }

  drawRipples(ctx) {
    for (let i = this._ripples.length - 1; i >= 0; i--) {
      const rip = this._ripples[i];
      rip.r += 2.8;
      rip.alpha -= 0.026;

      if (rip.alpha <= 0) { this._ripples.splice(i, 1); continue; }

      ctx.save();
      ctx.globalAlpha = rip.alpha;
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 1.8;
      ctx.shadowColor = '#38bdf8';
      ctx.shadowBlur = 8;
      ctx.beginPath();
      // Ellipse flattened to look like it lies on the table surface
      ctx.ellipse(rip.x, rip.y, rip.r, rip.r * 0.2, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  // ── Spin Trail ───────────────────────────────────────────────────────────

  recordTrail(cx, cy) {
    this._trail.push({ x: cx, y: cy });
    if (this._trail.length > this._maxTrail) this._trail.shift();
  }

  clearTrail() { this._trail = []; }

  drawTrail(ctx) {
    const n = this._trail.length;
    if (n < 3) return;
    for (let i = 1; i < n; i++) {
      const prev = this._trail[i - 1];
      const curr = this._trail[i];
      const t = i / n;
      ctx.save();
      ctx.globalAlpha = t * 0.45;
      ctx.strokeStyle = `rgba(56,189,248,${t * 0.6})`;
      ctx.lineWidth = 1.5 + t * 2.5;
      ctx.lineCap = 'round';
      ctx.shadowColor = '#38bdf8';
      ctx.shadowBlur = 6;
      ctx.beginPath();
      ctx.moveTo(prev.x, prev.y);
      ctx.lineTo(curr.x, curr.y);
      ctx.stroke();
      ctx.restore();
    }
  }

  // ── Streak Fire Aura ─────────────────────────────────────────────────────

  feedFire(cx, cy, streak) {
    if (streak < 3) return;
    const count = Math.min(streak - 1, 5);
    const colors = ['#ff6d28', '#ff9500', '#ffd60a', '#ff3f3f', '#ffb238'];
    for (let i = 0; i < count; i++) {
      if (this._fire.length >= this._maxFire) break;
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 2.8 + 0.6;
      this._fire.push({
        x: cx + (Math.random() - 0.5) * 22,
        y: cy + (Math.random() - 0.5) * 32,
        vx: Math.cos(angle) * speed * 0.45,
        vy: -Math.abs(Math.sin(angle)) * speed - 0.6,
        life: 1.0,
        decay: 0.034 + Math.random() * 0.022,
        r: Math.random() * 4.5 + 1.5,
        color: colors[Math.floor(Math.random() * colors.length)],
      });
    }
  }

  drawFire(ctx) {
    for (let i = this._fire.length - 1; i >= 0; i--) {
      const p = this._fire[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy -= 0.055;
      p.life -= p.decay;
      if (p.life <= 0) { this._fire.splice(i, 1); continue; }

      ctx.save();
      ctx.globalAlpha = p.life * 0.82;
      ctx.fillStyle = p.color;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * p.life, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  // ── Landing Particles (pooled) ────────────────────────────────────────────

  triggerLandingBurst(x, y, isUpright, combo = 1) {
    const count = isUpright ? 22 : 14;
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 5 + 2;
      const p = this.particles.acquire();
      p.x = x;
      p.y = y;
      p.vx = Math.cos(angle) * speed;
      p.vy = Math.sin(angle) * speed - 1.2;
      p.radius = Math.random() * 3 + 1.5;
      p.color = isUpright ? (Math.random() > 0.5 ? '#38bdf8' : '#fbbf24') : '#f43f5e';
      p.alpha = 1.0;
    }
  }

  drawParticles(ctx) {
    this.particles.update(ctx);
  }
}
