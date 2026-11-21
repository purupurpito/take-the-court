#!/usr/bin/env node
/* MAKE THE CUT — tools/bondtest.js (owner: carrera)
 * Rencor y cariño de los clubes (idea «rencor», js/career-life.js c.life.bond), en node puro (vm, sin DOM):
 *   1) salir con contrato en vigor → rencor (t −1, 'early', mensaje del agente);  2) cumplir el contrato → cariño ('fin', +10 por
 *   temporada, tope +45); transferible / promesa incumplida → neutro; la cesión no cuenta;  3) título con el club +30 (una vez por
 *   temporada; el ascenso no);  4) derbi de eliminatoria (playa: club del rival personal; pista: misma ciudad) −30, en liga nada;
 *   5) roja en su casa −20, en la tuya nada;  6) verano ×0,75, olvido por debajo de 8, tope de 30 clubes;  7) ofertas: con mucho
 *   rencor el club SIGUE ofreciendo, pero peor (sueldo y rol); con cariño, más interés; la carta pinta la etiqueta y el motivo;
 *   8) ambCtx devuelve bond y sube el calor con rencor en su casa;  9) aviso del próximo partido (uno por temporada y club, también
 *   con el ambiente apagado);  10) guardado antiguo sin bond;  11) determinismo y sin Math.random.
 * Uso: node tools/bondtest.js   Sale con 1 si algo falla; acaba en «TODO OK».
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
let fails = 0, passes = 0;
function ok(c, msg) { if (!c) { fails++; console.log('  FALLO: ' + msg); } else { passes++; if (process.env.V) console.log('  ok: ' + msg); } }
function section(t) { console.log('\n== ' + t); }

const FILES = ['js/sim.js', 'js/prog.js', 'js/badges.js', 'js/leagues.js', 'js/rating.js', 'js/career.js', 'js/career-life.js', 'js/career-world.js'];
function load() {
  const mem = {};
  const ls = { getItem: k => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: k => { delete mem[k]; } };
  const errs = [];
  const cons = Object.assign(Object.create(console), { error: (...a) => { errs.push(String(a[0]) + ': ' + (a[1] && a[1].message || a[1])); } });
  const ctx = { console: cons, Math, Date, JSON, Set, localStorage: ls }; ctx.globalThis = ctx; ctx.window = ctx;
  vm.createContext(ctx);
  for (const f of FILES) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  return { VB: ctx.VB, mem, errs, ctx };
}
const E = load(), VB = E.VB, C = VB.Career, Lf = VB.CareerLife;
ok(Lf && typeof Lf.bondOf === 'function' && typeof Lf.bondOffer === 'function' && typeof Lf.bondLine === 'function', 'VB.CareerLife exporta bondOf, bondOffer y bondLine');
const txtOk = s => typeof s === 'string' && s.length > 0 && !/\{|\}|undefined|NaN|null/.test(s);
const msgs = (c, id0) => (c.inbox || []).filter(m => m.id > id0);   // (la bandeja guarda 40: se cuenta por id)
const otherClub = (c, pred) => c.clubs.filter(k => k.id !== c.myClub && (!pred || pred(k)))[0];
function beachOffer(c, k) { return { club: k.id, lvl: k.lvl, ovr: 50, q: k.q, interest: 3, mate: 50, role: C.ROLE_LV[1], years: 1, salary: 1000 }; }
function seasonOff(c) { let g = 0; while (c.phase !== 'off' && g++ < 60) C.simulateNext(c); return c.phase === 'off'; }

// ------------------------------------------------------------------ 1) salida con contrato en vigor
section('Salida con contrato en vigor');
C.setMode('beach');
let c = C.create({ name: 'Iria Prueba', num: 7, role: 'atk', seed: 4242, autoClub: true });
const A = c.myClub;
ok(c.life && c.life.bond && c.life.bond.at === A && Object.keys(c.life.bond.k).length === 0, 'carrera nueva: bond en el club de ahora y sin relaciones');
{
  for (let i = 0; i < 3; i++) C.simulateNext(c);
  const kB = otherClub(c, k => k.lvl === C.myClub(c).lvl), n0 = (c.msgN | 0);
  c.offers = [beachOffer(c, kB)]; c.window = 'mid';
  ok(C.acceptOffer(0, 1), 'fichaje a mitad de temporada aceptado');
  c = C.get();
  const b = Lf.bondOf(c, A);
  ok(b && b.t === -1 && b.last === 'early' && b.v === Lf.BOND_D.early, 'el club que dejas te guarda rencor (t −1, early): ' + JSON.stringify(b));
  ok(msgs(c, n0).some(m => m.k === 'agent' && m.t === 'Salida sonada' && txtOk(m.x)), 'mensaje del agente «Salida sonada»');
  ok(c.life.bond.at === kB.id, 'bond.at pasa al club nuevo');
  // 2) cumplir el contrato al final de la temporada
  section('Cumplir el contrato');
  ok(seasonOff(c), 'temporada cerrada');
  c.contract.left = 1; c.listed = false; c.broken = 0;
  const kD = otherClub(c, k => k.id !== A && k.id !== kB.id), n1 = (c.msgN | 0);
  c.offers = [beachOffer(c, kD)]; c.window = 'end';
  ok(C.acceptOffer(0, 1), 'fichaje al acabar el contrato');
  c = C.get();
  const bb = Lf.bondOf(c, kB.id);
  const tw = bb && bb.why.indexOf('title') >= 0 ? Lf.BOND_D.title : 0;   // (si esa temporada ganó un título con el club, +30 más)
  ok(bb && bb.v === Lf.BOND_D.fin + tw && bb.last === 'fin' && bb.t === Lf.bondT(Lf.BOND_D.fin + tw), 'una temporada cumplida: +20 de cariño' + (tw ? ' (+30 del título de esa temporada)' : ' (aún sin etiqueta)') + ': ' + JSON.stringify(bb));
  ok(msgs(c, n1).some(m => m.k === 'club' && /te despide$/.test(m.t) && /una temporada/.test(m.x) && txtOk(m.x)), 'mensaje «… te despide» con «una temporada»');
  ok(Lf.bondOf(c, A) && Lf.bondOf(c, A).v === Lf.BOND_D.early, 'el verano de justo después no enfría lo de la temporada que acaba');
}
// hook directo: neutro, varias temporadas, cesión
{
  const l = c.life, ids = c.clubs.map(k => k.id).filter(id => id !== c.myClub);
  const join = (from, o) => { l.bond.at = from; Lf.hook(c, 'join', o); };
  join(ids[5], { club: c.myClub, wasListed: true }); ok(!Lf.bondOf(c, ids[5]), 'irte declarado transferible: neutro');
  join(ids[6], { club: c.myClub, wasBroken: true }); ok(!Lf.bondOf(c, ids[6]), 'irte por una promesa incumplida: neutro');
  const h0 = c.history; c.history = [1, 2, 3].map(s => ({ season: s, club: ids[7] }));
  const ph = c.phase; c.phase = 'off';
  join(ids[7], { club: c.myClub }); ok(Lf.bondOf(c, ids[7]).v === 40 && Lf.bondOf(c, ids[7]).t === 1, '3 temporadas cumplidas: +40 (cariño)');
  c.history = [1, 2, 3, 4, 5, 6].map(s => ({ season: s, club: ids[8] }));
  join(ids[8], { club: c.myClub }); ok(Lf.bondOf(c, ids[8]).v === Lf.BOND_D.finMax, '6 temporadas: tope de +45');
  c.history = h0; c.phase = ph;
  l.bond.at = ids[9]; Lf.hook(c, 'join', { club: ids[10], loan: 1 }); ok(l.bond.at === ids[9] && !Lf.bondOf(c, ids[9]), 'una cesión no cuenta: sigues siendo del club');
  [5, 6, 7, 8].forEach(i => delete l.bond.k[ids[i]]); l.bond.at = c.myClub;
}

// ------------------------------------------------------------------ 3) título
section('Título con el club');
{
  const me = C.myClub(c), n0 = (c.msgN | 0);
  delete c.life.bond.k[me.id];
  c.trophies.push({ season: c.season, kind: 'ascenso', name: 'Ascenso', club: me.name });
  Lf.hook(c, 'season'); ok(!Lf.bondOf(c, me.id), 'el ascenso solo no da cariño');
  c.trophies.push({ season: c.season, kind: 'copa', name: 'Open', club: me.name });
  c.trophies.push({ season: c.season, kind: 'liga', name: 'Liga', club: me.name });
  Lf.hook(c, 'season'); Lf.hook(c, 'season');
  const b = Lf.bondOf(c, me.id);
  ok(b && b.v === Lf.BOND_D.title && b.last === 'title' && b.t === 1, 'liga y copa la misma temporada: +30 una sola vez (' + (b && b.v) + ')');
  ok(msgs(c, n0).filter(m => m.k === 'fans' && /no lo olvidará$/.test(m.t)).length === 1, 'un mensaje «… no lo olvidará» por temporada');
  delete c.life.bond.k[me.id];
}

// ------------------------------------------------------------------ 4) derbi de eliminatoria y 5) roja en su casa (playa)
section('Derbi de eliminatoria y roja en su casa (playa)');
{
  const l = c.life, n0 = (c.msgN | 0); l.bond.k = {};
  const rv = otherClub(c, k => k.id !== c.myClub);
  l.rival = l.rival || { name: 'Rival Inventado', num: 9, club: rv.id, off: 2, w: 0, l: 0, since: c.season };
  l.rival.club = rv.id;
  const sum = (o) => Object.assign({ season: c.season, phase: 'league', label: 'X', rival: rv.id, rivalName: rv.name, win: true, sets: [2, 0], setScores: [[21, 15], [21, 17]], sim: true, nota: 6.5, me: {} }, o);
  Lf.hook(c, 'match', sum({}), { kind: 'league', week: 1 });
  ok(!Lf.bondOf(c, rv.id), 'en liga no hay derbi');
  Lf.hook(c, 'match', sum({ phase: 'cup', win: false }), { kind: 'cup', round: 0 });
  ok(!Lf.bondOf(c, rv.id), 'perder la eliminatoria no deja rencor');
  l.rival.club = rv.id;
  Lf.hook(c, 'match', sum({ phase: 'cup' }), { kind: 'cup', round: 0 });
  const b = Lf.bondOf(c, rv.id);
  ok(b && b.v === Lf.BOND_D.derbi && b.last === 'derbi', 'eliminar al club de tu rival personal en la copa: −30');
  ok(msgs(c, n0).some(m => m.t === 'Derbi para el recuerdo' && txtOk(m.x)), 'mensaje «Derbi para el recuerdo»');
  delete l.bond.k[rv.id];
  const amb = (home) => ({ cards: [{ team: 0, color: 'red', mine: true, who: 'player' }], myY: 0, myR: 1, home: home, tags: [], heat: 0.5 });
  Lf.hook(c, 'match', sum({ sim: false, win: false, amb: amb(0) }), { kind: 'league', week: 2 });
  ok(!Lf.bondOf(c, rv.id), 'roja en tu casa: no cuenta');
  Lf.hook(c, 'match', sum({ sim: false, win: false, amb: amb(1) }), { kind: 'league', week: 3 });
  const br = Lf.bondOf(c, rv.id);
  ok(br && br.v === Lf.BOND_D.roja && br.last === 'roja' && br.t === 0, 'roja en su casa: −20');
  ok(c.inbox.some(m => /se acordará de ti$/.test(m.t) && txtOk(m.x)), 'mensaje «… se acordará de ti»');
  Lf.hook(c, 'match', sum({ bench: true, phase: 'cup', amb: amb(1) }), { kind: 'cup', round: 1 });
  ok(Lf.bondOf(c, rv.id).v === Lf.BOND_D.roja, 'en el banquillo no cambia nada');
  delete l.bond.k[rv.id];
}

// ------------------------------------------------------------------ 6) verano y tope
section('Verano y tope de clubes');
{
  const l = c.life, ids = c.clubs.map(k => k.id).filter(id => id !== c.myClub);
  l.bond.k = {};
  l.bond.k[ids[0]] = { v: -40, why: ['early'], s: c.season - 3, said: 0 };
  l.bond.k[ids[1]] = { v: 9, why: ['fin'], s: c.season - 3, said: 0 };
  l.bond.k[ids[2]] = { v: -40, why: ['early'], s: c.season - 1, said: 0 };
  Lf._bondDecay(c);
  ok(l.bond.k[ids[0]] && l.bond.k[ids[0]].v === -30, 'verano: ×0,75 (−40 → −30)');
  ok(!l.bond.k[ids[1]], 'verano: por debajo de 8 se olvida');
  ok(l.bond.k[ids[2]].v === -40, 'lo de la temporada pasada aún no se enfría');
  l.bond.k = {};
  for (let i = 0; i < 35 && i < ids.length; i++) Lf._bondAdd(c, ids[i], -(10 + i), 'roja');
  ok(Object.keys(l.bond.k).length === Lf.BOND_MAX && l.bond.k[ids[34]] && !l.bond.k[ids[0]], 'tope de ' + Lf.BOND_MAX + ' clubes: se olvidan los de relación más floja');
  l.bond.k = {};
}

// ------------------------------------------------------------------ 7) ofertas (playa)
section('Ofertas (playa)');
{
  ok(seasonOff(c), 'temporada cerrada para las ofertas');
  C.KEYS.forEach(k => { c.player.st[k] = 78; });
  const base = C._genOffers(c, false).filter(o => !o.trial);
  ok(base.length > 0, 'hay ofertas de referencia (' + base.length + ')');
  if (base.length) {
    const o0 = base[0], id = o0.club;
    Lf._bondAdd(c, id, -60, 'early');
    const g2 = C._genOffers(c, false), o2 = g2.filter(o => o.club === id && !o.trial)[0];
    ok(o2, 'con mucho rencor (t −2) el club SIGUE ofreciendo fichar');
    if (o2) {
      const rl0 = C.ROLE_LV.indexOf(o0.role), rl2 = C.ROLE_LV.indexOf(o2.role);
      ok(o2.bond === -2 && o2.bondK === Lf.BOND_PAY[0] && o2.interest === o0.interest, 'oferta marcada (bond −2, sueldo × ' + Lf.BOND_PAY[0] + ') y el interés no baja');
      ok(rl2 === Math.max(0, rl0 - 1) && (!!o2.bondRole) === (rl0 > 0), 'un rol por debajo (' + o0.role + ' → ' + o2.role + ')');
      ok(o2.salary < C._salaryOf(o2.lvl, o2.q, rl2), 'sueldo peor que el normal de ese rol (' + o2.salary + ' < ' + C._salaryOf(o2.lvl, o2.q, rl2) + ')');
      const line = Lf.bondLine(c, o2);
      ok(txtOk(line) && /^No olvidan que te fuiste con contrato en vigor\. Te ofrecen un 30 % menos de sueldo/.test(line), 'texto de la ficha: «' + line + '»');
    }
    c.life.bond.k = {};
    Lf._bondAdd(c, id, -30, 'roja');
    const o1 = C._genOffers(c, false).filter(o => o.club === id && !o.trial)[0];
    ok(o1 && o1.bond === -1 && o1.role === o0.role && !o1.bondRole && o1.interest === o0.interest, 'rencor (t −1): mismo rol e interés, sueldo × ' + Lf.BOND_PAY[1]);
    c.life.bond.k = {};
    Lf._bondAdd(c, id, 60, 'title');
    const o3 = C._genOffers(c, false).filter(o => o.club === id && !o.trial)[0];
    ok(o3 && o3.bond === 2 && Math.abs(o3.interest - (o0.interest + 3.6)) < 0.05 && !o3.bondK, 'cariño (t 2): +3,6 de interés y sueldo normal');
    ok(/^Aquí te recuerdan: ganaste un título aquí\. Te quieren más\.$/.test(Lf.bondLine(c, o3)), 'texto del cariño');
    // negociar no quita el descuento del rencor
    c.life.bond.k = {}; Lf._bondAdd(c, id, -30, 'roja');
    c.offers = C._genOffers(c, false); c.window = 'end';
    const ni = c.offers.findIndex(o => o.club === id && !o.trial);
    if (ni >= 0 && C.ROLE_LV.indexOf(c.offers[ni].role) < 2) {
      c.offers[ni].interest = 50; C.negotiate(ni); const on = C.get().offers[ni];
      ok(on.salary === Math.round(C._salaryOf(on.lvl, on.q, C.ROLE_LV.indexOf(on.role)) * on.bondK / 50) * 50, 'negociar mantiene el sueldo del rencor (' + on.salary + ')');
    }
    // career-ui en node: la carta pinta la etiqueta y, en la ficha completa, el motivo
    const fakeEl = () => ({ style: {}, hidden: true, setAttribute() { }, getAttribute() { return null; }, appendChild() { }, addEventListener() { }, querySelector() { return null; }, querySelectorAll() { return []; }, classList: { add() { }, remove() { }, toggle() { }, contains() { return false; } } });
    const doc = { readyState: 'complete', getElementById: () => null, createElement: fakeEl, head: fakeEl(), body: fakeEl(), addEventListener() { } };
    const ux = { console, Math, Date, JSON, VB, document: doc, setTimeout: () => 0, clearTimeout() { }, requestAnimationFrame: () => 0, performance: { now: () => 0 }, addEventListener() { } };
    ux.globalThis = ux; ux.window = ux; vm.createContext(ux);
    let le = '';
    for (const f of ['js/career-world-ui.js', 'js/career-ui.js']) { try { vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ux, { filename: f }); } catch (e) { le += f + ': ' + e.message; } }
    ok(!le && VB.CareerUI && VB.CareerUI._offerCard, 'career-ui se carga en node' + (le ? ' — ' + le : ''));
    if (VB.CareerUI && VB.CareerUI._offerCard) {
      const cc = C.get(), oi = cc.offers.findIndex(o => o.club === id && !o.trial);
      const hl = VB.CareerUI._offerCard(cc, cc.offers[oi], oi, false), hf = VB.CareerUI._offerCard(cc, cc.offers[oi], oi, true);
      ok(/<span class="tag r">Te guardan rencor<\/span>/.test(hl) && !/No olvidan/.test(hl), 'lista: etiqueta «Te guardan rencor»');
      ok(/No olvidan que te expulsaron en su casa/.test(hf), 'ficha completa: el motivo');
      cc.life.bond.k = {}; Lf._bondAdd(cc, id, 40, 'fin'); cc.offers[oi].bond = 1;
      ok(/<span class="tag g">Te tienen cariño<\/span>/.test(VB.CareerUI._offerCard(cc, cc.offers[oi], oi, false)), 'lista: etiqueta «Te tienen cariño»');
      // Liga › Clubes: ficha del club
      const W = VB.CareerWorldUI; W.act('cw-club', { getAttribute: () => String(id) });
      const HL = { esc: x => String(x == null ? '' : x).replace(/[&<>"']/g, ch => '&#' + ch.charCodeAt(0) + ';'), sp: a => a.filter(Boolean).map(x => typeof x === 'object' ? x.h : x).join(' · ') };
      const card = W.clubsHTML(cc, C.club(cc, id).lvl, HL, '');
      ok(/Te tienen cariño/.test(card) && /Por qué: cumpliste tu contrato \(T\d+\)/.test(card), 'Liga › Clubes: etiqueta y «Por qué: … (Tn)» en la ficha');
      ok(VB.CareerWorld.clubCard(cc, id).bond.t === 1, 'clubCard lleva bond (solo lectura)');
      W.act('cw-list');
    }
    c = C.get(); c.life.bond.k = {}; C.stay(1); c = C.get();
  }
}

// ------------------------------------------------------------------ 8) ambCtx y 9) aviso del próximo partido
section('Grada (ambCtx) y aviso del próximo partido');
{
  const n = C.next(c);
  ok(n && n.rival, 'hay próximo partido');
  if (n && n.rival) {
    const away = Object.assign({}, n, { atHome: false });
    const a0 = C.ambCtx(c, away, null);
    ok(a0 && a0.bond === 0, 'sin relación: bond 0');
    Lf._bondAdd(c, n.rival.id, -60, 'early');
    const a1 = C.ambCtx(c, away, null);
    ok(a1 && a1.bond === -2 && Math.abs(a1.heat - Math.min(1, a0.heat + 0.2)) < 0.011, 'rencor en su casa: bond −2 y +0,2 de calor (' + a0.heat + ' → ' + a1.heat + ')');
    const h0 = C.ambCtx(c, Object.assign({}, n, { atHome: true }), null);
    ok(h0 && h0.bond === -2, 'en tu casa también llega bond (su afición visitante)');
    VB.ctx = { settings: { ambient: 'off' } };   // «Ambiente de Carrera» apagado: los mensajes siguen
    const n0 = (c.msgN | 0);
    Lf._bondWeek(c); Lf._bondWeek(c);
    const w = msgs(c, n0);
    ok(w.length === 1 && txtOk(w[0].t) && txtOk(w[0].x) && /No olvidan que te fuiste con contrato en vigor|no te ha perdonado/.test(w[0].x), 'aviso del próximo partido: uno por temporada y club, también con el ambiente apagado (' + (w[0] && w[0].t + ' / ' + w[0].x) + ')');
    delete VB.ctx;
    c.life.bond.k = {}; Lf._bondAdd(c, n.rival.id, 50, 'fin');
    const n1 = (c.msgN | 0); Lf._bondWeek(c);
    ok(msgs(c, n1).some(m => m.t === 'Vuelta a casa' && txtOk(m.x)), 'cariño: «Vuelta a casa»');
    c.life.bond.k = {};
  }
}

// ------------------------------------------------------------------ pista: derbi de ciudad, ofertas y ambCtx
section('Pista');
{
  C.setMode('hall');
  let h = C.create({ mode: 'hall', name: 'Nerea Prueba', num: 8, pos: 'OH', seed: 9100, autoClub: true });
  ok(h && h.myClub >= 0 && h.life.bond.at === h.myClub, 'carrera de pista con bond');
  const me = C.myClub(h), rv = h.clubs.filter(k => k.id !== me.id && k.lid === me.lid)[0], city0 = rv.city;
  const sum = (o) => Object.assign({ mode: 'hall', season: h.season, phase: 'ko', label: 'X', rival: rv.id, rivalName: rv.name, win: true, sets: [3, 0], setScores: [[25, 20], [25, 20], [25, 20]], sim: true, nota: 6.5, me: {} }, o);
  rv.city = me.city + ' Norte';
  Lf.hook(h, 'match', sum({}), { kind: 'ko', round: 0 });
  ok(!Lf.bondOf(h, rv.id), 'eliminatoria contra un club de otra ciudad: sin rencor');
  rv.city = me.city;
  Lf.hook(h, 'match', sum({}), { kind: 'ko', round: 0 });
  ok(Lf.bondOf(h, rv.id) && Lf.bondOf(h, rv.id).v === Lf.BOND_D.derbi, 'derbi de ciudad en eliminatoria ganado: −30');
  rv.city = city0; h.life.bond.k = {};
  ok(seasonOff(h), 'temporada de pista cerrada');
  C.KEYS.forEach(k => { h.player.st[k] = 85; });
  const base = C._genOffers(h, false).filter(o => !o.trial);
  ok(base.length > 0, 'ofertas de pista de referencia (' + base.length + ')');
  if (base.length) {
    const o0 = base[0];
    Lf._bondAdd(h, o0.club, -70, 'early');
    const o2 = C._genOffers(h, false).filter(o => o.club === o0.club && !o.trial)[0];
    ok(o2 && o2.bond === -2 && o2.interest === o0.interest && o2.bondK === Lf.BOND_PAY[0] && C.ROLE_LV.indexOf(o2.role) === Math.max(0, C.ROLE_LV.indexOf(o0.role) - 1), 'pista: con mucho rencor sigue la oferta, con peor rol y sueldo');
    h.life.bond.k = {}; Lf._bondAdd(h, o0.club, 30, 'fin');
    const o3 = C._genOffers(h, false).filter(o => o.club === o0.club && !o.trial)[0];
    ok(o3 && o3.bond === 1 && Math.abs(o3.interest - (o0.interest + 1.8)) < 0.05, 'pista: cariño (+1,8 de interés)');
    h.life.bond.k = {};
  }
  C.setMode('beach');
}

// ------------------------------------------------------------------ 10) guardado antiguo y 11) determinismo
section('Guardado antiguo y determinismo');
{
  c = C.get(); delete c.life.bond;
  Lf.ensure(c);
  ok(c.life.bond && c.life.bond.at === c.myClub && Object.keys(c.life.bond.k).length === 0, 'guardado sin bond: se crea en el club de ahora, sin relaciones');
  const j0 = JSON.stringify(c.life.bond); Lf.ensure(c); ok(JSON.stringify(c.life.bond) === j0, 'ensure es idempotente');
  Lf._bondAdd(c, otherClub(c).id, -30, 'roja'); C.save(c);
  const saved = JSON.parse(E.mem['make-the-cut.career']); C._reset();
  const c2 = C.get();
  ok(saved.life && saved.life.bond && JSON.stringify(c2.life.bond) === JSON.stringify(c.life.bond), 'se guarda y se carga igual (saneDeep lo conserva)');
  const run = () => {
    const X = load(), K = X.VB.Career; K.setMode('beach');
    const cx = K.create({ name: 'Det Prueba', num: 5, role: 'atk', seed: 777, autoClub: true });
    for (let s = 0; s < 2; s++) {
      let g = 0; while (cx.phase !== 'off' && g++ < 60) K.simulateNext(cx);
      const i = (cx.offers || []).findIndex(o => !o.trial);
      if (i >= 0) K.acceptOffer(i, 1); else K.stay(1);
    }
    const cc = K.get(); return JSON.stringify(cc.life.bond) + '|' + JSON.stringify(cc.offers) + '|' + cc.myClub;
  };
  const r1 = run(), r2 = run();
  ok(r1 === r2, 'misma semilla y mismas elecciones → mismo c.life.bond (' + r1.split('|')[0].slice(0, 120) + ')');
  const src = fs.readFileSync(path.join(ROOT, 'js/career-life.js'), 'utf8'), a = src.indexOf('relación con los clubes: rencor y cariño'), b = src.indexOf('function bondWeek');
  ok(a > 0 && b > a && !/Math\.random/.test(src.slice(a, b + 1200)), 'el bloque del rencor no usa Math.random');
}
ok(!E.errs.length, 'sin errores tragados en los ganchos' + (E.errs.length ? ': ' + E.errs.slice(0, 3).join(' | ') : ''));

console.log('\n' + passes + ' comprobaciones bien');
console.log(fails ? fails + ' FALLOS' : 'TODO OK');
process.exit(fails ? 1 : 0);
