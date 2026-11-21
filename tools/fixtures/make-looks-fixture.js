#!/usr/bin/env node
/* TAKE THE COURT — tools/fixtures/make-looks-fixture.js
 * Genera tools/fixtures/looks-1.15.1.json con los fits de ejemplo tal y como los deja js/look.js de la 1.15.1 (commit bdb00e5),
 * para que tools/looktest.js compruebe la ida y vuelta de guardados (sane → resolve) después de tocar look.js (plan del Vestuario,
 * WP0.3). Lee look.js con `git show bdb00e5:js/look.js`, así se puede regenerar igual aunque look.js ya haya cambiado.
 * Contenido:
 *  - fits: defaults(0/1), un fit por objeto del catálogo (lo lleva puesto en su sede, saneado), fromSeed(0..119), random(1..40),
 *    bossFit de cada estilo y cada color/tinte de pelo; todos ya saneados por la 1.15.1 (sane(fit) === fit allí).
 *  - store: un guardado 'make-the-cut.look' v1 completo (fits, ft, own con todos los objetos ganados, seen).
 * Uso: node tools/fixtures/make-looks-fixture.js [--rev=bdb00e5]
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm'), cp = require('child_process');
const ROOT = path.join(__dirname, '..', '..');
const REV = (process.argv.find(a => a.startsWith('--rev=')) || '--rev=bdb00e5').slice(6);
const SRC = cp.execSync('git show ' + REV + ':js/look.js', { cwd: ROOT, encoding: 'utf8', maxBuffer: 8 << 20 });
const store = {};
const localStorage = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } };
const VB = {}; vm.runInNewContext(SRC, { window: { VB, localStorage }, VB, console });
const L = VB.Look;
const fits = [], seen = new Set();
const add = (tag, f) => { const s = L.sane(f, 0), k = JSON.stringify(s); if (seen.has(k)) return; seen.add(k); fits.push({ tag, fit: s }); };
add('defaults0', L.defaults(0)); add('defaults1', L.defaults(1));
// un fit por objeto: lo pone en su ranura (en su sede, o en las dos si es de todas) sobre defaults(0); peinados y tintes en style/hair
L.CATALOG.forEach(it => {
  const f = L.defaults(0);
  if (it.slot === 'style') f.style = it.id;
  else if (it.slot === 'hairTint') f.hair = it.id;
  else if (it.slot === 'color') L.COLOR_KEYS.forEach(k => { f.colors[k] = it.id; });
  else ['hall', 'beach'].forEach(v => { if (it.venue === 'A' || it.venue === (v === 'beach' ? 'Y' : 'P')) f[v][it.slot] = it.id; });
  // gana el objeto: fix con su ranura como «cambiada» quita lo que choca (p. ej. el gorro de playa por defecto con las gafas en la frente)
  const s = L.sane(L.fix(f, null, it.slot === 'hairTint' ? 'style' : it.slot).fit, 0);
  const worn = s.style === it.id || s.hair === it.id || ['hall', 'beach'].some(v => s[v][it.slot] === it.id) || L.COLOR_KEYS.some(k => s.colors[k] === it.id);
  if (!worn) throw new Error('el objeto ' + it.id + ' no se queda puesto en la 1.15.1');
  add('item:' + it.id, s);
});
L.PALETTE.forEach(p => { const f = L.defaults(1); L.COLOR_KEYS.forEach(k => { f.colors[k] = p.id; }); add('pal:' + p.id, f); });
L.HAIRS.forEach((h, i) => { const f = L.defaults(0); f.hair = h; add('hair' + i, f); });
L.SKINS.forEach((s, i) => { const f = L.defaults(1); f.skin = s; add('skin' + i, f); });
for (let n = 0; n < 120; n++) add('seed' + n, L.fromSeed(n));
for (let n = 1; n <= 40; n++) add('random' + n, L.random(n, false));
L.BOSS_STYLES.forEach(st => [1, 2, 3].forEach(sd => add('boss:' + st + sd, L.bossFit(st, sd))));
fits.forEach(x => { if (JSON.stringify(L.sane(x.fit, 0)) !== JSON.stringify(x.fit)) throw new Error('fit no estable en la 1.15.1: ' + x.tag); });
// guardado completo: todo ganado y visto, con los dos fits más cargados
const own = {}, se = {};
L.CATALOG.concat(L.PALETTE).forEach((it, i) => { if (!L.isStart(it.id)) { own[it.id] = { s: ['tienda', 'carrera', 'hito', 'retos', 'boss'][i % 5], t: 1700000000000 + i }; se[it.id] = 1; } });
const big = fits.filter(x => x.tag.startsWith('random')).slice(0, 2).map(x => x.fit);
const out = { rev: REV, version: '1.15.1', made: 'node tools/fixtures/make-looks-fixture.js', V: L.V, catalog: L.CATALOG.map(x => x.id),
  fits, store: { v: L.V, fits: big, ft: 1763500000000, own, seen: se } };
const file = path.join(__dirname, 'looks-1.15.1.json');
fs.writeFileSync(file, JSON.stringify(out, null, 0).replace(/\{"tag"/g, '\n{"tag"') + '\n');
console.log('escrito ' + path.relative(ROOT, file) + ': ' + fits.length + ' fits, ' + Object.keys(own).length + ' objetos ganados (' + fs.statSync(file).size + ' B)');
