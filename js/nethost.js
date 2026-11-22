/* =====================================================================
 * TAKE THE COURT — js/nethost.js   (owner: net, P5 del sprint online-multi; notes/online-multi-brief.md §3 recomendación 3, §9)
 * Online de varios con AUTORIDAD DEL ANFITRIÓN y TU JUGADOR TUYO («modelo host»): 6v6 con 2-12 humanos y, como opción, 2v2 × 4.
 * Misma fachada que VB.Net.Session (main.js la usa con model: 'host'; notes/online-multi-requests.md P4 → P5).
 *
 * Reparto (estrella: cada invitado solo habla con el anfitrión; ninguna carga de servidor durante el partido):
 *   - El anfitrión (plaza 0) corre la partida de verdad (sim.js mhStep): la IA de todas las plazas sin humano, el balón entre toques
 *     humanos, la rotación, el líbero, el marcador y el árbitro. Los jugadores de los invitados NO se simulan allí: su pose llega
 *     por 'in' (60 Hz) y se extrapola al tic del anfitrión; sus toques llegan por 'ctl' con su sello (tic y medio paso) y se
 *     aplican con Sim.nhApplyTc (vuelo con reglas desde el contacto hasta ahora; si el anfitrión tocó antes, gana el anterior).
 *     Plausibilidad: el toque debe ser del jugador de esa plaza, a ≤ PLAUS_R m de su pose y del mismo rally.
 *   - Cada invitado simula SOLO su jugador (retraso de entrada 0; Sim.nhStep). Los demás se pintan interpolados (Hermite, colchón
 *     Dt como en Fluida); el balón vuela fantasma desde el último contacto conocido (presente) y se PINTA con un reloj deformado:
 *     va con el retraso de los demás cuando lo van a tocar otros y llega al presente cuando viene hacia ti, sin teletransportes.
 *   - Paquete del anfitrión a 30 Hz por 'in' (no fiable): las poses de los jugadores en pista (22 B cada uno: 12 + 12·22 = 276 B,
 *     < 1200 B). Por 'ctl' (fiable, en orden): contactos (tc), lanzamientos del saque, eventos de la sim y la FOTO entera de la
 *     partida (Sim.serialize, en trozos de ≤ 15 KB) en cada cambio de modo salvo saque → peloteo (punto, saque preparado, revisión,
 *     tiempo muerto): marcador, rotación, líbero y árbitro quedan siempre como en el anfitrión.
 *   - Punto salvable: si el balón va a botar con un invitado cerca, el anfitrión guarda una copia (copyGame) justo antes y retiene
 *     lo que manda del punto hasta HOLD_MAX ms (la ida de ese invitado + 40): si llega su toque con un sello anterior al bote, vuelve
 *     a la copia, aplica el toque y rehace los tics (sin el punto). La plancha del último momento no se pierde por la latencia.
 *   - Un invitado que se va (bye, o GONE ms sin oírle): su plaza pasa a la IA (Sim.setSlotAI) para el resto del partido; callado
 *     SILENT_AI ms, la IA la lleva hasta que vuelva (en el siguiente balón muerto).
 *
 * Fachada: new VB.NetHost.Session({slot (TU plaza; 0 = anfitrión), link, links, seats: [{team, idx, role, name}…], names, opts
 *   (solo el anfitrión), name, epoch, warm, log}) → advance(now, inp) → r {status 'connecting'|'starting'|'playing'|'waiting'|
 *   'over'|'ended', g, events, confirmed, app, ping, pings[s], waitFor[s], canAI, startIn, waitMs, result, unstable}, predictedGame(),
 *   confirmedGame(), request('skip'|'chal'|'tmo'), setAway(on), quit(), sendApp(d), vsAI() (false: la IA ya lleva las plazas vacías),
 *   initEvents, stats {resyncs, rsIn, …}, hstats (métricas del modelo), seatGone(s), repaired, rivalName, result, valid.
 *   result.win por EQUIPO (gameOver.team === tu equipo).
 * Pruebas: tools/hosttest.js (partido 6v6 entero sin cabeza, 12 plazas) y el adaptador 'host6' de tools/net4test.js / net12test.js.
 * ===================================================================== */
(function () {
  'use strict';
  var root = (typeof window !== 'undefined') ? window : globalThis;
  var VB = root.VB = root.VB || {};

  var HZ = (VB.C && VB.C.SIM_HZ) || 120, STEP = 1 / HZ, STEP_MS = 1000 / HZ;
  var PROTO = 'H1';
  /** Constantes (ms salvo que diga tics de 1/120 s o m). */
  var C = {
    BUNDLE: 4, POSE: 2,                  // tics entre paquetes del anfitrión (30 Hz) y entre poses del invitado (60 Hz)
    D_MIN: 5, D_MAX: 24, EXTRAP: 12,     // colchón de interpolación (tics, además de la ida) y extrapolación máxima (tics)
    MAXCATCH: 30,                        // tics por frame como mucho (más atrás: se salta T, sin ráfagas; el reloj t0 no se toca)
    LATE_MAX: 60,                        // tics: tope de la media de retraso de los paquetes en el colchón Dp (un desfase raro no lo infla)
    HOLD_MAX: 160, RESCUE_R: 3.2,        // retención de un punto salvable y radio del invitado que puede salvarlo (m)
    PLAUS_R: 3.5, TC_OLD: 90,            // plausibilidad de un toque: distancia a su pose (m) y antigüedad máxima (tics)
    PING: 500, PING_FAST: 120, SILENT_AI: 2000, GONE: 20000, WAIT: 1000, HOST_GONE: 20000,
    START_MS: 1500, CONNECT_MS: 20000, READY_MS: 12000, WARM_CAP: 5000,
    FS_CHUNK: 15000, LAG_K: 10, RATE_MIN: 0.6, RATE_MAX: 1.5, BALL_TAU: 80, BLEND_P: 60,
    EV_LATE: 30                          // tics: un evento de sonido que llega más tarde que esto respecto a su pintado sale ya
  };
  var NOIN = { move: [0, 0], hit: false, jump: false, jset: false, skip: false, ai: false };
  var T_BUNDLE = 5, T_POSE = 6;          // tipos de paquete 'in' (nibble bajo; el alto, la época)
  var ACTS = ['', 'pass', 'set', 'spike', 'free', 'serve', 'block', 'swing', 'jump', 'toss', 'dive'];
  var SHOTS = ['', 'tip', 'roll', 'jset', 'body', 'float', 'jump', 'dive', 'tool', 'stuff', 'soft', 'feint', 'dig', 'hard', 'quick', 'power', 'kill', 'shank', 'over'];
  var GRADES = ['', 'perfect', 'good', 'poor'];
  var OTHER = 255, PL_B = 21, BH = 12, GH = 9;
  // eventos que suenan o se ven en el balón: el invitado los presenta cuando su balón pintado llega a ese tic
  var SENSORY = { hit: 1, block: 1, blockPress: 1, land: 1, landPlayer: 1, net: 1, netTouch: 1, bounce: 1, dive: 1, toss: 1, jump: 1, swing: 1, miss: 1, juggle: 1, dribble: 1, feint: 1 };
  // eventos de mi jugador que no se mandan con mi toque (solo pose)
  var OWN_SKIP = { swing: 1, jump: 1, land: 1, landPlayer: 1, bounce: 1, whistle: 1, serveReady: 1 };

  function Sim() { return VB.Sim; }
  function clampN(v, a, b) { return v < a ? a : v > b ? b : v; }
  function enumIx(tab, v) { var i = tab.indexOf(v == null ? '' : v); return i < 0 ? OTHER : i; }
  function enumOf(tab, i) { return i < tab.length ? tab[i] : undefined; }
  function i16(v) { v = Math.round(v); return v !== v ? 0 : v > 32767 ? 32767 : v < -32768 ? -32768 : v; }
  function u8(v) { v = Math.round(v); return v !== v || v < 0 ? 0 : v > 255 ? 255 : v; }
  function cleanName(n) { n = String(n == null ? '' : n).replace(/[\u0000-\u001f<>]/g, '').trim(); return n.slice(0, 24); }
  function isPlayer(v) { return v && typeof v === 'object' && !Array.isArray(v) && typeof v.id === 'number' && (v.team === 0 || v.team === 1) && v.st !== undefined; }
  function encEv(e) {
    var o = {}, k, v;
    for (k in e) {
      v = e[k];
      if (typeof v === 'function') continue;
      if (isPlayer(v)) { o[k] = { $p: v.id }; continue; }
      if (v && typeof v === 'object') { try { o[k] = JSON.parse(JSON.stringify(v, function (kk, vv) { return isPlayer(vv) ? { $p: vv.id } : vv; })); } catch (err) { } continue; }
      o[k] = v;
    }
    return o;
  }
  function byId(g, id) {
    var P = g.players, i, t;
    for (i = 0; i < P.length; i++) if (P[i].id === id) return P[i];
    if (g.libero) for (t = 0; t < 2; t++) if (g.libero[t] && g.libero[t].id === id) return g.libero[t];
    if (g.roster) for (t = 0; t < 2; t++) for (i = 0; i < g.roster[t].length; i++) if (g.roster[t][i].id === id) return g.roster[t][i];
    return null;
  }
  function decEv(o, g) {
    var e = {}, k, v;
    for (k in o) { v = o[k]; e[k] = v && typeof v === 'object' && !Array.isArray(v) && typeof v.$p === 'number' ? byId(g, v.$p) : v; }
    return e;
  }
  function u8a(d) { return d instanceof Uint8Array ? d : d && d.byteLength !== undefined ? new Uint8Array(d) : null; }

  /* ---------- pose de un jugador (21 B, el formato de las fotos de Fluida) ---------- */
  function poseOut(g, p, q, isH, seat) {
    var S = Sim(), pr = p.pressEnd > g.time ? (p.pressEnd - g.time) * HZ : 0, sl = isH && S.slotGet(g, seat, 'swingLive');
    q.x = p.x; q.y = p.y; q.z = p.z; q.vx = p.vx; q.vy = p.vy; q.vz = p.vz; q.anim = p.anim; q.act = enumIx(ACTS, p.lastAction);
    q.age = p.actionT * HZ; q.shot = enumIx(SHOTS, p.shot); q.grade = enumIx(GRADES, p.grade);
    q.bits = (p.onGround ? 1 : 0) | (p.down > 0 ? 2 : 0) | (sl ? 4 : 0) | (isH ? 8 : 0) | (pr > 0 ? 16 : 0) | (p.cool > 0 ? 32 : 0);
    q.down = p.down; q.press = pr; q.sw = isH ? enumIx(SHOTS, S.slotGet(g, seat, 'swingShot')) : 0;
    return q;
  }
  function poseW(dv, u, k, p) {
    dv.setInt16(k, i16(p.x * 1000), true); dv.setInt16(k + 2, i16(p.y * 1000), true); dv.setInt16(k + 4, i16(p.z * 1000), true);
    dv.setInt16(k + 6, i16(p.vx * 100), true); dv.setInt16(k + 8, i16(p.vy * 100), true); dv.setInt16(k + 10, i16(p.vz * 100), true);
    u[k + 12] = u8(p.anim * 600); u[k + 13] = p.act; u[k + 14] = u8(p.age); u[k + 15] = p.shot; u[k + 16] = p.grade;
    u[k + 17] = p.bits; u[k + 18] = u8(p.down * 100); u[k + 19] = u8(p.press); u[k + 20] = p.sw;
  }
  function poseR(dv, u, k) {
    return { x: dv.getInt16(k, true) / 1000, y: dv.getInt16(k + 2, true) / 1000, z: dv.getInt16(k + 4, true) / 1000,
      vx: dv.getInt16(k + 6, true) / 100, vy: dv.getInt16(k + 8, true) / 100, vz: dv.getInt16(k + 10, true) / 100,
      anim: u[k + 12] / 600, act: u[k + 13], age: u[k + 14], shot: u[k + 15], grade: u[k + 16], bits: u[k + 17],
      down: u[k + 18] / 100, press: u[k + 19], sw: u[k + 20] };
  }
  /** Campos discretos de una pose recibida (e = s desde su tic Ts) en o (los que nhPose escribe). */
  function discrete(o, q, Ts, e) {
    o.anim = Math.max(0, q.anim - e);
    o.lastAction = enumOf(ACTS, q.act); o.actionT = q.age * STEP + e;
    o.shot = enumOf(SHOTS, q.shot); o.grade = enumOf(GRADES, q.grade);
    o.onGround = !!(q.bits & 1) && o.z <= 0;
    o.down = Math.max(0, q.down - e);
    o.pressEnd = (q.bits & 16) ? (Ts + q.press) * STEP : -9;
    o.cool = (q.bits & 32) ? Math.max(0, 0.1 - e) : 0;
    if (q.bits & 8) { o.swingLive = !!(q.bits & 4); var sw = enumOf(SHOTS, q.sw); o.swingShot = sw !== undefined ? sw : ''; }
    else { o.swingLive = undefined; o.swingShot = undefined; }
  }
  /** Extrapolación de una pose q (de su tic Ts) e s hacia delante (balística en el aire; amortiguada en el suelo). */
  function extrap(o, q, Ts, e) {
    var G = (VB.C && VB.C.G) || 9, air = q.z > 0 || !(q.bits & 1), kk = 0.15 * (1 - Math.exp(-e / 0.15));
    if (air) {
      o.x = q.x + q.vx * e; o.y = q.y + q.vy * e; o.z = q.z + q.vz * e - 0.5 * G * e * e; o.vz = q.vz - G * e;
      if (o.z <= 0) { o.z = 0; o.vz = 0; }
    } else { o.x = q.x + q.vx * kk; o.y = q.y + q.vy * kk; o.z = 0; o.vz = 0; }
    o.vx = q.vx; o.vy = q.vy; o.jvx = 0; o.jvy = 0;
    discrete(o, q, Ts, e);
    return o;
  }

  // lo que mi jugador conserva al llegar una foto que no es la del saque (la sim de mi jugador es mía)
  var KEEP = ['x', 'y', 'z', 'vx', 'vy', 'vz', 'jvx', 'jvy', 'avx', 'avy', 'anim', 'lastAction', 'actionT', 'shot', 'grade', 'onGround', 'down', 'pressEnd', 'cool'];

  /* ---------- Sesión ---------- */
  function Session(o) {
    o = o || {};
    this.model = 'host';
    this.slot = this.seat = Math.max(0, o.slot | 0); this.host = this.slot === 0;
    this.links = o.links && o.links.length ? o.links.slice() : o.link ? [o.link] : [];
    this.link = this.links[0] || null;
    this.seats = Array.isArray(o.seats) ? o.seats.map(function (h) { return { team: h && h.team, idx: h && h.idx, role: h && h.role, name: cleanName(h && h.name) }; }) : [];
    this.names = Array.isArray(o.names) ? o.names.map(cleanName) : this.seats.map(function (h) { return h.name; });
    this.name = cleanName(o.name); this.rivalName = '';
    this.epoch = Math.max(0, Math.min(1e6, o.epoch | 0));
    this.log = typeof o.log === 'function' ? o.log : null;
    this.warmFn = typeof o.warm === 'function' ? o.warm : null;
    this.status = 'connecting'; this.result = null; this.valid = true; this.goneFlag = false; this.rivalLeft = false;
    this.solo = false; this.rivalSolo = false; this.back = !!o.back; this.repaired = 0; this.maxCatch = 0; this.away = false;
    this.opts = null; this.g = null; this.gs = null; this.T = 0; this.gcTick = 0; this.rsT = -1;
    this.t0 = 0; this.t0h = 0; this.off = 0; this.offOk = false; this.lastNow = 0; this.startAt = -1; this.createdAt = -1;
    this.appIn = []; this.initEvents = []; this.gone = {}; this.edges = 0;
    this.stats = { frames: 0, steps: 0, sent: 0, recv: 0, bytesOut: 0, bytesIn: 0, resyncs: 0, rsIn: 0, depth: undefined, maxDepth: undefined };
    // métricas del modelo (pruebas y depuración)
    this.hstats = { tcIn: 0, tcOk: 0, tcFork: 0, tcRej: 0, tcBad: 0, rescues: 0, holds: 0, fsOut: 0, fsIn: 0, fsBytes: 0, bundles: 0,
      bundleMax: 0, poseIn: 0, tickUs: [], tcOut: 0, tcEcho: 0, tcLost: 0, tossIn: 0, bJump: 0, bJumpMax: 0, warpMax: 1, lagMax: 0,
      interpMs: 0, extrap: 0, dispFrames: 0, aiSeats: 0, lateC: 0, lateMax: 0, lateK: {}, blends: 0 };
    this.rtt = 0; this.pingAt = -1e9; this.pingN = 0; this.offS = [];
    this.peers = [];
    var self = this;
    this.links.forEach(function (l) { self.peers.push(self._peer(l)); });
    this.out = { g: null, events: [], confirmed: [], app: [], status: '', ping: 0, pings: [], waitFor: [], canAI: false, startIn: 0, waitMs: 0, result: null, unstable: false, tick: 0 };
    this._in = { move: [0, 0], hit: false, jump: false, jset: false, switchPlayer: false, skip: false, chal: false, tmo: false, ai: false };
    this._ins = [];
    this._evLocal = []; this._evQ = []; this._conf = [];
    this.outQ = []; this.hold = null; this.inRing = [];
    this.snaps = []; this.Dp = -1; this.lateL = []; this.chain = []; this.tau = -1; this.bOff = { x: 0, y: 0, z: 0 }; this.bLast = null;
    this.pend = null; this.lastHostTc = null; this.tcSeq = 0; this.fsBuf = null; this.srvN = 0; this.prevSS = ''; this.prevMode = '';
    this.lastSig = ''; this.poseScr = {}; this.seatRtt = []; this.pgAt = -1e9; this._sv = null; this.bLastT = -1; this.heardAt = -1; this.waitStart = -1;
    if (this.host && o.opts) this._setOpts(o.opts);
  }
  var SP = Session.prototype;
  SP._log = function (m) { if (this.log) this.log('[host ' + this.slot + '] ' + m); };
  SP._peer = function (l) { return { link: l, seat: -1, name: '', rtt: 0, heard: -1, hello: false, ready: false, gone: false, started: false, pose: null, bits: 0, pingAt: -1e9, ai: false }; };

  /** Opciones de la sim a partir de las de la sala: humanos de las plazas, formato y online. Crea la partida (y la copia de rescate). */
  SP._setOpts = function (opts) {
    var S = Sim(), n = {}, k, i;
    for (k in opts) n[k] = opts[k];
    var H = Array.isArray(n.humans) && n.humans.length >= this.seats.length ? n.humans : null;
    if (!H) {
      H = [];
      for (i = 0; i < Math.max(2, this.seats.length); i++) { var h = this.seats[i] || {}, q = {}; if (h.team === 0 || h.team === 1) q.team = h.team; if (h.idx === (h.idx | 0)) q.idx = h.idx; if (h.role) q.role = h.role; H.push(q); }
    }
    n.humans = H; n.online = true; n.net = 'host'; n.timeouts = false;
    if (n.format !== '6v6' && n.format !== '2v2') n.format = H.length > 4 ? '6v6' : '2v2';
    if (S.isMulti && !S.isMulti(n)) this._log('aviso: 2 plazas de 1 contra 1: este modelo es para el online de varios (usad Precisa o Fluida)');
    this.opts = n;
    this.g = S.createGame(n);
    var rem = []; for (i = 0; i < this.g.hum.length; i++) rem.push(i !== 0);
    S.nhInit(this.g, this.host, this.seat, rem);
    this.initEvents.length = 0; S.drainEvents(this.g, this.initEvents);
    if (this.host) { this.gs = S.createGame(n); S.nhInit(this.gs, true, 0, rem); this.gs.events.length = 0; this.gk = S.createGame(n); S.nhInit(this.gk, true, 0, rem); this.gk.events.length = 0; }
    this.T = 0; this.gcTick = 0; this.prevMode = this.g.mode; this.prevSS = this.g.serveState; this.lastSig = this._sig();
    this.myTeam = this.g.hum[this.seat] ? this.g.hum[this.seat].team : 0;
    var rv = []; for (i = 0; i < this.names.length; i++) if (i !== this.seat && this.g.hum[i] && this.g.hum[i].team !== this.myTeam && this.names[i]) rv.push(this.names[i]);
    this.rivalName = rv.join(', ');
    this._log('partida creada: ' + n.format + ', ' + this.g.hum.length + ' plazas');
  };
  SP.confirmedGame = function () { return this.g; };
  SP.predictedGame = function () { return this.g; };
  SP.stepInputs = function () { return null; };
  SP.seatGone = function (s) { return !!this.gone[s]; };
  SP.vsAI = function () { return false; };
  SP.setAway = function (on) { this.away = !!on; };
  SP.request = function (what) {
    if (what === 'skip') this.edges |= 1; else if (what === 'chal') this.edges |= 2; else if (what === 'tmo') this.edges |= 4;
  };
  SP.sendApp = function (d) {
    if (this.host) this._bcast({ k: 'app', d: d, s: 0 });
    else this._ctl(this.peers[0], { k: 'app', d: d });
  };
  SP.quit = function () {
    if (this.status === 'ended') return;
    var why = this.status === 'over' ? 'left' : 'quit';
    if (this.host) this._bcast({ k: 'bye', why: why }); else if (this.peers[0]) this._ctl(this.peers[0], { k: 'bye', why: why });
    if (this.status === 'connecting' || this.status === 'starting') this.result = { why: 'cancel', win: false };
    else if (this.status !== 'over') this.result = { why: 'quit', win: false };
    this.status = 'ended';
  };

  /* ---- envío ---- */
  SP._ctl = function (pe, m) {
    if (!pe || !pe.link || pe.gone) return;
    if (this.epoch) m.ep = this.epoch;
    var s; try { s = JSON.stringify(m); } catch (e) { return; }
    try { pe.link.send('ctl', s); } catch (e) { }
    this.stats.sent++; this.stats.bytesOut += s.length;
  };
  SP._ctlRaw = function (pe, s) { if (!pe || !pe.link || pe.gone) return; try { pe.link.send('ctl', s); } catch (e) { } this.stats.sent++; this.stats.bytesOut += s.length; };
  SP._bcast = function (m, skipSeat) {
    if (this.epoch) m.ep = this.epoch;
    var s; try { s = JSON.stringify(m); } catch (e) { return; }
    for (var i = 0; i < this.peers.length; i++) { var pe = this.peers[i]; if (pe.started && pe.seat !== skipSeat) this._ctlRaw(pe, s); }
  };
  SP._sendIn = function (pe, buf) {
    if (!pe || !pe.link || pe.gone) return;
    try { pe.link.send('in', buf); } catch (e) { }
    this.stats.sent++; this.stats.bytesOut += buf.length;
  };
  /** Cola de 'ctl' del anfitrión de este tic (tc, eventos, fotos): sale al final del frame, en un solo mensaje por invitado. */
  SP._q = function (m) { if (this.hold) this.hold.q.push(m); else this.outQ.push(m); };
  SP._flushQ = function () {
    if (!this.outQ.length) return;
    var L = this.outQ; this.outQ = [];
    var big = [], small = [], i;
    for (i = 0; i < L.length; i++) (L[i].k === 'fs' ? big : small).push(L[i]);
    if (small.length) this._bcast({ k: 'b', l: small });
    for (i = 0; i < big.length; i++) this._sendFs(big[i]);
  };
  SP._sendFs = function (f) {
    var d = f.d, n = Math.max(1, Math.ceil(d.length / C.FS_CHUNK)), id = ++this.fsId || (this.fsId = 1);
    for (var i = 0; i < n; i++) this._bcast({ k: 'fs', id: id, i: i, n: n, T: f.T, tele: f.tele ? 1 : 0, srv: f.srv, d: d.slice(i * C.FS_CHUNK, (i + 1) * C.FS_CHUNK) });
    this.hstats.fsOut++; this.hstats.fsBytes += d.length * this.peers.filter(function (p) { return p.started; }).length;
  };

  /* ---- recepción ---- */
  SP._recv = function (now) {
    for (var i = 0; i < this.peers.length; i++) {
      var pe = this.peers[i], L;
      try { L = pe.link.poll(now); } catch (e) { L = []; }
      for (var j = 0; j < L.length; j++) {
        var m = L[j]; this.stats.recv++;
        if (m.ch === 'in') { var u = u8a(m.data); if (u && u.length) { this.stats.bytesIn += u.length; this._onIn(pe, u, now); } continue; }
        var c = null;
        if (typeof m.data === 'string') { this.stats.bytesIn += m.data.length; try { c = JSON.parse(m.data); } catch (e) { } }
        else c = m.data;
        if (!c || typeof c !== 'object') continue;
        if ((c.ep | 0) !== this.epoch) continue;
        pe.heard = now; if (!this.host) this.heardAt = now;
        if (c.k === 'b' && Array.isArray(c.l)) { for (var k = 0; k < c.l.length; k++) this._onCtl(pe, c.l[k], now); }
        else this._onCtl(pe, c, now);
      }
    }
  };
  SP._onIn = function (pe, u, now) {
    if ((u[0] >> 4) !== (this.epoch & 15)) return;
    var type = u[0] & 15, dv = new DataView(u.buffer, u.byteOffset, u.byteLength);
    pe.heard = now; if (!this.host) this.heardAt = now;
    if (this.host && type === T_POSE && u.length >= GH + PL_B) {
      var q = poseR(dv, u, GH); q.T = dv.getUint32(1, true); q.r = u[5]; q.srv = u[6]; q.fl = u[7];
      if (!pe.pose || q.T > pe.pose.T) { pe.pose = q; this.hstats.poseIn++; }
      pe.ai = !!(q.fl & 1);
    } else if (!this.host && type === T_BUNDLE && u.length >= BH) {
      var n = u[8], o = { T: dv.getUint32(1, true), r: dv.getUint16(5, true), fl: u[7], srv: u[11], pl: {} }, k = BH;
      if (u.length < BH + n * (PL_B + 1)) return;
      for (var i = 0; i < n; i++) { o.pl[u[k]] = poseR(dv, u, k + 1); k += PL_B + 1; }
      this._onBundle(o, now);
    }
  };
  SP._onCtl = function (pe, c, now) {
    var S = Sim();
    switch (c.k) {
      case 'ping': this._ctl(pe, { k: 'pong', a: c.a, h: now }); return;
      case 'pong': this._pong(pe, c, now); return;
      case 'app': if (this.appIn.length < 64) this.appIn.push(c.d); if (this.host) this._bcast({ k: 'app', d: c.d, s: pe.seat }, pe.seat); return;
      case 'bye':
        if (this.host) { this._seatGone(pe, c.why || 'bye'); return; }
        if (this.status === 'over') { this.rivalLeft = true; return; }
        if (this.status !== 'ended') { this.status = 'ended'; this.valid = false; this.goneFlag = true; this.result = { why: 'hostGone', win: false }; }
        return;
    }
    if (this.host) this._hostCtl(pe, c, now); else this._guestCtl(pe, c, now);
  };

  /* ---- reloj (invitado: desfase con el anfitrión por el ping de RTT mínimo) ---- */
  SP._pong = function (pe, c, now) {
    var rtt = now - c.a; if (!(rtt >= 0) || rtt > 5000) return;
    pe.rtt = pe.rtt ? pe.rtt * 0.8 + rtt * 0.2 : rtt;
    if (!this.host) {
      this.rtt = pe.rtt;
      this.offS.push({ rtt: rtt, off: c.h + rtt / 2 - now }); if (this.offS.length > 24) this.offS.shift();
      var b = this.offS[0]; for (var i = 1; i < this.offS.length; i++) if (this.offS[i].rtt < b.rtt) b = this.offS[i];
      // P8 (netdrive de N páginas): antes de jugar, siempre la muestra de RTT mínimo (la primera puede venir de un parón de la página
      // al montar el partido: un pong leído 0,9 s tarde dejaba el reloj 0,45 s adelantado y, a 2 ms por pong, así todo el partido:
      // colchón de 0,5 s, toques que llegan «tarde» y saltos del balón de hasta 12 m). Jugando, sin saltos: 2 ms por pong, o el 10 %
      // del error si pasa de 40 ms (se corrige en unos segundos).
      var dOff = b.off - this.off;
      if (!this.offOk || this.status === 'connecting' || this.status === 'starting') this.off = b.off;
      else this.off += Math.abs(dOff) > 40 ? dOff * 0.1 : clampN(dOff, -2, 2);
      this.offOk = true;
    }
  };
  SP._pingAll = function (now) {
    var every = this.pingN < 10 ? C.PING_FAST : C.PING;
    for (var i = 0; i < this.peers.length; i++) {
      var pe = this.peers[i]; if (pe.gone || now - pe.pingAt < every) continue;
      pe.pingAt = now; this._ctl(pe, { k: 'ping', a: now });
    }
    if (now - this.pingAt >= every) { this.pingAt = now; this.pingN++; }
  };

  /* ================= ANFITRIÓN ================= */
  SP._hostCtl = function (pe, c, now) {
    var g = this.g, S = Sim();
    switch (c.k) {
      case 'hello': {
        var s = c.seat | 0;
        if (c.v !== PROTO || (VB.VERSION && c.ver && c.ver !== VB.VERSION)) { this._ctl(pe, { k: 'bye', why: 'version', rv: VB.VERSION || '' }); return; }
        if (!g || s <= 0 || s >= g.hum.length) { this._ctl(pe, { k: 'bye', why: 'seat' }); return; }
        for (var i = 0; i < this.peers.length; i++) if (this.peers[i] !== pe && this.peers[i].seat === s && !this.peers[i].gone) { this._ctl(pe, { k: 'bye', why: 'seat' }); return; }
        pe.seat = s; pe.hello = true; pe.name = cleanName(c.name) || this.names[s] || '';
        if (pe.gone) { pe.gone = false; delete this.gone[s]; }
        pe.started = true;
        this._ctl(pe, { k: 'start', opts: this.opts, seat: s, names: this.names });
        if (this.t0) {   // (vuelve o llega tarde: la partida de ahora y el reloj)
          this._ctl(pe, { k: 'go', t0: this.t0 });
          this._ctl(pe, { k: 'fs', id: 0, i: 0, n: 1, T: this.T, tele: 1, srv: this.srvN, d: JSON.stringify(S.serialize(g)) });
          g.fl.nh.rem[s] = true;
        }
        this._log('hola de la plaza ' + s + ' (' + pe.name + ')');
        return;
      }
      case 'ready': pe.ready = true; return;
      case 'tc': if (this.t0 && pe.seat > 0) this._hostTc(pe, c, now); return;
      case 'toss': if (this.t0 && pe.seat > 0) this._hostToss(pe, c); return;
      case 'fq': if (this.t0 && pe.seat > 0 && g.fl && c.r === g.fl.r && g.mode === 'rally') {
        var fp = byId(g, c.pid); if (fp && S.seatOf(g, fp) === pe.seat) { S._fault(g, fp.team, 'net', 'Toque de red', fp); this._hostPost(this.T, true); }
      } return;
      case 'bit': if (pe.seat > 0) pe.bits |= (c.w === 'skip' ? 1 : c.w === 'chal' ? 2 : c.w === 'tmo' ? 4 : c.w === 'ask' ? 8 : 0); return;
    }
  };
  /** Un invitado se va: su plaza a la IA para el resto del partido. */
  SP._seatGone = function (pe, why) {
    if (pe.gone) return;
    pe.gone = true; pe.ready = true;
    if (pe.seat > 0) {
      this.gone[pe.seat] = true;
      if (this.g && this.g.fl) this.g.fl.nh.rem[pe.seat] = false;
      this._q({ k: 'gone', s: pe.seat, why: why });
      this._log('la plaza ' + pe.seat + ' se va (' + why + '): la lleva la IA');
    }
  };
  /** Toque de un invitado (tc): plausibilidad, rescate de un punto retenido o nhApplyTc; eco a todos o rechazo. */
  SP._hostTc = function (pe, c, now) {
    var S = Sim(), g = this.g, m = c.m, s = pe.seat, h = g.hum[s], H = this.hstats;
    H.tcIn++;
    if (!m || !m.b || !m.m || !h || h.ai || pe.gone || !g.fl.nh.rem[s] || (m.kind !== 'hit' && m.kind !== 'serve')) { H.tcBad++; this._ctl(pe, { k: 'rej', sq: c.sq }); return; }
    var p = h.p, dx = m.b[0] - p.x, dy = m.b[1] - p.y;
    if (m.m.lp !== p.id || dx * dx + dy * dy > C.PLAUS_R * C.PLAUS_R || m.T > this.T + 6 || m.T < this.T - C.TC_OLD) { H.tcBad++; this._ctl(pe, { k: 'rej', sq: c.sq }); return; }
    var hd = this.hold;
    if (hd && m.r === hd.r && 2 * m.T + m.h < hd.hs) { this._rescue(pe, c); return; }
    var res = S.nhApplyTc(g, m, this.T);
    if (res === 'ok' || res === 'fork') {
      if (res === 'fork') H.tcFork++; H.tcOk++;
      this._q({ k: 'tc', s: s, sq: c.sq, m: m });
      if (Array.isArray(c.ev)) for (var i = 0; i < c.ev.length && i < 8; i++) { var e = decEv(c.ev[i], g); e._s = s; g.events.push(e); }
      this._hostPost(this.T, true);
    } else { H.tcRej++; this._ctl(pe, { k: 'rej', sq: c.sq, why: res }); }
  };
  SP._hostToss = function (pe, c) {
    var S = Sim(), g = this.g, m = c.m;
    if (!m || g.server !== g.hum[pe.seat].p || g.hum[pe.seat].ai) return;
    if (S.nhToss(g, m, this.T)) { this.hstats.tossIn++; this.prevSS = 'ready'; this._hostPost(this.T, true); }
  };
  /** Punto retenido salvado: vuelta a la copia de antes del bote, el toque y los tics rehechos (lo retenido se tira). */
  SP._rescue = function (pe, c) {
    var S = Sim(), g = this.g, hd = this.hold, m = c.m, T1 = this.T, t;
    S.copyGame(this.gk, g);   // (por si el toque no entra: se vuelve a ahora)
    S.copyGame(g, this.gs);
    g.fl.T = hd.T - 1;
    var res = S.nhApplyTc(g, m, hd.T - 1);
    this.hold = null;
    if (res !== 'ok' && res !== 'fork') {   // (no entra: se queda el punto; lo retenido sale tal cual)
      this.hstats.tcRej++; this._ctl(pe, { k: 'rej', sq: c.sq, why: 'rescue-' + res });
      S.copyGame(g, this.gk); g.fl.T = T1; this.outQ = this.outQ.concat(hd.q); this._evLocal = this._evLocal.concat(hd.loc); return;
    }
    this.hstats.rescues++; this.hstats.tcOk++;
    this.prevMode = g.mode; this.prevSS = g.serveState; this.lastSig = this._sig();
    this._q({ k: 'tc', s: pe.seat, sq: c.sq, m: m });
    if (Array.isArray(c.ev)) for (var i = 0; i < c.ev.length && i < 8; i++) { var e = decEv(c.ev[i], g); e._s = pe.seat; g.events.push(e); }
    this._hostPost(hd.T - 1, true);
    for (t = hd.T; t <= T1; t++) this._hostTick(t, this.inRing[t % 64] && this.inRing[t % 64].T === t ? this.inRing[t % 64].inp : NOIN, true);
    this._log('punto salvado por la plaza ' + pe.seat + ' (tic ' + m.T + ', bote ' + (hd.hs >> 1) + ')');
  };
  /** Entradas de las plazas para el tic T: la mía (con sus flancos solo en el primer tic del frame) y los bits de los invitados. */
  SP._hostIns = function (inp) {
    var g = this.g, n = g.hum.length, i, ins = this._ins;
    for (i = 0; i < n; i++) {
      var o = ins[i] || (ins[i] = { move: [0, 0], hit: false, jump: false, jset: false, switchPlayer: false, skip: false, chal: false, tmo: false, ai: false });
      o.move[0] = o.move[1] = 0; o.hit = o.jump = o.jset = o.switchPlayer = o.skip = o.chal = o.tmo = false; o.ai = false;
    }
    var me = ins[0];
    if (inp) { if (inp.move) { me.move[0] = +inp.move[0] || 0; me.move[1] = +inp.move[1] || 0; } me.hit = !!inp.hit; me.jump = !!inp.jump; me.jset = !!inp.jset; me.switchPlayer = !!inp.switchPlayer; }
    me.skip = !!(this.edgesNow & 1) || !!(inp && inp.skip); me.chal = !!(this.edgesNow & 2) || !!(inp && inp.chal); me.tmo = !!(this.edgesNow & 4) || !!(inp && inp.tmo); me.ai = this.away;
    for (i = 0; i < this.peers.length; i++) {
      var pe = this.peers[i], s = pe.seat; if (s <= 0 || s >= n) continue;
      var o2 = ins[s];
      o2.ai = pe.gone || pe.ai || !pe.hello || !pe.pose || (this.lastNow - pe.heard > C.SILENT_AI);   // (sin su primera pose aún: la IA)
      o2.skip = !!(pe.bits & 1); o2.chal = !!(pe.bits & 2); o2.tmo = !!(pe.bits & 4);
      if ((pe.bits & 8) && !o2.ai && g.rot && g.mode === 'rally') { var S = Sim(); S.useSlot(g, s); if (S.askOk(g)) g.ask6 = g.time; S.useSlot(g, 0); }
      pe.bits = 0;
    }
    for (i = 1; i < n; i++) if (!this._seatPeer(i)) ins[i].ai = true;   // (plaza sin enlace: la IA)
    return ins;
  };
  SP._seatPeer = function (s) { for (var i = 0; i < this.peers.length; i++) if (this.peers[i].seat === s && !this.peers[i].gone) return this.peers[i]; return null; };
  /** Poses de los invitados extrapoladas al tic T (solo las de la foto de saque en curso: tras setupServe, hasta que su pose
   *  nueva llega, su jugador se queda donde lo puso el saque). */
  SP._hostPoses = function (T) {
    var S = Sim(), g = this.g, o = this.poseScr;
    for (var i = 0; i < this.peers.length; i++) {
      var pe = this.peers[i], s = pe.seat, q = pe.pose; if (s <= 0 || !q || pe.gone || !S.nhFrozen(g, g.hum[s].p)) continue;
      if (q.srv !== (this.srvN & 255)) continue;
      extrap(o, q, q.T, clampN(T - q.T, 0, C.EXTRAP) * STEP);
      o.act = !!(q.fl & 2);
      S.nhPose(g, g.hum[s].p, o);
    }
  };
  /** ¿Va a botar el balón en este tic con un invitado cerca? → plazas que podrían salvarlo (o null). */
  SP._rescueNear = function () {
    var g = this.g, b = g.ball, G = (VB.C && VB.C.G) || 9, BR = (VB.C && VB.C.BR) || 0.21;
    if (g.mode !== 'rally' || b.held || b.vz > 0) return null;
    if (b.z + b.vz * STEP - 0.5 * G * STEP * STEP > BR + 0.03) return null;
    var near = null;
    for (var i = 0; i < this.peers.length; i++) {
      var pe = this.peers[i], s = pe.seat; if (s <= 0 || pe.gone || !g.fl.nh.rem[s] || g.hum[s].ai) continue;
      var p = g.hum[s].p, dx = b.x - p.x, dy = b.y - p.y;
      if (dx * dx + dy * dy <= C.RESCUE_R * C.RESCUE_R) (near = near || []).push(pe);
    }
    return near;
  };
  SP._hostTick = function (T, inp, redo) {
    var S = Sim(), g = this.g, F = g.fl, r0 = F.r;
    var t0 = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
    F.T = T;
    this._hostPoses(T);
    var ins = this._hostIns(inp);
    if (!redo) { var ri = this.inRing[T % 64] || (this.inRing[T % 64] = { T: -1, inp: { move: [0, 0] } }); ri.T = T; ri.inp.move[0] = ins[0].move[0]; ri.inp.move[1] = ins[0].move[1]; ri.inp.hit = ins[0].hit; ri.inp.jump = ins[0].jump; ri.inp.jset = ins[0].jset; ri.inp.switchPlayer = ins[0].switchPlayer; }
    var near = !this.hold ? this._rescueNear() : null;
    if (near) S.copyGame(this.gs, g);
    S.step(g, STEP, ins);
    this.T = T; this.gcTick = T; this.stats.steps++;
    if (near && F.r !== r0) {
      var ow = 0; for (var i = 0; i < near.length; i++) ow = Math.max(ow, (near[i].rtt || 100) / 2);
      this.hold = { r: r0, hs: 2 * T + 1, T: T, until: this.lastNow + Math.min(C.HOLD_MAX, ow + 40), q: [], loc: [] };
      this.hstats.holds++;
    }
    this._hostPost(T, false);
    if (T % C.BUNDLE === 0) this._bundle(T);
    var us = ((typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now()) - t0) * 1000;
    if (this.hstats.tickUs.length < 200000) this.hstats.tickUs.push(us);
  };
  /** Firma del estado para las fotos: cambia con el modo, el rally, la revisión, el tiempo muerto, el final y las plazas de la IA. */
  SP._sig = function () {
    var g = this.g, a = '';
    for (var i = 0; i < g.hum.length; i++) a += g.hum[i].ai ? '1' : '0';
    return g.mode + '|' + g.fl.r + '|' + (g.review ? 1 : 0) + '|' + (g.tmo ? 1 : 0) + '|' + (g.finished ? 1 : 0) + '|' + a + '|' + g.setNo;
  };
  /** Tras un tic (o un mensaje aplicado): contactos, lanzamiento, eventos y foto a la cola; eventos a la salida local. */
  SP._hostPost = function (T, mid) {
    var S = Sim(), g = this.g, F = g.fl, i;
    for (i = 0; i < F.nh.tcs.length; i++) this._q({ k: 'tc', s: -1, m: F.nh.tcs[i] });
    F.nh.tcs.length = 0; F.pts.length = 0; F.fq.length = 0;
    if (g.mode === 'serve' && g.serveState !== 'ready' && this.prevSS === 'ready' && this.prevMode === 'serve') {
      var tb = S.flBundle(g); tb.kind = 'toss'; tb.T = T; tb.h = 1; tb.bAge = F.bAge; tb.own = 0;
      this._q({ k: 'toss', m: tb });
    }
    var E = g.events;
    if (E.length) {
      var L = [];
      for (i = 0; i < E.length; i++) { var e = E[i]; e._T = T; L.push(encEv(e)); if (this.hold) this.hold.loc.push(e); else this._evLocal.push(e); }
      E.length = 0;
      this._q({ k: 'ev', l: L });
    }
    var sig = this._sig();
    if (sig !== this.lastSig) {
      var ser = !(this.prevMode === 'serve' && g.mode === 'rally' && sig.split('|').slice(2).join() === this.lastSig.split('|').slice(2).join());
      this.lastSig = sig;
      if (F.sr) this.srvN++;
      if (ser) this._q({ k: 'fs', T: T, tele: F.sr, srv: this.srvN & 255, d: JSON.stringify(S.serialize(g)) });
    }
    F.sr = false;
    this.prevMode = g.mode; this.prevSS = g.serveState;
  };
  /** Paquete de 30 Hz: poses de los jugadores en pista (por id). */
  SP._bundle = function (T) {
    var g = this.g, S = Sim(), P = g.players, n = P.length, u = new Uint8Array(BH + n * (PL_B + 1)), dv = new DataView(u.buffer), k = BH, q = this.poseScr2 || (this.poseScr2 = {});
    var live = g.mode === 'serve' || g.mode === 'rally';
    u[0] = T_BUNDLE | ((this.epoch & 15) << 4); dv.setUint32(1, T >>> 0, true); dv.setUint16(5, g.fl.r & 65535, true); u[7] = live ? 1 : 0; u[8] = n;
    dv.setUint16(9, (this.bSeq = ((this.bSeq | 0) + 1) & 65535), true); u[11] = this.srvN & 255;
    for (var i = 0; i < n; i++) {
      var p = P[i], s = S.seatOf(g, p);
      u[k] = p.id & 255; poseW(dv, u, k + 1, poseOut(g, p, q, s >= 0, s)); k += PL_B + 1;
    }
    for (var j = 0; j < this.peers.length; j++) if (this.peers[j].started) this._sendIn(this.peers[j], u);
    this.hstats.bundles++; if (u.length > this.hstats.bundleMax) this.hstats.bundleMax = u.length;
  };
  SP._hostLife = function (now) {
    var g = this.g, i, pe, need = [];
    for (i = 0; i < this.peers.length; i++) {
      pe = this.peers[i];
      if (this.t0 && !pe.gone && pe.hello && now - pe.heard > C.GONE) this._seatGone(pe, 'silencio');
    }
    if (this.status === 'connecting') {
      if (this.createdAt < 0) this.createdAt = now;
      var want = g ? g.hum.length - 1 : 0, ok = 0;
      for (i = 0; i < this.peers.length; i++) if (this.peers[i].hello && this.peers[i].ready) ok++;
      var warm = !this.warmFn || this.warmFn() || now - this.createdAt > C.WARM_CAP;
      for (i = 1; g && i < g.hum.length; i++) { pe = this._seatPeer(i); if (!pe || !pe.ready) need.push(i); }
      if (g && warm && (ok >= Math.min(want, this.peers.length) || now - this.createdAt > C.READY_MS)) {
        this.t0 = now + C.START_MS; this.status = 'starting';
        for (i = 1; i < g.hum.length; i++) { pe = this._seatPeer(i); if (!pe || !pe.ready) { g.fl.nh.rem[i] = !!pe; if (!pe) this.gone[i] = true; } }
        this._bcast({ k: 'go', t0: this.t0 });
        this._log('empieza: ' + ok + ' de ' + want + ' invitados listos');
      }
      this.out.waitFor = need;
    }
    if (this.status === 'starting') {
      this.out.startIn = Math.max(0, this.t0 - now);
      if (now >= this.t0) this.status = 'playing';
    }
    if (this.t0 && now - this.pgAt > 2000) {   // (ping de cada plaza: el balón pintado de los invitados espera los contactos de cada uno)
      this.pgAt = now; var pg = [0]; for (i = 1; g && i < g.hum.length; i++) { pe = this._seatPeer(i); pg.push(pe ? Math.round(pe.rtt) : 0); }
      this._q({ k: 'pg', p: pg });
    }
    if (this.hold && now >= this.hold.until) {   // (nadie lo salvó: sale lo retenido)
      this.outQ = this.outQ.concat(this.hold.q); this._evLocal = this._evLocal.concat(this.hold.loc); this.hold = null;
    }
  };
  SP._hostAdvance = function (now, inp) {
    this._hostLife(now);
    if (this.status !== 'playing' && this.status !== 'over') return;
    var tgt = Math.floor((now - this.t0) / STEP_MS);
    // (muy atrás tras un parón: se salta T hacia delante como el invitado; t0 NO se mueve, porque los invitados
    //  siguen con el t0 del 'go' y quedarían adelantados el resto del partido: toques rechazados y Dp inflado)
    if (tgt - this.T > C.MAXCATCH + (this.maxCatch | 0)) { this.T = tgt - C.MAXCATCH; this.hstats.skips = (this.hstats.skips | 0) + 1; }
    var first = true;
    for (var T = this.T + 1; T <= tgt; T++) {
      this.edgesNow = first ? this.edges : 0;
      this._hostTick(T, first ? inp : this._moveOnly(inp), false);
      if (first) { this.edges = 0; first = false; }
    }
  };
  SP._moveOnly = function (inp) { if (!inp) return null; var o = this._mo || (this._mo = { move: [0, 0] }); o.move = inp.move || NOIN.move; return o; };

  /* ================= INVITADO ================= */
  SP._guestCtl = function (pe, c, now) {
    var S = Sim(), g = this.g;
    switch (c.k) {
      case 'start':
        if (!this.g) {
          if (c.seat !== undefined) this.seat = this.slot = c.seat | 0;
          if (Array.isArray(c.names)) this.names = c.names.map(cleanName);
          if (c.opts && typeof c.opts === 'object') { this._setOpts(c.opts); this.status = 'starting'; this.startAt = now; }
        }
        return;
      case 'go': this.t0h = +c.t0 || 0; return;
      case 'fs': this._fsPart(c, now); return;
      case 'tc': if (g) this._guestTc(c); return;
      case 'toss': if (g && S.nhToss(g, c.m, this.T)) this._chainPush(c.m, true); return;
      case 'rej': if (g) this._guestRej(c); return;
      case 'ev': if (g && Array.isArray(c.l)) this._guestEv(c.l); return;
      case 'gone': this.gone[c.s | 0] = true; return;
      case 'pg': if (Array.isArray(c.p)) this.seatRtt = c.p.map(function (v) { return +v || 0; }); return;
    }
  };
  /** Foto entera del anfitrión: la partida pasa a ser la suya (mi jugador conserva su pose salvo con tele: el saque lo coloca). */
  SP._fsPart = function (c, now) {
    if (!this.g) return;
    if (c.n > 1) {
      if (!this.fsBuf || this.fsBuf.id !== c.id) this.fsBuf = { id: c.id, n: c.n, p: [], got: 0 };
      if (this.fsBuf.p[c.i] === undefined) { this.fsBuf.p[c.i] = c.d; this.fsBuf.got++; }
      if (this.fsBuf.got < c.n) return;
      c = { T: c.T, tele: c.tele, srv: c.srv, d: this.fsBuf.p.join('') }; this.fsBuf = null;
    }
    var obj = null; try { obj = JSON.parse(c.d); } catch (e) { return; }
    var S = Sim(), g = this.g, F = g.fl, me = g.hum[this.seat] && g.hum[this.seat].p, keep = null, k;
    if (me && !c.tele) { keep = { id: me.id }; for (k = 0; k < KEEP.length; k++) keep[KEEP[k]] = me[KEEP[k]]; }
    var T = this.T;
    if (!S.deserialize(obj, g)) return;
    F = g.fl; F.loc = [false, false]; F.me = 1; F.own = 0; F.peer = true; F.T = T;
    F.nh = { host: false, seat: this.seat, rem: [], tcs: [], grace: 0.15, dropT: 0 };
    if (keep) { var me2 = g.hum[this.seat].p; if (me2 && me2.id === keep.id) for (k = 0; k < KEEP.length; k++) me2[KEEP[k]] = keep[KEEP[k]]; }
    var dt = Math.max(0, T - (c.T | 0)) * STEP;
    if (g.mode === 'point' || g.mode === 'over') g.timer -= dt;
    g.events.length = 0;
    this.hstats.fsIn++; this.stats.rsIn++; this.rsT = T;
    if (c.tele) { this.srvN = c.srv | 0; this.snaps = this.snaps.filter(function (s) { return s.srv === (c.srv | 0); }); }
    this.chain = []; this.pend = null; this.lastHostTc = null; this.tau = -1;
    this.myTeam = g.hum[this.seat].team;
  };
  /** Contacto que manda el anfitrión (de otro, o el eco del mío). */
  SP._guestTc = function (c) {
    var S = Sim(), g = this.g, m = c.m;
    if (!m || !m.b) return;
    if (c.s === this.seat && this.pend && this.pend.sq === c.sq) { this.pend = null; this.lastHostTc = m; this.hstats.tcEcho++; return; }
    var r = S.nhApplyTc(g, m, this.T);
    if (r === 'ok' || r === 'fork') { this.lastHostTc = m; this._chainPush(m, false); if (this.pend) { this.pend = null; this.hstats.tcLost++; } }
  };
  SP._guestRej = function (c) {
    if (!this.pend || this.pend.sq !== c.sq) return;
    this.pend = null; this.hstats.tcLost++;
    var S = Sim(), g = this.g, m = this.lastHostTc;
    // mi toque no vale: el balón vuelve a la cadena del anfitrión (su último contacto de este rally)
    for (var i = this.chain.length - 1; i >= 0; i--) if (this.chain[i].mine && this.chain[i].sq === c.sq) { this.chain.splice(i); break; }
    if (m && m.r === g.fl.r && g.mode === 'rally') S.nhApplyTc(g, m, this.T);
  };
  SP._guestEv = function (L) {
    var g = this.g;
    for (var i = 0; i < L.length; i++) {
      var e = decEv(L[i], g);
      this._conf.push(e);
      if (e._s === this.seat) continue;   // (mi toque: ya sonó aquí)
      this._evQ.push(e);
    }
  };
  /** Cadena de contactos del rally para el balón pintado: {hs (medio paso desde el que vuela), b, age, mine, sq}. */
  SP._chainPush = function (m, toss, mine, sq) {
    var hs = toss ? 2 * m.T + 2 : 2 * m.T + m.h + 1;
    if (m.full && !toss) hs = 2 * m.T + m.h + 1;
    if (this.chain.length && this.chain[this.chain.length - 1].r !== m.r) this.chain = [];
    if (this.tau >= 0 && hs < this.tau && this.chain.length) {   // (ya se pintó más allá de este contacto: llega tarde)
      var lt = this.tau - hs; this.hstats.lateC++; if (lt > this.hstats.lateMax) this.hstats.lateMax = lt;
      if (this.lateDbg) this.lateDbg.push({ lt: lt, lag: this.lastTf - this.tau, toMe: this.toMe, arr: 2 * this.T - hs, kind: m.kind, D: this.Dp, mine: mine });
      (this.hstats.lateK[toss ? 'toss' : mine ? 'mine' : m.kind] = (this.hstats.lateK[toss ? 'toss' : mine ? 'mine' : m.kind] || 0) + 1);
    }
    while (this.chain.length && this.chain[this.chain.length - 1].hs > hs) this.chain.pop();
    this.chain.push({ hs: hs, b: m.b.slice(), age: m.bAge || 0, mine: !!mine, sq: sq, r: m.r });
    if (this.chain.length > 24) this.chain.shift();
  };
  /** Paquete de poses del anfitrión: al anillo de interpolación; mide lo que llega tarde (colchón Dp). */
  SP._onBundle = function (o, now) {
    var L = this.snaps;
    if (L.length && o.T <= L[L.length - 1].T) return;
    L.push(o); if (L.length > 48) L.shift();
    if (this.t0h && this.offOk) {
      var Tnow = (now + this.off - this.t0h) / STEP_MS, late = Tnow - o.T;
      this.lateL.push(late); if (this.lateL.length > 64) this.lateL.shift();
    }
  };
  SP._dispDelay = function (dtF) {
    var L = this.lateL; if (!L.length) return C.D_MIN + this.rtt / 2 / STEP_MS;
    var a = L.slice().sort(function (x, y) { return x - y; }), mean = 0;
    for (var i = 0; i < a.length; i++) mean += a[i];
    mean = clampN(mean / a.length, 0, C.LATE_MAX);
    var p95 = a[Math.min(a.length - 1, Math.floor(a.length * 0.95))];
    var tgt = Math.max(0, mean) + clampN(Math.max(0, p95 - mean) + C.BUNDLE + 1, C.D_MIN, C.D_MAX);
    if (this.Dp < 0 || L.length < 16) this.Dp = tgt;
    else this.Dp += clampN(tgt - this.Dp, -(dtF || 16) / 1000, 4 * (dtF || 16) / 1000);
    return this.Dp;
  };
  /** Poses de los demás en el tic Tr (Hermite entre dos paquetes; extrapolación corta si faltan). */
  SP._guestPoses = function (Tr) {
    var S = Sim(), g = this.g, L = this.snaps, P = g.players, s0 = null, s1 = null, k, i, o = this.poseScr;
    if (!L.length) return;
    for (k = L.length - 1; k >= 0; k--) if (L[k].T <= Tr) { s0 = L[k]; s1 = L[k + 1] || null; break; }
    if (!s0) { s0 = L[0]; s1 = null; }
    if (s0.srv !== (this.srvN & 255)) return;   // (aún las de antes del saque: la formación de la foto)
    var G = (VB.C && VB.C.G) || 9;
    for (i = 0; i < P.length; i++) {
      var p = P[i]; if (!S.nhFrozen(g, p)) continue;
      var q0 = s0.pl[p.id & 255], q1 = s1 && s1.srv === s0.srv ? s1.pl[p.id & 255] : null;
      if (!q0) continue;
      if (q1) {
        var hT = (s1.T - s0.T) * STEP, u = clampN((Tr - s0.T) / (s1.T - s0.T), 0, 1), u2 = u * u, u3 = u2 * u;
        var h00 = 2 * u3 - 3 * u2 + 1, h10 = u3 - 2 * u2 + u, h01 = -2 * u3 + 3 * u2, h11 = u3 - u2;
        o.x = h00 * q0.x + h10 * hT * q0.vx + h01 * q1.x + h11 * hT * q1.vx;
        o.y = h00 * q0.y + h10 * hT * q0.vy + h01 * q1.y + h11 * hT * q1.vy;
        o.z = q0.z + (q1.z - q0.z) * u; if (q0.z > 0 && q1.z > 0) o.z += 0.5 * G * hT * hT * u * (1 - u);
        o.vx = q0.vx + (q1.vx - q0.vx) * u; o.vy = q0.vy + (q1.vy - q0.vy) * u; o.vz = q0.vz + (q1.vz - q0.vz) * u; o.jvx = 0; o.jvy = 0;
        discrete(o, q0, s0.T, (Tr - s0.T) * STEP);
      } else {
        var e = clampN(Tr - s0.T, 0, C.EXTRAP) * STEP;
        if (Tr - s0.T > 0) this.hstats.extrap++;
        extrap(o, q0, s0.T, e);
      }
      o.act = false;
      S.nhPose(g, p, o);
    }
  };
  /** Mi pose (60 Hz) al anfitrión. */
  SP._sendPose = function (T) {
    var S = Sim(), g = this.g, h = g.hum[this.seat], p = h.p, u = new Uint8Array(GH + PL_B), dv = new DataView(u.buffer);
    u[0] = T_POSE | ((this.epoch & 15) << 4); dv.setUint32(1, T >>> 0, true); u[5] = g.fl.r & 255; u[6] = this.srvN & 255;
    var act = g.rot && g.time - S.slotGet(g, this.seat, 'hAct') < 0.1;
    u[7] = (this.away ? 1 : 0) | (act ? 2 : 0);   // (solo «ausente»: h.ai lo decide el anfitrión y vuelve en el balón muerto)
    poseW(dv, u, GH, poseOut(g, p, this._pq || (this._pq = {}), true, this.seat));
    this._sendIn(this.peers[0], u);
  };
  SP._guestTick = function (T, inp, D) {
    var S = Sim(), g = this.g, F = g.fl, pe = this.peers[0], i, s = this.seat;
    F.T = T;
    this._guestPoses(T - D);
    var ins = this._ins; while (ins.length < g.hum.length) ins.push(NOIN);
    for (i = 0; i < ins.length; i++) ins[i] = NOIN;
    var me = this._gin || (this._gin = { move: [0, 0], hit: false, jump: false, jset: false, switchPlayer: false });
    me.move[0] = inp && inp.move ? +inp.move[0] || 0 : 0; me.move[1] = inp && inp.move ? +inp.move[1] || 0 : 0;
    me.hit = !!(inp && inp.hit); me.jump = !!(inp && inp.jump); me.jset = !!(inp && inp.jset); me.switchPlayer = !!(inp && inp.switchPlayer);
    ins[s] = me;
    var ss0 = g.serveState, mode0 = g.mode, mineSrv = g.server === g.hum[s].p;
    S.step(g, STEP, ins);
    this.T = T; this.gcTick = T; this.stats.steps++;
    // eventos de este tic: los de mi jugador salen ya (y viajan con mi toque); el resto lo cuenta el anfitrión
    var E = g.events, mine = [], P = g.hum[s].p;
    for (i = 0; i < E.length; i++) {
      var e = E[i], who = e.player;
      if (who === P || (!who && (e.type === 'ask'))) { this._evLocal.push(e); if (!OWN_SKIP[e.type]) mine.push(encEv(e)); }
    }
    E.length = 0;
    if (me.switchPlayer && g.rot) this._ctl(pe, { k: 'bit', w: 'ask' });
    for (i = 0; i < F.nh.tcs.length; i++) {
      var m = F.nh.tcs[i];
      if (m.kind !== 'hit' && m.kind !== 'serve') continue;   // (red, cinta: las juzga el anfitrión)
      var sq = ++this.tcSeq;
      this.pend = { sq: sq, par: m.par };
      this._ctl(pe, { k: 'tc', sq: sq, m: m, ev: mine });
      this._chainPush(m, false, true, sq);
      this.hstats.tcOut++; mine = [];
    }
    F.nh.tcs.length = 0;
    if (mineSrv && mode0 === 'serve' && ss0 === 'ready' && g.mode === 'serve' && g.serveState !== 'ready') {
      var tb = S.flBundle(g); tb.kind = 'toss'; tb.T = T; tb.h = 1; tb.bAge = F.bAge; tb.own = 0;
      this._ctl(pe, { k: 'toss', m: tb }); this._chainPush(tb, true, true);
    }
    for (i = 0; i < F.fq.length; i++) this._ctl(pe, { k: 'fq', r: F.fq[i].r, pid: F.fq[i].pid, T: F.fq[i].T });
    F.fq.length = 0; F.pts.length = 0;
    if (T % C.POSE === 0) this._sendPose(T);
  };
  SP._guestLife = function (now) {
    var pe = this.peers[0]; if (!pe) return;
    if (this.status === 'connecting' || (this.status === 'starting' && !this.t0h)) {
      if (now - (this.helloAt || -1e9) > 500) { this.helloAt = now; this._ctl(pe, { k: 'hello', v: PROTO, seat: this.seat, name: this.name, ver: VB.VERSION || '' }); }
      if (this.createdAt < 0) this.createdAt = now;
      if (now - this.createdAt > C.CONNECT_MS && this.status === 'connecting') { this.status = 'ended'; this.result = { why: 'noShow', win: false }; this.rivalLeft = true; }
    }
    if (this.status === 'starting' && this.g && !pe.ready) {
      if (!this.warmFn || this.warmFn() || now - this.startAt > C.WARM_CAP) { pe.ready = true; this._ctl(pe, { k: 'ready' }); }
    }
    if (this.status === 'starting' && this.t0h && this.offOk) {
      this.t0 = this.t0h - this.off; this.out.startIn = Math.max(0, this.t0 - now);
      if (now >= this.t0) this.status = 'playing';
    }
    if ((this.status === 'playing' || this.status === 'waiting') && this.heardAt > 0) {
      var q = now - this.heardAt;
      if (q > C.HOST_GONE) { this.status = 'ended'; this.valid = false; this.goneFlag = true; this.result = { why: 'hostGone', win: false }; }
      else if (q > C.WAIT) { if (this.status !== 'waiting') { this.status = 'waiting'; this.waitStart = now; } this.out.waitMs = now - this.waitStart; }
      else if (this.status === 'waiting') this.status = 'playing';
    }
  };
  SP._guestAdvance = function (now, inp, dtF) {
    this._guestLife(now);
    // P8: ya en la cuenta atrás, la pose (quieto en su sitio) cada 33 ms. Si no, en el tic 0 el anfitrión aún no tenía ninguna pose
    // del invitado, le ponía la IA (sin pose = la IA) y no volvía hasta el primer balón muerto: todo el primer peloteo (en netdrive,
    // más de 20 s) cada invitado jugaba con la IA.
    if (this.g && this.status === 'starting' && this.t0h && now - (this._prePoseAt || -1e9) > 33) { this._prePoseAt = now; this._sendPose(0); }
    if (!this.g || !(this.status === 'playing' || this.status === 'waiting' || this.status === 'over')) return;
    this.t0 = this.t0h - this.off;
    var Tf = (now - this.t0) / STEP_MS, tgt = Math.floor(Tf);
    if (tgt - this.T > C.MAXCATCH + (this.maxCatch | 0)) this.T = tgt - C.MAXCATCH;
    if (inp) this.edges |= (inp.skip ? 1 : 0) | (inp.chal ? 2 : 0) | (inp.tmo ? 4 : 0);   // (bits de partido en la entrada, como en Precisa)
    var D = this._dispDelay(dtF), first = true;
    this.hstats.interpMs = Math.round(D * STEP_MS);
    for (var T = this.T + 1; T <= tgt; T++) {
      this._guestTick(T, first ? inp : this._moveOnly(inp), D);
      first = false;
    }
    if (this.edges) {   // (Continuar / challenge: al anfitrión)
      var pe = this.peers[0];
      if (this.edges & 1) this._ctl(pe, { k: 'bit', w: 'skip' });
      if (this.edges & 2) this._ctl(pe, { k: 'bit', w: 'chal' });
      if (this.edges & 4) this._ctl(pe, { k: 'bit', w: 'tmo' });
      this.edges = 0;
    }
    this._dispBall(Tf, D, dtF);
  };
  /** Balón pintado del invitado: la cadena de contactos volada al medio paso tau, con tau = presente − lag; el lag va hacia el
   *  colchón de los demás (lo tocan otros) o hacia 0 (viene hacia mí) con la velocidad del reloj entre RATE_MIN y RATE_MAX. Lo que
   *  quede de un salto (contacto inesperado, rechazo) se deshace con BALL_TAU ms. Se escribe sobre g.ball hasta el siguiente advance. */
  SP._dispBall = function (Tf, D, dtF) {
    var S = Sim(), g = this.g, b = g.ball, F = g.fl, ch = this.chain, H = this.hstats, sv = this._sv || (this._sv = {}), k;
    var KEYS = ['x', 'y', 'z', 'vx', 'vy', 'vz', 'spin'];
    for (k = 0; k < KEYS.length; k++) sv[KEYS[k]] = b[KEYS[k]];
    this._svOn = true;
    var pres = 2 * Tf, live = g.mode === 'rally' || (g.mode === 'serve' && !b.held);
    if (!live || !ch.length || ch[ch.length - 1].r !== F.r) { this.tau = -1; this._blend(b, dtF); return; }
    // ¿Quién toca ahora? El equipo del campo donde va a caer el balón y, en él, el que su IA mandaría (computeJob). Yo → el balón llega
    // al presente (lag 0). Otro humano → su contacto viene por el anfitrión (dos tramos): el lag cubre además su ida. La IA → el lag de
    // los demás jugadores (su contacto llega antes de pintarlo).
    var Lmax = 2 * D, me = g.hum[this.seat].p, toMe = false, AI = VB.AI, Lt = Lmax, nt, job = null;
    var tl = S.landT ? S.landT(g) : 0, lx = b.x + b.vx * (tl > 0 && tl < 5 ? tl : 0);
    nt = lx * S.side(0) > 0 ? 0 : 1;
    if (AI && AI.computeJob && S.seatRep) { var rp = S.seatRep(g, nt); S.useSlot(g, rp); try { job = AI.computeJob(g, nt); } catch (e) { job = null; } S.useSlot(g, 0); }
    if (!g.hum[this.seat].ai) { var dx = b.x - me.x, dy = b.y - me.y; toMe = job === me || (dx * dx + dy * dy < 1.2 && !(g.touchTeam === me.team && g.lastPlayer === me)); }
    if (toMe) Lt = 0;
    else if (job) { var js = S.seatOf(g, job); if (js >= 0 && js !== this.seat && this.seatRtt[js] > 0) Lt = Lmax + 2 * (this.seatRtt[js] / 2 / STEP_MS + 2); }
    Lt = Math.min(Lt, 2 * C.D_MAX + 8); this.toMe = toMe;
    var dP = this.lastTf >= 0 ? Math.max(0, pres - this.lastTf) : 0; this.lastTf = pres;
    if (this.tau < 0) this.tau = pres - Lt;
    else {
      var L = pres - this.tau, rate = clampN(1 + (L - Lt) / C.LAG_K, C.RATE_MIN, C.RATE_MAX);
      this.tau += dP * rate;
      if (rate > H.warpMax) H.warpMax = rate;
    }
    this.tau = clampN(this.tau, pres - 2 * C.D_MAX - 8, pres);
    var lag = pres - this.tau; if (lag > H.lagMax) H.lagMax = lag;
    var e = null; for (k = ch.length - 1; k >= 0; k--) if (ch[k].hs <= this.tau) { e = ch[k]; break; }
    if (!e) e = ch[0];
    var n = Math.max(0, Math.floor(this.tau - e.hs)), fr = this.tau - e.hs - n, o = this._bo || (this._bo = {}), o2 = this._bo2 || (this._bo2 = {});
    var src = this._bsrc || (this._bsrc = {}), BK = ['x', 'y', 'z', 'vx', 'vy', 'vz', 'spin', 'speed', 'dip', 'wobA', 'wobF', 'wobP'];
    for (k = 0; k < BK.length; k++) src[BK[k]] = e.b[k];
    S.flFly(src, e.age, n, F.dh || STEP / 2, o);
    S.flFly(o, o.age, 1, F.dh || STEP / 2, o2);
    for (k = 0; k < 3; k++) { var kk = KEYS[k]; b[kk] = o[kk] + (o2[kk] - o[kk]) * Math.max(0, fr); }
    b.vx = o.vx; b.vy = o.vy; b.vz = o.vz; b.spin = o.spin;
    this._blend(b, dtF);
  };
  /** Continuidad del balón pintado: si salta respecto al último pintado (más de lo que se mueve), el salto se reparte en BALL_TAU. */
  SP._blend = function (b, dtF) {
    var o = this.bOff, L = this.bLast, dt = (dtF || 16) / 1000, H = this.hstats;
    if (L) {
      // (lo esperado: seguir con la velocidad de antes o con la de ahora: un toque cambia la velocidad dentro del frame)
      var jx = L.x + L.vx * dt - (b.x + o.x), jy = L.y + L.vy * dt - (b.y + o.y), jz = L.z + L.vz * dt - (b.z + o.z), j = Math.sqrt(jx * jx + jy * jy + jz * jz);
      var kx = L.x + b.vx * dt - (b.x + o.x), ky = L.y + b.vy * dt - (b.y + o.y), kz = L.z + b.vz * dt - (b.z + o.z), j2 = Math.sqrt(kx * kx + ky * ky + kz * kz);
      if (j2 < j) { j = j2; jx = kx; jy = ky; jz = kz; }
      if (j > 0.25 && j < 3) { o.x += jx; o.y += jy; o.z += jz; this.hstats.blends++; }
    }
    var d = Math.pow(0.5, (dtF || 16) / C.BALL_TAU); o.x *= d; o.y *= d; o.z *= d;
    var px = b.x + o.x, py = b.y + o.y, pz = Math.max((VB.C && VB.C.BR) || 0.21, b.z + o.z);
    if (L) {
      var mx = px - (L.x + L.vx * dt), my = py - (L.y + L.vy * dt), mz = pz - (L.z + L.vz * dt), jm = Math.sqrt(mx * mx + my * my + mz * mz);
      var nx = px - (L.x + b.vx * dt), ny = py - (L.y + b.vy * dt), nz = pz - (L.z + b.vz * dt); jm = Math.min(jm, Math.sqrt(nx * nx + ny * ny + nz * nz));
      if (jm > 0.3 && this.g.mode === 'rally') { H.bJump++; if (jm > H.bJumpMax) H.bJumpMax = jm; }
    }
    b.x = px; b.y = py; b.z = pz;
    if (!L) this.bLast = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 };
    var l = this.bLast; l.x = b.x; l.y = b.y; l.z = b.z; l.vx = b.vx; l.vy = b.vy; l.vz = b.vz;
    H.dispFrames++;
  };
  /** P8: balón pintado del ANFITRIÓN. Un toque de un invitado que llega tarde se aplica rehaciendo el balón desde su tic (y un punto
   *  salvado vuelve del suelo): en la vista del anfitrión el balón saltaba (netdrive 6v6: ~10 saltos de hasta 1,1 m por minuto). Ahora
   *  el salto se reparte en BALL_TAU ms con el mismo _blend del invitado; la partida de verdad no cambia (se deshace en el siguiente
   *  advance, como en el invitado). Solo en juego: fuera del rally el balón va tal cual. */
  SP._hostPaint = function (dtF) {
    var g = this.g, b = g.ball, sv = this._sv || (this._sv = {}), KEYS = ['x', 'y', 'z', 'vx', 'vy', 'vz', 'spin'];
    if (g.mode !== 'rally' || b.held) { this.bLast = null; this.bOff.x = this.bOff.y = this.bOff.z = 0; return; }
    for (var k = 0; k < KEYS.length; k++) sv[KEYS[k]] = b[KEYS[k]];
    this._svOn = true;
    this._blend(b, dtF);
  };
  SP._unpaint = function () {
    if (!this._svOn || !this.g) return;
    var b = this.g.ball, sv = this._sv, KEYS = ['x', 'y', 'z', 'vx', 'vy', 'vz', 'spin'];
    for (var k = 0; k < KEYS.length; k++) b[KEYS[k]] = sv[KEYS[k]];
    this._svOn = false;
  };
  /** Eventos del anfitrión que esperan a su momento pintado (los de sonido), salvo si ya van muy tarde. */
  SP._presentEv = function (out) {
    var Q = this._evQ, keep = [], tauT = this.tau >= 0 ? this.tau / 2 : this.T - (this.Dp > 0 ? this.Dp : 0);
    for (var i = 0; i < Q.length; i++) {
      var e = Q[i];
      if (!SENSORY[e.type] || e._T === undefined || e._T <= tauT || this.T - e._T > C.EV_LATE) out.push(e); else keep.push(e);
    }
    this._evQ = keep;
  };

  /* ---- un frame ---- */
  SP.advance = function (now, inp) {
    var o = this.out, dtF = this.lastNow ? now - this.lastNow : 16;
    this._unpaint();
    this.lastNow = now; this.stats.frames++;
    o.events.length = 0; o.confirmed.length = 0; o.app.length = 0; o.unstable = false;
    this._recv(now);
    this._pingAll(now);
    if (this.status !== 'ended') { if (this.host) this._hostAdvance(now, inp); else this._guestAdvance(now, inp, dtF); }
    if (this.host && this.g) this._hostPaint(dtF);
    if (this.host) {
      this._flushQ();
      for (var i = 0; i < this._evLocal.length; i++) { o.events.push(this._evLocal[i]); o.confirmed.push(this._evLocal[i]); }
    } else {
      for (var j = 0; j < this._evLocal.length; j++) o.events.push(this._evLocal[j]);
      this._presentEv(o.events);
      for (var k = 0; k < this._conf.length; k++) o.confirmed.push(this._conf[k]);
      this._conf.length = 0;
    }
    this._evLocal.length = 0;
    for (var q = 0; q < o.confirmed.length; q++) if (o.confirmed[q].type === 'gameOver' && this.status !== 'ended') {
      this.status = 'over'; this.result = { why: 'end', win: o.confirmed[q].team === this.myTeam, team: o.confirmed[q].team };
    }
    if (this.appIn.length) { for (var a = 0; a < this.appIn.length; a++) o.app.push(this.appIn[a]); this.appIn.length = 0; }
    o.status = this.status; o.g = this.g; o.tick = this.T; o.result = this.result;
    o.ping = Math.round(this.host ? 0 : this.rtt);
    o.pings.length = 0;
    if (this.host) { for (var s = 0; this.g && s < this.g.hum.length; s++) { var pe = this._seatPeer(s); o.pings.push(s === 0 ? 0 : pe ? Math.round(pe.rtt) : 0); } }
    else if (this.g) for (var s2 = 0; s2 < this.g.hum.length; s2++) o.pings.push(s2 === this.seat ? Math.round(this.rtt) : 0);
    if (!this.host) o.waitFor = this.status === 'waiting' || this.status === 'connecting' ? [0] : [];
    else if (this.status !== 'connecting') o.waitFor = [];
    o.unstable = this.status === 'waiting';
    return o;
  };

  VB.NetHost = { Session: Session, C: C, PROTO: PROTO, _encEv: encEv, _decEv: decEv, _poseR: poseR, _poseW: poseW };
})();
