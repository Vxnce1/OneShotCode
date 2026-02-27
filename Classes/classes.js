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

const STATES = {
  LOADING: 'LOADING', MENU: 'MENU', SHOP: 'SHOP', CUSTOMIZE: 'CUSTOMIZE', TUTORIAL: 'TUTORIAL', SETTINGS: 'SETTINGS',
  PLAYING_SINGLE: 'PLAYING_SINGLE', PLAYING_MULTI: 'PLAYING_MULTI', MULTI_SETUP: 'MULTI_SETUP', PAUSED: 'PAUSED', GAMEOVER: 'GAMEOVER'
};


/* ======= Core Game State Manager ======= */
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
    if (window.customizeButton) window.customizeButton.hide();
    if (window.customizeBackButton) window.customizeBackButton.hide();
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