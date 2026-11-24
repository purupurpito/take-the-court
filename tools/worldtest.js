#!/usr/bin/env node
/* TAKE THE COURT — tools/worldtest.js (owner: ui_main)
 * Prueba headless de lo que el sprint S2-S4 (tarea T11) añade al «mundo» de la Carrera (js/career-world.js y js/career-world-ui.js):
 *  1. Escudos paródicos (crestOf): deterministas (también tras JSON), forma, partición y emblema válidos, contraste ≥ 0,18,
 *     ninguna terna repetida dentro de una liga (también tras varias temporadas con ascensos), txt === k.short, sin Math.random.
 *  2. crestSVG: id de clipPath único por instancia, mini sin banda, grande con el año, sin career-world → muestra de equipación.
 *  3. Vitrina de playa (20 huecos): trofeos fabricados de cada tipo y circuito, premios por id, sin contar doble, «Copa Rara» a other.
 *  4. Vitrina de pista (ES con 2ª, IT, BR y un país sin 2ª): grupos, internacional = intlFor (rangos 1 y 2), liga de otro país añadida.
 *  5. Desbloqueos de Vestuario (solo lectura, con un VB.Look falso; sin él, unlock null).
 *  6. trophyCaseHTML: textos exactos, aria-label, sin «·», «undefined» ni «1.er»; T21: bloques de ≤ 3 huecos (tcBlocks) con las
 *     cabeceras cubriendo justo sus huecos, grupos largos partidos y los cortos juntos (pista: Liga + Copa).
 *  7. newsBoss (C3) y la escena ses1 de Faro (primera sesión de entrenamiento de la Carrera).
 * Uso: node tools/worldtest.js   Sale con 1 si algo falla; acaba en «TODO OK».
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
let fails = 0, passes = 0;
function ok(c, msg) { if (!c) { fails++; console.log('  FALLO: ' + msg); } else { passes++; console.log('  ok: ' + msg); } }
function section(t) { console.log('\n== ' + t); }

function boot(opts) {
  opts = opts || {};
  const mem = {};
  const ctx = { console, Math: Object.create(Math), Date, JSON, Set, Map, WeakMap, localStorage: { getItem: k => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: k => { delete mem[k]; } } };
  ctx.globalThis = ctx; ctx.window = ctx;
  vm.createContext(ctx);
  const files = ['js/sim.js', 'js/prog.js', 'js/badges.js', 'js/leagues.js', 'js/career.js', 'js/career-life.js'];
  if (!opts.noWorld) files.push('js/career-world.js');
  if (opts.ui) files.push('js/career-world-ui.js');
  for (const f of files) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  return { ctx, mem, VB: ctx.VB };
}
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, ch => '&#' + ch.charCodeAt(0) + ';');
const HLP = { esc, sp: (a, k) => a.filter(p => p !== '' && p != null).join(k === 'v' ? ' | ' : ' ◆ '), kitSw: (k, big) => '<i class="cr-kit' + (big ? ' big' : '') + '"></i>' };
HLP.crest = null;   // se rellena con la UI

const B = boot({ ui: true }), VB = B.VB, C = VB.Career, W = VB.CareerWorld, WUI = VB.CareerWorldUI;
ok(W && W.crestOf && W.trophyCase && W.newsBoss, 'VB.CareerWorld exporta crestOf, trophyCase y newsBoss');
ok(WUI && WUI.crestSVG && WUI.trophyCaseHTML, 'VB.CareerWorldUI exporta crestSVG y trophyCaseHTML');
HLP.crest = (k, px, o) => WUI.crestSVG(k, px, o);

// ------------------------------------------------------------------ 1. escudos
section('1. Escudos: deterministas, válidos, con contraste y sin ternas repetidas por liga');
function crestChecks(c, label, leagueKey) {
  const hall = c.mode === 'hall', EM = hall ? W.CREST_EMB_H : W.CREST_EMB;
  const rnd = B.ctx.Math.random; let rndCalls = 0; B.ctx.Math.random = () => { rndCalls++; return rnd(); };
  const a = c.clubs.map(k => W.crestOf(k, c)), b = c.clubs.map(k => W.crestOf(k, c));
  const cj = JSON.parse(JSON.stringify(c)), j = cj.clubs.map(k => W.crestOf(k, cj));
  B.ctx.Math.random = rnd;
  ok(rndCalls === 0, label + ': sin Math.random');
  ok(JSON.stringify(a) === JSON.stringify(b) && JSON.stringify(a) === JSON.stringify(j), label + ': deterministas (dos llamadas y tras JSON)');
  ok(a.every(x => W.CREST_SHAPES.indexOf(x.shape) >= 0 && W.CREST_DIVS.indexOf(x.div) >= 0 && EM.indexOf(x.emblem) >= 0), label + ': forma, partición y emblema válidos' + (hall ? ' (sin ola ni sol)' : ''));
  const lowC = a.map((x, i) => [Math.abs(W._lum(x.c1) - W._lum(x.c2)), c.clubs[i].name]).filter(x => x[0] < W.CREST_MIN - 1e-9);
  ok(!lowC.length, label + ': contraste c1/c2 ≥ ' + W.CREST_MIN + (lowC.length ? ' (falla ' + lowC[0][1] + ' ' + lowC[0][0].toFixed(3) + ')' : ' (mín. ' + Math.min(...a.map(x => Math.abs(W._lum(x.c1) - W._lum(x.c2)))).toFixed(3) + ')'));
  ok(a.every((x, i) => x.txt === c.clubs[i].short), label + ': txt === k.short');
  ok(a.every(x => x.year >= 1800 && x.year <= 2100), label + ': año de fundación (' + a[0].year + ')');
  const dup = [], seen = {};
  c.clubs.forEach((k, i) => { const t = leagueKey(k) + '|' + a[i].shape + a[i].div + a[i].emblem; if (seen[t]) dup.push(k.name + ' = ' + seen[t]); seen[t] = k.name; });
  ok(!dup.length, label + ': ninguna terna repetida dentro de una liga' + (dup.length ? ' (' + dup[0] + ')' : ''));
  const shapes = new Set(a.map(x => x.shape)), divs = new Set(a.map(x => x.div)), embs = new Set(a.map(x => x.emblem));
  ok(shapes.size === 5 && divs.size === 5 && embs.size === EM.length, label + ': se usan todas las formas, particiones y emblemas');
  return a;
}
let cb;
{
  B.mem['make-the-cut.career'] = undefined; delete B.mem['make-the-cut.career'];
  cb = C.create({ name: 'Escudo Prueba', num: 7, role: 'cr', seed: 4242, autoClub: true });
  const a0 = crestChecks(cb, 'playa (40)', k => 'L' + k.lvl);
  // otra semilla: las ciudades son las mismas por id, los colores no
  const B2 = boot(), c2 = B2.VB.Career.create({ name: 'Otra', seed: 99, autoClub: true }), a2 = c2.clubs.map(k => B2.VB.CareerWorld.crestOf(k, c2));
  const tern = x => x.shape + x.div + x.emblem;
  ok(c2.clubs.every((k, i) => k.city === cb.clubs[i].city) && a2.every((x, i) => tern(x) === tern(a0[i])), 'playa: la semilla del escudo es la ciudad (misma terna con otra semilla y otros nombres)');
  ok(a2.some((x, i) => x.c1 !== a0[i].c1), 'playa: los colores salen del kit de cada carrera');
  // tras varias temporadas (ascensos y descensos), sigue sin repetir terna por liga
  let g = 0; while (C.get().season < 4 && g++ < 200) { const c = C.get(); if (c.phase === 'off') C.stay ? C.stay(1) : C.newSeason(); else C.simulateNext(); }
  cb = C.get();
  const moved = cb.clubs.filter(k => k.lvl !== Math.floor(k.id / 8)).length;
  crestChecks(cb, 'playa T' + cb.season + ' (' + moved + ' clubes cambiados de circuito)', k => 'L' + k.lvl);
  // crestOf sin c: usa la Carrera guardada (mismo resultado) y, con 'beach' y un club suelto, la terna base
  ok(JSON.stringify(W.crestOf(cb.clubs[5])) === JSON.stringify(W.crestOf(cb.clubs[5], cb)), 'crestOf(k) sin la Carrera: la guardada, mismo escudo');
  const loose = W.crestOf({ id: 999, name: 'Club Suelto', city: 'Nowhere', short: 'SUE', kit: { shirt: 0xf2f4f8, accent: 0xffffff } }, 'beach');
  ok(loose && loose.c2 === 0x1d1530 && loose.txt === 'SUE', 'club suelto: escudo base; camiseta y segundo color blancos → el segundo pasa a tinta');
}
let ch;
{
  const B3 = boot(), C3 = B3.VB.Career;
  ch = C3.create({ mode: 'hall', name: 'Escudo Pista', num: 8, pos: 'OH', seed: 31337, now: 1 });
  ok(ch.clubs.length >= 300, 'pista: ' + ch.clubs.length + ' clubes');
  // (los escudos de la carrera de pista se miran con el W de su propio contexto)
  const Wsave = W;
  const W3 = B3.VB.CareerWorld;
  const a = ch.clubs.map(k => W3.crestOf(k, ch)), b = JSON.parse(JSON.stringify(ch)).clubs.map(k => W3.crestOf(k, ch));
  ok(JSON.stringify(a) === JSON.stringify(b), 'pista: deterministas');
  ok(a.every(x => W3.CREST_EMB_H.indexOf(x.emblem) >= 0 && x.emblem !== 'ola' && x.emblem !== 'sol'), 'pista: sin ola ni sol');
  ok(a.every(x => Math.abs(W3._lum(x.c1) - W3._lum(x.c2)) >= W3.CREST_MIN - 1e-9), 'pista: contraste ≥ 0,18 en los ' + a.length);
  ok(a.every((x, i) => x.txt === ch.clubs[i].short), 'pista: txt === k.short');
  const seen = {}, dup = [], seenC = {}, dupC = [];
  ch.clubs.forEach((k, i) => {
    const t = a[i].shape + a[i].div + a[i].emblem;
    if (seen[k.lid + t]) dup.push(k.name); seen[k.lid + t] = 1;
    if (seenC[k.cc + t]) dupC.push(k.name); seenC[k.cc + t] = 1;
  });
  ok(!dup.length, 'pista: ninguna terna repetida dentro de una liga' + (dup.length ? ' (' + dup[0] + ')' : ''));
  ok(!dupC.length, 'pista: ni dentro de un país (1ª y 2ª, por los ascensos)');
  ok(Wsave === W, '(contextos separados)');
}

// ------------------------------------------------------------------ 2. SVG
section('2. crestSVG');
{
  WUI.css && (HLP.esc = esc);
  const k = cb.clubs[3];
  const s1 = WUI.crestSVG(k, 72, { c: cb }), s2 = WUI.crestSVG(k, 72, { c: cb }), m = WUI.crestSVG(k, 22, { c: cb }), s40 = WUI.crestSVG(k, 40, { c: cb, label: 'Escudo de ' + k.name });
  const id = s => (/clipPath id="([^"]+)"/.exec(s) || [])[1];
  ok(id(s1) && id(s2) && id(s1) !== id(s2) && (s1.match(new RegExp('url\\(#' + id(s1) + '\\)', 'g')) || []).length === 2, 'id de clipPath único por instancia (' + id(s1) + ', ' + id(s2) + ') y usado 2 veces');
  ok(/width="72" height="81"/.test(s1) && /viewBox="0 0 64 72"/.test(s1), 'tamaño 72 → 72×81, viewBox 0 0 64 72');
  const yr = W.crestOf(k, cb).year;
  ok(s1.indexOf('>' + yr + '</text>') > 0 && s1.indexOf('>' + esc(k.short) + '</text>') > 0, 'grande (72): banda con «' + k.short + '» y año ' + yr);
  ok(!/<text/.test(m) && /cw-crest-m/.test(m), 'mini (22): sin banda ni año');
  ok(s40.indexOf('>' + yr + '</text>') < 0 && /role="img" aria-label="Escudo de /.test(s40) && /aria-hidden="true"/.test(s1), '40: banda sin año; con label → role img; sin label → aria-hidden');
  ok(![s1, m, s40].some(s => /undefined|NaN|null/.test(s)), 'sin undefined, NaN ni null');
  const tags = s => (s.match(/<(svg|g|defs|clipPath|text)\b/g) || []).length === (s.match(/<\/(svg|g|defs|clipPath|text)>/g) || []).length;
  ok(tags(s1) && tags(m) && tags(s40), 'etiquetas equilibradas');
  // sin career-world.js: la muestra de equipación (la de HLP.kitSw)
  const Bn = boot({ noWorld: true, ui: true }), U2 = Bn.VB.CareerWorldUI;
  U2.trophyCaseHTML(cb, HLP);   // (fija H)
  ok(U2.crestSVG(k, 40) === HLP.kitSw(k.kit, false) && U2.crestSVG(k, 72) === HLP.kitSw(k.kit, true), 'sin career-world.js: crestSVG → kitSw');
  ok(U2.trophyCaseHTML(cb, HLP) === '', 'sin career-world.js: sin vitrina (career-ui enseña la lista de hoy)');
}

// ------------------------------------------------------------------ 3. vitrina de playa
section('3. Vitrina de playa (20 huecos)');
{
  const Bp = boot({ ui: true }), Cp = Bp.VB.Career, Wp = Bp.VB.CareerWorld;
  const c = Cp.create({ name: 'Vitrina Playa', num: 5, role: 'atk', seed: 777 });
  let t = Wp.trophyCase(c);
  ok(t.total === 20 && t.got === 0 && !t.other.length, 'carrera nueva: 20 huecos y 0 ganados (' + t.total + ', ' + t.got + ')');
  const LG = Cp.LEAGUES, grp = {}; t.slots.forEach(s => { grp[s.group] = (grp[s.group] | 0) + 1; });
  ok(LG.every((L, i) => grp[L.short] === (i < LG.length - 1 ? 3 : 2)) && grp.Premios === 6, 'una fila por circuito (3 huecos; el Mundial 2) y 6 premios: ' + JSON.stringify(grp));
  ok(t.slots.filter(s => s.kind === 'premio').map(s => s.id).join() === 'aw-mvp,aw-pts,aw-ace,aw-blk,aw-dig,aw-rook', 'premios de playa (sin Mejor colocador)');
  const need = { liga: 'Gana el circuito', copa: 'Gana el Open', ascenso: 'Sube de circuito' };
  ok(t.slots.every(s => s.kind === 'premio' ? s.need === (s.id === 'aw-rook' ? 'Una vez, con 23 años o menos' : 'Premio de la gala') : s.need === need[s.kind]), 'requisitos exactos de los huecos vacíos');
  // un trofeo de cada tipo y circuito (como los guarda career.js), 2 premios con su award y su copia 'premio', uno viejo sin award y uno raro
  const deL = L => (L.art === 'el' ? 'del ' : 'de la ') + L.name;
  LG.forEach((L, i) => {
    c.trophies.push({ season: i + 1, kind: 'liga', name: L.name, club: 'X', d: 'normal' });
    c.trophies.push({ season: i + 1, kind: 'copa', name: L.cup, club: 'X', d: i === 2 ? 'easy' : 'normal' });
    if (i < LG.length - 1) c.trophies.push({ season: i + 1, kind: 'ascenso', name: 'Ascenso ' + Cp.toL(LG[i + 1]), club: 'X' });
  });
  c.trophies.push({ season: 6, kind: 'liga', name: LG[0].name, club: 'Y' });   // 2ª vez
  [['mvp', 'MVP', 2], ['rook', 'Revelación', 1]].forEach(([id, nm, s]) => {
    const name = nm + ' ' + deL(LG[0]);
    c.life.awards.push({ season: s, id, name, club: 'X' }); c.trophies.push({ season: s, kind: 'premio', name, club: 'X' });
  });
  c.trophies.push({ season: 3, kind: 'premio', name: 'Muro del año ' + deL(LG[1]), club: 'X' });   // guardado viejo: premio sin award
  c.trophies.push({ season: 4, kind: 'copa', name: 'Copa Rara', club: 'X' });
  t = Wp.trophyCase(c);
  const by = id => t.slots.filter(s => s.id === id)[0];
  ok(t.got === 17, 'cada trofeo en su hueco: 14 títulos + 3 premios = 17 de 20 (' + t.got + ')');
  ok(by('b0-liga').won.map(w => w.season).join() === '1,6', 'Circuito Regional ganado 2 veces (T1, T6)');
  ok(by('b4-copa').won.length === 1 && by('b4-copa').name === LG[4].cup, 'Open del Mundial: ' + LG[4].cup);
  ok(by('aw-mvp').won.length === 1 && by('aw-rook').won.length === 1, 'premios por id: MVP y Revelación, una vez cada uno (sin contar doble el trofeo «premio»)');
  ok(by('aw-blk').won.length === 1 && by('aw-blk').won[0].season === 3, 'premio viejo sin award: casa por el nombre (Muro del año)');
  ok(t.other.length === 1 && t.other[0].name === 'Copa Rara' && t.other[0].group === 'Otros títulos', '«Copa Rara» va a Otros títulos');
  ok(by('b2-copa').won[0].d === 'easy', 'cada título guarda su dificultad');
  // HTML
  const h = Bp.VB.CareerWorldUI.trophyCaseHTML(c, HLP);
  ok(/<h3>Vitrina <span class="muted">\(17 de 20\)<\/span><\/h3>/.test(h), 'cabecera «Vitrina (17 de 20)»');
  ok(h.indexOf('aria-label="Circuito Regional: ganado 2 veces, temporadas 1 y 6"') > 0, 'aria-label de un hueco ganado 2 veces');
  ok(h.indexOf('aria-label="Mejor sacador: sin ganar. Premio de la gala"') > 0, 'aria-label de un hueco vacío');
  ok(h.indexOf('×2 | T1, T6') > 0, 'línea «×2 | T1, T6»');
  ok(tcHead(h, 'Otros títulos') && tcHead(h, LG[0].short), 'grupos por circuito y «Otros títulos»');
  const bl = tcBlocks(h);
  ok(tcBlocksOk(bl), 'T21: bloques de 1 a 3 huecos, cabeceras que cubren justo sus huecos (' + bl.map(b => b.slots).join('+') + ')');
  ok(bl.filter(b => b.heads.some(x => x[0] === 'Premios')).length === 1 && bl.some(b => b.heads.length === 1 && b.heads[0][0] === 'Premios' && b.slots === t.slots.filter(x => x.group === 'Premios').length) && !bl.some(b => b.heads.some(x => x[2])), 'T24: Premios entero en un bloque, en filas de 3 (sin continuación en otra columna)');
  ok(LG.every(L => bl.some(b => b.heads.length === 1 && b.heads[0][0] === L.short)), 'T21: cada circuito, su propio bloque');
  ok(!/·|undefined|NaN|1\.er|2\.º/.test(h), 'sin «·», undefined, NaN ni «1.er»');
  ok((h.match(/class="tc-slot /g) || []).length === 21, '21 huecos pintados (20 + 1 de Otros)');
  // dificultad: solo si la carrera ha usado algo que no sea Normal (aquí un Open en Fácil)
  ok(h.indexOf('T3 | ' + Cp.CDIFF.easy.name) > 0, 'dificultad más fácil en la línea del título (diffUsed): «T3 | ' + Cp.CDIFF.easy.name + '»');
  // puro: no toca el guardado
  const raw0 = JSON.stringify(c); Wp.trophyCase(c); Bp.VB.CareerWorldUI.trophyCaseHTML(c, HLP);
  ok(JSON.stringify(c) === raw0, 'trophyCase y trophyCaseHTML no cambian la carrera');
}

// T21: bloques de la vitrina (cada .tc-grid): [{heads: [[texto, span]], slots: n}] (texto '' = cabecera de continuación, oculta)
function tcBlocks(h) {
  return h.split(/<div class="tc-grid(?: tall)?">/).slice(1).map(b => ({
    heads: [...b.matchAll(/<h4 class="tc-g( s([23]))?"( aria-hidden="true")?>([^<]*)<\/h4>/g)].map(m => [m[3] ? '' : m[4], m[2] ? +m[2] : 1, !!m[3] && m[4] === '&nbsp;']),
    slots: (b.match(/class="tc-slot /g) || []).length
  }));
}
function tcHead(h, g) { return new RegExp('<h4 class="tc-g( s[23])?">' + g.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '</h4>').test(h); }
// (T24: un grupo de más de 3 huecos va entero en un bloque «alto», con una sola cabecera de 3 y filas de 3)
function tcBlocksOk(bl) { return bl.length > 0 && bl.every(b => b.heads.every(x => x[0] || x[2]) && (b.slots > 3 ? b.heads.length === 1 && b.heads[0][1] === 3 : b.slots >= 1 && b.heads.reduce((a, x) => a + x[1], 0) === b.slots)); }

// ------------------------------------------------------------------ 4. vitrina de pista
section('4. Vitrina de pista (ES, IT, BR y un país sin 2ª)');
{
  const Bh = boot({ ui: true }), Ch = Bh.VB.Career, Wh = Bh.VB.CareerWorld;
  const c = Ch.create({ mode: 'hall', name: 'Vitrina Pista', num: 8, pos: 'OH', seed: 2468, now: 1 });
  const lg = id => c.leagues.filter(L => L.id === id)[0];
  const no2 = c.leagues.filter(L => L.lvl === 1 && !lg(L.cc + '2')).map(L => L.cc)[0];
  const ccs = ['ES', 'IT', 'BR'].filter(cc => lg(cc + '1')).concat(no2 ? [no2] : []);
  ok(ccs.length === 4, 'países: ' + ccs.join(', '));
  ccs.forEach(cc => {
    const k = c.clubs.filter(x => x.cc === cc)[0]; c.myClub = k.id;
    const t = Wh.trophyCase(c), G = {}; t.slots.forEach(s => { G[s.group] = (G[s.group] | 0) + 1; });
    const has2 = !!lg(cc + '2'), it = Ch.hall.intlFor(c, cc).filter(x => x.rank <= 2);
    const want = { Liga: has2 ? 2 : 1, Copa: 1, Internacional: it.length, Ascenso: has2 ? 1 : 0, Premios: 7 };
    ok(Object.keys(want).every(g => (G[g] | 0) === want[g]) && t.got === 0, cc + ': ' + JSON.stringify(G) + ' (total ' + t.total + ')');
    const intl = t.slots.filter(s => s.kind === 'intl').map(s => s.name).join('|');
    ok(intl === it.map(x => x.name).join('|'), cc + ': Internacional = intlFor rangos 1 y 2 (' + intl + ')');
    const cup = t.slots.filter(s => s.kind === 'copa')[0];
    ok(cup && cup.name === ((c.cups[cc] && c.cups[cc].name) || 'Copa Nacional'), cc + ': copa nacional «' + (cup && cup.name) + '»');
    if (has2) ok(t.slots.some(s => s.kind === 'ascenso' && s.name === 'Ascenso a la ' + lg(cc + '1').name && s.need === 'Sube a la 1ª'), cc + ': «Ascenso a la ' + lg(cc + '1').name + '»');
    ok(t.slots.filter(s => s.kind === 'premio').some(s => s.id === 'aw-set'), cc + ': 7 premios con Mejor colocador');
  });
  // títulos ganados: en tu país (en su hueco) y una liga de otro país (hueco añadido en «Liga»)
  const es = c.clubs.filter(x => x.cc === 'ES')[0]; c.myClub = es.id;
  c.trophies.push({ season: 1, kind: 'liga', name: lg('ES1').name, club: es.name });
  c.trophies.push({ season: 2, kind: 'copa', name: c.cups.ES.name, club: es.name });
  c.trophies.push({ season: 3, kind: 'intl', name: Ch.hall.intlFor(c, 'ES')[0].name, club: es.name });
  c.trophies.push({ season: 4, kind: 'liga', name: lg('IT1').name, club: 'Otro' });
  c.trophies.push({ season: 5, kind: 'intl', name: 'Copa Lejana', club: 'Otro' });
  c.life.awards.push({ season: 2, id: 'set', name: 'Mejor colocador de la ' + lg('ES1').name, club: es.name });
  const t = Wh.trophyCase(c), G = t.slots.map(s => s.group);
  ok(t.slots.some(s => s.group === 'Liga' && s.name === lg('IT1').name && s.won.length === 1), 'liga de otro país → hueco añadido en «Liga» (' + lg('IT1').name + ')');
  ok(t.slots.some(s => s.group === 'Internacional' && s.name === 'Copa Lejana'), 'otra internacional ganada → hueco añadido');
  ok(G.join() === G.slice().sort((a, b) => ['Liga', 'Copa', 'Internacional', 'Ascenso', 'Premios'].indexOf(a) - ['Liga', 'Copa', 'Internacional', 'Ascenso', 'Premios'].indexOf(b)).join(), 'grupos en orden: Liga, Copa, Internacional, Ascenso, Premios');
  ok(t.got === 6 && !t.other.length, '6 ganados (liga, copa, intl, liga IT, intl lejana, colocador): ' + t.got);
  const h = Bh.VB.CareerWorldUI.trophyCaseHTML(c, HLP);
  ok(['Liga', 'Copa', 'Internacional', 'Ascenso', 'Premios'].every(g => tcHead(h, g)), 'títulos de grupo de pista');
  const bh = tcBlocks(h);
  ok(tcBlocksOk(bh), 'T21 pista: bloques de 1 a 3 huecos con sus cabeceras (' + bh.map(b => b.heads.map(x => (x[0] || '…') + ' ' + x[1]).join(' + ')).join(' | ') + ')');
  ok(bh.length < t.slots.length / 2, 'T21 pista: los grupos cortos comparten bloque (' + bh.length + ' bloques para ' + t.slots.length + ' huecos)');
  ok(!/·|undefined|NaN|1\.er|circuito|\bOpen\b/i.test(h.replace(/Sube a la 1ª/g, '')), 'sin «·», undefined, «1.er», circuito ni Open');
  ok(h.indexOf('aria-label="' + lg('ES1').name + ': ganado 1 vez, temporada 1"') > 0, 'aria-label de pista');
}

// ------------------------------------------------------------------ 5. desbloqueos de Vestuario (solo lectura)
section('5. Vitrina y Vestuario (VB.Look con guarda)');
{
  const Bl = boot({ ui: true }), Cl = Bl.VB.Career, Wl = Bl.VB.CareerWorld;
  const c = Cl.create({ name: 'Look Prueba', seed: 55 });
  ok(Wl.trophyCase(c).slots.every(s => s.unlock === null), 'sin VB.Look: unlock null en todos');
  const own = {};
  Bl.VB.Look = { CATALOG: [{ id: 'doradas', name: 'Zapatillas doradas', venue: 'P', unlock: [{ ach: 'mvp' }, { award: 'mvp' }] }, { id: 'reloj', name: 'Reloj gordo', unlock: [{ ach: 'up' }] },
    { id: 'medalla', name: 'Medalla', unlock: [{ ach: 't1' }] }, { id: 'gafas', name: 'Gafas', unlock: [{ shop: 100 }] }], owned: id => !!own[id] };
  let t = Wl.trophyCase(c), by = id => t.slots.filter(s => s.id === id)[0];
  ok(by('aw-mvp').unlock === null, 'playa: las Zapatillas doradas (solo pista) no salen en el MVP');
  ok(by('b0-up').unlock && by('b0-up').unlock.name === 'Reloj gordo' && by('b1-liga').unlock.name === 'Medalla', 'ascenso → Reloj gordo; títulos → Medalla');
  ok(by('aw-pts').unlock === null, 'premio sin objeto ligado → null');
  const h = Bl.VB.CareerWorldUI.trophyCaseHTML(c, HLP);
  ok(h.indexOf('<small class="tc-ul">Desbloquea: Reloj gordo</small>') > 0, 'línea «Desbloquea: Reloj gordo»');
  own.reloj = 1; t = Wl.trophyCase(c);
  ok(by('b0-up').unlock === null || t.slots.filter(s => s.id === 'b0-up')[0].unlock === null, 'si ya es tuyo, no sale');
  Bl.VB.Look.owned = () => { throw new Error('x'); };
  ok(Wl.trophyCase(c).slots.every(s => s.unlock === null), 'VB.Look roto: no rompe la vitrina');
  const ch = Cl.create({ mode: 'hall', name: 'Look Pista', num: 8, pos: 'OH', seed: 31, now: 1 });
  Bl.VB.Look.owned = () => false;
  const th = Wl.trophyCase(ch);
  ok(th.slots.filter(s => s.id === 'aw-mvp')[0].unlock.name === 'Zapatillas doradas', 'pista: MVP → Zapatillas doradas');
}

// ------------------------------------------------------------------ 6. newsBoss y ses1
section('6. Noticia del jefe (C3) y escena ses1 de Faro (entrenos)');
{
  const Bn = boot({ ui: true }), Cn = Bn.VB.Career, Wn = Bn.VB.CareerWorld;
  const c = Cn.create({ name: 'Cazajefes Prueba', num: 4, seed: 321, autoClub: true });
  for (let i = 0; i < 3; i++) Cn.simulateNext();
  const cc = Cn.get(), rk = cc.clubs.filter(k => k.lvl === Cn.myClub(cc).lvl && k.id !== cc.myClub)[0];
  const n0 = cc.world.news.length;
  const x = Wn.newsBoss(cc, { name: 'Belmonte', nick: 'Muro', style: 'muro', club: rk.id, num: 7 });
  ok(x && x.t === 'Belmonte «Muro» cae ante Cazajefes Prueba' && x.k === 'boss' && x.me === 1, 'titular exacto: «' + (x && x.t) + '»');
  ok(x && x.c[0] === rk.id && x.c[1] === cc.myClub && x.w === cc.week && cc.world.news.length === n0 + 1, 'ids [club del jefe, tu club], jornada ' + (x && x.w));
  ok(Wn.newsBoss(cc, { name: 'Belmonte', nick: 'Muro', club: rk.id }) === null && cc.world.news.length === n0 + 1, 'una sola por jefe y temporada');
  ok(Wn.newsWhen(x) === 'T' + cc.season + ' J' + x.w && Wn.news(cc, 1)[0].id === x.id, 'antetítulo «' + Wn.newsWhen(x) + '» y la primera de la lista');
  const y = Wn.newsBoss(cc, { name: 'Sanz', club: rk.id + 1 });
  ok(y && y.t === 'Sanz cae ante Cazajefes Prueba', 'sin apodo: «' + (y && y.t) + '»');
  ok(Wn.newsBoss(null, {}) === null && Wn.newsBoss(cc, null) === null, 'con datos que faltan: null sin romper');
  const h = Bn.VB.CareerWorldUI.newsHTML(cc, HLP);
  ok(h.indexOf('Belmonte «Muro» cae ante Cazajefes Prueba') > 0, 'sale en Liga › Noticias');
  // ses1
  ok(Wn.BEATS.ses1 && Wn.BEATS.ses1.t === 'El primer entreno' && Wn.BEAT_ORDER[Wn.BEAT_ORDER.length - 1] === 'ses1', 'BEATS.ses1 «El primer entreno», al final de BEAT_ORDER');
  ok(Wn.BEATS.ses1.l.join(' ') === 'Primer entreno hecho. Puedes hacer hasta 3 antes de cada partido: suben un pelín, pero cansan. Jugado de verdad rinde más que en rápido. Y tu entrenador se fija en cómo entrenas.', 'frases exactas de playa');
  ok(/elegir el seis/.test(Wn.BEATS_H.ses1[1]) && !/arena|playa|circuito|\bopen\b|pareja/i.test(Wn.BEATS_H.ses1.join(' ')), 'pista: «…para elegir el seis»');
  ok(Wn.BEATS.ses1.l.concat(Wn.BEATS_H.ses1).every(l => l.length <= Wn.LINE_MAX), 'frases ≤ ' + Wn.LINE_MAX);
  const q0 = cc.world.mentor.q.length + cc.inbox.length;
  ok(Wn._beat(cc, 'ses1') === true && Wn._beat(cc, 'ses1') === false, 'ses1 se dispara una vez');
  ok(cc.world.mentor.q.length + cc.inbox.length === q0 + 1, 'a la cola de Faro (o a la bandeja si se cae)');
  const hb = Cn.create({ mode: 'hall', name: 'Pista Entreno', num: 8, pos: 'OH', seed: 77, now: 1 });
  Wn._beat(hb, 'ses1');
  const qq = hb.world.mentor.q.filter(q => q.id === 'ses1')[0] || null;
  ok(!qq || /elegir el seis/.test(qq.l[1]), 'pista: la escena usa BEATS_H');
  // la primera sesión de entrenamiento de la carrera (career.js sessDo → gancho 'sess') la dispara, una sola vez
  {
    const Bs = boot({ ui: true }), Cs = Bs.VB.Career;
    let cs = Cs.create({ name: 'Primer Entreno', num: 6, seed: 4321, autoClub: true });
    cs = Cs.get(); const inf = Cs.trainInfo(cs), id = inf && inf.drills[0] && inf.drills[0].id;
    const has = x => x.world.mentor.q.some(q => q.id === 'ses1') || x.inbox.some(m => m.t === 'Faro: el primer entreno');
    ok(inf && inf.can && !has(cs) && !cs.world.mentor.seen.ses1, 'antes de entrenar: sin escena ses1');
    const r1 = Cs.trainSession(id, 'quick'); cs = Cs.get();
    ok(r1 && r1.ok && has(cs) && cs.world.mentor.seen.ses1 === 1, 'la primera sesión dispara ses1');
    Cs.trainSession(id, 'quick'); cs = Cs.get();
    ok(cs.world.mentor.seen.ses1 === 1 && cs.world.mentor.q.filter(q => q.id === 'ses1').length <= 1, 'la segunda no la repite');
    ok(Array.isArray(cs.ts.md) && cs.ts.md.reduce((a, b) => a + b, 0) === 2, 'c.ts.md cuenta las sesiones por medalla (' + cs.ts.md.join() + ')');
  }
}

// ------------------------------------------------------------------ 7. árbitros con nombre y carácter
section('7. Árbitros: colegio por liga, designación, libreta y «Apagado»');
{
  const Ba = boot(), Ka = Ba.VB.Career, Wa = Ba.VB.CareerWorld, src = fs.readFileSync(path.join(ROOT, 'js/acta.js'), 'utf8') + fs.readFileSync(path.join(ROOT, 'js/career.js'), 'utf8');
  ok(Wa.arbPanel && Wa.arbDesigna && Wa.refOf && Wa.arbLine, 'CareerWorld exporta arbPanel, arbDesigna, refOf y arbLine');
  // nombres: inventados con piezas (dos apellidos), nunca en las listas de acta.js / career.js
  const parts = Wa._arbParts, TR = ['estricto', 'deja', 'lince', 'nervioso', 'manual'];
  const fake = { seed: 1, player: { name: 'X Y' } }, allN = new Set(), badN = [];
  for (let s = 1; s <= 200; s++) {
    fake.seed = s;
    const P = Wa.arbPanel(fake, 'B' + (s % 5));
    if (P.length !== Wa.ARB_N) badN.push('tamaño ' + P.length);
    const ns = P.map(x => x.name), sur = [].concat(...P.map(x => x.name.split(' ').slice(1)));
    if (new Set(ns).size !== ns.length || new Set(sur).size !== sur.length || new Set(P.map(x => x.first)).size !== P.length) badN.push('repetido en ' + s);
    if (!TR.every(t => P.some(x => x.trait === t))) badN.push('faltan caracteres en ' + s);
    P.forEach(x => {
      allN.add(x.name); const w = x.name.split(' ');
      if (w.length !== 3 || x.short !== w[1] || x.first !== w[0]) badN.push('forma ' + x.name);
      if (w.slice(1).some(a => parts.no[a] || !parts.r.some(r => a.indexOf(r) === 0) || new RegExp("'" + a + "[ ',]").test(src))) badN.push('apellido ' + x.name);
      if (new RegExp(x.name).test(src)) badN.push('lista ' + x.name);
      if (/·/.test(x.name)) badN.push('punto ' + x.name);
    });
  }
  ok(!badN.length, 'colegios de ' + Wa.ARB_N + ': nombre y dos apellidos inventados, sin repetir, con los 5 caracteres (' + allN.size + ' nombres)' + (badN.length ? ' — ' + badN.slice(0, 3).join(', ') : ''));
  fake.seed = 9; ok(JSON.stringify(Wa.arbPanel(fake, 'ES1')) === JSON.stringify(Wa.arbPanel(JSON.parse(JSON.stringify(fake)), 'ES1')), 'misma semilla, mismo colegio');
  const rnd = Ba.ctx.Math.random; let rc = 0; Ba.ctx.Math.random = () => { rc++; return rnd(); };
  Wa.arbPanel(fake, 'B2'); Ba.ctx.Math.random = rnd; ok(rc === 0, 'sin Math.random');
  // nombres con aire del país (24-nov): ligas extranjeras de la pista, nombre + UN apellido de las piezas de su estilo, fuera de su lista
  // de apellidos reales; España y la playa, igual que antes (dos apellidos)
  { const badR = [], ex = {};
    Object.keys(Wa.ARB_CC).forEach(cc => {
      const sty = Wa.ARB_CC[cc], S = Wa.ARB_STY[sty];
      if (!S || !S.no || !Object.keys(S.no).length) badR.push('sin ARB_NO ' + sty);
      for (let s = 1; s <= 60; s++) {
        const P = Wa.arbPanel({ seed: s }, cc + '1');
        if (P.length !== Wa.ARB_N) badR.push(cc + ' tamaño ' + P.length);
        if (new Set(P.map(x => x.short)).size !== P.length || new Set(P.map(x => x.first)).size !== P.length) badR.push(cc + ' repetido ' + s);
        if (!TR.every(t => P.some(x => x.trait === t))) badR.push(cc + ' caracteres ' + s);
        P.forEach(x => {
          const w = x.name.split(' ');
          if (w.length !== 2 || w[0] !== x.first || w[1] !== x.short || x.sty !== sty || S.fn.indexOf(x.first) < 0) badR.push('forma ' + x.name);
          if (S.no[x.short] || parts.no[x.short]) badR.push('real ' + x.name);
          if (!S.es && !S.r.some(r => x.short.indexOf(r) === 0)) badR.push('piezas ' + x.name);
          if (new RegExp("'" + x.short + "[ ',]").test(src) || src.indexOf(x.name) >= 0) badR.push('lista ' + x.name);
        });
        if (s === 1) ex[cc] = P[0].name;
      }
    });
    ok(!badR.length, 'colegios extranjeros con aire del país (' + Object.keys(Wa.ARB_CC).length + ' países; ' + ['IT', 'BR', 'JP', 'TR'].map(k => ex[k]).join(', ') + ')' + (badR.length ? ' — ' + badR.slice(0, 3).join(', ') : ''));
    // todos los apellidos que puede dar cada estilo (raíz + final, menos su lista no y lo que panel salta): ni famosos, ni insultos,
    // ni letras triples o «íí», ni un nombre de pila de ningún estilo («Marko Marko»), ni grupos de consonantes imposibles
    { const FAM = ['Garneau', 'Vauquelin', 'Vučić', 'Jovović', 'Vučević', 'Dragić', 'Kurosawa', 'Garnier', 'Lindemann', 'Lebedev', 'Pavlov', 'Sokolov', 'Erdoğan',
        'Yıldırım', 'Papadopoulos', 'Carvalho', 'Mourinho', 'Cabrão', 'Cabralho', 'Carvão', 'Thornton', 'Dalton', 'Fenwick', 'Albuquerque', 'Guimarães'];
      const FN = new Set([].concat(Wa._arbParts.fn || [], ...Object.keys(Wa.ARB_STY).map(k => Wa.ARB_STY[k].fn)));
      const badA = []; let nA = 0;
      Object.keys(Wa.ARB_STY).forEach(k => { const S = Wa.ARB_STY[k]; if (S.es) return;
        S.r.forEach(r => S.s.forEach(x => { const sn = r + x;
          if (S.no[sn] || parts.no[sn] || S.fn.indexOf(sn) >= 0 || /(.)\1\1|íí/i.test(sn)) return; nA++;
          if (FAM.indexOf(sn) >= 0) badA.push(k + ' famoso ' + sn);
          if (FN.has(sn)) badA.push(k + ' nombre de pila ' + sn);
          if (/í[aeoáéóí]|czcz|[nś]cz|brcz|khikh|ld[çt]|ırım|lucchu/i.test(sn)) badA.push(k + ' grafía ' + sn);
        })); });
      ok(!badA.length, 'apellidos posibles por estilo (' + nA + '): ni famosos, ni insultos, ni nombres de pila, ni grafías rotas' + (badA.length ? ' — ' + badA.slice(0, 4).join(', ') : ''));
      let mm = 0; for (let s = 1; s <= 400; s++) ['RS1', 'SI1', 'FR1', 'BE1', 'PT1', 'CZ1', 'DE1'].forEach(cc => Wa.arbPanel({ seed: s }, cc).forEach(x => { if (x.first === x.short || FN.has(x.short) || FAM.indexOf(x.short) >= 0) mm++; }));
      ok(!mm, 'en 400 semillas, ningún 1r con apellido famoso o que sea un nombre de pila (antes «Marko Marko», «Louis Garneau»)'); }
    ok(Wa.arbStyle('ES1') === 'es' && Wa.arbStyle('B2') === 'es' && Wa.arbStyle('IT1') === 'it' && Wa.arbStyle('XX1') === 'es', 'España, la playa y lo desconocido siguen con el estilo español');
    ok(Wa.arbPanel({ seed: 7 }, 'ES1').every(x => x.name.split(' ').length === 3 && !x.sty), 'España: nombre y dos apellidos, como antes'); }

  for (const mode of ['beach', 'hall']) {
    const B = boot(), K = B.VB.Career, Wm = B.VB.CareerWorld, hall = mode === 'hall';
    K.create(hall ? { mode: 'hall', name: 'Arb Pista', num: 8, pos: 'OH', seed: 515, now: 1 } : { mode: 'beach', name: 'Arb Playa', num: 7, role: 'atk', seed: 515, now: 1 });
    K.acceptOffer(K.load().offers.findIndex(x => !x.trial), 2);
    let c = K.load(); const w0 = JSON.stringify(c.world || null);
    const m1 = K.matchSetup(c), m2 = K.matchSetup(K.load()), a1 = m1 && m1.career.arb, a2 = m2 && m2.career.arb;
    ok(a1 && a2 && a1.id === a2.id && a1.name && TR.indexOf(a1.trait) >= 0 && a1.r2 && a1.sc && a1.r2 !== a1.name && a1.sc !== a1.name && a1.sc !== a1.r2, mode + ': designación estable en dos matchSetup, con 2º y anotador (' + (a1 && a1.name + ', ' + a1.trait) + ')');
    ok(JSON.stringify(K.load().world || null) === w0, mode + ': el setup no escribe en c.world');
    ok(a1 && a1.line.length <= Wm.ARB_SAY && /^([^:]+ \((entrenador|tu pareja)\)|Tu entrenador): /.test(a1.line) && !/·/.test(a1.line) && a1.rec === false, mode + ': sin recuerdo, la fama te la dice tu entrenador o tu pareja (≤ ' + Wm.ARB_SAY + ' letras, sin «·»: «' + (a1 && a1.line) + '»)');
    ok(a1 && typeof a1.lk === 'number' && a1.lk >= 0 && a1.lk === Wm.arbLook(c, a1.id) && a1.sty === (hall ? Wm.arbStyle(Wm.arbKey(c)) : 'es'), mode + ': aspecto fijo del 1r en cs.arb (lk ' + (a1 && a1.lk) + ', estilo ' + (a1 && a1.sty) + ')');
    const R = Wm.refOf(c, a1.id); ok(R && R.name === a1.name, mode + ': refOf devuelve el designado');
    // la libreta tras un partido con tu amarilla
    const n = K.next(c), sum = { season: c.season, phase: c.phase, label: 'Jornada 1', rival: n.rival.id, rivalName: n.rival.name, win: false, sets: [1, 2], setScores: [[21, 19], [19, 21], [13, 15]], sim: false, nota: 6, me: {},
      amb: { cards: [{ team: 0, pid: 0, color: 'yellow', mine: true, who: 'player' }], myY: 1, myR: 0, myProt: 1, brk: 0, tags: [], heat: 0.5, fair: false, ref: a1.id } };
    Wm.hook(c, 'match', sum, { kind: 'league', week: 3 });
    const e = c.world.arb && c.world.arb.p[a1.id];
    ok(e && e.m === 1 && e.y === 1 && e.pr === 1 && e.ev && e.ev.k === 'yellow' && e.ev.wk === 'J4' && c.world.arb.last === a1.id, mode + ': refAfter apunta la amarilla en la libreta (' + JSON.stringify(e) + ')');
    ok(Wm.arbMem(c, a1.id) > 0, mode + ': y el 1r te aprieta (mem ' + Wm.arbMem(c, a1.id) + ')');
    const L1 = Wm.arbLine(c, { ref: R }, false);
    ok(L1.rec && /amarilla en la J4$/.test(L1.t) && L1.t.length <= Wm.ARB_LINE && !/·/.test(L1.t), mode + ': con recuerdo, «' + L1.t + '»');
    K.save(c); const d2 = Wm.arbDesigna(K.load());
    ok(d2 && d2.ref.id !== a1.id, mode + ': el siguiente partido no lo pita el mismo 1r (' + (d2 && d2.ref.name) + ')');
    // frenada: «te vio frenar a …»
    const sum2 = Object.assign({}, sum, { amb: Object.assign({}, sum.amb, { cards: [], myY: 0, myProt: 0, brk: 1, brkName: 'Iker', fair: true, ref: d2.ref.id }) });
    Wm.hook(c, 'match', sum2, { kind: 'league', week: 4 });
    ok(/te vio frenar a Iker/.test(Wm.arbLine(c, { ref: d2.ref }, false).t) && Wm.arbMem(c, d2.ref.id) < 0, mode + ': frenada, «' + Wm.arbLine(c, { ref: d2.ref }, false).t + '» y te ablanda');
    // temporada nueva: la libreta baja ×0,6 y el recuerdo dice «la temporada pasada»
    Wm.hook(c, 'newSeason'); c.season++;
    ok(Math.abs(c.world.arb.p[a1.id].y - 0.6) < 1e-9 && /temporada pasada/.test(Wm.arbLine(c, { ref: R }, false).t), mode + ': temporada nueva: ×0,6 y «' + Wm.arbLine(c, { ref: R }, false).t + '»');
    c.season--;
    // sin sum.amb.ref (Apagado o sin ambiente): la libreta no cambia
    const before = JSON.stringify(c.world.arb);
    Wm.hook(c, 'match', Object.assign({}, sum, { amb: Object.assign({}, sum.amb, { ref: '' }) }), { kind: 'league', week: 5 });
    Wm.hook(c, 'match', Object.assign({}, sum, { amb: null }), { kind: 'league', week: 6 });
    ok(JSON.stringify(c.world.arb) === before, mode + ': sin 1r designado, la libreta no cambia');
    // lince: la tabla de error de este partido baja ×0,6 (las demás, igual que la de la liga)
    const lv = hall ? null : K.league(K.myClub(K.load()).lvl).ref;
    if (!hall) { const base = K.REF[lv], mm = K.matchSetup(K.load()), ar = mm.career.arb, f = ar.trait === 'lince' ? 0.6 : ar.trait === 'nervioso' && ar.derby ? 1.3 : 1;
      ok(Math.abs(mm.ref.p1 - Math.min(1, Math.round(base.p1 * f * 1000) / 1000)) < 1e-9 && mm.ref.chal === base.chal, mode + ': tabla de error según el carácter (' + ar.trait + ', p1 ' + mm.ref.p1 + ')'); }
    // matchSetup no escribe en c (en pista, onSetup ya no vuelve a llamar a next6: usa el n de matchSetup6)
    { const cs = K.load(), j0 = JSON.stringify(cs); K.matchSetup(cs); ok(JSON.stringify(cs) === j0, mode + ': matchSetup deja c entero igual (no solo c.world)'); }
    // tabla de error por carácter con el n que pasa matchSetup (4º argumento de 'setup'): nervioso en derbi ×1,3 y lince ×0,6
    { const cs = K.load(), n0 = K.next(cs), base = hall ? { p1: 0.2, p2: 0.1, p3: 0.05, d3: 0.3, chal: 2 } : K.REF[K.league(K.myClub(cs).lvl).ref];
      const amb0 = K.ambCtx, seen = {};
      try {
        K.ambCtx = () => ({ tags: ['derbi'] });
        for (let wk = 0; wk < 80 && !(seen.nervioso && seen.lince); wk++) {
          const out = { career: { season: cs.season }, ref: Object.assign({}, base) };
          Wm.hook(cs, 'setup', out, Object.assign({}, n0, { week: wk, bench: false }));
          const ar = out.career.arb; if (!ar || seen[ar.trait] || (ar.trait !== 'nervioso' && ar.trait !== 'lince')) continue;
          const f = ar.trait === 'lince' ? 0.6 : 1.3;
          seen[ar.trait] = ar.derby === true && ['p1', 'p2', 'p3'].every(k => Math.abs(out.ref[k] - Math.min(1, Math.round(base[k] * f * 1000) / 1000)) < 1e-9) && out.ref.d3 === base.d3 ? 'ok' : JSON.stringify(out.ref);
        }
      } finally { K.ambCtx = amb0; }
      ok(seen.nervioso === 'ok', mode + ': nervioso en derbi, p1-p3 × 1,3 (' + seen.nervioso + ')');
      ok(seen.lince === 'ok', mode + ': ojo de lince, p1-p3 × 0,6 (' + seen.lince + ')'); }
    // «Apagado»: sin árbitro y c.world igual
    B.ctx.VB.ctx = { settings: { ambient: 'off' } };
    const cOff = K.load(), wOff = JSON.stringify(cOff.world), mo = K.matchSetup(cOff);
    Wm.hook(cOff, 'match', sum, { kind: 'league', week: 7 });
    ok(mo && !mo.career.arb && JSON.stringify(cOff.world.arb || null) === JSON.stringify(JSON.parse(wOff).arb || null), mode + ': con «Apagado», sin out.career.arb y la libreta igual');
    delete B.ctx.VB.ctx;
    // partidillo de prueba: sin árbitro
    if (K.trialSetup) { const cc = K.load(); const ts = (() => { try { return K.trialSetup(0, cc); } catch (er) { return null; } })(); ok(!ts || !ts.career.arb, mode + ': el partidillo de prueba no lleva 1r designado'); }
  }
  // lince: con el 1r «ojo de lince», la tabla de error de ESE partido baja ×0,6 (se busca una carrera a la que le toque)
  {
    let got = null;
    for (let s = 600; s < 700 && !got; s++) {
      const B = boot(), K = B.VB.Career; K.create({ mode: 'beach', name: 'Arb Lince', num: 7, role: 'atk', seed: s, now: 1 }); K.acceptOffer(K.load().offers.findIndex(x => !x.trial), 2);
      const m = K.matchSetup(K.load()); if (m && m.career.arb && m.career.arb.trait === 'lince') got = { m, base: K.REF[K.league(K.myClub(K.load()).lvl).ref] };
    }
    ok(got && Math.abs(got.m.ref.p1 - Math.round(got.base.p1 * 0.6 * 1000) / 1000) < 1e-9 && Math.abs(got.m.ref.p3 - Math.round(got.base.p3 * 0.6 * 1000) / 1000) < 1e-9 && got.m.ref.d3 === got.base.d3,
      'ojo de lince: p1-p3 × 0,6 en su partido (' + (got && got.m.ref.p1 + ' de ' + got.base.p1) + ')');
  }
  // competición internacional (rival de otro país): colegio neutral, ni de tu país ni del rival, fijo para ese partido
  {
    const B = boot(), K = B.VB.Career, Wm = B.VB.CareerWorld;
    K.create({ mode: 'hall', name: 'Arb Neutral', num: 8, pos: 'OH', seed: 616, now: 1 }); K.acceptOffer(K.load().offers.findIndex(x => !x.trial), 2);
    const c = K.load(), keys = new Set(); let bad = 0;
    for (let r = 0; r < 30; r++) {
      const n = { foreign: true, me: { cc: 'ES' }, rival: { cc: 'IT', name: 'Rival ' + r }, round: r % 3, label: 'Copa de Europa' }, k = Wm.arbKeyOf(c, n);
      if (/^(ES|IT)/.test(k) || k !== Wm.arbKeyOf(c, n) || !/^[A-Z]{2}1$/.test(k)) bad++; keys.add(k);
      const d = Wm.arbDesigna(c, n); if (!d || d.ref.id.indexOf(k + '-') !== 0 || !Wm.refOf(c, d.ref.id) || Wm.refOf(c, d.ref.id).name !== d.ref.name) bad++;
    }
    ok(!bad && keys.size >= 4, 'internacional: pita un colegio neutral, fijo y que refOf encuentra (' + [...keys].slice(0, 6).join(', ') + ')');
    ok(Wm.arbKeyOf(c, { foreign: false, rival: { cc: 'ES', name: 'X' } }) === Wm.arbKey(c), 'liga y copa de tu país: el colegio de tu liga');
    // la frase de fama: cabe con nombres largos y en todos los caracteres
    const lines = [];
    ['estricto', 'deja', 'lince', 'nervioso', 'manual'].forEach(t => ['Al-Ghanouri', 'Papadiadis', 'Lu', ''].forEach(sh => lines.push(Wm.arbSay(c, { id: 'IT1-' + sh.length, short: sh, trait: t }, t))));
    ok(lines.every(l => l.length <= Wm.ARB_SAY && /: /.test(l) && !/·|undefined|\{r\}/.test(l)), 'arbSay: ' + lines.length + ' frases ≤ ' + Wm.ARB_SAY + ' letras (p. ej. «' + lines[0] + '»)');
    ok(lines.every(l => !/\b(este|esta|nervios[oa])\b/i.test(l)), 'arbSay: frases neutras, sin «este» ni «nervioso» (el árbitro no lleva género)');
  }
}

console.log('\n' + passes + ' comprobaciones, ' + fails + ' fallos');
if (fails) { console.log('HAY FALLOS'); process.exit(1); }
console.log('TODO OK');
