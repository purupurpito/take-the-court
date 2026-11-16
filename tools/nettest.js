#!/usr/bin/env node
/* VOLEY 3D — tools/nettest.js  (owner: net)
 * Fase 1a del online (notes/net.md): dos VB.Net.Session unidas por memPair (latencia, variación, pérdida y reordenación simuladas),
 * cada una en su PROPIO contexto vm (sim.js + ai.js + ai6.js + net.js con su Math), con relojes desfasados y frames con tirones.
 * Juegan dos bots de solo entrada (VB.Net.bot), uno por máquina, leyendo la partida PREDICHA (lo que ve cada jugador).
 *   (1) RTT 0 / 60 / 120 / 250 ms, variación, 5 % de pérdida: huellas de gc iguales en todos los controles, PRUEBA DE ORO (una partida
 *       offline con las mismas entradas en los tics de su sello da exactamente el mismo estado: stateHash cada segundo y huella
 *       canónica completa cada 10 s y al final), la del invitado igual a la del anfitrión, congelaciones, profundidad de rollback y CPU.
 *   (2) Reparación: ruido de 1e-9 en Math.hypot del invitado y estado tocado a mano (balón 5 cm): la huella falla, el anfitrión manda
 *       la foto, se repara en menos de 1 s y sigue coincidiendo.
 *   (3) Desconexión: corte de 3 s (espera y sigue), de 15 s (a los 10 s se ofrece seguir contra la IA; la elige el anfitrión, el
 *       invitado o los dos; al volver la red, resync con foto y el MISMO partido en los dos), de 70 s (pasados 60 s cada lado juzga:
 *       el anfitrión gana, el invitado «no cuenta», y no cambia al volver), recarga del invitado, abandono, salir tras el final (no
 *       cambia el resultado) y un botón pulsado con la partida congelada (se descarta: nada de saltos «fantasma»).
 * Uso: node tools/nettest.js [--quick]     (sale con código 1 si algo falla)
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
const QUICK = process.argv.includes('--quick');
const SRC = ['js/sim.js', 'js/ai.js', 'js/ai6.js', 'js/net.js'].map(f => [f, fs.readFileSync(path.join(ROOT, f), 'utf8')]);
function load(hypotNoise) {
  const ctx = { console };   // Math, Date… propios del contexto: el ruido de uno no toca al otro
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  ctx.VB = { VERSION: 'test' };
  if (hypotNoise) vm.runInContext('(function(){ var h = Math.hypot; Math.hypot = function(){ return h.apply(Math, arguments) * (1 + ' + hypotNoise + '); }; })()', ctx);
  for (const [f, s] of SRC) vm.runInContext(s, ctx, { filename: f });
  return ctx.VB;
}
let fails = 0, oks = 0;
function check(name, ok, info) {
  if (ok) oks++; else fails++;
  console.log((ok ? '  ok   ' : '  FALLO ') + name + (info !== undefined ? ' ' + (typeof info === 'string' ? info : JSON.stringify(info)) : ''));
}
const _f64 = new Float64Array(1), _u32 = new Uint32Array(_f64.buffer);
/** Huella canónica EXACTA (como mptest): claves ordenadas, bits de cada double, jugadores por id. Sin events/opts/replay. */
function deepHash(g) {
  let h = 2166136261 >>> 0;
  const mix = (v) => { h = Math.imul(h ^ (v >>> 0), 16777619) >>> 0; };
  const str = (s) => { for (let i = 0; i < s.length; i++) mix(s.charCodeAt(i)); mix(0xff); };
  const players = new Set(g.players);
  const SK = { events: 1, opts: 1, replay: 1, rng: 1 }, seen = new Set();
  function walk(v, top) {
    if (typeof v === 'number') { if (v !== v) { mix(12); return; } _f64[0] = v; mix(1); mix(_u32[0]); mix(_u32[1]); return; }   // (NaN: el signo/carga de sus bits no es estado: 0/0 y la foto dan NaN con bits distintos)
    if (typeof v === 'string') { mix(2); str(v); return; }
    if (typeof v === 'boolean') { mix(v ? 3 : 4); return; }
    if (v === undefined) { mix(5); return; }
    if (v === null) { mix(6); return; }
    if (typeof v === 'function') { mix(7); return; }
    if (!top && players.has(v)) { mix(8); mix(v.id); return; }
    if (seen.has(v)) { mix(9); return; }
    seen.add(v);
    if (Array.isArray(v)) { mix(10); mix(v.length); for (const x of v) walk(x, false); }
    else { mix(11); for (const k of Object.keys(v).sort()) { if ((top === 'g' && SK[k]) || v[k] === undefined) continue; str(k); walk(v[k], false); } }   // (clave a undefined = clave ausente: copyGame no borra claves, las pone a undefined)
    seen.delete(v);
  }
  walk(g, 'g');
  for (const p of g.players) walk(p, true);
  mix(g.rng.get());
  return h >>> 0;
}

/** Un partido en red simulado. cfg: {rtt, jit, loss, secs, seed, venue, noiseB, mutateAt, cut: {at, ms, aiAt, reloadAt}} */
function run(cfg) {
  const A = load(0), Bv = load(cfg.noiseB || 0);
  let T = 0;
  const [la, lb] = A.Net.memPair({ lag: cfg.rtt, jit: cfg.jit, loss: cfg.loss, seed: cfg.seed, clock: () => T });
  const opts = { online: true, seed: 5000 + cfg.seed, venue: cfg.venue || 'beach', bestOf: 3, humans: [{}, {}], present: true, stats: true };
  const logA = [], logB = [], deepA = {}, deepB = {}, msgs = [];
  const log = m => { if (process.env.NETLOG) console.log('    ' + (T / 1000).toFixed(2) + ' ' + m); msgs.push(m); };
  const mkA = () => new A.Net.Session({ slot: 0, link: la, opts, name: 'Anfitrión', record: true, hashLog: logA, log,
    onTick: (t, g) => { if (t % 1200 === 0) deepA[t] = deepHash(g); } });
  const mkB = () => new Bv.Net.Session({ slot: 1, link: lb, opts: null, name: 'Invitado', hashLog: logB, log,
    onTick: (t, g) => { if (t % 1200 === 0) deepB[t] = deepHash(g); } });
  const sA = mkA(); let sB = mkB();
  const off = [0, 123456.7];   // relojes de las dos máquinas (performance.now de cada página)
  const botA = A.Net.bot(0, cfg.seed, 'bueno'); let botB = Bv.Net.bot(1, cfg.seed + 1, 'bueno');
  const fr = A.Net.mulberry(cfg.seed * 31 + 7);
  const next = [0, 3.3];
  const cpu = [], st = { waitFrames: [0, 0], unstable: [0, 0], canAIat: [-1, -1], status: {}, err: null, gameOver: false, maxDepth: 0, events: [0, 0], conf: [0, 0] };
  let mutated = -1, repairedAt = -1, cutDone = false, aiDone = false, reloaded = false, resyncAt = -1, lastSync = 0;
  const aiWho = (cfg.cut && cfg.cut.who) || 'host', aiSide = [false, false];
  const END = cfg.secs * 1000;
  while (T < END) {
    const k = next[0] <= next[1] ? 0 : 1;
    T = next[k];
    next[k] += 16.667 + (fr() * 2 - 1) * 1.5 + (fr() < 0.01 ? 35 : 0);
    // guion
    if (cfg.cut && !cutDone && T >= cfg.cut.at * 1000) { cutDone = true; la.down(cfg.cut.ms); log('corte de ' + cfg.cut.ms + ' ms'); }
    if (cfg.cut && cfg.cut.reloadAt && !reloaded && T >= cfg.cut.reloadAt * 1000) {
      reloaded = true; la.flush(); sB = mkB(); botB = Bv.Net.bot(1, cfg.seed + 2, 'bueno'); log('el invitado recarga la página');
    }
    if (cfg.mutateAt && mutated < 0 && T >= cfg.mutateAt * 1000 && sB.gc && sB.gc.mode === 'rally') { sB.gc.ball.x += 0.05; mutated = T; log('estado del invitado tocado'); }
    const s = k ? sB : sA, bt = k ? botB : botA;
    const inp = s.gp ? bt(s.gp) : null;
    const t0 = process.hrtime.bigint();
    let r;
    try { r = s.advance(T + off[k], inp); } catch (e) { st.err = e; break; }
    const us = Number(process.hrtime.bigint() - t0) / 1000;
    if (r.status === 'playing' || r.status === 'waiting') cpu.push(us);
    st.status[k + ':' + r.status] = (st.status[k + ':' + r.status] || 0) + 1;
    if (r.status === 'waiting') st.waitFrames[k]++;
    if (r.unstable) st.unstable[k]++;
    if (r.canAI && st.canAIat[k] < 0) st.canAIat[k] = T;
    st.events[k] += r.events.length; st.conf[k] += r.confirmed.length;
    if (cfg.cut && cfg.cut.aiAt && !aiSide[k] && T >= cfg.cut.aiAt * 1000 && r.canAI && (aiWho === 'both' || (aiWho === 'host') === (k === 0))) {
      aiSide[k] = s.vsAI(); aiDone = aiSide[0] || aiSide[1]; log((k ? 'el invitado' : 'el anfitrión') + ' sigue contra la IA');
    }
    if (mutated >= 0 && repairedAt < 0 && sB.repaired > 0) repairedAt = T;
    if ((sA.stats.resyncs || sB.stats.resyncs) && resyncAt < 0) resyncAt = T;
    if (r.confirmed.some(e => e.type === 'gameOver')) st.gameOver = true;
    if (sA.status === 'over' && sB.status === 'over' && sA.gcTick === sB.gcTick) break;
  }
  st.aiSide = aiSide;
  // (bots fuera: unos frames más sin entradas nuevas para que los dos confirmen lo mismo)
  st.maxDepth = Math.max(sA.stats.maxDepth, sB.stats.maxDepth);
  cpu.sort((a, b) => a - b);
  const pct = q => cpu.length ? cpu[Math.min(cpu.length - 1, Math.floor(cpu.length * q))] : 0;
  return { A, B: Bv, sA, sB, opts, logA, logB, deepA, deepB, st, cpu: { avg: cpu.reduce((a, b) => a + b, 0) / (cpu.length || 1), p99: pct(0.99), max: pct(1) },
    mutated, repairedAt, resyncAt, msgs, T };
}

/** Prueba de oro: partida offline con las entradas que confirmó el anfitrión, tic a tic. Devuelve {n, badHash, badDeep}. */
function golden(R) {
  const S = R.A.Sim, D = R.A.Net.decode, g = S.createGame(R.opts), rec = R.sA.rec;
  const ins = [{ move: [0, 0] }, { move: [0, 0] }], hl = {}, out = { n: 0, badHash: 0, badDeep: 0, checked: 0, deepChecked: 0, first: -1 };
  for (const [t, h] of R.logA) hl[t] = h;
  for (let t = 0; t < rec.length; t++) {
    const r = rec[t]; if (!r) { out.first = t; break; }
    D(r[0], r[1], r[2], ins[0]); D(r[3], r[4], r[5], ins[1]);
    S.step(g, 1 / 120, ins); g.events.length = 0; out.n = t + 1;
    const tk = t + 1;
    if (hl[tk] !== undefined) { out.checked++; if ((S.stateHash(g) >>> 0) !== hl[tk]) out.badHash++; }
    if (R.deepA[tk] !== undefined) { out.deepChecked++; if (deepHash(g) !== R.deepA[tk]) out.badDeep++; }
  }
  out.finalOk = out.n === R.sA.gcTick ? deepHash(g) === deepHash(R.sA.gc) : null;
  return out;
}
/** Huellas de los dos lados en los tics comunes (desde el tic `from`). */
function cmpHashes(R, from) {
  const hb = {}; for (const [t, h] of R.logB) hb[t] = h;
  let n = 0, bad = 0, firstBad = -1;
  for (const [t, h] of R.logA) { if (t < (from || 0) || hb[t] === undefined) continue; n++; if (hb[t] !== h) { bad++; if (firstBad < 0) firstBad = t; } }
  let dn = 0, dbad = 0; const dticks = [];
  for (const t in R.deepA) { if (+t < (from || 0) || R.deepB[t] === undefined) continue; dn++; if (R.deepA[t] !== R.deepB[t]) { dbad++; dticks.push(+t); } }
  return { n, bad, firstBad, dn, dbad, dticks };
}
const fmt = x => Math.round(x * 10) / 10;
const t0 = Date.now();

console.log('== (1) partido en red con bots: RTT 0 / 60 / 120 / 250 ms, variación, 5 % de pérdida ==');
const SECS = QUICK ? 90 : 300;
for (const [rtt, jit] of [[0, 5], [60, 20], [120, 20], [250, 20]]) {
  const R = run({ rtt, jit, loss: 5, secs: SECS, seed: 11 + rtt, venue: rtt % 120 ? 'hall' : 'beach' });
  const tag = 'RTT ' + rtt + ' ±' + jit + ' 5 %: ';
  check(tag + 'sin excepciones', !R.st.err, R.st.err ? String(R.st.err.stack).split('\n').slice(0, 3).join(' | ') : undefined);
  if (R.st.err) continue;
  const c = cmpHashes(R, 0), G = golden(R);
  check(tag + 'huellas de gc iguales en los dos lados', c.n > 30 && c.bad === 0, { controles: c.n, distintas: c.bad, profundas: c.dn, profDistintas: c.dbad });
  check(tag + 'PRUEBA DE ORO: offline con las mismas entradas = partida en red', G.checked > 30 && G.badHash === 0 && G.badDeep === 0 && G.finalOk === true,
    { tics: G.n, huellas: G.checked, profundas: G.deepChecked, mal: G.badHash + G.badDeep, final: G.finalOk });
  check(tag + 'sin reparaciones', R.sA.mismatches === 0 && R.sB.repaired === 0, { mismatches: R.sA.mismatches });
  const waits = R.sA.stats.waits + R.sB.stats.waits;
  if (rtt <= 120) check(tag + 'cero congelaciones', waits === 0 && R.st.waitFrames[0] + R.st.waitFrames[1] === 0, { esperas: waits, frames: R.st.waitFrames });
  else check(tag + 'congelaciones raras (< 1 % de frames)', (R.st.waitFrames[0] + R.st.waitFrames[1]) < 0.01 * (R.T / 16.7) * 2, { esperas: waits, frames: R.st.waitFrames });
  check(tag + 'eventos presentados en los dos lados', R.st.events[0] > 100 && R.st.events[1] > 100, R.st.events);
  console.log('        partido ' + fmt(R.T / 1000) + ' s' + (R.st.gameOver ? ' (acabado)' : '') + ' · ' + R.sA.gc.sets.join('-') + ' sets, ' + R.sA.gc.score.join('-') +
    ' · rollback máx ' + R.st.maxDepth + ' tics · CPU por frame media ' + fmt(R.cpu.avg) + ' µs, p99 ' + fmt(R.cpu.p99) + ' µs, máx ' + fmt(R.cpu.max / 1000) + ' ms' +
    ' · ' + fmt(R.sA.stats.bytesOut / (R.T / 1000)) + ' B/s · ping ' + Math.round(R.sA.rtt) + ' ms');
}

console.log('== (2) reparación por instantánea del anfitrión ==');
{
  const R = run({ rtt: 60, jit: 20, loss: 5, secs: QUICK ? 60 : 120, seed: 77, mutateAt: 30 });
  check('estado del invitado tocado (balón 5 cm): sin excepciones', !R.st.err, R.st.err ? String(R.st.err.stack).split('\n').slice(0, 3).join(' | ') : undefined);
  if (!R.st.err) {
    check('la huella falla y el anfitrión manda la foto', R.sA.mismatches >= 1 && R.sB.repaired >= 1, { mismatches: R.sA.mismatches, reparaciones: R.sB.repaired });
    check('reparado en menos de 1 s', R.repairedAt > 0 && R.repairedAt - R.mutated < 1000, { ms: fmt(R.repairedAt - R.mutated) });
    const c = cmpHashes(R, Math.round((R.repairedAt / 1000 + 2) * 120));
    check('después sigue coincidiendo bit a bit (huellas y huella canónica)', c.n > 10 && c.bad === 0 && c.dn > 0 && c.dbad === 0, c);
    const G = golden(R);
    check('anfitrión = offline con las mismas entradas', G.badHash === 0 && G.badDeep === 0 && G.finalOk === true, { tics: G.n, mal: G.badHash + G.badDeep });
    check('1 reparación: el partido sigue siendo válido', R.sB.valid && R.sA.valid);
  }
}
{
  const R = run({ rtt: 60, jit: 20, loss: 5, secs: QUICK ? 60 : 120, seed: 78, noiseB: 1e-9 });
  check('ruido de 1e-9 en Math.hypot del invitado (otro motor): sin excepciones', !R.st.err, R.st.err ? String(R.st.err.stack).split('\n').slice(0, 3).join(' | ') : undefined);
  if (!R.st.err) {
    const c = cmpHashes(R, 0);
    // (con ruido los bits difieren siempre: la huella redondeada a 1e-6 casi nunca; si falla, se repara y vuelve a coincidir)
    const last = R.logA.length ? R.logA[R.logA.length - 1][0] : 0, cl = cmpHashes(R, last - 120 * 5);
    check('ruido: las huellas (1e-6) coinciden o se reparan y vuelven a coincidir', cl.n >= 3 && cl.bad === 0, { controles: c.n, distintas: c.bad, reparaciones: R.sB.repaired, ultimas5: cl });
    const G = golden(R);
    check('ruido: anfitrión = offline con las mismas entradas', G.badHash === 0 && G.finalOk === true, { tics: G.n });
    console.log('        ruido: ' + R.sB.repaired + ' reparaciones en ' + fmt(R.T / 1000) + ' s');
  }
}

console.log('== (3) desconexión ==');
{
  const R = run({ rtt: 60, jit: 10, loss: 2, secs: 60, seed: 91, cut: { at: 30, ms: 3000 } });
  check('corte de 3 s: sin excepciones', !R.st.err, R.st.err ? String(R.st.err.stack).split('\n').slice(0, 3).join(' | ') : undefined);
  if (!R.st.err) {
    check('corte de 3 s: los dos esperan («esperando al rival») y avisan de conexión inestable', R.st.waitFrames[0] > 60 && R.st.waitFrames[1] > 60 && R.st.unstable[0] > 0, { esperas: R.st.waitFrames, inestable: R.st.unstable });
    check('corte de 3 s: no se ofrece seguir contra la IA (< 10 s)', R.st.canAIat[0] < 0 && R.st.canAIat[1] < 0);
    const c = cmpHashes(R, 0), G = golden(R);
    check('corte de 3 s: sigue igual en los dos lados y = offline', c.bad === 0 && c.n > 40 && G.badHash === 0 && G.finalOk === true, { huellas: c.n, mal: c.bad, oro: G.badHash });
    check('corte de 3 s: vuelve a jugar (los dos pasan de 50 s de partido)', R.sA.gcTick > 50 * 120 && R.sB.gcTick > 50 * 120, { a: R.sA.gcTick, b: R.sB.gcTick });
  }
}
{
  const R = run({ rtt: 60, jit: 10, loss: 2, secs: 85, seed: 92, cut: { at: 30, ms: 15000, aiAt: 41 } });
  check('corte de 15 s: sin excepciones', !R.st.err, R.st.err ? String(R.st.err.stack).split('\n').slice(0, 3).join(' | ') : undefined);
  if (!R.st.err) {
    const w = (R.st.canAIat[0] - 30000) / 1000;
    check('corte de 15 s: a los ~10 s se ofrece «Seguir contra la IA»', w > 9.5 && w < 11, { s: fmt(w) });
    check('corte de 15 s: el anfitrión sigue contra la IA y al volver la red hay resync con foto', R.sA.stats.resyncs === 1 && R.sB.stats.resyncs === 1 && R.resyncAt > 45000, { resyncs: [R.sA.stats.resyncs, R.sB.stats.resyncs], s: fmt(R.resyncAt / 1000) });
    const c = cmpHashes(R, Math.round((R.resyncAt / 1000 + 1) * 120)), G = golden(R);
    check('corte de 15 s: después del resync los dos coinciden y el anfitrión = offline', c.n > 10 && c.bad === 0 && c.dbad === 0 && G.badHash === 0 && G.finalOk === true, { huellas: c.n, mal: c.bad, oro: G.badHash });
    check('corte de 15 s: el invitado vuelve a mandar (su hueco deja la IA)', R.sA.gc.hum[1].ai === false, { ai: R.sA.gc.hum[1].ai });
  }
}
for (const who of ['guest', 'both']) {   // (revisión de la fase 1: la elección del invitado ya no acaba el partido del anfitrión)
  const R = run({ rtt: 60, jit: 10, loss: 2, secs: 85, seed: 94, cut: { at: 30, ms: 15000, aiAt: 41, who } });
  const nm = 'corte de 15 s, IA elegida por ' + (who === 'guest' ? 'el invitado' : 'los dos');
  check(nm + ': sin excepciones', !R.st.err, R.st.err ? String(R.st.err.stack).split('\n').slice(0, 3).join(' | ') : undefined);
  if (!R.st.err) {
    check(nm + ': eligió la IA y al volver la red hay UN resync (rejoin) y los dos siguen jugando', R.st.aiSide[1] && (who === 'guest' || R.st.aiSide[0]) &&
      R.sA.stats.resyncs === 1 && R.sB.stats.resyncs === 1 && R.sA.status === 'playing' && R.sB.status === 'playing' && !R.sA.solo && !R.sB.solo,
      { ia: R.st.aiSide, resyncs: [R.sA.stats.resyncs, R.sB.stats.resyncs], st: [R.sA.status, R.sB.status] });
    // (desde el tic del resync: antes, cada lado jugó su parte contra la IA y lo que confirmó no es del otro)
    const c = cmpHashes(R, Math.max(R.sA.syncFloor, R.sB.syncFloor) + 1), G = golden(R);
    check(nm + ': después los dos coinciden, sin reparaciones, válido y = offline', c.n > 10 && c.bad === 0 && c.dbad === 0 && R.sB.repaired === 0 &&
      R.sA.valid && R.sB.valid && !R.sA.result && !R.sB.result && G.badHash === 0 && G.finalOk === true,
      { huellas: c.n, mal: c.bad, dbad: c.dbad, rep: R.sB.repaired, valid: [R.sA.valid, R.sB.valid], res: [R.sA.result, R.sB.result], oro: G.badHash, fin: G.finalOk });
  }
}
{
  const R = run({ rtt: 60, jit: 10, loss: 2, secs: 115, seed: 95, cut: { at: 30, ms: 70000, aiAt: 41, who: 'host' } });
  check('corte de 70 s: sin excepciones', !R.st.err, R.st.err ? String(R.st.err.stack).split('\n').slice(0, 3).join(' | ') : undefined);
  if (!R.st.err) {
    const a = R.sA.result || {}, b = R.sB.result || {};
    check('corte de 70 s (el anfitrión eligió la IA): a los 60 s el anfitrión gana (rivalGone) y el invitado no cuenta (hostGone)',
      a.why === 'rivalGone' && a.win === true && R.sA.valid && b.why === 'hostGone' && b.win === false && !R.sB.valid, { a: R.sA.result, b: R.sB.result, valid: [R.sA.valid, R.sB.valid] });
    check('corte de 70 s: al volver la red no cambia nada (sin resync; los dos siguen contra la IA)', R.sA.stats.resyncs === 0 && R.sB.stats.resyncs === 0 && R.sA.solo && R.sB.solo,
      { resyncs: [R.sA.stats.resyncs, R.sB.stats.resyncs] });
  }
}
{
  const R = run({ rtt: 60, jit: 10, loss: 2, secs: 60, seed: 93, cut: { at: 30, ms: 5000, reloadAt: 32 } });
  check('recarga del invitado: sin excepciones', !R.st.err, R.st.err ? String(R.st.err.stack).split('\n').slice(0, 3).join(' | ') : undefined);
  if (!R.st.err) {
    check('recarga del invitado: sesión nueva, saludo, reloj y resync con la foto del anfitrión', R.sB.stats.resyncs === 1 && R.sB.gcTick > 50 * 120, { resyncs: R.sB.stats.resyncs, tic: R.sB.gcTick });
    const c = cmpHashes(R, Math.round((R.resyncAt / 1000 + 1) * 120)), G = golden(R);
    check('recarga del invitado: después los dos coinciden y el anfitrión = offline', c.n > 10 && c.bad === 0 && c.dbad === 0 && G.badHash === 0 && G.finalOk === true, { huellas: c.n, mal: c.bad, oro: G.badHash });
  }
}
{ // abandono
  const A = load(0), Bv = load(0); let T = 0;
  const [la, lb] = A.Net.memPair({ lag: 40, clock: () => T });
  const opts = { online: true, seed: 1, venue: 'hall', humans: [{}, {}] };
  const sA = new A.Net.Session({ slot: 0, link: la, opts }), sB = new Bv.Net.Session({ slot: 1, link: lb, opts: null });
  for (; T < 6000; T += 16.667) { sA.advance(T, null); sB.advance(T + 50, null); }
  sB.quit();
  for (let i = 0; i < 10; i++, T += 16.667) { sA.advance(T, null); sB.advance(T + 50, null); }
  check('abandono: el que se va pierde y al rival le cuenta como victoria', sB.result && sB.result.why === 'quit' && sA.status === 'ended' && sA.result && sA.result.win === true, { a: sA.result, b: sB.result });
  { // salir tras el final (main.js: «Volver al menú» en la hoja final llama a quit): no cambia el resultado de ninguno
    const A3 = load(0), B3 = load(0); let T3 = 0;
    const [m1, m2] = A3.Net.memPair({ lag: 40, clock: () => T3 });
    const o3 = { online: true, seed: 3, venue: 'hall', bestOf: 1, points: 11, humans: [{}, {}] };
    const h3 = new A3.Net.Session({ slot: 0, link: m1, opts: o3 }), g3 = new B3.Net.Session({ slot: 1, link: m2, opts: null });
    const b1 = A3.Net.bot(0, 3, 'bueno'), b2 = B3.Net.bot(1, 4, 'bueno');
    for (; T3 < 600000 && !(h3.status === 'over' && g3.status === 'over'); T3 += 16.667) { h3.advance(T3, h3.gp ? b1(h3.gp) : null); g3.advance(T3 + 5, g3.gp ? b2(g3.gp) : null); }
    const before = [JSON.stringify(h3.result), JSON.stringify(g3.result)];
    h3.quit();
    for (let i = 0; i < 20; i++, T3 += 16.667) { h3.advance(T3, null); g3.advance(T3 + 5, null); }
    check('salir tras el final: el resultado no cambia en ninguno de los dos', h3.result && h3.result.why === 'over' && before[0] === JSON.stringify(h3.result) &&
      before[1] === JSON.stringify(g3.result) && g3.status === 'over' && h3.result.win !== g3.result.win, { a: h3.result, b: g3.result, antes: before, t: Math.round(T3 / 1000), st: [h3.status, g3.status] });
  }
  { // botón pulsado con la partida congelada: se descarta (no se aplica al volver la red)
    const A4 = load(0), B4 = load(0); let T4 = 0;
    const [n1, n2] = A4.Net.memPair({ lag: 40, seed: 3, clock: () => T4 });
    const o4 = { online: true, seed: 1, venue: 'beach', humans: [{}, {}] };
    const s4 = [new A4.Net.Session({ slot: 0, link: n1, opts: o4 }), new B4.Net.Session({ slot: 1, link: n2 })];
    const nx = [0, 3.3]; let at = -1, cut4 = false;
    while (T4 < 12000) {
      const k = nx[0] <= nx[1] ? 0 : 1; T4 = nx[k]; nx[k] += 16.667;
      if (!cut4 && T4 > 5000) { cut4 = true; n1.down(2000); }
      let inp = null;
      if (k === 0 && s4[0].status === 'waiting' && at < 0) { inp = { move: [0, 0], jump: true }; at = s4[0].localTick; }
      s4[k].advance(T4, inp);
    }
    const M = s4[0].mine, J = A4.Net.BITS.jump; let found = 0;
    for (let t = at; t < at + 400; t++) if (M.has(t) && (M.B[t & 8191] & J)) found++;
    check('salto pulsado con la partida congelada: no se guarda ni se aplica al volver la red', at > 0 && found === 0 && s4[0].localTick > at + 300, { tic: at, guardados: found });
  }
  // versión distinta
  const A2 = load(0), B2 = load(0); B2.VERSION = 'otra'; T = 0;
  const [l1, l2] = A2.Net.memPair({ lag: 20, clock: () => T });
  const h = new A2.Net.Session({ slot: 0, link: l1, opts }), gq = new B2.Net.Session({ slot: 1, link: l2, opts: null });
  for (; T < 2000; T += 16.667) { h.advance(T, null); gq.advance(T, null); }
  check('versión distinta: no se juega («otra versión del juego»)', h.status === 'ended' && gq.status === 'ended' && h.result.why === 'version', { h: h.status, g: gq.status });
  // códec
  const N = A.Net, pk = N.unpackInputs(N.packInputs((() => { const r = new (function () { this.X = new Int16Array(8192); this.Y = new Int16Array(8192); this.B = new Uint8Array(8192); })(); r.X[5] = -32767; r.Y[5] = 123; r.B[5] = 127; return r; })(), 5, 1, 9, 77));
  check('códec: paquete de entradas ida y vuelta (int16 + bits)', pk && pk.first === 5 && pk.n === 1 && pk.v[0] === -32767 && pk.v[1] === 123 && pk.v[2] === 127 && pk.ack === 9 && pk.tick === 77);
  const d = N.decode(N.q16(0.5), N.q16(-1), N.bitsOf({ hit: true, ai: true }));
  check('códec: cuantización y bits (hit, ai)', d.move[0] === N.q16(0.5) / 32767 && d.move[1] === -1 && d.hit && d.ai && !d.jump);
}

console.log('\n' + oks + ' ok, ' + fails + ' fallos (' + ((Date.now() - t0) / 1000).toFixed(1) + ' s)');
process.exit(fails ? 1 : 0);
