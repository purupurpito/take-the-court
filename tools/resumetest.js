#!/usr/bin/env node
/* TAKE THE COURT — tools/resumetest.js  (owner: ui_main)
 * «Retomar el partido» (1.22.0, informe de juegos de vóley 4.9; js/resume.js).
 *  A) node (vm con sim.js, ai.js, ai6.js, badges.js, retos.js, matchstats.js y resume.js): en 2v2, 6v6 con banquillo, playa, partido
 *     corto «Final apretado» y «Jugar ya», con una entrada fija por paso, VB.Resume guarda como en main.js (onFrame tras cada paso).
 *     Tras unos puntos se rehace la partida desde lo guardado (JSON → Sim.createGame(gOpts) → apply → mods) y las dos siguen con la
 *     MISMA entrada: stateHash igual en CADA saque siguiente (serveReady), la foto entera (Sim.serialize) igual en el primero, y al final
 *     lo que cuentan insignias, retos y la Estadística del partido idéntico. Además: nada antes del primer punto, gameOver borra, otra
 *     versión se descarta, una foto tocada no se aplica, ordinales «1r/2º/3r set», plain/unplain con jugadores.
 *  B) navegador (Chrome headless, perfil nuevo, UNA página; sin depuración): Partido rápido → 2 puntos → make-the-cut.resume con el
 *     marcador → recarga → billete «Seguir el partido a-b · 1r set» (y sin «¡Jugar ya!») → un toque → mismo marcador, armado, la hoja
 *     final con los puntos contados; restaurar en mitad de la pausa del punto (modo 'point') también; salir al menú lo borra; otra
 *     versión no sale; autopilot no se guarda; Carrera apagada (VB.Resume.CAREER false). Sin errores de consola.
 * Uso: node tools/resumetest.js [--node] [--browser]   (sin nada, las dos; sale con 1 si algo falla)
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
let fail = 0;
const ok = (c, m) => { if (c) console.log('ok:', m); else { fail++; console.error('FALLO:', m); } };
const ONLY_NODE = process.argv.includes('--node'), ONLY_BR = process.argv.includes('--browser');

// ------------------------------------------------------------------------------------------------ A) node
function loadVB() {
  const ctx = { console, Math, Date, JSON };
  ctx.globalThis = ctx; ctx.window = ctx;
  vm.createContext(ctx);
  for (const f of ['js/sim.js', 'js/ai.js', 'js/ai6.js', 'js/badges.js', 'js/retos.js', 'js/matchstats.js', 'js/resume.js']) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  ctx.VB.VERSION = 'test-1';
  return ctx.VB;
}
function inputAt(k) {   // entrada fija por paso (mueve, golpea, salta y coloca de vez en cuando)
  const a = Math.sin(k * 0.013) * 0.9, b = Math.cos(k * 0.0071) * 0.9;
  return { move: [a, b], hit: k % 37 === 0, jump: k % 91 === 0, jset: k % 173 === 0, switchPlayer: false };
}
function modsSnap(VB, g) {
  const b = VB.Badges.resumeGet(g), r = VB.Retos.resumeGet(g), m = VB.MatchStats.resumeGet(g);
  return JSON.stringify([b, r && r.c, m]);
}
function partA() {
  console.log('--- A) node: guardar y rehacer con la sim de verdad');
  const VB = loadVB(), S = VB.Sim, R = VB.Resume, DT = 1 / VB.C.SIM_HZ;
  ok(R.setLabel(1) === '1r set' && R.setLabel(2) === '2º set' && R.setLabel(3) === '3r set' && R.setLabel(4) === '4º set', 'ordinales: ' + [1, 2, 3, 4].map(R.setLabel).join(', '));
  const CASES = [
    { id: '2v2', o: { demo: false, seed: 42, difficulty: 'normal', present: true, stats: true, mastery: true, aimSet: true, feint: true, djump: true, points: 21, ctrl: 'one', ctrlIdx: 0, venue: 'hall' }, at: 3, secs: 420 },
    { id: '6v6 con banquillo', o: { demo: false, seed: 7, difficulty: 'hard', present: true, stats: true, format: '6v6', ctrl: 'one', ctrlRole: 'OH', feint: true, djump: true, bench: [S.defaultBench(0), S.defaultBench(1)], coach: [{ auto: true, iq: 2 }, { auto: false, iq: 2 }] }, at: 4 },
    { id: 'playa (zona)', o: { demo: false, seed: 9, difficulty: 'easy', present: true, stats: true, venue: 'beach', mastery: true, djump: true, zone: {} }, at: 2 },
    { id: 'corto «Final apretado»', o: { demo: false, seed: 11, difficulty: 'expert', present: true, stats: true, quick: true, sets: 1, points: 25, start: { setNo: 1, score: [20, 20], serving: 1, srvIdx: 0, bo1: true }, mastery: true, djump: true }, at: 1, qs: { len: 'clutch', pts: 25, from: 20 } },
    { id: '«Jugar ya» (un set a 15)', o: { demo: false, seed: 5, difficulty: 'easy', present: true, stats: true, sets: 1, points: 15, mastery: true, djump: true, rookie: true }, at: 2 }
  ];
  for (const C of CASES) {
    VB.Badges._reset(); VB.Retos._reset(); VB.MatchStats.reset(); R.clear();
    const gOpts = JSON.parse(JSON.stringify(C.o));
    const g = S.createGame(JSON.parse(JSON.stringify(gOpts)));
    R.arm(g, { kind: 'quick', opts: { format: C.o.format || '2v2' }, gOpts, map: '', qs: C.qs || null });
    const ev = [], feed = (gg, list) => { for (const e of list) { VB.Badges.ingest(e, gg); VB.Retos.ingest(e, gg); VB.MatchStats.ingest(e, gg); } };
    S.drainEvents(g, ev); feed(g, ev);
    let k = 0, pts = 0, early = false, kS = -1, rec = null;
    for (; k < 120 * 900 && !g.finished; k++) {
      S.step(g, DT, inputAt(k)); ev.length = 0; S.drainEvents(g, ev); feed(g, ev);
      if (!pts && R.load()) early = true;
      R.onFrame(g, ev);
      for (const e of ev) if (e.type === 'point') pts++;
      if (pts >= C.at && ev.some(e => e.type === 'point')) { kS = k; rec = R.load(); break; }
    }
    ok(!early, C.id + ': nada guardado antes del primer punto');
    ok(!!rec && rec.kind === 'quick' && rec.v === 'test-1' && rec.sc.score[0] === g.score[0] && rec.sc.score[1] === g.score[1] && rec.sc.setNo === g.setNo,
      C.id + ': guardado al acabar el punto ' + C.at + ' (' + (rec ? rec.sc.score.join('-') + ', ' + R.setLabel(rec.sc.setNo) + ', ' + JSON.stringify(rec).length + ' bytes' : 'nada') + ', modo ' + g.mode + ')');
    if (!rec) continue;
    const pk = R.peek();
    ok(pk && pk.label === 'Seguir el partido' && pk.sub === g.score[0] + '-' + g.score[1] + ' · ' + (rec.sc.one ? 'set único' : R.setLabel(g.setNo)), C.id + ': portada «' + (pk && pk.label + ' ' + pk.sub) + '»');
    const mods0 = rec.mods;
    // el original sigue: hashes en cada saque y foto en el primero; al final, lo contado por los módulos
    const N = 120 * (C.secs || 150), hA = [], snapA = [];
    for (let j = 1; j <= N && !g.finished; j++) {
      S.step(g, DT, inputAt(kS + j)); ev.length = 0; S.drainEvents(g, ev); feed(g, ev); R.onFrame(g, ev);
      if (ev.some(e => e.type === 'serveReady')) { hA.push(j + ':' + S.stateHash(g)); if (snapA.length < 1) snapA.push(JSON.stringify(S.serialize(g))); }
    }
    const modsA = modsSnap(VB, g), finA = g.finished;
    if (finA) ok(!R.load(), C.id + ': gameOver borra lo guardado');
    // rehecho desde el JSON guardado (como tras recargar la página)
    VB.Badges._reset(); VB.Retos._reset(); VB.MatchStats.reset();
    const rec2 = JSON.parse(JSON.stringify(rec));
    const g2 = S.createGame(JSON.parse(JSON.stringify(rec2.gOpts)));
    ok(R.apply(rec2, g2), C.id + ': apply (huella de la foto = la de la partida rehecha)');
    R.mods(rec2, g2);
    ok(JSON.stringify(R._plain(VB.Badges.resumeGet(g2), g2)) === JSON.stringify(mods0.bd) && JSON.stringify(R._plain(VB.Retos.resumeGet(g2), g2)) === JSON.stringify(mods0.rt), C.id + ': insignias y retos vuelven tal cual');
    R.arm(g2, { kind: 'quick', opts: {}, gOpts: rec2.gOpts, played: true });
    const hB = [], snapB = [];
    for (let j = 1; j <= N && !g2.finished; j++) {
      S.step(g2, DT, inputAt(kS + j)); ev.length = 0; S.drainEvents(g2, ev); feed(g2, ev); R.onFrame(g2, ev);
      if (ev.some(e => e.type === 'serveReady')) { hB.push(j + ':' + S.stateHash(g2)); if (snapB.length < 1) snapB.push(JSON.stringify(S.serialize(g2))); }
    }
    ok(hA.length > 0 && JSON.stringify(hA) === JSON.stringify(hB), C.id + ': stateHash igual en los ' + hA.length + ' saques siguientes' + (hA.length ? ' (1º ' + hA[0] + ')' : ''));
    ok(snapA.length === 1 && snapA[0] === snapB[0], C.id + ': la foto entera igual en el saque siguiente');
    ok(modsA === modsSnap(VB, g2), C.id + ': insignias, retos y Estadística del partido idénticos al final (' + (finA ? 'partido acabado' : g.score.join('-') + ' set ' + g.setNo) + ')');
  }
  // versión distinta, foto tocada, plain/unplain
  {
    const g = S.createGame({ demo: false, seed: 3, difficulty: 'normal', stats: true });
    g.score[0] = 4; g.score[1] = 2;
    R.arm(g, { kind: 'quick', opts: {}, gOpts: { demo: false, seed: 3, difficulty: 'normal', stats: true } });
    ok(!R.save(g) && !R.load(), 'con marcador pero sin punto jugado aquí (p. ej. «Final apretado» a 20-20): no se guarda');
    R.arm(g, { kind: 'quick', opts: {}, gOpts: { demo: false, seed: 3, difficulty: 'normal', stats: true }, played: true });
    ok(R.save(g) && !!R.load(), 'save con marcador 4-2 (retomado: played)');
    VB.VERSION = 'test-2';
    ok(!R.load() && !R.load(), 'otra versión: se descarta (y se borra)');
    VB.VERSION = 'test-1';
    R.save(g); const rec = R.load(); rec.h = (rec.h + 1) >>> 0;
    ok(!R.apply(rec, S.createGame({ demo: false, seed: 3, difficulty: 'normal', stats: true })), 'foto con la huella tocada: no se aplica');
    const p = g.players[1], pl = R._plain({ a: [p, null], b: { c: g, n: 3 } }, g);
    const up = R._unplain(JSON.parse(JSON.stringify(pl)), g);
    ok(pl.a[0].$pid === p.id && up.a[0] === p && up.b.c === g && up.b.n === 3, 'plain/unplain: jugadores por id y la partida');
    R.arm(g, { kind: 'career', opts: {}, gOpts: {}, played: true }); R.save(g);
    ok(!R.peek() && R.CAREER === false, 'Carrera: el interruptor está apagado (peek no la ofrece)');
    R.clear(); R.disarm();
  }
}

// ------------------------------------------------------------------------------------------------ B) navegador
async function partB() {
  console.log('--- B) navegador: guardar, recargar y «Seguir el partido»');
  const CDP = require('./cdp.js');
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  async function waitFor(pg, expr, ms) { const t = Date.now() + ms; while (Date.now() < t) { try { if (await pg.evalJs(expr)) return true; } catch (e) { } await sleep(150); } return false; }
  // (ctx.frame > 5: los módulos ya han hecho init; antes de init ui.js bootBusy() da false y el menú «parece» listo)
  const READY = "VB.ctx&&VB.ctx.state==='menu'&&VB.ctx.frame>5&&VB.UI&&VB.UI.bootBusy&&!VB.UI.bootBusy()";
  const J = async (pg, expr) => JSON.parse(await pg.evalJs('JSON.stringify(' + expr + ')'));
  const pg = await CDP.open({ size: '1280x720' });
  try {
    await pg.navigate('');
    ok(await waitFor(pg, READY, 30000), 'arranca en el menú');
    await pg.evalJs("localStorage.setItem('make-the-cut.record', JSON.stringify({played:3,won:1}));VB.ctx.actions.setSetting('difficulty','easy');VB.ctx.actions.setSetting('matchLen','full');VB.ctx.actions.setSetting('setPoints',25)");
    ok(await J(pg, 'VB.Resume.CAREER') === false, 'Carrera detrás del interruptor apagado');
    // autopilot (herramientas): no se arma
    await pg.evalJs("VB.ctx.actions.startMatch({autopilot:true,noIntro:true})"); await sleep(400);
    ok(await J(pg, '!VB.Resume.armed()'), 'partido con autopilot: no se guarda');
    await pg.evalJs("VB.ctx.actions.toMenu()");
    ok(await waitFor(pg, "VB.ctx.state==='menu'", 5000), 'de vuelta al menú');
    // Partido rápido 2v2: dos puntos sin tocar nada (faltas de saque / la CPU)
    await pg.evalJs("VB.ctx.actions.startMatch({format:'2v2'})");
    ok(await waitFor(pg, "VB.ctx.state==='playing'&&VB.ctx.game&&!VB.ctx.game.demo&&VB.Resume.armed()===VB.ctx.game", 10000), 'Partido rápido: armado');
    ok(await J(pg, "!localStorage.getItem('make-the-cut.resume')"), 'sin punto jugado: nada guardado');
    ok(await waitFor(pg, "VB.ctx.game.score[0]+VB.ctx.game.score[1]>=2&&VB.ctx.game.mode==='serve'", 90000), 'dos puntos jugados');
    // foto en mitad de la pausa del punto (modo point): se copia para probarla después
    ok(await waitFor(pg, "VB.ctx.game.mode==='point'&&(function(){var r=JSON.parse(localStorage.getItem('make-the-cut.resume')||'null');return !!r&&r.sc.score[0]+r.sc.score[1]===VB.ctx.game.score[0]+VB.ctx.game.score[1]})()", 90000), 'guardado en la pausa del punto (modo point)');
    const recPoint = await pg.evalJs("localStorage.getItem('make-the-cut.resume')");
    ok(await waitFor(pg, "VB.ctx.game.mode==='serve'&&(function(){var r=JSON.parse(localStorage.getItem('make-the-cut.resume')||'null');return !!r&&r.sc.score[0]+r.sc.score[1]===VB.ctx.game.score[0]+VB.ctx.game.score[1]})()", 30000), 'guardado otra vez al preparar el saque');
    const saved = await J(pg, "(function(){var r=JSON.parse(localStorage.getItem('make-the-cut.resume'));var u=VB.UI._netStats();return {sc:r.sc,v:r.v,kind:r.kind,h:r.h,len:JSON.stringify(r).length,ui:u.t[0].points+u.t[1].points,ver:VB.VERSION,mode:JSON.parse(localStorage.getItem('make-the-cut.resume')).snap?1:0}})()");
    ok(saved.kind === 'quick' && saved.v === saved.ver, 'sello con VB.VERSION (' + saved.v + '), ' + saved.len + ' bytes, ' + saved.sc.score.join('-'));
    // «cerrar el navegador»: recargar la página
    await pg.navigate('');
    ok(await waitFor(pg, READY, 30000), 'recarga: menú');
    await sleep(500);
    const por = await J(pg, "(function(){var b=document.getElementById('btnSeguir'),n=document.getElementById('btnNow'),c=document.getElementById('btnCont');return {vis:!!b&&!b.hidden&&b.offsetParent!==null,txt:b?b.textContent.replace(/\\s+/g,' ').trim():'',now:!!n&&!n.hidden,cont:!!c&&!c.hidden,tk:!!b&&b.classList.contains('sp-ticket')}})()");
    const sub = saved.sc.score[0] + '-' + saved.sc.score[1] + ' · 1r set';
    ok(por.vis && por.tk && por.txt.indexOf('Seguir el partido') >= 0 && por.txt.indexOf(sub) >= 0, 'portada: billete «' + por.txt + '»');
    ok(!por.now && !por.cont, 'sin «¡Jugar ya!» ni «Continuar carrera» a la vez');
    await pg.evalJs("document.getElementById('btnSeguir').click()");
    ok(await waitFor(pg, "VB.ctx.state==='playing'&&VB.ctx.game&&!VB.ctx.game.demo", 10000), 'un toque: el partido sigue');
    const back = await J(pg, "(function(){var g=VB.ctx.game,u=VB.UI._netStats();return {sc:[g.score[0],g.score[1]],set:g.setNo,armed:VB.Resume.armed()===g,ui:u.t[0].points+u.t[1].points}})()");
    ok(back.sc[0] === saved.sc.score[0] && back.sc[1] === saved.sc.score[1] && back.set === saved.sc.setNo, 'mismo marcador (' + back.sc.join('-') + ', set ' + back.set + ')');
    ok(back.armed, 'el partido retomado se sigue guardando');
    ok(back.ui === saved.ui && back.ui === back.sc[0] + back.sc[1], 'la hoja final lleva los puntos de antes (' + back.ui + ')');
    ok(await waitFor(pg, "VB.ctx.game.score[0]+VB.ctx.game.score[1]>=" + (back.sc[0] + back.sc[1] + 1), 90000), 'sigue jugándose (un punto más)');
    // salir al menú a mitad = abandonar
    await pg.evalJs("VB.ctx.actions.toMenu()"); await sleep(300);
    ok(await J(pg, "!localStorage.getItem('make-the-cut.resume')"), 'salir al menú a mitad lo borra');
    // restaurar la foto de la pausa del punto
    await pg.evalJs('localStorage.setItem("make-the-cut.resume",' + JSON.stringify(recPoint) + ')');
    await pg.navigate('');
    ok(await waitFor(pg, READY, 30000), 'recarga con la foto de la pausa del punto');
    await sleep(500);
    ok(await J(pg, "(function(){var b=document.getElementById('btnSeguir');return !!b&&!b.hidden})()"), 'billete a la vista');
    await pg.evalJs("document.getElementById('btnSeguir').click()");
    ok(await waitFor(pg, "VB.ctx.state==='playing'&&VB.ctx.game&&!VB.ctx.game.demo&&VB.Resume.armed()===VB.ctx.game", 10000), 'retomado en mitad de la pausa del punto');
    ok(await waitFor(pg, "VB.ctx.game.mode==='serve'", 20000), 'y llega al saque siguiente');
    await sleep(1500);
    await pg.evalJs("VB.ctx.actions.toMenu()"); await sleep(300);
    // otra versión: no sale y se borra
    await pg.evalJs('localStorage.setItem("make-the-cut.resume",' + JSON.stringify(recPoint.replace('"v":"' + saved.ver + '"', '"v":"0.0.1"')) + ')');
    await pg.navigate('');
    ok(await waitFor(pg, READY, 30000), 'recarga con un guardado de otra versión');
    await sleep(500);
    ok(await J(pg, "(function(){var b=document.getElementById('btnSeguir');return (!b||b.hidden)&&!localStorage.getItem('make-the-cut.resume')})()"), 'otra versión: sin billete y borrado');
    ok(pg.errors.length === 0, 'sin errores de consola' + (pg.errors.length ? ': ' + pg.errors.slice(0, 3).join(' | ') : ''));
  } finally { pg.close(); }
}

(async () => {
  setTimeout(() => { console.error('TIEMPO AGOTADO'); process.exit(2); }, 600e3).unref();
  try {
    if (!ONLY_BR) partA();
    if (!ONLY_NODE) await partB();
  } catch (e) { fail++; console.error('FALLO (excepción):', e && e.stack || e); }
  console.log(fail ? fail + ' FALLO(S)' : 'TODO OK');
  process.exit(fail ? 1 : 0);
})();
