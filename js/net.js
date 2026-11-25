/* =====================================================================
 * TAKE THE COURT — js/net.js   (owner: net)
 * Modo online, fase 1 (notes/net.md): sesión con rollback entre dos pares, códec de entradas y transportes de prueba.
 * SIN DOM y SIN THREE: funciona igual en el navegador y en Node (tools/nettest.js lo carga con vm junto a sim.js).
 *
 * MODELO (diseño aprobado, notes/net.md): rollback simétrico. Cada máquina simula el partido entero; solo viajan las ENTRADAS con su
 * tic. La entrada propia se aplica con `delay` tics de retraso (2 = 17 ms). Hay dos partidas por máquina:
 *   gc = la CONFIRMADA: solo avanza con las entradas de los dos huecos para ese tic. Es la verdad (huella, estadísticas, final).
 *   gp = la PREDICHA: se pinta. Cada frame: copyGame(gp, gc) y se resimula hasta el tic actual con las entradas propias reales y las
 *        del rival predichas (su último `move`, los botones a falso y el bit `ai` como estaba).
 * El anfitrión (hueco 0 = equipo 0) solo tiene autoridad para REPARAR: cada HASH_EVERY tics confirmados los dos se mandan
 * Sim.stateHash(gc); si no cuadran, el anfitrión manda su foto (Sim.serialize) de ese tic y el invitado la adopta y resimula.
 *
 * API (VB.Net):
 *   new Session({slot: 0|1, link, opts (createGame; el invitado puede pasar null y adopta las del anfitrión), delay, name, record})
 *     .advance(now ms, entrada) → {g (gp), events (para presentar, sin repetir tras un rollback), confirmed (eventos de gc de este frame),
 *                                 status, tick, gcTick, ping, waitMs, unstable, canAI, info}
 *     .request('chal'|'skip'|'tmo')   flanco que viaja en la entrada del siguiente tic
 *     .setAway(bool)                  bit `ai` (nivel): tu jugador pasa a la IA (pestaña oculta)
 *     .vsAI()                         tras 10 s esperando: seguir contra la IA (el hueco del rival lo lleva la IA hasta que vuelva)
 *     .quit()                         abandonar (adiós fiable; el rival gana). Tras el final (o ya juzgado el abandono) solo avisa: no cambia el resultado.
 *                                     Antes de empezar (connecting / starting) no hay partido: result {why:'cancel'} y el rival queda en 'noShow'
 *   ANTES DE EMPEZAR (revisión F3): 20 s sin oír al rival mientras se conecta (CONNECT_MS), su adiós (también el de la época anterior,
 *     tras pedir la revancha) o su salida en la cuenta atrás → status 'ended', result {why:'noShow'} (no cuenta en el récord).
 *     El nombre del rival lo fija el lobby (o.rivalName); el del saludo solo si no había, y siempre limpio (cleanName).
 *   DESCONEXIÓN (notes/net.md «Desconexión y reconexión»): el rival tiene 60 s desde que se perdió para volver, elija quien elija la IA.
 *     Volver = resync del anfitrión (con su foto). Pasados 60 s cada lado juzga por su cuenta: el anfitrión gana (rivalGone) y el
 *     invitado se queda con «no cuenta» (hostGone, valid=false); los dos pueden seguir contra la IA sin que cambie. El invitado contra la IA
 *     no manda entradas: al oír de nuevo al anfitrión pide 'rejoin' y el anfitrión le manda el resync.
 *   VUELTA DEL ANFITRIÓN (fase 6, notes/net.md «Fase 6»): una sesión de hueco 0 SIN opciones (opts null) es un anfitrión que recargó la
 *     página y perdió su partida (adopt). Saluda como un invitado ({k:'hello', back:1}); el invitado, si sigue en partido y no lo ha
 *     dado por ido, contesta con sus opciones; el anfitrión mide el reloj con pings y manda 'ready'; el INVITADO manda entonces el
 *     resync con SU partida confirmada (la autoridad de la instantánea pasa al invitado solo en este caso) y el anfitrión la adopta.
 *     Después todo sigue como siempre (huellas comparadas, reparaciones con la foto del anfitrión). .back (lo pone el lobby) = aviso
 *     «Volviendo al partido…» mientras se conecta; se borra al empezar o al aplicar el resync.
 *     .confirmedGame() / .predictedGame()
 *   Entrada = {move:[x,y] (mundo canónico), hit, jump, jset, chal, skip, tmo, ai}. Se cuantiza ANTES de usarla también en local.
 *   memPair({lag (RTT ms), jit (± ms por sentido), loss (%), seed, clock}) → [linkA, linkB] (Node / pruebas)
 *   BcLink({room, slot, lag, jit, loss}) → enlace por BroadcastChannel (dos pestañas o dos páginas del mismo Chrome); con o.to, enlace
 *     de una pareja (slot ↔ to) con canal y Shaper propios (netdrive de N páginas, ?net=bc&n=N)
 *   Enlace = {send(ch, data), poll(now) → [{ch, data}], close()}; ch 'in' = no fiable (entradas), 'ctl' = fiable y en orden.
 *   bot(slot, seed, prof, o) → function(g) → entrada (bot de solo entrada para pruebas; lee con useSlot y deja el hueco 0). slot = el
 *     HUECO que lleva (online a N, notes/online-multi-brief.md P0); su equipo, o.team o g.hum[slot].team (con 2 huecos, hueco == equipo:
 *     la firma de siempre bot(team, seed, prof) da exactamente lo mismo). En 6v6 (g.rot) sin balón suyo va a su sitio (VB.AI6.spot).
 *   Enlaces de prueba para N pares (memMesh, memStar): js/nettest-links.js (usa Shaper, exportado aquí).
 *   ONLINE DE VARIOS (Precisa-N, P2 del sprint online-multi): new Session({seats | links (más de uno) | n > 2, …}) devuelve una SessionN
 *     (N plazas, estrella con el anfitrión de centro, bloque «PRECISA-N» más abajo). Sin eso, la Session de 2 de siempre, sin cambios.
 *     packN/unpackN (paquete de varios), adaptDelay(rttMs), SEAT_AI_MS. Bit 7 de los botones = switchPlayer (solo lo manda Precisa-N).
 *   AUDITORÍA (17-nov-2026, notes/net.md «Auditoría»): o.expect (invitado: opciones que anuncia la sala; si no cuadran → 'mismatch'),
 *     resync con id repetido hasta el 'rsok' (lo del canal fiable viejo se pierde al renegociar), los dos recargan → noShow, mensajes
 *     del rival acotados (hash, snapok, resync, delay), tope de 60 s en 'connecting'.
 * ===================================================================== */
(function () {
  'use strict';
  var root = (typeof window !== 'undefined') ? window : globalThis;
  var VB = root.VB = root.VB || {};

  var HZ = (VB.C && VB.C.SIM_HZ) || 120, STEP = 1 / HZ, STEP_MS = 1000 / HZ;
  var PROTO = 1;                 // versión del protocolo (se compara junto con VB.VERSION en el saludo)
  var RING = 8192, RM = RING - 1; // historial de entradas por hueco (68 s)
  var MAXPRED = 24;              // tics de predicción como máximo (200 ms): más allá, la partida espera al rival
  var MAXCATCH = 40;             // tics propios por frame como máximo al ponerse al día
  var MAXSEND = 120;             // entradas por paquete como máximo (redundancia: todo lo que el otro aún no ha confirmado)
  var HASH_EVERY = 120;          // huella cada segundo de partido confirmado
  var START_MS = 1500;           // el tic 0 empieza 1,5 s después del «listo»
  var WARM_CAP_MS = 5000;        // 17-nov-2026: «listo» / arranque esperan a que ESTA máquina compile los gráficos del partido (o.warm), 5 s como mucho
  var REJOIN_MARGIN = 60;        // tics de IA que el anfitrión fija por delante al reconectar al invitado
  var WAIT_AI_MS = 10000, GONE_MS = 60000, UNSTABLE_MS = 1000, EV_PAST_TICKS = 18; // 150 ms
  var CONNECT_MS = 20000;        // revisión F3: sin oír al rival en 20 s mientras se conecta (antes del partido) → no hay partido ('noShow')
  var CONNECT_CAP_MS = 60000;   // auditoría: tope absoluto de 'connecting' desde que empezó (aunque lleguen saludos que no sirven)
  var RS_EVERY_MS = 1500, RS_TRIES = 8;   // auditoría: el resync se repite hasta que el otro lo confirma ('rsok'); lo del canal fiable viejo se pierde al renegociar
  var ADOPT_MS = 40000;          // fase 6: el anfitrión que vuelve tras recargar espera hasta 40 s al invitado (su relink reofrece cada 10 s)
  var EDGE_TTL_MS = 150;         // un botón que no entra en un tic en 150 ms (partida congelada o cuenta atrás) se descarta: nada de golpes «fantasma»
  var B = { hit: 1, jump: 2, jset: 4, chal: 8, skip: 16, tmo: 32, ai: 64 };
  var EDGE = B.hit | B.jump | B.jset | B.chal | B.skip | B.tmo;

  function Sim() { return VB.Sim; }
  /** Nombre del rival tal como lo limpia el lobby (VB.NetRoom.cleanName): sin < > comillas ni controles, nada con @ (nunca un correo),
   *  2-16 caracteres; '' si no vale. El saludo de un cliente modificado no puede poner otro nombre que el de la sala. */
  function cleanName(n) {
    var s = String(n == null ? '' : n).replace(/[\u0000-\u001f\u007f<>"`]/g, '').replace(/\s+/g, ' ').trim();
    if (s.indexOf('@') >= 0) return '';
    var out = '', cs = Array.from(s);
    for (var i = 0; i < cs.length && out.length + cs[i].length <= 16; i++) out += cs[i];
    s = out.trim();
    if (s.length < 2) return '';
    var F = VB.NameFilter;   // (con insultos: «Jugador NNNN», js/namefilter.js)
    return F ? F.shown(s) : s;
  }
  function q16(v) { v = +v || 0; v = v > 1 ? 1 : v < -1 ? -1 : v; return Math.round(v * 32767); }
  /* Controles PC (25-nov-2026): el punto del ratón (input.aim = [x, y] m, mundo canónico) viaja en los bits altos de la misma palabra de
   * botones (anillo B de 32 bits): bit 24 = hay punto, bits 8-15 = ax (int8, pasos de 0,1 m), bits 16-23 = ay (int8, pasos de 0,05 m).
   * Así todas las copias de ternas (x, y, b) lo llevan solas, y la predicción del rival (b & ~EDGE) conserva su último punto. */
  var AIM_F = 1 << 24;
  function qAim(v, k) { v = Math.round((+v || 0) * k); return v > 127 ? 127 : v < -127 ? -127 : v; }
  function aimBits(inp) {
    var a = inp && inp.aim;
    if (!a || !(a.length > 1) || a[0] !== a[0] || a[1] !== a[1]) return 0;
    return AIM_F | ((qAim(a[0], 10) & 255) << 8) | ((qAim(a[1], 20) & 255) << 16);
  }
  function bitsOf(inp) {
    if (!inp) return 0;
    return (inp.hit ? B.hit : 0) | (inp.jump ? B.jump : 0) | (inp.jset ? B.jset : 0) | (inp.chal ? B.chal : 0) |
      (inp.skip ? B.skip : 0) | (inp.tmo ? B.tmo : 0) | (inp.ai ? B.ai : 0) | (inp.switchPlayer ? 128 : 0) | aimBits(inp);   // (128: «¡Pídela!»; solo lo lee Precisa-N)
  }
  /** Entrada cuantizada → objeto de entrada de la sim (out se reutiliza). */
  function decode(x, y, b, out) {
    out = out || { move: [0, 0] };
    out.move[0] = x / 32767; out.move[1] = y / 32767;
    out.hit = !!(b & B.hit); out.jump = !!(b & B.jump); out.jset = !!(b & B.jset); out.chal = !!(b & B.chal);
    out.skip = !!(b & B.skip); out.tmo = !!(b & B.tmo); out.ai = !!(b & B.ai); out.switchPlayer = !!(b & 128);   // (bit 7: el 1 contra 1 nunca lo pone)
    if (b & AIM_F) { var aa = out._aimA || (out._aimA = [0, 0]); aa[0] = ((b << 16) >> 24) / 10; aa[1] = ((b << 8) >> 24) / 20; out.aim = aa; }
    else out.aim = null;
    return out;
  }

  /* ---------- Historial de entradas de un hueco (anillo con etiqueta de tic) ---------- */
  function Ring() { this.X = new Int16Array(RING); this.Y = new Int16Array(RING); this.B = new Uint32Array(RING); this.T = new Int32Array(RING).fill(-1); }
  Ring.prototype.has = function (t) { return t >= 0 && this.T[t & RM] === t; };
  Ring.prototype.put = function (t, x, y, b) { var i = t & RM; this.T[i] = t; this.X[i] = x; this.Y[i] = y; this.B[i] = b; };
  Ring.prototype.dec = function (t, out) { var i = t & RM; return decode(this.X[i], this.Y[i], this.B[i], out); };
  /** Olvida todo lo guardado del tic t en adelante (tras un resync: lo de la partida contra la IA no vale). */
  Ring.prototype.clearFrom = function (t) { var T = this.T; for (var i = 0; i < RING; i++) if (T[i] >= t) T[i] = -1; };

  /* ---------- Paquete de entradas: [1, u32 primer tic, u8 n, n × (i16 x, i16 y, u8 bits), u32 ack, u32 tic del emisor] ---------- */
  // (fase 3: el primer byte lleva además la «época» de la sesión en los 4 bits altos: 1 | época << 4. Una revancha sobre el mismo
  //  enlace es la época siguiente y así un paquete del partido anterior que llegue tarde no se cuela; la época 0 es el byte 1 de siempre)
  // (controles PC: si alguna entrada del paquete lleva el punto del ratón sale como TIPO 5, con entradas de 7 B: i16 x, i16 y, u8 bits,
  //  i8 ax, i8 ay (-128 = sin punto). Sin punto, el TIPO 1 de siempre, byte a byte: teclado, mando y táctil mandan lo mismo que antes)
  function anyAim(R, first, n) { for (var k = 0; k < n; k++) if (R.B[(first + k) & RM] & AIM_F) return true; return false; }
  function putIn(dv, o, x, y, b, w) {
    dv.setInt16(o, x); dv.setInt16(o + 2, y); dv.setUint8(o + 4, b & 255);
    if (w === 7) { var on = (b & AIM_F) !== 0; dv.setInt8(o + 5, on ? (b << 16) >> 24 : -128); dv.setInt8(o + 6, on ? (b << 8) >> 24 : -128); }
  }
  function getIn(dv, o, w, L) {
    var b = dv.getUint8(o + 4);
    if (w === 7) { var ax = dv.getInt8(o + 5), ay = dv.getInt8(o + 6); if (ax !== -128 && ay !== -128) b = (b | AIM_F | ((ax & 255) << 8) | ((ay & 255) << 16)) >>> 0; }
    L.push(dv.getInt16(o), dv.getInt16(o + 2), b);
  }
  function packInputs(ring, first, n, ack, tick, ep) {
    var w = anyAim(ring, first, n) ? 7 : 5;
    var buf = new Uint8Array(14 + n * w), dv = new DataView(buf.buffer), o = 6;
    buf[0] = (w === 7 ? 5 : 1) | ((ep & 15) << 4); dv.setUint32(1, first); buf[5] = n;
    for (var k = 0; k < n; k++) { var i = (first + k) & RM; putIn(dv, o, ring.X[i], ring.Y[i], ring.B[i], w); o += w; }
    dv.setUint32(o, ack); dv.setUint32(o + 4, tick >>> 0);
    return buf;
  }
  function unpackInputs(buf) {
    var ty = buf && buf.length ? buf[0] & 15 : 0;
    if (ty !== 1 && ty !== 5) return null;
    var w = ty === 5 ? 7 : 5;
    var u = buf instanceof Uint8Array ? buf : new Uint8Array(buf), dv = new DataView(u.buffer, u.byteOffset, u.byteLength), n = u[5], o = 6, L = [];
    if (u.length < 14 + n * w) return null;
    for (var k = 0; k < n; k++) { getIn(dv, o, w, L); o += w; }
    return { first: dv.getUint32(1), n: n, v: L, ack: dv.getUint32(o), tick: dv.getUint32(o + 4), ep: u[0] >> 4 };
  }

  /* ---------- Sesión ---------- */
  /** Auditoría: ¿las opciones que manda el anfitrión son las que anunciaba la sala? (el invitado lo comprueba al saludar) */
  function sameRoom(co, e) {
    return !!co.even === !!e.even && (+co.bestOf === 3 ? 3 : 1) === (+e.bestOf === 3 ? 3 : 1) && (co.points | 0) === (e.points | 0) &&
      (co.venue === 'beach' ? 'beach' : 'hall') === (e.venue === 'beach' ? 'beach' : 'hall') && (co.net || '') === (e.net || '');   // (Online V2: el modelo de conexión también)
  }
  function Session(o) {
    o = o || {};
    // online de varios (plazas de main.js, varios enlaces o más de 2 plazas): Precisa-N, más abajo. El 1 contra 1 sigue aquí sin cambios
    if (Array.isArray(o.seats) || (Array.isArray(o.links) && o.links.length > 1) || (o.n | 0) > 2) return new SessionN(o);
    this.slot = o.slot === 1 ? 1 : 0; this.host = this.slot === 0;
    this.link = o.link; this.name = String(o.name || ''); this.rivalName = cleanName(o.rivalName);   // (el del lobby manda; el saludo solo lo pone si no había)
    // fase 3: época (revancha n.º k sobre el mismo enlace: los mensajes de otra época se ignoran), mensajes de la interfaz ('app':
    // revancha, «Continuar»…) y si el rival ya se fue tras el final (bye 'left')
    this.epoch = Math.max(0, Math.min(1e6, o.epoch | 0)); this.appIn = []; this.rivalLeft = false;
    this.delay = Math.max(0, Math.min(8, o.delay == null ? 2 : o.delay | 0));
    this.record = !!o.record; this.rec = this.record ? [] : null;
    this.hashLog = Array.isArray(o.hashLog) ? o.hashLog : null;   // pruebas: [[tic, huella]] de todas las huellas propias
    this.onTick = typeof o.onTick === 'function' ? o.onTick : null; // pruebas: (tic, gc) tras cada paso confirmado
    this.rsPend = null; this.rsId = 0; this.rsIn = 0;   // auditoría: resync pendiente de confirmar, id del último mandado y del último aplicado
    this.expect = o.expect && typeof o.expect === 'object' ? o.expect : null;   // auditoría: invitado: lo que anuncia la sala (even, bestOf, points, venue)
    this.muteBefore = 0; this.syncFloor = -1;   // tras un resync: huellas y fotos de antes no cuentan
    this.log = typeof o.log === 'function' ? o.log : null;
    this.status = 'connecting';   // connecting | starting | playing | waiting | over | ended
    this.opts = null; this.gc = null; this.gp = null;
    this.mine = new Ring(); this.theirs = new Ring();
    this.localTick = 0; this.rHave = 0; this.remoteAck = 0; this.gcTick = 0;
    this.edges = 0; this.edgesAt = -1; this.away = false; this.solo = false; this.valid = true; this.result = null;
    this.goneFlag = false; this.lostAt = -1; this.rivalSolo = false; this.soloEpoch = 0; this.rejoinEpoch = 0; this.rejoinAt = -1e9;
    this.lateAt = -1e9; this.repInvalid = false;
    // fase 6: anfitrión que vuelve tras recargar (sin opciones: adopta la partida del invitado), aviso de vuelta (lo pone el lobby),
    // invitado que ha oído a su anfitrión volver (contesta a su 'ready' con el resync) y «no válido» que avisó el rival
    this.adopt = this.host && !o.opts; this.back = !!o.back; this.hostBack = false; this.rivInvalid = false;
    this.warmFn = typeof o.warm === 'function' ? o.warm : null; this.warmSince = -1; this.startPend = false;
    this.connAt = -1; this.heardAt = -1; this.rttFloor = -1e9;   // revisión F3: plazo de conexión (solo mensajes de esta época) y pongs de antes de un corte
    this.t0 = 0; this.off = 0; this.lastNow = 0; this.lastRecv = 0; this.started = false;
    this.helloAt = -1e9; this.gotHello = false; this.pings = []; this.pingAt = -1e9; this.pingId = 0; this.ready = false;
    this.rtt = 0; this.rttN = 0; this.remoteTick = 0; this.remoteTickAt = 0; this.adv = 0;
    this.waitStart = -1; this.waitMs = 0; this.myHash = {}; this.theirHash = {}; this.snaps = [];
    this.repairPending = false; this.repairs = []; this.mismatches = 0; this.repaired = 0;
    this.cmpOk = 0; this.cmpBad = -1;   // anti-trampas ligero: huellas que cuadraron y tic de la última que no (sin reparar aún)
    this.presTick = 0; this.presKeys = {}; this.presList = []; this.overSeen = false;
    this.stats = { frames: 0, maxDepth: 0, steps: 0, sent: 0, recv: 0, bytesOut: 0, waits: 0, resyncs: 0, rsIn: 0 }; this.rsT = -1;
    this.initEvents = []; this._cand = []; this._conf = [];
    this._ins = [{ move: [0, 0] }, { move: [0, 0] }]; this._pred = { move: [0, 0] };
    this._out = { g: null, events: [], confirmed: [], app: [], status: '', tick: 0, gcTick: 0, ping: 0, waitMs: 0, unstable: false, canAI: false, info: null };
    if (o.opts) this._setOpts(o.opts);
  }
  var SP = Session.prototype;
  SP._log = function (m) { if (this.log) this.log('[net ' + this.slot + '] ' + m); };
  SP._setOpts = function (opts) {
    var S = Sim(), n = {}, k;
    for (k in opts) n[k] = opts[k];
    n.online = true;
    this.opts = n;
    this.gc = S.createGame(n); this.gp = S.createGame(n);
    this.initEvents.length = 0; S.drainEvents(this.gc, this.initEvents); this.gp.events.length = 0;
    // tics 0..delay-1: entrada neutra para los dos (los dos lo saben, no viaja)
    for (var t = 0; t < this.delay; t++) { this.mine.put(t, 0, 0, 0); this.theirs.put(t, 0, 0, 0); }
    this.localTick = 0; this.rHave = this.delay; this.gcTick = 0;
  };
  SP.confirmedGame = function () { return this.gc; };
  SP.predictedGame = function () { return this.gp; };
  /** Fase 6 (repetición online): las dos entradas del último paso confirmado ([hueco 0, hueco 1], decodificadas; objeto reutilizado).
   *  Solo vale dentro de onTick (justo después del Sim.step de gc). */
  SP.stepInputs = function () { return this._ins; };
  SP.request = function (what) { if (B[what] & EDGE) { this.edges |= B[what]; if (this.edgesAt < 0) this.edgesAt = this.lastNow; } };
  SP.setAway = function (on) { this.away = !!on; };
  SP._ctl = function (m) { if (this.epoch) m.ep = this.epoch; try { this.link.send('ctl', JSON.stringify(m)); } catch (e) { } };
  /** Mensaje de la interfaz al rival (fiable, en orden; JSON pequeño): revancha y similares. Llega en r.app del otro lado. */
  SP.sendApp = function (d) { this._ctl({ k: 'app', d: d }); };
  /** Seguir contra la IA (solo esperando al rival y pasados 10 s; force = el abandono por tiempo). El rival puede volver hasta
   *  60 s después de perderse (lostAt). Del lado del invitado el partido no cuenta mientras no vuelva (el resync trae el valid del anfitrión). */
  SP.vsAI = function (force) {
    if (this.solo || this.status !== 'waiting' || (!force && this.waitMs <= WAIT_AI_MS)) return false;
    this.solo = true; this.soloEpoch++;
    if (this.lostAt < 0) this.lostAt = this.waitStart >= 0 ? this.waitStart : this.lastNow;
    if (!this.host) this.valid = false;
    this._ctl({ k: 'solo' }); this._log('seguir contra la IA'); return true;
  };
  SP.quit = function () {
    if (this.status === 'ended') return;
    if (this.status === 'connecting' || this.status === 'starting') {   // antes de empezar: no hay partido (ni derrota ni victoria)
      this._ctl({ k: 'bye', why: 'left' }); this.status = 'ended'; this.result = { why: 'cancel', win: false }; return;
    }
    if (this.status === 'over' || this.goneFlag) {   // salir tras el final (o ya juzgado el abandono del otro): no es abandonar
      this._ctl({ k: 'bye', why: 'left' }); this.status = 'ended'; return;
    }
    this._ctl({ k: 'bye', why: 'quit' });
    this.status = 'ended'; this.result = { why: 'quit', win: false };
  };
  /** Pasaron 60 s sin el rival: cada lado juzga por su cuenta (el anfitrión gana; el invitado, sin anfitrión, «no cuenta»). */
  SP._gone = function () {
    if (this.goneFlag) return;
    if (!this.solo) this.vsAI(true);
    this.goneFlag = true;
    if (this.host) this.result = { why: 'rivalGone', win: true };
    else { this.valid = false; this.result = { why: 'hostGone', win: false }; }
    this._ctl({ k: 'bye', why: 'gone' });   // (llega cuando vuelva la red: el otro ya no espera)
    this._log('el rival no volvió en ' + (GONE_MS / 1000) + ' s');
  };
  /** Antes de empezar (conectando o en la cuenta atrás) el rival se fue o no llegó: no hay partido. */
  SP._noShow = function (why) {
    if (this.status !== 'connecting' && this.status !== 'starting') return;
    this.status = 'ended'; this.result = { why: 'noShow', win: false }; this.rivalLeft = true;
    this._log('no hay partido: ' + why);
  };
  /** Anfitrión: el invitado vuelve cuando ya se le dio por ido. */
  SP._late = function (now) { if (now - this.lateAt > 1000) { this.lateAt = now; this._ctl({ k: 'bye', why: 'late' }); } };

  /* ---- reloj: tic objetivo según el t0 común ---- */
  SP._target = function (now) { return Math.floor((now - this.t0) / STEP_MS); };

  /* ---- mensajes ---- */
  SP._recv = function (now) {
    var L = this.link.poll(now), i;
    for (i = 0; i < L.length; i++) {
      var m = L[i];
      if (this.lastRecv && now - this.lastRecv > UNSTABLE_MS) this.rttFloor = now;   // tras un corte: los pongs de pings de antes no son el ping
      this.lastRecv = now; this.stats.recv++;
      if (m.ch === 'in') this._onInputs(m.data, now);
      else { var c = null; try { c = typeof m.data === 'string' ? JSON.parse(m.data) : m.data; } catch (e) { } if (c) this._onCtl(c, now); }
    }
    // invitado contra la IA que vuelve a oír al anfitrión: pide volver (el anfitrión contesta con un resync, una vez por «época»)
    if (L.length && !this.host && this.solo && !this.goneFlag && this.status !== 'ended' && now - this.rejoinAt > 500) {
      this.rejoinAt = now; this._ctl({ k: 'rejoin', e: this.soloEpoch });
    }
  };
  SP._onInputs = function (data, now) {
    var p = unpackInputs(data); if (!p || !this.opts || p.ep !== (this.epoch & 15)) return;   // (de otra época: el partido anterior)
    this.heardAt = now;
    for (var k = 0; k < p.n; k++) {
      var t = p.first + k;
      if (t < this.gcTick - RING / 2 || this.theirs.has(t)) continue;
      if (this.solo) continue;   // contra la IA: lo que llegue del rival ya no cuenta (se reconecta con resync)
      this.theirs.put(t, p.v[k * 3], p.v[k * 3 + 1], p.v[k * 3 + 2]);
    }
    while (this.theirs.has(this.rHave)) this.rHave++;
    if (p.ack > this.remoteAck) this.remoteAck = p.ack;
    if (p.tick >= this.remoteTick) { this.remoteTick = p.tick; this.remoteTickAt = now; }
    if (this.host && this.solo) { if (this.goneFlag) this._late(now); else this._resync(now); }   // el invitado vuelve (el anfitrión siguió contra la IA)
  };
  SP._onCtl = function (c, now) {
    var S = Sim();
    // revisión F3: el rival se fue desde el partido anterior (pulsó «Revancha» y luego «Volver al menú» antes del «go»): su adiós es
    // de la época anterior, pero esta sesión aún no ha empezado y nunca llegará; sin esto se quedaba «conectando» para siempre
    if (c.k === 'bye' && (c.ep | 0) === this.epoch - 1 && (c.why === 'left' || c.why === 'quit' || c.why === 'gone')) { this._noShow('el rival se fue (época anterior)'); return; }
    if ((c.ep | 0) !== this.epoch) return;   // de otra época (el partido anterior a una revancha): no cuenta
    this.heardAt = now;
    switch (c.k) {
      case 'app': if (this.appIn.length < 64) this.appIn.push(c.d); break;
      case 'hello':
        if (!this.rivalName) this.rivalName = cleanName(c.name);
        if (c.v !== PROTO || c.ver !== (VB.VERSION || '')) { this._ctl({ k: 'bye', why: 'version', ver: VB.VERSION || '' }); this.status = 'ended'; this.result = { why: 'version', rv: String(c.ver || '') }; return; }
        if (this.host && this.adopt) {   // fase 6: el anfitrión vuelve; el invitado le da las opciones (y luego su partida)
          if (!this.gotHello && c.back && c.cfg && c.cfg.opts && !this.opts) {
            this.gotHello = true; this.delay = c.cfg.delay != null ? Math.max(0, Math.min(8, c.cfg.delay | 0)) : this.delay;
            this._setOpts(c.cfg.opts); this.pings.length = 0; this.pingAt = -1e9;
          }
        } else if (this.host) {
          var live = this.status === 'playing' || this.status === 'waiting' || this.status === 'starting';
          if (this.status === 'over' || this.status === 'ended') return;
          if (live && this.goneFlag) { this._ctl({ k: 'bye', why: 'late' }); return; }
          this._ctl({ k: 'hello', v: PROTO, ver: VB.VERSION || '', name: this.name, cfg: { opts: this.opts, delay: this.delay }, live: live });
        } else if (c.back) {   // fase 6: el anfitrión recargó y vuelve: si seguimos en partido, le damos las opciones
          if (this.goneFlag) { this._ctl({ k: 'bye', why: 'gone' }); return; }
          // auditoría: el invitado también recargó (sin opciones): nadie tiene la partida → los dos acaban ya en «no hay partido»
          if (!this.opts) { this._ctl({ k: 'bye', why: 'gone' }); this._noShow('los dos recargaron'); return; }
          this.rsIn = 0;   // (el anfitrión que vuelve es una sesión nueva: sus resync empiezan otra vez en 1)
          if (!this.opts || (this.status !== 'playing' && this.status !== 'waiting')) return;
          this.hostBack = true;
          this._ctl({ k: 'hello', v: PROTO, ver: VB.VERSION || '', name: this.name, cfg: { opts: this.opts, delay: this.delay }, live: true, back: 1 });
        } else if (!this.gotHello) {
          this.gotHello = true;
          if (!this.opts) {
            var co = c.cfg && c.cfg.opts;
            if (!co || typeof co !== 'object' || (this.expect && !sameRoom(co, this.expect))) {   // auditoría: la sala anunciaba otra cosa («Igualado», sets, puntos, sede)
              this._ctl({ k: 'bye', why: 'mismatch' }); this.status = 'ended'; this.result = { why: 'mismatch', win: false }; this._log('la sala no coincide con lo anunciado'); return;
            }
            this.delay = c.cfg.delay != null ? Math.max(0, Math.min(8, c.cfg.delay | 0)) : this.delay; this._setOpts(co);
          }
          this.pings.length = 0; this.pingAt = -1e9;
        }
        break;
      case 'ping': this._ctl({ k: 'pong', t: c.t, th: now, id: c.id }); break;
      case 'pong':
        var rtt = now - c.t;
        if (this.rttN && c.t < this.rttFloor) break;   // (ping mandado antes de un corte: tras volver la red marcaba «673 ms» unos segundos)
        if (rtt < 3000 || !this.rttN) { this.rtt = this.rttN ? this.rtt * 0.8 + rtt * 0.2 : rtt; this.rttN++; }   // (un pong que llega tras un corte no es el ping: «4571 ms»)
        if (rtt < 3000) { this.rttLast = rtt; this.rttSeq = (this.rttSeq || 0) + 1; }   // (crudo, para el informe de red: js/netlog.js)
        if ((!this.host || this.adopt) && !this.ready && c.id < 1000) this.pings.push({ rtt: rtt, off: c.th - (c.t + now) / 2 });
        break;
      case 'ready':
        if (!this.host) {   // fase 6: el anfitrión que volvió ya tiene reloj: le mandamos NUESTRA partida (autoridad del invitado)
          if (this.hostBack && !this.goneFlag && (this.status === 'playing' || this.status === 'waiting')) {
            this.hostBack = false; this.valid = !this.repInvalid && !this.rivInvalid;   // (seguir contra la IA no cuenta si vuelve)
            this._resync(now); this._log('el anfitrión vuelve: le mando mi partida');
          }
          break;
        }
        if (this.status === 'connecting') {
          if (!this._warmOk(now)) { this.startPend = true; break; }   // (aún compilando: arranca en advance cuando acabe)
          this._begin(now);
        } else if (this.status === 'starting') this._ctl({ k: 'start', t0: this.t0 });
        else if (this.status === 'playing' || this.status === 'waiting') { if (this.goneFlag) this._late(now); else this._resync(now); }
        break;
      case 'rejoin':   // el invitado siguió contra la IA y vuelve a oírnos
        if (!this.host || (this.status !== 'playing' && this.status !== 'waiting')) break;
        if (this.goneFlag) { this._late(now); break; }
        if ((c.e | 0) > this.rejoinEpoch) { this.rejoinEpoch = c.e | 0; this._resync(now); }
        break;
      case 'start':
        if (this.host || !this.ready) break;
        this.t0 = c.t0 - this.off; this.status = 'starting';
        break;
      case 'hash':   // (auditoría: solo tics plausibles, múltiplos de HASH_EVERY y cerca del nuestro; si no, un rival podía llenar theirHash sin fin)
        var hk = c.t;
        if (typeof hk !== 'number' || (hk | 0) !== hk || hk % HASH_EVERY || hk <= this.gcTick - HASH_EVERY * 20 || hk > this.gcTick + RING / 2) break;
        this.theirHash[hk] = c.h >>> 0; this._checkHash(hk, now);
        break;
      case 'snap': if (!this.host) this._applySnap(c, now); break;
      case 'snapok':
        if (!this.host || !this.repairPending) break;   // (auditoría: solo si hay una reparación en curso)
        this.repairPending = false; if (this.cmpBad <= (c.t | 0)) this.cmpBad = -1;
        for (var ht in this.theirHash) if (+ht > c.t) this._checkHash(+ht, now);
        break;
      case 'resync':
        var rid = c.id | 0;
        if (rid && rid <= this.rsIn) { this._ctl({ k: 'rsok', id: rid }); break; }   // (auditoría: repetido: ya aplicado; se confirma otra vez)
        if (this.host && !this.adopt) break;   // (fase 6: el anfitrión que volvió adopta la del invitado, una vez)
        if (this.goneFlag) { this._ctl({ k: 'bye', why: 'gone' }); break; }   // ya juzgado: no se vuelve
        if (this._applyResync(c, now) && rid) { this.rsIn = rid; this._ctl({ k: 'rsok', id: rid }); }
        break;
      case 'rsok': if (this.rsPend && (c.id | 0) === this.rsPend.m.id) this.rsPend = null; break;
      case 'solo': this.rivalSolo = true; break;   // el rival sigue contra la IA mientras espera: puede volver (rejoin / resync)
      case 'invalid': this.valid = false; this.rivInvalid = true; break;
      case 'bye':
        if (c.why === 'left' || c.why === 'quit' || c.why === 'gone' || c.why === 'late') this.rivalLeft = true;   // (la revancha ya no es posible)
        if (this.status === 'ended' || this.status === 'over') break;
        if ((this.status === 'connecting' || this.status === 'starting') && c.why !== 'version') { this._noShow('el rival se fue antes de empezar'); break; }
        if (this.goneFlag || c.why === 'left') break;   // ya juzgado por tiempo (se sigue contra la IA) / el rival solo se fue tras el final
        this.status = 'ended';
        this.result = c.why === 'quit' ? { why: 'rivalQuit', win: true } : c.why === 'gone' ? { why: 'rivalGone', win: true } :
          c.why === 'late' ? { why: 'late', win: false } : { why: c.why || 'bye', win: false };
        if (c.why === 'version') this.result.rv = String(c.ver || '');   // (versión del rival: main.js dice quién tiene que reiniciar)
        if (c.why === 'gone' && !this.host) { this.valid = false; this.result = { why: 'hostGone', win: false }; }
        break;
    }
  };

  /* ---- huella y reparación ---- */
  SP._hashTick = function () {
    var S = Sim(), t = this.gcTick, h = S.stateHash(this.gc) >>> 0;
    this.myHash[t] = h; if (!this.solo) this._ctl({ k: 'hash', t: t, h: h });   // (contra la IA las huellas no se comparan)
    if (this.hashLog) this.hashLog.push([t, h]);
    if (this.host) { this.snaps.push({ t: t, d: S.serialize(this.gc) }); if (this.snaps.length > 6) this.snaps.shift(); }
    // poda (≈ 20 s)
    var old = t - HASH_EVERY * 20;
    if (this.myHash[old] !== undefined) delete this.myHash[old];
    if (this.theirHash[old] !== undefined) delete this.theirHash[old];
    this._checkHash(t, this.lastNow);
  };
  SP._checkHash = function (t, now) {
    if (t <= this.syncFloor) return;
    var a = this.myHash[t], b = this.theirHash[t];
    if (a === undefined || b === undefined) return;
    if (a === b) { this.cmpOk++; if (t > this.cmpBad) this.cmpBad = -1; return; }
    if (t > this.cmpBad) this.cmpBad = t;
    if (!this.host) return;                 // el invitado espera la foto del anfitrión
    if (this.repairPending && now - this.repairAt < 3000) return;
    var sn = null; for (var i = 0; i < this.snaps.length; i++) if (this.snaps[i].t === t) sn = this.snaps[i];
    if (!sn) return;
    this.mismatches++; this.repairPending = true; this.repairAt = now;
    this._ctl({ k: 'snap', t: t, d: sn.d }); this._log('huella distinta en el tic ' + t + ': manda la foto');
  };
  SP._applySnap = function (c, now) {
    var S = Sim(), t = c.t | 0;
    if (t > this.gcTick || t < this.gcTick - RING / 2 || t < this.syncFloor) return;
    var to = this.gcTick;
    if (!S.deserialize(c.d, this.gc)) return;
    this.gcTick = t; this.mismatches++; this.repaired++; this.cmpBad = -1;
    this._confirm(to, true);               // resimula hasta donde estaba, con las entradas que ya tenía (sin presentar eventos)
    for (var k = t + HASH_EVERY; k <= this.gcTick; k += HASH_EVERY) if (this.myHash[k] !== undefined) this._ctl({ k: 'hash', t: k, h: this.myHash[k] });
    this._ctl({ k: 'snapok', t: t });
    this.repairs.push(now); while (this.repairs.length && now - this.repairs[0] > 60000) this.repairs.shift();
    if (this.repairs.length >= 3 && this.valid) { this.valid = false; this.repInvalid = true; this._ctl({ k: 'invalid' }); this._log('3 reparaciones en 60 s: partido no válido'); }
    this._log('reparado en el tic ' + t);
  };

  /* ---- reconexión: el anfitrión fija la IA en el hueco del invitado hasta F y le manda la foto de gc y las entradas desde ahí ---- */
  SP._resync = function (now) {
    var S = Sim(), sv = 1 - this.slot;
    if (this.status === 'starting') return;
    var F = this.localTick + this.delay + REJOIN_MARGIN;
    for (var t = this.rHave; t < F; t++) if (!this.theirs.has(t)) this.theirs.put(t, 0, 0, B.ai);
    while (this.theirs.has(this.rHave)) this.rHave++;
    this._confirm(this.localTick, false);
    var T = this.gcTick, mine = [], fab = [], k, i;
    for (k = T; this.mine.has(k); k++) { i = k & RM; mine.push(this.mine.X[i], this.mine.Y[i], this.mine.B[i]); }
    for (k = T; k < F; k++) { i = k & RM; fab.push(this.theirs.X[i], this.theirs.Y[i], this.theirs.B[i]); }
    this.solo = false; this.rivalSolo = false; this.lostAt = -1; this.waitStart = -1; this.stats.resyncs++; this.syncFloor = T; this.repairPending = false;
    this.theirHash = {}; this.cmpBad = -1;   // (las de antes y las de la partida del invitado contra la IA no valen)
    var rm = { k: 'resync', T: T, F: F, d: S.serialize(this.gc), t0: this.t0, mine: mine, fab: fab, valid: this.valid, se: this.soloEpoch, id: ++this.rsId };
    this._ctl(rm); this.rsPend = { m: rm, at: now, n: 0 };   // (auditoría: se repite hasta el 'rsok')
    this._log('resync: foto del tic ' + T + ', IA del rival hasta ' + F);
    void sv;
  };
  SP._applyResync = function (c, now) {
    var S = Sim(), T = c.T | 0, F = c.F | 0, k, j;
    // auditoría: un mensaje mal formado (o malicioso) no puede colgar la pestaña: arrays de verdad y de tamaño acotado
    if (!Array.isArray(c.mine) || !Array.isArray(c.fab) || c.mine.length > 3 * RING || c.fab.length > 3 * RING || F < T || F - T > RING) return false;
    if (!this.opts || !S.deserialize(c.d, this.gc)) return false;
    this.gcTick = T;
    this.mine.clearFrom(T); this.theirs.clearFrom(T);   // lo de la partida contra la IA (o de antes de cortarse) ya no vale
    for (k = T, j = 0; j < c.mine.length; k++, j += 3) this.theirs.put(k, c.mine[j], c.mine[j + 1], c.mine[j + 2]);
    for (k = T, j = 0; j < c.fab.length; k++, j += 3) this.mine.put(k, c.fab[j], c.fab[j + 1], c.fab[j + 2]);
    this.rHave = T; while (this.theirs.has(this.rHave)) this.rHave++;
    this.localTick = T; this.t0 = c.t0 - this.off; this.solo = false; this.rivalSolo = false; this.lostAt = -1;
    this.valid = c.valid !== false && !this.repInvalid;   // (las reparaciones propias ya se avisaron con 'invalid'; seguir contra la IA no cuenta si se vuelve)
    if (this.status !== 'over') this.result = null;
    this.edges = 0; this.edgesAt = -1;
    this.myHash = {}; this.theirHash = {}; this.syncFloor = T; this.cmpBad = -1;
    if (this.status !== 'over') this.status = 'playing';
    this.waitStart = -1; this.started = true; this.stats.resyncs++; this.stats.rsIn++; this.rsT = T;   // (rsIn / rsT: main.js rehace la hoja del lado que salta, auditoría)
    this.presTick = Math.max(T, this._target(now)); this.muteBefore = this.presTick; this.presKeys = {}; this.presList.length = 0;   // lo de antes de volver no suena
    this.remoteAck = Math.max(this.remoteAck, F);
    if (this.adopt) { this.adopt = false; this.rejoinEpoch = Math.max(this.rejoinEpoch, c.se | 0); }   // (fase 6: ya es un anfitrión normal)
    this.back = false;
    this._log('resync aplicado: tic ' + T + ', mando desde ' + F);
    return true;
  };

  /* ---- avance confirmado: gc mientras haya las dos entradas (hasta el tic `upTo`) ---- */
  SP._confirm = function (upTo, silent) {
    var S = Sim(), ins = this._ins, me = this.slot, ot = 1 - me;
    while (this.gcTick < upTo && this.mine.has(this.gcTick) && this.theirs.has(this.gcTick)) {
      var t = this.gcTick;
      this.mine.dec(t, ins[me]); this.theirs.dec(t, ins[ot]);
      if (this.rec && !silent) this._recIn(t);
      S.step(this.gc, STEP, ins);
      this.gcTick = t + 1; this.stats.steps++;
      if (this.onTick && !silent) this.onTick(this.gcTick, this.gc);
      var ev = this.gc.events;
      if (ev.length) {
        if (!silent) for (var i = 0; i < ev.length; i++) { ev[i]._tick = t; this._cand.push(ev[i]); this._conf.push(ev[i]); }
        ev.length = 0;
      }
      if (this.gcTick % HASH_EVERY === 0) {
        if (silent) this.myHash[this.gcTick] = S.stateHash(this.gc) >>> 0;
        else this._hashTick();
      }
    }
  };
  SP._recIn = function (t) {
    var a = this.slot === 0 ? this.mine : this.theirs, b = this.slot === 0 ? this.theirs : this.mine, i = t & RM;
    this.rec[t] = [a.X[i], a.Y[i], a.B[i], b.X[i], b.Y[i], b.B[i]];
  };

  /* ---- presentación de eventos: clave (tic, tipo, jugador, equipo); el punto por marcador; gameOver solo confirmado ---- */
  function evKey(e) {
    if (e.type === 'point') return 'P' + (e.score ? e.score.join('-') : '') + '/' + (e.sets ? e.sets.join('-') : '') + '/' + e.team;
    var pid = e.player && typeof e.player === 'object' ? e.player.id : -1;
    return e._tick + ':' + e.type + ':' + pid + ':' + (e.team == null ? '' : e.team);
  }
  // eventos de solo sonido/efecto: si aparecen tras un rollback de más de 150 ms no se presentan (los de marcador y partido, siempre)
  var SENSORY = { hit: 1, block: 1, blockPress: 1, land: 1, landPlayer: 1, net: 1, netTouch: 1, bounce: 1, dive: 1, toss: 1, jump: 1, swing: 1, miss: 1, juggle: 1, dribble: 1, feint: 1, set: 1, whistle: 1 };
  SP._present = function (out) {
    var C = this._cand, i;
    for (i = 0; i < C.length; i++) {
      var e = C[i], t = e._tick;
      if (e.type === 'gameOver' && !e._conf) continue;
      if (t < this.muteBefore && e.type !== 'gameOver') continue;   // tras una reconexión: lo de antes de volver no se presenta
      var k = evKey(e), seen = this.presKeys[k];
      // (un punto predicho que el rollback anuló no tapa otro punto con el mismo marcador más tarde: a más de 2 s es otro)
      if (seen !== undefined && !(e.type === 'point' && Math.abs(t - seen) > 240)) continue;
      if (t < this.presTick && this.presTick - t > EV_PAST_TICKS && SENSORY[e.type] === 1) { this.presKeys[k] = t; this.presList.push(k); continue; }   // golpe del pasado lejano: sin sonido ni efecto
      this.presKeys[k] = t; this.presList.push(k);
      out.push(e);
    }
    C.length = 0;
    if (this.presList.length > 400) {   // poda de claves viejas
      var lim = this.gcTick - 600, keep = [];
      for (i = 0; i < this.presList.length; i++) { var kk = this.presList[i]; if (this.presKeys[kk] >= lim) keep.push(kk); else delete this.presKeys[kk]; }
      this.presList = keep;
    }
  };

  /* ---- un frame ---- */
  SP.advance = function (now, inp) {
    var S = Sim(), out = this._out, i;
    out.events = []; out.confirmed = []; out.app = this.appIn.length ? this.appIn.splice(0) : [];
    this._cand = []; this._conf = [];
    if (this.link) this._recv(now);
    var dtF = this.lastNow ? now - this.lastNow : 0; this.lastNow = now;
    this.stats.frames++;
    if (inp) this.edges |= bitsOf(inp) & EDGE;

    // saludo, pings y reloj común
    if (this.connAt < 0) this.connAt = now;
    if (this.status === 'connecting' && now - Math.max(this.connAt, this.heardAt) > (this.adopt ? ADOPT_MS : CONNECT_MS)) this._noShow('sin noticias del rival en ' + (CONNECT_MS / 1000) + ' s');
    else if (this.status === 'connecting' && now - this.connAt > CONNECT_CAP_MS) this._noShow('no se ha podido empezar en ' + (CONNECT_CAP_MS / 1000) + ' s');
    if (this.rsPend) {   // auditoría: resync sin confirmar (se perdió con la conexión vieja): otra vez, hasta RS_TRIES
      if (this.goneFlag || this.status === 'ended' || this.status === 'over' || this.rsPend.n >= RS_TRIES) this.rsPend = null;
      else if (now - this.rsPend.at > RS_EVERY_MS) { this.rsPend.at = now; this.rsPend.n++; this._ctl(this.rsPend.m); this._log('resync sin confirmar: lo repito'); }
    }
    if (this.status === 'connecting') {
      if ((!this.host || this.adopt) && !this.gotHello && now - this.helloAt > 500) { this.helloAt = now; this._ctl(this.adopt ? { k: 'hello', v: PROTO, ver: VB.VERSION || '', name: this.name, back: 1 } : { k: 'hello', v: PROTO, ver: VB.VERSION || '', name: this.name }); }
      if ((!this.host || this.adopt) && this.gotHello && !this.ready) {
        if (this.pings.length < 8 && now - this.pingAt > 60) { this.pingAt = now; this._ctl({ k: 'ping', t: now, id: this.pingId++ }); }
        if ((this.pings.length >= 8 || (this.pings.length >= 3 && this.pingId > 30)) && this._warmOk(now)) {
          var best = this.pings.slice().sort(function (a, b) { return a.rtt - b.rtt; }).slice(0, 3);
          var offs = best.map(function (p) { return p.off; }).sort(function (a, b) { return a - b; });
          this.off = offs[offs.length >> 1]; this.ready = true; this._ctl({ k: 'ready' });
          this._log('reloj: desfase ' + this.off.toFixed(1) + ' ms, RTT ' + best[0].rtt.toFixed(1) + ' ms');
        } else if (this.pingId > 30 && this.pings.length < 3) { this.pingId = 0; this.pings.length = 0; }   // reintento
      }
    }
    if (this.startPend && this.status === 'connecting' && this._warmOk(now)) { this.startPend = false; this._begin(now); }
    if (this.status === 'starting' && now >= this.t0) { this.status = 'playing'; this.started = true; this.back = false; this.lastRecv = now; }   // (auditoría: en la cuenta atrás no viaja nada: sin esto «Conexión inestable» parpadeaba al empezar)
    // botones: en la cuenta atrás no cuentan; si no entran en un tic en EDGE_TTL_MS (partida congelada) se descartan
    if (this.edges && this.edgesAt < 0) this.edgesAt = now;
    if (this.status === 'connecting' || this.status === 'starting' || (this.edges && now - this.edgesAt > EDGE_TTL_MS)) this.edges = 0;
    if (!this.edges) this.edgesAt = -1;
    // pings de RTT (cada segundo, los dos)
    if ((this.status === 'playing' || this.status === 'waiting') && now - this.pingAt > 1000) { this.pingAt = now; this._ctl({ k: 'ping', t: now, id: 1000 + (this.pingId++) }); }

    var playing = this.status === 'playing' || this.status === 'waiting' || this.status === 'over';
    if (playing && this.opts) {
      var target = this._target(now), budget = this.maxCatch > 0 ? Math.min(this.maxCatch, 600) : MAXCATCH, stalled = false;   // (maxCatch: pestaña oculta, main.js)
      if (this.solo) {   // contra la IA: el hueco del rival lo lleva la IA (bit ai) en todos los tics que hagan falta
        for (var ft = this.rHave; ft < this.localTick + this.delay + MAXCATCH + 1; ft++) if (!this.theirs.has(ft)) this.theirs.put(ft, 0, 0, B.ai);
        while (this.theirs.has(this.rHave)) this.rHave++;
      }
      var mv = inp && inp.move ? inp.move : null, mx = mv ? q16(mv[0]) : 0, my = mv ? q16(mv[1]) : 0;
      var lvl = ((inp && inp.ai) || this.away ? B.ai : 0) | aimBits(inp);   // (+ el punto del ratón, controles PC)
      while (this.localTick < target && budget-- > 0) {
        if (this.localTick - this.rHave >= MAXPRED) { stalled = true; break; }
        var st = this.localTick + this.delay;
        if (!this.mine.has(st)) { this.mine.put(st, mx, my, this.edges | lvl); this.edges = 0; this.edgesAt = -1; }
        this.localTick++;
      }
      if (stalled) {
        if (this.waitStart < 0) { this.waitStart = now; this.stats.waits++; }
        this.t0 = now - this.localTick * STEP_MS;   // el reloj se congela: al volver no hay ráfaga
      } else if (this.localTick - this.rHave < MAXPRED) this.waitStart = -1;   // (fase 3: con pantallas de más de 120 Hz un frame sin tic que hacer no es «ya no espero»: antes la espera parpadeaba y nunca llegaba a los 10 s)
      this.waitMs = this.waitStart >= 0 ? now - this.waitStart : 0;
      if (this.status !== 'over') this.status = this.waitStart >= 0 && this.waitMs > 100 ? 'waiting' : 'playing';
      // el rival no vuelve en 60 s desde que se perdió (esperando o ya contra la IA): abandono por tiempo
      var lostFor = this.solo ? (this.lostAt >= 0 ? now - this.lostAt : 0) : this.waitMs;
      if (lostFor > GONE_MS && !this.goneFlag && this.status !== 'over') this._gone();
      this.goneIn = lostFor > 0 && !this.goneFlag && this.status !== 'over' ? Math.max(0, GONE_MS - lostFor) : 0;   // (HUD: «si no vuelve en N s»)
      // entradas al rival: todo lo que aún no ha confirmado (redundancia contra la pérdida). Salen en cuanto se generan los tics de
      // este frame, ANTES de confirmar/predecir/presentar (17-nov-2026: antes iban al final del frame; < 1 ms, pero gratis)
      var have = this.localTick + this.delay, from = Math.max(this.remoteAck, have - MAXSEND * 8);
      if (this.solo && !this.host) { /* invitado contra la IA: no manda entradas (al volver pide 'rejoin') */ }
      else if (this.link && have > from) {
        for (var a = from, np = 0; a < have && np < 4; a += 255, np++) {
          var n = Math.min(255, have - a), pk = packInputs(this.mine, a, n, this.rHave, this.localTick, this.epoch);
          this.link.send('in', pk); this.stats.sent++; this.stats.bytesOut += pk.length;
        }
      } else if (this.link) { var pk0 = packInputs(this.mine, have, 0, this.rHave, this.localTick, this.epoch); this.link.send('in', pk0); }
      // ventaja de frames (GGPO): si vamos por delante del rival más de 1,5 tics de media, cedemos poco a poco
      if (this.rttN && this.remoteTickAt && !this.solo && !stalled) {
        var est = this.remoteTick + (now - this.remoteTickAt + this.rtt / 2) / STEP_MS, adv = this.localTick - est;
        this.adv = this.adv * 0.95 + adv * 0.05;
        if (this.adv > 1.5) this.t0 += STEP_MS * 0.125;
      }
      // confirmada y predicha
      this._confirm(this.localTick, false);
      for (i = 0; i < this._conf.length; i++) this._conf[i]._conf = true;
      if (this._conf.length) for (i = 0; i < this._conf.length; i++) {
        out.confirmed.push(this._conf[i]);
        if (this._conf[i].type === 'gameOver') {
          this.status = 'over';
          if (this.solo && !this.goneFlag) this._gone();   // acabó contra la IA sin que el rival volviera: abandono
          if (!this.result) {
            this.result = { why: 'over', win: this._conf[i].team === this.slot };
            // anti-trampas ligero (sin servidor no hay árbitro): el final solo cuenta si las huellas de los dos lados cuadraban al
            // acabar: alguna comparada y ninguna distinta sin reparar. Si no, «no válido» (NetRec: no suma ni resta)
            if (!this.cmpOk || this.cmpBad >= 0) { this.result.unverified = true; this._log('final sin huellas que cuadren: no válido'); }
          }
        }
      }
      this._predict();
      this._present(out.events);
      this.presTick = Math.max(this.presTick, this.localTick);
    }
    out.g = this.gp; out.status = this.status; out.tick = this.localTick; out.gcTick = this.gcTick;
    out.ping = Math.round(this.rtt); out.waitMs = this.waitMs;
    out.unstable = (this.status === 'playing' || this.status === 'waiting') && !this.solo && now - this.lastRecv > UNSTABLE_MS;
    out.canAI = this.status === 'waiting' && this.waitMs > WAIT_AI_MS && !this.solo;
    out.goneIn = this.goneIn || 0;
    out.startIn = this.status === 'starting' ? Math.max(0, this.t0 - now) : 0;
    out.solo = this.solo; out.valid = this.valid; out.result = this.result; out.rivalSolo = this.rivalSolo; out.gone = this.goneFlag; out.rivalLeft = this.rivalLeft;
    void dtF;
    return out;
  };
  /** Anfitrión: el tic 0 dentro de START_MS (los dos ya han compilado los gráficos del partido o se acabó WARM_CAP_MS). */
  SP._begin = function (now) {
    this.t0 = now + START_MS; this.status = 'starting';
    this._ctl({ k: 'start', t0: this.t0 }); this._log('empieza en ' + START_MS + ' ms');
  };
  /** ¿Ha acabado esta máquina de preparar el partido (programas compilados y primer dibujo)? Sin o.warm, siempre; con tope. */
  SP._warmOk = function (now) {
    if (!this.warmFn) return true;
    if (this.warmSince < 0) this.warmSince = now;
    var ok = true; try { ok = !!this.warmFn(); } catch (e) { ok = true; }
    if (!ok && now - this.warmSince > WARM_CAP_MS) { ok = true; this._log('sigo sin acabar de compilar en ' + WARM_CAP_MS + ' ms: empiezo igual'); }
    if (ok) this.warmFn = null;
    return ok;
  };
  SP._predict = function () {
    var S = Sim(), gp = this.gp, ins = this._ins, me = this.slot, ot = 1 - me, P = this._pred;
    S.copyGame(gp, this.gc);
    var depth = this.localTick - this.gcTick;
    if (depth > this.stats.maxDepth) this.stats.maxDepth = depth;
    this.stats.depth = depth;   // (rollback de este frame, para el informe de red: js/netlog.js)
    if (depth <= 0) return;
    // predicción del rival: su última entrada conocida, con los flancos a falso (el bit ai se mantiene)
    var lk = this.rHave - 1;
    if (lk >= 0 && this.theirs.has(lk)) { var j = lk & RM; decode(this.theirs.X[j], this.theirs.Y[j], this.theirs.B[j] & ~EDGE, P); }
    else decode(0, 0, 0, P);
    for (var t = this.gcTick; t < this.localTick; t++) {
      this.mine.dec(t, ins[me]);
      if (this.theirs.has(t)) this.theirs.dec(t, ins[ot]); else { var q = ins[ot]; q.move[0] = P.move[0]; q.move[1] = P.move[1]; q.hit = q.jump = q.jset = q.chal = q.skip = q.tmo = false; q.ai = P.ai; q.switchPlayer = false; }
      S.step(gp, STEP, ins);
      var ev = gp.events;
      if (ev.length) { for (var i = 0; i < ev.length; i++) { ev[i]._tick = t; this._cand.push(ev[i]); } ev.length = 0; }
    }
  };

  /* =====================================================================
   * PRECISA-N (sprint online-multi, paquete P2; notes/online-multi-brief.md §3 recomendación 2 y §9)
   * El mismo rollback de Precisa con N PLAZAS humanas (2v2 con hasta 4 humanos, coop de 2 en el mismo equipo; el 6v6 de 12 solo en
   * pruebas: en producción el 6v6 va con el modelo del anfitrión, P5). new VB.Net.Session(o) da una SessionN cuando o trae `seats`
   * (lo que pasa main.js en el online de varios), más de un enlace o o.n > 2; el 1 contra 1 sigue con la Session de arriba, sin tocar.
   *   PLAZA: hueco = índice de plaza en g.hum (NO el equipo; su equipo es g.hum[slot].team). Un anillo de entradas por plaza.
   *   ESTRELLA: el anfitrión (plaza 0) es el centro. Anfitrión: o.links = un enlace por invitado (la plaza de cada enlace la dice su
   *     saludo; o.linkSeats[j] la fija de antemano). Invitado: o.links[0] (u o.link) = su enlace con el anfitrión. El anfitrión reenvía
   *     a cada invitado las entradas de todas las demás plazas (de SU anillo, con el ack de cada invitado por plaza) y los mensajes
   *     'app' de un invitado a los demás. Invitado↔invitado = dos tramos.
   *   PAQUETE 'in' de varios (tipo 2): [2 | época << 4, u8 plaza emisora, u8 nb, u32 tic del emisor, u8 na, na × u32 ack (rHave del
   *     emisor por plaza; la suya = lo que tiene suyo), nb × (u8 plaza, u32 primer tic, u32 tic de esa plaza, u8 n, n × (i16 x, i16 y,
   *     u8 bits))]. Con n = 2 va el paquete de tipo 1 de siempre (sin plaza: es la otra), así que una SessionN de 2 plazas habla con
   *     la Session del 1 contra 1 (también hello/start/hash/snap/resync: tools/net4test.js lo prueba en los dos sentidos).
   *   Bit 7 de los botones = switchPlayer («¡Pídela!» del 6v6, sim g.ask6). El 1 contra 1 nunca lo pone.
   *   CONFIRMAR: gc avanza un tic cuando están las entradas de TODAS las plazas. Las plazas que lleva la IA no esperan: el anfitrión
   *     escribe por ellas la entrada {ai} (la sim pasa la plaza a la IA) y la reenvía como cualquier otra, así todos confirman lo mismo.
   *   PREDECIR: cada plaza remota, con su última entrada conocida (botones a falso, el bit ai como estaba).
   *   ESPERA: si alguna plaza va MAXPRED_N (60) tics por detrás, se espera (r.waitFor = esas plazas). El anfitrión pasa a la IA la plaza que
   *     no oye en SEAT_AI_MS o que le hace esperar SEAT_AI_MS seguidos, y el partido sigue (aviso {k:'seat', s, ai:1} a todos). Si la
   *     vuelve a oír seguida REJOIN_STABLE_MS, le manda un resync (foto de gc + las entradas de todas las plazas desde ahí) y vuelve.
   *     Con más de 2 plazas, la que hace esperar a todos a ratos (SLOW_MS de espera acumulada en ~10 s) también pasa a la IA, y el
   *     anfitrión le manda un resync de ESPECTADOR (spect): ve el partido de verdad con su jugador llevado por la IA (r.meAI) en vez de
   *     una partida que ya no es la de los demás; vuelve sola pasados SLOW_BACK_MS (cada vez el doble). En el paquete de un invitado,
   *     los 4 bits altos de la plaza llevan el n.º de su último resync (para no creerse un ack viejo de su propia plaza).
   *     60 s con la IA = se ha ido (seatGone). Un invitado que pierde al anfitrión espera como en el 1 contra 1 (10 s → «Seguir con
   *     la IA», 60 s → «no cuenta»).
   *   HUELLAS: cada invitado manda la suya al anfitrión y el anfitrión la suya a todos; si la de un invitado no cuadra, el anfitrión le
   *     manda la foto de ese tic (solo a él). Un final sin huellas que cuadren no cuenta (result.unverified).
   *   RETRASO ADAPTATIVO: el anfitrión calcula clamp(round(maxRTT/2/STEP_MS) - 16, 2, 8) en cada punto confirmado (maxRTT = el peor
   *     camino entre dos plazas: por la estrella, invitado↔invitado = suma de sus dos pings) y lo manda ({k:'delay'}); cada uno lo
   *     aplica en el siguiente balón muerto. (El retraso de cada uno no hace falta que coincida para el determinismo: las entradas van
   *     con su tic; se acuerda para que todos predigan lo mismo.) o.adaptive === false lo deja fijo.
   *   VENTAJA DE FRAMES: contra la plaza más atrasada (la estimación del anfitrión viaja con cada bloque reenviado).
   *   RESULTADO por EQUIPO: win = gameOver.team === g.hum[slot].team. Si todas las plazas humanas del equipo rival se van
   *     (abandono) → 'rivalQuit' (ganas); 60 s perdidas → 'rivalGone' (ganas, se sigue con la IA). Un compañero que se va lo lleva la
   *     IA y el partido sigue. El anfitrión es el centro: si se va él, se acaba ('rivalQuit' si era el último rival, si no 'hostGone').
   * API: la de Session (advance, request, setAway, vsAI, quit, sendApp, confirmedGame, predictedGame, stepInputs) y además
   *   r.waitFor (plazas a las que se espera), r.pings[s] (ping de cada plaza con el anfitrión; la tuya, el tuyo), r.aiSeats (plazas
   *   que lleva la IA por la red), sess.seatGone(s), sess.seatAI(s), sess.n, sess.team, sess.delay.
   *   o: {slot (TU plaza), links | link, linkSeats?, seats [{team, idx, name}…] o n, opts (anfitrión), delay, adaptive, aiSeats
   *   (anfitrión: plazas que ya se sabe que no vienen: la IA desde el tic 0), name, names, rivalName, epoch, expect, warm, log,
   *   record, hashLog, onTick}.
   *   ENVÍO (lane B): con frames de 13 ms o más (60 Hz), un paquete por frame y enlace, como siempre; con pantallas más rápidas, como
   *     mucho SEND_HZ (60) de media por enlace (crédito; cada paquete lleva todo lo no confirmado, así que no se pierde nada). Un cambio
   *     de la entrada (stick > SEND_SIG desde lo último mandado) puede adelantarse un frame pidiendo crédito prestado; un botón, siempre.
   *     o.pace === false: un paquete por frame (pruebas).
   *   VUELTA TRAS RECARGAR (lane A en el lobby): la página nueva es una sesión nueva, sin opts, en su plaza y con la misma época, por el
   *     mismo enlace renegociado (mxRelinkHost) o por uno nuevo (sess.addLink en el anfitrión): saludo → hello con las opts → ready →
   *     el anfitrión la pasa a la IA y le manda el resync. Probado en net4test (o) con 5-40 s de página muerta y en el coop de 2.
   *   PENDIENTE: la vuelta del anfitrión que recarga (fase 6) no existe en el de varios: un anfitrión sin opts = no hay partido.
   * ===================================================================== */
  var SW = 128;                        // bit 7: switchPlayer
  var EDGE_N = EDGE | SW;
  var SEAT_AI_MS = 3000;               // plaza que no se oye o que hace esperar 3 s seguidos → la IA (el partido sigue)
  var REJOIN_STABLE_MS = 1000;         // la plaza vuelve tras oírla seguida 1 s…
  var RS_GAP_MS = 3000;                // …y como mucho un resync cada 3 s por plaza (una conexión que va y viene no inunda de fotos)
  var PINGS_EVERY_MS = 2000;           // el anfitrión manda los pings de todas las plazas
  var SLOW_MS = 2500, SLOW_TAU_MS = 10000; // con más de 2 plazas: la que acumula 2,5 s de espera de todos en ~10 s (media que se olvida) → la IA
  var SLOW_BACK_MS = 20000, SLOW_BACK_MAX = 120000;   // y no vuelve hasta 20 s después (40, 80… hasta 2 min si se repite)
  var PK_BUDGET = 1000;                // bytes por paquete 'in' (fragmentar en SCTP no fiable multiplica la pérdida)
  var DELAY_MIN = 2, DELAY_MAX = 8;
  // Ritmo de envío (lane B, 22-nov-2026): antes salía un paquete 'in' por frame y por enlace, así que una pantalla de 120-144 Hz
  // mandaba el doble (27,8 KB/s por enlace a 126 fps). Ahora, con frames de menos de SEND_FAST_DT ms de media, como mucho SEND_HZ
  // paquetes por segundo y enlace (crédito por enlace, de media exacta; nunca más de un frame de espera). No se pierde nada: cada
  // paquete lleva todo lo que el otro aún no ha confirmado. Un botón propio o reenviado sale en el acto; un cambio del stick de más de
  // SEND_SIG puede adelantarse un frame con crédito prestado. Con 60 Hz, igual que antes (cada frame). Medido (net4test (n), 126 fps,
  // 150 ms, retraso fijo 4): 117 → 59 paquetes/s y 37 → 19 KB/s de subida del anfitrión por enlace; profundidad p99 +2-4 tics (medio
  // frame más por tramo); con 6 semillas, correcciones visibles como las de un móvil de 60 Hz sin tope (dentro del ruido).
  var MAXPRED_N = 60;                  // tope de predicción de Precisa-N (tics; el 1 contra 1 sigue con MAXPRED = 24). Ver las notas de abajo
  // Estrés (22-nov-2026, tools/stresstest.js): con 30, un corte de 300 ms de UN enlace (wifi que se va un momento) paraba a los 4 unos
  // 250 ms (a 150 ms de RTT el camino invitado → anfitrión → invitado ya gasta ~24 de los 30), y a 250 ms de RTT ±40 el camino solo ya
  // pasaba de 30 (micro-esperas de 7 s por partido). El tope solo cuenta cuando se llega a él (lo normal sigue en 20-25 tics), así que
  // subirlo cambia únicamente lo que antes era una espera: ahora se sigue prediciendo esa plaza con su última entrada y se corrige al
  // llegar (un rollback de hasta 60 tics UNA vez: ~5 ms con la sim ×4 de un móvil, cabe en el frame). Cortes cada ~10 s en cada
  // enlace, 2v2 × 4 a 150 ms: frames en espera 1280 → 5, micro-esperas 16 s → 0,2 s; 250 ms ±40: 7,1 s → 0; saltos visibles igual.
  // Tope de predicción (lane B, 22-nov-2026): los invitados de 2v2 a 150 ms llegan al tope de 24 por el camino invitado → anfitrión →
  // invitado (p95 19-22 tics) y se quedan quietos un frame de vez en cuando. Medido con net4test --lane --maxpred (2v2 × 4, 5 semillas
  // × 90 s, móvil de 60 Hz: render 9 ms + sim × 6 con 20 µs por tic y 130 µs por copia): tope 30 = 0 micro-esperas (antes 0,07-0,09 %
  // de los frames), mismas correcciones visibles (dentro del ruido: -8 % a 150 ms, +5 % con 40/120/200), coste de la sim en el móvil
  // p99 3,7 → 3,8 ms y máx 4,4 → 4,6 ms, ningún frame perdido; 36 da lo mismo que 30 (nunca pasa de 30). Bajar el «- 16» del retraso
  // (K 13: +3 tics, 25 ms más de retraso propio) quita un 20-30 % de correcciones pero no las esperas y se nota en tu jugador: no.
  var PRED_SOFT = 30;                  // tics: más allá, seguir prediciendo una plaza cuenta como esperarla (detección de conexión lenta)
  var SEND_HZ = 60, SEND_MS = 1000 / SEND_HZ, SEND_FAST_DT = 13, SEND_SIG = Math.round(0.05 * 32767);
  /** Retraso de entrada para el peor camino entre dos plazas (notes/net.md: clamp(round(RTT/2/STEP_MS) - 16, 2, 8)). */
  var DELAY_K = 16;
  function adaptDelay(maxRtt, k) { return Math.max(DELAY_MIN, Math.min(DELAY_MAX, Math.round((+maxRtt || 0) / 2 / STEP_MS) - (k > 0 ? k : DELAY_K))); }

  /** Paquete de varios: bl = [{s, first, n, st (tic de esa plaza), ring}]. */
  function packN(from, tick, acks, bl, ep) {
    var na = acks.length, size = 8 + 4 * na, k, j;
    var w = 5; for (k = 0; k < bl.length; k++) if (anyAim(bl[k].ring, bl[k].first, bl[k].n)) w = 7;   // (controles PC: TIPO 6 con el punto del ratón)
    for (k = 0; k < bl.length; k++) size += 10 + w * bl[k].n;
    var buf = new Uint8Array(size), dv = new DataView(buf.buffer), o = 8;
    buf[0] = (w === 7 ? 6 : 2) | ((ep & 15) << 4); buf[1] = from & 255; buf[2] = bl.length; dv.setUint32(3, tick >>> 0); buf[7] = na;
    for (k = 0; k < na; k++) { dv.setUint32(o, acks[k] >>> 0); o += 4; }
    for (k = 0; k < bl.length; k++) {
      var b = bl[k], R = b.ring;
      buf[o] = b.s; dv.setUint32(o + 1, b.first >>> 0); dv.setUint32(o + 5, Math.max(0, b.st) >>> 0); buf[o + 9] = b.n; o += 10;
      for (j = 0; j < b.n; j++) { var i = (b.first + j) & RM; putIn(dv, o, R.X[i], R.Y[i], R.B[i], w); o += w; }
    }
    return buf;
  }
  function unpackN(buf) {
    var ty = buf && buf.length ? buf[0] & 15 : 0;
    if (ty !== 2 && ty !== 6) return null;
    var u = buf instanceof Uint8Array ? buf : new Uint8Array(buf), w = ty === 6 ? 7 : 5;
    if (u.length < 8) return null;
    var dv = new DataView(u.buffer, u.byteOffset, u.byteLength), nb = u[2], na = u[7], o = 8, k, j;
    if (u.length < 8 + 4 * na) return null;
    var acks = []; for (k = 0; k < na; k++) { acks.push(dv.getUint32(o)); o += 4; }
    var bl = [];
    for (k = 0; k < nb; k++) {
      if (u.length < o + 10) return null;
      var s = u[o], first = dv.getUint32(o + 1), st = dv.getUint32(o + 5), n = u[o + 9], v = []; o += 10;
      if (u.length < o + w * n) return null;
      for (j = 0; j < n; j++) { getIn(dv, o, w, v); o += w; }
      bl.push({ s: s, first: first, st: st, n: n, v: v });
    }
    return { from: u[1] & 15, gen: u[1] >> 4, tick: dv.getUint32(3), acks: acks, bl: bl, ep: u[0] >> 4 };
  }

  function SessionN(o) {
    o = o || {};
    var n = Array.isArray(o.seats) && o.seats.length >= 2 ? o.seats.length : Math.max(2, o.n | 0), s, k;
    if (n > 16) throw new Error('netN: ' + n + ' plazas (16 como mucho)');
    this.n = n; this.multi = true;
    this.slot = Math.max(0, Math.min(n - 1, o.slot | 0)); this.host = this.slot === 0;
    this.team = o.seats && o.seats[this.slot] && o.seats[this.slot].team === 1 ? 1 : 0;   // (el de verdad lo deja la sim al crear la partida)
    this.links = Array.isArray(o.links) && o.links.length ? o.links.slice() : o.link ? [o.link] : [];
    this.link = this.links[0] || null;
    this.name = String(o.name || ''); this.rivalName = cleanName(o.rivalName);
    this.names = Array.isArray(o.names) ? o.names.map(function (x) { return String(x || ''); }) : [];
    this.epoch = Math.max(0, Math.min(1e6, o.epoch | 0)); this.appIn = []; this.rivalLeft = false;
    this.delay = Math.max(0, Math.min(8, o.delay == null ? 2 : o.delay | 0)); this.adaptive = o.adaptive !== false; this.pendDelay = -1; this.delayTo = this.delay;
    this.record = !!o.record; this.rec = this.record ? [] : null;
    this.hashLog = Array.isArray(o.hashLog) ? o.hashLog : null;
    this.onTick = typeof o.onTick === 'function' ? o.onTick : null;
    this.expect = o.expect && typeof o.expect === 'object' ? o.expect : null;
    this.log = typeof o.log === 'function' ? o.log : null;
    this.status = 'connecting'; this.opts = null; this.gc = null; this.gp = null;
    // por plaza
    this.rings = []; this.rHave = []; this.remoteTick = []; this.remoteTickAt = []; this.rtts = []; this.rttNs = []; this.seatRtt = [];
    this.heard = []; this.heardSince = []; this.aiHeld = []; this.gone = []; this.aiAt = []; this.lastRs = []; this.blockSince = []; this.blockAcc = []; this.slowN = []; this.slowUntil = []; this.spectS = []; this.rsIdS = [];
    this.readyS = []; this.theirHashS = []; this.repairPend = []; this.repairAtS = []; this.cmpBadS = []; this.hashFloor = []; this.rsPendS = [];
    this.rejoinEp = []; this.acks = []; this.seatLink = []; this._ins = []; this._pred = [];
    for (s = 0; s < n; s++) {
      this.rings.push(new Ring()); this.rHave.push(0); this.remoteTick.push(0); this.remoteTickAt.push(0); this.rtts.push(0); this.rttNs.push(0); this.seatRtt.push(0);
      this.heard.push(-1e9); this.heardSince.push(-1e9); this.aiHeld.push(false); this.gone.push(''); this.aiAt.push(-1); this.lastRs.push(-1e9); this.blockSince.push(-1); this.blockAcc.push(0); this.slowN.push(0); this.slowUntil.push(-1e9); this.spectS.push(false); this.rsIdS.push(0);
      this.readyS.push(false); this.theirHashS.push({}); this.repairPend.push(false); this.repairAtS.push(-1e9); this.cmpBadS.push(-1); this.hashFloor.push(-1); this.rsPendS.push(null);
      var a = []; for (k = 0; k < n; k++) a.push(0);
      this.rejoinEp.push(0); this.acks.push(a); this.seatLink.push(-1); this._ins.push({ move: [0, 0] }); this._pred.push({ move: [0, 0] });
    }
    this.mine = this.rings[this.slot]; this.mineTop = 0;
    this.linkSeat = []; for (s = 0; s < this.links.length; s++) this.linkSeat.push(-1);
    if (this.host && Array.isArray(o.linkSeats)) for (s = 0; s < this.links.length; s++) { var q = o.linkSeats[s] | 0; if (q > 0 && q < n) { this.linkSeat[s] = q; this.seatLink[q] = s; } }
    if (!this.host) { this.linkSeat[0] = 0; this.seatLink[0] = 0; }
    this.preAI = []; if (this.host && Array.isArray(o.aiSeats)) for (s = 0; s < o.aiSeats.length; s++) { var x = o.aiSeats[s] | 0; if (x > 0 && x < n) this.preAI.push(x); }
    this.rsId = 0; this.rsIn = 0; this.rsPend = null; this.muteBefore = 0; this.syncFloor = -1;
    this.localTick = 0; this.remoteAck = 0; this.gcTick = 0;
    this.edges = 0; this.edgesAt = -1; this.away = false; this.solo = false; this.valid = true; this.result = null;
    this.goneFlag = false; this.lostAt = -1; this.rivalSolo = false; this.soloEpoch = 0; this.rejoinAt = -1e9; this.meAI = false; this.spect = false;
    this.lateAt = -1e9; this.repInvalid = false; this.rivInvalid = false; this.back = !!o.back; this.adopt = false; this.hostBack = false;
    this.warmFn = typeof o.warm === 'function' ? o.warm : null; this.warmSince = -1; this.startPend = false;
    this.connAt = -1; this.heardAt = -1; this.rttFloor = -1e9;
    this.t0 = 0; this.off = 0; this.lastNow = 0; this.lastRecv = 0; this.started = false;
    this.helloAt = -1e9; this.gotHello = false; this.pings = []; this.pingAt = -1e9; this.pingId = 0; this.ready = false; this.pingsAt = -1e9;
    this.rtt = 0; this.rttN = 0; this.adv = 0; this.waitStart = -1; this.waitMs = 0; this.waitFor = [];
    this.maxPred = o.maxPred > 0 ? Math.max(8, Math.min(120, o.maxPred | 0)) : MAXPRED_N;   // (tope de predicción de Precisa-N; ver MAXPRED_N)
    this._soft = Math.min(this.maxPred, PRED_SOFT);   // (para contar esperas de una conexión lenta, como con el tope de 30 de antes)
    this.delayK = o.delayK > 0 ? o.delayK | 0 : DELAY_K;   // (pruebas: el «- 16» de la fórmula del retraso)
    this.pace = o.pace !== false;   // (pruebas: false = un paquete por frame, como antes)
    this.sendCr = []; this.dtE = 0; this._fast = false; this._crAdd = 1; this._urg = 0; this.refT = [];   // (ritmo de envío: crédito por enlace)
    this.myHash = {}; this.theirHash = {}; this.snaps = [];
    this.mismatches = 0; this.repaired = 0; this.repairs = []; this.cmpOk = 0; this.cmpBad = -1;
    this.presTick = 0; this.presKeys = {}; this.presList = []; this.overSeen = false;
    this.stats = { frames: 0, maxDepth: 0, steps: 0, sent: 0, recv: 0, bytesOut: 0, waits: 0, resyncs: 0, rsIn: 0, seatAI: 0, relayed: 0, delayChanges: 0, paced: 0 }; this.rsT = -1;
    this.initEvents = []; this._cand = []; this._conf = [];
    this._out = { g: null, events: [], confirmed: [], app: [], status: '', tick: 0, gcTick: 0, ping: 0, waitMs: 0, unstable: false, canAI: false, info: null, waitFor: [], pings: [], aiSeats: [] };
    if (this.host && !o.opts) { this.status = 'ended'; this.result = { why: 'noShow', win: false }; this._log('anfitrión sin opciones: el de varios no tiene vuelta del anfitrión'); }
    if (o.opts) this._setOpts(o.opts);
  }
  var NP = SessionN.prototype = Object.create(SP);
  NP.constructor = SessionN;
  NP._log = function (m) { if (this.log) this.log('[netN ' + this.slot + '] ' + m); };
  NP._setOpts = function (opts) {
    var S = Sim(), n = {}, k, s, t;
    for (k in opts) n[k] = opts[k];
    n.online = true;
    var gc = S.createGame(n);
    if (!gc.hum || gc.hum.length !== this.n) throw new Error('netN: ' + (gc.hum ? gc.hum.length : 0) + ' plazas en la partida y ' + this.n + ' en la sesión');
    this.opts = n; this.gc = gc; this.gp = S.createGame(n); this._pqDirty();
    this.team = this.gc.hum[this.slot].team;
    this.initEvents.length = 0; S.drainEvents(this.gc, this.initEvents); this.gp.events.length = 0;
    for (s = 0; s < this.n; s++) for (t = 0; t < this.delay; t++) this.rings[s].put(t, 0, 0, 0);   // tics 0..delay-1: neutros (no viajan)
    for (s = 0; s < this.n; s++) this.rHave[s] = this.delay;
    this.localTick = 0; this.gcTick = 0; this.mineTop = this.delay;
  };
  /** Lobby (P6): un enlace más a mitad de sesión (un invitado que vuelve a conectar con otro Link). Su plaza la dice su saludo. */
  NP.addLink = function (link) { if (!link || this.links.indexOf(link) >= 0) return; this.links.push(link); this.linkSeat.push(-1); if (!this.link) this.link = link; };
  NP.seatGone = function (s) { return !!this.gone[s | 0]; };
  /** ¿Lleva esta plaza la IA por la red (se fue, no conecta o la lleva el anfitrión)? */
  NP.seatAI = function (s) { return !!(this.aiHeld[s | 0] || this.gone[s | 0]); };
  NP.request = function (what) { var b = what === 'switchPlayer' ? SW : B[what]; if (b & EDGE_N) { this.edges |= b; if (this.edgesAt < 0) this.edgesAt = this.lastNow; } };
  /* ---- envío de control ---- */
  NP._send = function (j, ch, d) { var L = this.links[j]; if (!L) return; try { L.send(ch, d); } catch (e) { } };
  NP._ctlTo = function (j, m) { if (this.epoch) m.ep = this.epoch; this._send(j, 'ctl', JSON.stringify(m)); };
  /** Al anfitrión (invitado) o a todos los invitados enlazados (anfitrión), menos la plaza `but`. */
  NP._ctl = function (m, but) {
    if (this.epoch) m.ep = this.epoch;
    var js = JSON.stringify(m);
    if (!this.host) { this._send(0, 'ctl', js); return; }
    for (var j = 0; j < this.links.length; j++) { var s = this.linkSeat[j]; if (s > 0 && s !== but) this._send(j, 'ctl', js); }
  };
  NP._ctlSeat = function (s, m) { var j = this.seatLink[s]; if (j >= 0) this._ctlTo(j, m); };
  NP.sendApp = function (d) { this._ctl({ k: 'app', d: d, s: this.slot }); };
  /* ---- plazas ---- */
  /** Equipo de la plaza s (el de la partida; sin partida, el de plaza % 2). */
  NP._teamOf = function (s) { var g = this.gc; return g && g.hum && g.hum[s] ? g.hum[s].team : (s % 2); };
  /** ¿Se han ido (para siempre) todas las plazas humanas del equipo rival t (y tenía alguna)? */
  NP._teamGone = function (t) {
    var any = false;
    for (var s = 0; s < this.n; s++) if (s !== this.slot && this._teamOf(s) === t) { any = true; if (!this.gone[s]) return false; }
    return any && t !== this.team;
  };
  /** Anfitrión: la plaza s pasa a la IA (desde su primer tic que falta; el partido sigue). */
  NP._toAI = function (s, why, now) {
    if (!this.host || s <= 0 || this.aiHeld[s]) return;
    this.aiHeld[s] = true; this.aiAt[s] = now; this.blockSince[s] = -1; this.blockAcc[s] = 0; this.spectS[s] = false; this.repairPend[s] = false; this.theirHashS[s] = {}; this.cmpBadS[s] = -1;
    this.stats.seatAI++;
    if (this.status === 'playing' || this.status === 'waiting' || this.status === 'over') this._fab(s);
    this._ctl({ k: 'seat', s: s, ai: 1, why: why });
    this._log('plaza ' + s + ' → IA (' + why + ')');
  };
  /** Entrada {ai} en la plaza s hasta un poco por delante (se reenvía como cualquier otra). */
  NP._fab = function (s, upTo) {
    var R = this.rings[s], top = upTo != null ? upTo : this.localTick + this.delay + MAXCATCH + 1;
    for (var t = this.rHave[s]; t < top; t++) if (!R.has(t)) R.put(t, 0, 0, B.ai);
    while (R.has(this.rHave[s])) this.rHave[s]++;
  };
  /** La plaza s se ha ido para siempre (abandono, adiós, 60 s sin volver). */
  NP._seatGone = function (s, why, now) {
    if (s === this.slot || this.gone[s]) return;
    this.gone[s] = why || 'gone';
    if (this.host) { this._toAI(s, why, now); this._ctl({ k: 'seat', s: s, gone: this.gone[s] }); }
    this._judge(now);
  };
  /** ¿Se ha ido todo el equipo rival? Por abandono → se acaba (ganas); por tiempo → ganas y se sigue con la IA. */
  NP._judge = function (now) {
    if (this.status === 'ended' || this.status === 'over' || this.goneFlag) return;
    var t = 1 - this.team; if (!this._teamGone(t)) return;
    if (this.status === 'connecting' || this.status === 'starting') { this._noShow('los rivales se han ido antes de empezar'); return; }
    var quit = false; for (var s = 0; s < this.n; s++) if (this._teamOf(s) === t && (this.gone[s] === 'quit' || this.gone[s] === 'left')) quit = true;
    if (quit) { this.status = 'ended'; this.result = { why: 'rivalQuit', win: true }; }
    else { this.goneFlag = true; this.result = { why: 'rivalGone', win: true }; }
    void now;
  };
  NP.vsAI = function (force) {
    if (this.solo || this.status !== 'waiting' || (!force && this.waitMs <= WAIT_AI_MS)) return false;
    if (this.host) { var any = false; for (var i = 0; i < this.waitFor.length; i++) { this._toAI(this.waitFor[i], 'vsAI', this.lastNow); any = true; } return any; }
    this.solo = true; this.soloEpoch++;
    if (this.lostAt < 0) this.lostAt = this.waitStart >= 0 ? this.waitStart : this.lastNow;
    this.valid = false;
    this._ctl({ k: 'solo' }); this._log('seguir contra la IA'); return true;
  };
  NP.quit = function () {
    if (this.status === 'ended') return;
    if (this.status === 'connecting' || this.status === 'starting') { this._ctl({ k: 'bye', why: 'left' }); this.status = 'ended'; this.result = { why: 'cancel', win: false }; return; }
    if (this.status === 'over' || this.goneFlag) { this._ctl({ k: 'bye', why: 'left' }); this.status = 'ended'; return; }
    this._ctl({ k: 'bye', why: 'quit' });
    this.status = 'ended'; this.result = { why: 'quit', win: false };
  };
  /** Invitado: 60 s sin el anfitrión → «no cuenta» (sin el centro de la estrella nadie puede seguir). */
  NP._gone = function () {
    if (this.goneFlag || this.host) return;
    if (!this.solo) this.vsAI(true);
    this.goneFlag = true; this.valid = false; this.result = { why: 'hostGone', win: false };
    this._ctl({ k: 'bye', why: 'gone' });
    this._log('el anfitrión no volvió en ' + (GONE_MS / 1000) + ' s');
  };
  NP._noShow = function (why) {
    if (this.status !== 'connecting' && this.status !== 'starting') return;
    this.status = 'ended'; this.result = { why: 'noShow', win: false }; this.rivalLeft = true;
    this._log('no hay partido: ' + why);
  };

  /* ---- recepción ---- */
  NP._recv = function (now) {
    var any = false, j, i, s;
    for (j = 0; j < this.links.length; j++) {
      var Lk = this.links[j]; if (!Lk) continue;
      var L = Lk.poll(now);
      for (i = 0; i < L.length; i++) {
        var m = L[i];
        s = this.linkSeat[j];
        if (!this.host && this.lastRecv && now - this.lastRecv > UNSTABLE_MS) this.rttFloor = now;
        this.stats.recv++; any = true;
        if (s >= 0) { if (now - this.heard[s] > 300) this.heardSince[s] = now; this.heard[s] = now; }
        if (!this.host) this.lastRecv = now;
        if (m.ch === 'in') this._onInputs(m.data, now, j);
        else { var c = null; try { c = typeof m.data === 'string' ? JSON.parse(m.data) : m.data; } catch (e) { } if (c && typeof c === 'object') this._onCtl(c, now, j); }
      }
    }
    if (this.host) { var lr = 0; for (s = 1; s < this.n; s++) if (!this.aiHeld[s] && !this.gone[s] && this.heard[s] > lr) lr = this.heard[s]; if (lr > 0) this.lastRecv = lr; }
    // invitado contra la IA que vuelve a oír al anfitrión: pide volver
    if (any && !this.host && this.solo && !this.goneFlag && this.status !== 'ended' && now - this.rejoinAt > 500) { this.rejoinAt = now; this._ctl({ k: 'rejoin', e: this.soloEpoch }); }
  };
  /** Mete en el anillo de la plaza s los n valores de v desde first. */
  NP._put = function (s, first, n, v) {
    var R = this.rings[s];
    for (var k = 0; k < n; k++) {
      var t = first + k; if (t < this.gcTick - RING / 2 || R.has(t)) continue;
      R.put(t, v[k * 3], v[k * 3 + 1], v[k * 3 + 2]);
      if (this.host && this._urg < 2) { var u = this._sig(R, this.refT[s], v[k * 3], v[k * 3 + 1], v[k * 3 + 2]); if (u > this._urg) this._urg = u; }   // (un cambio de un invitado: el anfitrión lo reenvía sin esperar turno)
    }
    while (R.has(this.rHave[s])) this.rHave[s]++;
  };
  NP._onInputs = function (data, now, j) {
    if (!this.opts || !data) return;
    var u = data instanceof Uint8Array ? data : new Uint8Array(data); if (!u.length) return;
    var ty = u[0] & 15, from, k;
    if (ty === 1 || ty === 5) {   // tipo 1 (2 plazas: el paquete del 1 contra 1; 5 = con el punto del ratón): es de la otra plaza
      if (this.n !== 2) return;
      var p1 = unpackInputs(u); if (!p1 || p1.ep !== (this.epoch & 15)) return;
      from = 1 - this.slot;
      if (this.linkSeat[j] !== from) return;
      this.heardAt = now;
      if (!this.solo && !this.aiHeld[from] && !this.gone[from]) this._put(from, p1.first, p1.n, p1.v);
      if (p1.ack > this.acks[from][this.slot]) this.acks[from][this.slot] = p1.ack;
      if (p1.ack > this.remoteAck) this.remoteAck = p1.ack;
      if (p1.tick >= this.remoteTick[from]) { this.remoteTick[from] = p1.tick; this.remoteTickAt[from] = now; }
      if (this.host) this._heardSeat(from, now);
      return;
    }
    var p = unpackN(u); if (!p || p.ep !== (this.epoch & 15)) return;
    from = p.from; if (from >= this.n || this.linkSeat[j] !== from) return;   // (cada enlace es de una plaza: la de su saludo)
    this.heardAt = now;
    var A = this.acks[from];
    for (k = 0; k < p.acks.length && k < this.n; k++) if (p.acks[k] > A[k] && (k !== from || (this.host && p.gen === (this.rsIdS[from] & 15)))) A[k] = p.acks[k];   // (el de su propia plaza solo vale tras su último resync: espectador)
    if (!this.host && p.acks.length > this.slot && p.acks[this.slot] > this.remoteAck) this.remoteAck = p.acks[this.slot];
    if (this.host) {
      if (p.tick >= this.remoteTick[from]) { this.remoteTick[from] = p.tick; this.remoteTickAt[from] = now; }
      for (k = 0; k < p.bl.length; k++) { var b = p.bl[k]; if (b.s === from && !this.aiHeld[from] && !this.gone[from]) this._put(from, b.first, b.n, b.v); }   // (un invitado solo manda lo suyo)
      this._heardSeat(from, now);
    } else {
      for (k = 0; k < p.bl.length; k++) {
        var c = p.bl[k]; if (c.s >= this.n || (c.s === this.slot && !this.spect)) continue;   // (espectador: mi plaza la escribe el anfitrión)
        if (!this.solo) this._put(c.s, c.first, c.n, c.v);
        if (c.st >= this.remoteTick[c.s] || now - this.remoteTickAt[c.s] > 2000) { this.remoteTick[c.s] = c.st; this.remoteTickAt[c.s] = now; }
      }
    }
  };
  /** Anfitrión: se ha oído a la plaza s. Si la llevaba la IA y se la oye seguida, vuelve (resync). */
  NP._heardSeat = function (s, now) {
    if (!this.aiHeld[s] || this.gone[s] || !this.readyS[s] || (this.status !== 'playing' && this.status !== 'waiting')) return;
    if (now - this.heardSince[s] >= REJOIN_STABLE_MS && now - this.lastRs[s] >= RS_GAP_MS && now >= this.slowUntil[s]) this._resync(s, now);
  };
  NP._onCtl = function (c, now, j) {
    var s = this.linkSeat[j];
    if (c.k === 'bye' && (c.ep | 0) === this.epoch - 1 && (c.why === 'left' || c.why === 'quit' || c.why === 'gone')) {   // adiós de la época anterior (tras pedir la revancha)
      if (!this.host) this._noShow('el anfitrión se fue (época anterior)');
      else if (s > 0) this._seatGone(s, 'left', now);
      return;
    }
    if ((c.ep | 0) !== this.epoch) return;
    this.heardAt = now;
    if (this.host) this._hostCtl(c, now, j, s); else this._guestCtl(c, now);
  };
  NP._pong = function (c, now, s) {
    var rtt = now - c.t;
    if (this.host) {
      if (s <= 0 || !(rtt < 3000)) return;
      this.rtts[s] = this.rttNs[s] ? this.rtts[s] * 0.8 + rtt * 0.2 : rtt; this.rttNs[s]++;
      var m = 0; for (var q = 1; q < this.n; q++) if (!this.aiHeld[q] && !this.gone[q] && this.rtts[q] > m) m = this.rtts[q];
      this.rtt = m; this.rttN++; this.rttLast = rtt; this.rttSeq = (this.rttSeq || 0) + 1;
      return;
    }
    if (this.rttN && c.t < this.rttFloor) return;
    if (rtt < 3000 || !this.rttN) { this.rtt = this.rttN ? this.rtt * 0.8 + rtt * 0.2 : rtt; this.rttN++; this.rtts[0] = this.rtt; }
    if (rtt < 3000) { this.rttLast = rtt; this.rttSeq = (this.rttSeq || 0) + 1; }
    if (!this.ready && c.id < 1000) this.pings.push({ rtt: rtt, off: c.th - (c.t + now) / 2 });
  };
  NP._hostCtl = function (c, now, j, s) {
    var live = this.status === 'playing' || this.status === 'waiting' || this.status === 'starting';
    if (c.k === 'hello') {
      var q = c.seat === undefined && this.n === 2 ? 1 : c.seat | 0;   // (sin plaza: el invitado del 1 contra 1, la 1)
      if (q <= 0 || q >= this.n) return;
      if (c.v !== PROTO || c.ver !== (VB.VERSION || '')) { this._ctlTo(j, { k: 'bye', why: 'version', ver: VB.VERSION || '' }); return; }   // (solo esa plaza no juega)
      var old = this.seatLink[q];
      if (old >= 0 && old !== j) this.linkSeat[old] = -1;   // (otro enlace para la misma plaza: vale el último que saluda)
      this.seatLink[q] = j; this.linkSeat[j] = q; this.heard[q] = now; this.heardSince[q] = now;
      if (!this.names[q]) this.names[q] = cleanName(c.name);
      if (this.status === 'over' || this.status === 'ended') return;
      if (this.gone[q]) { this._ctlTo(j, { k: 'bye', why: 'late' }); return; }
      this._ctlTo(j, { k: 'hello', v: PROTO, ver: VB.VERSION || '', name: this.name, cfg: { opts: this.opts, delay: this.delayTo, n: this.n }, live: live });
      return;
    }
    if (s <= 0) return;   // (enlace sin plaza: solo vale el saludo)
    switch (c.k) {
      case 'app':
        if (this.appIn.length < 64) this.appIn.push(c.d);
        this._ctl({ k: 'app', d: c.d, s: s }, s); this.stats.relayed++;   // (los 'app' de un invitado llegan a todos)
        break;
      case 'ping': this._ctlTo(j, { k: 'pong', t: c.t, th: now, id: c.id }); break;
      case 'pong': this._pong(c, now, s); break;
      case 'ready':
        this.readyS[s] = true;
        if (this.status === 'connecting') {
          if (this.aiHeld[s]) { this.aiHeld[s] = false; this._ctl({ k: 'seat', s: s, ai: 0 }); }
        } else if (this.status === 'starting') {
          if (this.aiHeld[s] && !this.gone[s]) { this.aiHeld[s] = false; this._ctl({ k: 'seat', s: s, ai: 0 }); }   // (aún no hay tics: vuelve gratis)
          this._ctlTo(j, { k: 'start', t0: this.t0, ai: this._aiList() });
        } else if (this.status === 'playing' || this.status === 'waiting') {
          if (this.gone[s]) this._late(now, j);
          else { if (!this.aiHeld[s]) this._toAI(s, 'vuelve', now); this._resync(s, now); }   // (recargó o llegó tarde: entra con la foto)
        }
        break;
      case 'rejoin':
        if (this.status !== 'playing' && this.status !== 'waiting') break;
        if (this.gone[s]) { this._late(now, j); break; }
        if ((c.e | 0) > this.rejoinEp[s]) { this.rejoinEp[s] = c.e | 0; if (!this.aiHeld[s]) this._toAI(s, 'rejoin', now); this._resync(s, now); }
        break;
      case 'hash':
        var hk = c.t;
        if (typeof hk !== 'number' || (hk | 0) !== hk || hk % HASH_EVERY || hk <= this.gcTick - HASH_EVERY * 20 || hk > this.gcTick + RING / 2) break;
        if (this.aiHeld[s] || this.gone[s]) break;   // (la de una plaza que lleva la IA no cuenta: vuelve con resync)
        this.theirHashS[s][hk] = c.h >>> 0; this._checkSeat(s, hk, now);
        break;
      case 'snapok':
        if (!this.repairPend[s]) break;
        this.repairPend[s] = false; if (this.cmpBadS[s] <= (c.t | 0)) this.cmpBadS[s] = -1;
        for (var ht in this.theirHashS[s]) if (+ht > c.t) this._checkSeat(s, +ht, now);
        break;
      case 'rsok': if (this.rsPendS[s] && (c.id | 0) === this.rsPendS[s].m.id) this.rsPendS[s] = null; break;
      case 'solo': this.rivalSolo = true; break;
      case 'invalid': this.valid = false; this.rivInvalid = true; this._ctl({ k: 'invalid' }, s); break;
      case 'bye':
        if (c.why === 'version') { this._seatGone(s, 'left', now); break; }
        this._seatGone(s, c.why === 'quit' ? 'quit' : c.why === 'gone' ? 'gone' : 'left', now);
        if (this._allGone()) this.rivalLeft = true;
        break;
    }
  };
  NP._allGone = function () { for (var s = 1; s < this.n; s++) if (!this.gone[s]) return false; return true; };
  NP._aiList = function () { var r = []; for (var s = 0; s < this.n; s++) if (this.aiHeld[s] || this.gone[s]) r.push(s); return r; };
  NP._late = function (now, j) { if (now - this.lateAt > 1000) { this.lateAt = now; this._ctlTo(j, { k: 'bye', why: 'late' }); } };
  NP._guestCtl = function (c, now) {
    switch (c.k) {
      case 'app': if (this.appIn.length < 64) this.appIn.push(c.d); break;
      case 'hello':
        if (!this.rivalName) this.rivalName = cleanName(c.name);
        if (c.v !== PROTO || c.ver !== (VB.VERSION || '')) { this._ctl({ k: 'bye', why: 'version', ver: VB.VERSION || '' }); this.status = 'ended'; this.result = { why: 'version', rv: String(c.ver || '') }; return; }
        if (this.gotHello) break;
        this.gotHello = true;
        if (!this.opts) {
          var co = c.cfg && c.cfg.opts, cn = c.cfg && c.cfg.n != null ? c.cfg.n | 0 : 2;
          if (!co || typeof co !== 'object' || cn !== this.n || (this.expect && !sameRoom(co, this.expect))) {
            this._ctl({ k: 'bye', why: 'mismatch' }); this.status = 'ended'; this.result = { why: 'mismatch', win: false }; this._log('la sala no coincide con lo anunciado'); return;
          }
          this.delay = c.cfg.delay != null ? Math.max(0, Math.min(8, c.cfg.delay | 0)) : this.delay; this.delayTo = this.delay;
          try { this._setOpts(co); } catch (e) { this._ctl({ k: 'bye', why: 'mismatch' }); this.status = 'ended'; this.result = { why: 'mismatch', win: false }; this._log(String(e && e.message)); return; }
        }
        this.pings.length = 0; this.pingAt = -1e9;
        break;
      case 'ping': this._ctl({ k: 'pong', t: c.t, th: now, id: c.id }); break;
      case 'pong': this._pong(c, now, 0); break;
      case 'pings': if (Array.isArray(c.p)) for (var i = 0; i < this.n && i < c.p.length; i++) if (i !== this.slot) this.seatRtt[i] = Math.max(0, Math.min(9999, +c.p[i] || 0)); break;
      case 'start':
        if (!this.ready) break;
        this.t0 = c.t0 - this.off; if (this.status === 'connecting') this.status = 'starting';
        if (Array.isArray(c.ai)) for (var a = 0; a < c.ai.length; a++) { var q = c.ai[a] | 0; if (q >= 0 && q < this.n && q !== this.slot) this.aiHeld[q] = true; }
        break;
      case 'seat':
        var ss = c.s | 0; if (ss <= 0 || ss >= this.n) break;
        if (ss === this.slot) { this.meAI = !!c.ai && !c.gone; break; }   // (el anfitrión lleva mi plaza con la IA: vuelvo con su resync; r.meAI)
        if (c.gone) this._seatGone(ss, String(c.gone), now);
        else this.aiHeld[ss] = !!c.ai;
        break;
      case 'delay': if (this.adaptive) { var d = c.d | 0; if (d >= DELAY_MIN && d <= DELAY_MAX) { this.pendDelay = d; this.delayTo = d; } } break;
      case 'hash':
        var hk = c.t;
        if (typeof hk !== 'number' || (hk | 0) !== hk || hk % HASH_EVERY || hk <= this.gcTick - HASH_EVERY * 20 || hk > this.gcTick + RING / 2) break;
        this.theirHash[hk] = c.h >>> 0; this._checkHash(hk, now);
        break;
      case 'snap': this._applySnap(c, now); break;
      case 'resync':
        var rid = c.id | 0;
        if (rid && rid <= this.rsIn) { this._ctl({ k: 'rsok', id: rid }); break; }
        if (this.goneFlag) { this._ctl({ k: 'bye', why: 'gone' }); break; }
        if (this._applyResync(c, now) && rid) { this.rsIn = rid; this._ctl({ k: 'rsok', id: rid }); }
        break;
      case 'solo': this.rivalSolo = true; break;
      case 'invalid': this.valid = false; this.rivInvalid = true; break;
      case 'bye':   // del anfitrión: el centro de la estrella se va
        if (c.why === 'left' || c.why === 'quit' || c.why === 'gone' || c.why === 'late') this.rivalLeft = true;
        if (this.status === 'ended' || this.status === 'over') break;
        if ((this.status === 'connecting' || this.status === 'starting') && c.why !== 'version') { this._noShow('el anfitrión se fue antes de empezar'); break; }
        if (this.goneFlag) break;   // (ya juzgado: el resultado no cambia; se sigue con la IA)
        this.status = 'ended';
        if (c.why === 'late') { this.result = { why: 'late', win: false }; break; }
        if (c.why === 'version') { this.result = { why: 'version', rv: String(c.ver || '') }; break; }
        this.gone[0] = c.why === 'quit' ? 'quit' : 'gone';
        if (this._teamGone(1 - this.team)) this.result = { why: c.why === 'quit' ? 'rivalQuit' : 'rivalGone', win: true };
        else { this.valid = false; this.result = { why: 'hostGone', win: false }; }
        break;
    }
  };

  /* ---- huellas y reparación ---- */
  NP._hashTick = function () {
    var S = Sim(), t = this.gcTick, h = S.stateHash(this.gc) >>> 0, s;
    this.myHash[t] = h; if (!this.solo) this._ctl({ k: 'hash', t: t, h: h });
    if (this.hashLog) this.hashLog.push([t, h]);
    if (this.host) { this.snaps.push({ t: t, d: S.serialize(this.gc) }); if (this.snaps.length > 6) this.snaps.shift(); }
    var old = t - HASH_EVERY * 20;
    if (this.myHash[old] !== undefined) delete this.myHash[old];
    if (this.theirHash[old] !== undefined) delete this.theirHash[old];
    if (this.host) { for (s = 1; s < this.n; s++) { if (this.theirHashS[s][old] !== undefined) delete this.theirHashS[s][old]; this._checkSeat(s, t, this.lastNow); } }
    else this._checkHash(t, this.lastNow);
  };
  /** Invitado: la del anfitrión contra la mía (el anfitrión repara: aquí solo se apunta). */
  NP._checkHash = function (t) {
    if (this.host || t <= this.syncFloor) return;
    var a = this.myHash[t], b = this.theirHash[t];
    if (a === undefined || b === undefined) return;
    if (a === b) { this.cmpOk++; if (t > this.cmpBad) this.cmpBad = -1; return; }
    if (t > this.cmpBad) this.cmpBad = t;
  };
  /** Anfitrión: la de la plaza s contra la mía; si no cuadra, la foto de ese tic solo a esa plaza. */
  NP._checkSeat = function (s, t, now) {
    if (t <= this.hashFloor[s] || this.aiHeld[s] || this.gone[s]) return;
    var a = this.myHash[t], b = this.theirHashS[s][t];
    if (a === undefined || b === undefined) return;
    if (a === b) { this.cmpOk++; if (t > this.cmpBadS[s]) this.cmpBadS[s] = -1; return; }
    if (t > this.cmpBadS[s]) this.cmpBadS[s] = t;
    if (this.repairPend[s] && now - this.repairAtS[s] < 3000) return;
    var sn = null; for (var i = 0; i < this.snaps.length; i++) if (this.snaps[i].t === t) sn = this.snaps[i];
    if (!sn) return;
    this.mismatches++; this.repairPend[s] = true; this.repairAtS[s] = now;
    this._ctlSeat(s, { k: 'snap', t: t, d: sn.d }); this._log('huella distinta de la plaza ' + s + ' en el tic ' + t + ': le mando la foto');
  };
  /** ¿Hay alguna huella distinta sin reparar (de una plaza humana)? */
  NP._badNow = function () {
    if (!this.host) return this.cmpBad >= 0;
    for (var s = 1; s < this.n; s++) if (!this.aiHeld[s] && !this.gone[s] && this.cmpBadS[s] >= 0) return true;
    return false;
  };
  NP._applySnap = function (c, now) {
    var S = Sim(), t = c.t | 0;
    if (t > this.gcTick || t < this.gcTick - RING / 2 || t < this.syncFloor) return;
    var to = this.gcTick;
    if (!S.deserialize(c.d, this.gc)) return;
    this._pqDirty();   // (gc cambia por debajo: la predicha del frame anterior ya no vale)
    this.gcTick = t; this.mismatches++; this.repaired++; this.cmpBad = -1;
    this._confirm(to, true);
    for (var k = t + HASH_EVERY; k <= this.gcTick; k += HASH_EVERY) if (this.myHash[k] !== undefined) this._ctl({ k: 'hash', t: k, h: this.myHash[k] });
    this._ctl({ k: 'snapok', t: t });
    this.repairs.push(now); while (this.repairs.length && now - this.repairs[0] > 60000) this.repairs.shift();
    if (this.repairs.length >= 3 && this.valid) { this.valid = false; this.repInvalid = true; this._ctl({ k: 'invalid' }); this._log('3 reparaciones en 60 s: partido no válido'); }
    this._log('reparado en el tic ' + t);
  };

  /* ---- resync por plaza: el anfitrión fija la IA en la plaza s hasta F y le manda la foto de gc y las entradas de todas desde ahí ---- */
  NP._resync = function (s, now, spect) {
    var S = Sim();
    if (this.status === 'starting' || s <= 0 || this.seatLink[s] < 0) return;
    var F = this.localTick + this.delay + REJOIN_MARGIN, k, t, i;
    if (spect) { this._fab(s); F = this.rHave[s]; this.spectS[s] = true; }   // (espectador: la plaza sigue con la IA; le reenvío también la suya)
    else { this._fab(s, F); this.aiHeld[s] = false; this.spectS[s] = false; this.blockAcc[s] = 0; }   // (desde F manda ella)
    this._confirm(this.localTick, false);
    var T = this.gcTick, rings = [];
    for (k = 0; k < this.n; k++) {
      var R = this.rings[k], a = [], top = k === this.slot ? this.mineTop : this.rHave[k];
      for (t = T; t < top && R.has(t); t++) { i = t & RM; a.push(R.X[i], R.Y[i], R.B[i]); }
      rings.push(a);
      this.acks[s][k] = T + a.length / 3;
    }
    this.lastRs[s] = now; this.blockSince[s] = -1; this.hashFloor[s] = T; this.theirHashS[s] = {}; this.cmpBadS[s] = -1; this.repairPend[s] = false;
    this.heard[s] = Math.max(this.heard[s], now);
    this.stats.resyncs++;
    var rm = { k: 'resync', s: s, T: T, F: F, d: S.serialize(this.gc), t0: this.t0, rings: rings, valid: this.valid, se: this.soloEpoch, id: ++this.rsId, delay: this.delayTo };
    this.rsIdS[s] = rm.id; if (spect) rm.spect = 1;
    if (this.n === 2) { rm.mine = rings[this.slot]; rm.fab = rings[s]; }   // (2 plazas: lo que entiende la Session del 1 contra 1)
    this._ctlSeat(s, rm); this.rsPendS[s] = { m: rm, at: now, n: 0 };
    if (!spect) this._ctl({ k: 'seat', s: s, ai: 0 }, s);
    this._log((spect ? 'resync de espectador a la plaza ' : 'resync de la plaza ') + s + ': foto del tic ' + T + (spect ? '' : ', IA hasta ' + F));
  };
  NP._applyResync = function (c, now) {
    var S = Sim(), T = c.T | 0, F = c.F | 0, k, j, s, R;
    var rings = Array.isArray(c.rings) ? c.rings : null;
    if (!rings) {   // (anfitrión del 1 contra 1, 2 plazas: mine = las suyas, fab = las mías)
      if (this.n !== 2 || !Array.isArray(c.mine) || !Array.isArray(c.fab)) return false;
      rings = []; rings[1 - this.slot] = c.mine; rings[this.slot] = c.fab;
    }
    if (rings.length !== this.n || F < T || F - T > RING) return false;
    for (s = 0; s < this.n; s++) if (!Array.isArray(rings[s]) || rings[s].length > 3 * RING) return false;
    if (!this.opts || !S.deserialize(c.d, this.gc)) return false;
    this._pqDirty();
    this.gcTick = T;
    for (s = 0; s < this.n; s++) {
      R = this.rings[s]; R.clearFrom(T);
      for (k = T, j = 0; j + 2 < rings[s].length; k++, j += 3) R.put(k, rings[s][j], rings[s][j + 1], rings[s][j + 2]);
      this.rHave[s] = T; while (R.has(this.rHave[s])) this.rHave[s]++;
    }
    this.mineTop = this.rHave[this.slot];
    if (c.delay != null && this.adaptive) { var d = c.delay | 0; if (d >= DELAY_MIN && d <= DELAY_MAX) { this.delay = this.delayTo = d; this.pendDelay = -1; } }
    this.localTick = T; this.t0 = c.t0 - this.off; this.solo = false; this.rivalSolo = false; this.lostAt = -1;
    this.spect = !!c.spect && this.n > 2; this.meAI = this.spect;   // (espectador: mi jugador lo lleva la IA; mis entradas no cuentan hasta el próximo resync)
    this.valid = c.valid !== false && !this.repInvalid;
    if (this.status !== 'over') this.result = null;
    this.edges = 0; this.edgesAt = -1;
    this.myHash = {}; this.theirHash = {}; this.syncFloor = T; this.cmpBad = -1;
    if (this.status !== 'over') this.status = 'playing';
    this.waitStart = -1; this.started = true; this.stats.resyncs++; this.stats.rsIn++; this.rsT = T;
    this.presTick = Math.max(T, this._target(now)); this.muteBefore = this.presTick; this.presKeys = {}; this.presList.length = 0;
    this.remoteAck = Math.max(this.remoteAck, F);
    this.back = false;
    this._log('resync aplicado: tic ' + T + ', mando desde ' + F);
    return true;
  };

  /* ---- avance confirmado: gc mientras estén las entradas de todas las plazas ---- */
  NP._confirm = function (upTo, silent) {
    var S = Sim(), ins = this._ins, n = this.n, R = this.rings, s;
    while (this.gcTick < upTo) {
      var t = this.gcTick;
      for (s = 0; s < n; s++) if (!R[s].has(t)) return;
      for (s = 0; s < n; s++) R[s].dec(t, ins[s]);
      if (this.rec && !silent) this._recIn(t);
      S.step(this.gc, STEP, ins);
      this.gcTick = t + 1; this.stats.steps++;
      if (this.onTick && !silent) this.onTick(this.gcTick, this.gc);
      var ev = this.gc.events;
      if (ev.length) {
        if (!silent) for (var i = 0; i < ev.length; i++) { ev[i]._tick = t; this._cand.push(ev[i]); this._conf.push(ev[i]); }
        ev.length = 0;
      }
      if (this.gcTick % HASH_EVERY === 0) {
        if (silent) this.myHash[this.gcTick] = S.stateHash(this.gc) >>> 0;
        else this._hashTick();
      }
    }
  };
  NP._recIn = function (t) {
    var a = [], i = t & RM;
    for (var s = 0; s < this.n; s++) { var R = this.rings[s]; a.push(R.X[i], R.Y[i], R.B[i]); }
    this.rec[t] = a;
  };
  /** Predicción INCREMENTAL (P8, lag en móvil lento): antes cada frame copiaba gc y rehacía TODOS los tics de gcTick a localTick
   *  (2v2 × 4 a 150 ms: 20-24 tics por frame; en un móvil lento, CPU ×4, 2,3 ms de p50 solo en la sesión). Ahora se guarda qué
   *  entrada se usó en cada tic predicho (PQ_W tics por plaza) y, si las que se saben ahora (llegadas o predichas otra vez) son las
   *  mismas, la partida predicha del frame anterior sigue valiendo: solo se dan los tics nuevos. Si alguna cambió, se rehace desde
   *  gc como siempre (mismo resultado: la sim es determinista y gp = gc + las mismas entradas). Las fotos y los resync que tocan gc
   *  la invalidan (_pqDirty). stats.resim = tics rehechos en el último frame. */
  var PQ_W = 512, PQ_M = PQ_W - 1;
  NP._pqDirty = function () { if (this._pq) this._pq.T = -1; };
  NP._predict = function () {
    var S = Sim(), gp = this.gp, ins = this._ins, me = this.slot, n = this.n, s, t, R, x, y, b, u;
    var depth = this.localTick - this.gcTick;
    if (depth > this.stats.maxDepth) this.stats.maxDepth = depth;
    this.stats.depth = depth;
    var Q = this._pq;
    if (!Q || Q.n !== n) Q = this._pq = { n: n, X: new Int16Array(n), Y: new Int16Array(n), B: new Uint32Array(n), UX: new Int16Array(PQ_W * n), UY: new Int16Array(PQ_W * n), UB: new Uint32Array(PQ_W * n), T: -1, C: 0 };
    if (depth <= 0) { S.copyGame(gp, this.gc); Q.T = -1; this.stats.resim = 0; return; }
    for (s = 0; s < n; s++) {   // predicción de cada plaza remota: su última entrada conocida, botones a falso
      if (s === me && !this.spect) continue;   // (espectador: la mía también es remota)
      var lk = this.rHave[s] - 1; R = this.rings[s];
      if (lk >= 0 && R.has(lk)) { var j = lk & RM; Q.X[s] = R.X[j]; Q.Y[s] = R.Y[j]; Q.B[s] = R.B[j] & ~EDGE_N; } else { Q.X[s] = Q.Y[s] = Q.B[s] = 0; }
      decode(Q.X[s], Q.Y[s], Q.B[s], this._pred[s]);
    }
    // ¿sigue valiendo la del frame anterior? (las entradas de [C, T) que se usaron, contra las de ahora)
    var from = this.gcTick;
    if (Q.T > this.gcTick && Q.T <= this.localTick && Q.C <= this.gcTick && this.localTick - Q.C < PQ_W) {
      var ok = true;
      for (t = Q.C; t < Q.T && ok; t++) {
        u = (t & PQ_M) * n;
        for (s = 0; s < n; s++) {
          R = this.rings[s];
          if (R.has(t)) { var i0 = t & RM; x = R.X[i0]; y = R.Y[i0]; b = R.B[i0]; } else { x = Q.X[s]; y = Q.Y[s]; b = Q.B[s]; }
          if (x !== Q.UX[u + s] || y !== Q.UY[u + s] || b !== Q.UB[u + s]) { ok = false; break; }
        }
      }
      if (ok) from = Q.T;
    }
    if (from === this.gcTick) { S.copyGame(gp, this.gc); this.stats.copies = (this.stats.copies | 0) + 1; }
    for (t = from; t < this.localTick; t++) {
      u = (t & PQ_M) * n;
      for (s = 0; s < n; s++) {
        R = this.rings[s];
        if (R.has(t)) { var i1 = t & RM; x = R.X[i1]; y = R.Y[i1]; b = R.B[i1]; } else { x = Q.X[s]; y = Q.Y[s]; b = Q.B[s]; }
        Q.UX[u + s] = x; Q.UY[u + s] = y; Q.UB[u + s] = b;
        decode(x, y, b, ins[s]);   // (la predicha lleva los botones a falso y el bit ai como estaba: lo mismo que antes)
      }
      S.step(gp, STEP, ins);
      var ev = gp.events;
      if (ev.length) { for (var i = 0; i < ev.length; i++) { ev[i]._tick = t; this._cand.push(ev[i]); } ev.length = 0; }
    }
    Q.T = this.localTick; Q.C = this.gcTick;
    this.stats.resim = this.localTick - from;
  };
  /** Anfitrión: retraso para el peor camino entre dos plazas humanas (por la estrella: invitado↔invitado = suma de sus pings). */
  NP._evalDelay = function () {
    if (!this.host || !this.adaptive) return;
    var a = 0, b = 0;
    for (var s = 1; s < this.n; s++) { if (this.aiHeld[s] || this.gone[s] || !this.rttNs[s]) continue; var r = this.rtts[s]; if (r > a) { b = a; a = r; } else if (r > b) b = r; }
    var d = adaptDelay(a + b, this.delayK), raw = (a + b) / 2 / STEP_MS - this.delayK;
    if (d !== this.delayTo && Math.abs(raw - this.delayTo) < 0.9 && d > DELAY_MIN && d < DELAY_MAX) d = this.delayTo;   // (histéresis: sin saltar 5↔6 en cada punto por la variación del ping)
    if (d !== this.delayTo) { this.delayTo = d; this.pendDelay = d; this.stats.delayChanges++; this._ctl({ k: 'delay', d: d }); this._log('retraso de entrada → ' + d + ' tics (peor camino ' + Math.round(a + b) + ' ms)'); }
  };

  /* ---- envío de entradas ---- */
  /** Ritmo de envío: una vez por frame, antes de mandar (dtE = media del frame; _fast = pantalla de más de ~77 Hz). */
  NP._pace = function () {
    var dt = this.prevNow ? Math.min(100, Math.max(0, this.lastNow - this.prevNow)) : SEND_MS;
    this.dtE = this.dtE > 0 ? this.dtE * 0.9 + dt * 0.1 : dt;
    this._fast = this.pace && this.dtE < SEND_FAST_DT; this._crAdd = dt / SEND_MS;
  };
  /** ¿Toca mandar por el enlace j en este frame? (una llamada por enlace y frame: suma su crédito). Sin topar: siempre. */
  NP._due = function (j) {
    var c = this.sendCr; while (c.length <= j) c.push(1);
    if (!this._fast) { c[j] = 1; return true; }
    c[j] = Math.min(1, c[j] + this._crAdd);
    // (sin cambios: con crédito ≥ 0,5; con un cambio del stick, puede pedir prestado uno, ≥ -0,5; un botón sale siempre. Cada envío
    //  cuesta 1 y el crédito sube SEND_HZ por segundo, así que la media no pasa de SEND_HZ salvo por los botones, que son pocos)
    if (this._urg < 2 && c[j] < (this._urg ? -0.5 : 0.5)) { this.stats.paced++; return false; }
    c[j] = Math.max(-2, c[j] - 1);
    return true;
  };
  /** ¿La entrada (x, y, b) cambia de verdad respecto a la última que ya salió de esa plaza (tic ref)? Lo que se predice de una plaza
   *  remota es su última entrada conocida (sin botones): si no cambia, mandarla un frame más tarde no cambia ninguna predicción ni
   *  corrige nada; si cambia (otro botón, o el stick más de SEND_SIG desde lo último mandado), sale en el acto. */
  NP._sig = function (R, ref, x, y, b) {   // → 0 nada nuevo, 1 cambio de stick o de bit ai, 2 botón nuevo
    if (!(ref >= 0) || !R.has(ref)) return 1;
    var i = ref & RM;
    if ((b & EDGE_N) && b !== R.B[i]) return 2;
    return b !== R.B[i] || Math.abs(x - R.X[i]) + Math.abs(y - R.Y[i]) > SEND_SIG ? 1 : 0;
  };
  /** Tras mandar: lo último que ha salido de cada plaza (la mía y, el anfitrión, las que reenvía). */
  NP._sent = function () {
    this.refT[this.slot] = this.mineTop - 1;
    if (this.host) for (var s = 0; s < this.n; s++) if (s !== this.slot) this.refT[s] = this.rHave[s] - 1;
  };
  NP._sendInputs = function () {
    var have = this.mineTop, me = this.slot, s, k, j;
    this._pace();
    if (this.n === 2) {   // 2 plazas: el paquete del 1 contra 1
      var ot = 1 - me, j2 = this.seatLink[ot]; if (j2 < 0 || (this.solo && !this.host) || this.gone[ot]) return;
      if (!this._due(j2)) return;
      var from = Math.max(this.remoteAck, have - MAXSEND * 8), L2 = this.links[j2];
      if (have > from) for (var a = from, np = 0; a < have && np < 4; a += 255, np++) { var nn = Math.min(255, have - a), pk = packInputs(this.mine, a, nn, this.rHave[ot], this.localTick, this.epoch); L2.send('in', pk); this.stats.sent++; this.stats.bytesOut += pk.length; }
      else { var pk0 = packInputs(this.mine, have, 0, this.rHave[ot], this.localTick, this.epoch); L2.send('in', pk0); }
      this._sent(); return;
    }
    var acks = []; for (s = 0; s < this.n; s++) acks.push(s === me ? have : this.rHave[s]);
    if (!this.host) {
      if (this.solo || !this._due(0)) return;
      if (this.spect) { acks[me] = this.rHave[me]; this._pkOut(0, [], acks); return; }   // (espectador: solo acks y mi tic)
      var f0 = Math.max(this.remoteAck, have - RING / 2);
      this._pkOut(0, [{ s: me, first: f0, n: Math.max(0, Math.min(255, have - f0)), st: this.localTick, ring: this.mine }], acks);
      this._sent(); return;
    }
    var now = this.lastNow, sent = false;
    for (j = 0; j < this.links.length; j++) {
      var g = this.linkSeat[j]; if (g <= 0 || this.gone[g] || !this._due(j)) continue;
      sent = true;
      var bl = [];
      for (k = 0; k < this.n; k++) {
        if (k === g && !(this.spectS[g] && this.aiHeld[g])) continue;   // (al espectador, también la suya: la escribe la IA)
        var top = k === me ? have : this.rHave[k], f = Math.max(this.acks[g][k], top - RING / 2);
        var st = k === me || this.aiHeld[k] || this.gone[k] || !this.remoteTickAt[k] ? this.localTick :   // (la que lleva la IA aquí va a mi paso)
          Math.round(this.remoteTick[k] + (now - this.remoteTickAt[k] + this.rtts[k] / 2) / STEP_MS);
        bl.push({ s: k, first: f, n: Math.max(0, Math.min(255, top - f)), st: st, ring: this.rings[k] });
      }
      this._pkOut(j, bl, acks);
    }
    if (sent) this._sent();
  };
  /** Manda los bloques por el enlace j, en paquetes de PK_BUDGET bytes como mucho (4 por frame; lo que no cabe, el frame siguiente). */
  NP._pkOut = function (j, bl, acks) {
    var L = this.links[j]; if (!L) return;
    var head = 8 + 4 * acks.length, cur = [], size = head, np = 0, k, maxN = Math.floor((PK_BUDGET - head - 10) / 5);
    for (k = 0; k <= bl.length; k++) {
      var b = k < bl.length ? bl[k] : null;
      if (b && b.n > maxN) b = { s: b.s, first: b.first, n: maxN, st: b.st, ring: b.ring };
      var bs = b ? 10 + 5 * b.n : 0;
      if (!b || (cur.length && size + bs > PK_BUDGET)) {
        var pk = packN(this.slot | (this.host ? 0 : (this.rsIn & 15) << 4), this.localTick, acks, cur, this.epoch);
        try { L.send('in', pk); } catch (e) { }
        this.stats.sent++; this.stats.bytesOut += pk.length; np++;
        cur = []; size = head;
        if (!b || np >= 4) break;
      }
      cur.push(b); size += bs;
    }
  };

  /* ---- un frame ---- */
  NP.advance = function (now, inp) {
    var out = this._out, i, s;
    out.events = []; out.confirmed = []; out.app = this.appIn.length ? this.appIn.splice(0) : [];
    this._cand = []; this._conf = [];
    if (this.links.length) this._recv(now);
    this.prevNow = this.lastNow; this.lastNow = now; this.stats.frames++;
    if (inp) this.edges |= bitsOf(inp) & EDGE_N;
    if (this.connAt < 0) this.connAt = now;
    this._connect(now);
    // resync sin confirmar: otra vez (anfitrión, por plaza)
    if (this.host) for (s = 1; s < this.n; s++) {
      var rp = this.rsPendS[s]; if (!rp) continue;
      if (this.gone[s] || this.status === 'ended' || rp.n >= RS_TRIES) this.rsPendS[s] = null;
      else if (now - rp.at > RS_EVERY_MS) { rp.at = now; rp.n++; this._ctlSeat(s, rp.m); }
    }
    if (this.status === 'starting' && now >= this.t0) { this.status = 'playing'; this.started = true; this.back = false; this.lastRecv = now; for (s = 0; s < this.n; s++) this.heard[s] = Math.max(this.heard[s], now); }
    if (this.edges && this.edgesAt < 0) this.edgesAt = now;
    if (this.status === 'connecting' || this.status === 'starting' || (this.edges && now - this.edgesAt > EDGE_TTL_MS)) this.edges = 0;
    if (!this.edges) this.edgesAt = -1;
    // pings de RTT cada segundo (anfitrión: a cada invitado; invitado: al anfitrión) y, el anfitrión, los de todos cada 2 s
    if ((this.status === 'playing' || this.status === 'waiting' || this.status === 'over') && now - this.pingAt > 1000) { this.pingAt = now; this._ctl({ k: 'ping', t: now, id: 1000 + (this.pingId++) }); }
    if (this.host && this.status !== 'connecting' && this.status !== 'ended' && now - this.pingsAt > PINGS_EVERY_MS) {
      this.pingsAt = now; var pp = []; for (s = 0; s < this.n; s++) pp.push(s === 0 ? 0 : Math.round(this.rtts[s]));
      this._ctl({ k: 'pings', p: pp });
    }

    var playing = this.status === 'playing' || this.status === 'waiting' || this.status === 'over';
    if (playing && this.opts) {
      var target = this._target(now), budget = this.maxCatch > 0 ? Math.min(this.maxCatch, 600) : MAXCATCH, stalled = false;
      // retraso nuevo: en el balón muerto
      if (this.pendDelay >= 0 && this.gp && (this.gp.mode === 'point' || this.gp.mode === 'over')) { this.delay = this.pendDelay; this.pendDelay = -1; }
      // plazas que lleva la IA por la red: el anfitrión escribe su entrada (el invitado contra la IA, la de todas)
      if (this.host) { for (s = 1; s < this.n; s++) if (this.aiHeld[s] || this.gone[s]) this._fab(s); }
      else if (this.solo) { for (s = 0; s < this.n; s++) if (s !== this.slot) this._fab(s); }
      var mv = inp && inp.move ? inp.move : null, mx = mv ? q16(mv[0]) : 0, my = mv ? q16(mv[1]) : 0;
      var lvl = ((inp && inp.ai) || this.away ? B.ai : 0) | aimBits(inp);   // (+ el punto del ratón, controles PC)
      var minR = 1e9; for (s = 0; s < this.n; s++) if ((s !== this.slot || this.spect) && this.rHave[s] < minR) minR = this.rHave[s];
      while (this.localTick < target && budget-- > 0) {
        if (this.localTick - minR >= this.maxPred) { stalled = true; break; }
        var st = this.localTick + this.delay;
        if (st >= this.mineTop && !this.spect) {
          if (st > this.mineTop) {   // (el retraso ha crecido: los tics de en medio repiten la última entrada, sin botones)
            var lt = this.mineTop - 1, li = lt & RM, hasL = lt >= 0 && this.mine.has(lt);
            for (var gt = this.mineTop; gt < st; gt++) this.mine.put(gt, hasL ? this.mine.X[li] : 0, hasL ? this.mine.Y[li] : 0, hasL ? this.mine.B[li] & ~EDGE_N : 0);
          }
          if (this._urg < 2) { var u = this._sig(this.mine, this.refT[this.slot], mx, my, this.edges | lvl); if (u > this._urg) this._urg = u; }   // (un cambio propio sale en este frame)
          this.mine.put(st, mx, my, this.edges | lvl); this.edges = 0; this.edgesAt = -1; this.mineTop = st + 1;
        }
        this.localTick++;
      }
      // a quién se espera
      var wf = this.waitFor; wf.length = 0;
      if (stalled) {
        for (s = 0; s < this.n; s++) if (s !== this.slot && this.localTick - this.rHave[s] >= this.maxPred) wf.push(s);
        if (!this.host && wf.length > 1 && wf[0] === 0) wf.shift();   // (el anfitrión también espera a esa plaza: no es él)
        if (this.waitStart < 0) { this.waitStart = now; this.stats.waits++; }
        this.t0 = now - this.localTick * STEP_MS;
      } else if (this.localTick - minR < this.maxPred) this.waitStart = -1;
      this.waitMs = this.waitStart >= 0 ? now - this.waitStart : 0;
      if (this.status !== 'over') this.status = this.waitStart >= 0 && this.waitMs > 100 ? 'waiting' : 'playing';
      // anfitrión: la plaza que no se oye o que hace esperar SEAT_AI_MS pasa a la IA; 60 s con la IA = se ha ido
      // (lane B: sin parar en seco, la partida también puede ir más lenta que el reloj —el tope de 30 deja que una conexión muy mala la
      //  frene en vez de pararla: 72 % del tiempo real en net4test (m)—; ese tiempo perdido cuenta como espera de la plaza más atrasada
      //  en entradas, si va de verdad atrasada, así la conexión lenta sigue llegando a SLOW_MS)
      // (revisión: el tiempo perdido es lo que CRECE el retraso de la partida contra el reloj —(now - t0) / STEP_MS - localTick, sin
      //  redondear—, y solo por encima de 1 tic: el redondeo de los tics por frame no cuenta (antes, con una pantalla de 165-240 Hz, cada
      //  frame con un tic de menos sumaba y uno de más no restaba: 2,5-4,7 s de «espera» sin que nadie esperara) y el frenado de la
      //  ventaja de frames (t0 += …, abajo) tampoco, porque _gapPrev se toma después de él)
      var slowS = -1, slowLost = 0, gapNow = (now - this.t0) / STEP_MS - this.localTick;
      if (this.host && this.n > 2 && !stalled && this._gapPrev != null) {
        slowLost = Math.min(100, Math.max(0, gapNow - Math.max(1, this._gapPrev)) * STEP_MS);
        var lo = 1e9; for (s = 1; s < this.n; s++) if (!this.aiHeld[s] && !this.gone[s] && this.rHave[s] < lo) { lo = this.rHave[s]; slowS = s; }
        if (slowS > 0 && this.localTick - lo < this._soft / 2) slowS = -1;
      }
      var dk = this.prevNow ? Math.exp(-Math.max(0, now - this.prevNow) / SLOW_TAU_MS) : 1, dtw = this.prevNow ? Math.min(100, now - this.prevNow) : 0;
      if (this.host && this.status !== 'over') for (s = 1; s < this.n; s++) {
        if (this.gone[s]) continue;
        // (estrés: con el tope de 60 casi nunca se para; ir más allá de PRED_SOFT tics por detrás de esa plaza cuenta como esperarla,
        //  lo que antes era una espera con el tope de 30: la conexión mala sigue llegando a SLOW_MS y un corte suelto no)
        var past = !stalled && this.localTick - this.rHave[s] >= this._soft;
        this.blockAcc[s] = this.blockAcc[s] * dk + (stalled && wf.indexOf(s) >= 0 ? dtw : past ? dtw : !stalled && s === slowS ? slowLost : 0);
        if (this.aiHeld[s]) {   // (espectador por conexión lenta: sigue conectado y la espera crece hasta 2 min; se va solo si deja de oírse 60 s)
          var gRef = this.spectS[s] || now < this.slowUntil[s] ? Math.max(this.aiAt[s], this.heard[s]) : this.aiAt[s];
          if (gRef >= 0 && now - gRef > GONE_MS) this._seatGone(s, 'gone', now);
          continue;
        }
        if (wf.indexOf(s) >= 0) { if (this.blockSince[s] < 0) this.blockSince[s] = now; } else this.blockSince[s] = -1;
        if (now - this.heard[s] > SEAT_AI_MS) this._toAI(s, 'sin noticias', now);
        else if (this.blockSince[s] >= 0 && now - this.blockSince[s] > SEAT_AI_MS) this._toAI(s, 'hace esperar', now);
        else if (this.n > 2 && this.blockAcc[s] > SLOW_MS) {   // (a ratos, pero mucho: conexión lenta → IA y espectador, vuelve más tarde)
          this.slowN[s]++; this.slowUntil[s] = now + Math.min(SLOW_BACK_MAX, SLOW_BACK_MS * Math.pow(2, this.slowN[s] - 1));
          this._toAI(s, 'conexión lenta', now); this._resync(s, now, true);
        }
      }
      // invitado: el anfitrión no vuelve en 60 s (esperando o ya contra la IA)
      var lostFor = this.host ? 0 : this.solo ? (this.lostAt >= 0 ? now - this.lostAt : 0) : this.waitMs;
      if (!this.host && lostFor > GONE_MS && !this.goneFlag && this.status !== 'over') this._gone();
      this.goneIn = !this.host && lostFor > 0 && !this.goneFlag && this.status !== 'over' ? Math.max(0, GONE_MS - lostFor) : 0;
      this._sendInputs(); this._urg = 0;
      // ventaja de frames contra la plaza más atrasada
      if (this.rttN && !this.solo && !stalled) {
        var minE = 1e9;
        for (s = 0; s < this.n; s++) {
          if (s === this.slot || this.aiHeld[s] || this.gone[s] || !this.remoteTickAt[s]) continue;
          var lat = this.host ? this.rtts[s] / 2 : this.rtt / 2, e = this.remoteTick[s] + (now - this.remoteTickAt[s] + lat) / STEP_MS;
          if (e < minE) minE = e;
        }
        if (minE < 1e9) {
          this.adv = this.adv * 0.95 + (this.localTick - minE) * 0.05;
          if (this.adv > 1.5) this.t0 += STEP_MS * 0.125;
        }
      }
      this._gapPrev = (now - this.t0) / STEP_MS - this.localTick;   // (retraso contra el reloj al acabar el frame; ver slowLost)
      this._confirm(this.localTick, false);
      for (i = 0; i < this._conf.length; i++) this._conf[i]._conf = true;
      for (i = 0; i < this._conf.length; i++) {
        var ce = this._conf[i];
        out.confirmed.push(ce);
        if (ce.type === 'point') this._evalDelay();
        if (ce.type === 'gameOver') {
          this.status = 'over';
          if (this.solo && !this.goneFlag) this._gone();
          if (!this.result) {
            this.result = { why: 'over', win: ce.team === this.team };   // (por EQUIPO)
            if (!this.cmpOk || this._badNow()) { this.result.unverified = true; this._log('final sin huellas que cuadren: no válido'); }
          }
        }
      }
      this._predict();
      this._present(out.events);
      this.presTick = Math.max(this.presTick, this.localTick);
    } else { this.waitFor.length = 0; this._gapPrev = null; }
    out.g = this.gp; out.status = this.status; out.tick = this.localTick; out.gcTick = this.gcTick;
    out.ping = Math.round(this.rtt); out.waitMs = this.waitMs;
    out.unstable = (this.status === 'playing' || this.status === 'waiting') && !this.solo && now - this.lastRecv > UNSTABLE_MS;
    out.canAI = this.status === 'waiting' && this.waitMs > WAIT_AI_MS && !this.solo;
    out.goneIn = this.goneIn || 0;
    out.startIn = this.status === 'starting' ? Math.max(0, this.t0 - now) : 0;
    out.solo = this.solo; out.valid = this.valid; out.result = this.result; out.rivalSolo = this.rivalSolo; out.gone = this.goneFlag; out.rivalLeft = this.rivalLeft;
    out.waitFor = this.waitFor.slice(); out.aiSeats = this._aiList(); out.meAI = this.meAI || this.spect;
    var P = out.pings; P.length = 0;
    for (s = 0; s < this.n; s++) P.push(s === this.slot ? Math.round(this.rtt) : Math.round(this.host ? this.rtts[s] : s === 0 ? this.rtt : this.seatRtt[s]));
    return out;
  };
  /** Saludo, reloj y arranque (antes del tic 0). */
  NP._connect = function (now) {
    var s;
    if (this.status !== 'connecting') return;
    if (this.host) {
      // arranca cuando están listas todas las plazas que pueden venir; a los CONNECT_MS, con las que estén (el resto, la IA)
      var need = 0, rd = 0, seen = false;
      for (s = 1; s < this.n; s++) {
        if (this.gone[s] || this.preAI.indexOf(s) >= 0) continue;
        need++; if (this.readyS[s]) rd++; if (this.heard[s] > 0) seen = true;
      }
      var late = now - this.connAt > CONNECT_MS;
      if (now - this.connAt > CONNECT_CAP_MS || (late && !rd && !seen) || (need === 0 && this._allGone())) { this._noShow('no ha llegado nadie'); return; }
      if (rd === need || (late && rd > 0)) {
        if (!this._warmOk(now)) return;
        for (s = 1; s < this.n; s++) if (!this.readyS[s] && !this.aiHeld[s]) { this.aiHeld[s] = true; this.aiAt[s] = now; }
        this._begin(now);
      }
      return;
    }
    if (now - Math.max(this.connAt, this.heardAt) > CONNECT_MS) { this._noShow('sin noticias del anfitrión en ' + (CONNECT_MS / 1000) + ' s'); return; }
    if (now - this.connAt > CONNECT_CAP_MS) { this._noShow('no se ha podido empezar en ' + (CONNECT_CAP_MS / 1000) + ' s'); return; }
    if (!this.gotHello && now - this.helloAt > 500) { this.helloAt = now; this._ctl({ k: 'hello', v: PROTO, ver: VB.VERSION || '', name: this.name, seat: this.slot, n: this.n }); }
    if (this.gotHello && !this.ready) {
      if (this.pings.length < 8 && now - this.pingAt > 60) { this.pingAt = now; this._ctl({ k: 'ping', t: now, id: this.pingId++ }); }
      if ((this.pings.length >= 8 || (this.pings.length >= 3 && this.pingId > 30)) && this._warmOk(now)) {
        var best = this.pings.slice().sort(function (a, b) { return a.rtt - b.rtt; }).slice(0, 3);
        var offs = best.map(function (p) { return p.off; }).sort(function (a, b) { return a - b; });
        this.off = offs[offs.length >> 1]; this.ready = true; this._ctl({ k: 'ready' });
        this._log('reloj: desfase ' + this.off.toFixed(1) + ' ms, RTT ' + best[0].rtt.toFixed(1) + ' ms');
      } else if (this.pingId > 30 && this.pings.length < 3) { this.pingId = 0; this.pings.length = 0; }
    }
  };
  NP._begin = function (now) {
    this.t0 = now + START_MS; this.status = 'starting';
    var ai = this._aiList(), j;
    for (j = 0; j < this.links.length; j++) { var s = this.linkSeat[j]; if (s > 0 && this.readyS[s]) this._ctlTo(j, { k: 'start', t0: this.t0, ai: ai }); }
    for (j = 0; j < ai.length; j++) this._ctl({ k: 'seat', s: ai[j], ai: 1, why: 'no conecta' });
    this._log('empieza en ' + START_MS + ' ms' + (ai.length ? ' (IA en ' + ai.join(', ') + ')' : ''));
  };

  /* ---------- Simulador de red (latencia, variación, pérdida) común a MemLink y BcLink ---------- */
  function mulberry(seed) {
    var s = seed >>> 0;
    return function () { s = (s + 0x6D2B79F5) >>> 0; var t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  /** Retraso de un sentido (ms) y pérdida: lag = RTT (ida = lag/2), jit = ± variación de un sentido, loss = % (solo canal 'in'). */
  function Shaper(o, seed) {
    this.lag = Math.max(0, +o.lag || 0); this.jit = Math.max(0, +o.jit || 0); this.loss = Math.max(0, Math.min(90, +o.loss || 0));
    this.r = mulberry(seed || 1); this.lastCtl = 0; this.down = 0;
  }
  Shaper.prototype.due = function (ch, now) {
    if (ch === 'in' && (now < this.down || this.r() * 100 < this.loss)) return -1;
    var d = this.lag / 2 + (this.jit ? (this.r() * 2 - 1) * this.jit : 0), at = now + Math.max(0, d);
    if (ch === 'ctl') { if (now < this.down) at = Math.max(at, this.down + this.lag / 2); at = Math.max(at, this.lastCtl); this.lastCtl = at; }   // fiable y en orden
    return at;
  };

  /** Par de enlaces en memoria (Node / pruebas). clock() = reloj común en ms (el de la prueba). down(ms) corta la red ms
   *  (las entradas se pierden; el control llega al volver, como un canal fiable). flush() vacía lo que está en vuelo. */
  function memPair(o) {
    o = o || {};
    var clock = o.clock || function () { return Date.now(); };
    var A = { q: [], shaper: new Shaper(o, (o.seed || 1) * 2 + 1) }, Bq = { q: [], shaper: new Shaper(o, (o.seed || 1) * 2 + 2) };
    function mk(self, peer) {
      return {
        send: function (ch, data) {
          var now = clock(), at = self.shaper.due(ch, now); if (at < 0) return;
          var d = data instanceof Uint8Array ? new Uint8Array(data) : data;
          peer.q.push({ at: at, ch: ch, data: d, n: peer.n = (peer.n || 0) + 1 });
        },
        poll: function () {
          var now = clock(), out = [], keep = [];
          peer.q; // (simetría)
          self.q.sort(function (a, b) { return a.at - b.at || a.n - b.n; });
          for (var i = 0; i < self.q.length; i++) { var m = self.q[i]; if (m.at <= now) out.push({ ch: m.ch, data: m.data }); else keep.push(m); }
          self.q = keep; return out;
        },
        down: function (ms) { var t = clock() + ms; A.shaper.down = t; Bq.shaper.down = t; },
        flush: function () { A.q.length = 0; Bq.q.length = 0; },
        set: function (k, v) { A.shaper[k] = v; Bq.shaper[k] = v; },
        close: function () { }
      };
    }
    return [mk(A, Bq), mk(Bq, A)];
  }

  /** Enlace por BroadcastChannel entre dos pestañas / páginas del mismo origen, con el simulador de red (?lag=&jit=&loss=).
   *  Online de varios (P8, netdrive de N páginas): con o.to (plaza del otro extremo) el enlace es de UNA PAREJA (slot ↔ to), con su canal
   *  propio ('…-a-b', a < b: solo lo oyen esas dos páginas) y su propio Shaper (lag de esa pareja). El anfitrión abre uno por invitado
   *  ({slot: 0, to: k}) y cada invitado uno con el anfitrión ({slot: k, to: 0}). Sin o.to, el de 2 páginas de siempre. */
  function BcLink(o) {
    o = o || {};
    var self = this, pair = o.to != null, slot = pair ? o.slot | 0 : o.slot === 1 ? 1 : 0, to = pair ? o.to | 0 : 1 - slot;
    this.slot = slot; this.to = to; this.q = []; this.n = 0;
    this.shaper = new Shaper(o, (o.seed || 7) + slot * 31 + (pair ? to * 977 : 0));
    this.now = function () { return (typeof performance !== 'undefined' ? performance.now() : Date.now()); };
    this.bc = new BroadcastChannel('mtc-net-' + String(o.room || 'prueba') + (pair ? '-' + Math.min(slot, to) + '-' + Math.max(slot, to) : ''));
    // el retraso se aplica al RECIBIR (cada página con su reloj): así no hacen falta temporizadores
    this.bc.onmessage = function (ev) {
      var m = ev.data; if (!m || m.from === slot || (pair && m.from !== to)) return;
      var at = self.shaper.due(m.ch, self.now()); if (at < 0) return;
      self.q.push({ at: at, ch: m.ch, data: m.data, n: ++self.n });
    };
  }
  BcLink.prototype.send = function (ch, data) { try { this.bc.postMessage({ from: this.slot, ch: ch, data: data }); } catch (e) { } };  BcLink.prototype.poll = function (now) {
    var out = [], keep = [], q = this.q; now = this.now();
    q.sort(function (a, b) { return a.at - b.at || a.n - b.n; });
    for (var i = 0; i < q.length; i++) { if (q[i].at <= now) out.push({ ch: q[i].ch, data: q[i].data }); else keep.push(q[i]); }
    this.q = keep; return out;
  };
  BcLink.prototype.down = function (ms) { this.shaper.down = this.now() + ms; };
  BcLink.prototype.close = function () { try { this.bc.close(); } catch (e) { } };

  /* ---------- Bot de solo entrada (pruebas: nettest, netdrive). Azar propio, nunca g.rng. Lee con useSlot y deja el hueco 0. ----------
   * Por HUECO (P0 del online a N): bot(slot, seed, prof, {team}) lleva el hueco slot; el equipo se lee en cada llamada (o.team, o si no
   * g.hum[slot].team, o si no el propio hueco). Con 2 huecos hueco == equipo: el azar (semilla + slot) y todo lo demás, como siempre. */
  var BOT = {
    bueno: { sigma: 0.04, posErr: 0.35, react: 0.18, aim: 0.6, block: true, jumpServe: 0.5 },
    flojo: { sigma: 0.11, posErr: 1.1, react: 0.32, aim: 0.15, block: false, jumpServe: 0.05 }
  };
  function bot(slot, seed, profName, bo) {
    var S = Sim(), C = VB.C, prof = BOT[profName] || BOT.bueno;
    slot = slot | 0; var fixT = bo && (bo.team === 0 || bo.team === 1) ? bo.team : -1;
    var r = mulberry(seed * 7919 + 13 + slot * 104729), w = {}, team = slot, sd = 1;
    var gauss = function () { return (r() + r() + r() + r() - 2) * 1.732; };
    var stamp = -9, lead = 0, jlead = 0, ex = 0, ey = 0, presses = 0, serveWait = 0, react = 0, aimv = [0, 0], useAim = false, blockT = -1, blockSeen = -9;
    var fn = function (g) {
      var inp = { move: [0, 0], hit: false, jump: false, jset: false, skip: false };
      if (!g || !g.online) return inp;
      var hs = g.hum && g.hum[slot];
      team = fixT >= 0 ? fixT : hs && (hs.team === 0 || hs.team === 1) ? hs.team : slot; sd = S.side(team);
      S.useSlot(g, slot);
      try {
        var p = g.ctrl, b = g.ball;
        if (g.mode === 'point' || g.mode === 'over') { inp.skip = r() < 0.02; return inp; }
        if (g.mode === 'serve') {
          if (g.server !== p) return inp;
          if (g.serveState === 'ready') {
            if (g.serveT < 0.02) serveWait = 0.8 + r() * 1.5;
            if (g.serveAuth && g.serveT > serveWait) { if (r() < prof.jumpServe) inp.jump = true; else inp.hit = true; }
            return inp;
          }
          if (stamp !== g.lastTouchT) { stamp = g.lastTouchT; lead = C.WINDUP + gauss() * prof.sigma; presses = 0; }
          S.hitWindow(g, p, w);
          if (presses < 2 && !g.swingLive && w.t <= lead && b.vz <= 0.5) { inp.hit = true; presses++; }
          return inp;
        }
        if (g.mode !== 'rally') return inp;
        if (stamp !== g.lastTouchT) {
          stamp = g.lastTouchT; presses = 0; lead = C.WINDUP + gauss() * prof.sigma; jlead = gauss() * prof.sigma * 0.9;
          ex = gauss() * prof.posErr; ey = gauss() * prof.posErr; react = prof.react * (0.7 + 0.6 * r());
          var an = r() * 6.283; aimv = [Math.cos(an), Math.sin(an)]; useAim = r() < prof.aim;
        }
        var since = g.time - g.lastTouchT, job = g.jobs[team] === p;
        var attack = job && g.touchTeam === team && g.touches === 2 && Math.abs(g.pr3.x) < 3.8 && g.pr3.z > 2.5;
        var tx, ty;
        if (job) {
          var pr = attack ? g.pr3 : g.pr1, kk = Math.min(1, Math.max(0, pr.t) / 1.1) * 0.5;
          tx = pr.x + sd * (attack ? 0.35 : 0.15) + ex * kk; ty = pr.y + ey * kk;
        } else if (g.rot && VB.AI6) {   // 6v6: a su sitio de la formación (recepción, bloqueo de zona, defensa…), como el bot del simtest
          var sp = VB.AI6.spot(g, p); tx = sp.x + ex * 0.3; ty = sp.y + ey * 0.3;
        } else if (prof.block && g.touchTeam === 1 - team && g.touches >= 1 && g.pr3.x * sd < 0 && g.defRole !== 'dig') {
          tx = sd * 0.6; ty = g.pr3.y;
        } else { tx = sd * 5.5; ty = -S.other(g, p).y * 0.5; }
        if (since >= react && p.z === 0) {
          var dx = tx - p.x, dy = ty - p.y, d = Math.hypot(dx, dy);
          if (d > 0.1) { var f = Math.min(1, d / 0.3); inp.move = [dx / d * f, dy / d * f]; }
        }
        if (job && since >= react * 0.6) {
          S.hitWindow(g, p, w);
          if (attack && p.z === 0 && w.attack && w.jumpT <= jlead && Math.hypot(g.pr3.x + sd * 0.35 - p.x, g.pr3.y - p.y) < 1.3) inp.jump = true;
          var near = Math.hypot(b.x - p.x, b.y - p.y) < 2.6;
          if (near && !(attack && p.z === 0 && w.jumpT > -0.2) && presses < 2 && !g.swingLive && w.t <= lead) {
            inp.hit = true; presses++; if (useAim) inp.move = aimv;
          }
        }
        if (g.swingLive && p.z > 0 && useAim) inp.move = aimv;
        if (prof.block && !job && p.z === 0 && Math.abs(p.x) < 1.2 && g.touchTeam === 1 - team && g.touches === 2) {
          var att = false, T = g.teams[1 - team];
          for (var i = 0; i < T.length; i++) if (T[i].z > 0.35 && T[i].vz < 1.5 && Math.abs(T[i].x) < 4) att = true;
          if (att && blockSeen !== stamp) { blockSeen = stamp; blockT = g.time + Math.max(0, 0.06 + gauss() * prof.sigma); }
          if (att && g.time >= blockT) inp.jump = true;
        }
        return inp;
      } finally { S.useSlot(g, 0); }
    };
    if (!(bo && bo.aimPt)) return fn;
    // (pruebas de los controles PC, bo.aimPt: además apunta con el «ratón», input.aim = un punto del mundo canónico elegido en cada toque
    //  con su propio azar: en el campo rival, o en el propio si le toca colocar. Ya cuantizado como lo deja main.js)
    var ar = mulberry(seed * 31 + 7 + slot * 1013), apx = 0, apy = 0, ast = -99;
    return function (g) {
      var inp = fn(g);
      if (!g || !g.online) return inp;
      var hs2 = g.hum && g.hum[slot], tm = fixT >= 0 ? fixT : hs2 && (hs2.team === 0 || hs2.team === 1) ? hs2.team : slot, sdd = S.side(tm);
      if (g.lastTouchT !== ast) {
        ast = g.lastTouchT;
        var own = g.mode === 'rally' && g.touchTeam === tm && g.touches === 1;
        apx = own ? sdd * (1 + 2.5 * ar()) : -sdd * (1.5 + 6.5 * ar()); apy = (ar() * 2 - 1) * 3.6;
        apx = Math.round(apx * 10) / 10; apy = Math.round(apy * 20) / 20;
      }
      inp.aim = [apx, apy];
      return inp;
    };
  }

  VB.Net = {
    Session: Session, SessionN: SessionN, packN: packN, unpackN: unpackN, adaptDelay: adaptDelay, SEAT_AI_MS: SEAT_AI_MS, MAXPRED_N: MAXPRED_N, SEND_HZ: SEND_HZ, memPair: memPair, BcLink: BcLink, bot: bot, BOT: BOT, Shaper: Shaper,
    decode: decode, q16: q16, bitsOf: bitsOf, aimBits: aimBits, AIM_F: AIM_F, packInputs: packInputs, unpackInputs: unpackInputs, mulberry: mulberry,
    PROTO: PROTO, BITS: B, cleanName: cleanName, CONNECT_MS: CONNECT_MS, STEP: STEP, STEP_MS: STEP_MS, MAXPRED: MAXPRED, HASH_EVERY: HASH_EVERY, WAIT_AI_MS: WAIT_AI_MS, GONE_MS: GONE_MS
  };
})();
