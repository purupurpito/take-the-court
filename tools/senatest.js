#!/usr/bin/env node
/* TAKE THE COURT — tools/senatest.js (owner: ui_main · idea «senas»)
 * Prueba de js/senas.js (señas del árbitro como pegatina y Cuaderno del árbitro). Node puro (vm):
 *  1) catálogo: 11 señas con id, nombre, palabra (≤ 12 caracteres), línea de reglamento (≤ 80) y silueta SVG (viewBox 0 0 48 48, sin
 *     colores: solo currentColor) · 2) of() con todas las combinaciones signal/reason de sim.js (y sin signal, por reason) ·
 *  3) partidos reales de la sim con autopilot (2v2 sala, 2v2 playa y 6v6): todo punto en el que ui.js presentPoint pondría el texto
 *     del árbitro (los mismos casos: REF_REASONS, «Saque / Balón a la red» y reason 'out'; sin el ace cuya recepción va a la red, el
 *     punto de castigo ni los que cierran set) tiene seña; y senas.js no toca la sim (ni g.rng ni el estado) · 4) audio.js: un pitido
 *     por seña (WH_SENA) con sonidos ya registrados; whistleEnd para el cierre de set y el tiempo muerto · 5) lo mismo en el motor
 *     (audio.js con el AudioContext simulado de audiotest): cada seña, UN pitido y el suyo; cierre de set, tiempo muerto y cambios (largos).
 * Uso: node tools/senatest.js [partidos por modo=6]   (acaba en «TODO OK» o sale con 1).
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
const NM = Math.max(1, +(process.argv[2] || 6));
let fails = 0, oks = 0;
function ok(name, cond, extra) { if (cond) { oks++; console.log('  ok   ' + name + (extra ? '  (' + extra + ')' : '')); } else { fails++; console.log('  FALLO ' + name + (extra ? '  (' + extra + ')' : '')); } }
const ctx = { console, Math, Date }; ctx.window = ctx; ctx.globalThis = ctx; vm.createContext(ctx);
for (const f of ['js/sim.js', 'js/ai.js', 'js/ai6.js', 'js/senas.js']) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
const VB = ctx.VB, S = VB.Sim, N = VB.Senas, DT = 1 / VB.C.SIM_HZ;

// ------------------------------------------------------------------ 1) catálogo
console.log('1) Catálogo');
{
  const IDS = ['fuera', 'tocado', 'cuatro', 'dobles', 'red', 'bajo', 'ataque', 'bloqueo', 'posicion', 'retraso', 'saque'];
  ok('11 señas, en este orden', N.LIST.length === 11 && N.LIST.map(s => s.id).join() === IDS.join(), N.LIST.map(s => s.id).join());
  ok('BY tiene todas', IDS.every(id => N.BY[id] && N.BY[id].id === id));
  const words = N.LIST.map(s => s.word).concat(['ANTENA', 'A LA RED', '5 SEGUNDOS']);
  ok('palabras en mayúsculas y de 12 caracteres o menos', words.every(w => w.length > 0 && w.length <= 12 && w === w.toUpperCase()), words.join(' · '));
  ok('BAJO LA RED (decisión de Ferran)', N.BY.bajo.word === 'BAJO LA RED');
  ok('reglas de 80 caracteres o menos y con punto final', N.LIST.every(s => s.rule && s.rule.length <= 80 && /\.$/.test(s.rule)), N.LIST.map(s => s.rule.length).join(','));
  ok('nombres para el álbum', N.LIST.every(s => s.name && s.name.length <= 28));
  const svgs = N.LIST.map(s => s.svg).concat([N.svg('retraso', '5 SEGUNDOS')]);
  ok('siluetas SVG con viewBox 0 0 48 48', svgs.every(v => /^<svg[^>]*viewBox="0 0 48 48"/.test(v) && /<\/svg>$/.test(v)));
  ok('siluetas sin colores (solo currentColor)', svgs.every(v => !/(fill|stroke)="(?!currentColor|none)[^"]*"/.test(v) && !/#[0-9a-f]{3,6}/i.test(v)));
  ok('siluetas distintas (y la de playa con 5 dedos)', new Set(svgs).size === svgs.length);
  ok('svg de una seña desconocida = cadena vacía', N.svg('nada') === '');
}

// ------------------------------------------------------------------ 2) of()
console.log('2) of(e)');
{
  const T = (e, id, word) => { const r = N.of(e); return id === null ? r === null : !!r && r.id === id && r.word === (word || N.BY[id].word); };
  const C = [
    [{ signal: 'out', reason: 'out' }, 'fuera'], [{ signal: 'out', reason: 'antenna' }, 'fuera', 'ANTENA'], [{ signal: 'antenna', reason: 'antenna' }, 'fuera', 'ANTENA'],
    [{ signal: 'touched', reason: 'out' }, 'tocado'], [{ signal: 'four', reason: 'four' }, 'cuatro'], [{ signal: 'double', reason: 'double' }, 'dobles'],
    [{ signal: 'net', reason: 'net' }, 'red'], [{ signal: 'netBall', reason: 'in', text: 'Saque a la red' }, 'red', 'A LA RED'],
    [{ signal: 'netBall', reason: 'out', text: 'Saque a la red' }, 'red', 'A LA RED'], [{ signal: 'in', reason: 'in', text: 'Balón a la red' }, 'red', 'A LA RED'],
    [{ signal: 'under', reason: 'under' }, 'bajo'],
    [{ signal: 'attackFault', reason: 'attackServe' }, 'ataque'], [{ signal: 'attackFault', reason: 'backAttack' }, 'ataque'],
    [{ signal: 'attackFault', reason: 'block' }, 'bloqueo'], [{ signal: 'attackFault', reason: 'backBlock' }, 'bloqueo'],
    [{ signal: 'attackFault', reason: 'position' }, 'posicion'],
    [{ signal: 'delay8', reason: 'serve' }, 'retraso'], [{ signal: 'delay5', reason: 'serve' }, 'retraso', '5 SEGUNDOS'], [{ signal: 'serveFault', reason: 'serve' }, 'saque'],
    [{ signal: 'in', reason: 'in', text: 'El balón cae en el campo rival' }, null], [{ signal: 'penalty', reason: 'penalty' }, null], [{ signal: '', reason: 'drill' }, null],
    // sin signal (eventos viejos): por reason, como arena.js
    [{ reason: 'double' }, 'dobles'], [{ reason: 'backBlock' }, 'bloqueo'], [{ reason: 'position' }, 'posicion'], [{ reason: 'antenna' }, 'fuera', 'ANTENA'],
    [{ reason: 'serve', text: 'Falta de saque: 8 segundos' }, 'retraso'], [{ reason: 'serve', text: 'Falta de saque: 5 segundos' }, 'retraso', '5 SEGUNDOS'],
    [{ reason: 'serve', text: 'Falta de saque: el balón cae sin golpearlo' }, 'saque'], [{ reason: 'in' }, null]
  ];
  let bad = [];
  C.forEach(c => { if (!T(c[0], c[1], c[2])) bad.push(JSON.stringify(c[0]) + ' → ' + JSON.stringify(N.of(c[0]))); });
  ok(C.length + ' combinaciones signal/reason', !bad.length, bad.join(' | '));
  ok('of(null), of({}) y of("x") = null', N.of(null) === null && N.of({}) === null && N.of('x') === null);
}

// ------------------------------------------------------------------ 3) partidos de la sim
console.log('3) Partidos de la sim (' + NM + ' por modo)');
{
  const REF_REASONS = { net: 1, antenna: 1, double: 1, four: 1, under: 1, attackServe: 1, block: 1, serve: 1, backAttack: 1, backBlock: 1, position: 1 };
  const MODES = [['2v2 sala', {}], ['2v2 playa', { venue: 'beach' }], ['6v6', { format: '6v6' }]];
  const seen = {}, miss = [];
  let refPts = 0, pts = 0, touched = 0, rngChecked = 0;
  for (const [name, o] of MODES) {
    let mp = 0, mr = 0;
    for (let m = 0; m < NM; m++) {
      const g = S.createGame(Object.assign({ seed: 7000 + m * 13 + name.length, autopilot: true }, o)), ev = [];
      for (let i = 0; i < 600 * 120 && !g.finished; i++) {
        S.step(g, DT, null); ev.length = 0; S.drainEvents(g, ev);
        for (const e of ev) {
          if (e.type !== 'point') continue;
          pts++; mp++;
          if (e.penalty || e.setWon || e.matchWon) continue;
          const txt = e.text || '', ref = !!REF_REASONS[e.reason] || /^(Saque|Balón) a la red$/.test(txt);
          if (!(ref || e.reason === 'out')) continue;
          if (e.how === 'ace' && /^Balón a la red$/.test(txt)) continue;   // excepción: sigue en texto (la recepción va a la red)
          refPts++; mr++;
          const st = g.rng.get() + '|' + g.time + '|' + g.score.join() + '|' + JSON.stringify(e), r = N.of(e);   // (g.rng.get(): estado del azar sin gastarlo)
          if (g.rng.get() + '|' + g.time + '|' + g.score.join() + '|' + JSON.stringify(e) !== st) touched++;
          rngChecked++;
          if (!r) miss.push(name + ': ' + e.reason + '/' + e.signal + ' «' + txt + '»');
          else seen[r.id + ':' + r.word] = (seen[r.id + ':' + r.word] || 0) + 1;
        }
      }
    }
    console.log('       ' + name + ': ' + mp + ' puntos, ' + mr + ' con texto del árbitro');
  }
  ok('todo punto con texto del árbitro tiene seña (' + refPts + ' de ' + pts + ' puntos)', refPts > 20 && !miss.length, miss.slice(0, 6).join(' | '));
  ok('salen varias señas distintas', Object.keys(seen).length >= 4, Object.keys(seen).map(k => k + '×' + seen[k]).join(' '));
  ok('of() no toca el azar ni el estado de la sim ni el evento', typeof VB.Sim.createGame({ seed: 1 }).rng.get === 'function' && rngChecked > 0 && touched === 0, rngChecked + ' llamadas comprobadas');
  ok('la sim no carga senas.js (sim.js no lo nombra)', !/Senas/.test(fs.readFileSync(path.join(ROOT, 'js/sim.js'), 'utf8')));
}

// ------------------------------------------------------------------ 4) pitido por seña (audio.js WH_SENA, lectura estática)
console.log('4) Pitido por seña');
{
  const A = fs.readFileSync(path.join(ROOT, 'js/audio.js'), 'utf8');
  const m = A.match(/var WH_SENA = \{([\s\S]*?)\};/), keys = {}, snd = new Set();
  if (m) m[1].replace(/(\w+): \['(\w+)', ([\d.]+), ([\d.]+)\]/g, (x, k, so, r, gn) => { keys[k] = [so, +r, +gn]; snd.add(so); return x; });
  ok('WH_SENA tiene un pitido para cada seña', !!m && N.LIST.every(x => keys[x.id]), Object.keys(keys).join(','));
  ok('solo sonidos ya registrados (whistle / whistleLong)', snd.size > 0 && [...snd].every(n => A.indexOf("reg('" + n + "'") >= 0), [...snd].join(','));
  ok('tono y ganancia razonables (0,9-1,1 · ≤ 0,6)', Object.values(keys).every(v => v[1] >= 0.9 && v[1] <= 1.1 && v[2] > 0.3 && v[2] <= 0.6));
  ok('el cierre de set sigue con whistleEnd (la seña solo sin longWhistle)', A.indexOf("e.reason === 'point' && !longWhistle && frame.sena") >= 0);
  ok('tiempo muerto y cambio: pitido largo (whistleEnd)', A.indexOf("case 'timeout': if (!demo) whistle('whistleEnd'") >= 0 && A.indexOf("case 'sub': if (!demo && !frame.subWh) { frame.subWh = true; whistle('whistleEnd'") >= 0);
}

// ------------------------------------------------------------------ 5) pitido por seña EN EL MOTOR (audio.js con el AudioContext simulado de audiotest)
(async () => {
  console.log('5) Pitido por seña en el motor (contexto simulado)');
  try {
    const AT = require('./audiotest.js');
    const L = AT.loadAudio(path.join(ROOT, 'js/audio.js')), A = L.VB.Audio, mock = AT.makeMock();
    new Function('window', fs.readFileSync(path.join(ROOT, 'js/senas.js'), 'utf8'))(L.root);   // VB.Senas en el mismo VB que audio.js
    L.root.AudioContext = mock.Ctx; L.root.requestIdleCallback = fn => setImmediate(() => fn({ timeRemaining: () => 50, didTimeout: false }));
    L.root.setTimeout = setTimeout; L.root.clearTimeout = clearTimeout;
    const vctx = { camera: { position: { x: 0, y: 4, z: 9 } }, state: 'playing', timeScale: 1, settings: {} };
    A.init(vctx); A.onGameStart({ demo: false }); A.onState('playing'); A.unlock();
    for (let i = 0; i < 40000 && A.ready() < 1; i++) await new Promise(r => setImmediate(r));
    const C = mock.started[0].src.context, g = { mode: 'point', players: [], rally: { t: 3, hits: 3 }, serving: 0, matchPoint: -1, setPoint: -1, lastKind: 'pass', difficulty: 'normal' };
    const WH = ['whistle', 'whistleLong', 'whistleEnd'], whOf = b => WH.find(n => (A._bank(n) || []).indexOf(b) >= 0) || '';
    const whs = m => mock.started.slice(m).filter(x => !x.cancelled && whOf(x.src.buffer)).map(x => ({ n: whOf(x.src.buffer), r: x.src.playbackRate.value }));
    /** Silbatos que arrancan al tratar el frame [whistle de punto, point] */
    const frame = pe => { C.currentTime += 20; const m = mock.started.length; A.handle([{ type: 'whistle', reason: 'point' }, Object.assign({ type: 'point', team: 0, how: 'error', rallyHits: 2 }, pe)], g); return whs(m); };
    const wsrc = fs.readFileSync(path.join(ROOT, 'js/audio.js'), 'utf8').match(/var WH_SENA = \{([\s\S]*?)\};/)[1], WS = {};
    wsrc.replace(/(\w+): \['(\w+)', ([\d.]+), ([\d.]+)\]/g, (x, k, so, r) => { WS[k] = [so, +r]; return x; });
    const CASES = [['dobles', { reason: 'double', signal: 'double', text: 'Dobles' }], ['cuatro', { reason: 'four', signal: 'four', text: 'Cuatro toques' }],
      ['fuera', { reason: 'out', signal: 'out', text: 'Remate fuera' }], ['red', { reason: 'net', signal: 'net', text: 'Toque de red' }],
      ['retraso', { reason: 'serve', signal: 'delay8', text: 'Falta de saque: 8 segundos' }], ['saque', { reason: 'serve', signal: 'serveFault', text: 'Falta de saque' }],
      ['bajo', { reason: 'under', signal: 'under', text: 'Balón por debajo de la red' }], ['posicion', { reason: 'position', signal: 'attackFault', text: 'Falta de posición' }]];
    const bad = [], seen = [];
    for (const [id, pe] of CASES) {
      const w = frame(pe);
      seen.push(id + ':' + w.map(x => x.n + '×' + x.r.toFixed(2)).join('+'));
      // jit(0.02): el tono real va a ±2 % del de la tabla
      if (w.length !== 1 || w[0].n !== WS[id][0] || Math.abs(w[0].r / WS[id][1] - 1) > 0.021) bad.push(id);
    }
    ok('cada seña suena con UN solo pitido, el suyo (WH_SENA: sonido y tono)', !bad.length, (bad.length ? 'mal: ' + bad.join(',') + ' · ' : '') + seen.join(' '));
    const ws = frame({ reason: 'double', signal: 'double', text: 'Dobles', setWon: true });
    ok('el punto que cierra el set: un solo pitido, whistleEnd (no el de la seña)', ws.length === 1 && ws[0].n === 'whistleEnd', ws.map(x => x.n).join('+'));
    const wi = frame({ reason: 'in', signal: 'in', how: 'kill', text: 'El balón cae en el campo rival' });
    ok('punto sin seña (remate dentro): el pitido de siempre (whistleLong)', wi.length === 1 && wi[0].n === 'whistleLong', wi.map(x => x.n).join('+'));
    C.currentTime += 20; let m = mock.started.length; A.handle([{ type: 'timeout', team: 1, dur: 30 }], g); const wt = whs(m);
    ok('tiempo muerto: un pitido largo (whistleEnd)', wt.length === 1 && wt[0].n === 'whistleEnd', wt.map(x => x.n).join('+'));
    C.currentTime += 20; m = mock.started.length; A.handle([{ type: 'sub', team: 0 }, { type: 'sub', team: 1 }], g); const wb = whs(m);
    ok('dos cambios en el mismo frame: un solo pitido, largo (whistleEnd)', wb.length === 1 && wb[0].n === 'whistleEnd', wb.map(x => x.n).join('+'));
  } catch (err) { ok('pitido por seña en el motor', false, String(err && err.stack || err).slice(0, 300)); }
  console.log(fails ? '\n' + fails + ' FALLOS (' + oks + ' ok)' : '\nTODO OK (' + oks + ' comprobaciones)');
  process.exit(fails ? 1 : 0);
})();
