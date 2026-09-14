import confetti from 'canvas-confetti';

export class GameRenderer {
  constructor(canvas, physicsWorld, motionController) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.physics = physicsWorld;
    this.motion = motionController;

    this.particles = [];
    this.bubbles = [];
    this.sloshAngle = 0;
    this.sloshVelocity = 0;

    this.initBubbles();
    this.resizeCanvas();
    window.addEventListener('resize', this.resizeCanvas.bind(this));
  }

  initBubbles() {
    this.bubbles = [];
    for (let i = 0; i < 10; i++) {
      this.bubbles.push({
        x: (Math.random() - 0.5) * 18,
        y: Math.random() * 40,
        r: Math.random() * 1.5 + 0.8,
        speed: Math.random() * 0.3 + 0.15,
        offset: Math.random() * Math.PI * 2
      });
    }
  }

  resizeCanvas() {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.canvas.width = this.width;
    this.canvas.height = this.height;
    if (this.physics) {
      this.physics.resize(this.width, this.height);
    }
  }

  render() {
    this.ctx.clearRect(0, 0, this.width, this.height);

    this.drawStudioBackground();
    this.drawSingleMainTable();
    this.drawTrajectory();
    this.drawCleanBottle();
    this.updateAndDrawParticles();
  }

  drawStudioBackground() {
    const studioGrad = this.ctx.createRadialGradient(
      this.width / 2, this.height * 0.32, 60,
      this.width / 2, this.height * 0.5, Math.max(this.width, this.height) * 0.75
    );
    studioGrad.addColorStop(0, '#1a2233');
    studioGrad.addColorStop(0.55, '#0f1420');
    studioGrad.addColorStop(1, '#070a10');

    this.ctx.fillStyle = studioGrad;
    this.ctx.fillRect(0, 0, this.width, this.height);

    const floorY = this.height - 60;
    const floorGrad = this.ctx.createLinearGradient(0, floorY, 0, this.height);
    floorGrad.addColorStop(0, '#0a0d14');
    floorGrad.addColorStop(1, '#040508');

    this.ctx.fillStyle = floorGrad;
    this.ctx.fillRect(0, floorY, this.width, 60);

    this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
    this.ctx.lineWidth = 1;
    this.ctx.beginPath();
    this.ctx.moveTo(0, floorY);
    this.ctx.lineTo(this.width, floorY);
    this.ctx.stroke();
  }

  drawSingleMainTable() {
    const table = this.physics.table;
    if (!table) return;

    const pos = table.position;
    const w = table.customData?.width || 500;
    const h = 16;
    const floorY = this.height - 60;
    const legWidth = 14;
    const legHeight = Math.max(20, floorY - (pos.y + h / 2));

    this.ctx.save();
    this.ctx.translate(pos.x, pos.y);

    const legLeftX = -w / 2 + 20;
    const legRightX = w / 2 - 20 - legWidth;

    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    this.ctx.beginPath();
    this.ctx.ellipse(legLeftX + legWidth / 2, legHeight + h / 2 + 2, 18, 5, 0, 0, Math.PI * 2);
    this.ctx.ellipse(legRightX + legWidth / 2, legHeight + h / 2 + 2, 18, 5, 0, 0, Math.PI * 2);
    this.ctx.fill();

    const legGrad = this.ctx.createLinearGradient(0, h / 2, 0, h / 2 + legHeight);
    legGrad.addColorStop(0, '#1f1915');
    legGrad.addColorStop(1, '#0c0908');
    this.ctx.fillStyle = legGrad;

    this.ctx.fillRect(legLeftX, h / 2, legWidth, legHeight);
    this.ctx.fillRect(legRightX, h / 2, legWidth, legHeight);

    this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    this.ctx.lineWidth = 1;
    this.ctx.strokeRect(legLeftX, h / 2, legWidth, legHeight);
    this.ctx.strokeRect(legRightX, h / 2, legWidth, legHeight);

    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    this.ctx.beginPath();
    this.ctx.ellipse(0, h / 2 + 6, w / 2 + 4, 10, 0, 0, Math.PI * 2);
    this.ctx.fill();

    const frontGrad = this.ctx.createLinearGradient(0, h / 2 - 4, 0, h / 2 + 6);
    frontGrad.addColorStop(0, '#2d221b');
    frontGrad.addColorStop(1, '#17110d');
    this.ctx.fillStyle = frontGrad;
    this.ctx.fillRect(-w / 2, h / 2 - 4, w, 10);

    const topGrad = this.ctx.createLinearGradient(-w / 2, -h / 2, w / 2, h / 2);
    topGrad.addColorStop(0, '#3d2f26');
    topGrad.addColorStop(0.5, '#49392e');
    topGrad.addColorStop(1, '#30241d');

    this.ctx.fillStyle = topGrad;
    this.ctx.beginPath();
    this.ctx.roundRect(-w / 2, -h / 2, w, h, [2, 2, 4, 4]);
    this.ctx.fill();

    this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.035)';
    this.ctx.lineWidth = 1;
    for (let i = -w / 2 + 12; i < w / 2; i += 28) {
      this.ctx.beginPath();
      this.ctx.moveTo(i, -h / 2);
      this.ctx.lineTo(i + 14, h / 2);
      this.ctx.stroke();
    }

    this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
    this.ctx.lineWidth = 1.2;
    this.ctx.beginPath();
    this.ctx.moveTo(-w / 2 + 2, -h / 2);
    this.ctx.lineTo(w / 2 - 2, -h / 2);
    this.ctx.stroke();

    const targetX = this.physics.targetOffsetX;
    this.ctx.save();
    this.ctx.translate(targetX, -h / 2 + 1);

    this.ctx.strokeStyle = 'rgba(56, 189, 248, 0.7)';
    this.ctx.lineWidth = 1.5;
    this.ctx.shadowColor = '#38bdf8';
    this.ctx.shadowBlur = 8;

    this.ctx.beginPath();
    this.ctx.ellipse(0, 0, 26, 5, 0, 0, Math.PI * 2);
    this.ctx.stroke();

    this.ctx.shadowBlur = 0;
    this.ctx.fillStyle = '#38bdf8';
    this.ctx.beginPath();
    this.ctx.ellipse(0, 0, 3.5, 1.2, 0, 0, Math.PI * 2);
    this.ctx.fill();

    this.ctx.restore();

    this.ctx.restore();
  }

  drawTrajectory() {
    const traj = this.motion.getAimTrajectory();
    if (!traj) return;

    const bottle = this.physics.bottle;
    if (!bottle || !bottle.vertices || bottle.vertices.length < 1) return;

    let sumX = 0;
    let sumY = 0;
    const verts = bottle.vertices;
    for (let i = 0; i < verts.length; i++) {
      sumX += verts[i].x;
      sumY += verts[i].y;
    }
    const geomX = sumX / verts.length;
    const geomY = sumY / verts.length;

    let currX = geomX;
    let currY = geomY;
    let vx = traj.vx;
    let vy = traj.vy;
    const gravity = 1.5 * 0.001 * (1000 / 60);

    this.ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
    for (let i = 0; i < 26; i++) {
      currX += vx * 1.8;
      currY += vy * 1.8;
      vy += gravity * 20;

      const radius = Math.max(1.2, 3.8 - i * 0.1);
      this.ctx.beginPath();
      this.ctx.arc(currX, currY, radius, 0, Math.PI * 2);
      this.ctx.fill();
    }
  }

  drawCleanBottle() {
    const bottle = this.physics.bottle;
    if (!bottle || !bottle.vertices || bottle.vertices.length < 1) return;

    // Calculate exact geometric centroid across ALL body vertices
    let sumX = 0;
    let sumY = 0;
    const verts = bottle.vertices;
    for (let i = 0; i < verts.length; i++) {
      sumX += verts[i].x;
      sumY += verts[i].y;
    }
    const geomX = sumX / verts.length;
    const geomY = sumY / verts.length;
    const angle = bottle.angle;

    const w = 34;
    const h = 112;

    this.ctx.save();
    this.ctx.translate(geomX, geomY);
    this.ctx.rotate(angle);

    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    this.ctx.beginPath();
    this.ctx.ellipse(0, h / 2 + 2, w / 2 - 2, 4, 0, 0, Math.PI * 2);
    this.ctx.fill();

    const capW = 15;
    const capH = 12;
    const neckW = 13;
    const neckH = 10;
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

      this.ctx.save();

      this.ctx.beginPath();
      this.ctx.roundRect(-w / 2 + 2, shoulderY + 2, w - 4, baseY - shoulderY - 8, [0, 0, 6, 6]);
      this.ctx.clip();

      const liquidGrad = this.ctx.createLinearGradient(0, liquidTopY, 0, baseY);
      liquidGrad.addColorStop(0, 'rgba(56, 189, 248, 0.35)');
      liquidGrad.addColorStop(0.5, 'rgba(14, 165, 233, 0.50)');
      liquidGrad.addColorStop(1, 'rgba(2, 132, 199, 0.65)');

      this.ctx.fillStyle = liquidGrad;
      this.ctx.beginPath();
      this.ctx.moveTo(-w, baseY + 10);
      this.ctx.lineTo(-w, liquidTopY + Math.sin(this.sloshAngle) * 5);
      this.ctx.bezierCurveTo(
        -w / 4, liquidTopY + Math.sin(this.sloshAngle + 1) * 4,
        w / 4, liquidTopY - Math.sin(this.sloshAngle + 1) * 4,
        w, liquidTopY - Math.sin(this.sloshAngle) * 5
      );
      this.ctx.lineTo(w, baseY + 10);
      this.ctx.closePath();
      this.ctx.fill();

      this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.65)';
      this.ctx.lineWidth = 1.2;
      this.ctx.stroke();

      this.ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
      this.bubbles.forEach((b) => {
        b.y -= b.speed;
        if (b.y < -liquidHeight / 2) b.y = liquidHeight / 2;

        const bx = b.x + Math.sin(b.offset + Date.now() * 0.002) * 2;
        const by = baseY - 12 - (b.y + liquidHeight / 2);
        if (by > liquidTopY + 4 && by < baseY - 4) {
          this.ctx.beginPath();
          this.ctx.arc(bx, by, b.r, 0, Math.PI * 2);
          this.ctx.fill();
        }
      });

      this.ctx.restore();
    }

    const glassGrad = this.ctx.createLinearGradient(-w / 2, 0, w / 2, 0);
    glassGrad.addColorStop(0, 'rgba(255, 255, 255, 0.28)');
    glassGrad.addColorStop(0.2, 'rgba(255, 255, 255, 0.08)');
    glassGrad.addColorStop(0.5, 'rgba(255, 255, 255, 0.03)');
    glassGrad.addColorStop(0.8, 'rgba(255, 255, 255, 0.08)');
    glassGrad.addColorStop(1, 'rgba(255, 255, 255, 0.25)');

    this.ctx.fillStyle = glassGrad;
    this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
    this.ctx.lineWidth = 1.2;

    this.ctx.beginPath();
    this.ctx.moveTo(-neckW / 2, shoulderY);
    this.ctx.lineTo(-w / 2 + 3, shoulderY + 8);
    this.ctx.lineTo(-w / 2 + 1, baseY - 6);
    this.ctx.quadraticCurveTo(-w / 2 + 1, baseY - 1, -w / 2 + 6, baseY - 1);
    this.ctx.lineTo(w / 2 - 6, baseY - 1);
    this.ctx.quadraticCurveTo(w / 2 - 1, baseY - 1, w / 2 - 1, baseY - 6);
    this.ctx.lineTo(w / 2 - 3, shoulderY + 8);
    this.ctx.lineTo(neckW / 2, shoulderY);
    this.ctx.closePath();

    this.ctx.fill();
    this.ctx.stroke();

    const labelH = 20;
    const labelY = 0;
    this.ctx.save();

    const labelGrad = this.ctx.createLinearGradient(-w / 2, labelY, w / 2, labelY);
    labelGrad.addColorStop(0, 'rgba(255, 255, 255, 0.15)');
    labelGrad.addColorStop(0.5, 'rgba(255, 255, 255, 0.25)');
    labelGrad.addColorStop(1, 'rgba(255, 255, 255, 0.15)');

    this.ctx.fillStyle = labelGrad;
    this.ctx.fillRect(-w / 2 + 1, labelY - labelH / 2, w - 2, labelH);

    this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
    this.ctx.lineWidth = 0.8;
    this.ctx.strokeRect(-w / 2 + 1, labelY - labelH / 2, w - 2, labelH);

    this.ctx.fillStyle = '#ffffff';
    this.ctx.font = '600 7px "Space Grotesk", sans-serif';
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';
    this.ctx.letterSpacing = '1px';
    this.ctx.fillText('PURE', 0, labelY);

    this.ctx.restore();

    this.ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
    this.ctx.fillRect(-neckW / 2 + 1, -h / 2 + capH, neckW - 2, neckH);
    this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    this.ctx.lineWidth = 1;
    this.ctx.strokeRect(-neckW / 2 + 1, -h / 2 + capH, neckW - 2, neckH);

    const capGrad = this.ctx.createLinearGradient(-capW / 2, 0, capW / 2, 0);
    capGrad.addColorStop(0, '#1e293b');
    capGrad.addColorStop(0.5, '#334155');
    capGrad.addColorStop(1, '#0f172a');

    this.ctx.fillStyle = capGrad;
    this.ctx.beginPath();
    this.ctx.roundRect(-capW / 2, -h / 2, capW, capH, 3);
    this.ctx.fill();

    this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
    this.ctx.lineWidth = 1;
    this.ctx.strokeRect(-capW / 2, -h / 2, capW, capH);

    this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.65)';
    this.ctx.lineWidth = 1.8;
    this.ctx.beginPath();
    this.ctx.moveTo(-w / 2 + 4, shoulderY + 10);
    this.ctx.lineTo(-w / 2 + 4, baseY - 8);
    this.ctx.stroke();

    this.ctx.restore();
  }

  triggerLandingParticles(x, y, isUpright, combo = 1) {
    const count = isUpright ? 22 : 14;
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 5 + 2;
      this.particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 1.2,
        radius: Math.random() * 3 + 1.5,
        color: isUpright ? (Math.random() > 0.5 ? '#38bdf8' : '#fbbf24') : '#f43f5e',
        alpha: 1.0
      });
    }

    if (isUpright && combo >= 2) {
      try {
        confetti({
          particleCount: Math.min(75, 25 + combo * 12),
          spread: 65,
          origin: { x: x / this.width, y: y / this.height }
        });
      } catch (e) {
        // Fallback
      }
    }
  }

  updateAndDrawParticles() {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.14;
      p.alpha -= 0.025;

      if (p.alpha <= 0) {
        this.particles.splice(i, 1);
        continue;
      }

      this.ctx.save();
      this.ctx.globalAlpha = p.alpha;
      this.ctx.fillStyle = p.color;
      this.ctx.beginPath();
      this.ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.restore();
    }
  }
}
