/* ============================================================
   Gambito Clandestino — interfaz ligada al scroll
   · Cada bloque entra por un lado y se desvanece al salir
   · Profundímetro (progreso + navegación)
   · Contador 0 → TOTAL_MEMBERS
   Una sola lectura de layout en measure(); por frame solo se
   escriben transform/opacity (sin forzar reflow).
   ============================================================ */
(function (G) {
  'use strict';

  var S = G.state;
  var clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };

  var items = [];            // {el, top, h, dir, d, last:{x,o}}
  var secs = [];             // secciones para el profundímetro
  var hero, cue, gauge, badge, fill, marks = [];
  var counterTop = 0, counterEl, tensEl, unitsEl, pips = [], lastCount = -1;  
  var MEMBERS = [
    ['Maestro Chu', 'MF Referente y panzón', 'king'], ['MI Ganzo', 'Clandestino´s best one', 'knight'], 
    ['Alvaro T', 'El profe', 'rook'],
    ['M Julio', 'El fantasma de Purén', 'knight'], ['JC', 'Leyenda porteña', 'king'],
    ['Sergenevich', 'Entusiastas anécdotas', 'bishop'], ['Pedro', 'El papá de Maxi', 'knight'],
    ['Master Iván', 'Papá pitufo', 'bishop'], ['Alejandro', 'Choro del puerto', 'knight'],
    ['Paolo', 'La promesa', 'pawn'], ['Godoy', 'El mejor', 'rook'],
    ['Claudio G', 'El constructor del tablero', 'rook'], ['Claudio M', 'Faith no More', 'pawn'],
    ['Malú', 'The queen', 'queen'], ['Gino', 'From L.A.', 'pawn'], 
    ['Héctor', 'Te busca Aquiles', 'bishop'],
    ['Miguel', 'El pastor', 'bishop'], ['Pataldo', 'Todo en ley', 'pawn'], 
    ['EdUTroN', 'Guitarriemos', 'king'], ['Patorzún', 'A casa vamos', 'knight'], 
    ['Elías', 'Con todo', 'rook'], ['Nicolás', 'Clandestino romántico', 'pawn'], 
    ['Gabo', 'Mejorando día a día', 'bishop'], ['Salva', 'No te confíes', 'knight'],
    ['Maxi', 'Inquieta promesa', 'pawn']
  ];
  var TOTAL_MEMBERS = MEMBERS.length;

  var SECTIONS = [
    ['superficie', 'Superficie'], ['quienes', 'Quiénes somos'], ['mision', 'Misión'],
    ['escudo', 'Significado de<br>nuestro escudo'],
    ['integrantes', 'Integrantes'], ['actividades', 'Actividades'], ['fondo', 'Ubicación']
  ];

  /* ---------- Iconos de piezas (misma silueta que el canvas) ---------- */
  var VB = { knight: '16 28 100 212', king: '16 12 88 228', queen: '16 36 88 204', bishop: '16 50 88 190', rook: '16 92 88 148', pawn: '16 104 88 136' };
  function icon(name) {
    var d = G.Pieces.defs[name], p = d.d, g;
    if (d.full) g = '<path d="' + p + '"/>';
    else {
      g = '<path transform="translate(60 0)" d="' + p + '"/><path transform="translate(60 0) scale(-1 1)" d="' + p + '"/>';
      d.balls.forEach(function (b) {
        g += '<circle cx="' + (60 + b[0]) + '" cy="' + b[1] + '" r="' + b[2] + '"/>';
        if (b[0]) g += '<circle cx="' + (60 - b[0]) + '" cy="' + b[1] + '" r="' + b[2] + '"/>';
      });
    }
    return '<svg viewBox="' + VB[name] + '" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true" focusable="false">' + g + '</svg>';
  }

  /* ---------- Construcción de DOM ---------- */
  function build() {
    document.querySelectorAll('[data-piece]').forEach(function (el) { el.innerHTML = icon(el.getAttribute('data-piece')); });

    var roster = document.getElementById('roster');
    MEMBERS.forEach(function (m) {
      var li = document.createElement('li');
      li.className = 'rost rv' + (m[2] === 'king' ? ' rost--king' : '');
      li.innerHTML = '<span class="rost__ico">' + icon(m[2]) + '</span><span><span class="rost__name">' + m[0] + '</span><span class="rost__role">' + m[1] + '</span></span>';
      roster.appendChild(li);
    });

    // contador
    tensEl = document.getElementById('dTens'); unitsEl = document.getElementById('dUnits');
    counterEl = document.getElementById('counterBox');
    var i, s = '';
    for (i = 0; i <= Math.floor(TOTAL_MEMBERS / 10); i++) s += '<b>' + i + '</b>'; tensEl.innerHTML = s;
    s = ''; for (i = 0; i <= 9; i++) s += '<b>' + i + '</b>'; unitsEl.innerHTML = s;
    var pipsEl = document.getElementById('pips');
    for (i = 0; i < TOTAL_MEMBERS; i++) { var li2 = document.createElement('li'); li2.innerHTML = icon('pawn'); pipsEl.appendChild(li2); pips.push(li2); }

    // profundímetro
    var ol = document.getElementById('gaugeMarks');
    SECTIONS.forEach(function (sc) {
      var li3 = document.createElement('li');
      li3.innerHTML = '<button type="button" data-id="' + sc[0] + '">' + sc[1] + '<small></small></button>';
      ol.appendChild(li3);
      marks.push({ li: li3, btn: li3.firstChild, small: li3.querySelector('small'), id: sc[0], target: 0 });
    });
    ol.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      var m = marks.filter(function (x) { return x.id === b.getAttribute('data-id'); })[0];
      window.scrollTo({ top: m.target, behavior: S.reduced ? 'auto' : 'smooth' });
    });

    hero = document.querySelector('[data-hero]');
    cue = document.getElementById('cue');
    gauge = document.getElementById('gauge');
    badge = document.getElementById('gaugeBadge');
    fill = document.getElementById('gaugeFill');
  }

  /* ---------- Medición (se llama pocas veces) ---------- */
  function measure() {
    var sy = window.scrollY || 0, vw = window.innerWidth;
    S.maxScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);

    items.length = 0;
    document.querySelectorAll('.rv').forEach(function (el) {
      var r = el.getBoundingClientRect();
      var from = el.getAttribute('data-from');
      if (el.classList.contains('rost')) {                     // offsetLeft no se ve afectado por el translate actual
        var op = el.offsetParent || document.body;
        from = (el.offsetLeft + el.offsetWidth / 2) < op.clientWidth / 2 ? 'l' : 'r';
      }
      items.push({
        el: el, top: r.top + sy, h: r.height, dir: from === 'r' ? 1 : from === 'l' ? -1 : 0,
        d: parseFloat(el.getAttribute('data-d')) || 0, tx: -9999, o: -1
      });
    });

    var vh = window.innerHeight;
    secs = SECTIONS.map(function (sc) {
      var el = document.getElementById(sc[0]), r = el.getBoundingClientRect();
      return { id: sc[0], top: r.top + sy, h: r.height };
    });
    marks.forEach(function (m, i) {
      var s = secs[i];
      m.target = i === 0 ? 0 : clamp(s.top + s.h / 2 - vh / 2, 0, S.maxScroll);
      if (i === secs.length - 1) m.target = S.maxScroll;
      m.li.style.top = (m.target / S.maxScroll * 100).toFixed(2) + '%';
      m.small.textContent = Math.round(G.Sea.depthAt(m.target)) + ' m';
      m.s = s;
    });

    var cr = counterEl.getBoundingClientRect();
    counterTop = cr.top + sy;
  }

  /* ---------- Contador ---------- */
  function setCount(v) {
    if (v === lastCount) return;
    lastCount = v;
    tensEl.style.transform = 'translateY(' + (-Math.floor(v / 10) * 1.12).toFixed(2) + 'em)';
    unitsEl.style.transform = 'translateY(' + (-(v % 10) * 1.12).toFixed(2) + 'em)';
    for (var i = 0; i < TOTAL_MEMBERS; i++) pips[i].classList.toggle('on', i < v);
    counterEl.classList.toggle('is-full', v === TOTAL_MEMBERS);
  }

  /* ---------- Frame ---------- */
  var lastY = -1, vhNow = 0, lastDepth = '';
  function frame() {
    var sy = window.scrollY || window.pageYOffset || 0;
    S.scrollY = sy;
    var vh = window.innerHeight, vw = window.innerWidth;
    var dist = Math.min(vw * .55, 640);
    var reduced = S.reduced;

    // bloques laterales
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      var top = it.top - sy;
      if (top > vh * 1.6 || top + it.h < -vh * .6) {                 // lejos: oculto sin tocar más
        if (it.o !== 0) { it.o = 0; it.el.style.opacity = 0; it.el.style.visibility = 'hidden'; }
        continue;
      }
      var raw = (vh * .96 - top - it.d * vh) / (vh * .44);
      var e = clamp(raw, 0, 1); e = 1 - Math.pow(1 - e, 3);
      var x = clamp((top + it.h) / (vh * .3), 0, 1);                   // fadeOut al salir por arriba
      var o = e * (x * x * (3 - 2 * x));
      var tx = reduced ? 0 : (1 - e) * it.dir * dist;
      if (Math.abs(o - it.o) > .004 || Math.abs(tx - it.tx) > .4) {
        it.o = o; it.tx = tx;
        var st = it.el.style;
        st.opacity = o.toFixed(3);
        st.transform = tx ? 'translate3d(' + tx.toFixed(1) + 'px,0,0)' : '';
        st.visibility = o < .004 ? 'hidden' : '';
      }
    }

    // portada: se disuelve al descender
    var hf = clamp(sy / (vh * .55), 0, 1);
    hero.style.opacity = (1 - hf).toFixed(3);
    hero.style.transform = 'translate3d(0,' + (-sy * .18).toFixed(1) + 'px,0) scale(' + (1 - hf * .06).toFixed(3) + ')';
    cue.classList.toggle('is-gone', sy > vh * .1);
    gauge.classList.toggle('is-on', true);

    // profundímetro
    var p = clamp(sy / S.maxScroll, 0, 1);
    badge.style.top = (p * 100).toFixed(2) + '%';
    fill.style.height = (p * 100).toFixed(2) + '%';
    var dtxt = Math.round(S.depth) + ' m';
    if (dtxt !== lastDepth) { lastDepth = dtxt; badge.textContent = dtxt; }
    if (Math.abs(sy - lastY) > 1 || vh !== vhNow) {
      var cur = 0;
      for (var m = 0; m < secs.length; m++) if (secs[m].top <= sy + vh * .5) cur = m;
      for (var k = 0; k < marks.length; k++) marks[k].li.classList.toggle('is-cur', k === cur);
      lastY = sy; vhNow = vh;
    }

    // contador 0 → TOTAL_MEMBERS según el scroll
    var start = counterTop - vh * .95, end = Math.max(start + vh * .35, S.maxScroll - vh * .06);
    setCount(Math.round(TOTAL_MEMBERS * clamp((sy - start) / (end - start), 0, 1)));
  }

  G.UI = {
    measure: measure, frame: frame,
    init: function () {
      build();
      measure();
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(measure);
      window.addEventListener('load', function () { measure(); setTimeout(measure, 600); });
      if ('ResizeObserver' in window) { new ResizeObserver(function () { measure(); }).observe(document.getElementById('content')); }
    }
  };

  G.Sea.init();
  G.UI.init();
})(window.GC = window.GC || {});
