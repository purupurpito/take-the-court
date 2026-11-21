#!/usr/bin/env node
/* MAKE THE CUT — tools/lifetest.js (owner: ui_main)
 * Pruebas de la «vida» de la Carrera del sprint 2-4 (js/career-life.js), en node puro (vm, sin DOM):
 *   1. Jefes del circuito (S3 C3, solo playa): deterministas, ≥ 3 estilos en los 5 circuitos, club sin el tuyo ni el del rival,
 *      bossSt (media exacta, 1-99, atributo del estilo ≥ media + 15), partido neutro idéntico al de antes, partido de jefe
 *      (m.career.boss, bossNum, bossAnim, insignias), victoria jugada (objeto por VB.Look.grant una sola vez, seguidores, bandeja,
 *      noticia), simulada (solo cara a cara), guardado antiguo, duelo con el estilo del rival, logro «Cazajefes».
 *      Pista (C3 fase 2, 21-nov-2026): jefe por liga ('h' + lid) en el club más fuerte de tu liga, en el hueco de su puesto del seis
 *      (BOSS_POS6) con su nombre y dorsal, insignias solo en ese hueco, dorsales sin repetir y el capitán del acta cuadrando.
 *   2. Química con nombre (S3 C5): niveles = chemBonus, nombres, sin avisos atrasados, aviso al subir (y otra vez tras bajar),
 *      pairSign forzada la jornada siguiente, saludo de pareja, decisiones raras (2-6 % de las jornadas, ≥ 5 entre dos, nunca en la
 *      bolsa normal), textos de pabellón y determinismo.
 *   3. Logros: ses10, sesg5 y boss3 al final de ACH (31) y ACH_INFO sin funciones.
 *   4. ¿Se nota el jefe? Partidos completos sim + ai (bot «medio» de simtest, media 55, a 21) del n.º 1 rival con bossSt +
 *      insignias del estilo frente a un rival normal de media +4, en hilos (worker_threads). Métrica de cada estilo y probabilidad
 *      de descubrirlo en DOS partidos (pares de partidos jefe frente a pares normales). Umbrales del plan (T10).
 * Uso: node tools/lifetest.js [--no-boss] [--boss-only]   BOSS_SEEDS=16 (semillas por estilo)   BOSS_OVR=55   BOSS_BOT=medio
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const ROOT = path.join(__dirname, '..');

// ====================================================================================================== hilo de partidos (parte 4)
function loadSimCtx() {
  const cx = { console, Math, Date, JSON, Set, localStorage: { getItem: () => null, setItem() {}, removeItem() {} } }; cx.globalThis = cx; cx.window = cx; vm.createContext(cx);
  for (const f of ['js/sim.js', 'js/ai.js', 'js/ai6.js', 'js/prog.js', 'js/badges.js', 'js/leagues.js', 'js/career.js', 'js/career-life.js']) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), cx, { filename: f });
  return cx.VB;
}
if (!isMainThread) {
  const VB = loadSimCtx(), S = VB.Sim, C = VB.C, DT = 1 / C.SIM_HZ, Lf = VB.CareerLife, G = VB.Career.beach.genSt;
  // makeBot y BOTS tal cual de tools/simtest.js (texto entre «const BOTS = {» y «function topWhy»), como specs/boss-exp.js
  const src = fs.readFileSync(path.join(ROOT, 'tools/simtest.js'), 'utf8');
  const a = src.indexOf('const BOTS = {'), b = src.indexOf('function topWhy');
  const { BOTS, makeBot } = new Function('S', 'C', 'DT', 'VB', 'MASTERY_MODE', src.slice(a, b) + '\nreturn { BOTS, makeBot };')(S, C, DT, VB, 0);
  const { RO, BOT, jobs } = workerData;
  const diffOf = o => o >= 80 ? 'expert' : o >= 56 ? 'hard' : o >= 38 ? 'normal' : 'easy';
  const out = [];
  for (const j of jobs) {
    const seed = j.seed, r = S._makeRng(seed * 977 + RO), me = G(RO - 2, 'atk', null), mate = G(RO, 'cr', null);
    let riv, badges = null;
    if (j.style) { riv = [Lf.bossSt(RO + Lf.BOSS_UP, j.style, r), G(RO - 1, 'cr', r)]; badges = [[null, null], [Lf.BOSS_STYLES[j.style].badges, null]]; }
    else riv = [G(RO + 1 + (j.up | 0), 'atk', r), G(RO - 1, 'cr', r)];
    const g = S.createGame({ seed: 5000 + seed, serveClock: true, difficulty: diffOf(RO), ctrl: 'one', ctrlIdx: 0, attrs: [[me, mate], riv], badges, points: 21 });
    const bf = makeBot(BOTS[BOT], seed * 13 + 1), ev = [], boss = g.teams[1][0];
    const m = { p0: 0, p1: 0, bSrv: 0, bJump: 0, bAce: 0, hAtkB: 0, bStuff: 0, bBlk: 0, bAtk: 0, bSpd: 0, bKill: 0, hits: 0, rallies: 0 };
    for (let i = 0; i < 900 * 120 && !(g.finished && g.mode === 'over'); i++) {
      S.step(g, DT, bf(g)); ev.length = 0; S.drainEvents(g, ev);
      for (const e of ev) {
        if (e.type === 'hit') {
          m.hits++;
          if (e.kind === 'serve' && e.team === 1 && e.player === boss) { m.bSrv++; if (e.shot === 'jump') m.bJump++; }
          if (e.kind === 'spike' || (e.kind === 'free' && e.shot === 'tip')) {
            if (e.team === 0) { const bl = g.pr3 && g.pr3.y < 0 ? g.teams[1][0] : g.teams[1][1]; if (bl === boss) m.hAtkB++; }   // (ai.js: bloquea el del lado del ataque)
            else if (e.player === boss && e.kind === 'spike') { m.bAtk++; m.bSpd += e.speed; }
          }
        } else if (e.type === 'block' && e.team === 1 && e.player === boss) { m.bBlk++; if (e.result === 'stuff') m.bStuff++; }
        else if (e.type === 'point') {
          m.rallies++; if (e.team === 0) m.p0++; else { m.p1++; if (e.how === 'ace' && g.server === boss) m.bAce++; if ((e.how === 'kill' || e.how === 'tip') && g.lastTeam === 1 && g.lastPlayer === boss) m.bKill++; }
        }
      }
    }
    out.push({ id: j.id, seed, m });
  }
  parentPort.postMessage(out);
  return;
}

// ====================================================================================================== hilo principal
let fails = 0, passes = 0;
function ok(c, msg) { if (!c) { fails++; console.log('  FALLO: ' + msg); } else { passes++; console.log('  ok: ' + msg); } }
function section(t) { console.log('\n== ' + t); }
const ARGS = process.argv.slice(2), NO_BOSS = ARGS.includes('--no-boss'), BOSS_ONLY = ARGS.includes('--boss-only');

function freshCtx(withLook, noWorld) {
  const mem = {};
  const fakeLS = { getItem: k => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: k => { delete mem[k]; } };
  const cx = { console, Math, Date, JSON, Set, localStorage: fakeLS }; cx.globalThis = cx; cx.window = cx; vm.createContext(cx);
  const files = ['js/sim.js', 'js/prog.js', 'js/badges.js', 'js/leagues.js', 'js/career.js', 'js/career-life.js'];
  if (withLook === 'real') files.splice(3, 0, 'js/look.js');   // (orden de index.html: badges → look)
  if (!noWorld) files.push('js/career-world.js');
  for (const f of files) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), cx, { filename: f });
  const VB = cx.VB, grants = [];
  if (withLook === true) {   // Vestuario de prueba: un objeto por estilo de jefe (desbloqueo {boss: estilo}) e inventario en memoria
    const own = {};
    VB.Look = {
      CATALOG: [{ id: 'rayasEq', slot: 'paint', venue: 'A', unlock: [{ chem: 3 }] }, { id: 'munhCanon', slot: 'wristR', venue: 'A', unlock: [{ boss: 'saque' }] }, { id: 'dedosMuro', slot: 'hands', venue: 'A', unlock: [{ boss: 'muro' }] },
        { id: 'manguitoMazo', slot: 'armL', venue: 'A', unlock: [{ boss: 'remate' }] }, { id: 'rodiPulpo', slot: 'knees', venue: 'P', unlock: [{ boss: 'defensa' }] },
        { id: 'tobiPulpo', slot: 'ankle', venue: 'Y', unlock: [{ boss: 'defensa' }] }],
      owned: id => !!own[id], grant: (id, src) => { grants.push([id, src]); if (own[id]) return false; own[id] = src; return true; },
      name: id => ({ munhCanon: 'Muñequera de cañón', dedosMuro: 'Dedos de hierro', manguitoMazo: 'Manguito del martillo', rodiPulpo: 'Rodilleras de pulpo', tobiPulpo: 'Tobillera de pulpo' })[id] || id,
      bossFit: (style, seed) => ({ style, seed })
    };
  }
  return { VB, C: VB.Career, Lf: VB.CareerLife, mem, grants };
}
function mean(st) { const v = Object.values(st); return v.reduce((a, b) => a + b, 0) / v.length; }
/** Juega (matchDone) el próximo partido con resultado win; o lo simula. */
function playNext(C, win) {
  const g = { career: { season: C.get().season }, teams: [[{}, {}], [{}, {}]], demo: false };
  return C.matchDone({ sets: win ? [2, 0] : [0, 2], setScores: win ? [[21, 15], [21, 17]] : [[15, 21], [17, 21]], win }, { kills: 10, aces: 1, blocks: 1, digs: 6, assists: 2, errors: 2 }, g);
}
/** Avanza (simulando) hasta que el próximo partido sea contra el club id. true si lo encuentra. */
function advanceTo(C, id, maxN) {
  for (let i = 0; i < (maxN || 40); i++) { const c = C.get(), n = C.next(c), want = typeof id === 'function' ? id(c) : id; if (n && n.rival && n.rival.id === want) return true; if (c.phase === 'off') C.stay(); else C.simulateNext(); }
  return false;
}

if (!BOSS_ONLY) {
  // ---------------------------------------------------------------------------------------------- 1. jefes
  section('Jefes del circuito (playa)');
  {
    const A = freshCtx(true), B = freshCtx(true);
    const mk = X => { const c = X.C.create({ name: 'Jefa Prueba', num: 7, role: 'atk', seed: 31337, autoClub: true }); return c; };
    const ca = mk(A), cb = mk(B);
    const five = (X, c) => {
      const out = [], my0 = c.myClub;
      for (let L = 0; L < 5; L++) {
        const k = X.C.clubsOf(c, L)[0]; c.myClub = k.id;   // (tu club en ese circuito, solo para la prueba)
        const b = X.Lf.ensureBoss(c); out.push(b ? { L, name: b.name, nick: b.nick, style: b.style, num: b.num, club: b.club, mine: k.id } : null);
      }
      c.myClub = my0; return out;
    };
    const fa = five(A, ca), fb = five(B, cb);
    ok(fa.every(Boolean) && JSON.stringify(fa) === JSON.stringify(fb), 'misma semilla → mismos 5 jefes (' + fa.map(b => b.name + ' «' + b.nick + '» ' + b.style + ' #' + b.num).join(', ') + ')');
    ok(new Set(fa.map(b => b.style)).size >= 3, '≥ 3 estilos distintos en los 5 circuitos (' + [...new Set(fa.map(b => b.style))].join(', ') + ')');
    ok(fa.every(b => b.club !== b.mine), 'el club del jefe nunca es el tuyo');
    ok(fa.every(b => b.num >= 1 && b.num <= 20 && b.num !== 7 && b.num !== 9 && b.num !== 13), 'dorsal 1-20 sin el tuyo, el 9 ni el 13');
    ok(fa.every(b => !/^(El|La) /.test(b.nick)), 'apodos sin artículo');
    // estilos por semilla: siempre ≥ 3 distintos
    let minSt = 9; for (let s = 1; s <= 40; s++) { const c = A.C.create({ name: 'S' + s, seed: 900 + s, autoClub: true }); const st = new Set(); for (let L = 0; L < 5; L++) st.add(A.Lf._styleAt ? A.Lf._styleAt(c, L) : five(A, c)[L].style); minSt = Math.min(minSt, st.size); }
    ok(minSt >= 3, '40 semillas: siempre ≥ 3 estilos en los 5 circuitos (mínimo ' + minSt + ')');
    // club del jefe sin el del rival
    {
      const c = A.C.create({ name: 'Rivalidad', num: 5, seed: 4242, autoClub: true }); A.C.simulateNext();
      const c2 = A.C.get(), b = A.Lf.boss(c2), rv = c2.life.rival;
      ok(b && rv && b.club !== rv.club && b.club !== c2.myClub, 'el jefe no juega en el club de tu rival ni en el tuyo');
      const ks = A.C.clubsOf(c2, A.C.myClub(c2).lvl).filter(k => k.id !== c2.myClub && k.id !== rv.club).sort((x, y) => A.C.clubOvr(y) - A.C.clubOvr(x));
      ok(b.club === ks[0].id, 'el jefe juega en el club más fuerte que queda (' + A.C.club(c2, b.club).name + ', media ' + A.C.clubOvr(A.C.club(c2, b.club)) + ')');
      rv.club = b.club; A.Lf.ensureBoss(c2); ok(b.club !== rv.club, 'si tu rival ficha por su club, el jefe se recoloca');
    }
  }
  section('bossSt: atributos de jefe');
  {
    const X = freshCtx(false), r = X.C._rng(12345);
    let okMean = true, okRange = true, okMain = true, worst = '';
    const MAIN = { saque: 'serve', muro: 'block', remate: 'spike', defensa: 'dig' };
    for (const st of X.Lf.BOSS_KEYS) for (let o = 25; o <= 88; o += 3) {
      const s = X.Lf.bossSt(o, st, r), m = mean(s);
      if (Math.abs(m - o) > 0.5) { okMean = false; worst = st + ' ' + o + ' → ' + m.toFixed(2); }
      if (Object.values(s).some(v => v < 1 || v > 99 || v !== Math.round(v))) okRange = false;
      if (s[MAIN[st]] < Math.min(99, o + 15)) { okMain = false; worst = worst || st + ' ' + o + ' ' + MAIN[st] + ' ' + s[MAIN[st]]; }
    }
    ok(okMean, 'media exacta ±0,5 (de 25 a 88, los 4 estilos)' + (okMean ? '' : ': ' + worst));
    ok(okRange, 'todo entero y en 1-99');
    ok(okMain, 'el atributo del estilo ≥ media + 15' + (okMain ? '' : ': ' + worst));
    ok(!('rompemanos' in X.Lf.BOSS_STYLES.muro.badges), 'Muro sin «rompemanos» (tiraría un dado extra de g.rng)');
    ok(X.Lf.BOSS_KEYS.every(k => X.Lf.BOSS_STYLES[k].nicks.length === 3 && X.Lf.BOSS_STYLES[k].hint.length <= 60), 'apodos (3) y pista corta por estilo');
  }
  section('Partido normal (sin jefe ni duelo): ficha idéntica a la de siempre');
  {
    const X = freshCtx(true), C = X.C;
    C.create({ name: 'Neutra', num: 4, role: 'atk', seed: 2222, autoClub: true });
    let checked = 0, same = 0, why = '';
    for (let i = 0; i < 30 && checked < 8; i++) {
      const c = C.get(), n = C.next(c); if (!n) { if (c.phase === 'off') C.stay(); else C.simulateNext(); continue; }
      const b = X.Lf.boss(c), duel = c.life.rival && c.life.rival.club === n.rival.id;
      if ((b && b.club === n.rival.id) || duel) { C.simulateNext(); continue; }
      const m = C.matchSetup(c), r = C._rng(C._hash(c.seed, 'riv', c.season, c.phase, n.week, n.round, n.rival.id)), ro = n.ovrRival;
      const cl = v => Math.max(1, Math.min(99, v));
      const rivA = C.genSt(cl(ro + 1), 'atk', r), rivB = C.genSt(cl(ro - 1), 'cr', r);
      checked++;
      if (JSON.stringify(m.attrs[1]) === JSON.stringify([rivA, rivB]) && (m.badges === null || m.badges[1] === null) && !m.career.boss && !m.career.bossAnim && m.career.bossNum == null) same++;
      else why = JSON.stringify(m.attrs[1][0]).slice(0, 80);
      C.simulateNext();
    }
    ok(checked >= 6 && same === checked, 'm.attrs[1] y m.badges[1] como antes en ' + same + ' de ' + checked + ' partidos' + (why ? ' (' + why + ')' : ''));
  }
  section('Partido de jefe, victoria jugada, simulada y guardado antiguo');
  {
    const X = freshCtx(true), C = X.C, Lf = X.Lf;
    C.create({ name: 'Cazadora Uno', num: 6, role: 'atk', seed: 5151, autoClub: true });
    C.simulateNext();
    let c = C.get(), b = Lf.boss(c);
    ok(b && c.life.boss['b' + Lf.lvlOf(c)] === b, 'tras la 1ª jornada, el jefe de tu circuito está en c.life.boss');
    ok(advanceTo(C, b.club), 'llega un partido contra el club del jefe');
    c = C.get(); const n = C.next(c), m = C.matchSetup(c), cs = m.career;
    ok(cs.boss && cs.boss.name === b.name && cs.boss.nick === b.nick && cs.boss.style === b.style && cs.boss.styleName === Lf.BOSS_STYLES[b.style].name && cs.boss.hint && Array.isArray(cs.boss.h2h) && cs.boss.h2h.length === 3,
      'm.career.boss = {name, nick, style, styleName, hint, num, h2h} (' + cs.boss.name + ' «' + cs.boss.nick + '», ' + cs.boss.styleName + ')');
    ok(cs.bossNum === b.num && cs.boss.num === b.num, 'dorsal del jefe en m.career.bossNum (' + cs.bossNum + ')');
    ok(JSON.stringify(m.badges[1][0]) === JSON.stringify(Lf.BOSS_STYLES[b.style].badges) && m.badges[1][1] === null, 'insignias del estilo en m.badges[1][0] (' + JSON.stringify(m.badges[1][0]) + ')');
    ok(Math.abs(mean(m.attrs[1][0]) - (n.ovrRival + Lf.BOSS_UP)) <= 0.5, 'media del jefe = la del rival + ' + Lf.BOSS_UP + ' (' + mean(m.attrs[1][0]).toFixed(1) + ')');
    const ba = cs.bossAnim;
    ok(ba && ba.idx === 0 && ba.num === b.num && ba.style === b.style && ba.pers === 'fuego' && ba.sig === Lf.BOSS_STYLES[b.style].celeb && ba.rage === Lf.BOSS_STYLES[b.style].rage && ba.fit && ba.fit.style === b.style,
      'm.career.bossAnim = {idx 0, num, fit (Look.bossFit), style, pers, sig, rage} (' + (ba && ba.sig + '/' + ba.rage) + ')');
    ok(cs.mateAnim && cs.mateAnim.num === c.mate.num && cs.mateAnim.pers && cs.mateAnim.sig && cs.mateAnim.rage, 'm.career.mateAnim desde el estilo del compañero («' + c.mate.style + '» → ' + JSON.stringify(cs.mateAnim) + ')');
    ok(cs.chemLv === Lf.chemLevel(c.mate.chem) && cs.chemName && cs.pairSign === 1, 'm.career.chemLv/chemName/pairSign (' + cs.chemLv + ', ' + cs.chemName + ', ' + cs.pairSign + ')');
    // victoria jugada
    const fame0 = c.life.fame, inbox0 = (c.inbox || []).length, mult = [1, 2, 4, 8, 15][Lf.lvlOf(c)];
    const s1 = playNext(C, true); c = C.get(); b = Lf.bossOf(c, b.k);
    ok(s1.life.boss && s1.life.boss.first && s1.life.boss.win && s1.life.boss.w === 1 && s1.life.boss.nick === b.nick, 'sum.life.boss = {nick, win, w, l, h2h, first} en la 1ª victoria');
    ok(b.beat === c.season || b.beat === s1.season, 'beat = temporada de la victoria (' + b.beat + ')');
    ok(c.life.bossW === 1, 'l.bossW = 1');
    ok(s1.life.boss.fans === Lf.BOSS_FANS * mult, '+' + Lf.BOSS_FANS + ' × LV_MULT seguidores (' + s1.life.boss.fans + ')');
    const msgs = c.inbox.slice(inbox0).filter(x => x.k === 'boss');
    ok(msgs.length === 1 && msgs[0].t === 'Has tumbado a ' + b.nick && msgs[0].x.indexOf(b.name) === 0 && /Premio para tu vestuario: /.test(msgs[0].x), 'bandeja «Has tumbado a …» (' + (msgs[0] && msgs[0].x) + ')');
    ok(!c.inbox.slice(inbox0).some(x => /Nuevo en tu vestuario/.test(x.t)), 'sin aviso doble del vestuario');
    const want = { saque: 'munhCanon', muro: 'dedosMuro', remate: 'manguitoMazo', defensa: 'tobiPulpo' }[b.style];
    ok(X.grants.filter(g => g[0] === want).length === 1 && X.grants.filter(g => g[0] === want)[0][1] === 'boss', 'VB.Look.grant(' + want + ', «boss») una vez (playa: la tobillera en defensa)');
    if (X.VB.CareerWorld) ok(c.world.news.some(x => x.k === 'boss' && x.c[0] === b.club && x.t.indexOf(b.name) === 0), 'noticia «' + ((c.world.news.filter(x => x.k === 'boss')[0] || {}).t || '') + '»');
    ok(Lf.bossBeaten(c)[b.style] === 1, 'bossBeaten: {' + b.style + ': 1}');
    // segunda victoria: solo cara a cara
    ok(advanceTo(C, cc => Lf.bossOf(cc, b.k) && Lf.boss(cc) === Lf.bossOf(cc, b.k) ? Lf.bossOf(cc, b.k).club : -1, 60), 'otro partido contra el jefe');
    const g0 = X.grants.length, ib1 = C.get().inbox.length;
    const s2 = playNext(C, true); c = C.get(); b = Lf.bossOf(c, b.k);
    ok(s2.life.boss && !s2.life.boss.first && b.w === 2 && X.grants.length === g0 && !c.inbox.slice(ib1).some(x => x.k === 'boss'), 'la 2ª victoria solo suma al cara a cara (' + b.w + '-' + b.l + '), sin objeto ni aviso');
    ok(c.life.bossW === 1, 'bossW sigue en 1');
    // simulada: cuenta para el cara a cara, sin recompensa (otra carrera)
    const Y = freshCtx(true); Y.C.create({ name: 'Simuladora', num: 8, seed: 6161, autoClub: true }); Y.C.simulateNext();
    let cy = Y.C.get(); const by = Y.Lf.boss(cy); advanceTo(Y.C, by.club); const wl0 = by.w + by.l; const s3 = Y.C.simulateNext(); cy = Y.C.get();
    ok(s3.life.boss && by.w + by.l === wl0 + 1 && !by.beat && cy.life.bossW === 0 && !Y.grants.length && !cy.inbox.some(x => x.k === 'boss'), 'simulado: solo cara a cara (' + by.w + '-' + by.l + '), sin objeto ni aviso');
    // derrota jugada
    advanceTo(Y.C, cc => (Y.Lf.boss(cc) || {}).club, 80); const bz2 = Y.Lf.boss(Y.C.get()), l0 = bz2.l, bt0 = bz2.beat; const s4 = playNext(Y.C, false), bz3 = Y.Lf.bossOf(Y.C.get(), bz2.k);
    ok(s4.life.boss && !s4.life.boss.win && bz3.l === l0 + 1 && bz3.beat === bt0, 'derrota jugada: suma una derrota (' + bz3.w + '-' + bz3.l + ')');
    // guardado antiguo sin l.boss
    const raw = JSON.parse(Y.mem['make-the-cut.career']); delete raw.life.boss; delete raw.life.bossW; delete raw.life.rival.style; Y.mem['make-the-cut.career'] = JSON.stringify(raw); Y.C._reset();
    cy = Y.C.get(); Y.Lf.ensure(cy);
    ok(cy.life.boss && typeof cy.life.boss === 'object' && cy.life.bossW === 0 && Y.Lf.BOSS_STYLES[cy.life.rival.style], 'guardado sin l.boss: ensure crea {} y bossW 0 (y el estilo del rival)');
    Y.C.simulateNext(); cy = Y.C.get();
    ok(Object.keys(cy.life.boss).length >= 1, 'una jornada después ya tiene su jefe');
    ok(JSON.stringify(cy.life.boss).length < 600, 'l.boss pesa poco (' + JSON.stringify(cy.life.boss).length + ' bytes)');
    // estilo dañado → se regenera igual
    const k0 = Object.keys(cy.life.boss)[0], b0 = JSON.stringify(cy.life.boss[k0]); cy.life.boss[k0].style = 'nada';
    const br = Y.Lf.ensureBoss(cy); ok(br && br.name === JSON.parse(b0).name && br.style === JSON.parse(b0).style, 'estilo dañado: el jefe se regenera igual (misma semilla)');
  }
  section('Con el Vestuario de verdad (js/look.js): objetos de jefe, química y aspecto del jefe');
  if (fs.existsSync(path.join(ROOT, 'js/look.js'))) {
    const X = freshCtx('real'), C = X.C, Lf = X.Lf, Lk = X.VB.Look;
    ok(Lk && Lk.bossItems && Lk.bossFit, 'look.js con bossItems y bossFit');
    C.create({ name: 'Vestida', num: 6, role: 'atk', seed: 7272, autoClub: true }); C.simulateNext();
    let c = C.get(); const b = Lf.boss(c), items = Lk.bossItems(b.style);
    ok(items.length >= 1 && items.every(id => !Lk.owned(id)), 'objetos del estilo ' + b.style + ' sin ganar: ' + items.join(', '));
    advanceTo(C, cc => (Lf.boss(cc) || {}).club, 60);
    const m = C.matchSetup(C.get());
    ok(m.career.bossAnim && m.career.bossAnim.fit && typeof m.career.bossAnim.fit === 'object', 'bossAnim.fit = VB.Look.bossFit(estilo, semilla)');
    const fitHas = JSON.stringify(m.career.bossAnim.fit), shown = items.filter(id => fitHas.indexOf('"' + id + '"') >= 0);
    ok(shown.length >= 1, 'el jefe sale con su objeto puesto (' + shown.join(', ') + ')');
    const s = playNext(C, true); c = C.get();
    ok(s.life.boss && s.life.boss.first && items.every(id => Lk.owned(id)), '1ª victoria jugada: todos los objetos del estilo en el inventario');
    const msg = c.inbox.filter(x => x.k === 'boss').pop();
    ok(msg && msg.x.indexOf(Lk.name(Lf.bossItem(c, b.style).id)) > 0, 'el aviso nombra el objeto de playa («' + (msg && msg.x) + '»)');
    ok(!c.inbox.some(x => /Nuevo en tu vestuario/.test(x.t) && /Jefe/.test(x.x)), 'sin aviso doble del vestuario');
    // química: el objeto con {chem: 3}
    const chemIt = Lk.CATALOG.filter(x => x.unlock.some(u => u.chem))[0];
    if (chemIt) {
      c.mate.chem = 92; Lf.chemCheck(c);
      ok(Lk.owned(chemIt.id) && c.inbox.some(x => /Nuevo en tu vestuario/.test(x.t) && /Química: Pareja de oro/.test(x.x)), 'química 92: «' + chemIt.id + '» con el motivo «Química: Pareja de oro»');
    }
  } else console.log('  (sin js/look.js)');
  section('Duelo con el estilo del rival, Cazajefes y pista');
  {
    const X = freshCtx(true), C = X.C, Lf = X.Lf;
    C.create({ name: 'Duelista', num: 11, role: 'atk', seed: 8080, autoClub: true }); C.simulateNext();
    let c = C.get(); const rv = c.life.rival;
    ok(rv && Lf.BOSS_STYLES[rv.style] && rv.style === Lf.rivalStyleOf(rv.name), 'l.rival.style por hash del nombre (' + rv.name + ': ' + rv.style + ')');
    ok(advanceTo(C, rv.club), 'llega el duelo');
    c = C.get(); const n = C.next(c), m = C.matchSetup(c);
    const b1 = {}; Object.keys(Lf.BOSS_STYLES[rv.style].badges).forEach(k => { b1[k] = 1; });
    ok(m.career.duel && m.career.rivalStyle === rv.style && JSON.stringify(m.badges[1][0]) === JSON.stringify(b1) && Math.abs(mean(m.attrs[1][0]) - (n.ovrRival + Lf.RIVAL_UP)) <= 0.5 && !m.career.boss,
      'duelo: attrs del estilo con +' + Lf.RIVAL_UP + ', insignias a nivel 1 y m.career.rivalStyle');
    ok(m.career.rivalP === rv.name && m.career.rivalNum === rv.num, 'm.career.rivalP = nombre del rival');
    // Cazajefes
    c.life.bossW = 3; const got = Lf.check(c).map(a => a.id);
    ok(got.indexOf('boss3') >= 0, 'logro «Cazajefes» con 3 jefes');
    // pista: jefe de la liga (C3 fase 2), setup sin romper (también empezando en el banquillo)
    const H = C.hall;
    if (H && H.available && H.available()) {
      const keep = X.VB.Sim.CTRL_ROLES6; X.VB.Sim.CTRL_ROLES6 = ['OH', 'S', 'OPP', 'MB'];
      let c6 = C.create({ mode: 'hall', name: 'Pista Jefe', num: 10, pos: 'OH', seed: 2024 }); C.acceptOffer(c6.offers.findIndex(o => !o.trial), 2);
      c6 = C.get(); if (!C.next(c6)) C.simulateNext();
      let m6 = null, err = '';
      try { m6 = C.matchSetup(C.get()); } catch (e) { err = e.message; }
      const n6 = C.next(C.get()), vsBoss = !!(n6 && Lf.bossFor(C.get(), n6.rival.id));
      ok(!err && (!m6 || ((vsBoss || (!m6.career.boss && !m6.career.bossAnim)) && m6.career.mateAnim === null && m6.career.chemName)), 'pista: matchSetup (jefe solo contra su club), mateAnim null y química del equipo (' + (m6 ? m6.career.chemName : err || 'banquillo') + ')');
      const cH = C.get(), meK = C.hall._myClub(cH), bH = Lf.boss(cH);
      ok(Lf.BOSS_HALL === true && Lf.bossKey(cH) === 'h' + meK.lid && bH && bH.k === 'h' + meK.lid && Lf.BOSS_STYLES[bH.style], 'pista: jefe de la liga con clave h + lid (' + Lf.bossKey(cH) + ', ' + (bH && bH.style) + ')');
      const pool = C.hall.leagueClubs(cH, meK.lid).filter(k => k.id !== cH.myClub && k.id !== (cH.life.rival ? cH.life.rival.club : -1)).sort((a, b) => b.ovr - a.ovr || a.id - b.id);
      ok(bH && pool.length && bH.club === pool[0].id, 'pista: juega en el club más fuerte de tu liga, sin el tuyo ni el del rival (' + (pool[0] && pool[0].name) + ')');
      // otra Carrera igual → el mismo jefe (determinista)
      { const Y = freshCtx(true); const keepY = Y.VB.Sim.CTRL_ROLES6; Y.VB.Sim.CTRL_ROLES6 = ['OH', 'S', 'OPP', 'MB'];
        let y6 = Y.C.create({ mode: 'hall', name: 'Pista Jefe', num: 10, pos: 'OH', seed: 2024 }); Y.C.acceptOffer(y6.offers.findIndex(o => !o.trial), 2);
        y6 = Y.C.get(); if (!Y.C.next(y6)) Y.C.simulateNext(); try { Y.C.matchSetup(Y.C.get()); } catch (e) { }
        const bY = Y.Lf.boss(Y.C.get()); ok(bY && bH && bY.name === bH.name && bY.num === bH.num && bY.style === bH.style && bY.club === bH.club, 'pista: el jefe es determinista (misma semilla, mismo jefe)'); Y.VB.Sim.CTRL_ROLES6 = keepY; }
      if (bH && advanceTo(C, bH.club, 60)) {
        const cB = C.get(), nB = C.next(cB), mB = C.matchSetup(cB);
        if (mB) {
          const R6 = C.hall.simRoles(), slot = R6.indexOf(Lf.BOSS_POS6[bH.style]), all = mB.nums[1].concat(mB.bench[1].map(x => x.num));
          ok(mB.career.boss && mB.career.boss.name === bH.name && mB.career.boss.pos === R6[slot] && mB.career.bossAnim.idx === slot, 'pista: partido de jefe con m.career.boss, su puesto (' + R6[slot] + ') y bossAnim.idx = ' + slot);
          ok(Math.abs(mean(mB.attrs[1][slot]) - Math.min(99, nB.ovrRival + Lf.BOSS_UP)) <= 0.5, 'pista: attrs de jefe con media rival +' + Lf.BOSS_UP + ' (' + mean(mB.attrs[1][slot]).toFixed(1) + ')');
          ok(mB.badges && mB.badges[1].length === 6 && mB.badges[1].every((b, i) => i === slot ? JSON.stringify(b) === JSON.stringify(Lf.BOSS_STYLES[bH.style].badges) : b === null), 'pista: insignias del estilo solo en el hueco del jefe');
          ok(mB.names[1][slot] === bH.name && mB.nums[1][slot] === bH.num && mB.career.bossNum === bH.num, 'pista: nombre y dorsal del jefe en su hueco (' + bH.num + ')');
          ok(new Set(all).size === all.length, 'pista: dorsales del rival sin repetir (seis y banquillo): ' + all.join(','));
          const capt = mB.career.acta.capt[1];
          ok(capt > 0 && all.indexOf(capt) >= 0, 'pista: el capitán del acta rival lleva un dorsal convocado (' + capt + ')');
          ok(mB.career.mode === 'hall' && mB.format === '6v6', 'pista: sigue siendo 6v6 en el pabellón');
          // victoria jugada → cara a cara y objeto de pista
          const st = { sets: [3, 0], setScores: [[25, 20], [25, 18], [25, 21]], win: true };
          let rs = null, e3 = ''; try { rs = C.matchDone(st, { kills: 6, aces: 1, blocks: 1, digs: 3, assists: 1, errors: 1 }, { career: mB.career, size: 6, demo: false }); } catch (e) { e3 = e.message; }
          const bA = Lf.bossOf(C.get(), 'h' + meK.lid);
          ok(!e3 && bA && bA.w === 1 && bA.beat > 0, 'pista: victoria jugada contra el jefe: cara a cara 1-0 y derrotado (' + (e3 || (bA && bA.w + '-' + bA.l)) + ')');
        } else console.log('  (contra el jefe, en el banquillo: sin partido jugado)');
      } else console.log('  (no llegó el partido contra el jefe en 60 jornadas)');
      const ms = C.get(); ms.meOn = false;
      let e2 = ''; try { Lf.hook(ms, 'setup', { format: '6v6', meOn: false, bench: [[{ st: { jump: 50, speed: 50 } }]], meBench: 0, career: {} }); } catch (e) { e2 = e.message; }
      ok(!e2, 'pista: setup con meOn false y banquillo no rompe');
      X.VB.Sim.CTRL_ROLES6 = keep; C.setMode('beach');
    } else console.log('  (sin ligas de pista)');
  }

  // ---------------------------------------------------------------------------------------------- 2. química
  section('Química con nombre');
  {
    const X = freshCtx(false), C = X.C, Lf = X.Lf;
    ok([0, 29, 30, 59, 60, 89, 90, 100].map(v => Lf.chemLevel(v)).join() === '0,0,1,1,2,2,3,3', 'chemLevel en 0, 29, 30, 59, 60, 89, 90 y 100 → 0,0,1,1,2,2,3,3');
    let eq = true; for (let v = 0; v <= 100; v++) if (Lf.chemLevel(v) !== C.chemBonus({ mate: { chem: v } })) eq = false;
    ok(eq, 'chemLevel(v) === chemBonus para v de 0 a 100');
    ok([0, 1, 2, 3].map(i => Lf.chemName(i, {})).join('|') === 'Conocidos|Buena sintonía|Compenetrados|Pareja de oro' && [0, 1, 2, 3].map(i => Lf.chemName(i, { mode: 'hall' })).join('|') === 'Vestuario nuevo|Buen ambiente|Bloque sólido|Equipo de oro', 'nombres de playa y de pista');
    const ci = Lf.chemInfo({ mate: { chem: 71 } }); ok(ci.lv === 2 && ci.name === 'Compenetrados' && ci.next === 'Pareja de oro' && ci.need === 19 && ci.bonus === 2 && !ci.hall, 'chemInfo 71: Compenetrados, faltan 19 para «Pareja de oro»');
    ok(Lf.chemInfo({ mate: { chem: 100 } }).next === '' && Lf.chemInfo({ mode: 'hall', chem: 65 }).name === 'Bloque sólido', 'chemInfo: máximo sin siguiente; pista 65 «Bloque sólido»');
    // guardado viejo con química 65: sin avisos atrasados
    let c = C.create({ name: 'Quimica', num: 3, role: 'atk', seed: 4747, autoClub: true });
    c.mate.chem = 65; delete c.mate.chemLv; C.save(c); C._reset(); c = C.get(); Lf.ensure(c);
    ok(c.mate.chemLv === 2, 'guardado sin chemLv con química 65 → chemLv 2 al cargar');
    Lf.chemCheck(c); ok(!c.inbox.some(x => x.k === 'chem'), 'y ningún mensaje «chem»');
    // de 55 a 60 jugando (+5)
    c.mate.chem = 55; c.mate.chemLv = 1; c.life.ev = null; c.life.chemEv = 0; C.save(c);
    const s = playNext(C, true); c = C.get();
    const cm = c.inbox.filter(x => x.k === 'chem');
    ok(c.mate.chem === 60 && cm.length === 1 && cm[0].t === 'Química: Compenetrados' && cm[0].x.indexOf(c.mate.name) === 0, 'de 55 a 60 tras matchDone → un mensaje «Química: Compenetrados»');
    ok(s.life.chemUp && s.life.chemUp.name === 'Compenetrados' && s.life.chemUp.lv === 2, 'sum.life.chemUp = {lv 2, name}');
    ok(c.life.chemEv === 2, 'l.chemEv === 2');
    C.simulateNext(); c = C.get();
    const pe = Lf.pendingEvent(c);
    ok(pe && pe.key === 'pairSign' && pe.rare && pe.title === 'Una señal vuestra' && pe.text.indexOf(c.mate.name) === 0 && c.life.chemEv === 0, 'la jornada siguiente: decisión «Una señal vuestra» (pairSign)');
    ok(pe && pe.opts[2].hint.some(h => h[0] === 'Celebración' && !h[1]) && pe.opts[0].hint.some(h => h[0] === 'Celebración' && h[1]), 'pista de efecto «Celebración» en las opciones');
    const res = Lf.answer(2); c = C.get();
    ok(c.life.sign === 0 && res.indexOf('Saludo de pareja: no') >= 0, 'opción 3 → l.sign 0 («Saludo de pareja: no»)');
    const nm = C.next(c); if (nm) ok(C.matchSetup(c).career.pairSign === 0, 'matchSetup(c).career.pairSign === 0');
    // bajar sin aviso, volver a subir con aviso
    const n0 = c.inbox.filter(x => x.k === 'chem').length;
    c.mate.chem = 50; const d1 = Lf.chemCheck(c);
    ok(d1 && !d1.up && c.mate.chemLv === 1 && c.inbox.filter(x => x.k === 'chem').length === n0, 'bajar de 60 a 50: sin mensaje (chemLv 1)');
    c.mate.chem = 60; const d2 = Lf.chemCheck(c);
    ok(d2 && d2.up && c.inbox.filter(x => x.k === 'chem').length === n0 + 1, 'volver a 60: mensaje otra vez');
    // answer que sube de nivel
    c.mate.chem = 88; c.mate.chemLv = 2; c.life.ev = { key: 'pressWin', id: 99 }; C.save(c);
    const r2 = Lf.answer(0); ok(r2.some(t => t === '¡Nivel de química: Pareja de oro!'), 'decisión que sube de nivel: «¡Nivel de química: Pareja de oro!»');
  }
  section('Decisiones raras: frecuencia, separación y determinismo');
  {
    const run = seed => {
      const X = freshCtx(false), C = X.C, Lf = X.Lf;
      C.create({ name: 'Rara', num: 3, role: 'atk', seed, autoClub: true });
      const log = []; let jn = 0, rare = 0, last = -99, minGap = 99, normalRare = 0;
      for (let i = 0; i < 2000 && jn < 600; i++) {
        let c = C.get(); if (c.phase === 'off') { C.stay(); continue; }
        if (c.mate) { c.mate.chem = 95; c.mate.chemLv = 3; } c.life.chemEv = 0; C.save(c);
        const s = C.simulateNext(); if (!s) { C.stay(); continue; }
        jn++; c = C.get(); const ev = c.life.ev;
        if (ev) { log.push(ev.key); if (Lf.EVENTS[ev.key].rare) { rare++; if (jn - last < minGap) minGap = jn - last; last = jn; if (!ev.rare) normalRare++; } }
      }
      return { jn, rare, minGap, normalRare, log };
    };
    const a = run(1111), b = run(1111);
    const p = a.rare / a.jn;
    ok(p >= 0.02 && p <= 0.06, 'química 95, ' + a.jn + ' jornadas: raras en el ' + (100 * p).toFixed(1) + ' % (2-6 %)');
    ok(a.minGap >= 5, 'nunca con menos de 5 jornadas entre dos (mínimo ' + a.minGap + ')');
    ok(a.normalRare === 0, 'la bolsa normal nunca da una clave rara');
    ok(JSON.stringify(a.log) === JSON.stringify(b.log), 'misma semilla → la misma lista de decisiones (' + a.log.length + ')');
    // la tirada normal no cambia (mismas claves normales que con química baja salvo por las raras)
    const X = freshCtx(false), Lf = X.Lf;
    ok(Object.keys(Lf.EVENTS).filter(k => Lf.EVENTS[k].rare).join() === 'pairSign,pairClash,pairTrip', 'tres decisiones raras: pairSign, pairClash y pairTrip');
    // pista: textos de pabellón
    const C = X.C, H = C.hall;
    if (H && H.available && H.available()) {
      X.VB.Sim.CTRL_ROLES6 = ['OH', 'S', 'OPP', 'MB'];
      let c6 = C.create({ mode: 'hall', name: 'Pista Quimica', num: 10, pos: 'OH', seed: 3030 }); C.acceptOffer(c6.offers.findIndex(o => !o.trial), 2); c6 = C.get();
      c6.life.ev = { key: 'pairTrip', id: 100001, rare: 1 }; let pe = Lf.pendingEvent(c6);
      ok(pe.title === 'Barbacoa del equipo' && /^El líbero/.test(pe.text) && pe.opts[0].t === 'Ir y montar un partidillo' && pe.opts[1].t === 'Ir solo a comer', 'pista: pairTrip con th/xh y opciones de pabellón');
      c6.life.ev = { key: 'speech', id: 5 }; pe = Lf.pendingEvent(c6); ok(pe && pe.title === 'Charla en el vestuario', 'pista: speech sigue igual');
      c6.life.ev = { key: 'pairSign', id: 100002, rare: 1 }; pe = Lf.pendingEvent(c6); ok(pe.title === 'Un grito de equipo' && !pe.opts.some(o => o.hint.some(h => h[0] === 'Celebración')), 'pista: pairSign «Un grito de equipo», sin «Celebración»');
      c6.chem = 65; delete c6.chemLv; Lf.ensure(c6); ok(c6.chemLv === 2 && Lf.chemInfo(c6).name === 'Bloque sólido', 'pista: chemLv del equipo al cargar y «Bloque sólido»');
      c6.chem = 92; const u6 = Lf.chemCheck(c6); ok(u6.up && c6.inbox.some(x => x.k === 'chem' && x.t === 'Química: Equipo de oro') && !c6.life.chemEv, 'pista: aviso «Química: Equipo de oro» sin pairSign');
      C.setMode('beach');
    }
  }

  // ---------------------------------------------------------------------------------------------- 3. logros
  section('Logros (ACH) y ACH_INFO');
  {
    const X = freshCtx(false), C = X.C, Lf = X.Lf;
    const info = Lf.ACH_INFO;
    ok(Array.isArray(info) && info.length === 32 && info.filter(a => a.only !== 'hall').length === 31, 'ACH_INFO con 32 logros (31 en la playa; as1k es de pista): ' + info.length);
    ok(info.slice(-3).map(a => a.id).join() === 'ses10,sesg5,boss3', 'los 3 nuevos al final: ses10, sesg5, boss3');
    ok(info.every(a => a.id && a.name && a.d && Object.values(a).every(v => typeof v !== 'function')), 'ACH_INFO sin funciones, con id, name y d');
    ok(info.filter(a => a.id === 'as1k')[0].only === 'hall' && info.filter(a => a.id === 'm50')[0].nh === 'Veterano del parqué', 'ACH_INFO conserva only y nh');
    const c = C.create({ name: 'Entrenos', num: 3, seed: 99, autoClub: true });
    c.ts = { md: [0, 2, 6, 3] }; let got = Lf.check(c).map(a => a.id);
    ok(got.indexOf('ses10') < 0 && got.indexOf('sesg5') < 0, '9 de plata u oro y 3 oros: aún nada');
    const pts0 = c.player.pts, f0 = c.life.fame; c.ts.md = [0, 2, 5, 5]; got = Lf.check(c).map(a => a.id);
    ok(got.indexOf('ses10') >= 0 && got.indexOf('sesg5') >= 0 && c.player.pts === pts0 + 1 && c.life.fame >= f0 + 40, 'ses10 (+1 punto) y sesg5 (+40 seguidores) con c.ts.md');
    delete c.ts; let e = ''; try { Lf.achList(c); } catch (x) { e = x.message; } ok(!e, 'sin c.ts (guardado antiguo) no rompe');
  }
}

// ------------------------------------------------------------------------------------------------ 4. ¿se nota el jefe?
async function bossRun() {
  section('¿Se nota el jefe? (partidos completos, bot medio, media 55, a 21; jefe frente a rival normal de media +4)');
  const NS = Math.max(4, +(process.env.BOSS_SEEDS || 16)), RO = +(process.env.BOSS_OVR || 55), BOT = process.env.BOSS_BOT || 'medio';
  const conds = [{ id: 'normal+4', up: 4 }, { id: 'saque', style: 'saque' }, { id: 'muro', style: 'muro' }, { id: 'remate', style: 'remate' }, { id: 'defensa', style: 'defensa' }];
  const jobs = []; for (const c of conds) for (let s = 1; s <= NS; s++) jobs.push({ id: c.id, style: c.style, up: c.up, seed: s });
  const NW = Math.max(1, Math.min(require('os').cpus().length - 1, 12, jobs.length)), chunks = Array.from({ length: NW }, () => []);
  jobs.forEach((j, i) => chunks[i % NW].push(j));
  const t0 = Date.now();
  const parts = await Promise.all(chunks.map(ch => new Promise((res, rej) => { const w = new Worker(__filename, { workerData: { RO, BOT, jobs: ch } }); w.on('message', res); w.on('error', rej); })));
  const R = {}; parts.flat().forEach(x => { (R[x.id] = R[x.id] || [])[x.seed - 1] = x.m; });
  console.log('  ' + jobs.length + ' partidos en ' + ((Date.now() - t0) / 1000).toFixed(0) + ' s con ' + NW + ' hilos (' + NS + ' semillas por estilo)');
  const SIG = {
    saque: { lab: 'saque en salto del n.º 1', f: m => m.bJump / Math.max(1, m.bSrv), fmt: v => (100 * v).toFixed(1) + ' %' },
    muro: { lab: 'bloqueo directo del n.º 1 por ataque tuyo a su lado', f: m => m.bStuff / Math.max(1, m.hAtkB), fmt: v => (100 * v).toFixed(1) + ' %' },
    remate: { lab: 'velocidad del remate del n.º 1', f: m => m.bSpd / Math.max(1, m.bAtk), fmt: v => v.toFixed(1) + ' m/s' },
    defensa: { lab: 'toques por punto', f: m => m.hits / Math.max(1, m.rallies), fmt: v => v.toFixed(2) }
  };
  const sumOf = L => L.reduce((o, m) => { for (const k in m) o[k] = (o[k] || 0) + m[k]; return o; }, {});
  const pair = (L, i) => { const x = L[i], y = L[(i + 1) % L.length], mm = {}; for (const k in x) mm[k] = x[k] + y[k]; return mm; };
  const auc2 = (A, B, f) => { let w = 0, n = 0; for (let i = 0; i < A.length; i++) for (let j = 0; j < B.length; j++) { const a = f(pair(A, i)), b = f(pair(B, j)); n++; if (a > b) w++; else if (a === b) w += 0.5; } return w / n; };
  const N4 = R['normal+4'], T4 = sumOf(N4), you4 = T4.p0 / (T4.p0 + T4.p1);
  const TH = { saque: 0.9, remate: 0.9, muro: 0.7, defensa: 0.8 };
  const rows = [];
  for (const st of ['saque', 'muro', 'remate', 'defensa']) {
    const A = R[st], T = sumOf(A), sg = SIG[st], vB = sg.f(T), vN = sg.f(T4), a = auc2(A, N4, sg.f), you = T.p0 / (T.p0 + T.p1);
    rows.push({ st, vB, vN, a, you });
    console.log('  ' + st.padEnd(8) + sg.lab + ': ' + sg.fmt(vB) + ' (normal+4: ' + sg.fmt(vN) + ') · lo descubres en 2 partidos: ' + (100 * a).toFixed(1) + ' % · tus puntos ' + (100 * you).toFixed(1) + ' % (normal+4: ' + (100 * you4).toFixed(1) + ' %)');
    if (st === 'muro') { const fb = m => m.bBlk / Math.max(1, m.hAtkB); console.log('          (informativo) toques de bloqueo del n.º 1 por ataque tuyo a su lado: ' + (100 * fb(T)).toFixed(1) + ' % (normal+4: ' + (100 * fb(T4)).toFixed(1) + ' %) · en 2 partidos: ' + (100 * auc2(A, N4, fb)).toFixed(1) + ' %'); }
    const extra = st === 'saque' ? vB >= 2 * vN : st === 'muro' ? vB >= 1.3 * vN : st === 'remate' ? vB >= vN + 1.5 : vB >= vN + 0.5;
    ok(a >= TH[st] && extra, st + ': descubierto en 2 partidos ≥ ' + (100 * TH[st]) + ' % (' + (100 * a).toFixed(1) + ' %) y ' + (st === 'saque' ? '≥ 2 × normal' : st === 'muro' ? '≥ 1,3 × normal' : st === 'remate' ? '≥ +1,5 m/s' : '≥ +0,5 toques') + ' (' + sg.fmt(vB) + ' frente a ' + sg.fmt(vN) + ')');
    ok(Math.abs(you - you4) <= 0.05, st + ': tus puntos a ±5 del normal+4 (' + (100 * you).toFixed(1) + ' frente a ' + (100 * you4).toFixed(1) + ')');
  }
  return rows;
}

(async () => {
  if (!NO_BOSS) { try { await bossRun(); } catch (e) { fails++; console.log('  FALLO: partidos de jefe: ' + (e && e.stack || e)); } }
  console.log('\n' + passes + ' comprobaciones bien');
  console.log(fails ? fails + ' FALLOS' : 'TODO OK');
  process.exit(fails ? 1 : 0);
})();
