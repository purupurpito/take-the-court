#!/usr/bin/env node
/* TAKE THE COURT — tools/jugaryatest.js  (owner: ui_main)
 * «Jugar ya» (1.22.0, informe de juegos de vóley 4.3) en el juego real (Chrome headless, perfiles nuevos, DE UNO EN UNO):
 *  (a) portada de quien no ha jugado nunca: billete «¡Jugar ya!» (#btnNow) a la vista y JUGAR en fila plana; un toque = partido 2v2 a UN
 *      set a 15 en Fácil, sin el panel «Primer partido» y con g.playNow 'ya';
 *  (b) el primer punto apunta 'make-the-cut.firstpt' (ms desde que se abrió la página, via 'ya'); se imprime el tiempo;
 *  (c) al acabar ese primer partido el Resumen ofrece «Y ahora»: Carrera, Vestuario y Cuenta; Vestuario lleva al Vestuario del menú y la
 *      portada ya no enseña «¡Jugar ya!»;
 *  (d) ?jugar: directo al partido corto (g.playNow 'jugar') y el enlace queda sin «jugar»;
 *  (e) móvil (táctil, 844×390): el aviso de instalar NO sale antes del primer partido y sí cuando el récord ya tiene uno.
 * Uso: node tools/jugaryatest.js   (sale con 1 si algo falla)
 */
'use strict';
const CDP = require('./cdp.js');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fail = 0;
const ok = (c, m) => { if (c) console.log('ok:', m); else { fail++; console.error('FALLO:', m); } };
setTimeout(() => { console.error('TIEMPO AGOTADO'); process.exit(2); }, 300e3).unref();

async function waitFor(pg, expr, ms) { const t = Date.now() + ms; while (Date.now() < t) { try { if (await pg.evalJs(expr)) return true; } catch (e) { } await sleep(150); } return false; }
const READY = "VB.ctx&&VB.ctx.state==='menu'&&VB.ctx.frame>5&&VB.UI&&VB.UI.bootBusy&&!VB.UI.bootBusy()";   // (frame > 5: los módulos ya han hecho init, como en resumetest)

(async () => {
  let pg = null;
  try {
    // ---------------------------------------------------------------- (a)-(c) portada → «¡Jugar ya!» → primer punto → hoja final
    pg = await CDP.open({ size: '1280x720' });
    const t0 = Date.now();
    await pg.navigate('');
    ok(await waitFor(pg, READY, 25000), 'arranca en el menú');
    const por = await pg.evalJs(`(function(){var b=document.getElementById('btnNow'),p=document.getElementById('btnPlay');return JSON.stringify({vis:!!b&&!b.hidden&&b.offsetParent!==null,
      tk:!!b&&b.classList.contains('sp-ticket'),cls:document.getElementById('menu').classList.contains('has-now-mj'),pri:p.classList.contains('primary'),txt:b?b.textContent.replace(/\\s+/g,' ').trim():''})})()`).then(JSON.parse);
    ok(por.vis && por.tk && por.cls, 'novato: billete «¡Jugar ya!» a la vista (' + por.txt + ')');
    ok(!por.pri, 'novato: JUGAR pasa a fila plana');
    await pg.evalJs("document.getElementById('btnNow').click()");
    ok(await waitFor(pg, "VB.ctx.state==='playing'&&VB.ctx.game&&!VB.ctx.game.demo", 8000), 'un toque en «¡Jugar ya!» empieza el partido');
    const g = await pg.evalJs("JSON.stringify({pn:VB.ctx.game.playNow,pts:VB.ctx.game.points,tw:VB.ctx.game.toWin,d:VB.ctx.game.difficulty,s:VB.ctx.settings.difficulty,size:VB.ctx.game.size,first:!document.getElementById('pnFirst')||document.getElementById('pnFirst').hidden})").then(JSON.parse);
    ok(g.pn === 'ya' && g.pts === 15 && g.tw === 1 && g.size === 2, 'partido corto: 2v2, un set a 15, playNow ya (' + JSON.stringify(g) + ')');
    ok(g.d === 'easy' && g.s === 'easy', 'novato: en Fácil (y queda en Ajustes)');
    ok(g.first, 'sin el panel «Primer partido»');
    // sin tocar nada: falta de saque o saque de la CPU sin recibir → el primer punto llega solo
    ok(await waitFor(pg, "!!localStorage.getItem('make-the-cut.firstpt')", 40000), 'el primer punto apunta make-the-cut.firstpt');
    const fp = await pg.evalJs("localStorage.getItem('make-the-cut.firstpt')").then(s => JSON.parse(s || 'null'));
    ok(fp && fp.via === 'ya' && fp.ms > 0 && fp.m > 0 && /^\d{4}-\d\d-\d\d$/.test(fp.d), 'firstpt: ' + JSON.stringify(fp));
    console.log('  (tiempo hasta el primer punto en este PC, sin jugar: ' + (fp ? (fp.ms / 1000).toFixed(1) : '?') + ' s desde que se abrió la página, ' + (fp ? (fp.m / 1000).toFixed(1) : '?') + ' s desde que empezó el partido; test: ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s)');
    ok(await pg.evalJs("JSON.stringify(VB.UI.firstPoint())") === JSON.stringify(fp), 'VB.UI.firstPoint() devuelve lo guardado');
    // acabar ya: la CPU a 14 y el siguiente punto cierra el set único
    await pg.evalJs("(function(){var g=VB.ctx.game;g.score[1]=14;g.score[0]=Math.min(g.score[0],12);})()");
    ok(await waitFor(pg, "VB.ctx.state==='over'", 60000), 'el partido acaba');
    ok(await waitFor(pg, "!!document.querySelector('#endSum .rc-first')", 12000), 'hoja final: bloque «Y ahora»');
    const fr = await pg.evalJs("JSON.stringify([].map.call(document.querySelectorAll('#endSum .rc-first [data-first]'),function(b){return b.getAttribute('data-first')}))").then(JSON.parse);
    ok(fr[0] === 'career' && fr[1] === 'look' && (fr.length === 2 || fr[2] === 'acc'), '«Y ahora»: ' + fr.join(', '));
    const rec = await pg.evalJs("JSON.parse(localStorage.getItem('make-the-cut.record')).played");
    ok(rec === 1, 'el récord cuenta el partido (' + rec + ')');
    const btn = await pg.evalJs("document.getElementById('btnAgain').getAttribute('data-act')");
    ok(btn === 'again', 'botón principal: revancha (' + btn + ')');
    await pg.evalJs("document.querySelector('#endSum .rc-first [data-first=\"look\"]').click()");
    ok(await waitFor(pg, "VB.ctx.state==='menu'&&VB.UI.menuPage()==='look'", 6000), '«Vestuario» → el Vestuario del menú');
    await pg.evalJs('VB.UI.menuBack&&VB.UI.menuBack()'); await sleep(600);
    const now2 = await pg.evalJs("(function(){var b=document.getElementById('btnNow');return !!b&&!b.hidden})()");
    ok(!now2, 'tras el primer partido la portada ya no enseña «¡Jugar ya!»');
    // (22-nov) la revancha de «Jugar ya» de quien ya ha jugado es un partido corto más: no cuenta (g.short)
    await pg.evalJs("VB.ctx.actions.playNow('ya')");
    ok(await waitFor(pg, "VB.ctx.state==='playing'&&VB.ctx.game&&!VB.ctx.game.demo", 8000), '«Jugar ya» otra vez: empieza');
    const sh = await pg.evalJs("JSON.stringify(VB.ctx.game.short||null)").then(JSON.parse);
    ok(sh && sh.len === 'one' && sh.pts === 15, '«Jugar ya» de quien ya ha jugado: partido corto, no cuenta (' + JSON.stringify(sh) + ')');
    await pg.evalJs("VB.ctx.actions.toMenu()"); await sleep(600);
    ok(!pg.errors.length, 'sin errores de consola' + (pg.errors.length ? ': ' + pg.errors.slice(0, 3).join(' | ') : ''));
    pg.close(); pg = null; await sleep(800);

    // ---------------------------------------------------------------- (d) ?jugar
    pg = await CDP.open({ size: '1280x720' });
    await pg.navigate('jugar&x=1');
    ok(await waitFor(pg, "VB.ctx&&VB.ctx.state==='playing'&&VB.ctx.game&&!VB.ctx.game.demo", 25000), '?jugar: directo al partido');
    const j = await pg.evalJs("JSON.stringify({pn:VB.ctx.game.playNow,pts:VB.ctx.game.points,tw:VB.ctx.game.toWin,q:location.search})").then(JSON.parse);
    ok(j.pn === 'jugar' && j.pts === 15 && j.tw === 1, '?jugar: partido corto (' + JSON.stringify(j) + ')');
    ok(!(await pg.evalJs('!!VB.ctx.game.short')), '?jugar de un novato: su primer partido sí cuenta (sin g.short)');
    ok(j.q === '?x=1', '?jugar se quita del enlace y deja el resto (' + j.q + ')');
    ok(!pg.errors.length, '?jugar: sin errores de consola' + (pg.errors.length ? ': ' + pg.errors.slice(0, 3).join(' | ') : ''));
    pg.close(); pg = null; await sleep(800);

    // ---------------------------------------------------------------- (f) ya ha jugado, pero no el 2v2 largo (6v6, cortos, online…)
    pg = await CDP.open({ size: '1280x720' });
    await pg.navigate('');
    ok(await waitFor(pg, READY, 25000), '(f) arranca');
    await pg.evalJs("localStorage.setItem('make-the-cut.record',JSON.stringify({played:0,wins:0,bestStreak:0,winRun:0,tut:0,lastA:0,lastB:0,lastD:'',byD:{},anyMatch:1}))");
    await pg.navigate('');
    ok(await waitFor(pg, READY, 25000), '(f) recarga con anyMatch');
    ok(!(await pg.evalJs("(function(){var b=document.getElementById('btnNow');return !!b&&!b.hidden})()")), 'récord 2v2 a 0 pero ya ha jugado (anyMatch): sin «¡Jugar ya!»');
    await pg.navigate('jugar');
    ok(await waitFor(pg, "VB.ctx&&VB.ctx.state==='playing'&&VB.ctx.game&&!VB.ctx.game.demo", 25000), '(f) ?jugar');
    ok(await pg.evalJs("!!(VB.ctx.game.short&&VB.ctx.game.short.len==='one')"), '?jugar de quien ya ha jugado: partido corto que no cuenta');
    ok(!pg.errors.length, '(f) sin errores de consola' + (pg.errors.length ? ': ' + pg.errors.slice(0, 3).join(' | ') : ''));
    pg.close(); pg = null; await sleep(800);

    // ---------------------------------------------------------------- (e) aviso de instalar en el móvil, después del primer partido
    pg = await CDP.open({ size: '844x390', touch: true, ua: CDP.ANDROID_UA });
    await pg.navigate('');
    ok(await waitFor(pg, READY, 25000), 'móvil: arranca en el menú');
    await sleep(5000);
    ok(!(await pg.evalJs('!!(VB.Install&&VB.Install.isOpen())')), 'móvil, novato: el aviso de instalar no sale antes de jugar');
    ok(await pg.evalJs("(function(){var b=document.getElementById('btnNow');return !!b&&!b.hidden&&b.offsetParent!==null})()"), 'móvil: «¡Jugar ya!» a la vista');
    await pg.evalJs("localStorage.setItem('make-the-cut.record',JSON.stringify({played:1,wins:0,bestStreak:0,winRun:0,tut:0,lastA:0,lastB:1,lastD:'easy',byD:{}}))");
    ok(await waitFor(pg, '!!(VB.Install&&VB.Install.isOpen())', 8000), 'móvil: con un partido en el récord, el aviso sale');
    ok(!pg.errors.length, 'móvil: sin errores de consola' + (pg.errors.length ? ': ' + pg.errors.slice(0, 3).join(' | ') : ''));
    pg.close(); pg = null; await sleep(800);
    // (g) móvil: quien solo ha jugado 6v6 / cortos (récord 2v2 a 0, anyMatch 1) también ve el aviso de instalar
    pg = await CDP.open({ size: '844x390', touch: true, ua: CDP.ANDROID_UA });
    await pg.navigate('');
    ok(await waitFor(pg, READY, 25000), '(g) móvil: arranca');
    await pg.evalJs("localStorage.setItem('make-the-cut.record',JSON.stringify({played:0,wins:0,bestStreak:0,winRun:0,tut:0,lastA:0,lastB:0,lastD:'',byD:{},anyMatch:1}))");
    ok(await waitFor(pg, '!!(VB.Install&&VB.Install.isOpen())', 8000), 'móvil: récord 2v2 a 0 pero anyMatch 1 (6v6, cortos…): el aviso de instalar sale');
  } catch (e) { fail++; console.error('FALLO (excepción):', e && e.stack || e); }
  finally { if (pg) pg.close(); }
  console.log(fail ? 'jugaryatest: ' + fail + ' FALLO(S)' : 'jugaryatest: todo bien');
  process.exit(fail ? 1 : 0);
})();
