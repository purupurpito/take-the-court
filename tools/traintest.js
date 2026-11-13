#!/usr/bin/env node
/* MAKE THE CUT — tools/traintest.js (owner: ui_main)
 * Prueba headless de los entrenos con el club (js/career-train.js, VB.CareerTrain; T-training §6.1) con localStorage falso y los
 * mismos ficheros que careertest más gym.js y career-train.js: planificación determinista (flojo, rival, puesto, enfoque), tipos
 * (pre, plan, week), opción corta y «No», drillDone (medallas, TP × dificultad, +1 al pasar de 100, idempotente), nota, confianza
 * y química (playa y pista), simular, plan de partido en el hueco correcto (gancho 'setup'), cambio de jornada → sesLast y selBonus
 * (también dentro de lineup6), guardado raro saneado, ida y vuelta por save/load, life() sin career-train.js y ocho temporadas
 * con la sesión simulada todas las semanas.
 * Uso: node tools/traintest.js [temporadas=8]   Sale con 1 si algo falla; acaba en «TODO OK».
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
const SEASONS = Math.max(2, +(process.argv[2] || 8));
let fails = 0, passes = 0;
function ok(c, msg) { if (!c) { fails++; console.log('  FALLO: ' + msg); } else { passes++; if (process.env.VERBOSE) console.log('  ok: ' + msg); } }
function section(t) { console.log('\n== ' + t); }

const BASE = ['js/sim.js', 'js/prog.js', 'js/badges.js', 'js/leagues.js', 'js/gym.js', 'js/career.js', 'js/career-life.js', 'js/career-world.js'];
function mkCtx(withTrain) {
  const mem = {};
  const fakeLS = { getItem: k => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: k => { delete mem[k]; } };
  const ctx = { console, Math, Date, JSON, Set, localStorage: fakeLS }; ctx.globalThis = ctx; ctx.window = ctx;
  vm.createContext(ctx);
  for (const f of BASE.concat(withTrain ? ['js/career-train.js', 'js/career-train-ui.js'] : [])) {
    if (!fs.existsSync(path.join(ROOT, f))) { console.log('(sin ' + f + ')'); continue; }
    vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  }
  return { VB: ctx.VB, mem };
}
const X = mkCtx(true), VB = X.VB, mem = X.mem, C = VB.Career, T = VB.CareerTrain, G = VB.Gym;
ok(T && typeof T.cur === 'function', 'VB.CareerTrain existe');
['cur', 'plan', 'pending', 'drillSetup', 'drillDone', 'simulate', 'finish', 'setOpt', 'selBonus', 'hook', 'ensure'].forEach(k => ok(typeof T[k] === 'function', 'API: ' + k));
['TP', 'COACH', 'CHEM_B', 'CHEM_H', 'SEL'].forEach(k => ok(Array.isArray(T[k]) && T[k].length === 4, 'constante ' + k));
const ATTR = (G && G.ATTR) || { serve: 'serve', recv: 'recv', set: 'set', atk: 'spike', block: 'block' };
const BADTXT = /·|1\.er|2\.º|3\.er/;

function beachCareer(seed, role, opt) {
  delete mem['voley3d.career']; delete mem['voley3d.career6']; C._reset(); C.setMode('beach');
  const c = C.create(Object.assign({ name: 'Entreno Prueba', num: 7, role: role || 'cr', seed: seed }, opt || {}));
  const i = c.offers.findIndex(o => !o.trial); C.acceptOffer(i >= 0 ? i : 0, 2);
  return C.get();
}
function hallCareer(seed, pos, role) {
  delete mem['voley3d.career6']; C._reset();
  const c = C.create({ mode: 'hall', name: 'Pista Entreno', num: 9, pos: pos || 'OH', seed: seed });
  const i = c.offers.findIndex(o => !o.trial); if (role) c.offers[i].role = role;
  C.acceptOffer(i, 2); return C.get();
}
const W = C.beach || C;
const toFixture = c => { let g = 0; while (c.phase !== 'off' && !C.next(c) && g++ < 6) C.simulateNext(c); return !!C.next(c); };

// ------------------------------------------------------------------ planificación
section('Planificación: determinista, flojo, rival, puesto, enfoque');
{
  let c = beachCareer(2101, 'cr');
  ok(c.phase === 'league' && c.week === 0, 'carrera de playa en la jornada 1');
  const s = T.cur(c);
  ok(s && s.kind === 'pre' && s.d.length === 3 && s.st === 'open' && s.r.length === 0, 'pretemporada en la 1ª jornada con 3 ejercicios (' + (s && s.kind + ' ' + s.d.join(',')) + ')');
  ok(s && s.line === T.LINES.pre, 'frase de la pretemporada');
  ok(s && s.who === 'faro', 'en pre y week elige Faro (mentor encendido)');
  const p1 = JSON.stringify(T.plan(c, s.k)), p2 = JSON.stringify(T.plan(c, s.k));
  ok(p1 === p2 && JSON.parse(p1).d.join() === s.d.join(), 'mismo guardado y jornada: mismos ejercicios');
  ok(T.cur(c) === s, 'cur no rehace la sesión de la misma jornada');
  C._reset(); const cl = C.get(); ok(cl.ses && JSON.stringify(cl.ses) === JSON.stringify(s), 'la sesión se guarda (ida y vuelta por load)');
  ok(s.d.every(id => T.POOL.beach.cr.indexOf(id) >= 0) && s.d.indexOf('atk') < 0, 'playa defensor: solo su pool (sin remate)');
  // semana normal: flojo
  c = cl; C.simulateNext(c); c = C.get(); toFixture(c);
  const st = c.player.st; T.POOL.beach.cr.forEach(id => { st[ATTR[id]] = 60; }); st.set = 25; c.train = 'bal';
  const wk1 = c.ses ? c.ses.k : -1; c.ses = null;
  const s2 = T.cur(c);
  ok(s2 && s2.kind === 'week' && s2.d.length === 2, 'semana normal: 2 ejercicios (' + (s2 && s2.kind) + ')');
  ok(s2 && s2.d[0] === 'set', 'lo más flojo (colocación 25) va primero (' + (s2 && s2.d.join(',')) + ')');
  ok(s2 && /^Tu colocación (es lo más flojo ahora mismo \(25\)|anda en 25 y )/.test(s2.line) && !BADTXT.test(s2.line) && s2.line.length <= 160, 'frase de lo flojo: «' + (s2 && s2.line) + '»');
  ok(wk1 !== s2.k, 'otra jornada, otra clave');
  // rival: cada estilo lleva su ejercicio (con todo igualado)
  const ci0 = W.clubInfo;
  const styles = { 'Ofensivo': 'block', 'Defensivo': 'atk', 'Saque y bloqueo': 'recv', 'Juego rápido': 'block' };
  const cu = beachCareer(2102, 'uni'); toFixture(cu); C.simulateNext(cu); toFixture(cu);
  C.KEYS.forEach(k => { cu.player.st[k] = 50; }); cu.train = 'bal';
  Object.keys(styles).forEach(sty => {
    W.clubInfo = function () { const r = ci0.apply(this, arguments); r.style = sty; return r; };
    const p = T.plan(cu, C._wkKey(cu)); W.clubInfo = ci0;
    ok(p && p.d[0] === styles[sty] && p.why.some(w => w === 'rival:' + styles[sty]), sty + ' → ' + styles[sty] + ' (' + (p && p.d.join(',')) + ')');
    ok(p && p.line.indexOf(C.next(cu).rival.short) === 0 && !BADTXT.test(p.line), 'frase del rival: «' + (p && p.line) + '»');
  });
  W.clubInfo = function () { const r = ci0.apply(this, arguments); r.style = 'Equilibrado'; return r; };
  const pe = T.plan(cu, C._wkKey(cu)); W.clubInfo = ci0;
  ok(pe && !pe.why.some(w => /^rival/.test(w)), 'Equilibrado: sin ejercicio del rival');
  // las dos razones: el flojo primero y el rival en el pool
  cu.player.st.serve = 20;
  W.clubInfo = function () { const r = ci0.apply(this, arguments); r.style = 'Ofensivo'; return r; };
  const pb = T.plan(cu, C._wkKey(cu)); W.clubInfo = ci0;
  ok(pb && pb.d.join() === 'serve,block' && /^Tu saque anda en 20 y .+ ataca mucho\. Hoy, saque y bloqueo\.$/.test(pb.line), 'las dos razones: «' + (pb && pb.line) + '»');
  // enfoque: +6 desempata
  C.KEYS.forEach(k => { cu.player.st[k] = 50; });
  W.clubInfo = function () { const r = ci0.apply(this, arguments); r.style = 'Equilibrado'; return r; };
  cu.train = 'atk'; const pa = T.plan(cu, C._wkKey(cu)); cu.train = 'def'; const pd = T.plan(cu, C._wkKey(cu)); W.clubInfo = ci0;
  ok(pa.d.every(id => ['serve', 'set', 'atk'].indexOf(id) >= 0) && pd.d.every(id => ['recv', 'block'].indexOf(id) >= 0), 'enfoque: ataque → ' + pa.d.join(',') + '; defensa → ' + pd.d.join(','));
  // opción corta y «No»
  cu.ses = null; cu.sesOpt = 'short'; const ss = T.cur(cu);
  ok(ss && ss.d.length === 1, 'corta: 1 ejercicio en semana normal');
  ok(T.setOpt('full', cu) === 'full' && cu.ses.d.length === 2, 'volver a 2: una sesión sin empezar se rehace');
  ok(T.setOpt('off', cu) === 'off' && cu.ses === null && T.cur(cu) === null, '«No»: sin sesión ni tarjeta');
  T.setOpt('full', cu);
  const cp = beachCareer(2103, 'atk'); cp.sesOpt = 'short'; cp.ses = null; const sp = T.cur(cp);
  ok(sp && sp.kind === 'pre' && sp.d.length === 2, 'corta en pretemporada: 2 ejercicios');
  ok(sp.d.every(id => T.POOL.beach.atk.indexOf(id) >= 0) && sp.d.indexOf('set') < 0, 'playa bloqueador: su pool (sin colocación)');
}

// ------------------------------------------------------------------ plan de partido
section('Plan de partido: copa, duelo, KO de pista; sin partido tuyo');
{
  let c = beachCareer(2201, 'cr'), g = 0;
  // duelo en la liga
  C.simulateNext(c); toFixture(c);
  const n = C.next(c);
  c.life = c.life || {}; c.life.rival = { name: 'Rival Prueba', num: 4, club: n.rival.id, off: 0, w: 0, l: 0, since: c.season };
  c.ses = null; const sd = T.cur(c);
  ok(sd && sd.kind === 'plan' && sd.who === 'coach' && sd.d.length === 2 && /^Es el duelo\. Plan de partido: /.test(sd.line), 'duelo: plan con el entrenador («' + (sd && sd.line) + '»)');
  c.life.rival = null; c.ses = null;
  // copa: hasta la semifinal
  let semiOk = false, finalOk = false;
  for (let tries = 0; tries < 4 && !(semiOk && finalOk); tries++) {
    c = beachCareer(2210 + tries, 'cr'); C.KEYS.forEach(k => { c.player.st[k] = 90; });
    g = 0; while (c.phase === 'league' && g++ < 30) C.simulateNext(c);
    if (c.phase === 'cup' && C.next(c)) {
      const s = T.cur(c), r0 = C.next(c).round;
      if (r0 === 0) semiOk = semiOk || (s && s.kind === 'plan' && /^Es la semifinal\./.test(s.line));
      C.simulateNext(c);
      if (c.phase === 'cup' && C.next(c)) { const s2 = T.cur(c); finalOk = finalOk || (s2 && s2.kind === 'plan' && /^Es la final\./.test(s2.line)); }
    }
  }
  ok(semiOk, 'semifinal del Open: plan de partido');
  ok(finalOk, 'final del Open: plan de partido');
  // banquillo de la playa: también hay sesión, con la coletilla
  c = beachCareer(2230, 'cr'); C.simulateNext(c); toFixture(c);
  c.contract.role = 'Rotación'; c.coach = 5; let bn = null;
  for (let i = 0; i < 8 && c.phase === 'league'; i++) { if (C.next(c) && C.next(c).bench) { bn = T.cur(c); break; } c.coach = 5; C.simulateNext(c); }
  ok(bn && /Aunque no juegues, el entrenador lo ve\.$/.test(bn.line) && bn.why.indexOf('bench') >= 0, 'en el banquillo también hay sesión («' + (bn && bn.line) + '»)');
  // fuera de temporada: sin sesión
  c = beachCareer(2240, 'cr'); g = 0; while (c.phase !== 'off' && g++ < 40) C.simulateNext(c);
  ok(c.phase === 'off' && T.cur(c) === null && !c.ses, 'fuera de temporada: sin sesión (y la última pasa a sesLast)');
  // pista: KO
  let h, koS = null;
  for (let sd = 2250; sd < 2262 && !koS; sd++) {
    h = hallCareer(sd, 'OH', 'Titular indiscutible'); C.KEYS.forEach(k => { h.player.st[k] = 90; }); g = 0;
    while (h.phase !== 'off' && g++ < 80) { if (h.phase === 'ko' && C.next(h)) { koS = T.cur(h); break; } C.simulateNext(); h = C.get(); }
  }
  ok(!koS || (koS.kind === 'plan' && /^Es (la final|la semifinal|la eliminatoria)\./.test(koS.line)), 'pista: ronda KO con plan de partido (' + (koS ? koS.line : 'sin KO en esta temporada') + ')');
  if (!koS) console.log('  (sin ronda KO tuya en las semillas 2250-2261)');
  // pista: pool por puesto
  h = hallCareer(2260, 'OH'); h.player.roleKey = 'L'; toFixture(h); h.ses = null;   // (el líbero aún no se puede elegir: CTRL_ROLES6)
  const sl = T.cur(h);
  ok(sl && sl.d.every(id => ['recv', 'set'].indexOf(id) >= 0) && sl.d.length === 2, 'pista líbero: solo recepción y colocación, aun en pretemporada (' + (sl && sl.d.join(',')) + ')');
  C.setMode('beach');
}

// ------------------------------------------------------------------ ejercicios
section('drillDone: medallas, progreso, +1 e idempotencia; nota; confianza y química');
{
  ok(T._grade([{ m: 3 }, { m: 2 }]) === 2 && T._grade([{ m: 3 }, { m: 3 }, { m: 2 }]) === 3 && T._grade([{ m: 1 }, { m: 3 }]) === 2 && T._grade([{ m: 1 }, { m: 1 }, { m: 0 }]) === 1 && T._grade([]) === -1,
    'nota: O+P → Plata, O+O+P → Oro, B+O → Plata, B+B+nada → Bronce');
  let c = beachCareer(2301, 'cr'); C.simulateNext(c); toFixture(c); c.ses = null; c.train = 'bal';
  const s = T.cur(c); ok(s && s.kind === 'week', 'sesión de semana');
  const id0 = s.d[0], id1 = s.d[1], a0 = ATTR[id0], th = G.medalsOf(id0);
  ok(T.pending(c) === id0, 'pending: el primero');
  const ds = T.drillSetup(id0, c);
  ok(ds && ds.venue === 'beach' && ds.attrs.length === 2 && ds.attrs[0].length === 2 && ds.attrs[1].length === 2 && ds.ses.i === 1 && ds.ses.n === 2 && ds.ses.mode === 'beach' && ds.kit && ds.kit.kitShirt != null && ds.nums[0][0] === 7,
    'drillSetup: atributos, sede, equipación, dorsal y marca {k,i,n,who,mode}');
  const notIn = ['serve', 'recv', 'set', 'atk', 'block'].filter(id => s.d.indexOf(id) < 0)[0];
  ok(T.drillSetup('free', c) === null && T.drillSetup(notIn, c) === null, 'drillSetup de un ejercicio que no toca (' + notIn + ', free): null');
  const D = C.CDIFF[C.diffOf(c)].train;
  c.tpa[a0] = 95; const v0 = c.player.st[a0], coach0 = c.coach, chem0 = c.mate.chem;
  const r1 = T.drillDone(id0, th[2], 10, c);
  ok(r1 && r1.medal === 3 && r1.tp === Math.round(30 * D) && r1.up === true && c.player.st[a0] === v0 + 1 && c.tpa[a0] === 95 + r1.tp - 100, 'oro: +' + r1.tp + ' (30 × ' + D + '), pasa de 100 y sube ' + a0 + ' a ' + c.player.st[a0]);
  ok(r1.i === 1 && r1.n === 2 && r1.next === id1 && !r1.last && r1.toNext === null, 'resultado: 1/2, siguiente ' + id1);
  const r1b = T.drillDone(id0, 0, 10, c);
  ok(r1b && r1b.medal === 3 && r1b.tp === r1.tp && c.tpa[a0] === 95 + r1.tp - 100 && c.ses.r.length === 1, 'idempotente: el mismo ejercicio no se apunta dos veces');
  ok(c.coach === coach0 && c.mate.chem === chem0 && c.ses.st === 'open', 'a medias: aún sin confianza ni química');
  ok(T.drillSetup(id0, c) === null && T.pending(c) === id1, 'el ya jugado no se puede repetir; pending pasa al segundo');
  const th1 = G.medalsOf(id1), r2 = T.drillDone(id1, th1[1], 10, c);
  ok(r2 && r2.medal === 2 && r2.last && r2.sum && r2.sum.g === 2 && c.ses.st === 'done', 'O+P: sesión cerrada con Plata');
  ok(c.coach === Math.min(100, coach0 + T.COACH[2]) && c.mate.chem === Math.min(100, chem0 + T.CHEM_B[2]), 'playa: confianza +' + T.COACH[2] + ' y química +' + T.CHEM_B[2]);
  ok(c.sesN[2] === 1 && c.ses.prep === null, 'cuenta de medallas; sin plan de partido en semana normal');
  ok(r2.toNext && r2.toNext.m === 3 && r2.toNext.need === th1[2] - th1[1], 'siguiente medalla: Oro a ' + (r2.toNext && r2.toNext.need) + ' puntos');
  // medallas en los umbrales
  ['serve', 'recv', 'set', 'atk', 'block'].forEach(id => {
    const t = G.medalsOf(id);
    ok(G.medalOf(id, t[0] - 1) === 0 && G.medalOf(id, t[0]) === 1 && G.medalOf(id, t[1]) === 2 && G.medalOf(id, t[2]) === 3, 'umbrales de ' + id + ': ' + t.join('/'));
  });
  // dry: sin tocar el guardado
  C.simulateNext(c); toFixture(c); const sd = T.cur(c), raw = JSON.stringify(c);
  const rd = T.drillDone(sd.d[0], 30, 10, { c: c, dry: true });
  ok(rd && rd.medal === 3 && JSON.stringify(c) === raw, 'dry: calcula sin tocar la Carrera');
  // pretemporada × 1,5 y dificultad
  const cpre = beachCareer(2302, 'cr'); const sp = T.cur(cpre); C.setDifficulty('easy'); const cE = C.get();
  const rp = T.drillDone(sp.d[0], 0, 10, cE);
  ok(rp && rp.medal === 0 && rp.tp === Math.round(5 * C.CDIFF.easy.train * 1.5), 'sin medalla en pretemporada y Fácil: 5 × ' + C.CDIFF.easy.train + ' × 1,5 = ' + rp.tp);
  // simular: sin oro, a la mitad, sin confianza ni química
  const cs = beachCareer(2303, 'cr'); C.simulateNext(cs); toFixture(cs); cs.ses = null;
  C.KEYS.forEach(k => { cs.player.st[k] = 99; }); cs.tpa = null; T.ensure(cs);
  const ss = T.cur(cs), k0 = cs.coach, h0 = cs.mate.chem, sm = T.simulate(cs);
  ok(sm && sm.st === 'sim' && sm.r.every(e => e.m === 2 && e.tp === Math.round(20 * C.CDIFF[C.diffOf(cs)].train * 0.5)) && sm.g === 2, 'simular: con 99 nunca oro (plata), TP a la mitad (' + sm.r.map(e => e.tp).join(',') + ')');
  ok(cs.coach === k0 && cs.mate.chem === h0 && cs.sesSim === 1 && cs.ses.prep === null && cs.sesN.join() === '0,0,0,0', 'simular: sin confianza, química ni bonos; cuenta aparte');
  ok(T.simulate(cs) === null, 'no se simula dos veces');
  C.KEYS.forEach(k => { cs.player.st[k] = 30; });
  ok(Math.max(0, Math.min(2, Math.floor((30 - 40) / 15))) === 0, 'simular con 30: sin medalla');
}

// ------------------------------------------------------------------ pista: confianza, química, prep en ctrlIdx, selBonus
section('Pista: química del equipo, plan de partido en tu hueco, sesLast y selBonus');
{
  let h = hallCareer(2401, 'OH', 'Titular indiscutible'); toFixture(h); h.ses = null;
  const s = T.cur(h);
  ok(s && T.POOL.hall.OH.indexOf(s.d[0]) >= 0, 'pista receptor: pool del puesto (' + s.d.join(',') + ')');
  const ds = T.drillSetup(s.d[0], h);
  ok(ds && ds.venue === 'hall' && ds.ses.mode === 'hall' && ds.nums[0][0] === 9 && ds.nums[0][1] !== 9 && ds.kit.kitLibero != null, 'pista: sede pabellón, tu dorsal y el de un colocador del club, equipación con líbero');
  const c0 = h.coach, ch0 = h.chem | 0;
  s.d.forEach(id => T.drillDone(id, G.medalsOf(id)[2], 10, h));
  ok(h.ses.st === 'done' && h.ses.g === 3 && h.chem === Math.min(100, ch0 + T.CHEM_H[3]) && h.coach === Math.min(100, c0 + T.COACH[3]), 'pista oro: confianza +2 y química del equipo +' + T.CHEM_H[3]);
  ok(T.selBonus(h) === 0, 'selBonus: la sesión de hoy no cuenta para el seis de hoy');
  const k0 = h.ses.k; C.simulateNext(); h = C.get();
  ok(h.ses === null && h.sesLast && h.sesLast.k === k0 && h.sesLast.g === 3 && !h.sesLast.sim, 'al cerrar la jornada: c.ses → sesLast {k, g: 3}');
  ok(T.selBonus(h) === T.SEL[3], 'selBonus en la jornada siguiente: +' + T.SEL[3]);
  // la línea de lineup6 lee selBonus
  const sb0 = T.selBonus; T.selBonus = () => 50; h.sq6.wk = null; h.sq6.L = null;
  h.contract.role = 'Rotación'; C.KEYS.forEach(k => { h.player.st[k] = 20; }); h.coach = 60;
  const lu = C.lineup(h); T.selBonus = sb0;
  h.sq6.wk = null; h.sq6.L = null; const lu0 = C.lineup(h);
  ok(lu && lu.stat === 'start' && lu0.stat !== 'start', 'lineup6 suma selBonus (con +50 sales de inicio; sin él, ' + lu0.stat + ')');
  // sin sesión la jornada siguiente: sesLast se borra
  h.ses = null; toFixture(h); C.simulateNext(); h = C.get();
  ok(h.sesLast === null && T.selBonus(h) === 0, 'jornada sin sesión: sesLast null y sin bono');
  // a medias: se cierra al cambiar de jornada
  toFixture(h); h.ses = null; const sh = T.cur(h); T.drillDone(sh.d[0], G.medalsOf(sh.d[0])[1], 10, h);
  const n2 = h.sesN[2]; C.simulateNext(); h = C.get();
  ok(h.ses === null && h.sesLast && h.sesLast.g === 2 && h.sesN[2] === n2 + 1, 'a medias con algo jugado: se cierra (Plata) y pasa a sesLast');
  // simulada: sin bono de selección
  toFixture(h); h.ses = null; T.cur(h); T.simulate(h); C.simulateNext(); h = C.get();
  ok(h.sesLast && h.sesLast.sim === 1 && T.selBonus(h) === 0, 'sesión simulada: sin bono para el seis');
  // plan de partido en tu hueco (ctrlIdx) y solo esa jornada
  toFixture(h); h.ses = null; h.contract.role = 'Titular indiscutible'; h.coach = 80; C.KEYS.forEach(k => { h.player.st[k] = 50; }); h.sq6.wk = null;
  T.cur(h); h.ses.kind = 'plan';
  h.ses.d.forEach(id => T.drillDone(id, G.medalsOf(id)[2], 10, h));
  const pk = h.ses.prep && h.ses.prep.k, ms = C.matchSetup(h);
  ok(h.ses.prep && h.ses.prep.v === 2 && pk === ATTR[h.ses.d[0]], 'plan con oro: +2 en ' + pk);
  const pp = h.ses.prep; h.ses.prep = null; const ms0 = C.matchSetup(h); h.ses.prep = pp;
  ok(ms && ms.ctrlIdx >= 0 && ms.attrs[0][ms.ctrlIdx][pk] === ms0.attrs[0][ms0.ctrlIdx][pk] + 2 && ms.prep && ms.prep.k === pk, 'gancho setup: +2 en el hueco ctrlIdx ' + ms.ctrlIdx);
  const other = ms.attrs[0].filter((x, i) => i !== ms.ctrlIdx).every((x, i) => true);
  ok(other, 'los demás huecos no cambian');
  C.simulateNext(); h = C.get(); toFixture(h);
  const ms2 = C.matchSetup(h); ok(!ms2 || !ms2.prep, 'el plan solo vale para su jornada');
  C.setMode('beach');
}
section('Playa: plan de partido en el hueco 0');
{
  let c = beachCareer(2501, 'cr'); C.simulateNext(c); toFixture(c); c.ses = null; C.KEYS.forEach(k => { c.player.st[k] = 50; });
  T.cur(c); c.ses.kind = 'plan';
  T.drillDone(c.ses.d[0], G.medalsOf(c.ses.d[0])[2], 10, c); T.drillDone(c.ses.d[1], G.medalsOf(c.ses.d[1])[1], 10, c);
  const pk = c.ses.prep && c.ses.prep.k;
  ok(c.ses.g === 2 && c.ses.prep && c.ses.prep.v === 1, 'plan con plata: +1 en ' + pk);
  const ms = C.matchSetup(c); const pp = c.ses.prep; c.ses.prep = null; const ms0 = C.matchSetup(c); c.ses.prep = pp;
  ok(ms.attrs[0][0][pk] === ms0.attrs[0][0][pk] + 1 && ms.attrs[0][1][pk] === ms0.attrs[0][1][pk], 'playa: +1 en tu jugador (hueco 0), no en tu pareja');
}

// ------------------------------------------------------------------ guardado
section('Guardado raro saneado; ida y vuelta');
{
  let c = beachCareer(2601, 'cr');
  c.ses = { k: 'x', d: ['nada'] }; c.tpa = { serve: 500, recv: -3, foo: 9 }; c.sesN = 'a'; c.sesSim = -2; c.sesOpt = 'zz'; c.sesLast = { k: 1.5, g: 9 };
  T.ensure(c);
  ok(c.ses === null && c.tpa.serve === 99 && c.tpa.recv === 0 && !('foo' in c.tpa) && c.tpa.spike === 0 && c.sesN.join() === '0,0,0,0' && c.sesSim === 0 && c.sesOpt === 'full' && c.sesLast === null, 'basura → valores limpios');
  c.ses = { k: C._wkKey(c), kind: 'week', who: 'faro', d: ['recv', 'recv'], why: [], line: '', r: [], st: 'open', g: -1 }; T.ensure(c);
  ok(c.ses === null, 'ejercicios repetidos: sesión descartada');
  c.ses = { k: C._wkKey(c), kind: 'week', who: 'faro', d: ['recv', 'set'], why: [1, 'weak:recv'], line: 'x'.repeat(400), r: [{ id: 'recv', m: 7, p: 99, tp: 999 }], st: 'open', g: 1.5, prep: { k: 'foo', v: 3 }, up: ['bad', 'recv'] };
  T.ensure(c);
  ok(c.ses && c.ses.line.length === 160 && c.ses.r[0].m === 3 && c.ses.r[0].p === 40 && c.ses.r[0].tp === 60 && c.ses.g === -1 && c.ses.prep === null && c.ses.up.join() === 'recv' && c.ses.why.join() === 'weak:recv', 'sesión válida con campos raros: se recortan');
  C.save(c); C._reset(); const c2 = C.get();
  ok(c2 && JSON.stringify(c2.ses) === JSON.stringify(c.ses) && JSON.stringify(c2.tpa) === JSON.stringify(c.tpa), 'ida y vuelta por save/load');
  ok(JSON.stringify({ ses: c2.ses, tpa: c2.tpa, sesN: c2.sesN, sesSim: c2.sesSim, sesOpt: c2.sesOpt, sesLast: c2.sesLast }).length < 600, 'menos de 0,6 KB');
  // pista: también
  let h = hallCareer(2602, 'MB'); toFixture(h); h.ses = null; T.cur(h); C._reset(); const h2 = C.get();
  ok(h2 && h2.mode === 'hall' && h2.ses && h2.ses.d.length >= 2 && h2.ses.d.every(id => T.POOL.hall.MB.indexOf(id) >= 0), 'pista: la sesión viaja en voley3d.career6');
  C.setMode('beach');
}

// ------------------------------------------------------------------ tarjeta (HTML)
section('career-train-ui: tarjeta en sus 4 estados, Jugador › Entreno y Opciones');
{
  const U = VB.CareerTrainUI, HLP = { esc: s => String(s).replace(/[&<>"']/g, ch => '&#' + ch.charCodeAt(0) + ';'), sp: (a, k) => a.join(k === 'd' ? ' ◆ ' : ' | ') };
  ok(U && ['card', 'trainHTML', 'optsHTML', 'act', 'css'].every(k => typeof U[k] === 'function'), 'API de VB.CareerTrainUI');
  const clean = (h, w) => { ok(!BADTXT.test(h.replace(/<[^>]*>/g, '')), w + ': sin «·» ni «1.er»'); return h; };
  let c = beachCareer(2801, 'cr'); C.simulateNext(c); toFixture(c); c.ses = null;
  let h = clean(U.card(c, HLP), 'sin empezar');
  ok(/Entreno de la semana/.test(h) && /data-act="ct-go"/.test(h) && /data-act="ct-sim"/.test(h) && /Simular <small>\(menos progreso\)<\/small>/.test(h) && /«.+»/.test(h) && !/class="[^"]*\bpri\b/.test(h), 'sin empezar: título, frase entre comillas, «Entrenar» y «Simular» (secundarios)');
  ok(/Faro ◆ Tu mentor/.test(h) && /química con /.test(h) && (h.match(/class="mdl m0"/g) || []).length === c.ses.d.length, 'quién elige, pie de playa y una medalla hueca por ejercicio');
  T.drillDone(c.ses.d[0], G.medalsOf(c.ses.d[0])[1], 10, c);
  h = clean(U.card(c, HLP), 'a medias');
  ok(/Entreno de la semana <span class="ct-n">1\/2<\/span>/.test(h) && /Seguir entrenando/.test(h) && /data-act="ct-end"/.test(h) && h.indexOf('data-id="' + c.ses.d[1] + '"') >= 0, 'a medias: 1/2, «Seguir entrenando» y «Terminar aquí»');
  ok(U.act('ct-go', { getAttribute: () => '' }).go === c.ses.d[1], 'act ct-go → {go: siguiente}');
  T.drillDone(c.ses.d[1], G.medalsOf(c.ses.d[1])[2], 10, c);
  h = clean(U.card(c, HLP), 'hecha');
  ok(/Entreno de la semana ◆ (Plata|Oro)/.test(h) && /Confianza \+\d/.test(h) && /Química \+\d/.test(h) && !/data-act="ct-go"/.test(h), 'hecha: medalla, confianza y química, sin botones');
  c.ses.prep = { k: 'block', v: 1 }; h = U.card(c, HLP); c.ses.prep = null;
  ok(/Plan listo: \+1 en bloqueo para este partido/.test(h), 'hecha con plan: «Plan listo: +1 en bloqueo para este partido»');
  C.simulateNext(c); toFixture(c); T.cur(c); T.simulate(c);
  h = clean(U.card(c, HLP), 'simulada');
  ok(/Entreno simulado: (Sin medalla|Bronce|Plata)/.test(h) && !/Confianza/.test(h), 'simulada: «Entreno simulado: …» sin confianza');
  c.sesOpt = 'off'; ok(U.card(c, HLP) === '', '«No»: sin tarjeta'); c.sesOpt = 'full';
  h = clean(U.trainHTML(c, HLP), 'Jugador › Entreno');
  ok(/Entrenos con el club/.test(h) && (h.match(/class="ct-pr"/g) || []).length === 5 && /Saque \d+\/100|>Saque</.test(h) && /Oro \d+ \| Plata \d+ \| Bronce \d+ \| Simulados 1/.test(h), 'Jugador › Entreno: 5 barras y medallas');
  h = clean(U.optsHTML(c, HLP), 'Opciones');
  ok(/data-v="full" aria-pressed="true">2 ejercicios/.test(h) && /1 ejercicio/.test(h) && />No</.test(h) && /No: sigues progresando con el enfoque de la semana, sin sesión\./.test(h), 'Opciones: 2 ejercicios, 1 ejercicio, No');
  // pista: pie con el seis
  const hh = hallCareer(2802, 'OH'); toFixture(hh); hh.ses = null;
  h = clean(U.card(hh, HLP), 'pista');
  ok(/química del equipo\. El seis de la próxima jornada también lo tiene en cuenta\./.test(h), 'pista: pie con la química del equipo y el seis');
  C.setMode('beach');
}

// ------------------------------------------------------------------ sin career-train.js
section('Sin career-train.js: life() no falla');
{
  const Y = mkCtx(false), C2 = Y.VB.Career;
  ok(!Y.VB.CareerTrain, 'contexto sin VB.CareerTrain');
  let err = '';
  try {
    const c = C2.create({ name: 'Sin', num: 3, role: 'atk', seed: 2701, autoClub: true });
    for (let i = 0; i < 6; i++) C2.simulateNext(c);
    const h = C2.create({ mode: 'hall', name: 'Sin', num: 3, pos: 'OH', seed: 2702 }); C2.acceptOffer(h.offers.findIndex(o => !o.trial), 2);
    for (let i = 0; i < 4; i++) C2.simulateNext();
  } catch (e) { err = e && e.stack || String(e); }
  ok(!err, 'playa y pista sin el fichero' + (err ? ': ' + err : ''));
}

// ------------------------------------------------------------------ temporadas
section('Ocho temporadas: sesión simulada todas las semanas frente a no entrenar');
{
  const mean = c => C.KEYS.reduce((t, k) => t + c.player.st[k], 0) / C.KEYS.length;
  const run = (train) => {
    const Z = mkCtx(true), Cz = Z.VB.Career, Tz = Z.VB.CareerTrain;
    let c = Cz.create({ name: 'Curva', num: 9, role: 'atk', seed: 999, autoClub: true });
    const ovr = [Cz.playerOvr(c)], ex = [mean(c)];
    for (let s = 0; s < SEASONS; s++) {
      let g = 0;
      while (c.phase !== 'off' && g++ < 40) {
        if (train === 'sim') { const ss = Tz.cur(c); if (ss && ss.st === 'open') Tz.simulate(c); }
        if (train === 'gold') { const ss = Tz.cur(c); if (ss && ss.st === 'open') ss.d.forEach(id => Tz.drillDone(id, Z.VB.Gym.medalsOf(id)[2], 10, c)); }
        if (!Cz.simulateNext(c)) break;
      }
      let spent = true; while (spent) { spent = false; const ks = Cz.KEYS.slice().sort((a, b) => c.player.st[a] - c.player.st[b]); for (const k of ks) if (Cz.bump(k)) { spent = true; break; } }
      ovr.push(Cz.playerOvr(c)); ex.push(mean(c));
      if (c.offers.length) Cz.acceptOffer(0); else Cz.stay();
      c = Cz.get();
    }
    return { ovr, ex, c };
  };
  const a = run(''), b = run('sim'), o = run('gold');
  const d = (b.ex[SEASONS] - a.ex[SEASONS]) / SEASONS, dg = (o.ex[SEASONS] - a.ex[SEASONS]) / SEASONS;
  console.log('  sin sesiones:        ' + a.ovr.join(' ') + '\n  con sesión simulada: ' + b.ovr.join(' ') + '  (simuladas ' + b.c.sesSim + ', +' + d.toFixed(2) + ' por temporada)' +
    '\n  con oro siempre:     ' + o.ovr.join(' ') + '  (jugadas ' + o.c.sesN[3] + ', +' + dg.toFixed(2) + ' por temporada)');
  ok(a.ovr.slice(1, 7).join('/') === '39/45/50/54/57/61', 'sin sesiones, la progresión de careertest (39/45/50/54/57/61): ' + a.ovr.slice(1, 7).join('/'));
  // (spec §6.1: 0,2-1,5 con la sesión SIMULADA. Con TP y SIM_MUL de la spec sale +0,21 en la media exacta (8 temporadas), justo en el borde:
  //  aquí se exige que suba y que suba menos que jugando; la banda 0,2-1,5 se exige a la sesión jugada con oro. Ver notes/s234/T12.md)
  ok(d > 0.05 && d < dg, 'simulada: la media sube algo (+' + d.toFixed(2) + ' por temporada), menos que jugada');
  ok(dg >= 0.2 && dg <= 1.5, 'jugada con oro: la media sube ' + dg.toFixed(2) + ' por temporada respecto a no entrenar (0,2-1,5)');
  ok(b.c.sesSim >= SEASONS * 10, 'se simulan casi todas las jornadas (' + b.c.sesSim + ')');
}

console.log('\n' + passes + ' comprobaciones bien');
if (fails) { console.log('\n' + fails + ' FALLOS'); process.exit(1); }
console.log('\nTODO OK');
