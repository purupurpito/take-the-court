#!/usr/bin/env node
/* TAKE THE COURT — tools/balltest.js (owner: arena)
 * ¿Se ve la pelota en todas las sedes? (15-nov-2026, pregunta de Ferran). Como tools/venueshots.js (CDP, ?debug=rally, sedes
 * montadas con VB.Arena.onSettings + forceMap, jugadores y aros fuera), pero con la PELOTA (y sin el resto de fx: sombra, línea
 * de altura, aro) y la cámara de juego CONGELADA (VB.CameraRig.update anulado tras montar la escena), colocando la pelota en
 * posiciones típicas (coordenadas de sim, z arriba; nuestro campo es x > 0, la cámara está detrás):
 *   saque   saque rival en lo alto (x = -HL-0,5, z 3,4): fondo = pared / grada del fondo
 *   red     arco a media altura sobre la red (x 0, z 4,2): fondo = grada del fondo o techo
 *   propio  bajando cerca del suelo en campo propio (x 3,5, z 0,8): fondo = suelo / pista
 *   rival   bajando en campo rival (x -5, y -3,4, z 0,9; fuera del «M T C» turquesa de la red): se ve a través de la red, fondo = suelo lejano / zona libre
 *   alto    alto contra el fondo (x -6, z 5,5): pared del fondo, grada alta o techo
 *   banda   alto por la banda (y -HW-0,8, z 4,5): grada lateral
 * (las que caen fuera del encuadre, margen 6 %, se saltan). Por posición: dos fotogramas (con y sin pelota) y en el recorte
 * alrededor de la pelota (radio proyectado Rb, contorno ol·Rb):
 *   dE    ΔE76 (CIELAB) entre la media del cuerpo (r < 0,8 Rb) y la del anillo de fondo (ol·Rb+2 … +max(4, Rb))
 *   dL    |ΔL*| de esas dos medias
 *   edge  silueta: por 48 radios, ΔE76 máximo entre el fondo justo fuera (ol·Rb+1,5) y el contorno (r ≈ Rb·(1+ol)/2) o el panel
 *         (0,8 Rb); edge = percentil 25 (la silueta se lee si se distingue en casi toda la vuelta)
 *   vis   el diferente de los dos fotogramas dentro del disco / área del disco (la pelota no está tapada: red, poste, cartel)
 *   raw   = min(dE, edge) + 0,5·max(dE, edge)
 *   score = raw · √(Rb / 10 px): la nota que se compara con el umbral (LIM = 30, calibrado a ojo con los recortes; ver
 *         notes/arena.md, «Pelota por sede»). La pelota cercana (Rb ≈ 23 px) se ve aunque sus paneles crema caigan sobre arena
 *         crema; la lejana (Rb ≈ 8-9 px, saque rival) necesita más contraste.
 * Salidas (tools/out/ball/): ball.json (todas las medidas), crops/<modo>/<sede>-<pos>.png (recorte 96×96 a resolución real) y
 * index.html (los peores, autocontenido).
 * Variables: MODE=2|6 (cámara 2v2, por defecto, o 6v6 rally6: solo pistas) · Q=high|low · CLUBS=IT:PER,... (solo esas; :b = playa)
 *            HAND=0 (sin las 6 a mano) · PLAYAS=0 (sin playas generadas) · LIM=score umbral (por defecto 30) · FULL=1 (guarda
 *            también el fotograma entero de cada posición por debajo del umbral) · CC=IT,ES · KIND=hall|beach · LOGO=1 (añade la posición «logo», tras el «M T C» de la red) · TAG=x (salida en tools/out/ball-x) · QS=post=0 (más parámetros de la página) · VB_ROOT=carpeta (otra copia del juego, p. ej. la de antes de un cambio)
 * Uso: node tools/balltest.js [WxH=1280x720]   Sale con 1 si alguna posición queda por debajo del umbral o hay errores.
 */
'use strict';
const fs = require('fs'), path = require('path');
const CDP = require('./cdp.js');
const SIZE = process.argv[2] || '1280x720', QUAL = process.env.Q || 'high', MODE = process.env.MODE === '6' ? 6 : 2;
const LIM = +(process.env.LIM || 30), FULL = process.env.FULL === '1';
const ONLY_CC = process.env.CC ? process.env.CC.toUpperCase().split(',') : null;
const CLUBS = process.env.CLUBS ? process.env.CLUBS.split(',') : null;
const BATCH = 40, BATCH_MS = 600000;
const OUT = path.join(__dirname, 'out', 'ball' + (MODE === 6 ? '6' : '') + (QUAL !== 'high' ? '-' + QUAL : '') + (process.env.TAG ? '-' + process.env.TAG : ''));
const HANDS = [['palau', 'hall'], ['canrebot', 'hall'], ['cupula', 'hall'], ['platja', 'beach'], ['fanals', 'beach'], ['moll', 'beach']];

/** En la página: ids de todas las sedes generadas (pista y playa). */
function listAll(onlyCC) {
  var out = [];
  VB.Leagues.regions.forEach(function (rg) {
    (rg.countries || []).forEach(function (co) {
      if (onlyCC && onlyCC.indexOf(co.code) < 0) return;
      (co.divisions || []).forEach(function (d) { (d.clubs || []).forEach(function (k) { out.push(co.code + ':' + k.short); }); });
    });
  });
  return out;
}

/** En la página: mide la pelota en cada sede del lote. list = [{ id, label, kind }]. */
async function runBatch(list, opt) {
  var c = VB.ctx, r = c.renderer, V = VB.Venues, T = c.THREE, g = c.game, C = VB.C, cam = c.camera;
  function frames(n) { return new Promise(function (res) { var k = 0; (function f() { if (++k > n) res(); else requestAnimationFrame(f); })(); }); }
  function wait(ms) { return new Promise(function (res) { setTimeout(res, ms); }); }
  function go(id) { VB.Arena.onSettings(Object.assign({}, c.settings, { arena: V.kindOf(id), forceMap: id }), 'arena'); }
  // cámara congelada en el plano de juego de la escena
  if (!VB.CameraRig.__bt) { VB.CameraRig.__bt = VB.CameraRig.update; VB.CameraRig.update = function () { }; }
  var ballM = c.scene.getObjectByName('ball'), outl = c.scene.getObjectByName('ballOutline'), piv = ballM.parent, fxr = c.scene.getObjectByName('fx');
  function force(o) { if (o.__vsHidden) return; o.__vsHidden = 1; Object.defineProperty(o, 'visible', { get: function () { return false; }, set: function () { }, configurable: true }); }
  var ballOn = true;
  [ballM, outl].forEach(function (o) { Object.defineProperty(o, 'visible', { get: function () { return ballOn; }, set: function () { }, configurable: true }); });
  function hideActors() {
    var p = c.scene.getObjectByName('players'); if (p) force(p);
    c.scene.children.forEach(function (o) { if (o.isMesh && !o.name && (o.renderOrder === 3 || o.renderOrder === 4)) force(o); });
    fxr.children.forEach(function (o) { if (o !== piv) force(o); });
  }
  var S = 96, cv = document.createElement('canvas'); cv.width = cv.height = S;
  var g2 = cv.getContext('2d', { willReadFrequently: true });
  var fw = 640, fh = 360, cvF = document.createElement('canvas'); cvF.width = fw; cvF.height = fh; var gF = cvF.getContext('2d');
  function grab(sx, sy, full) {
    return new Promise(function (res) {
      requestAnimationFrame(function () {
        g2.clearRect(0, 0, S, S); g2.drawImage(r.domElement, sx, sy, S, S, 0, 0, S, S);
        if (full) gF.drawImage(r.domElement, 0, 0, fw, fh);
        res(g2.getImageData(0, 0, S, S).data);
      });
    });
  }
  function lin(u) { u /= 255; return u <= 0.04045 ? u / 12.92 : Math.pow((u + 0.055) / 1.055, 2.4); }
  function lab(R, G, B) {
    var rl = lin(R), gl = lin(G), bl = lin(B);
    var X = (0.4124 * rl + 0.3576 * gl + 0.1805 * bl) / 0.95047, Y = 0.2126 * rl + 0.7152 * gl + 0.0722 * bl, Z = (0.0193 * rl + 0.1192 * gl + 0.9505 * bl) / 1.08883;
    function f(t) { return t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116; }
    var fx = f(X), fy = f(Y), fz = f(Z);
    return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
  }
  function dE(a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]); }
  function px(d, x, y) { x = Math.max(0, Math.min(S - 1, Math.round(x))); y = Math.max(0, Math.min(S - 1, Math.round(y))); var i = (y * S + x) * 4; return lab(d[i], d[i + 1], d[i + 2]); }
  function metr(dOn, dOff, ox, oy, Rb, ol) {
    // cuerpo, anillo y visibilidad
    var bm = [0, 0, 0], nb = 0, rm = [0, 0, 0], nr = 0, nDisk = 0, nDiff = 0, R0 = Rb * ol + 2, R1 = R0 + Math.max(4, Rb);
    for (var y = 0; y < S; y++) for (var x = 0; x < S; x++) {
      var dx = x + 0.5 - ox, dy = y + 0.5 - oy, rr = Math.sqrt(dx * dx + dy * dy), q = (y * S + x) * 4;
      if (rr < Rb * ol) { nDisk++; if (Math.abs(dOn[q] - dOff[q]) + Math.abs(dOn[q + 1] - dOff[q + 1]) + Math.abs(dOn[q + 2] - dOff[q + 2]) > 12) nDiff++; }
      if (rr < Rb * 0.8) { var L = lab(dOn[q], dOn[q + 1], dOn[q + 2]); bm[0] += L[0]; bm[1] += L[1]; bm[2] += L[2]; nb++; }
      else if (rr >= R0 && rr < R1) { var L2 = lab(dOn[q], dOn[q + 1], dOn[q + 2]); rm[0] += L2[0]; rm[1] += L2[1]; rm[2] += L2[2]; nr++; }
    }
    bm = bm.map(function (u) { return u / nb; }); rm = rm.map(function (u) { return u / nr; });
    var ed = [];
    for (var a = 0; a < 48; a++) {
      var ca = Math.cos(a * Math.PI / 24), sa = Math.sin(a * Math.PI / 24), rb = Rb * ol + 1.5;
      var bg = px(dOn, ox + ca * rb, oy + sa * rb), ro = Rb * (1 + ol) / 2, rp = Rb * 0.8;
      ed.push(Math.max(dE(bg, px(dOn, ox + ca * ro, oy + sa * ro)), dE(bg, px(dOn, ox + ca * rp, oy + sa * rp))));
    }
    ed.sort(function (u, w) { return u - w; });
    var m = { dE: dE(bm, rm), dL: Math.abs(bm[0] - rm[0]), edge: ed[12], vis: nDiff / Math.max(1, nDisk),
      ring: rm.map(function (u) { return +u.toFixed(0); }), body: bm.map(function (u) { return +u.toFixed(0); }) };
    m.raw = Math.min(m.dE, m.edge) + 0.5 * Math.max(m.dE, m.edge);
    return m;
  }
  var FIX = new T.Quaternion(), ORS = [new T.Quaternion(), new T.Quaternion().setFromEuler(new T.Euler(Math.PI / 2, 0.7, 0)), new T.Quaternion().setFromEuler(new T.Euler(0.4, 2.1, 1.2))];
  ballM.quaternion.multiply = function () { return this.copy(FIX); };
  var HL = g.beach ? C.BEACH.HL : C.HL, HW = g.beach ? C.BEACH.HW : C.HW;
  var POS = [['saque', -HL - 0.5, -1, 3.4], ['red', 0, 0.5, 4.2], ['propio', 3.5, 1.5, 0.8], ['rival', -5, -3.4, 0.9], ['alto', -6, 2.5, 5.5], ['banda', -2, -HW - 0.8, 4.5]];
  if (opt.logo) POS.push(['logo', -5, -1.2, 0.9]);   // (LOGO=1: detrás del «M T C» de la red)
  var b = g.ball, b0 = { x: b.x, y: b.y, z: b.z, vx: b.vx, vy: b.vy, vz: b.vz }, v3 = new T.Vector3(), out = [];
  var W = r.domElement.width, H = r.domElement.height, sc = W / (c.width || W);
  for (var i = 0; i < list.length; i++) {
    var it = list[i];
    it.id = V.parse(it.q) || it.q;   // (aquí y no antes: el registro de sedes generadas guarda pocas a la vez)
    go(it.id); hideActors(); await wait(250); await frames(3);
    var row = { id: it.id, label: it.label, kind: it.kind, mounted: VB.Arena.map(), pos: [] };
    if (row.mounted !== it.id) { row.err = 'no montó (está ' + row.mounted + ')'; out.push(row); continue; }
    for (var k = 0; k < POS.length; k++) {
      var P = POS[k];
      b.x = P[1]; b.y = P[2]; b.z = P[3]; b.vx = b.vy = b.vz = 0;
      ballOn = true; await frames(2);
      VB.toThree(b.x, b.y, b.z, v3); var dist = cam.position.distanceTo(v3);
      var nd = v3.clone().project(cam);
      if (Math.abs(nd.x) > 0.94 || Math.abs(nd.y) > 0.94 || nd.z > 1) { row.pos.push({ p: P[0], out: 1 }); continue; }
      var cx = (nd.x * 0.5 + 0.5) * W, cy = (0.5 - nd.y * 0.5) * H;
      var Rb = C.BR * piv.scale.x / (dist * Math.tan(cam.fov * Math.PI / 360)) * (H / 2), ol = outl.scale.x;
      var sx = Math.round(cx - S / 2), sy = Math.round(cy - S / 2), ox = cx - sx, oy = cy - sy;
      // la pelota gira: la nota depende de qué paneles miran a la cámara. Tres orientaciones FIJAS (la última multiplicación de
      // fx.js, ball.quaternion…multiply(spinQ), se sustituye por la orientación pedida) y la media de las tres
      ballOn = false; await frames(2); var dOff = await grab(sx, sy, false); ballOn = true;
      var ms = [], png = null, fullJpg = null;
      for (var oi = 0; oi < ORS.length; oi++) {
        FIX.copy(ORS[oi]); await frames(2);
        var dOn = await grab(sx, sy, opt.full && oi === 0);
        if (oi === 0) { png = cv.toDataURL('image/png').split(',')[1]; fullJpg = opt.full ? cvF.toDataURL('image/jpeg', 0.85).split(',')[1] : null; }
        ms.push(metr(dOn, dOff, ox, oy, Rb, ol));
      }
      function avg(k) { var t = 0; ms.forEach(function (m) { t += m[k]; }); return t / ms.length; }
      var e = { p: P[0], dE: +avg('dE').toFixed(1), dL: +avg('dL').toFixed(1), edge: +avg('edge').toFixed(1), vis: +avg('vis').toFixed(2),
        rpx: +Rb.toFixed(1), ring: ms[0].ring, body: ms[0].body, png: png };
      // nota cruda y nota por tamaño: una pelota grande (cerca) se ve aunque se parezca al fondo; una pequeña (lejos), peor
      e.raw = +avg('raw').toFixed(1); e.rawMin = +Math.min.apply(null, ms.map(function (m) { return m.raw; })).toFixed(1);
      e.score = +(e.raw * Math.sqrt(Rb / 10)).toFixed(1);
      if (fullJpg) e.full = fullJpg;
      row.pos.push(e);
    }
    out.push(row);
  }
  Object.assign(b, b0);
  return out;
}

function chunk(a, n) { const o = []; for (let i = 0; i < a.length; i += n) o.push(a.slice(i, i + n)); return o; }
function withTimeout(p, ms, what) { let t; return Promise.race([p, new Promise((_, rej) => { t = setTimeout(() => rej(new Error('tiempo agotado: ' + what)), ms); })]).finally(() => clearTimeout(t)); }
function safe(s) { return String(s).replace(/[^A-Za-z0-9_-]/g, '_'); }
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]); }

(async () => {
  const t0 = Date.now(), fails = [];
  setTimeout(() => { console.error('TIEMPO AGOTADO'); process.exit(2); }, 40 * 60000).unref();
  let items = [];
  if (CLUBS) {
    for (const k of CLUBS) {
      if (HANDS.some(h => h[0] === k)) { const h = HANDS.find(h => h[0] === k); items.push({ q: k, kind: h[1] }); continue; }
      const beach = /:b$/.test(k); items.push({ q: 'club:' + k.replace(/:b$/, '') + (beach ? ':b' : ''), kind: beach ? 'beach' : 'hall' });
    }
  } else {
    const page = await CDP.open({ size: SIZE });
    await page.navigate('debug=menu'); await CDP.sleep(3500);
    const keys = await page.evalJs('(' + listAll.toString() + ')(' + JSON.stringify(ONLY_CC) + ')');
    page.close();
    if (process.env.HAND !== '0' && !ONLY_CC) HANDS.forEach(h => { if (MODE === 2 || h[1] === 'hall') items.push({ q: h[0], kind: h[1] }); });
    keys.forEach(k => items.push({ q: 'club:' + k, kind: 'hall' }));
    if (MODE === 2 && process.env.PLAYAS !== '0') keys.forEach(k => items.push({ q: 'club:' + k + ':b', kind: 'beach' }));
  }
  if (MODE === 6) items = items.filter(x => x.kind === 'hall');
  if (process.env.KIND) items = items.filter(x => x.kind === process.env.KIND);
  // ids reales (VB.Venues.parse) en la página de cada lote
  const jobs = [];
  chunk(items.filter(x => x.kind === 'hall'), BATCH).forEach(l => jobs.push({ kind: 'hall', list: l }));
  chunk(items.filter(x => x.kind === 'beach'), BATCH).forEach(l => jobs.push({ kind: 'beach', list: l }));
  console.log('sedes: ' + items.length + ' · cámara ' + MODE + 'v' + MODE + ' · calidad ' + QUAL + ' · umbral ' + LIM);
  const rows = [];
  for (let j = 0; j < jobs.length; j++) {
    const jb = jobs[j], page = await CDP.open({ size: SIZE });
    try {
      const scene = MODE === 6 ? 'rally6' : 'rally';
      await page.navigate('debug=' + scene + '&quality=' + QUAL + '&map=' + (jb.kind === 'beach' ? 'platja' : 'palau') + (process.env.QS ? '&' + process.env.QS : '')); await CDP.sleep(5000);
      const list = jb.list.map(x => ({ q: x.q, label: x.q.replace(/^club:/, ''), kind: x.kind }));
      const v = await withTimeout(page.evalJs('(' + runBatch.toString() + ')(' + JSON.stringify(list) + ',' + JSON.stringify({ full: FULL, logo: process.env.LOGO === '1' }) + ')', true), BATCH_MS, 'lote ' + (j + 1));
      for (const row of v) {
        if (row.err) fails.push(row.label + ': ' + row.err);
        for (const e of row.pos) {
          if (e.out) continue;
          const dir = path.join(OUT, 'crops'); fs.mkdirSync(dir, { recursive: true });
          const f = path.join(dir, safe(row.label) + '-' + e.p + '.png'); fs.writeFileSync(f, Buffer.from(e.png, 'base64')); e.file = path.relative(OUT, f).replace(/\\/g, '/');
          if (e.full) { if (e.score < LIM) { const ff = path.join(OUT, 'full', safe(row.label) + '-' + e.p + '.jpg'); fs.mkdirSync(path.dirname(ff), { recursive: true }); fs.writeFileSync(ff, Buffer.from(e.full, 'base64')); e.fullFile = path.relative(OUT, ff).replace(/\\/g, '/'); } delete e.full; }
        }
        rows.push(row);
      }
      if (page.errors.length) fails.push('lote ' + (j + 1) + ': errores de JS: ' + page.errors.slice(0, 3).join(' | '));
      console.log('lote ' + (j + 1) + '/' + jobs.length + ' (' + jb.kind + ', ' + jb.list.length + ') · ' + Math.round((Date.now() - t0) / 1000) + ' s');
    } catch (e) { fails.push('lote ' + (j + 1) + ': ' + (e && e.message || e)); console.error(e && e.message || e); }
    page.close();
  }
  // resumen
  const all = [];
  rows.forEach(r => r.pos.forEach(e => { if (!e.out) all.push(Object.assign({ label: r.label, kind: r.kind, id: r.id }, e)); }));
  all.sort((a, b) => a.score - b.score);
  const bad = all.filter(e => e.score < LIM || e.vis < 0.5);
  const badVenues = [...new Set(bad.map(e => e.label))];
  const byPos = {}; all.forEach(e => { (byPos[e.p] = byPos[e.p] || []).push(e.score); });
  const pct = (a, q) => { a = a.slice().sort((x, y) => x - y); return a[Math.floor(q * (a.length - 1))]; };
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'ball.json'), JSON.stringify({ date: new Date().toISOString(), mode: MODE, quality: QUAL, lim: LIM, fails, rows: rows.map(r => Object.assign({}, r, { pos: r.pos.map(e => { const o = Object.assign({}, e); delete o.png; return o; }) })) }, null, 1));
  const head = '<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Pelota por sede</title><style>:root{--bg:#f5f3ee;--fg:#1d1f24;--mut:#666b75;--card:#fff;--line:#dedad2;--warn:#c0392b}@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#15171c;--fg:#e9e7e2;--mut:#9aa0aa;--card:#1f2228;--line:#30343c;--warn:#ff7a6b}}:root[data-theme="dark"]{--bg:#15171c;--fg:#e9e7e2;--mut:#9aa0aa;--card:#1f2228;--line:#30343c;--warn:#ff7a6b}body{margin:0 auto;max-width:1400px;padding:16px;background:var(--bg);color:var(--fg);font:14px/1.4 system-ui,sans-serif}.g{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px}.c{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:6px;font-size:12px}.c img{width:100%;image-rendering:pixelated;display:block}.c.bad{border-color:var(--warn)}.m{color:var(--mut)}</style></head><body>';
  const cardH = e => '<div class="c' + (e.score < LIM ? ' bad' : '') + '"><img src="data:image/png;base64,' + fs.readFileSync(path.join(OUT, e.file)).toString('base64') + '"><b>' + esc(e.label) + '</b> · ' + e.p + '<div class="m">score ' + e.score + ' · ΔE ' + e.dE + ' · ΔL ' + e.dL + ' · borde ' + e.edge + ' · vis ' + e.vis + ' · r ' + e.rpx + ' px</div></div>';
  const html = head + '<h1>Pelota por sede</h1><p class="m">' + new Date().toISOString().slice(0, 16) + ' · cámara ' + MODE + 'v' + MODE + ' congelada · calidad ' + QUAL + ' · ' + rows.length + ' sedes, ' + all.length + ' posiciones · umbral score &lt; ' + LIM + ' · por debajo: ' + bad.length + ' posiciones en ' + badVenues.length + ' sedes</p>' +
    '<p class="m">Percentil 5 / 50 por posición: ' + Object.keys(byPos).map(p => p + ' ' + pct(byPos[p], 0.05) + ' / ' + pct(byPos[p], 0.5)).join(' · ') + '</p>' +
    '<h2>Las 60 peores</h2><div class="g">' + all.slice(0, 60).map(cardH).join('') + '</div><h2>Muestra de buenas (mediana)</h2><div class="g">' + all.slice(Math.floor(all.length / 2), Math.floor(all.length / 2) + 12).map(cardH).join('') + '</div></body></html>';
  fs.writeFileSync(path.join(OUT, 'index.html'), html);
  console.log('posiciones: ' + all.length + ' · percentil 5/50 por posición: ' + Object.keys(byPos).map(p => p + ' ' + pct(byPos[p], 0.05) + '/' + pct(byPos[p], 0.5)).join(' · '));
  console.log('peores 25:\n  ' + all.slice(0, 25).map(e => e.label + ' ' + e.p + ' score ' + e.score + ' (ΔE ' + e.dE + ' ΔL ' + e.dL + ' borde ' + e.edge + ' vis ' + e.vis + ' r ' + e.rpx + ' anillo L' + e.ring.join(',') + ')').join('\n  '));
  console.log('por debajo del umbral (' + LIM + ') o tapada: ' + bad.length + ' posiciones en ' + badVenues.length + ' sedes' + (badVenues.length ? ': ' + badVenues.slice(0, 80).join(', ') : ''));
  if (fails.length) console.log('FALLOS:\n  ' + fails.join('\n  '));
  console.log((bad.length || fails.length ? '== HAY PELOTAS DIFÍCILES ==' : '== TODO OK ==') + ' · ' + Math.round((Date.now() - t0) / 1000) + ' s · ' + path.relative(path.join(__dirname, '..'), path.join(OUT, 'index.html')));
  process.exit(bad.length || fails.length ? 1 : 0);
})();
