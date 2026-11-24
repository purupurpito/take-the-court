#!/usr/bin/env node
/* TAKE THE COURT — tools/semanacdp.js (owner: ui_main)
 * La jugada del día (antes «La situación de la semana») DE VERDAD en Chrome (tools/cdp.js), el flujo completo que semanatest (node) no ve:
 *   a) Retos › Jugada › «¡A jugar!» → el partido arranca en el marcador de hoy (g.score = situation().score), Semana.begin
 *      gasta el intento al empezar (left 3 → 2) y la previa dice «Intento 1 de 3 de hoy» (sin «Tu balance en…»)
 *   b) pausa: aviso «Reiniciar o salir gasta este intento» y «Reiniciar» a la vista (quedan intentos)
 *   c) hoja final (autopilot hasta el final): VB.Semana.finish cerró el intento y la hoja lleva Otro intento, Compartir, Ver el grupo y Menú
 *   d) con 0 intentos: «Reiniciar» no abandona el intento en juego (toast y sigue)
 *   e) ?sem=… (enlace de un amigo): se une la cadena, se abre Retos › Jugada y se quita sem= de la barra
 *   f) el sello de la portada (junto a JUGAR) es el de la jugada, con su marcador, y abre Retos › Jugada
 *   g) la ventana al entrar (24-nov-2026): sale la primera (sin Novedades encima) a quien ya ha jugado, con título, objetivo, racha,
 *      «¡A por ella!» y «Ahora no»; Esc la cierra; una vez por sesión; no sale con un partido a medias («Seguir el partido»); «¡A por
 *      ella!» arranca la jugada; cumplida hoy ya no sale y el sello dice «Hecha» con la chapa de la racha; con ella abierta la portada
 *      no cuenta como libre (ni instalar ni Novedades encima); un intento colgado de una pestaña muerta no la quita
 *   h) jugada del día en 6v6 con el 1r 6v6 del aparato: antes la ventana de la calidad (sin gastar el intento), luego el partido, y sin
 *      el aviso de colocador detrás
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
    check('a) Retos › Jugada con «¡A jugar!» a la vista', await E('(function(){ var b = document.querySelector("[data-sem=go]"); if (!b || b.closest("[hidden]")) return false; var r = b.getBoundingClientRect(); return r.width > 0 && r.height >= 44; })()'));
    await E('document.querySelector("[data-sem=go]").click(), 1');
    check('a) el partido arranca', await waitFor('!!(VB.ctx.game && VB.ctx.game.sit && (VB.ctx.state === "playing" || VB.ctx.state === "intro"))', 15000));
    const g0 = await J('{ score: VB.ctx.game.score, sit: VB.ctx.game.sit, setNo: VB.ctx.game.setNo, sets: VB.ctx.game.sets }');
    check('a) en el marcador de hoy', g0.score[0] === sit.score[0] && g0.score[1] === sit.score[1] && g0.setNo === sit.setNo, { g: g0, sit: sit });
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
      check('c) el autopilot no apunta señas en el Cuaderno del árbitro', await E('(function(){ try { var r = localStorage.getItem("make-the-cut.profile"); return !r || !JSON.parse(r).sen; } catch (e) { return true; } })()'));
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
    check('e) ?sem= abre Retos › Jugada y se quita de la barra', opened, await J('{ page: VB.UI.menuPage(), search: location.search }'));

    // ---- f) sello de la portada: la situación (marcador e intentos) y abre Retos › Semana
    await E('VB.ctx.actions.toMenu(), 1'); await ready(); await idle();
    await E('(function(){ try { VB.UI.openRetos("hoy"); } catch (e) {} return 1; })()'); await sleep(300);
    await E('VB.ctx.actions.toMenu(), 1'); await ready(); await idle();
    const stOk = await waitFor('(function(){ var b = document.getElementById("btnMjReto"), s = VB.Semana.situation(); return !!(b && !b.hidden && b.classList.contains("mj-sem") && b.getAttribute("aria-label").indexOf("La jugada del día: " + s.score[0] + "-" + s.score[1]) === 0 && b.querySelector(".mj-semsc")); })()', 6000);
    check('f) el sello de la portada es el de la jugada (marcador e intentos)', stOk, await J('(function(){ var b = document.getElementById("btnMjReto"); return b ? { cls: b.className, aria: b.getAttribute("aria-label"), h: b.innerHTML.slice(0, 200) } : null; })()'));
    await E('document.getElementById("btnMjReto").click(), 1');
    check('f) el sello abre Retos › Jugada', await waitFor('VB.UI.menuPage() === "retos" && !!document.querySelector("[data-sem=go]")', 5000), await J('{ page: VB.UI.menuPage() }'));

    // ---- g) la ventana al entrar
    const prep = async (resume) => {
      await E('(function(){ try { sessionStorage.clear(); localStorage.removeItem("make-the-cut.semana"); localStorage.removeItem("make-the-cut.resume"); localStorage.setItem("make-the-cut.record", JSON.stringify({ played: 1, wins: 1, bestStreak: 0, winRun: 0, tut: 0, lastA: 0, lastB: 0, lastD: "", byD: {}, anyMatch: 1, intro: 1 })); localStorage.setItem("make-the-cut.seen", JSON.stringify({ v: VB.VERSION })); } catch (e) {} return 1; })()');
      if (resume) await E('(function(){ localStorage.setItem("make-the-cut.resume", JSON.stringify({ f: 1, v: VB.VERSION, t: Date.now(), kind: "quick", opts: {}, gOpts: {}, snap: { v: 2 }, sc: { score: [18, 15], sets: [1, 0], setNo: 2, one: false, size: 2 } })); return 1; })()');
    };
    await E('VB.ctx.actions.toMenu(), 1'); await ready();
    await prep(false);
    await page.navigate('uianim=0'); await ready();
    const popped = await waitFor('VB.UI.semPopOpen()', 9000);
    const pop = await J('(function(){ var p = document.querySelector("#spSheets .sp-sheet"); if (!p) return null; var t = p.querySelector(".sp-sh-t"); return { t: t && t.textContent, go: !!document.getElementById("btnSemPopGo"), no: !!document.getElementById("btnSemPopNo"), goal: (p.querySelector(".semp-goal") || {}).textContent || "", rk: (p.querySelector(".semp-rk") || {}).textContent || "", desc: p.getAttribute("aria-describedby"), panel: VB.UI.isPanelOpen(), page: VB.UI.menuPage(), sit: VB.Semana.situation().goal }; })()');
    check('g) la ventana sale sola al entrar, la primera (sin Novedades ni Retos encima)', popped && pop && !pop.panel && pop.page === 'main', pop);
    check('g) título, objetivo de hoy, racha, «¡A por ella!» y «Ahora no» (con descripción para el lector)', pop && pop.t === 'La jugada del día' && pop.goal === pop.sit && /racha/i.test(pop.rk) && pop.go && pop.no && pop.desc === 'sempDesc', pop);
    await sleep(2600);
    check('g) con la ventana abierta la portada no cuenta como libre: el aviso de instalar ni las Novedades salen encima', !(await E('VB.UI.menuIdle()')) && !(await E('!!(VB.Install && VB.Install.isOpen())')) && !(await E('VB.UI.isPanelOpen()')));
    await E('document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })), window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })), 1'); await sleep(300);
    check('g) Esc la cierra', !(await E('VB.UI.semPopOpen()')));
    await page.navigate('uianim=0'); await ready(); await sleep(3500);
    check('g) una vez por sesión: al recargar no vuelve', !(await E('VB.UI.semPopOpen()')));
    await prep(true);
    await page.navigate('uianim=0'); await ready(); await sleep(3500);
    check('g) con un partido a medias no sale («Seguir el partido» manda)', !(await E('VB.UI.semPopOpen()')) && (await E('(function(){ var b = document.getElementById("btnSeguir"); return !!(b && !b.hidden); })()')));
    await prep(false);
    await E('(function(){ var M = VB.Semana; localStorage.setItem(M.KEY, JSON.stringify({ v: 2, day: M.today(), me: "abc", n: 1, open: { sid: "muerta", i: 1, t: Date.now() - 5 * 60000 }, tries: [], best: null, streak: { cur: 0, best: 0, last: 0 } })); return 1; })()');
    await page.navigate('uianim=0'); await ready();
    check('g) un intento colgado de una pestaña cerrada a medias no quita la ventana', await waitFor('VB.UI.semPopOpen()', 9000));
    await E('document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })), window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })), 1'); await sleep(300);
    await prep(false);
    await page.navigate('uianim=0'); await ready();
    await waitFor('VB.UI.semPopOpen()', 9000);
    await E('document.getElementById("btnSemPopGo").click(), 1');
    check('g) «¡A por ella!» arranca la jugada (intento 1)', await waitFor('!!(VB.ctx.game && VB.ctx.game.sit && VB.ctx.game.sit.i === 1)', 15000) && (await E('VB.Semana.left()')) === 2);
    await E('VB.ctx.actions.toMenu(), 1'); await ready();
    await E('(function(){ var M = VB.Semana, s = M.situation(), o = M.begin(), w = Math.max(s.T, s.score[1] + 2); M.finish({ sit: o.sit }, { win: true, a: w, b: w - 2 }); sessionStorage.clear(); return 1; })()');
    await page.navigate('uianim=0'); await ready(); await sleep(3500);
    check('g) cumplida hoy: ya no sale', !(await E('VB.UI.semPopOpen()')));
    const stD = await J('(function(){ var b = document.getElementById("btnMjReto"); return b ? { ok: !!b.querySelector(".mj-semok"), r: (b.querySelector(".mj-semr") || {}).textContent || "", aria: b.getAttribute("aria-label") } : null; })()');
    check('g) el sello lleva la marca de cumplida y la racha (1)', stD && stD.ok && stD.r === '1' && /cumplida hoy\. Racha: 1 día seguido/.test(stD.aria), stD);
    // ---- h) jugada del día en 6v6 y 1r 6v6 de este aparato: antes, la ventana de la calidad (y sin el aviso de colocador detrás)
    await E('(function(){ sessionStorage.setItem("make-the-cut.sempop", "1"); localStorage.removeItem("make-the-cut.semana"); return 1; })()');
    await page.navigate('uianim=0'); await ready(); await idle();
    await E('(function(){ VB.Semana._now(20261130); VB.ctx.actions.setSetting("q6Asked", false); return 1; })()');
    check('h) la jugada del 30-nov es 6v6', await E('!!VB.Semana.situation().six'));
    await E('VB.UI.openRetos("semana"), 1'); await sleep(600);
    await E('document.querySelector("[data-sem=go]").click(), 1');
    const pq = await waitFor('!!document.querySelector("#setNote:not([hidden]) .sn-perf")', 4000);
    check('h) «¡A jugar!» en una jugada 6v6: primero la ventana de la calidad, sin gastar el intento', pq && !(await E('!!(VB.ctx.game && VB.ctx.game.sit)')) && (await E('VB.Semana.left()')) === 3);
    await sleep(500); await E('document.querySelector("#setNote [data-sn=q-auto]").click(), 1');
    check('h) al elegir, arranca la jugada en 6v6 (intento 1) y queda apuntado en este aparato', await waitFor('!!(VB.ctx.game && VB.ctx.game.sit && VB.ctx.game.size === 6)', 15000) && (await E('VB.ctx.settings.q6Asked === true')) && (await E('VB.Semana.left()')) === 2);
    check('h) tras la ventana de la calidad, el aviso de colocador ya no sale en esta sesión', !(await E('VB.UI.setterNote({ from: "x" })')));
    await E('VB.ctx.actions.toMenu(), 1'); await E('VB.Semana._now(0), 1');
    check('e-h) sin errores de consola', !page.errors.length, page.errors.slice(0, 5));
  } catch (e) {
    fails++; console.log('  FAIL excepción: ' + (e && e.stack || e));
  } finally {
    if (page) await page.close();
  }
  console.log('\n' + oks + ' bien, ' + fails + ' fallos');
  console.log(fails ? 'FALLOS' : 'TODO OK');
  process.exit(fails ? 1 : 0);
})();
