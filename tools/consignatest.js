#!/usr/bin/env node
/* TAKE THE COURT — tools/consignatest.js (owner: carrera)
 * Prueba headless de las consignas del entrenador (js/consignas.js, VB.Consignas) y de su enganche en career.js (ingest, liveRating) y
 * en la nota en directo (VB.Rating.extra). No abre Chrome.
 *   Casos con eventos falsos: dirección del remate (línea / diagonal / centro), zonas del saque, cumplida / fallada / caducada,
 *   error tuyo que la anula, tope por partido, punto anulado por challenge, determinismo y ajuste apagado (g.career.calls = false).
 *   Partidos con los bots de tools/simtest.js (playa, pista receptor y pista colocador): cuántos puntos llevan consigna, qué parte se
 *   cumple jugando al azar, cuánto suma por partido (dentro del tope) y que la sim da la misma partida con y sin consignas.
 * Uso: node tools/consignatest.js     CONSIGNATEST_N=k partidos por formato (por defecto 4). Sale con 1 si algo falla.
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');

function load(withCo) {
  const mem = {};
  const ls = { getItem: k => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: k => { delete mem[k]; } };
  const ctx = { console, Math, Date, JSON, Set, localStorage: ls, process: { env: {} } }; ctx.globalThis = ctx; ctx.window = ctx;
  vm.createContext(ctx);
  const files = ['js/sim.js', 'js/ai.js', 'js/ai6.js', 'js/prog.js', 'js/badges.js', 'js/leagues.js', 'js/rating.js'].concat(withCo ? ['js/consignas.js'] : [], ['js/career.js']);
  for (const f of files) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  const VB = ctx.VB, S = VB.Sim, C = VB.C, DT = 1 / C.SIM_HZ;
  let bots = null;
  try {
    const src = fs.readFileSync(path.join(ROOT, 'tools', 'simtest.js'), 'utf8'), a = src.indexOf('const BOTS = {'), b = src.indexOf('function topWhy(');
    if (a > 0 && b > a) bots = vm.runInContext('(function (S, C, DT, VB) {' + src.slice(a, b) + '; return { BOTS: BOTS, makeBot: makeBot }; })', ctx)(S, C, DT, VB);
  } catch (e) { bots = null; }
  return { VB, S, DT, bots };
}

let fails = 0, passes = 0;
function ok(c, msg) { if (!c) { fails++; console.log('  FALLO: ' + msg); } else { passes++; if (process.env.CONSIGNATEST_V) console.log('  ok: ' + msg); } }
function section(t) { console.log('\n== ' + t); }

const E = load(true), VB = E.VB, K = VB.Consignas, R = VB.Rating;
ok(K && R && typeof R.extra === 'function', 'VB.Consignas y VB.Rating.extra cargados');

// ------------------------------------------------------------------ medidas
section('Dirección del remate y zonas del saque');
{
  const g = { cs: 1 };
  ok(K.dirOf({ y: 3.5, target: [-6, 3.8] }, 1) === 'line', 'desde el ala derecha a la misma banda: línea');
  ok(K.dirOf({ y: 3.5, target: [-6, -2.5] }, 1) === 'diag', 'desde el ala derecha a la otra banda: diagonal');
  ok(K.dirOf({ y: 3.5, target: [-6, 1.5] }, 1) === 'mid', 'desde el ala al centro: ni una ni otra');
  ok(K.dirOf({ y: 0.3, target: [-6, 3.5] }, 1) === 'diag', 'desde el centro, muy abierto: diagonal');
  ok(K.dirOf({ y: 0.3, target: [-6, 0.6] }, 1) === 'mid', 'desde el centro, recto: centro');
  ok(K.dirOf({ y: 3.1, target: [-6, 3.6] }, 8 / 9) === 'line', 'playa (×8/9): línea');
  // el rival en x < 0 mira hacia +x: su derecha es −y
  ok(K.srvZone({ target: [-7, -3] }, 1) === 1, 'saque al fondo y a la derecha del que recibe (x < 0): zona 1');
  ok(K.srvZone({ target: [-7, 3] }, 1) === 5, 'saque al fondo y a su izquierda: zona 5');
  ok(K.srvZone({ target: [7, 3] }, 1) === 1, 'del otro lado (x > 0), +y es su derecha: zona 1');
  ok(K.srvZone({ target: [-7, 0.4] }, 1) === 6, 'al fondo y al centro: zona 6');
  ok(K.srvZone({ target: [-2, 3] }, 1) === 0, 'corto: 0');
  void g;
}

// ------------------------------------------------------------------ eventos falsos
// who: el jugador es ya el número (0 tú, 1 compañero, −1 rival). Busca una semilla con la consigna pedida en el primer punto.
function withCall(o, id, srv) {
  for (let seed = 1; seed < 20000; seed++) {
    const st = K.create(Object.assign({ seed }, o));
    K.feed(st, { type: 'serveReady', team: srv === -1 ? 1 : 0, player: srv === -1 ? -1 : srv }, x => x, { size: o.hall ? 6 : 2, ctrl: { front: true }, cs: o.hall ? 1 : 8 / 9 });
    if (st.c && st.c.id === id) return st;
  }
  return null;
}
const who = x => x;
section('Cumplida, fallada, caducada');
{
  const G = { size: 2, cs: 8 / 9, teams: [[], [{ x: -5, y: 2, num: 1, idx: 0 }, { x: -5, y: -2, num: 2, idx: 1 }]] };
  let st = withCall({}, 'atkDiag', -1);
  ok(!!st, 'playa: hay semilla con «Remata la primera en diagonal» al recibir');
  K.feed(st, { type: 'hit', team: 1, kind: 'serve', player: -1 }, who, G);
  K.feed(st, { type: 'hit', team: 0, kind: 'pass', touch: 1, recv: true, player: 1 }, who, G);
  K.feed(st, { type: 'hit', team: 0, kind: 'set', touch: 2, player: 1 }, who, G);
  K.feed(st, { type: 'hit', team: 0, kind: 'spike', touch: 3, player: 0, y: 3, target: [-6, -2.5] }, who, G);
  ok(st.c.state === 'ok', 'remate tuyo en diagonal: cumplida (' + st.c.state + ')');
  let r = K.feed(st, { type: 'point', team: 0, how: 'kill' }, who, G);
  ok(r && r.ok === true, 'al llegar el punto: { ok: true }');

  st = withCall({}, 'atkDiag', -1);
  K.feed(st, { type: 'hit', team: 0, kind: 'spike', touch: 3, player: 0, y: 3, target: [-6, 3.4] }, who, G);
  r = K.feed(st, { type: 'point', team: 0, how: 'kill' }, who, G);
  ok(r && r.ok === false, 'remate por la línea con consigna de diagonal: fallada');

  st = withCall({}, 'atkDiag', -1);
  K.feed(st, { type: 'hit', team: 0, kind: 'spike', touch: 3, player: 1, y: 3, target: [-6, -3] }, who, G);
  r = K.feed(st, { type: 'point', team: 0, how: 'kill' }, who, G);
  ok(r === null && st.c.state === 'gone', 'remata tu compañero: caduca sin resultado');

  st = withCall({}, 'atkDiag', -1);
  K.feed(st, { type: 'hit', team: 0, kind: 'spike', touch: 3, player: 0, y: 3, target: [-6, -2.5] }, who, G);
  r = K.feed(st, { type: 'point', team: 1, how: 'error', reason: 'out' }, who, G);
  ok(r && r.ok === false, 'diagonal pero fuera (error tuyo): no cuenta');

  st = withCall({}, 'srvP2', 0);
  ok(!!st, 'playa: hay semilla con «Saca a por el n.º 2»');
  K.feed(st, { type: 'hit', team: 0, kind: 'serve', player: 0, shot: 'float', target: [-5.2, -2.2] }, who, G);
  ok(st.c.state === 'ok', 'saque junto al n.º 2: cumplida');
  st = withCall({}, 'srvP2', 0);
  K.feed(st, { type: 'hit', team: 0, kind: 'serve', player: 0, shot: 'float', target: [-5.2, 2.2] }, who, G);
  ok(st.c.state === 'miss', 'saque al n.º 1: fallada');

  st = withCall({}, 'blkLine', 1);
  ok(!!st, 'playa: «Bloquea la línea» cuando saca tu compañero');
  K.feed(st, { type: 'hit', team: 1, kind: 'spike', touch: 3, player: -1, y: -3, target: [5, -3.4] }, who, G);
  K.feed(st, { type: 'block', team: 0, player: 0, result: 'stuff' }, who, G);
  ok(st.c.state === 'ok', 'bloqueas un remate por la línea: cumplida');

  const H = { size: 6, cs: 1 };
  st = withCall({ hall: true, role: 'S' }, 'setMB', -1);
  ok(!!st, 'pista colocador: «Juega la primera con el central»');
  K.feed(st, { type: 'hit', team: 0, kind: 'pass', touch: 1, recv: true, player: 1 }, who, H);
  K.feed(st, { type: 'hit', team: 0, kind: 'set', touch: 2, player: 0, tempo: 'quick' }, who, H);
  K.feed(st, { type: 'hit', team: 0, kind: 'spike', touch: 3, player: { role: 'MB' } }, x => (typeof x === 'object' ? 1 : x), H);
  ok(st.c.state === 'ok', 'colocas al central y remata: cumplida');
  st = withCall({ hall: true, role: 'S' }, 'setMB', -1);
  K.feed(st, { type: 'hit', team: 0, kind: 'set', touch: 2, player: 0, tempo: 'high' }, who, H);
  K.feed(st, { type: 'hit', team: 0, kind: 'spike', touch: 3, player: { role: 'OH' } }, x => (typeof x === 'object' ? 1 : x), H);
  ok(st.c.state === 'miss', 'colocas al receptor: fallada');

  // el catálogo respeta el formato y el puesto
  let bad = 0;
  for (let seed = 1; seed < 3000; seed++) {
    const st2 = K.create({ seed, hall: true, role: 'MB' });
    K.feed(st2, { type: 'serveReady', team: 1, player: -1 }, who, { size: 6, ctrl: { front: false } });
    if (st2.c && (/^set|^srv|recv|blk|atkLine|atkDiag|atkCut/.test(st2.c.id))) bad++;
    const st3 = K.create({ seed, hall: false });
    K.feed(st3, { type: 'serveReady', team: 0, player: 0 }, who, { size: 2 });
    if (st3.c && !/^srv/.test(st3.c.id)) bad++;
    if (st3.c && /^srv[156]$/.test(st3.c.id)) bad++;
  }
  ok(bad === 0, 'consignas según formato, puesto y quién saca (' + bad + ' fuera de sitio)');
  // determinismo y frecuencia
  const seq = s => { const a = []; const x = K.create({ seed: s }); for (let i = 0; i < 200; i++) { K.feed(x, { type: 'serveReady', team: i % 2, player: i % 2 ? -1 : 0 }, who, { size: 2 }); a.push(x.c ? x.c.id : '-'); K.feed(x, { type: 'point', team: 0 }, who, {}); } return a.join(','); };
  ok(seq(42) === seq(42), 'misma semilla → mismas consignas');
  const fr = seq(7).split(',').filter(x => x !== '-').length / 200;
  ok(fr > 0.3 && fr < 0.5, 'puntos con consigna ≈ ' + K.CHANCE + ' (' + fr.toFixed(2) + ')');
  // tope
  const t = K.create({ seed: 1 }); let sum = 0; for (let i = 0; i < 40; i++) sum += K.take(t);
  ok(Math.abs(sum - K.CAP) < 1e-9, 'tope por partido: ' + sum.toFixed(2));
}

// ------------------------------------------------------------------ partidos con bots (career.js ingest)
function playOne(Env, fmt, seed, botName, opt) {
  const { VB, S, DT, bots } = Env, Kc = VB.Career, B = Kc.beach;
  const hall = fmt !== 'beach', role = fmt === 'hallS' ? 'S' : 'OH';
  let opts;
  if (!hall) {
    const G = B.genSt, r = S._makeRng(seed * 31 + 34);
    opts = { seed: 3000 + seed * 7, serveClock: true, difficulty: 'easy', ctrl: 'one', ctrlIdx: 0, venue: 'beach', points: 21,
      attrs: [[G(35, 'atk', null), G(37, 'cr', null)], [G(35, 'atk', r), G(33, 'cr', r)]] };
  } else opts = { format: '6v6', seed: 900 + seed * 13, difficulty: 'normal', ctrl: 'one', ctrlRole: role, points: 15 };
  const g = S.createGame(opts);
  const gw = Object.create(g); gw.autopilot = false;
  gw.career = { mode: hall ? 'hall' : 'beach', trial: false, role: 'atk', pos: hall ? role : undefined, meOn: true, calls: !(opt && opt.off) };
  const bot = bots.makeBot(bots.BOTS[botName], 77 + seed * 5, hall ? { six: true, role } : null);
  const ev = []; let calls = 0, okN = 0, miss = 0, lastSeq = -1, coLog = 0;
  for (let i = 0; i < 3600 * 120 && !(g.finished && g.mode === 'over'); i++) {
    S.step(g, DT, bot(g)); ev.length = 0; S.drainEvents(g, ev);
    Kc.ingest(ev, gw);
    const L = Kc.liveRating(gw);
    if (L && L.coach && L.coach.seq !== lastSeq) { lastSeq = L.coach.seq; calls++; }
    for (const e of ev) if (e.type === 'point' && L && L.coach) { if (L.coach.state === 'ok') okN++; else if (L.coach.state === 'miss') miss++; }
  }
  const m = B._M(), rt = m.rt;
  for (const x of rt.log) if (x.kind === 'coach') coLog++;
  const out = { R: m.rallies, calls, okN, miss, sum: m.co ? m.co.sum : 0, hash: S.stateHash ? S.stateHash(g) : g.score.join('-') + '|' + g.setScores.map(x => x.join(':')).join(','),
    v: R2(VB.Rating.value(rt)), coLog };
  Kc.abortMatch();
  return out;
}
function R2(v) { return Math.round(v * 100) / 100; }

if (!E.bots) { console.log('(aviso: sin los bots de tools/simtest.js: no se juegan partidos)'); }
else {
  const N = Math.max(1, +(process.env.CONSIGNATEST_N || 4));
  const E0 = load(false);
  for (const fmt of ['beach', 'hallOH', 'hallS']) {
    section('Partidos con bots: ' + fmt);
    let okF = 0;
    for (const bot of ['medio', 'bueno']) {
      let T = { R: 0, calls: 0, okN: 0, miss: 0, sum: 0, dv: 0 }, same = 0, off = 0;
      for (let s = 1; s <= N; s++) {
        const a = playOne(E, fmt, s, bot), b = playOne(E0, fmt, s, bot), c = playOne(E, fmt, s, bot, { off: true });
        T.R += a.R; T.calls += a.calls; T.okN += a.okN; T.miss += a.miss; T.sum += a.sum; T.dv += a.v - b.v;
        if (a.hash === b.hash && a.R === b.R) same++;
        if (c.calls === 0 && c.sum === 0 && c.v === b.v) off++;
        ok(a.sum <= K.CAP + 1e-9, fmt + ' ' + bot + ' #' + s + ': dentro del tope (' + a.sum.toFixed(2) + ')');
        ok(a.coLog === 0 || a.okN > 0, fmt + ' ' + bot + ' #' + s + ': avisos de consigna solo con consignas cumplidas');
      }
      ok(same === N, fmt + ' ' + bot + ': la sim da la misma partida con y sin consignas (' + same + '/' + N + ')');
      ok(off === N, fmt + ' ' + bot + ': con el ajuste apagado no hay consignas ni cambia la nota (' + off + '/' + N + ')');
      const fr = T.calls / Math.max(1, T.R);
      console.log('  ' + bot + ': ' + T.R + ' puntos, consignas ' + T.calls + ' (' + (fr * 100).toFixed(0) + ' %), cumplidas ' + T.okN + ', falladas ' + T.miss +
        ', suma media ' + (T.sum / N).toFixed(2) + ', nota +' + (T.dv / N).toFixed(2) + ' de media');
      ok(fr > 0.25 && fr < 0.5, fmt + ' ' + bot + ': puntos con consigna entre 25 % y 50 % (' + (fr * 100).toFixed(0) + ' %)');
      okF += T.okN;
    }
    ok(okF > 0, fmt + ': alguna consigna cumplida');
  }
}

console.log('\n' + (fails ? fails + ' FALLOS' : 'TODO OK') + ' (' + passes + ' comprobaciones)');
process.exit(fails ? 1 : 0);
