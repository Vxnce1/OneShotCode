/* ======= Player ======= */
class Player {
  constructor(index, manager) {
    this.index = index;
    this.manager = manager;
    this.reset();
  }

  reset() {
    this.x = 0;
    this.y = 0;
    this.vy = 0;

    this.width = 40;
    this.height = 40;

    this.grounded = false;
    this.gravityDir = 1;

    this.angle = 0;
    this.spinSpeed = 720;

    this.shape = "square";
    this.color = [0, 255, 200];

    this.lastJumpTime = -9999;
    this.inputBufferUntil = -9999;
    this.coyoteUntil = -9999;

    this.score = 0;
    this.alive = true;
    this.distance = 0;
  }

  resetForRun() {
    this.reset();
    this.y = height - 120;

    if (this.manager) {
      this.shape = this.manager.selectedShape || this.shape;
      this.color = this.manager.selectedColor || this.color;
    }
  }

  /* ================= PHYSICS ================= */

  applyGravity(dt) {
    const g = CONFIG.gravity * this.gravityDir;
    this.vy += g * dt;
    this.vy = clamp(this.vy, -CONFIG.terminalVelocity, CONFIG.terminalVelocity);
  }

  attemptJump(tNow) {
    if (!this.alive) return false;

    const canCoyote = tNow <= this.coyoteUntil;

    if (this.grounded || canCoyote) {
      this.vy = CONFIG.initialJumpVelocity * this.gravityDir;
      this.grounded = false;
      this.lastJumpTime = tNow;
      return true;
    }

    return false;
  }

  update(dt, tNow, world) {
    if (!this.alive) return;

    this.applyGravity(dt);

    const wasGrounded = this.grounded;
    const steps = Math.max(1, Math.ceil(Math.abs(this.vy * dt) / 10));
    const stepDt = dt / steps;

    for (let s = 0; s < steps; s++) {
      const prevY = this.y;
      this.y += this.vy * stepDt;

      if (world.checkLethalCollision(this.getAABB())) {
        this.alive = false;
        world.onPlayerDeath(this);
        return;
      }

      const landed = world.resolvePlatformCollision(this, tNow, prevY);

      if (landed) {
        this.grounded = true;
        this.vy = 0;
        this.coyoteUntil = -9999;

        if (!wasGrounded) {
          this.angle = Math.round(this.angle / 90) * 90;
        }
      } else {
        if (wasGrounded) {
          this.coyoteUntil = tNow + (CONFIG.coyoteTimeMs / 1000);
        }
        this.grounded = false;
      }
    }

    const bottomBound = globalManager.map
      ? globalManager.map.worldBottom
      : height;

    if (this.y > bottomBound + 10) {
      this.alive = false;
      world.onPlayerDeath(this);
      return;
    }

    this.distance += world.speed * dt;

    if (this.grounded && tNow <= this.inputBufferUntil) {
      this.attemptJump(tNow);
      this.inputBufferUntil = -9999;
    }

    if (!this.grounded) {
      this.angle += this.spinSpeed * dt;
      this.angle %= 360;
    }
  }

  /* ================= COLLISION BOX ================= */

  getAABB() {
    const shrink = 0.02;
    const shw = this.width * shrink;
    const shh = this.height * shrink;
    const worldX = this.distance || 0;

    return {
      x: worldX - this.width / 2 + shw,
      y: this.y - this.height / 2 + shh,
      w: this.width - shw * 2,
      h: this.height - shh * 2
    };
  }

  /* ================= RENDER ================= */

  render(opacity = 1) {

    let auraEnabled = false;
    let auraCol = this.color;

    if (this.manager && this.manager.purchasedAura) {
      if (this.manager.state === STATES.PLAYING_MULTI) {
        if (this.index === 0) {
          auraEnabled = !!this.manager.auraEnabledP1;
          auraCol = this.manager.auraColorP1 || this.manager.selectedColor || this.color;
        } else {
          auraEnabled = !!this.manager.auraEnabledP2;
          auraCol = this.manager.auraColorP2 || this.manager.selectedColor || this.color;
        }
      } else {
        auraEnabled = !!this.manager.auraEnabled;
        auraCol = this.manager.auraColor || this.manager.selectedColor || this.color;
      }
    }

    // Aura
    if (auraEnabled) {
      push();
      rotate(radians(this.angle));
      blendMode(ADD);
      noStroke();

      const t = (this.manager && this.manager.runTime)
        ? (this.manager.runTime * 2.0)
        : 0;

      const glow = 0.5 + 0.5 * Math.sin(t);
      const a = 60 + 120 * glow;

      if (a > 40) {
        fill(auraCol[0], auraCol[1], auraCol[2], a * opacity);
        const sizeFactor = 1.4;

        if (this.shape === 'circle') {
          ellipse(0, 0, this.width * sizeFactor, this.height * sizeFactor);
        } else {
          rectMode(CENTER);
          rect(0, 0, this.width * sizeFactor, this.height * sizeFactor);
        }
      }

      pop();
    }

    // Main Shape
    push();

    if (!this.grounded) {
      rotate(radians(this.angle));
    }

    noStroke();
    fill(this.color[0], this.color[1], this.color[2], 220 * opacity);

    if (this.shape === 'circle') {
      ellipse(0, 0, this.width, this.height);
    } else {
      rectMode(CENTER);
      rect(0, 0, this.width, this.height);
    }

    pop();
  }

  /* ================= SHAPE DRAWER ================= */

  drawShape(w, h) {
    if (this.shape === "circle") {
      ellipse(0, 0, w, h);
    } else {
      rectMode(CENTER);
      rect(0, 0, w, h);
    }
  }
}