#!/usr/bin/env node
/* MAKE THE CUT — tools/simtest.js  (owner: sim)
 * Test headless de la simulación: carga js/sim.js y js/ai.js en un contexto vm
 * (sin DOM ni THREE) y ejecuta:
 *   1) CPU vs CPU (demo) -> estadísticas de rally, toques, motivos, calidad
 *   2) Autopilot (equipo humano por IA normal) contra cada dificultad
 *   3) Fuzz con entrada humana aleatoria
 *   4) Bots "humanos" que juegan SOLO con la entrada real (mover/golpear/saltar) con un modelo de jugador
 *      en tercera persona (reacción lognormal, error de lectura que crece con el vuelo y la distancia,
 *      malas lecturas, timing con σ por habilidad, inercia del stick): perfecto / bueno / medio / novato
 *      (primera sesión) contra los 4 niveles -> % de puntos y probabilidad estimada de ganar el partido
 *   5) Reglas puntuales (4 toques, dobles, sets, red, antena, saque, bloqueo...) y vocabulario del árbitro
 *   6) Ritual del sacador CPU (SIM-04): en cada saque de cada partida (ritualChecker) y casos propios
 *   7) Calibración del highlight (SIM-05): 20 partidos completos CPU vs CPU con histograma, banda 15-25 % de puntos >= 0,55,
 *      < 5 % >= 0,8 fuera de punto de set/partido, cobertura de señal/landSide/pausa/ritual/dribble y determinismo por semilla
 * Sale con código != 0 si hay excepciones o invariantes rotos.
 * Uso: node tools/simtest.js [minutos=20] [seed=12345] [minutosMatriz=20] [semillas=4]
 *   La matriz (dificultades y bots) va en paralelo con worker_threads.
 *   minutosMatriz = minutos de juego por semilla y casilla (0 = saltar matriz); semillas = partidas por casilla.
 *   SIMTEST_ONLY=matrix: solo la matriz. MATRIX_FILTER='novato vs easy|medio vs normal': solo esas casillas.
 *   SIMTEST_ONLY=e1: solo la sección «Maestría (E1)». SIMTEST_MASTERY=1: la matriz con createGame({mastery:true}) (la CPU lee la finta
 *   y usa golpe colocado / colocación a un lado); SIMTEST_MASTERY=2: además los bots usan finta, colocado, filo y colocación dirigida.
 *   SIMTEST_ONLY=colocar: solo la sección «Colocar por destino (C2)» (SIMTEST_COL=b,c filtra las pruebas).
 *   SIMTEST_ONLY=gym: solo la sección «Gimnasio (E6)» (createGame({drill}): ejercicios y peloteo libre).
 *   SIMTEST_DJUMP=1: la matriz de los bots con createGame({djump:true}) (salto con impulso, v1.12.0): los bots corren hacia la red y
 *   saltan sin soltar la dirección en una parte de sus ataques (BOT_DJ) y la tabla añade toques de red cada 100 puntos y % de remates
 *   con impulso (hit.mom >= 0,5). SIMTEST_JSETAIM=1: además createGame({jsetAim:true}) (la diana sin mover: nada cambia).
 *   SIMTEST_DJBOT=1: el mismo bot de BOT_DJ con la sim SIN djump (A/B de la sim con la misma entrada).
 *   SIMTEST_ONLY=replay: solo la sección «[repetición]» (S3-C1: copyGame, stateHash, resim idéntica; SIMTEST_RP_SECS = s por partido, 180).
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm'), os = require('os');
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const ROOT = path.join(__dirname, '..');
const MIN = +(process.argv[2] || 20), SEED = +(process.argv[3] || 12345), BOTMIN = +(process.argv[4] != null ? process.argv[4] : 20);
const NSEED = Math.max(1, +(process.argv[5] || 4)); // semillas por casilla de la matriz (se suman)
// SIMTEST_ONLY=matrix: solo la matriz (afinado); MATRIX_FILTER=<regex>: solo las casillas cuya etiqueta encaje
// SIMTEST_ROOKIE=all: el bot novato juega TODOS los partidos con la ayuda de primer partido (medir rookieProf);
// SIMTEST_ROOKIE=off: ninguno. Por defecto solo el primero, como el juego real (main.js isRookie).
const ROOKIE_MODE = process.env.SIMTEST_ROOKIE || 'first';
const MASTERY_MODE = +(process.env.SIMTEST_MASTERY || 0); // E1: 1 = matriz con mastery (la CPU), 2 = y los bots la usan
const DJUMP_MODE = process.env.SIMTEST_DJUMP === '1', JSETAIM_MODE = process.env.SIMTEST_JSETAIM === '1'; // salto con impulso (v1.12.0)
// SIMTEST_DJBOT=1: el bot que corre hacia la red (BOT_DJ) también SIN djump en la sim: A/B con el mismo bot y la misma entrada, para
// separar el efecto de la sim (SIMTEST_DJBOT=1 frente a SIMTEST_DJUMP=1) del de la forma de jugar del bot
const DJBOT_MODE = DJUMP_MODE || process.env.SIMTEST_DJBOT === '1';
const ONLY = process.env.SIMTEST_ONLY || '', MFILTER = process.env.MATRIX_FILTER ? new RegExp(process.env.MATRIX_FILTER) : null;

function load() {
  const ctx = { console, Math, Date };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  for (const f of ['js/sim.js', 'js/ai.js', 'js/ai6.js']) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  return ctx.VB;
}
const VB = load();
if (process.env.SIMTEST_MOMSPD) VB.MOM.spd = +process.env.SIMTEST_MOMSPD; // (afinado del salto con impulso: bonus del remate, m/s)
const S = VB.Sim, C = VB.C;
const DT = 1 / C.SIM_HZ;
let failures = 0;
const fail = m => { failures++; console.error('FALLO:', m); };
const KNOWN = ['hit', 'block', 'net', 'land', 'point', 'set', 'match', 'gameOver', 'whistle', 'jump', 'switch', 'serveReady',
  'sideout', 'newSet', 'bounce', 'swing', 'landPlayer', 'newMatch', 'toss', 'miss', 'dive', 'netTouch', 'courtChange', 'dribble', 'juggle', 'challenge', 'challengeResult',
  'rotation', 'libero', 'blockPress', 'feint', 'drillStage', 'drillRep', 'drillEnd']; // (feint: E1, solo con createGame({mastery:true})) // (rotation y libero, solo 6v6; blockPress = GOLPEAR en el aire en el bloqueo, sim.js blockPress)
const pct = (a, b) => b ? (100 * a / b).toFixed(1) + '%' : '-';
// Vocabulario del árbitro (FCVB): cada motivo de punto con sus textos válidos. Un texto nuevo debe pasar por aquí.
const POINT_TEXTS = {
  in: ['El balón cae en tu campo', 'El balón cae en el campo rival', 'Saque a la red', 'Balón a la red'],
  // (out también admite 'Saque a la red'/'Balón a la red': da en la red y cae fuera en el propio campo)
  out: ['Saque fuera', 'Remate fuera', 'Dejada fuera', 'Pokey fuera', 'Recepción fuera', 'Defensa fuera', 'Colocación fuera', 'Balón fuera', 'Toca el bloqueo y sale fuera', 'Le da en el cuerpo y sale fuera', 'Saque a la red', 'Balón a la red'],
  antenna: ['Balón toca la antena', 'Balón por fuera de la antena'], under: ['Balón por debajo de la red'],
  double: ['Dobles: el mismo jugador toca dos veces', 'Dobles en la colocación de dedos'], four: ['4 toques'], net: ['Toque de red'], block: ['Bloqueo del saque'],
  attackServe: ['Ataque sobre el saque'], serve: ['Falta de saque: 8 segundos', 'Falta de saque: 5 segundos', 'Falta de saque: el balón cae sin golpearlo'],
  position: ['Falta de posición'] // (solo 6v6, lote A: el humano solapado en el golpe de saque; la IA nunca)
};
const badText = new Set();
// Señales oficiales del árbitro (SIM-02, point.signal): lista cerrada
// (netBall: balón a la red que no pasa, FIVB 19, con reason 'in'/'out'; delay5: retraso del saque en la playa, cinco dedos)
const SIGNALS = ['in', 'out', 'touched', 'four', 'double', 'net', 'under', 'antenna', 'attackFault', 'delay8', 'delay5', 'serveFault', 'netBall'];
const SIG_OF = { in: ['in', 'netBall'], out: ['out', 'touched', 'netBall'], four: ['four'], double: ['double'], net: ['net'], under: ['under'], antenna: ['antenna'],
  attackServe: ['attackFault'], block: ['attackFault'], serve: ['delay8', 'delay5', 'serveFault'], position: ['attackFault', 'serveFault'] }; // (position reutiliza una señal ya pintada)
const isInt0 = v => Number.isInteger(v) && v >= 0;
/** Comprueba los campos de presentación de un evento point (SIM-01/02/03/05). ctx = {streak, setPoint, matchPoint (del
 *  serveReady), eight}. Además de cada campo por separado, RECOMPONE el highlight con S.highlightOf a partir de lo que el test
 *  sabe por su cuenta (cómo, toques, defensas, racha contada, punto de set/partido del serveReady, final apretado calculado del
 *  marcador, salvado, set/partido ganado) y exige el mismo número: un término que se cuele en la sim sin pasar por la fórmula
 *  publicada, o un campo que no cuadre con el número, falla aquí. Devuelve la lista de problemas (vacía si todo cuadra). */
function pointFieldIssues(e, g, ctx) {
  const bad = [];
  if (!(typeof e.highlight === 'number' && e.highlight >= 0 && e.highlight <= 1)) bad.push('highlight ' + e.highlight);
  if (!isInt0(e.digs)) bad.push('digs ' + e.digs);
  if (!isInt0(e.streak) || e.streak < 1) bad.push('streak ' + e.streak);
  if (ctx && ctx.streak != null && e.streak !== ctx.streak) bad.push('streak ' + e.streak + ' != ' + ctx.streak + ' (contado en el test)');
  if (typeof e.savedSetPoint !== 'boolean') bad.push('savedSetPoint ' + e.savedSetPoint);
  if (ctx && ctx.setPoint != null && e.savedSetPoint !== (ctx.setPoint === 1 - e.team)) bad.push('savedSetPoint ' + e.savedSetPoint + ' con punto de set de ' + ctx.setPoint);
  if (e.how === 'error' && !e.setWon && !e.matchWon && e.highlight > 0.35 + 1e-9) bad.push('error con highlight ' + e.highlight);
  // final apretado (SIM-05): marcador de ANTES del punto, últimos HL.clutchLast puntos del set y diferencia <= HL.clutchGap
  if (typeof e.clutch !== 'boolean') bad.push('clutch ' + e.clutch);
  else if (g && Array.isArray(e.score)) {
    const s0 = e.score[0] - (e.team === 0 ? 1 : 0), s1 = e.score[1] - (e.team === 1 ? 1 : 0), tgt = g.setNo === 3 ? 15 : 25;
    const want = Math.max(s0, s1) >= tgt - VB.HL.clutchLast && Math.abs(s0 - s1) <= VB.HL.clutchGap;
    if (e.clutch !== want) bad.push('clutch ' + e.clutch + ' con ' + s0 + '-' + s1 + ' (set ' + g.setNo + ')');
    if (ctx && ctx.setPoint != null && ctx.matchPoint != null && typeof e.rallyHits === 'number') {
      // remate perfecto del humano: el único término que el test no puede saber desde fuera (lo lee de g, como la sim)
      const pk = e.how === 'kill' && g.atkHow === 'kill' && !!g.atkHuman && g.atkGrade === 'perfect';
      const h = S.highlightOf({ how: e.how, rallyHits: e.rallyHits, digs: e.digs, perfectKill: pk, setPoint: ctx.setPoint !== -1, matchPoint: ctx.matchPoint !== -1,
        clutch: want, saved: ctx.setPoint === 1 - e.team, streak: ctx.streak != null ? ctx.streak : e.streak, setWon: e.setWon, matchWon: e.matchWon });
      if (h !== e.highlight) bad.push('highlight ' + e.highlight + ' != fórmula ' + h);
    }
  }
  if (!SIGNALS.includes(e.signal)) bad.push('señal fuera de la lista: ' + e.signal);
  else if (!(SIG_OF[e.reason] || []).includes(e.signal)) bad.push('señal ' + e.signal + ' para el motivo ' + e.reason);
  if ((e.signal === 'touched') !== (e.touchedOut === true) || typeof e.touchedOut !== 'boolean') bad.push('touched/touchedOut ' + e.signal + '/' + e.touchedOut);
  if (e.reason === 'serve' && /^delay[58]$/.test(e.signal) !== /^Falta de saque: [58] segundos$/.test(e.text)) bad.push('8 s: señal ' + e.signal + ' con "' + e.text + '"');
  if (e.reason === 'serve' && /^delay[58]$/.test(e.signal) && e.signal !== (/5 segundos/.test(e.text) ? 'delay5' : 'delay8')) bad.push('retraso: señal ' + e.signal + ' con "' + e.text + '"');
  if (e.reason === 'serve' && /^delay[58]$/.test(e.signal) && g && g.serveClock !== 0) bad.push(e.signal + ' con el reloj de saque en ' + g.serveClock);
  // SAQUE a la red que no pasa (texto «Saque a la red»): seña netBall; el resto de balones a la red, dentro / fuera (remate: Guidelines
  // 28.11.4) / tocado. Infractor (faultTeam) solo si no es un bote normal: el remate a la red que sale fuera en su campo lo tiene
  if ((e.signal === 'netBall') !== (e.text === 'Saque a la red')) bad.push('netBall: señal ' + e.signal + ' con "' + e.text + '"');
  // tocado (28.11.2-3): siempre sale en el campo del último que lo tocó, que pierde el punto
  if (e.touchedOut && e.landSide !== 1 - e.team) bad.push('tocado con el bote en el campo ' + e.landSide + ' (pierde ' + (1 - e.team) + ')');
  const netAtk = e.signal === 'out' && e.text === 'Balón a la red';
  const ft = (e.signal === 'in' || e.signal === 'out') && !netAtk ? -1 : 1 - e.team;
  if (e.faultTeam !== ft) bad.push('faultTeam ' + e.faultTeam + ' (esperado ' + ft + ') con ' + e.signal);
  if (e.faultPlayer != null && (e.faultTeam < 0 || e.faultPlayer.team !== e.faultTeam)) bad.push('faultPlayer de otro equipo con faultTeam ' + e.faultTeam);
  if (e.player && e.faultPlayer !== e.player) bad.push('faultPlayer no es el infractor que viaja (player)');
  const landed = e.reason === 'in' || e.reason === 'out';
  if (landed ? !(e.landSide === 0 || e.landSide === 1) : e.landSide !== -1) bad.push('landSide ' + e.landSide + ' con ' + e.reason);
  if (landed && g && g.lastLand && e.landSide !== (g.lastLand.x > 0 ? 0 : 1)) bad.push('landSide no es el campo del bote');
  // pausa: la clásica sin g.present; con g.present la de presentación (VB.HOLD)
  const H = VB.HOLD, eight = ctx && ctx.eight;
  const want = g && g.present ? (e.matchWon ? H.match : e.setWon ? H.set : (e.highlight >= H.bigAt ? H.big : H.routine) + (eight ? H.eight : 0))
    : (e.matchWon ? 2.2 : e.setWon ? 3.6 : (g && g.demo ? VB.RITUAL.demoHold : 1.9) + (eight ? 1.4 : 0)); // demo: pausa rutinaria corta (SIM-04)
  if (Math.abs(e.hold - want) > 1e-9) bad.push('hold ' + e.hold + ' (esperado ' + want + ')');
  const lp = g && g.lastPoint;
  if (lp && (lp.highlight !== e.highlight || lp.signal !== e.signal || lp.hold !== e.hold || lp.digs !== e.digs || lp.streak !== e.streak || lp.landSide !== e.landSide || lp.clutch !== e.clutch)) bad.push('g.lastPoint no copia el evento');
  return bad;
}

function checkInvariants(g, tag) {
  const b = g.ball;
  for (const v of [b.x, b.y, b.z, b.vx, b.vy, b.vz]) if (!Number.isFinite(v)) { fail(tag + ' balón no finito'); return false; }
  for (const p of g.players) {
    if (!Number.isFinite(p.x + p.y + p.z)) { fail(tag + ' jugador no finito'); return false; }
    if (p.x * S.side(p.team) < 0.19) { fail(tag + ' jugador invade el campo rival'); return false; }
    if (p.z === 0 && p.x * S.side(p.team) < 0.34) { fail(tag + ' jugador pisa la línea central'); return false; }
  }
  if (g.touches > 3 && g.mode === 'rally' && g.lastKind !== 'serve') { fail(tag + ' más de 3 toques sin falta'); return false; }
  if (!g.ctrl || g.ctrl.team !== 0) { fail(tag + ' ctrl no es del equipo humano'); return false; }
  return true;
}

function newCounters() { const o = {}; for (const k of KNOWN) o[k] = 0; return o; }

/** Ritual del sacador CPU (SIM-04), comprobado en CADA saque de una partida (se llama tras cada paso con sus eventos):
 *  - CPU: g.cpuTossIn decrece de forma monótona desde el serveReady y vale 0 en el paso del toss; el lanzamiento llega
 *    a los g.whistleAt + ritual.dur (≤ RITUAL.tossBy desde el serveReady) y con el reloj de 8 s en ≥ 3 s; tantos `dribble`
 *    como ritual.bounces, cada uno con el balón en el suelo (z = BR) y tras él el balón vuelve a la altura de la mano;
 *    la duración del ritual en [minDur, maxDur]; 1-3 botes.
 *  - Humano: sin ritual (cpuTossIn -1, ritual.on false, ningún `dribble`).
 *  - Fuera del saque: cpuTossIn -1 y ritual apagado. */
function ritualChecker(label) {
  const R = VB.RITUAL, st = { serves: 0, cpu: 0, human: 0, dribbles: 0, minClock: 9, maxToss: 0, bad: 0, nb: [0, 0, 0, 0] };
  let cur = null;
  const bad = m => { if (st.bad++ < 4) fail(label + ' ritual: ' + m); };
  st.step = (g, evs) => {
    for (const e of evs) {
      if (e.type === 'serveReady') {
        st.serves++;
        const cpu = !S.isHuman(g, e.player), r = g.ritual;
        cur = { cpu, t0: e.t, last: g.cpuTossIn, n: 0, bounces: r.bounces, dur: r.dur, low: false, back: false };
        // (el primer serveReady lo emite createGame: se ve tras el primer paso, de ahí el + g.serveT)
        if (cpu) {
          st.cpu++;
          if (!r.on || r.player !== e.player || r.phase !== 'wait') bad('CPU sin ritual al poner el saque');
          if (!(r.bounces >= 1 && r.bounces <= 3)) bad('botes ' + r.bounces);
          if (!(r.dur >= R.minDur - 1e-9 && r.dur <= R.maxDur + 1e-9)) bad('duración ' + r.dur);
          if (!(Math.abs(g.cpuTossIn + g.serveT - Math.min(R.tossBy, g.whistleAt + r.dur)) < 1e-9) || Math.abs(g.timer - g.cpuTossIn) > 1e-9) bad('cpuTossIn ' + g.cpuTossIn + ' / timer ' + g.timer);
          st.nb[r.bounces]++;
        } else {
          st.human++;
          if (r.on || g.cpuTossIn !== -1) bad('humano con ritual (cpuTossIn ' + g.cpuTossIn + ')');
        }
      }
      if (e.type === 'dribble') {
        st.dribbles++;
        if (!cur || !cur.cpu) { bad('dribble sin saque de la CPU'); continue; }
        cur.n++;
        if (e.player !== g.server || Math.abs(g.ball.z - C.BR) > 1e-9) bad('dribble con el balón a ' + g.ball.z.toFixed(3) + ' m');
        if (e.n !== cur.n || e.of !== cur.bounces) bad('dribble ' + e.n + '/' + e.of + ' (contados ' + cur.n + '/' + cur.bounces + ')');
      }
      if (e.type === 'toss' && cur) {
        if (cur.cpu) {
          const tt = e.t - cur.t0;
          if (g.cpuTossIn !== 0) bad('cpuTossIn ' + g.cpuTossIn + ' en el toss');
          if (g.serveClock < 3) bad('lanzamiento con el reloj de saque en ' + g.serveClock.toFixed(2) + ' s');
          if (tt > R.tossBy + 1e-6 || Math.abs(tt - Math.min(R.tossBy, g.whistleAt + cur.dur)) > 1.5 * DT) bad('lanzamiento a los ' + tt.toFixed(3) + ' s (dur ' + cur.dur.toFixed(3) + ')');
          if (cur.n !== cur.bounces) bad(cur.n + ' dribbles de ' + cur.bounces);
          if (!cur.low || !cur.back) bad('el balón no bota (bajo ' + cur.low + ', vuelve ' + cur.back + ')');
          if (g.serveClock < st.minClock) st.minClock = g.serveClock; if (tt > st.maxToss) st.maxToss = tt;
        } else if (g.cpuTossIn !== -1) bad('cpuTossIn ' + g.cpuTossIn + ' en un toss humano');
        cur.tossed = true;
      }
    }
    if (g.mode === 'serve' && cur && !cur.tossed) {
      if (cur.cpu) {
        if (g.cpuTossIn > cur.last + 1e-9 || g.cpuTossIn < 0) bad('cpuTossIn no decrece: ' + cur.last + ' -> ' + g.cpuTossIn);
        cur.last = g.cpuTossIn;
        if (g.ritual.phase === 'dribble' && g.ball.z <= C.BR + 0.06) cur.low = true;
        if (cur.low && g.ritual.phase !== 'dribble' && g.ball.z >= R.relZ - 0.05) cur.back = true;
        if (g.serveState === 'ready' && g.ball.held !== g.server) bad('balón fuera de la mano del sacador durante el ritual');
      } else if (g.cpuTossIn !== -1 || g.ritual.on) bad('saque humano con cpuTossIn ' + g.cpuTossIn);
    } else if (g.mode !== 'serve' && (g.cpuTossIn !== -1 || g.ritual.on)) bad('cpuTossIn ' + g.cpuTossIn + ' / ritual en modo ' + g.mode);
  };
  return st;
}

/** Ejecuta `seconds` de juego. inputFn(g) devuelve la entrada humana o null. */
function run(label, opts, seconds, inputFn, quiet) {
  const g = S.createGame(Object.assign({ stats: true, seed: SEED }, opts));
  const ev = newCounters(), evs = [], serveTakeoff = [];
  let steps = Math.round(seconds / DT), lastSamePlayer = null, sameTouch = 0, matches = 0, setsSeen = 0, matchWins = [0, 0];
  let ghost = 0, stalePr = 0, lateSw = 0, blkSwitch = 0, spikeCtl = null; const fresh = {};
  let revoked = 0; // challenges que revocan el punto: endReview vuelve a pitarlo (otro evento point para el mismo peloteo)
  const dj = { hs: 0, mom: 0, net: 0, djJ: 0 }; // salto con impulso: remates del humano, con impulso (mom >= 0,5), toques de red, saltos con dirección
  const aiFaults = []; // dobles / 4 toques cometidos por la IA (equipo CPU o compañero IA del humano): deben ser 0
  const hls = [], sigs = {}, pf = { streakT: -1, streakN: 0, setPoint: -1, matchPoint: -1, issues: 0, digs: 0, maxDigs: 0 };
  const rit = ritualChecker(label);
  const t0 = Date.now();
  try {
    for (let i = 0; i < steps; i++) {
      const preSp = Math.hypot(g.ball.vx, g.ball.vy, g.ball.vz), preT = g.pr1.t; // lo que ve la sim al decidir el cambio
      S.step(g, DT, inputFn ? inputFn(g, i) : null);
      evs.length = 0; S.drainEvents(g, evs);
      rit.step(g, evs);
      for (const e of evs) {
        // campos de presentación del punto (SIM-01/02/03), contrastados con un recuento propio
        if (e.type === 'newSet' || e.type === 'newMatch') { pf.streakT = -1; pf.streakN = 0; }
        if (e.type === 'serveReady') { pf.setPoint = e.setPoint; pf.matchPoint = e.matchPoint; }
        // challenge (B2): el punto anulado se vuelve a pitar; el recuento propio vuelve al de antes de ese punto
        if (e.type === 'challenge') pf.rev = true;
        if (e.type === 'challengeResult') { pf.rev = false; if (e.overturned) revoked++; }
        if (e.type === 'point') {
          if (pf.rev && pf.prev) { Object.assign(pf, pf.prev); pf.rev = false; }
          pf.prev = { streakT: pf.streakT, streakN: pf.streakN, setPoint: pf.setPoint, matchPoint: pf.matchPoint };
          if (pf.streakT === e.team) pf.streakN++; else { pf.streakT = e.team; pf.streakN = 1; }
          const eight = evs.some(x => x.type === 'courtChange' && x.why === 'eight');
          const bad = pointFieldIssues(e, g, { streak: pf.streakN, setPoint: pf.setPoint, matchPoint: pf.matchPoint, eight });
          if (Math.abs(g.timer - e.hold) > 1e-9) bad.push('g.timer ' + g.timer + ' != hold ' + e.hold);
          if (bad.length && pf.issues++ < 5) fail(label + ' campos del punto: ' + bad.join('; ') + ' ' + JSON.stringify({ reason: e.reason, how: e.how, text: e.text, score: e.score }));
          hls.push(e.highlight); sigs[e.signal] = (sigs[e.signal] || 0) + 1; pf.digs += e.digs; if (e.digs > pf.maxDigs) pf.maxDigs = e.digs;
        }
        if (!(e.type in ev)) fail('evento desconocido ' + e.type); else ev[e.type]++;
        if (e.type === 'hit' && e.human && e.kind === 'spike') { dj.hs++; if (e.mom >= 0.5) dj.mom++; }
        if (e.type === 'netTouch') dj.net++;
        if (e.type === 'jump' && e.dir) dj.djJ++;
        if (!Number.isFinite(e.t)) fail('evento sin t ' + e.type);
        if (e.type === 'hit') {
          if (!(e.quality >= 0 && e.quality <= 1) || !e.grade) fail('hit sin calidad válida');
          if (e.kind !== 'serve') { if (lastSamePlayer === e.player && e.touch > 1) sameTouch++; lastSamePlayer = e.player; }
        }
        if (e.type === 'block') lastSamePlayer = null; // tras bloqueo se puede volver a tocar
        if (e.type === 'jump' && g.mode === 'serve' && g.serveJump) serveTakeoff.push(e.player.x * S.side(e.player.team));
        if (e.type === 'point') lastSamePlayer = null;
        if (e.type === 'point' && (e.reason === 'double' || e.reason === 'four')) {
          const ft = 1 - e.team, human = !g.demo && !g.autopilot && ft === 0 && e.player === g.ctrl;
          if (!human) aiFaults.push(e.reason + ' eq' + ft + ' t=' + e.t.toFixed(2));
        }
        if (e.type === 'point' && !(POINT_TEXTS[e.reason] || []).includes(e.text) && !badText.has(e.reason + e.text)) { badText.add(e.reason + e.text); fail(label + ' texto de punto fuera del vocabulario: ' + e.reason + ' "' + e.text + '"'); }
        if (e.type === 'match') { matches++; matchWins[e.team]++; }
        if (e.type === 'set') setsSeen++;
        // cambio automático con balón rápido a < 0,6 s del contacto (la cámara se deslizaría durante la defensa)
        if (e.type === 'switch' && e.auto && !e.reset && preSp > 12 && preT < 0.6 && g.mode === 'rally') lateSw++;
        // remate de la CPU con el humano en el bloqueo: el control no salta al defensor hasta el toque siguiente
        if (e.type === 'hit' && e.kind === 'spike' && e.team === 1 && !g.demo && !g.autopilot) spikeCtl = g.defRole === 'block' ? g.ctrl : null;
        // (solo cambios AUTOMÁTICOS: si el jugador pulsa CAMBIAR él mismo tras el remate, es su decisión; el fuzz lo hace al azar)
        if (e.type === 'switch' && e.auto && spikeCtl && e.from === spikeCtl && g.touchTeam === 1) blkSwitch++;
        if ((e.type === 'hit' && e.team === 0) || e.type === 'block' || e.type === 'point') spikeCtl = null;
      }
      // ningún remate atraviesa el volumen de manos de un bloqueador sin evento de bloqueo
      { const b = g.ball;
        if (g.mode === 'rally' && g.lastKind === 'spike' && Math.abs(b.x) <= 0.6 && g.blockCD <= 0)
          for (const q of g.players) if (q.z >= 0.15 && Math.abs(q.x) <= 1.1 && g.lastTeam !== q.team && Math.sign(b.vx) === S.side(q.team) && S._inBlockVol(q, b)) { ghost++; break; } }
      // tras un paso con toque, g.pr3/g.pr1 ya son las del balón nuevo
      if (g.mode === 'rally' && evs.some(e => e.type === 'hit' || e.type === 'block')) {
        S.predict(g, 3, fresh); if (Math.abs(fresh.x - g.pr3.x) + Math.abs(fresh.t - g.pr3.t) > 1e-9) stalePr++;
      }
      if (i % 60 === 0 && !checkInvariants(g, label)) break;
      if (opts.demo === false && g.finished) { // partido humano acabado: empezar otro
        // como main.js isRookie(): la ayuda del primer partido solo vale para el primero (SIMTEST_ROOKIE=all: en todos, para medirla)
        const ng = S.createGame(Object.assign({}, opts, { seed: SEED + i, stats: false, rookie: ROOKIE_MODE === 'all' ? opts.rookie : false }));
        ng.stats = g.stats; Object.assign(g, ng); g.stats = ng.stats;
      }
    }
  } catch (e) { fail(label + ' excepción: ' + (e && e.stack || e)); }
  const st = g.stats, r = st.rallies.slice().sort((a, b) => a - b);
  const med = r.length ? r[r.length >> 1] : 0, mean = r.length ? r.reduce((a, b) => a + b, 0) / r.length : 0;
  if (serveTakeoff.some(x => x < 9)) fail(label + ' saque en salto con despegue dentro del campo');
  if (!quiet) {
    console.log(`\n== ${label} (${(seconds / 60).toFixed(1)} min de juego, ${Date.now() - t0} ms reales) ==`);
    console.log('puntos', st.points, '(eq0', st.won[0], '/ eq1', st.won[1] + ')', '| sets cerrados', setsSeen, 'partidos', matches, JSON.stringify(matchWins));
    console.log('rally mediana', med.toFixed(2) + ' s', 'media', mean.toFixed(2) + ' s', 'p90', (r[Math.floor(r.length * 0.9)] || 0).toFixed(2) + ' s');
    console.log('toques', JSON.stringify(st.hits), 'bloqueos', st.blocks, JSON.stringify(st.blockKinds), 'planchas', st.dives);
    console.log('calidad', JSON.stringify(st.grades), 'humano', JSON.stringify(st.hgrades), 'fallos de gesto', st.misses);
    console.log('golpes', JSON.stringify(st.shots));
    console.log('motivos', JSON.stringify(st.why));
    console.log('cómo', JSON.stringify(st.how));
    console.log('eventos', JSON.stringify(ev));
    if (hls.length) {
      const hs = hls.slice().sort((a, b) => a - b), m = hs.reduce((a, b) => a + b, 0) / hs.length;
      console.log('highlight media', m.toFixed(3), 'p50', hs[hs.length >> 1].toFixed(2), 'p90', hs[Math.floor(hs.length * 0.9)].toFixed(2), 'máx', hs[hs.length - 1].toFixed(2),
        '>=0,55:', pct(hs.filter(h => h >= 0.55).length, hs.length), '| defensas de remate', pf.digs, '(máx. por punto ' + pf.maxDigs + ')', '| señales', JSON.stringify(sigs));
    }
    console.log('ritual (SIM-04): saques', rit.serves, '(CPU', rit.cpu, '/ humano', rit.human + ')', '| botes por saque', JSON.stringify(rit.nb.slice(1)),
      '| dribbles', rit.dribbles, '| lanzamiento CPU más tardío', rit.maxToss.toFixed(2) + ' s', '| reloj mínimo al lanzar', rit.cpu ? rit.minClock.toFixed(2) + ' s' : '-');
  }
  if (sameTouch) fail(label + ` mismo jugador tocó dos veces seguidas ${sameTouch} veces sin falta`);
  if (aiFaults.length) fail(label + ` la IA comete dobles/4 toques ${aiFaults.length} veces: ` + aiFaults.slice(0, 4).join(', '));
  if (ghost) fail(label + ` ${ghost} remates atraviesan las manos del bloqueador sin evento block`);
  if (stalePr) fail(label + ` g.pr3 vieja tras ${stalePr} toques`);
  if (lateSw) fail(label + ` ${lateSw} cambios automáticos de jugador con balón rápido a < 0,6 s del contacto`);
  if (blkSwitch) fail(label + ` el control salta del bloqueador al defensor ${blkSwitch} veces durante el ataque de la CPU`);
  const hlMean = hls.length ? hls.reduce((a, b) => a + b, 0) / hls.length : 0;
  if (rit.serves > 2 && !rit.cpu && !(opts.demo === false && !opts.autopilot && inputFn)) fail(label + ' ritual: ningún saque de la CPU');
  return { g, st, ev, med, mean, matches, setsSeen, matchWins, hlMean, hls, rit, dj, revoked };
}

// ---------- Probabilidad de partido a partir de la de punto (sets 25/25/15, dif. 2) ----------
function setWinProb(p, target) {
  const memo = new Map();
  function f(a, b) {
    if (a >= target && a - b >= 2) return 1; if (b >= target && b - a >= 2) return 0;
    if (a >= target - 1 && b >= target - 1 && a === b) { const q = 1 - p; return p * p / (p * p + q * q); } // deuce
    const k = a + ',' + b; if (memo.has(k)) return memo.get(k);
    const v = p * f(a + 1, b) + (1 - p) * f(a, b + 1); memo.set(k, v); return v;
  }
  return f(0, 0);
}
/** Estadística de la matriz (SIM-05), medida con 80 semillas × 20 min por casilla (8-nov-2026, `SIMTEST_ONLY=matrix node tools/simtest.js 0 <s> 20 1`,
 *  s = 1..80): [media de % de puntos, desviación típica de UNA semilla de 20 min]. Las bandas y diferencias mínimas se abren con el
 *  ruido real de la muestra: σ de la media = sd / √(semillas × minutos/20), banda = objetivo ± k·σ (k = 3,5: ~2·10⁻⁴ de falso fallo
 *  por comprobación). Las bandas fijas de antes (p. ej. novato/Fácil 0,40-0,51 con 4 semillas) tenían el borde a ~1,6σ de la media:
 *  remuestreando esas 80 semillas, el 14,7 % de las semillas del simtest fallaba la matriz sin haber cambiado nada (semillas 3 y 99);
 *  con esto, el 0,09 %. Las casillas de `key` juegan el doble de semillas para que su banda no se abra tanto.
 *  Si se recalibra la IA, volver a medir (tools/out: bucle de semillas + media y sd por casilla) y actualizar esta tabla. */
const MATRIX_STAT = {
  k: 3.5,
  key: new Set(['novato:easy', 'novato:normal', 'medio:normal', 'medio:hard', 'auto:normal', 'auto:hard', 'perfecto:expert']),
  sd: { 'novato:easy': [0.470, 0.051], 'novato:normal': [0.363, 0.052], 'medio:normal': [0.514, 0.053], 'medio:hard': [0.401, 0.040],
    'medio:expert': [0.238, 0.038], 'auto:normal': [0.592, 0.044], 'auto:hard': [0.495, 0.043], 'auto:expert': [0.250, 0.039],
    // perfecto:expert medido con la IA de 1.15.0 (19-nov-2026, 32 semillas × 20 min, semillas base 12345 y 777: 48,2 % y 49,1 %,
    // 2801 puntos); sd de una semilla = la binomial de ~88 puntos (las casillas medidas arriba tienen 0,038-0,053)
    'perfecto:expert': [0.486, 0.053] }
};
const mxN = (k) => (MATRIX_STAT.key.has(k) ? 2 : 1) * NSEED * BOTMIN / 20;
const mxSd = (k) => MATRIX_STAT.sd[k][1] / Math.sqrt(mxN(k));
/** Diferencia mínima exigida entre dos casillas: la de diseño `want`, salvo que la media medida menos k·σ quede por debajo. */
const mxGap = (a, b, want) => Math.min(want, MATRIX_STAT.sd[a][0] - MATRIX_STAT.sd[b][0] - MATRIX_STAT.k * Math.hypot(mxSd(a), mxSd(b)));
function matchWinProb(p) { const s = setWinProb(p, 25), t = setWinProb(p, 15); return s * s + 2 * s * (1 - s) * t; }

// ================= 4) Bots humanos (solo entrada real) =================
/* Modelo de jugador humano en TERCERA PERSONA (revisión 3). Antes los bots veían la jugada casi perfecta
 * (reacción fija, error de posición pequeño y constante): el equilibrio salía demasiado fácil. Ahora:
 *  react/rlog: reacción tras cada toque ~ lognormal (mediana react, dispersión rlog) + despistes (lapse)
 *  posErr:     error de lectura del punto de juego (m) que CRECE con el tiempo de vuelo que queda y con la
 *              distancia al balón y se corrige al acercarse; en profundidad (eje de la cámara) es depth× mayor
 *  wrong:      prob. de mala lectura (corto/largo al revés) que se corrige tarde (0,3-0,6 s)
 *  sigma/bias: timing de la pulsación (s); bias > 0 = tiende a pulsar pronto; fast = σ extra con balón rápido
 *  acc:        cambio máximo del stick por segundo (inercia del pulgar/teclas); stop = holgura al pararse (m)
 *  jumpOk:     prob. de acordarse de saltar para rematar (novato: a veces ataca desde el suelo)
 *  block, jumpServe, aim, gap: bloquea, saque en salto, apunta al azar, busca el hueco en el remate
 *  rookie:     primera sesión (createGame rookie:true: ayuda de Fácil y la CPU saca suave)
 *  camYaw:     error (grados, σ) del mapeo stick-cámara tras cada cambio de jugador: la cámara se desliza al nuevo
 *              jugador y el pulgar sigue con la referencia vieja; se corrige en 0,5 s
 *  netJump:    prob. por ataque rival de ir a la red a "bloquear" (sin saber: deja el campo y salta a destiempo)
 *  misSwitch:  prob. por trayectoria de pulsar CAMBIAR sin querer (en la colocación rival cambia el rol bloqueo/defensa)
 * El perfil 'perfecto' es la cota superior (casi sin errores de percepción): sirve para comprobar que la
 * habilidad cuenta y que Experto está a su alcance (hasta 1.14 le ganaba; con la IA de 1.15.0 saca ~49 %: ver la matriz). */
const BOTS = {
  perfecto: { react: 0.13, rlog: 0.1, lapse: 0, posErr: 0.12, depth: 1.1, wrong: 0, sigma: 0.02, bias: 0, fast: 0, acc: 40, stop: 0.08, jumpOk: 1, block: true, jumpServe: 0.7, aim: 0.8, gap: 0.6 },
  bueno: { react: 0.2, rlog: 0.2, lapse: 0.02, posErr: 0.45, depth: 1.4, wrong: 0.02, sigma: 0.045, bias: 0.01, fast: 0.3, acc: 12, stop: 0.1, jumpOk: 0.98, block: true, jumpServe: 0.5, aim: 0.6, gap: 0.45 },
  medio: { react: 0.26, rlog: 0.25, lapse: 0.05, posErr: 0.8, depth: 1.5, wrong: 0.06, sigma: 0.07, bias: 0.02, fast: 0.4, acc: 8, stop: 0.14, jumpOk: 0.93, block: true, jumpServe: 0.3, aim: 0.45, gap: 0.2 },
  novato: { react: 0.34, rlog: 0.3, lapse: 0.1, posErr: 1.2, depth: 1.6, wrong: 0.12, sigma: 0.11, bias: 0.04, fast: 0.5, acc: 5, stop: 0.2, jumpOk: 0.75, block: false, jumpServe: 0.05, aim: 0.15, gap: 0, rookie: true,
    camYaw: 22, netJump: 0.1, misSwitch: 0.01 } // solo el novato: medio/bueno/perfecto sin cambios (matriz comparable)
};
/** Dirección de apuntado (unitaria, mundo) que manda el remate más lejos de los defensores de la CPU y,
 *  como haría un jugador que mira la jugada, por fuera de las manos del bloqueador rival si está arriba.
 *  El simulador apunta a: centro del campo rival (5 m) + dir * (3 ; 3,7) (sim.js attackTarget). */
function gapAim(g, p, out) {
  let best = -1e9, blk = null;
  for (const q of g.teams[1]) if (q.z > 0.15 && Math.abs(q.x) < 1.2 && (!blk || Math.abs(q.y - p.y) < Math.abs(blk.y - p.y))) blk = q;
  for (let k = 0; k < 16; k++) {
    const a = k * Math.PI / 8, ux = Math.cos(a), uy = Math.sin(a);
    const tx = Math.max(-8.3, Math.min(-1.4, -5 + ux * 3)), ty = Math.max(-3.9, Math.min(3.9, uy * 3.7));
    let m = 99; for (const q of g.teams[1]) m = Math.min(m, Math.hypot(q.x - tx, q.y - ty));
    let sc = m - (Math.abs(ty) > 3.4 ? 0.8 : 0) - (tx < -7.8 ? 0.6 : 0);
    if (blk) { const y0 = p.y + (ty - p.y) * (0 - p.x) / (tx - p.x), gb = Math.abs(y0 - blk.y); if (gb < 0.9) sc -= 3 * (1 - gb / 0.9); }
    if (sc > best) { best = sc; out[0] = ux; out[1] = uy; }
  }
  return out;
}
/** opt.six (6v6 con humano, 11-nov-2026): el personaje ya no se mueve solo, así que sin balón suyo el bot va él mismo a su sitio
 *  de la formación (VB.AI6.spot: recepción, batida, cobertura, bloqueo de zona, defensa perímetro) con su reacción, su error de
 *  lectura y la inercia del stick, y solo sube a bloquear si su sitio es de bloqueo. Sin opt, el bot de siempre (matriz 2v2).
 *  opt.role (lote A): puesto del humano. Con 'S' (colocador) el 2º toque de su equipo es suyo: sigue yendo a su sitio (VB.AI6.spot,
 *  el punto de colocación) y de ahí al balón cuando lo lee (pase alto: poco error), y al golpear de 2º empuja el stick en una de las
 *  4 direcciones (al azar: VB.AI6.laneOf elige el carril). Los demás puestos, igual que sin role. */
/** E1 (maestría): con qué frecuencia usa cada bot lo nuevo cuando juega con opt.mastery (SIMTEST_MASTERY=2): finta (con el bloqueo
 *  arriba arma GOLPEAR 0,1 s antes y cambia a SALTAR o COLOCAR a los 0,08 s), golpe colocado (COLOCAR en vez de GOLPEAR con el bloqueo
 *  arriba), al filo (la diana del hueco a 0,15 m de la lateral) y colocación dirigida (stick al colocar de 2º toque). */
const BOT_MASTERY = {
  perfecto: { feint: 0.2, roll: 0.15, edge: 0.4, set: 0.5 }, bueno: { feint: 0.15, roll: 0.12, edge: 0.3, set: 0.4 },
  medio: { feint: 0.1, roll: 0.08, edge: 0.2, set: 0.3 }, novato: { feint: 0.03, roll: 0.03, edge: 0, set: 0.1 }
};
// SIMTEST_BOTM=feint,set: solo esas jugadas (afinado; las demás a 0)
if (process.env.SIMTEST_BOTM) { const on = process.env.SIMTEST_BOTM.split(","); for (const b in BOT_MASTERY) for (const k in BOT_MASTERY[b]) if (!on.includes(k)) BOT_MASTERY[b][k] = 0; }
/** Salto con impulso (SIMTEST_DJUMP=1): prob. por ataque de que el bot espere más atrás (DJ_BACK m tras la batida), arranque hacia la
 *  red DJ_RUN s antes del despegue y salte sin soltar la dirección (luego la suelta un paso para que la diana vuelva a moverse). */
const BOT_DJ = { perfecto: 0.75, bueno: 0.45, medio: 0.45, novato: 0.2 }, DJ_BACK = 2.8, DJ_RUN = 0.36;
// colocación por destino (C2): las 8 direcciones (mundo, equipo 0 en x > 0: ↑ = −x, → = +y); sin dirección (mSet null), alta a la 4
const SETDIRS = [0, 45, 90, 135, 180, 225, 270, 315].map(a => [-Math.cos(a * Math.PI / 180), Math.sin(a * Math.PI / 180)]);
function makeBot(bp, seed, opt) {
  const six = !!(opt && opt.six), role = six && opt.role || '';
  const pm = opt && opt.mastery || null; let mPlan = '', mEdge = false, mSet = null, mT = -9, mBtn = 'jump'; // E1: maestría del bot
  const pdj = opt && opt.dj || 0, rngD = S._makeRng((seed ^ 0x5a17) >>> 0); let djPlan = false, stampD = -9; const ZERO = [0, 0]; // salto con impulso (azar propio)
  const LANES = [[1, 0], [-1, 0], [0, 1], [0, -1]]; let laneV = null; // stick del colocador bot en su 2º toque (mundo; laneOf lo pasa a local)
  const rng = S._makeRng(seed), gauss = () => (rng() + rng() + rng() + rng() - 2) * 1.732;
  const mv = [0, 0], want = [0, 0], aimv = [0, 0], out = { move: mv, hit: false, jump: false, jset: false, switchPlayer: false };
  let stamp = -9, lead = 0, jlead = 0, eu = 0, ev = 0, presses = 0, useAim = false, useGap = false, serveWait = 0;
  let react = 0, wrongT = 0, wrongD = 0, jumpOk = true, blockT = 0, blockSeen = -1;
  let lastCtrl = null, yawE = 0, yawT = 0, naive = false; const mvOut = [0, 0], aimSt = [0, 0];
  const w = {}, DT2 = DT;
  // reacción: lognormal con mediana bp.react (+ despiste ocasional)
  const sampleReact = () => bp.react * Math.exp(gauss() * bp.rlog) + (rng() < bp.lapse ? 0.2 + rng() * 0.3 : 0);
  return (g) => {
    const p = g.ctrl, sd = 1; out.hit = out.jump = out.switchPlayer = out.jset = false; out.move = mv;
    if (p !== lastCtrl) { if (lastCtrl && bp.camYaw) { yawE = gauss() * bp.camYaw * Math.PI / 180; yawT = g.time; } lastCtrl = p; }
    if (g.mode === 'serve') {
      mv[0] = mv[1] = 0; want[0] = want[1] = 0;
      if (g.server !== p) return out;
      if (g.serveState === 'ready') {
        if (g.serveT < 0.05) serveWait = 0.6 + rng() * 2;
        if (g.serveT > serveWait) { if (rng() < bp.jumpServe) out.jump = true; else out.hit = true; }
        return out;
      }
      if (stamp !== g.lastTouchT) {
        stamp = g.lastTouchT; lead = C.WINDUP + bp.bias + gauss() * bp.sigma; presses = 0;
        const a = rng() * 6.283; aimv[0] = Math.cos(a); aimv[1] = Math.sin(a); useAim = rng() < bp.aim;
      }
      S.hitWindow(g, p, w);
      if (g.aim3 && g.aim3.on && g.aim3.kind === 'serve') {
        // saque dirigible: lleva la diana con el stick al punto que antes elegía con la dirección (centro a 6 m + dir * (2,4 ; 3,4))
        const tx = -Math.max(2, Math.min(8.4, 6 - (useAim ? aimv[0] * 2.4 : 0))), ty = useAim ? Math.max(-4, Math.min(4, aimv[1] * 3.4)) : 0;
        const dx = tx - g.aim3.x, dy = ty - g.aim3.y, d = Math.hypot(dx, dy), f = d > 1e-6 ? Math.min(1, d / 0.25) / d : 0;
        aimSt[0] = dx * f; aimSt[1] = dy * f; out.move = aimSt;
      } else if (useAim) out.move = aimv;
      if (presses < 2 && !g.swingLive && w.t <= lead) { out.hit = true; presses++; }
      return out;
    }
    if (g.mode !== 'rally') { mv[0] = mv[1] = 0; want[0] = want[1] = 0; return out; }
    const b = g.ball, bsp = Math.hypot(b.vx, b.vy, b.vz);
    if (stamp !== g.lastTouchT) { // nueva trayectoria: nueva lectura
      stamp = g.lastTouchT; presses = 0;
      react = sampleReact();
      const sg = bp.sigma * (1 + bp.fast * Math.max(0, Math.min(1, (bsp - 9) / 8))); // balón rápido = timing peor
      lead = C.WINDUP + bp.bias + gauss() * sg; jlead = bp.bias * 0.5 + gauss() * sg * 0.9;
      eu = gauss(); ev = gauss();
      wrongD = rng() < bp.wrong ? (rng() < 0.5 ? -1 : 1) * (1.3 + rng() * 1.2) : 0; // corto/largo al revés
      wrongT = react + 0.3 + rng() * 0.3;
      jumpOk = rng() < bp.jumpOk;
      const a = rng() * 6.283; aimv[0] = Math.cos(a); aimv[1] = Math.sin(a); useAim = rng() < bp.aim; useGap = rng() < (bp.gap || 0);
      naive = !bp.block && g.touchTeam === 1 && g.touches === 2 && rng() < (bp.netJump || 0); // "bloqueo" de novato
      if (bp.misSwitch && rng() < bp.misSwitch) out.switchPlayer = true;
      if (pm) { const r = rng(); mPlan = r < pm.feint ? 'feint' : r < pm.feint + pm.roll ? 'roll' : ''; mEdge = rng() < pm.edge;
        mSet = rng() < pm.set ? SETDIRS[Math.floor(rng() * 8) % 8] : null; mBtn = rng() < 0.6 ? 'jump' : 'jset'; mT = -9; }
    }
    if (stampD !== g.lastTouchT) { stampD = g.lastTouchT; djPlan = pdj > 0 && rngD() < pdj; }
    const since = g.time - g.lastTouchT, job = g.jobs[0] === p;
    const set2 = role === 'S' && job && g.touchTeam === 0 && g.touches === 1; // colocador bot: el 2º toque es suyo
    const sp6 = six && (!job || set2) ? VB.AI6.spot(g, p) : null, sp6x = sp6 ? sp6.x : 0, sp6y = sp6 ? sp6.y : 0, sp6b = !!(sp6 && sp6.block);
    const blocks = six ? sp6b : bp.block || naive || g.defRole === 'block'; // con CAMBIAR en la colocación rival el juego le pide bloquear
    if (g.swingLive && p.z > 0 && (useGap || useAim)) out.move = aimv; // en el aire mantiene la dirección mientras dura el gesto
    let tx = p.x, ty = p.y;
    const attack = job && g.touchTeam === 0 && g.touches === 2 && Math.abs(g.pr3.x) < 3.8 && g.pr3.z > 2.5;
    if (set2) { // colocador: en su punto de colocación hasta leer el pase; luego al balón (si el pase viene a él, se queda quieto)
      const pr = g.pr1;
      if (since < react || Math.hypot(pr.x - sp6x, pr.y - sp6y) < 0.7) { tx = sp6x; ty = sp6y; } else { tx = pr.x + 0.15; ty = pr.y; }
      tx += eu * bp.posErr * 0.15; ty += ev * bp.posErr * 0.15;
    } else if (job) {
      const pr = attack ? g.pr3 : g.pr1;
      if (attack) { tx = pr.x + (djPlan ? DJ_BACK : 0.35) * sd; ty = pr.y; } else { tx = pr.x + 0.15; ty = pr.y; }
      // error de lectura: crece con el vuelo que queda y la distancia; en profundidad (eje de la cámara) es mayor
      const dist = Math.hypot(pr.x - p.x, pr.y - p.y), tr = Math.max(0, pr.t);
      const s = bp.posErr * (0.22 + 0.55 * Math.min(1.6, tr / 1.1) + 0.06 * Math.min(8, dist));
      tx += eu * s * 0.5 * bp.depth; ty += ev * s * 0.5;
      if (wrongD && since < wrongT) tx += wrongD;
    } else if (six) { tx = sp6x + eu * bp.posErr * 0.25; ty = sp6y + ev * bp.posErr * 0.25; if (sp6b) tx = sp6x; } // 6v6: a su sitio (lee el bloqueo sin error de profundidad)
    else if (g.defRole === 'dig' && g.touchTeam === 1 && !naive) { tx = 5.4; ty = Math.max(-2, Math.min(2, -g.pr3.y * 0.3)); } // el juego le da la defensa
    else if (blocks && g.touchTeam === 1 && g.touches === 2 && g.pr3.x < 0) { tx = 0.6; ty = g.pr3.y + ev * bp.posErr * 0.4; } // lee el ataque con error
    else if (!job) { tx = 6; ty = -g.teams[0][g.ctrl.idx ? 0 : 1].y * 0.5; }
    // hasta reaccionar sigue con lo que hacía (no se para en seco); luego va al punto leído con inercia del stick
    if (since >= react && p.z === 0) {
      const dx = tx - p.x, dy = ty - p.y, d = Math.hypot(dx, dy);
      if (d > bp.stop) { const f = Math.min(1, d / 0.3); want[0] = dx / d * f; want[1] = dy / d * f; } else { want[0] = want[1] = 0; }
    }
    { const k = bp.acc * DT2, ddx = want[0] - mv[0], ddy = want[1] - mv[1], dl = Math.hypot(ddx, ddy);
      if (dl <= k) { mv[0] = want[0]; mv[1] = want[1]; } else { mv[0] += ddx / dl * k; mv[1] += ddy / dl * k; } }
    if (job && since >= react * 0.6) {
      S.hitWindow(g, p, w);
      if (attack && djPlan && jumpOk && p.z === 0 && w.attack && w.jumpT <= jlead + DJ_RUN) { // carrera hacia la red
        const cx = g.pr3.x + 0.35 - p.x, cy = g.pr3.y - p.y, cl = Math.hypot(cx, cy);
        if (cl > 0.05 && cx < 0) { mv[0] = want[0] = cx / cl; mv[1] = want[1] = cy / cl; }
      }
      if (attack && jumpOk && p.z === 0 && w.attack && w.jumpT <= jlead && Math.hypot(g.pr3.x + 0.35 - p.x, g.pr3.y - p.y) < (djPlan ? 2.2 : 1.3)) out.jump = true;
      const near = Math.hypot(b.x - p.x, b.y - p.y) < 2.6;
      // E1: con el bloqueo rival arriba, finta (arma antes) o golpe colocado (COLOCAR en vez de GOLPEAR)
      const blkUp = pm && mPlan && p.z > 0.25 && g.touchTeam === 0 && g.touches === 2 && g.teams[1].some(q => q.z > 0.15 && Math.abs(q.x) < 1.2);
      if (near && !(attack && jumpOk && p.z === 0 && w.jumpT > -0.2) && presses < 2 && !g.swingLive && w.t <= lead + (blkUp && mPlan === 'feint' ? 0.1 : 0)) {
        if (blkUp && mPlan === 'roll') out.jset = true; else out.hit = true;
        presses++;
        if (blkUp && mPlan === 'feint') mT = g.time;
        if (set2) { laneV = LANES[Math.floor(rng() * 4) % 4]; out.move = laneV; } // colocador: elige carril con el stick (laneOf)
        else if (useGap && p.z > 0.25) { gapAim(g, p, aimv); out.move = aimv; } // remate: busca el hueco
        else if (useAim) out.move = aimv;
        // E1: colocación dirigida (revisión C2: como una persona, suelta la flecha de moverse al pulsar y elige el destino en el gesto, abajo)
        if (mSet && p.z === 0 && g.touchTeam === 0 && g.touches === 1) out.move = [0, 0];
      }
    }
    if (mT > 0 && g.swingLive && g.time - mT >= 0.08) { out[mBtn] = true; mT = -9; } // E1: el cambio de botón de la finta
    if (mSet && g.swingLive && p.z === 0 && g.touchTeam === 0 && g.touches === 1) out.move = mSet;
    if (set2 && laneV && g.swingLive) out.move = laneV; // mantiene el stick hasta que el gesto llega al balón (sim.hit lee la dirección ahí)
    else if (!set2) laneV = null;
    // bloqueo: salta cuando VE despegar al rematador rival (con su reacción y su error de timing)
    if (blocks && !job && p.z === 0 && Math.abs(p.x) < 1.2 && g.touchTeam === 1 && g.touches === 2) {
      const att = g.teams[1].some(q => q.z > 0.35 && q.vz < 1.5 && Math.abs(q.x) < 4);
      if (att && blockSeen !== stamp) { blockSeen = stamp; blockT = g.time + Math.max(0, bp.react * 0.35 + gauss() * bp.sigma * (naive ? 2.4 : 1.2)); }
      if (att && g.time >= blockT) out.jump = true;
    }
    // remate con mira libre (A1): en el aire lleva la mira (g.aim3) hacia el punto que quiere (hueco o dirección elegida,
    // con el mismo mapeo de antes: centro a 5 m + dir * (3 ; 3,7)); sin apuntar suelta el stick (diagonal por defecto)
    if (g.aim3 && g.aim3.on && g.ctrl === p) {
      if (useGap || useAim) {
        if (useGap) gapAim(g, p, aimv);
        const tx = Math.max(-8.3, Math.min(-1.4, -5 + aimv[0] * 3)), ty = pm && mEdge && useGap ? (aimv[1] < 0 ? -1 : 1) * (g.HW - 0.15) : Math.max(-3.9, Math.min(3.9, aimv[1] * 3.7));
        const dx = tx - g.aim3.x, dy = ty - g.aim3.y, d = Math.hypot(dx, dy), f = d > 1e-6 ? Math.min(1, d / 0.25) / d : 0;
        aimSt[0] = dx * f; aimSt[1] = dy * f; out.move = aimSt;
      } else { aimSt[0] = aimSt[1] = 0; out.move = aimSt; }
    }
    if (pdj && p.z > 0 && p.lastAction === 'jump' && p.actionT < 0.02) out.move = ZERO; // salto con impulso: suelta la dirección del despegue
    // cámara recién deslizada a otro jugador: el stick va girado yawE (se corrige en 0,5 s)
    if (yawE && out.move === mv) {
      const k = 1 - (g.time - yawT) / 0.5;
      if (k <= 0) yawE = 0;
      else { const a = yawE * k, c = Math.cos(a), s2 = Math.sin(a); mvOut[0] = mv[0] * c - mv[1] * s2; mvOut[1] = mv[0] * s2 + mv[1] * c; out.move = mvOut; }
    }
    return out;
  };
}
function topWhy(w) { return Object.entries(w).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, v]) => k.replace(/^(.{24}).*/, '$1') + ':' + v); }

// ================= Calibración del highlight (SIM-05) =================
/** Un partido COMPLETO de demo (CPU vs CPU, perfil DIFF.demo) con todas las comprobaciones de los campos del punto y del ritual.
 *  Devuelve los puntos compactos [highlight, conPuntoDeSet, how, signal, landSide, hold, clutch, reason] y una TRAZA de todo lo
 *  que la presentación consume (marcador, highlight, señal, campo del bote, pausa, final apretado, defensas, racha y cada bote
 *  del ritual con su velocidad) para la prueba de determinismo: misma semilla -> la misma traza, carácter a carácter. */
function runHlMatch(j) {
  const label = 'calibración del highlight (semilla ' + j.seed + ')';
  const g = S.createGame({ demo: true, seed: j.seed, stats: true }), rit = ritualChecker(label), evs = [];
  const pf = { streakT: -1, streakN: 0, setPoint: -1, matchPoint: -1, issues: 0 }, pts = [], trace = [];
  let done = false, dribbles = 0, bounces = 0, pendB = 0, redo = 0;
  try {
    for (let i = 0; i < 70 * 60 * C.SIM_HZ && !done; i++) {
      S.step(g, DT, null); evs.length = 0; S.drainEvents(g, evs); rit.step(g, evs);
      for (const e of evs) {
        if (e.type === 'newSet' || e.type === 'newMatch') { pf.streakT = -1; pf.streakN = 0; }
        if (e.type === 'serveReady') { pf.setPoint = e.setPoint; pf.matchPoint = e.matchPoint; pendB = g.ritual.on ? g.ritual.bounces : 0; bounces += pendB; }
        if (e.type === 'dribble') { dribbles++; pendB--; trace.push('d' + e.n + '/' + e.of + '@' + e.speed); }
        // challenge (B2): el punto anulado se vuelve a pitar; el recuento propio vuelve al de antes de ese punto. Pedido con el saque
        // siguiente ya preparado (modo 'serve'), los botes del ritual que aún no se dieron se cancelan (y se rehace el saque)
        if (e.type === 'challenge') { pf.rev = true; if (pendB > 0) { bounces -= pendB; redo++; } pendB = 0; }
        if (e.type === 'challengeResult') pf.rev = false;
        if (e.type === 'point') {
          if (pf.rev && pf.prev) { Object.assign(pf, pf.prev); pf.rev = false; }
          pf.prev = { streakT: pf.streakT, streakN: pf.streakN, setPoint: pf.setPoint, matchPoint: pf.matchPoint };
          if (pf.streakT === e.team) pf.streakN++; else { pf.streakT = e.team; pf.streakN = 1; }
          const eight = evs.some(x => x.type === 'courtChange' && x.why === 'eight');
          const bad = pointFieldIssues(e, g, { streak: pf.streakN, setPoint: pf.setPoint, matchPoint: pf.matchPoint, eight });
          if (Math.abs(g.timer - e.hold) > 1e-9) bad.push('g.timer ' + g.timer + ' != hold ' + e.hold);
          if (bad.length && pf.issues++ < 5) fail(label + ' campos del punto: ' + bad.join('; ') + ' ' + JSON.stringify({ reason: e.reason, how: e.how, score: e.score }));
          pts.push([e.highlight, pf.setPoint !== -1 ? 1 : 0, e.how, e.signal, e.landSide, e.hold, e.clutch ? 1 : 0, e.reason]);
          trace.push(e.score.join('-') + '|' + e.how + '|' + e.highlight + '|' + e.signal + '|' + e.landSide + '|' + e.hold + '|' + (e.clutch ? 1 : 0) + '|' + e.digs + '|' + e.streak);
        }
        if (e.type === 'match') done = true;
      }
      if (i % 60 === 0 && !checkInvariants(g, label)) break;
    }
  } catch (e) { fail(label + ' excepción: ' + (e && e.stack || e)); }
  if (!done) fail(label + ': el partido no acaba en 70 min de juego');
  return { kind: 'hl', seed: j.seed, pts, trace: trace.join(';'), dribbles, bounces, cpuServes: rit.cpu, serves: rit.serves, redo, failures };
}
/** Banda calibrada (SIM-05): en 20 partidos CPU vs CPU, entre el 15 y el 25 % de los puntos con highlight >= VB.HOLD.bigAt (la
 *  cinta grande y la pausa larga) y menos del 5 % >= 0,8 fuera de los puntos de set/partido. Medido con 160 partidos de demo
 *  (8-nov-2026): 19,6 % (grupos de 20 partidos: 17,6-20,9; σ ≈ 1,1 puntos) y 3,2 %. */
const HL_CAL = { matches: 20, bigLo: 0.15, bigHi: 0.25, topAt: 0.8, topMax: 0.05 };
function hlCalibration(res) {
  const pts = [].concat(...res.map(r => r.pts)), n = pts.length, H = VB.HOLD;
  const big = pts.filter(p => p[0] >= H.bigAt).length / n, nsp = pts.filter(p => !p[1]), top = nsp.filter(p => p[0] >= HL_CAL.topAt).length / Math.max(1, nsp.length);
  const hist = new Array(10).fill(0); for (const p of pts) hist[Math.min(9, Math.floor(p[0] * 10 + 1e-9))]++;
  console.log('\n== Calibración del highlight (SIM-05): ' + res.length + ' partidos completos CPU vs CPU (demo), ' + n + ' puntos ==');
  for (let i = 0; i < 10; i++) console.log('  ' + (i / 10).toFixed(1) + '-' + ((i + 1) / 10).toFixed(1) + ' ' + String(hist[i]).padStart(5) + ' ' + pct(hist[i], n).padStart(6) + ' ' + '#'.repeat(Math.round(60 * hist[i] / n)));
  const per = res.map(r => r.pts.filter(p => p[0] >= H.bigAt).length / Math.max(1, r.pts.length)).sort((a, b) => a - b);
  const howBig = {}, sig = {}, land = { 0: 0, 1: 0, '-1': 0 }, holds = {}; let clutch = 0;
  for (const p of pts) { if (p[0] >= H.bigAt) howBig[p[2]] = (howBig[p[2]] || 0) + 1; sig[p[3]] = (sig[p[3]] || 0) + 1; land[p[4]]++; holds[p[5]] = (holds[p[5]] || 0) + 1; if (p[6]) clutch++; }
  console.log('  >= ' + H.bigAt + ': ' + pct(big * 1000, 1000) + ' (objetivo ' + 100 * HL_CAL.bigLo + '-' + 100 * HL_CAL.bigHi + ' %; por partido ' + pct(per[0] * 1000, 1000) + '-' + pct(per[per.length - 1] * 1000, 1000) + ')' +
    ' | >= ' + HL_CAL.topAt + ' sin punto de set/partido: ' + pct(top * 1000, 1000) + ' (máx. ' + 100 * HL_CAL.topMax + ' %) | final apretado ' + pct(clutch, n) + ' | grandes por cómo ' + JSON.stringify(howBig));
  console.log('  señales ' + JSON.stringify(sig) + ' | landSide ' + JSON.stringify(land) + ' | pausas ' + JSON.stringify(holds));
  const dr = res.reduce((a, r) => a + r.dribbles, 0), bo = res.reduce((a, r) => a + r.bounces, 0), cs = res.reduce((a, r) => a + r.cpuServes, 0), sv = res.reduce((a, r) => a + r.serves, 0);
  console.log('  ritual: ' + sv + ' saques (' + cs + ' de la CPU), ' + bo + ' botes programados, ' + dr + ' eventos dribble');
  const f0 = failures;
  if (!(big >= HL_CAL.bigLo && big <= HL_CAL.bigHi)) fail('calibración del highlight: ' + pct(big * 1000, 1000) + ' de puntos >= ' + H.bigAt + ' (objetivo ' + 100 * HL_CAL.bigLo + '-' + 100 * HL_CAL.bigHi + ' %)');
  if (!(top < HL_CAL.topMax)) fail('calibración del highlight: ' + pct(top * 1000, 1000) + ' de puntos >= ' + HL_CAL.topAt + ' fuera de punto de set/partido (máx. ' + 100 * HL_CAL.topMax + ' %)');
  // cobertura de los campos nuevos en partido real: las tres señales de bote, los dos campos y -1 sin bote, pausas de la tabla
  for (const k of ['in', 'out', 'touched']) if (!sig[k]) fail('calibración: ninguna señal ' + k + ' en ' + n + ' puntos');
  if (!land[0] || !land[1] || !land['-1']) fail('calibración: landSide sin los tres valores ' + JSON.stringify(land));
  const okHold = [VB.RITUAL.demoHold, VB.RITUAL.demoHold + 1.4, 3.6, 2.2];
  for (const h in holds) if (!okHold.some(x => Math.abs(x - h) < 1e-9)) fail('calibración: pausa ' + h + ' fuera de la tabla de la demo');
  if (!holds[3.6] || !holds[2.2]) fail('calibración: faltan pausas de set (3,6) o de partido (2,2): ' + JSON.stringify(holds));
  // ritual: todos los saques de la demo son de la CPU, con un `dribble` por cada bote programado
  // (la demo bota VB.RITUAL.demoBounces veces: hoy 1, así que dribbles >= saques)
  const redo = res.reduce((a, r) => a + (r.redo || 0), 0); // saques preparados y rehechos por un challenge (sus botes no se dieron)
  if (cs !== sv || !(dr >= (sv - redo) * VB.RITUAL.demoBounces) || dr !== bo) fail('calibración: ritual ' + JSON.stringify({ saques: sv, cpu: cs, botes: bo, dribbles: dr }));
  if (failures === f0) console.log('  calibración del highlight y cobertura de señal/landSide/pausa/ritual/dribble OK');
}

/** Trabajo de una casilla de la matriz (se ejecuta en un worker). */
function runJob(j) {
  if (j.kind === 'hl') return runHlMatch(j);
  const opts = j.kind === 'auto' ? { demo: false, autopilot: true, difficulty: j.diff, seed: j.seed } :
    { demo: false, difficulty: j.diff, serveClock: true, seed: j.seed, rookie: !!BOTS[j.bot].rookie && ROOKIE_MODE !== 'off' };
  // E1: SIMTEST_MASTERY=1 juega los partidos de los bots con createGame({mastery:true}) (la CPU lee y usa lo suyo; el bot no usa nada
  // nuevo); SIMTEST_MASTERY=2, además el bot usa finta / golpe colocado / al filo / colocación dirigida (BOT_MASTERY)
  if (j.kind === 'bot' && MASTERY_MODE) opts.mastery = true;
  if (j.kind === 'bot' && DJUMP_MODE) opts.djump = true;     // salto con impulso: la sim y el bot (BOT_DJ)
  if (j.kind === 'bot' && JSETAIM_MODE) opts.jsetAim = true;
  const bopt = MASTERY_MODE === 2 ? { mastery: BOT_MASTERY[j.bot] } : DJBOT_MODE ? {} : undefined;
  if (bopt && DJBOT_MODE) bopt.dj = BOT_DJ[j.bot];
  const r = run(j.label, opts, j.seconds, j.kind === 'bot' ? makeBot(BOTS[j.bot], j.seed * 7 + 3, bopt) : null, true);
  return { label: j.label, kind: j.kind, bot: j.bot, diff: j.diff, won0: r.st.won[0], points: r.st.points, med: r.med,
    hits: r.st.hits, how: r.st.how, blocks: r.st.blocks, dives: r.st.dives, misses: r.st.misses, hgrades: r.st.hgrades, why: r.st.why,
    matchWins: r.matchWins, dj: r.dj, failures };
}
function runMatrix(jobs) {
  const n = Math.max(1, Math.min(jobs.length, (os.cpus().length || 2) - 1, 15)), out = new Array(jobs.length);
  let next = 0;
  return new Promise((resolve) => {
    let alive = 0;
    const spawn = () => {
      if (next >= jobs.length) { if (!alive) resolve(out); return; }
      const k = next++; alive++;
      const w = new Worker(__filename, { workerData: jobs[k], argv: process.argv.slice(2) });
      w.on('message', (m) => { out[k] = m; });
      w.on('error', (e) => { fail('worker ' + jobs[k].label + ': ' + (e && e.stack || e)); });
      w.on('exit', () => { alive--; spawn(); });
    };
    for (let i = 0; i < n; i++) spawn();
  });
}

// ================= Maestría (E1, sprint 5) =================
/* createGame({mastery:true}): finta, golpe colocado ('roll'), al filo / manos fuera, colocación dirigida y la lectura de la CPU.
 * SIMTEST_ONLY=e1 node tools/simtest.js: solo esta sección. Escenarios propios con la sim entera (step + entrada real) y casos con
 * S._hit; todo el azar del test es el de la sim y el de un mulberry propio (no toca g.rng). Ver notes/sim.md «E1 (sprint 5)». */
function e1Mulberry(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
/** 3r toque del humano con la sim entera: el compañero IA acaba de colocar (x 1,35, cima 5,3) y el humano salta en el momento ideal
 *  (hitWindow.jumpT) y pulsa o.b1 ('hit' | 'jump' | 'jset') cuando hitWindow.press <= o.arm (0 = pulsación perfecta; 0,1 = 0,1 s antes);
 *  con o.b2 pulsa ese botón o.dt s después (finta). o.tx/o.ty: diana de la mira libre (se fija en g.aim3 cada paso, con los límites de
 *  la sim). La CPU juega con su IA (bloqueo y defensa). Devuelve el toque del humano, la finta, los bloqueos y el punto. */
function e1Atk(seed, o) {
  o = o || {};
  const g = S.createGame({ seed, ctrl: 'one', stats: true, mastery: o.mastery !== false, difficulty: o.diff || 'normal' });
  const h = g.teams[0][0], m = g.teams[0][1], b = g.ball, G = C.G, c = g.teams[1];
  g.mode = 'rally'; b.held = null; S.drainEvents(g);
  const yy = o.y != null ? o.y : ((seed % 7) - 3) * 0.8;
  m.x = 2.0; m.y = yy - 1.0; h.x = 2.4; h.y = yy;
  c[0].x = -1.2; c[0].y = yy * 0.6; c[1].x = -6; c[1].y = -yy * 0.3;
  Object.assign(b, { x: m.x, y: m.y, z: 2.3, dip: 0, wobA: 0, spin: 0 });
  { const z0 = b.z, tz = 3, ap = 5.3, vz = Math.sqrt(2 * G * (ap - z0)), T = vz / G + Math.sqrt(2 * (ap - tz) / G); b.vx = (1.35 - b.x) / T; b.vy = (yy - b.y) / T; b.vz = vz; }
  g.touchTeam = 0; g.touches = 2; g.lastPlayer = m; g.lastTeam = 0; g.lastKind = 'set'; g.lastShot = 'overhead'; g.lastQ = 0.95; g.lastTouchT = g.time; g.ctrl = h;
  S._refreshPred(g);
  const r = { h: null, feint: null, blocks: 0, pt: null, g, cpuDig: null, t1: -1 };
  const w = {}; let jumped = false, p1 = false, p2 = false;
  for (let i = 0; i < 120 * 10 && !r.pt; i++) {
    const inp = { move: [0, 0], hit: false, jump: false, jset: false, switchPlayer: false };
    if (!r.h && g.mode === 'rally') {
      S.hitWindow(g, h, w);
      if (!jumped && h.z === 0 && w.attack && w.jumpT <= 0) { inp.jump = true; jumped = true; }
      else if (jumped && h.z > 0.2 && !p1 && w.press <= (o.arm || 0)) { inp[o.b1 || 'hit'] = true; p1 = true; r.t1 = g.time; }
      else if (p1 && o.b2 && !p2 && g.time - r.t1 >= o.dt - 1e-9) { inp[o.b2] = true; p2 = true; }
      if (o.tx != null && g.aim3.on && g.aim3.kind === 'spike') { g.aim3.x = o.tx; g.aim3.y = o.ty; }
    }
    S.step(g, DT, inp);
    for (const e of S.drainEvents(g)) {
      if (e.type === 'hit' && e.player === h && !r.h) r.h = e;
      else if (e.type === 'hit' && r.h && e.team === 1 && !r.cpuDig) r.cpuDig = e;
      if (e.type === 'feint') r.feint = e;
      if (e.type === 'block' && r.h && !r.cpuDig) r.blocks++;
      if (e.type === 'point') r.pt = e;
    }
  }
  return r;
}
function e1Rally(g, ball) { g.mode = 'rally'; g.ball.held = null; Object.assign(g.ball, { vx: 0, vy: 0, vz: 0, dip: 0, wobA: 0 }, ball); }
function e1Section() {
  const f0 = failures, res = [], t0 = Date.now();
  // SIMTEST_E1='b,c2': solo esas pruebas (afinado); cada resultado se escribe al momento
  const E1F = process.env.SIMTEST_E1 ? process.env.SIMTEST_E1.split(',') : null, want = k => !E1F || E1F.includes(k);
  const push0 = res.push.bind(res); res.push = (r) => { console.log('  ' + r[0] + ' ' + JSON.stringify(r[2]) + (r[1] ? '' : '   <<< FALLA')); return push0(r); };
  console.log('\nMaestría (E1, createGame({mastery:true}))');
  const isNum = v => typeof v === 'number' && Number.isFinite(v);
  // (a) base: sin la bandera, con mastery:false, y con mastery:true en la demo / con autopilot / en 6v6 = idéntico (puntos y llamadas a g.rng)
  if (want('a')) {
    const trace = (opts, bot, secs) => {
      const g = S.createGame(Object.assign({ stats: true }, opts)); let n = 0; const r0 = g.rng; g.rng = () => { n++; return r0(); };
      const pts = []; const inp = bot ? makeBot(BOTS.medio, (opts.seed | 0) * 7 + 3) : null;
      for (let i = 0; i < Math.round(secs / DT); i++) { S.step(g, DT, inp ? inp(g) : null);
        for (const e of S.drainEvents(g)) if (e.type === 'point') pts.push(e.team + e.reason + e.how + e.score.join('-')); }
      return { pts: pts.join(' '), rng: n, m: g.mastery };
    };
    let same = 0, n = 0, flags = 0; const bad = [];
    for (let s = 1; s <= 20; s++) {
      const d = ['easy', 'normal', 'hard', 'expert'][s % 4];
      const cases = [[{ seed: s, demo: true }, false], [{ seed: s, autopilot: true, difficulty: d }, false], [{ seed: s, difficulty: d }, true]];
      if (s <= 4) cases.push([{ seed: s, format: '6v6', difficulty: d }, false]);
      for (const [o, bot] of cases) {
        const a = trace(o, bot, 150), b2 = trace(Object.assign({ mastery: o.demo || o.autopilot || o.format ? true : false }, o), bot, 150);
        n++; if (a.pts === b2.pts && a.rng === b2.rng) same++; else bad.push(JSON.stringify(o));
        if (b2.m) flags++;
      }
    }
    res.push(['(a) sin la bandera = mastery:false = mastery:true en demo / autopilot / 6v6 (puntos y llamadas a g.rng, 20 semillas × 150 s)', same === n && flags === 0, { iguales: same + '/' + n, bandera: flags, distintas: bad.slice(0, 3) }]);
  }
  // (a2) mastery:true con roll = zoneSet = 0 y el bot que no usa nada nuevo: cuántas partidas cambian (solo la reacción ante la dejada
  // en Difícil/Experto y el filo de la mira a ±3,9 m). Informativo
  if (want('a2')) {
    const keep = {}; for (const k in VB.DIFF) { keep[k] = [VB.DIFF[k].roll, VB.DIFF[k].zoneSet]; VB.DIFF[k].roll = 0; VB.DIFF[k].zoneSet = 0; }
    let diff = 0, n = 0, pts = 0, ptsSame = 0;
    try {
      for (let s = 1; s <= 12; s++) {
        const d = ['easy', 'normal', 'hard', 'expert'][s % 4], run1 = (ms) => {
          const g = S.createGame({ seed: 40 + s, difficulty: d, mastery: ms }), inp = makeBot(BOTS.medio, s * 7 + 3), out = [];
          for (let i = 0; i < Math.round(150 / DT); i++) { S.step(g, DT, inp(g)); for (const e of S.drainEvents(g)) if (e.type === 'point') out.push(e.team + e.reason + e.how); }
          return out;
        };
        const a = run1(false), b2 = run1(true); n++; if (a.join() !== b2.join()) diff++;
        let k = 0; while (k < a.length && k < b2.length && a[k] === b2[k]) k++; ptsSame += k; pts += a.length;
      }
    } finally { for (const k in keep) { VB.DIFF[k].roll = keep[k][0]; VB.DIFF[k].zoneSet = keep[k][1]; } }
    res.push(['(a2) mastery con roll = zoneSet = 0 y bot sin lo nuevo: partidas que cambian (informativo: lectura de la dejada y filo a ±3,9 m)', true,
      { cambian: diff + '/' + n, puntosAntesDeDivergir: pct(ptsSame, pts) }]);
  }
  // (b) finta: GOLPEAR 0,1 s antes y SALTAR a los 0,10 s → hit.feint y evento feint; a los 0,015 s (< minT 0,03), no; sin mastery, nunca;
  //     con un gesto malo (GOLPEAR 0,25 s antes: 'poor') tampoco engaña (fixer sprint 5)
  if (want('b')) {
    const o = { si: 0, no: 0, ev: 0, roll: 0, rollF: 0, off: 0, poor: 0, n: 0, q: 0, qv: 0 };
    for (let s = 1; s <= 30; s++) {
      const a = e1Atk(s, { b1: 'hit', arm: 0.1, b2: 'jump', dt: 0.10 }), b2 = e1Atk(s, { b1: 'hit', arm: 0.1, b2: 'jump', dt: 0.015 });
      const pr = e1Atk(s, { b1: 'hit', arm: 0.25, b2: 'jump', dt: 0.10 });
      const c2 = e1Atk(s, { b1: 'hit', arm: 0.1, b2: 'jset', dt: 0.10 }), d2 = e1Atk(s, { b1: 'hit', arm: 0.1, b2: 'jump', dt: 0.10, mastery: false });
      const v = e1Atk(s, { b1: 'jump', arm: 0 }); // (1.17.0: el timing de la finta sale del cambio, aquí en el momento ideal: se compara con la dejada a tiempo)
      if (!a.h || !b2.h || !c2.h || !d2.h || !v.h || !pr.h) continue; o.n++;
      if (pr.h.feint === false && !pr.feint && pr.h.grade === 'poor') o.poor++;
      if (a.h.feint === true && a.h.shot === 'tip' && a.feint && a.feint.shot === 'tip' && a.feint.player === a.h.player) o.si++;
      if (a.feint) o.ev++;
      if (b2.h.feint === false && !b2.feint && b2.h.shot === 'tip') o.no++;
      if (c2.h.shot === 'roll' && c2.h.kind === 'spike') { o.roll++; if (c2.h.feint && c2.feint && c2.feint.shot === 'roll') o.rollF++; }
      if (d2.h.feint === false && !d2.feint && d2.h.shot === 'tip') o.off++;
      o.q += a.h.quality; o.qv += v.h.quality;
    }
    const ok = o.n >= 25 && o.si === o.n && o.no === o.n && o.roll === o.n && o.rollF === o.n && o.off === o.n && o.poor === o.n && Math.abs(o.q / o.qv - VB.MASTERY.feint.q) < 0.02;
    res.push(['(b) finta: GOLPEAR→SALTAR a los 0,10 s = finta (evento feint), a los 0,015 s no, gesto malo no, GOLPEAR→COLOCAR = finta de colocado, sin mastery nunca; calidad ×0,92', ok,
      Object.assign(o, { q: +(o.q / o.qv).toFixed(3), qv: undefined })]);
  }
  // (b6) finta en 6v6 (1.17.0, createGame({format:'6v6', feint:true}) sin el resto de la maestría): el bot que finta con el bloqueo
  //      arriba saca eventos feint y puntos con move 'feint'; sin feint:true (o con autopilot) nunca, y g.mastery sigue apagada
  if (want('b6')) {
    let fe = 0, pts = 0, fe0 = 0, flags = 0;
    for (let s = 1; s <= 6; s++) {
      for (const on of [true, false]) {
        const g = S.createGame({ seed: 7300 + s, format: '6v6', difficulty: 'normal', feint: on, mastery: true, stats: true });
        if (g.mastery || g.feintOn !== on) flags++;
        const inp = makeBot(BOTS.bueno, s * 5 + 2, { six: true, role: 'OH', mastery: { feint: 1, roll: 0, edge: 0, set: 0 } });
        for (let i = 0; i < Math.round(240 / DT); i++) { S.step(g, DT, inp(g));
          for (const e of S.drainEvents(g)) { if (e.type === 'feint') { if (on) fe++; else fe0++; } if (e.type === 'point' && e.move === 'feint') pts++; } }
      }
      if (S.createGame({ seed: s, format: '6v6', feint: true, autopilot: true }).feintOn) flags++;
    }
    res.push(['(b6) 6v6 con feint:true: fintas y puntos de finta; sin la bandera ni con autopilot, ninguna; g.mastery apagada', fe > 0 && pts > 0 && fe0 === 0 && flags === 0,
      { fintas: fe, puntos: pts, sinBandera: fe0, banderas: flags }]);
  }
  // (b2) premio: % de puntos de la dejada con finta frente a la dejada a la vista (mismo timing), y la dejada a la vista con y sin mastery
  const tipPts = (diff, plan, ms, N) => { let w = 0, n = 0; for (let s = 1; s <= N; s++) { const r = e1Atk(1000 + s, Object.assign({ diff, mastery: ms }, plan)); if (!r.h || !r.pt) continue; n++; if (r.pt.team === 0) w++; } return n ? w / n : 0; };
  if (want('b2')) {
    const N = 300, F = { b1: 'hit', arm: 0.1, b2: 'jump', dt: 0.1 }, V = { b1: 'jump', arm: 0 }; // (V: la dejada pulsada cuando la finta cambia, 1.17.0)
    const o = {};
    for (const d of ['easy', 'normal', 'hard', 'expert']) o[d] = { finta: tipPts(d, F, true, N), vista: tipPts(d, V, true, N), vistaSin: tipPts(d, V, false, N) };
    const H = o.hard, E = o.expert;
    const ok = H.finta >= H.vista + 0.10 && E.vista <= E.vistaSin + 0.005 && Math.abs(o.easy.vista - o.easy.vistaSin) <= 0.02 && Math.abs(o.normal.vista - o.normal.vistaSin) <= 0.02;
    const fmt = {}; for (const d in o) fmt[d] = Object.entries(o[d]).map(([k, v]) => k + ' ' + (100 * v).toFixed(0) + '%').join(' / ');
    res.push(['(b2) Difícil: finta >= dejada a la vista + 10 puntos; Experto: a la vista <= sin mastery; Fácil/Normal: a la vista igual (±2)', ok, fmt]);
  }
  // (c) golpe colocado: COLOCAR en el 3r toque = 'roll' (kind 'spike', nunca 'tip'); pasa el bloqueo; rentabilidad frente al remate perfecto
  if (want('c')) {
    const o = {}; let okShape = true, n = 0, over = 0;
    for (const d of ['normal', 'hard']) {
      let rw = 0, rn = 0, pw = 0, pn = 0, rb = 0, pb = 0;
      for (let s = 1; s <= 300; s++) {
        const ty = ((s % 5) - 2) * 1.2;
        const r = e1Atk(2000 + s, { diff: d, b1: 'jset', tx: -7.2, ty }), p = e1Atk(2000 + s, { diff: d, b1: 'hit', tx: -7.2, ty });
        if (r.h) { n++; if (r.h.shot !== 'roll' || r.h.kind !== 'spike') okShape = false; if (r.pt) { rn++; if (r.pt.team === 0) rw++; } if (r.blocks) rb++; else over++; }
        if (p.h && p.h.grade === 'perfect' && p.pt) { pn++; if (p.pt.team === 0) pw++; if (p.blocks) pb++; }
      }
      o[d] = { colocado: pct(rw, rn), remate: pct(pw, pn), ratio: +((rw / rn) / (pw / pn)).toFixed(2), bloqueosColocado: pct(rb, rn), bloqueosRemate: pct(pb, pn) };
    }
    const okR = ['normal', 'hard'].every(d => o[d].ratio >= 0.6 && o[d].ratio <= 0.9);
    res.push(['(c) golpe colocado: shot roll / kind spike; pasa el bloqueo >= 85 %; puntos 0,6-0,9× los del remate perfecto (Normal, Difícil)', okShape && over / n >= 0.85 && okR,
      Object.assign({ pasa: pct(over, n) }, o)]);
  }
  // (c2) la CPU usa el golpe colocado cuando le toca (bloqueo humano arriba y sin dejada): frecuencia ~ pr.roll; 0 en la demo
  if (want('c2')) {
    const o = {};
    for (const d of ['normal', 'expert']) {
      let up = 0, rolls = 0, tips = 0;
      for (let s = 1; s <= 10; s++) {
        const g = S.createGame({ seed: 3000 + s, difficulty: d, mastery: true }), inp = makeBot(BOTS.bueno, s * 13 + 1);
        for (let i = 0; i < Math.round(240 / DT); i++) {
          S.step(g, DT, inp(g));
          for (const e of S.drainEvents(g)) if (e.type === 'hit' && e.team === 1 && (e.kind === 'spike' || e.shot === 'tip') && e.z > C.NET_H + 0.1) {
            const a = e.player, bu = g.teams[0].some(q => q.z > 0.3 && Math.abs(q.x) < 1.2 && Math.abs(q.y - a.y) < 1.2);
            if (!bu) continue; if (e.shot === 'tip') { tips++; continue; } up++; if (e.shot === 'roll') rolls++;
          }
        }
      }
      o[d] = { ocasiones: up, colocados: rolls, frec: +(rolls / Math.max(1, up)).toFixed(3), pr: VB.DIFF[d].roll };
    }
    let demoRoll = 0; { const g = S.createGame({ seed: 5, demo: true, mastery: true }); for (let i = 0; i < Math.round(600 / DT); i++) { S.step(g, DT, null); for (const e of S.drainEvents(g)) if (e.type === 'hit' && e.shot === 'roll') demoRoll++; } }
    const near = (x) => x.ocasiones >= 40 ? Math.abs(x.frec - x.pr) <= Math.max(0.3 * x.pr, 2.5 * Math.sqrt(x.pr * (1 - x.pr) / x.ocasiones)) : x.colocados >= 0;
    res.push(['(c2) la CPU coloca con frecuencia ~ pr.roll (±30 % o ±2,5σ) con el bloqueo arriba; 0 en la demo', near(o.normal) && near(o.expert) && demoRoll === 0, Object.assign({ demo: demoRoll }, o)]);
  }
  // (d) al filo: diana a y = HW − 0,1 frente a y = 2 con la misma calidad: dispersión ×1,25-1,4, más fuera (>= 8 puntos), defensa de la CPU
  // (g.digK, dificultad del balón para el dado de contacto del modelo de esfuerzo; antes el dado g.digOk) >= 10 % más baja. Y la diana
  // llega a la línea solo con mastery
  if (want('d')) {
    const shoot = (ty, N) => {
      let sp = 0, out = 0, dig = 0, n = 0;
      for (let k = 0; k < N; k++) {
        const g = S.createGame({ demo: false, seed: 500 + k, mastery: true, difficulty: 'normal' }), h = g.teams[0][0], m = g.teams[0][1];
        e1Rally(g, { x: 1.4, y: 0.5, z: C.NET_H + 0.6, vz: -0.5 }); g.touchTeam = 0; g.touches = 2; g.lastTeam = 0; g.lastPlayer = m; g.lastKind = 'set';
        g.ctrl = h; h.x = 1.6; h.y = 0.5; h.z = 0.6; h.vz = 0.3; m.x = 6; m.y = -2;
        for (const q of g.teams[1]) { q.x = -6; q.y = q.idx ? 2 : -2; }
        const tx = -(3.5 + (k % 4)); g.aim3.on = true; g.aim3.kind = 'spike'; g.aim3.x = tx; g.aim3.y = ty;
        S._hit(g, h, null, 0.06, ''); const hv = S.drainEvents(g).find(e => e.type === 'hit'); if (!hv || hv.kind !== 'spike') continue;
        const ld = S.predictLanding(g, {}); n++; sp += Math.hypot(ld.x - tx, ld.y - ty); if (Math.abs(ld.y) > g.HW + C.IN_TOL || Math.abs(ld.x) > g.HL + C.IN_TOL) out++; dig += g.digK;
      }
      return { sp: sp / n, out: out / n, dig: dig / n, n };
    };
    const E = shoot(4.4, 600), M = shoot(2, 600), kSp = E.sp / M.sp;
    const lim = (ms) => { const g = S.createGame({ demo: false, seed: 9, mastery: ms }), h = g.teams[0][0], m = g.teams[0][1];
      e1Rally(g, { x: 1.2, y: 0.5, z: 4.6, vz: 0 }); g.touchTeam = 0; g.touches = 2; g.lastTeam = 0; g.lastPlayer = m; g.lastKind = 'set';
      g.ctrl = h; h.x = 1.5; h.y = 0.5; h.z = 0.3; h.vz = 2.5; m.x = 6; S.step(g, DT, null); g.aim3.x = -12; g.aim3.y = 9; S.step(g, DT, { move: [-0.6, 0.8], hit: false, jump: false });
      return [+g.aim3.x.toFixed(2), +g.aim3.y.toFixed(2)]; };
    const lOn = lim(true), lOff = lim(false), ap = (() => { const g = S.createGame({ demo: false, seed: 9, mastery: true }); return S.edgeOf(g, -5, 4.45); })();
    res.push(['(d) al filo: dispersión ×1,25-1,4, >= 8 puntos más fuera, digK de la CPU >= 10 % más bajo; la diana llega a 0,05 m de la línea solo con mastery',
      kSp >= 1.25 && kSp <= 1.4 && E.out >= M.out + 0.08 && E.dig <= M.dig * 0.9 && lOn[1] >= 4.44 && lOff[1] <= 3.9 + 1e-9 && ap > 0.9,
      { dispersion: +kSp.toFixed(2), fuera: pct(E.out * 1000, 1000) + ' vs ' + pct(M.out * 1000, 1000), digK: E.dig.toFixed(3) + ' vs ' + M.dig.toFixed(3), diana: [lOn, lOff], edgeOf: +ap.toFixed(2) }]);
  }
  // (e) colocación dirigida (reescrita con C2, «Colocar por destino»: detalle en SIMTEST_ONLY=colocar): con la bandera el destino sale de
  // g.setDirA (↑ rápida delante, ← tensa a la 4, ↓ alta atrás; neutra = alta a la 4, ya NO la de siempre); sin la bandera o con
  // aimSet:false, la de siempre byte a byte (x 1,35 al compañero, cima 5,3, tempo ''); setPreview = destino real sin error
  if (want('e')) {
    const setCase = (dirA, ms, aimSet, seed) => {
      const g = S.createGame({ demo: false, seed: seed || 77, mastery: ms, aimSet }), h = g.teams[0][0], m = g.teams[0][1];
      e1Rally(g, { x: 2.0, y: 0.3, z: 2.2, vx: 0, vy: 0, vz: -1 }); g.touchTeam = 0; g.touches = 1; g.lastTeam = 0; g.lastPlayer = m; g.lastKind = 'pass';
      g.ctrl = h; h.x = 2.0; h.y = 0.3; h.z = 0; m.x = 4.3; m.y = -1.5; g.setDirA = dirA == null ? NaN : dirA;
      S._hit(g, h, null, 0, ''); const hv = S.drainEvents(g).find(e => e.type === 'hit');
      const pr = S.predict(g, 3, {}); return { hv, x: pr.x, y: pr.y, v: [g.ball.vx, g.ball.vy, g.ball.vz], g };
    };
    const o = {};
    const q = setCase(0, true), hi = setCase(180, true), l = setCase(270, true), neu1 = setCase(null, true);
    const neu0 = setCase(null, false), neuF = setCase(0, false), off = setCase(0, true, false);
    o.quick = [q.hv.tempo, +q.x.toFixed(2), +q.y.toFixed(2)]; o.high = [hi.hv.tempo, +hi.x.toFixed(2)]; o.lane = [l.hv.tempo, +l.y.toFixed(2)];
    o.neutra = [neu1.hv.tempo, +neu1.x.toFixed(2), +neu1.y.toFixed(2)]; o.sinBandera = [neu0.hv.tempo, +neu0.x.toFixed(2), +neu0.y.toFixed(2)];
    const ok = q.hv.tempo === 'quick' && Math.abs(q.x - 0.8) < 0.5 && Math.abs(q.y - 0.3) < 0.5 && hi.hv.tempo === 'high' && Math.abs(hi.x - 2.8) < 0.5 &&
      l.hv.tempo === 'lane' && Math.abs(l.y + 3.5) < 0.5 && neu1.hv.tempo === 'high' && Math.abs(neu1.y + 2.75) < 0.5 &&
      neu0.hv.tempo === '' && Math.abs(neu0.x - 1.35) < 0.5 && Math.abs(neu0.y + 1.5) < 0.5 && neuF.v.every((v, i) => v === neu0.v[i]) &&
      off.hv.tempo === '' && off.v.every((v, i) => v === neu0.v[i]) && q.g.lastTempo === 'quick';
    o.aimSetOff = off.hv.tempo;
    // vista previa (setPreview) = destino real sin error: un paso sin dirección (abre la ventana) y otro con → (tensa a la 2)
    { const g = S.createGame({ demo: false, seed: 5, mastery: true }), h = g.teams[0][0], m = g.teams[0][1];
      e1Rally(g, { x: 2.6, y: 0.3, z: 3.2, vx: -0.5, vz: -1 }); g.touchTeam = 0; g.touches = 1; g.lastTeam = 0; g.lastPlayer = m; g.lastKind = 'pass'; g.lastTouchT = g.time;
      g.ctrl = h; h.x = 2.0; h.y = 0.3; m.x = 4.3; m.y = -1.5; g.ctrlMode = 'one';
      S.step(g, DT, { move: [0, 0], hit: false, jump: false }); S.step(g, DT, { move: [0, 1], hit: false, jump: false }); const sp = S.setPreview(g, {});
      o.vista = sp && [sp.tempo, +sp.x.toFixed(2), +sp.y.toFixed(2)];
      if (!(sp && sp.tempo === 'lane' && Math.abs(sp.y - 3.5) < 1e-9 && Math.abs(sp.x - 1.0) < 1e-9)) o.vistaMal = true; }
    res.push(['(e) colocación dirigida (C2): ↑ rápida, ↓ alta, ← tensa a la 4, neutra alta a la 4; sin bandera / aimSet:false la de siempre byte a byte; setPreview', ok && !o.vistaMal, o]);
  }
  // (e2) la CPU coloca a un lado (zoneSet) con frecuencia ~ pr.zoneSet y siempre lejos del jugador del humano; su atacante remata
  if (want('e2')) {
    const o = {};
    for (const d of ['normal', 'expert']) {
      let sets = 0, lane = 0, away = 0, spk = 0, pend = null;
      for (let s = 1; s <= 20; s++) { // (20 semillas, antes 8: con 8 la frecuencia de Normal iba al borde de la tolerancia por puro azar)
        const g = S.createGame({ seed: 4000 + s, difficulty: d, mastery: true }), inp = makeBot(BOTS.medio, s * 11 + 5);
        for (let i = 0; i < Math.round(240 / DT); i++) {
          const hy = g.ctrl.y; S.step(g, DT, inp(g));
          for (const e of S.drainEvents(g)) {
            if (e.type === 'hit' && e.team === 1 && e.kind === 'set' && e.touch === 2 && e.shot !== 'jump') { sets++; pend = null;
              if (e.tempo === 'lane') { lane++; const pr = S.predict(g, 3, {}); if (Math.abs(hy) <= 0.2 || Math.sign(pr.y) === -Math.sign(hy)) away++; pend = 1; } }
            else if (e.type === 'hit' && pend && e.team === 1) { if (e.kind === 'spike' || e.shot === 'tip') spk++; pend = null; }
            else if (e.type === 'point') pend = null;
          }
        }
      }
      o[d] = { colocaciones: sets, aUnLado: lane, frec: +(lane / Math.max(1, sets)).toFixed(3), pr: VB.DIFF[d].zoneSet, lejos: pct(away, lane), rematadas: pct(spk, lane) };
    }
    const okD = (x) => Math.abs(x.frec - x.pr) <= Math.max(0.3 * x.pr, 2.5 * Math.sqrt(x.pr * (1 - x.pr) / Math.max(1, x.colocaciones))) && x.aUnLado > 0;
    const allAway = ['normal', 'expert'].every(d => o[d].lejos === '100.0%');
    res.push(['(e2) CPU: a un lado con frecuencia ~ zoneSet, siempre lejos del jugador humano, y su atacante la remata', okD(o.normal) && okD(o.expert) && allAway, o]);
  }
  // (f) eventos: hit / point / feint sin campos undefined; números en dblFields (no enteros Smi sueltos: basta que sean finitos)
  if (want('f')) {
    let bad = 0, nh = 0, np = 0, nf = 0; const ex = [];
    for (let s = 1; s <= 6; s++) {
      const g = S.createGame({ seed: 6000 + s, difficulty: ['normal', 'hard'][s % 2], mastery: true, stats: true }), inp = makeBot(BOTS.bueno, s * 3 + 1, { mastery: BOT_MASTERY.perfecto });
      for (let i = 0; i < Math.round(180 / DT); i++) {
        S.step(g, DT, inp(g));
        for (const e of S.drainEvents(g)) {
          if (e.type !== 'hit' && e.type !== 'point' && e.type !== 'feint') continue;
          if (e.type === 'hit') { nh++; if (typeof e.feint !== 'boolean' || typeof e.tempo !== 'string' || !isNum(e.edge) || e.edge < 0 || e.edge > 1) { bad++; ex.push(e.type); } }
          if (e.type === 'point') { np++; if (typeof e.move !== 'string' || !['', 'feint', 'roll', 'edge', 'quick'].includes(e.move) || g.lastPoint.move !== e.move) { bad++; ex.push('point ' + e.move); } }
          if (e.type === 'feint') { nf++; if (!e.player || e.team !== 0 || !['tip', 'roll'].includes(e.shot)) { bad++; ex.push('feint'); } }
          for (const k in e) if (e[k] === undefined) { bad++; ex.push(e.type + '.' + k); }
        }
      }
      if (s === 1) { const sm = g.stats.mastery; res.push(['(f0) stats.mastery cuenta usos y puntos (bot con maestría, 180 s)', sm.feint[0] + sm.roll[0] + sm.edge[0] + sm.lane + sm.high + sm.quick[0] > 0, JSON.stringify(sm)]); }
    }
    res.push(['(f) eventos hit / point / feint sin undefined, con feint/tempo/edge/move válidos', bad === 0 && nf > 0, { hits: nh, puntos: np, fintas: nf, mal: bad, ej: ex.slice(0, 4) }]);
  }
  // (g) altReady / aimPoint: COLOCAR ofrece 'roll' en el 3r toque en el aire (solo con mastery) y la retícula es kind 'roll'
  if (want('g')) {
    const mk = (ms) => { const g = S.createGame({ demo: false, seed: 63, mastery: ms }), h = g.teams[0][0], m = g.teams[0][1];
      e1Rally(g, { x: 1.2, y: 0.5, z: 3.6, vz: 0 }); g.touchTeam = 0; g.touches = 2; g.lastTeam = 0; g.lastPlayer = m; g.lastKind = 'set';
      g.ctrl = h; h.x = 1.5; h.y = 0.5; h.z = 0.3; h.vz = 2.5; m.x = 6; m.y = -2; for (const q of g.teams[1]) { q.x = -8; q.y = q.idx ? 4.5 : -4.5; }
      S.step(g, DT, null); return g; };
    // (altReady: alguna vez 'roll' mientras sube y baja en el aire con mastery; nunca sin ella)
    const scan = (ms) => { const g = mk(ms); let r = ''; for (let i = 0; i < 120 && g.ctrl.z > 0 && g.mode === 'rally'; i++) { const v = S.altReady(g); if (v) { r = v; break; } S.step(g, DT, null); } return r; };
    const g1 = mk(true), a1 = scan(true), a0 = scan(false);
    g1.swingLive = true; g1.swingShot = 'jset'; const ap = S.aimPoint(g1, {}, null); g1.swingLive = false; g1.swingShot = '';
    g1.aim3.y = 4.45; const ap2 = S.aimPoint(g1, {}, null);
    res.push(['(g) altReady = roll en el 3r toque (solo con mastery); aimPoint kind roll (radio ×0,6) y edge al filo', a1 === 'roll' && a0 === '' && ap && ap.kind === 'roll' && ap2 && ap2.kind === 'spike' && ap2.edge > 0.9,
      { altReady: [a1, a0], roll: ap && [ap.kind, +ap.spread.toFixed(3)], filo: ap2 && [ap2.kind, +ap2.edge.toFixed(2)] }]);
  }
  // (h) tramo 2, jugada perfecta: recepción, colocación y remate perfectos seguidos (2 del humano) → hit.chain 1, 2, 3 y el remate con
  // la defensa CPU más justa; una colocación con te = 0,06 corta la racha; sin mastery, hit.chain siempre 0
  if (want('h')) {
    const seq = (ms, teSet) => {
      const g = S.createGame({ demo: false, seed: 71, mastery: ms, ctrl: 'one' }), h = g.teams[0][0], m = g.teams[0][1], ch = [];
      e1Rally(g, { x: 5, y: 0, z: 1, vz: -2 }); g.touchTeam = 1; g.touches = 3; g.lastTeam = 1; g.lastKind = 'free'; g.lastPlayer = g.teams[1][0];
      g.ctrl = h; h.x = 5; h.y = 0; h.z = 0; S.drainEvents(g);
      const one = (p, te) => { S._hit(g, p, null, te, ''); const e = S.drainEvents(g).find(x => x.type === 'hit'); ch.push(e ? e.chain : -1); return e; };
      one(h, 0); m.x = 2; m.y = 0; m.z = 0; Object.assign(g.ball, { x: 2, y: 0, z: 2.2 }); one(m, teSet);
      h.x = 1.4; h.y = 0; h.z = 0.6; Object.assign(g.ball, { x: 1.4, y: 0, z: C.NET_H + 0.6, vz: -0.5 }); const sp = one(h, 0);
      return { ch, kind: sp && sp.kind, speed: sp && +sp.speed.toFixed(2) };
    };
    const a = seq(true, 0), b2 = seq(true, 0.06), c2 = seq(false, 0);
    res.push(['(h) jugada perfecta: hit.chain 1-2-3 (remate más rápido), se corta con te = 0,06, 0 sin mastery', a.ch.join() === '1,2,3' && a.kind === 'spike' && b2.ch.join() === '1,0,1' &&
      c2.ch.join() === '0,0,0' && a.speed > c2.speed, { con: a, corte: b2, sin: c2 }]);
  }
  const bad = res.filter(r => !r[1]);
  if (bad.length) fail('maestría (E1): ' + bad.map(r => r[0] + ' ' + JSON.stringify(r[2])).join('; '));
  console.log('Maestría (E1): ' + res.length + ' pruebas, ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s' + (failures === f0 ? ' OK' : ''));
}

// ================= Ajustes de juego (17-nov-2026, Ferran) =================
/* (a) plancha: calidad siempre 'poor' (tope 0,45 × 0,7) y alcance REACH + DIVE (0,8); (b) remates de la CPU en 6v6: ninguno a menos de
 * 9 m/s de velocidad horizontal (antes ~40 % < 8 m/s: «rosquitas»); (c) colocador humano: la IA no le deja los balones de su celda en
 * el 1r toque (humanOwns solo por cercanía); (d) «¡Pídela!» del colocador delantero tras dar él el 1r toque (askOk) y el colocador de
 * emergencia le coloca (buildCand le acepta; tempo 'shoot'); (e) colocación del humano en 6v6: la calidad pesa en el remate del compañero; (g) estirón: el 1r toque del humano lejos del cuerpo (> 0,55 del alcance)
 * pierde calidad y precisión aunque clave el timing (STRETCH); la IA no. */
function j17Section() {
  const f0 = failures, res = [];
  const push0 = res.push.bind(res); res.push = (r) => { console.log('  ' + r[0] + ' ' + JSON.stringify(r[2]) + (r[1] ? '' : '   <<< FALLA')); return push0(r); };
  console.log('\nAjustes de juego (17-nov-2026)');
  // (a) plancha
  { let worst = 0, n = 0; const g = S.createGame({ autopilot: true, seed: 5 }), p = g.teams[0][0];
    for (let k = 0; k < 20; k++) { e1Rally(g, { x: 5, y: 1.9, z: 0.5, vz: -1 }); g.touchTeam = 1; g.touches = 3; g.lastTeam = 1; g.lastKind = 'spike'; g.lastPlayer = g.teams[1][0];
      p.x = 5; p.y = 0; p.z = 0; p.vz = 0; p.down = 0; S._hit(g, p, null, 0, 'dive'); const hv = S.drainEvents(g).find(e => e.type === 'hit'); n++; if (hv) worst = Math.max(worst, hv.quality); }
    res.push(['(a) plancha: calidad <= 0,32 (siempre «poor») y alcance REACH + DIVE = 2,15', worst <= 0.316 && Math.abs(C.REACH + C.DIVE - 2.15) < 1e-9, { maxQ: +worst.toFixed(3), alcance: C.REACH + C.DIVE }]); }
  // (b) remates de la CPU en 6v6
  { let slow = 0, n = 0; const K = VB.ATTR_KEYS, st = v => { const o = {}; K.forEach(k => { o[k] = v; }); return o; };
    for (const [ov, d] of [[60, 'normal'], [85, 'hard']]) for (let sd = 1; sd <= 2; sd++) {
      const g = S.createGame({ format: '6v6', autopilot: true, seed: sd, difficulty: d, mastery: true, attrs: [[0, 1, 2, 3, 4, 5].map(() => st(ov)), [0, 1, 2, 3, 4, 5].map(() => st(ov))] });
      for (let i = 0; i < 60 * 240; i++) { S.step(g, DT, null); for (const e of S.drainEvents(g)) if (e.type === 'hit' && e.kind === 'spike' && e.shot !== 'roll') { n++; if (Math.hypot(g.ball.vx, g.ball.vy) < 9) slow++; } }
    }
    res.push(['(b) 6v6: remates de la CPU a >= 9 m/s (sin rosquitas), medias 60 y 85', n > 50 && slow / n < 0.03, { remates: n, lentos: slow }]); }
  // (c) colocador humano: su celda en el 1r toque no es suya; a menos de HUM.area sí
  { const g = S.createGame({ format: '6v6', seed: 9, ctrl: 'one', ctrlRole: 'S' }), hu = g.ctrl, A = VB.AI6, sp = A.spot(g, hu);
    const far = A.humanOwns(g, 0, hu, { x: sp.x, y: sp.y, t: 1 }, 0, null) === false || Math.hypot(sp.x - hu.x, sp.y - hu.y) < 1.5;
    const near = A.humanOwns(g, 0, hu, { x: hu.x + 0.5, y: hu.y, t: 1 }, 0, null) === true;
    const g2 = S.createGame({ format: '6v6', seed: 9, ctrl: 'one', ctrlRole: 'OH' }), h2 = g2.ctrl, sp2 = A.spot(g2, h2);
    const ohCell = A.humanOwns(g2, 0, h2, { x: sp2.x, y: sp2.y, t: 1 }, 0, null) === true;
    res.push(['(c) colocador humano: su celda del 1r toque la cubren los compañeros (a < 1,5 m sigue siendo suya); el receptor, como antes', far && near && ohCell, { far, near, ohCell }]); }
  // (d) «¡Pídela!» del colocador tras su 1r toque
  { const g = S.createGame({ format: '6v6', seed: 11, ctrl: 'one', ctrlRole: 'S' }), hu = g.ctrl, A = VB.AI6, sd = S.side(0);
    let front = g.ctrl.front, tries = 0;
    while (!g.ctrl.front && tries++ < 6) { S.rotate ? S.rotate(g, 0) : null; front = g.ctrl.front; }
    e1Rally(g, { x: sd * 3, y: 0, z: 2.2, vz: -1 }); g.touchTeam = 0; g.touches = 1; g.lastTeam = 0; g.lastPlayer = hu; g.lastKind = 'pass'; g.lastTouchT = g.time;
    const okFront = front ? S.askOk(g) : null;
    g.touches = 0; g.lastPlayer = g.teams[1][0]; g.touchTeam = 1; const noFirst = front ? !S.askOk(g) : null;
    g.touchTeam = 0; g.touches = 1; g.lastPlayer = hu; g.ask6 = g.time; g.hAct = g.time;
    hu.x = sd * 1.5; hu.y = sd * 2.5;   // listo para atacar por la derecha (shoot: yl +3,4)
    const em = g.teams[0].find(q => q !== hu && q.role === 'OPP') || g.teams[0].find(q => q !== hu && q.role !== 'S');
    const pl = A.chooseSet(g, em, null, 0, 0), P = g.setPlan[0];
    let picks = 0; for (let k = 0; k < 40; k++) { g.ask6 = g.time; A.chooseSet(g, em, null, 0, 0); if (g.setPlan[0].to === hu) picks++; }
    res.push(['(d) colocador delantero: «¡Pídela!» vale tras su 1r toque (no sin él) y el colocador de emergencia le elige casi siempre (tempo shoot)', front === false || (okFront && noFirst && picks >= 20), { delantero: front, askOk: okFront, sinPrimerToque: noFirst, elegido: P.to === hu ? 'colocador' : P.to && P.to.role, tempo: P.tempo, eligeDe40: picks }]); }
  // (e) colocación del humano en 6v6: con mala calidad el remate del compañero CPU es más lento que con una perfecta
  { const spd = (q) => { const g = S.createGame({ format: '6v6', seed: 21, ctrl: 'one', ctrlRole: 'S' }), hu = g.ctrl, sd = S.side(0);
      const at = g.teams[0].find(p => p !== hu && p.front && p.role !== 'S' && p.role !== 'L');
      e1Rally(g, { x: sd * 0.9, y: at.y, z: 3.2, vz: -0.5 }); at.x = sd * 1.2; at.z = 0.9; at.vz = 1;
      g.touchTeam = 0; g.touches = 2; g.lastTeam = 0; g.lastPlayer = hu; g.lastKind = 'set'; g.lastQ = q; g.lastTouchT = g.time;
      S._hit(g, at, null, 0, '', [-sd * 6, 0]); return Math.hypot(g.ball.vx, g.ball.vy, g.ball.vz); };
    const lo = spd(0.25), hi = spd(1);
    res.push(['(e) 6v6: tras una colocación mala del humano el remate del compañero CPU sale más lento que tras una perfecta', lo < hi * 0.95, { mala: +lo.toFixed(2), perfecta: +hi.toFixed(2) }]); }
  // (f) falta de posición con los pies (regla 7.4.3): quietos = como los centros; con zancada hacia la red, el pie de delante cuenta antes
  { const g = S.createGame({ format: '6v6', seed: 5, ctrl: 'one', ctrlRole: 'OH' }), sd = S.side(0), z6 = S.onCourt(g, 0, 6), z3 = S.onCourt(g, 0, 3);
    z3.x = sd * 2; z3.y = 0; z3.vx = 0; z3.vy = 0; z6.y = 0; z6.vy = 0;
    const at = (dx, v) => { z6.x = sd * (2 + dx); z6.vx = -sd * v; return S.overlapCount(g, 0); };
    const still = [at(0.1, 0), at(0, 0)], run = [at(0.3, 5), at(0.2, 5)], ai = (() => { let o = 0; for (let k = 1; k <= 2; k++) { const d = S.createGame({ format: '6v6', demo: true, seed: k, stats: true }); for (let i = 0; i < 60 * 300; i++) S.step(d, DT, null); S.drainEvents(d); o += d.stats.overlap[0] + d.stats.overlap[1]; } return o; })();
    res.push(['(f) falta de posición con los pies: quieto a 10 cm no y a la altura sí; corriendo a la red a 20 cm ya sí (zancada); la IA nunca', still[0] === 0 && still[1] === 1 && run[0] === 0 && run[1] === 1 && ai === 0, { quieto: still, corriendo: run, ia: ai }]); }
  // (g) estirón del 1r toque del humano (STRETCH): con te = 0, el balón a 0,4 del alcance sale igual que siempre (calidad 1) y a 0,85 ya
  // no es «perfect» y se dispersa mucho más; la IA en la misma escena, sin estirón (calidad = la fórmula de distancia de siempre, 0,8, en los
  // toques que controla: el modelo de esfuerzo, EFFORT, le da en el contacto una prob. de sacarla desviada, 'shank', que aquí no cuenta)
  { const pass = (fmt, fr, ai, k) => { const g = S.createGame({ format: fmt, seed: 300 + k, difficulty: 'normal', ctrl: 'one', autopilot: ai }), p = g.ctrl, sd = S.side(0);
      p.x = sd * 5.5; p.y = 0; p.z = 0; p.vz = 0; p.down = 0; p.cool = 0;
      e1Rally(g, { x: p.x, y: (k % 2 ? 1 : -1) * fr * C.REACH, z: 0.95, vx: sd * 11.3, vz: -4.2 });
      g.touchTeam = 1; g.touches = 1; g.lastTeam = 1; g.lastKind = 'serve'; g.lastPlayer = g.teams[1][0]; g.lastTouchT = g.time - 0.8; g.digTight = false;
      const o = { x: g.ball.x, y: g.ball.y, z: g.ball.z }; S._hit(g, p, null, 0, '', null);
      const hv = S.drainEvents(g).find(e => e.type === 'hit'), b = g.ball, ap = o.z + b.vz * b.vz / (2 * C.G), T = b.vz / C.G + Math.sqrt(2 * Math.max(0, ap - 1.9) / C.G);
      return { q: hv ? hv.quality : NaN, x: o.x + b.vx * T, y: o.y + b.vy * T, sh: !!(hv && hv.shot === 'shank') }; };
    const cell = (fmt, fr, ai) => { const r = []; for (let k = 0; k < 60; k++) { const x = pass(fmt, fr, ai, k); if (!(ai && x.sh)) r.push(x); }
      const mx = r.reduce((s, a) => s + a.x, 0) / r.length, my = r.reduce((s, a) => s + a.y, 0) / r.length;
      return { q: Math.max(...r.map(a => a.q)), qMin: Math.min(...r.map(a => a.q)), spr: r.reduce((s, a) => s + Math.hypot(a.x - mx, a.y - my), 0) / r.length }; };
    const out = {}; let ok = true;
    for (const fmt of ['2v2', '6v6']) { const n = cell(fmt, 0.4, false), f = cell(fmt, 0.85, false), a = cell(fmt, 0.85, true);
      out[fmt] = { cerca: [+n.qMin.toFixed(3), +n.spr.toFixed(2)], lejos: [+f.q.toFixed(3), +f.spr.toFixed(2)], ia: +a.q.toFixed(3) };
      ok = ok && n.qMin > 0.999 && f.q < 0.78 && f.spr > 3.5 * n.spr && Math.abs(a.q - 0.8) < 0.002 && Math.abs(a.qMin - 0.8) < 0.002; }
    res.push(['(g) estirón del 1r toque (humano): a 0,4 del alcance como siempre; a 0,85 sin «perfect» y > 3,5× más disperso; la IA sin estirón', ok, out]); }
  // (h) pase más cerca de la red (6v6, 17-nov-2026): el destino del 1r toque depende de la calidad (passTarget puro) y en partido los
  // pases perfectos bajan por 3 m de alto a ~1,3 m de la red sin colarse nunca bajo ella ni pasar al rival sin 2º toque
  { const A = VB.AI6, g0 = S.createGame({ format: '6v6', seed: 3, ctrl: 'one' }), p0 = g0.teams[0][1]; let n0 = 0; const r0 = g0.rng; g0.rng = () => { n0++; return r0(); };
    const dP = A.passTarget(g0, p0, false, 0.95).d, dM = A.passTarget(g0, p0, false, 0.3).d, hP = A.passTarget(g0, p0, true, 0.95).d, hM = A.passTarget(g0, p0, true, 0.3).d;
    const perf = [], poor = []; let under = 0, ctrl = 0;
    // (los pases malos controlados, q < 0,45, son raros: 0-2 por partida. Con 6 semillas la mediana de los malos salía de 1-2 pases y
    // cualquier cambio de la defensa la dejaba sin muestra; 18-nov-2026: sigue con más semillas, hasta 16, hasta tener al menos 3)
    for (let sd = 1; sd <= 6 || (poor.length < 3 && sd <= 16); sd++) {
      const g = S.createGame({ format: '6v6', demo: true, seed: 2400 + sd }); let tr = null;
      for (let i = 0; i < 60 * 200; i++) {
        const z0 = g.ball.z; S.step(g, DT, null);
        if (tr && !tr.done && z0 > 3 && g.ball.z <= 3 && g.ball.vz < 0) { (tr.q >= 0.78 ? perf : tr.q < 0.45 ? poor : []).push(g.ball.x * S.side(tr.t)); tr.done = true; }
        for (const e of S.drainEvents(g)) {
          if (e.type === 'hit') { tr = e.kind === 'pass' && e.touch === 1 && e.shot !== 'shank' && e.shot !== 'body' && !e.dive ? { t: e.team, q: e.quality, done: false } : null; if (tr) ctrl++; }
          else if (e.type === 'point') { if (tr && e.reason === 'under') under++; tr = null; }
        }
      }
    }
    const med = a => { const b = a.slice().sort((x, y) => x - y); return b.length ? b[b.length >> 1] : NaN; };
    res.push(['(h) pase más cerca de la red: destino por calidad (perfecta 0,8 / mala 1,5; defensa 1,4 / 2,2) sin gastar azar; en partido, perfectos a ≤ 1,7 m de la red a 3 m de alto (≥ 0,5 m más cerca que los malos) y ninguno bajo la red',
      Math.abs(dP - 0.8) < 0.06 && dM === 1.5 && Math.abs(hP - 1.4) < 0.06 && hM === 2.2 && n0 === 0 && med(perf) >= 0.9 && med(perf) <= 1.7 && med(perf) <= med(poor) - 0.5 && under === 0 && ctrl > 60,
      { recepcion: [+dP.toFixed(2), dM], defensa: [+hP.toFixed(2), hM], rng: n0, perfectos3m: +med(perf).toFixed(2), malos3m: +med(poor).toFixed(2), bajoRed: under, pases: ctrl }]); }
  // (i) bloqueo ofensivo (17-nov-2026): GOLPEAR en el aire en la red ante un balón rival que cruza sin atacar (overpass) es un BLOQUEO
  // (pulsado, ofe) y nunca, además, un remate del mismo jugador en el mismo salto
  { let blk = 0, pressed = 0, ofe = 0, spk = 0, stuff = 0, n = 0;
    for (let sd = 0; sd < 60; sd++) {
      const g = S.createGame({ seed: 900 + sd, ctrl: 'one', ctrlIdx: 0, stats: true }), p = g.teams[0][0], rr = S._makeRng(sd + 7), r = () => rr();
      e1Rally(g, { x: -1.0 - 0.4 * r(), y: (r() - 0.5) * 0.6, z: 3.1 + 0.3 * r(), vx: 3.5 + r(), vz: 0.5 });
      g.touchTeam = 1; g.lastTeam = 1; g.touches = 1; g.lastKind = 'pass'; g.lastPlayer = g.teams[1][0]; g.lastTouchT = g.time;
      g.teams[1][0].x = -3; g.teams[1][1].x = -5; g.teams[0][1].x = 6; p.x = 0.45; p.y = g.ball.y; p.z = 0; p.vz = 0; S._refreshPred(g); S.drainEvents(g);
      S._jump(g, p, 0, 0); let pushed = false, done = false; n++;
      for (let i = 0; i < 60 * 6 && !done; i++) {
        const inp = !pushed && p.z > 0.25 ? { move: [0, 0], hit: true, jump: false, jset: false } : null; if (inp) pushed = true;
        S.step(g, DT, inp);
        for (const e of S.drainEvents(g)) {
          if (e.type === 'block' && e.player === p) { blk++; if (e.pressed) pressed++; if (e.ofe) ofe++; if (e.result === 'stuff') stuff++; }
          if (e.type === 'hit' && e.player === p && e.kind === 'spike') spk++;
          if (e.type === 'point') done = true;
        }
      }
    }
    res.push(['(i) bloqueo ofensivo: GOLPEAR ante un overpass en la red = bloqueo pulsado (ofe), nunca remate del mismo salto; hay directos', blk >= n * 0.9 && pressed === blk && ofe === blk && spk === 0 && stuff >= n * 0.2, { escenas: n, bloqueos: blk, pulsados: pressed, ofe, remates: spk, directos: stuff }]); }
  const bad = res.filter(r => !r[1]);
  if (bad.length) fail('ajustes 17-nov: ' + bad.map(r => r[0]).join('; '));
  console.log('Ajustes de juego (17-nov): ' + res.length + ' pruebas' + (failures === f0 ? ' OK' : ''));
}

// ================= Colocar por destino (C2, 15-nov-2026) =================
/* La colocación del humano sale de su dirección (g.setDirA: stick o flechas en la ventana de colocación) y del timing; sin dirección,
 * alta a la 4. SIMTEST_ONLY=colocar node tools/simtest.js: solo esta sección (SIMTEST_COL=b,c filtra). Escenario fijo: el compañero
 * acaba de pasar a (2,0 ; sL)·cs, el humano debajo y la entrada inyectada en step (o el toque con S._hit). Ver notes/sim.md «Colocar
 * por destino (C2)». */
const COL_DIRS = ['↑', '↗', '→', '↘', '↓', '↙', '←', '↖'];
/** Dirección de ángulo deg (0 ↑ hacia la red, 90 →) en el mundo, equipo 0 (x > 0): ↑ = −x, → = +y. */
function colVec(deg, len) { const a = deg * Math.PI / 180; len = len == null ? 1 : len; return [-Math.cos(a) * len, Math.sin(a) * len]; }
/** Destino esperado (independiente de la sim, = la tabla de notes/sim.md): {D, L, apex, tempo} en metros de pabellón. */
function colExpect(deg, sD, sL) {
  let D, L; const neu = deg == null;
  if (neu) { D = 1.0; L = -2.75; }
  else {
    // (revisión C2: ↖/↗ = corta a 1,5 m del colocador sin pasar del destino de ←/→; ←/→ nunca rápidas: tensa con cima >= 4,4)
    const T = [[0.8, 's'], [0.9, 's+'], [1.0, 3.5, 1], [2.6, 2.8], [3.0, 0], [2.6, -2.8], [1.0, -3.5, 1], [0.9, 's-']];
    const th = ((deg % 360) + 360) % 360, u = th / 45, n = Math.round(u);
    let k, f; if (Math.abs(th - n * 45) <= 10) { k = n % 8; f = 0; } else { k = Math.floor(u) % 8; f = u - Math.floor(u); }
    const Lof = (v) => v === 's' ? Math.max(-3.3, Math.min(3.3, sL)) : v === 's+' ? Math.min(3.9, Math.min(sL + 1.5, 3.5)) : v === 's-' ? Math.max(-3.9, Math.max(sL - 1.5, -3.5)) : v;
    const a = T[k], b = T[(k + 1) % 8];
    D = a[0] + (b[0] - a[0]) * f; L = Lof(a[1]) + (Lof(b[1]) - Lof(a[1])) * f; var lane = !!(f < 0.5 ? a : b)[2];
  }
  D = Math.max(0.6, Math.min(3.2, D)); L = Math.max(-3.9, Math.min(3.9, L));
  const s = Math.hypot(D - sD, L - sL);
  let apex = Math.max(3.9, Math.min(6.0, 3.3 + 0.45 * s + 1.2 * Math.max(0, D - 1.3)));
  let tempo = neu ? 'high' : s <= 1.6 && D <= 1.2 ? 'quick' : apex >= 5.1 ? 'high' : 'lane';
  if (!neu && lane && tempo === 'quick') { tempo = 'lane'; apex = Math.max(apex, 4.4); }
  if (neu) apex = Math.max(apex, 5.8);
  return { D, L, apex, tempo, s };
}
/** Montaje: 2º toque del equipo 0 por dar (el n.º 2 acaba de pasar), el humano (n.º 1) en (2,0 ; sL)·cs con el balón en sus manos. */
function colStage(o) {
  o = o || {};
  const g = S.createGame(Object.assign({ demo: false, seed: o.seed || 77, mastery: o.mastery !== false, ctrl: 'one', stats: true },
    o.aimSet === false ? { aimSet: false } : {}, o.beach ? { venue: 'beach' } : {}, o.attrs ? { attrs: o.attrs } : {}));
  const h = g.teams[0][0], m = g.teams[0][1], cs = g.cs || 1, sL = o.sL || 0;
  e1Rally(g, { x: 2.0 * cs, y: sL * cs, z: 2.25, vx: 0, vy: 0, vz: -1 });
  g.touchTeam = 0; g.touches = 1; g.lastTeam = 0; g.lastPlayer = m; g.lastKind = 'pass'; g.lastTouchT = g.time; g.lastQ = 0.9;
  g.ctrl = h; h.x = 2.0 * cs; h.y = sL * cs; h.z = 0; h.vz = 0; m.x = 4.6 * cs; m.y = (sL > 0 ? -1.5 : 1.5) * cs;
  S._refreshPred(g); S.drainEvents(g);
  return { g, h, m, cs, sL };
}
/** Pase de verdad desde from que cae en (tx, ty) a 2,25 m con cima ap. */
function colPass(g, from, tx, ty, ap) {
  const b = g.ball, G = C.G, z0 = 1.0, zt = 2.25; ap = ap || 4.6;
  Object.assign(b, { x: from.x, y: from.y, z: z0, dip: 0, wobA: 0, spin: 0 });
  const vz = Math.sqrt(2 * G * (ap - z0)), T = vz / G + Math.sqrt(2 * (ap - zt) / G);
  b.vx = (tx - b.x) / T; b.vy = (ty - b.y) / T; b.vz = vz;
  g.lastTouchT = g.time; S._refreshPred(g);
}
/** Toque del humano con S._hit en el montaje (dirección deg o neutra); destino real (balón a z = 3 bajando), cima y evento. */
function colHit(st, deg, te) {
  const { g, h } = st;
  g.setDirA = deg == null ? NaN : deg;
  S._hit(g, h, null, te || 0, '');
  const hv = S.drainEvents(g).find(e => e.type === 'hit'), b = g.ball, pr = S.predict(g, 3, {});
  return { hv, x: pr.x, y: pr.y, apex: b.z + b.vz * b.vz / (2 * C.G), lastQ: g.lastQ, g };
}
function colSection() {
  const f0 = failures, res = [], t0 = Date.now();
  const CF = process.env.SIMTEST_COL ? process.env.SIMTEST_COL.split(',') : null, want = k => !CF || CF.includes(k);
  const push0 = res.push.bind(res); res.push = (r) => { console.log('  ' + r[0] + ' ' + JSON.stringify(r[2]) + (r[1] ? '' : '   <<< FALLA')); return push0(r); };
  console.log('\nColocar por destino (C2)');
  const SLS = [-2.5, 0, 2], r2 = v => +(+v).toFixed(2), N0 = { move: [0, 0], hit: false, jump: false, jset: false };
  // (a) identidad: demo, autopilot, CPU contra CPU (6v6 demo) y mastery:false nunca abren la ventana ni cambian nada (puntos y llamadas
  // a g.rng iguales con la bandera y sin ella); la huella 2v2 (fingerprint6.js, al final de simtest) sale idéntica
  if (want('a')) {
    const trace = (opts, bot, secs) => {
      const g = S.createGame(Object.assign({ stats: true }, opts)); let n = 0, win = 0; const r0 = g.rng; g.rng = () => { n++; return r0(); };
      const pts = []; const inp = bot ? makeBot(BOTS.medio, (opts.seed | 0) * 5 + 1) : null;
      for (let i = 0; i < Math.round(secs / DT); i++) {
        S.step(g, DT, inp ? inp(g) : null); if (S.setWin(g) || S.setPreview(g, {}) || g.setDirA === g.setDirA) win++;
        for (const e of S.drainEvents(g)) if (e.type === 'point') pts.push(e.team + e.reason + e.how + e.score.join('-'));
      }
      return { pts: pts.join(' '), rng: n, win };
    };
    let same = 0, n = 0, wins = 0; const bad = [];
    for (let s = 1; s <= 8; s++) {
      const d = ['easy', 'normal', 'hard', 'expert'][s % 4];
      const cases = [[{ seed: s, demo: true }, false], [{ seed: s, autopilot: true, difficulty: d }, false], [{ seed: s, difficulty: d }, true]];
      if (s <= 3) cases.push([{ seed: s, format: '6v6', demo: true }, false]);
      for (const [o, bot] of cases) {
        const a = trace(o, bot, 120), b2 = trace(Object.assign({ mastery: !!(o.demo || o.autopilot || o.format) }, o), bot, 120);
        n++; if (a.pts === b2.pts && a.rng === b2.rng) same++; else bad.push(JSON.stringify(o));
        wins += a.win + b2.win;
      }
    }
    res.push(['(a) identidad: demo / autopilot / 6v6 CPU / mastery:false = igual con y sin bandera (puntos y g.rng) y nunca abren la ventana', same === n && wins === 0, { iguales: same + '/' + n, ventana: wins, distintas: bad.slice(0, 3) }]);
  }
  // (b) neutro: alta a la 4 (destino ±0,3 m de (1,0 ; −2,75)·cs, 'high', cima >= 5,7), pabellón y playa, sL −2,5 / 0 / +2
  if (want('b')) {
    let ok = 0, n = 0; const o = {};
    for (const beach of [false, true]) for (const sL of SLS) {
      const st = colStage({ sL, beach }), r = colHit(st, null, 0), cs = st.cs;
      const e = Math.hypot(r.x - 1.0 * cs, r.y + 2.75 * cs); n++;
      if (e <= 0.3 && r.hv.tempo === 'high' && r.apex >= 5.7 && r.hv.quality > 0.99) ok++;
      o[(beach ? 'playa ' : 'pab. ') + sL] = [r2(r.x), r2(r.y), r.hv.tempo, r2(r.apex)];
    }
    res.push(['(b) neutro = alta a la 4 (±0,3 m, high, cima >= 5,7) en pabellón y playa', ok === n, o]);
  }
  // (c) 8 direcciones por step (move unitario en ejes de la pista, tras un paso neutro: sin arrastre): destino ±0,3 m de la tabla, su
  // tempo y la cima de la fórmula ±0,05 (q = 1)
  if (want('c')) {
    let ok = 0, n = 0; const bad = [], tab = {};
    for (const beach of [false, true]) for (const sL of SLS) for (let k = 0; k < 8; k++) {
      const st = colStage({ sL, beach }), { g, h, cs } = st;
      S.step(g, DT, N0);
      S.step(g, DT, { move: colVec(k * 45), hit: false, jump: false, jset: false });
      const dirA = g.setDirA;
      e1Rally(g, { x: 2.0 * cs, y: sL * cs, z: 2.25, vx: 0, vy: 0, vz: -1 }); h.x = 2.0 * cs; h.y = sL * cs; h.z = 0; h.vz = 0;
      const r = colHit(st, dirA, 0), ex = colExpect(k * 45, 2.0, sL);
      const e = Math.hypot(r.x - ex.D * cs, r.y - ex.L * cs); n++;
      const da = ((dirA - k * 45) % 360 + 540) % 360 - 180;
      if (Math.abs(da) < 1e-6 && e <= 0.3 && r.hv.tempo === ex.tempo && Math.abs(r.apex - ex.apex) <= 0.05) ok++;
      else bad.push([beach ? 'playa' : 'pab', sL, COL_DIRS[k], r2(dirA), r2(e), r.hv.tempo, ex.tempo, r2(r.apex), r2(ex.apex)]);
      if (!beach && sL === 0) tab[COL_DIRS[k]] = [r2(r.x), r2(r.y), r.hv.tempo, r2(r.apex)];
    }
    res.push(['(c) 8 direcciones: destino ±0,3 m de la tabla, tempo y cima de la fórmula (pabellón y playa, 3 sL)', ok === n, { ok: ok + '/' + n, sL0: tab, mal: bad.slice(0, 4) }]);
  }
  // (d) analógico: θ de 0 a 360 de 5 en 5 sin saltos (< 1,2 m entre vecinos), imán de ±10° al punto exacto; módulo 0,55 neutro, 0,65 dirección
  if (want('d')) {
    let jump = 0, snapBad = 0, prev = null, maxJ = 0; const o = {};
    for (let a = 0; a <= 360; a += 5) {
      const st = colStage({ sL: 0 }); st.g.setDirA = a; const sa = S.setAim(st.g, st.h, true, {}, st.h.x, st.h.y);
      if (prev) { const d = Math.hypot(sa.x - prev.x, sa.y - prev.y); maxJ = Math.max(maxJ, d); if (d >= 1.2) jump++; }
      prev = { x: sa.x, y: sa.y };
      const n45 = Math.round(a / 45) * 45;
      if (Math.abs(a - n45) <= 10) { st.g.setDirA = n45; const sb = S.setAim(st.g, st.h, true, {}, st.h.x, st.h.y); if (Math.abs(sb.x - sa.x) > 1e-12 || Math.abs(sb.y - sa.y) > 1e-12) snapBad++; }
    }
    const modT = (len) => { const st = colStage({ sL: 0 }); S.step(st.g, DT, N0); S.step(st.g, DT, { move: colVec(270, len) }); return st.g.setDirA; };
    const m55 = modT(0.55), m65 = modT(0.65);
    o.saltoMax = r2(maxJ); o.saltos = jump; o.iman = snapBad; o.mod055 = m55; o.mod065 = m65;
    res.push(['(d) analógico: sin saltos (< 1,2 m cada 5°), imán ±10°, módulo 0,55 neutro y 0,65 dirección', jump === 0 && snapBad === 0 && m55 !== m55 && Math.abs(m65 - 270) < 1e-6, o]);
  }
  // (e) arrastre (revisión C2, «mover no es apuntar»): llegar a la ventana con ↑ pulsada = neutro; soltar y volver a pulsar ↑ = rápida;
  // cambiar a ← sin soltar = tensa a la 4; ↖ sin soltar (sector vecino de la traída) = neutro; soltar durante el gesto conserva la
  // dirección; retocar hacia el aro amarillo (a 0,4 m detrás de él, ↑) o volver tras pasarse (0,4 m delante, ↓) = neutro
  if (want('e')) {
    const o = {};
    const run = (seq, dx) => { // el primer paso con la ventana cerrada; se abre en el segundo con la dirección que traía
      const st = colStage({ sL: 0 }), { g, h } = st; g.touches = 0; g.lastPlayer = null; g.touchTeam = 1;
      if (dx) h.x += dx * st.cs;
      S.step(g, DT, { move: seq[0] }); g.touchTeam = 0; g.touches = 1; g.lastPlayer = st.m;
      let any = false;
      for (let i = 1; i < seq.length; i++) { S.step(g, DT, { move: seq[i] }); if (g.setDirA === g.setDirA) any = true; }
      g.anyDir = any; return g; };
    const up = colVec(0), lf = colVec(270), ul = colVec(315), dn = colVec(180), zz = [0, 0];
    const g1 = run([up, up, up]), g2 = run([up, up, zz, up]), g3 = run([up, up, lf]), g5 = run([up, up, ul, ul]);
    const rt = [zz, zz]; for (let i = 0; i < 10; i++) rt.push(up); const g6 = run(rt, 0.4);
    const bk = [zz, zz]; for (let i = 0; i < 10; i++) bk.push(dn); const g7 = run(bk, -0.4);
    o.arrastre = g1.setDirA; o.reSoltar = g2.setDirA; o.cambio = g3.setDirA; o.vecino = g5.setDirA; o.retoque = g6.anyDir; o.vuelta = g7.anyDir;
    const st = colStage({ sL: 0 }), g4 = st.g; Object.assign(g4.ball, { z: 3.4, vz: 0 }); S._refreshPred(g4);
    S.step(g4, DT, N0); S.step(g4, DT, { move: lf }); S.step(g4, DT, { move: lf, hit: true }); const live = g4.swingLive; S.step(g4, DT, N0); o.gesto = [live, g4.setDirA];
    const sp = (g) => { const v = S.setPreview(g, {}); return v && v.tempo; };
    o.tempos = [sp(g1), sp(g2), sp(g3)];
    res.push(['(e) arrastre: ↑ traída = neutra; soltar y ↑ = rápida; ← sin soltar = tensa; ↖ vecina = neutra; gesto la conserva; retocar o volver al aro = neutra',
      g1.setDirA !== g1.setDirA && Math.abs(g2.setDirA) < 1e-6 && Math.abs(g3.setDirA - 270) < 1e-6 && g5.setDirA !== g5.setDirA && live &&
      Math.abs(g4.setDirA - 270) < 1e-6 && !g6.anyDir && !g7.anyDir && o.tempos[0] === 'high' && o.tempos[1] === 'quick' && o.tempos[2] === 'lane', o]);
  }
  // (f) calidad: te {0; 0,06; 0,15; 0,30} × Colocación {15, 50, 90} × 300 semillas, destino ← con sL 0: error del destino y |Δcima| bajan
  // siempre al mejorar el timing y al subir la Colocación; perfecto con 90 < 0,15 m; malo con 15 > 0,8 m
  if (want('f')) {
    const TES = [0, 0.06, 0.15, 0.30], STS = [15, 50, 90], NS = 300, ex = colExpect(270, 2.0, 0), E = {}, A = {}, Ov = {};
    for (const sv of STS) for (const te of TES) {
      let se = 0, sa = 0, n = 0, ov = 0;
      for (let s = 1; s <= NS; s++) {
        const st = colStage({ sL: 0, seed: 9000 + s, attrs: [[{ set: sv }, null], [null, null]] }), r = colHit(st, 270, te);
        if (r.x < 0.2) { ov++; continue; } // pasa la red sin querer (azar de siempre, q < 0,35)
        se += Math.hypot(r.x - ex.D, r.y - ex.L); sa += Math.abs(r.apex - ex.apex); n++;
      }
      E[sv + '/' + te] = se / n; A[sv + '/' + te] = sa / n; Ov[sv + '/' + te] = ov;
    }
    let mono = true;
    for (const sv of STS) for (let i = 1; i < TES.length; i++) if (!(E[sv + '/' + TES[i]] > E[sv + '/' + TES[i - 1]] && A[sv + '/' + TES[i]] >= A[sv + '/' + TES[i - 1]])) mono = false;
    for (const te of TES) for (let i = 1; i < STS.length; i++) if (!(E[STS[i] + '/' + te] < E[STS[i - 1] + '/' + te] && A[STS[i] + '/' + te] <= A[STS[i - 1] + '/' + te])) mono = false;
    const tab = {}; for (const sv of STS) tab['Col ' + sv] = TES.map(te => r2(E[sv + '/' + te]) + '/' + r2(A[sv + '/' + te])).join('  ');
    res.push(['(f) calidad: error del destino / |Δcima| (m) por timing (te 0 / 0,06 / 0,15 / 0,30) y Colocación; monótono; 90 perfecto < 0,15, 15 malo > 0,8',
      mono && E['90/0'] < 0.15 && E['15/0.3'] > 0.8, { tabla: tab, pasaLaRed: Ov['15/0.3'] + '/' + NS }]);
  }
  // (g) atacante: control 'one', compañero CPU; 9 entradas × 100 semillas por step con pulsación perfecta (q >= 0,78): remata >= 90 %
  // (la rápida >= 85 %); antes del toque se acerca a la batida del destino. (h) se mide en las mismas jugadas
  if (want('g') || want('h')) {
    const NS = want('g') ? 100 : 12, kinds = [null, 0, 45, 90, 135, 180, 225, 270, 315], o = {}, pv = { all: 0, miss: 0, eq: 0, eqN: 0 };
    let okAll = true, closer = 0, closerN = 0; const cfar = [];
    for (const deg of kinds) {
      let n = 0, spk = 0, notOk = 0;
      for (let s = 1; s <= NS; s++) {
        const sy = ((s % 5) - 2) * 0.6, st = colStage({ sL: sy, seed: 500 + s * 7 + (deg == null ? 0 : deg) }), { g, h, m } = st;
        m.x = 4.6; m.y = sy + (s % 2 ? 1.6 : -1.6); for (const q of g.teams[1]) { q.x = -5; q.y = q.idx ? 2 : -2; }
        colPass(g, m, 2.0, sy, 4.6); h.x = 2.0; h.y = sy;
        g.touches = 0; g.touchTeam = 1; S.step(g, DT, N0); g.touchTeam = 0; g.touches = 1; g.lastPlayer = m; g.lastKind = 'pass';
        const w = {}; let hv = null, m0 = null, last = null, pressed = false, done = null;
        for (let i = 0; i < 120 * 6 && !done; i++) {
          const inp = { move: [0, 0], hit: false, jump: false, jset: false };
          if (!hv) {
            const p = S.setPreview(g, {}); pv.all++; if (!p) pv.miss++;
            if (p) {
              if (!m0 || Math.hypot(p.bx - m0.bx, p.by - m0.by) > 0.5) m0 = { x: m.x, y: m.y, bx: p.bx, by: p.by }; // (desde que el destino cambia)
              last = { bx: p.bx, by: p.by, mx: m.x, my: m.y };
              const ww = S.hitWindow(g, h, {}); if (ww.reach && h.z <= 0.05) { const sa = S.setAim(g, h, true, {}, ww.x, ww.y); pv.eqN++; if (Math.abs(sa.x - p.x) < 1e-9 && Math.abs(sa.y - p.y) < 1e-9) pv.eq++; }
              if (p.ok === false) notOk++;
            }
            S.hitWindow(g, h, w);
            if (deg != null && w.t <= 0.6) inp.move = colVec(deg); // apunta al final (antes, quieto: no corre con la dirección)
            if (!pressed && w.press <= 0) { inp.hit = true; pressed = true; }
          }
          S.step(g, DT, inp);
          for (const e of S.drainEvents(g)) {
            if (e.type === 'hit' && e.player === h && !hv) hv = e;
            else if (e.type === 'hit' && hv && e.team === 0 && e.player === m) done = e;
            else if (e.type === 'hit' && hv && e.team === 1) done = { kind: 'none' };
            else if (e.type === 'point') done = { kind: 'none' };
          }
        }
        if (!hv || hv.quality < 0.78) continue;
        n++; if (done && (done.kind === 'spike' || done.shot === 'tip' || done.shot === 'roll')) spk++;
        if (m0 && last) { // (ya en la batida, a < 0,6 m, también cuenta)
          closerN++; const dd1 = Math.hypot(last.mx - last.bx, last.my - last.by), dd0 = Math.hypot(m0.x - last.bx, m0.y - last.by);
          if (dd1 <= dd0 + 1e-6 || dd1 < 0.6) closer++; else if (cfar.length < 6) cfar.push([deg, r2(dd0), r2(dd1)]); }
      }
      const lab = deg == null ? 'neutro' : COL_DIRS[deg / 45];
      o[lab] = pct(spk, n) + ' de ' + n + (notOk ? ' (no llega: ' + notOk + ' pasos)' : '');
      if (want('g') && !(n >= NS * 0.8 && spk / n >= (deg === 0 ? 0.85 : 0.9))) okAll = false;
    }
    if (want('g')) res.push(['(g) atacante CPU: remata >= 90 % (rápida >= 85 %) con q >= 0,78, 9 entradas × ' + NS + ' semillas; se acerca a la batida antes del toque',
      okAll && closer >= 0.95 * closerN, Object.assign(o, { acerca: pct(closer, closerN), lejos: cfar })]);
    if (want('h')) {
      // (h) vista previa: presente desde el pase hasta el toque; = setAim sin error (1e-9); null en demo, autopilot y aimSet:false; en el
      // aire, el destino de la colocación en salto
      const nul = [S.createGame({ demo: true, seed: 3, mastery: true }), S.createGame({ autopilot: true, seed: 3, mastery: true })].map(g => {
        e1Rally(g, { x: 2, y: 0, z: 3, vz: -1 }); g.touchTeam = 0; g.touches = 1; g.lastPlayer = g.teams[0][1]; g.lastKind = 'pass'; return S.setPreview(g, {}); });
      const off = colStage({ aimSet: false }); nul.push(S.setPreview(off.g, {}));
      const air = colStage({ sL: 0.5 }), ga = air.g, ha = air.h; Object.assign(ga.ball, { x: 1.2, y: 0.5, z: 3.6, vz: 0 }); ha.x = 1.5; ha.y = 0.5; ha.z = 0.4; ha.vz = 2.5; air.m.y = -2;
      S._refreshPred(ga); const pa = S.setPreview(ga, {});
      const airOk = !!pa && S.jsetReady(ga) && pa.tempo === 'quick' && Math.abs(pa.x - VB.JSET.tx) < 1e-9 && Math.abs(pa.y + 2) < 1e-9;
      res.push(['(h) vista previa: siempre desde el pase hasta el toque, = setAim (1e-9), null en demo / autopilot / aimSet:false, en el aire = colocación en salto',
        pv.miss === 0 && pv.eq === pv.eqN && pv.eqN > 50 && nul.every(v => v === null) && airOk,
        { pasos: pv.all, sinVista: pv.miss, iguales: pv.eq + '/' + pv.eqN, nulls: nul.map(v => v === null), aire: pa && [pa.tempo, r2(pa.x), r2(pa.y)] }]);
    }
  }
  // (i) COLOCAR en el suelo: en el 2º toque con el balón a la altura de colocar = gesto '', hit 'set' y sin saltar; balón alto en la red,
  // fuera del 2º toque y sin maestría = salta
  if (want('i')) {
    const go = (st, prep) => {
      const { g, h } = st; if (prep) prep(g, h); S._refreshPred(g); const w = {}; let sw = null, hv = null, maxZ = 0, jumped = false, pressed = false;
      for (let i = 0; i < 120 && !hv && !jumped; i++) {
        S.hitWindow(g, h, w); const inp = { move: [0, 0], hit: false, jump: false, jset: false };
        if (!pressed && w.press <= 0.02) { inp.jset = true; inp.jump = true; pressed = true; }
        S.step(g, DT, inp); maxZ = Math.max(maxZ, h.z); if (h.z > 0 || h.vz > 0) jumped = true;
        for (const e of S.drainEvents(g)) { if (e.type === 'swing' && e.player === h && !sw) sw = e; if (e.type === 'hit' && e.player === h) hv = e; }
      }
      return { sw, hv, jumped, maxZ }; };
    const pass = (g) => { Object.assign(g.ball, { z: 3.2, vz: 0 }); };
    const a = go(colStage({ sL: 0 }), pass);
    const hi = go(colStage({ sL: 0 }), (g, h) => { h.x = 0.6; h.y = 0; Object.assign(g.ball, { x: 1.6, y: 0, z: 3.6, vx: -6, vy: 0, vz: 0 }); });
    const t1 = go(colStage({ sL: 0 }), (g) => { pass(g); g.touches = 0; g.touchTeam = 1; g.lastPlayer = g.teams[1][0]; g.lastKind = 'spike'; });
    const nm = go(colStage({ sL: 0, mastery: false }), pass);
    res.push(['(i) COLOCAR en el suelo coloca en el 2º toque (gesto vacío, hit set, sin saltar); alto en la red / fuera del 2º toque / sin maestría salta',
      !!(a.sw && a.sw.shot === '' && a.hv && a.hv.kind === 'set' && !a.jumped && a.maxZ === 0 && hi.jumped && t1.jumped && nm.jumped),
      { suelo: [a.sw && a.sw.shot, a.hv && a.hv.kind, a.jumped], alto: hi.jumped, toque1: t1.jumped, sinMaestria: nm.jumped }]);
  }
  // (j) 6v6 con colocador humano: las 9 entradas dan el atacante y el tempo de la tabla; neutro = receptor delantero alta; la rápida fuera
  // de sistema = alta a la 4; una sola llamada a g.rng por chooseSet; previewSet = el plan real
  if (want('j')) {
    const VB6 = VB.AI6, sd0 = S.side(0), o = {}; let ok = 0, n = 0, rngBad = 0, pvBad = 0; const bad = [];
    // [puesto, tempo, cambio de cima (delanteros) o zona preferida (pipe)]
    const WANT = { n: ['OH', 'high', 0], 0: ['MB', 'quick', 0], 45: ['OPP', 'shoot', 0], 90: ['OPP', 'shoot', 0.4], 135: ['OH', 'pipe', 1], 180: ['OH', 'pipe', 6], 225: ['OH', 'pipe', 5], 270: ['OH', 'high', 0], 315: ['OH', 'high', -0.6] };
    for (const key of Object.keys(WANT)) for (let s = 0; s < 6; s++) {
      const h = S.createGame({ format: '6v6', seed: 700 + s, ctrl: 'one', ctrlRole: 'S' }), hs = h.ctrl, wv = WANT[key], back = wv[1] === 'pipe';
      if (back) { S.rotate(h, 0); S.rotate(h, 0); S.applyLibero(h); }
      h._pq6 = [{ q: 0.9, t: h.time }, { q: 0, t: -9 }]; hs.x = sd0 * 0.9; hs.y = sd0 * 0.9;
      h.setDirA = key === 'n' ? NaN : +key;
      const pv = VB6.previewSet(h, hs, {});
      let calls = 0; const r0 = h.rng; h.rng = () => { calls++; return r0(); };
      const d8 = VB6.dirOf8(h, hs); VB6.chooseSet(h, hs, d8.lane, d8.pref, d8.apexD); h.rng = r0; const P = h.setPlan[0];
      if (calls !== 1) rngBad++;
      if (!(pv.to === P.to && pv.tempo === P.tempo && Math.abs(pv.apex - P.apex) < 1e-12 && Math.abs(pv.yl - P.yl) < 1e-12)) pvBad++;
      n++;
      const zOk = !back || (P.to && (P.to.zone === wv[2] || !h.teams[0].some(q => q.zone === wv[2] && VB6.canPipe(q))));
      const apOk = Math.abs(P.apex - (VB6.FORM.set[P.tempo].apex + (back ? 0 : wv[2]))) < 1e-9;
      // (revisión C2: el pipe va al carril de la zona pedida —↘ 1, ↓ 6, ↙ 5— aunque lo remate el mismo zaguero)
      const ylOk = !back || Math.abs(P.yl - S.ZONE[wv[2]].yl * VB6.FORM.pipeY) < 1e-9;
      if (P.to && P.to.role === wv[0] && P.tempo === wv[1] && zOk && apOk && ylOk) ok++; else bad.push([key, P.to && P.to.role, P.tempo, P.to && P.to.zone, r2(P.apex), r2(P.yl)]);
      if (s === 0) o[key === 'n' ? 'neutro' : COL_DIRS[+key / 45]] = (P.to ? P.to.role : '-') + ' ' + P.tempo + (back && P.to ? ' z' + P.to.zone + ' yl ' + r2(P.yl) : '') + ' ' + r2(P.apex) + ' ' + pv.kind;
    }
    const h = S.createGame({ format: '6v6', seed: 701, ctrl: 'one', ctrlRole: 'S' }), hs = h.ctrl; h._pq6 = [{ q: 0.2, t: h.time }, { q: 0, t: -9 }]; hs.x = sd0 * 0.9; hs.y = sd0 * 0.9;
    h.setDirA = 0; const d8 = VB6.dirOf8(h, hs); VB6.chooseSet(h, hs, d8.lane, d8.pref, d8.apexD); const Pq = h.setPlan[0];
    o.rapidaFueraDeSistema = (Pq.to && Pq.to.role) + ' ' + Pq.tempo;
    res.push(['(j) 6v6, colocador humano: 9 entradas → atacante, tempo y carril del pipe de la tabla; rápida fuera de sistema = rápida (la pedida, 17-nov-2026); 1 g.rng por chooseSet; previewSet = plan',
      ok === n && rngBad === 0 && pvBad === 0 && !!Pq.to && Pq.to.role === 'MB' && Pq.tempo === 'quick' && Math.abs(Pq.apex - (VB6.FORM.set.quick.apex)) < 1e-9, Object.assign(o, { ok: ok + '/' + n, rng: rngBad, vista: pvBad, mal: bad.slice(0, 4) })]);
  }
  // (k) plantado: en su sitio (en el centro del aro) con una dirección elegida a t <= 0,6 s no se mueve (< 0,05 m); también con la
  // dirección de arrastre (neutra: no hace falta retocar); fuera de su sitio (a 1 m) la dirección le mueve (> 0,15 m) y no apunta
  if (want('k')) {
    const run = (carry, off) => {
      const st = colStage({ sL: 0 }), { g, h, m } = st, b = g.ball, T = 0.5;
      // el balón llega a sus manos (2,0 ; 0 ; 2,25) dentro de 0,5 s, cayendo
      b.vx = -2; b.vy = 0; b.vz = -1; b.x = 2.0 - b.vx * T; b.y = 0; b.z = 2.25 - b.vz * T + 0.5 * C.G * T * T; S._refreshPred(g);
      h.x = g.pr1.x; h.y = g.pr1.y + (off || 0); // en el centro del aro (el imán de la ventana), para medir solo el stick
      // la ventana se abre (2º paso) con ← ya pulsada (arrastre) o sin dirección; luego ← pulsada (fuera de su sitio: → hacia el aro)
      const mv = off ? colVec(90) : colVec(270);
      g.touches = 0; g.touchTeam = 1; S.step(g, DT, N0); g.touchTeam = 0; g.touches = 1; g.lastPlayer = m; g.lastKind = 'pass';
      S.step(g, DT, { move: carry ? mv : [0, 0] });
      const x0 = h.x, y0 = h.y; let k = 0, dir = false;
      for (let i = 0; i < 40 && g.touches === 1 && g.mode === 'rally'; i++) {
        S.step(g, DT, { move: mv }); k++; if (g.setDirA === g.setDirA) dir = true;
        if (off && Math.abs(h.y - g.pr1.y) < 0.6) break;
      }
      return { d: Math.hypot(h.x - x0, h.y - y0), steps: k, dir };
    };
    const a = run(false), c = run(true), f = run(false, -1.0);
    res.push(['(k) plantado: en su sitio con dirección o con arrastre se queda (< 0,05 m); fuera de su sitio corre y no apunta',
      a.d < 0.05 && a.dir && c.d < 0.05 && !c.dir && f.d > 0.15 && !f.dir,
      { conDireccion: r2(a.d), arrastre: [r2(c.d), c.dir], lejos: [r2(f.d), f.dir], pasos: a.steps }]);
  }
  // (l) mover no es apuntar, con pases de verdad: el humano sale a 1,6 m del aro y va a él con las flechas (8 sectores) y pulsa
  // GOLPEAR con timing perfecto. Sin querer apuntar, 4 maneras de moverse dan alta a la 4 (>= 98 %): sigue con la flecha pulsada hasta
  // el toque, se para al llegar (0,25 m), retoca a golpecitos hasta 0,12 m, o se pasa 0,35 m y vuelve. Ya en su sitio, soltar y
  // pulsar ← (t <= 0,6 s) elige ← (>= 95 %; su tempo sale de la distancia: tensa desde el centro o la izquierda, alta desde la derecha)
  if (want('l')) {
    const NS = 40, o = {}; let allOk = true;
    const one = (mode, s) => {
      const st = colStage({ sL: ((s % 5) - 2) * 0.8, seed: 300 + s * 13 }), { g, h, m, cs } = st;
      const tx = 2.0 * cs, ty = h.y; m.x = 5.5 * cs; m.y = -ty * 0.5 + (s % 2 ? 1.5 : -1.5);
      colPass(g, m, tx, ty); const a0 = (s * 2.39996) % (2 * Math.PI);
      h.x = tx + Math.cos(a0) * 1.6 * cs; h.y = ty + Math.sin(a0) * 1.6 * cs; S._refreshPred(g); S.drainEvents(g);
      let pressed = false, hv = null, last = [0, 0], over = mode === 'over' ? 0 : 2, ph = 0;
      for (let i = 0; i < 120 * 4 && !hv; i++) {
        const inp = { move: [0, 0], hit: false, jump: false, jset: false }, w = S.hitWindow(g, h, {});
        let px = g.pr1.x, py = g.pr1.y;
        if (over === 0) { // se pasa: apunta 0,35 m más allá del aro hasta llegar ahí, luego vuelve
          const ux = px - h.x, uy = py - h.y, ul = Math.hypot(ux, uy) || 1;
          if (g.overT == null) g.overT = [ux / ul, uy / ul];
          px += g.overT[0] * 0.35; py += g.overT[1] * 0.35; if (Math.hypot(px - h.x, py - h.y) < 0.25) over = 1;
        }
        const dx = px - h.x, dy = py - h.y, d = Math.hypot(dx, dy);
        const dir8 = () => { const an = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * Math.PI / 4; return [Math.cos(an), Math.sin(an)]; };
        if (mode === 'side') { if (ph === 0) { if (d > 0.25) inp.move = dir8(); else if (w.t <= 0.6) ph = 1; } else inp.move = colVec(270); }
        else if (mode === 'hold') { if (d > 0.25) last = dir8(); inp.move = last; }
        else if (mode === 'stop' || mode === 'over') { if (d > 0.25) inp.move = dir8(); }
        else if (mode === 'nudge') { if (d > 0.12) inp.move = dir8(); }
        if (!pressed && w.press <= 0) { inp.hit = true; pressed = true; }
        const dA = g.setDirA; S.step(g, DT, inp);
        for (const e of S.drainEvents(g)) if (e.type === 'hit' && e.player === h) { hv = e; hv.dirA = dA; }
      }
      return hv;
    };
    for (const mode of ['hold', 'stop', 'nudge', 'over', 'side']) {
      let n = 0, ok = 0;
      for (let s = 1; s <= NS; s++) { const hv = one(mode, s); if (!hv || hv.kind !== 'set') continue; n++; if (mode === 'side' ? Math.abs(hv.dirA - 270) < 1e-6 : hv.tempo === 'high' && hv.dirA !== hv.dirA) ok++; }
      const pc = n ? ok / n : 0; o[mode] = Math.round(pc * 100) + '% de ' + n;
      if (n < NS * 0.9 || pc < (mode === 'side' ? 0.95 : 0.98)) allOk = false;
    }
    res.push(['(l) mover no es apuntar: con la flecha pulsada, parándose, a golpecitos o pasándose = alta a la 4; en su sitio ← = ←', allOk, o]);
  }
  const bad = res.filter(r => !r[1]);
  if (bad.length) fail('colocar por destino (C2): ' + bad.map(r => r[0] + ' ' + JSON.stringify(r[2])).join('; '));
  console.log('Colocar por destino (C2): ' + res.length + ' pruebas, ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s' + (failures === f0 ? ' OK' : ''));
}

// ================= Gimnasio (E6, sprint 5) =================
/* createGame({drill}): ejercicios con repeticiones (saque, recepción, colocación, remate, bloqueo) y peloteo libre. Bots humanos de
 * siempre (makeBot) con la entrada real; gymBot además lleva la mira (saque dirigible y remate) a la diana del ejercicio.
 * SIMTEST_ONLY=gym node tools/simtest.js: solo esta sección. Ver notes/sim.md «E6 (sprint 5)». */
const GYM_KINDS = ['serve', 'recv', 'set', 'atk', 'block'];
/** makeBot + mira a g.drill.target (saque: durante el lanzamiento; remate: en el aire). */
function gymBot(bp, seed) {
  const base = makeBot(bp, seed), st = [0, 0], w = {}; let pressed = -9;
  return g => {
    const o = base(g), d = g.drill, a = g.aim3, p = g.ctrl;
    // bloqueo activo: en el aire en la red, GOLPEAR cuando al rematador rival le quedan ~0,15 s para el golpe (VB.Sim.blockPressCase)
    if (d && d.kind === 'block' && g.mode === 'rally' && p.z > 0.2 && pressed !== g.lastTouchT && S.blockPressCase(g, p)) {
      const q = g.teams[1][0]; S.hitWindow(g, q, w);
      if (w.reach && w.t <= 0.15) { o.hit = true; pressed = g.lastTouchT; }
    }
    if (d && d.target && a && a.on && ((a.kind === 'serve' && g.serveState === 'toss') || a.kind === 'spike')) {
      const dx = d.target.x - a.x, dy = d.target.y - a.y, dd = Math.hypot(dx, dy), f = dd > 1e-6 ? Math.min(1, dd / 0.25) / dd : 0;
      st[0] = dx * f; st[1] = dy * f; o.move = st;
    }
    return o;
  };
}
/** Montaje esperado tras cada drillStage (tabla de E6 §2.4). Devuelve '' o el problema. */
function gymStageIssue(g, e) {
  const d = g.drill, k = d.kind, h = g.ctrl, m = g.teams[0][1 - h.idx], cs = g.cs, s = d.side, near = (p, x, y) => Math.hypot(p.x - x, p.y - y) < 0.05;
  const T = VB.DRILL.kinds[k];
  if (e.n !== d.n || e.of !== d.of || e.kind !== k) return 'evento ' + JSON.stringify([e.kind, e.n, e.of]);
  if (h !== g.teams[0][0] && k !== 'free') return 'el humano no es el n.º 1';
  if (k === 'serve') {
    if (g.mode !== 'serve' || g.server !== h) return 'saque: modo ' + g.mode + ' sacador ' + (g.server && g.server.num);
    if (!g.teams[1].every(q => Math.abs(q.y) > g.HW)) return 'saque: rivales dentro de la pista';
    if (!e.target || Math.abs(e.target[0] - T.targets[d.n][0] * cs) > 1e-9) return 'saque: diana ' + JSON.stringify(e.target);
  } else if (k === 'recv') {
    if (g.mode !== 'serve' || g.server.team !== 1) return 'recepción: modo ' + g.mode;
    if (!e.target || Math.abs(e.target[0] - 1.6 * cs) > 1e-9) return 'recepción: zona ' + JSON.stringify(e.target);
  } else if (k === 'free') {
    if (g.mode !== 'serve') return 'libre: modo ' + g.mode;
  } else {
    if (g.mode !== 'rally' || g.ball.held || g.lastTouchT !== g.time) return k + ': modo ' + g.mode;
    if (k === 'set' && !(g.touchTeam === 0 && g.touches === 1 && g.lastKind === 'pass' && g.lastPlayer === m && near(h, 2.1 * cs, 0.6 * s * cs) && near(m, 5.5 * cs, -1.4 * s * cs) && g.ball.vz > 0)) return 'colocación: estado';
    if (k === 'atk' && !(g.touchTeam === 0 && g.touches === 2 && g.lastKind === 'set' && g.lastPlayer === m && near(h, 3.4 * cs, 2.6 * s * cs) && (d.cpu === 'block') === (d.n >= T.blockFrom))) return 'remate: estado';
    if (k === 'block' && !(g.touchTeam === 1 && g.touches === 2 && g.lastKind === 'set' && g.lastPlayer === g.teams[1][1] && g.defRole === 'block' && near(h, 0.8 * cs, 0) && s === T.sides[d.n])) return 'bloqueo: estado';
    if (!g.players.every(p => p.z === 0 && p.vz === 0)) return k + ': alguien en el aire';
  }
  return '';
}
/** Un ejercicio entero con inputFn (o autopilot). Devuelve repeticiones, eventos y problemas. */
function gymRun(kind, seed, inputFn, o) {
  o = o || {};
  const g = S.createGame(Object.assign({ seed, drill: kind, stats: true }, o.opts || {}));
  const r = { g, reps: [], hits: [], ev: newCounters(), end: null, ex: null, inv: true, stageBad: [], recv: [0, 0], undef: [], lpBad: 0, stages: 0 };
  const evs = [], pr = { x: 0, y: 0, z: 0, t: 0 }, secs = o.secs || 420;
  const chk = e => { for (const k in e) if (e[k] === undefined) r.undef.push(e.type + '.' + k); };
  try {
    for (let i = -1; i < secs / DT; i++) {
      if (i >= 0) S.step(g, DT, inputFn ? inputFn(g, i) : null); // (i = -1: los eventos del montaje de createGame, antes del primer paso)
      evs.length = 0; S.drainEvents(g, evs);
      for (const e of evs) {
        if (!(e.type in r.ev)) { fail('gimnasio: evento desconocido ' + e.type); r.ev[e.type] = 0; }
        r.ev[e.type]++;
        if (e.type === 'drillStage') { r.stages++; chk(e); const bad = gymStageIssue(g, e); if (bad) r.stageBad.push(e.n + ' ' + bad); }
        if (e.type === 'drillRep') { chk(e); r.reps.push(e); if (kind === 'free') r.hits.push(e.hits); if (!g.lastPoint || g.lastPoint.how !== 'drill') r.lpBad++; }
        if (e.type === 'drillEnd') { chk(e); r.end = e; }
        if (e.type === 'hit' && e.kind === 'serve' && e.team === 1 && kind === 'recv') { // ¿el saque de la CPU va a por el humano?
          S.predict(g, 1, pr); r.recv[1]++; if (Math.hypot(pr.x - g.ctrl.x, pr.y - g.ctrl.y) <= 2.5) r.recv[0]++;
        }
      }
      if (i >= 0 && i % 120 === 0 && !checkInvariants(g, 'gimnasio ' + kind)) { r.inv = false; break; }
      if (r.end) break;
    }
  } catch (e) { r.ex = e && e.stack || String(e); }
  return r;
}
const gymMedal = (k, tot) => { const m = VB.DRILL.kinds[k].medals; return tot >= m[2] ? 3 : tot >= m[1] ? 2 : tot >= m[0] ? 1 : 0; };
function gymSection() {
  const f0 = failures, res = [], t0 = Date.now();
  const push0 = res.push.bind(res); res.push = (r) => { console.log('  ' + r[0] + ' ' + JSON.stringify(r[2]) + (r[1] ? '' : '   <<< FALLA')); return push0(r); };
  console.log('\nGimnasio (E6, createGame({drill}))');
  const SEEDS = [11, 23, 37];
  // (1) cada ejercicio con 3 bots (bueno, perfecto con mira a la diana, novato) y 3 semillas, en el pabellón; y una pasada en la playa
  const runs = {}, bad1 = [];
  for (const k of GYM_KINDS) {
    runs[k] = { bueno: [], perfecto: [], novato: [] };
    for (const sd of SEEDS) {
      runs[k].bueno.push(gymRun(k, sd, makeBot(BOTS.bueno, sd * 7 + 1)));
      runs[k].perfecto.push(gymRun(k, sd, gymBot(BOTS.perfecto, sd * 7 + 2)));
      runs[k].novato.push(gymRun(k, sd, makeBot(BOTS.novato, sd * 7 + 3)));
    }
    runs[k].beach = [gymRun(k, SEEDS[0], gymBot(BOTS.bueno, 5), { opts: { venue: 'beach' } })];
    runs[k].auto = [gymRun(k, SEEDS[1], null, { opts: { autopilot: true } })];
  }
  const all = [];
  for (const k of GYM_KINDS) for (const b in runs[k]) for (const r of runs[k][b]) all.push([k, b, r]);
  for (const [k, b, r] of all) {
    const tag = k + '/' + b + '/' + r.g.seed, ns = r.reps.map(e => e.n).join(',');
    const sum = r.reps.reduce((a, e) => a + e.pts, 0);
    if (r.ex) bad1.push(tag + ' excepción ' + r.ex.split('\n')[0]);
    else if (!r.end) bad1.push(tag + ' sin drillEnd (' + r.reps.length + ' rep.)');
    else if (r.reps.length !== 10 || ns !== '0,1,2,3,4,5,6,7,8,9') bad1.push(tag + ' repeticiones ' + ns);
    else if (r.end.total !== sum || r.end.reps.join() !== r.reps.map(e => e.pts).join() || r.g.drill.total !== sum) bad1.push(tag + ' total ' + r.end.total + ' != ' + sum);
    else if (!r.reps.every(e => Number.isInteger(e.pts) && e.pts >= 0 && e.pts <= 3 && typeof e.res === 'string' && typeof e.text === 'string')) bad1.push(tag + ' pts fuera de 0..3');
    else if (r.g.score.join() !== '0,0' || r.g.sets.join() !== '0,0' || r.g.stats.points !== 0) bad1.push(tag + ' marcador ' + r.g.score + ' / ' + r.g.sets);
    else if (r.ev.point || r.ev.whistle || r.ev.gameOver || r.ev.set || r.ev.match || r.ev.sideout) bad1.push(tag + ' eventos de partido ' + JSON.stringify([r.ev.point, r.ev.whistle, r.ev.gameOver]));
    else if (!r.inv) bad1.push(tag + ' invariantes');
    else if (r.undef.length) bad1.push(tag + ' campos undefined ' + r.undef.slice(0, 3));
    else if (r.lpBad) bad1.push(tag + ' g.lastPoint.how != drill');
    else if (!r.g.drill.done || r.g.mode !== 'point' || r.stages !== 10) bad1.push(tag + ' estado final ' + r.g.mode + ' montajes ' + r.stages);
  }
  res.push(['(1) 10 drillRep + drillEnd, total = suma, pts 0-3, marcador 0-0, sin point/whistle/gameOver, invariantes (5 ejercicios × 3 bots × 3 semillas + playa + autopilot)',
    !bad1.length, { partidas: all.length, mal: bad1.slice(0, 4) }]);
  // (2) montaje tras cada drillStage; la CPU saca a por el humano en Recepción
  const bad2 = []; let rn = 0, rd = 0;
  for (const [k, b, r] of all) { for (const s of r.stageBad) bad2.push(k + '/' + b + ' ' + s); if (k === 'recv') { rn += r.recv[1]; rd += r.recv[0]; } }
  res.push(['(2) montaje según la tabla (posiciones, toques, lastKind, modo) y saque de la CPU a ≤ 2,5 m del humano en ≥ 80 %', !bad2.length && rn >= 50 && rd / rn >= 0.8,
    { mal: bad2.slice(0, 4), saquesCerca: pct(rd, rn) + ' de ' + rn }]);
  // (3) puntuación pura (casos fijos)
  const sc = S.drillScore, T0 = { tx: -6, ty: 0, cs: 1 }, cases = [
    ['serve 0,5 m', sc('serve', Object.assign({ land: { x: -6.5, y: 0, inside: true } }, T0)).pts, 3],
    ['serve 1,2 m', sc('serve', Object.assign({ land: { x: -6, y: 1.2, inside: true } }, T0)).pts, 2],
    ['serve 2 m', sc('serve', Object.assign({ land: { x: -4, y: 0, inside: true } }, T0)).pts, 1],
    ['serve fuera', sc('serve', Object.assign({ land: { x: -9.4, y: 0, inside: false } }, T0)).pts, 0],
    ['serve red', sc('serve', Object.assign({ land: null }, T0)).pts, 0],
    ['serve propio campo', sc('serve', Object.assign({ land: { x: 2, y: 0, inside: true } }, T0)).pts, 0],
    ['serve salto perfecto 1,2 m', sc('serve', Object.assign({ land: { x: -6, y: 1.2, inside: true }, jump: true, grade: 'perfect' }, T0)).pts, 3],
    ['serve salto perfecto diana (tope)', sc('serve', Object.assign({ land: { x: -6, y: 0, inside: true }, jump: true, grade: 'perfect' }, T0)).pts, 3],
    ['serve salto bueno 2 m', sc('serve', Object.assign({ land: { x: -4, y: 0, inside: true }, jump: true, grade: 'good' }, T0)).pts, 1],
    ['serve playa 0,75 m (×cs)', sc('serve', { land: { x: -6.75, y: 0, inside: true }, tx: -6, ty: 0, cs: 8 / 9 }).pts, 2],
    ['recv 0,5', sc('recv', { touched: true, own: true, x: 2.1, y: 0, tx: 1.6, ty: 0, cs: 1 }).pts, 3],
    ['recv 1,5', sc('recv', { touched: true, own: true, x: 3.1, y: 0, tx: 1.6, ty: 0, cs: 1 }).pts, 2],
    ['recv 3', sc('recv', { touched: true, own: true, x: 4.6, y: 0, tx: 1.6, ty: 0, cs: 1 }).pts, 1],
    ['recv desviada', sc('recv', { touched: true, own: false, x: -2, y: 0, tx: 1.6, ty: 0, cs: 1 }).pts, 0],
    ['recv ace', sc('recv', { touched: false, tx: 1.6, ty: 0, cs: 1 }).pts, 0],
    ['set perfecta en salto + remate dentro (tope)', sc('set', { grade: 'perfect', jset: true, spikeIn: true }).pts, 3],
    ['set buena + remate dentro', sc('set', { grade: 'good', jset: false, spikeIn: true }).pts, 2],
    ['set perfecta en salto', sc('set', { grade: 'perfect', jset: true, spikeIn: false }).pts, 3],
    ['set floja', sc('set', { grade: 'poor', jset: false, spikeIn: false }).pts, 0],
    ['set sin tocar', sc('set', { grade: '' }).pts, 0],
    ['atk diana', sc('atk', Object.assign({ kind: 'spike', land: { x: -6.8, y: 0.5, inside: true }, block: '' }, T0)).pts, 3],
    ['atk dentro', sc('atk', Object.assign({ kind: 'spike', land: { x: -3, y: 2, inside: true }, block: '' }, T0)).pts, 2],
    ['atk dejada dentro', sc('atk', Object.assign({ kind: 'tip', land: { x: -6, y: 0, inside: true }, block: '' }, T0)).pts, 1],
    ['atk fuera', sc('atk', Object.assign({ kind: 'spike', land: { x: -9.5, y: 0, inside: false }, block: '' }, T0)).pts, 0],
    ['atk tool', sc('atk', Object.assign({ kind: 'spike', land: null, block: 'tool' }, T0)).pts, 1],
    ['atk stuff', sc('atk', Object.assign({ kind: 'spike', land: null, block: 'stuff' }, T0)).pts, 0],
    ['block stuff', sc('block', { block: 'stuff' }).pts, 3], ['block soft', sc('block', { block: 'soft' }).pts, 2],
    ['block touch', sc('block', { block: 'touch' }).pts, 1], ['block tool', sc('block', { block: 'tool' }).pts, 0],
    ['block sin bloqueo', sc('block', { block: '' }).pts, 0],
    ['block dejada leída', sc('block', { block: '', tip: true, jumped: false, read: true }).pts, 1],
    ['block dejada con salto', sc('block', { block: '', tip: true, jumped: true, read: true }).pts, 0],
    ['block stuff + dejada leída (tope)', sc('block', { block: 'stuff', tip: true, jumped: false, read: true }).pts, 3]];
  const bad3 = cases.filter(c => c[1] !== c[2]).map(c => c[0] + ' ' + c[1] + '≠' + c[2]);
  const pure = JSON.stringify(sc('serve', Object.assign({ land: { x: -6.5, y: 0, inside: true } }, T0))) === JSON.stringify(sc('serve', Object.assign({ land: { x: -6.5, y: 0, inside: true } }, T0)));
  res.push(['(3) VB.Sim.drillScore con casos fijos (pura)', !bad3.length && pure, { casos: cases.length, mal: bad3 }]);
  // (4) determinismo: misma semilla y mismas entradas -> mismas repeticiones
  const bad4 = [];
  for (const k of GYM_KINDS) {
    const a = gymRun(k, 99, gymBot(BOTS.medio, 4)), b = gymRun(k, 99, gymBot(BOTS.medio, 4));
    const sa = a.reps.map(e => e.pts + e.res + e.x.toFixed(6)).join(), sb = b.reps.map(e => e.pts + e.res + e.x.toFixed(6)).join();
    if (sa !== sb || !a.end) bad4.push(k);
  }
  res.push(['(4) determinismo (misma semilla y bot)', !bad4.length, { mal: bad4 }]);
  // (5) techo: el perfecto con mira a la diana gana oro en Saque y Remate; el novato no pasa de bronce en >= 2 de 3 semillas
  const tot = (k, b) => runs[k][b].map(r => r.end ? r.end.total : -1), info5 = {}, bad5 = [];
  const hist = (k, b) => { const h = {}; for (const r of runs[k][b]) for (const e of r.reps) h[e.res] = (h[e.res] || 0) + 1; return Object.entries(h).map(([a, n]) => a + ':' + n).join(' '); };
  for (const k of GYM_KINDS) info5[k] = { perfecto: tot(k, 'perfecto').join('/') + ' (' + hist(k, 'perfecto') + ')', bueno: tot(k, 'bueno').join('/'), novato: tot(k, 'novato').join('/') + ' (' + hist(k, 'novato') + ')' };
  // (el perfecto: oro en todas las semillas en Saque; en Remate, el total MEDIO de las 3 en oro y ninguna por debajo de plata. En Remate
  // saca 22-27 con el oro en 23 y lo que mueve el total es el bloqueo de la CPU, que gasta g.rng: el 18-nov-2026, al quitar el dado
  // previo de la defensa (modelo de esfuerzo, EFFORT) salió 22/24/24 con las mismas 21 dianas, y con un g.rng() de relleno donde
  // estaba el dado, 25/21/21; la base, 25/23/27. El techo es el oro de media; una semilla puede perder un punto por el bloqueo)
  { const m = VB.DRILL.kinds.atk.medals, ta = tot('atk', 'perfecto');
    if (!tot('serve', 'perfecto').every(t => gymMedal('serve', t) === 3)) bad5.push('serve perfecto sin oro');
    if (ta.reduce((a, t) => a + t, 0) / ta.length < m[2] || !ta.every(t => gymMedal('atk', t) >= 2)) bad5.push('atk perfecto sin oro de media'); }
  for (const k of GYM_KINDS) if (tot(k, 'novato').filter(t => gymMedal(k, t) <= 1).length < 2) bad5.push(k + ' novato por encima de bronce');
  res.push(['(5) techo de las medallas (umbrales VB.DRILL.kinds[k].medals)', !bad5.length, Object.assign({ mal: bad5 }, info5)]);
  // (6) peloteo libre: 3 min de bot -> peloteos con toques, best = máximo, sin marcador ni eventos de partido
  { const bad6 = []; const info6 = {};
    for (const [lab, opts, bot] of [['uno', { ctrl: 'one' }, makeBot(BOTS.medio, 61)], ['ambos', {}, makeBot(BOTS.bueno, 62)]]) {
      const r = gymRun('free', 61, bot, { secs: 180, opts });
      const mx = Math.max(0, ...r.hits), bestOk = r.reps.every((e, i) => e.best === Math.max(...r.hits.slice(0, i + 1)) && e.isBest === (e.hits > (i ? Math.max(...r.hits.slice(0, i)) : 0)));
      info6[lab] = { peloteos: r.reps.length, max: mx, media: r.hits.length ? +(r.hits.reduce((a, b) => a + b, 0) / r.hits.length).toFixed(2) : 0 };
      if (r.ex) bad6.push(lab + ' excepción ' + r.ex.split('\n')[0]);
      if (r.reps.length < 8 || mx < 3 || r.g.drill.best !== mx || !bestOk) bad6.push(lab + ' peloteos/best');
      if (r.g.score.join() !== '0,0' || r.ev.point || r.ev.whistle || r.ev.gameOver || r.end || r.g.drill.done) bad6.push(lab + ' marcador/eventos');
      if (!r.reps.every((e, i) => e.n === i && e.of === 0 && e.pts === 0)) bad6.push(lab + ' n/of/pts');
      if (r.undef.length || !r.inv) bad6.push(lab + ' undefined/invariantes');
      const sv = r.g.teams.map(t => t.map(p => p.num)); void sv;
    }
    res.push(['(6) peloteo libre (3 min, bot medio con un jugador y bot bueno con los dos)', !bad6.length, Object.assign({ mal: bad6 }, info6)]); }
  // (7) sin opts.drill: g.drill null y ningún evento del gimnasio; drill en la demo y en 6v6 = sin ejercicio / 2v2; accesor VB.AI.leaving
  { const g0 = S.createGame({ seed: 5 }), gd = S.createGame({ seed: 5, demo: true, drill: 'serve' }), g6 = S.createGame({ seed: 5, drill: 'atk', format: '6v6' });
    const gx = S.createGame({ seed: 5, drill: 'nada' });
    let lvOk = typeof VB.AI.leaving === 'function' && VB.AI.leaving(g0, 0) === false;
    g0._lv = [{ t: g0.lastTouchT, on: true }, { t: -1, on: false }]; lvOk = lvOk && VB.AI.leaving(g0, 0) === true && VB.AI.leaving(g0, 1) === false;
    g0.lastTouchT += 1; lvOk = lvOk && VB.AI.leaving(g0, 0) === false;
    const ok7 = g0.drill === null && 'drill' in g0 && gd.drill === null && gx.drill === null && g6.drill && g6.size === 2 && g6.ctrlMode === 'one' && lvOk;
    res.push(['(7) g.drill null fuera del modo (también demo e id desconocido); 6v6 + drill = 2v2; VB.AI.leaving', !!ok7, { leaving: lvOk, seis: g6.size }]); }
  const bad = res.filter(r => !r[1]);
  if (bad.length) fail('gimnasio (E6): ' + bad.map(r => r[0] + ' ' + JSON.stringify(r[2])).join('; '));
  console.log('Gimnasio (E6): ' + res.length + ' pruebas, ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s' + (failures === f0 ? ' OK' : ''));
}

// ================= Repetición (S3-C1): VB.Sim.copyGame / stateHash / g.rng.get-set =================
/* «[repetición] resim idéntica y sin interferencia» (portado de la sonda c1probe/resim.js y resim6.js del plan S3-C1). Por caso:
 * un partido humano con un bot de solo entrada (el de fingerprint6.js); en cada peloteo, copyGame de la partida en vivo a una sombra en
 * el lanzamiento del saque (evento toss) y cada 360 pasos (foto clave), registro de las entradas por paso (Float64Array + bits) y
 * stateHash en el punto y tras la cola (TAIL = 156 pasos, R12). Con resim: en cuanto se cierra el peloteo (el partido en vivo está en la
 * pausa del punto), se copia la foto a la partida de repetición R (con R.replay = true) y se resimula con las entradas grabadas:
 * el hash del punto, el de la cola y la firma completa tienen que ser los del vivo, desde el saque y desde la última foto clave. El
 * partido entero tiene que acabar igual con y sin resimulaciones intercaladas. Además, una vez por caso: la copia no comparte ningún
 * objeto con el origen (salvo las constantes DIFF/TIMING y opts), conserva R.replay/R.stats, iguala el JSON del estado y deja
 * rng.get() igual; y g.rng.get/set no cambian la secuencia. SIMTEST_ONLY=replay: solo esta sección. */
function replaySection() {
  const t0 = Date.now(), f0 = failures;
  console.log('\n== [repetición] resim idéntica y sin interferencia ==');
  const TAIL = 156, KF_EVERY = 360, CAP = 2400 * 4, GAME_S = +(process.env.SIMTEST_RP_SECS || 180);
  const rpMul = s => () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  function rpBot(seed) { // = tools/fingerprint6.js (bot de solo entrada)
    const r = rpMul(seed * 7919 + 13); let serveWait = -1, jumpCd = 0;
    return function (g) {
      const p = g.ctrl, b = g.ball, inp = { move: [0, 0], hit: false, jump: false, jset: false, switchPlayer: false };
      if (g.mode === 'serve') {
        if (g.server !== p || g.serving !== 0) return inp;
        if (serveWait < 0) serveWait = 40 + Math.floor(r() * 200);
        if (--serveWait === 0) { if (r() < 0.4) inp.jump = true; else inp.hit = true; }
        if (g.serveState === 'toss' && b.z > 2.3 && b.vz < 0 && r() < 0.25) inp.hit = true;
        inp.move = [0, r() < 0.5 ? 0 : (r() - 0.5)]; return inp;
      }
      serveWait = -1; if (g.mode !== 'rally') return inp;
      const pr = g.pr1, dx = pr.x - p.x, dy = pr.y - p.y, d = Math.hypot(dx, dy), mine = S.side(0) * pr.x > 0;
      if (mine && d > 0.25) inp.move = [dx / d * Math.min(1, d), dy / d * Math.min(1, d)];
      else if (!mine) { const hx = S.side(0) * 5 - p.x, hy = -p.y * 0.5, hd = Math.hypot(hx, hy); if (hd > 0.5) inp.move = [hx / hd * 0.7, hy / hd * 0.7]; }
      if (r() < 0.15) inp.move = [inp.move[0] + (r() - 0.5) * 0.8, inp.move[1] + (r() - 0.5) * 0.8];
      const bd = Math.hypot(b.x - p.x, b.y - p.y);
      if (bd < 1.6 && b.z < 3.2 && r() < 0.35) inp.hit = true;
      if (--jumpCd <= 0 && Math.abs(p.x) < 2.5 && bd < 2.5 && b.z > 2.3 && r() < 0.2) { inp.jump = true; jumpCd = 60; }
      if (p.z > 0.6 && bd < 2 && r() < 0.05) inp.jump = true;
      if (p.z > 0.6 && bd < 2 && r() < 0.04) inp.jset = true;
      if (r() < 0.004) inp.switchPlayer = true;
      return inp;
    };
  }
  const sig = g => { const o = [g.time, g.score.join('-'), g.sets.join('-'), g.setNo, g.mode, g.ball.x, g.ball.y, g.ball.z, g.ball.vx, g.ball.vy, g.ball.vz, g.rng.get(), g.touches, g.lastKind, g.ctrl && g.ctrl.id];
    for (const p of g.players) o.push(p.id, p.x, p.y, p.z, p.vx, p.vy, p.anim, p.lastAction); return JSON.stringify(o); };
  const SKIP = { rng: 1, events: 1, stats: 1, replay: 1, opts: 1 };
  const stateJSON = g => JSON.stringify(g, function (k, v) { return this === g && SKIP[k] ? undefined : v; });
  const CONST = new Set(); for (const k in S.DIFF) if (S.DIFF[k] && typeof S.DIFF[k] === 'object') CONST.add(S.DIFF[k]); for (const k in S.TIMING) if (S.TIMING[k] && typeof S.TIMING[k] === 'object') CONST.add(S.TIMING[k]);
  function reach(g, set) { (function w(v, top) { if (v === null || typeof v !== 'object' || set.has(v) || CONST.has(v)) return; set.add(v); for (const k in v) { if (top && (k === 'opts' || k === 'events')) continue; w(v[k], false); } })(g, true); return set; }
  // auditoría de la copia (una vez por caso, desde una foto clave de mitad de peloteo): sin objetos compartidos, mismo estado,
  // R.replay/R.stats intactos y toda referencia a jugador dentro de R
  function audit(R, src, live, tag) {
    const bad = [];
    const a = reach(src, new Set()); reach(live, a);
    const shared = [...reach(R, new Set())].filter(o => a.has(o)).length;
    if (shared) bad.push(shared + ' objetos compartidos con el origen');
    if (stateJSON(R) !== stateJSON(src)) bad.push('el estado copiado no es igual (JSON)');
    if (R.rng.get() !== src.rng.get() || R.rng === src.rng) bad.push('rng');
    if (R.replay !== true) bad.push('R.replay perdido');
    if (R.stats !== null) bad.push('R.stats sobrescrito');
    if (R.events.length) bad.push('R.events sin vaciar');
    const own = new Set(R.players); if (R.roster) for (const L of R.roster) for (const p of L) own.add(p); if (R.libero) for (const p of R.libero) own.add(p);
    if (R.roster) for (const p of R.players) if (!R.roster[p.team].includes(p)) bad.push('jugador ' + p.id + ' fuera de R.roster');
    for (const [k, v] of [['ctrl', R.ctrl], ['ctrlBase', R.ctrlBase], ['server', R.server], ['lastPlayer', R.lastPlayer], ['atkSet', R.atkSet], ['ritual.player', R.ritual.player], ['jobs0', R.jobs[0]], ['jobs1', R.jobs[1]], ['jobMem0', R.jobMem[0]], ['jobMem1', R.jobMem[1]]])
      if (v && !own.has(v)) bad.push('R.' + k + ' no es un jugador de R');
    if (bad.length) fail('[repetición] copyGame ' + tag + ': ' + bad.join('; '));
    return !bad.length;
  }
  function run(seed, withReplay, opts, tag) {
    const o = Object.assign({ demo: false, seed, stats: true, difficulty: 'normal', ctrl: seed % 2 ? 'one' : 'both', present: true }, opts || {});
    const g = S.createGame(o), so = Object.assign({}, o, { stats: false });
    const kfT = S.createGame(so), kfM = S.createGame(so), R = S.createGame(so); R.replay = true;
    const bot = rpBot(seed), evs = [], evR = [], inR = { move: [0, 0], hit: false, jump: false, jset: false, switchPlayer: false };
    const mv = new Float64Array(CAP * 2), fl = new Uint8Array(CAP);
    const res = { rallies: 0, ok: 0, bad: 0, okMid: 0, badMid: 0, cut: 0, steps: 0, ns: 0, copies: 0, copyNs: 0, mids: 0, audits: 0, subs: 0 };
    let rec = false, n = 0, nMid = -1, pointAt = -1, endAt = -1, hashPt = 0, lastSub = 0;
    const copy = (d, s) => { const t = process.hrtime.bigint(); S.copyGame(d, s); res.copyNs += Number(process.hrtime.bigint() - t); res.copies++; };
    function resim(from, k0, hashEnd, sigEnd) { // R ← foto; pasos k0..endAt-1 con las entradas grabadas
      copy(R, from); let okPt = true;
      if (from === kfM && res.mids++ % 3 === 0) { audit(R, from, g, tag); res.audits++; }   // (1 de cada 3 fotos clave: también tras los cambios)
      const t = process.hrtime.bigint();
      for (let k = k0; k < endAt; k++) {
        inR.move[0] = mv[2 * k]; inR.move[1] = mv[2 * k + 1]; const f = fl[k];
        inR.hit = !!(f & 1); inR.jump = !!(f & 2); inR.jset = !!(f & 4); inR.switchPlayer = !!(f & 8);
        S.step(R, DT, inR); evR.length = 0; S.drainEvents(R, evR);
        if (k + 1 === pointAt && S.stateHash(R) !== hashPt) okPt = false;
      }
      res.ns += Number(process.hrtime.bigint() - t); res.steps += endAt - k0;
      return okPt && S.stateHash(R) === hashEnd && sig(R) === sigEnd;
    }
    for (let i = 0; i < Math.round(GAME_S / DT) && !g.finished; i++) {
      // banquillo (carrera-pista): un cambio pedido por el humano en la pausa de un punto cada ~40 s (fuera del tramo grabado: requestSub
      // escribe g.subQ fuera de Sim.step y se aplica en el siguiente balón muerto, así que la foto del saque ya lo lleva)
      if (o.bench && !rec && g.mode === 'point' && i - lastSub > 4800) { lastSub = i; done: for (const q of g.rot[0]) for (const b of S.benchOf(g, 0)) if (S.requestSub(g, 0, q, b) === '') break done; }
      const x = bot(g);
      if (rec) { if (n >= CAP) { rec = false; res.cut++; } else { mv[2 * n] = x.move[0]; mv[2 * n + 1] = x.move[1]; fl[n] = (x.hit ? 1 : 0) | (x.jump ? 2 : 0) | (x.jset ? 4 : 0) | (x.switchPlayer ? 8 : 0); } }
      S.step(g, DT, x);
      evs.length = 0; S.drainEvents(g, evs);
      if (rec) {
        n++;
        if (pointAt < 0 && n % KF_EVERY === 0) { copy(kfM, g); nMid = n; }
        if (endAt >= 0 && n === endAt) {
          rec = false; const hEnd = S.stateHash(g), sEnd = sig(g);
          if (withReplay) {
            if (resim(kfT, 0, hEnd, sEnd)) res.ok++; else { res.bad++; if (res.bad < 3) console.log('  DESAJUSTE ' + tag + ' peloteo ' + res.rallies + ' (desde el saque)'); }
            if (nMid > 0) { if (resim(kfM, nMid, hEnd, sEnd)) res.okMid++; else { res.badMid++; if (res.badMid < 3) console.log('  DESAJUSTE ' + tag + ' peloteo ' + res.rallies + ' (desde la foto clave ' + nMid + ')'); } }
          }
        }
      }
      for (const e of evs) {
        if (e.type === 'toss') { if (rec) res.cut++; copy(kfT, g); rec = true; n = 0; nMid = -1; pointAt = -1; endAt = -1; res.rallies++; }
        else if (e.type === 'point' && rec && pointAt < 0) { pointAt = n; endAt = n + TAIL; hashPt = S.stateHash(g); }
      }
    }
    if (g.subs) res.subs = g.subs[0].n + g.subs[1].n;
    res.final = JSON.stringify([g.setScores, g.score, g.sets, g.rng.get(), g.time, g.ball.x, g.finished]);
    return res;
  }
  // g.rng.get/set: misma secuencia que siempre (makeRng sin los métodos) y set() reproduce desde un estado
  { const a = S._makeRng(12345), ref = rpMul(12345); let same = true; for (let i = 0; i < 1000; i++) if (a() !== ref()) same = false;
    const st = a.get(), x1 = [a(), a(), a()]; a.set(st); const x2 = [a(), a(), a()];
    const zs = S._makeRng(0).get();
    if (!same || x1.join() !== x2.join() || zs !== 0x9e3779b9 || st !== st >>> 0) fail('[repetición] g.rng.get/set: misma secuencia ' + same + ', set reproduce ' + (x1.join() === x2.join()) + ', semilla 0 ' + zs);
    else console.log('g.rng.get/set: misma secuencia que mulberry32 (1000 valores), set(get()) reproduce, estado uint32 OK'); }
  const attrsFor = s => { const a = k => ({ jump: 30 + (s * 7 + k * 13) % 60, speed: 30 + (s * 11 + k * 5) % 60, react: 40 + (s + k * 17) % 50, recv: 35 + (s * 3 + k) % 55, dig: 50, set: 25 + (s * 5 + k * 9) % 70, spike: 30 + (s * 13 + k) % 65, ctl: 45, block: 20 + (s + k * 7) % 75, serve: 30 + (s * 17 + k * 3) % 65 }); return [[a(0), a(1)], [a(2), a(3)]]; };
  const BENCH = t => [{ role: 'OH', num: 14 + t, st: { jump: 70, spike: 75 } }, { role: 'MB', st: { block: 80 } }, { role: 'S' }, { role: 'OPP', fat: 20 }, { role: 'L' }];
  const CASES = [];
  for (const seed of [3, 7, 11, 12345]) {
    CASES.push(['pabellón ' + seed, seed, {}], ['playa ' + seed, seed, { venue: 'beach' }], ['maestría ' + seed, seed, { mastery: true }],
      ['atributos+insignias ' + seed, seed, { attrs: attrsFor(seed), badges: [[{ canon: 2, sangrefria: 3 }, { seda: 2, lider: 3 }], [{ muro: 2, rompemanos: 3 }, { red: 1, bombardero: 2 }]] }]);
  }
  for (const seed of [5, 9]) CASES.push(['6v6 ' + seed, seed, { format: '6v6', ctrl: 'one', ctrlRole: 'OH' }]);
  CASES.push(['6v6 banquillo 9', 9, { format: '6v6', ctrl: 'one', ctrlRole: 'S', bench: [BENCH(0), BENCH(1)], coach: [{ iq: 3 }, { iq: 3 }], meSlot: 0 }]);
  const tot = { rallies: 0, ok: 0, bad: 0, okMid: 0, badMid: 0, steps: 0, ns: 0, copies: 0, copyNs: 0 }, rows = [];
  let same = 0;
  for (const [tag, seed, o] of CASES) {
    const a = run(seed, true, o, tag), b = run(seed, false, o, tag), eq = a.final === b.final;
    if (eq) same++; else fail('[repetición] ' + tag + ': el partido cambia con resimulaciones intercaladas\n   con ' + a.final + '\n   sin ' + b.final);
    if (a.bad || a.badMid) fail('[repetición] ' + tag + ': ' + a.bad + ' + ' + a.badMid + ' resimulaciones desincronizadas');
    if (!a.ok) fail('[repetición] ' + tag + ': ningún peloteo resimulado');
    for (const k in tot) tot[k] += a[k];
    rows.push(tag + ': ' + a.ok + '/' + (a.ok + a.bad) + ' desde el saque, ' + a.okMid + '/' + (a.okMid + a.badMid) + ' desde foto clave, igual con/sin ' + eq +
      ', ' + (a.ns / Math.max(1, a.steps) / 1000).toFixed(1) + ' µs/paso, copia ' + (a.copyNs / Math.max(1, a.copies) / 1000).toFixed(0) + ' µs, ' + a.audits + ' auditorías de la copia' + (o.bench ? ', cambios ' + a.subs : ''));
    if (!a.audits) fail('[repetición] ' + tag + ': copia sin auditar');
  }
  console.log('  ' + rows.join('\n  '));
  const nAll = tot.ok + tot.bad + tot.okMid + tot.badMid;
  console.log('[repetición] resim idéntica: ' + (nAll ? (100 * (tot.ok + tot.okMid) / nAll).toFixed(1) : '0') + ' % (' + (tot.ok + tot.okMid) + '/' + nAll + ' resims de ' + tot.rallies + ' peloteos), sin interferencia ' + same + '/' + CASES.length +
    ', ' + (tot.ns / Math.max(1, tot.steps) / 1000).toFixed(1) + ' µs/paso (vm), copyGame ' + (tot.copyNs / Math.max(1, tot.copies) / 1000).toFixed(0) + ' µs de media (vm), ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s' + (failures === f0 ? ' OK' : ''));
}

async function main() {
if (ONLY === 'replay') { replaySection(); console.log(failures ? failures + ' FALLOS' : 'TODO OK'); process.exit(failures ? 1 : 0); } // S3-C1: SIMTEST_ONLY=replay
// E1: SIMTEST_ONLY=e1, solo la sección de maestría
if (ONLY === 'gym') { gymSection(); console.log(failures ? failures + ' FALLOS' : 'TODO OK'); process.exit(failures ? 1 : 0); } // E6: SIMTEST_ONLY=gym
if (ONLY === 'juego17') { j17Section(); console.log(failures ? failures + ' FALLOS' : 'TODO OK'); process.exit(failures ? 1 : 0); } // 17-nov: SIMTEST_ONLY=juego17
if (ONLY === 'colocar') { colSection(); console.log(failures ? failures + ' FALLOS' : 'TODO OK'); process.exit(failures ? 1 : 0); } // C2: SIMTEST_ONLY=colocar
if (ONLY === 'e1') { e1Section(); console.log(failures ? failures + ' FALLOS' : 'TODO OK'); process.exit(failures ? 1 : 0); }
// ================= 1) CPU vs CPU =================
if (ONLY !== 'matrix') {
const demo = run('CPU vs CPU (demo del menú, perfil DIFF.demo)', { demo: true }, MIN * 60);
  const { st, ev, med, revoked } = demo;
  if (st.points < MIN * 4.5) fail('muy pocos puntos en demo: ' + st.points);
  if (st.hits.pass < 20 || st.hits.set < 10 || st.hits.spike < 5) fail('faltan pases/colocaciones/remates');
  if (st.blocks < 1) fail('ningún bloqueo en demo');
  if (med < 2.5 || med > 9) fail('mediana de rally fuera de rango: ' + med);
  // un challenge revocado vuelve a pitar el punto (sim endReview → point): ese peloteo da 2 eventos point y cuenta 1 en g.stats
  if (ev.point - revoked !== st.points) fail('eventos point != puntos (' + ev.point + ' eventos, ' + revoked + ' revocados por challenge, ' + st.points + ' puntos)');
  // y las estadísticas del punto anulado se deshacen (motivo, peloteo y cómo): una entrada por punto contado
  { const nWhy = Object.values(st.why).reduce((a, b) => a + b, 0), nHow = Object.values(st.how || {}).reduce((a, b) => a + b, 0);
    if (nWhy !== st.points || st.rallies.length !== st.points || nHow !== st.points) fail('estadísticas del punto contadas dos veces (motivos ' + nWhy + ', peloteos ' + st.rallies.length + ', cómo ' + nHow + ', puntos ' + st.points + ', revocados ' + revoked + ')'); }
  // un partido a 3 sets puede pasar de 120 puntos (~25 min): basta con un partido completo o dos sets cerrados
  if (MIN >= 15 && demo.matches < 1 && demo.setsSeen < 2) fail('ningún partido completo ni dos sets en demo');
  const f = st.won[0] / st.points; if (f < 0.3 || f > 0.7) fail('reparto de puntos desequilibrado en demo ' + f.toFixed(2));
  // remates que acaban en punto (CPU vs CPU): ni todo remate es punto ni la defensa lo saca todo (objetivo ~45-55 %)
  // Banda 0,38-0,65 para una demo de 20 min (~165 remates: ±3,5σ de muestreo alrededor de 0,515). En carreras más
  // cortas el ruido crece como 1/√n: la banda se ensancha en la misma proporción (10 min, ~80 remates: 0,32-0,71).
  // Medido (R6, 105 semillas): 20 min 41-61 %, 10 min 38-65 % con el mismo perfil (σ 3,9 y 5,5 puntos).
  { const sp = st.spikes[0] + st.spikes[1], kr = (st.kills[0] + st.kills[1]) / Math.max(1, sp);
    const kh = 0.135 * Math.max(1, Math.sqrt(165 / Math.max(1, sp))), klo = 0.515 - kh, khi = 0.515 + kh;
    if (sp > 40 && (kr < klo || kr > khi)) fail('remates que son punto fuera de rango: ' + (100 * kr).toFixed(0) + '% (banda ' + (100 * klo).toFixed(0) + '-' + (100 * khi).toFixed(0) + ' % con ' + sp + ' remates)');
    else console.log('remates que son punto (demo): ' + (100 * kr).toFixed(0) + '% de ' + sp); }
  const wf = Object.entries(st.why); const inPts = wf.filter(([k]) => /cae en/.test(k)).reduce((a, [, v]) => a + v, 0);
  // Media medida 0,72 (40 semillas × 20 min, ~115 puntos). El mínimo 0,55 está a ~4σ binomial con 115 puntos;
  // en pruebas cortas se abre con √(115/n) para mantener la misma tasa de falso fallo (p. ej. 10 min ≈ 0,48).
  const ilo = 0.72 - 0.17 * Math.max(1, Math.sqrt(115 / Math.max(1, st.points)));
  if (inPts / st.points < ilo) fail('demasiados puntos por error (no por balón dentro): ' + pct(inPts, st.points) + ' (mínimo ' + (100 * ilo).toFixed(0) + ' % con ' + st.points + ' puntos)');
  // SIM-01/05: cordura del highlight en ESTA demo (no son 20 partidos: la banda calibrada 15-25 % va en «Calibración del
  // highlight», más abajo). Medido (SIM-05, 160 partidos de demo): media 0,337 (σ por partido 0,033), puntos grandes 19,6 %
  // (σ por partido 4,8 puntos, mínimo 5,8 %, máximo 35,3 %). Topes a 4σ de un partido de ~110 puntos, abiertos con √(110/n).
  { const n = Math.max(1, demo.hls.length), k = Math.max(1, Math.sqrt(110 / n)), big = demo.hls.filter(h => h >= VB.HOLD.bigAt).length / n;
    const hlMax = 0.337 + 4 * 0.033 * k, bigMax = 0.196 + 4 * 0.048 * k;
    if (!(demo.hlMean <= hlMax)) fail('highlight medio de la demo ' + demo.hlMean.toFixed(3) + ' > ' + hlMax.toFixed(3) + ' (' + n + ' puntos)');
    // suelo solo con >= 100 puntos (0 grandes en un partido entero sería que la fórmula no puntúa nada)
    else if (!((n < 100 || big > 0.01) && big < bigMax)) fail('puntos grandes (highlight >= ' + VB.HOLD.bigAt + ') en la demo: ' + pct(big * 1000, 1000) + ' (cordura 1-' + (100 * bigMax).toFixed(0) + ' %)');
    else console.log('highlight medio de la demo ' + demo.hlMean.toFixed(3) + ' (tope ' + hlMax.toFixed(3) + ' con ' + n + ' puntos), puntos grandes ' + (100 * big).toFixed(1) + ' % OK'); }
}

// ================= 3) Fuzz: entrada humana aleatoria =================
if (ONLY !== 'matrix') {
  const rng = S._makeRng(SEED ^ 0xabc), held = [0, 0];
  run('Fuzz humano aleatorio', { demo: false }, 8 * 60, (g, i) => {
    if (i % 30 === 0) { const a = rng() * Math.PI * 2, m = rng() < 0.2 ? 0 : rng(); held[0] = Math.cos(a) * m; held[1] = Math.sin(a) * m; }
    return { move: held, hit: rng() < 0.04, jump: rng() < 0.01, switchPlayer: rng() < 0.005 };
  });
  // el mismo fuzz con COLOCAR (jset; aparte para no mover los números del anterior): reglas e invariantes con colocaciones en salto
  { const rj = S._makeRng(SEED ^ 0x5e7), hj = [0, 0];
    run('Fuzz humano aleatorio con COLOCAR', { demo: false }, 4 * 60, (g, i) => {
      if (i % 30 === 0) { const a = rj() * Math.PI * 2, m = rj() < 0.2 ? 0 : rj(); hj[0] = Math.cos(a) * m; hj[1] = Math.sin(a) * m; }
      return { move: hj, hit: rj() < 0.03, jump: rj() < 0.01, jset: rj() < 0.02, switchPlayer: rj() < 0.005 };
    }); }
  // SIM-03: partido humano con g.present (pausas de presentación) jugado por el bot 'bueno' hasta el final
  { const opts = { demo: false, difficulty: 'normal', serveClock: true, seed: SEED + 5, present: true };
    if (!S.createGame(opts).present) fail('createGame({present:true}) no activa g.present');
    const f0 = failures, r = run('Partido humano con g.present (bot bueno vs Normal)', opts, 6 * 60, makeBot(BOTS.bueno, SEED * 3 + 1), true), hs = r.hls;
    if (hs.length < 15) fail('partido con g.present: muy pocos puntos (' + hs.length + ')'); // (6 min: 24-31 puntos según la semilla)
    console.log('\nPartido con g.present (bot bueno vs Normal, 6 min): ' + hs.length + ' puntos, highlight medio ' + r.hlMean.toFixed(3) + ', puntos >= ' + VB.HOLD.bigAt + ': ' +
      hs.filter(h => h >= VB.HOLD.bigAt).length + ' (pausa ' + VB.HOLD.big + ' s)' + (failures > f0 ? '' : ' OK'));
  }
}

// ================= Calibración del highlight y determinismo (SIM-05) =================
if (ONLY !== 'matrix') {
  const jobs = []; for (let k = 0; k < HL_CAL.matches; k++) jobs.push({ kind: 'hl', seed: SEED + 7919 * k, label: 'highlight ' + k });
  const t0 = Date.now(), res = (await runMatrix(jobs)).filter(Boolean);
  for (const r of res) failures += r.failures;
  if (res.length !== HL_CAL.matches) fail('calibración: ' + res.length + ' de ' + HL_CAL.matches + ' partidos');
  else { hlCalibration(res); console.log('  (' + ((Date.now() - t0) / 1000).toFixed(1) + ' s en paralelo)'); }
  // determinismo: el mismo partido repetido aquí (otro hilo, otro contexto) da la MISMA traza: highlight, señal, landSide,
  // pausa, final apretado, defensas, racha y cada bote del ritual; otra semilla da otra traza (la traza no es trivial)
  if (res.length >= 2) {
    const a = runHlMatch({ seed: res[0].seed }), b = runHlMatch({ seed: res[0].seed });
    const hlSeq = r => r.pts.map(p => p[0]).join(',');
    const firstDiff = (x, y) => { let i = 0; while (i < x.length && x[i] === y[i]) i++; return i; };
    if (a.trace !== b.trace || a.trace !== res[0].trace) fail('determinismo: misma semilla ' + res[0].seed + ', trazas distintas (carácter ' + firstDiff(a.trace, a.trace === b.trace ? res[0].trace : b.trace) + ')');
    else if (hlSeq(a) !== hlSeq(res[0])) fail('determinismo: secuencia de highlight distinta con la misma semilla');
    else if (a.trace === res[1].trace) fail('determinismo: dos semillas distintas dan la misma traza (¿traza vacía?)');
    else {
      // partido humano con g.present (la pausa depende del highlight): el bot y la sim repiten la misma secuencia
      const pres = () => { const r = run('determinismo con present', { demo: false, difficulty: 'normal', serveClock: true, seed: SEED + 11, present: true }, 4 * 60, makeBot(BOTS.bueno, SEED * 5 + 2), true);
        return r.hls.join(',') + '#' + r.g.time.toFixed(6); };
      const p1 = pres(), p2 = pres();
      if (p1 !== p2) fail('determinismo: partido con present y la misma semilla da otra secuencia de highlight');
      else console.log('determinismo (misma semilla -> misma traza de ' + a.pts.length + ' puntos y ' + a.dribbles + ' botes en dos hilos; con present ' + p1.split(',').length + ' puntos) OK');
    }
  }
}

  // ================= 2) y 4) Matriz en paralelo =================
  if (BOTMIN > 0) {
    const jobs = [];
    const LV = VB.DIFF_ORDER; // easy, normal, hard, expert
    // las casillas con banda estrecha (MATRIX_STAT.key) juegan el doble de semillas: mismas semillas 0..NSEED-1 que el resto y
    // NSEED..2·NSEED-1 de más (la desviación de su media baja √2 y la banda se estrecha en la misma proporción)
    for (let s = 0; s < 2 * NSEED; s++) {
      const extra = s >= NSEED;
      for (const d of LV) if (!extra || MATRIX_STAT.key.has('auto:' + d)) jobs.push({ kind: 'auto', diff: d, seconds: BOTMIN * 60, label: 'auto ' + d, seed: SEED + 1000 * s });
      for (const bn of Object.keys(BOTS)) for (const d of LV) if (!extra || MATRIX_STAT.key.has(bn + ':' + d))
        jobs.push({ kind: 'bot', bot: bn, diff: d, seconds: BOTMIN * 60, label: `bot ${bn} vs ${d}`, seed: SEED + bn.length * 31 + d.length + 1000 * s });
    }
    if (MFILTER) for (let i = jobs.length - 1; i >= 0; i--) if (!MFILTER.test(jobs[i].label)) jobs.splice(i, 1);
    const t0 = Date.now(), raw = await runMatrix(jobs);
    for (const r of raw) if (r) failures += r.failures;
    // suma las semillas de cada casilla
    const cells = new Map();
    const addObj = (a, b) => { for (const k in b) a[k] = (a[k] || 0) + b[k]; return a; };
    for (const r of raw) {
      if (!r) continue;
      const k = r.kind + ':' + (r.bot || '') + ':' + r.diff, c = cells.get(k);
      if (!c) { cells.set(k, Object.assign({}, r, { hits: Object.assign({}, r.hits), how: Object.assign({}, r.how), hgrades: Object.assign({}, r.hgrades), why: Object.assign({}, r.why), matchWins: r.matchWins.slice(), meds: [r.med], dj: r.dj ? Object.assign({}, r.dj) : r.dj })); continue; }
      c.won0 += r.won0; c.points += r.points; c.blocks += r.blocks; c.dives += r.dives; c.misses += r.misses; c.meds.push(r.med);
      addObj(c.hits, r.hits); addObj(c.how, r.how); addObj(c.hgrades, r.hgrades); addObj(c.why, r.why); if (c.dj && r.dj) addObj(c.dj, r.dj); // (dj: todas las semillas)
      c.matchWins[0] += r.matchWins[0]; c.matchWins[1] += r.matchWins[1];
    }
    const res = [...cells.values()];
    for (const c of res) c.med = c.meds.reduce((a, b) => a + b, 0) / c.meds.length;
    console.log(`\n######## IA compañero (equipo 0) contra cada dificultad  [${NSEED} semillas × ${BOTMIN} min de juego por casilla (${2 * NSEED} en las de banda estrecha), ${((Date.now() - t0) / 1000).toFixed(1)} s en paralelo] ########`);
    const diffShare = {};
    for (const r of res.filter(r => r && r.kind === 'auto')) {
      diffShare[r.diff] = r.won0 / r.points;
      console.log(`  vs ${VB.DIFF[r.diff].name.padEnd(8)} puntos IA-compañero ${pct(r.won0, r.points)} (${r.points} pts)  rally mediana ${r.med.toFixed(2)} s  remates ${r.hits.spike} bloqueos ${r.blocks} planchas ${r.dives}  partidos ${r.matchWins.join('-')}  cómo ${JSON.stringify(r.how)}`);
    }
    if (BOTMIN >= 20 && !MFILTER && !(diffShare.easy > diffShare.normal + 0.04 && diffShare.normal > diffShare.hard + mxGap('auto:normal', 'auto:hard', 0.02) && diffShare.hard > diffShare.expert + mxGap('auto:hard', 'auto:expert', 0.02))) fail('las dificultades no están ordenadas: ' + JSON.stringify(diffShare));
    console.log('\n######## Bots humanos (solo entrada de mando) contra la CPU ########');
    const botRes = {};
    for (const r of res.filter(r => r && r.kind === 'bot')) {
      const p = r.won0 / r.points, hg = r.hgrades, ht = hg.perfect + hg.good + hg.poor;
      botRes[r.bot + ':' + r.diff] = p;
      console.log(`  ${r.bot.padEnd(9)} vs ${VB.DIFF[r.diff].name.padEnd(8)} puntos ${pct(r.won0, r.points).padStart(6)} (${r.points})  P(partido)≈${(matchWinProb(p) * 100).toFixed(0).padStart(3)}%  ` +
        `toques P/B/M ${pct(hg.perfect, ht)}/${pct(hg.good, ht)}/${pct(hg.poor, ht)}  fallos ${r.misses}  rally ${r.med.toFixed(1)} s  ` +
        `partidos ${r.matchWins.join('-')}  ${JSON.stringify(topWhy(r.why))}` +
        (r.dj ? `  red/100 ${(100 * r.dj.net / Math.max(1, r.points)).toFixed(2)}` + (DJBOT_MODE ? `  impulso ${pct(r.dj.mom, r.dj.hs)} de ${r.dj.hs} remates (saltos con dirección ${r.dj.djJ})` : '') : ''));
    }
    if (BOTMIN >= 20 && !MFILTER) { // objetivos de diseño (márgenes amplios: son estimaciones estadísticas)
      // curva de 4 niveles (revisión 2): quien acaba de superar Fácil no pierde casi todos los partidos en Normal
      // banda = objetivo de diseño [a, b] ± MATRIX_STAT.k desviaciones de la media de la muestra (ver MATRIX_STAT)
      const rng2 = (k, a, b, why) => { const s = MATRIX_STAT.k * mxSd(k), lo = a - s, hi = b + s;
        if (!(botRes[k] > lo && botRes[k] < hi)) fail(why + ' (' + k + ' = ' + (botRes[k] || 0).toFixed(3) + ', banda ' + lo.toFixed(3) + '-' + hi.toFixed(3) + ' con ' + mxN(k) + ' semillas × ' + BOTMIN + ' min)'); };
      rng2('novato:easy', 0.45, 0.49, 'novato en su primera sesión vs Fácil: objetivo 45-49 % de puntos (perdona, pero no es automático; gana ~1 de cada 3)');
      rng2('medio:normal', 0.47, 0.53, 'jugador medio vs Normal: objetivo ~50 % de puntos');
      rng2('novato:normal', 0.30, 0.38, 'novato vs Normal: objetivo ~33-37 %');
      if (!(botRes['medio:easy'] > 0.62)) fail('Fácil no perdona a un jugador medio (' + botRes['medio:easy'].toFixed(2) + ')');
      { const g1 = mxGap('medio:normal', 'medio:hard', 0.06), g2 = mxGap('medio:hard', 'medio:expert', 0.06);
        if (!(botRes['medio:hard'] < botRes['medio:normal'] - g1 && botRes['medio:expert'] < botRes['medio:hard'] - g2)) fail('Difícil/Experto no son claramente más difíciles para el jugador medio (Normal ' + botRes['medio:normal'].toFixed(3) + ', Difícil ' + botRes['medio:hard'].toFixed(3) + ', Experto ' + botRes['medio:expert'].toFixed(3) + '; diferencia mínima ' + g1.toFixed(3) + ' / ' + g2.toFixed(3) + ')'); }
      if (!(botRes['bueno:expert'] < 0.5)) fail('Experto no exige a un buen jugador');
      // bot perfecto contra Experto. Hasta 1.14 se exigía > 50 % (ganaba 51,7 %). Con la IA con esfuerzo real de 1.15.0 (la CPU siempre
      // va a por el balón al 100 % de sus stats) saca ~48,6 % (32 semillas): pierde por poco. DECIDIDO (Ferran, 20-nov-2026: «está bien
      // que sea durísimo»): Experto se queda así, sin reequilibrar; esta prueba solo vigila que no se hunda más. Suelo = 0,44 salvo que la
      // media medida menos k·σ quede por debajo (con 8 semillas × 20 min, 0,486 − 3,5 · 0,019 ≈ 0,42; con 4, el suelo bajaría a 0,39).
      // Si algún día se reequilibra Experto, volver a medir MATRIX_STAT.sd['perfecto:expert'] y, si vuelve a ganar, recuperar el > 0,5.
      { const k = 'perfecto:expert', lo = Math.min(0.44, MATRIX_STAT.sd[k][0] - MATRIX_STAT.k * mxSd(k));
        if (!(botRes[k] > lo)) fail('bot perfecto hundido contra Experto (' + botRes[k].toFixed(3) + ' de puntos, suelo ' + lo.toFixed(3) + ' con ' + mxN(k) + ' semillas × ' + BOTMIN + ' min; 1.15.0: ~0,486)'); }
      // y sigue ganando con claridad a Normal y a Fácil (1.15.0, 32 semillas: 78,0 % y 93,3 %)
      if (!(botRes['perfecto:normal'] > 0.65 && botRes['perfecto:easy'] > 0.8)) fail('bot perfecto no gana con claridad a Normal/Fácil (Normal ' + botRes['perfecto:normal'].toFixed(3) + ' > 0,65, Fácil ' + botRes['perfecto:easy'].toFixed(3) + ' > 0,80)');
      if (!(botRes['novato:expert'] < 0.25)) fail('Experto no exige: el novato le gana demasiados puntos');
      for (const d of LV) if (!(botRes['perfecto:' + d] > botRes['bueno:' + d] && botRes['bueno:' + d] > botRes['medio:' + d] && botRes['medio:' + d] > botRes['novato:' + d])) fail('la habilidad no se nota contra ' + d);
      for (const bn of Object.keys(BOTS)) for (let i = 1; i < LV.length; i++) if (!(botRes[bn + ':' + LV[i - 1]] > botRes[bn + ':' + LV[i]] - 0.03)) fail('nivel ' + LV[i] + ' no es más difícil que ' + LV[i - 1] + ' para el bot ' + bn);
    }
  }

// ================= 5) Reglas puntuales =================
function stepUntil(g, type, maxSteps, inputFn) { // avanza hasta ver un evento de ese tipo; devuelve todos los eventos vistos
  const all = []; S.drainEvents(g); // descarta los pendientes
  for (let i = 0; i < (maxSteps || 2000); i++) {
    S.step(g, DT, inputFn ? inputFn(g, i) : null); const evs = S.drainEvents(g); all.push(...evs);
    if (evs.some(e => e.type === type)) return all;
  }
  return all;
}
function rallyAt(g, ball) { g.mode = 'rally'; g.ball.held = null; Object.assign(g.ball, { vx: 0, vy: 0, vz: 0, dip: 0, wobA: 0 }, ball); }
console.log('');
if (ONLY !== 'matrix') {
  // 4 toques
  const g = S.createGame({ demo: false, seed: 1 }), p = g.teams[0][0], q = g.teams[0][1];
  rallyAt(g, { x: 3, y: 0, z: 1.5, vz: -1 }); g.touchTeam = 0; g.touches = 3; g.lastPlayer = q; g.lastKind = 'free';
  S._hit(g, p, null); const pt = S.drainEvents(g).find(e => e.type === 'point');
  if (!pt || pt.reason !== 'four' || pt.team !== 1) fail('4 toques no se sanciona'); else console.log('regla 4 toques OK');
  // dobles
  const g2 = S.createGame({ demo: false, seed: 2 });
  rallyAt(g2, { x: 3, y: 0, z: 1.5, vz: -1 }); g2.touchTeam = 0; g2.touches = 1; g2.lastPlayer = g2.teams[0][0]; g2.lastKind = 'pass';
  S._hit(g2, g2.teams[0][0], null);
  const pt2 = S.drainEvents(g2).find(e => e.type === 'point');
  if (!pt2 || pt2.reason !== 'double') fail('dobles no se sanciona'); else console.log('regla dobles OK');
  if (S.canReach(g2, g2.teams[0][0])) fail('canReach permite dobles');
  // tras bloqueo, el mismo bloqueador puede volver a tocar y el equipo tiene 3 toques
  const gb = S.createGame({ demo: false, seed: 21 }), blk = gb.teams[0][0];
  rallyAt(gb, { x: 0.3, y: blk.y = 0, z: 2.9, vx: 6, vz: -1 }); blk.x = 0.5; blk.z = 0.8; blk.vz = 0.2;
  gb.touchTeam = 1; gb.touches = 3; gb.lastTeam = 1; gb.lastKind = 'spike'; gb.lastPlayer = gb.teams[1][0];
  let got = null;
  for (let k = 0; k < 200 && !got; k++) { gb.blockCD = 0; gb.rng = (() => { let s = 0; return () => (s++ % 2 ? 0.99 : 0.01); })(); gb.ball.x = 0.3; gb.ball.y = 0; gb.ball.z = 2.9; gb.ball.vx = 6; gb.ball.vz = -1; gb.mode = 'rally'; gb.lastTeam = 1; gb.lastKind = 'spike'; S.step(gb, DT, null); got = S.drainEvents(gb).find(e => e.type === 'block'); }
  if (!got) fail('no se produce el bloqueo de prueba');
  else if (gb.touches !== 0 || gb.lastPlayer !== null) fail('el bloqueo cuenta como toque'); else console.log('bloqueo no cuenta como toque OK (' + got.result + ')');
  // set a 25, diferencia de 2, tie-break a 15, punto de set
  const g3 = S.createGame({ demo: false, seed: 3 });
  g3.score = [24, 23]; rallyAt(g3, { x: -5, y: 0, z: 0.3, vz: -3 }); g3.lastTeam = 1;
  const e3 = stepUntil(g3, 'point');
  if (!e3.find(e => e.type === 'set' && e.team === 0) || g3.sets[0] !== 1) fail('set a 25 no se cierra'); else console.log('regla set a 25 OK');
  const g4 = S.createGame({ demo: false, seed: 4 });
  g4.score = [24, 24]; rallyAt(g4, { x: -5, y: 0, z: 0.3, vz: -3 }); g4.lastTeam = 1;
  stepUntil(g4, 'point');
  if (g4.sets[0] !== 0) fail('25-24 no debería cerrar el set (diferencia de 2)'); else console.log('regla diferencia de 2 OK');
  const g5 = S.createGame({ demo: false, seed: 5 });
  g5.setNo = 3; g5.sets = [1, 1]; g5.score = [14, 10]; rallyAt(g5, { x: -5, y: 0, z: 0.3, vz: -3 }); g5.lastTeam = 1;
  const e5 = stepUntil(g5, 'point');
  if (!e5.find(e => e.type === 'match' && e.team === 0) || g5.mode !== 'over') fail('tie-break a 15 no cierra el partido'); else console.log('regla tie-break a 15 OK');
  const g6 = S.createGame({ demo: false, seed: 6 });
  g6.score = [24, 20]; rallyAt(g6, { x: 5, y: 0, z: 0.3, vz: -3 }); g6.lastTeam = 0; g6.serving = 1;
  const e6 = stepUntil(g6, 'serveReady'), sr = e6.find(e => e.type === 'serveReady');
  if (!sr || sr.setPoint !== 0) fail('punto de set no anunciado'); else console.log('punto de set OK');
  // orden de saque: cada vez que un equipo recupera el saque, saca el otro jugador
  {
    const g7 = S.createGame({ demo: true, seed: 77 }), prevServer = [null, null]; let bad = 0, curTeam = -1, curServer = null, curSet = 1, n7 = 0;
    for (let i = 0; i < 120 * 60 * 15; i++) {
      S.step(g7, DT, null);
      for (const e of S.drainEvents(g7)) {
        if (e.type === 'newSet' || e.type === 'newMatch') { prevServer[0] = prevServer[1] = null; curTeam = -1; }
        if (e.type !== 'serveReady') continue;
        n7++;
        if (e.team === curTeam) { if (e.player !== curServer) bad++; }
        else { if (prevServer[e.team] && prevServer[e.team] === e.player) bad++; prevServer[e.team] = e.player; curTeam = e.team; curServer = e.player; }
      }
    }
    if (n7 < 30) fail('pocos saques en la prueba de orden de saque');
    if (bad) fail('orden de saque incorrecto ' + bad); else console.log('orden de saque (alternancia en el equipo) OK');
  }
  // antena / por fuera / por debajo de la red
  const ga = S.createGame({ demo: false, seed: 8 });
  rallyAt(ga, { x: 0.1, y: 4.5, z: 2.8, vx: -3 }); ga.lastTeam = 0; ga.touchTeam = 0; ga.touches = 1;
  let ea = stepUntil(ga, 'point').find(e => e.type === 'point');
  if (!ea || ea.reason !== 'antenna' || ea.team !== 1) fail('balón en la antena no se sanciona'); else console.log('regla antena OK');
  const gf = S.createGame({ demo: false, seed: 9 });
  rallyAt(gf, { x: 0.1, y: 5.3, z: 4, vx: -3 }); gf.lastTeam = 0; gf.touchTeam = 0; gf.touches = 1;
  ea = stepUntil(gf, 'point').find(e => e.type === 'point');
  if (!ea || ea.reason !== 'antenna' || !/fuera/.test(ea.text)) fail('balón por fuera de la antena no se sanciona'); else console.log('regla por fuera de la antena OK');
  const gu = S.createGame({ demo: false, seed: 10 });
  rallyAt(gu, { x: 0.1, y: 0, z: 0.7, vx: -4, vz: 0.5 }); gu.lastTeam = 0; gu.touchTeam = 0; gu.touches = 1;
  ea = stepUntil(gu, 'point').find(e => e.type === 'point');
  if (!ea || ea.reason !== 'under') fail('balón por debajo de la red no se sanciona'); else console.log('regla por debajo de la red OK');
  // toque de red: jugador en el aire que deriva hacia la red con el balón cerca
  const gn = S.createGame({ demo: false, seed: 11 }), pn = gn.teams[0][0];
  rallyAt(gn, { x: 1.5, y: 0, z: 4, vz: 1 }); gn.lastTeam = 1; gn.touchTeam = 1; gn.touches = 1; gn.lastKind = 'pass';
  pn.x = 0.6; pn.y = 0; pn.z = 0; pn.vz = 0; pn.vx = -5.6; pn.vy = 0; gn.ctrl = pn;
  S._jump(gn, pn);
  ea = stepUntil(gn, 'point').find(e => e.type === 'point');
  if (!ea || ea.reason !== 'net' || ea.team !== 1) fail('toque de red no se sanciona'); else console.log('regla toque de red OK');
  // falta de saque: el humano lanza y no golpea
  const gs = S.createGame({ demo: false, seed: 12 });
  let pressed = false;
  ea = stepUntil(gs, 'point', 2000, (g) => { const h = !pressed && g.serveT > 0.5; if (h) pressed = true; return { move: [0, 0], hit: h, jump: false }; }).find(e => e.type === 'point');
  if (!ea || ea.reason !== 'serve' || ea.team !== 1) fail('balón que cae sin golpear en el saque no es falta'); else console.log('falta de saque (no golpea) OK');
  // no se puede sacar antes del silbato
  {
    const gw = S.createGame({ demo: false, seed: 16 }); let early = false, whistleT = -1;
    for (let i = 0; i < 120; i++) { S.step(gw, DT, { move: [0, 0], hit: i === 50, jump: false }); for (const e of S.drainEvents(gw)) { if (e.type === 'toss' && whistleT < 0) early = true; if (e.type === 'whistle') whistleT = e.t; } }
    if (early || gw.serveState !== 'ready' || whistleT < 0) fail('saque antes del silbato'); else console.log('saque solo tras el silbato OK');
  }
  // regla de 8 segundos
  const g8 = S.createGame({ demo: false, seed: 13 });
  const e8 = stepUntil(g8, 'point', 120 * 10).find(e => e.type === 'point');
  const w8 = S.createGame({ demo: false, seed: 13 }).whistleAt;
  if (!e8 || e8.reason !== 'serve' || Math.abs(e8.t - 8 - w8) > 0.05) fail('regla de 8 s no aplicada (t=' + (e8 && e8.t) + ')'); else console.log('regla de 8 segundos OK');
  // en la playa, 5 segundos
  {
    const g5 = S.createGame({ demo: false, seed: 13, venue: 'beach' }), w5 = g5.whistleAt;
    const e5 = stepUntil(g5, 'point', 120 * 10).find(e => e.type === 'point');
    if (!e5 || e5.reason !== 'serve' || e5.text !== 'Falta de saque: 5 segundos' || Math.abs(e5.t - 5 - w5) > 0.05) fail('regla de 5 s de playa no aplicada (t=' + (e5 && e5.t) + ', ' + (e5 && e5.text) + ')'); else console.log('regla de 5 segundos (playa) OK');
  }
  const g8b = S.createGame({ demo: false, seed: 13, serveClock: false });
  if (stepUntil(g8b, 'point', 120 * 10).find(e => e.type === 'point')) fail('serveClock:false no desactiva los 8 s'); else console.log('serveClock:false OK');
  // timing (con armado del brazo C.WINDUP): pulsar WINDUP antes del ideal da 'perfect' (y el contacto se
  // produce en el momento ideal); pulsar en el ideal mismo, 'good'; muy pronto o tarde, 'poor' o fallo
  const WU = C.WINDUP;
  for (const [lead, want] of [[WU, 'perfect'], [WU + 0.03, 'perfect'], [WU - 0.03, 'perfect'], [0.0, 'good'], [0.13, 'good'], [0.30, 'poor|miss'], [-0.08, 'poor']]) {
    const gt = S.createGame({ demo: false, seed: 14 }), ht = gt.teams[0][0];
    rallyAt(gt, { x: 4, y: 0, z: 3, vx: 0, vy: 0, vz: 0 }); gt.lastTeam = 1; gt.touchTeam = 1; gt.touches = 1; gt.lastKind = 'free'; gt.lastTouchT = gt.time;
    ht.x = 4; ht.y = 0; gt.ctrl = ht; gt.teams[0][1].x = 7; let done = false, gr = null, w = {};
    for (let i = 0; i < 400 && !gr; i++) {
      S.hitWindow(gt, ht, w); const h = !done && w.t <= lead; if (h) done = true;
      S.step(gt, DT, { move: [0, 0], hit: h, jump: false }); const evs = S.drainEvents(gt);
      const hv = evs.find(e => e.type === 'hit'); if (hv) gr = hv.grade; if (evs.find(e => e.type === 'miss')) gr = 'miss';
    }
    if (!gr || !new RegExp('^(' + want + ')$').test(gr)) fail(`timing lead ${lead}: esperado ${want}, obtenido ${gr}`);
    else console.log(`timing pulsando ${(lead * 1000).toFixed(0)} ms antes del ideal -> ${gr} OK`);
  }
  // timing: lo aprendible. Pulsar al aparecer "¡Golpea ahora!" / el brillo de GOLPEAR (press en (-0,15, 0,24), ui.js e input.js)
  // + reacción humana (~150-300 ms) no penaliza
  {
    const gradesAt = {};
    for (const delay of [0, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3]) {
      const res = {};
      for (let s = 0; s < 12; s++) {
        const gt = S.createGame({ demo: false, seed: 300 + s }), ht = gt.teams[0][0];
        rallyAt(gt, { x: -1, y: (s % 5 - 2) * 0.4, z: 3.2, vx: 6.5, vz: 2.5 }); gt.touchTeam = 1; gt.lastTeam = 1; gt.touches = 3; gt.lastKind = 'spike'; gt.lastPlayer = gt.teams[1][0]; gt.lastTouchT = gt.time;
        const pr = S.predict(gt, 1, {}); ht.x = pr.x + 0.15; ht.y = pr.y; gt.ctrl = ht; gt.teams[0][1].x = 8; gt.teams[0][1].y = 4; gt.hardIn = false; gt.digOk = true;
        let shown = -1, pressed = false, gr = 'none'; const w = {};
        for (let i = 0; i < 300; i++) {
          S.hitWindow(gt, ht, w);
          if (shown < 0 && w.reach && w.press < 0.24 && w.press > -0.15) shown = gt.time;
          const h = shown >= 0 && !pressed && gt.time - shown >= delay - 1e-9; if (h) pressed = true;
          S.step(gt, DT, { move: [0, 0], hit: h, jump: false }); const evs = S.drainEvents(gt);
          const hv = evs.find(e => e.type === 'hit' && e.human); if (hv) { gr = hv.grade; break; }
          if (evs.find(e => e.type === 'miss')) { gr = 'miss'; break; }
        }
        res[gr] = (res[gr] || 0) + 1;
      }
      gradesAt[delay] = res;
    }
    const ok = (d, k, n) => (gradesAt[d][k] || 0) >= n;
    const okG = (d, n) => (gradesAt[d].perfect || 0) + (gradesAt[d].good || 0) >= n;
    if (!(ok(0.2, 'perfect', 9) && ok(0.25, 'perfect', 9) && okG(0.15, 9) && okG(0.3, 9) && !ok(0, 'perfect', 1)))
      fail('timing tras el aviso no es aprendible: ' + JSON.stringify(gradesAt));
    else console.log('timing tras "¡Golpea ahora!" (0/50/100/150/200 ms):', Object.values(gradesAt).map(r => JSON.stringify(r)).join(' '), 'OK');
  }
  // saque: golpear el lanzamiento de subida (doble pulsación rápida) no vale: no hay contacto hasta que baja
  {
    const gd = S.createGame({ demo: false, seed: 31 }); let tossAt = -1, hitEv = null, missEv = null, pressedAt = -1;
    for (let i = 0; i < 400 && !hitEv && !missEv; i++) {
      const inp = { move: [0, 0], hit: false, jump: false };
      if (gd.serveAuth && gd.serveState === 'ready' && tossAt < 0) inp.hit = true;
      if (tossAt >= 0 && pressedAt < 0 && gd.time - tossAt >= 0.09) { inp.hit = true; pressedAt = gd.time; }
      S.step(gd, DT, inp);
      for (const e of S.drainEvents(gd)) { if (e.type === 'toss') tossAt = e.t; if (e.type === 'hit') hitEv = e; if (e.type === 'miss') missEv = e; }
    }
    if (hitEv && hitEv.z < gd.server.z + 2.2) fail('saque golpeado de subida a ' + hitEv.z.toFixed(2) + ' m');
    else if (hitEv && hitEv.grade !== 'poor') fail('doble pulsación del saque da ' + hitEv.grade);
    else console.log('saque de doble pulsación: ' + (missEv ? 'miss ' + missEv.reason : 'hit ' + hitEv.grade + ' bajando') + ' OK');
  }
  // saque: balón en la mano a la altura del pecho, delante y a la izquierda; sale de ahí al lanzar
  {
    const gh = S.createGame({ demo: false, seed: 32 }), sv = gh.server, b = gh.ball;
    S.step(gh, DT, null);
    const fwd = (sv.x - b.x) * S.side(sv.team), lat = (b.y - sv.y) * -S.side(sv.team);
    if (!(b.z > 1.15 && b.z < 1.4 && fwd > 0.25 && fwd < 0.45 && lat > 0.08)) fail(`balón en la mano mal colocado z=${b.z.toFixed(2)} delante=${fwd.toFixed(2)} izq=${lat.toFixed(2)}`);
    else console.log(`balón del sacador a ${b.z.toFixed(2)} m, ${fwd.toFixed(2)} m delante, ${lat.toFixed(2)} m a la izquierda OK`);
  }
  // llamada de línea (regla FIVB 8.3, Ferran 12-nov-2026): dentro si CUALQUIER parte de la huella del balón (radio C.BR, el balón
  // que se dibuja) toca la línea. Centro fuera del borde exterior de la línea por menos de un radio = dentro; por más = fuera.
  // Pabellón y playa, línea lateral (y) y de fondo (x)
  { const R = C.BR, bad = [];
    if (C.IN_TOL !== C.BR) bad.push('C.IN_TOL ' + C.IN_TOL + ' != C.BR ' + C.BR);
    for (const venue of ['hall', 'beach']) for (const [off, inside] of [[0.02, true], [0.08, true], [R - 0.005, true], [R + 0.005, false], [R + 0.08, false], [-0.05, true]]) {
      for (const axis of ['y', 'x']) {
        const gl = S.createGame({ demo: false, seed: 40, venue }), HL = gl.HL, HW = gl.HW;
        rallyAt(gl, axis === 'y' ? { x: -5, y: -(HW + off), z: 0.6, vz: -3 } : { x: -(HL + off), y: 0, z: 0.6, vz: -3 });
        gl.lastTeam = 0; gl.touchTeam = 0; gl.lastKind = 'spike'; gl.touches = 3; for (const p of gl.players) { p.x = S.side(p.team) * 12; p.y = 5.9; }
        const ld = stepUntil(gl, 'land', 240).find(e => e.type === 'land');
        // (lo cantado, ld.inside, puede llevar error arbitral B1; la verdad, truthIn, y la distancia firmada, no)
        if (!ld || ld.truthIn !== inside || Math.abs(ld.dist - (R - off)) > 0.012 || (S.lineDist(ld.x, ld.y, gl) >= 0) !== inside)
          bad.push(venue + ' ' + axis + ' a ' + off.toFixed(3) + ' m: truthIn=' + (ld && ld.truthIn) + ' dist=' + (ld && ld.dist.toFixed(3)));
      }
    }
    // esquinas: la huella es un DISCO; fuera de la esquina cuenta la distancia a la esquina (no un cuadrado de lado R)
    for (const venue of ['hall', 'beach']) {
      const gl = S.createGame({ demo: false, seed: 41, venue }), HL = gl.HL, HW = gl.HW;
      for (const [o, inside] of [[R / Math.SQRT2 - 0.004, true], [R / Math.SQRT2 + 0.004, false], [R - 0.0001, false], [0.1, true]]) {
        const d = S.lineDist(HL + o, HW + o, gl);
        if ((d >= 0) !== inside || Math.abs(d - (R - o * Math.SQRT2)) > 1e-9) bad.push(venue + ' esquina +' + o.toFixed(4) + ': lineDist=' + d.toFixed(4));
      }
      if (Math.abs(S.lineDist(HL - 0.3, 0.2, gl) - (R + 0.3)) > 1e-9) bad.push(venue + ' dentro: lineDist cambió');
    }
    if (bad.length) fail('llamada de línea (huella entera): ' + bad.join('; '));
    else console.log('llamada de línea: huella entera del balón (radio ' + R + ' m): centro a ' + (R - 0.005).toFixed(3) + ' m fuera = dentro, a ' + (R + 0.005).toFixed(3) + ' = fuera (pabellón y playa), esquinas en disco OK');
  }
  // saque / remate que roza la cinta y cae dentro sin que nadie lo toque: ace / kill (no "falta"); el que va a la red
  // y cae en su propio campo sigue siendo error
  let ncBad = 0;
  for (const [kind, want, bx] of [['serve', 'ace', -3], ['spike', 'kill', -3], ['spike', 'error', 2]]) {
    const gn = S.createGame({ demo: false, seed: 42 });
    rallyAt(gn, { x: bx, y: 0, z: 0.6, vz: -3 });
    gn.lastTeam = 0; gn.touchTeam = 0; gn.lastKind = kind; gn.lastShot = kind === 'serve' ? 'float' : 'power'; gn.touches = kind === 'serve' ? 1 : 3;
    gn.lastPlayer = gn.teams[0][0]; gn.netSince = true; for (const p of gn.players) { p.x = S.side(p.team) * 8.5; p.y = 3; }
    const pt = stepUntil(gn, 'point', 240).find(e => e.type === 'point'), wt = want === 'error' ? 1 : 0;
    if (!pt || pt.team !== wt || pt.how !== want) { ncBad++; fail(`balón que roza la red (${kind}, x=${bx}): esperado ${want} para ${wt}, obtenido ${pt && pt.how} para ${pt && pt.team}`); }
  }
  if (!ncBad) console.log('saque/remate que roza la cinta y cae dentro = ace/kill OK');
  // aimPoint y hit() deciden remate/libre con el mismo criterio (aro = golpe real)
  {
    let bad = 0;
    for (const [pz, bz, bx] of [[0.18, C.NET_H + 0.5, 1.5], [0.6, C.NET_H + 0.05, 1.5], [0.6, C.NET_H + 0.5, 4.0], [0.6, C.NET_H + 0.5, 1.5], [0, 2, 3]]) {
      const ga = S.createGame({ demo: false, seed: 43 }), h = ga.teams[0][0];
      rallyAt(ga, { x: bx, y: 0, z: bz, vz: -0.5 }); ga.touchTeam = 0; ga.touches = 2; ga.lastTeam = 0; ga.lastPlayer = ga.teams[0][1]; ga.lastKind = 'set';
      ga.ctrl = h; h.x = bx + 0.3; h.y = 0; h.z = pz; h.vz = 0;
      const ap = S.aimPoint(ga, {}, null); S._hit(ga, h, null, 0, 'spike');
      const hv = S.drainEvents(ga).find(e => e.type === 'hit');
      if (!ap || !hv || ap.kind !== hv.kind) { bad++; fail(`aimPoint/hit discrepan (p.z=${pz}, b.z=${bz.toFixed(2)}, b.x=${bx}): aro ${ap && ap.kind}, golpe ${hv && hv.kind}`); }
    }
    if (!bad) console.log('aimPoint y hit() coinciden en remate/libre OK');
  }
  // ataque del saque rival por encima de la red en zona de ataque = falta (13.3.4)
  {
    const gx = S.createGame({ demo: false, seed: 41 });
    rallyAt(gx, { x: 0.9, y: 0, z: 3.1, vx: 8, vz: -1 }); gx.lastKind = 'serve'; gx.touchTeam = 1; gx.lastTeam = 1; gx.touches = 3; gx.lastPlayer = gx.teams[1][0];
    const h = gx.teams[0][0]; gx.ctrl = h; h.x = 1.2; h.y = 0; h.z = 0.9; h.vz = 0.5;
    for (const q of gx.players) if (q !== h) { q.x = S.side(q.team) * 8; q.y = 3.5; }
    S._hit(gx, h, null, 0, '', null);
    const e0 = S.drainEvents(gx), pe = e0.find(e => e.type === 'point') || stepUntil(gx, 'point', 240).find(e => e.type === 'point');
    if (e0.some(e => e.type === 'point')) fail('ataque del saque pitado en el contacto, antes de que el balón cruce la red');
    if (!pe || pe.reason !== 'attackServe' || pe.team !== 1) fail('atacar el saque por encima de la red no es falta (al cruzar la red)'); else console.log('regla ataque del saque (pitada al cruzar la red) OK');
  }
  // ... pero una recepción alta en zona de ataque dirigida al PROPIO campo no es ataque (13.3.4: solo si se completa)
  {
    const gx = S.createGame({ demo: false, seed: 5 }), h = gx.teams[0][0];
    rallyAt(gx, { x: 1.6, y: 0, z: 2.75, vx: -0.5, vz: -1 }); gx.lastKind = 'serve'; gx.touchTeam = 1; gx.lastTeam = 1; gx.touches = 0; gx.lastPlayer = gx.teams[1][0];
    gx.ctrl = h; h.x = 1.8; h.y = 0; h.z = 0.5;
    S._hit(gx, h, [1, 0], 0, '', [3, 0]);
    const all = S.drainEvents(gx).concat(stepUntil(gx, 'hit', 400)), pe = all.find(e => e.type === 'point');
    if (pe && pe.reason === 'attackServe') fail('recepción alta hacia el propio campo pitada como ataque del saque');
    else console.log('recepción alta del saque hacia el propio campo: sin falta de ataque OK');
  }
  // balón que da en la red y cae FUERA en el propio campo: "a la red", no "fuera" (nunca cruzó)
  for (const [kind, shot, want] of [['spike', 'power', 'Balón a la red'], ['serve', 'float', 'Saque a la red'], ['set', 'overhead', 'Balón a la red']]) {
    const gn = S.createGame({ demo: false, seed: 7 }); for (const q of gn.players) { q.x = S.side(q.team) * 8.5; q.y = -3.5; }
    rallyAt(gn, { x: 0.6, y: 3.5, z: 2.0, vx: -6, vy: 4 });
    gn.lastTeam = 0; gn.touchTeam = 0; gn.touches = kind === 'serve' ? 0 : kind === 'set' ? 2 : 3; gn.lastKind = kind; gn.lastShot = shot; gn.lastPlayer = gn.teams[0][0];
    const all = stepUntil(gn, 'point', 900), net = all.some(e => e.type === 'net'), ld = all.find(e => e.type === 'land'), pe = all.find(e => e.type === 'point');
    if (!net || !ld || ld.inside || !pe || pe.text !== want || pe.team !== 1) fail(`${kind} a la red que cae fuera en su campo: red=${net} bote=${ld && ld.inside} -> ${pe && pe.reason} "${pe && pe.text}"`);
    // seña (Guidelines 2025, 28.11): saque = FIVB 19 (netBall); remate = «fuera» y señalar al atacante (28.11.4); colocación =
    // «tocado» (28.11.3). Sin cambiar reason ('out'), falta del equipo 0 y el último que tocó como infractor
    else if (pe.signal !== { spike: 'out', serve: 'netBall', set: 'touched' }[kind] || pe.reason !== 'out' || pe.faultTeam !== 0 || pe.faultPlayer !== gn.teams[0][0]) fail(`${kind} a la red: señal ${pe.signal} reason ${pe.reason} faultTeam ${pe.faultTeam} faultPlayer ${pe.faultPlayer && pe.faultPlayer.id}`);
  }
  console.log('balón a la red que cae fuera en el propio campo = "Saque/Balón a la red": saque netBall, remate fuera + atacante, colocación tocado OK');
  // penetración: no se juega un balón que ya está en el campo rival
  {
    const gp = S.createGame({ demo: false, seed: 42 }), pp = gp.teams[0][0];
    rallyAt(gp, { x: -0.3, y: 0, z: 1.8, vx: -1 }); gp.lastKind = 'pass'; gp.touchTeam = 0; gp.touches = 1; gp.lastPlayer = gp.teams[0][1]; gp.lastTeam = 0;
    pp.x = 0.5; pp.y = 0; pp.z = 0;
    if (S.canReach(gp, pp)) fail('se puede jugar el balón en el campo rival'); else console.log('penetración en el espacio contrario OK');
  }
  // bloqueo humano corriendo hacia la red: la deriva no le mete en la red
  {
    let nets = 0;
    for (const jx of [1.4, 1.1, 0.9, 0.7, 0.5]) {
      const gj = S.createGame({ demo: false, seed: 43 });
      rallyAt(gj, { x: -2, y: 0, z: 4, vz: 1 }); gj.touchTeam = 1; gj.lastTeam = 1; gj.touches = 2; gj.lastKind = 'set'; gj.lastPlayer = gj.teams[1][1]; gj.lastTouchT = gj.time;
      const h = gj.ctrl; h.x = 3; h.y = 0; let jumped = false;
      const evs = stepUntil(gj, 'landPlayer', 400, () => { const inp = { move: [-1, 0], hit: false, jump: false }; if (!jumped && h.x <= jx) { inp.jump = true; jumped = true; } return inp; });
      if (evs.find(e => e.type === 'netTouch' && e.player === h)) nets++;
    }
    if (nets) fail('el humano toca la red al saltar a bloquear corriendo (' + nets + '/5)'); else console.log('salto de bloqueo humano sin toque de red OK');
  }
  // bloqueo directo (stuff): cae rápido en el campo del atacante y casi siempre es punto
  {
    let stuffs = 0, pts = 0;
    for (let s = 0; s < 400 && stuffs < 30; s++) {
      const gs2 = S.createGame({ demo: true, seed: 500 + s }), blk = gs2.teams[0][0];
      rallyAt(gs2, { x: -0.5, y: 0, z: 3.0, vx: 9, vz: -1.5 }); gs2.touchTeam = 1; gs2.lastTeam = 1; gs2.touches = 3; gs2.lastKind = 'spike'; gs2.lastPlayer = gs2.teams[1][0];
      blk.x = 0.5; blk.y = 0; blk.z = 0.8; blk.vz = 0.3; gs2.teams[0][1].x = 6; gs2.teams[1][0].x = -1.5; gs2.teams[1][1].x = -5;
      const evs = stepUntil(gs2, 'point', 600), bk = evs.find(e => e.type === 'block');
      if (!bk || bk.result !== 'stuff') continue;
      stuffs++; const pe = evs.find(e => e.type === 'point'); if (pe && pe.team === 0 && pe.how === 'block') pts++;
    }
    if (stuffs < 10 || pts / stuffs < 0.6) fail(`bloqueo directo: ${pts}/${stuffs} puntos`); else console.log(`bloqueo directo: ${pts}/${stuffs} acaban en punto del bloqueo OK`);
  }
  // colocación del remate: al hueco se defiende bastante menos que a las manos del defensor
  {
    const digRate = (tgt) => { let ok = 0; const N = 150;
      for (let s = 0; s < N; s++) {
        const gq = S.createGame({ demo: true, seed: 900 + s }), at = gq.teams[0][0];
        rallyAt(gq, { x: 1.0, y: 0, z: 3.1, vz: -0.5 }); gq.touchTeam = 0; gq.touches = 2; gq.lastTeam = 0; gq.lastKind = 'set'; gq.lastPlayer = gq.teams[0][1];
        at.x = 1.3; at.y = 0; at.z = 0.8; at.vz = 0.5;
        gq.teams[1][0].x = -5.4; gq.teams[1][0].y = 0.4; gq.teams[1][1].x = -0.8; gq.teams[1][1].y = 2.5;
        S._hit(gq, at, null, 0, '', tgt); S.drainEvents(gq);
        const evq = stepUntil(gq, 'point', 400, null), dg = evq.find(e => e.type === 'hit' && e.team === 1);
        if (dg && dg.shot !== 'shank') ok++; // defensa limpia (no desviada)
      } return ok / N; };
    const atDef = digRate([-5.6, 0.4]), gap = digRate([-7.8, -3.7]);
    if (!(gap < atDef * 0.68)) fail(`defensa según colocación: hueco ${gap.toFixed(2)} vs a las manos ${atDef.toFixed(2)}`);
    else console.log(`remate al hueco defendible ${(100 * gap).toFixed(0)}% / a las manos ${(100 * atDef).toFixed(0)}% OK`);
  }
  // cambio automático de jugador: sin idas y vueltas (la cámara no se desliza dos veces seguidas)
  {
    const gz = S.createGame({ demo: false, seed: 61, difficulty: 'normal' }), bz = makeBot(BOTS.novato, 61); let lastSw = null, flips = 0, nsw = 0;
    for (let i = 0; i < 120 * 60 * 8; i++) {
      S.step(gz, DT, bz(gz));
      for (const e of S.drainEvents(gz)) if (e.type === 'switch' && e.auto && !e.reset) {
        nsw++; if (lastSw && e.t - lastSw.t < 0.45 && e.to === lastSw.from && lastSw.tt === gz.lastTouchT) flips++;
        lastSw = e; e.tt = gz.lastTouchT;
      }
      if (gz.finished) break;
    }
    if (flips > 1) fail('el control salta de un jugador a otro y vuelve: ' + flips + ' de ' + nsw); else console.log(`cambios automáticos sin ida y vuelta (${flips}/${nsw}) OK`);
  }
  // bloquear el saque es falta
  const gk = S.createGame({ demo: false, seed: 15 }), bk = gk.teams[0][0];
  rallyAt(gk, { x: -0.3, y: 0, z: 2.8, vx: 8, vz: -0.5 }); gk.lastTeam = 1; gk.touchTeam = 1; gk.touches = 3; gk.lastKind = 'serve';
  bk.x = 0.5; bk.y = 0; bk.z = 0.9; bk.vz = 0.3; gk.blockCD = 0;
  ea = stepUntil(gk, 'point', 200).find(e => e.type === 'point');
  if (!ea || ea.reason !== 'block' || ea.team !== 1) fail('bloquear el saque no es falta'); else console.log('regla bloqueo del saque OK');
  // ---------- revisión 2 ----------
  // saltar cerca de la red con el balón del rival (cualquier toque) no mete al humano en la red
  {
    let nets = 0, n = 0;
    for (const [tt, tch] of [[1, 0], [1, 1], [-1, 0]]) for (const jx of [1.3, 0.9, 0.7, 0.5]) {
      const gj = S.createGame({ demo: false, seed: 44 }); n++;
      rallyAt(gj, { x: -3, y: 0, z: 3, vz: 2 }); gj.touchTeam = tt; gj.lastTeam = tt < 0 ? 1 : tt; gj.touches = tch; gj.lastKind = tch ? 'pass' : 'block'; gj.lastPlayer = tch ? gj.teams[1][0] : null; gj.lastTouchT = gj.time;
      const h = gj.ctrl; h.x = 3; h.y = 0; let jumped = false;
      const evs = stepUntil(gj, 'landPlayer', 400, () => { const inp = { move: [-1, 0], hit: false, jump: false }; if (!jumped && h.x <= jx) { inp.jump = true; jumped = true; } return inp; });
      if (evs.find(e => e.type === 'netTouch' && e.player === h)) nets++;
    }
    if (nets) fail('toque de red al saltar cerca de la red con el balón del rival en su 1er/2º toque (' + nets + '/' + n + ')'); else console.log('salto junto a la red con cualquier toque rival sin toque de red OK');
  }
  // balón que da en el cuerpo de un receptor que no golpea: toque ('body'), no lo atraviesa
  {
    let body = 0, aces = 0;
    for (let s = 0; s < 20; s++) {
      const gb2 = S.createGame({ demo: false, seed: 70 + s }), h = gb2.teams[0][0];
      rallyAt(gb2, { x: 1.5, y: (s % 3 - 1) * 0.08, z: 1.35, vx: 11, vy: 0, vz: 0.6 }); gb2.lastKind = 'serve'; gb2.touchTeam = 1; gb2.lastTeam = 1; gb2.touches = 3; gb2.lastPlayer = gb2.teams[1][0]; gb2.lastTouchT = gb2.time;
      gb2.ctrl = h; h.x = 6; h.y = 0; gb2.teams[0][1].x = 8.5; gb2.teams[0][1].y = 4.2;
      const evs = stepUntil(gb2, 'point', 600, () => ({ move: [0, 0], hit: false, jump: false }));
      if (evs.find(e => e.type === 'hit' && e.player === h && e.shot === 'body')) body++;
      const pe = evs.find(e => e.type === 'point'); if (pe && pe.how === 'ace') aces++;
    }
    if (body < 18 || aces) fail('saque contra el cuerpo del receptor: ' + body + "/20 toques 'body', " + aces + ' aces'); else console.log('balón contra el cuerpo = toque (' + body + "/20 'body', 0 aces) OK");
  }
  // cambio de campo: al acabar un set y a los 8 puntos del set decisivo (una sola vez)
  {
    const gc = S.createGame({ demo: false, seed: 81 }); gc.score = [24, 20]; rallyAt(gc, { x: -5, y: 0, z: 0.3, vz: -3 }); gc.lastTeam = 0;
    const ec = stepUntil(gc, 'point'); const c1 = ec.find(e => e.type === 'courtChange');
    const gd = S.createGame({ demo: false, seed: 82 }); gd.setNo = 3; gd.sets = [1, 1]; gd.score = [5, 7]; rallyAt(gd, { x: 5, y: 0, z: 0.3, vz: -3 }); gd.lastTeam = 1;
    const ed = stepUntil(gd, 'point'); const c2 = ed.find(e => e.type === 'courtChange');
    stepUntil(gd, 'serveReady', 1200); rallyAt(gd, { x: 5, y: 0, z: 0.3, vz: -3 }); gd.lastTeam = 1;
    const ed2 = stepUntil(gd, 'point');
    if (!c1 || c1.why !== 'set' || !c2 || c2.why !== 'eight' || c2.score[1] !== 8 || ed2.find(e => e.type === 'courtChange')) fail('cambio de campo: ' + JSON.stringify([c1 && c1.why, c2 && c2.why, !!ed2.find(e => e.type === 'courtChange')]));
    else console.log('cambio de campo (fin de set y 8 puntos del 3er set) OK');
  }
  // ayuda de timing por nivel: balón alto que cae; pulsar 0,55 s pronto -> en Fácil (gesto más largo) aún hay contacto; en Difícil, no
  {
    const res = {};
    for (const d of ['easy', 'hard']) {
      const gt = S.createGame({ demo: false, seed: 14, difficulty: d }), ht = gt.teams[0][0];
      rallyAt(gt, { x: 4, y: 0, z: 6, vx: 0, vy: 0, vz: 0 }); gt.lastTeam = 1; gt.touchTeam = 1; gt.touches = 1; gt.lastKind = 'free'; gt.lastTouchT = gt.time;
      ht.x = 4; ht.y = 0; gt.ctrl = ht; gt.teams[0][1].x = 7; let done = false, gr = null; const w = {};
      for (let i = 0; i < 400 && !gr; i++) {
        S.hitWindow(gt, ht, w); const h = !done && w.t <= 0.55; if (h) done = true;
        S.step(gt, DT, { move: [0, 0], hit: h, jump: false }); const evs = S.drainEvents(gt);
        const hv = evs.find(e => e.type === 'hit'); if (hv) gr = hv.shot === 'body' ? 'body' : hv.grade; if (evs.find(e => e.type === 'miss')) gr = 'miss';
      }
      res[d] = gr;
    }
    if (!(res.easy === 'poor' || res.easy === 'good') || res.hard !== 'miss') fail('ayuda de timing por nivel: ' + JSON.stringify(res)); else console.log('ayuda de timing por nivel (pulsar 0,55 s pronto: Fácil ' + res.easy + ', Difícil ' + res.hard + ') OK');
  }
  // recepción de la IA: función continua; un flotante perfecto sin apuntar ya puede ser ace (y apuntado, más)
  {
    const aceRate = (diff, aim) => { let n = 0, ace = 0;
      for (let s = 0; s < 150; s++) {
        const g = S.createGame({ seed: 1000 + s, difficulty: diff, serveClock: false }); S.drainEvents(g);
        const h = g.ctrl; let tossed = false, pressed = false, res = null;
        for (let i = 0; i < 120 * 12 && !res; i++) {
          const inp = { move: [0, 0], hit: false, jump: false, switchPlayer: false };
          if (g.mode === 'serve' && g.serveAuth && g.serveState === 'ready' && !tossed) { inp.hit = true; tossed = true; }
          if (aim && g.mode === 'serve' && g.serveState === 'toss') { // saque dirigible: lleva la diana a la esquina de antes (-7,68 ; ±2,38)
            const dx = -7.68 - g.aim3.x, dy = (s % 2 ? 1 : -1) * 2.38 - g.aim3.y, d = Math.hypot(dx, dy), f = d > 1e-6 ? Math.min(1, d / 0.25) / d : 0; inp.move = [dx * f, dy * f]; }
          if (g.mode === 'serve' && g.serveState === 'toss' && !pressed && g.ball.vz < 0) { const w = S.hitWindow(g, h); if (w.t <= C.WINDUP) { inp.hit = true; pressed = true; } }
          S.step(g, DT, inp);
          for (const e of S.drainEvents(g)) { if (e.type === 'hit' && e.kind === 'serve') n++; if (e.type === 'point') { res = e; if (e.team === 0 && e.how === 'ace') ace++; } }
        }
      } return ace / n; };
    const fn = aceRate('normal', false), fa = aceRate('normal', true);
    const msg = 'aces de flotante perfecto en Normal: sin apuntar ' + (100 * fn).toFixed(0) + '%, apuntado ' + (100 * fa).toFixed(0) + '%';
    // (saque dirigible, sprint Carrera: el flotante cae en la diana con un 25 % del baile; antes el apuntado era 7-16 %)
    if (!(fn >= 0.02 && fn <= 0.09 && fa >= 0.09 && fa <= 0.25 && fa > fn + 0.05)) fail(msg + ' (objetivo 2-9 / 9-25)'); else console.log(msg + ' OK');
  }
  // rol defensivo: el control pasa al defensor cuando la CPU COLOCA (no tras el remate) y la cámara tiene tiempo
  {
    const gz = S.createGame({ demo: false, seed: 62, difficulty: 'normal' }), bz = makeBot(BOTS.medio, 62);
    let lead = [], after = 0, spikes = 0, swT = -1;
    for (let i = 0; i < 120 * 60 * 10; i++) {
      S.step(gz, DT, bz(gz));
      for (const e of S.drainEvents(gz)) {
        if (e.type === 'hit' && e.team === 1 && e.kind === 'set') swT = -1;
        if (e.type === 'switch' && e.reason === 'defense') swT = e.t;
        if (e.type === 'hit' && e.team === 1 && e.kind === 'spike') { spikes++; if (swT > 0) lead.push(e.t - swT); swT = 0; }
        if (e.type === 'switch' && e.auto && !e.reset && e.reason !== 'defense' && swT === 0 && gz.touchTeam === 1 && Math.hypot(gz.ball.vx, gz.ball.vy, gz.ball.vz) > 12) after++;
        if ((e.type === 'hit' && e.team === 0) || e.type === 'point' || e.type === 'block') swT = -1;
      }
      if (gz.finished) break;
    }
    lead.sort((a, b) => a - b); const med = lead.length ? lead[lead.length >> 1] : 0;
    const msg = 'rol defensivo: ' + lead.length + ' cambios al colocar la CPU (antelación mediana al remate ' + med.toFixed(2) + ' s), ' + after + ' cambios con balón rápido tras el remate de ' + spikes;
    if (lead.length < 5 || med < 0.6 || after) fail(msg); else console.log(msg + ' OK');
  }
  // ---------- revisión 3 ----------
  // antena tocada SIN cruzar la red: falta del último que tocó (8.4.3)
  {
    const gA = S.createGame({ demo: false, seed: 90 });
    rallyAt(gA, { x: 0.12, y: 4.0, z: 2.9, vy: 3.5, vz: 0.5 }); gA.lastTeam = 0; gA.touchTeam = 0; gA.touches = 2; gA.lastKind = 'set'; gA.lastPlayer = gA.teams[0][1];
    for (const p of gA.players) { p.x = S.side(p.team) * 6; p.y = 0; }
    const eA = stepUntil(gA, 'point', 240).find(e => e.type === 'point');
    // tras un bloqueo: el balón que toca el bloqueo y luego la antena es punto del atacante
    const gB = S.createGame({ demo: false, seed: 91 });
    rallyAt(gB, { x: -0.15, y: 4.05, z: 3.0, vy: 3, vz: 0.3 }); gB.lastTeam = 1; gB.touchTeam = 1; gB.touches = 0; gB.lastKind = 'block'; gB.lastPlayer = null; gB.atkTeam = 0;
    for (const p of gB.players) { p.x = S.side(p.team) * 6; p.y = 0; }
    const eB = stepUntil(gB, 'point', 240).find(e => e.type === 'point');
    // balón que cruza por encima de la antena con parte del balón por fuera del espacio de paso (8.4.4)
    const gC = S.createGame({ demo: false, seed: 92 });
    rallyAt(gC, { x: 0.1, y: 4.4, z: 4.2, vx: -4 }); gC.lastTeam = 0; gC.touchTeam = 0; gC.touches = 1;
    const eC = stepUntil(gC, 'point', 240).find(e => e.type === 'point');
    // y uno que cruza alto pero entero por dentro: sigue en juego
    const gD = S.createGame({ demo: false, seed: 93 });
    rallyAt(gD, { x: 0.1, y: 4.0, z: 4.2, vx: -4 }); gD.lastTeam = 0; gD.touchTeam = 0; gD.touches = 1; gD.lastKind = 'free';
    for (const p of gD.players) { p.x = S.side(p.team) * 8.5; p.y = -3; }
    const eD = stepUntil(gD, 'point', 30).find(e => e.type === 'point');
    if (!eA || eA.reason !== 'antenna' || eA.team !== 1 || !/toca la antena/.test(eA.text) || !eA.antenna) fail('antena tocada sin cruzar: ' + JSON.stringify(eA && [eA.reason, eA.team, eA.text, eA.antenna]));
    else if (!eB || eB.reason !== 'antenna' || eB.team !== 0) fail('bloqueo y antena: ' + JSON.stringify(eB && [eB.reason, eB.team]));
    else if (!eC || eC.reason !== 'antenna' || eC.antenna !== null || !/fuera de la antena/.test(eC.text)) fail('cruce en parte por fuera por encima de la antena: ' + JSON.stringify(eC && [eC.reason, eC.text]));
    else if (eD) fail('balón alto que cruza por dentro sancionado: ' + eD.text);
    else console.log('antena sin cruzar, bloqueo + antena, cruce en parte por fuera sobre la antena OK');
  }
  // texto del árbitro para el balón fuera según el último toque
  {
    const outCase = (kind, shot, prev) => {
      const go = S.createGame({ demo: false, seed: 95 });
      rallyAt(go, { x: -5, y: -(C.HW + 0.5), z: 0.5, vz: -3 }); go.lastTeam = 0; go.touchTeam = 0; go.touches = 2; go.lastKind = kind; go.lastShot = shot; go.prevKind = prev;
      for (const p of go.players) { p.x = S.side(p.team) * 8.5; p.y = 3; }
      const e = stepUntil(go, 'point', 240).find(x => x.type === 'point'); return e ? e.reason + ':' + e.text : 'nada';
    };
    const got = [outCase('serve', 'float', ''), outCase('spike', 'power', 'set'), outCase('free', 'tip', 'set'), outCase('pass', 'forearm', 'serve'), outCase('pass', 'dig', 'spike'), outCase('block', 'tool', 'spike'), outCase('set', 'overhead', 'pass')];
    const want = ['out:Saque fuera', 'out:Remate fuera', 'out:Dejada fuera', 'out:Recepción fuera', 'out:Defensa fuera', 'out:Toca el bloqueo y sale fuera', 'out:Colocación fuera'];
    if (got.join('|') !== want.join('|')) fail('textos de balón fuera: ' + got.join(' | ')); else console.log('textos de balón fuera (' + got.map(x => x.slice(4)).join(', ') + ') OK');
  }
  // Sim.aimPoint: el saque y el remate van a donde dice la retícula (sin el error de ejecución)
  {
    const ga = S.createGame({ demo: false, seed: 96 }); let ok = true, msg = [];
    S.step(ga, DT, null);
    if (S.aimPoint(ga, {}) !== null) { ok = false; msg.push('antes del silbato'); }
    for (let i = 0; i < 120 && !ga.serveAuth; i++) S.step(ga, DT, null);
    // saque dirigible: con el balón en la mano la diana está en el centro del fondo rival y el stick (que mueve al sacador) no la mueve
    const a1 = Object.assign({}, S.aimPoint(ga, {}, [-1, 0]));
    for (let i = 0; i < 30; i++) S.step(ga, DT, { move: [-1, 0.5], hit: false, jump: false });
    const a0 = Object.assign({}, S.aimPoint(ga, {}));
    if (!a1 || a1.mode !== 1 || a1.kind !== 'serve' || !a1.aimed || a1.x !== -7 || a1.y !== 0 || a0.x !== -7 || a0.y !== 0 || !ga.aim3.on || ga.aim3.kind !== 'serve') { ok = false; msg.push('saque ' + JSON.stringify([a1, a0])); }
    // saque real: la diana se lleva con el stick durante el lanzamiento; con timing perfecto el destino del hit es la diana (aimPoint)
    let tossed = false, hitE = null, ap = null, moved = null;
    for (let i = 0; i < 600 && !hitE; i++) {
      const inp = { move: [0, 0], hit: false, jump: false };
      if (ga.serveState === 'ready' && !tossed) { inp.hit = true; tossed = true; }
      else if (ga.serveState === 'toss' && ga.ball.vz > 0) inp.move = [-0.6, 0.8];
      else if (ga.serveState === 'toss' && S.hitWindow(ga, ga.ctrl).t <= C.WINDUP && !ga.swingLive) { inp.hit = true; ap = Object.assign({}, S.aimPoint(ga, {})); moved = [ga.aim3.x, ga.aim3.y]; }
      S.step(ga, DT, inp); hitE = S.drainEvents(ga).find(e => e.type === 'hit');
    }
    if (!hitE || !ap || ap.mode !== 2 || !(moved[0] < -7.5 && moved[1] > 0.5) || Math.hypot(hitE.target[0] - ap.x, hitE.target[1] - ap.y) > 1e-6 || ga.aim3.on) { ok = false; msg.push('saque real ' + JSON.stringify([hitE && hitE.target, ap, moved])); }
    // remate del humano en el aire: hit.target = aimPoint
    for (const mv of [[-0.5, 0.8], [0.9, -0.3], null]) {
      const gr = S.createGame({ demo: false, seed: 97 }), h = gr.teams[0][0];
      rallyAt(gr, { x: 0.9, y: 0.5, z: 3.1, vz: -0.5 }); gr.touchTeam = 0; gr.touches = 2; gr.lastTeam = 0; gr.lastKind = 'set'; gr.lastPlayer = gr.teams[0][1];
      gr.ctrl = h; h.x = 1.2; h.y = 0.5; h.z = 0.8; h.vz = 0.5;
      const r = S.aimPoint(gr, {}, mv || [0, 0]);
      const l = mv ? Math.hypot(mv[0], mv[1]) : 1;
      S._hit(gr, h, mv ? [mv[0] / l, mv[1] / l] : null, 0, '', null);
      const e = S.drainEvents(gr).find(x => x.type === 'hit');
      if (!r || r.kind !== 'spike' || !e || Math.hypot(e.target[0] - r.x, e.target[1] - r.y) > 1e-9) { ok = false; msg.push('remate ' + JSON.stringify([r, e && e.target])); }
    }
    // la CPU sacando: no hay retícula
    const gc2 = S.createGame({ demo: false, seed: 98 }); gc2.serving = 1; S._setupServe(gc2); for (let i = 0; i < 100; i++) S.step(gc2, DT, null);
    if (gc2.mode === 'serve' && S.aimPoint(gc2, {}) !== null) { ok = false; msg.push('saque de la CPU'); }
    if (!ok) fail('Sim.aimPoint: ' + msg.join('; ')); else console.log('Sim.aimPoint (saque: vista previa y real, remate con y sin dirección, CPU sin retícula) OK');
  }
  // ---------- presentación del punto (SIM-01/02/03) ----------
  // señales del árbitro en casos concretos (además del contraste de cada punto en todas las partidas)
  {
    const sigCase = (setup) => {
      const gq = S.createGame({ demo: false, seed: 120 }); for (const q of gq.players) { q.x = S.side(q.team) * 8.5; q.y = 3; }
      const inp = setup(gq) || null; const e = stepUntil(gq, 'point', 1500, inp).find(x => x.type === 'point'); return e || { signal: 'nada' };
    };
    // (own: cae en el campo del equipo 1, el último que toca; si no, en el rival, x > 0)
    const outAt = (kind, shot, touches, own) => (gq) => {
      rallyAt(gq, { x: own === false ? 5 : -5, y: -(C.HW + 0.5), z: 0.5, vz: -3 }); gq.lastTeam = 1; gq.touchTeam = 1; gq.touches = touches;
      gq.lastKind = kind; gq.lastShot = shot; gq.prevKind = kind === 'pass' ? 'spike' : 'pass'; gq.lastPlayer = gq.teams[1][0];
    };
    const cases = {
      'remate fuera': [outAt('spike', 'power', 3, false), 'out'],
      'saque fuera': [(gq) => { outAt('serve', 'float', 3)(gq); gq.lastTeam = 0; gq.touchTeam = 0; gq.lastPlayer = gq.teams[0][0]; }, 'out'],
      'defensa fuera (1.er toque)': [outAt('pass', 'dig', 1), 'touched'],
      'recepción desviada fuera': [outAt('pass', 'shank', 1), 'touched'],
      // Guidelines 2025, 28.11: fuera en su propio campo tras su toque = tocado (28.11.3); el balón que cruza y sale, fuera; el
      // que toca el bloqueo y vuelve fuera al campo del atacante, fuera (28.11.1)
      'colocación fuera en su campo (2.º toque)': [outAt('set', 'overhead', 2), 'touched'],
      'recepción que cruza y sale': [outAt('pass', 'dig', 1, false), 'out'],
      'toca el bloqueo y fuera': [outAt('block', 'tool', 0), 'touched'],
      'el bloqueo la devuelve fuera al atacante': [outAt('block', 'tool', 0, false), 'out'],
      'dentro': [(gq) => { rallyAt(gq, { x: -5, y: 0, z: 0.5, vz: -3 }); gq.lastTeam = 0; gq.touchTeam = 0; gq.touches = 3; gq.lastKind = 'spike'; gq.lastShot = 'power'; gq.lastPlayer = gq.teams[0][0]; }, 'in'],
      '8 segundos': [() => null, 'delay8'],
      'no golpea el lanzamiento': [() => { let pr = false; return (g) => { const h = !pr && g.serveAuth; if (h) pr = true; return { move: [0, 0], hit: h, jump: false }; }; }, 'serveFault'],
      'bloqueo del saque': [(gq) => { const bk = gq.teams[0][0]; rallyAt(gq, { x: -0.3, y: 0, z: 2.8, vx: 8, vz: -0.5 }); gq.lastTeam = 1; gq.touchTeam = 1; gq.touches = 3; gq.lastKind = 'serve'; bk.x = 0.5; bk.y = 0; bk.z = 0.9; bk.vz = 0.3; gq.blockCD = 0; }, 'attackFault'],
      'por debajo de la red': [(gq) => { rallyAt(gq, { x: 0.1, y: 0, z: 0.7, vx: -4, vz: 0.5 }); gq.lastTeam = 0; gq.touchTeam = 0; gq.touches = 1; }, 'under'],
      'antena': [(gq) => { rallyAt(gq, { x: 0.1, y: 4.5, z: 2.8, vx: -3 }); gq.lastTeam = 0; gq.touchTeam = 0; gq.touches = 1; }, 'antenna']
    };
    const got = {}; for (const k in cases) got[k] = sigCase(cases[k][0]);
    const bad = Object.keys(cases).filter(k => got[k].signal !== cases[k][1] || (got[k].touchedOut === true) !== (cases[k][1] === 'touched'));
    const ls = [got['dentro'].landSide, got['remate fuera'].landSide, got['saque fuera'].landSide, got['8 segundos'].landSide], lsBad = ls.join() !== '1,0,1,-1';
    if (bad.length || lsBad) fail('señales del árbitro: ' + bad.map(k => k + ' -> ' + got[k].signal + ' (esperado ' + cases[k][1] + ')').join('; ') + (lsBad ? ' | landSide ' + ls.join() : ''));
    else console.log('señales del árbitro (fuera / tocado / dentro / 8 s / no golpea / ataque / debajo / antena) y landSide OK');
  }
  // highlight: momentos grandes (bloqueo directo y remate perfecto del humano con punto de partido) >= 0,8
  {
    const mpGame = (seed, score, sets, demo) => { const gq = S.createGame({ demo: !!demo, seed }); gq.sets = sets; gq.score = score.slice(); S._setupServe(gq); S.drainEvents(gq); return gq; };
    // remate perfecto del humano (te = 0 -> 'perfect') con punto de partido a favor, que cae dentro
    const gk = mpGame(130, [24, 21], [1, 0]), h = gk.teams[0][0];
    if (gk.matchPoint !== 0) fail('prueba de punto de partido mal montada');
    rallyAt(gk, { x: 0.9, y: 0.5, z: 3.1, vz: -0.5 }); gk.touchTeam = 0; gk.touches = 2; gk.lastTeam = 0; gk.lastKind = 'set'; gk.lastPlayer = gk.teams[0][1];
    gk.ctrl = h; h.x = 1.2; h.y = 0.5; h.z = 0.8; h.vz = 0.5; gk.teams[0][1].x = 6;
    for (const q of gk.teams[1]) { q.x = -8.8; q.y = 4.4; }
    S._hit(gk, h, null, 0, '', [-4.5, -2.5]); gk.digOk = false; // (la defensa IA no la saca: el test mide la nota, no la defensa)
    const ek = S.drainEvents(gk).concat(stepUntil(gk, 'point', 600)), hk = ek.find(e => e.type === 'hit'), pk = ek.find(e => e.type === 'point');
    // bloqueo directo con punto de partido: del que bloquea ([24,22], sets 1-0) y del rival (salvado: [22,24], sets 0-1)
    const stuffAt = (score, sets) => {
      for (let s = 0; s < 400; s++) {
        const gs2 = mpGame(700 + s, score, sets, true), blk = gs2.teams[0][0];
        rallyAt(gs2, { x: -0.5, y: 0, z: 3.0, vx: 9, vz: -1.5 }); gs2.touchTeam = 1; gs2.lastTeam = 1; gs2.touches = 3; gs2.lastKind = 'spike'; gs2.lastPlayer = gs2.teams[1][0];
        blk.x = 0.5; blk.y = 0; blk.z = 0.8; blk.vz = 0.3; gs2.teams[0][1].x = 6; gs2.teams[1][0].x = -1.5; gs2.teams[1][1].x = -5;
        const evs = stepUntil(gs2, 'point', 600), bk = evs.find(e => e.type === 'block'), pe = evs.find(e => e.type === 'point');
        if (bk && bk.result === 'stuff' && pe && pe.how === 'block' && pe.team === 0) return pe;
      }
      return null;
    };
    const sOwn = stuffAt([24, 22], [1, 0]), sSaved = stuffAt([22, 24], [0, 1]);
    // fórmula en sus extremos; errores: tope 0,35 salvo que cierren el set
    const H = S.highlightOf;
    const fx = [
      [H({ how: 'error', rallyHits: 30, digs: 4, setPoint: true, matchPoint: true, saved: true, streak: 5 }), 0.35],
      [H({ how: 'error', rallyHits: 3, digs: 0, setPoint: true, matchPoint: true, setWon: true, matchWon: true, streak: 1 }), 0.75],
      [H({ how: 'kill', rallyHits: 3, digs: 0, streak: 1 }), 0.15],
      [H({ how: 'ace', rallyHits: 0, digs: 0, streak: 3 }), 0.5],
      // jugada épica: peloteo (0,35) + defensas (0,3) con tope conjunto 0,4 -> 0,55 justo (grande por sí sola)
      [H({ how: 'kill', rallyHits: 20, digs: 5, streak: 1 }), 0.55],
      [H({ how: 'kill', rallyHits: 10, digs: 1, streak: 1 }), 0.38],
      [H({ how: 'block', rallyHits: 30, digs: 5, setPoint: true, matchPoint: true, saved: true, streak: 4 }), 1],
      // SIM-05: el punto de bloqueo siempre es grande; final apretado 0,28 y punto de set 0,15 no se suman (el mayor)
      [H({ how: 'block', rallyHits: 2, digs: 0, streak: 1 }), 0.55],
      [H({ how: 'kill', rallyHits: 3, digs: 0, clutch: true, streak: 1 }), 0.43],
      [H({ how: 'kill', rallyHits: 3, digs: 0, clutch: true, setPoint: true, streak: 1 }), 0.43],
      [H({ how: 'kill', rallyHits: 3, digs: 0, setPoint: true, streak: 1 }), 0.3],
      [H({ how: 'kill', rallyHits: 3, digs: 0, perfectKill: true, streak: 1 }), 0.25],
      [H({ how: 'kill', rallyHits: 3, digs: 0, perfectKill: true, setPoint: true, matchPoint: true, streak: 1 }), 0.85],
      [H({ how: 'error', rallyHits: 3, digs: 0, clutch: true, saved: true, streak: 4 }), 0.35]
    ];
    const fBad = fx.map(([a, b], i) => Math.abs(a - b) < 1e-9 ? '' : '#' + i + ' ' + a + ' != ' + b).filter(Boolean);
    const msg = 'highlight: remate perfecto del humano con punto de partido ' + (pk && pk.highlight) + ' (' + (hk && hk.grade) + ', ' + (pk && pk.how) + '), bloqueo directo con punto de partido ' +
      (sOwn && sOwn.highlight) + ' / salvándolo ' + (sSaved && sSaved.highlight);
    if (!hk || hk.grade !== 'perfect' || !hk.human || !pk || pk.how !== 'kill' || !pk.matchWon || !(pk.highlight >= 0.8) || gk.lastPoint.highlight !== pk.highlight) fail(msg + ' [remate]');
    else if (!sOwn || !(sOwn.highlight >= 0.8) || sOwn.savedSetPoint || !sSaved || !(sSaved.highlight >= 0.8) || !sSaved.savedSetPoint) fail(msg + ' [bloqueo]');
    else if (fBad.length) fail('highlightOf fuera de la fórmula: ' + fBad.join(', '));
    else console.log(msg + ', errores <= 0,35 y fórmula OK');
  }
  // defensas de remate (digs) y racha (streak) en un peloteo montado
  {
    const gd = S.createGame({ demo: true, seed: 140 }); gd.score = [3, 5]; gd.streakTeam = 1; gd.streakN = 2; // el equipo 1 lleva 2 seguidos
    const d1 = gd.teams[0][0], d2 = gd.teams[0][1];
    const incoming = (kind, shot, prev, touches) => { rallyAt(gd, { x: 3, y: 0, z: 1.2, vx: 4, vz: -1 }); gd.touchTeam = 1; gd.lastTeam = 1; gd.touches = touches; gd.lastKind = kind; gd.lastShot = shot; gd.prevKind = prev; gd.lastPlayer = kind === 'block' ? null : gd.teams[1][0]; };
    d1.x = 3.4; d1.y = 0; d1.z = 0; d2.x = 3.4; d2.y = 0.3; d2.z = 0;
    incoming('spike', 'power', 'set', 3); S._hit(gd, d1, null, 0.01, '', null); const n1 = gd.rally.digs;   // defensa de remate: cuenta
    incoming('serve', 'float', '', 3); S._hit(gd, d1, null, 0.01, '', null); const n2 = gd.rally.digs;     // recepción del saque: no
    incoming('block', 'touch', 'spike', 0); S._hit(gd, d2, null, 0.01, '', null); const n3 = gd.rally.digs;// tras tocar su bloqueo: cuenta
    incoming('spike', 'power', 'set', 3); S._hit(gd, d1, null, 0.01, 'body', null); const n4 = gd.rally.digs;// rebote en el cuerpo: no
    rallyAt(gd, { x: -5, y: 0, z: 0.4, vz: -3 }); gd.lastTeam = 0; gd.lastKind = 'spike'; gd.touchTeam = 0;
    const pd = stepUntil(gd, 'point', 300).find(e => e.type === 'point');
    S._setupServe(gd); S.drainEvents(gd); rallyAt(gd, { x: -5, y: 0, z: 0.4, vz: -3 }); gd.lastTeam = 0; gd.lastKind = 'spike'; gd.touchTeam = 0;
    const pd2 = stepUntil(gd, 'point', 300).find(e => e.type === 'point');
    if (n1 !== 1 || n2 !== 1 || n3 !== 2 || n4 !== 2 || !pd || pd.digs !== 2 || pd.streak !== 1 || !pd2 || pd2.streak !== 2 || pd2.digs !== 0)
      fail('digs/streak: ' + JSON.stringify([n1, n2, n3, n4, pd && pd.digs, pd && pd.streak, pd2 && pd2.streak, pd2 && pd2.digs]));
    else console.log('defensas de remate (digs ' + pd.digs + ': remate y toque de bloqueo sí; saque y cuerpo no) y racha (corta la del rival: ' + pd.streak + ', luego ' + pd2.streak + ') OK');
  }
  // pausa de presentación y skipHold (SIM-03)
  {
    const finish = (present, score, sets, setNo) => {
      const gq = S.createGame({ demo: false, seed: 150, present }); if (sets) gq.sets = sets; if (setNo) gq.setNo = setNo; gq.score = score.slice(); S._setupServe(gq); S.drainEvents(gq);
      rallyAt(gq, { x: -5, y: 0, z: 0.4, vz: -3 }); gq.lastTeam = 0; gq.lastKind = 'spike'; gq.lastShot = 'power'; gq.touches = 3; gq.touchTeam = 0;
      for (const q of gq.players) { q.x = S.side(q.team) * 8.5; q.y = 3; }
      return gq;
    };
    const pointOf = (gq) => { const all = stepUntil(gq, 'point', 300); return { p: all.find(e => e.type === 'point'), all }; };
    const res = [];
    // set ganado con g.present: pausa VB.HOLD.set (4,0 s); skipHold no a los 0,5 s, sí a los 0,9 s, y sale de 'point' en <= 0,3 s
    const gs = finish(true, [24, 20]), ps = pointOf(gs).p;
    const holdOk = ps && ps.setWon && Math.abs(ps.hold - VB.HOLD.set) < 1e-9 && Math.abs(gs.timer - VB.HOLD.set) < 1e-9;
    let tq = 0; while (tq < 0.5 - 1e-9) { S.step(gs, DT, null); tq += DT; } S.drainEvents(gs);
    const s05 = S.skipHold(gs), t05 = gs.timer;
    while (tq < 0.9 - 1e-9) { S.step(gs, DT, null); tq += DT; } S.drainEvents(gs);
    const s09 = S.skipHold(gs), t09 = gs.timer; let left = -1; const after = [];
    for (let i = 1; i <= 120 * 0.3 + 1; i++) { S.step(gs, DT, null); after.push(...S.drainEvents(gs)); if (gs.mode !== 'point') { left = i * DT; break; } }
    res.push(['set con present', holdOk && !s05 && t05 > 2.8 && s09 && Math.abs(t09 - 0.3) < 1e-9 && left > 0 && left <= 0.3 + 1e-9 && gs.mode === 'serve' &&
      after.some(e => e.type === 'newSet') && after.some(e => e.type === 'serveReady'), { hold: ps && ps.hold, s05, s09, t09, left, mode: gs.mode }]);
    // sin present: la pausa clásica del set (3,6 s)
    const gl = finish(false, [24, 20]), pl = pointOf(gl).p;
    res.push(['set sin present', pl && pl.hold === 3.6 && gl.timer === 3.6, pl && pl.hold]);
    // punto normal con present: 1,9 s
    const gr = finish(true, [10, 12]), pr = pointOf(gr).p;
    res.push(['punto normal con present', pr && pr.highlight < 0.55 && pr.hold === 1.9, pr && [pr.highlight, pr.hold]]);
    // punto grande con present (punto de set salvado con racha de 3): 2,4 s
    const gbg = finish(true, [22, 24]); gbg.streakTeam = 0; gbg.streakN = 2; const pbg = pointOf(gbg).p;
    res.push(['punto grande con present', pbg && pbg.highlight >= 0.55 && pbg.hold === 2.4 && pbg.savedSetPoint, pbg && [pbg.highlight, pbg.hold]]);
    // partido con present: 'over' 4,2 s; skipHold a 1 s -> gameOver a los <= 1,3 s; ya terminado, skipHold = false
    const gm = finish(true, [24, 20], [1, 0]), pm = pointOf(gm).p;
    let skM = null, goT = -1;
    for (let i = 0; i < 120 * 6 && goT < 0; i++) { if (i === 120) skM = S.skipHold(gm); S.step(gm, DT, null); if (S.drainEvents(gm).some(e => e.type === 'gameOver')) goT = (i + 1) * DT; }
    res.push(['partido con present', pm && pm.matchWon && pm.hold === 4.2 && skM === true && goT > 1 && goT <= 1.3 + 1e-9 && gm.mode === 'over' && S.skipHold(gm) === false, pm && [pm.hold, skM, goT]]);
    // sin efecto en 'serve' ni en 'rally'
    const gx = S.createGame({ demo: false, seed: 151, present: true }); gx.hold = 5; const tx0 = gx.timer, sx = S.skipHold(gx);
    rallyAt(gx, { x: 3, y: 0, z: 3 }); const sr2 = S.skipHold(gx);
    res.push(['saque/peloteo', !sx && !sr2 && gx.timer === tx0, [sx, sr2]]);
    // cambio de campo a los 8 del set decisivo con present: pausa del punto + 1,4 s
    const g8p = finish(true, [7, 4], [1, 1], 3), r8 = pointOf(g8p), p8p = r8.p;
    res.push(['8 del 3.er set con present', p8p && r8.all.some(e => e.type === 'courtChange' && e.why === 'eight') && Math.abs(p8p.hold - (p8p.highlight >= 0.55 ? 2.4 : 1.9) - 1.4) < 1e-9, p8p && p8p.hold]);
    const bad = res.filter(r => !r[1]);
    if (bad.length) fail('pausa de presentación / skipHold: ' + bad.map(r => r[0] + ' ' + JSON.stringify(r[2])).join('; '));
    else console.log('pausa de presentación (set ' + VB.HOLD.set + ' s; skipHold no a 0,5 s, sí a 0,9 s -> saque en ' + res[0][2].left.toFixed(3) + ' s; normal 1,9; grande 2,4; partido 4,2; 8 del 3.er set +1,4; sin present 3,6) OK');
  }
  // dificultades: alias en castellano
  if (S.createGame({ difficulty: 'Difícil', seed: 1 }).difficulty !== 'hard' || S.createGame({ difficulty: 'facil', seed: 1 }).difficulty !== 'easy' || S.createGame({ difficulty: 'Experto', seed: 1 }).difficulty !== 'expert') fail('alias de dificultad');
  else console.log('dificultad (alias easy/normal/hard/expert, facil/dificil/experto) OK');
  // la CPU nunca deja caer su propio lanzamiento de saque (el desfase tardío muestreado cabe en la ventana de alcance)
  {
    let tosses = 0, drops = 0; const ev = [];
    for (const diff of VB.DIFF_ORDER) for (const rookie of [true, false]) for (let sd = 1; sd <= 3; sd++) {
      const g = S.createGame({ seed: sd * 7 + 3, difficulty: diff, rookie, present: true });
      for (let i = 0; i < 120 * 150 && g.mode !== 'over'; i++) {
        S.step(g, DT, null); ev.length = 0; S.drainEvents(g, ev);
        for (const e of ev) { if (e.type === 'toss' && e.team === 1) tosses++; if (e.type === 'point' && e.reason === 'serve' && e.team === 0) drops++; }
      }
    }
    if (drops || !tosses) fail('la CPU deja caer su lanzamiento de saque: ' + drops + ' de ' + tosses);
    else console.log('saque de la CPU: 0 lanzamientos caídos en ' + tosses + ' (4 niveles, primer partido sí/no) OK');
  }
  // SIM-04: ritual del sacador CPU (las comprobaciones de cada saque van en ritualChecker, dentro de run())
  {
    const res = [], R = VB.RITUAL, ev = [];
    const untilToss = (g, team) => { for (let i = 0; i < 120 * 60; i++) { S.step(g, DT, null); ev.length = 0; S.drainEvents(g, ev); const t = ev.find(e => e.type === 'toss' && (team == null || e.team === team)); if (t) return t; } return null; };
    // 1) no gasta el azar del partido: con y sin ritual, tras el primer lanzamiento de la CPU el generador está en el mismo punto
    { const a = S.createGame({ seed: 4242, autopilot: true }), b = S.createGame({ seed: 4242, autopilot: true, ritual: false });
      const ta = untilToss(a), tb = untilToss(b);
      res.push(['sin gastar g.rng', ta && tb && ta.jump === tb.jump && a.aiServeTe === b.aiServeTe && a.rng() === b.rng() && b.cpuTossIn === -1 && !b.ritual.on, [ta && ta.t, tb && tb.t]]); }
    // 2) determinista: misma semilla -> mismos rituales; el estilo es del jugador (mismo número de botes base en su mayoría)
    { const seq = sd => { const g = S.createGame({ seed: sd, demo: false, autopilot: true }), out = [], per = {}; for (let i = 0; i < 120 * 600; i++) { S.step(g, DT, null); ev.length = 0; S.drainEvents(g, ev);
          for (const e of ev) if (e.type === 'serveReady') { out.push(e.player.id + ':' + g.ritual.bounces + ':' + g.ritual.dur.toFixed(4)); if (!g.ritual.press) (per[e.player.id] = per[e.player.id] || []).push(g.ritual.bounces); } }
        return { out, per, g }; };
      const s1 = seq(99), s2 = seq(99), s3 = seq(100);
      let styleOk = true, styles = [];
      for (const id in s1.per) { const v = s1.per[id], base = S._ritualStyle(s1.g, s1.g.players[id]).n, k = v.filter(x => x === base).length / v.length; styles.push(id + ':' + base + '(' + (100 * k).toFixed(0) + '%)'); if (v.length >= 8 && k < 0.65) styleOk = false; }
      res.push(['determinista y con estilo propio', s1.out.join() === s2.out.join() && s1.out.join() !== s3.out.join() && styleOk, styles.join(' ')]); }
    // 3) con punto de set la CPU se toma su tiempo (un bote más y pausa más larga, hasta 3 botes y 1,6 s)
    { const g = S.createGame({ seed: 77, autopilot: true }); g.serving = 1; g.score = [20, 24]; S._setupServe(g);
      const r = g.ritual, st = S._ritualStyle(g, g.server);
      res.push(['punto de set: más ritual', r.press && r.bounces >= Math.min(3, st.n) && r.dur <= R.maxDur + 1e-9 && g.cpuTossIn > 0, [r.bounces, st.n, r.dur]]); }
    // 4) el balón es función pura del tiempo del ritual, continuo, y la mano vuelve a por él (bote en el suelo, recogida a la altura de la mano)
    { const g = S.createGame({ seed: 5, autopilot: true }); g.serving = 1; S._setupServe(g);
      const sv = g.server, r = g.ritual, o1 = {}, o2 = {}, h = {};
      let maxStep = 0, prev = null, minZ = 9, handBall = 0, pure = true;
      for (let i = 0; i < 120 * 3 && g.serveState === 'ready'; i++) {
        S.step(g, DT, null); S.drainEvents(g);
        if (!r.on) break;
        S._ritualBall(g, sv, r, o1); S._ritualBall(g, sv, r, o2); if (o1.z !== o2.z || Math.abs(o1.z - g.ball.z) > 1e-9) pure = false;
        if (prev) maxStep = Math.max(maxStep, Math.hypot(g.ball.x - prev[0], g.ball.y - prev[1], g.ball.z - prev[2]));
        prev = [g.ball.x, g.ball.y, g.ball.z]; minZ = Math.min(minZ, g.ball.z);
        S._holdPos(g, sv, h); if (r.phase === 'pre' || r.phase === 'post' || r.phase === 'done') handBall = Math.max(handBall, Math.hypot(h.x - g.ball.x, h.y - g.ball.y, h.z - g.ball.z));
      }
      res.push(['balón puro, continuo y en la mano fuera de los botes', pure && maxStep < 0.08 && Math.abs(minZ - C.BR) < 1e-9 && handBall < 1e-9, [maxStep.toFixed(4), minZ, handBall]]); }
    // 5) el sacador humano no hace ritual y su saque sigue igual (cpuTossIn -1, sin dribble)
    { const g = S.createGame({ seed: 6 }); let dr = 0, okT = true; for (let i = 0; i < 120 * 3; i++) { S.step(g, DT, { move: [0, 0], hit: i === 150, jump: false }); ev.length = 0; S.drainEvents(g, ev); dr += ev.filter(e => e.type === 'dribble').length; if (g.mode === 'serve' && g.cpuTossIn !== -1) okT = false; }
      res.push(['humano sin ritual', dr === 0 && okT && !g.ritual.on, dr]); }
    // 6) la demo del menú: ritual más corto (RITUAL.demoBounces botes como mucho, hoy 1; ~0,8 s)
    { const g = S.createGame({ seed: 8, demo: true }); let mx = 0, mb = 0; for (let i = 0; i < 120 * 300; i++) { S.step(g, DT, null); ev.length = 0; S.drainEvents(g, ev); for (const e of ev) if (e.type === 'serveReady') { mx = Math.max(mx, g.ritual.dur); mb = Math.max(mb, g.ritual.bounces); } }
      res.push(['demo: ritual corto', mb >= 1 && mb <= R.demoBounces && mx <= 1.2, [mb, mx.toFixed(3)]]); }
    const bad = res.filter(r => !r[1]);
    if (bad.length) fail('ritual del sacador CPU: ' + bad.map(r => r[0] + ' ' + JSON.stringify(r[2])).join('; '));
    else console.log('ritual del sacador CPU (sin gastar azar, determinista, estilo por jugador ' + res[1][2] + ', punto de set, balón puro y continuo, humano sin ritual, demo corta) OK');
  }
  // A1/A2: remate apuntado (mira libre g.aim3 en el aire y dispersión según el timing, Sim.spikeSpread)
  {
    const res = [];
    // spikeSpread: monótona decreciente y con los valores del contrato
    { let mono = true, prev = 1e9; for (let q = 0; q <= 1.0001; q += 0.01) { const s = S.spikeSpread(q); if (s > prev + 1e-12) mono = false; prev = s; }
      const v = [0.9, 0.78, 0.5, 0.2].map(q => S.spikeSpread(q));
      res.push(['spikeSpread monótona y calibrada', mono && v[0] <= 0.1 && Math.abs(v[1] - 0.3) < 0.06 && Math.abs(v[2] - 0.75) < 0.08 && Math.abs(v[3] - 1.3) < 0.1, v.map(x => x.toFixed(3))]); }
    // la mira empieza en la diagonal al despegar y la dirección la mueve (~11 m/s) dentro del campo rival
    const setup = (seed, hz) => {
      const g = S.createGame({ demo: false, seed }), h = g.teams[0][0], m = g.teams[0][1];
      rallyAt(g, { x: 1.2, y: 0.5, z: 4.6, vz: 0 }); g.touchTeam = 0; g.touches = 2; g.lastTeam = 0; g.lastPlayer = m; g.lastKind = 'set';
      g.ctrl = h; h.x = 1.5; h.y = 0.5; h.z = hz; h.vz = 2.5; m.x = 6; m.y = -2;
      for (const q of g.teams[1]) { q.x = -8; q.y = q.idx ? 4.5 : -4.5; }
      return g;
    };
    { const g = setup(61, 0.3); S.step(g, DT, { move: [0, 0], hit: false, jump: false });
      const d0 = [g.aim3.x, g.aim3.y], on0 = g.aim3.on;
      for (let i = 0; i < 24; i++) S.step(g, DT, { move: [-1, 0], hit: false, jump: false }); // 0,2 s hacia el fondo
      const dx = g.aim3.x - d0[0];
      for (let i = 0; i < 120; i++) S.step(g, DT, { move: [0, 1], hit: false, jump: false }); // hasta la lateral
      res.push(['mira libre: empieza en la diagonal y se mueve', on0 && Math.abs(d0[0] + 6) < 0.01 && Math.abs(d0[1] + 1.6) < 0.01 && dx < -1.8 && dx > -2.6 &&
        (!g.aim3.on || (g.aim3.y <= 3.9 + 1e-9 && g.aim3.x <= -1.4 && g.aim3.x >= -8.3)), [on0, d0, dx.toFixed(2), g.aim3.y.toFixed(2)]]); }
    { const g = S.createGame({ demo: false, seed: 62 }); S.step(g, DT, null); const g2 = S.createGame({ demo: false, seed: 62 }); g2.serving = 1; S._setupServe(g2); S.step(g2, DT, null);
      res.push(['mira libre apagada fuera del ataque', g.aim3.kind === 'serve' && !g2.aim3.on, [g.aim3.on, g.aim3.kind, g2.aim3.on]]); }
    // el remate cae en la diana: perfecto <= ~0,25 m; tarde 0,12 s claramente más disperso
    const errAt = (te) => {
      const errs = [];
      for (let k = 0; k < 24; k++) {
        const g = setup(100 + k, 0.6); g.ball.z = C.NET_H + 0.6; g.ball.x = 1.4; g.ball.y = 0.5; g.ball.vz = -0.5;
        const h = g.ctrl; h.x = 1.6; h.y = 0.5; h.z = 0.6; h.vz = 0.3;
        g.aim3.on = true; g.aim3.kind = 'spike'; g.aim3.x = -(3 + (k % 5)); g.aim3.y = -3 + (k % 7);
        const tx = g.aim3.x, ty = g.aim3.y;
        S._hit(g, h, null, te, ''); const hv = S.drainEvents(g).find(e => e.type === 'hit');
        if (!hv || hv.kind !== 'spike') { errs.push(99); continue; }
        const ld = S.predictLanding(g, {}); // bote previsto (la defensa de la CPU podría tocarlo antes)
        errs.push(ld ? Math.hypot(ld.x - tx, ld.y - ty) : 99);
      }
      return errs;
    };
    { const ep = errAt(0), el = errAt(0.12), mp = ep.reduce((a, b) => a + b) / ep.length, ml = el.reduce((a, b) => a + b) / el.length;
      res.push(['remate a la diana (perfecto exacto, tarde disperso)', Math.max(...ep) < 0.3 && mp < 0.15 && ml > mp + 0.15, [mp.toFixed(3), Math.max(...ep).toFixed(3), ml.toFixed(3)]]); }
    // aimPoint usa la mira y da spreadNow
    { const g = setup(63, 0.3); S.step(g, DT, null); const ap = S.aimPoint(g, {}, null);
      res.push(['aimPoint con la mira y spreadNow', ap && ap.kind === 'spike' && ap.x === g.aim3.x && ap.y === g.aim3.y && ap.spreadNow >= 0 && ap.spreadNow <= 1.75, ap && [ap.x, ap.y, ap.spreadNow]]); }
    // A3: remate perfecto de la CPU contra el humano -> g.digTight; el humano defiende con te x1,5
    { const g = S.createGame({ demo: false, seed: 64 }), c = g.teams[1][0];
      rallyAt(g, { x: -1.4, y: 0, z: C.NET_H + 0.6, vz: -0.5 }); g.touchTeam = 1; g.touches = 2; g.lastTeam = 1; g.lastPlayer = g.teams[1][1]; g.lastKind = 'set';
      c.x = -1.6; c.y = 0; c.z = 0.6; S._hit(g, c, null, 0, ''); const t1 = g.digTight;
      const g2 = S.createGame({ demo: false, seed: 64 }), c2 = g2.teams[1][0];
      rallyAt(g2, { x: -1.4, y: 0, z: C.NET_H + 0.6, vz: -0.5 }); g2.touchTeam = 1; g2.touches = 2; g2.lastTeam = 1; g2.lastPlayer = g2.teams[1][1]; g2.lastKind = 'set';
      c2.x = -1.6; c2.y = 0; c2.z = 0.6; S._hit(g2, c2, null, 0.2, ''); const t2 = g2.digTight;
      // defensa del humano con desfase 0,04: con digTight la calidad es la de 0,06
      const g3 = S.createGame({ demo: false, seed: 65 }), h = g3.teams[0][0];
      rallyAt(g3, { x: 5, y: 0, z: 0.8, vx: 8, vz: -3 }); g3.touchTeam = 1; g3.touches = 3; g3.lastTeam = 1; g3.lastKind = 'spike'; g3.lastPlayer = g3.teams[1][0];
      g3.ctrl = h; h.x = 5.2; h.y = 0; h.z = 0; g3.digTight = true; S._hit(g3, h, null, 0.04, ''); const hv = S.drainEvents(g3).find(e => e.type === 'hit');
      res.push(['defensa más justa tras remate perfecto', t1 && !t2 && hv && Math.abs(hv.timing - 0.06) < 1e-9 && !g3.digTight, [t1, t2, hv && hv.timing]]); }
    const bad = res.filter(r => !r[1]);
    if (bad.length) fail('remate apuntado: ' + bad.map(r => r[0] + ' ' + JSON.stringify(r[2])).join('; '));
    else console.log('remate apuntado (spikeSpread ' + res[0][2].join('/') + ', mira libre, error perfecto/tarde ' + res[3][2].join('/') + ' m, aimPoint, digTight) OK');
  }
  // B1-B3: error arbitral en botes justos y challenge
  {
    const res = [];
    // bote del remate de team (0: cae en el campo de la CPU; 1: en el del humano) con la huella a dist m de la línea lateral
    const landAt = (seed, dist, team, pre) => {
      const g = S.createGame({ demo: false, seed });
      if (pre) pre(g);
      const sx = team === 0 ? -1 : 1, y = -(C.HW + C.IN_TOL - dist);
      rallyAt(g, { x: sx * 5, y, z: 0.6, vz: -3 });
      g.lastTeam = team; g.touchTeam = team; g.lastKind = 'spike'; g.lastShot = 'power'; g.touches = 3; g.lastPlayer = g.teams[team][0];
      for (const p of g.players) { p.x = S.side(p.team) * 8.5; p.y = 3; }
      const ev = stepUntil(g, 'point', 240);
      return { g, ld: ev.find(e => e.type === 'land'), pt: ev.find(e => e.type === 'point') };
    };
    // tasa de error por banda; nunca con |dist| > 0,10
    { const bands = [[0, 0.02, 0.35, 0.55], [0.02, 0.05, 0.22, 0.38], [0.05, 0.1, 0.09, 0.21], [0.105, 0.3, 0, 0]], rates = [];
      let ok = true, fieldsOk = true;
      for (const [a, bnd, lo, hi] of bands) {
        let n = 0, w = 0;
        for (let k = 0; k < 500; k++) {
          const d = (a + (bnd - a) * ((k * 0.618034) % 1)) * (k % 2 ? 1 : -1);
          const r = landAt(1000 + k, d, k % 4 < 2 ? 0 : 1); const c = r.g.call; n++;
          if (!c || Math.abs(c.dist - d) > 0.03 || c.truthIn !== (c.dist >= 0) || c.calledIn !== r.ld.inside || c.wrong !== (c.calledIn !== c.truthIn) || c.team !== 1 - r.pt.team) fieldsOk = false;
          if (c && c.wrong) w++;
        }
        rates.push((w / n).toFixed(3)); if (w / n < lo || w / n > hi) ok = false;
      }
      res.push(['error arbitral por bandas (0-2, 2-5, 5-10, >10 cm)', ok && fieldsOk, [rates, fieldsOk]]); }
    // sin bote no hay llamada
    { const g = S.createGame({ demo: false, seed: 5 }), p = g.teams[0][0], q = g.teams[0][1];
      rallyAt(g, { x: 3, y: 0, z: 1.5, vz: -1 }); g.touchTeam = 0; g.touches = 3; g.lastPlayer = q; g.lastKind = 'free'; S._hit(g, p, null);
      res.push(['sin bote: g.call null y sin challenge', g.call === null && S.canChallenge(g, 0) === 0, g.call]); }
    // busca un bote mal cantado contra el humano (fuera por 1 cm, cantado dentro)
    const findWrong = (pre, wantWrong, dist) => { for (let s = 1; s < 3000; s++) { const r = landAt(s, dist == null ? -0.01 : dist, 1, pre); if (r.g.call && r.g.call.wrong === wantWrong) return r; } return null; };
    const review = (g, team) => { const ev = []; for (let i = 0; i < 120 * 6; i++) { S.step(g, DT, null); ev.push(...S.drainEvents(g)); if (ev.some(e => e.type === 'challengeResult')) break; } return ev; };
    // acertado: anula el punto y lo conserva
    { const r = findWrong(null, true), g = r.g, s0 = g.score.slice(), w0 = 1 - g.call.team;
      const left = S.canChallenge(g, 0), cpuNo = S.canChallenge(g, 1) === 0, ok = S.challenge(g, 0), rv = g.review && Object.assign({}, g.review);
      const ev = review(g, 0), cr = ev.find(e => e.type === 'challengeResult'), ch = S.drainEvents(g);
      res.push(['challenge acertado anula el punto', left > 6.9 && cpuNo && ok && rv && rv.overturned && rv.dur === 4.5 && cr && cr.overturned && g.review === null &&
        g.score[0] === s0[0] + 1 && g.score[1] === s0[1] - 1 && g.challenges[0] === 2 && cr.left[0] === 2 && w0 === 1 && S.canChallenge(g, 0) === 0 && S.canChallenge(g, 1) === 0 &&
        ev.some(e => e.type === 'point' && e.team === 0), [left, s0, g.score, g.challenges]]); }
    // challenge acertado y g.stats (1.15.1): el punto revocado se deshace ENTERO en las estadísticas internas. Partida con stats, maestría y
    // salto con impulso; el remate de la CPU que se canta dentro mal es un kill con golpe colocado ('roll') e impulso/pipe, así que suma
    // why, how, rallies, kills[1], mastery.cpu.roll[1] y dj.mom/pipe[1]. Tras endReview, g.stats debe ser el de antes del punto MÁS solo
    // el punto que se vuelve a pitar (el del humano: points, won[0], why[su texto], how[su cómo], un peloteo y, si lo fuera, su ace/kill/
    // bloqueo). faults no entra: solo suma con infractor (p), y esos puntos no acaban en bote, así que no tienen challenge
    { let res1 = null;
      for (let s = 1; s < 3000 && !res1; s++) {
        const g = S.createGame({ demo: false, seed: s, stats: true, mastery: true, djump: true });
        rallyAt(g, { x: 5, y: -(C.HW + C.IN_TOL + 0.01), z: 0.6, vz: -3 });
        g.lastTeam = 1; g.touchTeam = 1; g.lastKind = 'spike'; g.lastShot = 'power'; g.touches = 3; g.lastPlayer = g.teams[1][0];
        g.atkTeam = 1; g.atkHow = 'kill'; g.atkMove = 'roll'; g.atkHuman = false; g.atkHits = g.rally.hits;
        Object.assign(g.djLast, { team: 1, mom: 1, pipe: 1 });
        for (const p of g.players) { p.x = S.side(p.team) * 8.5; p.y = 3; }
        const A = JSON.parse(JSON.stringify(g.stats));
        const pe = stepUntil(g, 'point', 240).find(e => e.type === 'point');
        if (!pe || !g.call || !g.call.wrong || g.call.team !== 0 || pe.team !== 1) continue;
        const B = JSON.parse(JSON.stringify(g.stats));
        const ok = S.challenge(g, 0), ev = review(g, 0), cr = ev.find(e => e.type === 'challengeResult'), rp = ev.find(e => e.type === 'point');
        res1 = { s, A, B, C: JSON.parse(JSON.stringify(g.stats)), ok: ok && !!cr && cr.overturned && !!rp && rp.team === 0, pe, rp };
      }
      let good = false, info = 'sin bote mal cantado contra el humano';
      if (res1) {
        const { A, B, C, pe, rp } = res1;
        // el punto revocado sí sumó todo eso (si no, la prueba no probaría nada)
        const added = pe.how === 'kill' && B.kills[1] === A.kills[1] + 1 && B.mastery.cpu.roll[1] === A.mastery.cpu.roll[1] + 1 &&
          B.dj.mom[1] === A.dj.mom[1] + 1 && B.dj.pipe[1] === A.dj.pipe[1] + 1 && B.how.kill === ((A.how || {}).kill || 0) + 1 && B.rallies.length === A.rallies.length + 1;
        const E = JSON.parse(JSON.stringify(A)); E.points++; E.won[0]++; E.why[rp.text] = (E.why[rp.text] || 0) + 1; E.how = E.how || {}; E.how[rp.how] = (E.how[rp.how] || 0) + 1;
        const sk = rp.how === 'ace' ? 'aces' : rp.how === 'kill' ? 'kills' : rp.how === 'block' ? 'stuffPts' : ''; if (sk) E[sk][0]++;
        E.rallies.push(C.rallies[C.rallies.length - 1]); E._undo = C._undo;
        const same = JSON.stringify(E) === JSON.stringify(C);
        good = res1.ok && added && same;
        info = [res1.s, pe.how, rp.how, rp.text, added, same ? 'igual' : { esperado: E, real: C }];
      }
      res.push(['challenge acertado deshace el punto entero en g.stats', good, info]); }
    // huella entera (Ferran, 12-nov-2026): la verdad del challenge = la huella dibujada (radio C.BR) toca la línea. (1) bote en el
    // campo de la CPU con la huella pisando la línea 5 mm (centro a C.BR − 5 mm fuera), cantado fuera: el challenge lo da DENTRO;
    // (2) bote en el campo del humano con 5 mm de hueco (centro a C.BR + 5 mm fuera), cantado dentro: el challenge lo da FUERA.
    // La revisión (g.review.x/y, lo que pinta fx.js placeReview) lleva el centro del bote: |y| − HW − C.BR = −dist
    { const chk = (team, dist, wantIn) => {
        for (let s = 1; s < 4000; s++) {
          const r = landAt(s, dist, team), g = r.g, c = g.call; if (!c || !c.wrong || c.team !== 0) continue;
          const ok = S.challenge(g, 0), rv = g.review && Object.assign({}, g.review), cr = review(g, 0).find(e => e.type === 'challengeResult');
          const geo = rv ? Math.abs(Math.abs(rv.y) - C.HW - C.BR + dist) < 0.012 : false;
          return { ok: ok && !!cr && cr.truthIn === wantIn && cr.overturned && rv.truthIn === wantIn && geo && (S.lineDist(rv.x, rv.y) >= 0) === wantIn,
            info: [s, cr && cr.truthIn, cr && +cr.dist.toFixed(4), rv && +(Math.abs(rv.y) - C.HW).toFixed(4)] };
        }
        return { ok: false, info: 'sin bote mal cantado' };
      };
      const a = chk(0, 0.005, true), b = chk(1, -0.005, false);
      res.push(['challenge con la huella entera: pisa la línea 5 mm = IN; 5 mm de hueco = OUT', a.ok && b.ok, [a.info, b.info]]); }
    // acertado en punto de set, pedido cuando ya ha empezado el set siguiente: el set vuelve atrás
    { const pre = g => { g.score = [23, 24]; g.serving = 1; };
      const r = findWrong(pre, true), g = r.g; const setW = r.pt.setWon;
      for (let i = 0; i < 120 * 4.2 && g.setNo === 1; i++) { S.step(g, DT, null); S.drainEvents(g); } // la pausa del set acaba: nuevo set
      const mid = [g.setNo, g.sets.slice(), g.score.slice(), g.mode], left = S.canChallenge(g, 0), ok = S.challenge(g, 0);
      const ev = review(g, 0), cr = ev.find(e => e.type === 'challengeResult');
      const after = [g.setNo, g.sets.slice(), g.score.slice(), g.setScores.length, g.pendingSet, g.serving];
      for (let i = 0; i < 120 * 4 && g.mode !== 'serve'; i++) { S.step(g, DT, null); S.drainEvents(g); }
      res.push(['challenge acertado en punto de set (el set vuelve atrás)', setW && mid[0] === 2 && left > 0 && ok && cr && cr.overturned &&
        after[0] === 1 && after[1][0] === 0 && after[1][1] === 0 && after[2][0] === 24 && after[2][1] === 24 && after[3] === 0 && !after[4] && after[5] === 0 &&
        g.mode === 'serve' && g.setNo === 1 && g.server.team === 0, [mid, after, g.mode]]); }
    // fallado: se mantiene y gasta uno; con 0 ya no se puede
    { const r1 = findWrong(null, false, 0.01), g = r1.g, s0 = g.score.slice();
      const ok = S.challenge(g, 0), cr = review(g, 0).find(e => e.type === 'challengeResult');
      const keep = g.score[0] === s0[0] && g.score[1] === s0[1] && g.challenges[0] === 1 && cr && !cr.overturned && cr.left[0] === 1;
      g.challenges[0] = 0; const r2 = landAt(77, 0.2, 1, gg => { gg.challenges = [0, 2]; });
      res.push(['challenge fallado gasta uno', ok && keep && S.canChallenge(r2.g, 0) === 0 && !S.challenge(r2.g, 0), [s0, g.score, g.challenges]]); }
    // ventana de 7 s y fin de la ventana al sacar
    { const r = landAt(9, 0.2, 1), g = r.g; S.drainEvents(g);
      for (let i = 0; i < 120; i++) S.step(g, DT, null);
      const l1 = S.canChallenge(g, 0); const t0 = g.time; g.time = r.g.call.t + 7.01; const l2 = S.canChallenge(g, 0); g.time = t0;
      for (let i = 0; i < 120 * 8 && g.mode !== 'rally'; i++) { S.step(g, DT, null); S.drainEvents(g); }
      res.push(['ventana de 7 s (y se cierra al sacar)', Math.abs(l1 - 6) < 0.02 && l2 === 0 && g.mode === 'rally' && S.canChallenge(g, 0) === 0, [l1, l2, g.mode]]); }
    // la CPU pide challenge con criterio (~60 % con |dist| < 5 cm si el árbitro se equivocó, ~7 % si acertó; tras 1,5-3 s)
    { let n = 0, asked = 0, dOk = true, accepted = 0, good = 0;
      for (let s = 1; s <= 300; s++) {
        const r = landAt(5000 + s, (s % 2 ? 1 : -1) * 0.03, 0), g = r.g; if (!g.call || g.call.team !== 1) continue; n++;
        const t0 = g.call.t;
        for (let i = 0; i < 120 * 3.2; i++) { S.step(g, DT, null); const ev = S.drainEvents(g); const ch = ev.find(e => e.type === 'challenge');
          if (ch) { asked++; if (ch.team !== 1) dOk = false; const dt = g.time - t0; if (dt < 1.5 - 1e-6 || dt > 3.01) dOk = false; break; } }
        if (g.review) { if (g.review.overturned) good++; review(g, 1); accepted++; }
      }
      // y rara vez con un bote lejos de la línea (> 10 cm: nunca)
      let far = 0; for (let s = 1; s <= 60; s++) { const r = landAt(7000 + s, 0.4, 0); for (let i = 0; i < 120 * 3.2; i++) { S.step(r.g, DT, null); if (S.drainEvents(r.g).some(e => e.type === 'challenge')) { far++; break; } } }
      res.push(['la CPU pide challenge', n > 100 && asked / n > 0.08 && asked / n < 0.4 && good / asked > 0.5 && dOk && far === 0 && accepted === asked, [n, asked, good, far]]); }
    const bad = res.filter(r => !r[1]), cpuR = res.find(r => r[0] === 'la CPU pide challenge');
    if (bad.length) fail('error arbitral / challenge: ' + bad.map(r => r[0] + ' ' + JSON.stringify(r[2])).join('; '));
    else console.log('error arbitral (tasas ' + res[0][2][0].join('/') + ') y challenge (acertado, g.stats deshecho, punto de set, fallado, ventana 7 s, CPU ' + cpuR[2][1] + '/' + cpuR[2][0] + ', huella entera IN/OUT a ±5 mm) OK');
  }
  // modo «controlar 1 jugador» (createGame({ctrl:'one'})): el humano (bot 'bueno') lleva siempre al mismo jugador y la IA al
  // compañero en todo (toques, saque, bloqueo). g.ctrl no cambia nunca, el compañero toca y saca, pasa/coloca al humano, la IA
  // no comete dobles ni 4 toques y los partidos (a 11) terminan. Por defecto sigue 'both'.
  {
    const f0 = failures, sum = { mate: 0, mateServe: 0, mateSet: 0, human: 0, mateBlock: 0, humanBlock: 0, matches: 0, pts: 0, mate11: 0, mate11Serve: 0, mate11Block: 0 };
    if (S.createGame({ seed: 1 }).ctrlMode !== 'both' || S.createGame({ seed: 1, ctrl: 'x' }).ctrlMode !== 'both') fail('ctrlMode por defecto no es both');
    // ctrlIdx (contrato del sprint): 0 = teams[0][0] (n.º 1, por defecto; el único que usa el juego), 1 = teams[0][1] (n.º 2, solo pruebas); fuera del modo 'one' o con
    // un valor raro, 0. Con el n.º 2 el orden de saque del equipo 0 va en espejo: el jugador del humano saca primero.
    { const gi = (o) => S.createGame(Object.assign({ demo: false, seed: 3 }, o));
      const a = gi({ ctrl: 'one', ctrlIdx: 1 }), b = gi({ ctrl: 'one' }), c = gi({ ctrl: 'both', ctrlIdx: 1 }), d = gi({ ctrl: 'one', ctrlIdx: 7 }), e = gi({ ctrl: 'one', ctrlIdx: '1' });
      if (a.ctrlIdx !== 1 || a.ctrl !== a.teams[0][1] || a.ctrl.num !== 2 || b.ctrl.num !== 1 || a.server !== a.ctrl) fail('ctrlIdx 1: ctrl/saque inicial ' + [a.ctrlIdx, a.ctrl.num, a.server && a.server.num]);
      if (b.ctrlIdx !== 0 || b.ctrl !== b.teams[0][0] || b.server !== b.ctrl) fail('ctrlIdx por defecto no es 0');
      if (c.ctrlIdx !== 0 || c.ctrl !== c.teams[0][0] || d.ctrlIdx !== 0 || e.ctrlIdx !== 1) fail('ctrlIdx fuera de modo uno / valor raro: ' + [c.ctrlIdx, d.ctrlIdx, e.ctrlIdx]); }
    for (let s = 1; s <= 6; s++) {
      const ci = s > 4 ? 1 : 0; // semillas 5-6: el humano lleva al n.º 2
      const g = S.createGame({ demo: false, seed: 9100 + s, difficulty: 'normal', ctrl: 'one', ctrlIdx: ci, points: 11 }), bot = makeBot(BOTS.bueno, s * 7 + 3);
      const me = g.ctrl, mate = S.other(g, me), ev = [];
      let ctrlBad = 0, sw = 0, aiFault = 0, lastT0 = null;
      if (g.ctrlMode !== 'one') fail('ctrl:one no guarda g.ctrlMode');
      if (me !== g.teams[0][ci]) fail('modo uno: ctrlIdx ' + ci + ' no lleva a teams[0][' + ci + ']');
      for (let i = 0; i < 120 * 60 * 30 && !g.finished; i++) {
        S.step(g, DT, bot(g)); ev.length = 0; S.drainEvents(g, ev);
        if (g.ctrl !== me) ctrlBad++;
        for (const e of ev) {
          if (e.type === 'switch') sw++;
          else if (e.type === 'hit' && e.team === 0) {
            if (e.player === mate) { if (e.kind === 'serve') sum.mateServe++; else sum.mate++; if (ci) { if (e.kind === 'serve') sum.mate11Serve++; else sum.mate11++; } }
            else { sum.human++; if (lastT0 && lastT0.player === mate && lastT0.kind !== 'serve' && e.kind !== 'serve') sum.mateSet++; }
            lastT0 = e;
          } else if (e.type === 'hit') lastT0 = null;
          else if (e.type === 'block' && e.team === 0) { if (e.player === mate) { sum.mateBlock++; if (ci) sum.mate11Block++; } else sum.humanBlock++; }
          // (point.player = el que comete la falta: un 4.º toque del humano tras el 3.º del compañero no es falta de la IA)
          else if (e.type === 'point') { sum.pts++; if ((e.reason === 'double' || e.reason === 'four') && e.team === 1 && e.player === mate) aiFault++; lastT0 = null; }
        }
      }
      if (g.finished) sum.matches++;
      if (ctrlBad || sw || aiFault) fail('modo uno (semilla ' + (9100 + s) + '): ctrl cambiado ' + ctrlBad + ' pasos, ' + sw + ' switch, ' + aiFault + ' dobles/4 toques del compañero IA');
    }
    if (sum.matches < 6 || sum.mate < 60 || sum.mateServe < 12 || sum.mateSet < 22 || sum.human < 60 || sum.mateBlock < 3 || sum.mate11 < 15 || sum.mate11Serve < 3 || sum.mate11Block < 1) fail('modo uno: ' + JSON.stringify(sum));
    else if (failures === f0) console.log('modo controlar 1 jugador OK ' + JSON.stringify(sum));
  }
  // modo uno: el HUMANO bloquea (arreglos finales del sprint cartoon). El bot 'bueno' casi nunca sube a la red en modo uno
  // (humanBlock 0 arriba), así que aquí un humano guionizado sube a la red en cada ataque rival (3.er toque de la CPU) y salta
  // cuando el atacante está en el aire: el humano bloquea, el compañero IA no salta a la vez ni bloquea, sin faltas de red.
  {
    const f0 = failures, out = [];
    for (const ci of [0, 1]) {
      const st = { phases: 0, jumps: 0, human: 0, mate: 0, mateJump: 0, net: 0 };
      for (let s = 1; s <= 6; s++) {
        const g = S.createGame({ demo: false, seed: 9100 + s, difficulty: 'normal', ctrl: 'one', ctrlIdx: ci, points: 11 }), bot = makeBot(BOTS.bueno, s * 7 + 3);
        let seen = -1, jumped = -1; const ev = [], mv = [0, 0];
        for (let i = 0; i < 120 * 60 * 30 && !g.finished; i++) {
          let inp = bot(g);
          if (g.mode === 'rally' && g.touchTeam === 1 && g.touches === 2 && g.ball.x < 0) {
            if (seen !== g.lastTouchT) { seen = g.lastTouchT; st.phases++; }
            const p = g.ctrl, dx = 0.6 - p.x, dy = g.pr3.y - p.y, d = Math.hypot(dx, dy);
            mv[0] = d > 0.15 ? dx / d : 0; mv[1] = d > 0.15 ? dy / d : 0;
            inp = { move: mv, hit: false, jump: false, switchPlayer: false };
            const att = g.teams[1].some(q => q.z > 0.35 && q.vz < 1.5 && Math.abs(q.x) < 4);
            if (att && p.z === 0 && Math.abs(p.x) < 1.2 && jumped !== g.lastTouchT) { inp.jump = true; jumped = g.lastTouchT; st.jumps++; }
            const m = S.other(g, p); if (g.defRole === 'block' && m.z > 0.3 && Math.abs(m.x) < 1.2) st.mateJump++;
          }
          S.step(g, DT, inp); ev.length = 0; S.drainEvents(g, ev);
          for (const e of ev) {
            if (e.type === 'block' && e.team === 0) { if (e.player === g.ctrl) st.human++; else st.mate++; }
            if (e.type === 'point' && e.reason === 'net' && e.team === 1) st.net++;
          }
        }
      }
      out.push(st);
      if (st.human < 30 || st.mate > 2 || st.mateJump > 0 || st.net > 2) fail('modo uno, bloqueo del humano (ctrlIdx ' + ci + '): ' + JSON.stringify(st));
    }
    if (failures === f0) console.log('modo uno: bloqueo del humano OK n.º 1 ' + JSON.stringify(out[0]) + ' · n.º 2 ' + JSON.stringify(out[1]));
  }
}


  // ---------- Estadísticas de jugador (opts.attrs): neutro = idéntico; más atributos = más puntos ----------
  {
    const f0 = failures, ev = [], all = v => { const o = {}; for (const k of S.ATTR_KEYS) o[k] = v; return o; };
    const play = (attrs, sd, secs) => { const g = S.createGame({ seed: sd, autopilot: true, difficulty: 'normal', attrs }), w = [0, 0], sig = [];
      for (let i = 0; i < secs * 120 && g.mode !== 'over'; i++) { S.step(g, DT, null); ev.length = 0; S.drainEvents(g, ev);
        for (const e of ev) if (e.type === 'point') { w[e.team]++; sig.push(e.team + e.reason); } }
      return { w, sig: sig.join(',') }; };
    // (a) 50 en todo = sin atributos (misma secuencia de puntos con la misma semilla)
    for (const sd of [11, 222]) { const a = play(null, sd, 240), b = play([[all(50), all(50)], [all(50), all(50)]], sd, 240);
      if (a.sig !== b.sig) fail('atributos neutros cambian la sim (semilla ' + sd + ')'); }
    // (b) monotonía: el equipo CPU con 85 en todo gana más puntos que con 50, y con 15 menos
    const pct = v => { let w = 0, n = 0; for (let sd = 1; sd <= 12; sd++) { const r = play(v == null ? null : [null, [all(v), all(v)]], 900 + sd, 300); w += r.w[1]; n += r.w[0] + r.w[1]; } return w / Math.max(1, n); };
    const lo = pct(15), mid = pct(null), hi = pct(85);
    // (revisión «que se noten», 10-nov-2026: medido 15/50/85 = 19,9/42,4/61,8 %, antes 31,3/42,4/49,6; antes el margen exigido era ±3 puntos)
    if (!(hi > mid + 0.06 && lo < mid - 0.10)) fail('atributos sin efecto claro: 15→' + lo.toFixed(3) + ' 50→' + mid.toFixed(3) + ' 85→' + hi.toFixed(3));
    // (c) multiplicadores del humano a 50 = 1 (spike/serve son sumandos: 0)
    const k = S.attrK(all(50)); for (const n in k) { const want = n === 'spike' || n === 'serve' || n === 'accT' ? 0 : 1; if (k[n] !== want) fail('attrK(50).' + n + ' = ' + k[n] + ' (debe ser exactamente ' + want + ')'); }
    if (failures === f0) console.log('estadísticas de jugador OK · % puntos CPU con atributos 15/50/85: ' + [lo, mid, hi].map(x => (x * 100).toFixed(1)).join(' / '));
  }

  // ---------- Atributos que se notan (10-nov-2026): tablas medidas, monotonía y Carrera jugable ----------
  // Velocidad y Salto del humano con st 15/30/50/70/90 (el resto a 50) medidos con la física real (stepPlayer/jump), más la
  // ventana de timing del remate y la del bloqueo. 50 = sin atributos, EXACTO. Ver notes/sim.md, «Atributos que se notan».
  {
    const f0 = failures, all = v => { const o = {}; for (const k of S.ATTR_KEYS) o[k] = v; return o; }, LV = [15, 30, 50, 70, 90];
    const meas = v => {
      const g = S.createGame({ seed: 1, ctrl: 'one', ctrlIdx: 0, attrs: v == null ? null : [[Object.assign(all(50), { speed: v, jump: v }), null], null] }), p = g.teams[0][0];
      g.ctrl = p; g.mode = 'rally'; p.x = 10.5; p.y = 0;
      let d05 = 0, x09 = 0, t4 = NaN;
      for (let i = 1; i <= 160; i++) { S._stepPlayer(g, p, DT, -1, 0); if (i === 60) d05 = 10.5 - p.x; if (i === 108) x09 = p.x; if (i === 120) var d1 = 10.5 - p.x, vmax = (x09 - p.x) / 0.1; if (isNaN(t4) && 10.5 - p.x >= 4) t4 = i * DT; }
      p.x = 5; p.z = 0; p.vz = 0; let jump = 0, air = 0;
      S._jump(g, p, 0, 0); for (let i = 0; i < 400 && (p.z > 0 || p.vz > 0); i++) { S._stepPlayer(g, p, DT, 0, 0); jump = Math.max(jump, p.z); air += DT; }
      const k = p.ak || { jump: 1, wJmp: 1, wBlk: 1, wAtk: 1 }, jv = C.JUMP_V * k.jump, bw = jv * k.wJmp * k.wBlk;
      return { vmax, d05, d1, t4, jump, spikeZ: jump + C.ZC.spike, handZ: jump + 2.8, air, wPerf: C.W_PERFECT * k.wAtk * k.wJmp * 1000, wGood: C.W_GOOD * k.wAtk * k.wJmp * 1000,
        blk: 2 * Math.min(jv, 0.22 / 0.8 * bw) / C.G * 1000 };
    };
    const T = LV.map(meas), N = meas(null), cols = ['vmax', 'd05', 'd1', 'jump', 'spikeZ', 'wPerf', 'wGood', 'blk'];
    console.log('atributos (Velocidad y Salto = st, resto 50): st | vel. máx m/s | 0,5 s m | 1 s m | 4 m en s | salto m | contacto remate m | manos bloqueo m | aire s | ventana remate perfecto/bueno ±ms | bloqueo perfecto ms');
    T.forEach((r, i) => console.log('  ' + LV[i] + ' | ' + r.vmax.toFixed(2) + ' | ' + r.d05.toFixed(2) + ' | ' + r.d1.toFixed(2) + ' | ' + r.t4.toFixed(2) + ' | ' + r.jump.toFixed(2) + ' | ' +
      r.spikeZ.toFixed(2) + ' | ' + r.handZ.toFixed(2) + ' | ' + r.air.toFixed(2) + ' | ' + r.wPerf.toFixed(0) + '/' + r.wGood.toFixed(0) + ' | ' + r.blk.toFixed(0)));
    for (const c of cols) { if (T[2][c] !== N[c]) fail('atributos: con 50, ' + c + ' ' + T[2][c] + ' != sin atributos ' + N[c]);
      for (let i = 1; i < LV.length; i++) if (!(T[i][c] > T[i - 1][c])) fail('atributos: ' + c + ' no crece de ' + LV[i - 1] + ' a ' + LV[i] + ' (' + T[i - 1][c] + ' → ' + T[i][c] + ')'); }
    // que se NOTEN (umbrales holgados sobre lo medido el 10-nov-2026: 1 s 3,98/5,60/6,42 m; salto 0,74/1,06/1,28 m; ventana 28/35/39 ms; bloqueo 177/269/331 ms)
    if (!(T[0].d1 <= 0.75 * T[2].d1 && T[4].d1 >= 1.12 * T[2].d1)) fail('Velocidad: alcance en 1 s poco distinto ' + T[0].d1 + ' / ' + T[2].d1 + ' / ' + T[4].d1);
    if (!(T[0].t4 - T[2].t4 >= 0.2)) fail('Velocidad: con 15 llega a 4 m menos de 0,2 s más tarde que con 50');
    if (!(T[0].jump <= T[2].jump - 0.25 && T[4].jump >= T[2].jump + 0.15)) fail('Salto: altura poco distinta ' + T[0].jump + ' / ' + T[2].jump + ' / ' + T[4].jump);
    if (!(T[0].wPerf <= 0.82 * T[2].wPerf && T[0].blk <= 0.7 * T[2].blk && T[4].blk >= 1.15 * T[2].blk)) fail('Salto: ventanas de timing poco distintas');
    // resto de atributos: cada multiplicador del humano se mueve en el sentido bueno y de forma perceptible (≥ 10 % entre 15 y 90)
    { const lo = S.attrK(all(15)), hi = S.attrK(all(90)), up = ['jump', 'speed', 'wJmp', 'wRecv', 'wDig', 'wSet', 'wAtk', 'wSrv', 'wBlk', 'blk', 'hands'], down = ['spread', 'srvSpread', 'rec'];
      for (const n of up) if (!(hi[n] / lo[n] >= 1.1)) fail('attrK.' + n + ' casi no cambia: ' + lo[n] + ' → ' + hi[n]);
      for (const n of down) if (!(lo[n] / hi[n] >= 1.1)) fail('attrK.' + n + ' casi no cambia: ' + lo[n] + ' → ' + hi[n]);
      if (!(hi.spike - lo.spike >= 4 && hi.serve - lo.serve >= 3.5 && lo.accT > 0.25 && hi.accT === 0)) fail('attrK: potencia/saque/aceleración ' + JSON.stringify([lo.spike, hi.spike, lo.serve, hi.serve, lo.accT])); }
    // Bloqueo del humano: remate rival que cruza la red a ~3 m, el humano despega con un desfase aleatorio (−0,3..+0,1 s) y un error
    // lateral (±0,6 m) y, en cuanto está en el aire, pulsa GOLPEAR una vez (bloqueo activo, 11-nov-2026: sin pulsar nunca hay directo;
    // pulsado a tiempo, el directo depende del contacto). Bloqueo 15/50/90 (resto 50) y Salto 15/90. Medido el 10-nov-2026 sin la
    // pulsación (400 remates): Bloqueo 15/50/90 → toca 91/100/100 %, directos 36/52/57 %; Salto 15/90 → toca 91/100 %, directos 46/54 %.
    // Medido el 11-nov-2026 con la pulsación (300): Bloqueo 15/50/90 → toca 90/100/100 %, directos 49/64/72 %; Salto 15/90 → 90/100 %,
    // directos 57/66 %. 50 = sin atributos, exacto.
    { const PRESS = { move: [0, 0], hit: true, jump: false, jset: false, switchPlayer: false };
      const blkRun = (st, N) => { const o = { n: 0, blk: 0, stuff: 0 }, r = S._makeRng(77);
        for (let s = 0; s < N; s++) { const g = S.createGame({ seed: 500 + s, ctrl: 'one', ctrlIdx: 0, attrs: st ? [[st, null], null] : null }), p = g.teams[0][0], ev = []; g.ctrl = p;
          rallyAt(g, { x: -1.6, y: 0, z: 3.25, vx: 14, vz: -1 }); g.touchTeam = 1; g.lastTeam = 1; g.touches = 3; g.lastKind = 'spike'; g.lastPlayer = g.teams[1][0];
          g.teams[1][0].x = -1.8; g.teams[1][1].x = -5; g.teams[0][1].x = 6;
          const jv = C.JUMP_V * (p.ak ? p.ak.jump : 1), tj = 1.6 / 14 - jv / C.G - 0.3 + 0.4 * r(); p.x = 0.5; p.y = (r() - 0.5) * 1.2;
          if (tj <= 0) { S._jump(g, p, 0, 0); for (let k = 0; k < Math.round(-tj * 120); k++) S._stepPlayer(g, p, DT, 0, 0); }
          let t = 0, done = false, pressed = false;
          for (let i = 0; i < 600 && !done; i++) { t += DT; if (tj > 0 && Math.abs(t - tj) < DT / 2 + 1e-9) S._jump(g, p, 0, 0);
            let inp = null; if (!pressed && p.z > 0.25) { pressed = true; inp = PRESS; }   // en el aire: GOLPEAR = bajar el bloqueo
            S.step(g, DT, inp); ev.length = 0; S.drainEvents(g, ev);
            for (const e of ev) { if (e.type === 'block' && e.player === p) { o.blk++; if (e.result === 'stuff') o.stuff++; } if (e.type === 'point') done = true; } }
          o.n++; }
        return o; };
      const b = v => Object.assign(all(50), { block: v }), j = v => Object.assign(all(50), { jump: v }), N = 300;
      const B0 = blkRun(null, N), B = [15, 50, 90].map(v => blkRun(b(v), N)), J = [15, 90].map(v => blkRun(j(v), N));
      const pc = o => (100 * o.blk / o.n).toFixed(0) + '/' + (100 * o.stuff / o.n).toFixed(0);
      console.log('bloqueo del humano (toca/directo %): sin atributos ' + pc(B0) + ' · Bloqueo 15/50/90 ' + B.map(pc).join(' ') + ' · Salto 15/90 ' + J.map(pc).join(' '));
      if (B[1].blk !== B0.blk || B[1].stuff !== B0.stuff) fail('bloqueo: con 50 distinto de sin atributos');
      if (!(B[0].stuff < B[1].stuff - 0.08 * N && B[2].stuff > B[1].stuff && B[0].blk < B[1].blk && J[0].stuff < B[1].stuff && J[0].blk < B[1].blk && J[1].stuff >= B[1].stuff)) fail('bloqueo: Bloqueo/Salto sin efecto claro en el bloqueo del humano'); }
    // Carrera, Liga Regional: tú con la media inicial (35, Atacante y Colocador-receptor) + compañero del club (+3) con control
    // «solo tu jugador», contra Fácil con rivales del club (genSt(media ± 1)). Bots novato y medio. Medido el 10-nov-2026 (8 semillas
    // × 360 s): novato 50-56 % (sin atributos, 48 %), medio 63-70 % (sin atributos, 71 %): sigue siendo jugable.
    if (MIN >= 10) {
      const cx = { console, Math, Date, JSON, localStorage: { getItem: () => null, setItem() {}, removeItem() {} } }; cx.globalThis = cx; cx.window = cx; vm.createContext(cx);
      let G = null;
      try { for (const f of ['js/sim.js', 'js/prog.js', 'js/badges.js', 'js/leagues.js', 'js/career.js']) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), cx, { filename: f }); G = cx.VB.Career && cx.VB.Career.genSt; } catch (e) { G = null; }
      if (!G) console.log('Carrera Regional: sin js/career.js (genSt), se salta');
      else {
        const out = [], ev = [];
        for (const bot of ['novato', 'medio']) { let w = 0, n = 0;
          for (const club of [28, 34, 40]) for (const role of ['atk', 'cr']) for (let s = 1; s <= 3; s++) {
            const r = S._makeRng(s * 31 + club), attrs = [[G(35, role, null), G(club + 3, role === 'atk' ? 'cr' : 'atk', null)], [G(club + 1, 'atk', r), G(club - 1, 'cr', r)]];
            const g = S.createGame({ seed: 3000 + s * 7 + club, serveClock: true, difficulty: 'easy', ctrl: 'one', ctrlIdx: 0, attrs, points: 15 }), bf = makeBot(BOTS[bot], s * 11 + club);
            for (let i = 0; i < 300 * 120 && !(g.finished && g.mode === 'over'); i++) { S.step(g, DT, bf(g)); ev.length = 0; S.drainEvents(g, ev); for (const e of ev) if (e.type === 'point') { n++; if (e.team === 0) w++; } }
          }
          out.push(bot + ' ' + (100 * w / n).toFixed(1) + ' % (' + n + ' puntos)');
          if (!(w / n >= (bot === 'medio' ? 0.57 : 0.43))) fail('Carrera Regional poco jugable con la media inicial: ' + bot + ' ' + (w / n).toFixed(3));
        }
        console.log('Carrera Regional con la media inicial (35) contra Fácil: ' + out.join(' · '));
      }
    }
    // integración (10-nov-2026): con Velocidad baja frenar y girar es al momento (antes se pasaba 0,74 m en un giro con 15); la
    // precisión (eRecv/eDig/eSet/eAtk) y el alcance (rRecv/rDig) valen 1 con 50 y van en el sentido del atributo
    {
      const turn = v => {
        const g = S.createGame({ seed: 1, ctrl: 'one', ctrlIdx: 0, attrs: [[Object.assign(all(50), { speed: v }), null], null] }), p = g.teams[0][0];
        g.ctrl = p; g.mode = 'rally'; p.x = 8; p.y = 0;
        for (let i = 0; i < 120; i++) S._stepPlayer(g, p, DT, -1, 0);   // a toda velocidad hacia la red (x baja)
        const x0 = p.x; let over = 0;
        for (let i = 0; i < 60; i++) { S._stepPlayer(g, p, DT, 1, 0); over = Math.max(over, x0 - p.x); }
        return over;
      };
      const o15 = turn(15), o35 = turn(35);
      console.log('  giro de 180° a toda velocidad: se pasa ' + o15.toFixed(3) + ' m con Velocidad 15, ' + o35.toFixed(3) + ' m con 35');
      if (!(o15 < 0.02 && o35 < 0.02)) fail('Velocidad baja: el giro aún desliza (' + o15.toFixed(3) + ' / ' + o35.toFixed(3) + ' m)');
      const K = v => S.attrK(all(v)), k15 = K(15), k50 = K(50), k90 = K(90);
      for (const f of ['eRecv', 'eDig', 'eSet', 'eAtk']) if (!(k50[f] === 1 && k15[f] > 1.4 && k90[f] < 0.7)) fail('precisión ' + f + ': ' + k15[f] + ' / ' + k50[f] + ' / ' + k90[f]);
      for (const f of ['rRecv', 'rDig']) if (!(k50[f] === 1 && k15[f] < 0.96 && k90[f] > 1.03)) fail('alcance ' + f + ': ' + k15[f] + ' / ' + k50[f] + ' / ' + k90[f]);
    }
    if (failures === f0) console.log('atributos que se notan OK (tablas, monotonía, 50 = sin atributos, Carrera Regional, giro, precisión y alcance)');
  }

  // ---------- Insignias (opts.badges), eventos para desbloquearlas y saque dirigible (sprint Carrera) ----------
  {
    const f0 = failures, res = [], ev = [], ids = S.BADGE_IDS;
    const all3 = id => [[null, null], [{ [id]: 3 }, { [id]: 3 }]];
    if (!Array.isArray(ids) || ids.length !== 12 || ids.join() !== 'canon,mira,rompemanos,seda,bombardero,flotador,muro,ancla,red,motor,sangrefria,lider') fail('Sim.BADGE_IDS: ' + ids);
    // (a) sin insignias = idéntico: misma huella (puntos y velocidad de cada toque) con badges ausente, nulo, vacío o con ids desconocidos
    { const play = (badges, sd, demo) => { const g = S.createGame({ seed: sd, autopilot: !demo, demo: !!demo, difficulty: 'normal', badges }), sig = [];
        for (let i = 0; i < 240 * 120; i++) { S.step(g, DT, null); ev.length = 0; S.drainEvents(g, ev);
          for (const e of ev) if (e.type === 'point') sig.push(e.team + e.reason + e.how); else if (e.type === 'hit') sig.push(e.kind[0] + e.speed.toFixed(5)); }
        return sig.join(','); };
      let same = true;
      for (const sd of [11, 222]) { const a = play(undefined, sd), b = play([[null, null], [null, null]], sd), c = play([[{}, null], [{ inventada: 3 }, { canon: 0 }]], sd);
        if (a !== b || a !== c) same = false; }
      if (play(undefined, 33, true) !== play(all3('canon'), 33, true)) same = false; // la demo no lleva insignias
      const g = S.createGame({ seed: 1, badges: [[{ canon: 2, mira: 7, foo: 1 }, null], [{ red: '1' }, { motor: 0 }]] });
      const norm = JSON.stringify(g.teams[0][0].badges) === '{"canon":2,"mira":3}' && g.teams[0][1].badges === null && g.teams[1][0].badges.red === 1 && g.teams[1][1].badges === null;
      res.push(['(a) sin insignias idéntico y p.badges normalizado', same && norm, [same, norm]]); }
    // CPU contra CPU (autopilot vs Normal): el equipo 1 lleva la insignia en sus dos jugadores; media de una métrica de sus golpes
    const cpuStat = (badges, pick, seeds) => { let sum = 0, n = 0;
      for (let sd = 1; sd <= (seeds || 8); sd++) { const g = S.createGame({ seed: 700 + sd, autopilot: true, difficulty: 'normal', badges }); let prev = null;
        for (let i = 0; i < 300 * 120; i++) { S.step(g, DT, null); ev.length = 0; S.drainEvents(g, ev);
          for (const e of ev) { if (e.type === 'hit') { const r = pick(e, g, prev); if (r != null) { sum += r; n++; } prev = e; } else if (e.type === 'point') prev = null; } } }
      return { m: sum / Math.max(1, n), n }; };
    // (b1) Cañón: velocidad media de remate del equipo 1
    { const sp = e => e.team === 1 && e.kind === 'spike' ? e.speed : null, a = cpuStat(null, sp, 24), b = cpuStat(all3('canon'), sp, 24);
      res.push(['Cañón: remate más rápido', b.m - a.m > 1.0 && a.n > 100, [a.m.toFixed(2), b.m.toFixed(2), a.n]]); }
    // (b2) Manos de seda: remate tras colocación buena/perfecta del compañero
    { const sp = (e, g, pv) => e.team === 1 && e.kind === 'spike' && pv && pv.team === 1 && pv.kind === 'set' && pv.grade !== 'poor' && pv.player !== e.player ? e.speed : null;
      const a = cpuStat(null, sp, 24), b = cpuStat(all3('seda'), sp, 24);
      res.push(['Manos de seda: remate asistido más rápido', b.m - a.m > 0.3 && a.n > 100, [a.m.toFixed(2), b.m.toFixed(2), a.n]]); }
    // (b3) Bombardero: saque en salto más frecuente (CPU contra CPU) y más rápido (mismo saque forzado en salto, con y sin la insignia)
    { const sv = e => e.team === 1 && e.kind === 'serve' ? (e.shot === 'jump' ? 1 : 0) : null, fa = cpuStat(null, sv), fb = cpuStat(all3('bombardero'), sv);
      const jsp = (s, badges) => { const g = S.createGame({ seed: 4400 + s, autopilot: true, difficulty: 'normal', badges }); g.serving = 1; S._setupServe(g); g.serveAuth = true; S._toss(g, g.server, true);
        for (let i = 0; i < 120 * 3; i++) { S.step(g, DT, null); const h = S.drainEvents(g).find(e => e.type === 'hit' && e.kind === 'serve'); if (h) return h.speed; } return NaN; };
      let d = 0, n = 0; for (let s = 1; s <= 30; s++) { const a = jsp(s, null), b = jsp(s, all3('bombardero')); if (a > 0 && b > 0) { d += b - a; n++; } }
      res.push(['Bombardero: saque en salto', fb.m > fa.m + 0.2 && n >= 25 && d / n > 1.3, [fa.m.toFixed(2), fb.m.toFixed(2), (d / Math.max(1, n)).toFixed(2), n]]); }
    // (b4) Hoja seca: baile del flotante x1,45
    { const wb = (e, g) => e.team === 1 && e.kind === 'serve' && e.shot === 'float' && g.ball.wobA > 0 ? g.ball.wobA : null, a = cpuStat(null, wb), b = cpuStat(all3('flotador'), wb);
      res.push(['Hoja seca: el flotante baila más', b.m / a.m > 1.35 && a.n > 40, [a.m.toFixed(2), b.m.toFixed(2), a.n]]); }
    // bloqueo aislado: remate del equipo 1 contra el bloqueador (IA) teams[0][0]
    const blockRun = (badges, N) => { const out = [];
      for (let s = 0; s < N; s++) { const g = S.createGame({ autopilot: true, seed: 500 + s, badges }), blk = g.teams[0][0];
        rallyAt(g, { x: -0.5, y: 0, z: 3.0, vx: 9, vz: -1.5 }); g.touchTeam = 1; g.lastTeam = 1; g.touches = 3; g.lastKind = 'spike'; g.lastPlayer = g.teams[1][0];
        blk.x = 0.5; blk.y = 0; blk.z = 0.8; blk.vz = 0.3; g.teams[0][1].x = 6; g.teams[1][0].x = -1.5; g.teams[1][1].x = -5;
        const evs = stepUntil(g, 'point', 600), bk = evs.find(e => e.type === 'block'), pt = evs.find(e => e.type === 'point');
        out.push(bk ? { r: bk.result, tool: !!(pt && pt.tool) } : null); }
      return out; };
    // (b5) Rompemanos: +24 puntos de block-out
    { const a = blockRun(null, 400), b = blockRun([[null, null], [{ rompemanos: 3 }, null]], 400), rate = r => r.filter(x => x && x.r === 'tool').length / Math.max(1, r.filter(x => x).length);
      const tp = b.filter(x => x && x.tool).length;
      res.push(['Rompemanos: más block-out', rate(b) - rate(a) > 0.15 && rate(b) - rate(a) < 0.33 && tp > 0, [rate(a).toFixed(3), rate(b).toFixed(3), tp]]); }
    // (b6) Muro (IA): más bloqueos directos; mismo dado, umbral mayor -> todo directo sin la insignia sigue siéndolo con ella
    { const a = blockRun(null, 400), b = blockRun([[{ muro: 3 }, null], null], 400);
      let mono = true, sa = 0, sb = 0; for (let i = 0; i < a.length; i++) { const x = a[i] && a[i].r === 'stuff', y = b[i] && b[i].r === 'stuff'; if (x) sa++; if (y) sb++; if (x && !y) mono = false; }
      res.push(['Muro: más bloqueos directos', mono && sb > sa * 1.08, [sa, sb]]); }
    // (b7) Ancla (IA): el receptor previsto falla menos (nunca peor) y el humano tiene la ventana x1,18. Con el modelo de esfuerzo
    // (EFFORT) el dado de recepción se tira en el contacto: se compara su prob. de controlarla cómoda (1 − S.effortFail a 0 m)
    { let okA = 0, okB = 0, mono = true;
      const r = (s, badges) => { const g = S.createGame({ seed: 3000 + s, autopilot: true, difficulty: 'normal', badges });
        for (let i = 0; i < 120 * 8; i++) { S.step(g, DT, null); const h = S.drainEvents(g).find(e => e.type === 'hit' && e.kind === 'serve'); if (h) return h.team === 0 && g.recvRisk > 0.3 && g._rc && g._rc.who ? 1 - S.effortFail(g, g._rc.who, 0, false) : null; } return null; };
      for (let s = 1; s <= 300; s++) { const a = r(s, null), b = r(s, [[null, null], [{ ancla: 3 }, { ancla: 3 }]]); if (a == null || b == null) continue; okA += a; okB += b; if (b < a - 1e-12) mono = false; }
      const hq = (te, badges) => { const g = S.createGame({ demo: false, seed: 66, badges }), h = g.teams[0][0];
        rallyAt(g, { x: 6, y: 0, z: 0.9, vx: 9, vz: -2 }); g.touchTeam = 1; g.touches = 3; g.lastTeam = 1; g.lastKind = 'serve'; g.lastPlayer = g.teams[1][0];
        g.ctrl = h; h.x = 6.2; h.y = 0; S._hit(g, h, null, te, ''); return S.drainEvents(g).find(e => e.type === 'hit'); };
      const h0 = hq(0.06, null), h1 = hq(0.06, [[{ ancla: 3 }, null], null]);
      res.push(['Ancla: recepción', mono && okB > okA && h1 && Math.abs(h1.timing - 0.06 / 1.18) < 1e-9 && h1.quality > h0.quality && h1.recv && !h1.dig, [okA.toFixed(2), okB.toFixed(2), h0 && h0.quality.toFixed(3), h1 && h1.quality.toFixed(3)]]); }
    // (b8) Ojo de halcón: el error del remate con mira (timing tardío) x0,68 (mismo dado); aimPoint lo dibuja igual
    { const err = badges => { let s0 = 0, ap = null; for (let k = 0; k < 24; k++) {
          const g = S.createGame({ demo: false, seed: 100 + k, badges }), h = g.teams[0][0], m = g.teams[0][1];
          rallyAt(g, { x: 1.4, y: 0.5, z: C.NET_H + 0.6, vz: -0.5 }); g.touchTeam = 0; g.touches = 2; g.lastTeam = 0; g.lastPlayer = m; g.lastKind = 'set';
          g.ctrl = h; h.x = 1.6; h.y = 0.5; h.z = 0.6; h.vz = 0.3; m.x = 6; for (const q of g.teams[1]) { q.x = -8; q.y = q.idx ? 4.5 : -4.5; }
          g.aim3.on = true; g.aim3.kind = 'spike'; g.aim3.x = -(3 + (k % 5)); g.aim3.y = -3 + (k % 7); const tx = g.aim3.x, ty = g.aim3.y;
          if (!ap) ap = Object.assign({}, S.aimPoint(g, {}));
          S._hit(g, h, null, 0.12, ''); S.drainEvents(g); const ld = S.predictLanding(g, {}); s0 += Math.hypot(ld.x - tx, ld.y - ty); } return [s0 / 24, ap.spread]; };
      const a = err(null), b = err([[{ mira: 3 }, null], null]);
      res.push(['Ojo de halcón: remate más preciso', b[0] / a[0] > 0.6 && b[0] / a[0] < 0.76 && Math.abs(b[1] / a[1] - 0.68) < 1e-9, [a[0].toFixed(3), b[0].toFixed(3)]]); }
    // (b9) Red de seguridad: alcance de defensa y de plancha x1,15; ventana de la defensa de remate x1,15
    { const g = S.createGame({ autopilot: true, seed: 5, badges: [[{ red: 3 }, null], null] }), p = g.teams[0][0], q = g.teams[0][1];
      rallyAt(g, { x: 5, y: 1.45, z: 1.0, vz: -1 }); g.touchTeam = 1; g.touches = 3; g.lastTeam = 1; g.lastKind = 'spike'; g.lastPlayer = g.teams[1][0];
      p.x = 5; p.y = 0; q.x = 8; q.y = -3;
      const cr = S.canReach(g, p); p.badges = null; const cr0 = S.canReach(g, p); p.badges = { red: 3 };
      g.ball.y = 2.35; g.ball.z = 0.6; const cd = S.canDive(g, p); p.badges = null; const cd0 = S.canDive(g, p);   // (17-nov-2026: DIVE 0,8 → (1,35 + 0,8) = 2,15 sin la insignia, ×1,15 = 2,47 con ella)
      const gh = S.createGame({ demo: false, seed: 67, badges: [[{ red: 3 }, null], null] }), h = gh.teams[0][0];
      rallyAt(gh, { x: 5, y: 0, z: 0.8, vx: 8, vz: -3 }); gh.touchTeam = 1; gh.touches = 3; gh.lastTeam = 1; gh.lastKind = 'spike'; gh.lastPlayer = gh.teams[1][0];
      gh.ctrl = h; h.x = 5.2; h.y = 0; S._hit(gh, h, null, 0.046, ''); const hv = S.drainEvents(gh).find(e => e.type === 'hit');
      res.push(['Red de seguridad: alcance y ventana', cr && !cr0 && cd && !cd0 && hv && Math.abs(hv.timing - 0.04) < 1e-9 && hv.dig && !hv.recv, [cr, cr0, cd, cd0, hv && hv.timing]]); }
    // (b10) Motor: carrera x VB.BADGE.motor[3] (1,045 desde los arreglos finales) en el peloteo (humano e IA)
    { const run = (badges, human) => { const g = S.createGame({ demo: false, autopilot: !human, seed: 8, badges }), p = g.teams[0][0]; rallyAt(g, { x: -5, z: 3 }); p.x = 6; p.y = -3;
        for (let i = 0; i < 60; i++) S._stepPlayer(g, p, DT, 0, 1); return p.y + 3; };
      const a = run(null, false), b = run([[{ motor: 3 }, null], null], false), c = run([[{ motor: 3 }, null], null], true), c0 = run(null, true);
      res.push(['Motor: corre más', Math.abs(b / a - VB.BADGE.motor[3]) < 1e-6 && Math.abs(c / c0 - VB.BADGE.motor[3]) < 1e-6 && VB.BADGE.motor[3] > 1, [a.toFixed(3), b.toFixed(3), c.toFixed(3)]]); }
    // (b11) Sangre fría (con punto de set: ventanas x1,25; IA timing x0,7) y (b12) Líder (compañero IA: reacción y timing de VB.BADGE.liderReact/liderT)
    { const g = S.createGame({ demo: false, seed: 9, badges: [[{ sangrefria: 3 }, { lider: 3 }], null] }), h = g.teams[0][0], m = g.teams[0][1], pr = g.prof[0];
      const tOff = S.aiTiming(g, m, pr), tOffH = S.aiTiming(g, h, pr); g.setPoint = 1; const tOn = S.aiTiming(g, h, pr);
      rallyAt(g, { x: 5, y: 0, z: 0.8, vx: 8, vz: -3 }); g.touchTeam = 1; g.touches = 3; g.lastTeam = 1; g.lastKind = 'spike'; g.lastPlayer = g.teams[1][0];
      g.ctrl = h; h.x = 5.2; h.y = 0; S._hit(g, h, null, 0.05, ''); const hv = S.drainEvents(g).find(e => e.type === 'hit');
      const mateR = S.aiReact(g, h, pr), selfR = S.aiReact(g, m, pr);
      res.push(['Sangre fría: ventanas en punto de set', tOff === pr.timing && Math.abs(tOffH - pr.timing * VB.BADGE.liderT[3]) < 1e-12 && Math.abs(tOn - pr.timing * VB.BADGE.liderT[3] * 0.7) < 1e-12 && hv && Math.abs(hv.timing - 0.04) < 1e-9, [tOff, tOn, hv && hv.timing]]);
      res.push(['Líder: el compañero lee antes', Math.abs(mateR - Math.max(0.02, pr.react - VB.BADGE.liderReact[3])) < 1e-12 && selfR === pr.react, [mateR, selfR, tOffH]]); }
    // (c) saque dirigible: humano guionizado que lleva la diana a las 4 esquinas y saca con timing perfecto / tardío (0,13 s)
    { const corners = [[-8.4, -3.9], [-8.4, 3.9], [-2.2, -3.9], [-2.2, 3.9]];
      const serve = (seed, tgt, late, jump) => {
        const g = S.createGame({ demo: false, seed, serveClock: false }), h = g.ctrl;
        for (const q of g.teams[1]) { q.x = -11; q.y = q.idx ? 6 : -6; q.down = 1e9; }
        let tossed = false, pressed = false, ld = null, dmax = 0;
        for (let i = 0; i < 120 * 6 && !ld; i++) {
          const inp = { move: [0, 0], hit: false, jump: false };
          if (g.mode === 'serve' && g.serveAuth && g.serveState === 'ready' && !tossed) { if (jump) inp.jump = true; else inp.hit = true; tossed = true; }
          else if (g.mode === 'serve' && g.serveState === 'toss') {
            const dx = tgt[0] - g.aim3.x, dy = tgt[1] - g.aim3.y, d = Math.hypot(dx, dy), f = d > 1e-6 ? Math.min(1, d / 0.25) / d : 0; inp.move = [dx * f, dy * f];
            if (!pressed && g.ball.vz < 0) { const w = S.hitWindow(g, h); if (w.t <= C.WINDUP - (late ? 0.13 : 0)) { inp.hit = true; pressed = true; dmax = d; } }
          }
          S.step(g, DT, inp);
          for (const e of S.drainEvents(g)) { if (e.type === 'land') ld = e; if (e.type === 'point' && !ld) ld = { x: 0, y: 0, none: true }; }
        }
        return ld ? { e: Math.hypot(ld.x - tgt[0], ld.y - tgt[1]), steer: dmax } : { e: 9, steer: dmax };
      };
      const meanE = (late, jump) => { let s0 = 0, st = 0; for (let k = 0; k < 24; k++) { const r = serve(4000 + k, corners[k % 4], late, jump); s0 += r.e; st = Math.max(st, r.steer); } return [s0 / 24, st]; };
      const pj = meanE(false, true), pf = meanE(false, false), lj = meanE(true, true), lf = meanE(true, false);
      const spr = [0.95, 0.78, 0.5, 0.2].map(q => S.serveSpread(q, true)), sprF = [0.95, 0.5].map(q => S.serveSpread(q, false));
      res.push(['(c) saque dirigible a las esquinas', pj[0] < 1 && pf[0] < 1 && pj[0] < pf[0] && lj[0] > pj[0] + 0.3 && lf[0] > pf[0] + 0.2 && Math.max(pj[1], pf[1]) < 0.05 && spr[0] <= 0.0501 && sprF[0] > spr[0] && sprF[1] < S.serveSpread(0.5, true),
        { saltoPerfecto: pj[0].toFixed(3), flotantePerfecto: pf[0].toFixed(3), saltoTarde: lj[0].toFixed(3), flotanteTarde: lf[0].toFixed(3), dianaSinLlegar: Math.max(pj[1], pf[1]).toFixed(3), serveSpread: spr.map(x => x.toFixed(2)).join('/') }]); }
    // (d) eventos para desbloquear insignias en CPU contra CPU: point.assist, point.tool, hit.dig, hit.recv
    { let pts = 0, kills = 0, assists = 0, tools = 0, digs = 0, recvs = 0, serves = 0, ptDigs = 0, bad = 0;
      for (let sd = 1; sd <= 4; sd++) { const g = S.createGame({ seed: 8800 + sd, demo: true });
        for (let i = 0; i < 600 * 120; i++) { S.step(g, DT, null); ev.length = 0; S.drainEvents(g, ev);
          for (const e of ev) {
            if (e.type === 'hit') { if (e.dig) digs++; if (e.recv) recvs++; if (e.kind === 'serve') serves++; if ((e.dig && e.touch !== 1) || (e.recv && e.touch !== 1) || typeof e.dig !== 'boolean' || typeof e.recv !== 'boolean') bad++; }
            if (e.type === 'point') { pts++; ptDigs += e.digs; if (e.how === 'kill') kills++;
              if (e.assist) { assists++; if (e.how !== 'kill' || e.assist.team !== e.team) bad++; } else if (e.assist !== null) bad++;
              if (e.tool) { tools++; if (e.lastKind !== 'block' || e.how !== 'kill') bad++; } else if (e.tool !== false) bad++; } } } }
      res.push(['(d) assist/tool/dig/recv en CPU contra CPU', !bad && assists > kills * 0.5 && assists <= kills && tools > pts * 0.01 && digs > pts * 0.15 && digs <= ptDigs + 3 /* + la jugada a medias al cortar */ && recvs > serves * 0.6 && recvs <= serves,
        { puntos: pts, remates: kills, asistencias: assists, blockOut: tools, defensas: digs, defensasPunto: ptDigs, recepciones: recvs, saques: serves, mal: bad }]); }
    const bad = res.filter(r => !r[1]);
    if (bad.length) fail('insignias / eventos / saque dirigible: ' + bad.map(r => r[0] + ' ' + JSON.stringify(r[2])).join('; '));
    if (failures === f0) console.log('insignias, eventos y saque dirigible OK\n  ' + res.map(r => r[0] + ' ' + JSON.stringify(r[2])).join('\n  '));
  }

  // ---- Carrera: opts.ref (error arbitral / challenge por competición) y opts.nums (dorsales) ----
  {
    const f0 = failures, ev = [], pts = o => { const g = S.createGame(Object.assign({ seed: 4242, autopilot: true }, o)), out = [];
      for (let i = 0; i < 240 * 120 && !g.finished; i++) { S.step(g, DT, null); ev.length = 0; S.drainEvents(g, ev); for (const e of ev) if (e.type === 'point') out.push(e.team + e.reason); }
      return out.join(','); };
    const base = pts({});
    if (pts({ ref: null }) !== base || pts({ nums: [[4, null], null] }) !== base) fail('Carrera: sin ref / con dorsales la sim debe ser idéntica');
    const g = S.createGame({ seed: 1, ref: { p1: 0.55, p2: 0.4, p3: 0.22, d3: 0.25, chal: 0 }, nums: [[23, 5], [0, 'x']] });
    if (g.chalPerSet !== 0 || g.challenges[0] !== 0 || g.refErr.d3 !== 0.25 || g.refErr.d1 !== VB.REF_ERR.d1) fail('Carrera: opts.ref no se aplica ' + JSON.stringify([g.refErr, g.chalPerSet, g.challenges]));
    if (Math.abs(S.refErrP(0.2, g) - 0.22) > 1e-9 || S.refErrP(0.2) !== 0) fail('Carrera: refErrP con g.refErr');
    if (g.teams[0][0].num !== 23 || g.teams[0][1].num !== 5 || g.teams[1][0].num !== 3 || g.teams[1][1].num !== 9) fail('Carrera: opts.nums');
    const g2 = S.createGame({ seed: 1, ref: { p1: 0.2, p2: 0.08, p3: 0.02, d3: 0.1, chal: 2 } });
    if (g2.challenges[0] !== 2 || g2.chalPerSet !== 2) fail('Carrera: challenge 2 por set');
    if (failures === f0) console.log('Carrera: opts.ref y opts.nums OK');
  }

  // ---- Castigo (Ambiente de Carrera, P3, notes/ambiente.md §4.5): Sim.holdFor / canPenalty / penalty ----
  {
    const f0 = failures, info = {};
    const wrapRng = g => { const r0 = g.rng, w = Object.assign(function () { w.n++; return r0(); }, { get: r0.get, set: r0.set, n: 0 }); g.rng = w; return w; };
    // avanza (autopilot) hasta el siguiente punto que no cierre set; devuelve los eventos vistos
    const toPoint = (g, maxS) => { const ev = []; for (let i = 0; i < (maxS || 240) * 120; i++) { S.step(g, DT, null); const k = ev.length; S.drainEvents(g, ev);
      for (let j = k; j < ev.length; j++) if (ev[j].type === 'point' && !ev[j].setWon && !ev[j].matchWon) return ev; } return null; };
    const seq = o => { const g = S.createGame(Object.assign({ seed: 777, autopilot: true }, o)), out = [], ev = [];
      for (let i = 0; i < 240 * 120 && !g.finished; i++) { S.step(g, DT, null); ev.length = 0; S.drainEvents(g, ev); for (const e of ev) if (e.type === 'point') out.push(e.team + e.reason); }
      return out.join(','); };
    // (a) amb sin usar las puertas = sim idéntica; sin g.amb las puertas no hacen nada
    if (seq({ amb: true }) !== seq({})) fail('Castigo: createGame({amb}) sin puertas cambia la sim');
    { const g = S.createGame({ seed: 5, autopilot: true }); toPoint(g); const h0 = S.stateHash(g), t0 = g.timer;
      if (g.amb || S.holdFor(g, 3, true) || S.canPenalty(g) || S.penalty(g, 0, { card: 'red' }) || S.stateHash(g) !== h0 || g.timer !== t0) fail('Castigo: sin g.amb las puertas deben ser no-op');
      if (S.createGame({ amb: true, demo: true }).amb || S.createGame({ amb: true, drill: 'serve' }).amb) fail('Castigo: amb en demo / Entrenamiento'); }
    // (b) holdFor: alarga, g.hold crece lo mismo, lock bloquea skipHold durante s
    { const g = S.createGame({ seed: 6, autopilot: true, present: true, amb: true }); toPoint(g); const t0 = g.timer, h0 = g.hold;
      if (!S.holdFor(g, 3.4, false) || Math.abs(g.timer - Math.max(t0, 3.4)) > 1e-9 || Math.abs((g.hold - g.timer) - (h0 - t0)) > 1e-9) fail('Castigo: holdFor no alarga bien ' + [t0, h0, g.timer, g.hold]);
      S.holdFor(g, 2.6, true); for (let i = 0; i < 120; i++) S.step(g, DT, null); // 1 s (pasado skipAfter)
      if (S.skipHold(g)) fail('Castigo: skipHold recorta con la pausa bloqueada');
      for (let i = 0; i < 2 * 120; i++) S.step(g, DT, null);
      if (g.mode === 'point' && !S.skipHold(g)) fail('Castigo: skipHold sigue bloqueado tras el lock'); }
    // (c) el castigo: marcador, saque, rotación del sacador, eventos, ventana de challenge cerrada, 0 llamadas a g.rng
    { const g = S.createGame({ seed: 7, autopilot: true, present: true, amb: true, ref: { p1: 0.5, p2: 0.5, p3: 0.5, chal: 2 } }); toPoint(g); S.drainEvents(g);
      const team = g.serving, w = 1 - team, sc = g.score.slice(), si = g.serverIdx[w], R = wrapRng(g);
      if (!S.canPenalty(g) || !S.canPenalty(g, team)) fail('Castigo: canPenalty false con balón muerto');
      const pe = S.penalty(g, team, { card: 'red', pid: g.teams[team][0].id }), ev = []; S.drainEvents(g, ev);
      const ty = ev.map(e => e.type + (e.reason ? ':' + e.reason : '')).join(',');
      if (!pe || pe.team !== w || !pe.penalty || pe.reason !== 'penalty' || pe.how !== 'penalty' || pe.signal !== 'penalty' || pe.faultTeam !== team ||
          pe.faultPlayer !== g.teams[team][0] || pe.player !== null || pe.card !== 'red' || pe.rallyHits !== 0 || pe.setWon || pe.matchWon) fail('Castigo: evento point ' + JSON.stringify(pe && { team: pe.team, r: pe.reason }));
      if (g.score[w] !== sc[w] + 1 || g.score[team] !== sc[team] || g.serving !== w || g.serverIdx[w] !== (si + 1) % 2) fail('Castigo: marcador / saque ' + JSON.stringify([sc, g.score, g.serving]));
      if (!/^whistle:penalty,point:penalty,sideout/.test(ty)) fail('Castigo: orden de eventos ' + ty);
      if (g.call || g.cpuChal || S.canChallenge(g, 0) || S.canChallenge(g, 1) || g.mode !== 'point' || !(g.timer > 1)) fail('Castigo: challenge abierto o sin pausa');
      if (R.n !== 0) fail('Castigo: llamadas a g.rng ' + R.n);
      info.rng = R.n;
      // sin cambio de saque: sanciona al que recibe → el sacador sigue
      const s2 = g.serving, i2 = g.serverIdx[s2]; S.penalty(g, 1 - s2, { card: 'delayR', pid: -1 }); const ev2 = []; S.drainEvents(g, ev2);
      if (g.serving !== s2 || g.serverIdx[s2] !== i2 || ev2.some(e => e.type === 'sideout') || ev2[1].card !== 'delayR' || ev2[1].faultPlayer !== null) fail('Castigo: sin cambio de saque');
      // el partido sigue y acaba con normalidad
      let n = 0; for (let i = 0; i < 3000 * 120 && !g.finished; i++) { S.step(g, DT, null); S.drainEvents(g); n++; if (i % 600 === 0) checkInvariants(g, 'castigo'); }
      if (!g.finished) fail('Castigo: el partido no acaba tras los castigos'); }
    // (d) nunca cierra el set: 24-20 y roja al que pierde → no
    { const g = S.createGame({ seed: 8, autopilot: true, amb: true }); toPoint(g); g.score = [24, 20];
      if (S.canPenalty(g, 1) || S.penalty(g, 1, { card: 'red' }) || g.score[0] !== 24) fail('Castigo: cierra el set');
      if (!S.canPenalty(g, 0)) fail('Castigo: 21-24 sí se puede'); g.pendingSet = true; if (S.canPenalty(g)) fail('Castigo: con set pendiente'); g.pendingSet = false;
      g.review = {}; if (S.canPenalty(g)) fail('Castigo: con revisión'); g.review = null;
      g.mode = 'serve'; if (S.canPenalty(g) || S.holdFor(g, 3)) fail('Castigo: fuera de la pausa del punto'); }
    // (e) 6v6: rota el equipo; playa: cambio de campo cada 7; pista: 8 del 3r set
    { const g = S.createGame({ seed: 9, autopilot: true, amb: true, format: '6v6' }); toPoint(g); S.drainEvents(g);
      const t = g.serving, w = 1 - t, z1 = g.rot[w][1]; S.penalty(g, t, { card: 'red', pid: -1 }); const ev = []; S.drainEvents(g, ev);
      if (g.rot[w][0] !== z1 || !ev.some(e => e.type === 'rotation')) fail('Castigo 6v6: no rota'); }
    { const g = S.createGame({ seed: 10, autopilot: true, amb: true, venue: 'beach' }); toPoint(g); S.drainEvents(g); g.score = [3, 3];
      S.penalty(g, 1, { card: 'red' }); const ev = []; S.drainEvents(g, ev);
      if (!ev.some(e => e.type === 'courtChange' && e.why === 'swap') || g.courtSwapAt !== 7) fail('Castigo playa: sin cambio de campo a los 7'); }
    { const g = S.createGame({ seed: 11, autopilot: true, amb: true }); toPoint(g); S.drainEvents(g); g.setNo = 3; g.score = [7, 5];
      S.penalty(g, 1, { card: 'red' }); const ev = []; S.drainEvents(g, ev);
      if (!g.courtSwap3 || !ev.some(e => e.type === 'courtChange' && e.why === 'eight')) fail('Castigo: sin cambio de campo a los 8 del 3r set'); }
    if (failures === f0) console.log('Castigo (Ambiente de Carrera): no-op sin g.amb, holdFor/lock, marcador, saque, rotación, cambios de campo, sin cerrar set, 0 llamadas a g.rng OK');
  }

  // ---- Colocación en salto (input.jset = COLOCAR en el aire; solo el humano) ----
  {
    const f0 = failures, res = [];
    // escenario: control 'one' (el compañero es IA). 2.º toque: el compañero recibe y el humano, junto a la red, salta y pulsa
    // COLOCAR cuando hitWindow().press <= lead (lead > 0 = pronto, < 0 = tarde). 1.er toque (first): balón libre rival que cae
    // alto sobre la red. Devuelve el toque del humano, el siguiente toque propio y el punto.
    const jsc = (seed, lead, o) => {
      o = o || {};
      const g = S.createGame({ seed, ctrl: 'one', stats: true, badges: o.badges }), h = g.teams[0][0], m = g.teams[0][1], b = g.ball, G = C.G;
      g.mode = 'rally'; b.held = null; S.drainEvents(g);
      const yy = (seed % 5 - 2) * 0.8, ap = (z0, z1, apex, x1, y1) => { const vz = Math.sqrt(2 * G * (apex - z0)), T = vz / G + Math.sqrt(2 * (apex - z1) / G); b.vx = (x1 - b.x) / T; b.vy = (y1 - b.y) / T; b.vz = vz; };
      if (!o.first) { m.x = 5.5; m.y = -1.5 + yy * 0.3; h.x = 2.1; h.y = yy; Object.assign(b, { x: m.x, y: m.y, z: 0.9, dip: 0, wobA: 0 }); ap(0.9, 1.9, 4.4, 1.9, h.y);
        g.touchTeam = 0; g.touches = 1; g.lastPlayer = m; g.lastTeam = 0; g.lastKind = 'pass'; g.lastShot = 'forearm'; }
      else { m.x = 5.8; m.y = -2 + yy * 0.3; h.x = 1.0; h.y = yy; Object.assign(b, { x: -3, y: yy, z: 2.5, dip: 0, wobA: 0 }); ap(2.5, 3.1, 4.6, 0.75, yy);
        g.touchTeam = 1; g.touches = 3; g.lastPlayer = g.teams[1][0]; g.lastTeam = 1; g.lastKind = 'free'; g.lastShot = 'overhead'; }
      g.lastTouchT = g.time; g.ctrl = h;
      const r = { h: null, next: null, pt: null, g, ready: false, blocks: 0 }, w = {}; let jumped = false, pressed = false, ji = 0;
      for (let i = 0; i < 120 * 12 && !r.pt; i++) {
        const inp = { move: [0, 0], hit: false, jump: false, jset: false, switchPlayer: false };
        if (!r.h && g.mode === 'rally') {
          const zc = 1.07 + 2.2, disc = b.vz * b.vz - 2 * G * (zc - b.z);
          if (!jumped && h.z === 0 && disc > 0 && (b.vz + Math.sqrt(disc)) / G < 0.5 && b.vz < 2.5) { inp[o.jumpBtn || 'jump'] = true; jumped = true; ji = i; }
          // o.early: COLOCAR o.early pasos después de despegar (doble pulsación rápida), sin mirar el timing
          if (jumped && o.early != null && !pressed && i >= ji + o.early) { inp.jset = true; pressed = true; }
          if (jumped && o.early == null && h.z > 0.3 && !pressed) { if (S.jsetReady(g)) r.ready = true; S.hitWindow(g, h, w); if (w.press <= lead) { inp[o.btn || 'jset'] = true; pressed = true; } }
        }
        S.step(g, DT, inp);
        for (const e of S.drainEvents(g)) {
          if (e.type === 'hit' && e.player === h && !r.h) r.h = e;
          else if (e.type === 'hit' && r.h && !r.next && e.team === 0) { r.next = e; // bloqueador CPU al rematar: el más cercano a la red
            const o1 = g.teams[1], bk = Math.abs(o1[0].x) < Math.abs(o1[1].x) ? o1[0] : o1[1]; r.bx = Math.abs(bk.x); r.bz = bk.z; }
          if (e.type === 'block' && r.next) r.blocks++;
          if (e.type === 'point') r.pt = e;
        }
      }
      return r;
    };
    const sweep = (lead, o, n) => { const s = { n: 0, js: 0, q: 0, spk: 0, won: 0, as: 0, ready: 0, bad: 0, x: [] };
      for (let k = 1; k <= (n || 120); k++) { const r = jsc(k, lead, o); s.n++; if (r.ready) s.ready++; if (!r.h || !r.h.jset) continue;
        s.js++; s.q += r.h.quality; if (r.h.kind !== 'set' || r.h.shot !== 'jump' || r.h.human !== true) s.bad++;
        if (r.next && r.next.kind === 'spike') s.spk++; if (r.pt && r.pt.team === 0) s.won++; if (r.pt && r.pt.assist === r.h.player) s.as++; }
      s.q = s.js ? s.q / s.js : 0; return s; };
    // (a) ocurre (2.º y 1.er toque), con el evento coherente; el compañero IA la ataca
    const a2 = sweep(0, {}), a1 = sweep(0, { first: true }), late = sweep(-0.15, {}), early = sweep(0.15, {});
    const rate = s => s.js ? s.spk / s.js : 0;
    res.push(['(a) colocación en salto (2.º toque) y remate del compañero IA', a2.js === a2.n && !a2.bad && a2.ready === a2.n && a2.q > 0.85 && rate(a2) >= 0.9 && a2.as > 0,
      { colocaciones: a2.js + '/' + a2.n, calidad: a2.q.toFixed(2), remates: pct(a2.spk, a2.js), ganados: pct(a2.won, a2.n), asistencias: a2.as }]);
    res.push(['(b) 1.er toque con el balón alto en la red: el compañero remata en el 2.º', a1.js === a1.n && !a1.bad && rate(a1) >= 0.85,
      { colocaciones: a1.js + '/' + a1.n, calidad: a1.q.toFixed(2), remates: pct(a1.spk, a1.js), ganados: pct(a1.won, a1.n), asistencias: a1.as }]);
    // (c) mal timing: menos calidad, menos remates y menos puntos (la colocación sale pegada a la red o larga)
    res.push(['(c) mal timing empeora', late.q < a2.q - 0.4 && early.q < a2.q - 0.4 && rate(late) < rate(a2) - 0.05 && rate(early) < rate(a2) - 0.05 && late.won + early.won < 2 * a2.won - 0.1 * a2.n,
      { calidadTarde: late.q.toFixed(2), calidadPronto: early.q.toFixed(2), rematesTarde: pct(late.spk, late.js), rematesPronto: pct(early.spk, early.js), ganadosTarde: pct(late.won, late.n), ganadosPronto: pct(early.won, early.n) }]);
    // (d) reglas: COLOCAR en el suelo salta; en el 3.er toque en la red es dejada; 1.er toque lejos de la red, toque normal; ventana más justa
    { const r3 = jsc(3, 0, { jumpBtn: 'jset' }), j3 = r3.g; // el salto se dio con COLOCAR: debe haber despegado igual
      const g4 = S.createGame({ seed: 5, ctrl: 'one' }), h4 = g4.teams[0][0], m4 = g4.teams[0][1];
      rallyAt(g4, { x: 0.8, y: 0, z: 3.1, vz: -1 }); h4.x = 0.9; h4.y = 0; h4.z = 0.9; g4.touchTeam = 0; g4.touches = 2; g4.lastPlayer = m4; g4.lastKind = 'set'; g4.lastShot = 'overhead'; g4.ctrl = h4;
      S._hit(g4, h4, null, 0, 'jset'); const e4 = S.drainEvents(g4).find(e => e.type === 'hit');
      const g5 = S.createGame({ seed: 6, ctrl: 'one' }), h5 = g5.teams[0][0];
      rallyAt(g5, { x: 5, y: 0, z: 2.6, vz: -2 }); h5.x = 5; h5.y = 0; h5.z = 0.5; g5.touchTeam = 1; g5.touches = 3; g5.lastPlayer = g5.teams[1][0]; g5.lastKind = 'free'; g5.ctrl = h5;
      S._hit(g5, h5, null, 0, 'jset'); const e5 = S.drainEvents(g5).find(e => e.type === 'hit');
      const qOf = (shot) => { const g6 = S.createGame({ seed: 7, ctrl: 'one' }), h6 = g6.teams[0][0], m6 = g6.teams[0][1];
        rallyAt(g6, { x: 1.6, y: 0, z: 3.2, vz: -1 }); h6.x = 1.6; h6.y = 0; h6.z = 0.9; g6.touchTeam = 0; g6.touches = 1; g6.lastPlayer = m6; g6.lastKind = 'pass'; g6.ctrl = h6;
        S._hit(g6, h6, null, 0.06, shot); return S.drainEvents(g6).find(e => e.type === 'hit').quality; };
      res.push(['(d) reglas y ventana', !!(r3.h && r3.h.jset) && j3.stats.jsets === 1 && e4 && e4.kind === 'free' && e4.shot === 'tip' && !e4.jset && e5 && e5.kind === 'pass' && !e5.jset && qOf('jset') < qOf('') - 0.05,
        { saltoConColocar: !!(r3.h && r3.h.jset), tercerToque: e4 && e4.kind + '/' + e4.shot, primeroLejos: e5 && e5.kind, q006: qOf('jset').toFixed(2) + ' vs ' + qOf('').toFixed(2) }]); }
    // (e) Manos de seda del colocador en salto: el remate del compañero sale más rápido; la asistencia cuenta (point.assist)
    { let v0 = 0, v1 = 0, n = 0;
      for (let k = 1; k <= 30; k++) { const r0 = jsc(k, 0, {}), r1 = jsc(k, 0, { badges: [[{ seda: 3 }, null], null] });
        if (r0.next && r1.next && r0.next.kind === 'spike' && r1.next.kind === 'spike') { v0 += r0.next.speed; v1 += r1.next.speed; n++; } }
      const fa = sweep(0, { first: true, badges: [[{ seda: 3 }, null], null] }, 40);
      res.push(['(e) Manos de seda tras colocación en salto', n > 20 && v1 / n > v0 / n + 0.6 && fa.as > 0, { remates: n, v: (v0 / n).toFixed(2) + ' -> ' + (v1 / n).toFixed(2), asist1erToque: fa.as }]); }
    // (f) la IA la usa poco: CPU contra CPU con pocas colocaciones en salto, atkPhase = 2.º toque, y el campo jset:false no cambia nada
    { let js = 0, mis = 0; const g = S.createGame({ seed: 991, demo: true }), ev = [];
      for (let i = 0; i < 300 * 120; i++) { S.step(g, DT, null); ev.length = 0; S.drainEvents(g, ev); for (const e of ev) if (e.type === 'hit' && e.jset) js++;
        for (let t = 0; t < 2; t++) if (S.atkPhase(g, t) !== (g.touchTeam === t && g.touches === 2)) mis++; }
      const fpOf = (inp) => { const g2 = S.createGame({ seed: 4343, autopilot: true }), out = [];
        for (let i = 0; i < 120 * 120; i++) { S.step(g2, DT, inp); ev.length = 0; S.drainEvents(g2, ev); for (const e of ev) if (e.type === 'hit' || e.type === 'point') out.push(e.type + (e.kind || e.reason) + (e.x != null ? e.x.toFixed(4) : '')); }
        return out.join(','); };
      const same = fpOf(null) === fpOf({ move: [0, 0], hit: false, jump: false, jset: true, switchPlayer: false });
      res.push(['(f) CPU contra CPU: colocación en salto poco frecuente', js <= 6 && mis === 0 && same, { jsets: js, atkPhaseDistinto: mis, autopilotIgual: same }]); }
    // (g) el bloqueador CPU lee la colocación en salto (ai.js, S.jsetReady): al rematar el compañero está en la red y en el
    // aire, y hay bloqueos (antes: a 2,6–2,9 m de la red, 0 bloqueos de 300)
    { let n = 0, near = 0, air = 0, blk = 0;
      for (let k = 1; k <= 60; k++) { const r = jsc(k, 0, {}); if (!r.next || r.next.kind !== 'spike') continue; n++;
        if (r.bx < 1.3) near++; if (r.bz > 0.1) air++; if (r.blocks) blk++; }
      res.push(['(g) bloqueo rival tras colocación en salto', n > 40 && near >= 0.9 * n && air >= 0.7 * n && blk > 0, { remates: n, enRed: pct(near, n), enElAire: pct(air, n), conBloqueo: pct(blk, n) }]); }
    // (h) COLOCAR pulsado justo al despegar (20–60 ms, antes de que la sim acepte el gesto en el aire) se guarda y sale
    { let ok = 0; const tries = [2, 5, 7];
      for (const e of tries) for (let k = 1; k <= 10; k++) { const r = jsc(k, 0, { early: e }); if (r.h && r.h.jset) ok++; }
      res.push(['(h) doble pulsación rápida = salta y coloca', ok === tries.length * 10, { colocaciones: ok + '/' + tries.length * 10 }]); }
    // (i) bloqueando un remate CPU, COLOCAR no hace nada (ni gesto ni colocación) y la UI no lo ofrece
    { const g = S.createGame({ seed: 12, ctrl: 'one' }), h = g.teams[0][0];
      rallyAt(g, { x: -0.9, y: 0, z: 3.2, vx: 12, vz: -2 }); g.touchTeam = 1; g.touches = 3; g.lastPlayer = g.teams[1][0]; g.lastTeam = 1; g.lastKind = 'spike'; g.lastShot = 'power';
      h.x = 0.5; h.y = 0; h.z = 0.7; h.vz = 1.5; h.actionT = 0.3; h.lastAction = 'jump'; g.ctrl = h; S.drainEvents(g);
      const ready = S.jsetReady(g); S.step(g, DT, { move: [0, 0], hit: false, jump: false, jset: true, switchPlayer: false });
      const sw = S.drainEvents(g).filter(e => (e.type === 'swing' || e.type === 'hit') && e.player === h);
      res.push(['(i) COLOCAR no coloca el remate rival', !ready && sw.length === 0 && !g.swingLive, { jsetReady: ready, gestos: sw.length }]); }
    const bad = res.filter(r => !r[1]);
    if (bad.length) fail('colocación en salto: ' + bad.map(r => r[0] + ' ' + JSON.stringify(r[2])).join('; '));
    if (failures === f0) console.log('colocación en salto OK\n  ' + res.map(r => r[0] + ' ' + JSON.stringify(r[2])).join('\n  '));
  }

  // Sim a N jugadores (sprint 1 del 6v6): API de equipo en 2v2 y humo del 6v6 provisional (?format=6v6, aún sin IA propia)
  if (ONLY !== 'matrix') {
    const f0 = failures, res = [];
    { const g = S.createGame({ seed: 5 }); let ok = g.size === 2 && g.format === '2v2' && g.rot === null && g.players.map(p => p.id).join() === '0,1,2,3';
      for (const p of g.players) { const m = S.mates(g, p); ok = ok && m.length === 1 && m[0] === S.other(g, p) && S.nearestMate(g, p) === m[0] && S.zoneOf(g, p) === 0 && !S.isFront(g, p); }
      ok = ok && S.serverOf(g, 0) === g.teams[0][g.serverIdx[0]];
      res.push(['(a) 2v2: mates/nearestMate = other, sin zonas', ok, {}]); }
    { const zp = S.zonePos(0, 4), zq = S.zonePos(1, 4), z1 = S.zonePos(0, 1);
      res.push(['(b) zonePos con el lateral del equipo', zp.x === 1.5 && zp.y === -3 && zq.x === -1.5 && zq.y === 3 && z1.x === 7.5 && z1.y === 3, { z4eq0: [zp.x, zp.y], z4eq1: [zq.x, zq.y] }]); }
    for (const o of [{ demo: true }, { demo: false, ctrl: 'one' }]) {
      let ex = null, pts = 0, rots = 0, nan = 0, newSet = false, lineupOk = true, srvOk = true;
      const g = S.createGame(Object.assign({ format: '6v6', seed: 66, stats: true }, o)), ev = [];
      try {
        // plantilla de 7 (6 + líbero, id team·16 + 6); en pista 6 por equipo: el líbero ya ha entrado por el central zaguero
        const ids = g.roster.map(r => r.map(p => p.id).join()).join(), onC = g.players.filter(p => !p.bench).length;
        if (ids !== '0,1,2,3,4,5,6,16,17,18,19,20,21,22' || g.size !== 6 || g.players.length !== 12 || onC !== 12) throw new Error('ids/size ' + ids + ' ' + g.size + ' ' + onC);
        for (let i = 0; i < 120 * 240; i++) {
          S.step(g, DT, null); ev.length = 0; S.drainEvents(g, ev);
          for (const e of ev) {
            if (e.type === 'point') pts++;
            if (e.type === 'sideout') rots++;
            if (e.type === 'newSet') { newSet = true; for (let t = 0; t < 2; t++) lineupOk = lineupOk && g.rot[t].every((p, z) => p === g.lineup[t][z] && p.zone === z + 1); }
            if (e.type === 'serveReady') srvOk = srvOk && e.player === g.rot[e.team][0] && e.player.zone === 1;
          }
          if (i % 60 === 0) for (const p of g.players) if (!Number.isFinite(p.x + p.y + p.z)) nan++;
        }
      } catch (e) { ex = e && e.stack || String(e); }
      res.push(['(c) 6v6 provisional ' + JSON.stringify(o), !ex && !nan && pts >= 10 && rots >= 3 && srvOk && lineupOk, { puntos: pts, cambiosDeSaque: rots, sacaZona1: srvOk, nuevoSet: newSet, alineacionAlSet: lineupOk, nan, ex }]);
    }
    const bad = res.filter(r => !r[1]);
    if (bad.length) fail('N jugadores: ' + bad.map(r => r[0] + ' ' + JSON.stringify(r[2])).join('; '));
    if (failures === f0) console.log('\nN jugadores (sprint 1 del 6v6) OK\n  ' + res.map(r => r[0] + ' ' + JSON.stringify(r[2])).join('\n  '));
  }

  // 6v6 CPU contra CPU (sprint 2, notes/diseno-6v6-carrera.md §4 «objetivos medibles»): VB.AI6 con rotaciones, líbero,
  // formaciones y reglas de zaguero. Side-out 58-66 %, mediana del rally 5-8 s, 0 faltas de posición y de zaguero de la IA,
  // líbero nunca delante ni sacando, >= 70 % de 2.os toques del colocador; sin excepciones ni NaN. Lote A (D5): hay remates «pipe»
  // (tempo 'pipe' del colocador: zaguero que despega detrás de 3 m) y siguen las 0 faltas de zaguero.
  if (ONLY !== 'matrix') {
    const f0 = failures, NS6 = 16, MIN6 = 15; // ~1200 puntos: con menos, el side-out baila ±3 %
    let pts = 0, so = 0, sec = 0, secS = 0, ovl = 0, back = 0, libBad = 0, libSrv = 0, libEv = 0, rotEv = 0, sideEv = 0, nan = 0, ex = null, atkBack = 0;
    const rallies = [], tempos = {}, atkRole = {}, t0 = Date.now();
    try {
      for (let s = 0; s < NS6; s++) {
        const g = S.createGame({ format: '6v6', demo: true, seed: 600 + s, stats: true }), ev = [];
        for (let i = 0; i < MIN6 * 60 * 120; i++) {
          S.step(g, DT, null); ev.length = 0; S.drainEvents(g, ev);
          for (const e of ev) {
            if (e.type === 'point') { pts++; if (e.sideout) so++; rallies.push(e.rallyTime); if (e.reason === 'backAttack' || e.reason === 'backBlock') back++; }
            else if (e.type === 'hit' && e.touch === 2) { sec++; if (e.player.role === 'S') secS++; if (e.kind === 'set' && g.setPlan[e.team]) tempos[g.setPlan[e.team].tempo] = (tempos[g.setPlan[e.team].tempo] || 0) + 1; }
            else if (e.type === 'hit' && e.kind === 'spike') { atkRole[e.player.role] = (atkRole[e.player.role] || 0) + 1; if (!e.player.front) atkBack++; }
            else if (e.type === 'serveReady' && (e.player.role === 'L' || e.player.bench)) libSrv++;
            else if (e.type === 'libero') libEv++;
            else if (e.type === 'rotation') rotEv++;
            else if (e.type === 'sideout') sideEv++;
          }
          if (g.mode === 'rally' || g.mode === 'serve') for (let t = 0; t < 2; t++) {
            const L = g.libero[t]; if (!L.bench && (L.front || [1, 5, 6].indexOf(L.zone) < 0 || g.teams[t].indexOf(L) < 0)) libBad++;
            if (g.mode === 'serve' && g.server.role === 'L') libSrv++;
          }
          if (i % 120 === 0) for (const p of g.players) if (!Number.isFinite(p.x + p.y + p.z)) nan++;
        }
        ovl += g.stats.overlap[0] + g.stats.overlap[1];
      }
    } catch (e) { ex = e && e.stack || String(e); }
    rallies.sort((a, b) => a - b);
    const sidePct = pts ? 100 * so / pts : 0, med = rallies.length ? rallies[rallies.length >> 1] : 0, setPct = sec ? 100 * secS / sec : 0;
    const res = [
      ['(a) sin excepciones ni NaN', !ex && !nan && pts > 200, { puntos: pts, nan, ex }],
      ['(b) side-out 58-66 %', sidePct >= 58 && sidePct <= 66, { sideOut: sidePct.toFixed(1) + '%' }],
      ['(c) mediana del rally 5-8 s', med >= 5 && med <= 8, { mediana: +med.toFixed(2) }],
      ['(d) 0 faltas de posición de la IA', ovl === 0, { solapamientos: ovl }],
      ['(e) 0 faltas de zaguero (ataque/bloqueo) de la IA', back === 0, { faltas: back }],
      ['(f) líbero nunca delante ni sacando', libBad === 0 && libSrv === 0 && libEv > 0, { delante: libBad, sacando: libSrv, cambiosLibero: libEv }],
      ['(g) >= 70 % de 2.os toques del colocador', setPct >= 70, { colocador: setPct.toFixed(1) + '%' }],
      ['(h) evento rotation en cada cambio de saque', rotEv === sideEv && rotEv > 0, { rotation: rotEv, sideout: sideEv }],
      // (i) pipe (lote A, D5): el colocador en sistema reparte también al zaguero (peso bajo, FORM.setW.pipe): con ~1300 puntos salen
      // decenas; se exige > 0 (y (e) sigue en 0: el zaguero despega detrás de 3 m)
      ['(i) hay remates pipe (> 0)', (tempos.pipe || 0) > 0, { pipe: tempos.pipe || 0, rematesDeZaguero: atkBack }]
    ];
    const bad = res.filter(r => !r[1]);
    if (bad.length) fail('6v6 CPU contra CPU: ' + bad.map(r => r[0] + ' ' + JSON.stringify(r[2])).join('; '));
    console.log('\n6v6 CPU contra CPU (sprint 2, ' + NS6 + ' semillas x ' + MIN6 + ' min, ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s)' + (failures === f0 ? ' OK' : '') +
      '\n  ' + res.map(r => r[0] + ' ' + JSON.stringify(r[2])).join('\n  ') + '\n  tempos ' + JSON.stringify(tempos) + ' remates por puesto ' + JSON.stringify(atkRole));
  }

  // 6v6 con HUMANO (sprint 3, notes/diseno-6v6-carrera.md §1.5): control Uno por puesto (receptor, OH1 = n.º 2), la IA mueve al
  // resto. Desde el 11-nov-2026 el personaje NO se mueve solo (Ferran: «deja que el jugador decida»): el bot de la matriz va él
  // mismo a su sitio (makeBot con {six: true}, VB.AI6.spot). Exige: sin excepciones ni NaN, el humano saca con la rotación, sin
  // eventos switch, el colocador le coloca, toques del humano por rally >= 0,5 (novato en Fácil) y >= 0,6 (medio en Normal; objetivo
  // del diseño 0,7 como OH), jugable en Fácil (novato >= 45 % de puntos); con el humano quieto: no se mueve ni salta ni golpea solo,
  // los compañeros no le quitan los balones de su zona y el colocador no se la da; «¡Pídela!» (CAMBIAR) guarda g.ask6 y sube su peso
  // en VB.AI6.chooseSet. Lote A (posiciones jugables, rotaciones reales): (h) los 4 puestos (CTRL_ROLES6) con bot, (i) central humano
  // que sale por el líbero y lo lleva, (j) colocador humano (2º toque suyo; laneOf/chooseSet con carril), (k) 6 formaciones de recepción
  // legales, (m) falta de posición del humano en Difícil (en Fácil no se mueve). El pipe (l) se mide en «6v6 CPU contra CPU» (i).
  if (ONLY !== 'matrix') {
    const f0 = failures, res = [], t0 = Date.now(), NS = 3, MINH = 6;
    for (const [bn, df, minT] of [['novato', 'easy', 0.5], ['medio', 'normal', 0.6]]) {
      let pts = 0, won = 0, ht = 0, hsrv = 0, hsrvOk = 0, sw = 0, setTo = 0, nan = 0, ex = null, role = true;
      try {
        for (let s = 0; s < NS; s++) {
          const g = S.createGame({ format: '6v6', seed: 900 + s, difficulty: df, ctrl: 'one', stats: true }), bot = makeBot(BOTS[bn], 77 + s, { six: true }), ev = [];
          role = role && g.ctrl.role === 'OH' && g.ctrl.num === 2 && g.ctrlMode === 'one' && g.ctrlRole === 'OH';
          for (let i = 0; i < MINH * 60 * 120; i++) {
            S.step(g, DT, bot(g)); ev.length = 0; S.drainEvents(g, ev);
            for (const e of ev) {
              if (e.type === 'point') { pts++; if (e.team === 0) won++; }
              else if (e.type === 'hit' && e.human) { ht++; if (e.kind === 'serve') hsrvOk++; }
              else if (e.type === 'hit' && e.kind === 'set' && e.team === 0 && g.setPlan[0] && g.setPlan[0].to === g.ctrl) setTo++;
              else if (e.type === 'serveReady' && e.player === g.ctrl) hsrv++;
              else if (e.type === 'switch') sw++;
            }
            if (i % 120 === 0) for (const p of g.players) if (!Number.isFinite(p.x + p.y + p.z)) nan++;
          }
        }
      } catch (e) { ex = e && e.stack || String(e); }
      const tpr = pts ? ht / pts : 0;
      res.push(['(a) ' + bn + ' en ' + df + ': sin excepciones ni NaN, receptor n.º 2' + (df === 'easy' ? ', gana >= 45 % de los puntos' : ''),
        !ex && !nan && pts > 40 && role && (df !== 'easy' || won >= 0.45 * pts), { puntos: pts, ganados: pct(won, pts), nan, ex }]);
      res.push(['(b) ' + bn + ': saca con la rotación y sin eventos switch', hsrv > 0 && hsrvOk > 0 && sw === 0, { turnos: hsrv, sacados: hsrvOk, switch: sw }]);
      res.push(['(c) ' + bn + ': toques del humano por rally >= ' + minT + ' y el colocador le coloca', tpr >= minT && setTo > 0, { toquesPorRally: +tpr.toFixed(2), coloca: setTo }]);
    }
    { // (e)-(f) humano QUIETO (sin entrada en todo el partido): no se mueve nunca (tampoco en su balón: desde el 11-nov el imán corto
      // de assistMove solo actúa en 6v6 si el jugador ya empuja el stick), no salta ni golpea (solo contactos de cuerpo, regla); los compañeros
      // no le quitan los 1os toques que caen junto a él (< 1 m) y el colocador no se la da (quieto). En Fácil, su equipo sigue jugando
      let mvOff = 0, mvAll = 0, rallies = 0, jumps = 0, swings = 0, pass0 = 0, steal = 0, setIdle = 0, ex = null;
      try {
        for (let s = 0; s < 2; s++) {
          const g = S.createGame({ format: '6v6', seed: 940 + s, difficulty: 'easy', ctrl: 'one' }), ev = [];
          let px = g.ctrl.x, py = g.ctrl.y;
          for (let i = 0; i < 5 * 60 * 120; i++) {
            const h = g.ctrl, was = g.mode === 'rally' && g.jobs[0] !== h && h.z === 0, wasR = g.mode === 'rally' && h.z === 0;
            S.step(g, DT, null); ev.length = 0; S.drainEvents(g, ev);
            if (was && g.mode === 'rally' && g.jobs[0] !== h && g.ctrl === h) mvOff += Math.hypot(h.x - px, h.y - py);
            if (wasR && g.mode === 'rally' && g.ctrl === h) mvAll += Math.hypot(h.x - px, h.y - py);
            px = g.ctrl.x; py = g.ctrl.y;
            for (const e of ev) {
              if (e.type === 'serveReady') rallies++;
              else if (e.type === 'jump' && e.player === g.ctrl) jumps++;
              else if (e.type === 'hit' && e.human && e.shot !== 'body') swings++;
              else if (e.type === 'hit' && e.team === 0 && e.kind === 'pass' && !e.human) { pass0++; if (Math.hypot(e.x - g.ctrl.x, e.y - g.ctrl.y) < 1.0 && g.ctrl.z === 0) steal++; }
              else if (e.type === 'hit' && e.kind === 'set' && e.team === 0 && g.setPlan[0] && g.setPlan[0].to === g.ctrl) setIdle++;
            }
          }
        }
      } catch (e) { ex = e && e.stack || String(e); }
      res.push(['(e) humano quieto: no se mueve (ni hacia su balón), no salta ni golpea solo', !ex && rallies > 20 && mvAll / Math.max(1, rallies) < 0.05 && jumps === 0 && swings === 0,
        { saques: rallies, mPorRally: +(mvAll / Math.max(1, rallies)).toFixed(3), mFueraDeSuBalon: +(mvOff / Math.max(1, rallies)).toFixed(3), saltos: jumps, golpes: swings, ex }]);
      res.push(['(f) humano quieto: los compañeros no le quitan los balones de su zona y el colocador no se la da', steal <= Math.max(2, 0.02 * pass0) && setIdle === 0,
        { primerosToquesCompañeros: pass0, junto: steal, colocaciones: setIdle }]);
      // (g) colocaciones regaladas (VB.AI6.setReady): delantero a 3,8 m de la red en la batida y jugando → puede recibirla; lejos de la
      // red (6 m) o quieto (sin entrada en HUM.idleT s) → nunca
      const VB6 = VB.AI6, sd0 = S.side(0), n6 = [0, 0, 0];
      for (let k = 0; k < 3; k++) for (let n = 0; n < 200; n++) {
        const h = S.createGame({ format: '6v6', seed: 700 + n, ctrl: 'one' }), st = VB6.setterOf(h, 0), c = h.ctrl;
        h._pq6 = [{ q: 0.9, t: h.time }, { q: 0, t: -9 }]; c.front = true;
        c.x = sd0 * (k === 1 ? 6 : 3.8); c.y = sd0 * -3.3; h.hAct = k === 2 ? h.time - VB6.HUM.idleT - 0.5 : h.time;
        VB6.chooseSet(h, st); if (h.setPlan[0].to === c) n6[k]++;
      }
      res.push(['(g) el colocador no coloca al humano lejos de la red ni quieto (sí en la batida y jugando)', n6[0] >= 40 && n6[1] === 0 && n6[2] === 0, { batida: n6[0], lejos: n6[1], quieto: n6[2] }]);
    }
    { // «¡Pídela!»: CAMBIAR en el peloteo, con el humano delantero y antes de la colocación (S.askOk), guarda g.ask6 y emite
      // 'ask' ok; fuera de esa ventana (zaguero, saque) no guarda nada y emite 'ask' sin ok (ui.js: «Ahora no»). Con g.ask6, el
      // colocador le elige mucho más (mismo azar, mismas condiciones)
      const ASK = { move: [0, 0], hit: false, jump: false, switchPlayer: true };
      let asked = false, noOk = 0, noKept = true;
      for (let sd = 31; sd < 31 + 40 && !asked; sd++) {
        const g = S.createGame({ format: '6v6', seed: sd, ctrl: 'one' });
        stepUntil(g, 'whistle', 2000);
        if (g.mode === 'serve') { const a0 = g.ask6; S.step(g, DT, ASK); if (S.drainEvents(g).some(e => e.type === 'ask' && e.ok === false)) noOk++; if (g.ask6 !== a0) noKept = false; }
        for (let i = 0; i < 400 && g.mode === 'serve'; i++) S.step(g, DT, null);
        for (let i = 0; i < 200 && g.mode === 'rally' && !asked; i++) {
          const ok = S.askOk(g), a0 = g.ask6; S.step(g, DT, ASK);
          const ev = S.drainEvents(g).filter(e => e.type === 'ask');
          if (ok && ev.length && ev[0].ok) asked = g.ask6 === g.time;
          else if (!ok && ev.length) { if (ev[0].ok === false) noOk++; if (g.ask6 !== a0) noKept = false; }
        }
      }
      asked = asked && noOk > 0 && noKept;
      const VB6 = VB.AI6, cnt = [0, 0];
      for (let k = 0; k < 2; k++) for (let n = 0; n < 300; n++) {
        const h = S.createGame({ format: '6v6', seed: 500 + n, ctrl: 'one' }), st = VB6.setterOf(h, 0);
        h.ask6 = k ? h.time : -9; h._pq6 = [{ q: 0.9, t: h.time }, { q: 0, t: -9 }]; h.ctrl.front = true;
        h.ctrl.x = S.side(0) * 3.8; h.ctrl.y = S.side(0) * -3.3; h.hAct = h.time; // en la batida y jugando (VB.AI6.setReady)
        VB6.chooseSet(h, st); if (h.setPlan[0].to === h.ctrl) cnt[k]++;
      }
      res.push(['(d) «¡Pídela!»: CAMBIAR guarda g.ask6 solo en su ventana (askOk) y el colocador elige más al humano', asked && cnt[1] - cnt[0] >= 30, { ask6: asked, ahoraNo: noOk, sinPedir: cnt[0], pidiendo: cnt[1] }]);
    }
    { // (h) puestos jugables (lote A, D1): CTRL_ROLES6 = OH, S, OPP, MB (el líbero no se elige); g.ctrl = el 1r de ese puesto (dorsales
      // 2/1/4/3) y g.ctrlBase su atleta de verdad; setCtrlRole cambia de puesto en caliente (al central sustituido le toca el líbero).
      // 3 min de bot medio por puesto (makeBot {six, role}): sin excepciones ni NaN, 0 switch, se juegan puntos (~5/min: >= 8) y el humano
      // toca algún balón
      const NUM6 = { OH: 2, S: 1, OPP: 4, MB: 3 }, ROLES = S.CTRL_ROLES6 || [], perRole = {};
      let okRoles = ROLES.length === 4 && ['OH', 'S', 'OPP', 'MB'].every(r => ROLES.indexOf(r) >= 0), ex = null;
      try {
        for (const r of ROLES) {
          const g = S.createGame({ format: '6v6', seed: 960, difficulty: 'normal', ctrl: 'one', ctrlRole: r, stats: true }), base = g.ctrl;
          const ok0 = g.ctrlRole === r && base.role === r && base.num === NUM6[r] && g.ctrlBase === base;
          const r2 = ROLES[(ROLES.indexOf(r) + 1) % ROLES.length], c2 = S.setCtrlRole(g, r2);
          const okSw = !!c2 && c2 === g.ctrl && g.ctrlRole === r2 && g.ctrlBase && g.ctrlBase.role === r2 && g.ctrlBase.num === NUM6[r2] && (g.ctrl === g.ctrlBase || g.ctrl === g.libero[0]);
          S.setCtrlRole(g, r);
          const okBack = g.ctrlBase === base && g.ctrlRole === r;
          const bot = makeBot(BOTS.medio, 81, { six: true, role: r }), ev = [];
          let pts = 0, ht = 0, sw = 0, nan = 0;
          for (let i = 0; i < 3 * 60 * 120; i++) {
            S.step(g, DT, bot(g)); ev.length = 0; S.drainEvents(g, ev);
            for (const e of ev) { if (e.type === 'point') pts++; else if (e.type === 'hit' && e.human) ht++; else if (e.type === 'switch') sw++; }
            if (i % 120 === 0) for (const p of g.players) if (!Number.isFinite(p.x + p.y + p.z)) nan++;
          }
          perRole[r] = { dorsal: base.num, cambia: okSw && okBack, puntos: pts, toques: ht, switch: sw, nan };
          okRoles = okRoles && ok0 && okSw && okBack && pts >= 6 && ht > 0 && sw === 0 && nan === 0;   // (17-nov-2026: con remates de verdad en 6v6 y la plancha más floja, el central hace 7 en 3 min)
        }
      } catch (e) { ex = e && e.stack || String(e); }
      res.push(['(h) 4 puestos jugables (OH, S, OPP, MB; dorsales 2/1/4/3; setCtrlRole cambia): 3 min de bot por puesto sin excepciones, NaN ni switch', okRoles && !ex, { puestos: ROLES, porPuesto: perRole, ex }]);
    }
    { // (i) central humano (D2): cuando el líbero entra por su central, el humano lleva al líbero (g.ctrl === g.libero[0]) y el evento
      // libero del equipo 0 lleva human: true; al volver su central, g.ctrl === g.ctrlBase. Mientras lleva al líbero no saca ni bloquea
      // (reglas del líbero). 10 min: con 6 rotaciones por vuelta, al central le toca salir y volver varias veces
      let asLib = 0, backMB = 0, libHum = 0, libSrv = 0, libBlk = 0, wasLib = false, pts = 0, ex = null;
      try {
        const g = S.createGame({ format: '6v6', seed: 970, difficulty: 'normal', ctrl: 'one', ctrlRole: 'MB', stats: true }), bot = makeBot(BOTS.medio, 83, { six: true, role: 'MB' }), ev = [];
        for (let i = 0; i < 10 * 60 * 120; i++) {
          S.step(g, DT, bot(g)); ev.length = 0; S.drainEvents(g, ev);
          if (g.ctrl === g.libero[0]) { asLib++; wasLib = true; } else if (wasLib && g.ctrl === g.ctrlBase) backMB++;
          for (const e of ev) {
            if (e.type === 'point') pts++;
            else if (e.type === 'libero' && e.team === 0 && e.human) libHum++;
            else if (e.type === 'serveReady' && e.player === g.ctrl && g.ctrl.role === 'L') libSrv++;
            else if (e.type === 'block' && e.human && g.ctrl.role === 'L') libBlk++;
          }
        }
      } catch (e) { ex = e && e.stack || String(e); }
      res.push(['(i) central humano: el líbero entra por él (lleva al líbero, evento libero human) y vuelve; de líbero no saca ni bloquea',
        !ex && asLib > 0 && backMB > 0 && libHum > 0 && libSrv === 0 && libBlk === 0, { pasosDeLibero: asLib, pasosDeVuelta: backMB, eventosLiberoHumano: libHum, saquesDeLibero: libSrv, bloqueosDeLibero: libBlk, puntos: pts, ex }]);
    }
    { // (j) colocador humano (D3): el 2º toque es suyo (humanOwns ampliado: a < 3 m de él o en la zona de ataque). Con el bot medio que va
      // al punto de colocación, >= 60 % de los 2.os toques de su equipo son suyos (el resto: pases horribles que juega el colocador de
      // emergencia, y balones que el bot no llega a tocar). laneOf (puro, local del equipo: yl = side·my, d = side·mx) y
      // chooseSet(g, p, lane) eligen el carril del stick cuando hay atacante válido: 200 semillas × 4 carriles, sin azar en el carril
      // (se admite 2 % por si el bloqueo rival anula al atacante del carril). Y la colocación en SALTO con carril por la sim entera
      // (sim.hit, rama jset → laneOf → chooseSet, revisión del lote A): saca el rival, en el 1r toque del equipo humano el balón se reconduce
      // a un pase limpio al punto de colocación (en sistema), el colocador humano se planta debajo, salta con el balón a 0,46 s de los 3 m
      // y pulsa COLOCAR en el aire con el stick en el carril (módulo 1): colocación en salto humana de 2º toque con el tempo del carril
      // (pipe: destino detrás de los 3 m, d >= 3,3). Con el stick a 0,3 (zona muerta de D3: aim va normalizado y g.swingLen le devuelve el
      // módulo) el carril NO se fuerza: hacia atrás, el pipe sale como mucho la mitad de las veces (su peso es 0,45 de ~3,1)
      let sec0 = 0, secH = 0, pts = 0, nan = 0, ex = null;
      try {
        for (let s = 0; s < 2; s++) {
          const g = S.createGame({ format: '6v6', seed: 980 + s, difficulty: 'normal', ctrl: 'one', ctrlRole: 'S', stats: true }), bot = makeBot(BOTS.medio, 85 + s, { six: true, role: 'S' }), ev = [];
          for (let i = 0; i < 6 * 60 * 120; i++) {
            S.step(g, DT, bot(g)); ev.length = 0; S.drainEvents(g, ev);
            for (const e of ev) { if (e.type === 'point') pts++; else if (e.type === 'hit' && e.team === 0 && e.touch === 2) { sec0++; if (e.human) secH++; } }
            if (i % 120 === 0) for (const p of g.players) if (!Number.isFinite(p.x + p.y + p.z)) nan++;
          }
        }
      } catch (e) { ex = e && e.stack || String(e); }
      const VB6 = VB.AI6, sd0 = S.side(0), got = {}, NL = 200, jget = {}, jn = {}, jdead = { n: 0, pipe: 0 }, NJ = 10;
      let laneOk = 0, laneN = 0, exL = null;
      try {
        // laneOf: stick (mundo) → carril local; |stick| < 0,4 → null; a igualdad manda el lateral. El equipo 1 con el stick en espejo da lo mismo
        const LANE_IN = [[0, -1, 'left'], [0, 1, 'right'], [-1, 0, 'mid'], [1, 0, 'back'], [0.2, 0.2, null], [-0.5, -0.5, 'left'], [0.5, 0.3, 'back'], [-0.3, 0.6, 'right']];
        const g = S.createGame({ format: '6v6', seed: 1, ctrl: 'one', ctrlRole: 'S' }), st = g.ctrl, q1 = g.teams[1][0];
        for (const [mx, my, want] of LANE_IN) { laneN += 2; if (VB6.laneOf(g, st, sd0 * mx, sd0 * my) === want) laneOk++; if (VB6.laneOf(g, q1, -sd0 * mx, -sd0 * my) === want) laneOk++; }
        const TEMPO = { left: 'high', right: 'shoot', mid: 'quick', back: 'pipe' }, ROLE_L = { left: 'OH', right: 'OPP', mid: 'MB', back: 'OH' };
        for (const lane of ['left', 'right', 'mid', 'back']) {
          got[lane] = 0;
          for (let n = 0; n < NL; n++) {
            const h = S.createGame({ format: '6v6', seed: 700 + n, ctrl: 'one', ctrlRole: 'S' }), hs = h.ctrl;
            if (lane === 'back') { S.rotate(h, 0); S.rotate(h, 0); S.applyLibero(h); } // 2 rotaciones: OH1 en zona 6 (zaguero): candidato al pipe
            h._pq6 = [{ q: 0.9, t: h.time }, { q: 0, t: -9 }]; hs.x = sd0 * 0.9; hs.y = sd0 * 0.9; // en sistema: recepción buena y colocador en su punto
            VB6.chooseSet(h, hs, lane); const P = h.setPlan[0];
            if (P && P.tempo === TEMPO[lane] && P.to && P.to.role === ROLE_L[lane] && (lane === 'back' ? !P.to.front : P.to.front)) got[lane]++;
          }
        }
        // colocación en salto con carril por la sim entera (ver arriba). Devuelve {e, P} (evento hit del 2º toque y g.setPlan[0]) o null si
        // el punto acaba antes (saque fallado, ace…). En la rotación inicial el colocador tiene los 4 carriles: OH1 en 2, MB1 en 3, OPP en 4
        // y OH2 en 5 (zaguero: pipe)
        const LANE_V = { left: [0, -1], right: [0, 1], mid: [-1, 0], back: [1, 0] };
        const jsetLane = (seed, lane, len) => {
          const h = S.createGame({ format: '6v6', seed, difficulty: 'normal', ctrl: 'one', ctrlRole: 'S', serveClock: false }), hs = h.ctrl;
          h.serving = 1; S._setupServe(h); S.drainEvents(h);
          const inp = { move: [LANE_V[lane][0] * sd0 * len, LANE_V[lane][1] * sd0 * len], hit: false, jump: false, jset: false, switchPlayer: false };
          let passed = false, nP = 0; const N6 = { move: [0, 0], hit: false, jump: false, jset: false, switchPlayer: false };
          for (let i = 0; i < 120 * 12; i++) {
            inp.jump = inp.jset = false;
            if (passed) nP++;
            if (passed) {
              if (hs.z === 0 && hs.vz === 0) { hs.x = h.pr3.x; hs.y = h.pr3.y; if (h.pr3.t > 0 && h.pr3.t <= 0.46) inp.jump = true; }
              else if (hs.z > 0.2 && hs.actionT > 0.12) inp.jset = true;
            }
            // (C2: el primer paso de la ventana sin dirección: si no, es arrastre. Revisión C2: el bot salta en pr3, a ~1,3 m del aro amarillo,
          //  así que la dirección del suelo es movimiento (arrastre); suelta al despegar y la vuelve a pulsar en el aire, donde ya apunta)
          const jIn = inp.jump ? { move: [0, 0], hit: false, jump: true, jset: false, switchPlayer: false } : inp;
          S.step(h, DT, passed ? (nP <= 1 && !inp.jump && !inp.jset ? N6 : jIn) : null);
            for (const e of S.drainEvents(h)) {
              if (e.type === 'point' || e.type === 'serveReady') return null;
              if (!passed && e.type === 'hit' && e.team === 0 && e.touch === 1) {
                passed = true; const b = h.ball, T = 1.1, zt = 3.1;
                b.vx = (sd0 * 0.9 - b.x) / T; b.vy = (sd0 * 0.9 - b.y) / T; b.vz = (zt - b.z + 0.5 * C.G * T * T) / T; b.dip = 0; b.spin = 0; b.wobA = 0;
                const pq6 = h._pq6 || (h._pq6 = [{ q: 0, t: -9 }, { q: 0, t: -9 }]); pq6[0].q = 0.9; pq6[0].t = h.time; // (EFFORT: si el pase salió desviado, passTarget no lo creó)
              } else if (passed && e.type === 'hit' && e.team === 0 && e.touch === 2) return { e, P: h.setPlan[0] };
            }
          }
          return null;
        };
        for (const lane of ['left', 'right', 'mid', 'back']) {
          jget[lane] = 0; jn[lane] = 0;
          for (let n = 0; n < NJ; n++) {
            const r = jsetLane(700 + n, lane, 1); if (!r) continue; jn[lane]++;
            const P = r.P;
            if (r.e.human && r.e.jset && r.e.shot === 'jump' && P && P.tempo === TEMPO[lane] && P.to && P.to.role === ROLE_L[lane] && (lane === 'back' ? !P.to.front && P.d >= 3.3 : P.to.front)) jget[lane]++;
          }
        }
        // (C2) stick a 0,3: zona muerta (0,6) = sin dirección = alta a la 4 (receptor delantero)
        for (let n = 0; n < NJ; n++) { const r = jsetLane(700 + n, 'back', 0.3); if (!r) continue; jdead.n++; if (r.e.human && r.e.jset && r.P && r.P.tempo === 'high' && r.P.to && r.P.to.role === 'OH' && r.P.to.front) jdead.pipe++; }
      } catch (e) { exL = e && e.stack || String(e); }
      const jOk = ['left', 'right', 'mid', 'back'].every(l => jn[l] >= 5 && jget[l] === jn[l]) && jdead.n >= 5 && jdead.pipe === jdead.n;
      res.push(['(j) colocador humano: >= 60 % de los 2.os toques de su equipo son suyos; laneOf y chooseSet(g, p, lane) eligen el carril pedido; colocación en salto con carril (jset) por la sim; stick a 0,3 = alta a la 4 (C2)',
        !ex && !exL && !nan && sec0 > 20 && secH / sec0 >= 0.6 && laneOk === laneN && ['left', 'right', 'mid', 'back'].every(l => got[l] >= 0.98 * NL) && jOk,
        { segundosToques: sec0, suyos: pct(secH, sec0), puntos: pts, laneOf: laneOk + '/' + laneN, carril: got, jsetCarril: ['left', 'right', 'mid', 'back'].map(l => l + ' ' + jget[l] + '/' + jn[l]).join(', '), stick03atras: 'alta a la 4 ' + jdead.pipe + '/' + jdead.n, ex: ex || exL }]);
    }
    { // (k) 6 formaciones de recepción del 5-1 (D6): en cada rotación × 2 equipos, con el rival sacando (placeServe tras applyLibero, como
      // setupServe), 0 solapamientos en los dos equipos (overlapCount), los 3 receptores (L + los 2 OH) en línea a d >= 5 y el colocador
      // escondido, nunca ENTRE los receptores: o al menos 1 m más cerca de la red que el receptor más adelantado (delantero en la red,
      // zaguero penetrando detrás de su delantero), o fuera del abanico lateral de los 3 (con el colocador en zona 1 el receptor delantero
      // está en zona 2 y la legalidad le obliga a quedarse detrás: FORM.RECV le esconde en la esquina del fondo, 1 m más al lado)
      let legal = 0, recvOk = 0, setOk = 0, n = 0, ex = null; const detail = [];
      try {
        for (let t = 0; t < 2; t++) for (let r = 0; r < 6; r++) {
          const g = S.createGame({ format: '6v6', seed: 1000 + r, ctrl: 'one' }), o = 1 - t;
          for (let k = 0; k < r; k++) S.rotate(g, t);
          g.serving = o; S.applyLibero(g);
          const sv = S.serverOf(g, o); g.mode = 'serve'; g.server = sv;
          VB.AI6.placeServe(g, o, sv); n++;
          const ov = S.overlapCount(g, t) + S.overlapCount(g, o); if (ov === 0) legal++;
          const sd = S.side(t), rec = g.teams[t].filter(p => p.role === 'L' || p.role === 'OH'), st = VB.AI6.setterOf(g, t);
          const dMin = rec.length ? Math.min(...rec.map(p => p.x * sd)) : 0, dSet = st ? st.x * sd : 99;
          const yMax = rec.length ? Math.max(...rec.map(p => Math.abs(p.y * sd))) : 0, ySet = st ? Math.abs(st.y * sd) : 0;
          if (rec.length === 3 && dMin >= 5) recvOk++;
          if (dSet <= dMin - 1 || ySet >= yMax + 0.5) setOk++;
          detail.push('e' + t + 'r' + r + ' ' + ov + '/' + dMin.toFixed(1) + '/' + dSet.toFixed(1) + (dSet > dMin - 1 ? '(lado ' + ySet.toFixed(1) + '>' + yMax.toFixed(1) + ')' : ''));
        }
      } catch (e) { ex = e && e.stack || String(e); }
      res.push(['(k) 6 formaciones de recepción legales × 2 equipos: 0 solapamientos, 3 receptores (L + 2 OH) a d >= 5 y el colocador nunca entre ellos',
        !ex && n === 12 && legal === 12 && recvOk === 12 && setOk === 12, { legales: legal + '/12', receptores: recvOk + '/12', colocador: setOk + '/12', 'solapes/dReceptores/dColocador': detail.join(', '), ex }]);
    }
    { // (m) falta de posición del humano (D4): en Difícil el humano que no saca puede moverse durante el saque rival; el receptor zaguero
      // empujado hacia la red (equipo 0 juega en x > 0: delante = x menor) hasta pasar a su delantero → al golpe de saque, punto para el
      // rival con reason 'position' («Falta de posición», señal ya existente). Desde el 17-nov-2026 también en Fácil (posRule6 en todos
      // los niveles): el mismo stick le mueve y se pita. La IA sigue con 0 solapamientos en los dos partidos. Se le da al sacador rival 3 s de ritual
      // para que el humano llegue (hasta 5 m si su delantero está en la red)
      const FB6 = { 1: 2, 6: 3, 5: 4 }, PUSH = { move: [-1, 0], hit: false, jump: false, switchPlayer: false }, out = {};
      for (const df of ['hard', 'easy']) {
        const o = { encontrado: false, movido: 0, solapados: -1, motivo: '', equipo: -1, texto: '', iaSolapada: -1 };
        try {
          const g = S.createGame({ format: '6v6', seed: 990, difficulty: df, ctrl: 'one', stats: true });
          let found = false; // hasta un saque rival con el humano zaguero (su equipo ya ha rotado), antes del silbato
          for (let i = 0; i < 12 * 60 * 120 && !found; i++) { S.step(g, DT, null); S.drainEvents(g); found = g.mode === 'serve' && g.serving === 1 && g.serveState === 'ready' && !g.ctrl.front && !g.serveAuth; }
          o.encontrado = found;
          if (found) {
            const h = g.ctrl, fr = S.onCourt(g, 0, FB6[h.zone]), x0 = h.x, y0 = h.y;
            g.timer = Math.max(g.timer, 3);
            for (let i = 0; i < 300 && g.mode === 'serve' && h.x > fr.x - 0.3; i++) { S.step(g, DT, PUSH); S.drainEvents(g); }
            o.movido = +Math.hypot(h.x - x0, h.y - y0).toFixed(2); o.solapados = S.overlapCount(g, 0);
            const pt = stepUntil(g, 'point', 4000).find(e => e.type === 'point');
            if (pt) { o.motivo = pt.reason; o.equipo = pt.team; o.texto = pt.text; o.senal = pt.signal; o.infractor = pt.faultTeam;
              // players = [humano, su compañero del par solapado (el delantero de su fila)] para que el 2º señale a los dos
              o.jugadores = pt.players ? pt.players.map(q => q === h ? 'h' : q === fr ? 'del' : q && q.id).join(',') : ''; }
          }
          o.iaSolapada = g.stats.overlap[1];
        } catch (e) { o.ex = e && e.stack || String(e); }
        out[df] = o;
      }
      // reglas 2025 (7.4): con su equipo SACANDO, el humano solapado no comete falta (solo se cuenta en g.overlap / stats.overlap)
      const sv = { encontrado: false, movido: 0, solapados: -1, motivo: '', contado: 0 };
      try {
        const g = S.createGame({ format: '6v6', seed: 990, difficulty: 'hard', ctrl: 'one', stats: true });
        let found = false;
        for (let i = 0; i < 12 * 60 * 120 && !found; i++) { S.step(g, DT, null); S.drainEvents(g); found = g.mode === 'serve' && g.serving === 0 && g.serveState === 'ready' && !g.ctrl.front && g.ctrl !== g.server && !g.serveAuth; }
        sv.encontrado = found;
        if (found) {
          const h = g.ctrl, fr = S.onCourt(g, 0, FB6[h.zone]), x0 = h.x, y0 = h.y, c0 = g.stats.overlap[0];
          g.timer = Math.max(g.timer, 3);
          for (let i = 0; i < 300 && g.mode === 'serve' && h.x > fr.x - 0.3; i++) { S.step(g, DT, PUSH); S.drainEvents(g); }
          sv.movido = +Math.hypot(h.x - x0, h.y - y0).toFixed(2); sv.solapados = S.overlapCount(g, 0);
          for (let i = 0; i < 4000 && g.lastKind !== 'serve' && g.mode !== 'point'; i++) { S.step(g, DT, PUSH); const ev = S.drainEvents(g), pt = ev.find(e => e.type === 'point'); if (pt) sv.motivo = pt.reason; }
          const pt = stepUntil(g, 'point', 4000).find(e => e.type === 'point'); if (pt && !sv.motivo) sv.motivo = pt.reason;
          sv.contado = g.stats.overlap[0] - c0;
        }
      } catch (e) { sv.ex = e && e.stack || String(e); }
      out.sacando = sv;
      const H = out.hard, E = out.easy;
      const ok1 = o => o.encontrado && o.movido > 0.3 && o.solapados > 0 && o.motivo === 'position' && o.equipo === 1 && o.texto === 'Falta de posición' && o.iaSolapada === 0 &&
        o.infractor === 0 && o.jugadores === 'h,del' && !o.ex;
      const okS = sv.encontrado && sv.movido > 0.3 && sv.solapados > 0 && sv.motivo !== 'position' && sv.contado === 1 && !sv.ex;
      res.push(['(m) falta de posición: el receptor zaguero movido delante de su delantero → punto rival por position (players = él y su delantero), en Difícil y en Fácil (17-nov); IA 0 solapamientos; sacando su equipo, sin falta (7.4 de 2025) pero contada',
        ok1(H) && ok1(E) && okS, out]);
    }
    { // (n) bloqueo activo y overpass (revisión del 12-nov): el humano en la red (colocador) que pulsa GOLPEAR en el aire ante un pase
      // rival que se pasa de campo, aún a 0,8 m en el campo rival, hace un golpe normal (swing), nunca toque de red ni pulsación de bloqueo.
      // VB.Sim.blockPressCase: false con el overpass y con el saque que viene; true con el rival construyendo (balón que se aleja)
      const HIT = { move: [0, 0], hit: true, jump: false, switchPlayer: false }, o = { casos: 0, swing: 0, red: 0, pulsa: 0, casoSet: 0, casoSaque: 0 };
      try {
        for (let sd = 0; sd < 40; sd++) {
          const g = S.createGame({ format: '6v6', seed: 3100 + sd, difficulty: 'normal', ctrl: 'one' });
          S.setCtrlRole(g, 'S');
          for (let i = 0; i < 60 * 120 && g.mode !== 'rally'; i++) { S.step(g, DT, null); S.drainEvents(g); }
          if (g.mode !== 'rally') continue;
          const h = g.ctrl, b = g.ball; o.casos++;
          h.x = 0.5; h.y = 0; h.z = 0.6; h.vz = 0; h.swing = null;
          g.touchTeam = 1; g.touches = 1; g.lastKind = 'pass'; b.held = false; b.x = -0.8; b.y = 0; b.z = 3; b.vx = 3; b.vy = 0; b.vz = 0;
          const c1 = S.blockPressCase(g, h); g.lastKind = 'serve'; g.touches = 3; const c2 = S.blockPressCase(g, h);
          g.lastKind = 'set'; g.touches = 2; b.vx = -1; b.x = -2; if (S.blockPressCase(g, h)) o.casoSet++;
          g.lastKind = 'pass'; g.touches = 1; b.x = -0.8; b.vx = 3; if (!c1 && !c2) o.casoSaque++;
          S.step(g, DT, HIT); const ev = S.drainEvents(g);
          if (ev.some(e => e.type === 'swing')) o.swing++;
          if (ev.some(e => e.type === 'netTouch' || (e.type === 'point' && e.reason === 'net'))) o.red++;
          if (ev.some(e => e.type === 'blockPress')) o.pulsa++;
        }
      } catch (e) { o.ex = e && e.stack || String(e); }
      res.push(['(n) bloqueo activo: GOLPEAR en el aire ante un overpass a 0,8 m = golpe normal (swing), sin red ni pulsación; blockPressCase sí con el rival colocando, no con el saque',
        o.casos >= 30 && o.swing === o.casos && o.red === 0 && o.pulsa === 0 && o.casoSet === o.casos && o.casoSaque === o.casos && !o.ex, o]);
    }
    const bad = res.filter(r => !r[1]);
    if (bad.length) fail('6v6 con humano: ' + bad.map(r => r[0] + ' ' + JSON.stringify(r[2])).join('; '));
    console.log('\n6v6 con humano (sin movimientos solos, ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s)' + (failures === f0 ? ' OK' : '') + '\n  ' + res.map(r => r[0] + ' ' + JSON.stringify(r[2])).join('\n  '));
  }

  // VÓLEY PLAYA (createGame({venue:'beach'}), 10-nov-2026): pista 16×8, sets a 21 / 15, cambio de campo cada 7 (5 en el 3.º),
  // bloqueo que cuenta como toque, pokey, dobles de dedos; y que la IA juegue creíble en la pista pequeña
  if (ONLY !== 'matrix') {
    const f0 = failures, res = [], t0 = Date.now();
    const gb = S.createGame({ seed: 7, venue: 'beach' }), gh = S.createGame({ seed: 7 }), g6 = S.createGame({ seed: 7, venue: 'beach', format: '6v6' });
    res.push(['(a) flag y pista: playa 16×8 a 21, pabellón 18×9 intacto, 6v6 sin playa', gb.beach && gb.venue === 'beach' && gb.HL === 8 && gb.HW === 4 &&
      Math.abs(gb.cs - 8 / 9) < 1e-12 && gb.points === 21 && !gh.beach && gh.HL === 9 && gh.HW === 4.5 && gh.cs === 1 && gh.points === 25 && !g6.beach && g6.HL === 9 &&
      S.court(gb) === S.court('beach') && S.court('beach').HL === 8 && S.court(gh).HW === 4.5 && S.court().HL === 9 &&
      S.createGame({ seed: 7, venue: 'beach', points: 11 }).points === 21, { HL: gb.HL, HW: gb.HW, points: gb.points }]);
    // (b) líneas: botes que el pabellón da dentro y la playa fuera (más de 8 m de fondo / 4 m de lateral), sin error arbitral posible
    const landAt = (venue, x, y) => {
      const g = S.createGame({ seed: 11, venue, ritual: false }); S.drainEvents(g);
      g.touchTeam = 0; g.touches = 3; g.lastTeam = 0; g.lastKind = 'spike'; g.lastShot = 'power'; g.lastPlayer = g.teams[0][0];
      for (const p of g.players) { p.x = S.side(p.team) * 12; p.y = 5.9; } // lejos: nadie la toca
      rallyAt(g, { x, y, z: 0.5, vz: -2 });
      const ev = stepUntil(g, 'land', 300).find(e => e.type === 'land'); return ev ? ev.inside : null;
    };
    const lines = { fondo85: [landAt('hall', -8.5, 0), landAt('beach', -8.5, 0)], lado43: [landAt('hall', -4, 4.35), landAt('beach', -4, 4.35)], // (4,35: la huella, radio C.BR, queda a 14 cm, fuera de la banda de error B1)
      dentro: [landAt('beach', -7.6, 3.6)], fondo2: [landAt('beach', 8.4, -1)] };
    res.push(['(b) balón fuera más allá de 8 m de fondo y 4 m de lateral (en el pabellón, dentro)', lines.fondo85[0] === true && lines.fondo85[1] === false &&
      lines.lado43[0] === true && lines.lado43[1] === false && lines.dentro[0] === true && lines.fondo2[0] === false, lines]);
    // partidos CPU contra CPU (demo) y autopilot contra Normal en la playa
    const NB = 8; let pts = 0, so = 0, hits = 0, done = 0, swaps = 0, swapBad = 0, setBad = 0, setsN = 0, nan = 0, ex = null, rallies = [];
    let blkTouch = 0, blkTouchBad = 0, pokey = 0, tipsB = 0, dbl = 0, outB = 0, deep = 0, srvSpot = 0, srvN = 0;
    try {
      for (let s = 0; s < NB; s++) {
        const g = S.createGame(s % 2 ? { seed: 900 + s, venue: 'beach', autopilot: true, difficulty: 'normal', stats: true } : { seed: 900 + s, venue: 'beach', demo: true, stats: true });
        S.drainEvents(g); let tot = 0;
        for (let i = 0; i < 120 * 60 * 60 && g.mode !== 'over'; i++) {
          S.step(g, DT, null);
          for (const e of S.drainEvents(g)) {
            if (e.type === 'point') { pts++; tot = e.score[0] + e.score[1]; if (e.sideout) so++; hits += e.rallyHits; rallies.push(e.rallyTime);
              if (e.reason === 'double' && e.text === 'Dobles en la colocación de dedos') dbl++; if (e.reason === 'out') outB++; }
            if (e.type === 'courtChange' && e.why === 'swap') { swaps++; const sum = e.score[0] + e.score[1], ev2 = e.setNo === 3 ? 5 : 7;
              if (sum % ev2 || e.every !== ev2 || Math.max(e.score[0], e.score[1]) >= S.setTarget(g) && Math.abs(e.score[0] - e.score[1]) >= 2) swapBad++; }
            if (e.type === 'courtChange' && e.why === 'eight') swapBad++; // el cambio a los 8 es del pabellón
            if (e.type === 'set') { setsN++; const a = e.score[0], b = e.score[1], tg = e.setNo === 3 ? 15 : 21, w = Math.max(a, b), l = Math.min(a, b);
              if (w < tg || w - l < 2 || (w > tg && w - l !== 2)) setBad++; }
            if (e.type === 'block' && (e.result === 'soft' || e.result === 'touch')) { blkTouch++; if (g.touches !== 1 || g.touchTeam !== e.team) blkTouchBad++; }
            if (e.type === 'hit' && e.shot === 'tip') { tipsB++; if (e.pokey) pokey++; }
            if (e.type === 'hit' && e.kind === 'serve' && e.target) { srvN++; if (Math.abs(e.target[0]) <= 8 && Math.abs(e.target[1]) <= 4) srvSpot++; }
            if (e.type === 'land' && Math.abs(e.x) > 8.6) deep++;
          }
          if (i % 240 === 0) for (const p of g.players) if (!Number.isFinite(p.x + p.y + p.z)) nan++;
        }
        if (g.mode === 'over') done++;
      }
    } catch (e) { ex = e && e.stack || String(e); }
    rallies.sort((a, b) => a - b);
    const sidePct = pts ? 100 * so / pts : 0, med = rallies.length ? rallies[rallies.length >> 1] : 0;
    res.push(['(c) partidos completos sin excepciones ni NaN', !ex && !nan && done === NB && pts > 400, { partidos: done + '/' + NB, puntos: pts, nan, ex }]);
    res.push(['(d) sets a 21 y el 3.º a 15 (mejor de 3), por 2', setBad === 0 && setsN >= 2 * NB, { sets: setsN, mal: setBad }]);
    res.push(['(e) cambio de campo cada 7 (cada 5 en el 3.º), nunca a los 8', swapBad === 0 && swaps >= 3 * NB, { cambios: swaps, mal: swapBad }]);
    res.push(['(f) el toque de bloqueo cuenta como toque (quedan 2)', blkTouch > 10 && blkTouchBad === 0, { toquesBloqueo: blkTouch, mal: blkTouchBad }]);
    res.push(['(g) dejadas de la playa = pokey (nudillos)', tipsB > 0 && pokey === tipsB, { dejadas: tipsB, pokey }]);
    res.push(['(h) IA creíble: side-out 52-70 %, 4-9 toques por rally, mediana 4-9 s', sidePct >= 52 && sidePct <= 70 && hits / pts >= 4 && hits / pts <= 9 && med >= 4 && med <= 9,
      { sideOut: sidePct.toFixed(1) + '%', toques: +(hits / pts).toFixed(2), mediana: +med.toFixed(2) }]);
    res.push(['(i) la IA saca y juega a la pista pequeña: dianas de saque dentro de 16×8, pocos fuera, botes muy largos como en el pabellón (~12-14 %)', srvN > 200 && srvSpot / srvN > 0.97 &&
      outB / pts < 0.3 && deep / pts < 0.18 && dbl / pts < 0.03, { saques: srvN, dianaDentro: pct(srvSpot, srvN), fuera: pct(outB, pts), botesLargos: pct(deep, pts), dobles: dbl }]);
    // (j) ritual de saque de la CPU en la arena (12-nov-2026): sin botes contra el suelo; un `juggle` por toquecito (tantos como
    // ritual.bounces), el balón siempre por encima de 0,9 m y el lanzamiento a la misma hora que con el bote del pabellón
    const rj = { serves: 0, jug: 0, drib: 0, low: 0, late: 0, cnt: 0, minZ: 9 };
    for (let s = 0; s < 3; s++) {
      const g = S.createGame(s === 1 ? { seed: 950 + s, venue: 'beach', demo: true } : { seed: 950 + s, venue: 'beach', autopilot: true, difficulty: 'hard' }); S.drainEvents(g);
      let cur = null;
      for (let i = 0; i < 120 * 240 && g.mode !== 'over'; i++) {
        S.step(g, DT, null);
        for (const e of S.drainEvents(g)) {
          if (e.type === 'serveReady') cur = g.ritual.on ? { t0: e.t, n: 0, b: g.ritual.bounces, dur: g.ritual.dur } : null;
          if (e.type === 'dribble') rj.drib++;
          if (e.type === 'juggle') { rj.jug++; if (cur) cur.n++; }
          if (e.type === 'toss' && cur) { rj.serves++; if (Math.abs(e.t - cur.t0 - Math.min(VB.RITUAL.tossBy, g.whistleAt + cur.dur)) > 1.5 * DT) rj.late++; if (cur.n !== cur.b) rj.cnt++; cur = null; }
        }
        if (cur && g.mode === 'serve' && g.serveState === 'ready' && g.ritual.on) { const z = g.ball.z - g.server.z; if (z < rj.minZ) rj.minZ = z; if (z < 0.9) rj.low++; }
      }
    }
    rj.minZ = +rj.minZ.toFixed(3);
    res.push(['(j) saque de la CPU en la arena sin bote: toquecitos `juggle`, nunca `dribble`, balón alto y misma hora de lanzamiento', rj.serves > 20 && rj.drib === 0 &&
      rj.jug > 0 && rj.low === 0 && rj.late === 0 && rj.cnt === 0, rj]);
    // (k) dobles en la colocación de dedos del HUMANO en la playa (Ferran, 12-nov-2026): según lo malo que sea el timing, más en salto;
    // nunca con nota perfect/good ni en el pabellón. Azar hash01: la cuenta de g.rng no cambia
    { const setAt = (seed, te, jump, venue) => {
        const g = S.createGame({ seed, ctrl: 'one', venue, demo: false }), h = g.teams[0][0], m = g.teams[0][1];
        S.drainEvents(g); g.time = 3 + seed * 0.37;
        rallyAt(g, { x: 1.6, y: 0, z: 3.2, vz: -1 }); h.x = 1.6; h.y = 0; h.z = jump ? 0.9 : 0; g.touchTeam = 0; g.touches = 1; g.lastPlayer = m; g.lastKind = 'pass'; g.ctrl = h;
        S._hit(g, h, null, te, jump ? 'jset' : '');
        const ev = S.drainEvents(g), pt = ev.find(e => e.type === 'point'), hv = ev.find(e => e.type === 'hit');
        return { dbl: !!(pt && pt.reason === 'double' && pt.text === 'Dobles en la colocación de dedos'), grade: hv && hv.grade, jset: hv && hv.jset };
      };
      const rate = (te, jump, venue, N) => { let d = 0, gd = 0; for (let s = 1; s <= N; s++) { const r = setAt(s, (s % 2 ? 1 : -1) * te, jump, venue); if (r.dbl) d++; else if (r.grade !== 'poor') gd++; } return { p: d / N, okGrades: gd }; };
      const N = 400, tab = {}, ok = [];
      for (const jump of [false, true]) for (const te of [0, 0.06, 0.09, 0.13, 0.2, 0.3]) { const r = rate(te, jump, 'beach', N); tab[(jump ? 'salto ' : 'suelo ') + te] = +(100 * r.p).toFixed(1); }
      const hall = [rate(0.3, false, 'hall', 200).p, rate(0.3, true, 'hall', 200).p];
      // perfect/good nunca; poor crece con |te|; en salto más que en el suelo; pabellón 0
      ok.push(tab['suelo 0'] === 0 && tab['suelo 0.06'] === 0 && tab['suelo 0.09'] === 0 && tab['salto 0'] === 0 && tab['salto 0.06'] === 0 && tab['salto 0.09'] === 0);
      ok.push(tab['suelo 0.13'] > 4 && tab['suelo 0.2'] > tab['suelo 0.13'] && tab['suelo 0.3'] > tab['suelo 0.2'] && tab['suelo 0.3'] < 55);
      ok.push(tab['salto 0.13'] > tab['suelo 0.13'] && tab['salto 0.2'] > tab['suelo 0.2'] && tab['salto 0.3'] < 75);
      ok.push(hall[0] === 0 && hall[1] === 0);
      // una colocación buena o perfecta nunca, con cualquier |te| de la ventana buena: barrido fino
      let goodDbl = 0; for (let s = 1; s <= 600; s++) { const te = ((s * 0.618034) % 1) * 0.4, r = setAt(s, te, s % 2 === 0, 'beach'); if (r.dbl && Math.abs(te) * (s % 2 === 0 ? VB.JSET.win : 1) <= C.W_GOOD) goodDbl++; }
      ok.push(goodDbl === 0 && S.dblSetP(0.05, 'good', true) === 0 && S.dblSetP(0.4, 'perfect', false) === 0 && S.dblSetP(0.2, 'poor', true) > S.dblSetP(0.2, 'poor', false));
      res.push(['(k) dobles del humano en la colocación de dedos según el timing (% por |te|; salto > suelo; perfect/good y pabellón 0)', ok.every(Boolean), { pct: tab, pabellon: hall, okMal: ok.map(Number).join('') }]); }
    const bad = res.filter(r => !r[1]);
    if (bad.length) fail('vóley playa: ' + bad.map(r => r[0] + ' ' + JSON.stringify(r[2])).join('; '));
    console.log('\nVóley playa (' + NB + ' partidos, ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s)' + (failures === f0 ? ' OK' : '') + '\n  ' + res.map(r => r[0] + ' ' + JSON.stringify(r[2])).join('\n  '));
  }

  // PARTIDO A UN SOLO SET (P1 de notes/pruebas-entrenos-spec.md, la prueba de la Carrera): createGame({sets:1, points:15}).
  // Sin la opción, g.toWin no existe (al mejor de 3, huella intacta); con ella, un set a 15 también en la playa, y el partido acaba
  // 1-0 o 0-1 sin 3r set, sin cambio a los 8 y con el punto de set como punto de partido
  if (ONLY !== 'matrix') {
    const f0 = failures, res = [], t0 = Date.now();
    const pb = (o) => S.createGame(Object.assign({ seed: 7 }, o));
    res.push(['(a) opciones: sin sets no hay toWin (playa a 21 siempre); con sets 1, toWin 1 y 11/15 también en la playa',
      !('toWin' in pb({})) && !('toWin' in pb({ venue: 'beach' })) && !('toWin' in pb({ format: '6v6' })) && !('toWin' in pb({ sets: 3 })) &&
      pb({ venue: 'beach', points: 15 }).points === 21 && pb({ venue: 'beach', sets: 1, points: 15 }).toWin === 1 &&
      pb({ venue: 'beach', sets: 1, points: 15 }).points === 15 && pb({ venue: 'beach', sets: 1, points: 11 }).points === 11 &&
      pb({ venue: 'beach', sets: 1 }).points === 21 && pb({ venue: 'beach', sets: 1, points: 13 }).points === 21 &&
      pb({ sets: 1, points: 15 }).points === 15 && pb({ sets: 1 }).points === 25 && pb({ format: '6v6', sets: 1, points: 15 }).toWin === 1, {}]);
    // (b) partidos enteros: playa (demo y autopilot), pabellón 2v2 y 6v6 (demo)
    const CASES = [['playa demo', { venue: 'beach', demo: true }], ['playa autopilot', { venue: 'beach', autopilot: true, difficulty: 'normal' }],
      ['pabellón demo', { demo: true }], ['6v6 demo', { format: '6v6', demo: true }]];
    const out = {}; let ex = null;
    try {
      for (const [tag, o] of CASES) for (let s = 0; s < 3; s++) {
        const g = S.createGame(Object.assign({ seed: 1300 + s, sets: 1, points: 15 }, o)); S.drainEvents(g);
        const r = out[tag] = out[tag] || { n: 0, ok: 0, mal: [] };
        let sets = 0, matchN = 0, over = null, mpBad = 0, eight = 0, newSet = 0, mp = -1, setTo = 0;
        for (let i = 0; i < 120 * 60 * 40 && !over; i++) {
          S.step(g, DT, null);
          for (const e of S.drainEvents(g)) {
            if (e.type === 'serveReady') { mp = e.matchPoint; if (e.setPoint !== e.matchPoint) mpBad++; }
            if (e.type === 'set') { sets++; setTo = Math.max(e.score[0], e.score[1]); }
            if (e.type === 'match') matchN++;
            if (e.type === 'newSet') newSet++;
            if (e.type === 'courtChange' && (e.why === 'eight' || e.why === 'set')) eight++;
            if (e.type === 'point' && e.matchWon && mp !== e.team) mpBad++;
            if (e.type === 'gameOver' || (o.demo && e.type === 'newMatch')) over = e;
          }
          if (o.demo && g.mode === 'over' && !over) over = { type: 'over', sets: g.sets.slice() };
        }
        r.n++;
        const sc = over && over.sets, fin = sc && ((sc[0] === 1 && sc[1] === 0) || (sc[0] === 0 && sc[1] === 1));
        if (fin && sets === 1 && matchN === 1 && newSet === 0 && eight === 0 && mpBad === 0 && setTo >= 15 && g.setNo === 1 && g.setScores.length === 1) r.ok++;
        else r.mal.push({ s, sets: sc, setEv: sets, match: matchN, newSet, cambio: eight, mpBad, setTo, setNo: g.setNo });
      }
    } catch (e) { ex = e && e.stack || String(e); }
    res.push(['(b) un set a 15 en playa, pabellón y 6v6: acaba 1-0 o 0-1 sin 3r set ni cambio a los 8, punto de set = punto de partido',
      !ex && CASES.every(c => out[c[0]] && out[c[0]].ok === out[c[0]].n && out[c[0]].n === 3), ex ? { ex } : out]);
    const bad = res.filter(r => !r[1]);
    if (bad.length) fail('partido a un set: ' + bad.map(r => r[0] + ' ' + JSON.stringify(r[2])).join('; '));
    console.log('\nPartido a un solo set (' + ((Date.now() - t0) / 1000).toFixed(1) + ' s)' + (failures === f0 ? ' OK' : '') + '\n  ' + res.map(r => r[0] + ' ' + JSON.stringify(r[2])).join('\n  '));
  }

  // MAESTRÍA (E1, sprint 5): createGame({mastery:true})
  if (ONLY !== 'matrix') e1Section();

  // COLOCAR POR DESTINO (C2, 15-nov-2026)
  if (ONLY !== 'matrix') colSection();
  // AJUSTES DE JUEGO (17-nov-2026: plancha, remates de la CPU en 6v6, colocador humano)
  if (ONLY !== 'matrix') j17Section();

  // GIMNASIO (E6, sprint 5): createGame({drill})
  if (ONLY !== 'matrix') gymSection();

  // REPETICIÓN (S3-C1): copyGame/stateHash, resim idéntica y sin interferencia
  if (ONLY !== 'matrix') replaySection();

  // Huella 2v2 (sprint 1 del 6v6): 150 partidas de referencia deben dar EXACTAMENTE lo mismo que tools/fp-2v2.json
  if (ONLY !== 'matrix') {
    console.log('\n== Huella 2v2 (tools/fingerprint6.js) ==');
    try { if (require('./fingerprint6.js').main() !== 0) fail('huella 2v2 distinta de tools/fp-2v2.json'); }
    catch (e) { fail('huella 2v2 excepción: ' + (e && e.stack || e)); }
  }

  console.log(failures ? `\n${failures} FALLOS` : '\nTODO OK');
  process.exit(failures ? 1 : 0);
}
if (isMainThread) main();
else parentPort.postMessage(runJob(workerData));
