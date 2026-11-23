#!/usr/bin/env node
/* TAKE THE COURT — tools/mobcompare.js (owner: ui_main)
 * Antes / después de dos pasadas de tools/mobaudit.js: hoja de contactos HTML (capturas lado a lado por pantalla × tamaño, con
 * las diferencias de las métricas) y un resumen en Markdown.
 * Uso: node tools/mobcompare.js <dir_antes> [dir_después] [--out salida.html] [--only regex] [--sizes 568x320,...] [--cols n]
 *   - con un solo directorio: hoja de contactos de esa pasada (sin diferencias).
 *   - salida por defecto: <dir_después>/compare.html y compare.md (o <dir_antes>/contact.html con un solo directorio).
 *   - las imágenes se enlazan con rutas relativas (la hoja se abre en el navegador; nada se copia).
 *   - SHOT=ruta.png: además, captura de la hoja entera con Chrome headless (tools/cdp.js), para mirarla sin navegador.
 */
'use strict';
const fs = require('fs'), path = require('path');
const argv = process.argv.slice(2), pos = [], A = {};
for (let i = 0; i < argv.length; i++) { const a = argv[i]; if (a.startsWith('--')) { const k = a.slice(2), eq = k.indexOf('='); if (eq > 0) A[k.slice(0, eq)] = k.slice(eq + 1); else A[k] = argv[++i]; } else pos.push(a); }
if (!pos.length) { console.error('Uso: node tools/mobcompare.js <dir_antes> [dir_después] [--out salida.html] [--only regex] [--sizes …]'); process.exit(1); }
const B = path.resolve(pos[0]), Aft = pos[1] ? path.resolve(pos[1]) : null;
const single = !Aft;
const OUT = path.resolve(A.out || (single ? path.join(B, 'contact.html') : path.join(Aft, 'compare.html')));
const MD = OUT.replace(/\.html?$/i, '') + '.md';
const ONLY = A.only ? new RegExp(A.only, 'i') : null;
const load = d => { try { return JSON.parse(fs.readFileSync(path.join(d, 'metrics.json'), 'utf8')); } catch (e) { console.error('sin metrics.json en ' + d); process.exit(1); } };
const mb = load(B), ma = single ? null : load(Aft);
const ids = [...new Set(Object.keys(mb.screens).concat(ma ? Object.keys(ma.screens) : []))].filter(id => !ONLY || ONLY.test(id));
let sizes = [...new Set(mb.sizes.concat(ma ? ma.sizes : []))];
if (A.sizes) sizes = A.sizes.split(',');
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// métricas resumidas de una pantalla en un tamaño (más = peor salvo minFont)
const KEYS = [['minFont', 'letra mín', +1], ['n12', '< 12 px', -1], ['n14', '< 14 px', -1], ['smallT', 'toques < 44', -1], ['tight', 'toques juntos', -1], ['overlap', 'solapes', -1],
  ['covered', 'tapados', -1], ['rot', 'rótulos solap.', -1], ['clipped', 'recortes', -1], ['off', 'fuera', -1], ['exit', 'salida ok', +1], ['primary', 'principal ok', +1], ['chars', 'caracteres', 0], ['targets', 'objetivos', 0], ['scroll', 'con scroll', 0]];
function flat(m) {
  if (!m) return null;
  if (m.err && !m.fonts) return { err: m.err };
  return { minFont: m.fonts.min, n12: m.fonts.n12, n14: m.fonts.n14, smallT: m.targets.nSmall, tight: m.targets.nTight, overlap: m.targets.nOverlap, covered: m.targets.covered.length, rot: m.rot ? m.rot.n : null,
    clipped: m.nClipped, off: m.nOff, exit: m.exit ? (m.exit.ok ? 1 : 0) : null, primary: m.primary ? (m.primary.ok ? 1 : 0) : null, chars: m.density.chars, targets: m.density.targets,
    scroll: m.nScrollNeed, err: m.err || '' };
}
function cell(k, dir, b, a) {
  const fb = v => v == null ? '–' : (k === 'exit' || k === 'primary') ? (v ? 'sí' : 'NO') : v;
  if (a === undefined) return '<td>' + esc(fb(b)) + '</td>';
  let cls = '';
  if (b != null && a != null && b !== a && dir) cls = (a - b) * dir > 0 ? 'up' : 'dn';
  return '<td class="' + cls + '">' + esc(fb(b)) + (b !== a ? ' → <b>' + esc(fb(a)) + '</b>' : '') + '</td>';
}
const rel = f => path.relative(path.dirname(OUT), f).replace(/\\/g, '/');
let html = '', md = [], tot = { b: {}, a: {} };
for (const id of ids) {
  const sb = mb.screens[id], sa = ma && ma.screens[id], area = (sb || sa).area;
  html += '<section class="sc" data-area="' + esc(area) + '" data-id="' + esc(id) + '"><h2>' + esc(id) + ' <small>' + esc(area) + '</small></h2>';
  for (const sz of sizes) {
    const xb = sb && sb.bySize[sz], xa = sa && sa.bySize[sz];
    if (!xb && !xa) continue;
    const fb = flat(xb), fa = single ? undefined : flat(xa);
    if (single || (xb && xa)) for (const [k] of KEYS) { if (fb && fb[k] != null && typeof fb[k] === 'number') tot.b[k] = (tot.b[k] || 0) + (k === 'minFont' ? 0 : fb[k]); if (fa && fa[k] != null && typeof fa[k] === 'number') tot.a[k] = (tot.a[k] || 0) + (k === 'minFont' ? 0 : fa[k]); }
    const changed = !single && JSON.stringify(fb) !== JSON.stringify(fa);
    html += '<div class="row' + (changed ? ' ch' : '') + '" data-size="' + sz + '"><div class="lab">' + sz + '</div><div class="imgs">' +
      (xb ? '<figure><img loading="lazy" src="' + esc(rel(path.join(B, xb.shot || (sz + '/' + id + '.png')))) + '"><figcaption>' + (single ? '' : 'antes') + (fb && fb.err ? ' <i class="err">' + esc(fb.err) + '</i>' : '') + '</figcaption></figure>' : '<figure class="none">—</figure>') +
      (!single ? (xa ? '<figure><img loading="lazy" src="' + esc(rel(path.join(Aft, xa.shot || (sz + '/' + id + '.png')))) + '"><figcaption>después' + (fa && fa.err ? ' <i class="err">' + esc(fa.err) + '</i>' : '') + '</figcaption></figure>' : '<figure class="none">—</figure>') : '') +
      '</div><table><tr>' + KEYS.map(k => '<th>' + k[1] + '</th>').join('') + '</tr><tr>' +
      KEYS.map(([k, , dir]) => cell(k, dir, fb ? fb[k] : null, single ? undefined : (fa ? fa[k] : null))).join('') + '</tr></table>';
    const small = xa && xa.fonts ? xa.fonts.small12 : xb && xb.fonts ? xb.fonts.small12 : [];
    const st = xa && xa.targets ? xa.targets.small : xb && xb.targets ? xb.targets.small : [];
    if (small.length || st.length) html += '<details><summary>detalle (' + (single ? '' : 'después: ') + small.length + ' textos < 12 px, ' + st.length + ' toques < 44)</summary><ul>' +
      small.slice(0, 15).map(s => '<li>' + s.px + ' px · <code>' + esc(s.s) + '</code> «' + esc(s.t) + '»</li>').join('') +
      st.slice(0, 15).map(s => '<li>' + s.r.w + '×' + s.r.h + ' · <code>' + esc(s.s) + '</code> «' + esc(s.t) + '»</li>').join('') + '</ul></details>';
    html += '</div>';
  }
  html += '</section>';
  // markdown: peor tamaño de cada pasada
  const sum = s => s && s.summary ? s.summary : null, a0 = sum(sb), a1 = sum(sa);
  if (single) md.push('| ' + id + ' | ' + area + ' | ' + (a0 ? [a0.worst, a0.minFont, a0.n12, a0.n14, a0.smallT, a0.clipped, a0.exitOk ? 'ok' : 'NO'].join(' | ') : '– | – | – | – | – | – | –') + ' |');
  else if (!sb || !sa) md.push('| ' + id + ' | ' + area + ' | ' + (sb ? '(solo antes)' : '(solo después)') + ' |  |  |  |  |  |  |  |');
  else {
    const d = (k) => { const x = a0 ? a0[k] : null, y = a1 ? a1[k] : null; return x === y ? String(x ?? '–') : (x ?? '–') + ' → **' + (y ?? '–') + '**'; };
    md.push('| ' + id + ' | ' + area + ' | ' + ['minFont', 'n12', 'n14', 'smallT', 'overlap', 'clipped', 'off', 'rot'].map(d).join(' | ') + ' | ' + (a0 && a0.exitOk ? 'ok' : 'NO') + ' → ' + (a1 && a1.exitOk ? 'ok' : 'NO') + ' |');
  }
}
const totRow = KEYS.filter(k => k[0] !== 'minFont' && k[0] !== 'exit' && k[0] !== 'primary').map(([k, l]) => '<td>' + l + ': ' + (tot.b[k] || 0) + (single ? '' : ' → <b>' + (tot.a[k] || 0) + '</b>') + '</td>').join('');
const page = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${single ? 'Hoja de contactos' : 'Antes y después'}</title>
<style>:root{--bg:#14121c;--fg:#f3eee4;--mut:#a59fb5;--ln:#2d2940;--up:#49d17d;--dn:#ff5d6c}body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.4 system-ui,sans-serif}
header{position:sticky;top:0;z-index:2;background:#1c1928;border-bottom:1px solid var(--ln);padding:10px 16px;display:flex;gap:12px;flex-wrap:wrap;align-items:center}
header h1{font-size:16px;margin:0 12px 0 0}select,label{font:inherit;color:inherit;background:#262236;border:1px solid var(--ln);border-radius:6px;padding:4px 8px}
.tot{padding:8px 16px;color:var(--mut)}.tot table td{padding:2px 10px 2px 0}.sc{padding:8px 16px;border-bottom:1px solid var(--ln)}.sc h2{font-size:15px;margin:10px 0}.sc h2 small{color:var(--mut);font-weight:400}
.row{margin:0 0 14px}.row .lab{color:var(--mut);font-size:12px}.imgs{display:flex;gap:8px;flex-wrap:wrap}figure{margin:0}figure img{display:block;max-width:min(46vw,640px);border:1px solid var(--ln)}
figcaption{font-size:11px;color:var(--mut)}.none{width:200px;color:var(--mut)}table{border-collapse:collapse;margin-top:4px;font-size:12px}th,td{border:1px solid var(--ln);padding:2px 6px;text-align:center}th{color:var(--mut);font-weight:500}
td.up{color:var(--up)}td.dn{color:var(--dn)}.err{color:var(--dn)}details{font-size:12px;color:var(--mut)}code{color:#e7c56b}body.onlych .row:not(.ch){display:none}
</style></head><body><header><h1>${single ? 'Hoja de contactos' : 'Antes y después'}</h1><span>${esc(B)}${single ? '' : ' → ' + esc(Aft)}</span>
<select id="fa"><option value="">todas las áreas</option>${[...new Set(ids.map(i => (mb.screens[i] || ma.screens[i]).area))].map(a => '<option>' + a + '</option>').join('')}</select>
<select id="fs"><option value="">todos los tamaños</option>${sizes.map(s => '<option>' + s + '</option>').join('')}</select>
${single ? '' : '<label><input type="checkbox" id="fc"> solo lo que cambia</label>'}</header>
<div class="tot"><table><tr>${totRow}</tr></table></div>${html}
<script>(function(){var fa=document.getElementById('fa'),fs=document.getElementById('fs'),fc=document.getElementById('fc');
function ap(){document.querySelectorAll('.sc').forEach(function(s){s.hidden=!!fa.value&&s.dataset.area!==fa.value;s.querySelectorAll('.row').forEach(function(r){r.hidden=!!fs.value&&r.dataset.size!==fs.value;});});if(fc)document.body.classList.toggle('onlych',fc.checked);}
fa.onchange=fs.onchange=ap;if(fc)fc.onchange=ap;})();</script></body></html>`;
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, page);
const mdHead = single ? '| pantalla | área | peor | letra mín | < 12 | < 14 | toques < 44 | recortes | salida |\n|---|---|---|---|---|---|---|---|---|'
  : '| pantalla | área | letra mín | < 12 | < 14 | toques < 44 | solapes | recortes | fuera | rótulos solap. | salida |\n|---|---|---|---|---|---|---|---|---|---|---|';
const totMd = KEYS.filter(k => !/minFont|exit|primary/.test(k[0])).map(([k, l]) => '- ' + l + ': ' + (tot.b[k] || 0) + (single ? '' : ' → ' + (tot.a[k] || 0))).join('\n');
fs.writeFileSync(MD, '# ' + (single ? 'Auditoría de móvil' : 'Auditoría de móvil: antes y después') + '\n\n' + (single ? B : B + ' → ' + Aft) + '\n\nTotales (suma de todos los tamaños' + (single ? '' : '; solo lo que está en las dos pasadas') + '):\n' + totMd +
  '\n\nPeor tamaño de cada pantalla' + (single ? '' : ' (antes → después)') + ':\n\n' + mdHead + '\n' + md.join('\n') + '\n');
console.log(OUT + '\n' + MD);
if (process.env.SHOT) {
  (async () => {
    const CDP = require('./cdp.js'), url = require('url');
    const p = await CDP.open({ size: (A.w || 1400) + 'x900' });
    await p.send('Page.navigate', { url: url.pathToFileURL(OUT).href }); await CDP.sleep(2500);
    const h = await p.evalJs('document.querySelectorAll("img").forEach(function(i){i.loading="eager"}); document.documentElement.scrollHeight');
    await p.setSize((A.w || 1400) + 'x' + Math.min(16000, h)); await CDP.sleep(2500);
    await p.shot(path.resolve(process.env.SHOT)); p.close(); console.log(process.env.SHOT);
    process.exit(0);
  })();
}
