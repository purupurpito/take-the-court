#!/usr/bin/env node
/* TAKE THE COURT — tools/devtest.js (owner: puesto)
 * Prueba headless de js/career-dev.js (cambio de puesto y plan de desarrollo, VB.CareerDev) con las ayudas de tools/storyhelp.js.
 *  1. Contrato: sin elegir nada, la carrera es la misma con y sin el fichero (quitando c.dev, sus mensajes y msgN).
 *  2. Determinismo. 3. Ni Math.random ni g.rng; ninguna tirada al crear. 4. Guardados viejos y c.dev dañado.
 *  5. Frecuencia de las propuestas. 6. Aceptar. 7. Rechazar y caducar. 8. Pedirlo tú. 9. Plan de desarrollo (y su medida).
 *  10. Textos. 11. Pintores e interfaz. 12. Sin el registro de extensiones (career.js viejo).
 * Uso: node tools/devtest.js [-v]   Sale con 1 si algo falla; acaba en «TODO OK».
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const H = require('./storyhelp');
const DEVJS = 'js/career-dev.js';
const verbose = process.argv.includes('-v');
let fails = 0, passes = 0;
function ok(c, m) { if (!c) { fails++; console.log('  FALLO: ' + m); } else { passes++; if (verbose) console.log('  ok: ' + m); } }
function section(t) { console.log('\n== ' + t); }
function boot(dev) { return H.boot({ extra: dev === false ? [] : [DEVJS] }); }
const HLP = { esc: s => String(s == null ? '' : s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch])), sp: (a, k) => a.filter(x => x !== '' && x != null).join(' <i class="sep-' + k + '"></i> '), ph: () => false, q: (t, x) => '<button class="sp-q" data-q-title="' + t + '">?</button>' };
const HLPph = Object.assign({}, HLP, { ph: () => true });
const allText = [], titles = new Set();   // textos de mensajes y de la interfaz, y títulos de los mensajes (§10)
function grabMsgs(c) { (c.inbox || []).filter(m => m.dv).forEach(m => { allText.push(m.t, m.x); titles.add(m.t); }); }
/** Una carrera con club en la jornada w de la temporada 1 (simulando). */
function fresh(B, mode, seed, weeks) {
  const K = B.C;
  const c = mode === 'hall' ? K.create({ mode: 'hall', name: 'Dev Pista', num: 8, pos: 'OH', seed, now: 1 }) : K.create({ mode: 'beach', name: 'Dev Playa', num: 7, role: 'atk', seed, now: 1 });
  K.acceptOffer(c.offers.findIndex(x => !x.trial), 2);
  for (let i = 0; i < (weeks == null ? 3 : weeks); i++) { const n = K.next(K.get()); if (n && n.bench) K.benchNext(); else K.simulateNext(); }
  return K.get();
}
function spend(B, keys) { let i = 0, g = 0; while (g++ < 400 && B.C.bump(keys[i++ % keys.length])); }
const tick = (D, c, n, sum) => { for (let i = 0; i < (n || 1); i++) D.hook(c, 'match', sum || {}, null); };

// ------------------------------------------------------------------ 1. contrato
section('1. Contrato: sin elegir nada, la misma carrera con y sin career-dev.js');
{
  const norm = c => { const o = JSON.parse(JSON.stringify(c)); delete o.dev; if (o.last) delete o.last.dev; return H.strip(o); };
  const inb = c => (c.inbox || []).filter(m => !m.dv).map(m => [m.k, m.t, m.x, m.s, m.w].join('|'));
  for (const mode of ['beach', 'hall']) for (const seed of [11, 22, 33]) {
    const A = boot(false), Bd = boot(true);
    const ca = H.autopilot(A, { mode, seasons: 4, seed }), cb = H.autopilot(Bd, { mode, seasons: 4, seed });
    grabMsgs(cb);
    ok(norm(ca) === norm(cb), mode + ' semilla ' + seed + ': misma carrera quitando c.dev (' + ca.season + ' temporadas, media ' + Bd.C.playerOvr(cb) + ')');
    const ia = inb(ca), ib = inb(cb);
    ok(ib.length <= ia.length && ib.every((x, i) => x === ia[ia.length - ib.length + i]), mode + ' semilla ' + seed + ': los mensajes que no son del entrenador (dv) son los mismos (' + ib.length + ' de ' + ia.length + ')');
    ok(cb.dev && cb.dev.t > 30 && !cb.dev.plan && cb.dev.pos.adapt === null, mode + ' semilla ' + seed + ': reloj ' + (cb.dev && cb.dev.t) + ', sin plan ni adaptación (nadie ha contestado)');
  }
}

// ------------------------------------------------------------------ 2. determinismo
section('2. Determinismo');
for (const mode of ['beach', 'hall']) {
  const keys = mode === 'hall' ? ['spike', 'jump', 'block'] : ['recv', 'dig', 'set'];
  const run = () => { const B = boot(true); return JSON.stringify(H.autopilot(B, { mode, seasons: 3, seed: 7, each: () => spend(B, keys) })); };
  ok(run() === run(), mode + ': misma semilla, mismo JSON (con propuestas)');
}

// ------------------------------------------------------------------ 3. azar
section('3. Azar: ni Math.random ni g.rng; ninguna tirada al crear');
{
  const src = fs.readFileSync(path.join(H.ROOT, DEVJS), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  ok(!/Math\.random/.test(src), 'sin Math.random');
  ok(!/\bg\.rng\b|\.rng\(/.test(src), 'sin g.rng');
  ok(/_rng\(E\._hash\(c\.seed, 'dev'/.test(src), 'azar con K(c)._rng(K(c)._hash(c.seed, \'dev\', …))');
  const B = boot(true), D = B.VB.CareerDev, Bc = B.C.beach, Hc = B.C.hall;
  let n = 0; const r0 = Bc._rng; Bc._rng = function () { n++; return r0.apply(this, arguments); };
  const c = { seed: 5, season: 1, week: 0, phase: 'pick', myClub: -1, player: { roleKey: 'atk', st: { jump: 50, speed: 50, react: 50, recv: 50, dig: 50, set: 50, spike: 50, ctl: 50, block: 50, serve: 50 } } };
  D.hook(c, 'create', {}); D.ensure(c); D.ensure(c);
  const ch = JSON.parse(JSON.stringify(c)); ch.mode = 'hall'; ch.player.roleKey = 'OH'; delete ch.dev; D.hook(ch, 'create', {});
  Bc._rng = r0;
  ok(n === 0 && c.dev && ch.dev, 'crear y ensure no tiran (' + n + ' tiradas)');
  ok(JSON.stringify(c.dev) === JSON.stringify(D.ensure(JSON.parse(JSON.stringify(c))) && c.dev), 'ensure es idempotente');
  ok(Hc && typeof Hc._setPos === 'function', 'la pista exporta _setPos');
}

// ------------------------------------------------------------------ 4. guardados viejos
section('4. Guardados viejos y c.dev dañado');
for (const mode of ['beach', 'hall']) {
  const B = boot(true), D = B.VB.CareerDev, K = B.C;
  const c = fresh(B, mode, 41, 3), key = mode === 'hall' ? 'make-the-cut.career6' : 'make-the-cut.career';
  const o = JSON.parse(B.mem[key]); delete o.dev; B.mem[key] = JSON.stringify(o);
  K._reset(); const c2 = K.get();
  ok(c2 && !c2.dev, mode + ': un guardado sin c.dev carga');
  const d = D.ensure(c2);
  ok(d && d.v === 1 && d.t === 0 && d.pos.cool === D.N.COOL_NEW && d.plan === null && d.pos.off === null, mode + ': ensure lo crea (reloj 0, frío ' + d.pos.cool + ')');
  const n = K.next(K.get()); if (n && n.bench) K.benchNext(); else K.simulateNext();
  ok(K.get().dev && K.get().dev.t === 1, mode + ': la jornada siguiente ya cuenta (reloj ' + (K.get().dev && K.get().dev.t) + ')');
  const bad = JSON.parse(JSON.stringify(K.get()));
  bad.dev = { pos: 'x', plan: { k: 'zz', left: -3 } }; D.ensure(bad);
  ok(bad.dev.pos && typeof bad.dev.pos === 'object' && Array.isArray(bad.dev.pos.hist) && bad.dev.plan === null, mode + ': {pos:\'x\', plan:{k:\'zz\'}} se sanea');
  bad.dev = { t: 'abc', pos: { off: { to: 'ZZ' }, adapt: { pos: 'OH', k: ['spike', 'nope'], left: 99 }, hist: 5, nS: -4, rejS: 50 }, plan: { k: 'srv', left: 99, len: 6, st0: { serve: 'x' } } };
  D.ensure(bad);
  const P = bad.dev.pos;
  ok(bad.dev.t === 0 && P.off === null && P.adapt.left === D.N.ADAPT && P.adapt.k.join() === 'spike' && P.hist.length === 0 && P.nS === 0 && P.rejS === 9, mode + ': campos dañados reparados uno a uno (' + JSON.stringify(P) + ')');
  ok(bad.dev.plan && bad.dev.plan.left === 6 && bad.dev.plan.st0.serve === bad.player.st.serve, mode + ': plan con datos dañados se repara (' + JSON.stringify(bad.dev.plan) + ')');
  ok(JSON.stringify(D.ensure(bad)) === JSON.stringify(bad.dev), mode + ': repararlo dos veces da lo mismo');
  const old = JSON.parse(JSON.stringify(K.get())); old.dev = 'basura'; D.ensure(old);
  ok(old.dev && old.dev.v === 1, mode + ': c.dev que no es un objeto se rehace');
}

// ------------------------------------------------------------------ 5. frecuencia
section('5. Frecuencia de las propuestas');
{
  const cases = [['hall', ['spike', 'jump', 'block'], 'receptor que cultiva remate, salto y bloqueo'], ['beach', ['recv', 'dig', 'set'], 'bloqueador que cultiva recepción, defensa y colocación']];
  for (const [mode, keys, who] of cases) {
    let tot = 0, n = 0, mx = 0, plain = 0, pn = 0, dests = new Set();
    for (const seed of [1, 2, 3]) {
      const B = boot(true), D = B.VB.CareerDev, valid = mode === 'hall' ? B.C.hall.positions() : ['atk', 'cr'];
      H.autopilot(B, { mode, seasons: 6, seed, each: c => { tot += c.dev.pos.nS; n++; mx = Math.max(mx, c.dev.pos.nS); spend(B, keys); } });
      const c = B.C.get(); grabMsgs(c);
      c.dev.pos.hist.forEach(h => { dests.add(h.to); ok(valid.indexOf(h.to) >= 0 && h.to !== h.from, mode + ': destino válido ' + h.from + ' › ' + h.to); });
      const B2 = boot(true);
      H.autopilot(B2, { mode, seasons: 6, seed, each: c => { plain += c.dev.pos.nS; pn++; mx = Math.max(mx, c.dev.pos.nS); } });
      grabMsgs(B2.C.get());
    }
    const avg = tot / n, pavg = plain / pn;
    console.log('  ' + mode + ' (' + who + '): ' + avg.toFixed(2) + ' por temporada (máx. ' + mx + '; destinos ' + [...dests].join(', ') + '); con los atributos de salida: ' + pavg.toFixed(2));
    ok(avg >= 0.4 && avg <= 1.2, mode + ': media de propuestas por temporada en 0,4-1,2 (' + avg.toFixed(2) + ')');
    ok(mx <= 2, mode + ': nunca más de 2 por temporada (' + mx + ')');
    // pista: también sin cultivar nada de otro puesto (jugar poco o un titular más a mano en otro puesto); playa: el cambio de papeles
    // solo tiene sentido si tus atributos se acercan a los del otro papel (con los de salida, la pareja perdería unos 40 de encaje)
    if (mode === 'hall') ok(pavg >= 0.5 && pavg <= 1, 'pista: sin gastar puntos fuera del perfil también llegan (' + pavg.toFixed(2) + ' por temporada, 0,5-1)');
    else ok(pavg <= 0.3, 'playa: con los atributos de su papel casi no propone cambiar (' + pavg.toFixed(2) + ')');
    if (mode === 'beach') ok([...dests].every(p => p === 'atk' || p === 'cr'), 'playa: solo bloqueador o defensor');
  }
  // Pista como en el juego (todas las extensiones de index.html), cada puesto de salida, sin gastar puntos fuera del perfil.
  // squad6 te pone por detrás de los titulares en todos los puestos: lo que hace saltar la propuesta es jugar poco (suplente,
  // jornadas seguidas sin salir de inicio) y un titular más a tu alcance en otro puesto; perder hasta N.FIT_TOL de encaje no cuenta.
  const ALL = ['js/career-injury.js', 'js/career-natl.js', 'js/contest.js', 'js/career-allstar.js', 'js/career-loan.js', 'js/career-race.js', DEVJS, 'js/career-prologue.js'];
  const PK = { OH: ['recv', 'spike', 'jump', 'dig'], S: ['set', 'ctl', 'react', 'speed'], OPP: ['spike', 'jump', 'block', 'ctl'], MB: ['block', 'jump', 'spike', 'react'] };
  let gt = 0, gn = 0, gmx = 0, bad = 0, seen = 0;
  const per = [];
  for (const pos of ['OH', 'S', 'OPP', 'MB']) {
    let t = 0, n = 0;
    for (const seed of [1, 2, 3]) for (const sp of [false, true]) {
      const B = H.boot({ extra: ALL }), K = B.C, D = B.VB.CareerDev, oc = K.create;
      K.create = o => oc(Object.assign(o, { pos }));
      const oh = D.hook;
      D.hook = function (c, kind) {
        if (kind === 'match' && c.phase === 'league') { const m = D.bestMove(c); if (m) { seen++; if (!(m.dfit >= 0 || m.need.v >= 1)) bad++; } }
        return oh.apply(this, arguments);
      };
      H.autopilot(B, { mode: 'hall', seasons: 3, seed, each: c => { t += c.dev.pos.nS; n++; gmx = Math.max(gmx, c.dev.pos.nS); if (sp) { const ks = PK[K.load().player.roleKey] || PK[pos]; let i = 0, g = 0; while (g++ < 400 && K.bump(ks[i++ % ks.length])); } } });
      grabMsgs(K.load());
    }
    gt += t; gn += n; per.push(pos + ' ' + (t / n).toFixed(2));
  }
  const gavg = gt / gn;
  console.log('  pista con todas las extensiones, sin salir del perfil: ' + gavg.toFixed(2) + ' por temporada (' + per.join(', ') + '; máx. ' + gmx + ')');
  ok(gavg >= 0.2 && gavg <= 1, 'pista: con el juego entero llegan propuestas sin forzarlas (' + gavg.toFixed(2) + ' por temporada en 3 temporadas, 0,2-1)');
  ok(+per[0].split(' ')[1] >= 0.3, 'pista: el receptor, el puesto más común, ve alguna (' + per[0] + ')');
  ok(gmx <= 2, 'pista: nunca más de 2 por temporada (' + gmx + ')');
  ok(seen > 100 && bad === 0, 'pista: nunca elige un cambio que encaja peor sin acercarte al seis (' + bad + ' de ' + seen + ')');
}

// ------------------------------------------------------------------ 6. aceptar
section('6. Aceptar');
{
  // pista
  const B = boot(true), D = B.VB.CareerDev, K = B.C;
  let c = fresh(B, 'hall', 52, 3);
  c.coach = 50; c.dev.plan = null;
  D.propose(c, D.scoreOf(c, 'OPP'));
  ok(c.dev.pos.off && c.dev.pos.off.to === 'OPP' && D.dot(c, 'match') && !D.dot(c, 'club'), 'pista: propuesta pendiente y punto en Partido');
  const chem0 = c.chem;
  ok(D.accept(c), 'pista: aceptar');
  ok(c.player.roleKey === 'OPP' && c.player.role === 'Opuesto' && c.sq6 && c.sq6.pos === 'OPP' && c.sq6.fresh === 0, 'pista: puesto y plantilla del puesto nuevo (' + c.player.role + ', sq6 ' + (c.sq6 && c.sq6.pos) + ')');
  ok(c.coach === 53 && c.chem === chem0, 'pista: confianza +3 (' + c.coach + ') y química igual');
  ok(c.dev.pos.adapt && c.dev.pos.adapt.left === 4 && c.dev.pos.adapt.k.join() === 'spike,jump', 'pista: adaptación de 4 jornadas en potencia y salto (' + JSON.stringify(c.dev.pos.adapt) + ')');
  ok(c.dev.plan && c.dev.plan.k === 'atk' && c.dev.plan.auto === 1, 'pista: plan automático del puesto (ataque)');
  ok(K.ctrlRole(c) === 'OPP', 'pista: el partido se juega de opuesto');
  K.save(c);
  // atleta correcto: titular (ctrlIdx) y banquillo (meBench)
  const st = () => ({ jump: 50, speed: 50, react: 50, recv: 50, dig: 50, set: 50, spike: 50, ctl: 50, block: 50, serve: 50 });
  const mOn = { format: '6v6', ctrlIdx: 3, meOn: true, attrs: [[st(), st(), st(), st(), st(), st()], [st()]] };
  D.hook(c, 'setup', mOn);
  ok(mOn.attrs[0][3].spike === 48 && mOn.attrs[0][3].jump === 48 && mOn.attrs[0][3].block === 50 && mOn.attrs[0][0].spike === 50, 'pista: −2 en tu atleta titular (hueco ctrlIdx) y en nadie más');
  const mB = { format: '6v6', ctrlIdx: 0, meOn: false, meBench: 1, attrs: [[st(), st()], [st()]], bench: [[{ st: st() }, { st: st() }], []] };
  D.hook(c, 'setup', mB);
  ok(mB.bench[0][1].st.spike === 48 && mB.attrs[0][0].spike === 50 && mB.bench[0][0].st.spike === 50, 'pista: empezando en el banquillo, −2 en bench[0][meBench]');
  // partido de verdad: matchSetup con y sin adaptación
  const ms1 = K.matchSetup(c), a0 = c.dev.pos.adapt; c.dev.pos.adapt = null; const ms0 = K.matchSetup(c); c.dev.pos.adapt = a0;
  if (ms1 && ms0) {
    const s1 = ms1.meOn === false ? ms1.bench[0][ms1.meBench].st : ms1.attrs[0][ms1.ctrlIdx], s0 = ms0.meOn === false ? ms0.bench[0][ms0.meBench].st : ms0.attrs[0][ms0.ctrlIdx];
    ok(s0.spike - s1.spike === 2 && s0.jump - s1.jump === 2 && s0.recv === s1.recv, 'pista: matchSetup de verdad, −2 en potencia y salto (' + s0.spike + ' › ' + s1.spike + ')');
  } else ok(true, 'pista: (sin partido que preparar en esta jornada)');
  tick(D, c, 4);
  ok(c.dev.pos.adapt === null, 'pista: la adaptación acaba a las 4 jornadas');
  const mOn2 = { format: '6v6', ctrlIdx: 3, attrs: [[st(), st(), st(), st(), st(), st()], [st()]] }; D.hook(c, 'setup', mOn2);
  ok(mOn2.attrs[0][3].spike === 50, 'pista: después ya no resta');
  // playa
  const Bb = boot(true), Db = Bb.VB.CareerDev, Kb = Bb.C;
  const cb = fresh(Bb, 'beach', 53, 3);
  cb.coach = 50; cb.mate.chem = 37;
  Db.propose(cb, Db.scoreOf(cb, 'cr'));
  const mateName = cb.mate.name;
  ok(Db.accept(cb), 'playa: aceptar');
  ok(cb.player.roleKey === 'cr' && cb.player.role === 'Defensor' && cb.mate.roleKey === 'atk' && cb.mate.role === 'Bloqueador' && cb.mate.name === mateName, 'playa: tú de defensor y tu pareja de bloqueador (' + cb.mate.style + ')');
  ok(cb.mate.chem === 37 && cb.coach === 53, 'playa: la química se conserva (' + cb.mate.chem + ') y confianza +3');
  ok(['Rematador potente', 'Saltador', 'Muro en la red'].indexOf(cb.mate.style) >= 0, 'playa: el estilo de tu pareja es de bloqueador');
  ok(cb.dev.plan && cb.dev.plan.k === 'rcv', 'playa: plan automático de recepción');
  Kb.save(cb);
  const mp = Kb.matchSetup(cb);
  if (mp) { const a1 = cb.dev.pos.adapt; cb.dev.pos.adapt = null; const mp0 = Kb.matchSetup(cb); cb.dev.pos.adapt = a1; ok(mp0.attrs[0][0].set - mp.attrs[0][0].set === 2 && mp0.attrs[0][0].recv - mp.attrs[0][0].recv === 2 && mp0.attrs[0][1].set === mp.attrs[0][1].set, 'playa: −2 en colocación y recepción en tu atleta (no en tu pareja)'); }
  ok(mp && mp.career && mp.career.role === 'cr', 'playa: el partido sabe tu papel nuevo (career.role ' + (mp && mp.career && mp.career.role) + ')');
  grabMsgs(c); grabMsgs(cb);
}

// ------------------------------------------------------------------ 7. rechazar y caducar
section('7. Rechazar y caducar');
{
  const B = boot(true), D = B.VB.CareerDev;
  const c = fresh(B, 'hall', 61, 3);
  c.coach = 50; D.propose(c, D.scoreOf(c, 'MB')); D.reject(c);
  ok(c.coach === 46 && c.player.roleKey === 'OH' && c.dev.pos.rejS === 1 && c.dev.pos.cool === c.dev.t + D.N.COOL_REJ, 'rechazar: −4 (' + c.coach + '), sigues de receptor, frío de ' + D.N.COOL_REJ);
  c.coach = 75; D.propose(c, D.scoreOf(c, 'MB')); c.dev.pos.rejS = 0; D.reject(c);
  ok(c.coach === 73, 'rechazar con confianza ≥ 70: −2 (' + c.coach + ')');
  c.coach = 50; D.propose(c, D.scoreOf(c, 'OPP')); D.reject(c);
  ok(c.coach === 44 && c.dev.pos.rejS === 2, '2º rechazo de la temporada: −6 (' + c.coach + ')');
  c.dev.pos.cool = 0; c.dev.pos.nS = 0;
  ok(D.canPropose(c) === 'rej', 'tras el 2º rechazo no vuelve a proponer esta temporada (' + D.canPropose(c) + ')');
  D.hook(c, 'newSeason');
  ok(c.dev.pos.rejS === 0 && c.dev.pos.nS === 0, 'temporada nueva: contadores a 0');
  // caducar
  const B2 = boot(true), Dd = B2.VB.CareerDev, cc = fresh(B2, 'beach', 62, 3);
  cc.coach = 50; Dd.propose(cc, Dd.scoreOf(cc, 'cr')); const t0 = cc.dev.t;
  tick(Dd, cc, 2);
  ok(cc.dev.pos.off && cc.dev.pos.off.to === 'cr', 'caducar: sigue pendiente 2 jornadas');
  tick(Dd, cc, 1);
  ok(!cc.dev.pos.off && cc.coach === 50 && cc.player.roleKey === 'atk' && cc.dev.pos.hist.slice(-1)[0].how === 'caduca' && cc.dev.pos.cool === t0 + 3 + D.N.COOL_EXP, 'caducar a las 3 jornadas: sin efecto en la confianza (' + cc.coach + ')');
  ok(/No me has dicho nada del cambio a defensor/.test(cc.inbox.slice(-1)[0].x), 'caducar: «No me has dicho nada del cambio a defensor…»');
  // fichar o cesión: la propuesta se va
  Dd.propose(cc, Dd.scoreOf(cc, 'cr')); Dd.hook(cc, 'join', {});
  ok(!cc.dev.pos.off && cc.dev.pos.cool === cc.dev.t + D.N.COOL_JOIN, 'fichar: la propuesta se va y hay un frío de ' + D.N.COOL_JOIN);
  Dd.propose(cc, Dd.scoreOf(cc, 'cr')); Dd.hook(cc, 'season');
  ok(!cc.dev.pos.off, 'fin de temporada: la propuesta se va');
  grabMsgs(c); grabMsgs(cc);
}

// ------------------------------------------------------------------ 8. pedirlo tú
section('8. Pedirlo tú');
{
  const B = boot(true), D = B.VB.CareerDev;
  const c = fresh(B, 'hall', 71, 3);
  let lo = 1, hi = 0;
  [0, 10, 20, 40, 50, 60, 80, 100].forEach(v => { c.coach = v; ['S', 'OPP', 'MB'].forEach(p => { const a = D.askChance(c, p); lo = Math.min(lo, a.ch); hi = Math.max(hi, a.ch); ok(a.auto || ['Probable', 'Difícil', 'Muy difícil'].indexOf(a.lab) >= 0, 'etiqueta ' + a.lab); }); });
  ok(lo >= 0.05 - 1e-9 && hi <= 0.9 + 1e-9, 'probabilidad dentro de [0,05; 0,9] (' + lo + '-' + hi + ')');
  c.contract.role = 'Rotación'; c.coach = 30;
  const r1 = D.ask(c, 'OPP');
  ok(r1.ok && !r1.yes && c.coach === 30 && c.player.roleKey === 'OH' && /gánate mi confianza/.test(r1.text), 'Rotación con confianza < 40: no, sin penalización');
  ok(D.askOk(c) === 'wait', 'después hay que esperar (' + D.askOk(c) + ')');
  tick(D, c, D.N.ASK_WAIT - 1); c.dev.pos.off = null;
  ok(D.askOk(c) === 'wait', 'a las 7 jornadas aún no');
  tick(D, c, 1); c.dev.pos.off = null;
  ok(D.askOk(c) === '', 'a las 8 jornadas, sí');
  // sí y no con tirada: se ve en varias semillas
  let yes = 0, no = 0, noPen = true;
  for (let s = 0; s < 30; s++) {
    const Bx = boot(true), Dx = Bx.VB.CareerDev, cx = fresh(Bx, 'hall', 800 + s, 2);
    cx.coach = 55; const pre = cx.coach, r = Dx.ask(cx, 'OPP');
    if (!r.ok) continue;
    if (r.yes) { yes++; if (cx.player.roleKey !== 'OPP' || cx.coach !== pre || !cx.dev.pos.adapt) noPen = false; }
    else { no++; if (cx.coach !== pre - 2 || !/De opuesto no te veo: te falta/.test(r.text)) noPen = false; }
    grabMsgs(cx);
  }
  ok(yes > 0 && no > 0 && noPen, 'pedir con tirada: síes (' + yes + ', confianza igual y adaptación) y noes (' + no + ', −2 y el atributo que falta)');
  // verano: siempre sí
  const Bs = boot(true), Ds = Bs.VB.CareerDev, Ks = Bs.C;
  const cs = fresh(Bs, 'hall', 73, 0);
  let g = 0; while (Ks.get().phase !== 'off' && g++ < 80) { const n = Ks.next(Ks.get()); if (n && n.bench) Ks.benchNext(); else if (!n) break; else Ks.simulateNext(); }
  const co = Ks.get();
  ok(co.phase === 'off', 'verano (fase off)');
  co.dev.pos.off = null; co.dev.pos.adapt = null; co.coach = 10; co.contract.role = 'Rotación';
  const rv = Ds.ask(co, 'MB');
  ok(rv.ok && rv.yes && co.player.roleKey === 'MB' && co.coach === 10 && co.dev.pos.adapt && co.dev.pos.adapt.left === Ds.N.ADAPT_OFF, 'verano: siempre sí, sin cambio de confianza y adaptación de ' + Ds.N.ADAPT_OFF + ' jornadas');
  co.dev.pos.adapt = null;
  ok(Ds.askOk(co) === 'summer', 'verano: solo un cambio');
  ok(co.sq6 && co.sq6.pos === 'MB' && co.sq6.season === co.season + 1, 'verano: plantilla del puesto nuevo para la temporada que viene');
  // fase pick: no
  const Bp = boot(true), Dp = Bp.VB.CareerDev;
  const cp = Bp.C.create({ mode: 'hall', name: 'Sin Club', seed: 74, now: 1 });
  ok(Dp.askOk(cp) === 'pick' && Dp.ui.state(cp, HLP) === '', 'sin club: no se puede pedir y no se pinta nada');
  // adaptación: no se puede pedir
  co.dev.pos.adapt = { pos: 'MB', k: ['block', 'jump'], left: 2, d: 2 }; co.dev.pos.sumS = 0;
  ok(Ds.askOk(co) === 'adapt', 'durante la adaptación no se puede pedir');
  // playa
  const Bb = boot(true), Db = Bb.VB.CareerDev, cb = fresh(Bb, 'beach', 75, 3);
  cb.coach = 90; cb.mate.chem = 44;
  let rb = null; for (let i = 0; i < 6 && !(rb && rb.yes); i++) { cb.dev.pos.askT = -99; cb.dev.t += 1; rb = Db.ask(cb, 'cr'); }
  ok(rb && rb.yes && cb.player.roleKey === 'cr' && cb.mate.roleKey === 'atk' && cb.mate.chem === 44, 'playa: pedir defensor, tu pareja pasa a bloqueador y la química sigue');
  ok(Db.ask(cb, 'uni').ok === false, 'playa: Universal nunca es destino');
  grabMsgs(co); grabMsgs(cb);
}

// ------------------------------------------------------------------ 9. plan de desarrollo
section('9. Plan de desarrollo');
{
  const B = boot(true), D = B.VB.CareerDev, K = B.C;
  const c = fresh(B, 'beach', 81, 3);
  ok(D.trainProg(c, { phys: 15, def: 15, atk: 15 }) === undefined, 'sin plan: trainProg no cambia nada');
  const p0 = { phys: 15, def: 15, atk: 15 }; D.trainProg(c, p0);
  ok(JSON.stringify(p0) === '{"phys":15,"def":15,"atk":15}' && D.trainPick(c, 'atk', ['set', 'serve']) === null && D.sessMul(c, 'serve') === null, 'sin plan: los tres ganchos devuelven lo que reciben');
  ok(D.setPlan(c, 'srv') && c.dev.plan.k === 'srv' && c.dev.plan.left === 6 && c.dev.plan.st0.serve === c.player.st.serve, 'elegir plan de saque');
  let sumOk = true;
  [{ phys: 15, def: 15, atk: 15 }, { atk: 60 }, { def: 60 }, { phys: 66 }, { phys: 15, def: 21, atk: 15 }, {}].forEach(pr => {
    const a = Object.assign({}, pr), s0 = Object.values(a).reduce((x, y) => x + y, 0); D.trainProg(c, a);
    const s1 = Object.values(a).reduce((x, y) => x + y, 0); if (Math.abs(s1 - s0) > 1) sumOk = false;
    if (verbose) console.log('    ' + JSON.stringify(pr) + ' › ' + JSON.stringify(a));
  });
  const eq = { phys: 15, def: 15, atk: 15 }; D.trainProg(c, eq);
  ok(sumOk && eq.atk === 27 && eq.def === 9 && eq.phys === 9, 'trainProg: la suma no cambia y pasa un ' + Math.round(D.N.PLAN_SHIFT * 100) + ' % al plan (' + JSON.stringify(eq) + ')');
  const d60 = { def: 60 }; D.trainProg(c, d60);
  ok(d60.def === 36 && d60.atk === 24, 'trainProg: con enfoque Defensa también pasa algo al plan (' + JSON.stringify(d60) + ')');
  const SPR = D.N.PLAN_SPREAD;
  c.player.st.set = 40; c.player.st.ctl = 45; c.player.st.spike = 70; c.player.st.serve = 40 + SPR;
  ok(JSON.stringify(D.trainPick(c, 'atk', ['set', 'ctl', 'serve', 'spike'])) === '["serve","set","ctl","spike"]', 'trainPick: primero el saque si no pasa en más de ' + SPR + ' al más bajo');
  c.player.st.serve = 41 + SPR;
  ok(D.trainPick(c, 'atk', ['set', 'ctl', 'serve', 'spike']) === null, 'trainPick: si pasa en más de ' + SPR + ' (' + c.player.st.serve + ' contra 40), el más bajo como siempre');
  ok(D.trainPick(c, 'phys', ['speed', 'react', 'jump']) === null, 'trainPick: en un grupo sin atributos del plan, nada');
  ok(D.sessMul(c, 'serve') === 1.2 && D.sessMul(c, 'recv') === null, 'sessMul: ×1,2 en las sesiones de saque, nada en las otras');
  // sesión de verdad: el multiplicador entra (res.mul)
  K.save(c);
  const r = K.trainSession('serve', 'quick');
  ok(r && r.ok && Math.abs(r.mul - 0.8 * 1.2 * (r.focus ? 1.2 : 1)) < 0.011, 'sesión rápida de saque con plan: mul ' + (r && r.mul));
  // fin del plan
  const v0 = c.player.st.serve; c.dev.plan.st0.serve = v0 - 3;
  tick(D, c, 5);
  ok(c.dev.plan && c.dev.plan.left === 1, 'quedan jornadas: el plan sigue (' + (c.dev.plan && c.dev.plan.left) + ')');
  const sum = {}; D.hook(c, 'match', sum, null);
  const last = c.inbox.slice(-1)[0];
  ok(!c.dev.plan && sum.dev && /^Plan de saque cumplido: saque \d+ › \d+ en 6 jornadas\.$/.test(sum.dev.end) && /Plan de saque cumplido/.test(last.t), 'a las 6 jornadas acaba con su mensaje («' + (sum.dev && sum.dev.end) + '»)');
  // fis: un plan de varios atributos
  D.setPlan(c, 'blk');
  const bp = { phys: 15, def: 15, atk: 15 }; D.trainProg(c, bp);
  ok(bp.atk === 9 && bp.def + bp.phys === 36, 'plan de bloqueo: va a defensa y físico (' + JSON.stringify(bp) + ')');
  ok(D.stopPlan(c) && !c.dev.plan && !D.stopPlan(c), 'dejar el plan');
  grabMsgs(c);
  // medida: 2 temporadas con plan de saque sin parar (se elige otra vez al acabar) contra sin plan, misma semilla
  const measure = (mode, plan, seed) => {
    const Bm = boot(true), Dm = Bm.VB.CareerDev;
    if (plan) (Bm.VB.CareerExt).push({ id: 'devtest-plan', hook(c, k) { if ((k === 'match' || k === 'create' || k === 'join') && c.player && !(c.dev && c.dev.plan)) Dm.setPlan(c, plan); } });
    const cm = H.autopilot(Bm, { mode, seasons: 2, seed });
    return { serve: cm.player.st.serve, ovr: Bm.C.playerOvr(cm), c: cm };
  };
  for (const mode of ['beach', 'hall']) {
    let ds = 0, dovr = 0, k = 0;
    for (const seed of [91, 92, 93]) { const a = measure(mode, 'srv', seed), b = measure(mode, null, seed); ds += a.serve - b.serve; dovr += a.ovr - b.ovr; k++; }
    const per = ds / k / 2, ov = dovr / k;
    console.log('  ' + mode + ': plan de saque sin parar, saque ' + (per >= 0 ? '+' : '') + per.toFixed(1) + ' por temporada sobre no tenerlo; media ' + (ov >= 0 ? '+' : '') + ov.toFixed(1));
    // (la temporada de pista es más corta: 10-13 jornadas contra las 15-17 de la playa)
    const lo = mode === 'hall' ? 2.5 : 3;
    ok(per >= lo && per <= 6, mode + ': el plan de saque da +' + lo + '/+6 de saque por temporada (' + per.toFixed(1) + ')');
    ok(Math.abs(ov) <= 1, mode + ': la media general apenas cambia (' + ov.toFixed(1) + ')');
  }
}

// ------------------------------------------------------------------ 11. interfaz
section('11. Pintores e interfaz');
{
  for (const mode of ['beach', 'hall']) {
    const B = boot(true), D = B.VB.CareerDev, K = B.C;
    const c = fresh(B, mode, 101, 3); c.dev.pos.off = null; c.dev.pos.adapt = null; D._uiReset();
    const btns = h => (h.match(/<button[^>]*>[\s\S]*?<\/button>/g) || []);
    const actsOk = h => btns(h).filter(b => /data-act="/.test(b)).every(b => /data-act="dv-[a-z0-9-]+"/i.test(b) && b.replace(/<[^>]+>/g, '').trim().length > 0);
    ok(D.ui.match(c, HLP) === '', mode + ': Partido sin propuesta, vacío');
    ok(mode === 'hall' ? /data-tab="player" data-s="train"/.test(D.ui.opts(c, HLP)) : D.ui.opts(c, HLP) === '', mode + ': Opciones ' + (mode === 'hall' ? 'lleva a Jugador › Estado' : 'vacío en la playa'));
    const st = D.ui.state(c, HLP);
    ok(/dv-plan-open/.test(st) && /dv-ask-open/.test(st) && actsOk(st) && /Sin plan/.test(st), mode + ': Estado con plan y puesto');
    ok((st.match(/class="pbar cdv-pb/g) || []).length === (mode === 'hall' ? 4 : 2), mode + ': una barra de encaje por puesto');
    if (mode === 'beach') {
      const rk = c.player.roleKey, rl = c.player.role; c.player.roleKey = 'uni'; c.player.role = 'Universal';
      const su = D.ui.state(c, HLP);
      ok((su.match(/class="pbar cdv-pb/g) || []).length === 3 && /class="pbar cdv-pb cdv-cur"><span>Universal</.test(su), 'playa: con el papel viejo Universal, su barra marcada como tu puesto');
      c.player.roleKey = rk; c.player.role = rl;
    }
    allText.push(st.replace(/<[^>]+>/g, ' '));
    ok(D._demo(c, 'planOpen'), mode + ': _demo planOpen');
    const sp = D.ui.state(c, HLP);
    ok(['atk', 'rcv', 'blk', 'srv', 'set', 'fis'].every(k => sp.indexOf('data-act="dv-plan-' + k + '"') >= 0) && /Encaja/.test(sp) && actsOk(sp), mode + ': lista de los 6 planes con «Encaja»');
    ok(D._demo(c, 'askOpen'), mode + ': _demo askOpen');
    const sa = D.ui.state(c, HLP), others = D.posList(c).filter(p => p !== c.player.roleKey);
    ok(others.every(p => sa.indexOf('data-act="dv-ask-' + p + '"') >= 0) && /(Probable|Difícil|Muy difícil|Sin opciones)/.test(sa) && actsOk(sa), mode + ': lista de puestos para pedir con su probabilidad');
    if (mode === 'beach') ok(/Defensor \(y [^)]+ a la red\)/.test(sa), 'playa: «Defensor (y … a la red)»');
    allText.push(sp.replace(/<[^>]+>/g, ' '), sa.replace(/<[^>]+>/g, ' '));
    ok(D._demo(c, 'pos') && c.dev.pos.off, mode + ': _demo pos deja una propuesta');
    const sm = D.ui.match(c, HLP);
    ok(/dv-pos-ok/.test(sm) && /dv-pos-no/.test(sm) && sm.indexOf('dv-pos-no') < sm.indexOf('dv-pos-ok') && actsOk(sm) && !/class="pri"/.test(sm), mode + ': tarjeta de la propuesta (Rechazar, luego Aceptar; sin robar la mancha de «Jugar»)');
    ok(/Si aceptas: confianza \+3/.test(sm) && /Si rechazas: confianza −/.test(sm), mode + ': dice qué ganas y qué te cuesta');
    const smp = D.ui.matchTop(c, HLPph);
    ok(/sp-q/.test(smp) && smp.indexOf('<p class="muted">El entrenador puede') < 0, mode + ': en el móvil la explicación va tras el «?»');
    ok(/dv-pos-ok/.test(smp) && D.ui.match(c, HLPph) === '' && D.ui.matchTop(c, HLP) === '', mode + ': en el móvil la propuesta va arriba (matchTop); en PC, debajo del partido');
    ok(mode === 'hall' ? /plantilla del puesto nuevo/.test(sm) : /tu pareja pasa al otro papel; la química se mantiene/.test(sm) && !/plantilla/.test(sm), mode + ': la explicación habla de ' + (mode === 'hall' ? 'la plantilla' : 'la pareja'));
    allText.push(sm.replace(/<[^>]+>/g, ' '));
    // acciones (sobre la carrera activa)
    K.save(c); K.setMode(mode);
    ok(K.get() === c || K.get().seed === c.seed, mode + ': carrera activa');
    const a1 = D.act('dv-plan-open');
    ok(a1 && a1.render && D._ui().open === 'plan', mode + ': dv-plan-open despliega');
    const a2 = D.act('dv-plan-srv');
    ok(a2 && a2.render && K.get().dev.plan && K.get().dev.plan.k === 'srv' && D._ui().open === '', mode + ': dv-plan-srv elige el plan y cierra la lista');
    K._reset();
    ok(K.get().dev.plan && K.get().dev.plan.k === 'srv', mode + ': el plan queda guardado');
    const sf = D.ui.state(K.get(), HLP);
    ok(/Plan de saque en marcha/.test(sf) && /dv-plan-stop/.test(sf) && /quedan 6 de 6 jornadas/.test(sf), mode + ': la tarjeta enseña el plan y la respuesta');
    ok(D.act('dv-plan-stop').render && !K.get().dev.plan, mode + ': dv-plan-stop');
    ok(D.act('dv-plan-zz') === false, mode + ': plan que no existe: false');
    D._demo(K.get(), 'pos');
    const to = K.get().dev.pos.off.to, a3 = D.act('dv-pos-ok');
    ok(a3 && a3.render && a3.focus && K.get().player.roleKey === to && a3.setter === (to === 'S'), mode + ': dv-pos-ok acepta (' + to + ')');
    const sd = D.ui.match(K.get(), HLP);
    ok(/Hecho: ahora juegas de/.test(sd) && /dv-go-state/.test(sd) && D.ui.match(K.get(), HLP) === '', mode + ': tras aceptar, la respuesta una vez y el botón a tu plan');
    const g = D.act('dv-go-state');
    ok(g && g.tab === 'player' && g.s === 'train', mode + ': dv-go-state lleva a Jugador › Estado');
    K.get().dev.pos.adapt = null; K.get().dev.pos.cool = 0; D._demo(K.get(), 'pos');
    const a4 = D.act('dv-pos-no');
    ok(a4 && a4.render && !K.get().dev.pos.off, mode + ': dv-pos-no rechaza');
    ok(D.act('dv-pos-ok') === false, mode + ': aceptar sin propuesta: false');
    allText.push(sd.replace(/<[^>]+>/g, ' '));
    const css = D.css();
    ok(css.indexOf(':root.ph:not(#_):not(#_):not(#_) #career') >= 0 && !/font-size:(\d|1[01])px/.test(css) && !/·/.test(css), mode + ': CSS con prefijo del móvil y letra ≥ 12 px');
    grabMsgs(K.get());
  }
}

// ------------------------------------------------------------------ 10. textos
section('10. Textos');
{
  const B = boot(true), D = B.VB.CareerDev;
  const c = fresh(B, 'hall', 111, 3);
  c.sq6.stat = 'sub';
  const o = D.offerOf(c, { p: 'OPP', s: 5, dfit: 1, need: { v: 3, to: { rk: 1, n: 2, gap: 2, slots: 1, depth: 0 }, from: { rk: 4, n: 4, gap: -3, slots: 2, depth: 2 } } });
  ok(/De opuesto serías titular; ahora, el 2º suplente\./.test(o.text) && o.why.some(w => /^De opuesto serías titular; ahora, el 2º suplente$/.test(w)) && o.why.some(w => /Ahora no juegas de inicio/.test(w)), 'ordinales y sitio: titular contra 2º suplente («' + o.text + '»)');
  const o3 = D.offerOf(c, { p: 'MB', s: 5, dfit: -3, need: { v: 3, to: { rk: 3, n: 3, gap: -1, slots: 2, depth: 1 }, from: { rk: 4, n: 4, gap: -4, slots: 2, depth: 2 } } });
  ok(/De central, el titular te saca 1; de receptor, el titular te saca 4/.test(o3.text) && /^Me hace falta alguien de central/.test(o3.text) && o3.why.some(w => /Tu encaje baja: \d+ % › \d+ %/.test(w)), 'si encaja peor, «Me hace falta…» y lo dice («' + o3.why.join(' | ') + '»)');
  const o4 = D.offerOf(c, { p: 'MB', s: 5, dfit: -3, need: { v: 2, to: { rk: 3, n: 3, gap: -1, slots: 2, depth: 1 }, from: { rk: 3, n: 4, gap: -3, slots: 2, depth: 1 } } });
  ok(/De central, el titular te saca 1; de receptor, el titular te saca 3\./.test(o4.text), 'mismo sitio: dice cuánto te saca el titular («' + o4.text + '»)');
  const o5 = D.offerOf(c, { p: 'MB', s: 2, dfit: -3, need: { v: 0, to: { rk: 3, n: 3, gap: -4, slots: 2, depth: 1 }, from: { rk: 3, n: 4, gap: -3, slots: 2, depth: 1 } } });
  ok(!/Me hace falta/.test(o5.text) && !/serías/.test(o5.text), 'sin necesidad no dice «Me hace falta» ni promete sitio («' + o5.text + '»)');
  c.sq6.stat = 'start';
  const o6 = D.offerOf(c, { p: 'OPP', s: 5, dfit: 1, need: { v: 3, to: { rk: 1, n: 2, gap: 2, slots: 1, depth: 0 }, from: { rk: 2, n: 4, gap: 1, slots: 2, depth: 0 } } });
  ok(!/suplente/.test(o6.text), 'de titular no te llama suplente («' + o6.text + '»)');
  allText.push(o.text, o3.text, o4.text, o5.text, o6.text, ...o.why, ...o3.why);
  const bad = allText.filter(t => /[{}]|undefined|NaN|1\.er|2\.º|3\.er|·|\bnull\b/.test(String(t)));
  ok(allText.length > 40, 'textos revisados: ' + allText.length);
  ok(!bad.length, 'sin «{», «undefined», «NaN», «null», «1.er» ni «·»' + (bad.length ? ': ' + bad.slice(0, 3).join(' ¦ ') : ''));
  const long = [...titles].filter(t => t.length > 45);
  ok(titles.size >= 6 && !long.length, 'títulos de mensaje cortos (' + [...titles].join(' ¦ ') + ')');
}

// ------------------------------------------------------------------ 12. sin el registro (career.js viejo)
section('12. Sin VB.Career ni registro de extensiones');
{
  const cx = { console, Math, JSON }; cx.globalThis = cx; cx.window = cx; vm.createContext(cx);
  let err = '';
  try { vm.runInContext(fs.readFileSync(path.join(H.ROOT, DEVJS), 'utf8'), cx, { filename: DEVJS }); } catch (e) { err = e.message; }
  ok(!err && cx.VB.CareerDev, 'carga sin VB.Career ni DOM' + (err ? ' (' + err + ')' : ''));
  const D = cx.VB.CareerDev, c = { seed: 1, season: 1, phase: 'league', week: 3, myClub: 0, player: { roleKey: 'atk', st: {} } };
  let e2 = '';
  try { D.hook(c, 'create', {}); D.hook(c, 'match', {}); D.ensure(c); ok(D.ui.match(c, HLP) === '' && D.act('dv-plan-srv') === false && D.dot(c, 'match') === false, 'sin VB.Career no pinta ni hace nada'); } catch (e) { e2 = e.message; }
  ok(!e2, 'sin VB.Career, los ganchos no rompen' + (e2 ? ' (' + e2 + ')' : ''));
  // con career.js pero cargado ANTES que el registro exista: el fichero crea VB.CareerExt y VB.CareerUIExt
  const B = boot(true);
  ok(B.VB.CareerExt.some(x => x.id === 'dev') && B.VB.CareerUIExt.some(x => x.id === 'dev' && x.prefix === 'dv-' && x.hide.indexOf('setpos') >= 0) && B.C.ext.get('dev') === B.VB.CareerDev, 'registrado en VB.CareerExt (id dev) y VB.CareerUIExt (prefijo dv-, oculta el selector de puesto)');
}

// ------------------------------------------------------------------ 13. pantallas de muestra (mobaudit)
section('13. _demo pos con la carrera de mobaudit (semilla 4242): siempre abre, aunque no haya destino con sentido');
for (const mode of ['hall', 'beach']) {
  const B = boot(true), K = B.C, D = B.VB.CareerDev;
  const c = K.create(mode === 'hall' ? { mode: 'hall', name: 'Ares Belmonte', num: 7, seed: 4242, points: 15 } : { mode: 'beach', name: 'Ares Belmonte', num: 7, role: 'cr', points: 21, seed: 4242, ctrl: 'one' });
  K.acceptOffer(Math.max(0, c.offers.findIndex(x => !x.trial)), 2);
  for (let i = 0; i < 4; i++) K.simulateNext(K.get());
  const cc = K.get(); cc.dev.pos.off = null;
  const bm = D.bestMove(cc), r = D._demo(cc, 'pos'), o = cc.dev.pos.off;
  ok(r === true && o && o.to !== cc.player.roleKey && D.posList(cc).indexOf(o.to) >= 0 && /dv-pos-ok/.test(D.ui.match(cc, HLP)),
    mode + ': _demo pos deja propuesta (' + (o && o.from + ' › ' + o.to) + (bm ? '' : ', sin bestMove') + ')');
}
// en pista, sin destino «con sentido» (use) el demo coge la mejor puntuación igualmente
{
  const B = boot(true), K = B.C, D = B.VB.CareerDev, c = fresh(B, 'hall', 4242, 3);
  const orig = D.scoreOf; c.dev.pos.off = null;
  const best = D.posList(c).filter(p => p !== c.player.roleKey).map(p => orig(c, p)).sort((a, b) => b.s - a.s)[0];
  ok(best && D._demo(c, 'pos') && c.dev.pos.off && c.dev.pos.off.to === (D.bestMove(c) || best).p, 'pista: el demo propone ' + (best && best.p));
}

console.log('\n' + passes + ' comprobaciones, ' + fails + ' fallos');
console.log(fails ? 'HAY FALLOS' : 'TODO OK');
process.exit(fails ? 1 : 0);
