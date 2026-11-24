#!/usr/bin/env node
/* TAKE THE COURT — tools/nametest.js  (owner: net)
 * Nombres que ven otros jugadores (js/namefilter.js, Google Play, 24-nov-2026):
 *  1) El filtro salta con insultos escritos de muchas formas (tildes, números, letras repetidas, separadores, pegados).
 *  2) Y NO salta con más de 300 nombres de pila españoles y catalanes, apellidos, palabras normales que contienen trozos de insultos
 *     («disputa», «Pola», «Zorrilla», «retardo»…) ni con parejas de esos nombres («Paco Jones» → «pacojones»).
 *  3) Nombre anónimo por defecto: «Jugador NNNN», el mismo en el aparato; el apodo solo si lo escribiste y vale.
 *  4) Todos los sitios por donde llega o sale un nombre lo usan: salas (js/netroom.js), saludo (js/net.js, js/netfluid.js), récord
 *     online (js/netrec.js), enlace de la semana (js/semana.js) y el lobby (js/netlobby.js, mirando el código: tiene DOM).
 * Uso: node tools/nametest.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
let fails = 0, oks = 0;
function check(name, ok, info) { if (ok) oks++; else fails++; console.log((ok ? '  ok   ' : '  FALLO ') + name + (info !== undefined ? ' ' + (typeof info === 'string' ? info : JSON.stringify(info)) : '')); }
const rd = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
function fakeStorage(init) {
  const m = new Map(Object.entries(init || {}));
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: k => { m.delete(k); }, _m: m };
}
function load(files, ls) {
  const ctx = { console, Math, Date, JSON, Object, Array, String, Number, RegExp, Error, Promise, setTimeout, clearTimeout, localStorage: ls || fakeStorage() };
  ctx.window = ctx; ctx.globalThis = ctx; ctx.VB = {};
  vm.createContext(ctx);
  for (const f of files) vm.runInContext(rd(f), ctx, { filename: f });
  return ctx;
}

/* ---------- 1) insultos ---------- */
console.log('\nEl filtro salta');
const F = load(['js/netroom.js', 'js/namefilter.js']).VB.NameFilter;
const BAD = [
  'puta', 'Puta', 'PUTA', 'putas', 'puto', 'Putos', 'P.U.T.A', 'p u t a', 'pu-ta', 'pu ta', 'PUUUUTA', 'put4', 'pvt0'.replace('v', 'u'), 'pu7a',
  'ElPutoAmo', 'xxputaxx', 'Hijo de puta', 'hijoputa', 'HijoDePuta', 'hdp', 'h.d.p', 'gilipollas', 'Gili pollas', 'gilipolas', 'G1l1p0llas',
  'cabrón', 'Cabrona', 'cabronazo', 'maricón', 'marica', 'mierda', 'Mierdas', 'm1erda', 'coño', 'c0ño', 'zorra', 'zorras', 'Zorrón',
  'imbécil', 'idiota', 'estúpido', 'subnormal', 'retrasado', 'mongolo', 'capullo', 'polla', 'pollas', 'chupapollas', 'comepollas',
  'negrata', 'sudaca', 'bollera', 'travelo', 'nazi', 'Hitler', 'violador', 'pederasta', 'follar', 'malparit', 'malparido', 'fill de puta',
  'merda', 'collons', 'col·lons', 'capoll', 'gilipolles', 'Fuck', 'fuck you', 'FvckYou'.replace('v', 'u'), 'motherfucker', 'shit', 'bullshit',
  'bitch', 'b1tch', 'cunt', 'whore', 'slut', 'nigger', 'n1gg3r', 'nigga', 'faggot', 'fag', 'retard', 'asshole', 'pussy', 'porno',
  'Me cago en todo', 'mecagüen', 'Pepe_Puta', 'Puta69', 'Ana Puta', 'kys', 'stfu', 'ctm', 'lpm', 'la puta madre', 'putamadre',
  'Cabron 99', 'Mi3rd4', '$hit', 'C@bron', 'gilipoya'.replace('ya', 'llas')
];
// insulto + cifras (lo más corriente en un apodo: «Puto1», «zorra2024») y envuelto en x («xXPutaXx», «xPutax»)
for (const w of ['Puto', 'puta', 'zorra', 'Polla', 'putos', 'ElPuto', 'Nazi', 'Mierda', 'gilipollas', 'Cabron'])
  for (const d of ['1', '3', '7', '13', '2024', '_1']) BAD.push(w + d);
BAD.push('4puta', '1zorra', 'xXputaXx', 'XxPutaxX', 'xXnaziXx', 'xPutax', 'xXElPutoXx', 'xXputa1Xx', 'xxPollaxx', 'XzorraX');
const missed = BAD.filter(n => !F.bad(n));
check(BAD.length + ' insultos escritos de muchas formas: todos saltan', missed.length === 0, missed);

/* ---------- 2) falsos positivos ---------- */
console.log('\nEl filtro no salta con nombres ni palabras normales');
const NAMES = (
  // nombres de pila (español)
  'Antonio Manuel José Francisco David Juan Javier Daniel Carlos Jesús Alejandro Miguel Rafael Pedro Pablo Ángel Sergio Fernando Jorge Luis ' +
  'Alberto Álvaro Adrián Diego Raúl Enrique Ramón Vicente Iván Rubén Óscar Andrés Joaquín Santiago Eduardo Víctor Roberto Jaime Mario Ignacio ' +
  'Alfonso Salvador Ricardo Marcos Jordi Emilio Julián Julio Guillermo Gabriel Tomás Agustín Marc Gonzalo Félix Hugo Lucas Martín Mateo Leo ' +
  'Nicolás Samuel Iker Unai Asier Aitor Gorka Pascual Concha Consuelo Remedios Inmaculada Purificación Asunción Encarnación Rocío Pilar Montserrat ' +
  'María Carmen Ana Isabel Laura Cristina Marta Lucía Elena Sara Paula Raquel Patricia Rosa Beatriz Silvia Nuria Julia Irene Alba Andrea ' +
  'Sonia Claudia Eva Verónica Natalia Rocío Mónica Noelia Lorena Ángela Teresa Alicia Inés Susana Yolanda Miriam Begoña Nerea Ainhoa Leire ' +
  'Amparo Dolores Lola Paca Paco Pepa Pepe Pepita Charo Maite Merche Mercedes Puri Conchi Chelo Chus Chema Nacho Quique Kike Rafa Manolo ' +
  'Pola Nazaret Nazario Dámaso Casimiro Anunciación Fuensanta Macarena Esperanza Soledad Visitación Salud Milagros Marisol Socorro Covadonga ' +
  'Valentina Martina Daniela Sofía Emma Carla Vega Olivia Jimena Ximena Xavi Xavier Xènia Xisco Mencía Candela Abril Triana Aitana Noa ' +
  // nombres de pila (catalán)
  'Pau Pol Arnau Oriol Roger Gerard Eloi Biel Bernat Quim Joan Josep Jaume Lluís Ferran Ramon Albert Enric Xavier Martí Nil Jan Èric Aleix ' +
  'Montse Núria Mireia Meritxell Laia Ona Aina Mariona Neus Roser Rosa Assumpta Mercè Glòria Dolors Fina Carme Teresa Txell Berta Clara ' +
  'Queralt Judit Anna Agnès Bet Cesc Toni Tònia Rut Àngels Remei Sílvia Cinta Maribel Ester Elisabet Coloma Margalida Catalina Antònia ' +
  // apellidos y palabras con trozos de insultos dentro
  'García Fernández González Rodríguez López Martínez Sánchez Pérez Gómez Martín Jiménez Ruiz Hernández Díaz Moreno Álvarez Muñoz Romero ' +
  'Puig Soler Ferrer Vidal Serra Font Coll Collado Collell Pujol Pons Mas Sala Roca Riera Pujades Putxet Zorrilla Mazorra Polanco Pollino ' +
  'Concepción Cojedes Cunill Puterman Dickens Cockburn Hancock Scunthorpe Yoshitaka Shitara Matsushita Niger Nigeria Assens Assumpció ' +
  'disputa disputar computadora computar imputado reputación diputado amputar putativo zorro zorrito polla2'.replace('polla2', 'pollito') + ' ' +
  'pollastre pollo pola polo cono conos conejo coña cuna retardo retardar retraso mongol Mongolia Bastardas sustituto nazareno ' +
  'cabra cabrero cabrito marisco marica2'.replace('marica2', 'marino') + ' mariposa idiomas estupendo estudio subnormalidad2'.replace(' subnormalidad2', '') +
  ' merienda mercado merluza mercè merdeta2'.replace(' merdeta2', '') + ' concha conchita mamá papá caca2'.replace(' caca2', '') + ' cojo cojín coche ' +
  'Pucela Putin pita pitufo pique Picasso Pusher Kun Cunha Fucsia Fukuoka Shitake Bitcoin Nike Nazca Hitchcock Parapolla2'.replace(' Parapolla2', '') +
  ' Jugador Rival Campeón Remate Saque Bloqueo Colocador Líbero Playa Pabellón Vóley Voley Arena Smash Ace Kill Cut Spike Setter Pipe ' +
  'Tigre León Lobo Águila Halcón Rayo Trueno Fénix Dragón Pantera Cobra Tiburón Toro Gato Perro Mono Oso Zorrito Búho ' +
  'Valencia Castelló Alacant Barcelona Madrid Sevilla Bilbao Girona Lleida Tarragona Elche Elx Sóller Palma Mallorca Menorca Eivissa Gandia'
).split(/\s+/).filter(Boolean);
const uniq = Array.from(new Set(NAMES));
const fp = uniq.filter(n => F.bad(n));
check(uniq.length + ' nombres, apellidos y palabras normales: ninguno salta', uniq.length >= 300 && fp.length === 0, fp);
// en minúsculas, MAYÚSCULAS, con número y con guion bajo
const fpVar = [];
for (const n of uniq) for (const v of [n.toLowerCase(), n.toUpperCase(), n + ' 22', n + '_7', 'xX' + n + 'Xx']) if (F.bad(v)) fpVar.push(v);
check('…tampoco en minúsculas, MAYÚSCULAS, con número o con guion bajo', fpVar.length === 0, fpVar.slice(0, 20));
// parejas de nombres de pila con apellidos (las que de verdad se escriben: «Paco Jones», «Isaac Abron»)
const firsts = uniq.slice(0, 260), lasts = uniq.slice(260, 330).concat(['Jones', 'Abron', 'Lisa', 'Ica', 'Ta', 'Con', 'Jon']);
const fpPairs = [];
for (const a of firsts) for (const b of lasts) if (F.bad(a + ' ' + b)) fpPairs.push(a + ' ' + b);
check(firsts.length * lasts.length + ' parejas «nombre apellido»: ninguna salta', fpPairs.length === 0, fpPairs.slice(0, 20));
const fpN = [];
for (const a of firsts) for (const b of firsts.slice(0, 120)) if (F.bad(a + ' ' + b)) fpN.push(a + ' ' + b);
check('parejas de nombres de pila: ninguna salta', fpN.length === 0, fpN.slice(0, 20));
check('«Jugador» y 4 cifras no salta nunca', Array.from({ length: 9000 }, (_, i) => 'Jugador ' + (1000 + i)).every(n => !F.bad(n)));

/* ---------- 3) mask y nombre anónimo ---------- */
console.log('\nNombre anónimo y máscara');
check('mask: «Jugador NNNN», igual para el mismo uid', /^Jugador [1-9]\d{3}$/.test(F.mask('puta', 'uidX')) && F.mask('puta', 'uidX') === F.mask('otro', 'uidX'));
check('shown: deja los nombres normales y tapa los insultos', F.shown('Ana', 'u1') === 'Ana' && /^Jugador \d{4}$/.test(F.shown('gilipollas', 'u1')) && F.shown('', 'u1') === '');
{
  const ls = fakeStorage(), N = load(['js/netroom.js', 'js/namefilter.js'], ls).VB.NameFilter;
  const a = N.anonName(), b = N.anonName();
  check('anonName: «Jugador NNNN» y el mismo cada vez', /^Jugador [1-9]\d{3}$/.test(a) && a === b, a);
  check('…guardado en make-the-cut.anon (del aparato)', ls.getItem('make-the-cut.anon') === a.slice(8));
  const N2 = load(['js/netroom.js', 'js/namefilter.js'], ls).VB.NameFilter;
  check('…y el mismo al recargar', N2.anonName() === a);
  ls.setItem('make-the-cut.anon', 'basura');
  check('un valor roto se rehace', /^Jugador [1-9]\d{3}$/.test(load(['js/namefilter.js'], ls).VB.NameFilter.anonName()));
  check('nick(): sin apodo, vacío', N.nick() === '');
  ls.setItem('make-the-cut.nick', 'Bea');
  check('nick(): el apodo escrito', N.nick() === 'Bea');
  ls.setItem('make-the-cut.nick', 'gilipollas');
  check('nick(): un apodo guardado con insultos no vale', N.nick() === '');
  ls.setItem('make-the-cut.nick', 'a@b.es');
  check('nick(): nada con @', N.nick() === '');
  check('MSG = «Ese nombre no vale: elige otro.»', N.MSG === 'Ese nombre no vale: elige otro.');
  // paso de 1.22.0: un apodo igual al personaje o al usuario de la cuenta (guardado sin querer al pulsar «Guardar») se borra
  const mig = (init, extra) => { const l = fakeStorage(init), c = load(['js/netroom.js', 'js/namefilter.js'], l); Object.assign(c.VB, extra || {}); return { l, N: c.VB.NameFilter }; };
  const acc = u => ({ Account: { netInfo: () => ({ uid: 'u1', kind: 'user', user: u }) } });
  const car = n => ({ Career: { beach: { get: () => ({ player: { name: n } }) }, hall: { get: () => null } } });
  { const { l, N } = mig({ 'make-the-cut.nick': 'pepe_99' }, acc('Pepe_99'));
    check('paso 1.22.0: apodo = usuario de la cuenta → se borra y vuelve el anónimo', N.nick() === '' && l.getItem('make-the-cut.nick') === null && l.getItem('make-the-cut.nickv') === '1'); }
  { const { l, N } = mig({ 'make-the-cut.nick': 'Lola Mar' }, car('Lola Mar'));
    check('paso 1.22.0: apodo = personaje de la Carrera → se borra', N.nick() === '' && l.getItem('make-the-cut.nick') === null); }
  { const { l, N } = mig({ 'make-the-cut.nick': 'Bea Ruiz' }, Object.assign(acc('pepe'), car('Lola')));
    check('paso 1.22.0: un apodo distinto se queda y se marca', N.nick() === 'Bea Ruiz' && l.getItem('make-the-cut.nickv') === '1'); }
  { const { l, N } = mig({ 'make-the-cut.nick': 'Bea Ruiz' });
    check('paso 1.22.0: sin cuenta abierta no se marca (se vuelve a mirar al entrar)', N.nick() === 'Bea Ruiz' && l.getItem('make-the-cut.nickv') === null); }
  { const { l, N } = mig({ 'make-the-cut.nick': 'pepe', 'make-the-cut.nickv': '1' }, acc('pepe'));
    check('paso 1.22.0: con la marca ya puesta no toca nada (lo escribiste tú después)', N.nick() === 'pepe' && l.getItem('make-the-cut.nick') === 'pepe'); }
  // sin localStorage: no rompe, un número para la página
  const ctx = load([], null); ctx.localStorage = undefined; vm.runInContext(rd('js/namefilter.js'), ctx);
  const n0 = ctx.VB.NameFilter.anonName();
  check('sin almacenamiento: también «Jugador NNNN» y estable en la página', /^Jugador \d{4}$/.test(n0) && ctx.VB.NameFilter.anonName() === n0);
}

/* ---------- 4) por donde pasan los nombres ---------- */
console.log('\nSalas, saludo, récord y enlace de la semana');
(async () => {
  // salas (netroom): lo que se lee de Firestore sale tapado; lo que se escribe, como lo escribió cada uno
  {
    const ctx = load(['js/netroom.js', 'js/namefilter.js']), NR = ctx.VB.NetRoom, VBF = ctx.VB.NameFilter;
    const ts = new Date().toISOString(), S = v => ({ stringValue: v });
    const docOf = (id, name, gname, guest) => ({ name: 'projects/p/databases/(default)/documents/rooms/' + id, updateTime: ts,
      fields: { code: S('K7P2QX'), name: S(name), gname: S(gname), host: S(id), guest: S(guest), fmt: S('2v2'), venue: S('beach'), map: S('x'), even: { booleanValue: false }, bo: { integerValue: '1' }, pts: { integerValue: '21' }, state: S('open'), v: S('1|x'), seen: { timestampValue: ts } } });
    const rows = [{ document: docOf('h1', 'Ana', '', ''), readTime: ts }, { document: docOf('h2', 'Hijo de puta', '', ''), readTime: ts }];
    const r = NR.create({ base: 'http://x/v1/projects/p/databases/(default)/documents', ver: '1|x', auth: async () => ({ uid: 'me', token: 't' }),
      fetch: async (url) => ({ ok: true, status: 200, text: async () => JSON.stringify(/:runQuery$/.test(url) ? rows : docOf('h3', 'Bea', 'mierda', 'g3')) }) });
    const L = await r.list();
    const a = L.find(x => x.id === 'h1'), b = L.find(x => x.id === 'h2');
    check('salas: un nombre normal sale tal cual', a && a.name === 'Ana', a && a.name);
    check('salas: un anfitrión con insultos sale como «Jugador NNNN» (de su uid)', b && b.name === VBF.mask('x', 'h2'), b && b.name);
    const g = await r.get('h3');
    check('salas: el invitado con insultos también (de su uid)', g && g.name === 'Bea' && g.gname === VBF.mask('x', 'g3'), g && g.gname);
  }
  // saludo (net.js y netfluid.js): cleanName tapa
  {
    const ctx = load(['js/namefilter.js', 'js/net.js']);
    const c1 = ctx.VB.Net.cleanName;
    check('saludo (net.js): normal tal cual, insulto tapado', c1('Ana') === 'Ana' && /^Jugador \d{4}$/.test(c1('puta')) && c1('a') === '', [c1('Ana'), c1('puta')]);
    const src = rd('js/netfluid.js');
    check('saludo (netfluid.js): cleanName pasa por VB.NameFilter.shown', /function cleanName\(n\) \{[\s\S]{0,700}F\.shown\(s\)/.test(src));
  }
  // récord online (netrec.js): los nombres guardados también
  {
    const ls = fakeStorage({ 'make-the-cut.online': JSON.stringify({ v: 1, wins: 1, losses: 1, last: [{ n: 'Ana', w: 1, t: 1 }, { n: 'cabrón', w: 0, t: 2 }] }) });
    const ctx = load(['js/namefilter.js', 'js/netrec.js'], ls), R = ctx.VB.NetRec;
    const last = R.get ? R.get().last : null;
    check('récord online: los rivales guardados con insultos salen tapados', last && last[0].n === 'Ana' && /^Jugador \d{4}$/.test(last[1].n), last);
  }
  // enlace de la semana (semana.js): tu nombre por defecto es el anónimo; los recibidos con insultos, tapados
  {
    const ls = fakeStorage();
    const ctx = load(['js/retos.js', 'js/matchstats.js', 'js/netroom.js', 'js/namefilter.js', 'js/semana.js'], ls), S = ctx.VB.Semana, N = ctx.VB.NameFilter;
    S._now(20261123);
    check('semana: sin apodo, tu nombre es el anónimo del online («Jugador_NNNN»)', S.myName() === N.anonName().replace(' ', '_'), [S.myName(), N.anonName()]);
    ls.setItem('make-the-cut.nick', 'Bea Ruiz');
    check('semana: con apodo, el apodo', S.myName() === 'Bea_Ruiz', S.myName());
    ls.setItem('make-the-cut.nick', 'Gilipollas');
    check('semana: un apodo con insultos no se usa', S.myName() === N.anonName().replace(' ', '_'), S.myName());
    check('semana: un nombre recibido con insultos sale como «Jugador_NNNN»', /^Jugador_\d{4}$/.test(S.cleanName('Hijoputa')) && S.cleanName('Ana') === 'Ana', S.cleanName('Hijoputa'));
  }
  // lobby (DOM: se mira el código)
  {
    const lob = rd('js/netlobby.js');
    const def = lob.slice(lob.indexOf('function defaultName()'), lob.indexOf('function sanAttrs('));
    check('lobby: el nombre por defecto ya no sale de la Carrera ni de la cuenta', def.length > 0 && !/careerPlayer|netInfo|inf\.user/.test(def) && /anonName\(\)/.test(def));
    check('lobby: myName usa el apodo solo si no lleva insultos', /function myName\(\) \{[\s\S]{0,300}F\.bad\(n\)/.test(lob));
    check('lobby: al guardar un nombre con insultos, «Ese nombre no vale: elige otro.» (VB.NameFilter.MSG)', /if \(F && F\.bad\(n\)\) \{ L\.msg = F\.MSG;/.test(lob));
    check('lobby: myName y typedName pasan por migrateNick; guardar un nombre pone la marca nickv', (lob.match(/F\.migrateNick\(\)/g) || []).length >= 2 && /ls\(NICK, n\); if \(F && F\.NICKV\) ls\(F\.NICKV, '1'\)/.test(lob));
    check('lobby: guardar vacío vuelve al anónimo', /String\(v \|\| ''\)\.trim\(\)\) \{ ls\(NICK, null\)/.test(lob));
    check('lobby: los nombres del rival (sala, «pre», vuelta) pasan por theirName', (lob.match(/theirName\(/g) || []).length >= 7 && !/NR\(\)\.cleanName\((r\.gname|r\.name|pre\.name|b\.rival)\)/.test(lob));
    check('lobby: el campo empieza con lo que escribiste y enseña el anónimo de fondo', (lob.match(/value="' \+ esc\(typedName\(\)\) \+ '" placeholder="' \+ esc\(defaultName\(\)\)/g) || []).length === 2);
    const idx = rd('index.html');
    check('index.html carga js/namefilter.js antes de js/net.js', idx.indexOf('js/namefilter.js') > 0 && idx.indexOf('js/namefilter.js') < idx.indexOf('js/net.js'));
    const acc = rd('js/account.js');
    check('make-the-cut.anon es del aparato (account.js lo dice; nunca en DOCS)', /'make-the-cut\.anon'/.test(acc) && !/DOCS\['make-the-cut\.anon'\]/.test(acc));
  }
  console.log('\n' + (fails ? '== nametest: ' + fails + ' FALLOS (' + oks + ' ok) ==' : '== nametest OK (' + oks + ' comprobaciones) =='));
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log(e && e.stack || e); process.exit(1); });
