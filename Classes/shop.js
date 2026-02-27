function drawShop(manager) {
  push();
  fill(255);
  textSize(20);
  textAlign(CENTER, TOP);
  text('Shop', width / 2, 24);

  const items = [
    { name: 'circle', price: 0 },
    { name: 'square', price: 0 },
    { name: 'triangle', price: 70 },
    { name: 'x', price: 0 },
    { name: 'star', price: 100 },
    { name: 'aura', price: 70 }
  ];

  const startX = width / 2 - 240;
  const y = 120;
  const w = 120;
  const h = 120;
  const gap = 40;

  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const x = startX + i * (w + gap);

    rectMode(CORNER);
    stroke(255);
    fill(10);
    rect(x, y, w, h, 8);

    // Aura color indicator
    if (it.name === 'aura' && manager.purchasedAura && manager.auraColor) {
      noStroke();
      fill(...manager.auraColor, 180);
      ellipse(x + 20, y + h - 20, 24);
    }

    fill(255);
    noStroke();
    textSize(14);
    textAlign(CENTER, CENTER);
    text(it.name === 'aura' ? 'Aura' : it.name, x + w / 2, y + 18);

    if (it.name === 'aura') {
      if (!manager.purchasedAura) {
        fill(255, 204, 0);
        text('Price: ' + it.price, x + w / 2, y + 36);

        fill(0, 0, 0, 140);
        rect(x, y, w, h, 8);

        fill(255);
        text('LOCKED', x + w / 2, y + h - 18);
      } else {
        fill(0, 200, 255);
        text('Active', x + w / 2, y + 36);
      }
    } else {
      if (!manager.purchasedShapes.includes(it.name)) {
        fill(255, 204, 0);
        text('Price: ' + it.price, x + w / 2, y + 36);

        fill(0, 0, 0, 140);
        rect(x, y, w, h, 8);

        fill(255);
        text('LOCKED', x + w / 2, y + h - 18);
      } else {
        fill(manager.selectedShape === it.name ? 50 : 0,
             manager.selectedShape === it.name ? 255 : 200,
             manager.selectedShape === it.name ? 50 : 255);

        text(
          manager.selectedShape === it.name ? 'Equipped' : 'Owned',
          x + w / 2,
          y + 36
        );
      }
    }
  }

  textSize(14);
  textAlign(LEFT);
  text('Coins: ' + manager.totalCoins, 16, 20);

  textAlign(RIGHT);
  text('Press M to return', width - 16, 20);
  pop();

  // Purchase confirmation
  if (manager.pendingPurchase) {
    push();
    fill(0, 0, 0, 180);
    rect(0, 0, width, height);

    fill(255);
    textAlign(CENTER, CENTER);
    textSize(18);

    if (manager.pendingPurchase.name === 'aura') {
      text(
        'Buy aura for ' + manager.pendingPurchase.price + ' coins?',
        width / 2,
        height / 2 - 20
      );
      textSize(12);
      text(
        'You can select aura color in Customize after purchase',
        width / 2,
        height / 2 + 4
      );
    } else {
      text(
        'Buy ' + manager.pendingPurchase.name +
        ' for ' + manager.pendingPurchase.price + ' coins?',
        width / 2,
        height / 2 - 20
      );
    }

    textSize(14);
    text('Click to confirm', width / 2, height / 2 + 20);
    pop();
  }
}

// render the customization screen (color palette + shape selection)
function drawCustomize(manager) {
  push();
  fill(255);
  textSize(20);
  textAlign(CENTER, TOP);
  text('Customize', width / 2, 24);

  const palette = [
    [255, 50, 180],
    [0, 200, 255],
    [120, 255, 80],
    [255, 160, 0],
    [180, 90, 255]
  ];

  const startX = 40;
  const startY = 80;
  const s = 40;

  // shape color row
  for (let i = 0; i < palette.length; i++) {
    const x = startX + i * (s + 12);
    noStroke();
    fill(...palette[i]);
    rect(x, startY, s, s, 4);
    if (manager.selectedColor &&
        palette[i][0] === manager.selectedColor[0] &&
        palette[i][1] === manager.selectedColor[1] &&
        palette[i][2] === manager.selectedColor[2]) {
      stroke(255);
      noFill();
      rect(x, startY, s, s, 4);
    }
  }

  // aura palette if owned
  if (manager.purchasedAura) {
    const auraY = startY + s + 24;
    for (let i = 0; i < palette.length; i++) {
      const x = startX + i * (s + 12);
      noStroke();
      fill(...palette[i]);
      rect(x, auraY, s, s, 4);
      if (manager.auraColor &&
          palette[i][0] === manager.auraColor[0] &&
          palette[i][1] === manager.auraColor[1] &&
          palette[i][2] === manager.auraColor[2]) {
        stroke(255);
        noFill();
        rect(x, auraY, s, s, 4);
      }
    }
    fill(255);
    noStroke();
    textAlign(LEFT, CENTER);
    text('Aura ' + (manager.auraEnabled ? 'on' : 'off'), startX, auraY + s + 20);
  }

  // live preview in centre
  const previewSize = 80;
  push();
  translate(width / 2, height / 2 - 20);
  fill(...(manager.selectedColor || [255, 255, 255]));
  noStroke();
  const shape = manager.selectedShape || 'circle';
  if (shape === 'circle') ellipse(0, 0, previewSize, previewSize);
  else if (shape === 'square') rect(0, 0, previewSize, previewSize);
  else if (shape === 'triangle')
    triangle(-previewSize/2, previewSize/2, 0, -previewSize/2, previewSize/2, previewSize/2);
  else if (shape === 'x') {
    stroke(255);
    line(-previewSize/2, -previewSize/2, previewSize/2, previewSize/2);
    line(-previewSize/2, previewSize/2, previewSize/2, -previewSize/2);
  } else if (shape === 'star') {
    // simple 5-point star
    beginShape();
    for (let a = 0; a < 360; a += 72) {
      const r = a % 144 === 0 ? previewSize / 2 : previewSize / 4;
      vertex(cos(a) * r, sin(a) * r);
    }
    endShape(CLOSE);
  }
  if (manager.auraEnabled && manager.auraColor) {
    noFill();
    stroke(...manager.auraColor);
    strokeWeight(4);
    ellipse(0, 0, previewSize + 16, previewSize + 16);
    strokeWeight(1);
    noStroke();
  }
  pop();

  // shape selection row (mirrors click logic in sketch.js)
  const shapes = ['circle', 'square', 'triangle', 'x', 'star'];
  const sy = height - 140;
  const sw = 80;
  for (let i = 0; i < shapes.length; i++) {
    const sx = width/2 - (shapes.length * (sw + 16)) / 2 + i * (sw + 16);
    rectMode(CORNER);
    stroke(255);
    noFill();
    rect(sx, sy, sw, sw, 8);
    fill(255);
    noStroke();
    textAlign(CENTER, CENTER);
    text(shapes[i], sx + sw/2, sy + sw/2);

    if (manager.selectedShape === shapes[i]) {
      textSize(24);
      text('✓', sx + sw - 16, sy + 16);
      textSize(14);
    }

    if (!manager.purchasedShapes.includes(shapes[i])) {
      fill(255, 204, 0);
      textSize(12);
      let pr = 0;
      if (shapes[i] === 'x') pr = 50;
      else if (shapes[i] === 'star') pr = 100;
      else if (shapes[i] === 'triangle') pr = 70;
      text('Price: ' + pr, sx + sw/2, sy + sw - 20);

      fill(0, 0, 0, 140);
      rect(sx, sy, sw, sw, 8);

      fill(255);
      textSize(12);
      text('LOCKED', sx + sw/2, sy + sw/2);
    }
    textSize(14);
  }

  textAlign(CENTER);
  textSize(12);
  text('Press M for menu', width/2, height - 16);
  pop();
}

function drawSettings(manager) {
  push();
  fill(255);
  textSize(20);
  textAlign(CENTER, TOP);
  text('Settings', width / 2, 24);

  textSize(12);
  text('Difficulty change applies next run', width / 2, 50);

  const dx = 80;
  const dy = 100;
  const bw = 120;
  const bh = 40;
  const opts = ['easy', 'medium', 'hard'];

  for (let i = 0; i < opts.length; i++) {
    const d = opts[i];
    const x = width / 2 - (bw + 12) + i * (bw + 12);

    rectMode(CORNER);
    stroke(255);
    fill(manager.difficulty === d ? 40 : 10);
    rect(x, dy, bw, bh, 6);

    fill(255);
    noStroke();
    textAlign(CENTER, CENTER);
    text(d.charAt(0).toUpperCase() + d.slice(1), x + bw / 2, dy + bh / 2);
  }

  textAlign(LEFT, TOP);
  textSize(14);
  text('Volume: ' + Math.round(manager.volume * 100) + '%', 40, dy + 90);
  text('Total coins: ' + manager.totalCoins, 40, dy + 110);

  textAlign(CENTER);
  text('Close: M or click outside', width / 2, height - 40);
  pop();
}

function drawMultiSetup(manager) {
  push();

  const cfg = manager.multiConfig;
  if (!cfg) {
    fill(255);
    text('Error: no multi config', 16, 16);
    pop();
    return;
  }

  const stage = cfg.stage;
  const player = stage === 1 ? cfg.p1 : cfg.p2;

  fill(255);
  textSize(20);
  textAlign(LEFT, TOP);
  text('Player ' + stage + ' Setup', 16, 16);

  textAlign(RIGHT);
  textSize(14);
  text('Coins: ' + manager.totalCoins, width - 16, 20);

  textAlign(LEFT);
  textSize(14);
  text('Press Enter when done', 40, height - 40);

  const palette = [
    [255, 50, 180],
    [0, 200, 255],
    [120, 255, 80],
    [255, 160, 0],
    [180, 90, 255]
  ];

  const startX = 40;
  const startY = 80;
  const size = 40;

  // Color palette
  for (let i = 0; i < palette.length; i++) {
    const col = palette[i];
    fill(...col);
    stroke(255);
    rect(startX + i * (size + 12), startY, size, size, 6);
  }

  // Shape preview
  const px = width / 2;
  const py = height / 2 - 20;
  const ps = 120;

  if (manager.purchasedAura && player.auraEnabled) {
    push();
    blendMode(ADD);
    noStroke();
    const ac = player.auraColor || player.selectedColor;
    fill(...ac, 120);
    ellipse(px, py, ps * 1.8);
    pop();
  }

  fill(...player.selectedColor);
  stroke(255);

  const shp = player.selectedShape || 'square';

  if (shp === 'circle') {
    ellipse(px, py, ps);
  } else if (shp === 'square') {
    rectMode(CENTER);
    rect(px, py, ps, ps);
  } else if (shp === 'triangle') {
    triangle(px - ps / 2, py + ps / 2,
             px + ps / 2, py + ps / 2,
             px, py - ps / 2);
  } else if (shp === 'x') {
    const half = ps / 2;
    strokeWeight(4);
    line(px - half, py - half, px + half, py + half);
    line(px - half, py + half, px + half, py - half);
    strokeWeight(2);
  } else if (shp === 'star') {
    const r = ps / 2;
    const r2 = r * 0.5;

    beginShape();
    for (let i = 0; i < 5; i++) {
      let a = -HALF_PI + i * TWO_PI / 5;
      vertex(px + cos(a) * r, py + sin(a) * r);
      a += PI / 5;
      vertex(px + cos(a) * r2, py + sin(a) * r2);
    }
    endShape(CLOSE);
  }

  pop();
}