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

    // Rotation system
    this.angle = 0;        // current angle (degrees)
    this.spinSpeed = 720;  // degrees per second

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

      // start spin from current orientation (don’t reset)
      return true;
    }

    return false;
  }

  update(dt, tNow, world) {
    if (!this.alive) return;

    this.applyGravity(dt);

    const wasGrounded = this.grounded;

    // stepped movement (prevents tunneling)
    const steps = Math.max(1, Math.ceil(Math.abs(this.vy * dt) / 10));
    const stepDt = dt / steps;

    for (let s = 0; s < steps; s++) {
      const prevY = this.y;
      this.y += this.vy * stepDt;

      // lethal collision
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

        // ONLY snap when we actually transitioned from air → ground
        if (!wasGrounded) {
          // snap to nearest 90 degrees (Geometry Dash style)
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

    // Smooth mid-air rotation
    if (!this.grounded) {
<<<<<<< HEAD
      this.rotation += this.rotSpeed * (dt/1000);
      this.rotation %= 360;
=======
      this.angle += this.spinSpeed * dt;
      this.angle %= 360;
>>>>>>> fe774e1e94effdf64017b7ac747c0b04ff6ce7ff
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

<<<<<<< HEAD
    // determine aura settings (drawn behind the player)
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

    // draw aura first if enabled
    if (auraEnabled) {
      push();
     rotate(radians(this.rotation));
      blendMode(ADD);
      noStroke();
      const t = (this.manager && this.manager.runTime) ? (this.manager.runTime * 2.0) : 0;
      const glow = 0.5 + 0.5 * Math.sin(t);
      const a = 60 + 120 * glow;
      if (a > 40) {
        fill(auraCol[0], auraCol[1], auraCol[2], a * opacity);
        const sizeFactor = 1.4;
        if (this.shape === 'circle') ellipse(0, 0, this.width * sizeFactor, this.height * sizeFactor);
        else if (this.shape === 'square') { rectMode(CENTER); rect(0, 0, this.width * sizeFactor, this.height * sizeFactor); }
        else if (this.shape === 'x') {
          stroke(auraCol[0], auraCol[1], auraCol[2], a * opacity);
          strokeWeight(4);
          line(-this.width * sizeFactor/2, -this.height * sizeFactor/2, this.width * sizeFactor/2, this.height * sizeFactor/2);
          line(-this.width * sizeFactor/2, this.height * sizeFactor/2, this.width * sizeFactor/2, -this.height * sizeFactor/2);
          strokeWeight(2);
          noFill();
        } else if (this.shape === 'star') {
          const r = (this.width * sizeFactor) / 2;
          const r2 = r * 0.5;
          beginShape();
          for (let i = 0; i < 5; i++) {
            let a2 = -Math.PI/2 + i * (2 * Math.PI / 5);
            vertex(Math.cos(a2) * r, Math.sin(a2) * r);
            a2 += Math.PI / 5;
            vertex(Math.cos(a2) * r2, Math.sin(a2) * r2);
          }
          endShape(CLOSE);
        }
      }
      pop();
    }

    // draw main player shape
    push();
    if (!this.grounded) rotate(radians(this.rotation));
    noStroke();
    fill(this.color[0], this.color[1], this.color[2], 220 * opacity);
    if (this.shape === 'circle') {
      ellipse(0, 0, this.width, this.height);
    } else if (this.shape === 'square') {
      rectMode(CENTER);
      rect(0, 0, this.width, this.height);
    } else if (this.shape === 'triangle') {
      const w = this.width / 2;
      const h = this.height / 2;
      triangle(-w, h, w, h, 0, -h);
    } else if (this.shape === 'x') {
      stroke(255);
      strokeWeight(4);
      line(-this.width/2, -this.height/2, this.width/2, this.height/2);
      line(-this.width/2, this.height/2, this.width/2, -this.height/2);
      strokeWeight(2);
    } else if (this.shape === 'star') {
      const r = this.width / 2;
      const r2 = r * 0.5;
      beginShape();
      for (let i = 0; i < 5; i++) {
        let a = -Math.PI/2 + i * (2 * Math.PI / 5);
        vertex(Math.cos(a) * r, Math.sin(a) * r);
        a += Math.PI / 5;
        vertex(Math.cos(a) * r2, Math.sin(a) * r2);
      }
      endShape(CLOSE);
    }
    pop();
=======
  render(cx, centerX, centerY, opacity = 1) {

    push();
    translate(centerX, this.y);

    // rotate only while airborne
    if (!this.grounded) {
      rotate(radians(this.angle));
    }

    /* ===== AURA ===== */
    if (this.manager && this.manager.purchasedAura) {

      let col;
      let enabled = false;

      if (this.manager.state === STATES.PLAYING_MULTI) {
        if (this.index === 0) {
          enabled = this.manager.auraEnabledP1;
          col = this.manager.auraColorP1 || this.color;
        } else {
          enabled = this.manager.auraEnabledP2;
          col = this.manager.auraColorP2 || this.color;
        }
      } else {
        enabled = this.manager.auraEnabled;
        col = this.manager.auraColor || this.color;
      }

      if (enabled) {
        blendMode(ADD);
        noStroke();

        const t = (this.manager.runTime || 0) * 2;
        const glow = 0.5 + 0.5 * Math.sin(t);
        const alpha = 60 + 120 * glow;

        if (alpha > 40) {
          fill(col[0], col[1], col[2], alpha * opacity);
          this.drawShape(this.width * 1.4, this.height * 1.4);
        }

        blendMode(BLEND);
      }
    }

    /* ===== MAIN PLAYER ===== */
    stroke(255);
    strokeWeight(2);
    fill(this.color[0], this.color[1], this.color[2], 220 * opacity);

    this.drawShape(this.width, this.height);
>>>>>>> fe774e1e94effdf64017b7ac747c0b04ff6ce7ff

    pop();
  }

  /* ================= SHAPE DRAWER ================= */

  drawShape(w, h) {

    if (this.shape === "circle") {
      ellipse(0, 0, w, h);

    } else if (this.shape === "square") {
      rectMode(CENTER);
      rect(0, 0, w, h);

    } else if (this.shape === "triangle") {
      triangle(-w/2, h/2, w/2, h/2, 0, -h/2);

    } else if (this.shape === "x") {
      strokeWeight(4);
      line(-w/2, -h/2, w/2, h/2);
      line(-w/2, h/2, w/2, -h/2);
      strokeWeight(2);

    } else if (this.shape === "star") {
      const r = w / 2;
      const r2 = r * 0.5;

      beginShape();
      for (let i = 0; i < 5; i++) {
        let a = -HALF_PI + i * TWO_PI / 5;
        vertex(Math.cos(a) * r, Math.sin(a) * r);
        a += PI / 5;
        vertex(Math.cos(a) * r2, Math.sin(a) * r2);
      }
      endShape(CLOSE);
    }
  }
}