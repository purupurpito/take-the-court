/* TAKE THE COURT — js/hitmeter.js (owner: ui_main)
 * MEDIDOR DEL GOLPE (27-nov-2026, Ferran: «un indicador como en el NBA 2K»; «que tenga varios diseños, el de barra por defecto»).
 * Registro de diseños del medidor que sale bajo el sello de calidad del golpe (ui.js stampHit) y en la vista previa de
 * Ajustes › Juego › «Medidor del golpe» (ajuste hitMeter: id del diseño u 'off').
 *
 * Contrato de un diseño (VB.HitMeter.add(id, def); cada diseño en js/hm-<id>.js, cargado después de este y antes de ui.js):
 *   name   rótulo corto del ajuste (≤ 9 letras: va en un segmento)
 *   size   { w, h } px CSS aproximados del medidor a escala 1 en PC (ui.js los usa para colocar el sello sin medir el DOM)
 *   css    reglas SOLO bajo .hm-<id> (así sirven igual en el sello y en la vista previa). Colores fijos (el sello va sobre el
 *          juego, no sobre el tema). Animaciones solo de transform/opacity y nunca con .rm (Menos movimiento: #app.rm).
 *   build(M)    crea los hijos de M (div.hm.hm-<id>) UNA vez; se vuelve a llamar solo si cambia el diseño.
 *   fill(M, d)  pone el golpe; sin crear nodos ni medir el DOM (sale en pleno partido). d (VB.HitMeter.data):
 *        u     posición de la pulsación en [-1, 1]: -1 muy pronto, 0 justo, 1 muy tarde (recortada al borde)
 *        pf    media anchura de la zona «Perfecto» en las mismas unidades (0..1); gd, la de «Bien» (gd > pf)
 *        cls   'pf' | 'gd' | 'ms' (en qué zona cae la pulsación); grade 'perfect' | 'good' | 'poor' (la nota de verdad,
 *              que también mira la distancia y lo rápido que llega el balón: puede no coincidir con cls)
 *        te    desfase en s (con signo); act 'Recepción'…, hint 'pronto' | 'tarde' | '' (el texto ya va debajo, en el sello)
 * Las zonas salen de VB.Sim.timingQ (umbrales de nota 0,78 y 0,45 de gradeOf): lo que se ve es lo que cuenta.
 */
(function () {
  'use strict';
  var VB = window.VB = window.VB || {};
  var V = {}, order = [], css = [], styleEl = null, Z = null;
  function zones() {
    if (Z) return Z;
    var S = VB.Sim;
    Z = { pf: 0.054, gd: 0.122, span: 0.165 };
    if (S && S.timingQ) {
      var f = function (qv) { var lo = 0, hi = 0.5; for (var i = 0; i < 30; i++) { var m = (lo + hi) / 2; if (S.timingQ(m) >= qv) lo = m; else hi = m; } return lo; };
      Z.pf = f(0.78); Z.gd = f(0.45);
    }
    Z.span = Math.max(0.16, Z.gd * 1.35);
    return Z;
  }
  function ensureStyle() {
    if (styleEl || !document.head) return;
    styleEl = document.createElement('style'); styleEl.id = 'hmCss'; styleEl.textContent = css.join('\n'); document.head.appendChild(styleEl);
  }
  function add(id, def) {
    if (!V[id]) order.push(id);
    V[id] = def;
    if (def.css) { css.push(def.css); if (styleEl) styleEl.textContent = css.join('\n'); }
  }
  /** Datos de un golpe para fill (o = { grade, act, hint }). */
  function data(te, o) {
    var z = zones(); o = o || {};
    te = +te || 0;
    var a = Math.abs(te);
    return { te: te, u: Math.max(-1, Math.min(1, te / z.span)), pf: z.pf / z.span, gd: z.gd / z.span,
      cls: a <= z.pf ? 'pf' : a <= z.gd ? 'gd' : 'ms', grade: o.grade || (a <= z.pf ? 'perfect' : a <= z.gd ? 'good' : 'poor'),
      act: o.act || '', hint: o.hint || '' };
  }
  /** Pinta el diseño id en M (div). Devuelve su definición (por si hace falta size). */
  function render(M, id, d) {
    var def = V[id] || V.bar;
    if (!V[id]) id = 'bar';
    ensureStyle();
    if (M._hm !== id) { M.textContent = ''; M.className = 'hm hm-' + id; def.build(M); M._hm = id; }
    def.fill(M, d);
    return def;
  }
  VB.HitMeter = { add: add, render: render, data: data, zones: zones, DEFAULT: 'bar',
    list: function () { return order.slice(); }, get: function (id) { return V[id] || null; } };

  // ---------------------------------------------------------------- Barra (la de serie)
  // Barra horizontal: zona «Bien» blanca, «Perfecto» verde en el centro y la marca de cuándo pulsaste, del color de su zona.
  add('bar', {
    name: 'Barra', size: { w: 132, h: 20 },
    css: '.hm-bar{position:relative;width:132px;height:10px;margin-top:6px;border-radius:5px;background:rgba(8,13,24,.82);box-shadow:0 0 0 1.5px rgba(255,255,255,.55),0 2px 6px rgba(0,0,0,.5)}' +
      '.hm-bar i{position:absolute;top:2px;bottom:2px;border-radius:3px;background:rgba(255,255,255,.42)}' +
      '.hm-bar i+i{background:#4be0a0;box-shadow:0 0 6px rgba(75,224,160,.7)}' +
      '.hm-bar em{position:absolute;top:-5px;width:5px;height:20px;margin-left:-2.5px;border-radius:3px;background:#fff;box-shadow:0 0 0 1.5px #0b1020,0 2px 4px rgba(0,0,0,.5)}' +
      '.hm-bar em.pf{background:#ffd23f}.hm-bar em.ms{background:#ff6a3d}' +
      '.is-touch .hm-bar{width:112px;height:9px}',
    build: function (M) { M.appendChild(document.createElement('i')); M.appendChild(document.createElement('i')); M.appendChild(document.createElement('em')); },
    fill: function (M, d) {
      var pc = function (v) { return (50 + 50 * v).toFixed(2) + '%'; }, c = M.children;
      c[0].style.left = pc(-d.gd); c[0].style.right = pc(-d.gd);
      c[1].style.left = pc(-d.pf); c[1].style.right = pc(-d.pf);
      c[2].style.left = pc(d.u); c[2].className = d.cls;
    }
  });
})();
