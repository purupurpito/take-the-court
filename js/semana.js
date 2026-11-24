/* TAKE THE COURT — js/semana.js (owner: ui_main)
 * «La jugada del día» (antes «La situación de la semana» / «El mismo 22-24», 20-nov-2026). Ferran, 24-nov-2026: «El 22-24 no tendría por
 * qué ser siempre 22-24, puede ser algo diferente cada día. Quiero que lleve un registro de cuántos días seguidos lo cumples, y que cuando
 * entres al juego lo primero que te salga sea un pop-up para completarlo». Así que:
 *   - Cada día (fecha local) una situación distinta, la misma para todo el mundo: sale de un catálogo de cinco tipos de final apretado
 *     (Salvar el set, Cerrarlo, La remontada, El empujón, Mano a mano) con su marcador, set único o 3r set, 2v2 en pista o en playa o 6v6,
 *     saque, sede y nivel. El objetivo siempre es GANAR EL SET desde ese marcador (todos los puntos valen lo mismo).
 *   - Tres intentos al día y el mejor de hoy guardado. «Cumplirla» = ganarla hoy en cualquiera de los tres.
 *   - Racha: días seguidos que la cumples (actual y mejor). Un día sin cumplirla y la racha vuelve a 0.
 * Decisiones de antes que siguen: va JUNTO al reto del día (no lo sustituye) y SIN XP ni medallas (tampoco récord ni perfil). Igualdad
 * (provisional): nivel del día, atributos e insignias iguales para todos y sin ayuda de novato. Intentos, mejor y racha solo en este
 * aparato (decisión provisional del 24-nov: la racha no viaja con la cuenta; notes/pendientes-ferran.md).
 * Compartir crea un enlace con tu resultado y dónde sacaste y atacaste, encadenado a los de los amigos que te lo pasaron («mapa del
 * grupo»). Sin servidor: el enlace lleva 4 caracteres de control que solo descartan enlaces rotos; no es un antitrampas.
 *
 * Puro: sin DOM ni THREE; localStorage siempre en try/catch. Nunca toca g.rng: la situación sale de su propio hash y su PRNG
 * (mulberry32 sobre 'mtc-dia-' + AAAAMMDD), como el reto del día. index.html lo carga después de js/retos.js; lee VB.Retos (fechas y
 * sedes), VB.Venues y VB.MatchStats de forma perezosa y con guarda.
 *
 * Nombres: el módulo se sigue llamando VB.Semana y el campo del periodo sigue siendo «wk» (g.sit.wk, sit.wk, state().wk) para no tocar
 * main.js, recap.js ni el enlace; desde el 24-nov guarda el DÍA (AAAAMMDD). «day» es el mismo valor con su nombre de verdad.
 *
 * API (VB.Semana):
 *   situation(k?) → {wk (= day, AAAAMMDD), day, dayLbl '24 nov', fmt '2v2'|'6v6', six, kind 'hall'|'beach', map, mapName, fam 'unico'|'tercer',
 *                    type 'salvar'|'cerrar'|'remontar'|'empujon'|'mano', title «Salvar el set», goal «Levanta el 22-24 y gana el set»,
 *                    T, points, setNo, score [a,b], serving, srvIdx, rot [k0,k1], rotLbl, difficulty, diffName, famLbl, srvLbl, label, chips[], opts}
 *   state() → {wk, day, sit, left, n (intentos gastados hoy), tries, today:[{w,a,b}], best, done, streak:{cur, best}, group, groupOld, me, open}
 *   left()            intentos que quedan hoy (3 al día)
 *   begin()           gasta un intento AL EMPEZAR y devuelve las opciones para ctx.actions.startMatch (null si no quedan)
 *   finish(g, res, dry?) cierra el intento: res = {win, a, b, zones?:{S,A}} → {w, a, b, i, best, isBest, left, done, streak:{cur,best}, up}
 *                     (up: esta victoria es la que cumple la de hoy y sube la racha)
 *   abandon(g?)       un intento abierto sin cerrar (salir al menú, reiniciar) cuenta como perdido con el marcador que tenga
 *   better(x, y, sit?) ¿x mejor que y? Ganada > perdida; entre ganadas, menos puntos cedidos desde el arranque; entre perdidas, más ganados
 *   streak()          {cur, best} (cur ya a 0 si ayer no la cumpliste)
 *   popWanted()       ¿tiene sentido la ventana al entrar? (no cumplida hoy y con intentos). El resto de condiciones las mira ui.js
 *   link() → URL ?sem=…  (tu mejor entra en la cadena) · readLink(s) → {wk, list, gone?} | null · mergeLink(s) → {wk, list, old, gone, n} | null
 *   shareText() → «La jugada del día (24 nov): levanta el 22-24 y gana el set. Yo la gané 26-24. Llevo 3 días seguidos. ¿Y tú?»
 *   myName(), resLbl(e) → «Ganada 26-24» / «Perdida 23-25»
 *   peek() → {wk, day, sit, left, best, done, streak} solo lectura (sello de la portada; no cierra intentos abiertos en otra pestaña)
 *   _reset(), _now(k AAAAMMDD | 0), _sid, _ms (reloj en ms), _touch (señal de vida) (pruebas)
 *
 * Guardado 'make-the-cut.semana' v2 (solo del aparato; nunca va a la cuenta):
 *   {v:2, day, me (3 caracteres para el nombre sin apodo), n (intentos gastados hoy), open:{sid, i}|null, best:{w,a,b,S,A}|null,
 *    tries:[{w,a,b}] (los de hoy, ≤ 3), streak:{cur, best, last (AAAAMMDD del último día cumplido)}, group:{wk, list:[{n,w,a,b,S,A}] ≤ 8}}
 *   Si cambia el día se vacía todo menos «me», la racha y la cadena antigua, que queda en solo lectura hasta que llegue una de hoy.
 *   El v1 (semanal) se migra quedándose solo con «me»: la situación de la semana era otra y su mejor ya no vale para la de hoy.
 *   S y A son cadenas de dígitos 0-6 (zona 1-6 del campo rival, 0 fuera), como mucho 12 de cada.
 */
(function () {
  'use strict';
  var root = typeof window !== 'undefined' ? window : globalThis;
  var VB = root.VB = root.VB || {};
  var KEY = 'make-the-cut.semana', VER = 2, TRIES = 3, MAXG = 8, MAXZ = 12;
  var DIFF_NAME = { normal: 'Normal', hard: 'Difícil' };
  var MAPS0 = { hall: ['palau', 'canrebot', 'cupula'], beach: ['platja', 'moll', 'fanals'] };
  var NAMES0 = { palau: 'Palau del Mar', canrebot: 'Poliesportiu Can Rebot', cupula: 'Cúpula del Far', platja: 'Platja Llarga', moll: 'Moll de la Sorra', fanals: 'Cala dels Fanals' };
  var MAP_DEF = { hall: 'palau', beach: 'platja' };
  var MON = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  // El catálogo: cinco tipos de final apretado. Marcadores (tuyo, suyo) respecto al objetivo T del set (25 en pista, 21 en playa, 15 en
  // el 3r set). Nunca un set ya ganado: el que va delante está como mucho en T-1, o en el deuce con un punto de ventaja. El orden de las
  // listas y los pesos NO se tocan: cambiarlos cambia la jugada de todos los días (la tabla congelada de tools/semanatest.js lo vigila).
  var TYPES = [
    { id: 'salvar', w: 0.30, title: 'Salvar el set', dd: [[-3, -1], [-2, -1], [-4, -1], [-1, 0]] },     // 22-24, 23-24, 21-24, 24-25
    { id: 'remontar', w: 0.20, title: 'La remontada', dd: [[-7, -2], [-8, -3], [-6, -2], [-9, -4]] },  // 18-23, 17-22, 19-23, 16-21
    { id: 'empujon', w: 0.20, title: 'El empujón', dd: [[-3, -2], [-4, -2], [-5, -3], [-4, -3]] },     // 22-23, 21-23, 20-22, 21-22
    { id: 'mano', w: 0.15, title: 'Mano a mano', dd: [[-1, -1], [-2, -2], [-3, -3], [0, 0]] },         // 24-24, 23-23, 22-22, 25-25
    { id: 'cerrar', w: 0.15, title: 'Cerrarlo', dd: [[-1, -2], [-1, -3], [0, -1], [-2, -3]] }          // 24-23, 24-22, 25-24, 23-22
  ];

  // ---------------------------------------------------------------- hash y PRNG propios (los de retos.js; nunca g.rng)
  function hashStr(s) {
    var h = 0x811c9dc5 | 0;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
    return h >>> 0;
  }
  function mulberry32(a) {
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function pick(rng, arr) { return arr[Math.floor(rng() * arr.length) % arr.length]; }

  // ---------------------------------------------------------------- fechas
  var nowK = 0;
  function R() { return VB.Retos || null; }
  function today() { if (nowK) return nowK; var r = R(); if (r && r.today) return r.today(); var d = new Date(); return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate(); }
  function validDay(k) { k = +k; if (k !== Math.floor(k) || k < 19000101 || k > 29991231) return false; var m = Math.floor(k / 100) % 100, d = k % 100; return m >= 1 && m <= 12 && d >= 1 && d <= 31; }
  function validWeek(k) { k = +k; var w = k % 100; return k === Math.floor(k) && k >= 190001 && k <= 299953 && w >= 1 && w <= 53; }
  function utc(k) { return Date.UTC(Math.floor(k / 10000), Math.floor(k / 100) % 100 - 1, k % 100); }
  function keyOf(t) { var d = new Date(t); return d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate(); }
  function yesterday(k) { return keyOf(utc(k) - 864e5); }
  function dayLbl(k) { k = +k; if (!validDay(k)) return ''; return (k % 100) + ' ' + MON[Math.floor(k / 100) % 100 - 1]; }
  /** Semana ISO (la de antes): solo para la escena de depuración vieja (&semwk) y para reconocer los enlaces semanales. */
  function week(k) {
    var r = R(); if (r && r.isoWeek) return r.isoWeek(k == null ? today() : k);
    k = k == null ? today() : k;
    var t = utc(k), dow = (new Date(t).getUTCDay() + 6) % 7;
    var th = new Date(t + (3 - dow) * 864e5), y = th.getUTCFullYear();
    return y * 100 + 1 + Math.floor((th.getTime() - Date.UTC(y, 0, 1)) / (7 * 864e5));
  }

  // ---------------------------------------------------------------- la jugada
  function mapReady(id) { try { if (VB.Venues && typeof VB.Venues.ready === 'function') return !!VB.Venues.ready(id); } catch (e) { } return true; }
  function mapName(id) { var v = VB.VENUES && VB.VENUES[id]; var M = R() && R().MAPS; return (v && v.name) || (M && M[id] && M[id].name) || NAMES0[id] || ''; }
  /** Sedes del sorteo: SIEMPRE la lista congelada MAPS0 (mismo orden en todas las versiones). Si se añaden sedes a VB.Retos.MAPS, las
   *  jugadas de todos los días no cambian y dos versiones distintas ven la misma; Retos.MAPS y VB.VENUES solo dan el nombre (mapName). */
  function mapsOf(kind) { return MAPS0[kind].slice(); }
  function typeOf(x) { var acc = 0; for (var i = 0; i < TYPES.length; i++) { acc += TYPES[i].w; if (x < acc) return TYPES[i]; } return TYPES[TYPES.length - 1]; }
  function goalOf(id, a, b) {
    var sc = a + '-' + b;
    if (id === 'salvar') return 'Levanta el ' + sc + ' y gana el set';
    if (id === 'remontar') return 'Remonta el ' + sc + ' y gana el set';
    if (id === 'empujon') return 'Dale la vuelta al ' + sc + ' y gana el set';
    if (id === 'mano') return 'Rompe el empate a ' + a + ' y gana el set';
    return 'Cierra el set desde el ' + sc;
  }
  var sitCache = {};
  /** La jugada del día k (AAAAMMDD; por defecto la de hoy). Las extracciones van siempre en el mismo orden y gastan siempre un número,
   *  se usen o no. */
  function situation(k) {
    k = validDay(k) ? +k : today();
    if (sitCache[k]) return sitCache[k];
    var rng = mulberry32(hashStr('mtc-dia-' + k));
    var x = rng(), six = x >= 0.8, kind = x < 0.5 || six ? 'hall' : 'beach';            // 1 formato: 2v2 pista 50 %, playa 30 %, 6v6 20 %
    var mapWant = pick(rng, mapsOf(kind));                                              // 2 sede
    var fam = rng() < 0.6 ? 'unico' : 'tercer';                                         // 3 set: único 60 %, 3r set a 15 40 %
    var ty = typeOf(rng());                                                             // 4 tipo de jugada
    var dd = pick(rng, ty.dd);                                                          // 5 marcador
    var serving = rng() < 0.5 ? 0 : 1;                                                  // 6 saque
    var srvIdx = rng() < 0.5 ? 0 : 1;                                                   // 7 quién del equipo saca (2v2)
    var rot = [Math.floor(rng() * 6) % 6, Math.floor(rng() * 6) % 6];                   // 8 rotación (6v6)
    var diff = rng() < 0.4 ? 'normal' : 'hard';                                         // 9 nivel
    var T = fam === 'tercer' ? 15 : kind === 'beach' ? 21 : 25;
    var a = T + dd[0], b = T + dd[1];
    var map = mapReady(mapWant) ? mapWant : MAP_DEF[kind];
    var setNo = fam === 'tercer' ? 3 : 1;
    var famLbl = fam === 'unico' ? 'Set único a ' + T : '3r set a 15';
    var srvLbl = serving === 1 ? 'Saca el rival' : six ? 'Sacáis vosotros' : 'Sacas tú';
    var rotLbl = six ? 'Rotación ' + (((6 - rot[0]) % 6) + 1) : '';   // (zona del colocador de tu equipo, como matchstats court())
    var chips = [famLbl, srvLbl];
    if (six) chips.push('6 contra 6', rotLbl);
    chips.push(mapName(map), DIFF_NAME[diff], 'Atributos parejos');
    var opts = { sit: { wk: k, i: 0 }, start: { setNo: setNo, score: [a, b], serving: serving, srvIdx: srvIdx, rot: six ? rot.slice() : [0, 0], bo1: fam === 'unico' },
      format: six ? '6v6' : '2v2', map: map, difficulty: diff, points: kind === 'beach' ? 21 : 25, ctrl: six ? 'one' : 'both', ctrlIdx: 0,
      noAttrs: true, noBadges: true, seed: 0, noIntro: false };
    var S = { wk: k, day: k, dayLbl: dayLbl(k), fmt: six ? '6v6' : '2v2', six: six, kind: kind, map: map, mapName: mapName(map), fam: fam,
      type: ty.id, title: ty.title, goal: goalOf(ty.id, a, b), T: T, points: opts.points, setNo: setNo,
      score: [a, b], serving: serving, srvIdx: srvIdx, rot: rot, rotLbl: rotLbl, difficulty: diff, diffName: DIFF_NAME[diff],
      famLbl: famLbl, srvLbl: srvLbl, label: famLbl + ': ' + a + '-' + b + ', ' + srvLbl.charAt(0).toLowerCase() + srvLbl.slice(1), chips: chips, opts: opts };
    if (map === mapWant) sitCache[k] = S;   // (sede de serie porque la pedida aún no estaba lista: se vuelve a mirar la próxima vez)
    return S;
  }
  function sitOpts(sit, i) {
    var o = JSON.parse(JSON.stringify(sit.opts));
    o.sit = { wk: sit.wk, i: i | 0 }; o.seed = hashStr('mtc-dia-' + sit.wk + '-' + (i | 0)) & 0x7fffffff;   // el mismo arranque para todos
    return o;
  }

  // ---------------------------------------------------------------- guardado
  function num(v, lo, hi) { v = +v; if (!isFinite(v)) return lo; v = Math.floor(v); return v < lo ? lo : v > hi ? hi : v; }
  function zs(v) { return String(v == null ? '' : v).replace(/[^0-6]/g, '').slice(0, MAXZ); }
  function res(e) { return e && typeof e === 'object' ? { w: e.w ? 1 : 0, a: num(e.a, 0, 99), b: num(e.b, 0, 99) } : null; }
  function resZ(e) { var r = res(e); if (!r) return null; r.S = zs(e.S); r.A = zs(e.A); return r; }
  function cleanName(s) {
    s = String(s == null ? '' : s);
    if (s.indexOf('@') >= 0) return '';   // (nunca algo con pinta de correo)
    return s.replace(/[^A-Za-z0-9À-ÿÑñ _]/g, '').replace(/[ _]+/g, ' ').trim().slice(0, 12).trim().replace(/ /g, '_');
  }
  function randMe() { var a = 'abcdefghjkmnpqrstuvwxyz23456789', s = ''; for (var i = 0; i < 3; i++) s += a.charAt(Math.floor(Math.random() * a.length)); return s; }
  function empty(k) { return { v: VER, day: k, me: '', n: 0, open: null, best: null, tries: [], streak: { cur: 0, best: 0, last: 0 }, group: null }; }
  function clean(o, k) {
    var out = empty(k);
    if (!o || typeof o !== 'object') return out;
    out.me = String(o.me || '').replace(/[^a-z0-9]/g, '').slice(0, 3);
    if ((o.v | 0) !== VER) return out;   // v1 (semanal) o desconocido: solo el nombre
    var s = o.streak && typeof o.streak === 'object' ? o.streak : null;
    if (s) { var last = validDay(s.last) && +s.last <= k ? +s.last : 0; out.streak = { cur: last ? num(s.cur, 0, 99999) : 0, best: num(s.best, 0, 99999), last: last }; if (out.streak.best < out.streak.cur) out.streak.best = out.streak.cur; }
    var g = o.group && typeof o.group === 'object' && validDay(o.group.wk) && Array.isArray(o.group.list) ? o.group : null;
    if (g) {
      var L = [], seen = {};
      for (var i = 0; i < g.list.length && L.length < MAXG; i++) { var e = g.list[i], n = e && cleanName(e.n); if (!n || seen[n]) continue; seen[n] = 1; var r = resZ(e); L.push({ n: n, w: r.w, a: r.a, b: r.b, S: r.S, A: r.A }); }
      out.group = { wk: +g.wk, list: L };
    }
    if (+o.day !== k) return out;   // día nuevo: todo a cero menos el nombre, la racha y la cadena antigua (solo lectura)
    out.n = num(o.n, 0, TRIES);
    if (o.open && typeof o.open === 'object') out.open = { sid: String(o.open.sid || '').slice(0, 16), i: num(o.open.i, 1, TRIES), t: num(o.open.t, 0, 9e15) };
    out.best = resZ(o.best);
    if (Array.isArray(o.tries)) for (var j = Math.max(0, o.tries.length - TRIES); j < o.tries.length; j++) { var t = res(o.tries[j]); if (t) out.tries.push(t); }
    return out;
  }
  // La caché solo vale mientras el guardado siga siendo el que leímos o escribimos: con dos pestañas abiertas, lo que guarde la
  // otra se vuelve a leer antes de cada operación (si no, cada una pisaba la copia de la otra y se perdían intentos o el mejor)
  var cache = null, cacheK = 0, cacheRaw = null;
  function load() {
    var k = today();
    var raw = null; try { raw = root.localStorage.getItem(KEY); } catch (e) { raw = null; }
    if (cache && cacheK === k && raw === cacheRaw) return cache;
    var p = null; if (raw) { try { p = JSON.parse(raw); } catch (e) { p = null; } }
    cache = clean(p, k); cacheK = k; cacheRaw = raw;
    if (!cache.me) cache.me = randMe();
    return cache;
  }
  function save(o) {
    cache = o; cacheK = o.day;
    var s = JSON.stringify(o);
    try { root.localStorage.setItem(KEY, s); cacheRaw = root.localStorage.getItem(KEY); } catch (e) { }
  }

  // ---------------------------------------------------------------- racha
  /** La racha que vale hoy: la guardada si el último día cumplido es hoy o ayer; si no, 0 (un día sin cumplirla la rompe). */
  function streakOf(o) { var s = o.streak, k = o.day; var alive = s.last && (s.last === k || s.last === yesterday(k)); return { cur: alive ? s.cur : 0, best: s.best }; }
  function streak() { return streakOf(load()); }
  function doneOf(o) { return !!(o.streak.last && o.streak.last === o.day); }
  /** Una victoria de hoy: si es la primera, cumple la jugada y sube la racha (o empieza una nueva). → true si ha subido. */
  function bump(o) {
    var s = o.streak, k = o.day;
    if (s.last === k) return false;
    s.cur = s.last && s.last === yesterday(k) ? s.cur + 1 : 1; s.last = k;
    if (s.cur > s.best) s.best = s.cur;
    return true;
  }

  // ---------------------------------------------------------------- intentos
  var SID = (Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36)).slice(-12);
  // Señal de vida del intento abierto: la pestaña que lo juega renueva open.t cada BEAT ms; uno de otra pestaña sin señal en LIVE ms
  // es de una pestaña muerta (cerrada o matada por el sistema a medias) y no quita la ventana al entrar
  var BEAT = 20000, LIVE = 75000, nowMs = 0, beatIv = 0;
  function ms() { return nowMs || Date.now(); }
  function aliveOther(op) { return !!op && op.sid !== SID && op.t > 0 && ms() - op.t < LIVE; }
  function touch() {
    var o = load(); if (!o.open || o.open.sid !== SID) { stopBeat(); return false; }
    o.open.t = ms(); save(o); return true;
  }
  function startBeat() { if (beatIv || !root.setInterval) return; try { beatIv = root.setInterval(touch, BEAT); if (beatIv && beatIv.unref) beatIv.unref(); } catch (e) { beatIv = 0; } }
  function stopBeat() { if (beatIv) { try { root.clearInterval(beatIv); } catch (e) { } beatIv = 0; } }
  function better(x, y, sit) {
    if (!x) return false; if (!y) return true;
    if (!!x.w !== !!y.w) return !!x.w;
    var s0 = sit ? sit.score : [0, 0];
    if (x.w) return (x.b - s0[1]) < (y.b - s0[1]);
    return (x.a - s0[0]) > (y.a - s0[0]);
  }
  function record(o, r, sit) {
    o.tries.push({ w: r.w, a: r.a, b: r.b }); if (o.tries.length > TRIES) o.tries.splice(0, o.tries.length - TRIES);
    var isBest = better(r, o.best, sit);
    if (isBest) o.best = { w: r.w, a: r.a, b: r.b, S: zs(r.S), A: zs(r.A) };
    return isBest;
  }
  /** Un intento abierto en otra sesión (pestaña cerrada a medias): perdido con el marcador del arranque. */
  function closeStale(o) {
    if (!o.open || o.open.sid === SID) return false;
    var sit = situation(o.day);
    record(o, { w: 0, a: sit.score[0], b: sit.score[1], S: '', A: '' }, sit);
    o.open = null;
    return true;
  }
  function left() { var o = load(); return Math.max(0, TRIES - o.n); }
  function begin() {
    var o = load(); if (closeStale(o)) save(o);
    if (o.open) abandonO(o, null);
    if (o.n >= TRIES) return null;
    o.n++; o.open = { sid: SID, i: o.n, t: ms() };
    save(o); startBeat();
    return sitOpts(situation(o.day), o.n);
  }
  function zonesNow() {
    try { var M = VB.MatchStats, d = M && M.data && M.data(); if (d && M.zonesOf) { var z = M.zonesOf(d, 0, d.me); return { S: z.S.join(''), A: z.A.join('') }; } } catch (e) { }
    return { S: '', A: '' };
  }
  function finish(g, r, dry) {
    var o = load(), sit = situation(o.day);
    if (g && g.sit && g.sit.wk && +g.sit.wk !== o.day) return null;   // (empezado ayer: ya no cuenta)
    var z = r && r.zones ? { S: [].concat(r.zones.S || []).join(''), A: [].concat(r.zones.A || []).join('') } : zonesNow();
    var e = { w: r && r.win ? 1 : 0, a: num(r && r.a, 0, 99), b: num(r && r.b, 0, 99), S: z.S, A: z.A };
    var i = (o.open && o.open.i) || (g && g.sit && g.sit.i) || 0;
    if (dry) {
      var ob = better(e, o.best, sit), sk = streakOf(o), up = !!e.w && !doneOf(o);
      if (up) sk = { cur: (sk.cur | 0) + 1, best: Math.max(sk.best, (sk.cur | 0) + 1) };
      return { w: e.w, a: e.a, b: e.b, i: i, best: ob ? e : o.best, isBest: ob, left: left(), done: doneOf(o) || !!e.w, streak: sk, up: up, dry: true };
    }
    var isBest = record(o, e, sit), up2 = e.w ? bump(o) : false;
    o.open = null; save(o);
    return { w: e.w, a: e.a, b: e.b, i: i, best: o.best, isBest: isBest, left: left(), done: doneOf(o), streak: streakOf(o), up: up2 };
  }
  function abandonO(o, g) {
    var sit = situation(o.day), sc = g && g.sit && g.score && !g.demo ? g.score : sit.score;
    record(o, { w: 0, a: sc[0] | 0, b: sc[1] | 0, S: '', A: '' }, sit);
    o.open = null;
  }
  function abandon(g) {
    var o = load(); if (!o.open) return false;
    abandonO(o, g); save(o); return true;
  }
  /** Solo lectura, sin cerrar intentos de otra pestaña (sello de la portada, que se mira cada 1,2 s). */
  function peek() {
    var o = load();
    return { wk: o.day, day: o.day, sit: situation(o.day), left: Math.max(0, TRIES - o.n), best: o.best, done: doneOf(o), streak: streakOf(o) };
  }
  /** ¿La ventana al entrar tiene algo que ofrecer? Solo si hoy aún no la has cumplido y te quedan intentos (y sin uno abierto aquí o
   *  en otra pestaña viva: uno sin señal de vida reciente es de una pestaña cerrada a medias y no cuenta; begin() lo cerrará). */
  function popWanted() { var o = load(); return !doneOf(o) && o.n < TRIES && !(o.open && (o.open.sid === SID || aliveOther(o.open))); }
  function state() {
    var o = load(); if (closeStale(o)) save(o);
    var sit = situation(o.day);
    return { wk: o.day, day: o.day, sit: sit, left: Math.max(0, TRIES - o.n), n: o.n, tries: o.tries.length, today: o.tries.map(function (t) { return { w: t.w, a: t.a, b: t.b }; }),
      best: o.best, done: doneOf(o), streak: streakOf(o), group: o.group, groupOld: !!(o.group && o.group.wk !== o.day), me: myName(), open: !!o.open };
  }

  // ---------------------------------------------------------------- enlace y mapa del grupo
  function myName() {
    var nk = ''; try { nk = root.localStorage.getItem('make-the-cut.nick') || ''; } catch (e) { }
    var n = cleanName(nk);
    return n || 'Jugador_' + load().me;
  }
  function entryStr(e) { return e.n + '~' + (e.w ? 'w' : 'l') + e.a + '-' + e.b + '~S' + zs(e.S) + '~A' + zs(e.A); }
  function check(s) { var h = hashStr('mtc-semlink|' + s) % 1679616; return ('000' + h.toString(36)).slice(-4); }   // 36^4
  function rawOf(k, list) { var s = String(k); for (var i = 0; i < list.length; i++) s += '.' + entryStr(list[i]); return s; }
  /** Une una entrada con la lista (por nombre; gana la mejor). Con 8, se cae la más antigua que no seas tú. */
  function upsert(list, e, sit, me, force) {
    for (var i = 0; i < list.length; i++) if (list[i].n === e.n) { if (force || better(e, list[i], sit)) list[i] = e; return list; }
    list.push(e);
    while (list.length > MAXG) { var cut = -1; for (var j = 0; j < list.length; j++) if (list[j].n !== me) { cut = j; break; } if (cut < 0) break; list.splice(cut, 1); }
    return list;
  }
  function link() {
    var o = load(), sit = situation(o.day), me = myName();
    if (!o.group || o.group.wk !== o.day) o.group = { wk: o.day, list: [] };
    if (o.best) upsert(o.group.list, { n: me, w: o.best.w, a: o.best.a, b: o.best.b, S: o.best.S, A: o.best.A }, sit, me, true);
    save(o);
    var raw = rawOf(o.day, o.group.list), parts = raw.split('.');
    for (var i = 1; i < parts.length; i++) { var p = parts[i].split('~'); p[0] = encodeURIComponent(p[0]); parts[i] = p.join('~'); }
    var base = '';
    // como shareSite() de netlobby.js (1.20.0): desde takethecourt.com y desde la dirección antigua se comparte la casa nueva
    try { var L = root.location, h = L ? L.hostname : ''; base = L ? (L.protocol === 'https:' && (h === 'takethecourt.com' || h === 'www.takethecourt.com' || h === 'purupurpito.github.io') ? 'https://takethecourt.com/' : L.origin + L.pathname) : ''; } catch (e) { base = ''; }
    return (base || 'https://takethecourt.com/') + '?sem=' + parts.join('.') + '.' + check(raw);
  }
  /** Lee un enlace. Los de la semana de antes (AAAAWW) se reconocen y vuelven con gone: true (ya no hay jugada que unir). */
  function readLink(s) {
    if (s == null) return null;
    s = String(s).trim(); if (s.length > 1200) return null;
    var q = s.indexOf('sem='); if (q >= 0) s = s.slice(q + 4).split('&')[0].split('#')[0];
    if (s.indexOf('%') >= 0) { try { s = decodeURIComponent(s); } catch (e) { return null; } }
    var parts = s.split('.'); if (parts.length < 3) return null;
    var ck = parts.pop(), raw = parts.join('.');
    if (check(raw) !== ck) return null;
    var k = +parts[0], gone = false;
    if (!validDay(k)) { if (validWeek(k)) gone = true; else return null; }
    var list = [], seen = {};
    for (var i = 1; i < parts.length && list.length < MAXG; i++) {
      var m = /^([^~]{1,40})~([wl])(\d{1,2})-(\d{1,2})~S([0-6]{0,12})~A([0-6]{0,12})$/.exec(parts[i]);
      if (!m) return null;
      var n = cleanName(m[1]); if (!n || seen[n]) continue; seen[n] = 1;
      list.push({ n: n, w: m[2] === 'w' ? 1 : 0, a: +m[3], b: +m[4], S: m[5], A: m[6] });
    }
    if (!list.length) return null;
    var out = { wk: k, list: list }; if (gone) out.gone = true;
    return out;
  }
  function mergeLink(s) {
    var r = readLink(s); if (!r) return null;
    var o = load(), me = myName();
    if (r.gone) return { wk: r.wk, list: r.list, old: true, gone: true, n: r.list.length, from: r.list[r.list.length - 1].n };   // (semanal: nada que guardar)
    if (r.wk !== o.day) {   // de otro día: solo lectura (no pisa la cadena de hoy)
      if (!o.group || o.group.wk !== o.day) { o.group = { wk: r.wk, list: r.list.slice(0, MAXG) }; save(o); }
      return { wk: r.wk, list: r.list, old: true, n: r.list.length, from: r.list[r.list.length - 1].n };
    }
    var sit = situation(o.day);
    if (!o.group || o.group.wk !== o.day) o.group = { wk: o.day, list: [] };
    for (var i = 0; i < r.list.length; i++) { if (r.list[i].n === me && o.best) continue; upsert(o.group.list, r.list[i], sit, me, false); }
    save(o);
    var others = r.list.filter(function (e) { return e.n !== me; });
    return { wk: r.wk, list: o.group.list, old: false, n: others.length, from: others.length ? others[others.length - 1].n : '' };
  }
  function resLbl(e) { return e ? (e.w ? 'Ganada ' : 'Perdida ') + e.a + '-' + e.b : ''; }
  function streakTxt(n) { return n === 1 ? '1 día seguido' : n + ' días seguidos'; }
  function shareText() {
    var o = load(), sit = situation(o.day), sk = streakOf(o);
    var me = o.best ? (o.best.w ? ' Yo la gané ' + o.best.a + '-' + o.best.b + '.' : ' A mí se me escapó ' + o.best.a + '-' + o.best.b + '.') : '';
    var rk = sk.cur >= 2 ? ' Llevo ' + streakTxt(sk.cur) + '.' : '';
    return 'La jugada del día (' + sit.dayLbl + '): ' + sit.goal.charAt(0).toLowerCase() + sit.goal.slice(1) + '.' + me + rk + ' ¿Y tú?';
  }

  VB.Semana = {
    KEY: KEY, VER: VER, TRIES: TRIES, MAXG: MAXG, NAME: 'La jugada del día', TYPES: TYPES,
    situation: situation, state: state, peek: peek, left: left, begin: begin, finish: finish, abandon: abandon, better: better,
    streak: streak, popWanted: popWanted, streakTxt: streakTxt,
    link: link, readLink: readLink, mergeLink: mergeLink, shareText: shareText, myName: myName, resLbl: resLbl, week: week,
    today: today, dayLbl: dayLbl, validDay: validDay, yesterday: yesterday,
    /** (compatibilidad) el número que acompaña al periodo en los textos: ahora el día del mes. */
    wkNum: function (k) { return (+k) % 100; },
    cleanName: cleanName,
    _reset: function () { try { root.localStorage.removeItem(KEY); } catch (e) { } cache = null; cacheK = 0; sitCache = {}; },
    _now: function (k) { nowK = +k || 0; cache = null; cacheK = 0; },
    _sid: function (s) { if (s) SID = String(s); return SID; },
    _ms: function (t) { nowMs = +t || 0; }, _touch: touch, LIVE: LIVE,
    /** Escena de depuración (&debug=semana&semdemo=1): tu mejor, un intento de hoy, racha de 4 y una cadena de 7 amigos inventados, SOLO en memoria. */
    _demo: function () {
      var o = load(), sit = situation(o.day), a = sit.score[0], b = sit.score[1], T = sit.T;
      var win = function (d) { return { w: 1, a: Math.max(T, b + 2) + d, b: Math.max(T, b + 2) + d - 2 }; }, lose = function (d) { return { w: 0, a: a + d, b: Math.max(T, a + d + 2) }; };
      var names = ['Lluna', 'Txema', 'Brisa', 'Pau_R', 'Mireia', 'Gorka', 'Nil'], Z = ['156', '61', '5', '16', '665', '1', '56'], AZ = ['45', '4', '342', '2', '44', '35', '1'];
      o.group = { wk: o.day, list: names.map(function (n, i) { var r = i % 3 === 1 ? lose(i % 2) : win(i % 2); return { n: n, w: r.w, a: r.a, b: r.b, S: Z[i], A: AZ[i] }; }) };
      var mb = win(0); o.best = { w: 1, a: mb.a, b: mb.b, S: '165', A: '43' };
      o.n = 1; o.tries = [{ w: 1, a: mb.a, b: mb.b }]; o.streak = { cur: 4, best: 9, last: o.day };
      cache = o; cacheK = o.day;   // (sin save: nada se guarda)
    },
    _hash: hashStr
  };
})();
