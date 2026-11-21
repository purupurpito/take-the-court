#!/usr/bin/env node
/* TAKE THE COURT — tools/venuegen-test.js (owner: arena)
 * Prueba headless de la receta de sedes generadas (js/venue-gen.js, fase F0), sin navegador. Carga leagues.js, venues.js, career.js
 * (con sus dependencias, como careertest) y venue-gen.js en un contexto vm con localStorage falso, y recorre:
 *   - los 390 clubes de pista × 'hall' (a través de VB.Career.hall.clubInfo, como lo hará forMatch);
 *   - los 390 × 'beach' (partido rápido);
 *   - 20 Carreras de playa con semillas fijas (40 clubes cada una, sede = club.beach);
 *   - 200 random('hall', n) + 200 random('beach', n).
 * Comprueba: (a) determinismo (dos pasadas + otra en un contexto nuevo con los clubes barajados), (b) esquema y rangos, (c) contraste,
 * (d) nombres (únicos en el mundo, pads únicos, idioma por ciudad, reparto de núcleos entre países), (e) variedad (y la Carrera de
 * playa: tier 3 y noche en el circuito 5), OVERRIDES coherentes, (f) instantánea tools/venuegen.snap.json (UPDATE=1 la reescribe),
 * (g) tiempo: < 0,5 ms por spec y la PRIMERA spec en un proceso hijo nuevo con tope de 150 ms, (h) coste estimado contra el
 * presupuesto. También el orden de carga (spec antes de leagues.js) y la sal en el id.
 * Salidas: tools/out/venuegen/arquetipos.md (tabla por país) y tools/out/venuegen/nombres.csv (para revisar los nombres).
 * Uso: node tools/venuegen-test.js   [UPDATE=1 para aceptar cambios de la instantánea, VERBOSE=1]. Acaba en «TODO OK» o sale con 1.
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'out', 'venuegen');
const SNAP = path.join(__dirname, 'venuegen.snap.json');
const UPDATE = process.env.UPDATE === '1', VERBOSE = process.env.VERBOSE === '1';
let fails = 0, passes = 0;
function ok(c, msg) { if (!c) { fails++; console.log('  FALLO: ' + msg); } else { passes++; if (VERBOSE) console.log('  ok: ' + msg); } return !!c; }
function info(msg) { console.log('  · ' + msg); }
function section(t) { console.log('\n== ' + t); }

function makeCtx() {
  const mem = {};
  const fakeLS = { getItem: k => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: k => { delete mem[k]; } };
  const ctx = { console, Math, Date, JSON, Set, localStorage: fakeLS }; ctx.globalThis = ctx; ctx.window = ctx;
  vm.createContext(ctx);
  for (const f of ['js/sim.js', 'js/prog.js', 'js/badges.js', 'js/leagues.js', 'js/venues.js', 'js/career.js', 'js/career-life.js', 'js/venue-gen.js']) {
    if (!fs.existsSync(path.join(ROOT, f))) { console.log('(sin ' + f + ')'); continue; }
    vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  }
  return ctx.VB;
}
/** Contexto mínimo: solo los ficheros pedidos, en ese orden (para las pruebas de orden de carga y de OVERRIDES). */
function miniCtx(files) {
  const ctx = { console, Math, JSON }; ctx.globalThis = ctx; ctx.window = ctx; vm.createContext(ctx);
  const load = f => vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  (files || ['js/leagues.js', 'js/venue-gen.js']).forEach(load);
  return { ctx, load, VB: () => ctx.VB };
}
function fnv(s) { s = String(s); let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(16).padStart(8, '0'); }
const J = o => JSON.stringify(o);
const R2ok = x => Math.round(x * 100) / 100 === x;
const isHex = s => typeof s === 'string' && /^#[0-9a-f]{6}$/.test(s);

// ------------------------------------------------------------------ carga
section('Carga');
const VB = makeCtx(), G = VB.VenueGen, C = VB.Career;
ok(G && typeof G.spec === 'function' && typeof G.random === 'function' && typeof G.dist === 'function' && typeof G.sig === 'function' && typeof G.roster === 'function', 'VB.VenueGen con spec/random/dist/sig/roster');
ok(G.V === 1 && G.ENV && G.OVERRIDES && typeof G.OVERRIDES === 'object', 'V, ENV y OVERRIDES');
ok(Object.keys(G.ENV).length === 29 && G.ENV.XX, 'ENV: 28 países + XX (' + Object.keys(G.ENV).length + ')');
const src = fs.readFileSync(path.join(ROOT, 'js/venue-gen.js'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
ok(!/Math\.random|Date\.|new Date|performance\./.test(src), 'la receta no usa Math.random, Date ni performance');
ok(!/THREE|document\.|window\.(?!VB)/.test(src.replace("typeof window !== 'undefined' ? window : globalThis", '')), 'la receta no toca THREE ni el DOM');

// clubes de pista: los de leagues.js, pasados por la ficha de la Carrera de pista (nombre con patrocinador, siglas únicas)
const regions = VB.Leagues.regions;
const raw = [];
regions.forEach(rg => rg.countries.forEach(co => co.divisions.forEach(d => d.clubs.forEach(k => raw.push({ cc: co.code, lvl: d.lvl, strength: d.strength, k })))));
ok(raw.length === 390, '390 clubes en VB.Leagues (' + raw.length + ')');
let hallClubs = [];
try {
  const c6 = C.create({ mode: 'hall', name: 'Prueba Sedes', num: 9, pos: 'OH', seed: 777, points: 15 });
  hallClubs = c6.clubs.map(k => C.hall.clubInfo(c6, k));
} catch (e) { console.log('  (Carrera de pista no disponible: ' + e.message + ')'); }
ok(hallClubs.length === 390, 'fichas de club de la Carrera de pista: ' + hallClubs.length);
// clave estable por club: cc + siglas de leagues.js (la ficha puede llevar siglas cambiadas por uniqueShorts)
const keyOf = sp => sp.cc + ':' + sp.id.split('-')[2];

// ------------------------------------------------------------------ recorrido
section('Recorrido');
const hall = hallClubs.map(k => G.spec(k, 'hall'));
const beachQ = hallClubs.map(k => G.spec(k, 'beach'));
const careers = [];
for (let i = 0; i < 20; i++) {
  const c = C.create({ mode: 'beach', name: 'Sedes ' + i, seed: 9100 + i * 37 });
  careers.push({ seed: 9100 + i * 37, clubs: c.clubs.map(k => ({ k, info: C.beach.clubInfo(c, k), sp: G.spec(C.beach.clubInfo(c, k), 'beach') })) });
}
const randH = [], randB = [];
for (let n = 1; n <= 200; n++) { randH.push(G.random('hall', n)); randB.push(G.random('beach', n * 7919)); }
info(hall.length + ' pista · ' + beachQ.length + ' playa (partido rápido) · ' + careers.length + ' Carreras × ' + careers[0].clubs.length + ' clubes · ' + (randH.length + randB.length) + ' al azar');
ok(hall.every(s => s.kind === 'hall') && beachQ.every(s => s.kind === 'beach'), 'tipo de cada spec');
ok(hall.every(s => s.cc !== 'XX') && new Set(hall.map(s => s.id)).size === 390, 'los 390 clubes de pista se reconocen en VB.Leagues (ids únicos, ninguno cae en XX)');
ok(new Set(beachQ.map(s => s.id)).size === 390, 'ids de playa únicos');
// la ficha y el club en bruto dan la misma sede
{
  let same = 0;
  raw.forEach(r => { const s = G.spec({ name: r.k.name, city: r.k.city, cc: r.cc, short: r.k.short, colors: r.k.colors, ovr: r.k.ovr, strength: r.strength }, 'hall'); if (hall.some(h => h.id === s.id && J(h) === J(s))) same++; });
  ok(same === 390, 'club en bruto de leagues.js = ficha de la Carrera (' + same + '/390)');
  const sp1 = G.spec({ name: 'Salumificio Il Bagher Voley Perugia', city: 'Perugia', cc: 'IT', short: 'PE1' }, 'hall'), sp2 = G.spec({ name: 'Voley Perugia', city: 'Perugia', cc: 'IT' }, 'hall');
  ok(J(sp1) === J(sp2) && sp1.id === 'g-IT-PER-h', 'el patrocinador y las siglas cambiadas no cambian la sede (' + sp1.id + ')');
}

// ------------------------------------------------------------------ (a) determinismo
section('(a) Determinismo');
{
  const again = hallClubs.map(k => G.spec(k, 'hall')), againB = hallClubs.map(k => G.spec(k, 'beach'));
  ok(J(again) === J(hall) && J(againB) === J(beachQ), 'segunda pasada idéntica');
  const VB2 = makeCtx(), G2 = VB2.VenueGen;
  const order = hallClubs.map((k, i) => i);
  let x = 12345; for (let i = order.length - 1; i > 0; i--) { x = (Math.imul(x, 1103515245) + 12345) >>> 0; const j = x % (i + 1); [order[i], order[j]] = [order[j], order[i]]; }
  const h2 = [], b2 = [];
  order.forEach(i => { b2[i] = G2.spec(hallClubs[i], 'beach'); h2[i] = G2.spec(hallClubs[i], 'hall'); });
  ok(J(h2) === J(hall) && J(b2) === J(beachQ), 'contexto nuevo con los clubes barajados (y la playa antes que la pista): mismo JSON');
  ok(J(G2.random('hall', 77)) === J(G.random('hall', 77)) && J(G2.random('beach', 5)) === J(G.random('beach', 5)), 'random(kind, seed) determinista');
  const cA = careers[3].clubs.map(o => J(o.sp)).join(), cB = careers[3].clubs.map(o => J(G2.spec(o.info, 'beach'))).join();
  ok(cA === cB, 'playa de la Carrera determinista');
  const sx = G.spec(hallClubs[0], 'hall', { salt: 'x' }), sy = G.spec(hallClubs[0], 'hall', { salt: 'y' });
  ok(J(sx) !== J(hall[0]), 'opt.salt cambia la sede');
  ok(sx.id !== hall[0].id && sy.id !== sx.id && /-s[0-9a-f]{4}-h$/.test(sx.id), 'opt.salt va en el id (' + hall[0].id + ' → ' + sx.id + ', ' + sy.id + ')');
  ok(J(G.spec(hallClubs[0], 'hall', { salt: 'x' })) === J(sx), 'misma sal, misma receta');
  // mismo id ⇒ mismo JSON, en todas las variantes (club, sal, copa internacional, playa, al azar)
  {
    const byId = new Map(); let clash = 0, n = 0;
    const put = sp => { n++; const j = J(sp); if (byId.has(sp.id) && byId.get(sp.id) !== j) clash++; byId.set(sp.id, j); };
    hallClubs.slice(0, 60).forEach((k, i) => {
      put(G.spec(k, 'hall')); put(G.spec(k, 'beach')); put(G.spec(k, 'hall', { salt: 'a' })); put(G.spec(k, 'hall', { salt: i })); put(G.spec(k, 'beach', { salt: 'a' }));
      put(G.spec(k, 'hall', { stage: 'intl' })); put(G.spec(k, 'hall', { stage: 'intl', salt: 'a' }));
    });
    for (let s2 = 1; s2 <= 40; s2++) { put(G.random('hall', s2)); put(G.random('beach', s2)); }
    ok(clash === 0, 'mismo id ⇒ mismo JSON (' + n + ' specs, ' + byId.size + ' ids, ' + clash + ' choques)');
  }
  // orden de carga: venue-gen.js antes que leagues.js (como en index.html). Una spec pedida antes de tiempo no envenena la caché.
  {
    const m = miniCtx(['js/venue-gen.js']), Gm = m.VB().VenueGen, r0 = raw[0];
    const club = { name: r0.k.name, city: r0.k.city, cc: r0.cc, short: r0.k.short, colors: r0.k.colors, ovr: r0.k.ovr, strength: r0.strength };
    const before = Gm.spec(club, 'hall'); Gm.spec(club, 'beach'); Gm.random('hall', 3);
    m.load('js/leagues.js');
    const after = Gm.spec(club, 'hall'), ref = G.spec(club, 'hall');
    ok(/-[0-9a-f]{1,4}-h$/.test(before.id) && J(after) === J(ref), 'spec antes de leagues.js (vía hash: ' + before.id + ') y después: la de después = la de una sesión normal (' + after.id + ')');
    ok(J(Gm.spec(club, 'beach')) === J(G.spec(club, 'beach')) && J(Gm.random('hall', 3)) === J(G.random('hall', 3)), 'playa y random después de cargar leagues.js: iguales a las de una sesión normal');
  }
  const intl = G.spec(hallClubs[0], 'hall', { stage: 'intl' });
  ok(intl.tier === 3 && (intl.arch === 'H8' || intl.arch === 'H9') && intl.name === hall[0].name, 'copa internacional: tier 3 con piel de Palau y el mismo nombre (' + intl.id + ', ' + intl.arch + ')');
}

// ------------------------------------------------------------------ (b) esquema y rangos
section('(b) Esquema y rangos');
const allCareer = [].concat(...careers.map(c => c.clubs.map(o => o.sp)));
const ALL = [].concat(hall, beachQ, allCareer, randH, randB);
{
  const TOP = ['v', 'id', 'kind', 'seed', 'cc', 'arch', 'flavor', 'tier', 'name', 'short', 'pad', 'help', 'night', 'lights', 'sand', 'pal', 'p', 'txt', 'sig'];
  const PAL = ['court', 'free', 'line', 'dado', 'wall', 'seatA', 'seatB', 'accent', 'tape'];
  const bad = [];
  function chk(sp) {
    const e = [];
    TOP.forEach(k => { if (!(k in sp)) e.push('falta ' + k); });
    if (sp.v !== 1) e.push('v');
    if (!/^g-[A-Z]{2}-[A-Za-z0-9]{1,8}(-[0-9a-f]{1,4})?(-s[0-9a-f]{4})?-[hb]x?$|^g-r-\d+-[hb]$/.test(sp.id)) e.push('id ' + sp.id);
    if (!(sp.tier >= 0 && sp.tier <= 3 && (sp.tier | 0) === sp.tier)) e.push('tier');
    if (!(sp.seed >>> 0 === sp.seed)) e.push('seed');
    PAL.forEach(k => { if (!isHex(sp.pal[k])) e.push('pal.' + k + '=' + sp.pal[k]); });
    const R = G.RANGES[sp.kind];
    const pk = Object.keys(sp.p).sort().join(), rk = Object.keys(R).sort().join();
    if (pk !== rk) e.push('ejes p ≠ RANGES: ' + pk);
    for (const k in R) {
      const v = sp.p[k], r = R[k];
      if (Array.isArray(r) && typeof r[0] === 'number') { if (typeof v !== 'number' || !(v >= r[0] - 1e-9 && v <= r[1] + 1e-9)) e.push(k + '=' + v); else if (!R2ok(v)) e.push(k + ' sin redondear ' + v); }
      else if (Array.isArray(r)) { if (r.indexOf(v) < 0) e.push(k + '=' + v); }
      else if (r === 'boolean') { if (typeof v !== 'boolean') e.push(k); }
      else if (r === 'color') { if (!isHex(v)) e.push(k); }
      else if (r === 'string') { if (typeof v !== 'string' || !v) e.push(k); }
    }
    if (sp.kind === 'hall') {
      if (G.ARCH.indexOf(sp.arch) < 0) e.push('arch ' + sp.arch);
      if (sp.sig.length !== 9) e.push('sig');
      if (sp.lights !== null || sp.sand !== null) e.push('lights/sand en pista');
      if (sp.p.stands === 'none' ? sp.p.rows !== 0 : sp.p.rows < 2) e.push('filas ' + sp.p.rows);
      if (sp.p.skin === 'palau' !== (sp.arch === 'H8' || sp.arch === 'H9')) e.push('piel de Palau');
      if (sp.p.wy < 10 || sp.p.wx < 14.5) e.push('planta pequeña para la zona libre');
      if (sp.night !== (sp.p.light === 'sodium' || sp.p.light === 'led' || sp.p.light === 'show')) e.push('night');
      if (sp.p.light === 'show' && sp.tier < 3) e.push('show sin tier 3');
      if (sp.arch === 'H9' && sp.tier < 3) e.push('H9 sin tier 3');
    } else {
      if (sp.arch !== sp.p.scen) e.push('arch ≠ scen');
      if (sp.sig.length !== 8) e.push('sig');
      if (!Array.isArray(sp.sand) || sp.sand.length !== 3 || !sp.sand.every(v => v >= 0 && v <= 1 && R2ok(v))) e.push('sand');
      // de noche, sin lights (como fanals y cupula en venues.js: «sin lights = luz fija»); un [] sería truthy para if (V.lights)
      if (sp.night ? sp.lights !== null : !Array.isArray(sp.lights) || J(sp.lights.slice().sort()) !== J(['dia', 'tarde'])) e.push('lights');
      if (sp.night !== (sp.p.hour === 'noche')) e.push('night/hour');
      if ((sp.p.scen === 'lake' || sp.p.scen === 'river' || sp.p.scen === 'port' || sp.p.scen === 'plaza') && sp.p.surf !== 0) e.push('surf en ' + sp.p.scen);
      if ((sp.p.scen === 'open' || sp.p.scen === 'dunes' || sp.p.scen === 'tropical') && !(sp.p.surf >= 0.6)) e.push('surf bajo en ' + sp.p.scen);
      if ((sp.p.scen === 'lake' || sp.p.scen === 'plaza') && sp.p.lifeguard !== 'none') e.push('socorrista en ' + sp.p.scen);
    }
    if (!Array.isArray(sp.txt.banners) || sp.txt.banners.length < 2 || sp.txt.banners.length > 8 || !sp.txt.banners.every(b => typeof b === 'string' && b)) e.push('banners');
    if (typeof sp.txt.chant !== 'string' || !sp.txt.chant) e.push('chant');
    if (e.length) bad.push(sp.id + ': ' + e.join(', '));
  }
  ALL.forEach(chk);
  ok(bad.length === 0, 'esquema y rangos de ' + ALL.length + ' specs' + (bad.length ? ' (' + bad.length + ' mal: ' + bad.slice(0, 6).join(' | ') + ')' : ''));
  // tier por prestigio y empuje relativo
  const byCC = {}; hall.forEach((s, i) => (byCC[s.cc] = byCC[s.cc] || []).push({ s, k: hallClubs[i] }));
  let push = 0; for (const cc in byCC) { const L = byCC[cc].slice().sort((a, b) => b.k.ovr - a.k.ovr); if (L[0].s.tier >= 2 && L[1].s.tier >= 2) push++; }
  ok(push === 28, 'los 2 mejores de cada país tienen como mínimo tier 2 (' + push + '/28)');
  ok(hall.filter(s => s.tier === 0).length > 0 && hall.filter(s => s.tier === 3).length > 0, 'hay sedes de todos los tiers (' + [0, 1, 2, 3].map(t => 't' + t + ' ' + hall.filter(s => s.tier === t).length).join(', ') + ')');
  ok(randH.some(s => s.tier === 0) && randH.some(s => s.tier === 3) && new Set(randH.map(s => s.cc)).size >= 20, 'random: tiers y países variados');
}

// ------------------------------------------------------------------ (c) contraste
section('(c) Contraste y colores');
{
  const L = h => G._.hexHsl(h)[2], H = h => G._.hexHsl(h)[0];
  const hb = [].concat(hall, randH), bb = [].concat(beachQ, allCareer, randB);
  const c1 = hb.filter(s => L(s.pal.court) > 0.6), c2 = hb.filter(s => H(s.pal.court) >= 40 && H(s.pal.court) <= 70 && L(s.pal.court) > 0.5);
  const c3 = hb.filter(s => G._.contrast(s.pal.line, s.pal.court) < 0.35);
  ok(c1.length === 0, 'pista: L ≤ 0,6 en todas' + (c1.length ? ' (' + c1.map(s => s.id + ' ' + s.pal.court).join(', ') + ')' : ''));
  ok(c2.length === 0, 'pista: ningún amarillo con L > 0,5');
  ok(c3.length === 0, 'líneas con contraste ≥ 0,35 contra la pista' + (c3.length ? ' (' + c3.slice(0, 5).map(s => s.id).join(', ') + ')' : ''));
  const sL = s => { const c = s.sand, mx = Math.max(...c), mn = Math.min(...c); return (mx + mn) / 2; };
  const c4 = bb.filter(s => Math.abs(L(s.pal.tape) - sL(s)) < 0.2 - 1e-9);
  ok(c4.length === 0, 'cinta contra arena con ΔL ≥ 0,2 (' + bb.length + ' playas)' + (c4.length ? ' (' + c4.slice(0, 5).map(s => s.id + ' ' + s.pal.tape).join(', ') + ')' : ''));
  // ningún color de la sede idéntico al kit del club
  let same = 0;
  hall.forEach((s, i) => { const k = hallClubs[i].kit, kit = [k.shirt, k.accent, k.libero].map(v => typeof v === 'number' ? '#' + v.toString(16).padStart(6, '0') : String(v).toLowerCase()); for (const p in s.pal) if (p !== 'line' && p !== 'tape' && kit.indexOf(s.pal[p]) >= 0) same++; });
  ok(same === 0, 'los colores de la sede nunca son idénticos a los del kit (' + same + ')');
  // separación de las camisetas del club (revisión de F2): la pista y los asientos nunca se confunden con la equipación de casa
  // (ni floorAdjust gira la pista contra la camiseta propia: ΔE ≥ 25)
  const hexK = v => typeof v === 'number' ? '#' + v.toString(16).padStart(6, '0') : String(v).toLowerCase();
  let minC = 99, minS = 99, wC = '', wS = '';
  hall.forEach((s, i) => { const k = hallClubs[i].kit, sh = [k.shirt, k.accent].filter(v => v != null).map(hexK);
    sh.forEach(x => { const dc = G._.dE76(s.pal.court, x), ds = Math.min(G._.dE76(s.pal.seatA, x), s.pal.seatB === '#7d838c' ? 99 : G._.dE76(s.pal.seatB, x));
      if (dc < minC) { minC = dc; wC = s.id + ' ' + s.pal.court + '/' + x; } if (ds < minS) { minS = ds; wS = s.id + ' ' + s.pal.seatA + '/' + x; } }); });
  ok(minC >= 25, 'pista a ΔE76 ≥ 25 de la camiseta y la segunda del club (mín. ' + minC.toFixed(1) + ' ' + wC + ')');
  ok(minS >= 10, 'asientos (A y B) a ΔE76 ≥ 10 de las camisetas del club (mín. ' + minS.toFixed(1) + ' ' + wS + ')');
  const free = hall.filter(s => G._.contrast(s.pal.court, s.pal.free) < 0.005 && Math.abs(H(s.pal.court) - H(s.pal.free)) < 10);
  ok(free.length === 0, 'zona libre distinta de la pista');
}

// ------------------------------------------------------------------ (d) nombres
section('(d) Nombres');
{
  const league = [].concat(hall, beachQ), gen = [].concat(league, randH, randB);
  const long = gen.filter(s => s.name.length > 30 || s.short.length > 12 || s.pad.length > 18);
  ok(long.length === 0, 'name ≤ 30, short ≤ 12, pad ≤ 18' + (long.length ? ' (' + long.slice(0, 5).map(s => s.name + '/' + s.short + '/' + s.pad).join(', ') + ')' : ''));
  const longC = allCareer.filter(s => s.short.length > 12 || s.pad.length > 18);
  ok(longC.length === 0, 'Carrera de playa: short ≤ 12 y pad ≤ 18');
  const nC = allCareer.filter(s => s.name.length > 30).length;
  info('Carrera de playa: el nombre es club.beach tal cual (career.js); ' + nC + ' de ' + allCareer.length + ' pasan de 30 caracteres (solo se usa en la interfaz; pad ≤ 18)');
  const den = gen.filter(s => G._.denied(s.name));
  ok(den.length === 0, 'ningún nombre en la lista de bloqueo' + (den.length ? ' (' + den.map(s => s.name).join(', ') + ')' : ''));
  const city = league.filter((s, i) => { const k = hallClubs[i % 390]; const cn = G._.norm(k.city.replace(/\(.*\)/, '')); return cn.length > 3 && G._.norm(s.name).indexOf(cn) >= 0; });
  ok(city.length === 0, 'la ciudad nunca va en el nombre' + (city.length ? ' (' + city.map(s => s.name).join(', ') + ')' : ''));
  const names = league.map(s => s.name);
  ok(new Set(names).size === names.length, '0 nombres repetidos en el mundo (' + names.length + ' sedes de pista y playa)');
  const perCC = {}; league.forEach(s => { const k = s.cc + s.kind; perCC[k] = perCC[k] || new Set(); perCC[k].add(G._.norm(s.short)); });
  let dupT = 0; for (const k in perCC) { const n = league.filter(s => s.cc + s.kind === k).length; if (perCC[k].size !== n) dupT++; }
  ok(dupT === 0, 'topónimo único por país y tipo');
  const worldSet = new Set(names), rc = [].concat(randH, randB).filter(s => worldSet.has(s.name));
  ok(rc.length === 0, 'las sedes al azar no repiten nombre de una sede de club');
  const gch = ALL.filter(s => G._.gendered(s.txt.chant) || s.txt.banners.some(b => G._.gendered(b)));
  ok(gch.length === 0, 'cánticos y pancartas sin marca de género');
  const st = G._.stats.deny, d2 = st.filter(x => x > 1).length;
  ok(d2 <= Math.ceil(st.length * 0.02), 'lista de bloqueo: más de 1 avance de sub-semilla en ' + d2 + ' de ' + st.length + ' (≤ 2 %)');
  info('avances por choque o bloqueo: media ' + (G._.stats.tries.reduce((a, b) => a + b, 0) / G._.stats.tries.length).toFixed(2) + ', máximo ' + Math.max(...G._.stats.tries));
  // pools: topónimos ≤ 12 y sin repetir dentro de cada idioma
  const LG = G.LANG, poolBad = [];
  for (const l in LG) {
    const T = LG[l].T, seen = new Set();
    T.forEach(t => { if (t.length > 12) poolBad.push(l + ':' + t); if (seen.has(t)) poolBad.push(l + ' repetido ' + t); seen.add(t); if (G._.denied(t)) poolBad.push(l + ' bloqueado ' + t); });
    if (T.length < 22) poolBad.push(l + ' pool corto ' + T.length);
  }
  ok(poolBad.length === 0, 'pools de topónimos (≤ 12, sin repetir, ≥ 22 por idioma)' + (poolBad.length ? ': ' + poolBad.join(', ') : ''));
  // palabras raras repetidas: ningún topónimo sale más de 2 veces en el mundo
  const cnt = {}; league.forEach(s => { cnt[s.short] = (cnt[s.short] || 0) + 1; });
  const rep = Object.keys(cnt).filter(k => cnt[k] > 2);
  ok(rep.length === 0, 'ningún topónimo sale más de 2 veces en el mundo' + (rep.length ? ' (' + rep.map(k => k + '×' + cnt[k]).join(', ') + ')' : ''));
  const pads = league.map(s => s.pad), padDup = pads.filter((p, i) => pads.indexOf(p) !== i);
  ok(padDup.length === 0, 'pad único en el mundo (' + pads.length + ')' + (padDup.length ? ': ' + padDup.slice(0, 8).join(', ') : ''));
  const ART = /^(EL|LA|LOS|LAS|ELS|LES|L'|IL|LO|I|GLI|LE|O|A|OS|AS|HET|DE|DI|DER|DEL|DELLA|DES|DU|DO|DA|AL-|THE)[\s']/;
  const padArt = league.filter(s => ART.test(s.pad) || /\s(DEL|DELS|DELLA|DELLE|DEGLI|DEI|DES|DU|DE LA|DE LES|DE LOS|DE LAS|DE L)[\s']/.test(' ' + s.pad + ' '));
  ok(padArt.length === 0, 'pad sin artículo inicial ni las preposiciones que añade la plantilla (del, della, des, de la…)' + (padArt.length ? ' (' + padArt.slice(0, 8).map(s => s.pad).join(', ') + ')' : ''));
  // un topónimo (núcleo) por club dentro del país, común a pista y playa: el mismo club sí puede repetirlo en sus dos sedes
  {
    const own = {}, bad = [];
    league.forEach(s => { const k = s.cc + '|' + G._.coreKey(s.short), club = keyOf(s); if (own[k] && own[k] !== club) bad.push(s.cc + ' ' + s.short + ' (' + own[k] + ' y ' + club + ')'); own[k] = own[k] || club; });
    ok(bad.length === 0, 'topónimo único por país entre pista y playa (salvo el mismo club)' + (bad.length ? ': ' + bad.slice(0, 6).join(', ') : ''));
    const reuse = hall.filter((s, i) => G._.coreKey(s.short) === G._.coreKey(beachQ[i].short)).length;
    info('clubes cuya playa repite el topónimo de su pista: ' + reuse + '/390');
    const cores = {}; league.forEach(s => { const k = G._.coreKey(s.short); (cores[k] = cores[k] || new Set()).add(s.cc); });
    const multi = Object.keys(cores).filter(k => cores[k].size > 1);
    ok(multi.length === 0, 'ningún núcleo de topónimo en dos países' + (multi.length ? ': ' + multi.slice(0, 6).join(', ') : ''));
  }
  ok(G._.stats.tries.every(t => t < 400), 'todos los nombres de club salen con núcleo propio y libre (sin el pase de reserva)');
  // idioma por ciudad (ES, BE, CH, CA): palabras completas, sin prefijos («palma» no casa con «Las Palmas»)
  {
    const EXP = {
      ES: { 'Las Palmas de Gran Canaria': 'es', 'Soria': 'es', 'Melilla': 'es', 'Manacor': 'ca', 'San Cristóbal de La Laguna': 'es', 'Teruel': 'es', 'Ciutadella de Menorca': 'ca',
        'Sevilla': 'es', 'Haro': 'es', 'Sant Cugat del Vallès': 'ca', 'Valencia': 'ca', 'Almería': 'es', 'Leganés': 'es', 'Benidorm': 'ca', 'San Roque': 'es', 'Tarragona': 'ca',
        'Lugo': 'es', 'Socuéllamos': 'es', 'Santa Cruz de Tenerife': 'es', 'Alcobendas': 'es', 'Palma de Mallorca': 'ca', 'Palma': 'ca', 'Vicálvaro': 'es', 'Vic': 'ca', 'Reus': 'ca', 'Reusa': 'es' },
      BE: { 'Maaseik': 'nl', 'Roeselare': 'nl', 'Menen': 'nl', 'Aalst': 'nl', 'Lovaina (Heverlee)': 'nl', 'Beveren (Kieldrecht)': 'nl', 'Oudegem (Dendermonde)': 'nl', 'Charleroi': 'fr', 'Chapelle-lez-Herlaimont': 'fr' },
      CH: { 'Amriswil': 'de', 'Näfels': 'de', 'Schönenwerd': 'de', 'Rapperswil-Jona': 'de', 'Chêne-Bourg (Ginebra)': 'fr', 'Neuchâtel': 'fr', 'Aesch (Basilea-Campiña)': 'de', 'Düdingen': 'de', 'Schaffhausen': 'de', 'Ginebra': 'fr', 'Lugano': 'it' },
      CA: { 'Langley (BC)': 'enca', 'Vancouver': 'enca', 'Edmonton': 'enca', 'Winnipeg': 'enca', 'Sherbrooke': 'fr', 'Montreal': 'fr', 'Quebec': 'fr', 'Calgary': 'enca', 'Saskatoon': 'enca', 'Hamilton (ON)': 'enca' }
    };
    const bad = [];
    for (const cc in EXP) for (const city in EXP[cc]) { const l = G._.langOf(cc, city, 1); if (l !== EXP[cc][city]) bad.push(cc + ' ' + city + ' → ' + l + ' (esperado ' + EXP[cc][city] + ')'); }
    raw.forEach(r => { if (EXP[r.cc] && !(r.k.city in EXP[r.cc])) bad.push(r.cc + ' ' + r.k.city + ' sin idioma esperado en la tabla'); });
    ok(bad.length === 0, 'idioma de los nombres por ciudad (ES, BE, CH, CA)' + (bad.length ? ': ' + bad.join(' | ') : ''));
  }
  // topónimos que coinciden con lugares reales: fuera de los pools; marítimos fuera de los países sin costa; urbanos fuera de las playas naturales
  {
    const REAL = ['Kula', 'Talisay', 'Ipil', 'Bluewater', 'Puerto Viejo', 'Le Phare', 'U Majáku', 'Svetionik'], hit = [];
    for (const l in G.LANG) G.LANG[l].T.forEach(t => { if (REAL.indexOf(t) >= 0) hit.push(l + ':' + t); });
    ok(hit.length === 0, 'pools sin topónimos que coinciden con lugares reales (' + REAL.join(', ') + ')' + (hit.length ? ': ' + hit.join(', ') : ''));
    const inland = gen.filter(s => !G.ENV[s.cc].coast && G._.MARITIME[s.short]);
    ok(inland.length === 0, 'sin topónimos marítimos (faro, puerto, Leuchtturm…) en países sin costa' + (inland.length ? ': ' + inland.slice(0, 6).map(s => s.cc + ' ' + s.name).join(', ') : ''));
    const urb = [].concat(beachQ, randB).filter(s => ['open', 'cove', 'tropical', 'desert', 'dunes', 'lake'].indexOf(s.p.scen) >= 0 && G._.URBAN[s.short]);
    ok(urb.length === 0, 'sin topónimos urbanos (Barrio Alto, La Estación…) en playas naturales' + (urb.length ? ': ' + urb.slice(0, 6).map(s => s.name).join(', ') : ''));
  }
  // castellano: playas con «del / de la / de los / de las» («Playa del Molino», no «Playa El Molino»); «Balneario El Bajo» (AR) sí
  {
    const es = [].concat(beachQ, randB).filter(s => /^(ES|AR|PE)$/.test(s.cc) && /^(Playa|Cala|Caleta|Muelle|Laguna|Plaza|Ribera|Dunas|Bahía|Costanera|Médanos) /.test(s.name));
    const badEs = es.filter(s => /^\S+ (El|La|Los|Las) /.test(s.name));
    ok(es.length > 20 && badEs.length === 0, 'playas en castellano con preposición contraída (' + es.length + ')' + (badEs.length ? ': ' + badEs.slice(0, 6).map(s => s.name).join(', ') : ''));
  }
  // garantía estática: con el reparto de núcleos, dos países no pueden generar el mismo nombre (todas las plantillas, todos los tiers)
  {
    const own = G._.ownership(), names = {}, clash = [];
    for (const l in G.LANG) {
      const L = G.LANG[l], fmts = L.k.map(k => k[0]).concat(...Object.keys(L.b).map(k => L.b[k]));
      L.T.concat(L.w).forEach(rw => {
        const full0 = rw.charAt(0) === '!', T = full0 ? rw.slice(1).split('|')[1] : rw, owner = own[G._.coreKey(T)];
        if (!owner || owner.split('|')[1] !== l) return;
        const cc = owner.split('|')[0], outs = full0 ? [rw.slice(1).split('|')[0]] : fmts.map(f => f.replace('{T}', T).replace('{dT}', T));
        outs.forEach(n0 => { const n = G._.norm(n0); if (names[n] && names[n] !== cc) clash.push(n0 + ' (' + names[n] + '/' + cc + ')'); names[n] = cc; });
      });
    }
    ok(clash.length === 0, 'reparto de núcleos: ningún nombre posible es de dos países (' + Object.keys(names).length + ' nombres posibles)' + (clash.length ? ': ' + clash.slice(0, 5).join(', ') : ''));
  }
  // sedes al azar y clubes desconocidos: nunca el nombre de una sede de club; entre ellas sí puede repetirse (función pura de la semilla)
  {
    const rn = [].concat(randH, randB).map(s => s.name), rd = rn.length - new Set(rn).size;
    info('sedes al azar: ' + rd + ' nombres repetidos entre las ' + rn.length + ' de la tanda (admitido: random(kind, seed) es pura y no lleva registro; nunca repite una sede de club)');
    const inv = []; for (let i = 0; i < 300; i++) inv.push(G.spec({ name: 'Club Inventado ' + i, city: 'Ciudad ' + i, cc: 'IT', ovr: 60 + (i % 30), strength: 70 }, 'hall'));
    const ws = new Set(names), invHit = inv.filter(s => ws.has(s.name));
    ok(invHit.length === 0, '300 clubes inventados de IT: ninguno repite el nombre de una sede de club (' + (inv.length - new Set(inv.map(s => s.name)).size) + ' repetidos entre ellos, admitido)');
  }
  const langs = new Set(hall.map((s, i) => G._.langOf(s.cc, hallClubs[i].city, s.seed)));
  info('idiomas usados: ' + [...langs].sort().join(' '));
}

// ------------------------------------------------------------------ (e) variedad
section('(e) Variedad');
const byCC = {}; hall.forEach((s, i) => (byCC[s.cc] = byCC[s.cc] || []).push({ s, k: hallClubs[i] }));
const byCCb = {}; beachQ.forEach((s, i) => (byCCb[s.cc] = byCCb[s.cc] || []).push({ s, k: hallClubs[i] }));
{
  const badA = [], badD = [], badCity = [];
  for (const cc in byCC) {
    const L = byCC[cc].map(o => o.s);
    const archs = new Set(L.map(s => s.arch)), combos = new Set(L.map(s => s.arch + '/' + s.p.back + '/' + s.p.light));
    if (archs.size < 5 || combos.size < 5) badA.push(cc + ' ' + archs.size + '/' + combos.size);
    let mn = 99; for (let i = 0; i < L.length; i++) for (let j = 0; j < i; j++) mn = Math.min(mn, G.dist(L[i], L[j]));
    if (mn < 4) badD.push(cc + ' ' + mn);
    const cities = {}; byCC[cc].forEach(o => { const c = G._.norm(o.k.city.replace(/\(.*\)/, '')); (cities[c] = cities[c] || []).push(o.s.arch); });
    for (const c in cities) { const a = cities[c]; if (a.length > 1 && new Set(a).size < Math.min(a.length, 5)) badCity.push(cc + ' ' + c + ' ' + a.join(',')); }
  }
  ok(badA.length === 0, 'pista: ≥ 5 arquetipos y ≥ 5 firmas arquetipo × fondo rival × luz por país' + (badA.length ? ' (' + badA.join(', ') + ')' : ''));
  ok(badD.length === 0, 'pista: distancia mínima ≥ 4 entre clubes del mismo país' + (badD.length ? ' (' + badD.join(', ') + ')' : ''));
  ok(badCity.length === 0, 'pista: misma ciudad → arquetipos distintos mientras queden' + (badCity.length ? ' (' + badCity.join(' | ') + ')' : ''));
  // F2+: lo que de verdad se CONSTRUYE (los arquetipos sin constructor van con BUILD_AS): los umbrales siguen a los arquetipos hechos
  {
    const built = sp => G.builtArch(sp), BUILT = Array.from(new Set(hall.map(built))).sort();
    const needA = Math.min(5, BUILT.filter(a => a !== 'H8' && a !== 'H9').length), badBA = [], badBV = [];   // (las pieles H8/H9 solo salen en t3: no cuentan)
    for (const cc in byCC) {
      const L = byCC[cc].map(o => o.s), ba = new Set(L.map(built)), bc = new Set(L.map(s => built(s) + '/' + s.p.back + '/' + s.p.light));
      if (ba.size < Math.min(needA, L.length) || bc.size < Math.min(5, L.length)) badBA.push(cc + ' ' + ba.size + '/' + bc.size);
      // dos clubes del país con lo mismo construido en arquetipo, techo, fondo rival, luz y suelo (material + tono): gemelos a la vista
      const vis = L.map(s => [built(s), s.p.roof, s.p.back, s.p.light, s.p.floorMat, s.sig[4]].join('|'));
      if (new Set(vis).size < vis.length) badBV.push(cc);
    }
    ok(badBA.length === 0, 'pista construida (' + BUILT.join(' ') + '): ≥ ' + needA + ' arquetipos y ≥ 5 firmas arquetipo × fondo rival × luz por país' + (badBA.length ? ' (' + badBA.join(', ') + ')' : ''));
    ok(badBV.length === 0, 'pista construida: sin gemelos a la vista dentro de un país' + (badBV.length ? ' (' + badBV.join(', ') + ')' : ''));
  }
  const sigs = hall.map(s => G.sig(s));
  ok(new Set(sigs).size === sigs.length, 'pista: 0 firmas completas idénticas en el mundo');
  const sigsB = beachQ.map(s => G.sig(s));
  ok(new Set(sigsB).size === sigsB.length, 'playa: 0 firmas completas idénticas en el mundo');
  const badB = [], badBD = [];
  for (const cc in byCCb) {
    const L = byCCb[cc].map(o => o.s), sc = new Set(L.map(s => s.p.scen)), need = Math.min(4, G._.scenAllowed(cc, G.ENV[cc]).length);
    if (sc.size < need) badB.push(cc + ' ' + sc.size);
    let mn = 99; for (let i = 0; i < L.length; i++) for (let j = 0; j < i; j++) mn = Math.min(mn, G.dist(L[i], L[j]));
    if (mn < 3) badBD.push(cc + ' ' + mn);
  }
  ok(badB.length === 0, 'playa: ≥ 4 escenarios por país' + (badB.length ? ' (' + badB.join(', ') + ')' : ''));
  ok(badBD.length === 0, 'playa: distancia mínima ≥ 3 entre clubes del mismo país' + (badBD.length ? ' (' + badBD.join(', ') + ')' : ''));
  const lake = ['AT', 'CH', 'CZ', 'RS'].filter(cc => byCCb[cc].some(o => o.s.p.scen === 'lake'));
  ok(lake.length === 4, 'playa: LAKE al menos una vez en AT, CH, CZ y RS (' + lake.join(' ') + ')');
  const scenOk = beachQ.every(s => G._.scenAllowed(s.cc, G.ENV[s.cc]).indexOf(s.p.scen) >= 0);
  ok(scenOk, 'playa: escenario permitido por el clima del país');
  // Carreras de playa: ≥ 5 escenarios o luces por circuito
  let badCir = [];
  careers.forEach(c => { for (let l = 0; l < 5; l++) { const L = c.clubs.filter(o => o.k.lvl === l).map(o => o.sp), n = new Set(L.map(s => s.p.scen + '/' + s.p.hour)).size; if (n < 5) badCir.push(c.seed + ':' + l + '=' + n); } });
  ok(badCir.length === 0, 'Carrera de playa: ≥ 5 escenarios o luces por circuito en 20 Carreras' + (badCir.length ? ' (' + badCir.slice(0, 6).join(', ') + ')' : ''));
  const nightBad = allCareer.filter(s => s.night && s.tier < 3);
  ok(nightBad.length === 0 && beachQ.every(s => !s.night || s.tier >= 3), 'playa: noche solo en tier 3');
  ok(careers.every(c => c.clubs.every(o => o.sp.name === o.k.beach)), 'Carrera de playa: el nombre es club.beach');
  {
    const c5 = [].concat(...careers.map(c => c.clubs.filter(o => o.k.lvl === 4).map(o => o.sp)));
    const t3 = c5.filter(s => s.tier === 3).length, nn = c5.filter(s => s.night).length;
    ok(t3 > 0 && nn > 0, 'Carrera de playa: el circuito 5 tiene sedes t3 (' + t3 + '/' + c5.length + ') y de noche (' + nn + ') en las 20 Carreras');
    const low = [].concat(...careers.map(c => c.clubs.filter(o => o.k.lvl < 4).map(o => o.sp)));
    ok(low.every(s => s.tier < 3 && !s.night), 'Carrera de playa: circuitos 1-4 sin tier 3 ni noche');
    const LG = (C.beach && C.beach.LEAGUES) || C.LEAGUES;
    ok(Array.isArray(LG) && J(LG.map(L => L.ovr)) === J(G._.XX_OVR), 'rango de media de los circuitos = VB.Career.beach.LEAGUES (' + J(G._.XX_OVR) + ')');
  }
  // roster
  const R = G.roster('IT', 'hall');
  ok(R.K === 12 && R.tpls.length === 12 && R.tiers.length === 24, 'roster(IT, hall): K = max(6, ceil(24/2)) = 12');
  const unk = G.spec({ name: 'Club Inventado', city: 'Ciudad X', cc: 'IT', ovr: 70, strength: 70, colors: { shirt: '#123456', shirt2: '#ffcc00', libero: '#ffffff' } }, 'hall');
  ok(unk.cc === 'IT' && /^g-IT-/.test(unk.id) && R.tpls.some(t => t.arch === unk.arch), 'club que no está en VB.Leagues: plantilla del roster por hash (' + unk.id + ', ' + unk.name + ')');
}

// ------------------------------------------------------------------ OVERRIDES
section('OVERRIDES');
{
  const m = miniCtx(), Gm = m.VB().VenueGen, O = Gm.OVERRIDES;
  const PLAN = { 'IT:MIL': 'H1', 'IT:PAD': 'H2', 'IT:CIS': 'H3', 'IT:GRO': 'H4', 'IT:PRA': 'H5', 'IT:CUN': 'H6', 'IT:BER': 'H7', 'IT:FIR': 'H8', 'IT:PER': 'H9' };
  for (const k in PLAN) O[k] = { arch: PLAN[k] };
  O['IT:BUS'] = { arch: 'H9' };                    // t2: H9 solo en tier 3 → rechazado
  O['IT:MAC'] = { arch: 'H3', roof: 'dome' };      // techo que no es de H3 → rechazado, techo de H3
  O['IT:TRE:b'] = { scen: 'port' };
  O['IT:MIL:b'] = { hour: 'noche' };               // t2: noche solo en tier 3 → rechazado
  const W = Gm._.world().hall, Wb = Gm._.world().beach, bad = [];
  const WIN = { H1: ['band', 'none'], H2: ['skylight'], H3: ['band', 'none', 'skylight'], H4: ['band'], H5: ['arches'], H6: ['glass'], H7: ['ring'], H8: ['none'], H9: ['none'] };
  const chk = (key, arch) => {
    const sp = W[key], e = [], palau = arch === 'H8' || arch === 'H9', env = Gm.ENV[sp.cc];
    if (sp.arch !== arch) e.push('arch ' + sp.arch);
    if (Gm._.roofOpts(arch).indexOf(sp.p.roof) < 0) e.push('roof ' + sp.p.roof);
    if (Gm._.backOpts(arch, env.style).indexOf(sp.p.back) < 0) e.push('back ' + sp.p.back);
    const w = sp.flavor === 'gulf' && !palau ? ['lattice'] : sp.flavor === 'trop' && !palau ? ['brise'] : WIN[arch];
    if (w.indexOf(sp.p.win) < 0) e.push('win ' + sp.p.win);
    if (palau !== (sp.p.stands === 'bowl') || palau !== (sp.p.skin === 'palau')) e.push('stands/skin ' + sp.p.stands + '/' + sp.p.skin);
    if (palau && (sp.p.light === 'sun' || sp.p.light === 'cloudy')) e.push('luz de día en piel de Palau');
    if (sp.p.light === 'show' && sp.tier < 3) e.push('show sin tier 3');
    if (e.length) bad.push(key + '→' + arch + ': ' + e.join(', '));
  };
  for (const k in PLAN) chk(k, PLAN[k]);
  chk('IT:MAC', 'H3');
  ok(bad.length === 0, 'override de cada arquetipo (H1-H9): techo, fondo rival, ventanas, gradas y luz encajan con él' + (bad.length ? ' (' + bad.join(' | ') + ')' : ''));
  ok(W['IT:CUN'].arch === 'H6' && W['IT:CUN'].p.roof === 'louvre', "OVERRIDES['IT:CUN'] = {arch: 'H6'}: techo de lamas, no el de dos aguas de H3 (" + W['IT:CUN'].p.roof + ', ' + W['IT:CUN'].p.back + ')');
  const errs = Gm._.overrideErrors;
  ok(W['IT:BUS'].arch !== 'H9' && errs.some(x => /^IT:BUS\.arch/.test(x)), 'override imposible (H9 en tier 2) rechazado y anotado');
  ok(errs.some(x => /^IT:MAC\.roof/.test(x)), 'override de techo que no es del arquetipo rechazado y anotado');
  ok(Wb['IT:TRE'].p.scen === 'port' && Wb['IT:TRE'].arch === 'port' && Wb['IT:TRE'].p.surf === 0 && Wb['IT:TRE'].p.backdrop.split('+').every(x => x === 'city' || x === 'mountain'),
    'override de playa (scen: port): telón y oleaje de puerto (' + Wb['IT:TRE'].p.backdrop + ', surf ' + Wb['IT:TRE'].p.surf + ')');
  ok(!Wb['IT:MIL'].night && errs.some(x => /^IT:MIL:b\.hour/.test(x)), 'override de noche en tier 2 rechazado');
  ok(errs.length === 3, 'solo los 3 overrides imposibles se anotan (' + errs.length + ': ' + errs.join(' | ') + ')');
  // la tabla de serie no lleva overrides imposibles
  ok(G._.overrideErrors.length === 0, 'OVERRIDES de serie: 0 errores');
}

// ------------------------------------------------------------------ (f) instantánea
section('(f) Instantánea');
{
  const snap = { v: G.V, hall: {}, beach: {}, random: {}, career: {} };
  hall.forEach(s => { snap.hall[keyOf(s)] = fnv(J(s)); });
  beachQ.forEach(s => { snap.beach[keyOf(s)] = fnv(J(s)); });
  randH.forEach((s, i) => { snap.random['h' + (i + 1)] = fnv(J(s)); });
  randB.forEach((s, i) => { snap.random['b' + (i + 1) * 7919] = fnv(J(s)); });
  careers.forEach(c => { snap.career[c.seed] = fnv(c.clubs.map(o => J(o.sp)).join()); });
  const txt = JSON.stringify(snap, null, 1) + '\n';
  if (UPDATE || !fs.existsSync(SNAP)) {
    fs.writeFileSync(SNAP, txt);
    info((UPDATE ? 'UPDATE=1: ' : 'sin instantánea: ') + 'escrita ' + path.relative(ROOT, SNAP));
    ok(true, 'instantánea escrita');
  } else {
    const old = JSON.parse(fs.readFileSync(SNAP, 'utf8')), diff = [];
    ['hall', 'beach', 'random', 'career'].forEach(g => {
      const a = old[g] || {}, b = snap[g];
      new Set(Object.keys(a).concat(Object.keys(b))).forEach(k => { if (a[k] !== b[k]) diff.push(g + ':' + k); });
    });
    ok(diff.length === 0 && old.v === snap.v, 'instantánea sin cambios' + (diff.length ? ' (' + diff.length + ' cambian: ' + diff.slice(0, 10).join(', ') + '…; UPDATE=1 para aceptarlos)' : ''));
  }
}

// ------------------------------------------------------------------ (g) tiempo
section('(g) Tiempo');
{
  const times = [];
  for (let run = 0; run < 3; run++) {
    const VB3 = makeCtx(), G3 = VB3.VenueGen;
    const t0 = process.hrtime.bigint();
    hallClubs.forEach(k => { G3.spec(k, 'hall'); G3.spec(k, 'beach'); });
    for (let n = 1; n <= 200; n++) { G3.random('hall', n); G3.random('beach', n); }
    careers[0].clubs.forEach(o => G3.spec(o.info, 'beach'));
    const n = 390 * 2 + 400 + careers[0].clubs.length;
    times.push(Number(process.hrtime.bigint() - t0) / 1e6 / n);
  }
  times.sort((a, b) => a - b);
  const t1 = process.hrtime.bigint(); for (let r = 0; r < 3; r++) hallClubs.forEach(k => G.spec(k, 'hall')); const tc = Number(process.hrtime.bigint() - t1) / 1e6 / (390 * 3);
  info('tiempo medio por spec (contextos nuevos, mundo entero, coste repartido): ' + times.map(t => t.toFixed(3)).join(' / ') + ' ms');
  ok(times[1] < 0.5, 'tiempo medio por spec en un contexto nuevo, recorriendo el mundo entero (mediana de 3): ' + times[1].toFixed(3) + ' ms < 0,5');
  info('con el mundo ya calculado: ' + tc.toFixed(3) + ' ms por spec');
  // primera spec() en un proceso hijo NUEVO (JIT en frío, sin nada calculado): es la latencia real al empezar el primer partido.
  // Peores casos: la pista del país más grande (IT, 24 clubes) y la playa del ÚLTIMO país de leagues.js (evita las firmas de playa
  // de todos los anteriores). Tope: 150 ms en PC (el diseño admite 100-500 ms de tirón al montar en móvil).
  const { execFileSync } = require('child_process');
  const last = VB.Leagues.regions[VB.Leagues.regions.length - 1], lc = last.countries[last.countries.length - 1], lk = lc.divisions[0].clubs[0];
  const CASES = [['IT hall', { name: 'Voley Perugia', city: 'Perugia', cc: 'IT' }, 'hall'], [lc.code + ' beach (último país)', { name: lk.name, city: lk.city, cc: lc.code }, 'beach']];
  const CAP = 150, child = `
    const fs = require('fs'), vm = require('vm'), path = require('path'), R = process.argv[1];
    for (const f of ['js/leagues.js', 'js/venue-gen.js']) vm.runInThisContext(fs.readFileSync(path.join(R, f), 'utf8'), { filename: f });
    const a = JSON.parse(process.argv[2]), t0 = process.hrtime.bigint();
    globalThis.VB.VenueGen.spec(a[0], a[1]);
    const t1 = process.hrtime.bigint(); globalThis.VB.VenueGen.spec(a[0], a[1]); const t2 = process.hrtime.bigint();
    console.log(JSON.stringify([Number(t1 - t0) / 1e6, Number(t2 - t1) / 1e6]));`;
  CASES.forEach(([lbl, club, kind]) => {
    const runs = [0, 1, 2].map(() => JSON.parse(execFileSync(process.execPath, ['-e', child, ROOT, J([club, kind])], { encoding: 'utf8' }).trim()));
    const first = runs.map(r => r[0]).sort((a, b) => a - b), second = runs.map(r => r[1]).sort((a, b) => a - b);
    ok(first[1] < CAP && second[1] < 0.5, 'primera spec en un proceso nuevo, ' + lbl + ': ' + first.map(t => t.toFixed(1)).join(' / ') + ' ms (mediana < ' + CAP + '); la segunda ' + second[1].toFixed(3) + ' ms (< 0,5)');
  });
}

// ------------------------------------------------------------------ (h) coste
section('(h) Coste estimado');
{
  const B = G.BUDGET, hb = [].concat(hall, randH).map(s => ({ s, c: G.cost(s) })), bb = [].concat(beachQ, allCareer, randB).map(s => ({ s, c: G.cost(s) }));
  const own = hb.filter(o => !o.c.palau), pal = hb.filter(o => o.c.palau);
  const mx = (L, f) => L.reduce((m, o) => Math.max(m, f(o)), 0);
  ok(own.every(o => o.c.drawsLow <= B.hall.low && o.c.drawsMid <= B.hall.mid), 'pista H1-H7: dibujos propios ≤ 6 en baja y ≤ 9 en media/alta (máx ' + mx(own, o => o.c.drawsLow) + ' / ' + mx(own, o => o.c.drawsMid) + ')');
  const ot = own.filter(o => o.c.tris > B.hall.tris);
  ok(ot.length === 0, 'pista H1-H7: estática ≤ 40 k triángulos (máx ' + mx(own, o => o.c.tris) + ')' + (ot.length ? ' ' + ot.slice(0, 4).map(o => o.s.id + ' ' + o.c.tris).join(', ') : ''));
  ok(hb.every(o => o.c.emis <= B.hall.emis), 'pista: emisiva ≤ 4 k (máx ' + mx(hb, o => o.c.emis) + ')');
  ok(pal.every(o => o.c.drawsLow <= 1 && o.c.tris <= 5000), 'pista H8/H9: piel de Palau, +0 dibujos (+1 y ≤ 5 k la cúpula de H9) — ' + pal.length + ' sedes');
  ok(bb.every(o => o.c.tris <= B.beach.tris), 'playa: estática ≤ 32 k (máx ' + mx(bb, o => o.c.tris) + ')');
  ok(bb.every(o => o.c.drawsMid <= B.beach.extraNight && o.c.emis <= B.beach.emis), 'playa: los dibujos de Platja + 2 de noche, emisiva ≤ 4 k');
  info('media de triángulos de la estática: pista ' + Math.round(own.reduce((a, o) => a + o.c.tris, 0) / own.length) + ', playa ' + Math.round(bb.reduce((a, o) => a + o.c.tris, 0) / bb.length));
}

// ------------------------------------------------------------------ salidas
section('Salidas');
{
  fs.mkdirSync(OUT, { recursive: true });
  const A = G.ARCH, lines = [];
  lines.push('# Sedes generadas — arquetipos por país (receta V' + G.V + ')', '', 'Generado por `node tools/venuegen-test.js`. Pista: arquetipos H1-H9 (H1 GYM, H2 BÓVEDA, H3 MUNICIPAL, H4 LÁMINA, H5 MADERA, H6 MODERNO, H7 COLISEO, H8 ARENA, H9 DOME), tiers t0-t3, flavor regional y distancia mínima entre clubes del país. Playa (partido rápido): escenarios.', '');
  lines.push('| país | clubes | t0 | t1 | t2 | t3 | ' + A.join(' | ') + ' | arq. | firmas a×f×l | flavor | dist. mín | playa: escenarios |');
  lines.push('|' + Array(11 + A.length).fill('---').join('|') + '|');
  Object.keys(byCC).forEach(cc => {
    const L = byCC[cc].map(o => o.s), Lb = byCCb[cc].map(o => o.s);
    let mn = 99; for (let i = 0; i < L.length; i++) for (let j = 0; j < i; j++) mn = Math.min(mn, G.dist(L[i], L[j]));
    const sc = {}; Lb.forEach(s => { sc[s.p.scen] = (sc[s.p.scen] || 0) + 1; });
    lines.push('| ' + cc + ' | ' + L.length + ' | ' + [0, 1, 2, 3].map(t => L.filter(s => s.tier === t).length || '').join(' | ') + ' | ' +
      A.map(a => L.filter(s => s.arch === a).length || '').join(' | ') + ' | ' + new Set(L.map(s => s.arch)).size + ' | ' + new Set(L.map(s => s.arch + '/' + s.p.back + '/' + s.p.light)).size + ' | ' +
      L.filter(s => s.flavor).length + ' | ' + mn + ' | ' + Object.keys(sc).sort().map(k => k + ' ' + sc[k]).join(', ') + ' |');
  });
  lines.push('', '## Total', '', A.map(a => a + ' ' + hall.filter(s => s.arch === a).length).join(' · '), '');
  fs.writeFileSync(path.join(OUT, 'arquetipos.md'), lines.join('\n'));
  const q = v => /[",;\n]/.test(String(v)) ? '"' + String(v).replace(/"/g, '""') + '"' : String(v);
  const rows = [['cc', 'club', 'ciudad', 'tipo', 'sede', 'short', 'pad', 'arquetipo', 'tier', 'idioma'].join(',')];
  hall.forEach((s, i) => {
    const k = hallClubs[i], b = beachQ[i], lang = G._.langOf(s.cc, k.city, s.seed);
    rows.push([s.cc, k.name, k.city, 'pista', s.name, s.short, s.pad, s.arch, s.tier, lang].map(q).join(','));
    rows.push([b.cc, k.name, k.city, 'playa', b.name, b.short, b.pad, b.arch, b.tier, G._.langOf(b.cc, k.city, b.seed)].map(q).join(','));
  });
  fs.writeFileSync(path.join(OUT, 'nombres.csv'), '﻿' + rows.join('\r\n') + '\r\n');
  info(path.relative(ROOT, path.join(OUT, 'arquetipos.md')) + ' · ' + path.relative(ROOT, path.join(OUT, 'nombres.csv')) + ' (' + (rows.length - 1) + ' filas)');
  ok(fs.existsSync(path.join(OUT, 'nombres.csv')) && fs.existsSync(path.join(OUT, 'arquetipos.md')), 'salidas escritas');
  if (VERBOSE) { const ex = {}; hall.forEach((s, i) => { const l = G._.langOf(s.cc, hallClubs[i].city, s.seed); (ex[l] = ex[l] || []).push(s.name); }); for (const l in ex) console.log('  ' + l + ': ' + ex[l].slice(0, 6).join(' · ')); }
}

console.log('\n' + passes + ' comprobaciones, ' + fails + ' fallos');
if (fails) { console.log('HAY FALLOS'); process.exit(1); }
console.log('TODO OK');
