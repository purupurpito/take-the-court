#!/usr/bin/env node
/* MAKE THE CUT — tools/actatest.js (owner: ui_main)
 * Prueba del «Acta del partido» (js/acta.js) sin navegador: juega partidos 6v6 enteros con el autopilot (sets a 15 y a 25, con y
 * sin banquillo, a un set), pasa cada evento a VB.MatchStats.ingest como ui.js, construye el acta con VB.Acta.build y comprueba:
 *  - forma: format "empat/acta", versión 1, roster ×2, lineup antes de cada startPeriod, un rally por punto del marcador;
 *  - JSON de ida y vuelta sin cambios; build determinista (mismo registro → misma acta);
 *  - si está el motor de emPat al lado (../acta-electronica o EMPAT_DIR), que lo acepta jugada a jugada sin una sola regla rota,
 *    que el partido queda acabado y que sets y puntos de cada set coinciden con los de la sim.
 *  - 2v2: no hay acta (available false).
 * Uso: node tools/actatest.js [partidos por formato = 3]
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm'), url = require('url');
const ROOT = path.join(__dirname, '..');
const N = Math.max(1, +(process.argv[2] || 3));
let fails = 0, oks = 0;
const ok = (msg, cond, extra) => { if (cond) oks++; else { fails++; console.log('  FALLO: ' + msg + (extra ? ' (' + extra + ')' : '')); } };

function load() {
  const ctx = { console, Math, Date };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  for (const f of ['js/sim.js', 'js/ai.js', 'js/ai6.js', 'js/matchstats.js', 'js/acta.js'])
    vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  return ctx.VB;
}

function play(VB, opts) {
  const S = VB.Sim, DT = 1 / VB.C.SIM_HZ, MS = VB.MatchStats;
  MS.reset();
  const g = S.createGame(Object.assign({ demo: false, autopilot: true, difficulty: 'normal' }, opts));
  const evs = []; let over = null, subs = 0, libs = 0, pts = 0, pens = 0, sans = 0;
  // Ambiente de Carrera (opts.amb): tarjetas sintéticas (amb:card, como las del director) y castigos reales (Sim.penalty) con la escala
  // FIVB: rival amarilla → roja con punto; tu equipo advertencia por retraso → castigo por retraso; amarilla al entrenador
  const PLAN = { 5: [1, 'yellow', 'player'], 8: [0, 'delayY', 'team'], 12: [1, 'red', 'player'], 20: [0, 'delayR', 'team'], 25: [0, 'yellow', 'coach'] };
  for (let i = 0; i < 120 * 60 * VB.C.SIM_HZ && !over; i++) {
    if (i) S.step(g, DT, null);
    evs.length = 0; S.drainEvents(g, evs);
    for (let k = 0; k < evs.length; k++) { const e = evs[k]; MS.ingest(e, g); if (e.type === 'gameOver') over = e; if (e.type === 'sub') subs++; if (e.type === 'libero') libs++;
      if (opts.amb && e.type === 'point' && !e.penalty && !e.setWon && !e.matchWon && PLAN[++pts]) {
        const [t, color, who] = PLAN[pts], pen = /^(red|delayR)$/.test(color) && S.canPenalty(g, t), pl = g.teams[t][1];
        if (/^(red|delayR)$/.test(color) && !pen) { delete PLAN[pts]; PLAN[pts + 1] = [t, color, who]; continue; }
        MS.ingest({ type: 'amb:card', amb: true, team: t, pid: who === 'player' ? pl.id : -1, num: who === 'player' ? pl.num : 0, name: '', who, color,
          reason: color.startsWith('delay') ? 'retraso' : 'protesta', set: g.setNo, score: g.score.slice(), penalty: pen }, g);
        sans++;
        if (pen) { S.penalty(g, t, { card: color, pid: who === 'player' ? pl.id : -1 }); const pe = []; S.drainEvents(g, pe); for (const x of pe) { MS.ingest(x, g); if (x.penalty) pens++; } }
      } }
  }
  return { g, over, subs, libs, pens, sans };
}

const BENCH = (t) => [{ role: 'S', name: 'Suplente S' }, { role: 'OH', name: 'Suplente OH' }, { role: 'MB', name: 'Suplente MB' },
  { role: 'OPP', name: 'Suplente OPP' }, { role: 'OH' }, { role: 'MB' }];

async function loadEmpat() {
  const dir = process.env.EMPAT_DIR || path.join(ROOT, '..', 'acta-electronica');
  const f = path.join(dir, 'web', 'src', 'rules', 'index.js');
  if (!fs.existsSync(f)) return null;
  return import(url.pathToFileURL(f).href);
}

(async () => {
  const VB = load(), R = await loadEmpat();
  if (!R) console.log('  (sin el motor de emPat al lado: solo se comprueba la forma del acta)');
  const FORMATS = [
    { k: '6v6 a 15', o: { format: '6v6', points: 15 } },
    { k: '6v6 a 15 con banquillo', o: { format: '6v6', points: 15, bench: [BENCH(0), BENCH(1)] } },
    { k: '6v6 a 25 con banquillo', o: { format: '6v6', bench: [BENCH(0), BENCH(1)] }, n: 1 },
    { k: '6v6 a un set', o: { format: '6v6', points: 15, bestOf: 1 }, n: 1 },
    // Carrera: fuera de casa, capitán suplente (capitán en juego desde el principio) y capitán central (el líbero entra por él)
    { k: '6v6 fuera con capitán suplente', o: { format: '6v6', points: 15, bench: [BENCH(0), BENCH(1)] }, n: 2, meta: { atHome: false, capt: [21, 7], lib: ['Nora Líbero', ''] } },
    { k: '6v6 capitán central', o: { format: '6v6', points: 15 }, n: 2, meta: { capt: [3, 9] } },
    // Ambiente de Carrera: amarilla, roja con punto de castigo, retrasos y amarilla al entrenador (sanction de emPat)
    { k: '6v6 con sanciones', o: { format: '6v6', points: 25, amb: true }, n: 2 },
  ];
  let totSubs = 0, totLibs = 0;
  for (const F of FORMATS) {
    const n = F.n || N;
    for (let m = 0; m < n; m++) {
      const label = F.k + ' #' + (m + 1);
      const { g, over, subs, libs, pens, sans } = play(VB, Object.assign({ seed: 1000 + m * 7919 + F.k.length }, F.o));
      totSubs += subs; totLibs += libs;
      ok(label + ': el partido acaba', !!over); if (!over) continue;
      const d = VB.MatchStats.data();
      ok(label + ': hay acta', VB.Acta.available(d));
      const meta = Object.assign({ names: ['Voley Mío', 'Voley Rival'], venue: 'Pabellón de prueba', competition: 'Hiperliga · Jornada 3 de 22',
        now: Date.UTC(2026, 10, 17, 18, 0, 0), id: 'prueba' }, F.meta || {});
      const A = VB.Acta.build(d, meta);
      if (!A) { ok(label + ': build devuelve acta', false); continue; }
      ok(label + ': formato', A.format === 'empat/acta' && A.version === 1 && Array.isArray(A.plays));
      ok(label + ': determinista', JSON.stringify(A) === JSON.stringify(VB.Acta.build(d, meta)));
      ok(label + ': JSON de ida y vuelta', JSON.stringify(JSON.parse(JSON.stringify(A))) === JSON.stringify(A));
      const K = (k) => A.plays.filter((p) => p.kind === k).length;
      const pts = g.setScores.reduce((a, s) => a + s[0] + s[1], 0);
      ok(label + ': un rally por punto', K('rally') + pens === pts, K('rally') + ' + ' + pens + ' castigos frente a ' + pts);
      if (F.o.amb) { ok(label + ': sanciones en el acta', K('sanction') === sans && sans >= 4 && pens >= 2, K('sanction') + ' / ' + sans + ' / castigos ' + pens);
        const d2 = VB.MatchStats.data(); ok(label + ': sanciones en el registro', d2.san.length === sans && d2.rallies.filter((r) => r.pen).length === pens);
        let cs = null; try { cs = VB.MatchStats.compute(d2, 0); } catch (er) { cs = String(er); }
        ok(label + ': la estadística acepta el castigo', cs && typeof cs === 'object', String(cs)); }
      ok(label + ': dos plantillas', K('roster') === 2);
      const away = F.meta && F.meta.atHome === false;
      ok(label + ': local y visitante', A.info.homeName === (away ? 'Voley Rival' : 'Voley Mío') && A.info.awayName === (away ? 'Voley Mío' : 'Voley Rival'),
        A.info.homeName + ' / ' + A.info.awayName);
      ok(label + ': competición de la Carrera', A.info.competition === 'Hiperliga · Jornada 3 de 22');
      ok(label + ': tres árbitros distintos de la lista', [A.info.referee1, A.info.referee2, A.info.scorer].every((x) => VB.Acta.ARBITROS.indexOf(x) >= 0) &&
        new Set([A.info.referee1, A.info.referee2, A.info.scorer]).size === 3);
      for (const r of A.plays.filter((p) => p.kind === 'roster')) {
        ok(label + ' ' + r.side + ': todos con nombre', r.players.every((p) => p.name && p.name.indexOf(' ') > 0), r.players.map((p) => p.name).join(','));
        ok(label + ' ' + r.side + ': nombres sin repetir', new Set(r.players.map((p) => p.name)).size === r.players.length);
        ok(label + ' ' + r.side + ': un capitán y no es líbero', r.players.filter((p) => p.captain).length === 1 && !r.players.some((p) => p.captain && p.libero));
      }
      if (F.meta && F.meta.capt) {
        const mine = A.plays.find((p) => p.kind === 'roster' && p.side === (away ? 'away' : 'home'));
        ok(label + ': el capitán es el del club', mine.players.some((p) => p.captain && p.shirt === String(F.meta.capt[0])));
        ok(label + ': hay capitán en juego', K('actingCaptain') > 0);
      }
      if (F.meta && F.meta.lib && F.meta.lib[0]) ok(label + ': nombre del líbero', A.plays.some((p) => p.kind === 'roster' && p.players.some((x) => x.libero && x.name === F.meta.lib[0])));
      ok(label + ': un inicio por set', K('startPeriod') === g.setScores.length, K('startPeriod') + ' / ' + g.setScores.length);
      if (!R) continue;
      // motor de emPat: jugada a jugada, cada una tiene que ser legal
      let bad = null;
      for (let i = 0; i < A.plays.length && !bad; i++) {
        const why = R.check(A.settings, A.info, A.plays.slice(0, i), A.plays[i]);
        if (why !== null) bad = '#' + i + ' ' + JSON.stringify(A.plays[i]) + ' → ' + why;
      }
      ok(label + ': emPat acepta todas las jugadas', !bad, bad);
      if (bad) continue;
      const M = R.replay(A.settings, A.info, A.plays);
      ok(label + ': emPat da el partido por acabado', M.phase === 'over', M.phase);
      const sum = R.summarize(M);
      const H = away ? 1 : 0;   // equipo de la sim que es el local en el acta
      ok(label + ': sets ganados', sum.totals.home.won === g.sets[H] && sum.totals.away.won === g.sets[1 - H],
        sum.totals.home.won + '-' + sum.totals.away.won + ' frente a ' + g.sets[H] + '-' + g.sets[1 - H]);
      const rows = sum.rows.map((r) => r.home.points + '-' + r.away.points).join(' '), want = g.setScores.map((s) => s[H] + '-' + s[1 - H]).join(' ');
      ok(label + ': puntos de cada set', rows === want, rows + ' frente a ' + want);
      ok(label + ': cambios contados', sum.totals.home.substitutions + sum.totals.away.substitutions === K('substitution'));
    }
  }
  // 2v2: sin acta
  const { over } = play(VB, { seed: 7, points: 15 });
  ok('2v2: el partido acaba', !!over);
  ok('2v2: sin acta', !VB.Acta.available(VB.MatchStats.data()));
  console.log('  (cambios jugados: ' + totSubs + ', entradas y salidas del líbero: ' + totLibs + ')');
  console.log((fails ? 'FALLA' : 'OK') + ' actatest: ' + oks + ' comprobaciones, ' + fails + ' fallos');
  process.exit(fails ? 1 : 0);
})();
