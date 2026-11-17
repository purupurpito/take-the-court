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
  const evs = []; let over = null, subs = 0, libs = 0;
  for (let i = 0; i < 120 * 60 * VB.C.SIM_HZ && !over; i++) {
    if (i) S.step(g, DT, null);
    evs.length = 0; S.drainEvents(g, evs);
    for (const e of evs) { MS.ingest(e, g); if (e.type === 'gameOver') over = e; if (e.type === 'sub') subs++; if (e.type === 'libero') libs++; }
  }
  return { g, over, subs, libs };
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
  ];
  let totSubs = 0, totLibs = 0;
  for (const F of FORMATS) {
    const n = F.n || N;
    for (let m = 0; m < n; m++) {
      const label = F.k + ' #' + (m + 1);
      const { g, over, subs, libs } = play(VB, Object.assign({ seed: 1000 + m * 7919 + F.k.length }, F.o));
      totSubs += subs; totLibs += libs;
      ok(label + ': el partido acaba', !!over); if (!over) continue;
      const d = VB.MatchStats.data();
      ok(label + ': hay acta', VB.Acta.available(d));
      const meta = { home: 'Voley Local', away: 'Voley Visitante', venue: 'Pabellón de prueba', now: Date.UTC(2026, 10, 17, 18, 0, 0), id: 'prueba' };
      const A = VB.Acta.build(d, meta);
      if (!A) { ok(label + ': build devuelve acta', false); continue; }
      ok(label + ': formato', A.format === 'empat/acta' && A.version === 1 && Array.isArray(A.plays));
      ok(label + ': determinista', JSON.stringify(A) === JSON.stringify(VB.Acta.build(d, meta)));
      ok(label + ': JSON de ida y vuelta', JSON.stringify(JSON.parse(JSON.stringify(A))) === JSON.stringify(A));
      const K = (k) => A.plays.filter((p) => p.kind === k).length;
      const pts = g.setScores.reduce((a, s) => a + s[0] + s[1], 0);
      ok(label + ': un rally por punto', K('rally') === pts, K('rally') + ' frente a ' + pts);
      ok(label + ': dos plantillas', K('roster') === 2);
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
      ok(label + ': sets ganados', sum.totals.home.won === g.sets[0] && sum.totals.away.won === g.sets[1],
        sum.totals.home.won + '-' + sum.totals.away.won + ' frente a ' + g.sets.join('-'));
      const rows = sum.rows.map((r) => r.home.points + '-' + r.away.points).join(' '), want = g.setScores.map((s) => s.join('-')).join(' ');
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
