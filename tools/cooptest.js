#!/usr/bin/env node
/* TAKE THE COURT — tools/cooptest.js (owner: carrera; sprint online-multi P7)
 * Prueba headless de la Carrera cooperativa de playa (js/career-coop.js, VB.CareerCoop) con localStorage falso y un lobby falso
 * (VB.NetLobby.coop: host/join/send/onMessage/close):
 *  1. sin usar el cooperativo no hay c.coop y matchSetup no cambia; ensure idempotente;
 *  2. adopt: p2 con los atributos del compañero de la IA, dorsal, misma persona = mismo p2, otra persona archiva y vuelve;
 *  3. opciones del partido (matchOpts): p2 en la plaza 1 del equipo 0, química del cooperativo, coop/noAmb/noZone, sin scout; la sim
 *     crea la partida online de varios con las dos plazas en el equipo 0;
 *  4. los dos libros de XP: eventos confirmados (feed) → matchDone del anfitrión: su XP y la de p2; química y forma del compañero de
 *     la IA intactas; c.last.coop;
 *  5. foto anfitrión → invitado (gzip) por el lobby falso: el localStorage del invitado (su propia Carrera) no cambia, la ve desde la
 *     memoria como protagonista, su copia de p2 en make-the-cut.coop.p2; puerta de intenciones; intención «up» aplicada por el anfitrión;
 *  5b. (L4) invitado: hoja «esperando la Carrera», estado del anfitrión (st: eligiendo / jugando sin ti) en su tarjeta de arriba, «Tu
 *     jugador», Resumen de la jornada de los dos tras matchDone (sum), copia de p2 al día, corte en la hoja final → «se ha cortado» y de
 *     vuelta a SU Carrera, sin escribir más que make-the-cut.coop.p2;
 *  5c. (L4) invitado SIN Carrera propia: entra, «Listo», su partido arranca, al cortarse se queda sin Carrera y con su p2 guardado;
 *  5d. (L4) insignias en un coop de verdad (Precisa-N de net4test, RTT 200 y 120 ms, 3 % de pérdida): las del anfitrión y de p2 que
 *     cierra matchDone = las de la partida de oro (offline con las entradas confirmadas); imprime lo que daba contar lo presentado;
 *  6. determinismo (dos contextos, mismos pasos → mismo c.coop y mismas opciones);
 *  7. NOEXT: con y sin career-coop.js, una carrera en piloto automático queda idéntica.
 * Uso: node tools/cooptest.js   Sale con 1 si algo falla; acaba en «TODO OK».
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const H = require('./storyhelp.js');
const ROOT = path.join(__dirname, '..');
const COOP = 'js/career-coop.js';
let fails = 0, passes = 0;
function ok(c, msg) { if (!c) { fails++; console.log('  FALLO: ' + msg); } else passes++; }
function section(t) { console.log('\n== ' + t); }

const EXT = H.extFiles();
if (EXT.indexOf(COOP) < 0) EXT.push(COOP);
/** Contexto nuevo con la Carrera, sus extensiones (career-coop incluida si coop) y un lobby falso. */
function boot(coop, seedLS) {
  const mem = Object.assign({}, seedLS || {}), writes = [];
  const LS = { getItem: k => (k in mem ? mem[k] : null), setItem: (k, v) => { writes.push(k); mem[k] = String(v); }, removeItem: k => { writes.push(k); delete mem[k]; } };
  const cx = { console, Math, Date, JSON, Set, localStorage: LS, CompressionStream, DecompressionStream, Blob, Response, btoa, atob, Uint8Array, Uint32Array, Promise };
  cx.globalThis = cx; cx.window = cx; vm.createContext(cx);
  const files = H.BASE.concat(H.STORY, EXT.filter(f => coop || f !== COOP));
  for (const f of files) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), cx, { filename: f });
  const VB = cx.VB; H.injOff(VB);
  const lob = { sent: [], held: [], fn: null, ready: null, closed: 0 };
  VB.NetLobby = { myName: () => 'Jugador', myLook: () => ({ kit: { kitShirt: 1 }, fits: [] }), saneLook: x => x,
    coop: { host(cfg) { lob.cfg = cfg; return true; }, join(cfg) { lob.cfg = cfg; return true; }, close() { lob.closed++; }, send(o) { lob.sent.push(JSON.parse(JSON.stringify(o))); }, onMessage(fn) { lob.fn = fn; return () => { lob.fn = null; }; } } };
  return { cx, VB, C: VB.Career, CC: VB.CareerCoop, mem, writes, lob };
}
function newCareer(B, seed, name) {
  const c = B.C.create({ mode: 'beach', name: name || 'Anfitriona', num: 7, role: 'atk', seed, now: 1 });
  B.C.acceptOffer(c.offers.findIndex(x => !x.trial), 2);
  return B.C.load();
}
const link = () => ({ state: 'open', q: [], poll() { const o = this.q; this.q = []; return o; }, send() { return true; }, info() { return { rtt: 20 }; } });

(async function main() {
  // ------------------------------------------------------------------ 1
  section('Sin cooperativo: nada cambia');
  const A = boot(true), A0 = boot(false);
  ok(A.CC && A.VB.CareerExt.some(x => x.id === 'coop'), 'VB.CareerCoop registrada en VB.CareerExt');
  let c = newCareer(A, 4242), c0 = newCareer(A0, 4242);
  ok(!('coop' in c), 'sin usar el cooperativo no hay c.coop');
  const ms = JSON.stringify(A.C.matchSetup(c)), ms0 = JSON.stringify(A0.C.matchSetup(c0));
  ok(ms === ms0, 'matchSetup igual con y sin career-coop.js');
  const o1 = A.CC.ensure(c), j1 = JSON.stringify(o1), j2 = JSON.stringify(A.CC.ensure(c));
  ok(o1 && o1.v === 1 && o1.p2 === null && j1 === j2, 'ensure crea c.coop vacío y es idempotente');
  ok(A.C.matchSetup(c).career.coop === undefined, 'con c.coop pero fuera del partido cooperativo, el compañero es el de la IA');
  delete c.coop; A.C.save(c);

  // ------------------------------------------------------------------ 2
  section('adopt: el jugador del invitado (p2)');
  c = A.C.load();
  const mate = JSON.parse(JSON.stringify(c.mate));
  let co = A.CC.adopt(c, { id: 'uidAna', name: 'Ana <b>', num: 7 }, 1000);
  ok(co.on && co.uid2 === 'uidAna' && co.p2 && co.p2.name === 'Ana b', 'p2 creado con el nombre saneado (' + (co.p2 && co.p2.name) + ')');
  ok(JSON.stringify(co.p2.st) === JSON.stringify(mate.st), 'p2 empieza con los atributos del compañero de la IA');
  ok(co.p2.lvl === 1 && co.p2.xp === 0 && co.p2.pts === 0 && co.p2.roleKey === mate.roleKey, 'p2 nivel 1, sin XP ni puntos, rol del compañero (' + co.p2.roleKey + ')');
  ok(co.p2.num !== c.player.num && co.p2.num >= 1 && co.p2.num <= 99, 'dorsal de p2 distinto del tuyo (pidió el 7, el tuyo: ' + co.p2.num + ')');
  co.p2.pts = 12; const keep = JSON.stringify(co.p2);
  co = A.CC.adopt(c, { id: 'uidAna', name: 'Ana', num: 3 }, 2000);
  ok(JSON.stringify(Object.assign({}, co.p2, { name: 'Ana b' })) === keep && co.p2.name === 'Ana', 'la misma persona recupera su p2 (y su nombre nuevo)');
  co = A.CC.adopt(c, { id: 'uidLuis', name: 'Luis', num: 22 }, 3000);
  ok(co.uid2 === 'uidLuis' && co.p2.pts === 0 && co.p2.num === 22 && co.old && co.old.uidAna && co.old.uidAna.p2.pts === 12, 'otra persona: p2 nuevo y el de Ana archivado');
  co = A.CC.adopt(c, { id: 'uidAna', name: 'Ana', num: 3 }, 4000);
  ok(co.uid2 === 'uidAna' && co.p2.pts === 12 && co.old.uidLuis && !co.old.uidAna, 'Ana vuelve: recupera su p2; Luis al archivo');
  ok(JSON.stringify(c.mate) === JSON.stringify(mate), 'el compañero de la IA no cambia (queda de reserva)');
  co.p2.pts = 0; A.C.save(c);

  // ------------------------------------------------------------------ 3
  section('Opciones del partido cooperativo');
  c = A.C.load();
  c.coop.chem = 65; A.C.save(c);
  const mo = A.CC.matchOpts({ seed: 99 });
  ok(mo && mo.opts && mo.humans.length === 2, 'matchOpts da opciones y dos plazas');
  const solo = A.C.matchSetup(c), p2 = c.coop.p2, CK = A.C.CHEM_KEYS;
  ok(mo.opts.coop === true && mo.opts.online === true && mo.opts.bestOf === 3 && mo.opts.points === 21 && mo.opts.venue === 'beach', 'online, coop, playa al mejor de 3 a 21');
  ok(A.C.KEYS.every(k => mo.opts.attrs[0][1][k] === Math.min(99, p2.st[k] + (CK.indexOf(k) >= 0 ? 2 : 0))), 'plaza 1 = atributos de p2 + química del cooperativo (+2)');
  ok(A.C.KEYS.every(k => mo.opts.attrs[0][0][k] === solo.attrs[0][0][k] - (CK.indexOf(k) >= 0 ? solo.chem - 2 : 0)), 'plaza 0 = los tuyos, con la química del cooperativo en vez de la del compañero de la IA');
  ok(JSON.stringify(mo.opts.attrs[1]) === JSON.stringify(solo.attrs[1]), 'rivales iguales que en el partido de siempre');
  ok(mo.cs.coop && mo.cs.noAmb && mo.cs.noZone && mo.cs.mate === p2.name && mo.cs.mateNum === p2.num, 'g.career: coop, sin ambiente ni zona, tu pareja = p2');
  ok(!('scout' in mo.opts) && !('zone' in mo.opts) && !('amb' in mo.opts), 'sin «Te tienen estudiado», zona ni ambiente');
  ok(mo.opts.nums[0][0] === c.player.num && mo.opts.nums[0][1] === p2.num, 'dorsales: el tuyo y el de p2');
  ok(mo.opts.teamLv[0].prof === 'mate' && mo.opts.teamLv[1].prof === solo.difficulty, 'perfil de la IA por equipo (rival: ' + solo.difficulty + ')');
  ok(mo.humans[0].look.kit.kitShirt === solo.kit.kitShirt && mo.humans[1].look.kit.kitShirt === solo.kit.kitShirt, 'las dos plazas con la equipación del club');
  ok(JSON.stringify(A.C.matchSetup(c)) === JSON.stringify(solo), 'matchSetup fuera del cooperativo sigue siendo el de siempre');
  const S = A.VB.Sim;
  const g = S.createGame(JSON.parse(JSON.stringify(mo.opts)));
  ok(g.mh && g.hum.length === 2 && g.hum[0].team === 0 && g.hum[1].team === 0 && g.hum[0].p === g.teams[0][0] && g.hum[1].p === g.teams[0][1], 'la sim: online de varios con las dos plazas en el equipo 0');

  // ------------------------------------------------------------------ 4
  section('Los dos libros de XP (eventos confirmados → matchDone del anfitrión)');
  c = A.C.load();
  const xp0 = { lvl: c.player.lvl, xp: c.player.xp, m: c.player.matches | 0 }, p2b = JSON.parse(JSON.stringify(c.coop.p2)), chemM = c.mate.chem, formM = c.mate.form, chemC = c.coop.chem, wk0 = c.week;
  A.C.abortMatch();
  const t0 = g.teams[0], t1 = g.teams[1], E = [];
  const kill = (pl, E) => E.push({ type: 'hit', team: 1, kind: 'serve', touch: 0, player: t1[0] }, { type: 'hit', team: 0, kind: 'pass', touch: 1, player: pl === t0[0] ? t0[1] : t0[0], grade: 'good' },
    { type: 'hit', team: 0, kind: 'spike', touch: 2, player: pl, grade: 'good', human: true }, { type: 'point', team: 0, how: 'kill', reason: 'in' });
  for (let i = 0; i < 6; i++) kill(t0[1], E);
  for (let i = 0; i < 3; i++) kill(t0[0], E);
  for (let i = 0; i < 2; i++) E.push({ type: 'hit', team: 0, kind: 'serve', touch: 0, player: t0[1], grade: 'good', human: true }, { type: 'point', team: 0, how: 'ace', reason: 'in' });
  const mt = { seat: 0, cs: mo.cs, gc: null, gw: null, done: false };
  // (L4: las insignias las cuenta feed con los eventos CONFIRMADOS; ui.js ya no las cuenta en el cooperativo)
  const bp0 = Object.assign({}, c.coop.p2.bp || {}), bpMe0 = Object.assign({}, c.player.bp || {});
  A.VB.Badges._reset();
  A.CC.feed(mt, g, E.slice(0, 10));
  A.CC.feed(mt, g, E.slice(10));
  const M = A.C.beach._M();
  ok(M && M.p[1].kills === 6 && M.p[1].aces === 2 && M.p[0].kills === 3, 'estadística por jugador: p2 6 remates y 2 aces, tú 3 remates');
  const g2 = Object.assign(Object.create(Object.getPrototypeOf(g)), g);   // (una vuelta reemplaza la partida canónica: la estadística sigue)
  A.CC.feed(mt, g2, [{ type: 'hit', team: 0, kind: 'spike', touch: 2, player: g2.teams[0][1], grade: 'good', human: true }, { type: 'point', team: 0, how: 'kill', reason: 'in' }]);
  ok(A.C.beach._M() === M && M.p[1].kills === 7, 'partida reemplazada (vuelta): la estadística sigue en el mismo partido');
  const sum = A.CC.feed(mt, g2, [{ type: 'gameOver', team: 0, sets: [2, 1], setScores: [[21, 18], [19, 21], [15, 12]] }]);
  c = A.C.load();
  ok(sum && mt.done && c.week === wk0 + 1, 'gameOver confirmado → matchDone: la jornada avanza (' + wk0 + ' → ' + c.week + ')');
  ok((c.player.matches | 0) === xp0.m + 1 && (c.player.lvl > xp0.lvl || c.player.xp > xp0.xp), 'tu XP sube (+' + sum.xp + ')');
  const pd = c.coop.p2;
  ok(pd.matches === (p2b.matches | 0) + 1 && (pd.lvl > p2b.lvl || pd.xp > p2b.xp), 'la XP de p2 sube (+' + (sum.coop && sum.coop.xp) + ')');
  const Kb = A.C.beach, D = Kb.CDIFF[Kb.diffOf(c)], Lg = Kb.league(Kb.myClub(c).lvl);
  const xpExp = Math.round((40 + 22 * sum.coop.nota + 40 + 6 * Math.min(9, 10)) * Lg.xp * D.xp * Kb.XP_K);
  ok(sum.coop && sum.coop.xp === xpExp && sum.coop.me.kills === 7 && sum.coop.me.aces === 2, 'XP de p2 con la fórmula de closeMine (' + xpExp + ') y sus números');
  ok(c.coop.stats2.played === 1 && c.coop.stats2.won === 1 && c.coop.stats2.kills === 7 && c.coop.notes2.length === 1, 'estadísticas de temporada de p2');
  ok(c.mate.chem === chemM && c.mate.form === formM, 'química y forma del compañero de la IA intactas (no ha jugado)');
  ok(c.coop.chem === chemC + 5 && !c.coop.pend && c.last.coop && c.last.coop.xp === sum.coop.xp, 'química del cooperativo +5; c.last.coop con el resumen de p2');
  ok(sum.me.kills === 3, 'tu nota y tus números son solo tuyos (3 remates)');
  // (6 remates de p2 en el 1r lote y 1 más tras la vuelta: el contador sigue en la vista nueva, no empieza de cero)
  ok((pd.bp.bombardero | 0) === (bp0.bombardero | 0) + 2 && (pd.bp.canon | 0) === (bp0.canon | 0) + 7, 'insignias de p2 (confirmadas): +2 bombardero (aces) y +7 cañón, también tras la vuelta (' + (pd.bp.bombardero | 0) + ', ' + (pd.bp.canon | 0) + ')');
  ok((c.player.bp.canon | 0) === (bpMe0.canon | 0) + 3, 'tus insignias: +3 cañón');
  ok((pd.bp.motor | 0) === (bp0.motor | 0) + 1 && (c.player.bp.motor | 0) === (bpMe0.motor | 0) + 1, 'un partido más para los dos (motor +1)');
  // Resumen de la jornada de los dos (b): el del anfitrión con su tabla y su barra; el del invitado, el de p2
  ok(mt.x && Array.isArray(mt.x.tbl) && mt.x.bar && mt.x.bar.need > 0 && mt.x.bar.cur === (c.player.xp | 0), 'anfitrión: datos de su Resumen (tabla y barra de nivel)');
  const gsum = mt.gsum;
  ok(gsum && gsum.t === 'sum' && gsum.sum.xp === sum.coop.xp && gsum.sum.nota === sum.coop.nota && gsum.sum.me.kills === 7, 'invitado: su Resumen con SU XP, nota y números');
  ok(gsum && gsum.cs.player === pd.name && gsum.cs.num === pd.num && gsum.cs.mate === c.player.name && gsum.cs.mateNum === c.player.num, 'invitado: él es el protagonista y el anfitrión su pareja');
  ok(gsum && gsum.sum.badges.every(b => b.slot === 0) && gsum.sum.badges.length === sum.badges.filter(b => b.slot === 1).length, 'invitado: solo sus insignias (' + (gsum && gsum.sum.badges.length) + ')');
  ok(gsum && !gsum.sum.life && !gsum.sum.train && !gsum.sum.coop && !('offers' in gsum.sum) && gsum.x && gsum.x.bar.cur === (pd.xp | 0), 'invitado: sin lo que es solo del anfitrión; barra de SU nivel');
  ok(gsum && gsum.rec && gsum.rec.p2 && gsum.rec.p2.xp === pd.xp && gsum.rec.cid === (c.seed >>> 0), 'invitado: la copia nueva de su p2 viaja con el Resumen');
  const before = JSON.stringify(A.C.load());
  A.CC.feed(mt, g2, [{ type: 'gameOver', team: 0, sets: [2, 1], setScores: [] }]);
  ok(JSON.stringify(A.C.load()) === before, 'un segundo gameOver no cierra otra jornada');

  // ------------------------------------------------------------------ 5
  section('Foto anfitrión → invitado (el localStorage del invitado no cambia)');
  // host: el lobby avisa de la conexión y llega el «hi» del invitado
  ok(A.CC.startHost() && A.lob.cfg && A.lob.cfg.title, 'el anfitrión abre la sala cooperativa (NetLobby.coop.host)');
  A.lob.cfg.onReady({ link: link(), seat: 0, names: ['Anfitriona', 'Ana'], looks: [null, null] });
  ok(A.CC.host() && !A.CC.paired(), 'anfitrión conectado, aún sin presentar');
  A.CC._onMsg({ t: 'hi', id: 'uidAna', name: 'Ana', num: 3, ver: A.VB.VERSION || '', gz: true });
  await new Promise(r => setTimeout(r, 400));
  const snapMsg = A.lob.sent.filter(m => m.t === 'snap').pop();
  ok(A.CC.paired() && snapMsg && snapMsg.z === 'gz' && snapMsg.rev >= 1, 'el anfitrión manda la foto comprimida (' + (snapMsg && snapMsg.d.length) + ' car. en base64 frente a ' + JSON.stringify(A.C.load()).length + ' de JSON)');
  // invitado con su propia Carrera en su localStorage
  const G0 = boot(true); newCareer(G0, 777, 'Ana Propia');
  const own = { career: G0.mem['make-the-cut.career'], mode: G0.mem['make-the-cut.career.mode'] };
  const G = boot(true, { 'make-the-cut.career': own.career, 'make-the-cut.career.mode': own.mode || 'beach' });
  ok(G.C.load().player.name === 'Ana Propia', 'el invitado tiene su propia Carrera');
  G.writes.length = 0;
  ok(G.CC.join('abc-234') === true && G.lob.cfg && G.lob.cfg.code === 'ABC234', 'el invitado entra con el código (normalizado: ABC234)');
  G.lob.cfg.onReady({ link: link(), seat: 1, names: ['Anfitriona', 'Ana'], looks: [null, null] });
  const hi = G.lob.sent.find(m => m.t === 'hi');
  ok(hi && hi.gz === true && hi.name === 'Jugador', 'el invitado se presenta (hi)');
  G.CC._onMsg(snapMsg);
  await new Promise(r => setTimeout(r, 400));
  const gc = G.C.get();
  ok(G.CC.guest() && G.CC.paired() && gc && gc.player.name === 'Ana' && gc.mate.name === 'Anfitriona', 'el invitado ve la Carrera del anfitrión como protagonista (él: ' + (gc && gc.player.name) + ', pareja: ' + (gc && gc.mate.name) + ')');
  ok(gc.coop.view === 'guest' && gc.last && gc.last.xp === sum.coop.xp, 'el último partido, con SU XP');
  ok(gc.stats.played === 1 && gc.stats.kills === 7 && gc.career.kills === 7 && gc.notes.length === 1 && gc.notes[0].nota === sum.coop.nota, 'sus estadísticas y su nota, no las del anfitrión');
  ok(G.mem['make-the-cut.career'] === own.career && (G.mem['make-the-cut.career.mode'] || 'beach') === (own.mode || 'beach'), 'su localStorage: su Carrera intacta');
  ok(G.writes.every(k => k === A.CC.P2_KEY), 'el invitado solo escribe make-the-cut.coop.p2 (' + G.writes.join(', ') + ')');
  const rec = JSON.parse(G.mem[A.CC.P2_KEY] || 'null');
  ok(rec && rec.p2 && rec.p2.name === 'Ana' && rec.cid === (A.C.load().seed >>> 0), 'copia de su p2 en make-the-cut.coop.p2');
  // puerta de intenciones y gasto de puntos
  ok(G.CC.intent('play') === false && G.CC.intent('sim') === false && G.CC.intent('offer') === false, 'el invitado no puede jugar, simular ni tocar ofertas');
  ok(G.CC.intent('lvl') === 'pass' && G.CC.intent('co-ready') === 'pass' && G.CC.intent('close') === 'pass', 'sí mirar, «Listo» y salir');
  // p2 con puntos: el anfitrión se los da (subida de nivel) y manda otra foto
  c = A.C.load(); c.coop.p2.pts = 4; A.C.save(c);
  A.CC._ext && A.CC._S && (A.CC._S.lastJson = '');
  A.lob.sent.length = 0; A.CC._onMsg({ t: 'need', rev: 1 }); await new Promise(r => setTimeout(r, 400));
  G.CC._onMsg(A.lob.sent.filter(m => m.t === 'snap').pop()); await new Promise(r => setTimeout(r, 400));
  ok(G.C.get().player.pts === 4, 'foto nueva: el invitado ve sus 4 puntos');
  G.writes.length = 0; G.lob.sent.length = 0;
  const kUp = A.C.KEYS[0], v0 = G.C.get().player.st[kUp];
  const fakeBtn = { getAttribute: k => (k === 'data-k' ? kUp : null) };
  ok(G.CC.intent('up', fakeBtn) === 'pass' && G.C.bump(kUp) && G.C.get().player.st[kUp] === v0 + 1, 'el invitado sube ' + kUp + ' en su copia en memoria');
  ok(G.writes.length === 0 && G.mem['make-the-cut.career'] === own.career, 'y su localStorage sigue sin tocar');
  const intMsg = G.lob.sent.find(m => m.t === 'int');
  ok(intMsg && intMsg.a === 'up' && intMsg.k === kUp, 'la intención viaja al anfitrión');
  A.CC._onMsg(intMsg);
  c = A.C.load();
  ok(c.coop.p2.st[kUp] === v0 + 1 && c.coop.p2.pts < 4 && c.player.st[kUp] !== undefined, 'el anfitrión la aplica a p2 (y guarda)');
  ok(G.CC.setReady(true) && G.lob.sent.some(m => m.t === 'ready' && m.on), '«Listo» viaja al anfitrión');
  A.CC._onMsg({ t: 'ready', on: true });
  ok(A.CC.ready() && A.CC.hostPlay() && typeof A.CC.hostPlay().go === 'function', 'con «Listo», «Jugar partido» va en cooperativo');
  A.CC._onMsg({ t: 'ready', on: false });
  ok(A.CC.hostPlay().wait === true, 'sin «Listo», el anfitrión espera');
  A.mem['make-the-cut.career.mode'] = 'hall'; const md = A.C.mode;
  A.C.mode = () => 'hall';
  ok(A.CC.hostPlay() === null, 'con la Carrera de pista en pantalla, «Jugar» es el partido de pista de siempre');
  A.C.mode = md; A.mem['make-the-cut.career.mode'] = 'beach';
  const ml = A.CC.matchLink();
  ok(ml && ml.state === 'open' && typeof ml.poll === 'function', 'enlace del partido: la fachada del lobby (se pasa tal cual a startOnline)');
  // el invitado se va en pleno partido: el anfitrión sigue (la IA lleva la plaza 1) y la jornada cuenta igual
  {
    const wkA = A.C.load().week, xpA = A.C.load().coop.p2.xp, moA = A.CC.matchOpts({ seed: 5 }), gA = A.VB.Sim.createGame(JSON.parse(JSON.stringify(moA.opts)));
    let out = { confirmed: [] };
    const sess = { advance() { return out; }, confirmedGame() { return gA; } }, fakeNet = { sess };
    A.C.abortMatch(); A.CC.matchStarted(0, fakeNet, moA);
    ok(A.CC.inMatch() && fakeNet.coopCareer === true && sess._coopW, 'partido cooperativo en marcha (sesión envuelta, sin revancha)');
    out = { confirmed: [{ type: 'hit', team: 0, kind: 'spike', touch: 2, player: gA.teams[0][1], grade: 'good', human: true }, { type: 'point', team: 0, how: 'kill', reason: 'in' }] }; sess.advance();
    A.lob.cfg.onClose('mateLeft');
    ok(!A.CC.host() && A.CC.inMatch(), 'se va el invitado: el anfitrión deja el cooperativo pero el partido sigue contando');
    out = { confirmed: [{ type: 'gameOver', team: 0, sets: [2, 0], setScores: [[21, 15], [21, 16]] }] }; sess.advance();
    const cA = A.C.load();
    ok(cA.week === wkA + 1 && cA.coop.p2.xp !== xpA && cA.last.coop && cA.last.coop.me.kills === 1, 'gameOver confirmado: jornada cerrada y p2 acreditado (1 remate)');
    A.CC._S.match = null;
    A.CC.startHost(); A.lob.cfg.onReady({ link: link(), seat: 0, names: ['Anfitriona', 'Ana'], looks: [null, null] }); A.CC._onMsg({ t: 'hi', id: 'uidAna', name: 'Ana', num: 3, ver: A.VB.VERSION || '', gz: true });
    ok(A.CC.paired() && A.C.load().coop.uid2 === 'uidAna', 'vuelve a entrar: el mismo p2');
  }
  // desconexión: el invitado vuelve a su Carrera de localStorage
  G.lob.cfg.onClose('down');
  ok(!G.CC.guest() && G.C.get().player.name === 'Ana Propia' && G.mem['make-the-cut.career'] === own.career, 'al cortarse, el invitado vuelve a su Carrera (intacta)');
  A.lob.cfg.onClose('down');
  ok(!A.CC.host() && A.CC.hostPlay() === null, 'el anfitrión sin pareja juega como siempre');

  // ------------------------------------------------------------------ 5b
  section('Invitado: pantallas, estado del anfitrión, Resumen y corte (L4)');
  {
    const H0 = boot(true); const hc = newCareer(H0, 9090, 'Anfitriona');
    H0.CC.startHost(); H0.lob.cfg.onReady({ link: link(), seat: 0, names: ['Anfitriona', 'Bea'], looks: [null, null] });
    H0.CC._onMsg({ t: 'hi', id: 'uidBea', name: 'Bea', num: 5, ver: H0.VB.VERSION || '', gz: true });
    await new Promise(r => setTimeout(r, 400));
    // invitado con su Carrera propia
    const B0 = boot(true); newCareer(B0, 31, 'Bea Propia');
    const B = boot(true, { 'make-the-cut.career': B0.mem['make-the-cut.career'], 'make-the-cut.career.mode': 'beach' });
    const ownB = B.mem['make-the-cut.career'];
    B.writes.length = 0;
    B.CC.join('XYZ234'); B.lob.cfg.onReady({ link: link(), seat: 1, names: ['Anfitriona', 'Bea'], looks: [null, null] });
    const w0 = B.CC.sheet();
    ok(w0 && w0.k === 'wait' && /Anfitriona/.test(w0.text) && w0.ctas[0][0] === 'end', 'conectado sin la Carrera: pantalla «esperando la Carrera de Anfitriona» con «Salir»');
    B.CC._onMsg(H0.lob.sent.filter(m => m.t === 'snap').pop()); await new Promise(r => setTimeout(r, 400));
    ok(B.CC.paired() && B.CC.sheet() === null, 'llega la Carrera: sin hoja, al hub');
    // estado del anfitrión → tarjeta del invitado (arriba, hueco matchTop)
    const UX = B.VB.CareerUIExt.find(x => x.id === 'coop'), Hh = { sp: a => a.join(' · '), esc: s => s };
    ok(H0.CC.hostState() === 'menu', 'anfitrión fuera de la Carrera: «menu»');
    H0.VB.ctx = { state: 'playing' }; ok(H0.CC.hostState() === 'solo', 'anfitrión jugando un partido sin su pareja: «solo»'); H0.VB.ctx = undefined;
    H0.lob.sent.length = 0; H0.CC._S.lastJson = JSON.stringify(H0.C.load()); H0.CC._S.stSent = '';
    // (tick a mano: el temporizador de 500 ms manda el estado solo al cambiar)
    const tickOnce = async () => { H0.CC._tick(); };
    await tickOnce();
    const st1 = H0.lob.sent.filter(m => m.t === 'st');
    ok(st1.length === 1 && st1[0].w === 'menu', 'el anfitrión manda su estado al invitado (st ' + (st1[0] && st1[0].w) + ')');
    await tickOnce();
    ok(H0.lob.sent.filter(m => m.t === 'st').length === 1, 'y solo cuando cambia');
    B.CC._onMsg({ t: 'st', w: 'hub' });
    const gcB = B.C.get(), card1 = UX.ui.matchTop(gcB, Hh);
    ok(/está eligiendo/.test(card1) && /co-ready/.test(card1) && /co-me/.test(card1) && /nivel 1/.test(card1), 'tarjeta del invitado: «Anfitriona está eligiendo», «Listo», «Tu jugador» y su nivel');
    ok(UX.ui.match(gcB, Hh) === '', 'la tarjeta de siempre no sale para el invitado (va arriba)');
    B.CC._onMsg({ t: 'st', w: 'solo' });
    ok(/jugando un partido sin ti/.test(UX.ui.matchTop(B.C.get(), Hh)), 'el anfitrión juega sin él: «está jugando un partido sin ti»');
    B.CC._onMsg({ t: 'st', w: '<script>' });
    ok(B.CC._S.hostW === '', 'estado desconocido: se ignora');
    ok(JSON.stringify(UX.act('co-me')) === JSON.stringify({ tab: 'player' }), '«Tu jugador» lleva a su ficha (Jugador)');
    ok(B.C.get().player.name === 'Bea' && B.C.get().player.lvl === 1, 'su ficha es la de su p2 (Bea, nivel 1)');
    // partido: el anfitrión cierra la jornada → Resumen de los dos
    const shown = { H: [], B: [] };
    const fakeUI = who => ({ endCareer: (sum, g, x) => { shown[who].push({ sum, g, x }); return {}; } });
    H0.VB.UI = fakeUI('H'); B.VB.UI = fakeUI('B');
    const moH = H0.CC.matchOpts({ seed: 3 }), gH = H0.VB.Sim.createGame(JSON.parse(JSON.stringify(moH.opts)));
    let outH = { confirmed: [] }; const sessH = { advance() { return outH; }, confirmedGame() { return gH; } }, netH = { sess: sessH };
    H0.VB.ctx = { state: 'playing', net: netH, game: { sets: [0, 0], setScores: [] } };
    H0.C.abortMatch(); H0.CC.matchStarted(0, netH, moH);
    const sessB = { advance() { return { confirmed: [] }; }, confirmedGame() { return null; } }, netB = { sess: sessB };
    B.VB.ctx = { state: 'playing', net: netB, game: { sets: [0, 0], setScores: [] } };
    B.CC.matchStarted(1, netB, null);
    ok(B.CC.sheet() === null, 'en pleno partido, ninguna hoja encima');
    H0.lob.sent.length = 0;
    outH = { confirmed: [{ type: 'hit', team: 0, kind: 'spike', touch: 2, player: gH.teams[0][1], grade: 'good', human: true }, { type: 'point', team: 0, how: 'kill', reason: 'in' },
      { type: 'gameOver', team: 0, sets: [2, 0], setScores: [[21, 15], [21, 17]] }] }; sessH.advance();
    const sm = H0.lob.sent.filter(m => m.t === 'sum').pop();
    ok(sm && sm.sum && sm.cs.player === 'Bea' && sm.rec && sm.rec.p2.name === 'Bea', 'tras matchDone el anfitrión manda al invitado su Resumen (sum) en la hoja final');
    ok(shown.H.length === 0, 'el anfitrión no pinta el Resumen hasta que su hoja final está a la vista');
    H0.VB.ctx.state = 'over'; H0.VB.ctx.game = { sets: [2, 0], setScores: [[21, 15], [21, 17]] }; H0.CC.matchWatch(); H0.CC.matchWatch();
    ok(shown.H.length === 1 && shown.H[0].sum.xp > 0 && shown.H[0].g.career && shown.H[0].g.career.coop && shown.H[0].x && shown.H[0].x.bar, 'anfitrión: «Resumen de la jornada» una sola vez, con su g.career, tabla y barra');
    ok(shown.H[0] && shown.H[0].g.sets[0] === 2 && Object.getPrototypeOf(shown.H[0].g) === H0.VB.ctx.game, 'sobre la partida de la hoja final (vista online), sin tocarla');
    B.writes.length = 0;
    B.CC._onMsg(JSON.parse(JSON.stringify(Object.assign({}, sm, { cs: Object.assign({}, sm.cs, { meName: '<img src=x onerror=1>Club' }) }))));
    const recB = JSON.parse(B.mem[B.CC.P2_KEY]);
    ok(recB.p2.xp === sm.rec.p2.xp && recB.p2.matches === sm.rec.p2.matches, 'invitado: su copia de p2 al día en cuanto llega el Resumen (antes de la foto)');
    ok(shown.B.length === 0, 'invitado: aún en juego, el Resumen espera');
    B.VB.ctx.state = 'over'; B.VB.ctx.game = { sets: [2, 0], setScores: [[21, 15], [21, 17]] }; B.CC.matchWatch(); B.CC.matchWatch();
    const sb = shown.B[0];
    ok(shown.B.length === 1 && sb.sum.xp === sm.sum.xp && sb.g.career.player === 'Bea' && sb.g.career.mate === 'Anfitriona', 'invitado: «Resumen de la jornada» de su p2 (una vez)');
    ok(sb && sb.g.career.meName.indexOf('<') < 0, 'lo que llega del otro aparato, sin etiquetas');
    ok(B.writes.every(k => k === B.CC.P2_KEY) && B.mem['make-the-cut.career'] === ownB, 'el invitado solo ha escrito make-the-cut.coop.p2 (' + B.writes.join(', ') + ')');
    // se corta en la hoja final: la hoja «se ha cortado» espera a que deje el partido y vuelve a SU Carrera
    B.lob.cfg.onClose('hostLost');
    ok(!B.CC.guest() && B.CC.inMatch() && B.CC.sheet() === null, 'corte en la hoja final: sigue en su hoja (sin hoja encima)');
    B.VB.ctx = { state: 'menu', net: null };
    B.CC.matchWatch();
    const dn = B.CC.sheet();
    ok(!B.CC.inMatch() && dn && dn.k === 'down' && /Anfitriona/.test(dn.text) && /Bea, nivel/.test(dn.sub), 'al salir: «Se ha cortado el cooperativo con Anfitriona» y su jugador guardado');
    ok(B.C.get().player.name === 'Bea Propia' && B.mem['make-the-cut.career'] === ownB, 'de vuelta a SU Carrera, intacta');
    B.CC.join('XYZ234');
    ok(B.CC.sheet() === null || B.CC.sheet().k !== 'down', 'volver a entrar quita el aviso del corte');
    B.CC.leave();
    ok(B.CC.sheet() === null, 'salir por su cuenta: sin aviso de corte');
    H0.lob.cfg.onClose('down'); H0.CC._S.match = null;
  }

  // ------------------------------------------------------------------ 5c
  section('Invitado SIN Carrera propia: entra, juega y vuelve al menú (d)');
  {
    const H1 = boot(true); newCareer(H1, 6060, 'Anfitrión');
    H1.CC.startHost(); H1.lob.cfg.onReady({ link: link(), seat: 0, names: ['Anfitrión', 'Cris'], looks: [null, null] });
    H1.CC._onMsg({ t: 'hi', id: 'uidCris', name: 'Cris', num: 0, ver: H1.VB.VERSION || '', gz: true });
    await new Promise(r => setTimeout(r, 400));
    const N = boot(true);
    ok(N.C.get() === null, 'el invitado no tiene Carrera');
    N.CC.join('QWE234'); N.lob.cfg.onReady({ link: link(), seat: 1, names: ['Anfitrión', 'Cris'], looks: [null, null] });
    const hiN = N.lob.sent.find(m => m.t === 'hi');
    ok(hiN && hiN.num === 0, 'se presenta sin dorsal propio');
    N.CC._onMsg(H1.lob.sent.filter(m => m.t === 'snap').pop()); await new Promise(r => setTimeout(r, 400));
    ok(N.CC.paired() && N.C.get() && N.C.get().player.name === 'Cris' && N.C.get().player.num >= 1, 'recibe la Carrera y juega como Cris (n.º ' + (N.C.get() && N.C.get().player.num) + ')');
    ok(N.CC.setReady(true), '«Listo»');
    let called = null;
    N.VB.ctx = { state: 'menu', actions: { startCoopCareerMatch: o => { called = o; return true; } } };
    N.CC._onMsg({ t: 'play', humans: [{ name: 'Anfitrión', look: null }, { name: 'Cris', look: null }] });
    ok(called && called.seat === 1 && called.humans[1].name === 'Cris', 'el «play» del anfitrión arranca SU partido (plaza 1)');
    ok(!N.lob.sent.some(m => m.t === 'nack'), 'sin «nack»: entra en el partido');
    N.lob.cfg.onClose('mateLeft');
    ok(N.C.get() === null && Object.keys(N.mem).every(k => k === N.CC.P2_KEY), 'al cortarse: sin Carrera y su aparato solo con make-the-cut.coop.p2 (' + Object.keys(N.mem).join(', ') + ')');
    const dn = N.CC.sheet();
    ok(dn && dn.k === 'down' && /Cris/.test(dn.sub), 'hoja «se ha cortado» con su jugador guardado');
    const UX = N.VB.CareerUIExt.find(x => x.id === 'coop');
    ok(/Tu jugador en la Carrera de Anfitrión: Cris/.test(UX.createRow({}, false, { sp: a => a.join(' · ') })), 'en «crear», su jugador del cooperativo (una línea)');
    H1.lob.cfg.onClose('down');
  }

  // ------------------------------------------------------------------ 5d
  section('Insignias de un coop de verdad (Precisa-N, red mala): confirmado = oro; lo presentado se desviaba (a)');
  {
    const N4 = require('./net4test.js');
    const BX = () => { const cx = { console, Math, JSON }; cx.window = cx; cx.globalThis = cx; vm.createContext(cx); vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/badges.js'), 'utf8'), cx); return cx.VB.Badges; };
    const res = [];
    for (const [rtt, seed] of [[200, 12], [120, 15]]) {
      const K = boot(true); const kc = newCareer(K, 4040 + seed, 'Anfitriona');
      K.CC.adopt(kc, { id: 'uidX', name: 'Xan', num: 9 }, 1); K.C.save(kc);
      const mo2 = K.CC.matchOpts({ seed: 70 + seed }); const op = JSON.parse(JSON.stringify(mo2.opts)); op.bestOf = 1;   // (un set: la prueba dura menos)
      const bp20 = Object.assign({}, K.C.load().coop.p2.bp || {}), bp10 = Object.assign({}, K.C.load().player.bp || {});
      K.C.abortMatch(); K.VB.Badges._reset();
      const BP = BX(); let host = null; const gP = { get teams() { return host.gp.teams; }, get setPoint() { return host.gp.setPoint; }, get matchPoint() { return host.gp.matchPoint; } };
      const mtK = { seat: 0, cs: mo2.cs, gc: null, gw: null, done: false };
      N4.ADAPTERS.coopL4 = Object.assign({}, N4.ADAPTERS.precisaN, {
        make(V, i, M, cfg, lg) {
          const s = N4.ADAPTERS.precisaN.make(V, i, M, cfg, lg);
          if (i === 0) {
            host = s; const adv = s.advance;
            s.advance = function () {
              const r = adv.apply(s, arguments);
              const ovr = (r.events || []).some(e => e.type === 'challengeResult' && e.overturned);   // (lo que hacía ui.js con lo presentado)
              for (const e of r.events || []) BP.ingest(ovr && e.type === 'point' ? Object.assign({}, e, { _ovr: true }) : e, gP);
              if (r.confirmed && r.confirmed.length) K.CC.feed(mtK, s.confirmedGame(), r.confirmed);   // (lo nuevo: career-coop con lo confirmado)
              return r;
            };
          }
          return s;
        }
      });
      const SC = [{ team: 0 }, { team: 0 }];
      const R = N4.runMatch({ topo: 'star', relay: false, rtt: () => rtt, jit: 15, loss: 3, seed, secs: 900, model: 'coopL4', seats: SC, opts: op });
      // oro: offline con las entradas confirmadas del anfitrión
      const V = R.V[0], Sm = V.Sim, D = V.Net.decode, rec = host.rec, BG = BX(), gO = Sm.createGame(host.opts), ins = [], gG = { get teams() { return gO.teams; }, get setPoint() { return gO.setPoint; }, get matchPoint() { return gO.matchPoint; } };
      for (let t = 0; t < rec.length && rec[t]; t++) {
        const rr = rec[t], ns = rr.length / 3; while (ins.length < ns) ins.push({ move: [0, 0] });
        for (let s = 0; s < ns; s++) D(rr[3 * s], rr[3 * s + 1], rr[3 * s + 2], ins[s]);
        Sm.step(gO, 1 / 120, ins);
        const ovr = gO.events.some(e => e.type === 'challengeResult' && e.overturned);
        for (const e of gO.events) BG.ingest(ovr && e.type === 'point' ? Object.assign({}, e, { _ovr: true }) : e, gG);
        gO.events.length = 0;
      }
      const cG = BG._cur().c, cP = BP._cur().c, cz = K.C.load();
      const gained = (a, b0, s) => { const o = {}; for (const k in a.bp) { const d = (a.bp[k] | 0) - (b0[k] | 0) - (k === 'motor' ? 1 : 0) - (k === 'lider' && cz.last && cz.last.win ? 1 : 0); if (d) o[k] = d; } return o; };
      const eq = (x, y) => { const ks = new Set(Object.keys(x).concat(Object.keys(y))); for (const k of ks) if ((x[k] | 0) !== (y[k] | 0)) return false; return true; };
      const dist = (x, y) => { let d = 0; const ks = new Set(Object.keys(x).concat(Object.keys(y))); for (const k of ks) d += Math.abs((x[k] | 0) - (y[k] | 0)); return d; };
      const g1 = gained(cz.player, bp10), g2 = gained(cz.coop.p2, bp20);
      const tot = c2 => c2.reduce((n, o) => n + Object.values(o).reduce((a, b) => a + b, 0), 0);
      ok(!R.err && host.status === 'over' && mtK.done && cz.last && cz.last.coop, 'rtt ' + rtt + ': partido entero y jornada cerrada (máx. retroceso ' + host.stats.maxDepth + ' tics)');
      ok(eq(g1, cG[0]) && eq(g2, cG[1]), 'rtt ' + rtt + ': insignias del anfitrión y de p2 = las de la partida de oro (' + tot(cG) + ' cuentas)');
      res.push({ rtt, seed, oro: tot(cG), presentado: tot(cP), errPresentado: dist(cP[0], cG[0]) + dist(cP[1], cG[1]), errConfirmado: dist(g1, cG[0]) + dist(g2, cG[1]) });
    }
    console.log('  medida (cuentas de insignias en el partido): ' + res.map(r => 'rtt ' + r.rtt + ' semilla ' + r.seed + ': oro ' + r.oro + ', presentado ' + r.presentado + ' (error ' + r.errPresentado + '), confirmado error ' + r.errConfirmado).join(' · '));
    ok(res.every(r => r.errConfirmado === 0), 'con lo confirmado, error 0 en todas las redes');
  }

  // ------------------------------------------------------------------ 5b
  section('Arreglos de la revisión (ss2, «nack», «Listo» caducado, perfil del invitado)');
  {
    // ss2: la temporada de un invitado no la hereda el siguiente; vuelve con él
    const B = boot(true); let cc = newCareer(B, 6161);
    B.CC.adopt(cc, { id: 'ana', name: 'Ana' }, 1);
    B.CC.creditMate(cc, { p: [{}, { kills: 9, aces: 2 }] }, { sets: [2, 0], setScores: [[21, 10], [21, 12]] }, 40);
    const k0 = cc.coop.ss2 && cc.coop.ss2.st.kills;
    B.CC.adopt(cc, { id: 'luis', name: 'Luis' }, 2);
    const gvL = B.CC.guestView(cc);
    ok(!('lock' in B.CC.guestView(Object.assign({}, cc, { lock: { cm: 'beach|x|1', x: 1 } }))), 'el candado del anfitrión (c.lock) no llega al invitado');
    ok(cc.coop.old && cc.coop.old.ana && !('old' in gvL.coop) && JSON.stringify(gvL).indexOf('"ana"') < 0 && gvL.coop.uid2 === 'luis',
      'la vista del invitado no lleva las parejas de antes (coop.old: uid de cuenta, nombre y números de otros); el anfitrión sí las guarda');
    ok(k0 === 9 && !cc.coop.ss2 && gvL.stats.played === 0 && gvL.stats.kills === 0, 'otro invitado no hereda la temporada del anterior (ss2): 0 jugados, 0 remates');
    B.CC.adopt(cc, { id: 'ana', name: 'Ana' }, 3);
    ok(cc.coop.ss2 && cc.coop.ss2.st.kills === 9 && cc.coop.ss2.st.played === 1, 'Ana vuelve: recupera su temporada');

    // «nack»: el partido lo juega el compañero de la IA → p2 sin XP ni insignias; química y forma del compañero de la IA, como siempre
    const N = boot(true); let cn = newCareer(N, 7272);
    N.CC.adopt(cn, { id: 'x', name: 'Pau', num: 0 }, 1); N.C.save(cn);
    const moN = N.CC.matchOpts({ seed: 5 });
    N.C.abortMatch();
    const gN = N.VB.Sim.createGame(JSON.parse(JSON.stringify(moN.opts))), EN = [];
    for (let i = 0; i < 4; i++) EN.push({ type: 'hit', team: 0, kind: 'spike', touch: 2, player: gN.teams[0][1], grade: 'good' }, { type: 'point', team: 0, how: 'kill', reason: 'in' });
    cn = N.C.load();
    const p2N = JSON.parse(JSON.stringify(cn.coop.p2)), chemN = cn.coop.chem, mateN = JSON.stringify([cn.mate.chem, cn.mate.form]);
    const mtN = { seat: 0, cs: moN.cs, gc: null, gw: null, done: false, noP2: true };
    N.CC._S.match = mtN;
    ok(N.CC.noP2() === true, 'VB.CareerCoop.noP2() con el «nack» del invitado');
    N.VB.Badges._reset();
    N.CC.feed(mtN, gN, EN.concat([{ type: 'gameOver', team: 0, sets: [2, 0], setScores: [[21, 15], [21, 16]] }]));
    N.CC._S.match = null;
    cn = N.C.load();
    ok(mtN.done && (cn.coop.p2.xp | 0) === (p2N.xp | 0) && (cn.coop.p2.matches | 0) === (p2N.matches | 0) && JSON.stringify(cn.coop.p2.bp || {}) === JSON.stringify(p2N.bp || {}),
      'con «nack» p2 no se lleva XP, partido ni insignias de lo que jugó la IA');
    ok(cn.coop.chem === chemN && JSON.stringify([cn.mate.chem, cn.mate.form]) !== mateN, 'con «nack» la química del cooperativo no sube y el compañero de la IA cierra su química y su forma');

    // «Listo» caducado: vale para ESE partido; si el anfitrión simula, hay que volver a pulsarlo
    const R = boot(true); let cr = newCareer(R, 8383);
    R.CC.adopt(cr, { id: 'y', name: 'Rut', num: 0 }, 1); R.C.save(cr);
    Object.assign(R.CC._S, { role: 'host', link: link(), hi: { id: 'y', name: 'Rut' }, names: ['Anfitriona', 'Rut'] });
    R.CC._onMsg({ t: 'ready', on: true });
    const h1 = R.CC.hostPlay();
    R.C.simulateNext(R.C.load());
    R.lob.sent.length = 0;
    const h2 = R.CC.hostPlay();
    ok(h1 && h1.go && h2 && h2.wait && !R.CC.ready() && R.lob.sent.some(m => m.t === 'rdy0'), '«Listo» y simulado: el siguiente partido espera otro «Listo» y se avisa al invitado (rdy0)');
    R.CC._reset();

    // perfil del invitado: con la Carrera del anfitrión en memoria, Profile.check no se queda sus logros ni sus títulos
    let P = null;
    try { P = (function () { const X = boot(true); vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/profile.js'), 'utf8'), X.cx, { filename: 'js/profile.js' }); return X; })(); } catch (e) { P = null; }
    if (P && P.VB.Profile) {
      const hc = JSON.parse(JSON.stringify(newCareer(boot(true), 9494, 'Host')));
      hc.coop = { v: 1, on: true, uid2: 'z', name2: 'Zoe', p2: hc.mate, stats2: {} }; P.CC.ensure(hc);
      hc.life = hc.life || {}; hc.life.ach = { m1: 1, w1: 1, t1: 1 }; hc.trophies = [{ kind: 'liga', season: 1 }];
      P.CC._S.role = 'guest'; P.CC._S.link = link();
      P.CC.installGuest(hc);
      P.VB.Profile.check();
      const pr = JSON.parse(P.mem['make-the-cut.profile'] || 'null') || {};
      ok(!Object.keys(pr.ach || {}).length && !Object.keys(pr.car || {}).length, 'invitado: Profile.check no se lleva los logros ni la Carrera del anfitrión (' + JSON.stringify([pr.ach, pr.car]) + ')');
      P.CC._reset();
    } else ok(false, 'js/profile.js carga en el contexto de prueba');
  }

  // ------------------------------------------------------------------ 6
  section('Determinismo');
  const run = () => {
    const B = boot(true); const cc = newCareer(B, 5150);
    B.CC.adopt(cc, { id: 'x', name: 'Ana', num: 0 }, 1); B.C.save(cc);
    const mo2 = B.CC.matchOpts({ seed: 7 });
    B.C.abortMatch();
    const g3 = B.VB.Sim.createGame(JSON.parse(JSON.stringify(mo2.opts))), Ev = [];
    for (let i = 0; i < 5; i++) kill(g3.teams[0][1], Ev);
    // (los eventos se construyen sobre los jugadores de ESTA partida)
    const E3 = Ev.map(e => Object.assign({}, e, e.player ? { player: e.player.team === 1 ? g3.teams[1][0] : e.player === t0[0] ? g3.teams[0][0] : g3.teams[0][1] } : {}));
    const mt3 = { seat: 0, cs: mo2.cs, gc: null, gw: null, done: false };
    B.CC.feed(mt3, g3, E3.concat([{ type: 'gameOver', team: 1, sets: [0, 2], setScores: [[18, 21], [17, 21]] }]));
    const cz = B.C.load();
    return JSON.stringify([cz.coop, mo2.opts, cz.player, cz.week]);
  };
  const r1 = run(), r2 = run();
  ok(r1 === r2, 'mismos pasos → mismo c.coop, mismas opciones y mismo resultado');

  // ------------------------------------------------------------------ 7
  section('NOEXT: con y sin career-coop.js, la Carrera es idéntica');
  const ap = coop => { const B = boot(coop); const k = H.autopilot({ C: B.C, VB: B.VB }, { mode: 'beach', seasons: 2, seed: 31337, now: 1 }); return H.strip(k); };
  const w1 = ap(true), w0 = ap(false);
  ok(w1 === w0 && w1.indexOf('"coop"') < 0, '2 temporadas en piloto automático iguales (' + w1.length + ' car.)');

  console.log('\n' + passes + ' ok, ' + fails + ' fallos');
  console.log(fails ? 'HAY FALLOS' : 'TODO OK');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
