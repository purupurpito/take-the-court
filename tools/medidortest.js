#!/usr/bin/env node
/* TAKE THE COURT — tools/medidortest.js (owner: ui_main)
 * Medidor del golpe (27-nov-2026, «como en el NBA 2K»): barra bajo el sello con cuándo pulsaste frente al momento justo.
 * Con Chrome (tools/cdp.js), en la escena debug=rally, metiendo eventos 'hit' del humano en VB.UI.update:
 *   a) perfecto (remate), bueno pronto (recepción), flojo por timing (colocación), flojo sin motivo (defensa), saque, colocación
 *      en salto: rótulo, acción debajo, marca del color de su zona y a su lado (pronto a la izquierda, tarde a la derecha)
 *   b) las zonas salen de VB.Sim.timingQ: la verde acaba donde timingQ = 0,78 (Perfecto) y la blanca donde = 0,45 (Bien)
 *   c) Ajustes › Juego › «Medidor del golpe» en No: el sello de siempre (sin barra, «un pelín pronto», el flojo sin motivo no sale)
 *   d) móvil pequeño en horizontal (667×375, táctil; en vertical se pide girar): el sello con medidor mide menos de 300 px de ancho
 *   e) cada diseño registrado (VB.HitMeter.list): se elige en Ajustes, pinta sin errores en los 4 casos, la vista previa de la fila
 *      sale con su diseño y el sello cabe en un móvil pequeño en horizontal
 * Uso: node tools/medidortest.js        Sale con 1 si falla algo.
 */
'use strict';
const path = require('path');
const CDP = require(path.join(__dirname, 'cdp.js'));
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fails = 0, oks = 0;
function check(name, cond, info) { if (cond) { oks++; console.log('  ok   ' + name); } else { fails++; console.log('  FAIL ' + name + (info !== undefined ? '  ' + JSON.stringify(info) : '')); } return !!cond; }

const HIT = `function (o) {
  var g = VB.ctx.game, p = g.ctrl, b = g.ball;
  var e = Object.assign({ type: 'hit', kind: 'pass', team: 0, player: p, touch: 1, quality: 0.6, grade: 'good', timing: 0, human: true,
    x: p.x, y: p.y, z: 2.2, speed: 8, shot: '', dive: false, recv: false, dig: false, jset: false, feint: false, chain: 0, mom: 0, pipe: false,
    strK: 0, reachK: 0.3, inSp: 0, prevQ: 1 }, o);
  var st = document.getElementById('stamp'); st.className = '';
  VB.UI.update(g, 0, [e]);
  var M = document.getElementById('stampM'), bar = M.classList.contains('hm-bar'), em = bar ? M.querySelector('em') : null, S = document.getElementById('stampS'), r = document.querySelector('#stamp .st-in').getBoundingClientRect();
  return { on: /\\bon\\b/.test(st.className), cls: st.className, t: document.getElementById('stampT').textContent, s: S.hidden ? '' : S.textContent,
    m: !M.hidden, em: em ? em.className : '', left: em ? parseFloat(em.style.left) : NaN, z1: bar ? [parseFloat(M.children[0].style.left), parseFloat(M.children[0].style.right)] : null,
    z2: bar ? [parseFloat(M.children[1].style.left), parseFloat(M.children[1].style.right)] : null, w: r.width };
}`;

(async () => {
  let page;
  try {
    page = await CDP.open({ size: '1280x720' });
    const E = s => page.evalJs(s);
    const J = async s => JSON.parse(await E('JSON.stringify(' + s + ')'));
    const waitFor = async (expr, ms) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await E(expr)) return true; } catch (e) { } await sleep(100); } return false; };
    const scene = async q => { await E('try { localStorage.clear(); } catch (e) {} 1'); await page.navigate(q); check('escena ' + q, await waitFor('!!(window.VB && VB.ctx && VB.ctx.game && VB.ctx.game.ctrl && VB.UI && VB.ctx.camera)', 25000)); await sleep(1200); };
    const hit = o => J('(' + HIT + ')(' + JSON.stringify(o) + ')');

    console.log('a) un toque de cada');
    await scene('debug=rally&quality=low');
    check('por defecto: hitMeter = «bar»', await E(`VB.ctx.settings.hitMeter === 'bar'`));
    let r = await hit({ kind: 'spike', touch: 3, grade: 'perfect', quality: 0.95, timing: 0.01 });
    check('remate perfecto: «Perfecto», barra, marca dorada en el centro, «Remate»', r.on && r.t === 'Perfecto' && r.m && r.em === 'pf' && Math.abs(r.left - 50) < 5 && r.s === 'Remate', r);
    r = await hit({ recv: true, grade: 'good', quality: 0.6, timing: -0.08 });
    check('recepción buena pronto: «Bien», marca blanca a la izquierda, «Recepción, pronto»', r.on && r.t === 'Bien' && r.em === 'gd' && r.left < 40 && r.s === 'Recepción, pronto', r);
    r = await hit({ kind: 'set', touch: 2, grade: 'poor', quality: 0.3, timing: 0.2 });
    check('colocación tarde: «¡Tarde!», marca naranja a la derecha del todo, «Colocación»', r.on && r.t === '¡Tarde!' && r.em === 'ms' && r.left > 90 && r.s === 'Colocación', r);
    r = await hit({ dig: true, grade: 'poor', quality: 0.4, timing: 0 });
    check('defensa floja sin motivo: «Flojo» (antes no salía nada), «Defensa»', r.on && r.t === 'Flojo' && r.m && r.s === 'Defensa', r);
    r = await hit({ kind: 'serve', touch: 0, grade: 'good', quality: 0.7, timing: 0.045 });
    check('saque bueno algo tarde: «Saque, tarde»', r.on && r.t === 'Bien' && r.s === 'Saque, tarde' && r.left > 50, r);
    r = await hit({ kind: 'set', touch: 1, jset: true, grade: 'perfect', quality: 0.9, timing: -0.02 });
    check('colocación en salto perfecta: «Colocación en salto»', r.on && r.t === 'Perfecto' && r.s === 'Colocación en salto', r);
    r = await hit({ kind: 'pass', shot: 'body', grade: 'poor', timing: 0.3 });
    check('balón al cuerpo: sin medidor (sale «¡Te ha dado!» como siempre)', !r.on || !r.m, r);

    console.log('b) zonas desde VB.Sim.timingQ');
    r = await hit({ kind: 'spike', touch: 3, grade: 'good', quality: 0.6, timing: 0.07 });
    const z = await J(`(function(){ var Q = VB.Sim.timingQ, f = function (v) { var lo = 0, hi = 0.5; for (var i = 0; i < 40; i++) { var m = (lo + hi) / 2; if (Q(m) >= v) lo = m; else hi = m; } return lo; }; return { pf: f(0.78), gd: f(0.45) }; })()`);
    const span = Math.max(0.16, z.gd * 1.35), pc = v => 50 - 50 * v / span;
    check('zona verde = Perfecto (timingQ 0,78)', Math.abs(r.z2[0] - pc(z.pf)) < 0.6 && Math.abs(r.z2[1] - pc(z.pf)) < 0.6, { z2: r.z2, want: pc(z.pf) });
    check('zona blanca = Bien (timingQ 0,45)', Math.abs(r.z1[0] - pc(z.gd)) < 0.6 && Math.abs(r.z1[1] - pc(z.gd)) < 0.6, { z1: r.z1, want: pc(z.gd) });
    check('las zonas son simétricas y la verde va dentro de la blanca', r.z2[0] > r.z1[0] && r.z2[1] > r.z1[1], r);

    console.log('c) medidor apagado');
    await E(`VB.ctx.actions.setSetting('hitMeter', 'off'), 1`);
    r = await hit({ recv: true, grade: 'good', quality: 0.6, timing: -0.08 });
    check('sin barra y con la pista de siempre («un pelín pronto»)', r.on && !r.m && r.s === 'un pelín pronto', r);
    r = await hit({ dig: true, grade: 'poor', quality: 0.4, timing: 0 });
    check('el flojo sin motivo no sale (como antes)', !r.on, r);
    await E(`VB.ctx.actions.setSetting('hitMeter', 'bar'), 1`);
    check('fila «Medidor del golpe» en Ajustes', await E(`!!document.querySelector('[data-opt="hitMeter"]')`));

    console.log('e) cada diseño');
    const ids = await J('VB.HitMeter.list()');
    check('la Barra es el primer diseño y VB.HitMeter.DEFAULT', ids[0] === 'bar' && await E(`VB.HitMeter.DEFAULT === 'bar'`), ids);
    const segN = await E(`document.querySelectorAll('[data-seg="hitMeter"] span').length`);
    check('el ajuste tiene un valor por diseño más «No»', segN === ids.length + 1, { segN, ids });
    for (const id of ids) {
      await E(`VB.ctx.actions.setSetting('hitMeter', ${JSON.stringify(id)}), 1`);
      let okAll = true, info = [];
      for (const o of [{ kind: 'spike', touch: 3, grade: 'perfect', quality: 0.95, timing: 0.01 }, { recv: true, grade: 'good', timing: -0.08 }, { kind: 'set', touch: 2, grade: 'poor', quality: 0.3, timing: 0.2 }, { dig: true, grade: 'poor', timing: 0 }]) {
        const q = await hit(o);
        const cls = await E(`document.getElementById('stampM').className`);
        if (!(q.on && q.m && cls.indexOf('hm-' + id) >= 0)) { okAll = false; info.push({ o, q, cls }); }
      }
      check(id + ': pinta los 4 casos con su clase', okAll, info);
    }
    await E(`VB.ctx.actions.setSetting('hitMeter', 'bar'), 1`);

    console.log('d) móvil');
    await page.close(); page = await CDP.open({ size: '667x375', touch: true, dpr: 2 });
    await scene('debug=rally&quality=low');
    r = await hit({ kind: 'set', touch: 1, jset: true, grade: 'good', quality: 0.6, timing: -0.06 });
    check('667×375: sello con medidor de menos de 300 px', r.on && r.m && r.w > 0 && r.w < 300, r);
    for (const id of ids) {
      await E(`VB.ctx.actions.setSetting('hitMeter', ${JSON.stringify(id)}), 1`);
      const q = await hit({ kind: 'set', touch: 1, jset: true, grade: 'good', quality: 0.6, timing: -0.06 });
      check('667×375 ' + id + ': cabe (< 300 px de ancho)', q.on && q.m && q.w > 0 && q.w < 300, q);
    }
    check('sin errores JS', !page.errors.length, page.errors.slice(0, 3));
  } catch (e) { fails++; console.log('  FAIL excepción: ' + (e && e.stack || e)); }
  finally { try { if (page) await page.close(); } catch (e) { } }
  console.log((fails ? 'FALLOS: ' + fails : 'TODO OK') + ' (' + oks + ' ok)');
  process.exit(fails ? 1 : 0);
})();
