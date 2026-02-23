// Test script for seed issues
const height = 600; // Assume canvas height

const CONFIG = {
  canvasPadding: 20,
  clampDeltaMs: 50,
  gravity: 2200, // px/s^2 (positive = downwards)
  desiredMaxJumpHeight: 160, // px (used to compute initial jump velocity)
  terminalVelocity: 2000, // px/s
  baseSpeed: { easy: 280, medium: 360, hard: 480 }, // px/s
  speedCap: { easy: 420, medium: 600, hard: 900 },
  bpm: 128,
  beatPulse: 0.06,
  coyoteTimeMs: 100,
  inputBufferMs: 100,
  pauseDebounceMs: 200,
};

// Derived constants
CONFIG.initialJumpVelocity = Math.sqrt(2 * CONFIG.gravity * CONFIG.desiredMaxJumpHeight) * -1; // negative vy to go up
CONFIG.maxJumpHeight = CONFIG.desiredMaxJumpHeight;

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

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

class MapGenerator {
  constructor(rng, difficulty='medium') {
    this.rng = rng;
    this.difficulty = difficulty;
    this.segments = [];
    this.speed = CONFIG.baseSpeed[difficulty];
    this.speedCap = CONFIG.speedCap[difficulty];
    this.distanceSinceSpeedUp = 0;
    this.segmentX = 0;
    this.pool = new Pool(()=> ({})); // dummy
    this.coinPool = new Pool(()=> ({}));
    // portals removed for tests
    this.particlePool = new Pool(()=> ({}));
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
      const spike = { x: sx, w: 28, side: this.rng.next()<0.5? 'floor':'ceiling' };
      seg.spikes.push(spike);
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
      seg.coins.push(coin);
    }
    // portals disabled
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

  maxJumpDistance() {
    const flightTime = (2 * Math.abs(CONFIG.initialJumpVelocity)) / CONFIG.gravity; // seconds
    return this.speed * flightTime;
  }

  _enforceSegmentConstraints(seg) {
    // clamp segment width to ensure jumpability
    const maxDist = this.maxJumpDistance();
    seg.w = clamp(seg.w, 300, Math.floor(maxDist * 1.5));
    // clamp gap widths
    if (seg.obstacles) {
      for (const ob of seg.obstacles) {
        if (ob.type === 'gap') ob.w = clamp(ob.w, 80, Math.floor(maxDist * 0.9));
      }
    }
  }

  validateAllSegments() {
    const issues = [];
    const maxDist = this.maxJumpDistance();
    for (const s of this.segments) {
      if (s.obstacles) {
        for (const ob of s.obstacles) {
          if (ob.type === 'gap' && ob.w > Math.floor(maxDist * 0.9)) {
            issues.push({ seg: s, issue: 'gap_too_wide', gap: ob.w, maxAllowed: Math.floor(maxDist * 0.9) });
          }
        }
      }
      if (s.w > Math.max(300, Math.floor(maxDist * 1.5))) issues.push({ seg: s, issue: 'segment_too_wide', width: s.w });
    }
    return issues;
  }

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
}

// Run the test
const bad = MapGenerator.testSeeds(1, 200, 'medium');
console.log('bad seeds', bad.length, bad.slice(0,8));