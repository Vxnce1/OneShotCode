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
  circleCollisionMargin: 0, // no special margin; all shapes use identical hitboxes
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
  PLAYING_SINGLE: 'PLAYING_SINGLE', PLAYING_MULTI: 'PLAYING_MULTI', MULTI_SETUP: 'MULTI_SETUP', PAUSED: 'PAUSED', GAMEOVER: 'GAMEOVER'
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
    // coins currently held by the player in the run; reset each run
    this.coins = 0;
    // persistent total / currency
    this.totalCoins = this.load('totalCoins', 0);
    this.purchasedShapes = this.load('purchasedShapes', ['square']);
    this.selectedShape = this.load('selectedShape', 'square');
    this.selectedColor = this.load('selectedColor', [0,255,200]);
    // aura style purchase (grants a glowing outline in the selected color)
    this.purchasedAura = this.load('purchasedAura', false);
    this.auraColor = this.load('auraColor', this.selectedColor.slice());
    this.auraEnabled = this.load('auraEnabled', true);
    this.pendingPurchase = null;
    this.equipFlashUntil = 0;
    this.equipFlashShape = null;
    this.setupAudio();
    this.clearTransient();
    this.particles = new ParticleSystem(this.rng);
    this.shakeTimer = 0;
    this.deathPending = false;
    this.pendingDeathPlayer = null;
    this.ripples = [];
  }

  addCoins(n) {
    this.coins = (this.coins||0) + n;
    this.totalCoins = (this.totalCoins||0) + n;
    try { this.save('totalCoins', this.totalCoins); } catch(e){}
    // xp gain for every 20 coins collected: quarter-bar per 20 coins
    this.coinXpAcc = (this.coinXpAcc||0) + n;
    while (this.coinXpAcc >= 20) {
      this.coinXpAcc -= 20;
      try { this.save('coinXpAcc', this.coinXpAcc); } catch(e){}
      this.addXp(0.25);
    }
    // update per-run best (highscore) as coins collected in a single run
    try {
      const key = 'highscore';
      const cur = this.load(key, 0);
      if (this.coins > cur) this.save(key, this.coins);
    } catch(e) {}
  }

  buyShape(name, price) {
    if (this.purchasedShapes.indexOf(name) !== -1) return false;
    if (this.totalCoins < price) return false;
    this.totalCoins -= price; try { this.save('totalCoins', this.totalCoins); } catch(e){}
    this.purchasedShapes.push(name); this.save('purchasedShapes', this.purchasedShapes);
    return true;
  }

  // helpers for xp/levels
  xpToNextLevel() {
    // bar is treated as 0..1; each level requires 1.0 xp.
    // higher levels could optionally require more, but current design
    // always uses 1.0 so each 20 coins gives a quarter of the bar.
    return 1.0;
  }

  addXp(n) {
    this.xp = (this.xp||0) + n;
    // check for one or more level ups
    while (this.xp >= this.xpToNextLevel()) {
      this.xp -= this.xpToNextLevel();
      this.level++;
      this.levelUpTimer = 2.0; // two seconds of indicator
    }
    try { this.save('xp', this.xp); } catch(e){}
    try { this.save('level', this.level); } catch(e){}
  }

  buyAura(price) {
    if (this.purchasedAura) return false;
    if (this.totalCoins < price) return false;
    this.totalCoins -= price; try { this.save('totalCoins', this.totalCoins); } catch(e){}
    this.purchasedAura = true;
    this.auraEnabled = true;
    // if auraColor hasn't been set yet, give it current shape color
    if (!this.auraColor) this.auraColor = (this.selectedColor||[255,255,255]).slice();
    this.save('purchasedAura', true);
    this.save('auraColor', this.auraColor);
    this.save('auraEnabled', this.auraEnabled);
    return true;
  }
  equipShape(name) {
    if (this.purchasedShapes.indexOf(name) === -1) return false;
    this.selectedShape = name; this.save('selectedShape', name);
    try { this.equipFlashUntil = Date.now() + 1200; this.equipFlashShape = name; } catch(e){}
    return true;
  }
  pickColor(col) { this.selectedColor = col; this.save('selectedColor', col); }
  pickAuraColor(col) { this.auraColor = col; this.save('auraColor', col); }
  toggleAura() { this.auraEnabled = !this.auraEnabled; this.save('auraEnabled', this.auraEnabled); }
  clearTransient() {
    this.inputBuffer = {};
    this.groundedFlags = [false, false];
    this.timers = [];
  }
  changeState(newState) {
    this.state = newState;
    this.clearTransient();
    // hide any UI controls whenever the state changes
    if (window.resumeButton) window.resumeButton.hide();
    if (window.restartButton) window.restartButton.hide();
    if (window.menuButton) window.menuButton.hide();
    if (window.restartGameOverButton) window.restartGameOverButton.hide();
    if (window.menuGameOverButton) window.menuGameOverButton.hide();
    if (window.volumeSlider) volumeSlider.hide();
    if (newState === STATES.LOADING) {
      /* nothing */
    }
    // clear player transient inputs and grounded flags
    if (this.players) for (const p of this.players) {
      if (p) { p.inputBufferUntil = -9999; p.coyoteUntil = -9999; p.grounded = false; }
    }
  }
  setupAudio() {
    // initialize rhythm audio with appropriate bpm and volume
    try {
      this.audio = new RhythmAudio(CONFIG.bpm, this.volume);
    } catch(e) {
      // fallback to stub if something goes wrong
      this.audio = { start:()=>{}, pause:()=>{}, resume:()=>{}, update:()=>{}, setVolume:()=>{} };
    }
  }
  setDifficulty(d) {
    this.difficulty = d; this.save('difficulty', d);
    if (this.map) {
      this.map.difficulty = d;
      this.map.speed = CONFIG.baseSpeed[d];
      this.map.speedCap = CONFIG.speedCap[d];
    }
  }
  startSingle() {
    this.lastMode = STATES.PLAYING_SINGLE;
    this.seed = (Date.now() & 0xffffffff) ^ 0xdeadbeef;
    this.rng = new SeededRandom(this.seed);
    this.players = [new Player(0,this)];
    this.players.forEach(p=>p.resetForRun());
    this.map = new MapGenerator(this.rng, this.difficulty);
    this.coins = 0;
    this.audio.start();
    this.runTime = 0;
    this.slowMotion = 0;
    this.changeState(STATES.PLAYING_SINGLE);
  }
  // multiplayer start using current multiConfig
  startMulti() {
    this.lastMode = STATES.PLAYING_MULTI;
    // ensure we have a config
    if (!this.multiConfig) {
      // fallback to using current selected settings for both
      this.multiConfig = {stage:1,
        p1:{
          selectedShape:this.selectedShape,
          selectedColor:this.selectedColor.slice(),
          auraColor:this.auraColor?this.auraColor.slice():null,
          auraEnabled:this.auraEnabled
        },
        p2:{
          selectedShape:this.selectedShape,
          selectedColor:this.selectedColor.slice(),
          auraColor:this.auraColor?this.auraColor.slice():null,
          auraEnabled:this.auraEnabled
        }
      };
    }
    this.seed = (Date.now() & 0xffffffff) ^ 0xdeadbeef;
    this.rng = new SeededRandom(this.seed);
    // create two players
    this.players = [new Player(0,this), new Player(1,this)];
    this.players.forEach(p=>p.resetForRun());
    // apply config to each
    const cfg = this.multiConfig;
    this.players[0].shape = cfg.p1.selectedShape;
    this.players[0].color = cfg.p1.selectedColor.slice();
    this.players[1].shape = cfg.p2.selectedShape;
    this.players[1].color = cfg.p2.selectedColor.slice();
    // aura properties stored on manager, so during render we must respect player index for color
    // we'll store two separate aura colors etc
    this.auraColorP1 = cfg.p1.auraColor;
    this.auraColorP2 = cfg.p2.auraColor;
    this.auraEnabledP1 = cfg.p1.auraEnabled;
    this.auraEnabledP2 = cfg.p2.auraEnabled;
    // set starting distances so player2 is behind
    this.players[0].distance = 0;
    this.players[1].distance = -100;
    this.map = new MapGenerator(this.rng, this.difficulty);
    this.coins = 0;
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
    this.coins = 0;
    this.audio.start();
    this.runTime = 0; this.slowMotion = 0;
    this.changeState(STATES.TUTORIAL);
  }

  pauseToggle() {
    if (this.state === STATES.PLAYING_SINGLE) {
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
      // coins is per-run; persist only totalCoins (currency/record)
      this.save('totalCoins', this.totalCoins);
      this.save('purchasedShapes', this.purchasedShapes);
      this.save('selectedShape', this.selectedShape);
      this.save('selectedColor', this.selectedColor);
      this.save('purchasedAura', this.purchasedAura);
      this.save('auraColor', this.auraColor);
      this.save('auraEnabled', this.auraEnabled);
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
    try {
      // Check if p5.sound is available
      if (!window.p5 || !p5.Oscillator) return;
      
      // Ensure audio context is in running state
      const ctx = getAudioContext();
      if (!ctx) return;
      
      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }
      
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
    } catch(e) {
      // Silently fail - audio is not critical to game function
      this.kick = null;
      this.hat = null;
      this.amp = null;
    }
  }
  start() {
    userStartAudio();
    this.initSynth();
    this.isPlaying = true;
    try {
      const ctx = getAudioContext();
      if (ctx && ctx.state === 'running') {
        this.nextTime = ctx.currentTime + 0.05;
      }
    } catch(e) {
      this.nextTime = 0;
    }
  }
  pause() { this.isPlaying = false; }
  resume() { this.isPlaying = true; }
  restart() { this.stop(); this.start(); }
  stop() { this.isPlaying = false; }
  setVolume(v) { this.volume = v; if (this.amp) this.amp.amp(v); }
  update(dt) {
    if (!this.isPlaying || !this.kick || !this.hat) return;
    try {
      const ctx = getAudioContext();
      if (!ctx || ctx.state !== 'running') return;
      while (this.nextTime <= ctx.currentTime + 0.05) {
        this.triggerBeat(this.nextTime);
        this.nextTime += this.beatInterval * 0.5; // hi-hat on off-beats too
      }
    } catch(e) {
      // silently ignore audio errors
    }
  }
  triggerBeat(time) {
    // simple kick every other tick
    if (!this.kick || !this.hat) return;
    try {
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
    } catch(e) {
      // silently ignore audio errors
    }
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
    this.x = 0;
    this.y = 0;
    this.vy = 0;
    this.width = 40; 
    this.height = 40;
    this.grounded = false;
    this.gravityDir = 1;

    // rotation fields
    this.rotation = 0;
    this.rotSpeed = 360;

    this.shape = 'square';
    this.color = [0,255,200];
    this.lastJumpTime = -9999;
    this.inputBufferUntil = -9999;
    this.coyoteUntil = -9999;
    this.score = 0;
    this.alive = true;
    this.distance = 0;
    this.trailTimer = 0;
  }

  resetForRun() {
    this.reset();
    this.y = height - 120;
    if (this.manager) {
      this.shape = this.manager.selectedShape || this.shape;
      this.color = this.manager.selectedColor || this.color;
      this.distance = 0;
      this.alive = true;
    }
  }

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

    const steps = Math.max(1, Math.ceil(Math.abs(this.vy * dt) / 10));
    const stepDt = dt / steps;
    const wasGrounded = this.grounded;

    for (let s = 0; s < steps; s++) {
      const prevY = this.y;
      this.y += this.vy * stepDt;

      const lethal = world.checkLethalCollision(this.getAABB());
      if (lethal) {
        this.alive = false;
        world.onPlayerDeath(this);
        return;
      }

      const landed = world.resolvePlatformCollision(this, tNow, prevY);
      if (landed) {
        this.grounded = true;
        this.vy = 0;
        this.coyoteUntil = -9999;
      } else {
        if (wasGrounded) {
          this.coyoteUntil = tNow + (CONFIG.coyoteTimeMs / 1000);
        }
        this.grounded = false;
      }
    }

    const bottomBound = globalManager.map ? globalManager.map.worldBottom : height;
    if (this.y > bottomBound + 10) {
      this.alive = false;
      world.onPlayerDeath(this);
      return;
    }

    this.distance += world.speed * dt;

    if (this.grounded && (tNow <= this.inputBufferUntil)) {
      this.attemptJump(tNow);
      this.inputBufferUntil = -9999;
    }

    // update rotation
    this.rotation += this.rotSpeed * dt;
    while (this.rotation >= 360) this.rotation -= 360;
  }

  getAABB() {
    const shrink = 0.02;
    const shw = this.width * shrink;
    const shh = this.height * shrink;
    const worldX = this.distance || 0;
    return {
      x: worldX - this.width/2 + shw,
      y: this.y - this.height/2 + shh,
      w: this.width - shw*2,
      h: this.height - shh*2
    };
  }

  render(cx, centerX, centerY, opacity = 1) {
    push();
    translate(centerX, this.y);

    // aura glow (if purchased and enabled)
    if (this.manager && this.manager.purchasedAura) {
      // determine color/enable based on mode
      let col;
      let enabled = false;
      if (this.manager.state === STATES.PLAYING_MULTI) {
        if (this.index === 0) {
          enabled = this.manager.auraEnabledP1;
          col = this.manager.auraColorP1 || this.manager.selectedColor || this.color;
        } else {
          enabled = this.manager.auraEnabledP2;
          col = this.manager.auraColorP2 || this.manager.selectedColor || this.color;
        }
      } else {
        enabled = this.manager.auraEnabled;
        col = this.manager.auraColor || this.manager.selectedColor || this.color;
      }
      if (enabled) {
        push();
        blendMode(ADD);
        noStroke();
        // pulsate alpha between ~60 and ~180 over time
        const t = (this.manager.runTime || 0) * 2.0;
        const glow = 0.5 + 0.5 * Math.sin(t);
        const a = 60 + 120 * glow;
        // hide when very dim to avoid seeing ghosted circle
        if (a > 40) {
          fill(col[0], col[1], col[2], a * opacity);
          const sizeFactor = 1.4; // slightly larger than shape, but smaller than before
          // draw same shape as player
          if (this.shape === 'circle') {
            ellipse(0, 0, this.width * sizeFactor, this.height * sizeFactor);
          } else if (this.shape === 'square') {
            rectMode(CENTER);
            rect(0, 0, this.width * sizeFactor, this.height * sizeFactor);
          } else if (this.shape === 'x') {
            strokeWeight(4);
            line(-this.width * sizeFactor/2, -this.height * sizeFactor/2, this.width * sizeFactor/2, this.height * sizeFactor/2);
            line(-this.width * sizeFactor/2, this.height * sizeFactor/2, this.width * sizeFactor/2, -this.height * sizeFactor/2);
            strokeWeight(2);
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
    }

    // rotation enabled; draw upright with rotation
    rotate(radians(this.rotation));
    noFill(); stroke(255); strokeWeight(2);
    fill(this.color[0], this.color[1], this.color[2], 220*opacity);

    if (this.shape === 'circle') {
      ellipse(0, 0, this.width, this.height);
    } else if (this.shape === 'square') {
      rectMode(CENTER);
      rect(0, 0, this.width, this.height);
    } else if (this.shape === 'triangle') {
      // upward-pointing triangle
      const w = this.width / 2;
      const h = this.height / 2;
      triangle(-w, h, w, h, 0, -h);
    } else if (this.shape === 'x') {
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

/* ======= Input Handling ======= */
let globalManager;
function keyPressed() {
  // allow entering customize from menu
  if (!globalManager) return;
  if ((key === 'C' || key === 'c') && globalManager.state === STATES.MENU) {
    globalManager.changeState(STATES.CUSTOMIZE);
    return;
  }
  if (!globalManager) return;
  if (key === ' ') {
    if (globalManager.state === STATES.PLAYING_SINGLE || globalManager.state === STATES.TUTORIAL) {
      const tNow = globalManager.runTime; if (!globalManager.players[0].attemptJump(tNow)) globalManager.players[0].inputBufferUntil = tNow + (CONFIG.inputBufferMs/1000);
    }
  }
  if (key === 'W' || key === 'w') {
    if (globalManager.state === STATES.PLAYING_SINGLE || globalManager.state === STATES.TUTORIAL) {
      const tNow = globalManager.runTime; if (!globalManager.players[0].attemptJump(tNow)) globalManager.players[0].inputBufferUntil = tNow + (CONFIG.inputBufferMs/1000);
    }
  }
  // Check jump-rings when pressing jump: if overlapping, apply ring strength
  if (globalManager.state === STATES.PLAYING_SINGLE) {
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
  // multiplayer jump (removed)  
  // if (keyCode === UP_ARROW) {
  //   if (globalManager.state === STATES.PLAYING_MULTI) {
  //     const tNow = globalManager.runTime; if (!globalManager.players[1].attemptJump(tNow)) globalManager.players[1].inputBufferUntil = tNow + (CONFIG.inputBufferMs/1000);
  //   }
  // }
  if (key === 'P' || key === 'p') globalManager.pauseToggle();
  if (keyCode === ENTER) {
    if (globalManager.state === STATES.MENU) globalManager.startSingle();
    else if (globalManager.state === STATES.GAMEOVER) globalManager.startSingle();
  }
  // multiplayer disabled
  // if (key === '2') {
  //   if (globalManager.state === STATES.MENU) globalManager.startMulti();
  // }
  if (key === 'M' || key === 'm') {
    globalManager.changeState(STATES.MENU);
  }
  // multiplayer request from menu
  if (key === '2' && globalManager.state === STATES.MENU) {
    if (globalManager.level >= 10) {
      // prepare temporary config with current selections
      globalManager.multiConfig = {
        stage: 1,
        p1:{
          selectedShape: globalManager.selectedShape,
          selectedColor: globalManager.selectedColor.slice(),
          auraColor: globalManager.auraColor?globalManager.auraColor.slice():null,
          auraEnabled: globalManager.auraEnabled
        },
        p2:{
          selectedShape: globalManager.selectedShape,
          selectedColor: globalManager.selectedColor.slice(),
          auraColor: globalManager.auraColor?globalManager.auraColor.slice():null,
          auraEnabled: globalManager.auraEnabled
        }
      };
      globalManager.changeState(STATES.MULTI_SETUP);
    } else {
      // maybe flash text? for now do nothing
    }
  }
  if (globalManager.state === STATES.MULTI_SETUP && keyCode === ENTER) {
    const cfg = globalManager.multiConfig;
    if (cfg && cfg.stage === 1) {
      cfg.stage = 2;
    } else {
      globalManager.startMulti();
    }
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
  if ((key === 'H' || key === 'h') && globalManager.state === STATES.MENU) {
    globalManager.changeState(STATES.SHOP);
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
  textFont('Arial Black');
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
  } else if (globalManager.state === STATES.MULTI_SETUP) {
    // setup screen for multiplayer
    if (window.volumeSlider) volumeSlider.hide();
    drawMultiSetup(globalManager);
  } else if (globalManager.state === STATES.PLAYING_SINGLE || globalManager.state === STATES.PLAYING_MULTI || globalManager.state === STATES.TUTORIAL) {
    if (window.resumeButton) window.resumeButton.hide();
    if (window.restartButton) window.restartButton.hide();
    if (window.menuButton) window.menuButton.hide();
    if (window.restartGameOverButton) window.restartGameOverButton.hide();
    if (window.menuGameOverButton) window.menuGameOverButton.hide();
    if (window.volumeSlider) volumeSlider.hide();
    // update audio
    // audio disabled
    // globalManager.audio.update(dt);
    if (window.volumeSlider) volumeSlider.hide();
    // advance run time
    globalManager.runTime += dt;
    if (globalManager.levelUpTimer > 0) globalManager.levelUpTimer = Math.max(0, globalManager.levelUpTimer - dt);
    // beat visuals disabled (audio removed)
    // const beatInterval = 60 / CONFIG.bpm;
    // globalManager.beatPhase = (globalManager.runTime % beatInterval) / beatInterval;
    // audio/beat visuals disabled
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
    // (multi-player removed)
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
    // world wrapper (provides proper onPlayerDeath callback)
    const tNow = globalManager.runTime;
    const world = {
      checkLethalCollision: (a) => globalManager.map.checkLethalCollision(a),
      resolvePlatformCollision: (p, runTimeArg, prevY) => globalManager.map.resolvePlatformCollision(p, runTimeArg, prevY),
      speed: globalManager.map.speed,
      onPlayerDeath: (p) => onPlayerDeath(p)
    };
    // update players (pass wrapper so deaths route to game manager)
    for (let i=0;i<globalManager.players.length;i++) {
      const p = globalManager.players[i];
      if (!p.alive) continue;
      p.update(dt, tNow, world);
    }
    // tutorial completion check
    if (globalManager.state === STATES.TUTORIAL) {
      const p0 = globalManager.players[0];
      if (p0 && p0.distance > (globalManager.map.segmentX - 80)) {
        globalManager.save('tutorialComplete', true);
        globalManager.changeState(STATES.MENU);
      }
    }
    // render world (single-player)
    // single camera view
      push(); translate(0,0);
      // screen shake
      const shakeX = Math.sin(globalManager.runTime * 60) * (globalManager.shakeTimer*6);
      const shakeY = Math.cos(globalManager.runTime * 70) * (globalManager.shakeTimer*3);
      translate(shakeX, shakeY);
      fill(0); stroke(255);
      for (const s of globalManager.map.segments) {
        rectMode(CORNER); rect(s.x - camX + width/2, s.platformY, s.w, 20);
        if (s.obstacles) for (const ob of s.obstacles) {
          if (ob.type === 'pillar') {
            rectMode(CENTER); rect(ob.x - camX + width/2, ob.y - ob.h/2, ob.w, ob.h);
          } else if (ob.type === 'jumppad') {
            // clearer visual: draw pad with upward arrow
            const px = ob.x - camX + width/2;
            const py = ob.y - ob.h/2;
            push(); rectMode(CENTER); noStroke();
            // pad base
            fill(255,140,0); rect(px, py, ob.w, ob.h, 6);
            // highlight stripe
            fill(255,200,80,200); rect(px, py, ob.h/2 - 2, ob.w * 0.6, ob.h/3, 4);
            // upward arrow indicator
            fill(255); noStroke(); const ah = ob.h*1.6; triangle(px, py - ah, px - ah/2, py, px + ah/2, py);
            pop();
          }
        }
        if (s.spikes) for (const sp of s.spikes) {
          const sx = sp.x - camX + width/2;
          const baseY = s.platformY - 1;
          const apexY = baseY - 20;
          triangle(sx - sp.w/2, baseY, sx + sp.w/2, baseY, sx, apexY);
        }
        if (s.coins) for (const coin of s.coins) {
          if (!coin.active || coin.collected) continue;
          const cx = coin.x - camX + width/2; const cy = coin.y;
          push(); fill(255,200,0); stroke(255); ellipse(cx, cy, coin.size); pop();
          // check collision against all active players
          for (const p of globalManager.players) {
            if (!p.alive) continue;
            if (rectsIntersect({ x: coin.x-coin.size/2, y: coin.y-coin.size/2, w: coin.size, h: coin.size }, p.getAABB())) {
              coin.collected = true; coin.active = false; globalManager.addCoins(1); globalManager.map.coinPool.release(coin);
              break;
            }
          }
        }
        // portals removed; nothing to render
      }
      // render particles
      if (globalManager.particles) globalManager.particles.render(camX);
      if (globalManager.state === STATES.PLAYING_MULTI) {
        // player1 center, player2 slightly to left
        globalManager.players.forEach((p,i)=>{
          if (!p.alive) return;
          const offset = i===0 ? 0 : -60;
          p.render(null, width/2 + offset, p.y);
        });
      } else {
        globalManager.players[0].render(null, width/2, globalManager.players[0].y);
      }
      renderUI(globalManager);
      pop();
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
    if (globalManager.lastMode === STATES.PLAYING_MULTI) {
      const winner = globalManager.winner || 'Player 1';
      textSize(20); text(winner + ' wins!', width/2, height/2 - 30);
    } else {
      const score = globalManager.coins;
      textSize(16); text('Coins this run: ' + score, width/2, height/2 - 30);
      const hsKey = 'highscore';
      const hs = globalManager.load(hsKey,0);
      text('Best: ' + hs, width/2, height/2 - 10);
    }
    if (!window.restartGameOverButton) {
      window.restartGameOverButton = createButton('Restart');
      window.restartGameOverButton.position(width/2 - 50, height/2 + 10);
      window.restartGameOverButton.mousePressed(() => {
        if (globalManager.lastMode === STATES.PLAYING_MULTI) globalManager.startMulti();
        else globalManager.startSingle();
      });
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
  textSize(48); text('λ-Dash', width/2, height*0.25);
  textSize(18); text('Press Enter to Start (single)', width/2, height*0.35);
  textSize(16);
  if (globalManager && globalManager.level >= 10) {
    text('Press 2 for multiplayer', width/2, height*0.39);
  } else {
    text('Multiplayer unlocks at level 10', width/2, height*0.39);
  }
  textSize(14); text('W / Space to jump. P to pause. C to customize, H for shop, T for tutorial', width/2, height*0.47);
  textSize(12); text('Press D to run deterministic seed-safety test (dev)', width/2, height*0.48);
  textSize(12); text('Difficulty: ' + (globalManager?globalManager.difficulty:'?'), width/2, height*0.52);
  textSize(12); text('Total Coins: ' + (globalManager?globalManager.totalCoins:0), width/2, height*0.56);
  if (globalManager) { textSize(12); text('Level: ' + (globalManager.level||0), width/2, height*0.58); }
  if (globalManager && globalManager.debugTestResults) {
    const res = globalManager.debugTestResults;
    textSize(12); textAlign(LEFT, TOP);
    text('Seed test results: ' + res.length + ' seeds with issues (showing up to 6)', 16, height*0.55);
    for (let i=0;i<Math.min(res.length,6);i++) {
      const r = res[i]; textSize(12); text('seed ' + r.seed + ': ' + r.issues.length + ' issues', 16, height*0.58 + i*16);
    }
    textAlign(CENTER, CENTER);
  }
  textSize(12); text('Press S for Settings, T for Tutorial', width/2, height*0.60);
  pop();
}

function drawShop(manager) {
  push(); fill(255); textSize(20); textAlign(CENTER, TOP);
  text('Shop', width/2, 24);
  // include shapes plus aura style
  const items = [
    {name:'circle',price:0},
    {name:'square',price:0},
    {name:'triangle',price:70},
    {name:'x',price:0},
    {name:'star',price:100},
    {name:'aura',price:70}
  ];
  const startX = width/2 - 240; const y = 120; const w = 120; const h = 120; const gap = 40;
  for (let i=0;i<items.length;i++){
    const it = items[i]; const x = startX + i*(w+gap);
    rectMode(CORNER); stroke(255); fill(10); rect(x,y,w,h,8);
    // draw aura color indicator if owned
    if (it.name === 'aura' && manager.purchasedAura && manager.auraColor) {
      noStroke(); fill(manager.auraColor[0], manager.auraColor[1], manager.auraColor[2], 180);
      ellipse(x + 20, y + h - 20, 24);
    }
    fill(255); noStroke(); textSize(14); textAlign(CENTER,CENTER);
    // display name differently for aura
    if (it.name === 'aura') text('Aura', x+w/2, y+18);
    else text(it.name, x+w/2, y+18);
    // lock/owned overlay
    if (it.name === 'aura') {
      if (!manager.purchasedAura) {
        fill(255,204,0); text('Price: '+it.price, x+w/2, y+36);
        fill(0,0,0,140); rect(x,y,w,h,8);
        fill(255,255,255); text('LOCKED', x+w/2, y+h-18);
      } else {
        fill(0,200,255); text('Active', x+w/2, y+36);
      }
    } else {
      if (manager.purchasedShapes.indexOf(it.name) === -1) {
        fill(255,204,0); text('Price: '+it.price, x+w/2, y+36);
        fill(0,0,0,140); rect(x,y,w,h,8);
        fill(255,255,255); text('LOCKED', x+w/2, y+h-18);
      } else {
        if (manager.selectedShape === it.name) {
          fill(50,255,50); text('Equipped', x+w/2, y+36);
        } else {
          fill(0,200,255); text('Owned', x+w/2, y+36);
        }
      }
    }
  }
  // coins and back
  textSize(14); textAlign(LEFT); text('Coins: '+manager.totalCoins, 16, 20);
  textAlign(RIGHT); text('Press M to return', width-16, 20);
  pop();
  // confirmation overlay
  if (manager.pendingPurchase) {
    push(); fill(0,0,0,180); rectMode(CORNER); rect(0,0,width,height);
    fill(255); textAlign(CENTER, CENTER); textSize(18);
    if (manager.pendingPurchase.name === 'aura') {
      text('Buy aura for '+manager.pendingPurchase.price+' coins?', width/2, height/2-20);
      textSize(12); text('You can select the aura color in Customize after purchase', width/2, height/2+4);
    } else {
      text('Buy '+manager.pendingPurchase.name+' for '+manager.pendingPurchase.price+' coins?', width/2, height/2-20);
    }
    textSize(14); text('Click to confirm', width/2, height/2+18);
    pop();
  }
}

function drawSettings(manager) {
  push(); fill(255); textSize(20); textAlign(CENTER, TOP);
  text('Settings', width/2, 24);
  textSize(12); textAlign(CENTER, TOP); text('Difficulty change applies next run', width/2, 50);
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
  text('Total coins: ' + (manager.totalCoins||0), 40, dy+110);
  text('Close: M or press outside area', width/2, height-40);
  pop();
}

function drawMultiSetup(manager) {
  // configure player 1 then player 2
  push(); fill(255); textSize(20); textAlign(LEFT, TOP);
  const cfg = manager.multiConfig;
  if (!cfg) { text('Error: no multi config', 16,16); pop(); return; }
  const stage = cfg.stage;
  const player = stage === 1 ? cfg.p1 : cfg.p2;
  text('Player ' + stage + ' setup', 16, 16);
  textSize(14); textAlign(RIGHT, TOP); text('Coins: ' + manager.totalCoins, width-16, 20);
  if (manager.purchasedAura) { textSize(12); textAlign(RIGHT, TOP); text('Aura style active', width-16, 36); }
  textSize(14); textAlign(LEFT, TOP); text('Press M to cancel, Enter when done', 40, height-40);
  // palette (no black, no white) for shape color
  const palette = [[255,50,180],[0,200,255],[120,255,80],[255,160,0],[180,90,255]];
  const startX = 40; const startY = 80; const s = 40;
  for (let i=0;i<palette.length;i++){
    const col = palette[i]; fill(col[0],col[1],col[2]); stroke(255); rect(startX + i*(s+12), startY, s, s,6);
    if (player.selectedColor && player.selectedColor[0]===col[0] && player.selectedColor[1]===col[1]) { noFill(); stroke(255,235,0); rect(startX + i*(s+12), startY, s, s,6); }
  }
  // aura palette if purchased
  let auraStartY = startY;
  if (manager.purchasedAura) {
    auraStartY = startY + s + 24;
    textSize(14); fill(255); textAlign(LEFT, TOP); text('Aura color:', startX, auraStartY - 20);
    for (let i=0;i<palette.length;i++){
      const col = palette[i]; fill(col[0],col[1],col[2]); stroke(255); rect(startX + i*(s+12), auraStartY, s, s,6);
      if (player.auraColor && player.auraColor[0]===col[0] && player.auraColor[1]===col[1]) { noFill(); stroke(255,235,0); rect(startX + i*(s+12), auraStartY, s, s,6); }
    }
    // aura toggle display
    textSize(14); textAlign(LEFT, TOP);
    const toggleY = auraStartY + s + 10;
    text('Aura: ' + (player.auraEnabled ? 'ON' : 'OFF') + ' (click here to toggle)', startX, toggleY);
  }
  // shape preview
  const px = width/2, py = height/2 - 20, ps = 120;
  if (manager.purchasedAura && player.auraEnabled) {
    push(); blendMode(ADD);
    noStroke();
    const ac = player.auraColor || player.selectedColor;
    fill(ac[0], ac[1], ac[2], 120);
    ellipse(px, py, ps * 1.8);
    pop();
  }
  fill(player.selectedColor[0], player.selectedColor[1], player.selectedColor[2]); stroke(255);
  const shp = player.selectedShape || 'square';
  if (shp === 'circle') {
    ellipse(px, py, ps);
  } else if (shp === 'square') {
    rectMode(CENTER); rect(px, py, ps, ps);
  } else if (shp === 'x') {
    const half = ps/2;
    strokeWeight(4);
    line(px-half, py-half, px+half, py+half);
    line(px-half, py+half, px+half, py-half);
    strokeWeight(2);
  } else if (shp === 'triangle') {
    const w = ps/2, h = ps/2;
    triangle(px-w, py+h, px+w, py+h, px, py-h);
  } else if (shp === 'star') {
    const r = ps/2;
    const r2 = r*0.5;
    beginShape();
    for (let i = 0; i < 5; i++) {
      let a = -Math.PI/2 + i * (2 * Math.PI / 5);
      vertex(px+Math.cos(a)*r, py+Math.sin(a)*r);
      a += Math.PI / 5;
      vertex(px+Math.cos(a)*r2, py+Math.sin(a)*r2);
    }
    endShape(CLOSE);
  }
  pop();
    // aura toggle display
    textSize(14); textAlign(LEFT, TOP);
    const toggleY = auraStartY + s + 10;
    text('Aura: ' + (manager.auraEnabled ? 'ON' : 'OFF') + ' (click here to toggle)', startX, toggleY);
  }
  // live preview center
  const px = width/2, py = height/2 - 20, ps = 120;
  // aura preview
  if (manager.purchasedAura) {
    push(); blendMode(ADD);
    noStroke();
    const ac = manager.auraColor || manager.selectedColor;
    fill(ac[0], ac[1], ac[2], 120);
    ellipse(px, py, ps * 1.8);
    pop();
  }
  fill(manager.selectedColor[0], manager.selectedColor[1], manager.selectedColor[2]); stroke(255);
  const shp = manager.selectedShape || 'square';
  if (shp === 'circle') {
    ellipse(px, py, ps);
  } else if (shp === 'square') {
    rectMode(CENTER); rect(px, py, ps, ps);
  } else if (shp === 'x') {
    const half = ps/2;
    strokeWeight(4);
    line(px-half, py-half, px+half, py+half);
    line(px-half, py+half, px+half, py-half);
    strokeWeight(2);
  } else if (shp === 'star') {
    // draw a simple five-point star
    const r = ps/2;
    const r2 = r * 0.5;
    beginShape();
    for (let i=0;i<5;i++){
      let a = -Math.PI/2 + i * (2*Math.PI/5);
      vertex(px + Math.cos(a)*r - px, py + Math.sin(a)*r - py);
      a += Math.PI/5;
      vertex(px + Math.cos(a)*r2 - px, py + Math.sin(a)*r2 - py);
    }
    endShape(CLOSE);
  }
  // shapes bottom
  const shapes = ['circle','square','triangle','x','star']; const sy = height - 140; const sw = 80;
  for (let i=0;i<shapes.length;i++){ const nm = shapes[i]; const sx = width/2 - (shapes.length*(sw+16))/2 + i*(sw+16);
    fill(20); stroke(255);
    // highlight selected shape
    if (manager.selectedShape === nm) { stroke(255,235,0); strokeWeight(3); rect(sx, sy, sw, sw,8); strokeWeight(2); stroke(255); }
    else rect(sx, sy, sw, sw,8);
    fill(255); textAlign(CENTER, CENTER);
    text(nm, sx+sw/2, sy+sw/2 - 10);
    if (manager.purchasedShapes.indexOf(nm) === -1) { fill(255,180,0); text('Buy', sx+sw/2, sy+sw/2 + 24); }
    else { fill(0,200,120); text('Equip', sx+sw/2, sy+sw/2 + 24); }
  }
  // equip flash indicator (brief toast)
  if (manager.equipFlashUntil && Date.now() < manager.equipFlashUntil) {
    const alpha = Math.floor(200 * (1 - (manager.equipFlashUntil - Date.now()) / 1200));
    push(); rectMode(CENTER); fill(0,180,80, alpha); stroke(255); strokeWeight(1);
    const bx = px + ps/2 + 60, by = py - ps/2;
    rect(bx, by, 140, 40, 8);
    noStroke(); fill(255,255,255,alpha); textAlign(CENTER, CENTER); textSize(14); text('Equipped: ' + (manager.equipFlashShape||''), bx, by);
    pop();
  }
  pop();

function onPlayerDeath(player) {
  // freeze audio and trigger game over immediately
  if (globalManager && globalManager.audio) globalManager.audio.pause();
  if (globalManager.state === STATES.PLAYING_MULTI) {
    // declare winner (other player)
    globalManager.winner = (player.index === 0 ? 'Player 2' : 'Player 1');
    for (const p of globalManager.players) p.alive = false;
  }
  // save run coin score as highscore
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
      if (it.name === 'aura') {
        if (globalManager.buyAura(it.price)) globalManager.pendingPurchase = null;
        else globalManager.pendingPurchase = null;
      } else {
        if (globalManager.buyShape(it.name, it.price)) globalManager.pendingPurchase = null;
        else globalManager.pendingPurchase = null; // dismiss
      }
      return;
    }
    // detect clicks on shop items (includes aura)
    const items = [
      {name:'circle',price:0},
      {name:'square',price:0},
      {name:'x',price:0},
      {name:'star',price:100},
      {name:'aura',price:70}
    ];
    const startX = width/2 - 240; const y = 120; const w = 120; const h = 120; const gap = 40;
    for (let i=0;i<items.length;i++){
      const x = startX + i*(w+gap);
      if (mX >= x && mX <= x+w && mY >= y && mY <= y+h) {
        const it = items[i];
        if (it.name === 'aura') {
          if (!globalManager.purchasedAura) {
            globalManager.pendingPurchase = it; return;
          }
          // aura has no equip action, just owned
          return;
        }
        if (globalManager.purchasedShapes.indexOf(it.name) === -1) {
          // ask to purchase shape
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
  } else if (globalManager.state === STATES.MULTI_SETUP) {
    const cfg = globalManager.multiConfig;
    if (!cfg) return;
    const stage = cfg.stage;
    const player = stage === 1 ? cfg.p1 : cfg.p2;
    // palette
    const palette = [[255,50,180],[0,200,255],[120,255,80],[255,160,0],[180,90,255]];
    const startX = 40; const startY = 80; const s = 40;
    // shape color row
    for (let i=0;i<palette.length;i++){
      const x = startX + i*(s+12);
      if (mX >= x && mX <= x+s && mY >= startY && mY <= startY+s) { player.selectedColor = palette[i].slice(); return; }
    }
    // aura color row if purchased
    if (globalManager.purchasedAura) {
      const auraY = startY + s + 24;
      for (let i=0;i<palette.length;i++){
        const x = startX + i*(s+12);
        if (mX >= x && mX <= x+s && mY >= auraY && mY <= auraY+s) { player.auraColor = palette[i].slice(); return; }
      }
      // toggle region
      const toggleY = auraY + s + 10;
      const toggleWidth = 200;
      const toggleHeight = 20;
      if (mX >= startX && mX <= startX + toggleWidth && mY >= toggleY && mY <= toggleY + toggleHeight) {
        player.auraEnabled = !player.auraEnabled;
        return;
      }
    }
    // shapes bottom
    const shapes = ['circle','square','triangle','x','star']; const sy = height - 140; const sw = 80;
    for (let i=0;i<shapes.length;i++){ const sx = width/2 - (shapes.length*(sw+16))/2 + i*(sw+16);
      if (mX >= sx && mX <= sx+sw && mY >= sy && mY <= sy+sw) {
        const nm = shapes[i];
        if (globalManager.purchasedShapes.indexOf(nm) === -1) {
          // cannot buy here
        } else {
          player.selectedShape = nm;
        }
        return;
      }
    }
    return;
  } else if (globalManager.state === STATES.CUSTOMIZE) {
    // palette
    const palette = [[255,50,180],[0,200,255],[120,255,80],[255,160,0],[180,90,255]];
    const startX = 40; const startY = 80; const s = 40;
    // shape color row
    for (let i=0;i<palette.length;i++){
      const x = startX + i*(s+12);
      if (mX >= x && mX <= x+s && mY >= startY && mY <= startY+s) { globalManager.pickColor(palette[i]); return; }
    }
    // aura color row if purchased
    if (globalManager.purchasedAura) {
      const auraY = startY + s + 24;
      for (let i=0;i<palette.length;i++){
        const x = startX + i*(s+12);
        if (mX >= x && mX <= x+s && mY >= auraY && mY <= auraY+s) { globalManager.pickAuraColor(palette[i]); return; }
      }
      // toggle click region
      const toggleY = auraY + s + 10;
      // approximate width based on text length
      const toggleWidth = 200;
      const toggleHeight = 20;
      if (mX >= startX && mX <= startX + toggleWidth && mY >= toggleY && mY <= toggleY + toggleHeight) {
        globalManager.toggleAura();
        return;
      }
    }
    // shapes bottom
    const shapes = ['circle','square','triangle','x','star']; const sy = height - 140; const sw = 80;
    for (let i=0;i<shapes.length;i++){ const sx = width/2 - (shapes.length*(sw+16))/2 + i*(sw+16);
      if (mX >= sx && mX <= sx+sw && mY >= sy && mY <= sy+sw) {
        const nm = shapes[i]; if (globalManager.purchasedShapes.indexOf(nm) === -1) {
          let pr = 0;
          if (nm === 'x') pr = 50;
          else if (nm === 'star') pr = 100;
          else if (nm === 'triangle') pr = 70;
          globalManager.pendingPurchase = { name: nm, price: pr };
        } else { globalManager.equipShape(nm); }
        return;
      }
    }
  }
}

