/* ============================================================
   Gambito Clandestino — piezas vectoriales
   Cada pieza es un Path2D (media silueta espejada) que se
   pre-renderiza UNA vez a un sprite (aire / agua). Después el
   motor solo hace drawImage → barato y nítido.
   ============================================================ */
(function (G) {
  'use strict';

  var W = 120, H = 240, PAD = 14;           // lienzo lógico de cada pieza
  var CX = 60;

  // Base común (plinto) — mitad derecha, coordenadas dx desde el eje
  var BASE = 'M0 236 L37 236 Q41 236 41 232 L41 228 Q41 224 37 224 L31 224 Q31 220 27 218 ';

  // Cada pieza: path de la mitad derecha, anillos decorativos (y), y extras
  var DEFS = {
    pawn: {
      h: 126,
      d: BASE + 'C22 210 17 196 15 178 C14 172 14 168 14 163 L26 163 Q29 163 29 160 L29 156 Q29 153 26 153 L14 153 L14 149 A22 22 0 0 0 0 110',
      rings: [224, 218, 162, 153],
      balls: []
    },
    rook: {
      h: 140,
      d: BASE + 'C23 206 20 192 20 168 L20 142 L29 136 L29 128 L33 125 L33 98 L21 98 L21 110 L11 110 L11 98 L0 98',
      rings: [224, 218, 142, 134, 127],
      balls: []
    },
    bishop: {
      h: 182,
      d: BASE + 'C22 206 17 192 15 176 C14 170 14 167 14 162 L26 162 Q29 162 29 159 L29 155 Q29 152 26 152 L14 152 L14 148 C33 142 35 110 17 86 C13 80 11 76 9 71 L7 66 A8 8 0 0 0 0 54',
      rings: [224, 218, 162, 152, 74],
      balls: [],
      slit: true
    },
    queen: {
      h: 198,
      d: BASE + 'C22 206 16 192 14 172 C13 164 13 158 13 154 L25 154 Q28 154 28 151 L28 147 Q28 144 25 144 L13 144 C15 130 24 116 28 98 L32 90 L33 64 L24 79 L16 56 L8 74 L0 50',
      rings: [224, 218, 154, 144, 92],
      balls: [[33, 61, 5], [16, 53, 5], [0, 45, 6]]
    },
    king: {
      h: 220,
      d: BASE + 'C22 206 16 192 14 172 C13 164 13 158 13 154 L25 154 Q28 154 28 151 L28 147 Q28 144 25 144 L13 144 C15 130 24 116 28 98 L31 92 L31 84 C31 70 21 63 7 61 L7 43 L19 43 L19 32 L7 32 L7 20 L0 20',
      rings: [224, 218, 154, 144, 90, 84],
      balls: []
    },
    knight: {
      h: 190,
      full: true,   // silueta completa (no espejada)
      d: 'M20 236 L100 236 Q104 236 104 232 L104 228 Q104 224 100 224 L91 224 Q91 220 87 218 ' +
         'C90 204 92 190 88 176 C84 164 76 158 72 150 C70 144 74 140 80 138 C86 138 90 140 94 140 ' +
         'C101 140 108 134 110 124 C111 116 108 110 102 106 C96 102 92 98 88 92 C84 86 82 78 80 70 ' +
         'L80 58 L78 34 L66 54 C60 56 52 62 46 74 C36 92 32 118 32 142 C32 160 28 176 32 192 ' +
         'C34 204 30 214 27 224 L26 224 Q20 226 20 232 Z',
      rings: [224, 218],
      balls: []
    }
  };

  var cache = {};

  function buildPath(def) {
    var p = new Path2D();
    var half = new Path2D(def.d);
    if (def.full) {
      p.addPath(half, new DOMMatrix().translate(0, 0));
      return p;
    }
    p.addPath(half, new DOMMatrix().translate(CX, 0));
    p.addPath(half, new DOMMatrix().translate(CX, 0).scale(-1, 1).translateSelf(0, 0));
    for (var i = 0; i < def.balls.length; i++) {
      var b = def.balls[i];
      var c1 = new Path2D(); c1.arc(CX + b[0], b[1], b[2], 0, Math.PI * 2);
      p.addPath(c1);
      if (b[0] !== 0) { var c2 = new Path2D(); c2.arc(CX - b[0], b[1], b[2], 0, Math.PI * 2); p.addPath(c2); }
    }
    return p;
  }

  // Estilos por color (plata, blanco, negro) y entorno (aire / agua)
  var STYLES = {
    silver: {
      air: {
        stops: [[0, '#30343a'], [.08, '#e6eaef'], [.22, '#ffffff'], [.4, '#c9ced5'], [.58, '#737a83'],
                [.8, '#262a30'], [.92, '#7a828c'], [1, '#2a2d33']],
        rim: 'rgba(226,232,240,.95)', glow: 'rgba(205,225,255,.55)', line: '#ffffff', shade: 'rgba(0,0,0,.55)'
      },
      water: {
        stops: [[0, '#0a2a38'], [.08, '#9adbea'], [.22, '#eafcff'], [.4, '#7fbccd'], [.58, '#2a6275'],
                [.8, '#0b2733'], [.92, '#4a9db3'], [1, '#0b2733']],
        rim: 'rgba(150,230,250,.9)', glow: 'rgba(90,220,255,.5)', line: '#d4f8ff', shade: 'rgba(0,12,20,.6)'
      }
    },
    white: {
      air: {
        stops: [[0, '#8e959e'], [.07, '#ffffff'], [.26, '#ffffff'], [.46, '#eef1f4'], [.64, '#bcc3cc'],
                [.82, '#8c939d'], [.93, '#e2e7ec'], [1, '#9aa1ab']],
        rim: 'rgba(255,255,255,.98)', glow: 'rgba(255,255,255,.65)', line: '#ffffff', shade: 'rgba(55,65,80,.5)'
      },
      water: {
        stops: [[0, '#2f6070'], [.07, '#d4f6fc'], [.24, '#f6feff'], [.42, '#c4e8ef'], [.6, '#86b9c7'],
                [.82, '#4f8999'], [.93, '#acdde8'], [1, '#3b6e7d']],
        rim: 'rgba(190,240,252,.95)', glow: 'rgba(150,235,255,.6)', line: '#f2feff', shade: 'rgba(10,50,65,.5)'
      }
    },
    black: {
      air: {
        stops: [[0, '#050607'], [.08, '#4b5159'], [.2, '#959ca6'], [.36, '#2a2e34'], [.58, '#0d0e11'],
                [.8, '#050506'], [.92, '#3d424a'], [1, '#08090b']],
        rim: 'rgba(214,222,232,.92)', glow: 'rgba(170,190,225,.45)', line: '#d3dae3', shade: 'rgba(0,0,0,.75)'
      },
      water: {
        stops: [[0, '#020a10'], [.08, '#2d5868'], [.2, '#68a2b4'], [.36, '#14323d'], [.58, '#06151c'],
                [.8, '#020a0f'], [.92, '#264f5e'], [1, '#040d13']],
        rim: 'rgba(135,218,238,.88)', glow: 'rgba(90,210,245,.45)', line: '#bfeaf5', shade: 'rgba(0,8,14,.75)'
      }
    }
  };

  function gradientFor(ctx, def, st) {
    var x0 = def.full ? 20 : 18, x1 = def.full ? 110 : 102;
    var g = ctx.createLinearGradient(x0, 0, x1, 0);
    st.stops.forEach(function (s) { g.addColorStop(s[0], s[1]); });
    return g;
  }

  function renderSprite(name, color, variant, scale) {
    var def = DEFS[name], st = STYLES[color][variant];
    var cv = document.createElement('canvas');
    cv.width = Math.ceil((W + PAD * 2) * scale);
    cv.height = Math.ceil((H + PAD * 2) * scale);
    var ctx = cv.getContext('2d');
    ctx.scale(scale, scale);
    ctx.translate(PAD, PAD);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    var path = buildPath(def);

    // 1) halo exterior (brillo)
    ctx.save();
    ctx.shadowColor = st.glow; ctx.shadowBlur = 12 * scale; // blur en px reales
    ctx.fillStyle = '#000';
    ctx.fill(path);
    ctx.restore();

    // 2) borde de luz exterior (plata, como el contorno del logo)
    ctx.strokeStyle = st.rim; ctx.lineWidth = 3.4;
    ctx.stroke(path);

    // 3) cuerpo metálico
    ctx.fillStyle = gradientFor(ctx, def, st);
    ctx.fill(path);

    // 4) detalles recortados a la silueta
    ctx.save();
    ctx.clip(path);

    // sombra vertical suave en la base de cada tramo
    var vg = ctx.createLinearGradient(0, 0, 0, H);
    vg.addColorStop(0, 'rgba(255,255,255,.10)');
    vg.addColorStop(.55, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,.38)');
    ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);

    // anillos (collares): filo claro + sombra
    var x0 = 0, x1 = W;
    def.rings.forEach(function (y) {
      ctx.strokeStyle = st.shade; ctx.lineWidth = 3.2;
      ctx.beginPath(); ctx.moveTo(x0, y + 2.2); ctx.lineTo(x1, y + 2.2); ctx.stroke();
      ctx.strokeStyle = st.line; ctx.globalAlpha = .85; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(x0, y - .6); ctx.lineTo(x1, y - .6); ctx.stroke();
      ctx.globalAlpha = 1;
    });

    // ranura del alfil
    if (def.slit) {
      ctx.strokeStyle = 'rgba(0,0,0,.85)'; ctx.lineWidth = 4.6;
      ctx.beginPath(); ctx.moveTo(CX + 22, 98); ctx.lineTo(CX - 8, 116); ctx.stroke();
      ctx.strokeStyle = st.line; ctx.globalAlpha = .7; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(CX + 22, 94.5); ctx.lineTo(CX - 8, 112.5); ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // brillo especular vertical (franja izquierda)
    if (!def.full) {
      var sg = ctx.createLinearGradient(CX - 17, 0, CX - 8, 0);
      sg.addColorStop(0, 'rgba(255,255,255,0)');
      sg.addColorStop(.5, 'rgba(255,255,255,.55)');
      sg.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = sg;
      ctx.fillRect(CX - 17, 240 - def.h + 16, 9, def.h - 40);
    }

    // caballo: crines, ojo, fosa nasal
    if (name === 'knight') {
      ctx.strokeStyle = st.line; ctx.globalAlpha = .8; ctx.lineWidth = 1.5;
      [[56, 70, 40, 100, 38, 132, 40, 150], [62, 78, 50, 104, 46, 134, 48, 160], [68, 88, 58, 110, 56, 138, 58, 170]]
        .forEach(function (m) {
          ctx.beginPath(); ctx.moveTo(m[0], m[1]); ctx.bezierCurveTo(m[2], m[3], m[4], m[5], m[6], m[7]); ctx.stroke();
        });
      ctx.strokeStyle = st.shade; ctx.globalAlpha = .9; ctx.lineWidth = 2.4;
      [[60, 74, 45, 100, 42, 132, 44, 152], [66, 82, 54, 106, 51, 136, 53, 164]]
        .forEach(function (m) {
          ctx.beginPath(); ctx.moveTo(m[0] + 3, m[1] + 2); ctx.bezierCurveTo(m[2] + 3, m[3], m[4] + 3, m[5], m[6] + 3, m[7]); ctx.stroke();
        });
      ctx.globalAlpha = 1;
      // ojo
      ctx.fillStyle = '#05070a';
      ctx.beginPath(); ctx.ellipse(79, 91, 4.6, 2.6, .55, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = st.line; ctx.beginPath(); ctx.arc(80.5, 90.2, 1, 0, Math.PI * 2); ctx.fill();
      // nariz
      ctx.fillStyle = 'rgba(0,0,0,.8)';
      ctx.beginPath(); ctx.ellipse(104, 117, 1.8, 3, -.4, 0, Math.PI * 2); ctx.fill();
      // línea de la boca
      ctx.strokeStyle = 'rgba(0,0,0,.7)'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(109, 127); ctx.quadraticCurveTo(99, 128, 93, 137); ctx.stroke();
    }
    ctx.restore();

    // 5) contorno oscuro fino (define la forma sobre el borde de luz)
    ctx.strokeStyle = 'rgba(4,6,9,.92)'; ctx.lineWidth = 1.5;
    ctx.stroke(path);

    return cv;
  }

  // Destello en cruz (se dibuja encima de las piezas cercanas)
  function renderGlint() {
    var s = 64, cv = document.createElement('canvas'); cv.width = cv.height = s;
    var c = cv.getContext('2d'); c.translate(s / 2, s / 2);
    var g = c.createRadialGradient(0, 0, 0, 0, 0, s / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(.25, 'rgba(255,255,255,.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g; c.beginPath(); c.arc(0, 0, s / 2, 0, 7); c.fill();
    c.fillStyle = 'rgba(255,255,255,.95)';
    [[0, 1], [Math.PI / 2, 1]].forEach(function (a) {
      c.save(); c.rotate(a[0]);
      c.beginPath(); c.moveTo(-s / 2, 0); c.quadraticCurveTo(0, -1.4, s / 2, 0); c.quadraticCurveTo(0, 1.4, -s / 2, 0); c.fill();
      c.restore();
    });
    return cv;
  }

  // Burbuja (sprite único, se escala)
  function renderBubble() {
    var s = 96, cv = document.createElement('canvas'); cv.width = cv.height = s;
    var c = cv.getContext('2d'), r = s / 2 - 3;
    var g = c.createRadialGradient(s * .42, s * .38, r * .1, s / 2, s / 2, r);
    g.addColorStop(0, 'rgba(230,250,255,.28)'); g.addColorStop(.7, 'rgba(120,210,240,.08)'); g.addColorStop(1, 'rgba(160,235,255,.30)');
    c.fillStyle = g; c.beginPath(); c.arc(s / 2, s / 2, r, 0, 7); c.fill();
    c.strokeStyle = 'rgba(200,245,255,.75)'; c.lineWidth = 3; c.beginPath(); c.arc(s / 2, s / 2, r, 0, 7); c.stroke();
    c.fillStyle = 'rgba(255,255,255,.9)'; c.beginPath(); c.ellipse(s * .35, s * .32, r * .2, r * .11, -.7, 0, 7); c.fill();
    c.fillStyle = 'rgba(255,255,255,.35)'; c.beginPath(); c.arc(s * .66, s * .68, r * .07, 0, 7); c.fill();
    return cv;
  }

  var scaleNow = 2, queue = [];
  function warm() {                                   // precalienta en ratos libres para evitar tirones
    var job = queue.shift(); if (!job) return;
    G.Pieces.sprite(job[0], job[1], job[2]);
    (window.requestIdleCallback || function (f) { setTimeout(f, 60); })(warm);
  }

  G.Pieces = {
    names: ['pawn', 'rook', 'knight', 'bishop', 'queen', 'king'],
    colors: ['silver', 'white', 'black'],
    defs: DEFS, W: W, H: H, PAD: PAD,
    // escala: píxeles de sprite por unidad lógica
    build: function (scale) {
      cache = {}; scaleNow = scale; queue = [];
      cache.glint = renderGlint();
      cache.bubble = renderBubble();
      cache.scale = scale;
      var self = this;
      this.colors.forEach(function (c) { self.names.forEach(function (n) { ['air', 'water'].forEach(function (v) { queue.push([n, c, v]); }); }); });
      (window.requestIdleCallback || function (f) { setTimeout(f, 300); })(warm);
      return cache;
    },
    // sprite bajo demanda (se crea la primera vez que se necesita)
    sprite: function (name, color, variant) {
      var k = name + '|' + color + '|' + variant;
      return cache[k] || (cache[k] = renderSprite(name, color, variant, scaleNow));
    },
    get: function () { return cache; }
  };
})(window.GC = window.GC || {});
