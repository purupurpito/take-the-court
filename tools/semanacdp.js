#!/usr/bin/env node
/* MAKE THE CUT — tools/semanacdp.js (owner: ui_main)
 * La situación de la semana DE VERDAD en Chrome (tools/cdp.js), el flujo completo que semanatest (node) no ve:
 *   a) Retos › Semana › «¡A jugar!» → el partido arranca en el marcador de la semana (g.score = situation().score), Semana.begin
 *      gasta el intento al empezar (left 3 → 2) y la previa dice «Intento 1 de 3 de hoy» (sin «Tu balance en…»)
 *   b) pausa: aviso «Reiniciar o salir gasta este intento» y «Reiniciar» a la vista (quedan intentos)
 *   c) hoja final (autopilot hasta el final): VB.Semana.finish cerró el intento y la hoja lleva Otro intento, Compartir, Ver el grupo y Menú
 *   d) con 0 intentos: «Reiniciar» no abandona el intento en juego (toast y sigue)
 *   e) ?sem=… (enlace de un amigo): se une la cadena, se abre Retos › Semana y se quita sem= de la barra
 * Uso: node tools/semanacdp.js   (≈ 1-2 min; lanzarla sola: el PC tiene poca memoria)
 */
'use strict';
const path = require('path');
const CDP = require(path.join(__dirname, 'cdp.js'));
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fails = 0, oks = 0;
function check(name, cond, info) { if (cond) { oks++; console.log('  ok   ' + name); } else { fails++; console.log('  FAIL ' + name + (info !== undefined ? '  ' + JSON.stringify(info) : '')); } return !!cond; }

(async () => {
  let page;
  try {
    page = await CDP.open({ size: '844x390', touch: true });
    const E = s => page.evalJs(s);
    const J = async s => JSON.parse(await E('JSON.stringify(' + s + ')'));
    const waitFor = async (expr, ms) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await E(expr)) return true; } catch (e) { } await sleep(120); } return false; };
    const ready = () => waitFor('!!(window.VB && VB.ctx && VB.ctx.state === "menu" && VB.UI && VB.Semana && VB.SemanaUI)', 25000);
    const idle = () => waitFor('VB.UI.menuIdle()', 20000);

    // ---- a) empezar desde Retos › Semana
    await page.navigate('nonews=1&uianim=0');
    await E('(function(){ try { localStorage.clear(); } catch (e) {} return 1; })()');
    await page.navigate('nonews=1&uianim=0'); await ready(); await idle();
    const sit = await J('(function(){ var s = VB.Semana.situation(); return { score: s.score, label: s.label, setNo: s.setNo }; })()');
    check('a) 3 intentos al empezar el día', (await E('VB.Semana.left()')) === 3);
    await E('VB.UI.openRetos("semana"), 1'); await sleep(600);
    check('a) Retos › Semana con «¡A jugar!» a la vista', await E('(function(){ var b = document.querySelector("[data-sem=go]"); if (!b || b.closest("[hidden]")) return false; var r = b.getBoundingClientRect(); return r.width > 0 && r.height >= 44; })()'));
    await E('document.querySelector("[data-sem=go]").click(), 1');
    check('a) el partido arranca', await waitFor('!!(VB.ctx.game && VB.ctx.game.sit && (VB.ctx.state === "playing" || VB.ctx.state === "intro"))', 15000));
    const g0 = await J('{ score: VB.ctx.game.score, sit: VB.ctx.game.sit, setNo: VB.ctx.game.setNo, sets: VB.ctx.game.sets }');
    check('a) en el marcador de la semana', g0.score[0] === sit.score[0] && g0.score[1] === sit.score[1] && g0.setNo === sit.setNo, { g: g0, sit: sit });
    check('a) el intento se gasta al empezar (3 → 2), intento 1', (await E('VB.Semana.left()')) === 2 && g0.sit.i === 1, g0.sit);
    const ib = await J('(function(){ var p = VB.UI._intro(); return p ? p.b : null; })()');
    check('a) previa: «Intento 1 de 3 de hoy», sin balance de Partido rápido', !ib || (ib.indexOf('Intento 1 de 3 de hoy') >= 0 && !ib.some(t => /Tu balance|victorias seguidas/.test(t))), ib);
    await waitFor('VB.ctx.state === "playing"', 15000);

    // ---- b) pausa
    await E('VB.ctx.actions.pause(), 1'); await sleep(500);
    const pz = await J('(function(){ var w = document.querySelector(".p-warn"), r = document.getElementById("btnRestart"); return { st: VB.ctx.state, warn: w && !w.hidden ? w.textContent : "", restart: !!(r && !r.hidden && !r.closest("[hidden]")) }; })()');
    check('b) pausa con el aviso del intento y «Reiniciar»', pz.st === 'paused' && /gasta este intento/.test(pz.warn) && pz.restart, pz);
    await E('VB.ctx.actions.resume(), 1'); await sleep(300);

    // ---- c) hasta la hoja final con autopilot
    await E('(VB.ctx.game.autopilot = true), 1');
    const over = await waitFor('VB.ctx.state === "over" && !!VB.UI._semEnd()', 150000);
    check('c) el partido acaba y Semana.finish cierra el intento', over, await J('{ st: VB.ctx.state, score: VB.ctx.game && VB.ctx.game.score }'));
    if (over) {
      await sleep(1500);
      const se = await J('VB.UI._semEnd()'), rc = await J('(function(){ var r = VB.UI._recap(); return r ? r.buttons : null; })()');
      check('c) cierre con el resultado y left 2', se && (se.left | 0) === 2 && se.i === 1, se);
      const ids = JSON.stringify(rc || '');
      check('c) hoja final: Otro intento, Compartir, Ver el grupo y Menú', /again/.test(ids) && /share/.test(ids) && /group/.test(ids) && /menu/i.test(ids), rc);
      check('c) sin récord, XP ni perfil (el intento no cuenta)', (await E('(function(){ try { return !localStorage.getItem("make-the-cut.record") || !/"winRun":[1-9]/.test(localStorage.getItem("make-the-cut.record")); } catch (e) { return true; } })()')));
    }

    // ---- d) 0 intentos: Reiniciar no abandona
    await E('VB.ctx.actions.toMenu(), 1'); await ready(); await idle();
    await E('VB.UI.openRetos("semana"), 1'); await sleep(500);
    await E('document.querySelector("[data-sem=go]").click(), 1');
    await waitFor('!!(VB.ctx.game && VB.ctx.game.sit && VB.ctx.state === "playing")', 20000);
    // gasta el resto de intentos de hoy sin jugarlos (begin) para quedarse a 0 con un partido en juego
    const lft = await E('(function(){ var M = VB.Semana; while (M.left() > 0) { M.begin(); } return M.left(); })()');
    await E('VB.ctx.actions.pause(), 1'); await sleep(400);
    const before = await J('{ g: VB.ctx.game && VB.ctx.game.sit, st: VB.ctx.state }');
    await E('(function(){ var b = document.getElementById("btnRestart"); if (b) { b.click(); b.click(); } return 1; })()'); await sleep(800);
    const after = await J('{ g: VB.ctx.game && VB.ctx.game.sit, st: VB.ctx.state }');
    check('d) con 0 intentos «Reiniciar» no tira el partido en juego', lft === 0 && after.st !== 'menu' && after.g && before.g && after.g.i === before.g.i, { lft, before, after });

    // ---- e) ?sem= de un amigo
    const link = await E('VB.Semana.link()');
    const q = String(link).split('?')[1] || '';
    await E('VB.ctx.actions.toMenu(), 1'); await sleep(400);
    await page.navigate('nonews=1&uianim=0&' + q); await ready();
    const opened = await waitFor('VB.UI.menuPage() === "retos" && !/[?&]sem=/.test(location.search)', 25000);
    check('e) ?sem= abre Retos › Semana y se quita de la barra', opened, await J('{ page: VB.UI.menuPage(), search: location.search }'));
    check('e) sin errores de consola', !page.errors.length, page.errors.slice(0, 5));
  } catch (e) {
    fails++; console.log('  FAIL excepción: ' + (e && e.stack || e));
  } finally {
    if (page) await page.close();
  }
  console.log('\n' + oks + ' bien, ' + fails + ' fallos');
  console.log(fails ? 'FALLOS' : 'TODO OK');
  process.exit(fails ? 1 : 0);
})();
