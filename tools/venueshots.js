#!/usr/bin/env node
/* TAKE THE COURT — tools/venueshots.js (owner: arena)
 * Variedad visual de las SEDES GENERADAS (plan «sedes-gen», F6). En el navegador (CDP, como venuegen-browse) monta cada sede como
 * main.js forceVenue (VB.Arena.onSettings con forceMap) en ?debug=rally (cámara de juego de la jugada 2v2, congelada), con los jugadores, el
 * balón, los efectos y el aro del jugador ocultos, y saca del lienzo WebGL (justo tras el fotograma del juego) una imagen de 480×270
 * y su dHash de 64 bits del FONDO (9×8 medias de luminancia por bloques de la banda superior, 55 % de la altura; bit = bloque más
 * claro que el de su derecha).
 *   - pista: los 390 clubes (VB.Leagues), por lotes de 50 (página nueva por lote);
 *   - playa: unas 40 (PLAYAS=n): la primera de cada escenario, de día, de tarde y de noche, y después una por país siguiendo el
 *     orden de leagues.js hasta llegar a n, sin repetir país mientras se pueda.
 * Comparación: Hamming entre clubes del mismo país (pista) y entre todas las playas de la muestra; AVISO (no bloquea) si Hamming ≤ 10 con color < 40, o Hamming ≤ 16 con color < 15.
 * Salidas (tools/out/gen/):
 *   - <cc>/<SIGLAS>-h.jpg, <cc>/<SIGLAS>-b.jpg y <cc>/index.html: hoja de contactos del país (imágenes relativas), con la receta de
 *     cada sede (arquetipo, flavor, tier, techo, fondo, luz, suelo, gradas) y su gemela más cercana del país;
 *   - index.html: índice AUTOCONTENIDO (miniaturas de 320×180 embebidas en base64, ~6 MB: se abre o publica suelto, por debajo del
 *     límite de 16 MB de un artifact): resumen, avisos y todas las hojas por país;
 *   - shots.json: id, receta resumida, dHash y gemela más cercana de cada sede; avisos.
 * Variables: CLUBS=IT:PER,PL:SUW… (solo esas pistas, sin playas salvo PLAYAS) · PLAYAS=n (40; 0 = ninguna) · Q=high (calidad)
 *            CC=IT,PL (solo esos países) · NOHTML=1 (solo capturas y json).
 * Uso: node tools/venueshots.js [WxH=1280x720]   Sale con 1 si hay errores de JS o alguna sede no monta; las gemelas son avisos.
 */
'use strict';
const fs = require('fs'), path = require('path');
const CDP = require('./cdp.js');
const SIZE = process.argv[2] || '1280x720', QUAL = process.env.Q || 'high';
const NB = process.env.PLAYAS != null ? +process.env.PLAYAS : (process.env.CLUBS ? 0 : 40);
const ONLY_CC = process.env.CC ? process.env.CC.toUpperCase().split(',') : null;
const BATCH = 50, BATCH_MS = 600000, TW = 480, TH = 270, TWIN = 10, CTWIN = +(process.env.CTWIN || 40), TWIN2 = 16, CTWIN2 = 15;
const OUT = path.join(__dirname, 'out', 'gen');

/** En la página: lista de pistas y playas con su receta resumida. */
function pickAll(nb, onlyCC, clubs) {
  var halls = [], beaches = [], G = VB.VenueGen, all = [], countries = [];
  function brief(sp) {
    var p = sp.p || {};
    return sp.kind === 'hall'
      ? { arch: sp.arch, flavor: sp.flavor || '', tier: sp.tier, roof: p.roof, back: p.back, light: p.light, floor: p.floorMat, stands: p.stands, win: p.win + '/' + p.view, court: sp.pal.court, sig: sp.sig.join(' · ') }
      : { arch: p.scen, flavor: '', tier: sp.tier, hour: p.hour, backdrop: p.backdrop, veg: p.veg, hut: p.hut, court: sp.pal.court, sig: sp.sig.join(' · ') };
  }
  VB.Leagues.regions.forEach(function (rg) {
    (rg.countries || []).forEach(function (co) {
      if (onlyCC && onlyCC.indexOf(co.code) < 0) return;
      countries.push({ cc: co.code, name: co.country, region: rg.region });
      (co.divisions || []).forEach(function (d) {
        (d.clubs || []).forEach(function (k) {
          var key = co.code + ':' + k.short, kk = Object.assign({ cc: co.code }, k);
          all.push({ key: key, cc: co.code, k: kk, div: d.name, lvl: d.lvl });
        });
      });
    });
  });
  all.forEach(function (e) {
    if (clubs && clubs.indexOf(e.key) < 0) return;
    var sp = G.spec(e.k, 'hall');
    halls.push(Object.assign({ key: e.key, cc: e.cc, kind: 'hall', club: e.k.name, city: e.k.city, div: e.div, name: sp.name, id: sp.id }, brief(sp)));
  });
  if (nb > 0) {
    var bs = all.map(function (e) { var sp = G.spec(e.k, 'beach'); return { e: e, sp: sp }; }), take = [], used = {};
    function add(x) { if (!x || used[x.e.key] || take.length >= nb) return; used[x.e.key] = 1; take.push(x); }
    var seen = {};
    bs.forEach(function (x) { var s = x.sp.p.scen; if (!seen[s]) { seen[s] = 1; add(x); } });
    ['dia', 'tarde', 'noche'].forEach(function (h) { var seenH = {}; bs.forEach(function (x) { var s = x.sp.p.scen; if (x.sp.p.hour === h && !seenH[s]) { seenH[s] = 1; add(x); } }); });
    var ccTaken = {}; take.forEach(function (x) { ccTaken[x.e.cc] = (ccTaken[x.e.cc] || 0) + 1; });
    for (var round = 1; take.length < nb && round < 30; round++) {
      countries.forEach(function (co) {
        if ((ccTaken[co.cc] || 0) >= round) return;
        var L = bs.filter(function (x) { return x.e.cc === co.cc && !used[x.e.key]; });
        if (!L.length) return;
        add(L[Math.floor(L.length / 2)]); ccTaken[co.cc] = (ccTaken[co.cc] || 0) + 1;
      });
    }
    take.forEach(function (x) {
      beaches.push(Object.assign({ key: x.e.key, cc: x.e.cc, kind: 'beach', club: x.e.k.name, city: x.e.k.city, div: x.e.div, name: x.sp.name, id: x.sp.id }, brief(x.sp)));
    });
  }
  return { halls: halls, beaches: beaches, countries: countries };
}

/** En la página: monta un lote de sedes y saca imagen + dHash de cada una. */
async function runBatch(list, kind, tw, th) {
  var c = VB.ctx, r = c.renderer, V = VB.Venues;
  function wait(ms) { return new Promise(function (res) { setTimeout(res, ms); }); }
  function frames(n) { return new Promise(function (res) { var k = 0; (function f() { if (++k > n) res(); else requestAnimationFrame(f); })(); }); }
  function go(id) { VB.Arena.onSettings(Object.assign({}, c.settings, { arena: V.kindOf(id), forceMap: id }), 'arena'); }
  // fuera jugadores, balón y efectos (fx), y el aro y el galón del jugador controlado (mallas sueltas de players.js en la raíz de la
  // escena con renderOrder 3 y 4): visible queda fijado a false aunque el bucle lo vuelva a poner
  var hidden = [];
  function force(o) { if (o.__vsHidden) return; o.__vsHidden = 1; Object.defineProperty(o, 'visible', { get: function () { return false; }, set: function () { }, configurable: true }); hidden.push(o.name || ('ro' + o.renderOrder)); }
  function hideActors() {
    ['players', 'fx'].forEach(function (n) { var o = c.scene.getObjectByName(n); if (o) force(o); });
    c.scene.children.forEach(function (o) { if (o.isMesh && !o.name && (o.renderOrder === 3 || o.renderOrder === 4)) force(o); });
  }
  var cv = document.createElement('canvas'); cv.width = tw; cv.height = th;
  var g2 = cv.getContext('2d', { willReadFrequently: true }); g2.imageSmoothingEnabled = true; g2.imageSmoothingQuality = 'high';
  var cv3 = document.createElement('canvas'); cv3.width = 320; cv3.height = 180; var g3 = cv3.getContext('2d'); g3.imageSmoothingQuality = 'high';
  function grab() {
    // tras el fotograma del juego (su rAF se pidió antes que este): el búfer aún no se ha presentado ni borrado
    return new Promise(function (res) { requestAnimationFrame(function () { g2.drawImage(r.domElement, 0, 0, tw, th); res(); }); });
  }
  function dhash() {
    // solo el FONDO (banda de arriba, 55 %: pared del fondo, gradas, techo y laterales); la pista de abajo es la misma geometría en todas
    var BH = Math.round(th * 0.55), d = g2.getImageData(0, 0, tw, th).data, B = [], mean = 0;
    for (var by = 0; by < 8; by++) for (var bx = 0; bx < 9; bx++) {
      var x0 = Math.floor(bx * tw / 9), x1 = Math.floor((bx + 1) * tw / 9), y0 = Math.floor(by * BH / 8), y1 = Math.floor((by + 1) * BH / 8), s = 0, n = 0;
      for (var y = y0; y < y1; y += 2) for (var x = x0; x < x1; x += 2) { var i = (y * tw + x) * 4; s += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]; n++; }
      B.push(s / n); mean += s / n;
    }
    var hex = '';
    for (var row = 0; row < 8; row++) {
      var v = 0; for (var col = 0; col < 8; col++) v = (v << 1) | (B[row * 9 + col] > B[row * 9 + col + 1] ? 1 : 0);
      hex += ('0' + v.toString(16)).slice(-2);
    }
    // color: media RGB de una rejilla 4×3 de toda la imagen (la pista, ~40 % del encuadre, cuenta: el dHash no ve el color)
    var col = [];
    for (var gy = 0; gy < 3; gy++) for (var gx = 0; gx < 4; gx++) {
      var r0 = 0, g0 = 0, b0 = 0, m = 0, X0 = Math.floor(gx * tw / 4), X1 = Math.floor((gx + 1) * tw / 4), Y0 = Math.floor(gy * th / 3), Y1 = Math.floor((gy + 1) * th / 3);
      for (var yy = Y0; yy < Y1; yy += 3) for (var xx = X0; xx < X1; xx += 3) { var k = (yy * tw + xx) * 4; r0 += d[k]; g0 += d[k + 1]; b0 += d[k + 2]; m++; }
      col.push(Math.round(r0 / m), Math.round(g0 / m), Math.round(b0 / m));
    }
    return { hash: hex, mean: Math.round(mean / 72), col: col };
  }
  hideActors();
  var out = [];
  for (var i = 0; i < list.length; i++) {
    var key = list[i], id = V.parse('club:' + key + (kind === 'beach' ? ':b' : ''));
    if (!id) { out.push({ key: key, err: 'sin id' }); continue; }
    go(id); hideActors(); await wait(300); await frames(3); await grab();
    var row = Object.assign({ key: key, id: id }, dhash());
    if (VB.Arena.map() !== id) row.err = 'no montó (está ' + VB.Arena.map() + ')';
    row.jpg = cv.toDataURL('image/jpeg', 0.82).split(',')[1];
    // miniatura para el índice autocontenido (320×180): con las de 480 el índice pasaba de 16 MB
    g3.drawImage(cv, 0, 0, 320, 180); row.thumb = cv3.toDataURL('image/jpeg', 0.72).split(',')[1];
    out.push(row);
  }
  return { rows: out, hidden: hidden };
}

function chunk(a, n) { const o = []; for (let i = 0; i < a.length; i += n) o.push(a.slice(i, i + n)); return o; }
function withTimeout(p, ms, what) { let t; return Promise.race([p, new Promise((_, rej) => { t = setTimeout(() => rej(new Error('tiempo agotado: ' + what)), ms); })]).finally(() => clearTimeout(t)); }
function ham(a, b) { let d = 0; for (let i = 0; i < 16; i += 4) { let x = parseInt(a.substr(i, 4), 16) ^ parseInt(b.substr(i, 4), 16); while (x) { d += x & 1; x >>= 1; } } return d; }
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]); }
function safe(s) { return String(s).replace(/[^A-Za-z0-9_-]/g, '_'); }

/** Gemela más cercana de cada sede dentro de su grupo (mismo país en pista; toda la muestra en playa). */
function cdist(a, b) { if (!a || !b) return 999; let s = 0; for (let i = 0; i < a.length; i += 3) s += Math.hypot(a[i] - b[i], a[i + 1] - b[i + 1], a[i + 2] - b[i + 2]); return Math.round(s / (a.length / 3)); }
/** Gemela = Hamming ≤ TWIN Y color medio parecido (distancia RGB media de la rejilla 4×3 < CTWIN): mismo fondo y mismos colores;
 *  o casi el mismo color (< CTWIN2) con un fondo no muy distinto (Hamming ≤ TWIN2): las del umbral también se avisan.
 *  near = la más cercana por Hamming (con su distancia de color), twin = la peor gemela de verdad (o null). */
function isTwin(d, cd) { return (d <= TWIN && cd < CTWIN) || (d <= TWIN2 && cd < CTWIN2); }
function nearest(rows, groupOf) {
  const warns = [];
  for (const a of rows) {
    if (!a.hash) continue;
    let best = null;
    let twin = null;
    for (const b of rows) {
      if (b === a || !b.hash || groupOf(b) !== groupOf(a)) continue;
      const d = ham(a.hash, b.hash), cd = cdist(a.col, b.col);
      if (!best || d < best.d || (d === best.d && cd < best.cd)) best = { d, cd, key: b.key };
      if (isTwin(d, cd) && (!twin || d + cd / 10 < twin.d + twin.cd / 10)) twin = { d, cd, key: b.key };
    }
    a.near = best; a.twin = twin;
  }
  const done = {};
  for (const a of rows) if (a.twin) { const k = [a.key, a.twin.key].sort().join('|') + a.kind; if (done[k]) continue; done[k] = 1; warns.push(a.kind + ' ' + a.key + ' ~ ' + a.twin.key + ': Hamming ' + a.twin.d + ', color ' + a.twin.cd + ' (Hamming ≤ ' + TWIN + ' y color < ' + CTWIN + ', o Hamming ≤ ' + TWIN2 + ' y color < ' + CTWIN2 + ')'); }
  return warns;
}

const CSS = `:root{--bg:#f5f3ee;--fg:#1d1f24;--mut:#666b75;--card:#fff;--line:#dedad2;--warn:#c0392b;--ok:#2e7d4f;--acc:#0d6e8a}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#15171c;--fg:#e9e7e2;--mut:#9aa0aa;--card:#1f2228;--line:#30343c;--warn:#ff7a6b;--ok:#6fcf97;--acc:#5cc3e0}}
:root[data-theme="dark"]{--bg:#15171c;--fg:#e9e7e2;--mut:#9aa0aa;--card:#1f2228;--line:#30343c;--warn:#ff7a6b;--ok:#6fcf97;--acc:#5cc3e0}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.4 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;padding:16px;max-width:1600px;margin:0 auto}
h1{font-size:22px;margin:4px 0 6px}h2{font-size:18px;margin:28px 0 8px;padding-top:8px;border-top:1px solid var(--line)}h3{font-size:14px;margin:16px 0 6px;color:var(--mut);text-transform:uppercase;letter-spacing:.04em}
p.m,.m{color:var(--mut)}a{color:var(--acc)}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:12px}
.c{background:var(--card);border:1px solid var(--line);border-radius:10px;overflow:hidden}
.c img{display:block;width:100%;aspect-ratio:16/9;object-fit:cover;background:#000}
.c .t{padding:7px 9px 9px}.c b{display:block;font-size:13px}.c .s{font-size:12px;color:var(--mut)}
.tag{display:inline-block;font:600 11px/1 ui-monospace,Consolas,monospace;padding:3px 5px;border-radius:4px;background:var(--bg);border:1px solid var(--line);margin:3px 3px 0 0}
.sw{display:inline-block;width:10px;height:10px;border-radius:2px;vertical-align:-1px;margin-right:3px;border:1px solid var(--line)}
.tw{color:var(--warn);font-weight:600}.ok{color:var(--ok)}
.c.bad{border-color:var(--warn);box-shadow:0 0 0 1px var(--warn)}
nav{display:flex;flex-wrap:wrap;gap:6px;margin:10px 0}nav a{padding:4px 8px;border:1px solid var(--line);border-radius:6px;text-decoration:none;background:var(--card);font-size:13px}
ul.w{margin:6px 0;padding-left:18px}ul.w li{margin:2px 0}
@media (max-width:600px){.grid{grid-template-columns:repeat(auto-fill,minmax(160px,1fr))}body{padding:12px 16px}}`;

function card(r, src) {
  const tags = r.kind === 'hall'
    ? [r.arch + (r.flavor ? '·' + r.flavor : ''), 't' + r.tier, r.roof, r.back, r.light, r.floor, r.stands, r.win]
    : [r.arch, 't' + r.tier, r.hour, r.backdrop, r.veg, r.hut];
  const tw = !!r.twin;
  return '<div class="c' + (tw || r.err ? ' bad' : '') + '"><img loading="lazy" src="' + src + '" alt="' + esc(r.name) + '"><div class="t"><b>' + esc(r.name) + '</b>' +
    '<div class="s">' + esc(r.club) + ' · ' + esc(r.key) + ' · ' + esc(r.city) + '</div><div>' + tags.filter(Boolean).map(t => '<span class="tag">' + esc(t) + '</span>').join('') + '</div>' +
    '<div class="s"><span class="sw" style="background:' + esc(r.court) + '"></span>dHash ' + esc(r.hash || '—') +
    (r.near ? ' · más cercana ' + esc(r.near.key) + ' <span class="' + (r.near.d <= TWIN ? 'tw' : 'ok') + '">H ' + r.near.d + '</span> <span class="' + (r.near.cd < CTWIN ? 'tw' : 'ok') + '">c ' + r.near.cd + '</span>' : '') + (tw && r.twin.key !== r.near.key ? ' · <span class="tw">gemela ' + esc(r.twin.key) + ' H ' + r.twin.d + ' c ' + r.twin.cd + '</span>' : '') + (r.err ? ' · <span class="tw">' + esc(r.err) + '</span>' : '') + '</div></div></div>';
}

(async () => {
  let code = 0;
  const t0 = Date.now(), fails = [];
  const clubsEnv = process.env.CLUBS ? process.env.CLUBS.split(',') : null;
  setTimeout(() => { console.error('TIEMPO AGOTADO'); process.exit(2); }, 12 * BATCH_MS).unref();
  let pick, hidden = [];
  {
    const page = await CDP.open({ size: SIZE });
    await page.navigate('debug=menu'); await CDP.sleep(3500);
    pick = await page.evalJs('(' + pickAll.toString() + ')(' + NB + ',' + JSON.stringify(ONLY_CC) + ',' + JSON.stringify(clubsEnv) + ')');
    page.close();
  }
  console.log('pistas: ' + pick.halls.length + ' · playas: ' + pick.beaches.length + ' · calidad ' + QUAL + ' · ' + SIZE + ' → ' + TW + '×' + TH);
  const byKey = {}, thumbs = {};
  for (const r of pick.halls) byKey['h|' + r.key] = r;
  for (const r of pick.beaches) byKey['b|' + r.key] = r;
  const jobs = [];
  chunk(pick.halls.map(r => r.key), BATCH).forEach(l => jobs.push({ kind: 'hall', list: l }));
  chunk(pick.beaches.map(r => r.key), BATCH).forEach(l => jobs.push({ kind: 'beach', list: l }));
  for (let j = 0; j < jobs.length; j++) {
    const jb = jobs[j], page = await CDP.open({ size: SIZE });
    try {
      await page.navigate('debug=rally&quality=' + QUAL + '&map=' + (jb.kind === 'beach' ? 'platja' : 'palau')); await CDP.sleep(5000);
      const v = await withTimeout(page.evalJs('(' + runBatch.toString() + ')(' + JSON.stringify(jb.list) + ',' + JSON.stringify(jb.kind) + ',' + TW + ',' + TH + ')', true), BATCH_MS, 'lote ' + (j + 1));
      if (!hidden.length) hidden = v.hidden;
      for (const r of v.rows) {
        const meta = byKey[(jb.kind === 'beach' ? 'b|' : 'h|') + r.key];
        if (r.err) { fails.push(jb.kind + ' ' + r.key + ': ' + r.err); }
        if (r.mean != null && r.mean < 8) fails.push(jb.kind + ' ' + r.key + ': imagen negra (media ' + r.mean + ')');
        Object.assign(meta, { hash: r.hash, col: r.col, mean: r.mean, err: r.err, mounted: r.id });
        if (r.thumb) thumbs[(jb.kind === 'beach' ? 'b|' : 'h|') + r.key] = r.thumb;
        if (r.jpg) {
          const f = path.join(OUT, meta.cc, safe(meta.key.split(':')[1]) + (jb.kind === 'beach' ? '-b' : '-h') + '.jpg');
          fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, Buffer.from(r.jpg, 'base64')); meta.file = path.relative(OUT, f).replace(/\\/g, '/');
        }
      }
      console.log('lote ' + (j + 1) + '/' + jobs.length + ' (' + jb.kind + ', ' + jb.list.length + ') ok · ' + Math.round((Date.now() - t0) / 1000) + ' s');
      if (page.errors.length) { fails.push('lote ' + (j + 1) + ': errores de JS: ' + page.errors.slice(0, 5).join(' | ')); console.error(page.errors.slice(0, 10).join('\n')); }
    } catch (e) { fails.push('lote ' + (j + 1) + ': ' + (e && e.message || e)); console.error(e && e.message || e); }
    page.close();
  }
  if (fails.length) code = 1;
  // gemelas
  const warns = nearest(pick.halls, r => r.cc).concat(nearest(pick.beaches, () => 'b'));
  // salidas
  fs.mkdirSync(OUT, { recursive: true });
  const strip = r => { const o = Object.assign({}, r); return o; };
  fs.writeFileSync(path.join(OUT, 'shots.json'), JSON.stringify({ date: new Date().toISOString(), size: SIZE, quality: QUAL, twin: TWIN, hidden, warns, fails, halls: pick.halls.map(strip), beaches: pick.beaches.map(strip) }, null, 1));
  if (process.env.NOHTML !== '1') {
    const head = (title) => '<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + esc(title) + '</title><style>' + CSS + '</style></head><body>';
    const imgB64 = r => { const t = thumbs[(r.kind === 'beach' ? 'b|' : 'h|') + r.key]; if (t) return 'data:image/jpeg;base64,' + t; try { return 'data:image/jpeg;base64,' + fs.readFileSync(path.join(OUT, r.file)).toString('base64'); } catch (e) { return ''; } };
    const sections = [], navs = [];
    let nTwinCC = 0;
    for (const co of pick.countries) {
      const H = pick.halls.filter(r => r.cc === co.cc), B = pick.beaches.filter(r => r.cc === co.cc);
      if (!H.length && !B.length) continue;
      const archs = {}; H.forEach(r => { archs[r.arch] = (archs[r.arch] || 0) + 1; });
      const tw = H.filter(r => r.twin).length; if (tw) nTwinCC++;
      const minD = H.reduce((m, r) => r.near ? Math.min(m, r.near.d) : m, 99);
      const summary = H.length + ' pistas · ' + Object.keys(archs).length + ' arquetipos (' + Object.keys(archs).sort().map(a => a + '×' + archs[a]).join(', ') + ') · Hamming mínimo ' + (minD < 99 ? minD : '—') + (tw ? ' · <span class="tw">' + tw + ' con gemela</span>' : '');
      const body = (src) => '<p class="m">' + summary + '</p>' + (H.length ? '<h3>Pista</h3><div class="grid">' + H.map(r => card(r, src(r))).join('') + '</div>' : '') +
        (B.length ? '<h3>Playa</h3><div class="grid">' + B.map(r => card(r, src(r))).join('') + '</div>' : '');
      // hoja del país (imágenes relativas)
      fs.mkdirSync(path.join(OUT, co.cc), { recursive: true });
      fs.writeFileSync(path.join(OUT, co.cc, 'index.html'), head('Sedes ' + co.cc) + '<p class="m"><a href="../index.html">← índice</a></p><h1>' + esc(co.name) + ' (' + co.cc + ')</h1>' +
        body(r => r.file ? path.basename(r.file) : '') + '</body></html>');
      navs.push('<a href="#' + co.cc + '">' + co.cc + (tw ? ' <span class="tw">' + tw + '</span>' : '') + '</a>');
      sections.push('<h2 id="' + co.cc + '">' + esc(co.name) + ' (' + co.cc + ') <a class="m" style="font-size:12px" href="' + co.cc + '/index.html">hoja</a></h2>' + body(imgB64));
    }
    // playas de la muestra, juntas (la comparación de playas es entre todas)
    const beachAll = pick.beaches.length ? '<h2 id="playas">Playas de la muestra (' + pick.beaches.length + ')</h2><p class="m">Gemela = la playa más cercana de toda la muestra (una o dos por país: las de países distintos no coinciden en un mismo circuito, así que esas gemelas son orientativas).</p><div class="grid">' + pick.beaches.map(r => card(r, imgB64(r))).join('') + '</div>' : '';
    const sumH = pick.halls.length, archG = {}; pick.halls.forEach(r => { archG[r.arch] = (archG[r.arch] || 0) + 1; });
    const html = head('Sedes generadas') + '<h1>Sedes generadas: hojas de contactos</h1><p class="m">' + new Date().toISOString().slice(0, 16).replace('T', ' ') + ' · cámara de juego (jugada 2v2), calidad ' + QUAL +
      ', sin jugadores · ' + sumH + ' pistas, ' + pick.beaches.length + ' playas · arquetipos: ' + Object.keys(archG).sort().map(a => a + ' ' + archG[a]).join(', ') +
      ' · dHash 64 bits, aviso si Hamming ≤ ' + TWIN + ' (color &lt; ' + CTWIN + ') o Hamming ≤ ' + TWIN2 + ' con color &lt; ' + CTWIN2 + ' entre clubes del mismo país (playas: entre toda la muestra).</p>' +
      '<h3>Avisos (' + warns.length + ')</h3>' + (warns.length ? '<ul class="w">' + warns.map(w => '<li>' + esc(w) + '</li>').join('') + '</ul>' : '<p class="ok">Ninguna gemela por debajo del umbral.</p>') +
      (fails.length ? '<h3 class="tw">Fallos (' + fails.length + ')</h3><ul class="w">' + fails.map(w => '<li>' + esc(w) + '</li>').join('') + '</ul>' : '') +
      '<nav>' + navs.join('') + (beachAll ? '<a href="#playas">Playas</a>' : '') + '</nav>' + sections.join('') + beachAll + '</body></html>';
    fs.writeFileSync(path.join(OUT, 'index.html'), html);
    console.log('índice: ' + path.relative(path.join(__dirname, '..'), path.join(OUT, 'index.html')) + ' (' + Math.round(html.length / 1024) + ' KB) · países con gemelas: ' + nTwinCC);
  }
  console.log('ocultos: ' + hidden.join(', '));
  if (warns.length) console.log('AVISOS (' + warns.length + '):\n  ' + warns.join('\n  '));
  if (fails.length) console.log('FALLOS (' + fails.length + '):\n  ' + fails.slice(0, 40).join('\n  '));
  console.log((code ? '== HAY FALLOS ==' : '== TODO OK ==') + ' · ' + Math.round((Date.now() - t0) / 1000) + ' s');
  process.exit(code);
})();
