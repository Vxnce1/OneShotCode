/* ======= Map Generator and World ======= */
class MapGenerator {
    constructor(rng, difficulty='medium') {
    this.rng = rng;
    this.difficulty = difficulty;
    this.segments = [];
    this.speed = CONFIG.baseSpeed[difficulty];
    this.speedCap = CONFIG.speedCap[difficulty];
    this.distanceSinceSpeedUp = 0;
    this.segmentX = 0;
    this.pool = new Pool(()=> new Obstacle());
    this.coinPool = new Pool(()=> new Coin());
    // portals have been disabled
    // this.portalPool = new Pool(()=> new Portal());
    this.particlePool = new Pool(()=> new Particle());
    this.worldTop = 60;
    this.worldBottom = height - 40;
    this.generateInitial();
  }
  
  recalcBounds() { this.worldBottom = height - 40; this.worldTop = 60; }
  generateInitial() {
    this.segments = [];
    this.segmentX = 0;
    for (let i=0;i<8;i++) this.pushSegment(false);
    // run a quick validation & repair pass to ensure initial playability
    const issues = this.validateAllSegments();
    if (issues.length) this._repairIssues(issues);
  }

  _repairIssues(issues) {
    for (const it of issues) {
      const s = it.seg;
      if (it.issue === 'gap_too_wide' && s.obstacles) {
        for (const ob of s.obstacles) {
          if (ob.type === 'gap' && ob.w > it.maxAllowed) ob.w = it.maxAllowed;
        }
      }
      if (it.issue === 'segment_too_wide') {
        s.w = Math.max(300, Math.floor(this.maxJumpDistance() * 1.5));
      }
    }
  }
  pushSegment(force=false) {
    const segWidth = Math.round(this.rng.range(300, 700));
    const platformY = Math.round(this.rng.range(this.worldBottom-120, this.worldBottom-20));
    const seg = { x: this.segmentX, w: segWidth, platformY, obstacles: [], coins: [], spikes: [] };
    // obstacles as pillars or gaps
    if (this.rng.next() < 0.6) {
      const type = this.rng.next() < 0.5 ? 'gap' : 'pillar';
      if (type === 'gap') seg.obstacles.push(this.createGap(seg.x + seg.w*0.6, seg.platformY));
      else seg.obstacles.push(this.createPillar(seg.x + seg.w*0.5, seg.platformY));
    }
    // spikes
    if (this.rng.next() < 0.18) {
      const sx = Math.round(this.rng.range(seg.x + seg.w*0.1, seg.x + seg.w*0.9));
      const spike = { x: sx, w: 28, side: 'floor' };
      // check spacing
      let spaced = true;
      for (const sp of seg.spikes) {
        if (Math.abs(sp.x - sx) < 50) { spaced = false; break; }
      }
      if (spaced) seg.spikes.push(spike);
    }
    // rings
    if (this.rng.next() < 0.18) {
      const rx = Math.round(this.rng.range(seg.x + seg.w*0.15, seg.x + seg.w*0.85));
      seg.obstacles.push(this.createRing(rx, seg.platformY - 40, this.rng.range(1.0,1.6)));
    }
    // occasional jump pad
    if (this.rng.next() < 0.12) {
      const jx = Math.round(this.rng.range(seg.x + seg.w*0.2, seg.x + seg.w*0.8));
      // place pad so its top sits on the platform
      const pad = this.createJumpPad(jx, seg.platformY - 6, this.rng.range(1.0,1.6));
      seg.obstacles.push(pad);
    }
    // coins
    if (this.rng.next() < 0.6) {
      let attempts = 0;
      let placed = false;
      while (attempts < 3 && !placed) {
        attempts++;
        const cx = Math.round(this.rng.range(seg.x + seg.w*0.1, seg.x + seg.w*0.9));
        const coin = this.coinPool.obtain(); coin.x = cx; coin.y = seg.platformY - 40; coin.active = true; coin.collected = false;
        // check if intersects obstacles or spikes
        let intersects = false;
        for (const ob of seg.obstacles) {
          if (ob.type === 'pillar') {
            if (Math.abs(coin.x - ob.x) < (ob.w/2 + coin.size/2) && Math.abs(coin.y - ob.y) < (ob.h/2 + coin.size/2)) {
              intersects = true; break;
            }
          }
        }
        for (const sp of seg.spikes) {
          if (Math.abs(coin.x - sp.x) < (coin.size/2 + sp.w/2)) { intersects = true; break; }
        }
        if (!intersects) { seg.coins.push(coin); placed = true; }
        else { this.coinPool.release(coin); }
      }
    }
    // portals are no longer used
    // enforce conservative constraints to keep segments traversable
    this._enforceSegmentConstraints(seg);
    this.segments.push(seg);
    this.segmentX += seg.w; // use possibly-clamped width
  }
  createGap(x, y) { return { type:'gap', x, y, w: Math.round(this.rng.range(80, 160)) }; }
  createPillar(x, y) { return { type:'pillar', x, y, w:30, h:Math.round(this.rng.range(40,80)) }; }
  createMoving(x, baseY) {
    return { type: 'moving', x, baseY, w: 100, h: 18, amp: Math.round(this.rng.range(20,80)), period: Math.round(this.rng.range(1.2,2.8)), phase: this.rng.next() };
  }
  createJumpPad(x, y, strength=1.0) { return { type: 'jumppad', x, y, w:60, h:12, strength }; }
  createRing(x, y, strength=1.0) { return { type: 'ring', x, y, w:48, h:48, strength, active:true }; }
  // Estimate maximum horizontal distance a player can travel during a full jump arc
  maxJumpDistance() {
    const flightTime = (2 * Math.abs(CONFIG.initialJumpVelocity)) / CONFIG.gravity; // seconds
    // use current map speed as horizontal field speed
    return this.speed * flightTime;
  }

  // Enforce conservative constraints on generated segments so they remain traversable
  _enforceSegmentConstraints(seg) {
    const maxDist = this.maxJumpDistance();
    // clamp any internal gap widths to a fraction of max jump distance
    if (seg.obstacles) {
      for (const ob of seg.obstacles) {
        if (ob.type === 'gap') {
          const cap = Math.max(60, Math.floor(maxDist * 0.85));
          if (ob.w > cap) ob.w = cap;
        }
        if (ob.type === 'pillar') {
          // keep pillar width reasonable relative to maxDist
          ob.w = Math.min(ob.w, Math.max(24, Math.floor(maxDist * 0.15)));
        }
      }
    }
    // ensure segment overall width isn't absurdly large (prevents unreachable spacing)
    const maxSegW = Math.max(300, Math.floor(maxDist * 1.5));
    if (seg.w > maxSegW) seg.w = maxSegW;
    // portal logic removed
    // if (seg.portal) {
    //   seg.portal.x = Math.round(seg.x + Math.min(seg.w * 0.8,  Math.floor(maxDist * 0.6)));
    // }
  }

  // Validate all current segments and return an array of warnings (empty => OK)
  validateAllSegments() {
    const issues = [];
    const maxDist = this.maxJumpDistance();
    for (const s of this.segments) {
      if (s.obstacles) for (const ob of s.obstacles) {
        if (ob.type === 'gap' && ob.w > Math.max(60, Math.floor(maxDist * 0.9))) {
          issues.push({ seg: s, issue: 'gap_too_wide', gap: ob.w, maxAllowed: Math.floor(maxDist * 0.9) });
        }
      }
      if (s.w > Math.max(300, Math.floor(maxDist * 1.5))) issues.push({ seg: s, issue: 'segment_too_wide', width: s.w });
    }
    return issues;
  }

  // Utility: run a quick deterministic sweep of seeds to detect problematic layouts
  static testSeeds(seedStart, count, difficulty='medium') {
    const results = [];
    for (let s = seedStart; s < seedStart + count; s++) {
      const rng = new SeededRandom(s);
      const gen = new MapGenerator(rng, difficulty);
      gen.generateInitial();
      const issues = gen.validateAllSegments();
      if (issues.length) results.push({ seed: s, issues });
    }
    return results;
  }

  // Run tests and optionally attempt automated repairs on failing seeds.
  static selfTestAndRepair(seedStart, count, difficulty='medium', autoRepair=true) {
    const results = [];
    for (let s = seedStart; s < seedStart + count; s++) {
      const rng = new SeededRandom(s);
      const gen = new MapGenerator(rng, difficulty);
      gen.generateInitial();
      let issues = gen.validateAllSegments();
      let repaired = false;
      if (issues.length && autoRepair) {
        gen._repairIssues(issues);
        // run another generation pass with slightly more conservative params
        // (simulate by tightening segment constraints then re-validating)
        gen.segments.forEach(seg=>gen._enforceSegmentConstraints(seg));
        issues = gen.validateAllSegments();
        repaired = issues.length === 0;
      }
      if (issues.length) results.push({ seed: s, issues, repaired });
    }
    return results;
  }
  update(dt, worldSpeed, camX) {
    // spawn more segments ahead
    while (this.segmentX < camX + width*2) this.pushSegment();
    // occasional safety validation of newly spawned content
    const issues = this.validateAllSegments();
    if (issues.length) this._repairIssues(issues);
    // remove off-screen and release pooled objects
    const keep = [];
    for (const s of this.segments) {
      if (s.x + s.w > camX - 200) keep.push(s);
      else {
        // releasing pooled items
        // portals removed
        if (s.coins) for (const c of s.coins) { this.coinPool.release(c); }
      }
    }
    this.segments = keep;
    // progressive speed-up: increase map speed every threshold distance
    this.distanceSinceSpeedUp += worldSpeed * dt;
    const speedUpThreshold = 900; // pixels
    if (this.distanceSinceSpeedUp >= speedUpThreshold) {
      this.distanceSinceSpeedUp -= speedUpThreshold;
      // small deterministic step depending on difficulty
      const step = this.difficulty === 'easy' ? 8 : (this.difficulty === 'hard' ? 20 : 12);
      this.speed = Math.min(this.speedCap, this.speed + step);
    }
  }
  // portal support removed; no safe placement required
  // findSafePortalPlacement(minX) {
  //   return null;
  // }
  generateTutorial() {
    this.segments = [];
    this.segmentX = 0;
    // Simple scripted layout: flat, small gap, pillar, platform (portal removed)
    const pushSeg = (w, py) => { const s = { x: this.segmentX, w: w, platformY: py, obstacles: [], coins: [], spikes: [] }; this.segments.push(s); this.segmentX += w; };
    pushSeg(400, this.worldBottom-40);
    pushSeg(220, this.worldBottom-40);
    // small gap
    const g = { x: this.segmentX, w: 160, platformY: this.worldBottom-40, obstacles: [{ type:'gap', x:this.segmentX+40, y:this.worldBottom-40, w:120 }], coins: [], spikes: [] };
    this.segments.push(g); this.segmentX += g.w;
    pushSeg(360, this.worldBottom-80);
    // portal to flip gravity with safe landing
    // const s2 = { x: this.segmentX, w: 320, platformY: this.worldBottom-40, obstacles: [], coins: [], spikes: [], portal: this.portalPool.obtain() };
    // s2.portal.init('gravity', s2.x + 160, s2.platformY - 40); this.segments.push(s2); this.segmentX += s2.w;
    pushSeg(600, this.worldBottom-40);
  }
  // collision helpers
  // shape is optional; when omitted behaviour is identical to the
  // previous AABB-only version.  Passing 'circle' allows tighter tests so the
  // ball won't die simply because its box grazes a spike or pillar.
  checkLethalCollision(aabb) {
    // simple rectangle intersection for spikes and pillars
    // jump pads and rings are intentionally non‑lethal and thus skipped.
    for (const s of this.segments) {
      // spikes
      if (s.spikes) for (const sp of s.spikes) {
        const bx = sp.x; const bw = sp.w;
        const spikeBox = { x: bx - bw/2, y: sp.side==='floor'? s.platformY : this.worldTop-32, w: bw, h: 32 };
        if (rectsIntersect(aabb, spikeBox)) return true;
      }
      // pillars
      if (s.obstacles) for (const ob of s.obstacles) {
        if (ob.type === 'pillar') {
          const pb = { x: ob.x - ob.w/2, y: ob.y - ob.h/2, w: ob.w, h: ob.h };
          if (rectsIntersect(aabb, pb)) return true;
        }
      }
    }
    return false;
  }
  resolvePlatformCollision(player, runTime=0, prevY) {
    const a = player.getAABB();
    // ground and ceiling
    if (player.gravityDir === 1) {
      if (a.y + a.h >= this.worldBottom) {
        player.y = this.worldBottom - player.height/2;
        return true;
      }
    } else {
      if (a.y <= this.worldTop) {
        player.y = this.worldTop + player.height/2;
        return true;
      }
    }
    // platform surfaces (everything uses the same AABB check)
    for (const s of this.segments) {
      const plat = { x: s.x, y: s.platformY, w: s.w, h: 20 };
      if (rectsIntersect(a, plat)) {
        if (player.gravityDir === 1 && player.vy >= 0) { player.y = s.platformY - player.height/2; return true; }
        else if (player.gravityDir === -1 && player.vy <= 0) { player.y = s.platformY + 20 + player.height/2; return true; }
      }
      // dynamic obstacles
      if (s.obstacles) for (const ob of s.obstacles) {
        // pillars are handled by lethal collision; do not treat as platform
        if (ob.type === 'moving') {
          const phase = (runTime + ob.phase) * (2 * Math.PI) / ob.period;
          const curY = ob.baseY + Math.sin(phase) * ob.amp;
          const mb = { x: ob.x - ob.w/2, y: curY, w: ob.w, h: ob.h };
          if (rectsIntersect(a, mb)) {
            if (player.gravityDir === 1 && player.vy >= 0) { player.y = curY - player.height/2; return true; }
            else if (player.gravityDir === -1 && player.vy <= 0) { player.y = curY + ob.h + player.height/2; return true; }
            // check side clipping
            const obLeft = ob.x - ob.w/2;
            const obRight = ob.x + ob.w/2;
            const playerCenterX = a.x + a.w/2;
            if (playerCenterX < obLeft || playerCenterX > obRight) {
              onPlayerDeath(player);
              return false;
            }
          }
        } else if (ob.type === 'jumppad') {
          const jb = { x: ob.x - ob.w/2, y: ob.y - ob.h/2, w: ob.w, h: ob.h };
          if (rectsIntersect(a, jb)) {
            // only act when the player is grounded; otherwise just pass through
            if (player.grounded) {
              player.vy = CONFIG.initialJumpVelocity * ob.strength * player.gravityDir; // scaled jump
              player.grounded = false;
              // optional jump particles
              // if (this.particlePool) {
              //   if (player.manager && player.manager.particles) player.manager.particles.emit(player.distance, player.y, 12, [255,200,80]);
              // }
              return false; // don't treat pad as a platform after bouncing
            }
            // NOTE: removed side‑clipping fatality for jump pads – they should never kill the player.
          }
        } else if (ob.type === 'ring') {
          const rb = { x: ob.x - ob.w/2, y: ob.y - ob.h/2, w: ob.w, h: ob.h };
          if (rectsIntersect(a, rb)) {
            // ring does not auto-trigger; handled on input. Keep passing through.
          }
        }
      }
    }
    return false;
  }
  onPlayerDeath(player) {
    // originally used for portal cleanup; portals removed.
  }
}

/* ======= Obstacles / Coins / Portal / Particle (minimal classes) ======= */
class Obstacle {
  constructor(){ this.reset(); }
  reset(){ this.x=0;this.y=0;this.w=0;this.h=0;this.active=false; }
}
class Coin {
  constructor(){ this.reset(); }
  reset(){ this.x=0;this.y=0;this.size=12;this.collected=false;this.active=false; }
}
// portals have been removed from the design
// class Portal {
//   constructor(){ this.reset(); }
//   reset(){ this.type=null;this.x=0;this.y=0;this.active=false;this.value=null; }
//   init(type,x,y,value=null){ this.type=type;this.x=x;this.y=y;this.active=true;this.value=value; }
// }
class Particle { constructor(){ this.reset(); } reset(){ this.x=0;this.y=0;this.vx=0;this.vy=0;this.life=0; } }

/* Particle system with pooling */
class ParticleSystem {
  constructor(rng) {
    this.pool = new Pool(()=> new Particle());
    this.active = [];
    this.rng = rng;
  }
  emit(x,y,n=8,col=[255,255,255]){
    for (let i=0;i<n;i++){
      const p = this.pool.obtain();
      const r1 = this.rng.next(); const r2 = this.rng.next();
      p.x = x; p.y = y;
      p.vx = (r1-0.5)*200; p.vy = (r2-0.8)*-200;
      p.life = 0.6 + this.rng.next()*0.4; p.maxLife = p.life; p.col = col; this.active.push(p);
    }
  }
  update(dt){
    for (let i=this.active.length-1;i>=0;i--){
      const p = this.active[i];
      p.life -= dt; if (p.life<=0){ this.pool.release(p); this.active.splice(i,1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 800 * dt; // gravity on particles
    }
  }
  render(camX){
    push(); blendMode(ADD);
    for (const p of this.active){
      const alpha = Math.floor(200 * Math.max(0, Math.min(1, p.life / (p.maxLife || 1))));
      const size = 4 + 8 * (p.life / (p.maxLife || 1));
      noStroke(); fill(p.col[0], p.col[1], p.col[2], alpha);
      ellipse(p.x - camX + width/2, p.y, size);
    }
    pop();
  }
}

/* ======= World / Single shared world wrapper for runs ======= */
class World {
  constructor(map) { this.map = map; this.speed = map.speed; }
  update(dt) { this.speed = this.map.speed; }
  checkLethalCollision(aabb) { return this.map.checkLethalCollision(aabb); }
  // prevY optional for swept circle collisions
  resolvePlatformCollision(player, runTime, prevY) { return this.map.resolvePlatformCollision(player, runTime, prevY); }
  onPlayerDeath(player) {
    // handle world-level death
  }
}

/* ======= UI Rendering (keeps logic out of classes) ======= */
function renderUI(manager) {
  push(); noStroke(); fill(255); textSize(14);
  const pad = 12;
  const scoreX = width - 220; const scoreY = 20;
  // show coins as score and high score (right side)
  const p = manager.players[0];
  if (p) {
    textAlign(LEFT, TOP);
    text('Coins: ' + manager.coins, scoreX, scoreY);
    const hsKey = 'highscore';
    const hs = manager.load(hsKey, 0);
    text('Best: ' + hs, scoreX, scoreY+18);
    text('Time: ' + (millis()/1000).toFixed(1), scoreX, scoreY+36);
    // level / xp bar (left side)
    const barX = 10; // moved further left so entire tube is visible
    const barY = 20;
    const barW = 120;
    const barH = 16;
    // label above bar
    textSize(14);
    textAlign(LEFT, CENTER);
    const lvl = (manager.level != null ? manager.level : 0);
    text('Level ' + lvl, barX, barY - barH/2 - 4);
    // draw tube-shaped bar
    stroke(255);
    noFill();
    rect(barX, barY, barW, barH, barH/2);
    fill(0,200,120);
    let xpNext = manager.xpToNextLevel();
    if (!xpNext || isNaN(xpNext)) xpNext = 1.0;
    const xpVal = (manager.xp!=null && !isNaN(manager.xp)) ? manager.xp : 0;
    const pct = xpNext ? constrain(xpVal / xpNext, 0, 1) : 0;
    // filled portion as a narrower pill
    rect(barX, barY, barW * pct, barH, barH/2);
    // optional text inside bar
    textSize(12);
    textAlign(CENTER, CENTER);
    text(Math.floor(xpVal*100)/100 + '/' + xpNext, barX + barW/2, barY + barH/2);
  }
  pop();

  // level-up indicator text (fades over timer)
  if (manager.levelUpTimer > 0) {
    const t = manager.levelUpTimer / 2.0;
    const alpha = 255 * t;
    // simple scale pulse as timer decreases
    const scaleAmt = 1 + 0.5 * Math.sin((1 - t) * Math.PI);
    // outer ring
    push();
    noFill();
    stroke(255,235,0, alpha);
    strokeWeight(4);
    const size = 200 * scaleAmt;
    ellipse(width/2, height/2, size, size);
    pop();
    // text
    push(); textSize(32 * scaleAmt); textAlign(CENTER, CENTER);
    fill(255,235,0, alpha);
    text('LEVEL UP!', width/2, height/2);
    pop();
  }
}