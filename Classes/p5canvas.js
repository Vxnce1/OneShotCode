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
  volumeSlider.parent(container);
  volumeSlider.position(width-220,16);
  volumeSlider.style('z-index','9999');
  // ensure slider can receive focus/clicks
  try { volumeSlider.elt.style.pointerEvents = 'auto'; } catch(e) {}
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
    // also hide the customize button before redrawing
    if (window.customizeButton) window.customizeButton.hide();

    drawMenu();

    // create / show a dedicated "Customize" button so users can click
    // rather than having to know the 'C' hotkey. this mirrors the
    // pause/menu UI buttons elsewhere in the code.
    if (!window.customizeButton) {
      window.customizeButton = createButton('Customize');
      window.customizeButton.parent(document.getElementById('game-container'));
      window.customizeButton.addClass('btn');
      // position slightly below the menu text zone
      window.customizeButton.position(width/2 - 50, height/2 + 70);
      try { window.customizeButton.elt.style.pointerEvents = 'auto'; } catch(e) {}
      window.customizeButton.mousePressed(() => globalManager.changeState(STATES.CUSTOMIZE));
    }
    window.customizeButton.show();

    // ensure the volume slider never keeps focus – otherwise
    // pressing Enter will adjust the slider instead of starting
    // the run.  we only blur if the element actually exists.
    if (window.volumeSlider && volumeSlider.elt) {
      volumeSlider.elt.blur();
    }
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
      window.resumeButton.parent(document.getElementById('game-container'));
      window.resumeButton.addClass('btn');
      window.resumeButton.position(width/2 - 50, height/2 - 20);
      try { window.resumeButton.elt.style.pointerEvents = 'auto'; } catch(e) {}
      window.resumeButton.mousePressed(() => globalManager.pauseToggle());
    }
    if (!window.restartButton) {
      window.restartButton = createButton('Restart');
      window.restartButton.parent(document.getElementById('game-container'));
      window.restartButton.addClass('btn');
      window.restartButton.position(width/2 - 50, height/2 + 10);
      try { window.restartButton.elt.style.pointerEvents = 'auto'; } catch(e) {}
      window.restartButton.mousePressed(() => { globalManager.startSingle(); });
    }
    if (!window.menuButton) {
      window.menuButton = createButton('Menu');
      window.menuButton.parent(document.getElementById('game-container'));
      window.menuButton.addClass('btn');
      window.menuButton.position(width/2 - 50, height/2 + 40);
      try { window.menuButton.elt.style.pointerEvents = 'auto'; } catch(e) {}
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
      window.restartGameOverButton.parent(document.getElementById('game-container'));
      window.restartGameOverButton.addClass('btn');
      window.restartGameOverButton.position(width/2 - 50, height/2 + 10);
      try { window.restartGameOverButton.elt.style.pointerEvents = 'auto'; } catch(e) {}
      window.restartGameOverButton.mousePressed(() => {
        if (globalManager.lastMode === STATES.PLAYING_MULTI) globalManager.startMulti();
        else globalManager.startSingle();
      });
    }
    if (!window.menuGameOverButton) {
      window.menuGameOverButton = createButton('Menu');
      window.menuGameOverButton.parent(document.getElementById('game-container'));
      window.menuGameOverButton.addClass('btn');
      window.menuGameOverButton.position(width/2 - 50, height/2 + 40);
      try { window.menuGameOverButton.elt.style.pointerEvents = 'auto'; } catch(e) {}
      window.menuGameOverButton.mousePressed(() => globalManager.changeState(STATES.MENU));
    }
    window.restartGameOverButton.show();
    window.menuGameOverButton.show();
  }
  // Shop / Customize overlays
  if (globalManager.state === STATES.SHOP) drawShop(globalManager);
  if (globalManager.state === STATES.CUSTOMIZE) {
    drawCustomize(globalManager);
    // render a back button to exit customization
    if (!window.customizeBackButton) {
      window.customizeBackButton = createButton('Back');
      window.customizeBackButton.parent(document.getElementById('game-container'));
      window.customizeBackButton.addClass('btn');
      // bottom-right corner
      window.customizeBackButton.position(width - 100, height - 40);
      try { window.customizeBackButton.elt.style.pointerEvents = 'auto'; } catch(e) {}
      window.customizeBackButton.mousePressed(() => globalManager.changeState(STATES.MENU));
    }
    window.customizeBackButton.show();
  } else {
    if (window.customizeBackButton) window.customizeBackButton.hide();
  }
  if (globalManager.state === STATES.SETTINGS) drawSettings(globalManager);
}

function drawMenu() {
  // reorganised vertical positions to avoid cramped text and
  // make it easier to shift lines if new items are added later.
  push();
  textAlign(CENTER, CENTER);
  fill(255);
  let y = height * 0.25;
  textSize(48);
  text('λ-Dash', width/2, y);
  y += 60;

  textSize(18);
  text('Press Enter to Start (single)', width/2, y);
  y += 30;

  textSize(16);
  if (globalManager && globalManager.level >= 10) {
    text('Press 2 for multiplayer', width/2, y);
  } else {
    text('Multiplayer unlocks at level 10', width/2, y);
  }
<<<<<<< HEAD
  y += 40;

  textSize(14);
  text('W / Space to jump. P to pause. C to customize, H for shop, T for tutorial', width/2, y);
  y += 24;

  textSize(12);
  text('Press D to run deterministic seed-safety test (dev)', width/2, y);
  y += 24;

  text('Difficulty: ' + (globalManager ? globalManager.difficulty : '?'), width/2, y);
  y += 20;
  text('Total Coins: ' + (globalManager ? globalManager.totalCoins : 0), width/2, y);
  y += 18;
  if (globalManager) {
    text('Level: ' + (globalManager.level || 0), width/2, y);
    y += 18;
  }

=======
  textSize(14); text('W / Space to jump. P to pause. C to customize, H for shop, T for tutorial', width/2, height*0.47);
  textSize(12); text('Difficulty: ' + (globalManager?globalManager.difficulty:'?'), width/2, height*0.52);
  textSize(12); text('Total Coins: ' + (globalManager?globalManager.totalCoins:0), width/2, height*0.56);
  if (globalManager) { textSize(12); text('Level: ' + (globalManager.level||0), width/2, height*0.58); }
>>>>>>> 55453063f4b719035ffffafeab343fd1d337c087
  if (globalManager && globalManager.debugTestResults) {
    const res = globalManager.debugTestResults;
    textSize(12);
    textAlign(LEFT, TOP);
    text('Seed test results: ' + res.length + ' seeds with issues (showing up to 6)', 16, height * 0.55);
    for (let i = 0; i < Math.min(res.length, 6); i++) {
      const r = res[i];
      text('seed ' + r.seed + ': ' + r.issues.length + ' issues', 16, height * 0.58 + i * 16);
    }
    textAlign(CENTER, CENTER);
  }

  text('Press S for Settings, T for Tutorial', width/2, y);
  pop();
}