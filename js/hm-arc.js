/* TAKE THE COURT — js/hm-arc.js (owner: ui_main)
 * MEDIDOR DEL GOLPE, diseño «Arco» (27-nov-2026): media luna como el medidor de tiro del NBA 2K. Las zonas van sobre el
 * arco (fuera naranja en las puntas, «Bien» blanco, «Perfecto» verde arriba en el centro) y una aguja con bola se para
 * en el ángulo de la pulsación: a la izquierda, pronto; a la derecha, tarde. SVG creado una vez en build.
 */
(function () {
  'use strict';
  var VB = window.VB = window.VB || {};
  if (!VB.HitMeter) return;
  var NS = 'http://www.w3.org/2000/svg';
  // arco: centro (60,45), radio 38, de -80° a +80° desde la vertical (u = -1 … 1)
  var A = 80, ARC = 'M22.58 38.4A38 38 0 0 1 97.42 38.4';
  function el(tag, at, p) {
    var n = document.createElementNS(NS, tag);
    for (var k in at) n.setAttribute(k, at[k]);
    p.appendChild(n); return n;
  }
  VB.HitMeter.add('arc', {
    name: 'Arco', size: { w: 120, h: 48 },
    css: '.hm-arc{position:relative;width:120px;height:48px;margin-top:4px}' +
      '.hm-arc svg{display:block;width:120px;height:48px;overflow:visible;filter:drop-shadow(0 2px 3px rgba(0,0,0,.5))}' +
      '.hm-arc .ink{fill:none;stroke:#0b1020;stroke-width:14;stroke-linecap:round}' +
      '.hm-arc .trk{fill:none;stroke:#141c2e;stroke-width:9;stroke-linecap:round}' +
      '.hm-arc .z{fill:none;stroke-width:9;stroke-linecap:butt}' +
      '.hm-arc .zm{stroke:rgba(255,106,61,.85);stroke-linecap:round}.hm-arc .zg{stroke:#f2f5fa}.hm-arc .zp{stroke:#4be0a0}' +
      '.hm-arc .nd{transform-origin:60px 45px}' +
      '.hm-arc .ni{stroke:#0b1020;stroke-width:5;stroke-linecap:round}.hm-arc .nc{stroke:#fff;stroke-width:2.2;stroke-linecap:round}' +
      '.hm-arc .bl{fill:#fff;stroke:#0b1020;stroke-width:2.2}.hm-arc .hub{fill:#0b1020;stroke:rgba(255,255,255,.7);stroke-width:1.2}' +
      '.hm-arc .pf .nc{stroke:#ffd23f}.hm-arc .pf .bl{fill:#ffd23f}.hm-arc .ms .nc{stroke:#ff6a3d}.hm-arc .ms .bl{fill:#ff6a3d}' +
      '.hm-arc .bl{transform-box:fill-box;transform-origin:center}' +
      '.is-touch .hm-arc,.is-touch .hm-arc svg{width:100px;height:40px}',
    build: function (M) {
      var s = el('svg', { viewBox: '0 0 120 48', 'aria-hidden': 'true' }, M);
      el('path', { d: ARC, 'class': 'ink' }, s);
      el('path', { d: ARC, 'class': 'trk' }, s);
      el('path', { d: ARC, 'class': 'z zm', pathLength: 200 }, s);
      el('path', { d: ARC, 'class': 'z zg', pathLength: 200 }, s);
      el('path', { d: ARC, 'class': 'z zp', pathLength: 200 }, s);
      var g = el('g', { 'class': 'nd' }, s);
      el('line', { x1: 60, y1: 45, x2: 60, y2: 14, 'class': 'ni' }, g);
      el('line', { x1: 60, y1: 45, x2: 60, y2: 14, 'class': 'nc' }, g);
      el('circle', { cx: 60, cy: 7, r: 6, 'class': 'bl' }, g);
      el('circle', { cx: 60, cy: 45, r: 3.6, 'class': 'hub' }, s);
    },
    fill: function (M, d) {
      var c = M.firstChild.childNodes;
      // tramo [-h, h] del arco (pathLength 200: u = -1 está en 0, u = 1 en 200)
      var seg = function (p, h) { p.style.strokeDasharray = (200 * h).toFixed(2) + ' 400'; p.style.strokeDashoffset = (-100 * (1 - h)).toFixed(2); };
      seg(c[2], 1); seg(c[3], d.gd); seg(c[4], d.pf);
      c[5].style.transform = 'rotate(' + (d.u * A).toFixed(1) + 'deg)';
      c[5].setAttribute('class', 'nd ' + d.cls);
      // la bola entra con un pequeño salto en cada golpe (solo escala; nada con Menos movimiento)
      var bl = c[5].lastChild;
      if (bl.animate && !M.closest('#app.rm')) bl.animate([{ transform: 'scale(.4)' }, { transform: 'scale(1)' }], { duration: 200, easing: 'ease-out' });
    }
  });
})();
