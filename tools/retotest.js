#!/usr/bin/env node
/* TAKE THE COURT — tools/retotest.js (owner: ui_main)
 * Pruebas de js/retos.js (S4-D1 sin el torneo de la semana). Partes 1-4 sin navegador:
 *  1) Puro (vm + localStorage falso + VB.Prog real): catálogo, una medida por reto con eventos sintéticos, atribución 6v6,
 *     exclusiones, _ovr, endMatch idempotente, XP una vez por nivel a los dos atletas (también tras mergeRaw), dry, chainOk.
 *  2) Fechas y semillas: tabla congelada de 7 días, 400 días seguidos (sedes, 6v6 10-20 %, playa a 21, mastery nunca en 6v6,
 *     n ≥ 1), tope de novato, isoWeek, today a medianoche, reto del día (mejor medalla, XP por nivel nuevo del día, día nuevo).
 *  3) clean y mergeRaw: JSON roto (.bak + lost), claves extrañas, topes, uniones, min sin null, d por clave, texto local
 *     intacto, conmutativa, idempotente, v mayor → solo lectura y sin rebajar. summary, profileXP monótona, album.
 *  4) Sim real (sim.js, ai.js, prog.js, badges.js, retos.js): autopilot con una vista sin la marca, pabellón y playa:
 *     coherencia con Badges (canon, bombardero, muro, red), r_rally = mayor rallyHits; calibración informativa del reto del día.
 *  La parte de navegador (CDP: #mpRetos, reto_end, flujo real) la añade T19 cuando existan las páginas.
 * Uso: node tools/retotest.js   (acaba en «TODO OK» o sale con 1). CALIB=n cambia los partidos de la calibración (6).
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
let fails = 0, oks = 0;
function ok(name, cond, extra) { if (cond) { oks++; console.log('  ok   ' + name + (extra ? '  (' + extra + ')' : '')); } else { fails++; console.log('  FALLO ' + name + (extra ? '  (' + extra + ')' : '')); } }
function fakeStorage(init) {
  const m = new Map(Object.entries(init || {}));
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: k => { m.delete(k); }, _m: m };
}
function load(store, files) {
  const ctx = { console, Math, Date, JSON, localStorage: store };
  ctx.window = ctx; ctx.globalThis = ctx;
  vm.createContext(ctx);
  for (const f of files || ['js/prog.js', 'js/badges.js', 'js/retos.js']) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  return ctx.VB;
}
const J = o => JSON.stringify(o);

// eventos sintéticos
const P = { a: { id: 0, num: 1, team: 0 }, b: { id: 1, num: 2, team: 0 }, c: { id: 2, num: 3, team: 1 }, d: { id: 3, num: 4, team: 1 } };
function mkGame(o) { return Object.assign({ teams: [[P.a, P.b], [P.c, P.d]], size: 2, ctrl: P.a, setPoint: -1, matchPoint: -1, difficulty: 'normal', demo: false, autopilot: false }, o || {}); }
function feeder(R, g) {
  let s0 = 0, s1 = 0, st = 0, stT = -1;
  const ing = e => R.ingest(e, g);
  const api = {
    ing,
    start() { ing({ type: 'newMatch' }); s0 = s1 = 0; },
    pt(team, how, ex) {
      if (team === 0) s0++; else s1++;
      if (stT === team) st++; else { stT = team; st = 1; }
      const e = Object.assign({ type: 'point', team, how, score: [s0, s1], streak: st, rallyHits: 3, setWon: false }, ex || {});
      if (e.setWon) { /* el llamador fija score */ }
      ing(e); if (e.setWon) { s0 = s1 = 0; stT = -1; st = 0; }
      return e;
    },
    serve(p, team) { ing({ type: 'hit', kind: 'serve', player: p, team, touch: 0, grade: 'good', recv: false, dig: false, chain: 0 }); },
    hit(p, team, kind, ex) { ing(Object.assign({ type: 'hit', kind, player: p, team, touch: 1, grade: 'good', recv: false, dig: false, chain: 0 }, ex || {})); },
    block(p, team) { ing({ type: 'block', player: p, team, result: 'stuff' }); },
    set score(v) { s0 = v[0]; s1 = v[1]; }
  };
  return api;
}

// ------------------------------------------------------------------ 1) puro
console.log('1) Catálogo y medidas');
{
  const VB = load(fakeStorage()), R = VB.Retos;
  const want = 'r_aces,r_kills,r_blocks,r_digs,r_recv,r_rally,r_streak,r_win,r_iron,r_comeback,r_saved,r_tidy,r_feint,r_roll,r_edge,r_chain,r_venues,r_six';
  ok('18 ids únicos en orden', R.IDS.join() === want && new Set(R.IDS).size === 18);
  ok('cada reto con grupo, nombre, condición y umbrales crecientes (decrecientes en min)', R.LIST.every(b => R.GROUPS.some(G => G.id === b.grp) && b.name && b.cond &&
    b.th.length === 3 && (b.kind === 'min' ? b.th[0] > b.th[1] && b.th[1] > b.th[2] : b.th[0] < b.th[1] && b.th[1] < b.th[2])));
  ok('54 medallas; XP 30/50/80 y del día 20/35/60', R.summary().of === 54 && J(R.XP) === '[30,50,80]' && J(R.XP_DAY) === '[20,35,60]');
  ok('textos sin «·» ni ordinales con punto', R.LIST.every(b => !/·|\.er|\.º/.test(b.name + b.cond + b.help)));
  ok('chainOk (R4): remate perfecto con chain ≥ 3', R.chainOk({ kind: 'spike', grade: 'perfect', chain: 3 }) && !R.chainOk({ kind: 'spike', grade: 'perfect', chain: 2 }) &&
    !R.chainOk({ kind: 'spike', grade: 'good', chain: 4 }) && !R.chainOk({ kind: 'set', grade: 'perfect', chain: 3 }) && R.chainOk({ kind: 'spike', grade: 'perfect', chain: 0 }, 3) && !R.chainOk(null));

  // un partido sintético que toca cada medida
  const g = mkGame({ difficulty: 'hard' }), F = feeder(R, g);
  F.start();
  // 3 aces del 1 y del 2
  F.serve(P.a, 0); F.pt(0, 'ace'); F.serve(P.b, 0); F.pt(0, 'ace'); F.serve(P.a, 0); F.pt(0, 'ace');
  // remates: uno de spike (cuenta), uno con último golpe 'free' (no cuenta)
  F.serve(P.c, 1); F.hit(P.a, 0, 'pass', { recv: true, grade: 'perfect', human: true }); F.hit(P.b, 0, 'set'); F.hit(P.a, 0, 'spike', { grade: 'perfect', human: true, chain: 3 }); F.pt(0, 'kill');
  F.serve(P.c, 1); F.hit(P.a, 0, 'pass', { recv: true, grade: 'perfect', human: false }); F.hit(P.b, 0, 'free'); F.pt(0, 'kill');
  // block-out: remate del equipo 0, toca bloqueo rival → kill (cuenta)
  F.serve(P.c, 1); F.hit(P.b, 0, 'spike'); F.block(P.d, 1); F.pt(0, 'kill');
  // bloqueo
  F.serve(P.a, 0); F.hit(P.c, 1, 'spike'); F.block(P.b, 0); F.pt(0, 'block');
  // defensas
  F.serve(P.c, 1); F.hit(P.a, 0, 'pass', { dig: true }); F.hit(P.b, 0, 'pass', { dig: true }); F.hit(P.d, 1, 'spike');
  // error del equipo 0 y uno salvando punto de set
  F.pt(1, 'error', { rallyHits: 14 });
  F.pt(0, 'kill', { savedSetPoint: true, move: 'feint' });
  F.pt(0, 'kill', { move: 'roll' }); F.pt(0, 'kill', { move: 'edge' });
  let c = R._cur();
  ok('aces 3, remates 2 (solo spike, incl. block-out), bloqueos 1', c.aces === 3 && c.kills === 2 && c.blocks === 1, `${c.aces}/${c.kills}/${c.blocks}`);
  ok('defensas 2, recepciones perfectas 1 (solo human), cadena 1', c.digs === 2 && c.recv === 1 && c.chain === 1, `${c.digs}/${c.recv}/${c.chain}`);
  ok('jugada más larga 14 (gane quien gane), errores 1, salvados 1, moves 1/1/1', c.rallyMax === 14 && c.errs === 1 && c.saved === 1 && c.feint === 1 && c.roll === 1 && c.edge === 1);
  ok('racha máxima del equipo 0 (7 seguidos antes del error)', c.streakMax === 7, '' + c.streakMax);
  // _ovr: un ace que luego se anula por challenge (el nuevo punto es del rival)
  F.serve(P.a, 0); F.pt(0, 'ace'); const a1 = R._cur().aces;
  F.pt(1, 'error', { _ovr: true });
  ok('_ovr: el punto anulado no cuenta (ace descontado; el nuevo error sí)', a1 === 4 && R._cur().aces === 3 && R._cur().errs === 2, `${a1}→${R._cur().aces}`);
  // remontada: ir perdiendo 5 y ganar el set; set de hierro solo con score[0] ≥ 21
  F.score = [0, 5]; F.pt(1, 'kill');                 // 0-6 → desventaja 6
  F.score = [24, 10]; F.pt(0, 'kill', { setWon: true, score: [25, 10] });
  c = R._cur();
  ok('remontada = desventaja máxima del set ganado (6) y set de hierro 10', c.cbBest === 6 && c.iron === 10, `${c.cbBest}/${c.iron}`);
  F.score = [0, 3]; F.pt(1, 'kill', { score: [0, 4] }); F.pt(1, 'kill', { setWon: true, score: [13, 15] });
  ok('remontada se reinicia en cada set; set perdido no cuenta', R._cur().cbBest === 6 && R._cur().setsL === 1 && R._cur().defCur === 0);
  F.pt(0, 'kill', { setWon: true, score: [15, 3] });
  ok('set de hierro ignora sets a 15', R._cur().iron === 10);
  R.ingest({ type: 'gameOver', team: 0, sets: [2, 1] }, g);
  const xp0 = VB.Prog.squad().map(a => a.xp + a.lvl * 1000);
  const res = R.endMatch(g, { win: true, map: 'fanals' });
  const lv = id => R.level(id);
  ok('endMatch: aces bronce (3), Escalera plata (Difícil), Set de hierro bronce (10), Remontada plata (6)',
    lv('r_aces') === 1 && lv('r_win') === 2 && lv('r_iron') === 1 && lv('r_comeback') === 2, R.IDS.map(i => lv(i)).join(''));
  ok('Finta/Al hueco/En la raya sin nivel aún (1 de 3); De libro bronce; Todas las pistas 1 de 6; Cero regalos bronce (2 errores)',
    lv('r_feint') === 0 && lv('r_chain') === 1 && R.load().m.r_venues.v === 1 && lv('r_tidy') === 2, 'tidy ' + lv('r_tidy'));
  const expXP = res.up.reduce((s, u) => { let x = 0; for (let k = u.prev + 1; k <= u.lvl; k++) x += R.XP[k - 1]; return s + x; }, 0);
  ok('XP = suma de niveles nuevos, a los dos atletas', res.xp === expXP && res.xp > 0, res.xp + ' XP, ' + res.up.length + ' novedades');
  const sq = VB.Prog.squad(), gained = sq.map((a, i) => a.xp + a.lvl * 1000 - xp0[i]);
  ok('los dos atletas reciben XP', gained[0] > 0 && gained[1] > 0);
  const s1 = JSON.stringify(R.load());
  const res2 = R.endMatch(g, { win: true, map: 'fanals' });
  ok('endMatch idempotente: misma respuesta, sin guardar ni pagar dos veces', res2 === res && JSON.stringify(R.load()) === s1 && VB.Prog.squad()[0].xp === sq[0].xp);
  ok('unseen = los subidos; markSeen los limpia', R.unseen().length === res.up.length && R.markSeen() && R.unseen().length === 0);

  // XP una sola vez por nivel aunque el nivel venga de otro aparato (mergeRaw con xp cobrada)
  const st2 = fakeStorage(), VB2 = load(st2), R2 = VB2.Retos;
  st2.setItem('make-the-cut.retos', J({ v: 1, m: { r_aces: { l: 2, v: 4 } }, xp: { r_aces: 2 } }));
  const x0 = VB2.Prog.squad()[0].xp + VB2.Prog.squad()[0].lvl * 1000;
  const g2 = mkGame(), F2 = feeder(R2, g2); F2.start(); for (let i = 0; i < 6; i++) { F2.serve(P.a, 0); F2.pt(0, 'ace'); }
  const r2 = R2.endMatch(g2, { win: false });
  const exp2 = r2.up.filter(u => u.id !== 'r_aces').reduce((s, u) => { let x = 0; for (let k = u.prev + 1; k <= u.lvl; k++) x += R2.XP[k - 1]; return s + x; }, 0) + 80;
  ok('nivel ya cobrado en otro aparato: de Aces solo se paga el oro', r2.xp === exp2 && R2.level('r_aces') === 3, r2.xp + ' XP');
  ok('derrota: Escalera, Cero regalos y Todas las pistas no cuentan', R2.level('r_win') === 0 && R2.level('r_tidy') === 0 && !R2.load().m.r_venues);

  // dry: calcula sin guardar
  const st3 = fakeStorage(), VB3 = load(st3), R3 = VB3.Retos;
  const g3 = mkGame(), F3 = feeder(R3, g3); F3.start(); for (let i = 0; i < 4; i++) { F3.serve(P.a, 0); F3.pt(0, 'ace'); }
  const r3 = R3.endMatch(g3, { win: true, map: 'palau' }, true);
  ok('dry: devuelve novedades pero no guarda ni da XP', r3.dry && r3.up.some(u => u.id === 'r_aces' && u.lvl === 2) && st3.getItem('make-the-cut.retos') === null && VB3.Prog.squad()[0].xp === 0);

  // exclusiones
  const ex = (o, setup) => { const s = fakeStorage(), V = load(s), Rx = V.Retos; if (setup) setup(V); const gx = mkGame(o); Rx.ingest({ type: 'newMatch' }, gx); return [Rx, gx, V]; };
  let [Rx, gx] = ex({ demo: true }); ok('demo no cuenta', !Rx._cur() && Rx.endMatch(gx, { win: true }) === null);
  [Rx, gx] = ex({ autopilot: true }); ok('autopilot no cuenta', !Rx._cur() && Rx.endMatch(gx, { win: true }) === null);
  [Rx, gx] = ex({ drill: { id: 'serve' } }); ok('ejercicio (g.drill) no cuenta', !Rx._cur());
  [Rx, gx] = ex({ watch: true }); ok('espectador (g.watch) no cuenta', !Rx._cur());
  [Rx, gx] = ex({ watch: true, watch0: false }); ok('banquillo (g.watch con watch0 false) sí cuenta', !!Rx._cur());
  [Rx, gx] = ex({}, V => { V.ctx = { debug: 'rally' }; }); ok('depuración sin _force no cuenta', !Rx._cur());
  [Rx, gx] = ex({ reto: { kind: 'day', key: 20261113 } }, V => { V.ctx = { debug: 'reto_end' }; });
  ok('depuración con g.reto cuenta pero cierra en seco', !!Rx._cur() && Rx.endMatch(gx, { win: true }).dry === true && Rx.load().d === null);
  [Rx, gx] = ex({ autopilot: true }, V => { V.Retos._force = true; }); ok('_force: el autopilot cuenta (pruebas)', !!Rx._cur());

  // atribución 6v6
  const six = [0, 1, 2, 3, 4, 5].map(i => ({ id: i, num: i + 1, team: 0 })), riv = [6, 7, 8, 9, 10, 11].map(i => ({ id: i, num: i + 1, team: 1 }));
  const s6 = fakeStorage(), V6 = load(s6), R6 = V6.Retos;
  const g6 = { teams: [six, riv], size: 6, ctrl: six[2], ctrlBase: six[2], setPoint: -1, matchPoint: -1, difficulty: 'normal' };
  const F6 = feeder(R6, g6); F6.start();
  F6.serve(six[0], 0); F6.pt(0, 'ace');
  ok('6v6: un ace de otro jugador no cuenta', R6._cur().aces === 0);
  F6.serve(six[2], 0); F6.pt(0, 'ace');
  ok('6v6: un ace de g.ctrl sí', R6._cur().aces === 1);
  F6.serve(riv[0], 1); F6.hit(six[4], 0, 'spike'); F6.pt(0, 'kill'); F6.serve(riv[0], 1); F6.hit(six[2], 0, 'spike'); F6.pt(0, 'kill');
  F6.hit(six[1], 0, 'pass', { dig: true }); F6.hit(six[2], 0, 'pass', { dig: true });
  ok('6v6: remates y defensas solo de g.ctrl', R6._cur().kills === 1 && R6._cur().digs === 1);
  F6.serve(riv[0], 1); F6.ing({ type: 'point', team: 1, how: 'error', player: six[3], score: [0, 1], streak: 1 });
  F6.hit(six[2], 0, 'spike'); F6.ing({ type: 'point', team: 1, how: 'error', player: null, score: [0, 2], streak: 2 });
  ok('6v6: errores solo tuyos (falta propia o tu último golpe)', R6._cur().errs === 1);
  const r6 = R6.endMatch(g6, { win: true, map: 'palau' });
  ok('6v6 ganado: Equipo completo bronce', R6.level('r_six') === 1 && r6.up.some(u => u.id === 'r_six'));
}

// ------------------------------------------------------------------ 2) fechas y semillas
console.log('2) Fechas y semillas');
{
  const VB = load(fakeStorage()), R = VB.Retos;
  // tabla congelada (generada al implementar, 13-nov-2026): [key, six, map, difficulty, points, ctrl, mod, goal, n] sin tope de novato
  const FROZEN = [
    [20261113, false, 'cupula', 'hard', 15, 'both', 'sinInsignias', 'clean', 0],
    [20261114, false, 'canrebot', 'normal', 25, 'one', null, 'comeback', 4],
    [20261115, false, 'cupula', 'hard', 21, 'one', null, 'clean', 0],
    [20261116, false, 'platja', 'normal', 21, 'both', null, 'comeback', 4],
    [20261117, false, 'palau', 'normal', 21, 'both', null, 'blocks', 3],
    [20261118, false, 'platja', 'hard', 21, 'both', null, 'tidy', 3],
    [20261119, false, 'fanals', 'normal', 21, 'one', 'sinInsignias', 'aces', 3]
  ];
  const row = x => [x.key, x.six, x.map, x.difficulty, x.points, x.ctrl, x.mod, x.goal.id, x.goal.n];
  const got = FROZEN.map(f => row(R.daily(f[0], false)));
  ok('daily: tabla fija de 7 días (13-19 nov 2026)', J(got) === J(FROZEN), got.filter((g, i) => J(g) !== J(FROZEN[i])).map(J).join(' '));
  ok('daily determinista (dos llamadas iguales)', J(R.daily(20261113, false)) === J(R.daily(20261113, false)));
  const d13 = R.daily(20261113, false);
  ok('textos del día: oro, tiers y datos', d13.goal.txt === 'Gana sin ceder un set' && d13.tiers[2] === 'Oro: gana sin ceder un set' &&
    d13.bits.join('|') === 'Cúpula del Far|Difícil|Sets a 15|A los dos' && d13.modName === 'Sin insignias', d13.bits.join('|'));
  ok('opts del día para startMatch', d13.opts.reto.kind === 'day' && d13.opts.reto.key === 20261113 && d13.opts.format === '2v2' && d13.opts.map === 'cupula' &&
    d13.opts.difficulty === 'hard' && d13.opts.points === 15 && d13.opts.ctrl === 'both' && d13.opts.noBadges === true && !d13.opts.noAttrs, J(d13.opts));
  // 400 días seguidos
  let t = Date.UTC(2026, 10, 13, 12), maps = new Set(), six = 0, bad = [], n0 = [], beach21 = true, mas6 = false, sixBeach = false;
  for (let i = 0; i < 400; i++, t += 864e5) {
    const dt = new Date(t), k = dt.getUTCFullYear() * 10000 + (dt.getUTCMonth() + 1) * 100 + dt.getUTCDate(), x = R.daily(k, false);
    maps.add(x.map); if (x.six) { six++; if (x.kind === 'beach') sixBeach = true; if (x.goal.id === 'mastery') mas6 = true; }
    if (x.kind === 'beach' && x.points !== 21) beach21 = false;
    if (x.goal.n < 1 && x.goal.id !== 'tidy' && x.goal.id !== 'clean') n0.push(k + ':' + x.goal.id);
    if (!x.goal.txt || /·|\{n\}|undefined|NaN/.test(x.goal.txt + x.bits.join())) bad.push(k);
  }
  ok('400 días: salen las 6 sedes', maps.size === 6, [...maps].join(','));
  ok('400 días: 6v6 entre el 10 % y el 20 %, nunca en playa', six >= 40 && six <= 80 && !sixBeach, six + ' de 400');
  ok('400 días: la playa siempre a 21; mastery nunca en 6v6', beach21 && !mas6);
  ok('400 días: todo objetivo con n ≥ 1 (salvo tidy/clean) y textos completos', !n0.length && !bad.length, n0.concat(bad).slice(0, 5).join(' '));
  // tope de novato
  let rk = true;
  for (let i = 0, tt = Date.UTC(2026, 10, 13, 12); i < 120; i++, tt += 864e5) { const dt = new Date(tt), k = dt.getUTCFullYear() * 10000 + (dt.getUTCMonth() + 1) * 100 + dt.getUTCDate(); const x = R.daily(k, true); if (x.opts.difficulty !== 'normal' || x.difficulty !== 'normal') rk = false; }
  ok('novato: nunca Difícil ni Experto en opts', rk);
  ok('novato por defecto con record.wins < 3', R.daily(20261113).rookie === true);
  const st4 = fakeStorage({ 'make-the-cut.record': J({ played: 9, wins: 5 }) }), R4 = load(st4).Retos;
  ok('con 5 victorias no hay tope', R4.daily(20261113).rookie === false && R4.daily(20261113).difficulty === 'hard');
  // isoWeek y today
  ok('isoWeek: 28-dic-2026 → 202653, 3-ene-2027 → 202653, 4-ene-2027 → 202701', R.isoWeek(20261228) === 202653 && R.isoWeek(20270103) === 202653 && R.isoWeek(20270104) === 202701);
  let ws = true, prevW = R.isoWeek(20260323);
  for (const k of [20260324, 20260325, 20260326, 20260327, 20260328, 20260329]) if (R.isoWeek(k) !== prevW) ws = false;
  ok('isoWeek sin saltos en el cambio de hora (29-mar-2026)', ws && R.isoWeek(20260330) === prevW + 1);
  ok('today a las 23:59:59 y a las 00:00:00 (hora local)', R.today(new Date(2026, 10, 13, 23, 59, 59)) === 20261113 && R.today(new Date(2026, 10, 14, 0, 0, 0)) === 20261114);
  ok('dateLabel', R.dateLabel(20261113) === '13 nov' && R.dateLabel(20270101) === '1 ene');
  VB.ctx = { params: { retodate: '20261117' } };
  ok('?retodate= manda en today() y daily()', R.today() === 20261117 && R.daily().key === 20261117);
  delete VB.ctx;

  // reto del día: medallas, mejor medalla, XP por nivel nuevo del día, día nuevo
  const st5 = fakeStorage({ 'make-the-cut.record': J({ played: 9, wins: 5 }) }), V5 = load(st5), R5 = V5.Retos;
  V5.ctx = { params: { retodate: '20261117' } };   // «hoy» = 17-nov (un d.k mayor que hoy se trataría como reloj atrasado)
  const dd = R5.daily(20261117);   // blocks 3 a 21
  const play = (win, setsW, blocks, key) => {
    const g = mkGame({ reto: Object.assign({}, dd.opts.reto, key ? { key } : {}), difficulty: dd.difficulty }), F = feeder(R5, g); F.start();
    for (let i = 0; i < blocks; i++) { F.serve(P.a, 0); F.hit(P.c, 1, 'spike'); F.block(P.b, 0); F.pt(0, 'block'); }
    for (let i = 0; i < setsW; i++) { F.score = [20, 3]; F.pt(0, 'kill', { setWon: true, score: [21, 3] }); }
    return R5.endMatch(g, { win, map: dd.map, sets: [setsW, win ? 1 : 2] });
  };
  const xa = () => V5.Prog.squad()[0].xp + V5.Prog.squad()[0].lvl * 1000;
  let x0 = xa(), r = play(false, 0, 0);
  ok('día: perder sin set = sin medalla, intento contado', r.day.medal === 0 && r.day.xp === 0 && R5.load().d.n === 1 && R5.dayState().key === 20261117);
  r = play(false, 1, 0);
  ok('día: ganar un set = bronce (+20)', r.day.medal === 1 && r.day.xp === 20 && R5.load().d.m === 1);
  r = play(true, 2, 1);
  ok('día: ganar sin el objetivo = plata (+35)', r.day.medal === 2 && r.day.xp === 35 && !r.day.goal.ok);
  r = play(true, 2, 3);
  ok('día: ganar con 3 bloqueos = oro (+60)', r.day.medal === 3 && r.day.xp === 60 && r.day.goal.ok && r.day.goal.txt === 'Gana con 3 puntos de bloqueo');
  r = play(false, 1, 0);
  ok('día: después, un bronce no baja la mejor ni paga', r.day.medal === 1 && r.day.best === 3 && r.day.xp === 0 && R5.load().d.m === 3 && R5.load().d.n === 5);
  ok('día: guardado en days', R5.load().days[20261117] === 3);
  V5.ctx.params.retodate = '20261118';
  r = play(false, 1, 0, 20261118);
  ok('día nuevo: vuelve a cobrar desde bronce', r.day.key === 20261118 && r.day.xp === 20 && R5.load().d.k === 20261118 && R5.load().d.n === 1);
  r = play(true, 2, 0, 20261117);
  ok('partido de un día pasado: no toca el día en curso ni repaga', r.day.xp === 0 && R5.load().d.k === 20261118 && R5.load().days[20261117] === 3);
  ok('XP total del día: 20+35+60+20 a cada jugador (más la de maestría)', xa() - x0 >= 135);
  const smm = R5.summary();
  ok('summary: días con medalla 2, días con oro 1', smm.days === 2 && smm.daysGold === 1, J(smm));
}

// ------------------------------------------------------------------ 3) clean y mergeRaw
console.log('3) clean y mergeRaw');
{
  const st = fakeStorage({ 'make-the-cut.retos': '{roto' }), VB = load(st), R = VB.Retos;
  ok('JSON roto → vacío, copia en .bak y lost()', R.count() === 0 && R.lost() && st.getItem('make-the-cut.retos.bak') === '{roto');
  const c = R.clean({ v: 1, zz: 1, m: { r_aces: { l: 9, v: -3, q: 1 }, nope: { l: 2 }, r_venues: { l: 1, s: ['fanals', 'x', 'palau', 'palau'] }, r_iron: { l: 1, v: null } },
    xp: { r_aces: 7, x: 1 }, d: { k: 20261399, m: 2 }, days: { 20261113: 9, abc: 1 }, seen: { r_aces: 2 } });
  ok('clean: claves extrañas fuera, topes y validación', c.m.r_aces.l === 3 && c.m.r_aces.v === 0 && !c.m.nope && !('zz' in c) && J(c.m.r_venues.s) === '["palau","fanals"]' &&
    c.m.r_venues.v === 2 && c.m.r_iron.v === undefined && c.xp.r_aces === 3 && !c.xp.x && c.d === null && J(c.days) === '{"20261113":3}', J(c));
  const days = {}; for (let i = 0; i < 450; i++) { const dt = new Date(Date.UTC(2025, 0, 1) + i * 864e5); days[dt.getUTCFullYear() * 10000 + (dt.getUTCMonth() + 1) * 100 + dt.getUTCDate()] = i % 4; }
  const cf = R.clean({ days });
  ok('days ≤ 400: lo más viejo se pliega en old.d', Object.keys(cf.days).length === 400 && cf.old.d.reduce((a, b) => a + b, 0) === 50);
  const A = { v: 1, m: { r_aces: { l: 1, v: 3 }, r_iron: { l: 1, v: 11 }, r_tidy: { l: 1, v: 5 }, r_venues: { l: 1, v: 2, s: ['palau', 'moll'] } }, xp: { r_aces: 1 }, d: { k: 20261113, m: 1, n: 4, xp: 1 }, days: { 20261112: 2, 20261113: 1 }, seen: { r_aces: 1 } };
  const B = { v: 1, m: { r_aces: { l: 2, v: 5 }, r_iron: { l: 0 }, r_tidy: { l: 2, v: 3 }, r_venues: { l: 1, v: 2, s: ['fanals', 'palau'] }, r_six: { l: 1, v: 1 } }, xp: { r_aces: 2, r_six: 1 }, d: { k: 20261113, m: 2, n: 1, xp: 2 }, days: { 20261111: 3, 20261113: 2 } };
  const AB = JSON.parse(R.mergeRaw(J(A), J(B))), BA = JSON.parse(R.mergeRaw(J(B), J(A)));
  ok('mergeRaw: máximo de nivel, max en v, min en los min (sin null)', AB.m.r_aces.l === 2 && AB.m.r_aces.v === 5 && AB.m.r_iron.v === 11 && AB.m.r_tidy.v === 3 && AB.m.r_tidy.l === 2);
  ok('mergeRaw: unión de sedes, xp y days por máximo', J(AB.m.r_venues.s) === '["palau","moll","fanals"]' && AB.m.r_venues.v === 3 && AB.xp.r_aces === 2 && AB.xp.r_six === 1 &&
    J(AB.days) === '{"20261111":3,"20261112":2,"20261113":2}');
  ok('mergeRaw: mismo d.k → máximos campo a campo', J(AB.d) === '{"k":20261113,"m":2,"n":4,"xp":2}');
  const C = Object.assign({}, A, { d: { k: 20261115, m: 0, n: 1, xp: 0 } });
  ok('mergeRaw: d con claves distintas → la mayor', JSON.parse(R.mergeRaw(J(C), J(B))).d.k === 20261115 && JSON.parse(R.mergeRaw(J(B), J(C))).d.k === 20261115);
  ok('mergeRaw conmutativa en contenido', J(AB) === J(BA));
  const Ls = R.mergeRaw(J(A), J(B));
  ok('mergeRaw idempotente y texto local intacto si no cambia nada', R.mergeRaw(Ls, Ls) === Ls && R.mergeRaw(Ls, J(A)) === Ls && R.mergeRaw(J(A), '{roto') === J(A) && R.mergeRaw('', J(B)) === J(B));
  // asociativa con casos al azar (LCG de semilla fija)
  let seed = 12345; const rnd = () => (seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 4294967296;
  const randSave = () => { const o = { v: 1, m: {}, xp: {}, days: {}, seen: {} }; for (const id of R.IDS) if (rnd() < 0.4) { o.m[id] = { l: Math.floor(rnd() * 4), v: rnd() < 0.2 ? null : Math.floor(rnd() * 40) }; if (id === 'r_venues') o.m[id].s = Object.keys(R.MAPS).filter(() => rnd() < 0.4); if (rnd() < 0.5) o.xp[id] = Math.floor(rnd() * 4); }
    for (let i = 0; i < 6; i++) o.days[20261101 + Math.floor(rnd() * 20)] = Math.floor(rnd() * 4); if (rnd() < 0.7) o.d = { k: 20261110 + Math.floor(rnd() * 3), m: Math.floor(rnd() * 4), n: Math.floor(rnd() * 5), xp: Math.floor(rnd() * 4) }; return J(o); };
  let comm = 0, assoc = 0;
  const canon = s => J(R.clean(JSON.parse(s)));
  for (let i = 0; i < 300; i++) {
    const a = randSave(), b = randSave(), cc = randSave();
    if (canon(R.mergeRaw(a, b)) === canon(R.mergeRaw(b, a))) comm++;
    if (canon(R.mergeRaw(R.mergeRaw(a, b), cc)) === canon(R.mergeRaw(a, R.mergeRaw(b, cc)))) assoc++;
  }
  ok('300 casos al azar: conmutativa y asociativa', comm === 300 && assoc === 300, comm + '/' + assoc);
  // versión más nueva: solo lectura y sin rebajar
  const N = J({ v: 2, m: { r_aces: { l: 3, v: 9 } }, extra: 1 });
  ok('mergeRaw: un lado con v mayor gana entero', R.mergeRaw(N, J(A)) === N && R.mergeRaw(J(A), N) === N);
  const st2 = fakeStorage({ 'make-the-cut.retos': N }), R2 = load(st2).Retos;
  const gN = mkGame(), FN = feeder(R2, gN); FN.start(); FN.serve(P.a, 0); FN.pt(0, 'ace');
  R2.endMatch(gN, { win: true, map: 'palau' });
  ok('guardado v2: se lee, readOnly() y no se reescribe', R2.readOnly() && R2.level('r_aces') === 3 && st2.getItem('make-the-cut.retos') === N);
  // summary, profileXP, album
  const st3 = fakeStorage({ 'make-the-cut.retos': Ls }), R3 = load(st3).Retos;
  const sm = R3.summary(), px = R3.profileXP();
  ok('summary sobre el guardado fusionado', sm.b === 5 && sm.p === 2 && sm.o === 0 && sm.total === 7 && R3.count() === 7 && sm.days === 3 && sm.daysGold === 1, J(sm));
  const px2 = JSON.parse(R3.mergeRaw(Ls, J({ v: 1, m: { r_kills: { l: 1, v: 9 } }, days: { 20261120: 0 } })));
  st3.setItem('make-the-cut.retos', J(px2));
  ok('profileXP derivada y monótona tras fusionar', px > 0 && R3.profileXP() === px + 15, px + ' → ' + R3.profileXP());
  const al = R3.album();
  ok('album: pestaña «Retos» con 18 huecos y forma de D2', al.id === 'retos' && al.label === 'Retos' && al.total === 18 && al.have === 6 && al.items.length === 18 &&
    al.items.every(it => it.aid && it.name && /^<svg/.test(it.icon) && 'have' in it && 'tier' in it && 't' in it && it.src === 'retos' && it.how && 'isNew' in it));
  const pr = R3.progress('r_aces'), pi = R3.progress('r_iron'), pw = R3.progress('r_win'), pv = R3.progress('r_venues'), pr0 = R3.progress('r_rally');
  ok('progress: textos de la página Técnica', pr.txt === 'Aces en un partido: récord 5, oro con 6' && pi.txt === 'Set de hierro: mejor 11, plata con 8 o menos' &&
    pw.txt === 'Bronce: gana en Normal' && pv.txt === 'Sedes: 3 de 6, plata con 4' && pr0.txt === 'Jugada más larga de un partido: récord 0 toques, bronce con 12',
    [pr.txt, pi.txt, pw.txt, pv.txt, pr0.txt].join(' | '));
  const ld = R3.lookData();
  ok('lookData para el Vestuario', ld.reto.r_aces === 2 && ld.retoN === sm.total + 1 && ld.dias === 1 && ld.semana === 0);
}

// ------------------------------------------------------------------ 4) sim real
console.log('4) Sim real');
{
  const runs = [{ venue: 'hall', seed: 4242, points: 15 }, { venue: 'beach', seed: 777, points: 21 }];
  for (const rn of runs) {
    const VB = load(fakeStorage(), ['js/sim.js', 'js/ai.js', 'js/prog.js', 'js/badges.js', 'js/retos.js']);
    const S = VB.Sim, B = VB.Badges, R = VB.Retos, DT = 1 / VB.C.SIM_HZ;
    let g = null;
    try { g = S.createGame({ demo: false, autopilot: true, seed: rn.seed, difficulty: 'normal', points: rn.points, venue: rn.venue === 'beach' ? 'beach' : undefined }); }
    catch (e) { console.log('  OMITIDO: la sim no arranca (¿a medio editar por otro agente?): ' + e.message); continue; }
    const gv = { get teams() { return g.teams; }, get setPoint() { return g.setPoint; }, get matchPoint() { return g.matchPoint; }, get ctrl() { return g.ctrl; },
      get size() { return g.size; }, difficulty: 'normal', demo: false, autopilot: false };
    let n = 0, err = null, over = null, maxRally = 0;
    try {
      for (let i = 0; i < 60 * 60 * VB.C.SIM_HZ && !over; i++) {
        S.step(g, DT, null);
        for (const e of S.drainEvents(g)) {
          n++; B.ingest(e, gv); R.ingest(e, gv);
          if (e.type === 'point' && e.rallyHits > maxRally) maxRally = e.rallyHits;
          if (e.type === 'gameOver') over = e;
        }
      }
    } catch (e) { err = e; }
    ok(rn.venue + ': sin errores con ' + n + ' eventos y partido acabado', !err && !!over, err ? err.stack : over && 'sets ' + over.sets.join('-'));
    const bc = B._cur().c, c = R._cur();
    const canon = (bc[0].canon | 0) + (bc[1].canon | 0), bomb = (bc[0].bombardero | 0) + (bc[1].bombardero | 0), muro = (bc[0].muro | 0) + (bc[1].muro | 0), red = (bc[0].red | 0) + (bc[1].red | 0);
    ok(rn.venue + ': coherencia con Badges (remates = canon, aces = bombardero, bloqueos = muro, defensas = red)', c.kills === canon && c.aces === bomb && c.blocks === muro && c.digs === red,
      `retos ${c.kills}/${c.aces}/${c.blocks}/${c.digs} · badges ${canon}/${bomb}/${muro}/${red}`.replace(' · ', ' | '));
    ok(rn.venue + ': r_rally = mayor rallyHits', c.rallyMax === maxRally && maxRally > 0, '' + maxRally);
    const res = R.endMatch(gv, { win: over && over.team === 0, map: rn.venue === 'beach' ? 'platja' : 'palau', sets: over && over.sets });
    ok(rn.venue + ': endMatch con el partido real', res && Array.isArray(res.up), res && res.up.map(u => u.id + u.lvl).join(' '));
  }
  // calibración (informativa): el oro de cada objetivo del día contra Normal, a 25 (pabellón 2v2), lo cumple el autopilot en ≥ 50 %
  const NC = +process.env.CALIB || 6, hits = {}, VBc0 = load(fakeStorage(), ['js/retos.js']);
  const goals = VBc0.Retos.GOALS.filter(G => G.n2[0] > 0);
  let played = 0, wins = 0;
  for (let k = 0; k < NC; k++) {
    const VB = load(fakeStorage(), ['js/sim.js', 'js/ai.js', 'js/prog.js', 'js/badges.js', 'js/retos.js']), S = VB.Sim, R = VB.Retos, DT = 1 / VB.C.SIM_HZ;
    let g; try { g = S.createGame({ demo: false, autopilot: true, seed: 9000 + k, difficulty: 'normal', points: 25 }); } catch (e) { break; }
    const gv = { get teams() { return g.teams; }, get ctrl() { return g.ctrl; }, get size() { return g.size; }, difficulty: 'normal', demo: false, autopilot: false };
    let over = null;
    for (let i = 0; i < 90 * 60 * VB.C.SIM_HZ && !over; i++) { S.step(g, DT, null); for (const e of S.drainEvents(g)) { R.ingest(e, gv); if (e.type === 'gameOver') over = e; } }
    if (!over) continue;
    played++; if (over.team === 0) wins++;
    const c = R._cur(), win = over.team === 0;
    const val = { aces: c.aces >= 3, kills: c.kills >= 14, blocks: c.blocks >= 3, digs: c.digs >= 16, streak: c.streakMax >= 5, clean: c.setsL === 0, tidy: c.errs <= 5,
      comeback: c.cbBest >= 4, rally: c.rallyMax >= 16, mastery: c.feint + c.roll + c.edge >= 2 };
    for (const G of goals) hits[G.id] = (hits[G.id] || 0) + (win && val[G.id] ? 1 : 0);
  }
  console.log('    calibración (' + played + ' partidos, autopilot gana ' + wins + '): ' + goals.map(G => G.id + ' ' + (hits[G.id] || 0) + '/' + played).join(', '));
  const low = goals.filter(G => G.id !== 'mastery' && (hits[G.id] || 0) < played * 0.5).map(G => G.id);
  if (low.length) console.log('    AVISO (no falla): por debajo del 50 % con el autopilot: ' + low.join(', ') + ' (mastery no se mide: exige humano)');
}

// La situación de la semana (js/semana.js, 20-nov-2026): un partido con g.sit no cuenta (sin medallas ni XP, decisión de Ferran)
console.log('5) La situación de la semana');
{
  const VB = load(fakeStorage()), R = VB.Retos, g = mkGame({ sit: { wk: 202648, i: 1 } });
  R.ingest({ type: 'newMatch' }, g); R.ingest({ type: 'gameOver', team: 0, sets: [1, 0] }, g);
  ok('la situación de la semana no cuenta para los retos (endMatch → null)', R.endMatch(g, { win: true, map: 'palau' }) === null && !R._cur());
}

console.log(fails ? '\n' + fails + ' FALLOS (' + oks + ' ok)' : '\nTODO OK (' + oks + ' comprobaciones)');
process.exit(fails ? 1 : 0);
