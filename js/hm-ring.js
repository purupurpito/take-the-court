/* TAKE THE COURT — js/hm-ring.js (owner: ui_main)
 * Medidor del golpe «Diana» (27-nov-2026): diana de tiro redonda, como una pegatina bajo el rótulo del sello.
 * Aros concéntricos: centro verde = Perfecto (radio d.pf), aro blanco = Bien (radio d.gd), resto = fuera.
 * El impacto se desplaza en horizontal: a la izquierda pronto, a la derecha tarde, en el centro justo.
 * Todo en % del diámetro: la versión táctil solo cambia el tamaño de la caja.
 */
(function () {
  'use strict';
  var VB = window.VB = window.VB || {};
  if (!VB.HitMeter) return;
  VB.HitMeter.add('ring', {
    name: 'Diana', size: { w: 54, h: 54 },
    css:
      // Pegatina: disco oscuro con contorno de tinta y canto blanco; el borde de fuera, naranja apagado
      '.hm-ring{position:relative;width:48px;height:48px;margin-top:7px;border-radius:50%;background:rgba(8,13,24,.84);' +
        'box-shadow:inset 0 0 0 3px rgba(255,106,61,.62),0 0 0 2px #0b1020,0 0 0 3.5px rgba(255,255,255,.8),0 3px 7px rgba(0,0,0,.5)}' +
      // Aros (Bien blanco, Perfecto verde): left/top/size los pone fill
      '.hm-ring i{position:absolute;border-radius:50%;background:rgba(255,255,255,.7);box-shadow:0 0 0 1.5px #0b1020}' +
      '.hm-ring i+i{background:#4be0a0;box-shadow:0 0 0 1.5px #0b1020,0 0 6px rgba(75,224,160,.75)}' +
      // Eje horizontal (pronto ← → tarde)
      '.hm-ring s{position:absolute;left:8%;right:8%;top:50%;height:1.5px;margin-top:-.75px;background:rgba(11,16,32,.75)}' +
      // Impacto: punto del color de su zona con contorno de tinta; un golpe de escala al salir
      '.hm-ring em{position:absolute;top:50%;width:12px;height:12px;margin:-6px 0 0 -6px;border-radius:50%;background:#fff;' +
        'box-shadow:0 0 0 2px #0b1020,0 2px 4px rgba(0,0,0,.55);animation:hmRingHit .26s cubic-bezier(.2,1.6,.4,1) both}' +
      '.hm-ring em.pf{background:#ffd23f;box-shadow:0 0 0 2px #0b1020,0 0 8px rgba(255,210,63,.85)}.hm-ring em.ms{background:#ff6a3d}' +
      // (dos copias iguales: fill alterna el nombre para reiniciarla)
      '@keyframes hmRingHit{0%{transform:scale(2.1);opacity:0}100%{transform:scale(1);opacity:1}}' +
      '@keyframes hmRingHit2{0%{transform:scale(2.1);opacity:0}100%{transform:scale(1);opacity:1}}' +
      '#app.rm .hm-ring em{animation:none!important}' +
      '.is-touch .hm-ring{width:40px;height:40px}.is-touch .hm-ring em{width:10px;height:10px;margin:-5px 0 0 -5px}',
    build: function (M) {
      M.appendChild(document.createElement('i')); M.appendChild(document.createElement('i'));
      M.appendChild(document.createElement('s')); M.appendChild(document.createElement('em'));
    },
    fill: function (M, d) {
      var c = M.children;
      var ring = function (el, r) {
        r = Math.max(0.08, Math.min(0.96, r));
        var p = (r * 100).toFixed(2) + '%', o = (50 - r * 50).toFixed(2) + '%';
        el.style.width = p; el.style.height = p; el.style.left = o; el.style.top = o;
      };
      ring(c[0], d.gd); ring(c[1], d.pf);
      // El punto no se sale de la diana (al borde = muy pronto / muy tarde)
      var u = Math.max(-0.88, Math.min(0.88, d.u));
      var e = c[3];
      e.style.left = (50 + 50 * u).toFixed(2) + '%';
      // Reinicia la animación del impacto sin medir el DOM: alterna el nombre
      e.className = d.cls;
      e.style.animationName = e.style.animationName === 'hmRingHit' ? 'hmRingHit2' : 'hmRingHit';
    }
  });
})();
