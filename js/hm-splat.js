/* TAKE THE COURT — js/hm-splat.js (owner: ui_main)
 * Medidor del golpe «Mancha» (estilo SPLAT): pincelada de pintura oscura como pista, las zonas pintadas encima
 * (Bien blanca, Perfecto verde con una gota que cae) y una salpicadura de tinta donde pulsaste, del color de su zona,
 * con un «plop» de escala al salir (sin él con Menos movimiento). Contrato en js/hitmeter.js.
 */
(function () {
  'use strict';
  var VB = window.VB;
  if (!VB || !VB.HitMeter) return;
  var NS = 'http://www.w3.org/2000/svg';

  // Pincelada (viewBox 140×24, se estira con la caja): bordes ondulados y puntas deshilachadas
  var BRUSH = 'M4,8 C10,5 18,6 26,5 C40,4 52,6 66,5 C82,4 96,6 110,5 C120,4 128,5 134,6 L138,7 L133,9 L139,11 L134,13 L138,16 ' +
    'L132,18 C122,19 112,18 100,19 C86,20 72,18 58,19 C44,20 30,18 18,19 C12,19 8,20 4,18 L1,16 L5,14 L0,12 L5,10 L2,9 Z';

  // Salpicadura (viewBox 28×28): mancha de lóbulos irregulares, suavizada pasando por los puntos medios
  var SPLAT = (function () {
    var R = [10.8, 5.6, 9.4, 6.2, 11.2, 5.4, 9.8, 6.4, 10.4, 5.8, 9.0, 6.0], n = R.length, P = [], i, s = '';
    for (i = 0; i < n; i++) { var a = i / n * Math.PI * 2 - Math.PI / 2; P.push([14 + Math.cos(a) * R[i], 14 + Math.sin(a) * R[i]]); }
    var mid = function (k) { var p = P[k % n], q = P[(k + 1) % n]; return ((p[0] + q[0]) / 2).toFixed(1) + ',' + ((p[1] + q[1]) / 2).toFixed(1); };
    s = 'M' + mid(n - 1);
    for (i = 0; i < n; i++) s += ' Q' + P[i][0].toFixed(1) + ',' + P[i][1].toFixed(1) + ' ' + mid(i);
    return s + ' Z';
  })();

  VB.HitMeter.add('splat', {
    name: 'Mancha', size: { w: 140, h: 28 },
    css: '.hm-splat{position:relative;width:140px;height:24px}' +
      // pista: la pincelada oscura con contorno de tinta
      '.hm-splat>svg{position:absolute;inset:0;width:100%;height:100%;overflow:visible;filter:drop-shadow(0 2px 3px rgba(0,0,0,.5))}' +
      '.hm-splat>svg path{fill:rgba(8,13,24,.86);stroke:#0b1020;stroke-width:2.6;stroke-linejoin:round;vector-effect:non-scaling-stroke}' +
      // zonas pintadas encima (manchas de bordes irregulares)
      '.hm-splat i{position:absolute;top:8px;bottom:8px;border-radius:45% 55% 60% 40%/60% 45% 55% 40%;background:rgba(255,255,255,.58)}' +
      '.hm-splat i+i{top:7px;bottom:7px;border-radius:55% 40% 50% 60%/45% 60% 40% 55%;background:#4be0a0;box-shadow:0 0 0 1.5px #0b1020,0 0 7px rgba(75,224,160,.6)}' +
      '.hm-splat i+i::after{content:"";position:absolute;left:58%;top:88%;width:4px;height:6px;border-radius:50% 50% 50% 50%/35% 35% 65% 65%;background:#4be0a0;box-shadow:0 0 0 1.5px #0b1020}' +
      // la salpicadura de cuándo pulsaste
      '.hm-splat em{position:absolute;top:50%;width:28px;height:28px;margin:-14px 0 0 -14px}' +
      '.hm-splat em svg{width:100%;height:100%;overflow:visible;fill:#fff;filter:drop-shadow(0 2px 2px rgba(0,0,0,.55))}' +
      '.hm-splat em path,.hm-splat em circle{stroke:#0b1020;stroke-width:2.2;paint-order:stroke;stroke-linejoin:round}' +
      '.hm-splat em.pf svg{fill:#ffd23f}.hm-splat em.ms svg{fill:#ff6a3d}' +
      // plop: dos nombres de animación alternos para que se repita en cada golpe sin tocar el DOM
      '.hm-splat em.a svg{animation:hmSpA .26s cubic-bezier(.3,1.6,.5,1) both}.hm-splat em.b svg{animation:hmSpB .26s cubic-bezier(.3,1.6,.5,1) both}' +
      '@keyframes hmSpA{0%{transform:scale(.2) rotate(-25deg);opacity:0}60%{opacity:1}100%{transform:none;opacity:1}}' +
      '@keyframes hmSpB{0%{transform:scale(.2) rotate(-25deg);opacity:0}60%{opacity:1}100%{transform:none;opacity:1}}' +
      '#app.rm .hm-splat em svg{animation:none}' +
      // táctil: más pequeño
      '.is-touch .hm-splat{width:118px;height:21px}.is-touch .hm-splat i{top:7px;bottom:7px}.is-touch .hm-splat i+i{top:6px;bottom:6px}' +
      '.is-touch .hm-splat em{width:24px;height:24px;margin:-12px 0 0 -12px}',
    build: function (M) {
      var s = document.createElementNS(NS, 'svg'), p = document.createElementNS(NS, 'path');
      s.setAttribute('viewBox', '0 0 140 24'); s.setAttribute('preserveAspectRatio', 'none');
      p.setAttribute('d', BRUSH); s.appendChild(p); M.appendChild(s);
      M.appendChild(document.createElement('i')); M.appendChild(document.createElement('i'));
      var em = document.createElement('em'), m = document.createElementNS(NS, 'svg'), q = document.createElementNS(NS, 'path');
      m.setAttribute('viewBox', '0 0 28 28'); q.setAttribute('d', SPLAT); m.appendChild(q);
      // gotitas sueltas de la salpicadura
      [[26.5, 5, 2.2], [1.5, 22, 1.8], [25, 25.5, 1.3], [3, 3.5, 1.1]].forEach(function (c) {
        var o = document.createElementNS(NS, 'circle'); o.setAttribute('cx', c[0]); o.setAttribute('cy', c[1]); o.setAttribute('r', c[2]); m.appendChild(o);
      });
      em.appendChild(m); M.appendChild(em);
    },
    fill: function (M, d) {
      var pc = function (v) { return (50 + 50 * v).toFixed(2) + '%'; }, c = M.children;
      c[1].style.left = pc(-d.gd); c[1].style.right = pc(-d.gd);
      c[2].style.left = pc(-d.pf); c[2].style.right = pc(-d.pf);
      M._hmT = !M._hmT;
      c[3].style.left = pc(d.u); c[3].className = d.cls + (M._hmT ? ' a' : ' b');
    }
  });
})();
