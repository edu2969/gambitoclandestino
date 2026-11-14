/* ============================================================
   Gambito Clandestino — motor de inmersión
   · Cámara vertical ligada al scroll sobre el SVG del paisaje
   · Piezas: caída libre en el aire → impacto → hundimiento lento
   · Splash, ondas, burbujas, nieve marina
   Todo en coordenadas de "mundo" (px del SVG escalado).
   ============================================================ */
(function (G) {
  'use strict';

  var S = G.state = {
    scrollY: 0, maxScroll: 1, vw: 0, vh: 0, H: 0, sceneW: 0, seaY: 0,
    camY: 0, offX: 0, z: 1, depth: 0, reduced: false
  };

  var SVG_W = 1920, SVG_H = 3200, WATERLINE = 1436;   // línea de mar dentro del SVG
  var rand = function (a, b) { return a + Math.random() * (b - a); };
  var clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
  var lerp = function (a, b, t) { return a + (b - a) * t; };

  var canvas, ctx, sceneEl, fogEl;
  var dpr = 1, quality = 1, cw = 0, ch = 0, u = 1, k = 1;
  var sprites = null, spriteScale = 0;
  var pieces = [], bubbles = [], drops = [], ripples = [], snow = [];
  var spawnTimer = 0, clock = 0, introLeft = 6, introSpawned = 0;
  var perfAcc = 0, perfN = 0;
  var lastW = 0, lastH = 0;

  /* ---------- Layout ---------- */
  function layout(force) {
    var w = window.innerWidth, h = window.innerHeight;
    // en móvil la barra del navegador cambia innerHeight al hacer scroll: ignorar cambios pequeños
    if (!force && w === lastW && Math.abs(h - lastH) < 140) return;
    lastW = w; lastH = h;
    S.vw = w; S.vh = h;
    S.H = Math.max(w * SVG_H / SVG_W, h * 3.8);
    S.sceneW = S.H * SVG_W / SVG_H;
    k = S.H / SVG_H;
    S.seaY = WATERLINE * k;
    sceneEl.style.width = S.sceneW + 'px';
    sceneEl.style.height = S.H + 'px';

    dpr = Math.min(window.devicePixelRatio || 1, 2) * quality;
    cw = Math.round(w * dpr); ch = Math.round(h * dpr);
    canvas.width = cw; canvas.height = ch;

    u = Math.min(h * 0.205 / 220, w * 0.21 / 100);        // px CSS por unidad lógica de pieza
    var need = clamp(Math.round(u * 1.25 * Math.min(window.devicePixelRatio || 1, 2) * 2) / 2, 1.5, 3);
    if (need !== spriteScale) { spriteScale = need; sprites = G.Pieces.build(spriteScale); }

    // nieve marina (coordenadas de pantalla con paralaje)
    snow.length = 0;
    var n = Math.round((w < 700 ? 26 : 46) * quality);
    for (var i = 0; i < n; i++) snow.push({ x: Math.random(), y: Math.random(), r: rand(.6, 1.9), p: rand(.15, .6), w: rand(.2, .9), ph: rand(0, 6.28) });
  }

  /* ---------- Cámara ---------- */
  // Estado de cámara para un scroll dado: zoom z, borde superior camY y borde izquierdo offX (mundo)
  function camState(sy) {
    var vh = S.vh, vw = S.vw, H = S.H;
    var zH = Math.max(2.917 * vh / H, vw / (S.sceneW));      // portada: se ve cielo, sol, puerto y la línea de mar
    zH = Math.min(zH, 1);
    var stage1 = vh * 1.15, z, cam, off;
    if (sy < stage1) {
      var t = sy / stage1, e = 1 - Math.pow(1 - t, 1.8);
      z = lerp(zH, 1, e);
      var frac = lerp(0.86, 0.12, e);                         // posición en pantalla de la línea de mar
      cam = S.seaY - frac * vh / z;
    } else {
      z = 1;
      var end1 = S.seaY - vh * 0.12, maxCam = H - vh;
      var v = (sy - stage1) / Math.max(1, S.maxScroll - stage1);
      cam = lerp(end1, maxCam, clamp(v, 0, 1));
    }
    var vwW = vw / z, over = Math.max(0, S.sceneW - vwW);
    var hero = clamp(0.38 * S.sceneW - vwW * 0.5, 0, over);   // el sol del horizonte queda visible
    var tt = clamp(sy / stage1, 0, 1); tt = tt * tt * (3 - 2 * tt);
    off = lerp(hero, over / 2, tt);
    return { z: z, cam: Math.max(0, cam), off: off };
  }
  function depthOf(cs) {
    var mid = cs.cam + S.vh / cs.z * 0.5;
    return Math.max(0, (mid - S.seaY) / (0.96 * S.H - S.seaY) * 52);
  }
  function applyCamera() {
    var cs = camState(S.scrollY);
    S.camY = cs.cam; S.offX = cs.off; S.z = cs.z; S.depth = depthOf(cs);
    sceneEl.style.transform = 'scale(' + cs.z.toFixed(4) + ') translate3d(' + (-cs.off).toFixed(1) + 'px,' + (-cs.cam).toFixed(1) + 'px,0)';
    // niebla de profundidad (viñeta oscura + tinte) para legibilidad del contenido
    var f = clamp((S.camY + S.vh / S.z * 0.5 - S.seaY) / (S.vh * 0.9), 0, 1);
    fogEl.style.opacity = (0.25 + 0.75 * f).toFixed(3);
  }

  /* ---------- Piezas ---------- */
  function pickName() {
    var r = Math.random();
    return r < .26 ? 'pawn' : r < .42 ? 'knight' : r < .56 ? 'rook' : r < .70 ? 'bishop' : r < .85 ? 'queen' : 'king';
  }

  function pickColor() {                                  // plata 40 % · blanca 30 % · negra 30 %
    var r = Math.random();
    return r < .4 ? 'silver' : r < .7 ? 'white' : 'black';
  }

  function spawn(forceAir) {
    var name = pickName(), def = G.Pieces.defs[name];
    var z = rand(.62, 1.25), s = u * z, h = def.h * s;
    var sc = S.vh / 900;
    var inAir = forceAir || (S.camY + S.vh / S.z * 0.2 < S.seaY && !S.reduced);
    var p = {
      name: name, color: pickColor(), z: z, s: s, h: h, hh: h / 2,
      x: S.offX + rand(.05, .95) * S.vw / S.z,
      y: 0, vx: rand(-30, 30) * sc, vy: 0,
      rot: rand(-.9, .9), vr: rand(.5, 1.7) * (Math.random() < .5 ? -1 : 1),
      state: inAir ? 'air' : 'water', t: 0,
      sink: rand(26, 46) * sc * (.55 + z * .5),
      swayA: s * rand(14, 30), swayW: rand(.55, 1.05), swayP: rand(0, 6.28),
      pendA: rand(.24, .5), pendW: rand(.6, 1.0), pendP: rand(0, 6.28),
      lean: rand(-.3, .3), bub: rand(.8, 2.4), glint: rand(0, 6), splashed: !inAir, drawX: 0
    };
    if (inAir) {
      p.y = S.camY - h - rand(20, 260);
      p.vy = rand(520, 760) * sc;
    } else {
      p.y = S.camY - h * .6 - rand(0, 140);
      p.vy = p.sink; p.t = rand(2, 4);                   // ya "en régimen" de hundimiento
      p.vr = 0; p.rot = p.lean + rand(-.2, .2);
    }
    p.x0 = p.x;
    pieces.push(p);
    pieces.sort(function (a, b) { return a.z - b.z; });
  }

  function splash(p) {
    var sc = S.vh / 900, power = clamp(p.vy / (1500 * sc), .25, 1);
    var n = Math.round(rand(10, 16) * power * quality) + 3;
    for (var i = 0; i < n; i++) {
      drops.push({
        x: p.x + rand(-1, 1) * p.hh * .35, y: S.seaY,
        vx: rand(-1, 1) * 230 * p.z * sc, vy: -rand(150, 520) * sc * (.35 + power),
        r: rand(1.2, 3.6) * (.6 + p.z * .5), life: 0, max: rand(.55, 1.0)
      });
    }
    ripples.push({ x: p.x, w: p.s * rand(70, 105), age: 0, life: 2.0, d: 0 });
    ripples.push({ x: p.x, w: p.s * rand(105, 150), age: 0, life: 2.4, d: .18 });
    for (var j = 0; j < 7; j++) addBubble(p.x + rand(-1, 1) * p.hh * .4, S.seaY + rand(4, 26), rand(1.8, 4.5) * (.7 + p.z * .4), true);
  }

  function addBubble(x, y, r, fast) {
    if (bubbles.length > 150 * quality) bubbles.shift();
    bubbles.push({
      x: x, y: y, r: r, vy: -(rand(36, 80) + (fast ? 40 : 0)) * (S.vh / 900),
      wob: rand(.8, 2.2), wp: rand(0, 6.28), wa: rand(3, 11), age: 0, born: S.camY
    });
  }

  function updatePiece(p, dt) {
    var sc = S.vh / 900;
    if (p.state === 'air') {
      var vmax = 1900 * sc * (.8 + .3 * p.z);
      p.vy = Math.min(vmax, p.vy + 2300 * sc * dt);
      p.y += p.vy * dt; p.x += p.vx * dt; p.rot += p.vr * dt;
      if (p.y + p.hh * .55 > S.seaY) {                   // impacto
        p.state = 'water'; p.t = 0;
        if (!p.splashed) { splash(p); p.splashed = true; }
        p.rot = ((p.rot + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
        p.vx *= .5; p.x0 = p.x;
        p.vr *= .55; p.vy *= .6;
      }
    } else {
      p.t += dt;
      var kd = 4.5 + Math.abs(p.vy) / (52 * sc);          // arrastre lineal + cuadrático: frena fuerte al entrar
      p.vy = p.sink + (p.vy - p.sink) * Math.exp(-kd * dt);
      p.y += p.vy * dt;
      p.vx *= Math.exp(-1.6 * dt); p.x0 += p.vx * dt;
      p.vr *= Math.exp(-2.4 * dt); p.rot += p.vr * dt;
      p.rot += (p.lean - p.rot) * (1 - Math.exp(-.45 * dt));   // se endereza lentamente
      var ramp = 1 - Math.exp(-p.t * .8);
      p.x = p.x0 + Math.sin(p.t * p.swayW + p.swayP) * p.swayA * ramp;
      // burbujas esporádicas
      p.bub -= dt;
      if (p.bub <= 0 && p.t > .5) {
        p.bub = rand(.9, 2.8) * (S.reduced ? 2 : 1);
        var nb = Math.round(rand(1, 4));
        var a = p.rot + Math.sin(p.t * p.pendW + p.pendP) * p.pendA * ramp;
        for (var i = 0; i < nb; i++) {
          var off = p.hh * rand(.7, .95);
          addBubble(p.x + Math.sin(a) * off + rand(-6, 6), p.y - Math.cos(a) * off, rand(1.6, 5.5) * (.6 + p.z * .5), false);
        }
      }
    }
  }

  function angleOf(p) {
    if (p.state === 'air') return p.rot;
    var ramp = 1 - Math.exp(-p.t * .9);
    return p.rot + Math.sin(p.t * p.pendW + p.pendP) * p.pendA * ramp;
  }

  function drawPiece(p, variant, sx, sy, ang, alpha) {
    var sp = G.Pieces.sprite(p.name, p.color, variant);
    var kk = spriteScale;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(sx, sy); ctx.rotate(ang); ctx.scale(p.s * S.z, p.s * S.z);
    var P = G.Pieces.PAD, hdef = G.Pieces.defs[p.name].h;
    ctx.drawImage(sp, -(P + 60), -(P + 236 - hdef / 2), sp.width / kk, sp.height / kk);
    ctx.restore();
  }

  function renderPieces(seaS) {
    var vh = S.vh, vw = S.vw, z = S.z;
    for (var i = 0; i < pieces.length; i++) {
      var p = pieces[i];
      var sy = (p.y - S.camY) * z, sx = (p.x - S.offX) * z, R = (p.hh * 1.3 + p.s * 18) * z;
      if (sy + R < 0 || sy - R > vh || sx < -R || sx > vw + R) continue;
      var ang = angleOf(p);
      var depthF = clamp((p.y - S.seaY) / (S.H * .55), 0, 1);
      var fade = 1 - clamp((p.y - S.H * .90) / (S.H * .06), 0, 1);
      var far = p.z < .85 ? .88 : 1;
      var aW = (1 - .5 * depthF) * fade * far;

      if (sy + R > seaS && sy - R < seaS) {                    // atraviesa la superficie: mitad plata / mitad agua
        ctx.save(); ctx.beginPath(); ctx.rect(-50, -50, vw + 100, seaS + 50); ctx.clip();
        drawPiece(p, 'air', sx, sy, ang, 1); ctx.restore();
        ctx.save(); ctx.beginPath(); ctx.rect(-50, seaS, vw + 100, vh); ctx.clip();
        drawPiece(p, 'water', sx, sy, ang, aW); ctx.restore();
      } else if (sy - R >= seaS) {
        drawPiece(p, 'water', sx, sy, ang, aW);
      } else {
        if (p.state === 'air' && p.vy > 900 * (vh / 900)) {   // estela de velocidad
          var tr = Math.min(1, p.vy / (2200 * vh / 900));
          drawPiece(p, 'air', sx, sy - p.vy * z * .020, ang, .13 * tr);
          drawPiece(p, 'air', sx, sy - p.vy * z * .040, ang, .07 * tr);
        }
        drawPiece(p, 'air', sx, sy, ang, 1);
      }

      // destello ocasional (solo piezas cercanas)
      if (p.z > .9) {
        var g = Math.sin(clock * .9 + p.glint); g = g > .93 ? (g - .93) / .07 : 0;
        if (g > 0) {
          var gx = sx + (Math.cos(ang) * -p.s * 14 + Math.sin(ang) * -p.hh * .35) * z;
          var gy = sy + (Math.sin(ang) * -p.s * 14 - Math.cos(ang) * p.hh * .35) * z;
          var gs = p.s * z * 46 * (.5 + g * .5);
          ctx.globalAlpha = g * .9; ctx.drawImage(sprites.glint, gx - gs / 2, gy - gs / 2, gs, gs); ctx.globalAlpha = 1;
        }
      }
    }
  }

  /* ---------- Frame ---------- */
  function update(dt) {
    clock += dt;
    // generación de piezas
    spawnTimer -= dt;
    var maxN = Math.round((S.vw < 700 ? 7 : 11) * quality);
    var live = 0, lim = S.camY + S.vh / S.z * 1.1;          // las que ya quedaron muy abajo no cuentan para el tope
    for (var q = 0; q < pieces.length; q++) if (pieces[q].y < lim) live++;
    if (spawnTimer <= 0 && live < maxN) {
      spawn(false);
      if (introLeft > 0) { introSpawned++; spawnTimer = rand(.35, .7); introLeft -= spawnTimer; }
      else spawnTimer = rand(1.0, 2.2) * (S.depth > 3 ? .85 : 1);
    } else if (spawnTimer <= 0) spawnTimer = .4;

    for (var i = pieces.length - 1; i >= 0; i--) {
      var p = pieces[i];
      updatePiece(p, dt);
      if (p.y - p.hh > S.camY + S.vh / S.z * 2.2 || p.y > S.H * .965) pieces.splice(i, 1);
    }
    for (var b = bubbles.length - 1; b >= 0; b--) {
      var bb = bubbles[b]; bb.age += dt;
      bb.y += bb.vy * dt; bb.x += Math.sin(bb.age * bb.wob * 2 + bb.wp) * bb.wa * dt;
      bb.vy *= 1 + .05 * dt;
      if (bb.y < S.seaY + 2) {                               // revienta en la superficie
        if (bb.r > 2.6) ripples.push({ x: bb.x, w: bb.r * 9, age: 0, life: 1.1, d: 0, small: true });
        bubbles.splice(b, 1);
      } else if (bb.y - S.camY < -60 && S.camY > S.seaY) bubbles.splice(b, 1);
    }
    for (var d = drops.length - 1; d >= 0; d--) {
      var dr = drops[d]; dr.life += dt; dr.vy += 1500 * (S.vh / 900) * dt; dr.x += dr.vx * dt; dr.y += dr.vy * dt;
      if (dr.life > dr.max || dr.y > S.seaY + 4 && dr.vy > 0) drops.splice(d, 1);
    }
    for (var r = ripples.length - 1; r >= 0; r--) { ripples[r].age += dt; if (ripples[r].age > ripples[r].life + ripples[r].d) ripples.splice(r, 1); }
  }

  function render() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cw, ch);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var z = S.z, seaS = (S.seaY - S.camY) * z, vw = S.vw, vh = S.vh;

    // nieve marina
    if (seaS < vh) {
      var a0 = clamp((vh - seaS) / (vh * .6), 0, 1) * .55;
      ctx.fillStyle = '#bff3ff';
      for (var i = 0; i < snow.length; i++) {
        var sn = snow[i];
        var yy = ((sn.y * vh * 1.4 - S.camY * sn.p) % (vh * 1.4) + vh * 1.4) % (vh * 1.4) - vh * .2;
        if (yy < seaS + 6) continue;
        var xx = sn.x * vw + Math.sin(clock * sn.w + sn.ph) * 14;
        ctx.globalAlpha = a0 * (.4 + .6 * Math.abs(Math.sin(clock * .7 + sn.ph)));
        ctx.beginPath(); ctx.arc(xx, yy, sn.r, 0, 6.283); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    renderPieces(seaS);

    // burbujas
    var bs = sprites.bubble;
    for (var b = 0; b < bubbles.length; b++) {
      var bb = bubbles[b], by = (bb.y - S.camY) * z, bx = (bb.x - S.offX) * z, br = bb.r * z;
      if (by < -20 || by > vh + 20) continue;
      var near = clamp((by - seaS) / 40, 0, 1);              // se desvanecen al tocar la superficie
      ctx.globalAlpha = (.85 * near);
      ctx.drawImage(bs, bx - br, by - br, br * 2, br * 2);
    }
    ctx.globalAlpha = 1;

    // gotas del splash
    if (seaS > -40 && seaS < vh + 40) {
      for (var d = 0; d < drops.length; d++) {
        var dr = drops[d], a = 1 - dr.life / dr.max;
        ctx.fillStyle = 'rgba(225,246,255,' + (.85 * a).toFixed(3) + ')';
        ctx.beginPath(); ctx.arc((dr.x - S.offX) * z, (dr.y - S.camY) * z, dr.r * z, 0, 6.283); ctx.fill();
      }
      // ondas en la superficie
      for (var r = 0; r < ripples.length; r++) {
        var rp = ripples[r], t = (rp.age - rp.d) / rp.life;
        if (t < 0) continue;
        var e = 1 - Math.pow(1 - t, 2.2), rx = rp.w * e * z, ry = rx * .13 + 1;
        ctx.strokeStyle = 'rgba(205,243,255,' + (((1 - t) * (rp.small ? .5 : .85))).toFixed(3) + ')';
        ctx.lineWidth = (rp.small ? 1 : 2.2) * (1 - t) + .4;
        ctx.beginPath(); ctx.ellipse((rp.x - S.offX) * z, seaS + 2, rx, ry, 0, 0, 6.283); ctx.stroke();
      }
    }
  }

  /* ---------- Bucle principal ---------- */
  var last = 0, running = false;
  function tick(ts) {
    requestAnimationFrame(tick);
    var dt = Math.min(.05, (ts - last) / 1000 || .016); last = ts;
    S.scrollY = window.pageYOffset || 0;
    applyCamera();
    if (G.UI) G.UI.frame(dt);
    update(dt);
    render();
    // calidad adaptativa: si el promedio supera ~26 ms, bajar resolución y cantidad
    perfAcc += dt; perfN++;
    if (perfN >= 90) {
      var avg = perfAcc / perfN; perfAcc = 0; perfN = 0;
      if (avg > .026 && quality > .55) { quality = Math.max(.55, quality * .8); layout(true); }
    }
  }

  G.Sea = {
    depthAt: function (sy) { return depthOf(camState(sy)); },
    init: function () {
      canvas = document.getElementById('sea');
      ctx = canvas.getContext('2d');
      sceneEl = document.getElementById('scene');
      fogEl = document.getElementById('fog');
      S.reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      layout(true);
      var rt; window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(function () { layout(false); if (G.UI) G.UI.measure(); }, 120); });
      spawnTimer = .55;
      if (S.reduced) { introLeft = 0; }
      if (!running) { running = true; requestAnimationFrame(function (t) { last = t; tick(t); }); }
    },
    relayout: function () { layout(true); }
  };
})(window.GC = window.GC || {});
