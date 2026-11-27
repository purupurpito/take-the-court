/* TAKE THE COURT — js/hm-vbar.js (owner: ui_main)
 * Medidor del golpe «Vertical» (27-nov-2026): el tubo del NBA 2K. Se llena desde abajo hasta la altura de la pulsación;
 * franja verde de «Perfecto» (y blanca de «Bien») a media altura: abajo = pronto, arriba = tarde. La tapa de arriba lleva
 * el color de la zona (dorada en Perfecto, blanca en Bien, naranja fuera).
 * En el sello va a la IZQUIERDA del rótulo (absoluto, sin alto propio: no alarga el sello hacia abajo); en la vista previa
 * de Ajustes, en su sitio. El llenado sube en 0,26 s (dos animaciones iguales que se alternan para reiniciarla sin medir).
 */
(function () {
  'use strict';
  var VB = window.VB;
  if (!VB || !VB.HitMeter) return;
  VB.HitMeter.add('vbar', {
    // en el sello el tubo sobresale ~27 px a la izquierda; ui.js centra la caja, así que w = 2*(mitad del rótulo más ancho + 27)
    // para que el saliente quepa dentro (más holgura por la derecha, que no molesta); alto, nada extra
    name: 'Vertical', size: { w: 220, h: 2 },
    css:
      // vista previa (y por defecto): el tubo en su sitio
      '.hm.hm-vbar{position:relative;display:block;width:16px;height:52px;margin:0;--th:52px}' +
      '.hm-vbar s{position:absolute;left:0;top:0;width:16px;height:var(--th);box-sizing:border-box;border-radius:8px;background:rgba(8,13,24,.84);' +
        'border:2px solid #0b1020;box-shadow:0 0 0 1.5px rgba(255,255,255,.55),0 2px 6px rgba(0,0,0,.5);text-decoration:none}' +
      // zonas: Bien blanca, Perfecto verde
      '.hm-vbar s i{position:absolute;left:2px;right:2px;border-radius:2px;background:rgba(255,255,255,.42)}' +
      '.hm-vbar s i+i{background:#4be0a0;box-shadow:0 0 6px rgba(75,224,160,.7)}' +
      // llenado: columna estrecha desde abajo (recortada por el tubo) y la tapa de la pulsación
      '.hm-vbar s b{position:absolute;left:0;right:0;bottom:0;top:0;border-radius:6px;overflow:hidden}' +
      '.hm-vbar s u{position:absolute;left:50%;bottom:0;width:4px;margin-left:-2px;border-radius:2px 2px 0 0;background:#fff;opacity:.85;transform-origin:50% 100%}' +
      // tapa fina y solo con el anillo de tinta (sin sombra), para que la franja verde asome por arriba y por abajo
      '.hm-vbar em{position:absolute;left:-5px;width:26px;bottom:calc(var(--lv,.5) * var(--th));height:5px;margin-bottom:-2.5px;border-radius:3px;background:#fff;box-shadow:0 0 0 1.5px #0b1020}' +
      '.hm-vbar.pf u,.hm-vbar.pf em{background:#ffd23f}' +
      '.hm-vbar.ms u,.hm-vbar.ms em{background:#ff6a3d}' +
      // en el sello: a la izquierda del rótulo y la pastilla, centrado en la juntura (sin alto propio)
      '.st-in .hm.hm-vbar{align-self:stretch;width:auto;height:0}' +
      '.st-in .hm-vbar s{left:auto;right:100%;top:calc(var(--th) / -2);margin-right:11px}' +
      '.st-in .hm-vbar em{left:auto;right:100%;margin-right:6px;bottom:calc((var(--lv,.5) - .5) * var(--th))}' +
      // subida corta (solo transform)
      '.hm-vbar.a u{animation:hmvA .26s cubic-bezier(.2,.8,.3,1) both}.hm-vbar.b u{animation:hmvB .26s cubic-bezier(.2,.8,.3,1) both}' +
      '.hm-vbar.a em{animation:hmvEA .26s cubic-bezier(.2,.8,.3,1) both}.hm-vbar.b em{animation:hmvEB .26s cubic-bezier(.2,.8,.3,1) both}' +
      '@keyframes hmvA{from{transform:scaleY(0)}}@keyframes hmvB{from{transform:scaleY(0)}}' +
      '@keyframes hmvEA{from{transform:translateY(calc(var(--lv) * var(--th)))}}@keyframes hmvEB{from{transform:translateY(calc(var(--lv) * var(--th)))}}' +
      '#app.rm .hm-vbar u,#app.rm .hm-vbar em{animation:none}' +
      '.is-touch .hm.hm-vbar{width:14px;--th:44px}.is-touch .hm-vbar s{width:14px}.is-touch .st-in .hm.hm-vbar{width:auto}.is-touch .st-in .hm-vbar s{margin-right:8px}' +
      '.is-touch .hm-vbar em{left:-3px;width:20px;height:4px;margin-bottom:-2px}.is-touch .st-in .hm-vbar em{left:auto;margin-right:5px}',
    build: function (M) {
      var s = document.createElement('s'), b = document.createElement('b');
      s.appendChild(document.createElement('i')); s.appendChild(document.createElement('i'));
      b.appendChild(document.createElement('u')); s.appendChild(b);
      M.appendChild(s); M.appendChild(document.createElement('em'));   // la tapa, fuera del tubo (sobresale por los lados)
    },
    fill: function (M, d) {
      var s = M.firstChild, c = s.children, pc = function (v) { return (50 + 50 * v).toFixed(2) + '%'; }, lv = (1 + d.u) / 2;
      c[0].style.bottom = pc(-d.gd); c[0].style.top = pc(-d.gd);
      c[1].style.bottom = pc(-d.pf); c[1].style.top = pc(-d.pf);
      c[2].firstChild.style.height = pc(d.u);
      M.style.setProperty('--lv', lv.toFixed(3));
      M._f = !M._f;   // el turno a/b va en el propio nodo (la vista previa de Ajustes no le roba la animación al sello)
      M.className = 'hm hm-vbar ' + d.cls + (M._f ? ' a' : ' b');
    }
  });
})();
