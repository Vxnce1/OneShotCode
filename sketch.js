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



/* ======= Utility Helpers ======= */
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function nowMs() { return performance.now(); }
function rectsIntersect(a,b){
  return !(a.x + a.w < b.x || a.x > b.x + b.w || a.y + a.h < b.y || a.y > b.y + b.h);
}


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
  // clicking anywhere on the main menu should start a run; this
  // is handy if keyboard focus is lost or Enter isn't working.
  if (globalManager.state === STATES.MENU) {
    globalManager.startSingle();
    return;
  }
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

