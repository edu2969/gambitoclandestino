/* Parche móvil: encierra la escena en un marco que recorta (evita que el navegador
   amplíe el viewport al 200 %). El recorte de los bloques laterales lo hace mobile-patch.css. */
(function () {
  'use strict';
  var mq = window.matchMedia('(max-width: 820px), (pointer: coarse) and (max-width: 1100px)');
  function wrap() {
    if (!mq.matches) return;
    var scene = document.getElementById('scene');
    if (!scene || scene.parentNode.id === 'sceneWrap') return;
    var w = document.createElement('div');
    w.id = 'sceneWrap'; w.setAttribute('aria-hidden', 'true');
    scene.parentNode.insertBefore(w, scene); w.appendChild(scene);
  }
  wrap();
  if (mq.addEventListener) mq.addEventListener('change', wrap);
  window.addEventListener('orientationchange', function () { setTimeout(wrap, 50); });

})();
