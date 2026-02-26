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
  }
}
