#!/usr/bin/env node
/* TAKE THE COURT — tools/cortostest.js  (owner: ui_main)
 * Partidos cortos (1.22.0, informe de juegos de vóley 4.5) en el juego real (Chrome headless, perfil nuevo, DE UNO EN UNO):
 *  (a) la sim: el set a 7 solo con opts.quick (sin él, 25 como siempre) y Sim.SET_POINTS sin cambiar;
 *  (b) menú de Partido rápido: fila «Duración» (#optLen) que recorre Completo → Un set → «Desde 20-20» y se guarda en matchLen;
 *  (c) «Final apretado» a 25: un set (g.toWin 1) que empieza en el 20-20, g.short {len:'clutch', from:20};
 *  (d) al acabar: ni récord, ni retos, ni XP del escuadrón, ni perfil; la hoja dice «Partido corto»;
 *  (e) un set a 15 y set a 7 al mejor de 3 (g.short también); el partido de siempre (Completo, 25) sin g.short y al mejor de 3;
 *  (f) «Jugar ya», los retos y quien trae sets/points no se tocan (sin g.short) aunque el ajuste diga «Un set»;
 *  (g) ajustes viejos sin matchLen → 'full'; matchLen dañado → 'full'.
 * Uso: node tools/cortostest.js   (sale con 1 si algo falla)
 */
'use strict';
const CDP = require('./cdp.js');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fail = 0;
const ok = (c, m) => { if (c) console.log('ok:', m); else { fail++; console.error('FALLO:', m); } };
setTimeout(() => { console.error('TIEMPO AGOTADO'); process.exit(2); }, 300e3).unref();

async function waitFor(pg, expr, ms) { const t = Date.now() + ms; while (Date.now() < t) { try { if (await pg.evalJs(expr)) return true; } catch (e) { } await sleep(150); } return false; }
const READY = "VB.ctx&&VB.ctx.state==='menu'&&VB.UI&&VB.UI.bootBusy&&!VB.UI.bootBusy()";
const GS = "JSON.stringify((function(g){return {short:g.short||null,tw:g.toWin===undefined?null:g.toWin,pts:g.points,sc:g.score.slice(),sets:g.sets.slice(),pn:g.playNow||null,reto:!!g.reto,st0:!!g.st0}})(VB.ctx.game))";

(async () => {
  let pg = null;
  try {
    pg = await CDP.open({ size: '1280x720' });
    await pg.navigate('');
    ok(await waitFor(pg, READY, 25000), 'arranca en el menú');
    // ya ha jugado (sin el panel «Primer partido») y en el pabellón
    await pg.evalJs("localStorage.setItem('make-the-cut.record',JSON.stringify({played:3,wins:1,winRun:0,bestStreak:4,tut:true}));VB.ctx.actions.setSetting('arena','hall');VB.ctx.actions.setSetting('format','2v2')");
    await pg.navigate(''); ok(await waitFor(pg, READY, 25000), 'recarga con récord');
    // ---------------------------------------------------------------- (a) la sim
    const sm = await pg.evalJs("JSON.stringify({a:VB.Sim.createGame({demo:true,seed:1,points:7}).points,b:VB.Sim.createGame({seed:1,points:7,quick:true}).points,c:VB.Sim.createGame({seed:1,points:7,quick:true,venue:'beach'}).points,sp:VB.Sim.SET_POINTS.join(',')})").then(JSON.parse);
    ok(sm.a === 25 && sm.b === 7 && sm.c === 21 && sm.sp === '11,15,21,25', 'sim: 7 solo con quick (sin él 25; playa 21); SET_POINTS igual (' + JSON.stringify(sm) + ')');
    // ---------------------------------------------------------------- (b) menú
    await pg.evalJs("VB.ctx.actions.setSetting('setPoints',25);VB.UI.menuGo?VB.UI.menuGo('quick'):0");
    await sleep(500);
    const m0 = await pg.evalJs("JSON.stringify({v:document.getElementById('lenVal').textContent,s:VB.ctx.settings.matchLen,vis:!!document.getElementById('optLen').offsetParent})").then(JSON.parse);
    ok(m0.v === 'Completo' && m0.s === 'full', 'Duración por defecto: Completo (' + JSON.stringify(m0) + ')');
    await pg.evalJs("document.querySelector('#optLen .arr[data-d=\"1\"]').click()"); await sleep(200);
    const m1 = await pg.evalJs("JSON.stringify({v:document.getElementById('lenVal').textContent,s:VB.ctx.settings.matchLen})").then(JSON.parse);
    ok(m1.v === 'Un set' && m1.s === 'one', '› → Un set (' + JSON.stringify(m1) + ')');
    await pg.evalJs("document.querySelector('#optLen .arr[data-d=\"1\"]').click()"); await sleep(200);
    const m2 = await pg.evalJs("JSON.stringify({v:document.getElementById('lenVal').textContent,s:VB.ctx.settings.matchLen,h:document.getElementById('lenHelp').textContent})").then(JSON.parse);
    ok(m2.v === 'Desde 20-20' && m2.s === 'clutch', '› → Desde 20-20 (' + JSON.stringify(m2) + ')');
    await pg.evalJs("VB.ctx.actions.setSetting('setPoints',15)"); await sleep(150);
    const m3 = await pg.evalJs("document.getElementById('lenVal').textContent");
    ok(m3 === 'Desde 10-10', 'a 15: Desde 10-10 (' + m3 + ')');
    await pg.evalJs("VB.ctx.actions.setSetting('setPoints',25)");
    // ---------------------------------------------------------------- (c) final apretado
    const before = await pg.evalJs("JSON.stringify({r:localStorage.getItem('make-the-cut.record'),rt:localStorage.getItem('make-the-cut.retos'),sq:localStorage.getItem('make-the-cut.squad'),pf:localStorage.getItem('make-the-cut.profile')})").then(JSON.parse);
    await pg.evalJs("document.getElementById('btnGo').click()");
    ok(await waitFor(pg, "VB.ctx.state==='playing'&&VB.ctx.game&&!VB.ctx.game.demo", 10000), '¡A jugar! empieza el partido');
    const g1 = await pg.evalJs(GS).then(JSON.parse);
    ok(g1.short && g1.short.len === 'clutch' && g1.short.from === 20 && g1.tw === 1 && g1.pts === 25 && g1.sc[0] === 20 && g1.sc[1] === 20, 'Final apretado: un set a 25 desde el 20-20 (' + JSON.stringify(g1) + ')');
    // ---------------------------------------------------------------- (d) al acabar no cuenta
    await pg.evalJs("(function(){var g=VB.ctx.game;g.score[1]=24;})()");
    ok(await waitFor(pg, "VB.ctx.state==='over'", 90000), 'el partido acaba');
    await sleep(800);
    const after = await pg.evalJs("JSON.stringify({r:localStorage.getItem('make-the-cut.record'),rt:localStorage.getItem('make-the-cut.retos'),sq:localStorage.getItem('make-the-cut.squad'),pf:localStorage.getItem('make-the-cut.profile'),txt:document.getElementById('endRecord').textContent})").then(JSON.parse);
    ok(after.r === before.r, 'récord sin tocar');
    ok(after.rt === before.rt, 'retos sin tocar');
    ok(after.sq === before.sq, 'XP e insignias del escuadrón sin tocar');
    ok(after.pf === before.pf, 'perfil (XP de perfil) sin tocar');
    ok(/Partido corto/.test(after.txt), 'la hoja lo dice («' + (after.txt.match(/Partido corto[^A-Z]*/) || [''])[0] + '»)');
    // ---------------------------------------------------------------- (e) un set / set a 7 / el de siempre
    const start = async (pre, o) => { await pg.evalJs("VB.ctx.actions.toMenu();" + pre); await sleep(300); await pg.evalJs('VB.ctx.actions.startMatch(' + (o || "{format:'2v2'}") + ')'); await waitFor(pg, "VB.ctx.state==='playing'&&VB.ctx.game&&!VB.ctx.game.demo", 10000); return pg.evalJs(GS).then(JSON.parse); };
    let g = await start("VB.ctx.actions.setSetting('matchLen','one');VB.ctx.actions.setSetting('setPoints',15);");
    ok(g.short && g.short.len === 'one' && g.tw === 1 && g.pts === 15 && g.sc[0] === 0 && !g.st0, 'Un set a 15 (' + JSON.stringify(g) + ')');
    g = await start("VB.ctx.actions.setSetting('matchLen','full');VB.ctx.actions.setSetting('setPoints',7);");
    ok(g.short && g.short.len === 'full' && g.tw === null && g.pts === 7, 'Completo con sets a 7: corto, al mejor de 3 (' + JSON.stringify(g) + ')');
    g = await start("VB.ctx.actions.setSetting('matchLen','full');VB.ctx.actions.setSetting('setPoints',25);");
    ok(!g.short && g.tw === null && g.pts === 25 && !g.st0, 'el de siempre: sin g.short, al mejor de 3 a 25 (' + JSON.stringify(g) + ')');
    // ---------------------------------------------------------------- (f) lo demás no se toca
    g = await start("VB.ctx.actions.setSetting('matchLen','clutch');", "{format:'2v2',introKind:'mini',sets:1,points:15,playNow:'ya'}");
    ok(!g.short && g.pn === 'ya' && g.pts === 15 && g.sc[0] === 0, '«Jugar ya» sin g.short (' + JSON.stringify(g) + ')');
    g = await start('', "{format:'2v2',reto:{kind:'win',key:'x',goal:1,n:1}}");
    ok(!g.short && g.reto && g.sc[0] === 0, 'reto del día sin g.short (' + JSON.stringify(g) + ')');
    g = await start("VB.ctx.actions.setSetting('format','6v6');VB.ctx.actions.setSetting('matchLen','clutch');VB.ctx.actions.setSetting('setPoints',25);", "{format:'6v6'}");
    ok(g.short && g.short.len === 'clutch' && g.tw === 1 && g.sc[0] === 20 && g.sc[1] === 20, '6 contra 6 también: desde el 20-20 (' + JSON.stringify(g) + ')');
    await pg.evalJs("VB.ctx.actions.toMenu();VB.ctx.actions.setSetting('format','2v2')");
    // ---------------------------------------------------------------- (g) ajustes viejos
    await pg.evalJs("(function(){var s=JSON.parse(localStorage.getItem('make-the-cut.settings')||'{}');delete s.matchLen;s.setPoints=21;localStorage.setItem('make-the-cut.settings',JSON.stringify(s));})()");
    await pg.navigate(''); ok(await waitFor(pg, READY, 25000), 'recarga con ajustes viejos');
    const s1 = await pg.evalJs("JSON.stringify({l:VB.ctx.settings.matchLen,p:VB.ctx.settings.setPoints})").then(JSON.parse);
    ok(s1.l === 'full' && s1.p === 21, 'ajustes sin matchLen → full, puntos intactos (' + JSON.stringify(s1) + ')');
    await pg.evalJs("(function(){var s=JSON.parse(localStorage.getItem('make-the-cut.settings')||'{}');s.matchLen='xx';s.setPoints=9;localStorage.setItem('make-the-cut.settings',JSON.stringify(s));})()");
    await pg.navigate(''); ok(await waitFor(pg, READY, 25000), 'recarga con ajustes dañados');
    const s2 = await pg.evalJs("JSON.stringify({l:VB.ctx.settings.matchLen,p:VB.ctx.settings.setPoints})").then(JSON.parse);
    ok(s2.l === 'full' && s2.p === 25, 'dañados → full y 25 (' + JSON.stringify(s2) + ')');
    const errs = (typeof pg.errors === 'function' ? pg.errors() : pg.errors) || [];
    ok(!errs.length, 'sin errores en la página' + (errs.length ? ': ' + JSON.stringify(errs.slice(0, 3)) : ''));
  } catch (e) { fail++; console.error('FALLO (excepción):', e && e.stack || e); }
  finally { if (pg) try { await pg.close(); } catch (e) { } }
  console.log(fail ? fail + ' fallo(s)' : 'cortostest: todo bien');
  process.exit(fail ? 1 : 0);
})();
