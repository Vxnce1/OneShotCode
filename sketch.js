// Flux Runner - single-file p5.js implementation
// Author: Generated to spec. Uses p5.js and p5.sound only.

/* ======= Configuration & Constants ======= */
const CONFIG = {
  canvasPadding: 20,
  clampDeltaMs: 50,
  gravity: 2200, // px/s^2 (positive = downwards)
  desiredMaxJumpHeight: 160, // px (used to compute initial jump velocity)
  terminalVelocity: 2000, // px/s
  baseSpeed: { easy: 280, medium: 360, hard: 480 }, // px/s
  speedCap: { easy: 420, medium: 600, hard: 900 },
  bpm: 140,
  beatPulse: 0.06,
  coyoteTimeMs: 100,
  inputBufferMs: 100,
  pauseDebounceMs: 200,
};

// Derived constants
CONFIG.initialJumpVelocity = Math.sqrt(2 * CONFIG.gravity * CONFIG.desiredMaxJumpHeight) * -1; // negative vy to go up
CONFIG.maxJumpHeight = CONFIG.desiredMaxJumpHeight;

/* ======= Seeded RNG (deterministic) ======= */
class SeededRandom {
  constructor(seed) {
    this.seed = seed >>> 0;
    this.state = this.seed;
  }
  next() {
    // mulberry32
    let t = (this.state += 0x6D2B79F5) >>> 0;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a, b) { return a + this.next() * (b - a); }
  choice(arr) { return arr[Math.floor(this.next() * arr.length)]; }
}

/* ======= Object Pooling ======= */
class Pool {
  constructor(createFn) {
    this.createFn = createFn;
    this.items = [];
  }
  obtain() {
    if (this.items.length) return this.items.pop();
    return this.createFn();
  }
  release(obj) {
    if (obj.reset) obj.reset();
    this.items.push(obj);
  }
}

/* ======= Utility Helpers ======= */
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function nowMs() { return performance.now(); }
function rectsIntersect(a,b){
  return !(a.x + a.w < b.x || a.x > b.x + b.w || a.y + a.h < b.y || a.y > b.y + b.h);
}

/* ======= Core Game State Manager ======= */
const STATES = {
  LOADING: 'LOADING', MENU: 'MENU', SHOP: 'SHOP', CUSTOMIZE: 'CUSTOMIZE', TUTORIAL: 'TUTORIAL', SETTINGS: 'SETTINGS',
  PLAYING_SINGLE: 'PLAYING_SINGLE', PLAYING_MULTI: 'PLAYING_MULTI', PAUSED: 'PAUSED', GAMEOVER: 'GAMEOVER'
};

class GameManager {
  constructor() {
    this.state = STATES.LOADING;
    this.nextState = null;
    this.players = [];
    this.seed = 1; // replaced at run start; avoid Math.random usage
    this.rng = new SeededRandom(this.seed);
    this.difficulty = this.load('difficulty', 'medium');
    this.volume = this.load('volume', 0.8);
    this.saveKeyPrefix = 'fluxrunner_';
    this.coins = this.load('coins', 0);
    this.purchasedShapes = this.load('purchasedShapes', ['square']);
    this.selectedShape = this.load('selectedShape', 'square');
    this.selectedColor = this.load('selectedColor', [0,255,200]);
    this.pendingPurchase = null;
    this.setupAudio();
    this.clearTransient();
    this.particles = new ParticleSystem(this.rng);
    this.shakeTimer = 0;
    this.deathPending = false;
    this.pendingDeathPlayer = null;
    this.ripples = [];
  }

  addCoins(n) { this.coins = (this.coins||0) + n; this.save('coins', this.coins); }

  buyShape(name, price) {
    if (this.purchasedShapes.indexOf(name) !== -1) return false;
    if (this.coins < price) return false;
    this.coins -= price; this.save('coins', this.coins);
    this.purchasedShapes.push(name); this.save('purchasedShapes', this.purchasedShapes);
    return true;
  }
  equipShape(name) {
    if (this.purchasedShapes.indexOf(name) === -1) return false;
    this.selectedShape = name; this.save('selectedShape', name); return true;
  }
  pickColor(col) { this.selectedColor = col; this.save('selectedColor', col); }
  clearTransient() {
    this.inputBuffer = {};
    this.groundedFlags = [false, false];
    this.timers = [];
  }
  changeState(newState) {
    this.state = newState;
    this.clearTransient();
    if (newState === STATES.LOADING) {
      /* nothing */
    }
    // clear player transient inputs and grounded flags
    if (this.players) for (const p of this.players) {
      if (p) { p.inputBufferUntil = -9999; p.coyoteUntil = -9999; p.grounded = false; }
    }
  }
  setupAudio() {
    this.audio = new RhythmAudio(CONFIG.bpm, this.volume);
  }
  setDifficulty(d) { this.difficulty = d; this.save('difficulty', d); }
  startSingle() {
    this.seed = (Date.now() & 0xffffffff) ^ 0xdeadbeef;
    this.rng = new SeededRandom(this.seed);
    this.players = [new Player(0,this)];
    this.players.forEach(p=>p.resetForRun());
    this.map = new MapGenerator(this.rng, this.difficulty);
    this.audio.start();
    this.runTime = 0;
    this.slowMotion = 0;
    this.changeState(STATES.PLAYING_SINGLE);
  }
  startMulti() {
    this.seed = (Date.now() & 0xffffffff) ^ 0xabcdef01;
    this.rng = new SeededRandom(this.seed);
    this.players = [new Player(0,this), new Player(1,this)];
    this.players.forEach(p=>p.resetForRun());
    this.map = new MapGenerator(this.rng, this.difficulty);
    this.audio.start();
    this.runTime = 0;
    this.slowMotion = 0;
    this.changeState(STATES.PLAYING_MULTI);
  }
  startTutorial() {
    this.seed = 0x12345678;
    this.rng = new SeededRandom(this.seed);
    this.players = [new Player(0,this)];
    this.players.forEach(p=>p.resetForRun());
    this.map = new MapGenerator(this.rng, this.difficulty);
    this.map.generateTutorial();
    this.audio.start();
    this.runTime = 0; this.slowMotion = 0;
    this.changeState(STATES.TUTORIAL);
  }

  addCoins(n) { this.coins = (this.coins||0) + n; this.save('coins', this.coins); }
  pauseToggle() {
    if (this.state === STATES.PLAYING_SINGLE || this.state === STATES.PLAYING_MULTI) {
      this.prevState = this.state;
      this.changeState(STATES.PAUSED);
      this.audio.pause();
    } else if (this.state === STATES.PAUSED) {
      this.changeState(this.prevState || STATES.PLAYING_SINGLE);
      this.audio.resume();
    }
  }
  save(key, val) { try { localStorage.setItem(this.saveKeyPrefix+key, JSON.stringify(val)); } catch(e){} }
  load(key, def) { try { const v = localStorage.getItem(this.saveKeyPrefix+key); return v?JSON.parse(v):def; } catch(e){return def;} }
  // Persist core settings and progress
  saveAll() {
    try {
      this.save('coins', this.coins);
      this.save('purchasedShapes', this.purchasedShapes);
      this.save('selectedShape', this.selectedShape);
      this.save('selectedColor', this.selectedColor);
      this.save('volume', this.volume);
      this.save('difficulty', this.difficulty);
    } catch(e) { /* ignore storage errors */ }
  }
}

/* ======= Rhythm Audio (synth loop) ======= */
class RhythmAudio {
  constructor(bpm, initialVolume=0.8) {
    this.bpm = bpm;
    this.beatInterval = 60 / bpm;
    this.isPlaying = false;
    this.volume = initialVolume;
    this.nextTime = 0;
    this.kick = null; this.hat = null; this.amp = null;
    this.lastBeat = 0; // audio context time of last triggered beat
  }
  initSynth() {
    if (this.kick) return;
    this.kick = new p5.Oscillator('sine');
    this.kick.amp(0);
    this.kick.freq(100);
    this.kick.start();
    this.hat = new p5.Noise('white');
    this.hat.amp(0);
    this.hat.start();
    this.amp = new p5.Gain();
    this.amp.amp(this.volume);
    this.kick.disconnect(); this.hat.disconnect();
    this.kick.connect(this.amp); this.hat.connect(this.amp); this.amp.connect();
  }
  start() {
    userStartAudio();
    this.initSynth();
    this.isPlaying = true;
    this.nextTime = getAudioContext().currentTime + 0.05;
  }
  pause() { this.isPlaying = false; }
  resume() { this.isPlaying = true; }
  restart() { this.stop(); this.start(); }
  stop() { this.isPlaying = false; }
  setVolume(v) { this.volume = v; if (this.amp) this.amp.amp(v); }
  update(dt) {
    if (!this.isPlaying) return;
    const ctx = getAudioContext();
    while (this.nextTime <= ctx.currentTime + 0.05) {
      this.triggerBeat(this.nextTime);
      this.nextTime += this.beatInterval * 0.5; // hi-hat on off-beats too
    }
  }
  triggerBeat(time) {
    // simple kick every other tick
    const ctx = getAudioContext();
    const t = time;
    // kick on even beats
    const beatIndex = Math.round((time / this.beatInterval));
    if (beatIndex % 2 === 0) {
      this.kick.freq(80);
      this.kick.amp(0.8, 0.001, t);
      this.kick.amp(0, 0.18, t + 0.03);
    } else {
      // softer click
      this.kick.freq(140);
      this.kick.amp(0.25, 0.001, t);
      this.kick.amp(0, 0.06, t + 0.02);
    }
    // hat
    this.hat.amp(0.08, 0.001, t);
    this.hat.amp(0, 0.06, t + 0.02);
    // record beat time for visuals
    this.lastBeat = time;
  }
}

/* ======= Player ======= */
class Player {
  constructor(index, manager) {
    this.index = index;
    this.manager = manager;
    this.reset();
  }
  reset() {
    this.x = 0; // world-relative x, but player rendered at center
    this.y = 0;
    this.vy = 0;
    this.width = 40; this.height = 40;
    this.grounded = false;
    this.gravityDir = 1; // 1 down, -1 up
    this.rotation = 0;
    this.shape = 'square';
    this.color = [0,255,200];
    this.lastJumpTime = -9999;
    this.inputBufferUntil = -9999; // seconds
    this.coyoteUntil = -9999; // seconds
    this.score = 0;
    this.alive = true;
    this.distance = 0;
    this.queuedPortal = null; // portal queued to apply at start of next physics step
    this.trailTimer = 0;
  }
  resetForRun() { this.reset(); this.y = height - 120; if (this.manager) { this.shape = this.manager.selectedShape || this.shape; this.color = this.manager.selectedColor || this.color; this.distance = 0; this.alive = true; } }
  applyGravity(dt) {
    const g = CONFIG.gravity * this.gravityDir;
    this.vy += g * dt;
    this.vy = clamp(this.vy, -CONFIG.terminalVelocity, CONFIG.terminalVelocity);
  }
  attemptJump(tNow) {
    if (!this.alive) return false;
    if (tNow <= this.inputBufferUntil) {
      // buffered in time window
    }
    const canCoyote = tNow <= this.coyoteUntil;
    if (this.grounded || canCoyote) {
      this.vy = CONFIG.initialJumpVelocity * this.gravityDir; // sign with gravity
      this.grounded = false;
      this.lastJumpTime = tNow;
      // rotation on jump for square and x shapes
      if (this.shape === 'square' || this.shape === 'x') {
        const dir = this.gravityDir === 1 ? 1 : -1;
        this.rotation += 90 * dir;
      }
      // emit jump particles
      // if (this.manager && this.manager.particles) this.manager.particles.emit(this.distance, this.y, 8, this.color);
      return true;
    }
    return false;
  }
  update(dt, tNow, world) {
    if (!this.alive) return;
    // Apply queued portal effects at start of physics step
    if (this.queuedPortal) {
      const p = this.queuedPortal;
      if (p.type === 'gravity') {
        this.gravityDir *= -1;
      } else if (p.type === 'speed') {
        world.map.speed = clamp(p.value, world.map.speed, world.map.speed);
      }
      this.queuedPortal = null;
    }
    // physics order: apply gravity, update pos, collision detection, trigger death before correction
    this.applyGravity(dt);
    // vertical sweep to avoid tunneling
    const steps = Math.max(1, Math.ceil(Math.abs(this.vy*dt) / 10));
    const stepDt = dt / steps;
    const wasGrounded = this.grounded;
    for (let s=0;s<steps;s++) {
      this.y += this.vy * stepDt;
      // collision check with obstacles and spikes
      const lethal = world.checkLethalCollision(this.getAABB());
      if (lethal) {
        // freeze physics immediately, trigger death visuals
        this.alive = false;
        world.onPlayerDeath(this);
        return;
      }
      // resolve platforms landing only if no lethal
      const landed = world.resolvePlatformCollision(this, tNow);
      if (landed) {
        this.grounded = true;
        this.vy = 0;
        // reset coyote window (will only be used when walking off)
        this.coyoteUntil = -9999;
        // landing particles (only when falling into landing)
        // if (this.manager && this.manager.particles && !wasGrounded) this.manager.particles.emit(this.distance, this.y+4, 12, [150,220,255]);
        // if (this.manager && this.manager.ripples && !wasGrounded) this.manager.ripples.push({ x: this.distance, y: this.y+6, time: 0, life: 0.6, maxR: 120 });
      } else {
        // if we just left the ground, start coyote window
        if (wasGrounded) this.coyoteUntil = tNow + (CONFIG.coyoteTimeMs/1000);
        this.grounded = false;
      }
    }
    // check if fallen off the map
    if (this.y > height + 50 || this.y < -50) {
      this.alive = false;
      world.onPlayerDeath(this);
      return;
    }
    // update distance
    this.distance += world.speed * dt;
    // if we landed and have an input buffered, trigger jump
    if (this.grounded && (tNow <= this.inputBufferUntil)) {
      this.attemptJump(tNow);
      this.inputBufferUntil = -9999;
    }
    // smooth rotation when grounded
    if (this.grounded) {
      this.rotation *= 0.6;
      if (Math.abs(this.rotation) < 0.5) this.rotation = 0;
    }
    // trail particles
    // this.trailTimer = (this.trailTimer || 0) + dt;
    // if (this.trailTimer > 0.06) {
    //   this.trailTimer = 0;
    //   if (this.manager && this.manager.particles) this.manager.particles.emit(this.distance - 6, this.y, 1, this.color);
    // }
  }
  getAABB() {
    // 2% forgiveness shrink
    const shw = this.width * 0.02; const shh = this.height * 0.02;
    // use world-relative horizontal position: distance
    const worldX = (this.distance || 0);
    return { x: worldX - this.width/2 + shw, y: this.y - this.height/2 + shh, w: this.width - shw*2, h: this.height - shh*2 };
  }
  render(cx, centerX, centerY, opacity=1) {
    push(); translate(centerX, this.y);
    // beat-synced glow
    try {
      let beatStrength = 0;
      if (this.manager && this.manager.audio && this.manager.audio.lastBeat) {
        const age = getAudioContext().currentTime - this.manager.audio.lastBeat;
        const pulseDur = 0.18;
        beatStrength = clamp(1 - age / pulseDur, 0, 1);
      }
      const phasePulse = (globalManager && globalManager.beatPhase) ? (0.35 + 0.65 * Math.abs(Math.sin(globalManager.beatPhase * Math.PI * 2))) : 0.5;
      const glow = clamp(beatStrength * 0.9 + phasePulse * 0.08, 0, 1) * opacity;
      noStroke(); fill(this.color[0], this.color[1], this.color[2], Math.floor(120 * glow)); ellipse(0,0,this.width*1.8, this.height*1.8);
    } catch(e) {}
    rotate(radians(this.rotation));
    noFill(); stroke(255); strokeWeight(2);
    fill(this.color[0], this.color[1], this.color[2], 220*opacity);
    if (this.shape === 'circle') ellipse(0,0,this.width,this.height);
    else if (this.shape === 'square') rectMode(CENTER), rect(0,0,this.width,this.height);
    else if (this.shape === 'x') { // X drawn as rotated square
      rectMode(CENTER); push(); rotate(PI/4); rect(0,0,this.width,this.height); pop();
    }
    pop();
  }
}

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
    this.portalPool = new Pool(()=> new Portal());
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
    const seg = { x: this.segmentX, w: segWidth, platformY, obstacles: [], coins: [], spikes: [], portal: null };
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
    // coins
    if (this.rng.next() < 0.6) {
      const cx = Math.round(this.rng.range(seg.x + seg.w*0.1, seg.x + seg.w*0.9));
      const coin = this.coinPool.obtain(); coin.x = cx; coin.y = seg.platformY - 40; coin.active = true; coin.collected = false;
      // check if intersects obstacles
      let intersects = false;
      for (const ob of seg.obstacles) {
        if (ob.type === 'pillar' && Math.abs(coin.x - ob.x) < 30 && Math.abs(coin.y - ob.y) < 40) { intersects = true; break; }
      }
      if (!intersects) seg.coins.push(coin);
      else this.coinPool.release(coin);
    }
    // portals (gravity or speed)
    // if (this.rng.next() < 0.08) {
    //   seg.portal = this.portalPool.obtain();
    //   if (this.rng.next() < 0.6) seg.portal.init('gravity', Math.round(seg.x + seg.w*0.7), platformY - 40);
    //   else seg.portal.init('speed', Math.round(seg.x + seg.w*0.7), platformY - 40, this.rng.choice([this.speed*1.25, this.speed*0.75]));
    // }
    // enforce conservative constraints to keep segments traversable
    this._enforceSegmentConstraints(seg);
    this.segments.push(seg);
    this.segmentX += seg.w; // use possibly-clamped width
  }
  createGap(x, y) { return { type:'gap', x, y, w: Math.round(this.rng.range(80, 160)) }; }
  createPillar(x, y) { return { type:'pillar', x, y, w:30, h:Math.round(this.rng.range(40,100)) }; }
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
    // if a portal exists, ensure there's a nearby landing platform ahead
    if (seg.portal) {
      // if next segments exist, attach portal to a shorter offset within this segment
      seg.portal.x = Math.round(seg.x + Math.min(seg.w * 0.8,  Math.floor(maxDist * 0.6)));
    }
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
        if (s.portal) { this.portalPool.release(s.portal); s.portal = null; }
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
  // find safe placement for a portal after minX; returns {seg, x} or null
  findSafePortalPlacement(minX) {
    // stricter rules: choose a segment sufficiently ahead with a solid landing area
    const minSegWidth = 180;
    const centerClear = 120; // px from center to check for spikes/gaps
    for (let i=0;i<this.segments.length;i++) {
      const s = this.segments[i];
      if (s.x <= minX) continue;
      if (s.w < minSegWidth) continue;
      const centerX = s.x + s.w*0.5;
      // avoid spikes near center and avoid gap obstacles overlapping center
      let bad = false;
      if (s.spikes) for (const sp of s.spikes) { if (Math.abs(sp.x - centerX) < centerClear) bad = true; }
      if (s.obstacles) for (const ob of s.obstacles) { if (ob.type === 'gap' && Math.abs(ob.x - centerX) < centerClear) bad = true; }
      if (bad) continue;
      // ensure next segment exists and is not dramatically higher/lower
      const next = this.segments[i+1];
      if (next) {
        if (Math.abs(next.platformY - s.platformY) > 120) continue;
        // ensure next platform has some width to land on
        if (next.w < 120) continue;
      }
      // chosen: place portal near segment center but slightly inset
      const placeX = Math.round(s.x + Math.max(40, Math.min(s.w*0.6, s.w*0.5)));
      return { seg: s, x: placeX };
    }
    // fallback: use last segment center if nothing suitable found
    const last = this.segments[this.segments.length-1];
    if (last) return { seg: last, x: Math.round(last.x + last.w*0.5) };
    return null;
  }
  generateTutorial() {
    this.segments = [];
    this.segmentX = 0;
    // Simple scripted layout: flat, small gap, pillar, platform, portal safe zone
    const pushSeg = (w, py) => { const s = { x: this.segmentX, w: w, platformY: py, obstacles: [], coins: [], spikes: [], portal: null }; this.segments.push(s); this.segmentX += w; };
    pushSeg(400, this.worldBottom-40);
    pushSeg(220, this.worldBottom-40);
    // small gap
    const g = { x: this.segmentX, w: 160, platformY: this.worldBottom-40, obstacles: [{ type:'gap', x:this.segmentX+40, y:this.worldBottom-40, w:120 }], coins: [], spikes: [], portal: null };
    this.segments.push(g); this.segmentX += g.w;
    pushSeg(360, this.worldBottom-80);
    // portal to flip gravity with safe landing
    // const s2 = { x: this.segmentX, w: 320, platformY: this.worldBottom-40, obstacles: [], coins: [], spikes: [], portal: this.portalPool.obtain() };
    // s2.portal.init('gravity', s2.x + 160, s2.platformY - 40); this.segments.push(s2); this.segmentX += s2.w;
    pushSeg(600, this.worldBottom-40);
  }
  // collision helpers
  checkLethalCollision(aabb) {
    // check spikes and pillar collisions
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
  resolvePlatformCollision(player, runTime=0) {
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
    // platform surfaces
    for (const s of this.segments) {
      const plat = { x: s.x, y: s.platformY, w: s.w, h: 20 };
      if (rectsIntersect(a, plat)) {
        if (player.gravityDir === 1 && player.vy >= 0) { player.y = s.platformY - player.height/2; return true; }
        else if (player.gravityDir === -1 && player.vy <= 0) { player.y = s.platformY + 20 + player.height/2; return true; }
        // if intersecting but not landing, check if clipping through side
        const platLeft = plat.x - plat.w/2;
        const platRight = plat.x + plat.w/2;
        const playerCenterX = a.x + a.w/2;
        if (playerCenterX < platLeft || playerCenterX > platRight) {
          // clipping through side, trigger death
          this.onPlayerDeath(player);
          return false;
        }
      }
      // dynamic obstacles
      if (s.obstacles) for (const ob of s.obstacles) {
        if (ob.type === 'pillar') {
          const pb = { x: ob.x - ob.w/2, y: ob.y - ob.h/2, w: ob.w, h: ob.h };
          if (rectsIntersect(a, pb)) return true;
        } else if (ob.type === 'moving') {
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
              this.onPlayerDeath(player);
              return false;
            }
          }
        } else if (ob.type === 'jumppad') {
          const jb = { x: ob.x - ob.w/2, y: ob.y - ob.h/2, w: ob.w, h: ob.h };
          if (rectsIntersect(a, jb)) {
            // apply auto-trigger once when overlapping and grounded
            if (player.grounded) {
              player.vy = CONFIG.initialJumpVelocity * ob.strength * player.gravityDir; // scaled jump
              player.grounded = false;
              // if (this.particlePool) {
              //   // find manager particles via player.manager
              //   if (player.manager && player.manager.particles) player.manager.particles.emit(player.distance, player.y, 12, [255,200,80]);
              // }
              return false; // don't treat as platform
            }
            // check side clipping
            const obLeft = ob.x - ob.w/2;
            const obRight = ob.x + ob.w/2;
            const playerCenterX = a.x + a.w/2;
            if (playerCenterX < obLeft || playerCenterX > obRight) {
              this.onPlayerDeath(player);
              return false;
            }
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
    // release portals
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
class Portal {
  constructor(){ this.reset(); }
  reset(){ this.type=null;this.x=0;this.y=0;this.active=false;this.value=null; }
  init(type,x,y,value=null){ this.type=type;this.x=x;this.y=y;this.active=true;this.value=value; }
}
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
  resolvePlatformCollision(player, runTime) { return this.map.resolvePlatformCollision(player, runTime); }
  onPlayerDeath(player) {
    // handle world-level death
  }
}

/* ======= UI Rendering (keeps logic out of classes) ======= */
function renderUI(manager) {
  push(); noStroke(); fill(255); textSize(14);
  const pad = 12;
  const scoreX = width - 220; const scoreY = 20;
  // show score and high score
  const p = manager.players[0];
  if (p) {
    textAlign(LEFT, TOP);
    text('Score: ' + Math.floor(p.distance), scoreX, scoreY);
    const hs = manager.load('highscore', 0);
    text('High: ' + hs, scoreX, scoreY+18);
    text('Time: ' + (millis()/1000).toFixed(1), scoreX, scoreY+36);
  }
  pop();
}

/* ======= Input Handling ======= */
let globalManager;
function keyPressed() {
  if (!globalManager) return;
  if (key === ' ') {
    if (globalManager.state === STATES.PLAYING_SINGLE || globalManager.state === STATES.TUTORIAL) {
      const tNow = globalManager.runTime; if (!globalManager.players[0].attemptJump(tNow)) globalManager.players[0].inputBufferUntil = tNow + (CONFIG.inputBufferMs/1000);
    }
  }
  if (key === 'W' || key === 'w') {
    if (globalManager.state === STATES.PLAYING_SINGLE || globalManager.state === STATES.TUTORIAL) {
      const tNow = globalManager.runTime; if (!globalManager.players[0].attemptJump(tNow)) globalManager.players[0].inputBufferUntil = tNow + (CONFIG.inputBufferMs/1000);
    } else if (globalManager.state === STATES.PLAYING_MULTI) {
      const tNow = globalManager.runTime; if (!globalManager.players[0].attemptJump(tNow)) globalManager.players[0].inputBufferUntil = tNow + (CONFIG.inputBufferMs/1000);
    }
  }
  // Check jump-rings when pressing jump: if overlapping, apply ring strength
  if (globalManager.state === STATES.PLAYING_SINGLE || globalManager.state === STATES.PLAYING_MULTI) {
    for (const p of globalManager.players) {
      if (!p.alive) continue;
      const map = globalManager.map;
      if (!map) continue;
      for (const s of map.segments) {
        if (!s.obstacles) continue;
        for (const ob of s.obstacles) {
          if (ob.type === 'ring' && ob.active) {
            const ringBox = { x: ob.x - ob.w/2, y: ob.y - ob.h/2, w: ob.w, h: ob.h };
            if (rectsIntersect(p.getAABB(), ringBox)) {
              p.vy = CONFIG.initialJumpVelocity * ob.strength * p.gravityDir;
              ob.active = false;
              // if (globalManager.particles) globalManager.particles.emit(p.distance, p.y, 12, [255,255,90]);
            }
          }
        }
      }
    }
  }
  if (keyCode === UP_ARROW) {
    if (globalManager.state === STATES.PLAYING_MULTI) {
      const tNow = globalManager.runTime; if (!globalManager.players[1].attemptJump(tNow)) globalManager.players[1].inputBufferUntil = tNow + (CONFIG.inputBufferMs/1000);
    }
  }
  if (key === 'P' || key === 'p') globalManager.pauseToggle();
  if (keyCode === ENTER) {
    if (globalManager.state === STATES.MENU) globalManager.startSingle();
    else if (globalManager.state === STATES.GAMEOVER) globalManager.startSingle();
  }
  if (key === '2') {
    if (globalManager.state === STATES.MENU) globalManager.startMulti();
  }
  if (key === 'M' || key === 'm') {
    globalManager.changeState(STATES.MENU);
  }
  if ((key === 'D' || key === 'd') && globalManager.state === STATES.MENU) {
    // run a deterministic seed sweep (non-blocking for small counts)
    const start = 1; const count = 200;
    try {
      const bad = MapGenerator.testSeeds(start, count, globalManager.difficulty);
      globalManager.debugTestResults = bad;
      console.log('MapGenerator.testSeeds result:', bad.length, 'bad seeds (sample):', bad.slice(0,6));
    } catch(e) { console.warn('Seed test failed', e); globalManager.debugTestResults = [{ error: String(e) }]; }
  }
  if ((key === 'S' || key === 's') && globalManager.state === STATES.MENU) {
    globalManager.changeState(STATES.SETTINGS);
  }
  if (key === 'T' || key === 't') {
    if (globalManager.state === STATES.MENU) globalManager.startTutorial();
  }
}

/* ======= p5.js sketch ======= */
let canvas;
function setup() {
  const container = document.getElementById('game-container');
  canvas = createCanvas(windowWidth, windowHeight);
  canvas.parent(container);
  // high-DPI support
  try { pixelDensity(Math.min(2, window.devicePixelRatio || 1)); } catch(e) {}
  // auto-save on window close or reload
  window.addEventListener('beforeunload', ()=>{ try { if (globalManager) globalManager.saveAll(); } catch(e){} });
  // optional developer auto-seed-test (set window.AUTO_SEED_TEST = true in console to run)
  if (window.AUTO_SEED_TEST) {
    try {
      globalManager = new GameManager();
      const bad = MapGenerator.selfTestAndRepair(1, 500, globalManager.difficulty, true);
      globalManager.debugTestResults = bad;
      console.log('AUTO_SEED_TEST: self-test-and-repair found', bad.length, 'seeds still with issues (after repair). Sample:', bad.slice(0,8));
    } catch(e) { console.warn('AUTO_SEED_TEST failed', e); }
  }
  rectMode(CENTER); ellipseMode(CENTER); angleMode(DEGREES);
  textFont('Arial');
  globalManager = new GameManager();
  // prepare menu state
  globalManager.changeState(STATES.MENU);
  // volume slider (hidden during gameplay)
  window.volumeSlider = createSlider(0,1,globalManager.volume,0.01);
  volumeSlider.position(width-220,16);
  volumeSlider.style('z-index','9999');
  volumeSlider.input(()=>{ globalManager.volume = parseFloat(volumeSlider.value()); globalManager.audio.setVolume(globalManager.volume); globalManager.save('volume', globalManager.volume); });
  volumeSlider.hide();
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  // adjust world bounds
  if (window.volumeSlider) volumeSlider.position(width-220,16);
  // update map/world bounds and clamp players to new bounds
  try {
    if (globalManager && globalManager.map) globalManager.map.recalcBounds();
    if (globalManager && globalManager.players) {
      for (const p of globalManager.players) {
        if (!p) continue;
        // clamp player Y into new world bounds
        const minY = globalManager.map ? globalManager.map.worldTop + p.height/2 : p.height/2;
        const maxY = globalManager.map ? globalManager.map.worldBottom - p.height/2 : height - p.height/2;
        p.y = clamp(p.y, minY, maxY);
      }
    }
  } catch(e) {}
}

let lastMs = 0;
function draw() {
  // clamp deltaTime
  let rawDt = deltaTime; if (rawDt > CONFIG.clampDeltaMs) rawDt = CONFIG.clampDeltaMs;
  const dt = rawDt / 1000; // seconds

  background(8,8,16);
  // background gradient
  for (let y=0;y<height;y+=4) {
    const t = y/height; stroke(6+Math.floor(80*t),0,40+Math.floor(120*t)); line(0,y,width,y);
  }

  // state handling
  if (globalManager.state === STATES.MENU) {
    if (window.resumeButton) window.resumeButton.hide();
    if (window.restartButton) window.restartButton.hide();
    if (window.menuButton) window.menuButton.hide();
    if (window.restartGameOverButton) window.restartGameOverButton.hide();
    if (window.menuGameOverButton) window.menuGameOverButton.hide();
    drawMenu();
    if (window.volumeSlider) volumeSlider.show();
  } else if (globalManager.state === STATES.PLAYING_SINGLE || globalManager.state === STATES.PLAYING_MULTI || globalManager.state === STATES.TUTORIAL) {
    if (window.resumeButton) window.resumeButton.hide();
    if (window.restartButton) window.restartButton.hide();
    if (window.menuButton) window.menuButton.hide();
    if (window.restartGameOverButton) window.restartGameOverButton.hide();
    if (window.menuGameOverButton) window.menuGameOverButton.hide();
    if (window.volumeSlider) volumeSlider.hide();
    // update audio
    globalManager.audio.update(dt);
    if (window.volumeSlider) volumeSlider.hide();
    // advance run time
    globalManager.runTime += dt;
    // beat phase (0..1)
    const beatInterval = 60 / CONFIG.bpm;
    globalManager.beatPhase = (globalManager.runTime % beatInterval) / beatInterval;
    // beat visual pulse using audio's last beat timestamp (if available)
    try {
      if (globalManager.audio && globalManager.audio.lastBeat) {
        const ctx = getAudioContext();
        const age = ctx.currentTime - globalManager.audio.lastBeat;
        const pulseDur = 0.18; // seconds
        const strength = clamp(1 - age / pulseDur, 0, 1);
        if (strength > 0) {
          noStroke(); fill(0, 200, 255, Math.floor(strength * CONFIG.beatPulse * 255));
          rect(0,0,width,height);
        }
      }
    } catch(e) { /* audio not ready, ignore */ }
    // update particles
    if (globalManager.particles) globalManager.particles.update(dt);
    // update map & players
    if (!globalManager.map) globalManager.map = new MapGenerator(globalManager.rng, globalManager.difficulty);
    globalManager.map.recalcBounds();
    const camX = globalManager.players[0].distance || 0;
    globalManager.map.update(dt, globalManager.map.speed, camX);
    // decrease shake timer
    if (globalManager.shakeTimer > 0) globalManager.shakeTimer = Math.max(0, globalManager.shakeTimer - dt);
    // handle slow-motion death pending
    // if (globalManager.deathPending) {
    //   globalManager.slowMotion = Math.max(0, globalManager.slowMotion - dt);
    //   if (globalManager.slowMotion <= 0) {
    //     // finalize game over and save score
    //     const player = globalManager.pendingDeathPlayer;
    //     const score = globalManager.coins;
    //     if (globalManager.state === STATES.PLAYING_MULTI) {
    //       const key = 'highscore_multi';
    //       const cur = globalManager.load(key, 0);
    //       if (score > cur) globalManager.save(key, score);
    //     } else {
    //       const key = 'highscore';
    //       const cur = globalManager.load(key, 0);
    //       if (score > cur) globalManager.save(key, score);
    //     }
    //     globalManager.deathPending = false; globalManager.pendingDeathPlayer = null;
    //     globalManager.changeState(STATES.GAMEOVER);
    //   }
    // }
    // world wrapper
    const world = { checkLethalCollision: (a)=>globalManager.map.checkLethalCollision(a), resolvePlatformCollision: (p)=>globalManager.map.resolvePlatformCollision(p), speed: globalManager.map.speed, onPlayerDeath: (p)=>onPlayerDeath(p)};
    // update players
    const tNow = globalManager.runTime;
    for (let i=0;i<globalManager.players.length;i++) {
      const p = globalManager.players[i];
      if (!p.alive) continue;
      p.update(dt, tNow, globalManager.map);
    }
    // tutorial completion check
    if (globalManager.state === STATES.TUTORIAL) {
      const p0 = globalManager.players[0];
      if (p0 && p0.distance > (globalManager.map.segmentX - 80)) {
        globalManager.save('tutorialComplete', true);
        globalManager.changeState(STATES.MENU);
      }
    }
    // render world (single or split-screen)
    if (globalManager.state === STATES.PLAYING_MULTI) {
      const halfH = height/2;
      for (let i=0;i<2;i++) {
        const p = globalManager.players[i];
        push();
        translate(0, i*halfH);
        // screen shake for world layer
        const shakeX = Math.sin(globalManager.runTime * 60 + i) * (globalManager.shakeTimer*6);
        const shakeY = Math.cos(globalManager.runTime * 70 + i) * (globalManager.shakeTimer*3);
        translate(shakeX, shakeY);
        // background for half with subtle beat pulse
        noStroke(); fill(6,8,20); rectMode(CORNER); rect(0,0,width,halfH);
        // const pulse = 0.06 * (0.5 + 0.5 * Math.sin(globalManager.beatPhase * Math.PI * 2));
        // push(); noStroke(); fill(10, 20, 60, 30 + 80 * pulse); rect(0,0,width,halfH); pop();
        const localCamX = camX;
        noStroke(); fill(255); stroke(0);
        // ripples under obstacles
        // for (let ri = globalManager.ripples.length-1; ri >= 0; ri--) {
        //   const r = globalManager.ripples[ri]; r.time += dt; if (r.time > r.life) { globalManager.ripples.splice(ri,1); continue; }
        //   const rr = r.time / r.life; stroke(120,200,255, 160*(1-rr)); noFill(); strokeWeight(2); ellipse(r.x - localCamX + width/2, r.y, rr * r.maxR);
        // }
        for (const s of globalManager.map.segments) {
          rectMode(CORNER); rect(s.x - localCamX + width/2, s.platformY - i*halfH, s.w, 20);
          if (s.obstacles) for (const ob of s.obstacles) {
            if (ob.type === 'pillar') rectMode(CENTER), rect(ob.x - localCamX + width/2, ob.y - ob.h/2 - i*halfH, ob.w, ob.h);
          }
          if (s.spikes) for (const sp of s.spikes) {
            const sx = sp.x - localCamX + width/2;
            if (sp.side === 'floor') triangle(sx - sp.w/2, s.platformY - i*halfH, sx + sp.w/2, s.platformY - i*halfH, sx, s.platformY - 28 - i*halfH);
            else triangle(sx - sp.w/2, s.platformY - 20 - i*halfH, sx + sp.w/2, s.platformY - 20 - i*halfH, sx, s.platformY + 28 - i*halfH);
          }
          if (s.coins) for (const coin of s.coins) {
            if (!coin.active || coin.collected) continue;
            const cx = coin.x - localCamX + width/2; const cy = coin.y - i*halfH;
            fill(255,200,0); stroke(255); ellipse(cx, cy, coin.size);
            if (rectsIntersect({ x: coin.x-coin.size/2, y: coin.y-coin.size/2, w: coin.size, h: coin.size }, p.getAABB())) {
              coin.collected = true; coin.active = false; globalManager.addCoins(1); globalManager.map.coinPool.release(coin);
            }
          }
          if (s.portal && s.portal.active) {
            const px = s.portal.x - localCamX + width/2; const py = s.portal.y - i*halfH;
            fill(0,200,255); stroke(255); ellipse(px, py, 28);
            if (rectsIntersect({ x: s.portal.x-14, y: s.portal.y-14, w:28, h:28 }, p.getAABB())) {
              p.queuedPortal = { type: s.portal.type, value: s.portal.value };
              if (s.portal.type === 'gravity') {
                const revert = globalManager.map.portalPool.obtain(); revert.init('gravity', s.portal.x + 400, s.platformY - 40);
              }
              s.portal.active = false; globalManager.map.portalPool.release(s.portal); s.portal = null;
            }
          }
        }
        // render particles for this view
        if (globalManager.particles) globalManager.particles.render(localCamX);
        const centerX = width/2; const centerY = halfH/2;
        p.render(null, centerX, p.y - i*halfH);
        pop();
      }
      renderUI(globalManager);
    } else {
      push(); translate(0,0);
      // screen shake
      const shakeX = Math.sin(globalManager.runTime * 60) * (globalManager.shakeTimer*6);
      const shakeY = Math.cos(globalManager.runTime * 70) * (globalManager.shakeTimer*3);
      translate(shakeX, shakeY);
      noStroke(); fill(255); stroke(0);
      for (const s of globalManager.map.segments) {
        rectMode(CORNER); rect(s.x - camX + width/2, s.platformY, s.w, 20);
        if (s.obstacles) for (const ob of s.obstacles) {
          if (ob.type === 'pillar') rectMode(CENTER), rect(ob.x - camX + width/2, ob.y - ob.h/2, ob.w, ob.h);
        }
        if (s.spikes) for (const sp of s.spikes) {
          const sx = sp.x - camX + width/2;
          if (sp.side === 'floor') triangle(sx - sp.w/2, s.platformY, sx + sp.w/2, s.platformY, sx, s.platformY - 28);
          else triangle(sx - sp.w/2, s.platformY - 20, sx + sp.w/2, s.platformY - 20, sx, s.platformY + 28);
        }
        if (s.coins) for (const coin of s.coins) {
          if (!coin.active || coin.collected) continue;
          const cx = coin.x - camX + width/2; const cy = coin.y;
          push(); fill(255,200,0); stroke(255); ellipse(cx, cy, coin.size); pop();
          if (rectsIntersect({ x: coin.x-coin.size/2, y: coin.y-coin.size/2, w: coin.size, h: coin.size }, globalManager.players[0].getAABB())) {
            coin.collected = true; coin.active = false; globalManager.addCoins(1); globalManager.map.coinPool.release(coin);
          }
        }
        if (s.portal && s.portal.active) {
          const px = s.portal.x - camX + width/2; const py = s.portal.y;
          push(); fill(0,200,255); stroke(255); ellipse(px, py, 28); pop();
          if (rectsIntersect({ x: s.portal.x-14, y: s.portal.y-14, w:28, h:28 }, globalManager.players[0].getAABB())) {
            globalManager.players[0].queuedPortal = { type: s.portal.type, value: s.portal.value };
            if (s.portal.type === 'gravity') {
              const revert = globalManager.map.portalPool.obtain(); revert.init('gravity', s.portal.x + 400, s.platformY - 40);
            }
            s.portal.active = false; globalManager.map.portalPool.release(s.portal); s.portal = null;
          }
        }
      }
      // render particles
      if (globalManager.particles) globalManager.particles.render(camX);
      globalManager.players[0].render(null, width/2, globalManager.players[0].y);
      renderUI(globalManager);
      pop();
      for (let i=0;i<globalManager.players.length;i++) {
        const p = globalManager.players[i];
        const centerX = width/2; const centerY = height/2;
        p.render(null, centerX, p.y);
      }
      renderUI(globalManager);
    }
  } else if (globalManager.state === STATES.PAUSED) {
    fill(255); textSize(32); textAlign(CENTER, CENTER); text('PAUSED', width/2, height/2 - 60);
    if (!window.resumeButton) {
      window.resumeButton = createButton('Resume');
      window.resumeButton.position(width/2 - 50, height/2 - 20);
      window.resumeButton.mousePressed(() => globalManager.pauseToggle());
    }
    if (!window.restartButton) {
      window.restartButton = createButton('Restart');
      window.restartButton.position(width/2 - 50, height/2 + 10);
      window.restartButton.mousePressed(() => { globalManager.startSingle(); });
    }
    if (!window.menuButton) {
      window.menuButton = createButton('Menu');
      window.menuButton.position(width/2 - 50, height/2 + 40);
      window.menuButton.mousePressed(() => globalManager.changeState(STATES.MENU));
    }
    window.resumeButton.show();
    window.restartButton.show();
    window.menuButton.show();
    if (window.volumeSlider) volumeSlider.show();
  } else if (globalManager.state === STATES.GAMEOVER) {
    if (window.volumeSlider) volumeSlider.hide();
    fill(255); textSize(28); textAlign(CENTER, CENTER); text('GAME OVER', width/2, height/2 - 60);
    const score = globalManager.coins;
    textSize(16); text('High Score: ' + score, width/2, height/2 - 30);
    text('Coins: ' + globalManager.coins, width/2, height/2 - 10);
    if (!window.restartGameOverButton) {
      window.restartGameOverButton = createButton('Restart');
      window.restartGameOverButton.position(width/2 - 50, height/2 + 10);
      window.restartGameOverButton.mousePressed(() => globalManager.startSingle());
    }
    if (!window.menuGameOverButton) {
      window.menuGameOverButton = createButton('Menu');
      window.menuGameOverButton.position(width/2 - 50, height/2 + 40);
      window.menuGameOverButton.mousePressed(() => globalManager.changeState(STATES.MENU));
    }
    window.restartGameOverButton.show();
    window.menuGameOverButton.show();
  }
  // Shop / Customize overlays
  if (globalManager.state === STATES.SHOP) drawShop(globalManager);
  if (globalManager.state === STATES.CUSTOMIZE) drawCustomize(globalManager);
  if (globalManager.state === STATES.SETTINGS) drawSettings(globalManager);
}

function drawMenu() {
  push(); textAlign(CENTER, CENTER); fill(255);
  textSize(48); text('Flux Runner', width/2, height*0.25);
  textSize(18); text('Press Enter to Start (Single) or 2 for Multiplayer', width/2, height*0.35);
  textSize(14); text('W / Space to jump. P to pause.', width/2, height*0.42);
  textSize(12); text('Press D to run deterministic seed-safety test (dev)', width/2, height*0.48);
  if (globalManager && globalManager.debugTestResults) {
    const res = globalManager.debugTestResults;
    textSize(12); textAlign(LEFT, TOP);
    text('Seed test results: ' + res.length + ' seeds with issues (showing up to 6)', 16, height*0.55);
    for (let i=0;i<Math.min(res.length,6);i++) {
      const r = res[i]; textSize(12); text('seed ' + r.seed + ': ' + r.issues.length + ' issues', 16, height*0.58 + i*16);
    }
    textAlign(CENTER, CENTER);
  }
  textSize(12); text('Press S for Settings, T for Tutorial', width/2, height*0.52);
  pop();
}

function drawShop(manager) {
  push(); fill(255); textSize(20); textAlign(CENTER, TOP);
  text('Shop', width/2, 24);
  const items = [{name:'circle',price:0},{name:'square',price:0},{name:'x',price:50}];
  const startX = width/2 - 200; const y = 120; const w = 120; const h = 120; const gap = 40;
  for (let i=0;i<items.length;i++){
    const it = items[i]; const x = startX + i*(w+gap);
    rectMode(CORNER); stroke(255); fill(10); rect(x,y,w,h,8);
    fill(255); noStroke(); textSize(14); textAlign(CENTER,CENTER); text(it.name, x+w/2, y+18);
    // lock overlay
    if (manager.purchasedShapes.indexOf(it.name) === -1) {
      fill(255,204,0); text('Price: '+it.price, x+w/2, y+36);
      fill(0,0,0,140); rect(x,y,w,h,8);
      fill(255,255,255); text('LOCKED', x+w/2, y+h-18);
    } else {
      fill(0,200,255); text('Owned', x+w/2, y+36);
    }
  }
  // coins and back
  textSize(14); textAlign(LEFT); text('Coins: '+manager.coins, 16, 20);
  textAlign(RIGHT); text('Press M to return', width-16, 20);
  pop();
  // confirmation overlay
  if (manager.pendingPurchase) {
    push(); fill(0,0,0,180); rectMode(CORNER); rect(0,0,width,height);
    fill(255); textAlign(CENTER, CENTER); textSize(18); text('Buy '+manager.pendingPurchase.name+' for '+manager.pendingPurchase.price+' coins?', width/2, height/2-20);
    text('Click to confirm', width/2, height/2+18);
    pop();
  }
}

function drawSettings(manager) {
  push(); fill(255); textSize(20); textAlign(CENTER, TOP);
  text('Settings', width/2, 24);
  textSize(14); textAlign(LEFT, TOP);
  // Difficulty buttons
  const dx = 80; const dy = 100; const bw = 120; const bh = 40;
  const opts = ['easy','medium','hard'];
  for (let i=0;i<opts.length;i++){
    const d = opts[i]; const x = width/2 - (bw+12) + i*(bw+12); const y = dy;
    rectMode(CORNER); stroke(255); fill(manager.difficulty===d?40:10); rect(x,y,bw,bh,6);
    fill(255); noStroke(); textAlign(CENTER, CENTER); text(d.charAt(0).toUpperCase()+d.slice(1), x+bw/2, y+bh/2);
  }
  // Volume display
  textAlign(LEFT, TOP); textSize(14); text('Volume: ' + Math.round(manager.volume*100) + '%', 40, dy+90);
  text('Close: M or press outside area', width/2, height-40);
  pop();
}

function drawCustomize(manager) {
  push(); fill(255); textSize(20); textAlign(LEFT, TOP);
  text('Customize', 16, 16);
  // palette (no black, no white)
  const palette = [[255,50,180],[0,200,255],[120,255,80],[255,160,0],[180,90,255]];
  const startX = 40; const startY = 80; const s = 40;
  for (let i=0;i<palette.length;i++){
    const col = palette[i]; fill(col[0],col[1],col[2]); stroke(255); rect(startX + i*(s+12), startY, s, s,6);
    if (manager.selectedColor && manager.selectedColor[0]===col[0] && manager.selectedColor[1]===col[1]) { noFill(); stroke(255,235,0); rect(startX + i*(s+12), startY, s, s,6); }
  }
  // live preview center
  fill(manager.selectedColor[0], manager.selectedColor[1], manager.selectedColor[2]); stroke(255); ellipse(width/2, height/2 - 20, 120);
  // shapes bottom
  const shapes = ['circle','square','x']; const sy = height - 140; const sw = 80;
  for (let i=0;i<shapes.length;i++){ const nm = shapes[i]; const sx = width/2 - (shapes.length*(sw+16))/2 + i*(sw+16);
    fill(20); stroke(255); rect(sx, sy, sw, sw,8);
    fill(255); textAlign(CENTER, CENTER); text(nm, sx+sw/2, sy+14);
    if (manager.purchasedShapes.indexOf(nm) === -1) { fill(255,180,0); text('Buy', sx+sw/2, sy+sw-18); }
    else { fill(0,200,120); text('Equip', sx+sw/2, sy+sw-18); }
  }
  pop();
}

function onPlayerDeath(player) {
  // freeze audio and trigger game over immediately
  globalManager.audio.pause();
  if (globalManager.state === STATES.PLAYING_MULTI) {
    for (const p of globalManager.players) p.alive = false;
  }
  // save score
  const score = globalManager.coins;
  if (globalManager.state === STATES.PLAYING_MULTI) {
    const key = 'highscore_multi';
    const cur = globalManager.load(key, 0);
    if (score > cur) globalManager.save(key, score);
  } else {
    const key = 'highscore';
    const cur = globalManager.load(key, 0);
    if (score > cur) globalManager.save(key, score);
  }
  globalManager.changeState(STATES.GAMEOVER);
}

function keyReleased() {}

function mousePressed() {
  if (!globalManager) return;
  const mX = mouseX, mY = mouseY;
  if (globalManager.state === STATES.SHOP) {
    // handle confirmation
    if (globalManager.pendingPurchase) {
      const it = globalManager.pendingPurchase;
      if (globalManager.buyShape(it.name, it.price)) globalManager.pendingPurchase = null;
      else globalManager.pendingPurchase = null; // dismiss
      return;
    }
    // detect clicks on shop items
    const items = [{name:'circle',price:0},{name:'square',price:0},{name:'x',price:50}];
    const startX = width/2 - 200; const y = 120; const w = 120; const h = 120; const gap = 40;
    for (let i=0;i<items.length;i++){
      const x = startX + i*(w+gap);
      if (mX >= x && mX <= x+w && mY >= y && mY <= y+h) {
        const it = items[i];
        if (globalManager.purchasedShapes.indexOf(it.name) === -1) {
          // ask to purchase
          globalManager.pendingPurchase = it; return;
        } else {
          globalManager.equipShape(it.name); return;
        }
      }
    }
  }
  if (globalManager.state === STATES.SETTINGS) {
    // difficulty buttons
    const bw = 120; const dy = 100;
    for (let i=0;i<3;i++){
      const x = width/2 - (bw+12) + i*(bw+12); const y = dy;
      if (mX >= x && mX <= x+bw && mY >= y && mY <= y+40) {
        const opts = ['easy','medium','hard']; globalManager.setDifficulty(opts[i]); return;
      }
    }
    // click outside closes settings
    if (!(mX > width/2-260 && mX < width/2+260 && mY > 60 && mY < height-60)) { globalManager.changeState(STATES.MENU); return; }
  } else if (globalManager.state === STATES.CUSTOMIZE) {
    // palette
    const palette = [[255,50,180],[0,200,255],[120,255,80],[255,160,0],[180,90,255]];
    const startX = 40; const startY = 80; const s = 40;
    for (let i=0;i<palette.length;i++){
      const x = startX + i*(s+12);
      if (mX >= x && mX <= x+s && mY >= startY && mY <= startY+s) { globalManager.pickColor(palette[i]); return; }
    }
    // shapes bottom
    const shapes = ['circle','square','x']; const sy = height - 140; const sw = 80;
    for (let i=0;i<shapes.length;i++){ const sx = width/2 - (shapes.length*(sw+16))/2 + i*(sw+16);
      if (mX >= sx && mX <= sx+sw && mY >= sy && mY <= sy+sw) {
        const nm = shapes[i]; if (globalManager.purchasedShapes.indexOf(nm) === -1) { globalManager.pendingPurchase = { name: nm, price: nm==='x'?50:0 }; }
        else { globalManager.equipShape(nm); }
        return;
      }
    }
  }
}
