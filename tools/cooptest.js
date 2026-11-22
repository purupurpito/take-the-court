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
  // (ui.js cuenta las insignias con la partida PRESENTADA: aquí, la misma g; matchDone cierra con la vista confirmada)
  const bp0 = Object.assign({}, c.coop.p2.bp || {}), bpMe0 = Object.assign({}, c.player.bp || {});
  A.VB.Badges.ingest({ type: 'newMatch' }, g); E.forEach(e => A.VB.Badges.ingest(e, g));
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
  ok((pd.bp.bombardero | 0) === (bp0.bombardero | 0) + 2 && (pd.bp.canon | 0) === (bp0.canon | 0) + 6, 'insignias de p2: +2 bombardero (aces) y +6 cañón (' + (pd.bp.bombardero | 0) + ', ' + (pd.bp.canon | 0) + ')');
  ok((c.player.bp.canon | 0) === (bpMe0.canon | 0) + 3, 'tus insignias: +3 cañón');
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
