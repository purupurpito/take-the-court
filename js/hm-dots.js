/* TAKE THE COURT — js/hm-dots.js (owner: ui_main)
 * Medidor del golpe «Puntos» (27-nov-2026): minimalista para pantallas pequeñas. Fila de 7 puntos, de muy pronto (izquierda)
 * a muy tarde (derecha). Los de la zona Perfecto en verde, los de Bien en blanco y los de fuera en naranja, apagados; el
 * punto donde cae la pulsación se enciende grande, del color de su zona (dorado si es Perfecto, como la marca de la Barra).
 * El reparto sale de d.pf y d.gd: cada punto cubre 1/7 del recorrido y toma la zona de su centro.
 */
(function () {
  'use strict';
  var VB = window.VB;
  if (!VB || !VB.HitMeter) return;
  var N = 7, RANK = { pf: 0, gd: 1, ms: 2 };
  // zona de cada punto según su centro en [-1, 1]; siempre hay al menos un verde en medio y un naranja en cada punta
  function zoneOf(i, d) {
    var c = Math.abs(-1 + (2 * i + 1) / N);
    if (i === (N - 1) / 2 || c <= d.pf) return 'pf';
    if (i === 0 || i === N - 1) return 'ms';
    return c <= d.gd ? 'gd' : 'ms';
  }
  VB.HitMeter.add('dots', {
    name: 'Puntos', size: { w: 115, h: 18 },
    css: '.hm-dots{display:flex;align-items:center;width:115px;height:18px;padding:0 5px;box-sizing:border-box;border-radius:9px;' +
        'background:rgba(8,13,24,.8);box-shadow:0 0 0 2px #0b1020,0 0 0 3px rgba(255,255,255,.32),0 3px 7px rgba(0,0,0,.45)}' +
      // cada <i> es una casilla; el punto es su ::before
      '.hm-dots i{flex:1 1 0;display:flex;align-items:center;justify-content:center;height:100%}' +
      '.hm-dots i::before{content:"";width:8px;height:8px;border-radius:50%;box-sizing:border-box;border:1.5px solid #0b1020;opacity:.68;background:#ff6a3d}' +
      '.hm-dots i.gd::before{background:#fff}.hm-dots i.pf::before{background:#4be0a0}' +
      // el punto encendido: grande, opaco, con su brillo; dorado si cae en Perfecto
      '.hm-dots i.on::before{opacity:1;transform:scale(1.9);box-shadow:0 0 5px rgba(255,106,61,.85);animation:hmDotsPop .2s ease-out}' +
      '.hm-dots i.on.gd::before{box-shadow:0 0 5px rgba(255,255,255,.85)}' +
      '.hm-dots i.on.pf::before{background:#ffd23f;box-shadow:0 0 0 1px #4be0a0,0 0 7px rgba(75,224,160,.9)}' +
      '@keyframes hmDotsPop{0%{transform:scale(1);opacity:.68}60%{transform:scale(2.25);opacity:1}100%{transform:scale(1.9)}}' +
      '#app.rm .hm-dots i.on::before{animation:none}' +
      '.is-touch .hm-dots{width:99px;height:16px;padding:0 4px;border-radius:8px}' +
      '.is-touch .hm-dots i::before{width:7px;height:7px}',
    build: function (M) { for (var i = 0; i < N; i++) M.appendChild(document.createElement('i')); },
    fill: function (M, d) {
      var c = M.children, mid = (N - 1) / 2;
      // casilla de la pulsación; si su zona no es la del golpe (borde entre zonas), se corre hacia donde toca
      var k = Math.max(0, Math.min(N - 1, Math.floor((d.u + 1) / 2 * N))), want = RANK[d.cls] || 0, dir = d.u < 0 ? -1 : 1;
      for (var n = 0; n < N && RANK[zoneOf(k, d)] !== want; n++) {
        var nk = RANK[zoneOf(k, d)] < want ? k + dir : k - dir;
        if (nk < 0 || nk >= N) break;
        if (nk === mid && want !== 0) break;
        k = nk;
      }
      for (var i = 0; i < N; i++) c[i].className = zoneOf(i, d) + (i === k ? ' on' : '');
    }
  });
})();
