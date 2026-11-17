#!/usr/bin/env node
/* MAKE THE CUT — tools/looktest.js (owner: ui_main)
 * Pruebas del Vestuario (js/look.js, VB.Look). Dos partes:
 *  1) SIN navegador (siempre): js/look.js en vm, sin THREE ni DOM, con un localStorage falso:
 *     catálogo (ids únicos y con formato, ranura, sede, rareza, desbloqueos, ids de la especificación), CLASH con ids que existen,
 *     logros y premios que existen en career-life.js y ejercicios que existen en gym.js, defaults = MY_LOOKS de players.js, sane()
 *     con basura y su ida y vuelta, cada choque arreglado por fix() (ok() da true después) con sus avisos, firmas estables (un
 *     color que solo va en el atlas no cambia geoSig), fromSeed determinista y solo con objetos de inicio, matchLooks, mergeRaw,
 *     grant / unseen / wearable / checkGlobal con el guardado falso, guardado < 8 KB, precios, textos de lockText.
 *     Sprint 2-4 (T9): tipos de desbloqueo boss, reto, retoN, semana, dias, lvl y chem (meets, lockText, checkGlobal y orígenes
 *     retos / hito / boss), 8 premios por nivel sin quitar ninguna alternativa (contra js/look.js del Vestuario original, 928ac39), objetos de jefe,
 *     bossItems / bossFit, drawId (pieza base mientras doll.js no sepa la variante) y el contrato D4 (.bak + lost(), solo lectura).
 *     T21 (--gl): los 5 objetos de jefe con dibujo propio en doll.js y los mismos triángulos que su pieza base.
 *  2) --gl (tools/cdp.js): abre ?debug=look&looktest=1, comprueba que VB.Look del navegador firma igual que el de node y llama a
 *     VB.Doll.lookSelfTest() si existe (si aún no existe lo dice sin fallar; STRICT=1: fallo). Errores JS de la página = fallo.
 * Uso: node tools/looktest.js [--gl]        Escribe «TODO OK» al final si todo pasa; sale con 1 si falla algo.
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
const GL = process.argv.includes('--gl');
let fail = 0, warn = 0;
const check = (c, m) => { if (!c) { fail++; console.error('FALLO:', m); } else console.log('ok:', m); return !!c; };
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
setTimeout(() => { console.error('TIEMPO AGOTADO'); process.exit(2); }, 10 * 60e3).unref();

const SRC = fs.readFileSync(path.join(ROOT, 'js', 'look.js'), 'utf8');
/** look.js en un contexto nuevo con su propio localStorage falso (writes = escrituras de 'make-the-cut.look'). */
function sandbox(extra) {
  const store = {}, io = { writes: 0 };
  const localStorage = {
    getItem: k => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); if (k === 'make-the-cut.look') io.writes++; },
    removeItem: k => { delete store[k]; }
  };
  const VB = Object.assign({}, extra || {});
  const window = { VB, localStorage };
  vm.runInNewContext(SRC, { window, VB, console });
  return { L: VB.Look, VB, store, io };
}

// ---------------------------------------------------------------- 1) sin navegador
console.log('== look.js (node) ==');
const { L, store, io, VB } = sandbox();
check(L && typeof L.resolve === 'function', 'VB.Look cargado en vm sin THREE ni DOM');
const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
check(!/Math\.random|g\.rng|THREE|document\./.test(CODE),'look.js no usa Math.random, g.rng, THREE ni el DOM');
check(!/localStorage\.(get|set|remove)Item/.test(SRC.replace(/try \{[^}]*localStorage\.(get|set|remove)Item[^}]*\}/g, '')), 'localStorage siempre dentro de try');

// --- firmas de la API (§3)
const API = ['item', 'name', 'stars', 'lockText', 'defaults', 'sane', 'fix', 'ok', 'resolve', 'geoSig', 'atlasSig', 'sig', 'fromSeed', 'random',
  'load', 'fit', 'setFit', 'owned', 'grant', 'wearable', 'unseen', 'markSeen', 'checkGlobal', 'matchLooks', 'mergeRaw'];
check(API.every(k => typeof L[k] === 'function') && L.V === 1, 'API completa de §3 (' + API.length + ' funciones) y V = 1');
check(eq(L.SLOTS, ['head', 'eyes', 'paint', 'marks', 'beard', 'neck', 'under', 'band', 'armL', 'armR', 'elbows', 'wristL', 'wristR', 'hands', 'legs', 'knees', 'socks', 'ankle', 'shoes']), 'SLOTS en el orden de §3');

// --- catálogo
const C = L.CATALOG, IDRE = /^[a-z][a-zA-Z0-9]{1,15}$/;
const ids = C.map(x => x.id);
check(new Set(ids).size === ids.length, 'ids únicos (' + ids.length + ')');
check(ids.every(id => IDRE.test(id)), 'ids con el formato ^[a-z][a-zA-Z0-9]{1,15}$');
check(L.PALETTE.every(p => IDRE.test(p.id) && (!ids.includes(p.id) || p.id === 'dorado')), 'fichas de PALETTE con formato y sin chocar con objetos (salvo dorado, que se gana)');
const SLOTX = L.SLOTS.concat(['style', 'hairTint', 'color']);
check(C.every(x => x.slots.length && x.slots.every(s => SLOTX.includes(s)) && x.slot === x.slots[0]), 'cada objeto con ranura válida');
check(C.every(x => ['P', 'Y', 'A'].includes(x.venue)), 'cada objeto con sede válida (P, Y, A)');
check(C.every(x => x.rarity >= 0 && x.rarity <= 3 && L.stars(x.id).length === 4 && L.stars(x.id).replace(/☆/g, '').length === x.rarity + 1), 'rareza 0-3 y estrellas');
const KINDS = ['start', 'shop', 'fame', 'ach', 'award', 'gym', 'gymN', 'rec', 'boss', 'reto', 'retoN', 'semana', 'dias', 'lvl', 'chem', 'online'];   // (online: la gorra «Online Beta Tester», fase 3 del online)
check(C.every(x => Array.isArray(x.unlock) && x.unlock.length && x.unlock.every(u => Object.keys(u).length === 1 && KINDS.includes(Object.keys(u)[0]))), 'desbloqueos con formato (una clave conocida por alternativa)');
check(C.every(x => Array.isArray(x.tris) && x.tris.length === 3 && x.tris[0] <= x.tris[1] && x.tris[1] <= x.tris[2]), 'tris [LOD0, LOD1, LOD2] crecientes');
check(C.every(x => typeof x.geo === 'boolean' && typeof x.hint === 'string' && x.name && !/·|1\.er|2\.º/.test(x.name + x.hint)), 'geo booleano, hint y nombres sin «·»');
check(C.filter(x => x.tris[2] > 0).every(x => x.geo), 'lo que suma triángulos cambia la malla (geo)');
check(C.filter(x => ['paint', 'marks', 'beard', 'band', 'legs', 'socks'].includes(x.slot) && x.id !== 'mallaLarga').every(x => !x.geo), 'pintura, marcas, barba, brazalete, malla corta y calcetines solo van en el atlas');
check(['licra', 'mallaLarga'].every(id => L.item(id).geo && L.item(id).vc === 'B'), 'licra y malla larga cambian la malla (bola del hombro / de la rodilla en cB, color por vértice)');
check(C.every(x => Object.isFrozen(x)), 'objetos del catálogo congelados');

// ids de la especificación (§1.2 y §1.3), por ranura
const SPEC = {
  style: 'tupe coleta afro flequillo rapado mono trenzas dosmonos coletas cresta',
  head: 'cinta cintaRizo bandana gorra gorraAtras visera pescador corona gorraMTC',   // (gorraMTC: online, fase 3)
  eyes: 'frente pasta oscuras deporte espejo', paint: 'zinc rayas rayasEq estrella', marks: 'pecas tirita tiraNasal', beard: 'bigote perilla tresDias',
  neck: 'medalla conchas', under: 'termica licra', band: 'capitan', legs: 'malla mallaLarga',
  armL: 'manguito manguitoRayas manguitoCuadros manguitoLlamas manguitoRayos manguitoOro kinesio manguitoMazo', elbows: 'coderas',
  wristL: 'muneq reloj munhCanon', hands: 'dedos mitones dedosMuro', knees: 'cortas altas bajadas rodiPulpo', socks: 'tobilleros media altos altosRayas desparejados',
  ankle: 'blanca tela pulseraTob escarpines tobiPulpo', shoes: 'clasicas negras neon doradas',
  hairTint: 'tAzul tRosa tVerde tMorado tTurquesa tDorado', color: 'dorado'
};
let specOk = true;
Object.keys(SPEC).forEach(s => { const want = SPEC[s].split(' ').sort().join(), got = C.filter(x => x.slot === s).map(x => x.id).sort().join(); if (want !== got) { specOk = false; console.error('  ranura ' + s + ': ' + got + ' (esperado ' + want + ')'); } });
check(specOk, 'el catálogo tiene exactamente los ids de la especificación por ranura');
check(eq(L.items('armR'), L.items('armL')) && eq(L.items('wristR'), L.items('wristL')), 'manguitos y muñecas valen en los dos lados');
check(L.STYLES.length === 10 && L.TINTS.length === 6 && L.SKINS.length === 14 && L.HAIRS.length === 15, '10 peinados, 6 tintes, 14 pieles y 15 colores de pelo');
// sede (§1.4.1)
const ONLY_Y = 'gorra gorraAtras visera pescador frente oscuras espejo zinc conchas licra mitones tela pulseraTob escarpines tobiPulpo'.split(' ');
const ONLY_P = ['termica', 'bajadas', 'blanca', 'rodiPulpo', 'cortas', 'altas', 'coderas'].concat(SPEC.armL.split(' ').filter(x => x !== 'kinesio')).concat(SPEC.socks.split(' '), SPEC.shoes.split(' '));
check(C.filter(x => x.venue === 'Y').map(x => x.id).sort().join() === ONLY_Y.slice().sort().join(), 'solo en playa: la lista de §1.4');
check(C.filter(x => x.venue === 'P').map(x => x.id).sort().join() === ONLY_P.slice().sort().join(), 'solo en pista: la lista de §1.4');
// CLASH
check(L.CLASH.length >= 5 && L.CLASH.every(r => [r.a, r.b].every(sd => sd.ids.length && sd.ids.every(id => L.item(id) && L.item(id).slots.includes(sd.slot)))) && L.CLASH.every(r => r.why && r.why.a && r.why.b), 'cada regla de CLASH con ids que existen en su ranura y con su texto');
// logros, premios y ejercicios
const CLT = fs.readFileSync(path.join(ROOT, 'js', 'career-life.js'), 'utf8');
const clIds = new Set(); let mm; const re = /\bid:\s*'([a-zA-Z0-9]+)'/g; while ((mm = re.exec(CLT))) clIds.add(mm[1]);
const achUsed = [], awUsed = [], gymUsed = [];
C.concat(L.PALETTE.filter(p => p.unlock)).forEach(x => (x.unlock || []).forEach(u => { if (u.ach) achUsed.push(u.ach); if (u.award) awUsed.push(u.award); if (u.gym) gymUsed.push(u.gym.id); }));
check(achUsed.length && achUsed.every(id => clIds.has(id)), 'cada logro existe en career-life.js (' + Array.from(new Set(achUsed)).join(', ') + ')');
check(awUsed.length && awUsed.every(id => /\{ id: 'mvp'/.test(CLT) && clIds.has(id)), 'cada premio existe en career-life.js (' + Array.from(new Set(awUsed)).join(', ') + ')');
const GYMT = fs.readFileSync(path.join(ROOT, 'js', 'gym.js'), 'utf8'), gymIds = (/var IDS = \[([^\]]*)\]/.exec(GYMT) || [, ''])[1];
check(gymUsed.length && gymUsed.every(id => gymIds.indexOf("'" + id + "'") >= 0), 'cada ejercicio del Entrenamiento existe en gym.js');
const TIERS_N = (/var TIERS = \[(.*)\];/.exec(CLT) || [, ''])[1].split('], [').length;
check(C.every(x => x.unlock.every(u => u.fame == null || (u.fame >= 1 && u.fame < TIERS_N))) && L.PALETTE.every(p => !p.unlock || p.unlock.every(u => u.fame == null || u.fame < TIERS_N)), 'escalones de fama dentro de TIERS (' + TIERS_N + ')');

// --- defaults = MY_LOOKS de players.js
const PL = fs.readFileSync(path.join(ROOT, 'js', 'players.js'), 'utf8');
const myl = []; const reM = /\{ skin: (0x[0-9a-f]+), hair: (0x[0-9a-f]+), style: '(\w+)', acc: '(\w*)', accB: '(\w*)'/g; while ((mm = reM.exec(PL))) myl.push({ skin: +mm[1], hair: +mm[2], style: mm[3], acc: mm[4], accB: mm[5] });
check(myl.length === 2, 'MY_LOOKS leído de players.js');
[0, 1].forEach(i => {
  const h = L.resolve(L.defaults(i), 'hall', null), b = L.resolve(L.defaults(i), 'beach', null), m = myl[i] || {};
  check(h.skin === m.skin && h.hair === m.hair && h.style === m.style && h.acc === m.acc && b.acc === m.accB && b.skin === m.skin,
    'defaults(' + i + ') resuelve a MY_LOOKS[' + i + '] (' + m.style + ', ' + (m.acc || 'sin gorro') + ' / ' + m.accB + ')');
});
const arr = name => (new RegExp('var ' + name + ' = \\[([^\\]]*)\\]').exec(PL) || [, ''])[1].split(',').map(s => s.trim()).filter(Boolean);
check(eq(L.SKINS.slice(0, 10), arr('SKINS').map(Number)) && eq(L.HAIRS.slice(0, 10), arr('HAIRS').map(Number)) && eq(L.STYLES.slice(0, 7), arr('STYLES').map(s => s.replace(/'/g, ''))), 'SKINS, HAIRS y STYLES empiezan por los de players.js (mismo orden)');
const d0 = L.defaults(0);
check(d0.hall.knees === 'cortas' && d0.hall.socks === 'media' && d0.hall.ankle === 'blanca' && d0.hall.shoes === 'clasicas' && d0.beach.head === 'gorra' && d0.beach.paint === 'zinc' && d0.beach.ankle === 'tela' && Object.keys(d0.colors).every(k => d0.colors[k] === 'auto'), 'defaults(0) como §2.1');
check(L.ok(L.defaults(0)) && L.ok(L.defaults(1)) && eq(L.sane(L.defaults(1), 1), L.defaults(1)), 'los valores por defecto cumplen las reglas y sane no los cambia');

// --- resolve
const TC = { base: 0x1144aa, accent: 0xffcc00, dark: 0x0a1a33, shorts: 0x111111, pad: 0x1d1f26 };
{
  const f = L.defaults(0); f.colors = { acc: 'eq', acc2: 'ac', sock: 'os', shoe: 'rojo', glass: 'bl' }; f.hair = 'tAzul';
  const R = L.resolve(f, 'hall', TC);
  const KEYS = 'skin hair style acc eyes paint marks beard neck under band armL armR elbows wristL wristR hands legs knees socks ankle shoes cA cB cSock cShoe cGlass'.split(' ');
  check(Object.isFrozen(R) && eq(Object.keys(R).sort(), KEYS.slice().sort()) && !('h' in R), 'resolve: L congelado, con los campos de §2.2 y sin h');
  check(R.cA === TC.base && R.cB === TC.accent && R.cSock === TC.dark && R.cShoe === 0xe0383e && R.cGlass === 0xf4f4f4 && R.hair === 0x3a6cf0, 'resolve: fichas eq/ac/os, paleta, blanco y tinte a hex');
  const R0 = L.resolve(L.defaults(0), 'beach');
  check(R0.cA === -1 && R0.cB === -1 && R0.paint === 'zinc' && R0.acc === 'gorra' && R0.shoes === '', 'resolve: auto = -1; playa con zinc y gorra, descalzo');
  f.colors.acc = 'ne'; check(L.resolve(f, 'hall', TC).cA === 0x22222a, 'resolve: ne = 0x22222a (no negro puro)');
  check(L.resolve(f, 'hall', null).cB === -1, 'resolve: sin equipación, las fichas del equipo valen auto');
}

// --- sane con basura
const JUNK = [null, undefined, 5, 'x', [], [1, 2], true, () => 1, { skin: 'red', hair: {}, style: 7, hall: 'x', beach: [1], colors: null },
  { v: 99, skin: 0x123456, hair: -1, style: 'calvo', hall: { head: 5 }, beach: null, colors: { acc: 'fucsia', glass: 3 } }, { hall: null, beach: { foo: 'bar' } }];
[0, 1].forEach(i => check(JUNK.every(j => eq(L.sane(j, i), L.defaults(i))), 'sane() con basura, null o tipos raros da defaults(' + i + ')'));
{
  const s = L.sane({ style: 'tupe', hall: { head: 'gorra', armL: 'reloj', socks: 'altos', shoes: 'neon' }, beach: { socks: 'media', shoes: 'clasicas', head: 'pescador' }, colors: { acc: 'rojo', acc2: 'fucsia' } }, 1);
  check(s.hall.head === 'cinta' && s.hall.armL === '' && s.hall.socks === 'altos' && s.hall.shoes === 'neon' && s.beach.socks === '' && s.beach.shoes === '' && s.beach.head === 'pescador' && s.colors.acc === 'rojo' && s.colors.acc2 === 'auto',
    'sane(): id de otra ranura o sede vuelve al valor por defecto de la ranura; lo bueno se queda');
  check(L.sane({ hair: 'tAzul' }).hair === 'tAzul' && L.sane({ hair: 'tazul' }).hair === L.defaults(0).hair && L.sane({ skin: 0x5a3626 }).skin === 0x5a3626, 'sane(): tintes por id y pieles nuevas');
  check(L.sane({ style: 'afro', beach: { head: 'pescador' } }).beach.head === '' && L.ok(L.sane({ style: 'afro', beach: { head: 'pescador' } })), 'sane(): aplica las compatibilidades');
  check(L.sane({ hall: { head: 'corona' } }).hall.head === 'corona', 'sane() no quita lo bloqueado');
}
// ida y vuelta
{
  let ok = true;
  const many = [L.defaults(0), L.defaults(1)];
  for (let n = 0; n < 150; n++) { many.push(L.fromSeed(n)); many.push(L.random(n * 7919 + 1, false)); }
  many.forEach(f => { const a = L.sane(f, 0), b = L.sane(JSON.parse(JSON.stringify(a)), 0); if (!eq(a, b) || !L.ok(a)) ok = false; });
  check(ok, 'ida y vuelta de sane (JSON incluido) en ' + many.length + ' fits, todos ok()');
}

// --- fix: cada choque se arregla y ok() da true
function F(o) { const f = L.defaults(0); if (o.style) f.style = o.style; ['hall', 'beach'].forEach(v => Object.assign(f[v], o[v] || {})); return f; }
function fixed(f, ven, ch, msg, label) {
  const r = L.fix(f, ven, ch);
  const good = L.ok(r.fit) && r.removed.length >= 1 && (!msg || r.removed.some(x => x.msg === msg)) && r.removed.every(x => /^Quitado: /.test(x.msg) && x.why && x.slot && x.id);
  if (!good) console.error('  ', JSON.stringify(r.removed));
  return check(good, label + (msg ? ' → «' + msg + '»' : ''));
}
check(!L.ok(F({ beach: { head: 'cinta', eyes: 'frente' } }), 'beach') && L.ok(F({ beach: { head: 'gorraAtras', eyes: 'frente' } })) && L.ok(F({ beach: { head: '', eyes: 'frente' } })), 'ok(): frente solo sin gorro o con la gorra al revés');
fixed(F({ beach: { head: 'gorra', eyes: 'frente' } }), 'beach', 'head', 'Quitado: Gafas en la frente (no caben con ese gorro)', 'frente + gorra (cambia el gorro)');
fixed(F({ beach: { head: 'visera', eyes: 'frente' } }), 'beach', 'eyes', 'Quitado: Visera (no cabe con las gafas en la frente)', 'frente + visera (cambian las gafas)');
fixed(F({ style: 'afro', beach: { head: 'pescador' } }), 'beach', 'style', 'Quitado: Gorro de pescador (no cabe con el afro)', 'afro + pescador');
fixed(F({ style: 'afro', hall: { head: 'bandana' } }), 'hall', 'head', 'Quitado: Afro (no cabe con el pañuelo)', 'afro + pañuelo (cambia el gorro)');
fixed(F({ style: 'mono', hall: { head: 'corona' } }), 'hall', 'style', 'Quitado: Coronita (no cabe con el moño)', 'coronita + moño');
fixed(F({ style: 'cresta', beach: { head: 'corona' } }), 'beach', 'head', 'Quitado: Cresta (no cabe con la coronita)', 'coronita + cresta (cambia el gorro)');
fixed(F({ style: 'dosmonos', hall: { head: 'cintaRizo' } }), 'hall', 'style', 'Quitado: Cinta de rizo (no cabe con los dos moños)', 'dos moños + cinta de rizo');
fixed(F({ style: 'dosmonos', hall: { head: 'corona' } }), 'hall', 'head', 'Quitado: Dos moños (no caben con la coronita)', 'dos moños + coronita (cambia el gorro)');
fixed(F({ style: 'coletas', hall: { head: 'bandana' } }), 'hall', 'head', 'Quitado: Coletas (no caben con el pañuelo)', 'coletas + pañuelo (cambia el gorro)');
fixed(F({ style: 'coletas', hall: { head: 'bandana' } }), 'hall', 'style', 'Quitado: Pañuelo (no cabe con las coletas)', 'coletas + pañuelo (cambia el peinado)');
fixed(F({ hall: { head: 'gorra', paint: 'zinc', shoes: 'clasicas' } }), 'hall', null, 'Quitado: Gorra (solo en playa)', 'sede: gorra en pista');
fixed(F({ beach: { shoes: 'clasicas', socks: 'media', under: 'termica' } }), 'beach', null, 'Quitado: Zapatillas (solo en pista)', 'sede: zapatillas en playa');
{
  const r = L.fix(F({ hall: { ankle: 'tela', shoes: 'neon' } }), 'hall');
  check(r.fit.hall.ankle === 'blanca' && r.fit.hall.shoes === 'neon' && r.removed.length === 1, 'sede: lo quitado en pista vuelve a la tobillera de siempre, no se queda descalzo');
  const g = L.fix(F({ style: 'afro', hall: { head: 'bandana' }, beach: { head: 'pescador' } }), null, 'style');
  check(g.fit.hall.head === '' && g.fit.beach.head === '' && g.fit.style === 'afro' && L.ok(g.fit), 'sin sede: arregla las dos (el peinado manda si cambió)');
  const a = L.fix(F({ style: 'afro', hall: { head: 'bandana' }, beach: { head: 'bandana' } }), null, 'head');
  check(a.fit.style === 'tupe' && a.removed.length === 1, 'un peinado quitado por los dos gorros se avisa una vez y vuelve a tupé');
  const keep = F({ hall: { under: 'termica', armL: 'manguitoLlamas', band: 'capitan', wristL: 'reloj' }, beach: { eyes: 'oscuras', paint: 'rayas', marks: 'pecas', head: 'gorra' } });
  check(L.fix(keep, null, 'armL').removed.length === 0 && L.ok(keep), 'combinaciones permitidas (manguito sobre térmica, brazalete sobre manguito, reloj con manguito, gafas pintadas con pintura)');
  const before = JSON.stringify(keep); L.fix(keep, 'hall', 'head'); check(JSON.stringify(keep) === before, 'fix no toca el fit que recibe');
}
{ // exhaustivo: cualquier gorro × peinado × gafas, en las dos sedes y cambiando cualquiera de las tres ranuras
  let bad = 0, n = 0;
  L.STYLES.forEach(st => L.items('head').concat(['']).forEach(hd => [''].concat(L.items('eyes')).forEach(ey => ['hall', 'beach'].forEach(ven => [null, 'head', 'eyes', 'style'].forEach(ch => {
    const f = L.defaults(0); f.style = st; f[ven].head = hd; f[ven].eyes = ey; n++;
    const r = L.fix(f, ven, ch);
    if (!L.ok(r.fit, ven) || (ch && ch !== 'style' && r.fit[ven][ch] !== f[ven][ch] && L.item(f[ven][ch]) && L.item(f[ven][ch]).venue !== (ven === 'beach' ? 'P' : 'Y'))) bad++;
  })))));
  check(bad === 0, 'fix + ok en ' + n + ' combinaciones de gorro, peinado y gafas (lo que acabas de elegir se queda si vale en esa sede)');
}

// --- firmas
{
  const f = F({ hall: { paint: 'rayas', armL: 'kinesio' } });
  const shuffled = JSON.parse(JSON.stringify({ colors: f.colors, beach: f.beach, hall: f.hall, style: f.style, hair: f.hair, skin: f.skin, v: 1 }));
  check(L.sig(f) === L.sig(shuffled) && /^[0-9a-f]{8}$/.test(L.sig(f)) && L.sig(null) === '', 'sig: corta (8 hex), estable y sin depender del orden de las claves');
  check(L.geoSig(f, 'hall') === L.geoSig(shuffled, 'hall') && L.atlasSig(f, 'hall', TC) === L.atlasSig(shuffled, 'hall', Object.assign({}, TC)), 'geoSig y atlasSig estables');
  const c = JSON.parse(JSON.stringify(f)); c.colors.acc = 'rojo'; c.colors.acc2 = 'azul'; c.colors.sock = 'verde';
  check(L.geoSig(c, 'hall') === L.geoSig(f, 'hall') && L.atlasSig(c, 'hall', TC) !== L.atlasSig(f, 'hall', TC) && L.sig(c) !== L.sig(f), 'un cambio de color no altera geoSig (sí atlasSig y sig)');
  const p = JSON.parse(JSON.stringify(f)); p.hall.paint = 'estrella'; p.hall.marks = 'tirita'; p.hall.beard = 'bigote'; p.hall.socks = 'altosRayas'; p.hall.legs = 'malla'; p.hall.band = 'capitan';
  check(L.geoSig(p, 'hall') === L.geoSig(f, 'hall') && L.atlasSig(p, 'hall', TC) !== L.atlasSig(f, 'hall', TC), 'pintura, marcas, barba, calcetines, mallas y brazalete: solo atlasSig');
  const g = JSON.parse(JSON.stringify(f)); g.hall.head = 'cinta';
  check(L.geoSig(g, 'hall') !== L.geoSig(f, 'hall') && L.geoSig(f, 'hall') !== L.geoSig(f, 'beach'), 'gorro y sede cambian geoSig');
  check(L.geoSig(f, 'hall') === L.geoSig(f, 'hall') && L.atlasSig(f, 'hall', TC) !== L.atlasSig(f, 'hall', Object.assign({}, TC, { base: 0x00ff00 })) && L.geoSig(f, 'hall') === L.geoSig(f, 'hall'), 'otra equipación cambia atlasSig, no geoSig');
  const v = JSON.parse(JSON.stringify(f)); v.hall.elbows = 'coderas'; const v2 = JSON.parse(JSON.stringify(v)); v2.colors.acc = 'rosa';
  check(L.geoSig(v2, 'hall') !== L.geoSig(v, 'hall'), 'el color de una pieza con color por vértice (coderas en cA) sí cambia geoSig');
  const s = JSON.parse(JSON.stringify(f)); s.skin = 0x5a3626; check(L.geoSig(s, 'hall') !== L.geoSig(f, 'hall'), 'la piel cambia geoSig (va por vértice y en el atlas)');
}

// --- fromSeed y random
{
  let det = true, start = true, okAll = true; const styles = new Set();
  for (let n = 0; n < 300; n++) {
    const a = L.fromSeed(n), b = L.fromSeed(n);
    if (!eq(a, b)) det = false;
    if (!L.ok(a)) okAll = false;
    styles.add(a.style);
    const vals = [a.style, a.hair].concat(L.SLOTS.map(s => a.hall[s]), L.SLOTS.map(s => a.beach[s]), L.COLOR_KEYS.map(k => a.colors[k]));
    if (!vals.every(v => L.isStart(v))) start = false;
  }
  check(det, 'fromSeed determinista (300 semillas)');
  check(start && okAll, 'fromSeed: solo objetos de inicio y siempre ok()');
  check(styles.size >= 6 && L.fromSeed(L.hashStr('Ana')).style !== undefined && L.hashStr('Ana') === L.hashStr('Ana') && L.hashStr('Ana') !== L.hashStr('Ane'), 'fromSeed variado (' + styles.size + ' peinados) y hashStr estable');
  check(eq(L.random(123456789, false), L.random(123456789, false)) && !eq(L.random(1, false), L.random(2, false)), 'random: misma semilla, mismo fit');
}

// --- matchLooks
{
  const fit = L.fromSeed(9);
  check(eq(L.matchLooks({ watch: true }), [null, null]), 'matchLooks: 6v6 espectador = [null, null]');
  check(eq(L.matchLooks({ career: true, hall: true, look: null, mate: null }), [null, null]), 'matchLooks: Carrera de pista sin look (guardado antiguo) = [null, null]');
  check(eq(L.matchLooks({ career: true, hall: true, look: fit, mate: 'Ana' }), [L.sane(fit, 0), null]), 'matchLooks: Carrera de pista con look = [look, null]');
  const cb = L.matchLooks({ career: true, hall: false, look: null, mate: 'Leire Ortiz' });
  check(eq(cb[0], L.fit(0)) && eq(cb[1], L.fromSeed(L.hashStr('Leire Ortiz'))), 'matchLooks: Carrera de playa = [look || fits[0], fromSeed(hashStr(compañero))]');
  check(eq(L.matchLooks({}), [L.fit(0), L.fit(1)]) && eq(L.matchLooks({ six: true }), [L.fit(0), null]) && eq(L.matchLooks(), [L.fit(0), L.fit(1)]), 'matchLooks: Partido rápido = [fits[0], fits[1]]; 6v6 rápido = [fits[0], null]');
}

// --- guardado: grant, unseen, wearable, checkGlobal
{
  check(io.writes === 0 && !('make-the-cut.look' in store), 'leer (load, fit, owned, matchLooks) no escribe nada');
  check(L.owned('') && L.owned('tupe') && L.owned('gorra') && L.owned('rojo') && L.owned('auto') && L.owned(0x3a2416) && !L.owned('pescador') && !L.owned('dorado') && !L.owned('tAzul'), 'owned: lo de inicio sí, lo que se gana no');
  check(L.grant('tupe', 'tienda') === false && L.grant('noexiste', 'tienda') === false && io.writes === 0, 'grant de algo de inicio o inexistente: false y sin escribir');
  check(L.grant('pescador', 'tienda') === true && L.grant('pescador', 'tienda') === false && L.owned('pescador') && io.writes === 1, 'grant: true la primera vez, false la segunda; una escritura');
  const st = JSON.parse(store['make-the-cut.look']);
  check(st.v === 1 && st.own.pescador.s === 'tienda' && st.own.pescador.t > 0 && Array.isArray(st.fits) && st.fits.length === 2, 'guardado con v, fits y own {s, t}');
  check(eq(L.unseen(), ['pescador']), 'unseen: lo nuevo');
  L.grant('tAzul', 'carrera'); L.grant('dorado', 'carrera');
  check(eq(L.unseen(), ['tAzul', 'dorado']) || eq(L.unseen(), ['pescador', 'tAzul', 'dorado']), 'unseen en el orden del catálogo');
  L.markSeen(['pescador', 'tAzul']); check(eq(L.unseen(), ['dorado']), 'markSeen');
  const saved = L.defaults(0); saved.beach.head = 'visera';
  const work = L.defaults(0); work.hall.head = 'corona'; work.beach.head = 'pescador'; work.hair = 'tRosa'; work.colors.acc = 'dorado'; work.hall.armR = 'manguitoOro'; work.style = 'cresta';
  const w = L.wearable(work, saved);
  check(w.hall.head === '' && w.beach.head === 'pescador' && w.hair === saved.hair && w.colors.acc === 'dorado' && w.hall.armR === '' && w.style === 'tupe', 'wearable: lo bloqueado vuelve a lo guardado; lo que tienes se queda');
  check(L.locked(work).map(x => x.id).sort().join() === 'corona,cresta,manguitoOro,tRosa', 'locked: lista lo bloqueado');
  const s1 = L.setFit(1, Object.assign(L.defaults(1), { style: 'rapado' }));
  check(s1.style === 'rapado' && L.fit(1).style === 'rapado' && L.load().ft > 0 && eq(L.fit(0), L.defaults(0)), 'setFit guarda el n.º 2 y apunta la fecha');
  // checkGlobal
  const got = L.checkGlobal({ gym: { serve: 1, recv: 0, set: 0, atk: 0, block: 3 }, gymN: 5, rec: { wins: 10, played: 1, streak: 5 } });
  check(['bandana', 'cresta', 'cintaRizo', 'kinesio', 'manguitoRayos', 'dedos', 'tMorado', 'desparejados'].every(id => got.includes(id)) && !got.includes('manguitoLlamas') && !got.includes('reloj') && !got.includes('corona'), 'checkGlobal concede lo del Entrenamiento y del récord: ' + got.join(', '));
  check(eq(L.checkGlobal({ gym: { serve: 3 }, gymN: 5, rec: { wins: 10, played: 1, streak: 5 } }), ['manguitoLlamas']) && eq(L.checkGlobal({ gym: { serve: 3 }, gymN: 5, rec: { wins: 10, played: 1, streak: 5 } }), []), 'checkGlobal: solo lo nuevo, y nada la segunda vez');
  const so = JSON.parse(store['make-the-cut.look']).own;
  check(so.kinesio.s === 'record' && so.manguitoRayos.s === 'gym', 'checkGlobal: origen record / gym');
  // sin datos: lee VB.Gym y 'make-the-cut.record'
  const sb = sandbox({ Gym: { get: id => (id === 'recv' ? { m: 1 } : null), count: () => 1 } });
  sb.store['make-the-cut.record'] = JSON.stringify({ played: 120, wins: 26, bestStreak: 2 });
  const g2 = sb.L.checkGlobal();
  check(['deporte', 'rayasEq', 'bajadas', 'tirita', 'kinesio', 'cintaRizo'].every(id => g2.includes(id)) && !g2.includes('reloj') && !g2.includes('desparejados'), 'checkGlobal() sin datos lee VB.Gym y make-the-cut.record: ' + g2.join(', '));
  check(eq(sandbox().L.checkGlobal(), []), 'checkGlobal() sin Entrenamiento ni récord: nada');
  // tamaño
  const big = sandbox();
  big.L.CATALOG.forEach(x => big.L.grant(x.id, 'carrera')); big.L.markSeen(big.L.CATALOG.map(x => x.id));
  big.L.setFit(0, big.L.random(77, false)); big.L.setFit(1, big.L.random(78, false));
  const len = big.store['make-the-cut.look'].length;
  check(len < 8192, 'el guardado con todo ganado ocupa ' + len + ' B (< 8 KB)');
  // guardado roto
  const br = sandbox(); br.store['make-the-cut.look'] = '{roto'; check(eq(br.L.fit(0), br.L.defaults(0)) && br.L.unseen().length === 0, 'guardado roto: valores por defecto sin romper');
  br.store['make-the-cut.look'] = JSON.stringify({ v: 7, fits: ['x', { style: 'afro', hall: { head: 'gorra' } }], own: { pescador: { s: 'robado', t: 'ayer' }, tupe: { s: 'tienda', t: 1 }, nada: {} }, seen: { nada: 1 } });
  const b1 = br.L.load();
  check(eq(b1.fits[0], br.L.defaults(0)) && b1.fits[1].style === 'afro' && b1.fits[1].hall.head === 'cinta' && eq(Object.keys(b1.own), ['pescador']) && b1.own.pescador.s === 'carrera' && eq(b1.seen, {}), 'guardado dañado: sane campo a campo (lo irreparable a los valores por defecto)');
  // sin localStorage
  const nols = {}; const VBn = {}; vm.runInNewContext(SRC, { window: { VB: VBn, get localStorage() { throw new Error('bloqueado'); } }, VB: VBn });
  check(eq(VBn.Look.fit(0), VBn.Look.defaults(0)) && VBn.Look.grant('pescador', 'tienda') === false && VBn.Look.unseen().length === 0, 'sin localStorage (bloqueado) no rompe nada');
}

// --- mergeRaw
{
  const A = { v: 1, ft: 100, fits: [L.fromSeed(1), L.fromSeed(2)], own: { pescador: { s: 'tienda', t: 50 }, tAzul: { s: 'carrera', t: 70 } }, seen: { pescador: 1 } };
  const B = { v: 1, ft: 200, fits: [L.fromSeed(3), L.fromSeed(4)], own: { pescador: { s: 'carrera', t: 30 }, corona: { s: 'carrera', t: 90 } }, seen: { corona: 1 } };
  const m = JSON.parse(L.mergeRaw(JSON.stringify(A), JSON.stringify(B)));
  check(eq(Object.keys(m.own).sort(), ['corona', 'pescador', 'tAzul']) && m.own.pescador.t === 30 && m.own.pescador.s === 'carrera' && m.seen.pescador && m.seen.corona, 'mergeRaw une own (gana la t mínima) y seen sin perder nada');
  check(eq(m.fits[0], L.sane(B.fits[0], 0)) && m.ft === 200, 'mergeRaw: fits del lado más reciente');
  const m2 = JSON.parse(L.mergeRaw(JSON.stringify(B), JSON.stringify(A)));
  check(eq(m2.fits[1], L.sane(B.fits[1], 1)) && eq(Object.keys(m2.own).sort(), ['corona', 'pescador', 'tAzul']), 'mergeRaw simétrico en own; fits del más reciente en los dos sentidos');
  check(eq(JSON.parse(L.mergeRaw(JSON.stringify(A), JSON.stringify(B), false)).fits[0], L.sane(A.fits[0], 0)), 'mergeRaw: remoteNewer manda si se pasa');
  const at = L.mergeRaw(JSON.stringify(A), JSON.stringify(A));
  check(eq(JSON.parse(at).own, A.own) && L.mergeRaw(at, at) === at, 'mergeRaw de un guardado consigo mismo devuelve el local tal cual');
  check(L.mergeRaw(JSON.stringify(A), '{roto') === JSON.stringify(A) && JSON.parse(L.mergeRaw(null, JSON.stringify(B))).own.corona, 'mergeRaw con un lado roto o vacío');
}

// --- precios y textos
{
  const shopIt = C.filter(x => L.price(x.id) > 0);
  check(shopIt.filter(x => L.price(x.id) < 1500).length >= 4, 'al menos 4 objetos de tienda por debajo de 1.500 € (' + shopIt.filter(x => L.price(x.id) < 1500).map(x => x.id).join(', ') + ')');
  const lux = C.filter(x => x.lux);
  check(lux.length === 3 && lux.every(x => L.price(x.id) >= 40000 && L.price(x.id) <= 60000 && x.rarity === 3), '3 objetos de lujo entre 40.000 y 60.000 € (' + lux.map(x => x.id + ' ' + L.price(x.id)).join(', ') + ')');
  const band = [[500, 1200], [3000, 8000], [15000, 20000], [40000, 60000]];
  check(shopIt.every(x => { const p = L.price(x.id), b = band[x.lux ? 3 : x.rarity]; return p >= b[0] && p <= b[1]; }), 'precios por rareza (común 500-1.200, rara 3.000-8.000, épica 15.000-20.000, lujo 40.000-60.000)');
  check(L.lockText('manguitoCuadros') === 'Tienda de la Carrera: 6.000 €', 'lockText: «Tienda de la Carrera: 6.000 €»');
  // (fame = índice de TIERS de career-life.js, contra tierIdx(fameMax): 4 Estrella, 5 Ídolo, 6 Leyenda viva)
  check(L.lockText('estrella') === 'Fama: Ídolo o Tienda de la Carrera: 20.000 € o Reto: Rodillo (oro)' && L.lockText('estrella', true).indexOf('Fama: Ídolo de la grada') === 0 && L.lockText('capitan').indexOf('Fama: Estrella') === 0,'lockText: «' + L.lockText('estrella') + '»');
  check(L.lockText('dedos') === 'Logro: b50 (50 bloqueos punto) o Entrenamiento: medalla en Bloqueo', 'lockText sin la Carrera cargada enseña el id: «' + L.lockText('dedos') + '»');
  check(L.lockText('manguitoLlamas').indexOf('Entrenamiento: oro en Saque') > 0 && L.lockText('cresta') === 'Tienda de la Carrera: 3.000 € o Entrenamiento: 3 medallas', 'lockText: oro en Saque; 3 medallas');
  check(L.lockText('kinesio').endsWith('Récord: 1 partido') && L.lockText('rayasEq').indexOf('Récord: 25 victorias') > 0 && L.lockText('desparejados').endsWith('Récord: racha de 5 victorias'), 'lockText: récords');
  check(L.lockText('doradas').indexOf('Premio: MVP') >= 0 && L.lockText('tupe') === '' && L.lockText('deporte').indexOf('Fama: Conocido en el circuito') === 0 && L.lockText('deporte', true).indexOf('Fama: Conocido en la liga') === 0, 'lockText: premio, inicio vacío, fama por modo');
  const names = { m50: ['Veterano de la arena', 'Veterano del parqué'], b50: ['Muralla'], top: ['En la élite'] };
  const sc = sandbox({ CareerLife: { achName: (id, hall) => (names[id] ? (hall && names[id][1]) || names[id][0] : id), TIERS: [[0, 'Desconocido'], [500, 'Promesa local'], [2000, 'Conocido en el circuito', 'Conocido en la liga'], [7000, 'Figura'], [20000, 'Estrella'], [50000, 'Ídolo', 'Ídolo de la grada'], [120000, 'Leyenda viva']] } });
  check(sc.L.lockText('tirita', true) === 'Logro: Veterano del parqué (50 partidos) o Récord: 50 partidos' && sc.L.lockText('tirita', false).indexOf('Logro: Veterano de la arena (50 partidos)') === 0, 'lockText con VB.CareerLife.achName: nombre de pista (nh) en pista');
  check(sc.L.lockText('capitan', true) === 'Fama: Estrella o Logro: En la élite (una liga de élite)', 'lockText: «' + sc.L.lockText('capitan', true) + '»');
  const all = C.map(x => L.lockText(x.id) + L.lockText(x.id, true) + x.name + L.name(x.id)).join('|');
  check(!/·|1\.er|2\.º|undefined|NaN/.test(all), 'textos sin «·», sin ordinales con punto y sin undefined');
  check(L.name('', 'head') === 'Sin gorro' && L.name('rojo') === 'Rojo' && L.name('auto') === 'Automático' && L.name(0xd8d4cc) === 'Canas' && /^Tono \d+$/.test(L.name(0x5a3626, 'skin')) && L.name('cintaRizo') === 'Cinta de rizo', 'name: objetos, «nada», fichas, colores de pelo y tonos de piel');
  check(L.stars('corona') === '★★★★' && L.stars('pasta') === '★☆☆☆' && L.rarityLabel('espejo') === 'Rareza: 3 de 4', 'estrellas y aria-label de la rareza');
  check(L.choices('head', 'hall')[0] === '' && !L.choices('head', 'hall').includes('gorra') && L.choices('head', 'beach').includes('gorra') && L.choices('shoes', 'beach').length === 1 && L.choices('acc').length === 6 + 10 && L.choices('hair').length === 21 && L.choices('skin').length === 14, 'choices: filas de la UI por sede (lo que no vale en esa sede no sale)');
  check(L.HIDE_HAIR.join() === 'gorra,gorraAtras,pescador,gorraMTC', 'HIDE_HAIR: gorra, gorra al revés, pescador y la gorra «MTC» del online');
}
// sin tocar VB ajeno
check(Object.keys(VB).join() === 'Look', 'look.js solo publica VB.Look');

// ---------------------------------------------------------------- sprint 2-4 (T9): tipos nuevos, jefes, premios por nivel, D4
console.log('== sprint 2-4 (T9) ==');
{
  const S = sandbox();
  const X = S.L;
  check(['retos', 'hito', 'boss'].every(k => X.SRCS.includes(k)) && X.SRCS.slice(0, 4).join() === 'carrera,tienda,gym,record', 'SRCS += retos, hito y boss (los de antes, en su sitio)');
  // meets: cada tipo nuevo
  check(X.meets('munhCanon', { boss: { saque: true } }) && !X.meets('munhCanon', { boss: { muro: true } }) && !X.meets('munhCanon', { boss: 'saque' }) && !X.meets('munhCanon', {}), 'meets {boss}: solo con ese estilo derrotado');
  check(X.meets('bandana', { reto: { r_aces: 2 } }) && X.meets('bandana', { reto: { r_aces: 3 } }) && !X.meets('bandana', { reto: { r_aces: 1 } }) && !X.meets('bandana', { reto: { r_kills: 3 } }), 'meets {reto:{id, m}}: nivel ≥ m en ese reto');
  check(X.meets('tTurquesa', { retoN: 30 }) && !X.meets('tTurquesa', { retoN: 29 }), 'meets {retoN}');
  check(X.meets('tVerde', { dias: 7 }) && !X.meets('tVerde', { dias: 6 }), 'meets {dias}');
  check(X.meets('manguitoRayas', { lvl: 8 }) && X.meets('manguitoRayas', { lvl: 30 }) && !X.meets('manguitoRayas', { lvl: 7 }) && !X.meets('manguitoRayas', { lvl: '9' }), 'meets {lvl}: número ≥ N');
  check(X.meets('rayasEq', { chem: 3 }) && !X.meets('rayasEq', { chem: 2 }), 'meets {chem:3}');
  // {semana} queda soportado aunque el torneo esté cortado (ningún objeto lo usa todavía)
  check(X.unlockText({ semana: 1 }) === 'Torneo de la semana: 1 ganado' && X.unlockText({ semana: 5 }) === 'Torneo de la semana: 5 ganados' && !C.some(x => x.unlock.some(u => u.semana)), 'unlockText {semana} listo; ningún objeto lo usa (torneo cortado)');
  // textos
  check(X.lockText('munhCanon') === 'Jefe: gana a un Cañón' && X.lockText('dedosMuro') === 'Jefe: gana a un Muro' && X.lockText('manguitoMazo') === 'Jefe: gana a un Martillo' && X.lockText('rodiPulpo') === 'Jefe: gana a un Pulpo' && X.lockText('tobiPulpo') === 'Jefe: gana a un Pulpo', 'lockText jefe: «' + X.lockText('dedosMuro') + '»');
  check(X.lockText('bandana').endsWith(' o Reto: Lluvia de aces (plata)') && X.lockText('deporte').endsWith('Reto: Pase al dedo (plata)'), 'lockText reto: «' + X.lockText('bandana') + '»');
  check(X.lockText('tTurquesa').endsWith('Retos: 30 medallas') && X.lockText('tVerde').endsWith('Reto del día: 7 oros'), 'lockText retoN / dias: «' + X.lockText('tTurquesa') + '», «' + X.lockText('tVerde') + '»');
  check(X.lockText('manguitoRayas') === 'Tienda de la Carrera: 1.200 € o Perfil: Nv 8' && X.lockText('tAzul') === 'Tienda de la Carrera: 1.200 € o Perfil: Nv 10', 'lockText lvl: «' + X.lockText('tAzul') + '»');
  check(X.lockText('rayasEq').endsWith('Química: Pareja de oro') && X.lockText('rayasEq', true).endsWith('Química: Equipo de oro'), 'lockText chem por modo: «' + X.lockText('rayasEq', true) + '»');
  const S2 = sandbox({ Retos: { BY: { r_aces: { name: 'Aces a mansalva' } } }, CareerLife: { CHEM_LV: [[0, 'a'], [30, 'b'], [60, 'c'], [90, 'Dúo de oro']], CHEM_LV6: ['a', 'b', 'c', 'Bloque de oro'] } });
  check(S2.L.lockText('bandana').endsWith('Reto: Aces a mansalva (plata)') && S2.L.lockText('rayasEq').endsWith('Química: Dúo de oro') && S2.L.lockText('rayasEq', true).endsWith('Química: Bloque de oro'), 'lockText lee los nombres de VB.Retos.BY y VB.CareerLife.CHEM_LV/CHEM_LV6');
  const allT = C.map(x => X.lockText(x.id) + X.lockText(x.id, true)).join('|');
  check(!/·|1\.er|undefined|NaN|null/.test(allT), 'textos nuevos sin «·», «1.er», undefined ni null');

  // premios por nivel: 8, de la tabla de S4-D2 §2.3, siempre como alternativa
  const D2 = { tiraNasal: 2, altosRayas: 3, conchas: 4, oscuras: 5, mallaLarga: 6, manguitoRayas: 8, tAzul: 10, tRosa: 12, mitones: 14, escarpines: 16, pescador: 18, licra: 20, tVerde: 22, manguitoCuadros: 24, neon: 28, manguitoOro: 40, tDorado: 50 };
  const P = X.LVL_PRIZES;
  check(P.length === 8 && P.every(e => D2[e.id] === e.lvl) && P.every((e, i) => !i || P[i - 1].lvl < e.lvl), '8 premios por nivel de la tabla de S4-D2 (Nv ' + P.map(e => e.lvl + ' ' + e.id).join(', ') + ')');
  check(P.every(e => X.item(e.id).unlock.length >= 2 && X.price(e.id) > 0) && !P.some(e => ['doradas', 'corona', 'medalla', 'capitan'].includes(e.id) || X.item(e.id).lux), 'cada premio por nivel se sigue vendiendo en la tienda; nada de lujo ni doradas, corona, medalla o brazalete');
  check(X.lvlPrize(8) === 'manguitoRayas' && X.lvlPrize(9) === '' && Object.isFrozen(P), 'lvlPrize(8) = manguitoRayas, lvlPrize(9) vacío; tabla congelada');
  // sin quitar ninguna alternativa: comparado con look.js del Vestuario original (commit 928ac39; LOOK_BASE=<rev> para otro). No con
  // HEAD: desde que el sprint 2-4 está en commits (WIP de la ola 1b), HEAD ya trae los premios y la comparación salía 80 → 80
  const LOOK_BASE = process.env.LOOK_BASE || '928ac39';
  let head = null;
  try { head = require('child_process').execSync('git show ' + LOOK_BASE + ':js/look.js', { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); } catch (e) { head = null; }
  if (head && /CATALOG/.test(head)) {
    const VBh = {}; vm.runInNewContext(head, { window: { VB: VBh, localStorage: { getItem: () => null, setItem() { }, removeItem() { } } }, VB: VBh });
    const H = VBh.Look;
    let lostAlt = [];
    H.CATALOG.forEach(o => { const n = X.item(o.id); if (!n) { lostAlt.push(o.id + ' (falta)'); return; } o.unlock.forEach(u => { if (!n.unlock.some(v => eq(v, u))) lostAlt.push(o.id + ' ' + JSON.stringify(u)); }); });
    const added = C.filter(x => H.item(x.id)).map(x => x.unlock.length - H.item(x.id).unlock.length).reduce((a, b) => a + b, 0);
    check(!lostAlt.length, 'ningún objeto pierde una alternativa de las de ' + LOOK_BASE + (lostAlt.length ? ': ' + lostAlt.join(', ') : ''));
    check(added === 8 + 5 + 1 && C.length === H.CATALOG.length + 6, 'alternativas añadidas: 8 de nivel, 5 de retos, 1 de química; 6 objetos nuevos (5 + la gorra del online; ' + H.CATALOG.length + ' → ' + C.length + ')');
    check(H.CATALOG.every(o => X.isStart(o.id) === H.isStart(o.id) && X.price(o.id) === H.price(o.id) && X.item(o.id).rarity === o.rarity), 'inicio, precios y rarezas de siempre');
  } else console.log('AVISO: sin js/look.js en ' + LOOK_BASE + ': comparación de alternativas saltada');

  // objetos de jefe
  const BI = { saque: ['munhCanon'], muro: ['dedosMuro'], remate: ['manguitoMazo'], defensa: ['rodiPulpo', 'tobiPulpo'] };
  check(eq(X.BOSS_STYLES, ['saque', 'muro', 'remate', 'defensa']) && X.BOSS_STYLES.every(st => eq(X.bossItems(st), BI[st])) && eq(X.bossItems('nada'), []), 'bossItems: un objeto por estilo (defensa: pista y playa)');
  const bossIds = [].concat(...Object.values(BI));
  check(bossIds.every(id => { const it = X.item(id); return it.rarity === 2 && it.unlock.length === 1 && it.unlock[0].boss && it.as && X.item(it.as) && it.as !== id && it.slots.every(s => X.item(it.as).slots.includes(s)) && X.price(id) === 0; }), 'objetos de jefe: rareza 2, solo {boss}, sin tienda, con pieza base en la misma ranura');
  check(X.item('munhCanon').venue === 'A' && X.item('dedosMuro').venue === 'A' && X.item('manguitoMazo').venue === 'P' && X.item('rodiPulpo').venue === 'P' && X.item('tobiPulpo').venue === 'Y', 'sedes: muñequera y dedos en las dos; manguito (como todos) y rodilleras de pulpo en pista; tobillera en playa');
  // drawId / resolve: sin doll.js la pieza base; si doll.js sabe la variante, la variante
  const fb = X.defaults(0); fb.hall.wristR = 'munhCanon'; fb.hall.knees = 'rodiPulpo'; fb.hall.armL = 'manguitoMazo'; fb.beach.ankle = 'tobiPulpo'; fb.beach.hands = 'dedosMuro';
  const Rh = X.resolve(fb, 'hall'), Rb = X.resolve(fb, 'beach');
  check(Rh.wristR === 'muneq' && Rh.knees === 'altas' && Rh.armL === 'manguito' && Rb.ankle === 'tela' && Rb.hands === 'dedos', 'resolve sin doll.js: cada objeto de jefe sale como su pieza base');
  const SD = sandbox({ Doll: { ITEMS: { wristR: { muneq: 'A', munhCanon: 'A' }, knees: { altas: 'A' } } } });
  const Rd = SD.L.resolve(fb, 'hall');
  check(Rd.wristR === 'munhCanon' && Rd.knees === 'altas', 'resolve con VB.Doll.ITEMS: la variante si doll.js la sabe dibujar, la base si no');
  check(X.geoSig(fb, 'hall') !== X.geoSig(X.defaults(0), 'hall') && X.sig(fb) !== X.sig(Object.assign(X.defaults(0))), 'un objeto de jefe cambia las firmas');
  // bossFit
  let bfOk = true;
  X.BOSS_STYLES.forEach(st => {
    for (let n = 0; n < 60; n++) {
      const a = X.bossFit(st, n * 7919), b = X.bossFit(st, n * 7919);
      if (!eq(a, b) || !X.ok(a)) bfOk = false;
      const vals = [].concat(X.SLOTS.map(s => a.hall[s]), X.SLOTS.map(s => a.beach[s]));
      BI[st].forEach(id => { const it = X.item(id); ['hall', 'beach'].forEach(v => { if ((it.venue === 'A' || it.venue === (v === 'beach' ? 'Y' : 'P')) && !X.SLOTS.some(s => a[v][s] === id)) bfOk = false; }); });
      if (vals.some(v => v && !X.isStart(v) && !BI[st].includes(v))) bfOk = false;
    }
  });
  check(bfOk, 'bossFit: determinista, ok(), con su objeto en cada sede donde vale y el resto de inicio (4 estilos × 60 semillas)');
  check(eq(X.bossFit('muro', 'Belmonte'), X.bossFit('muro', X.hashStr('Belmonte'))) && eq(X.bossFit('nada', 5), X.fromSeed(5)) && !eq(X.bossFit('muro', 5), X.bossFit('saque', 5)), 'bossFit: texto = hashStr(texto); estilo desconocido = fromSeed');
  check(X.bossFit('remate', 3).hall.armR === 'manguitoMazo' && X.bossFit('saque', 3).beach.wristR === 'munhCanon' && X.bossFit('muro', 3).beach.hands === 'dedosMuro' && X.bossFit('defensa', 3).hall.knees === 'rodiPulpo' && X.bossFit('defensa', 3).beach.ankle === 'tobiPulpo', 'bossFit: manguito y muñequera en la derecha, dedos, rodilleras en pista y tobillera en playa');

  // checkGlobal: nivel → hito; retos → retos; jefe y química nunca
  const G = sandbox();
  const g1 = G.L.checkGlobal({ lvl: 8, boss: { saque: true }, chem: 3 });
  check(eq(g1.slice().sort(), ['conchas', 'mallaLarga', 'manguitoRayas', 'tiraNasal']), 'checkGlobal({lvl:8}) da los premios hasta el Nv 8: ' + g1.join(', '));
  const so = JSON.parse(G.store['make-the-cut.look']).own;
  check(Object.keys(so).every(id => so[id].s === 'hito') && !G.L.owned('munhCanon') && !G.L.owned('rayasEq'), 'origen hito; jefe y química no se dan fuera de la Carrera');
  check(eq(G.L.checkGlobal({ lvl: 8 }), []) && eq(G.L.checkGlobal({ lvl: 28 }).sort(), ['licra', 'mitones', 'neon', 'tAzul']), 'checkGlobal por nivel: nada la segunda vez; luego lo que falta hasta el Nv 28');
  const g2 = G.L.checkGlobal({ reto: { r_aces: 2, r_recv: 1, r_streak: 3 }, retoN: 30, dias: 7 });
  const so2 = JSON.parse(G.store['make-the-cut.look']).own;
  check(eq(g2.slice().sort(), ['bandana', 'estrella', 'tTurquesa', 'tVerde']) && g2.every(id => so2[id].s === 'retos'), 'checkGlobal con retos (origen retos): ' + g2.join(', '));
  // sin datos: lee VB.Profile.level() y VB.Retos.lookData()
  const GP = sandbox({ Profile: { level: () => ({ lvl: 4 }) }, Retos: { lookData: () => ({ reto: { r_recv: 2 }, retoN: 3, dias: 7, semana: 0 }) } });
  const g3 = GP.L.checkGlobal();
  check(eq(g3.slice().sort(), ['conchas', 'deporte', 'tVerde', 'tiraNasal']), 'checkGlobal() sin datos lee VB.Profile.level() y VB.Retos.lookData(): ' + g3.join(', '));
  const GR = sandbox({ Retos: { lookData: () => { throw new Error('x'); } }, Profile: { level: () => null } });
  check(eq(GR.L.checkGlobal({ retos: { total: 30, daysGold: 0 } }), ['tTurquesa']), 'checkGlobal con retos: summary() (total) y módulos que fallan no rompen');
  // grant con los orígenes nuevos
  const GG = sandbox();
  check(GG.L.grant('munhCanon', 'boss') && GG.L.grant('rayasEq', 'carrera') && GG.L.grant('tAzul', 'hito') && JSON.parse(GG.store['make-the-cut.look']).own.munhCanon.s === 'boss' && GG.L.load().own.tAzul.s === 'hito', 'grant con origen boss / hito se guarda tal cual');
  const mOld = JSON.parse(GG.L.mergeRaw(JSON.stringify({ v: 1, own: { tAzul: { s: 'hito', t: 5 } } }), JSON.stringify({ v: 1, own: { munhCanon: { s: 'boss', t: 7 } } })));
  check(mOld.own.tAzul.s === 'hito' && mOld.own.munhCanon.s === 'boss', 'mergeRaw conserva los orígenes nuevos');

  // contrato D4: dañado → .bak + lost(); versión más nueva → solo lectura
  ['{roto', '[1,2]', '"texto"', '7'].forEach(bad => {
    const B = sandbox(); B.store['make-the-cut.look'] = bad;
    const f0 = B.L.fit(0);
    check(eq(f0, B.L.defaults(0)) && B.store['make-the-cut.look.bak'] === bad && !('make-the-cut.look' in B.store) && B.L.lost() === true && B.L.readOnly() === false, 'dañado ' + JSON.stringify(bad) + ': copia en make-the-cut.look.bak, se borra y lost()');
    check(B.L.grant('pescador', 'tienda') === true && JSON.parse(B.store['make-the-cut.look']).own.pescador && B.store['make-the-cut.look.bak'] === bad && B.L.lost() === true, 'tras un dañado se vuelve a guardar y la copia se queda');
  });
  const N = sandbox(); N.store['make-the-cut.look'] = JSON.stringify({ v: 1, own: {} });
  check(N.L.lost() === false && N.L.readOnly() === false && !('make-the-cut.look.bak' in N.store), 'guardado sano: ni lost() ni solo lectura ni .bak');
  const RO = sandbox(); const v2 = JSON.stringify({ v: 2, fits: [{ style: 'afro' }], own: { pescador: { s: 'tienda', t: 9 } }, extra: { nuevo: 1 } });
  RO.store['make-the-cut.look'] = v2; RO.io.writes = 0;
  check(RO.L.readOnly() === true && RO.L.lost() === false && RO.L.owned('pescador') && RO.L.fit(0).style === 'afro', 'v:2: solo lectura, se lee saneado en memoria');
  check(RO.L.grant('corona', 'carrera') === false && (RO.L.setFit(0, RO.L.defaults(0)), true) && RO.L.markSeen(['pescador']) === true && RO.io.writes === 0 && RO.store['make-the-cut.look'] === v2, 'v:2: grant, setFit y markSeen no escriben nada');
  const v1 = JSON.stringify({ v: 1, ft: 999, own: { tAzul: { s: 'tienda', t: 3 } } });
  check(RO.L.mergeRaw(v1, v2) === v2 && RO.L.mergeRaw(v2, v1) === v2 && RO.L.mergeRaw(null, v2) === v2 && RO.L.mergeRaw(v2, JSON.stringify({ v: 3 })) === JSON.stringify({ v: 3 }), 'mergeRaw: gana entera la de mayor v y nunca la rebaja');
  RO.store['make-the-cut.look'] = v1;
  check(RO.L.readOnly() === false && RO.L.grant('corona', 'carrera') === true, 'si vuelve un guardado v1, se puede escribir otra vez');
  check(Object.keys(S.VB).join() === 'Look', 'look.js sigue publicando solo VB.Look');
}

// ---------------------------------------------------------------- 2) con navegador
async function browser() {
  const CDP = require('./cdp.js');
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const waitFor = async (pg, expr, ms) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await pg.evalJs(expr)) return true; } catch (e) { } await sleep(150); } return false; };
  const NOINTRO = `(function(){try{localStorage.setItem('make-the-cut.guided','{"done":true}');localStorage.setItem('make-the-cut.install','1')}catch(e){}})();`;
  const strict = process.env.STRICT === '1';
  const soft = m => { if (strict) check(false, m); else { warn++; console.log('AVISO: ' + m); } };
  let pg;
  try {
    pg = await CDP.open({ size: '1280x720', init: [NOINTRO] });
    await pg.navigate('debug=look&looktest=1&nonews=1');
    await waitFor(pg, 'window.VB&&VB.ctx&&VB.ctx.state', 20000);
    await sleep(1500);
    const has = await pg.evalJs('!!(window.VB&&VB.Look)');
    if (!has) {   // index.html aún sin js/look.js: se inyecta para probar al menos el módulo en el navegador
      soft('el navegador no carga js/look.js (falta en index.html): se inyecta a mano para seguir');
      await pg.evalJs(SRC + '\n;true');
      if (!(await pg.evalJs('!!(window.VB&&VB.Look)'))) { check(false, 'look.js inyectado no publica VB.Look'); return; }
    }
    const f = L.fromSeed(42), want = [L.sig(f), L.geoSig(f, 'beach'), L.atlasSig(f, 'hall', TC), L.CATALOG.length].join();
    const got = await pg.evalJs(`(function(){var L=VB.Look,f=L.fromSeed(42),tc=${JSON.stringify(TC)};return [L.sig(f),L.geoSig(f,'beach'),L.atlasSig(f,'hall',tc),L.CATALOG.length].join();})()`);
    check(got === want, 'VB.Look del navegador firma igual que el de node (' + got + ')');
    const hasST = await pg.evalJs('!!(VB.Doll&&typeof VB.Doll.lookSelfTest==="function")');
    if (!hasST) soft('VB.Doll.lookSelfTest() aún no existe (doll.js): autoprueba de la malla saltada');
    else {
      const r = await pg.evalJs(`Promise.resolve().then(function(){return VB.Doll.lookSelfTest();}).then(function(r){return JSON.stringify(r===undefined?null:r);},function(e){return JSON.stringify({ok:false,fails:['excepción: '+(e&&e.message||e)]});})`, true);
      let res = null; try { res = JSON.parse(r); } catch (e) { res = r; }
      const lines = res && typeof res === 'object' ? [].concat(res.log || [], res.lines || []) : [];
      lines.forEach(l => console.log('  ' + l));
      const fails = res && typeof res === 'object' && !Array.isArray(res) ? [].concat(res.fails || [], res.errors || []) : Array.isArray(res) ? res : [];
      fails.forEach(l => console.error('  FALLO doll: ' + (typeof l === 'string' ? l : JSON.stringify(l))));
      const okST = res === true || (Array.isArray(res) && !res.length) || (res && typeof res === 'object' && !Array.isArray(res) && (res.ok === true || (res.ok == null && !fails.length)));
      check(okST, 'VB.Doll.lookSelfTest()' + (res && typeof res === 'object' && res.summary ? ': ' + res.summary : ''));
    }
    // T21: los 5 objetos de jefe tienen dibujo propio en doll.js (drawId ya no cae a «as») con los MISMOS triángulos que su base
    const BOSS5 = [['wristR', 'munhCanon', 'muneq', 0], ['hands', 'dedosMuro', 'dedos', 1], ['armR', 'manguitoMazo', 'manguito', 0], ['knees', 'rodiPulpo', 'altas', 0], ['ankle', 'tobiPulpo', 'tela', 1]];
    const bt = JSON.parse(await pg.evalJs(`(function(){var P=VB.Doll.preview,i=P.info(),out=[];if(!i)return '[]';var L0=i.rig.look,o0={beach:i.beach};
      ${JSON.stringify(BOSS5)}.forEach(function(b){var o={beach:!!b[3]},La=Object.assign({},L0),Lb=Object.assign({},L0);La[b[0]]=b[2];Lb[b[0]]=b[1];
        P.set(La,o);var ta=P.info().tris,ga=P.info().geo;P.set(Lb,o);var tb=P.info().tris,gb=P.info().geo;
        out.push([b[1],VB.Look.drawId(b[0],b[1]),ta,tb,ga!==gb]);});P.set(L0,o0);return JSON.stringify(out);})()`, true));
    check(bt.length === 5 && bt.every(x => x[1] === x[0]), 'objetos de jefe con dibujo propio en doll.js: ' + bt.map(x => x[0] + '→' + x[1]).join(', '));
    check(bt.length === 5 && bt.every(x => x[2] === x[3] && x[4]), 'objetos de jefe: mismos triángulos que su pieza base y malla propia (' + bt.map(x => x[0] + ' ' + x[3]).join(', ') + ')');
    const errs = pg.errors.filter(e => !/favicon/i.test(String(e)));
    check(!errs.length, 'sin errores JS en la página' + (errs.length ? ': ' + errs.slice(0, 5).join(' | ') : ''));
  } catch (e) {
    check(false, 'navegador: ' + (e && e.message || e));
  } finally { if (pg) pg.close(); }
}

(async () => {
  if (GL) { console.log('== --gl (navegador) =='); await browser(); }
  console.log(fail ? '\n' + fail + ' FALLO(S)' : '\n' + (warn ? 'TODO OK (con ' + warn + ' aviso' + (warn > 1 ? 's' : '') + ')' : 'TODO OK'));
  process.exit(fail ? 1 : 0);
})();
