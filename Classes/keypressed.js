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