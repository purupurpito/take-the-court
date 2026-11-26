#!/usr/bin/env node
/* TAKE THE COURT — tools/ambientetest.js (owner: ui_main / carrera; paquete P1 del «Ambiente de Carrera», notes/ambiente.md)
 * Prueba headless del director del ambiente (js/ambiente.js, VB.Ambiente) y de su enganche en career.js (ingest / unpoint / matchDone),
 * con partidos reales de la sim jugados por los bots de tools/simtest.js como partidos de Carrera. No abre Chrome.
 *   1) Banco de frases: comodines resueltos, longitud ≤ 64, sin palabras prohibidas (insultos, palabrotas, violencia), sin «o/a» ni «@»,
 *      ordinales «1r/2º/3r», al menos 6 variantes en los disparadores principales.
 *   2) Determinismo: misma semilla + mismas elecciones → mismos eventos amb:*.
 *   3) Pureza: con el director encendido pero la sim sin `amb` (sus 3 puertas cerradas) la partida es IDÉNTICA (estado y llamadas a g.rng)
 *      a la de sin ambiente; con el ajuste «Apagado» no hay director.
 *   4) Nada empieza después del silbato de saque (salvo una tarjeta pendiente si la sim no tiene Sim.holdFor) ni durante el avance rápido.
 *   5) Sin frase repetida entre las 12 últimas; «Tranquilo» sin elección y con menos frases.
 *   6) Frecuencias (§2C) con la sim de verdad y sus puertas (holdFor / penalty): jugador que siempre «Deja» y que siempre protesta.
 *   7) Castigo: la roja forzada da un punto de castigo de verdad (marcador +1 al rival, sin estadística de jugador).
 * Uso: node tools/ambientetest.js [partidos por política = 12]   AMBTEST_V=1 detalle. Sale con 1 si algo falla.
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
const NM = Math.max(4, +(process.argv[2] || 12));

function load(o) {
  o = o || {};
  const mem = {};
  const ls = { getItem: k => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: k => { delete mem[k]; } };
  const ctx = { console, Math, Date, JSON, Set, localStorage: ls, process: { env: {} } }; ctx.globalThis = ctx; ctx.window = ctx;
  vm.createContext(ctx);
  const files = ['js/sim.js', 'js/ai.js', 'js/ai6.js', 'js/prog.js', 'js/badges.js', 'js/leagues.js', 'js/rating.js', 'js/consignas.js']
    .concat(o.noArb ? [] : ['js/arbitro.js'], o.noAmb ? [] : ['js/ambiente.js'], ['js/career.js'], o.life ? ['js/career-life.js', 'js/career-world.js', 'js/recap.js'] : []);
  for (const f of files) { if (fs.existsSync(path.join(ROOT, f))) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f }); }
  const VB = ctx.VB, S = VB.Sim, C = VB.C, DT = 1 / C.SIM_HZ;
  let bots = null;
  try {
    const src = fs.readFileSync(path.join(ROOT, 'tools', 'simtest.js'), 'utf8'), a = src.indexOf('const BOTS = {'), b = src.indexOf('function topWhy(');
    if (a > 0 && b > a) bots = vm.runInContext('(function (S, C, DT, VB) {' + src.slice(a, b) + '; return { BOTS: BOTS, makeBot: makeBot }; })', ctx)(S, C, DT, VB);
  } catch (e) { bots = null; }
  return { VB, S, DT, bots };
}

let fails = 0, passes = 0;
const V = !!process.env.AMBTEST_V;
function ok(c, msg) { if (!c) { fails++; console.log('  FALLO: ' + msg); } else { passes++; if (V) console.log('  ok: ' + msg); } }
function section(t) { console.log('\n== ' + t); }

const E = load(), VB = E.VB, A = VB.Ambiente;
ok(A && typeof A.create === 'function' && typeof A.frame === 'function', 'VB.Ambiente cargado');
console.log('  árbitro: ' + (VB.Arbitro ? 'js/arbitro.js (P3)' : 'interno (ARB_LOCAL)') + ' · puertas de la sim: ' + (E.S.holdFor && E.S.penalty ? 'sí' : 'no'));

// ------------------------------------------------------------------ 1) banco de frases
section('Banco de frases');
{
  const BAD = /\b(idiota|imb[eé]cil|tont[oa]s?|est[uú]pid|gilipoll|mierda|joder|co[nñ]o|puta|put[oa]|hostia|cabr[oó]n|capull|subnormal|inútil|matar|mat[oa]|muert|pegar|peg[ao]|golpe[as]? a|pelea|pu[nñ]etazo|odio|asco|basura|payas|maldit|imbécil)\b/i;
  const VARS = { me: 'Ares Belmonte', mate: 'Iker Sanz', club: 'Rocaverde', rivalClub: 'Sorrasal', home: 'Rocaverde', away: 'Sorrasal', city: 'Rocaverde', venue: 'Cala Rocaverde', n: 4, set: 2, name: 'Noa Vidal', rival: 'Kai Morell', liga: 'Partido de liga: ', score: '3-1', d: 'Amonestación', benef: 'Sorrasal', who: 'Iker' };
  const st = A.create({ seed: 1, amb: { short: ['Rocaverde', 'Sorrasal'], city: 'Rocaverde', venue: 'Cala Rocaverde', home: 0 }, me: { name: VARS.me }, mate: { name: VARS.mate }, rivalP: { name: VARS.rival } });
  let n = 0, bad = [], few = [];
  // (megafonía, árbitro y previa son cortos a propósito: el 1r casi no habla; los principales piden al menos 3 variantes)
  const MAIN = ['pre', 'streakUs', 'streakThem', 'myErr', 'myKill', 'theirBlock', 'protest', 'endWin', 'endLoss', 'dropWrong', 'faro'];
  for (const t in A.BANK) {
    ok(t in A.TRIG, 'disparador ' + t + ' con prioridad en TRIG');
    for (const w in A.BANK[t]) {
      const L = A.BANK[t][w].split('|');
      if (MAIN.indexOf(t) >= 0 && L.length < 3) few.push(t + '/' + w + ' (' + L.length + ')');
      if (L.length < 2) few.push(t + '/' + w + ' (' + L.length + ')');
      for (const s of L) {
        n++;
        const f = A._fill(st, s, VARS);
        if (/[{}]/.test(f)) bad.push('comodín: ' + s);
        if (f.length > 64) bad.push('larga (' + f.length + '): ' + f);
        if (BAD.test(s)) bad.push('palabra: ' + s);
        if (/o\/a|@|\bos\/as\b/.test(s)) bad.push('género: ' + s);
        if (/\b1\.?er\b|\b3\.?er\b|\b1ª\b/.test(s)) bad.push('ordinal: ' + s);
        if (/[¡¿]\s*$/.test(s) || !s.trim()) bad.push('vacía: ' + s);
        if (/[·★✓]|Lo siento|bienvenida|[Tt]arjeta|[Bb]ola de/.test(s)) bad.push('texto fuera de guía: ' + s);
        if (w === 'speaker' && (s.match(/!/g) || []).length > 1) bad.push('megafonía con más de una exclamación: ' + s);
      }
    }
  }
  ok(!bad.length, 'filtro de textos (' + n + ' frases)' + (bad.length ? ': ' + bad.slice(0, 6).join(' | ') : ''));
  ok(!few.length, 'al menos 3 variantes en los disparadores principales y 2 en todos' + (few.length ? ': ' + few.join(', ') : ''));
  ok(n >= 250, 'unas 250 frases o más (' + n + ')');
  console.log('  ' + n + ' frases en ' + Object.keys(A.BANK).length + ' disparadores');
}

// ------------------------------------------------------------------ 1b) rencor y cariño del club rival (amb.bond, career-life bond)
section('Rencor y cariño (amb.bond)');
{
  const run = (amb, pt) => {
    const st = A.create({ seed: 9, hall: false, amb: Object.assign({ short: ['Rocaverde', 'Sorrasal'], city: 'Rocaverde', venue: 'Cala Rocaverde', heat: 0.5, tags: [] }, amb), me: { name: 'Ares Belmonte' }, mate: { name: 'Iker Sanz' } });
    const g = { time: 0, teams: [[{ id: 0, num: 7, team: 0 }, { id: 1, num: 2, team: 0 }], [{ id: 2, num: 3, team: 1 }, { id: 3, num: 4, team: 1 }]], size: 2, score: [0, 0], setScores: [] };
    const evs = [];
    for (let i = 0; i < 300; i++) {
      g.time = i / 30;
      if (pt && i === 150) { g.score = [1, 0]; A.feed(st, { type: 'point', team: 0, how: 'kill', player: g.teams[0][0] }, g); }
      const out = []; A.frame(st, g, 1 / 30, out, {}); out.forEach(e => evs.push(e));
    }
    return evs;
  };
  const sig = a => a.map(e => e.type + (e.key ? ':' + e.key : '') + (e.k != null ? ':' + e.k : '')).join('\n');
  const g2 = run({ home: 1, bond: -2 }, true), f2 = run({ home: 1, bond: 2 }, true), h1 = run({ home: 0, bond: -1 }, true);
  ok(g2.some(e => e.type === 'amb:say' && /^welcomeGrudge\//.test(e.key)) && g2.some(e => e.type === 'amb:boo' && e.by === 1 && e.target === 'me' && e.k > 0.85), 'rencor en su casa: megafonía «welcomeGrudge» y pitada de la grada al empezar');
  ok(g2.some(e => e.type === 'amb:say' && /^preGrudge\//.test(e.key)), 'rencor: la previa es «preGrudge»');
  ok(f2.some(e => e.type === 'amb:say' && /^welcomeFond\//.test(e.key)) && f2.some(e => e.type === 'amb:roar' && e.team === 1), 'cariño en su casa: «welcomeFond» y aplauso de su grada');
  ok(f2.some(e => e.type === 'amb:say' && /^preFond\//.test(e.key)) && !f2.some(e => e.type === 'amb:boo'), 'cariño: previa «preFond» y sin pitada');
  ok(h1.some(e => e.type === 'amb:say' && /^welcome\//.test(e.key)) && h1.some(e => e.type === 'amb:boo' && e.k === 0.35), 'rencor en tu casa: bienvenida de siempre y pitada suave de su afición visitante');
  ok(sig(run({ home: 1 }, true)) === sig(run({ home: 1, bond: 0 }, true)) && sig(run({ home: 0 }, true)) === sig(run({ home: 0, bond: 0 }, true)), 'sin relación (bond 0): la misma secuencia de eventos que antes, con la misma semilla');
  ok(run({ home: -1, bond: -2 }, false).some(e => e.type === 'amb:say' && /^welcomeN\//.test(e.key)), 'la final se queda con su bienvenida aunque haya rencor');
}

// ------------------------------------------------------------------ partidos con bots
const REF = { low: { p1: 0.55, p2: 0.40, p3: 0.22, d3: 0.25, chal: 0, judges: false }, mid: { p1: 0.45, p2: 0.25, p3: 0.12, d3: 0.15, chal: 0, judges: false },
  high: { p1: 0.20, p2: 0.08, p3: 0.02, d3: 0.10, chal: 0, judges: true }, top: { p1: 0.20, p2: 0.08, p3: 0.02, d3: 0.10, chal: 2, judges: true } };
const LV = ['low', 'mid', 'high', 'top'];
/** Un partido de Carrera con bots. o = { hall, seed, ambient:'full'|'calm'|'off'|undefined, gates (sim amb), pick:'drop'|'protest'|'mix',
 *  level, heat, home, force, ff (simula avance rápido a ratos) }. */
function play(Env, o) {
  const { VB, S, DT, bots } = Env, K = VB.Career, B = K.beach, Am = VB.Ambiente, hall = !!o.hall, lvl = o.level || LV[o.seed % 4];
  let opts;
  if (!hall) {
    const G = B.genSt, r = S._makeRng(o.seed * 31 + 34);
    opts = { seed: 5000 + o.seed * 7, serveClock: true, difficulty: 'easy', ctrl: 'one', ctrlIdx: 0, venue: 'beach', points: 21, present: true,
      attrs: [[G(40, 'atk', null), G(40, 'cr', null)], [G(38, 'atk', r), G(36, 'cr', r)]], ref: Object.assign({}, REF[lvl]) };
  } else opts = { format: '6v6', seed: 700 + o.seed * 13, difficulty: 'normal', ctrl: 'one', ctrlRole: 'OH', points: 15, present: true, ref: Object.assign({}, REF[lvl]),
    names: [['Ares Belmonte', 'Iker Sanz', 'Noa Vidal', 'Biel Riera', 'Leo Soler', 'Pau Mas'], ['Dani Ferrer', 'Alex Roig', 'Kai Morell', 'Joan Prats', 'Max Serra', 'Nico Pla']] };
  if (o.gates) opts.amb = true;
  const g = S.createGame(opts);
  let rn = 0; const r0 = g.rng; const w = Object.assign(function () { rn++; return r0(); }, { get: r0.get, set: r0.set }); g.rng = w;
  const gw = Object.create(g); gw.autopilot = false;
  const home = o.home != null ? o.home : o.seed % 3 === 0 ? 1 : 0, heat = o.heat != null ? o.heat : 0.3 + (o.seed % 5) * 0.12;
  gw.career = { mode: hall ? 'hall' : 'beach', trial: false, role: 'atk', pos: hall ? 'OH' : undefined, meOn: true, calls: true, ambient: o.ambient,
    player: hall ? 'Ares Belmonte' : 'Ares Belmonte', num: g.teams[0][0].num, mate: 'Iker Sanz', mateNum: 2, meName: 'Rocaverde', rivalName: 'Sorrasal', me: 'ROC', rival: 'SOR',
    ref: opts.ref, amb: { home: home, heat: heat, fans: home === 0 ? [0.55, 0.15] : [0.15, 0.55], tags: [], level: lvl, city: 'Rocaverde', venue: 'Cala Rocaverde', short: ['Rocaverde', 'Sorrasal'], capt: [0, 0], coach: ['', ''], riv: 0 } };
  const bot = bots.makeBot(bots.BOTS[o.bot || 'medio'], 77 + o.seed * 5, hall ? { six: true, role: 'OH' } : null);
  const ev = [], out = [], log = [], f = { intro: false, ff: false, bench: false, reduce: false, replay: false };
  const R = { amb: 0, says: 0, choices: 0, protests: 0, cards: [], afterWhistle: 0, afterWhistleSay: 0, ffSay: 0, repeat12: 0, pens: 0, penPts: 0, hash: '', rn: 0, R: 0, sig: [] };
  let serveOpen = false, ffOn = false, recent = [];
  for (let i = 0; i < 120 * 60 * 45 && !(g.finished && g.mode === 'over'); i++) {
    S.step(g, DT, bot(g)); ev.length = 0; S.drainEvents(g, ev);
    if (o.ff) ffOn = (Math.floor(g.time / 30) % 3) === 1;   // un tercio del tiempo, «avance rápido»
    const st = K.amb(gw);
    if (st && ffOn) st.ff = true;
    K.ingest(ev, gw);
    for (const e of ev) {
      if (e.type === 'whistle' && e.reason === 'serve') serveOpen = true;
      if (e.type === 'point') { serveOpen = false; R.R++; if (e.penalty) R.penPts++; }
    }
    const st2 = K.amb(gw);
    if (!st2 || !Am) continue;
    out.length = 0; f.ff = ffOn;
    const ctl = Am.frame(st2, gw, DT, out, f);
    if (ctl.hold > 0 && S.holdFor) S.holdFor(g, ctl.hold, ctl.lock);
    if (ctl.penalty >= 0) { R.pens++; let okP = false; if (S.canPenalty && S.penalty && S.canPenalty(g, ctl.penalty)) okP = !!S.penalty(g, ctl.penalty, { card: ctl.pcard, pid: ctl.ppid }); Am.penaltyDone(st2, okP); }
    if (Am.choiceOpen(st2)) { const p = o.pick === 'protest' ? 'protest' : o.pick === 'mix' ? ((R.choices % 2) ? 'protest' : 'drop') : 'drop'; Am.choose(st2, 0, p); }
    for (const e of out) {
      R.amb++;
      R.sig.push(e.type + (e.text ? ':' + e.text : '') + (e.color ? ':' + e.color : ''));
      if (serveOpen && e.type !== 'amb:start') { R.afterWhistle++; if (e.type === 'amb:say') R.afterWhistleSay++; }
      if (e.type === 'amb:say') {
        R.says++; if (ffOn) R.ffSay++;
        if (recent.indexOf(e.key) >= 0) R.repeat12++;
        recent.push(e.key); if (recent.length > 12) recent.shift();
      }
      if (e.type === 'amb:choice') R.choices++;
      if (e.type === 'amb:protest') R.protests++;
      if (e.type === 'amb:card') R.cards.push({ team: e.team, color: e.color, mine: !!e.mine, who: e.who, penalty: e.penalty });
    }
  }
  const m = B._M();
  R.sum = m && m.amb ? Am.sum(m.amb) : null;
  R.rn = rn; R.hash = (S.stateHash ? S.stateHash(g) : '') + '|' + g.score.join('-') + '|' + g.setScores.map(x => x.join(':')).join(',');
  R.stats = m ? JSON.stringify(m.p) : '';
  R.has = !!(m && m.amb);
  K.abortMatch();
  return R;
}

if (!E.bots) { console.log('(aviso: sin los bots de tools/simtest.js: no se juegan partidos)'); }
else {
  // ---------------------------------------------------------------- 2) determinismo
  section('Determinismo');
  for (const hall of [false, true]) {
    const a = play(E, { hall, seed: 3, ambient: 'full', gates: true, pick: 'mix', heat: 0.8 }), b = play(E, { hall, seed: 3, ambient: 'full', gates: true, pick: 'mix', heat: 0.8 });
    ok(a.sig.join('\n') === b.sig.join('\n') && a.hash === b.hash, (hall ? 'pista' : 'playa') + ': misma semilla y elecciones → mismos eventos (' + a.amb + ' amb:*, ' + a.says + ' frases)');
    ok(a.has && a.amb > 10, (hall ? 'pista' : 'playa') + ': el director funciona en un partido de Carrera');
  }

  // ---------------------------------------------------------------- 3) pureza
  section('La sim no se entera (sin las puertas, con ajuste apagado)');
  const E0 = load({ noAmb: true });
  let same = 0, offOk = 0, tot = 0;
  for (const hall of [false, true]) for (let s = 1; s <= 3; s++) {
    tot++;
    const base = play(E0, { hall, seed: s }), on = play(E, { hall, seed: s, ambient: 'full', gates: false, pick: 'protest', heat: 0.9 }), off = play(E, { hall, seed: s, ambient: 'off', gates: true });
    if (base.hash === on.hash && base.rn === on.rn && base.stats === on.stats) same++;
    else console.log('  distinta: ' + (hall ? 'pista' : 'playa') + ' #' + s + ' rng ' + base.rn + '/' + on.rn);
    if (!off.has && off.amb === 0 && off.hash === base.hash && off.rn === base.rn) offOk++;
  }
  ok(same === tot, 'director encendido con la sim sin `amb`: misma partida, mismas llamadas a g.rng y mismas estadísticas (' + same + '/' + tot + ')');
  ok(offOk === tot, '«Apagado»: sin director, partido idéntico (' + offOk + '/' + tot + ')');

  // ---------------------------------------------------------------- 4/5) silbato, avance rápido, repetición de frases, Tranquilo
  section('Silbato de saque, avance rápido, frases y «Tranquilo»');
  {
    let aw = 0, aws = 0, ffs = 0, rep = 0, says = 0, pts = 0, calmSays = 0, calmPts = 0, calmCh = 0, gatesOn = !!(E.S.holdFor && E.S.penalty);
    for (const hall of [false, true]) for (let s = 1; s <= 3; s++) {
      const a = play(E, { hall, seed: 10 + s, ambient: 'full', gates: true, pick: 'mix', heat: 0.7, ff: true });
      aw += a.afterWhistle; aws += a.afterWhistleSay; ffs += a.ffSay; rep += a.repeat12; says += a.says; pts += a.R;
      const c = play(E, { hall, seed: 10 + s, ambient: 'calm', gates: true, heat: 0.7 });
      calmSays += c.says; calmPts += c.R; calmCh += c.choices;
    }
    ok(aws === 0, 'ninguna frase empieza después del silbato de saque (' + aws + ')');
    ok(gatesOn ? aw === 0 : true, 'nada del ambiente después del silbato de saque' + (gatesOn ? '' : ' (sin Sim.holdFor: no se exige)') + ' (' + aw + ')');
    ok(ffs === 0, 'sin frases durante el avance rápido del banquillo (' + ffs + ')');
    ok(rep === 0, 'ninguna frase se repite entre las 12 últimas (' + rep + ')');
    const fr = pts / Math.max(1, says), frc = calmPts / Math.max(1, calmSays);
    console.log('  «Completo»: 1 frase cada ' + fr.toFixed(1) + ' puntos · «Tranquilo»: 1 cada ' + frc.toFixed(1) + ' puntos, ' + calmCh + ' elecciones');
    ok(fr >= 1.5 && fr <= 6, '«Completo»: entre 1 frase cada 1,5 y cada 6 puntos (' + fr.toFixed(1) + ')');
    ok(calmCh === 0, '«Tranquilo»: sin elección');
    ok(calmSays < says * 0.6, '«Tranquilo»: bastantes menos frases (' + calmSays + ' frente a ' + says + ')');
  }

  // ---------------------------------------------------------------- 6) frecuencias
  section('Frecuencias de tarjetas (' + NM + ' partidos por política; mitad playa, mitad pista)');
  {
    const res = {};
    for (const pick of ['drop', 'protest']) {
      const T = { m: 0, teamC: 0, mine: 0, teamR: 0, mineY: 0, mineR: 0, rivC: 0, rivR: 0, choices: 0, protests: 0, pens: 0, penPts: 0 };
      for (let s = 1; s <= NM; s++) {
        const a = play(E, { hall: s % 2 === 0, seed: 100 + s, ambient: 'full', gates: true, pick });
        T.m++; T.choices += a.choices; T.protests += a.protests; T.pens += a.pens; T.penPts += a.penPts;
        for (const c of a.cards) {
          const red = c.color === 'red' || c.color === 'delayR' || c.color === 'expel' || c.color === 'dq';
          if (c.team === 0) { T.teamC++; if (red) T.teamR++; if (c.mine) { T.mine++; if (red) T.mineR++; else T.mineY++; } }
          else { T.rivC++; if (red) T.rivR++; }
        }
      }
      res[pick] = T;
      const pm = x => (x / T.m).toFixed(3);
      console.log('  ' + pick + ': tu equipo ' + pm(T.teamC) + ' tarjetas/partido (rojas ' + pm(T.teamR) + '), tuyas ' + pm(T.mine) + ' (amarillas ' + pm(T.mineY) + ', rojas ' + pm(T.mineR) + ')' +
        ' · rival ' + pm(T.rivC) + ' (rojas ' + pm(T.rivR) + ') · elecciones ' + pm(T.choices) + ' · protestas ' + pm(T.protests) + ' · castigos ' + T.pens + ' pedidos, ' + T.penPts + ' pitados');
      ok(T.penPts <= T.pens, pick + ': cada punto de castigo lo pidió el director');
    }
    const d = res.drop, p = res.protest;
    ok(d.mine / d.m <= 0.05, 'dejándolo siempre, casi nunca te sacan tarjeta a ti (' + (d.mine / d.m).toFixed(3) + ' por partido)');
    ok(d.teamC / d.m <= 0.35, 'dejándolo siempre, pocas tarjetas a tu equipo (' + (d.teamC / d.m).toFixed(3) + ', objetivo ≈ 0,08)');
    ok(p.mine > d.mine, 'protestando siempre te ganas más tarjetas que dejándolo (' + p.mine + ' frente a ' + d.mine + ')');
    ok(p.choices / p.m <= 2.0001, 'como mucho 2 elecciones por partido');
    if (V) console.log('  (objetivo protestando: amarilla cada 2-3 partidos, roja cada 8-10; los calibra P3 en tools/arbitrotest.js)');
  }

  // ---------------------------------------------------------------- 7) castigo forzado
  section('Tarjeta roja forzada y punto de castigo');
  if (E.S.penalty && E.S.holdFor) {
    let got = 0, tot2 = 0;
    // escena directa: un partido con la roja forzada en la 1ª disputa (como ?debug=amb&k=red)
    const Env = E, S = Env.S, K = VB.Career;
    for (const hall of [false, true]) {
      const g = S.createGame(hall ? { format: '6v6', seed: 77, difficulty: 'normal', ctrl: 'one', ctrlRole: 'OH', points: 15, present: true, amb: true, autopilot: true }
        : { seed: 77, difficulty: 'normal', venue: 'beach', points: 21, present: true, amb: true, autopilot: true });
      const st = A.create({ seed: 77, hall, amb: { home: 0, heat: 0.6 }, me: { name: 'Ares' }, mate: { name: 'Iker' }, force: 'red', main: true });
      const ev = [], out = [], f = {};
      let pen = null, card = null, before = null;
      for (let i = 0; i < 120 * 60 * 20 && !pen; i++) {
        S.step(g, 1 / 120, null); ev.length = 0; S.drainEvents(g, ev);
        for (const e of ev) { A.feed(st, e, g); if (e.type === 'point' && e.penalty) pen = e; }
        out.length = 0;
        const ctl = A.frame(st, g, 1 / 120, out, f);
        for (const e of out) if (e.type === 'amb:card') card = e;
        if (ctl.hold > 0) S.holdFor(g, ctl.hold, ctl.lock);
        if (ctl.penalty >= 0) { before = g.score.slice(); const okP = S.canPenalty(g, ctl.penalty) && !!S.penalty(g, ctl.penalty, { card: ctl.pcard, pid: ctl.ppid }); A.penaltyDone(st, okP); if (!okP) before = null; }
      }
      tot2++;
      if (pen && card && card.color === 'red' && before && pen.team === 1 - card.team && pen.score[pen.team] === before[pen.team] + 1 && !pen.player) got++;
      else console.log('  ' + (hall ? 'pista' : 'playa') + ': card=' + (card && card.color) + ' pen=' + !!pen + ' before=' + before);
    }
    ok(got === 2, 'la roja da el punto al rival del sancionado, sin jugador (' + got + '/2)');
    void tot2;
  } else console.log('  (sin Sim.penalty en sim.js todavía: se salta)');

  // ---------------------------------------------------------------- 7b) ficha «Frenar a …» y 1r con nombre (árbitros de la Carrera)
  section('Ficha «Frenar a …» y 1r con nombre');
  {
    const S = E.S, REFX = { id: 'B1-4', name: 'Nerea Quirada Garbero', short: 'Quirada', trait: 'estricto', mem: 0 };
    // pick: 'protest' (frenar), 'drop' (dejarle) o '' (tiempo); ref: con o sin 1r designado
    const scene = (hall, pick, ref) => {
      const g = S.createGame(hall ? { format: '6v6', seed: 91, difficulty: 'normal', ctrl: 'one', ctrlRole: 'OH', points: 15, present: true, amb: true, autopilot: true,
        names: [['Ares Belmonte', 'Iker Sanz', 'Noa Vidal', 'Biel Riera', 'Leo Soler', 'Pau Mas'], ['Dani Ferrer', 'Alex Roig', 'Kai Morell', 'Joan Prats', 'Max Serra', 'Nico Pla']] }
        : { seed: 91, difficulty: 'normal', venue: 'beach', points: 21, present: true, amb: true, autopilot: true });
      const st = A.create({ seed: 91, hall, amb: { home: 0, heat: 0.6 }, me: { name: 'Ares Belmonte' }, mate: hall ? null : { name: 'Iker Sanz' }, force: 'brake', main: true, ref: ref || null });
      const ev = [], out = [], all = []; let ch = null, endT = -1;
      for (let i = 0; i < 120 * 60 * 25 && (endT < 0 || g.time < endT + 8); i++) {
        S.step(g, 1 / 120, null); ev.length = 0; S.drainEvents(g, ev);
        for (const e of ev) A.feed(st, e, g);
        out.length = 0;
        const ctl = A.frame(st, g, 1 / 120, out, {});
        for (const e of out) { all.push(e); if (e.type === 'amb:choice' && !ch) { ch = e; if (pick) A.choose(st, 0, pick); } if (e.type === 'amb:choiceEnd' && endT < 0) endT = g.time; }
        if (ctl.hold > 0) S.holdFor(g, ctl.hold, ctl.lock);
      }
      return { ch, all, sum: A.sum(st), st };
    };
    for (const hall of [false, true]) {
      const tag = hall ? 'pista' : 'playa';
      const fr = scene(hall, 'protest', REFX), dj = scene(hall, '', REFX), dr = scene(hall, 'drop', null);
      const c = fr.ch, lab = c && c.opts ? c.opts.map(o => o.k + ':' + o.label).join(' | ') : '';
      ok(c && c.kind === 'brake' && c.opts.length === 2 && c.opts[0].k === 'protest' && /^Frenar a \S+$/.test(c.opts[0].label) && c.opts[1].k === 'drop' && c.opts[1].label === 'Dejarle' && c.def === 'drop',
        tag + ': amb:choice kind «brake» con «Frenar a …» y «Dejarle» (' + lab + ')');
      ok(c && c.opts[0].label.length <= 'Frenar a '.length + 10 && !/Ares/.test(c.opts[0].label), tag + ': el compañero (nunca tú), nombre de pila de 10 letras como mucho');
      const prot = x => x.all.filter(e => e.type === 'amb:protest').length;
      ok(prot(fr) === 0 && fr.sum.brk === 1 && !fr.sum.cards.length, tag + ': frenar = sin protesta ni tarjeta y brk = 1 (' + prot(fr) + ', ' + fr.sum.brk + ')');
      ok(fr.all.some(e => e.type === 'amb:say' && e.who === 'me' && /^brakeMate\//.test(e.key)), tag + ': tú dices la frase de calma (brakeMate)');
      ok(fr.sum.ref === 'B1-4' && dr.sum.ref === '', tag + ': sum.ref con el 1r designado (y vacío sin él)');
      ok(prot(dj) >= 1 && dj.sum.brk === 0, tag + ': se acaba el tiempo = su protesta, como la automática (' + prot(dj) + ')');
      ok(prot(dr) >= 1 && dr.sum.brk === 0 && dr.sum.myProt === 0, tag + ': «Dejarle» = su protesta; no cuenta como protesta tuya');
      const rs = x => x.all.filter(e => e.type === 'amb:say' && e.who === 'ref').map(e => e.name);
      ok(rs(dj).length && rs(dj).every(n => n === '1r Quirada'), tag + ': los bocadillos del 1r designado dicen «1r Quirada» (' + rs(dj).join(', ') + ')');
      ok(rs(dr).length && rs(dr).every(n => n === '1r árbitro'), tag + ': sin 1r designado, «1r árbitro» (' + rs(dr).join(', ') + ')');
    }
    // tus protestas (ficha «Protestar») cuentan en sum.myProt
    { const g = S.createGame({ seed: 77, difficulty: 'normal', venue: 'beach', points: 21, present: true, amb: true, autopilot: true });
      const st = A.create({ seed: 77, hall: false, amb: { home: 0, heat: 0.6 }, me: { name: 'Ares' }, mate: { name: 'Iker' }, force: 'choice', main: true, ref: REFX });
      const ev = [], out = []; let done = false;
      for (let i = 0; i < 120 * 60 * 20 && !done; i++) {
        S.step(g, 1 / 120, null); ev.length = 0; S.drainEvents(g, ev); for (const e of ev) A.feed(st, e, g);
        out.length = 0; const ctl = A.frame(st, g, 1 / 120, out, {}); if (ctl.hold > 0) S.holdFor(g, ctl.hold, ctl.lock);
        for (const e of out) { if (e.type === 'amb:choice') A.choose(st, 0, 'protest'); if (e.type === 'amb:choiceEnd') done = true; }
      }
      for (let i = 0; i < 120 * 3; i++) { S.step(g, 1 / 120, null); out.length = 0; A.frame(st, g, 1 / 120, out, {}); }
      ok(A.sum(st).myProt === 1 && A.sum(st).brk === 0, 'protestar con la ficha cuenta en sum.myProt (' + A.sum(st).myProt + ')'); }
  }

  // ---------------------------------------------------------------- 8) enganche en career.js
  section('Enganche en career.js (ambCtx, matchDone → c.life.cards, c.world.riv, recap)');
  {
    const Ew = load({ life: true }), K = Ew.VB.Career, L = Ew.VB.CareerLife, W = Ew.VB.CareerWorld, Rc = Ew.VB.Recap;
    ok(typeof K.amb === 'function' && typeof K.ambCtx === 'function', 'VB.Career.amb y VB.Career.ambCtx existen');
    const c = K.create({ name: 'Ares Prueba', num: 7, role: 'cr', points: 15, seed: 4242 });
    if (c && c.phase === 'pick' && K.acceptOffer) { const i = (c.offers || []).findIndex(x => !x.trial); if (i >= 0) K.acceptOffer(i, 1); }
    const c1 = K.get(), n = c1 && K.next(c1);
    const a = n ? K.ambCtx(c1, n, { first: true }) : null;
    ok(a && (a.home === 0 || a.home === 1 || a.home === -1) && a.heat > 0 && a.heat <= 1 && a.fans.length === 2 && a.short[0] && a.level, 'ambCtx de la playa: local, calor, reparto, nombres y nivel (' + JSON.stringify(a && { home: a.home, heat: a.heat, tags: a.tags, level: a.level, short: a.short }) + ')');
    ok(a && a.tags.indexOf('estreno') >= 0, 'ambCtx: estreno en la 1ª jornada');
    // tarjeta roja tuya en un partido: c.life.cards, fama y bandeja; rivalidad del rival
    const fame0 = c1.life ? c1.life.fame : 0, inbox0 = (c1.inbox || []).length;
    const sum = { season: c1.season, phase: 'league', label: 'Jornada 1', rival: n.rival.id, rivalName: n.rival.name, win: false, sets: [1, 2], setScores: [[21, 19], [19, 21], [13, 15]], sim: false, nota: 6, me: {},
      amb: { cards: [{ team: 0, pid: 0, color: 'red', mine: true, who: 'player', penalty: true }, { team: 1, pid: 3, color: 'yellow', who: 'player' }], myY: 0, myR: 1, tags: ['derbi'], heat: 0.7, fair: false } };
    L.hook(c1, 'match', sum, { kind: 'league', week: 0 }); W.hook(c1, 'match', sum, { kind: 'league', week: 0 });
    const k = c1.life.cards, r = c1.world.riv && c1.world.riv[n.rival.id];
    ok(k && k.r === 1 && k.tot.r === 1 && k.n === 1, 'c.life.cards cuenta tu roja (temporada y carrera)');
    ok((c1.inbox || []).length > inbox0 && c1.inbox.some(m => /roja|penalizaci/i.test(m.t)), 'mensaje del entrenador por la roja');
    ok(c1.life.fame <= fame0, 'la roja no suma fama');
    ok(r && r.m === 1 && r.h >= 0.3 && r.last && r.last.r === 'L', 'c.world.riv: cruce, rivalidad (derbi, apretado, roja) y último resultado (' + JSON.stringify(r) + ')');
    // revancha en el próximo cruce con ese rival (el último de la temporada, en c.notes, perdido)
    c1.notes = (c1.notes || []).concat([{ nota: 6, win: 0, sim: 0, kind: 'league', wk: 0, rival: n.rival.id, s: [1, 2] }]);
    const a2 = K.ambCtx(c1, Object.assign({}, n, { kind: 'league', week: 5 }), null);
    ok(a2 && a2.tags.indexOf('revancha') >= 0 && a2.riv > 0, 'ambCtx: revancha y rivalidad tras perder con ese rival (' + (a2 && a2.tags.join(',')) + ')');
    // tres rojas → aviso del comité (una vez)
    L.hook(c1, 'match', sum, { kind: 'league', week: 1 }); L.hook(c1, 'match', sum, { kind: 'league', week: 2 });
    ok(c1.inbox.filter(m => /comit/i.test(m.t)).length === 1, 'aviso del comité a las 3 rojas de la temporada (una vez)');
    // sin ambiente (sum.amb ausente): nada cambia en las tarjetas
    const kr = c1.life.cards.r; L.hook(c1, 'match', Object.assign({}, sum, { amb: null }), { kind: 'league', week: 3 });
    ok(c1.life.cards.r === kr, 'sin ambiente, las tarjetas no se tocan');
    // recap: derbi / revancha / cumbre y titular con roja
    const sk = Rc.stake({ career: { mode: 'hall', rivalName: 'Sorrasal', amb: { tags: ['derbi'], city: 'Rocaverde' } } });
    ok(sk && sk.k === 'derby' && /Sorrasal/.test(sk.t2), 'recap: previa con DERBI (' + (sk && sk.t1 + ' / ' + sk.t2) + ')');
    const sk2 = Rc.stake({ career: { rivalName: 'Voley Sorrasal', amb: { tags: ['revancha'] } } });
    ok(sk2 && sk2.k === 'revancha' && /ganaron ellos/.test(sk2.t2), 'recap: previa con REVANCHA (' + (sk2 && sk2.t2) + ')');
    const hd = Rc.headline({ sets: [2, 1], setScores: [[21, 19], [18, 21], [15, 12]], to: 21, career: { meName: 'Rocaverde', rivalName: 'Sorrasal', ambSum: { cards: [{ team: 1, color: 'red', who: 'player', name: 'Kai Morell' }] } }, pl: [] }, 7);
    ok(/penalizaci/i.test(hd) && /Morell/.test(hd), 'recap: titular con la roja (' + hd + ')');
  }
}

console.log('\n' + (fails ? fails + ' FALLOS' : 'TODO OK') + ' (' + passes + ' comprobaciones)');
process.exit(fails ? 1 : 0);
