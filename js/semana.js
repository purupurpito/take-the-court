/* TAKE THE COURT — js/semana.js (owner: ui_main)
 * La situación de la semana (20-nov-2026): cada lunes, el mismo final apurado para todo el mundo («Set único a 25: 22-24, saca el
 * rival»), con tres intentos al día y el mejor de la semana guardado. Decisiones de Ferran: va JUNTO al reto del día (no lo
 * sustituye) y SIN XP ni medallas (tampoco récord ni perfil: empezar desde 24-22 regalaría premios). Decisiones provisionales (propuesta
 * de la ficha, sin respuesta de Ferran; notes/pendientes-ferran.md): nivel de la semana, atributos e insignias iguales para todos y sin
 * ayuda de novato; intentos y mejor resultado solo en este aparato. Portada (revisión del 21-nov, propuesta «JUNTO»): la situación
 * ocupa el sello junto a JUGAR (menu-jugador.js, lee peek()) y el reto del día sigue en la franja de Jugar y en «Hoy».
 * Compartir crea un enlace con tu resultado y dónde sacaste y atacaste, encadenado a los de los amigos que te lo pasaron («mapa del
 * grupo»). Sin servidor: el enlace lleva 4 caracteres de control que solo descartan enlaces rotos; no es un antitrampas.
 *
 * Puro: sin DOM ni THREE; localStorage siempre en try/catch. Nunca toca g.rng: la situación sale de su propio hash y su PRNG
 * (mulberry32 sobre 'mtc-sem-' + semana ISO), como el reto del día. index.html lo carga después de js/retos.js; lee VB.Retos (fechas y
 * sedes), VB.Venues y VB.MatchStats de forma perezosa y con guarda.
 *
 * API (VB.Semana):
 *   situation(wk?) → {wk, fmt '2v2'|'6v6', six, kind 'hall'|'beach', map, mapName, fam 'unico'|'tercer', T, points, setNo, score [a,b],
 *                     serving, srvIdx, rot [k0,k1], rotLbl, difficulty, diffName, famLbl, srvLbl, label, chips[], opts}
 *   state() → {wk, sit, left, n (intentos gastados hoy), tries, today:[{w,a,b}] (los de hoy, cerrados), best, group, groupOld, me, open}
 *   left()            intentos que quedan hoy (3 al día)
 *   begin()           gasta un intento AL EMPEZAR y devuelve las opciones para ctx.actions.startMatch (null si no quedan)
 *   finish(g, res, dry?) cierra el intento: res = {win, a, b, zones?:{S,A}} (a-b = el set de la situación) → {w, a, b, i, best, isBest, left}
 *   abandon(g?)       un intento abierto sin cerrar (salir al menú, reiniciar) cuenta como perdido con el marcador que tenga
 *   better(x, y, sit?) ¿x mejor que y? Ganada > perdida; entre ganadas, menos puntos cedidos desde el arranque; entre perdidas, más ganados
 *   link() → URL ?sem=…  (tu mejor entra en la cadena) · readLink(s) → {wk, list} | null · mergeLink(s) → {wk, list, old, n} | null
 *   shareText() → «La situación de la semana: 22-24 en contra. Yo la gané 26-24. ¿Y tú?»
 *   myName(), resLbl(e) → «Ganada 26-24» / «Perdida 23-25»
 *   peek() → {wk, sit, left, best} solo lectura (sello de la portada; no cierra intentos abiertos en otra pestaña)
 *   _reset(), _now(k AAAAMMDD | 0), _sid (pruebas)
 *
 * Guardado 'make-the-cut.semana' v1 (solo del aparato; nunca va a la cuenta):
 *   {v:1, wk, me (3 caracteres: el nombre sin apodo de antes; desde el 24-nov-2026 el nombre sin apodo es el anónimo del aparato, «Jugador_NNNN», js/namefilter.js), days:{AAAAMMDD:n}, open:{sid, i, k}|null, best:{w,a,b,S,A}|null,
 *    tries:[{w,a,b,k}] (≤ 21; k = AAAAMMDD), group:{wk, list:[{n,w,a,b,S,A}] ≤ 8}}
 *   Si cambia la semana se vacía todo menos la cadena antigua, que queda en solo lectura hasta que llegue una de la semana nueva.
 *   S y A son cadenas de dígitos 0-6 (zona 1-6 del campo rival, 0 fuera), como mucho 12 de cada.
 */
(function () {
  'use strict';
  var root = typeof window !== 'undefined' ? window : globalThis;
  var VB = root.VB = root.VB || {};
  var KEY = 'make-the-cut.semana', VER = 1, TRIES = 3, MAXG = 8, MAXT = 21, MAXZ = 12;
  var DIFF_NAME = { normal: 'Normal', hard: 'Difícil' };
  var MAPS0 = { hall: ['palau', 'canrebot', 'cupula'], beach: ['platja', 'moll', 'fanals'] };
  var NAMES0 = { palau: 'Palau del Mar', canrebot: 'Poliesportiu Can Rebot', cupula: 'Cúpula del Far', platja: 'Platja Llarga', moll: 'Moll de la Sorra', fanals: 'Cala dels Fanals' };
  var MAP_DEF = { hall: 'palau', beach: 'platja' };
  // marcadores (tuyo, suyo) respecto al objetivo T: por detrás 70 %, empate 20 %, por delante 10 %. Nunca un set ya ganado: el que va
  // delante está como mucho en T-1, o en el deuce con un punto de ventaja
  var BEHIND = [[-3, -1], [-2, -1], [-4, -2], [-3, -2], [-1, 0]], TIED = [[-1, -1], [-2, -2], [0, 0]], AHEAD = [[-1, -2], [-1, -3]];

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
  function week(k) {
    var r = R(); if (r && r.isoWeek) return r.isoWeek(k == null ? today() : k);
    k = k == null ? today() : k;   // (sin retos.js: la misma cuenta ISO)
    var Y = Math.floor(k / 10000), M = Math.floor(k / 100) % 100 - 1, D = k % 100, t = Date.UTC(Y, M, D), dow = (new Date(t).getUTCDay() + 6) % 7;
    var th = new Date(t + (3 - dow) * 864e5), y = th.getUTCFullYear();
    return y * 100 + 1 + Math.floor((th.getTime() - Date.UTC(y, 0, 1)) / (7 * 864e5));
  }
  function validWeek(k) { k = +k; var w = k % 100; return k === Math.floor(k) && k >= 190001 && k <= 299953 && w >= 1 && w <= 53; }
  function wkNum(wk) { return wk % 100; }

  // ---------------------------------------------------------------- la situación
  function mapReady(id) { try { if (VB.Venues && typeof VB.Venues.ready === 'function') return !!VB.Venues.ready(id); } catch (e) { } return true; }
  function mapName(id) { var v = VB.VENUES && VB.VENUES[id]; var M = R() && R().MAPS; return (v && v.name) || (M && M[id] && M[id].name) || NAMES0[id] || ''; }
  /** Sedes del sorteo: SIEMPRE la lista congelada MAPS0 (mismo orden en todas las versiones). Si se añaden sedes a VB.Retos.MAPS
   *  (sede por club…), las situaciones de todas las semanas no cambian y dos versiones distintas ven la misma; Retos.MAPS y
   *  VB.VENUES solo dan el nombre (mapName). Una sede nueva entra aquí solo al final de su lista y sabiendo que cambia el sorteo. */
  function mapsOf(kind) { return MAPS0[kind].slice(); }
  var sitCache = {};
  /** La situación de la semana wk (AAAAWW; por defecto la de hoy). Las extracciones van siempre en el mismo orden y gastan siempre
   *  un número, se usen o no. */
  function situation(wk) {
    wk = validWeek(wk) ? +wk : week();
    if (sitCache[wk]) return sitCache[wk];
    var rng = mulberry32(hashStr('mtc-sem-' + wk));
    var x = rng(), six = x >= 0.8, kind = x < 0.5 || six ? 'hall' : 'beach';            // 1 formato: 2v2 pabellón 50 %, playa 30 %, 6v6 20 %
    var mapWant = pick(rng, mapsOf(kind));                                              // 2 sede
    var fam = rng() < 0.6 ? 'unico' : 'tercer';                                         // 3 familia: set único 60 %, 3r set 40 %
    var cx = rng(), cat = cx < 0.7 ? BEHIND : cx < 0.9 ? TIED : AHEAD;                  // 4 marcador
    var dd = pick(rng, cat);
    var serving = rng() < 0.5 ? 0 : 1;                                                  // 5 saque
    var srvIdx = rng() < 0.5 ? 0 : 1;                                                   // 6 quién del equipo saca (2v2)
    var rot = [Math.floor(rng() * 6) % 6, Math.floor(rng() * 6) % 6];                   // 7 rotación (6v6)
    var diff = rng() < 0.4 ? 'normal' : 'hard';                                         // 8 nivel
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
    var opts = { sit: { wk: wk, i: 0 }, start: { setNo: setNo, score: [a, b], serving: serving, srvIdx: srvIdx, rot: six ? rot.slice() : [0, 0], bo1: fam === 'unico' },
      format: six ? '6v6' : '2v2', map: map, difficulty: diff, points: kind === 'beach' ? 21 : 25, ctrl: six ? 'one' : 'both', ctrlIdx: 0,
      noAttrs: true, noBadges: true, seed: 0, noIntro: false };
    var S = { wk: wk, fmt: six ? '6v6' : '2v2', six: six, kind: kind, map: map, mapName: mapName(map), fam: fam, T: T, points: opts.points, setNo: setNo,
      score: [a, b], serving: serving, srvIdx: srvIdx, rot: rot, rotLbl: rotLbl, difficulty: diff, diffName: DIFF_NAME[diff],
      famLbl: famLbl, srvLbl: srvLbl, label: famLbl + ': ' + a + '-' + b + ', ' + srvLbl.charAt(0).toLowerCase() + srvLbl.slice(1), chips: chips, opts: opts };
    if (map === mapWant) sitCache[wk] = S;   // (sede de serie porque la pedida aún no estaba lista: se vuelve a mirar la próxima vez)
    return S;
  }
  function sitOpts(sit, i) {
    var o = JSON.parse(JSON.stringify(sit.opts));
    o.sit = { wk: sit.wk, i: i | 0 }; o.seed = hashStr('mtc-sem-' + sit.wk + '-' + (i | 0)) & 0x7fffffff;   // el mismo arranque para todos
    return o;
  }

  // ---------------------------------------------------------------- guardado
  function num(v, lo, hi) { v = +v; if (!isFinite(v)) return lo; v = Math.floor(v); return v < lo ? lo : v > hi ? hi : v; }
  function zs(v) { return String(v == null ? '' : v).replace(/[^0-6]/g, '').slice(0, MAXZ); }
  function res(e) { return e && typeof e === 'object' ? { w: e.w ? 1 : 0, a: num(e.a, 0, 99), b: num(e.b, 0, 99) } : null; }
  function resZ(e) { var r = res(e); if (!r) return null; r.S = zs(e.S); r.A = zs(e.A); return r; }
  function baseName(s) {
    s = String(s == null ? '' : s);
    if (s.indexOf('@') >= 0) return '';   // (nunca algo con pinta de correo)
    return s.replace(/[^A-Za-z0-9À-ÿÑñ _]/g, '').replace(/[ _]+/g, ' ').trim().slice(0, 12).trim().replace(/ /g, '_');
  }
  /** Nombre de la cadena; uno con insultos (de un enlace recibido o guardado) sale como «Jugador_NNNN» (js/namefilter.js). */
  function cleanName(s) {
    var n = baseName(s), F = VB.NameFilter;
    return n && F && F.bad(n.replace(/_/g, ' ')) ? baseName(F.mask(n)) : n;
  }
  function randMe() { var a = 'abcdefghjkmnpqrstuvwxyz23456789', s = ''; for (var i = 0; i < 3; i++) s += a.charAt(Math.floor(Math.random() * a.length)); return s; }
  function empty(wk) { return { v: VER, wk: wk, me: '', days: {}, open: null, best: null, tries: [], group: null }; }
  function clean(o, wk) {
    var out = empty(wk);
    if (!o || typeof o !== 'object') return out;
    out.me = String(o.me || '').replace(/[^a-z0-9]/g, '').slice(0, 3);
    var g = o.group && typeof o.group === 'object' && validWeek(o.group.wk) && Array.isArray(o.group.list) ? o.group : null;
    if (g) {
      var L = [], seen = {};
      for (var i = 0; i < g.list.length && L.length < MAXG; i++) { var e = g.list[i], n = e && cleanName(e.n); if (!n || seen[n]) continue; seen[n] = 1; var r = resZ(e); r.n = n; L.push({ n: n, w: r.w, a: r.a, b: r.b, S: r.S, A: r.A }); }
      out.group = { wk: +g.wk, list: L };
    }
    if (+o.wk !== wk) return out;   // semana nueva: todo a cero menos la cadena antigua (solo lectura)
    var d = o.days && typeof o.days === 'object' ? o.days : {};
    for (var k in d) if (Object.prototype.hasOwnProperty.call(d, k) && week(+k) === wk) out.days[+k] = num(d[k], 0, TRIES);
    if (o.open && typeof o.open === 'object') out.open = { sid: String(o.open.sid || '').slice(0, 16), i: num(o.open.i, 1, TRIES), k: num(o.open.k, 0, 29991231) };
    out.best = resZ(o.best);
    if (Array.isArray(o.tries)) for (var j = Math.max(0, o.tries.length - MAXT); j < o.tries.length; j++) { var t = res(o.tries[j]); if (t) { t.k = num(o.tries[j].k, 0, 29991231); out.tries.push(t); } }
    return out;
  }
  // La caché solo vale mientras el guardado siga siendo el que leímos o escribimos: con dos pestañas abiertas, lo que guarde la
  // otra se vuelve a leer antes de cada operación (si no, cada una pisaba la copia de la otra y se perdían intentos o el mejor)
  var cache = null, cacheWk = 0, cacheRaw = null;
  function load() {
    var wk = week();
    var raw = null; try { raw = root.localStorage.getItem(KEY); } catch (e) { raw = null; }
    if (cache && cacheWk === wk && raw === cacheRaw) return cache;
    var p = null; if (raw) { try { p = JSON.parse(raw); } catch (e) { p = null; } }
    cache = clean(p, wk); cacheWk = wk; cacheRaw = raw;
    if (!cache.me) cache.me = randMe();
    return cache;
  }
  function save(o) {
    cache = o; cacheWk = o.wk;
    var s = JSON.stringify(o);
    try { root.localStorage.setItem(KEY, s); cacheRaw = root.localStorage.getItem(KEY); } catch (e) { }
  }

  // ---------------------------------------------------------------- intentos
  var SID = (Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36)).slice(-12);
  function better(x, y, sit) {
    if (!x) return false; if (!y) return true;
    if (!!x.w !== !!y.w) return !!x.w;
    var s0 = sit ? sit.score : [0, 0];
    if (x.w) return (x.b - s0[1]) < (y.b - s0[1]);
    return (x.a - s0[0]) > (y.a - s0[0]);
  }
  function record(o, r, sit) {
    o.tries.push({ w: r.w, a: r.a, b: r.b, k: today() }); if (o.tries.length > MAXT) o.tries.splice(0, o.tries.length - MAXT);
    var isBest = better(r, o.best, sit);
    if (isBest) o.best = { w: r.w, a: r.a, b: r.b, S: zs(r.S), A: zs(r.A) };
    return isBest;
  }
  /** Un intento abierto en otra sesión (pestaña cerrada a medias): perdido con el marcador del arranque. */
  function closeStale(o) {
    if (!o.open || o.open.sid === SID) return false;
    var sit = situation(o.wk);
    record(o, { w: 0, a: sit.score[0], b: sit.score[1], S: '', A: '' }, sit);
    o.open = null;
    return true;
  }
  function usedToday(o) { return o.days[today()] | 0; }
  function left() { var o = load(); return Math.max(0, TRIES - usedToday(o)); }
  function begin() {
    var o = load(); if (closeStale(o)) save(o);
    if (o.open) abandonO(o, null);
    var k = today(), n = o.days[k] | 0;
    if (n >= TRIES) return null;
    o.days[k] = n + 1; o.open = { sid: SID, i: n + 1, k: k };
    save(o);
    return sitOpts(situation(o.wk), n + 1);
  }
  function zonesNow() {
    try { var M = VB.MatchStats, d = M && M.data && M.data(); if (d && M.zonesOf) { var z = M.zonesOf(d, 0, d.me); return { S: z.S.join(''), A: z.A.join('') }; } } catch (e) { }
    return { S: '', A: '' };
  }
  function finish(g, r, dry) {
    var o = load(), sit = situation(o.wk);
    if (g && g.sit && g.sit.wk && +g.sit.wk !== o.wk) return null;   // (empezado la semana pasada: ya no cuenta)
    var z = r && r.zones ? { S: [].concat(r.zones.S || []).join(''), A: [].concat(r.zones.A || []).join('') } : zonesNow();
    var e = { w: r && r.win ? 1 : 0, a: num(r && r.a, 0, 99), b: num(r && r.b, 0, 99), S: z.S, A: z.A };
    var i = (o.open && o.open.i) || (g && g.sit && g.sit.i) || 0;
    if (dry) { var ob = better(e, o.best, sit); return { w: e.w, a: e.a, b: e.b, i: i, best: ob ? e : o.best, isBest: ob, left: left(), dry: true }; }
    var isBest = record(o, e, sit);
    o.open = null; save(o);
    return { w: e.w, a: e.a, b: e.b, i: i, best: o.best, isBest: isBest, left: left() };
  }
  function abandonO(o, g) {
    var sit = situation(o.wk), sc = g && g.sit && g.score && !g.demo ? g.score : sit.score;
    record(o, { w: 0, a: sc[0] | 0, b: sc[1] | 0, S: '', A: '' }, sit);
    o.open = null;
  }
  function abandon(g) {
    var o = load(); if (!o.open) return false;
    abandonO(o, g); save(o); return true;
  }
  /** Solo lectura, sin cerrar intentos de otra pestaña (sello de la portada, que se mira cada 1,2 s): situación, quedan y mejor. */
  function peek() {
    var o = load();
    return { wk: o.wk, sit: situation(o.wk), left: Math.max(0, TRIES - usedToday(o)), best: o.best };
  }
  function state() {
    var o = load(); if (closeStale(o)) save(o);
    var sit = situation(o.wk), n = usedToday(o);
    var tk = today(), td = o.tries.filter(function (t) { return t.k === tk; }).map(function (t) { return { w: t.w, a: t.a, b: t.b }; });
    return { wk: o.wk, sit: sit, left: Math.max(0, TRIES - n), n: n, tries: o.tries.length, today: td, best: o.best, group: o.group, groupOld: !!(o.group && o.group.wk !== o.wk), me: myName(), open: !!o.open };
  }

  // ---------------------------------------------------------------- enlace y mapa del grupo
  /** Tu nombre en la cadena: el que escribiste en «Tu nombre en el online» (si vale y no lleva insultos); si no, el anónimo del
   *  aparato, el mismo que en el online («Jugador 1234» → «Jugador_1234»). Sin js/namefilter.js, el de antes (3 letras al azar). */
  function myName() {
    var F = VB.NameFilter, nk = '';
    if (F) { nk = F.nick(); return baseName(nk) || baseName(F.anonName()); }
    try { nk = root.localStorage.getItem('make-the-cut.nick') || ''; } catch (e) { }
    return cleanName(nk) || 'Jugador_' + load().me;
  }
  function entryStr(e) { return e.n + '~' + (e.w ? 'w' : 'l') + e.a + '-' + e.b + '~S' + zs(e.S) + '~A' + zs(e.A); }
  function check(s) { var h = hashStr('mtc-semlink|' + s) % 1679616; return ('000' + h.toString(36)).slice(-4); }   // 36^4
  function rawOf(wk, list) { var s = String(wk); for (var i = 0; i < list.length; i++) s += '.' + entryStr(list[i]); return s; }
  /** Une una entrada con la lista (por nombre; gana la mejor). Con 8, se cae la más antigua que no seas tú. */
  function upsert(list, e, sit, me, force) {
    for (var i = 0; i < list.length; i++) if (list[i].n === e.n) { if (force || better(e, list[i], sit)) list[i] = e; return list; }
    list.push(e);
    while (list.length > MAXG) { var cut = -1; for (var j = 0; j < list.length; j++) if (list[j].n !== me) { cut = j; break; } if (cut < 0) break; list.splice(cut, 1); }
    return list;
  }
  function link() {
    var o = load(), sit = situation(o.wk), me = myName();
    if (!o.group || o.group.wk !== o.wk) o.group = { wk: o.wk, list: [] };
    if (o.best) upsert(o.group.list, { n: me, w: o.best.w, a: o.best.a, b: o.best.b, S: o.best.S, A: o.best.A }, sit, me, true);
    save(o);
    var raw = rawOf(o.wk, o.group.list), parts = raw.split('.');
    for (var i = 1; i < parts.length; i++) { var p = parts[i].split('~'); p[0] = encodeURIComponent(p[0]); parts[i] = p.join('~'); }
    var base = '';
    // como shareSite() de netlobby.js (1.20.0): desde takethecourt.com y desde la dirección antigua se comparte la casa nueva
    try { var L = root.location, h = L ? L.hostname : ''; base = L ? (L.protocol === 'https:' && (h === 'takethecourt.com' || h === 'www.takethecourt.com' || h === 'purupurpito.github.io') ? 'https://takethecourt.com/' : L.origin + L.pathname) : ''; } catch (e) { base = ''; }
    return (base || 'https://takethecourt.com/') + '?sem=' + parts.join('.') + '.' + check(raw);
  }
  function readLink(s) {
    if (s == null) return null;
    s = String(s).trim(); if (s.length > 1200) return null;
    var q = s.indexOf('sem='); if (q >= 0) s = s.slice(q + 4).split('&')[0].split('#')[0];
    if (s.indexOf('%') >= 0) { try { s = decodeURIComponent(s); } catch (e) { return null; } }
    var parts = s.split('.'); if (parts.length < 3) return null;
    var ck = parts.pop(), raw = parts.join('.');
    if (check(raw) !== ck) return null;
    var wk = +parts[0]; if (!validWeek(wk)) return null;
    var list = [], seen = {};
    for (var i = 1; i < parts.length && list.length < MAXG; i++) {
      var m = /^([^~]{1,40})~([wl])(\d{1,2})-(\d{1,2})~S([0-6]{0,12})~A([0-6]{0,12})$/.exec(parts[i]);
      if (!m) return null;
      var n = cleanName(m[1]); if (!n || seen[n]) continue; seen[n] = 1;
      list.push({ n: n, w: m[2] === 'w' ? 1 : 0, a: +m[3], b: +m[4], S: m[5], A: m[6] });
    }
    return list.length ? { wk: wk, list: list } : null;
  }
  function mergeLink(s) {
    var r = readLink(s); if (!r) return null;
    var o = load(), me = myName();
    if (r.wk !== o.wk) {   // de otra semana: solo lectura (no pisa la cadena de esta semana)
      if (!o.group || o.group.wk !== o.wk) { o.group = { wk: r.wk, list: r.list.slice(0, MAXG) }; save(o); }
      return { wk: r.wk, list: r.list, old: true, n: r.list.length, from: r.list[r.list.length - 1].n };
    }
    var sit = situation(o.wk);
    if (!o.group || o.group.wk !== o.wk) o.group = { wk: o.wk, list: [] };
    for (var i = 0; i < r.list.length; i++) { if (r.list[i].n === me && o.best) continue; upsert(o.group.list, r.list[i], sit, me, false); }
    save(o);
    var others = r.list.filter(function (e) { return e.n !== me; });
    return { wk: r.wk, list: o.group.list, old: false, n: others.length, from: others.length ? others[others.length - 1].n : '' };
  }
  function resLbl(e) { return e ? (e.w ? 'Ganada ' : 'Perdida ') + e.a + '-' + e.b : ''; }
  function shareText() {
    var o = load(), sit = situation(o.wk), a = sit.score[0], b = sit.score[1];
    var st = a < b ? a + '-' + b + ' en contra' : a > b ? a + '-' + b + ' a favor' : 'empate a ' + a;
    var me = o.best ? (o.best.w ? ' Yo la gané ' + o.best.a + '-' + o.best.b + '.' : ' A mí se me escapó ' + o.best.a + '-' + o.best.b + '.') : '';
    return 'La situación de la semana ' + wkNum(o.wk) + ': ' + sit.famLbl.toLowerCase() + ', ' + st + '.' + me + ' ¿Y tú?';
  }

  VB.Semana = {
    KEY: KEY, VER: VER, TRIES: TRIES, MAXG: MAXG,
    situation: situation, state: state, peek: peek, left: left, begin: begin, finish: finish, abandon: abandon, better: better,
    link: link, readLink: readLink, mergeLink: mergeLink, shareText: shareText, myName: myName, resLbl: resLbl, week: week, wkNum: wkNum,
    cleanName: cleanName,
    _reset: function () { try { root.localStorage.removeItem(KEY); } catch (e) { } cache = null; cacheWk = 0; sitCache = {}; },
    _now: function (k) { nowK = +k || 0; cache = null; cacheWk = 0; },
    _sid: function (s) { if (s) SID = String(s); return SID; },
    /** Escena de depuración (&debug=semana&semdemo=1): tu mejor, un intento de hoy y una cadena de 7 amigos inventados, SOLO en memoria. */
    _demo: function () {
      var o = load(), sit = situation(o.wk), a = sit.score[0], b = sit.score[1], T = sit.T, k = today();
      var win = function (d) { return { w: 1, a: Math.max(T, b + 2) + d, b: Math.max(T, b + 2) + d - 2 }; }, lose = function (d) { return { w: 0, a: a + d, b: Math.max(T, a + d + 2) }; };
      var names = ['Lluna', 'Txema', 'Brisa', 'Pau_R', 'Mireia', 'Gorka', 'Nil'], Z = ['156', '61', '5', '16', '665', '1', '56'], AZ = ['45', '4', '342', '2', '44', '35', '1'];
      o.group = { wk: o.wk, list: names.map(function (n, i) { var r = i % 3 === 1 ? lose(i % 2) : win(i % 2); return { n: n, w: r.w, a: r.a, b: r.b, S: Z[i], A: AZ[i] }; }) };
      var mb = win(0); o.best = { w: 1, a: mb.a, b: mb.b, S: '165', A: '43' };
      o.days[k] = 1; o.tries = [{ w: 1, a: mb.a, b: mb.b, k: k }];
      cache = o; cacheWk = o.wk;   // (sin save: nada se guarda)
    },
    _hash: hashStr
  };
})();
