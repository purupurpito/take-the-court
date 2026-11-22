#!/usr/bin/env node
/* TAKE THE COURT — tools/lobbytest.js  (owner: net)
 * Lobby del ONLINE DE VARIOS (js/netlobby.js, sprint online-multi P6) de punta a punta en Node: varias «páginas» (un contexto vm por
 * jugador con js/netroom.js + js/netlobby.js) contra el emulador de Firestore con las reglas del proyecto (firebase/firestore.rules,
 * esquema v3) y un WebRTC de mentira en memoria (ofertas/respuestas de verdad por la sala; los canales, en memoria). Prueba:
 *  a) 2 contra 2 con 4 personas: plazas repartidas por equipos, la señalización por pareja se borra al abrir, Firestore deja de
 *     leerse con el enlace abierto, sentarse/levantarse/listo, «Empezar» → startOnline con humans/seat/links/opts/model, sala 'play',
 *     y una caída en pleno partido que se renegocia sola (gen + 1).
 *  b) 6 contra 6: puesto preferido (role6), un invitado que nunca conecta se suelta (su sitio, la IA) sin rehacer la sala, sacar
 *     a alguien, alguien que sale, mover y cambiar equipos, model 'host'.
 *  c) Carrera cooperativa (VB.NetLobby.coop): host/join por código, onReady en los dos (plaza, nombres), un mensaje de 50 KB troceado,
 *     la fachada del enlace (la sesión no ve los mensajes del lobby; close() no cierra el enlace), y onClose al salir el compañero.
 *  d) Reglas sin desplegar: crear una sala de varios → «Las salas de varios aún no están activadas» y el 1 contra 1 sigue.
 *  e) 1 contra 1 por el lobby (el camino de siempre: «pre» y startOnline con slot/link) y un cliente 1.21.0 (L2) ve la sala como
 *     «otra versión».
 * Uso: node tools/lobbytest.js [--port 8095] [--only a,b,c,d,e]
 */
'use strict';
const fs = require('fs'), os = require('os'), path = require('path'), vm = require('vm'), { spawn } = require('child_process');
const ROOT = path.join(__dirname, '..');
const ARGS = process.argv.slice(2);
const PORT = +(ARGS[ARGS.indexOf('--port') + 1] || 0) || 8095, PROJECT = 'demo-mtc';
const ONLY = ARGS.indexOf('--only') >= 0 ? ARGS[ARGS.indexOf('--only') + 1].split(',') : null;
const BASE = 'http://127.0.0.1:' + PORT + '/v1/projects/' + PROJECT + '/databases/(default)/documents';
let fails = 0, oks = 0;
function check(name, ok, info) { if (ok) oks++; else fails++; console.log((ok ? '  ok   ' : '  FALLO ') + name + (info !== undefined ? ' ' + (typeof info === 'string' ? info : JSON.stringify(info)) : '')); }
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function until(f, ms, step) { const t0 = Date.now(); for (;;) { let v = false; try { v = f(); } catch (e) { v = false; } if (v) return v; if (Date.now() - t0 > ms) return false; await sleep(step || 50); } }
const SRC = { room: fs.readFileSync(path.join(ROOT, 'js/netroom.js'), 'utf8'), lobby: fs.readFileSync(path.join(ROOT, 'js/netlobby.js'), 'utf8') };

/* ---------- WebRTC de mentira: las SDP son fichas de un registro común; los mensajes, en memoria (en orden) ---------- */
function makeHub() {
  const reg = new Map(); let n = 0;
  function FakeLink(o, block) {
    this.onstate = o && typeof o.onstate === 'function' ? o.onstate : null; this.onclose = null; this.q = []; this.pend = []; this.state = 'new';
    this.opens = 0; this.peer = null; this.block = !!block; this.ctlOut = 0; this.bytesOut = 0;
  }
  const P = FakeLink.prototype;
  P._set = function (s) { if (this.state === s || this.state === 'closed') return; this.state = s; if (this.onstate) { try { this.onstate(s); } catch (e) { console.error(e); } } };
  P.offer = function () { this.peer = null; this._set('connecting'); const sdp = 'O' + (++n); reg.set(sdp, this); return Promise.resolve(sdp); };
  P.answer = function (sdp) { const off = reg.get(sdp); this._set('connecting'); if (!off) return Promise.reject(new Error('sin oferta')); const a = 'A' + (++n); reg.set(a, this); this._off = off; return Promise.resolve(a); };
  P.accept = function (sdp) {
    const ans = reg.get(sdp); if (!ans || ans._off !== this) return Promise.reject(new Error('respuesta rara'));
    if (ans.block || this.block) return Promise.resolve();   // (redes que no se ven: nunca abre)
    this.peer = ans; ans.peer = this; setTimeout(() => { this._open(); ans._open(); }, 20); return Promise.resolve();
  };
  P._open = function () { this.opens++; this._set('open'); const p = this.pend; this.pend = []; p.forEach(d => this._deliver('ctl', d)); };
  P._deliver = function (ch, d) { const pr = this.peer; if (!pr || pr.state === 'closed') return; if (ch === 'ctl') { this.ctlOut++; this.bytesOut += d.length; } setTimeout(() => { if (pr.peer === this) pr.q.push({ ch, data: d }); }, 4); };
  P.send = function (ch, d) { if (this.state === 'closed') return; if (this.state === 'open' && this.peer) { this._deliver(ch, d); return; } if (ch === 'ctl' && this.pend.length < 400) this.pend.push(d); };
  P.poll = function () { const o = this.q; this.q = []; return o; };
  P.info = function () { return { type: 'host', rtt: 12, opens: this.opens, rtype: 'host', proto: 'udp', relayProto: '' }; };
  P.close = function () { if (this.state === 'closed') return; const pr = this.peer; this._set('closed'); this.q = []; const f = this.onclose; this.onclose = null; if (f) f(); if (pr && pr.peer === this) setTimeout(() => pr._set('down'), 30); };
  P._kill = function () { const pr = this.peer; this.peer = null; this._set('down'); if (pr) { pr.peer = null; pr._set('down'); } };
  return { FakeLink };
}
const HUB = makeHub();

/* ---------- una «página»: contexto vm con netroom + netlobby (sin DOM: render no pinta nada sin #mpOnline) ---------- */
function el() { return { style: {}, hidden: true, innerHTML: '', setAttribute() { }, getAttribute() { return null; }, removeAttribute() { }, addEventListener() { }, appendChild() { }, querySelector() { return null; }, querySelectorAll() { return []; }, classList: { add() { }, remove() { }, contains() { return false; } } }; }
function page(name, uid, o) {
  o = o || {};
  const store = {}, sstore = {}, started = [], reads = { GET: 0, POST: 0, PATCH: 0, DELETE: 0 };
  const mkLS = s => ({ getItem: k => (k in s ? s[k] : null), setItem: (k, v) => { s[k] = String(v); }, removeItem: k => { delete s[k]; } });
  const f0 = o.fetch || fetch;
  const c = {
    console, setTimeout, clearTimeout, setInterval, clearInterval, btoa, atob, URLSearchParams, URL, TextEncoder, performance,
    fetch: (u, op) => { reads[(op && op.method) || 'GET'] = (reads[(op && op.method) || 'GET'] || 0) + 1; return f0(u, op); },
    navigator: {}, localStorage: mkLS(store), sessionStorage: mkLS(sstore), addEventListener() { }, removeEventListener() { },
    location: { search: '?netemu=' + PORT + '&netuid=' + uid + '&name=' + encodeURIComponent(name) + '&netice=none' + (o.q || ''), protocol: 'http:', hostname: 'localhost', origin: 'http://localhost', pathname: '/index.html' },
    document: { getElementById: () => null, createElement: () => el(), head: el(), body: el(), addEventListener() { }, querySelectorAll: () => [], visibilityState: 'visible', documentElement: el() }
  };
  c.window = c; c.globalThis = c; c.self = c;
  for (const k in (o.ls || {})) store[k] = o.ls[k];
  c.VB = {
    VERSION: '9.9.9', Net: { PROTO: 7 },
    NetRtc: { Link: function (lo) { return new HUB.FakeLink(lo, o.block); }, supported: () => true },
    ctx: { state: 'menu', settings: {}, actions: { startOnline: so => { started.push(so); return true; } } }
  };
  vm.createContext(c);
  vm.runInContext(SRC.room, c, { filename: 'netroom.js' });
  vm.runInContext(SRC.lobby, c, { filename: 'netlobby.js' });
  return { name, uid, c, VB: c.VB, NL: c.VB.NetLobby, started, reads, st: () => c.VB.NetLobby._state() };
}

/* ---------- emulador ---------- */
function findJar() { const d = path.join(os.homedir(), '.cache', 'firebase', 'emulators'); try { return fs.readdirSync(d).filter(f => /^cloud-firestore-emulator-.*\.jar$/.test(f)).sort().map(f => path.join(d, f)).pop() || null; } catch (e) { return null; } }
function killTree(p) { if (!p || p.killed) return; try { if (process.platform === 'win32') require('child_process').spawnSync('taskkill', ['/PID', String(p.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true }); else p.kill(); } catch (e) { } }
async function owner(method, p) { const r = await fetch(BASE + '/' + p, { method, headers: { Authorization: 'Bearer owner' } }); let j = null; try { j = await r.json(); } catch (e) { } return { status: r.status, j }; }
async function wipe() { await fetch('http://127.0.0.1:' + PORT + '/emulator/v1/projects/' + PROJECT + '/databases/(default)/documents', { method: 'DELETE' }).catch(() => { }); }
const seatsOf = async id => { const r = await owner('GET', 'rooms/' + id); return r.j && r.j.fields && r.j.fields.seats ? Object.keys((r.j.fields.seats.mapValue && r.j.fields.seats.mapValue.fields) || {}) : null; };

function mem(p, u) { const s = p.st(); return s.mx && s.mx.ro.m.filter(m => m.u === u)[0]; }
function ro(p) { const s = p.st(); return s.mx ? s.mx.ro.m : []; }

/* ---------- a) 2 contra 2 con 4 personas ---------- */
async function test2v2() {
  console.log('\na) 2 contra 2: anfitrión y 3 invitados');
  await wipe();
  const H = page('Ana Host', 'uidH'), G = [page('Bea Dos', 'uidG1'), page('Carla Tres', 'uidG2'), page('Dani Cuatro', 'uidG3')];
  H.NL._act('create', { fmt: '2v2', venue: 'beach', bo: 1, even: false });
  const okRoom = await until(() => H.st().view === 'room' && H.st().mx && H.st().room.multi, 8000);
  check('el anfitrión abre una sala de 2 contra 2 (esquema v3: multi, cap 4)', !!okRoom && H.st().room.cap === 4 && H.st().room.fmt === '2v2', H.st().room);
  const code = H.st().room.code;
  check('el anfitrión, sentado en el equipo A, sitio 0', mem(H, 'uidH') && mem(H, 'uidH').c === 0);
  // uno por código y dos por la sala
  G[0].NL._act('code', code); G[1].NL._act('join', 'uidH'); G[2].NL._act('join', 'uidH');
  const linked = await until(() => G.every(g => g.st().mx && g.st().mx.status === 'linked') && ro(H).filter(m => m.ok).length === 4, 20000);
  check('los 3 invitados conectan (ofertas en paralelo) y saludan', !!linked, ro(H));
  const L = ro(H), byTeam = [0, 0]; L.forEach(m => { if (m.c >= 0) byTeam[m.c >= 2 ? 1 : 0]++; });
  check('plazas repartidas: 2 y 2', byTeam[0] === 2 && byTeam[1] === 2, L.map(m => m.n + ':' + m.c));
  check('L.links del anfitrión = {uid: Link} con los 3 abiertos', Object.keys(H.st().mx.links).length === 3 && Object.values(H.st().mx.links).every(s => s === 'open'), H.st().mx.links);
  await sleep(400);
  const sig = await Promise.all(['uidG1', 'uidG2', 'uidG3'].map(u => Promise.all([owner('GET', 'rooms/uidH/sig/o_' + u), owner('GET', 'rooms/uidH/sig/a_' + u)])));
  check('la señalización por pareja (o_/a_) se borra al abrir', sig.every(p => p[0].status === 404 && p[1].status === 404), sig.map(p => [p[0].status, p[1].status]));
  check('los invitados ven la sala (lista del anfitrión por el enlace)', G.every(g => ro(g).length === 4), G.map(g => ro(g).length));
  const r0 = G.map(g => g.reads.GET + g.reads.POST);
  await sleep(4000);
  const r1 = G.map(g => g.reads.GET + g.reads.POST);
  check('con el enlace abierto los invitados ya no leen Firestore', r1.every((v, i) => v === r0[i]), [r0, r1]);
  const roomDoc = await owner('GET', 'rooms/uidH');
  check('cnt de la sala = 3 (invitados conectados)', roomDoc.j && roomDoc.j.fields.cnt && roomDoc.j.fields.cnt.integerValue === '3', roomDoc.j && roomDoc.j.fields.cnt);
  // sentarse y levantarse
  const g3 = G[2], me3 = mem(H, 'uidG3');
  g3.NL._act('chair', me3.c);   // (su sitio: se levanta)
  await until(() => mem(H, 'uidG3').c === -1, 3000);
  check('un invitado se levanta (lb-sit -1) y el anfitrión lo ve de pie', mem(H, 'uidG3').c === -1);
  check('con alguien de pie no se puede empezar', !H.st().mx.can.ok, H.st().mx.can);
  g3.NL._act('chair', me3.c); await until(() => mem(H, 'uidG3').c === me3.c, 3000);
  check('vuelve a sentarse', mem(H, 'uidG3').c === me3.c);
  await until(() => G.every(g => { const m = mem(g, g.uid); return m && m.c >= 0; }), 3000);   // (cada uno se ve sentado antes de «Listo»)
  G.forEach(g => g.NL._act('ready'));
  await until(() => H.st().mx.can.ok, 3000);
  check('todos listos: «Empezar» habilitado', H.st().mx.can.ok, H.st().mx.can);
  H.NL._act('start');
  const go = await until(() => H.started.length && G.every(g => g.started.length), 5000);
  check('«Empezar»: startOnline en las 4 páginas', !!go, [H.started.length].concat(G.map(g => g.started.length)));
  if (go) {
    const hs = H.started[0];
    check('anfitrión: seat 0, 3 enlaces, 4 humanos, opts 2v2 con humans por plaza', hs.seat === 0 && hs.links.length === 3 && hs.humans.length === 4 && hs.opts && hs.opts.format === '2v2' && hs.opts.humans.length === 4 && hs.model === 'precisa' && hs.format === '2v2',
      { seat: hs.seat, links: hs.links.length, model: hs.model, fmt: hs.format });
    check('plaza 0 = anfitrión (equipo 0); equipos por sitio', hs.humans[0].name === 'Ana Host' && hs.humans[0].team === 0 && hs.humans.filter(h => h.team === 1).length === 2, hs.humans);
    check('opts: venue beach, seed, sin atributos raros', hs.opts.venue === 'beach' && hs.opts.seed > 0 && hs.opts.online === true);
    const seats = G.map(g => g.started[0].seat);
    check('invitados: plaza propia (1-3, distintas), 1 enlace, opts null y expect', seats.slice().sort().join() === '1,2,3' && G.every(g => g.started[0].links.length === 1 && g.started[0].opts === null && g.started[0].expect && g.started[0].expect.venue === 'beach'), seats);
    check('todos ven los mismos humanos (nombres y equipos)', G.every(g => JSON.stringify(g.started[0].humans.map(h => [h.name, h.team, h.idx])) === JSON.stringify(hs.humans.map(h => [h.name, h.team, h.idx]))));
    check('el enlace del anfitrión k es el de la plaza k+1', hs.links.every((k, i) => { const gi = G.findIndex(g => g.started[0].seat === i + 1); return k.peer === G[gi].started[0].links[0]; }));
    const rd = await owner('GET', 'rooms/uidH');
    check('la sala pasa a «play»', rd.j && rd.j.fields.state.stringValue === 'play', rd.j && rd.j.fields.state);
    // caída en pleno partido: se renegocia esa pareja
    const k1 = hs.links[0], o1 = k1.opens;
    k1._kill();
    const back = await until(() => k1.state === 'open' && k1.opens > o1, 20000);
    check('una caída en pleno partido se renegocia sola (oferta gen+1 por la misma pareja)', !!back, { state: k1.state, opens: k1.opens });
    // fin: main.js cierra los enlaces → la sala se borra
    hs.links.forEach(k => k.close()); G.forEach(g => g.started[0].links[0].close());
    await sleep(600);
    const gone = await owner('GET', 'rooms/uidH');
    check('al cerrar todos los enlaces (fin del partido) la sala se borra y el lobby vuelve a la lista', gone.status === 404 && !H.st().mx && H.st().view === 'list', gone.status);
  }
}

/* ---------- b) 6 contra 6 ---------- */
async function test6v6() {
  console.log('\nb) 6 contra 6: puesto preferido, invitado que no conecta, sacar, salir, mover, cambiar equipos');
  await wipe();
  const H = page('Hugo Seis', 'uidS0', { ls: { 'make-the-cut.role6': 'S' }, q: '&netconnms=6000' });
  const G = [page('Ines Uno', 'uidS1', { ls: { 'make-the-cut.role6': 'S' } }), page('Juan Dos', 'uidS2'), page('Kira Tres', 'uidS3', { ls: { 'make-the-cut.role6': 'MB' } }),
    page('Leo Bloq', 'uidS4', { block: true, q: '&netconnms=6000' }), page('Mia Cinco', 'uidS5'), page('Nico Seis', 'uidS6')];
  H.NL._act('create', { fmt: '6v6', venue: 'beach', bo: 3, pts: 25 });
  await until(() => H.st().mx && H.st().room.multi, 8000);
  check('sala de 6 contra 6: cap 12, siempre en Pabellón, model host', H.st().room.cap === 12 && H.st().room.fmt === '6v6' && (await owner('GET', 'rooms/uidS0')).j.fields.venue.stringValue === 'hall');
  check('el anfitrión con puesto preferido Colocador: sitio 0 (S del equipo A)', mem(H, 'uidS0').c === 0, mem(H, 'uidS0'));
  G[0].NL._act('join', 'uidS0');   // (Inés la primera: su sitio no depende del orden en que conecten los demás)
  await until(() => mem(H, 'uidS1') && mem(H, 'uidS1').ok, 15000);
  G.slice(1).forEach(g => g.NL._act('join', 'uidS0'));
  const ok5 = await until(() => ro(H).filter(m => m.ok).length === 6, 20000);
  check('5 invitados conectan; el bloqueado sigue «conectando»', !!ok5 && mem(H, 'uidS4') && !mem(H, 'uidS4').ok, ro(H).map(m => m.n + ':' + m.ok));
  const s1 = mem(H, 'uidS1'), s3 = mem(H, 'uidS3');
  check('preferencias: Inés (S) al equipo B de colocadora (sitio 6), Kira (MB) a central', s1 && s1.c === 6 && s3 && [2, 5, 8, 11].indexOf(s3.c) >= 0, [s1 && s1.c, s3 && s3.c]);
  const rel = await until(() => !mem(H, 'uidS4'), 12000);
  check('el que nunca conecta se suelta a los CONNECT_MS (su sitio, la IA) sin rehacer la sala', !!rel && H.st().mx && H.st().view === 'room');
  await sleep(500);
  const seats = await seatsOf('uidS0');
  check('y se le levanta de la sala (kick)', seats && seats.indexOf('uidS4') < 0, seats);
  const g4 = G[3];
  await until(() => !g4.st().mx, 15000);
  check('el bloqueado vuelve a la lista con un aviso', !g4.st().mx && /conectar|sitio|responde/.test(g4.st().msg), g4.st().msg);
  // sacar a alguien
  H.NL._act('pick', 'uidS6'); H.NL._act('kick');
  await until(() => !G[5].st().mx, 5000);
  check('sacar: el anfitrión elige y saca; el sacado vuelve a la lista con «te ha sacado»', !mem(H, 'uidS6') && !G[5].st().mx && /sacado/.test(G[5].st().msg), G[5].st().msg);
  // salir
  G[4].NL._act('leave');
  await until(() => !mem(H, 'uidS5'), 5000);
  check('un invitado sale (lb-bye): fuera de la lista del anfitrión', !mem(H, 'uidS5'));
  await sleep(600);
  check('y de la sala (leaveMulti)', (await seatsOf('uidS0')).indexOf('uidS5') < 0);
  // mover: elegir a Juan y ponerlo en el sitio 4 (OH2 del equipo A); cambiar equipos
  const j0 = mem(H, 'uidS2').c, tgt = [4, 3, 1].filter(c => !ro(H).some(m => m.c === c))[0];
  H.NL._act('pick', 'uidS2'); H.NL._act('chair', tgt);
  await until(() => mem(G[1], 'uidS2') && mem(G[1], 'uidS2').c === tgt, 3000);
  check('mover: el anfitrión pone a Juan en otro sitio y Juan lo ve', mem(H, 'uidS2').c === tgt && mem(G[1], 'uidS2').c === tgt, [j0, tgt]);
  const before = ro(H).map(m => [m.u, m.c]);
  H.NL._act('swap');
  await sleep(300);
  check('cambiar equipos: cada uno al mismo puesto del otro lado', before.every(([u, c]) => { const m = mem(H, u); return c < 0 ? m.c < 0 : m.c === (c + 6) % 12; }));
  [G[0], G[1], G[2]].forEach(g => g.NL._act('ready'));
  await until(() => H.st().mx.can.ok, 3000);
  H.NL._act('start');
  const go = await until(() => H.started.length && [G[0], G[1], G[2]].every(g => g.started.length), 5000);
  check('«Empezar» con 4 humanos (los demás sitios, la IA)', !!go && H.started[0].humans.length === 4 && H.started[0].links.length === 3);
  if (go) {
    const hs = H.started[0];
    check('6v6: model host, format 6v6, idx 0-5 por puesto', hs.model === 'host' && hs.format === '6v6' && hs.opts.format === '6v6' && hs.humans.every(h => h.idx >= 0 && h.idx <= 5), hs.humans);
    check('los invitados: model host y su plaza', [G[0], G[1], G[2]].every(g => g.started[0].model === 'host' && g.started[0].seat >= 1 && g.started[0].format === '6v6'));
  }
  [H].concat(G).forEach(p => { try { p.NL._act('leave'); } catch (e) { } });
  if (go) { H.started[0].links.forEach(k => k.close()); }
  await sleep(300);
}

/* ---------- c) Carrera cooperativa ---------- */
async function testCoop() {
  console.log('\nc) Carrera cooperativa (VB.NetLobby.coop)');
  await wipe();
  const H = page('Olga Coop', 'uidC0'), G = page('Pepe Coop', 'uidC1');
  const got = { h: null, g: null, hClose: null, gClose: null, hMsg: [], gMsg: [] };
  H.NL.coop.onMessage(m => got.hMsg.push(m)); G.NL.coop.onMessage(m => got.gMsg.push(m));
  const okH = H.NL.coop.host({ title: 'Carrera', name: 'Olga Coop', look: null, venue: 'beach', onReady: i => { got.h = i; }, onClose: w => { got.hClose = w; } });
  check('coop.host abre', okH === true);
  const code = await until(() => H.NL.coop.state().code, 8000);
  check('sala coop con código', !!code, H.NL.coop.state());
  const other = page('Quim Lista', 'uidC9'); await until(() => other.c.VB.NetRoom, 100);
  const tok = (u) => { const b = o => Buffer.from(JSON.stringify(o)).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_'); const t = Math.floor(Date.now() / 1000); return b({ alg: 'none', typ: 'JWT' }) + '.' + b({ iss: 'https://securetoken.google.com/' + PROJECT, aud: PROJECT, auth_time: t, user_id: u, sub: u, iat: t, exp: t + 3600, firebase: { identities: {}, sign_in_provider: 'password' } }) + '.'; };
  const lister2 = other.c.VB.NetRoom.create({ base: BASE, ver: other.NL._ver(), auth: async () => ({ uid: 'uidC9', token: tok('uidC9') }) });
  const lst = await lister2.list().catch(e => 'err ' + e.code);
  check('la sala coop NO sale en la lista', Array.isArray(lst) && !lst.some(r => r.id === 'uidC0'), Array.isArray(lst) ? lst.map(r => r.id) : lst);
  const okG = G.NL.coop.join({ code: code, name: 'Pepe Coop', look: null, onReady: i => { got.g = i; }, onClose: w => { got.gClose = w; } });
  check('coop.join entra por código', okG === true);
  const rdy = await until(() => got.h && got.g, 20000);
  check('onReady en los dos', !!rdy);
  if (!rdy) return;
  check('plazas 0 / 1 y nombres [anfitrión, invitado]', got.h.seat === 0 && got.g.seat === 1 && got.h.names.join() === 'Olga Coop,Pepe Coop' && got.g.names.join() === 'Olga Coop,Pepe Coop', [got.h.names, got.g.names]);
  check('room: id, code y mode coop', got.g.room.id === 'uidC0' && got.g.room.code === code && got.g.room.mode === 'coop');
  const big = { t: 'snap', s: 'x'.repeat(50000) + 'ñ€', arr: [1, 2, 3] };
  const gk = got.g.link._real(), c0 = gk.ctlOut;
  check('coop.send', G.NL.coop.send(big) === true);
  await until(() => got.hMsg.length, 3000);
  check('un mensaje de 50 KB llega entero y en orden (troceado)', got.hMsg.length === 1 && got.hMsg[0].s === big.s && got.hMsg[0].arr.join() === '1,2,3', got.hMsg.length);
  check('va en piezas ≤ 16 KB', gk.ctlOut - c0 >= 13, gk.ctlOut - c0);
  H.NL.coop.send({ t: 'hola' }); await until(() => got.gMsg.length, 2000);
  check('y al revés (anfitrión → invitado)', got.gMsg.length === 1 && got.gMsg[0].t === 'hola');
  // la fachada: la sesión la lee; no ve los mensajes del lobby ni los de la app; su close() no cierra el enlace
  const F = got.h.link;
  F.poll();
  got.g.link.send('ctl', JSON.stringify({ k: 'hello', ep: 0 }));
  G.NL.coop.send({ t: 'durante' });
  await sleep(200);
  const seen = F.poll();
  check('fachada: la sesión solo ve sus mensajes (no los del lobby)', seen.length === 1 && JSON.parse(seen[0].data).k === 'hello', seen.map(m => m.data.slice(0, 30)));
  check('fachada: los mensajes de la app siguen llegando durante el partido', got.hMsg.some(m => m.t === 'durante'));
  F.close();
  check('fachada: close() no cierra el enlace de verdad', F._real().state === 'open' && got.h.link.state === 'open');
  await sleep(2500);
  check('tras el partido el latido sigue (no se da por caído)', got.hClose === null && got.gClose === null, [got.hClose, got.gClose]);
  G.NL.coop.close();
  await until(() => got.hClose, 4000);
  check('el compañero sale: onClose en el anfitrión', got.hClose === 'mateLeft', got.hClose);
  await sleep(500);
  check('y la sala coop se cierra', (await owner('GET', 'rooms/uidC0')).status === 404);
}

/* ---------- d) reglas sin desplegar ---------- */
async function testDenied() {
  console.log('\nd) reglas del esquema v3 sin desplegar');
  await wipe();
  const f403 = (u, o) => (o && o.method === 'POST' && /:commit$/.test(u) && /"cap"/.test(o.body || '')) ? Promise.resolve(new Response(JSON.stringify({ error: { message: 'Missing or insufficient permissions.' } }), { status: 403 })) : fetch(u, o);
  const H = page('Rosa Vieja', 'uidD0', { fetch: f403 });
  H.NL._act('create', { fmt: '2v2' });
  await until(() => H.st().msg, 6000);
  check('crear 2 contra 2 → «Las salas de varios aún no están activadas»', /salas de varios aún no están activadas/.test(H.st().msg) && !H.st().mx, H.st().msg);
  H.NL._act('create', { fmt: '1v1' });
  await until(() => H.st().view === 'room', 6000);
  check('el 1 contra 1 sigue funcionando', H.st().view === 'room' && H.st().role === 'host' && !H.st().room.multi);
  H.NL._act('leave'); await sleep(300);
  // coop sin reglas: onClose('denied')
  let why = null;
  H.NL.coop.host({ name: 'Rosa', onClose: w => { why = w; } });
  await until(() => why, 6000);
  check('coop.host sin reglas → onClose(«denied»)', why === 'denied', why);
}

/* ---------- e) 1 contra 1 por el lobby y cliente 1.21.0 ---------- */
async function test1v1() {
  console.log('\ne) 1 contra 1 por el lobby (sin cambios) y un cliente L2');
  await wipe();
  const H = page('Sara Uno', 'uidE0'), G = page('Tomas Uno', 'uidE1');
  H.NL._act('create', { fmt: '1v1', venue: 'hall', pts: 15 });
  await until(() => H.st().view === 'room', 6000);
  check('sala 1 contra 1 (sin cap)', H.st().view === 'room' && !H.st().room.multi && !H.st().mx);
  check('versión de sala con L3', /\|L3$/.test(H.NL._ver()), H.NL._ver());
  G.NL._act('join', 'uidE0');
  const go = await until(() => H.started.length && G.started.length, 20000);
  check('pre y startOnline como siempre (slot 0/1, link, rivalName)', !!go && H.started[0].slot === 0 && G.started[0].slot === 1 && !!H.started[0].link && G.started[0].rivalName === 'Sara Uno' && H.started[0].opts.points === 15,
    go ? { h: [H.started[0].slot, H.started[0].rivalName], g: [G.started[0].slot, G.started[0].rivalName] } : null);
  if (go) { H.started[0].link.close(); G.started[0].link.close(); }
  await sleep(300);
  // un 1.21.0 (lobby L2) ve una sala de varios como «otra versión» y no puede entrar
  await wipe();
  const M = page('Ulises Multi', 'uidE2');
  M.NL._act('create', { fmt: '2v2' });
  await until(() => M.st().mx, 6000);
  const NR = M.c.VB.NetRoom, tk = u => { const b = o => Buffer.from(JSON.stringify(o)).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_'); const t = Math.floor(Date.now() / 1000); return b({ alg: 'none', typ: 'JWT' }) + '.' + b({ iss: 'https://securetoken.google.com/' + PROJECT, aud: PROJECT, auth_time: t, user_id: u, sub: u, iat: t, exp: t + 3600, firebase: { identities: {}, sign_in_provider: 'password' } }) + '.'; };
  const old = NR.create({ base: BASE, ver: M.NL._ver().replace(/\|L3$/, '|L2'), auth: async () => ({ uid: 'uidOld', token: tk('uidOld') }) });
  const L = await old.list().catch(e => 'err ' + e.code);
  const r = Array.isArray(L) && L.filter(x => x.id === 'uidE2')[0];
  check('un cliente con el lobby de 1.21.0 (L2) la ve como «otra versión»', !!r && r.other === true, Array.isArray(L) ? L.map(x => [x.id, x.other]) : L);
  check('y no puede entrar', (await old.join('uidE2', 'Viejo').then(() => 'ok', e => e.code)) === 'version');
  M.NL._act('leave'); await sleep(300);
}

(async () => {
  const jar = findJar();
  if (!jar) { console.log('Sin emulador de Firestore (Java + jar): npx firebase-tools@13.29.1 setup:emulators:firestore'); process.exit(3); }
  try { await fetch('http://127.0.0.1:' + PORT + '/'); console.log('El puerto ' + PORT + ' ya está ocupado.'); process.exit(3); } catch (e) { }
  const java = spawn('java', ['-Xmx384m', '-jar', jar, '--host', '127.0.0.1', '--port', String(PORT), '--rules', path.join(ROOT, 'firebase', 'firestore.rules'), '--project_id', PROJECT], { stdio: 'ignore', windowsHide: true });
  process.on('exit', () => killTree(java));
  let up = false;
  for (let i = 0; i < 120 && !up; i++) { await sleep(500); try { up = (await fetch('http://127.0.0.1:' + PORT + '/')).status < 500; } catch (e) { } }
  if (!up) { check('el emulador arranca', false); process.exit(1); }
  const T = { a: test2v2, b: test6v6, c: testCoop, d: testDenied, e: test1v1 };
  for (const k of Object.keys(T)) {
    if (ONLY && ONLY.indexOf(k) < 0) continue;
    try { await T[k](); } catch (e) { check('parte ' + k + ' sin excepciones', false, String(e && e.stack || e)); }
  }
  killTree(java);
  console.log('\n' + (fails ? '== lobbytest: ' + fails + ' FALLOS (' + oks + ' ok) ==' : '== lobbytest OK (' + oks + ' comprobaciones) =='));
  process.exit(fails ? 1 : 0);
})();
