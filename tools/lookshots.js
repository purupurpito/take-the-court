#!/usr/bin/env node
/* MAKE THE CUT — tools/lookshots.js (auditoría del Vestuario)
 * Hojas de contacto (PNG) de TODOS los objetos del Vestuario para mirarlas sin abrir el juego: cada hoja junta muchas
 * capturas pequeñas con una etiqueta debajo (id · vista · piel/kit). Una sola carga de página por fase y por sede; el aspecto
 * se cambia dentro de la página (VB.Look.fix + resolve, así las reglas de compatibilidad se aplican) y las capturas se pintan
 * en un lienzo aparte justo después de un render síncrono del renderer del juego (mismo post-proceso, luces y programas).
 *
 * Fases:
 *  - primeros planos: la vista previa del Vestuario (VB.Doll.preview vía ctx.actions.showroom, menú con &map=palau|beach y
 *    &quality=high = LOD2), cámara propia de 30° alrededor del muñeco: frente, espalda, 3/4 izquierda, lado derecho y desde
 *    arriba (35°), encuadrando la parte del cuerpo del objeto (cabeza, busto, torso, piernas o pies) + cuerpo entero.
 *    Fila 1: piel clara + kit A (blanco/rojo); fila 2: piel oscura + kit B (marino/amarillo).
 *  - distancia de juego («game»): una escena de partido de verdad (?debug=rally6h en pista = 6v6 con tu atleta; ?debug=rally&map=beach
 *    en playa = 2v2, tus dos atletas), la cámara de partido y el LOD que elige players.js; el look se aplica con Players.setKit
 *    ({looks}). Escritorio 1280x720 (calidad auto = alta) y móvil 640x360 (táctil, dpr 2, UA Android → calidad media, LOD por
 *    distancia, pixelRatio 1,25). Cada fila: fotograma entero + recorte del atleta a píxel nativo ampliado (vecino más cercano).
 *
 * Uso:
 *   node tools/lookshots.js [grupos] [--item=id[,id]] [--venue=hall|beach] [--out=carpeta] [--tile=N]
 *     grupos (coma): base,hair,back,head,torso,legs,combos,game  (por defecto todos)
 *     back: comparar peinados y gorros DE ESPALDAS en una sola hoja por vista (una casilla por peinado, hasta 32):
 *       back/back-peinados-<vista>-<sede>: espalda, 3/4 espalda izq., 3/4 espalda der., partido (cámara del partido en el móvil, al tamaño
 *       del buffer de 800x450: ≈ 68 px de muñeco; LOD1, atlas 512², ampliado sin suavizar) y partido-lod0 (lo mismo en LOD0, la calidad baja);
 *       back/back-gorros-<sede>: cada gorro con tupé (espalda, 3/4 espalda, partido) y con coleta (espalda): ¿pelo en la nuca?
 *       --hair=negro|rubio|castOsc… cambia el color del pelo (castaño oscuro por defecto); --item=… filtra peinados o gorros.
 *     --item=id    solo esos objetos (peinados incluidos: tupe, afro…; combos: c_head_hall…); con game también
 *     --venue=     solo esa sede
 *     --fmt=png    PNG en vez de JPEG (calidad 0,86; por defecto JPEG: ~0,3 MB por hoja en vez de ~2,5 MB)
 *   Salida: tools/out/look-audit/<grupo>/<fichero>.jpg (+ manifest.json con lo que hay en cada hoja).
 *   Ejemplos: node tools/lookshots.js head --item=gorra
 *             node tools/lookshots.js game --item=manguitoLlamas --venue=hall
 *   head: 8 columnas por objeto (frente, 3/4, lado, espalda, arriba, desde abajo 30°, frente LOD0, partido); --hv=0,5 elige columnas
 *   --bviews=espalda,34-izq,34-der,partido,partido-lod0,frente,34-frente,lado,arriba,frente-lod0: vistas del grupo back (5 primeras por defecto)
 * Una sola instancia de Chrome a la vez (se cierra al acabar cada fase).
 */
'use strict';
const path = require('path'), fs = require('fs');
const CDP = require('./cdp.js');

const args = process.argv.slice(2);
const opt = {}; const pos = [];
for (const a of args) { const m = /^--([a-z]+)=(.*)$/.exec(a); if (m) opt[m[1]] = m[2]; else pos.push(a); }
const ALLG = ['base', 'hair', 'back', 'head', 'torso', 'legs', 'combos', 'game'];
const groups = (pos[0] || ALLG.join(',')).split(',').filter(Boolean);
for (const g of groups) if (ALLG.indexOf(g) < 0) { console.error('grupo desconocido: ' + g); process.exit(2); }
const onlyItems = opt.item ? opt.item.split(',') : null;
const venues = opt.venue ? [opt.venue] : ['hall', 'beach'];
const OUT = path.resolve(opt.out || path.join(CDP.ROOT, 'tools', 'out', 'look-audit'));
const TILE = +(opt.tile || 300);
const FMT = opt.fmt === 'png' ? 'png' : 'jpg';   // JPEG por defecto: el disco del PC va justo (PNG ≈ 2,5 MB por hoja, JPEG ≈ 0,3 MB)
const MANIFEST = path.join(OUT, 'manifest.json');
let manifest = {}; try { manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8')); } catch (e) { }

// ---------------------------------------------------------------- código que corre en la página
const PAGE = String.raw`
window.__LS = (function () {
  var c = VB.ctx, LK = VB.Look, D = VB.Doll, P = VB.Players, THREE = c.THREE || window.THREE, PI = Math.PI;
  var KITS = { A: { kitShirt: 0xf2f2ee, kitAccent: 0xd8262e, kitShorts: 0x1c1f2a, kitPattern: 'liso' },
               B: { kitShirt: 0x172246, kitAccent: 0xffcf2e, kitShorts: 0x172246, kitPattern: 'diag' } };
  var SKIN = { light: 0xf7dcc4, dark: 0x5a3626 };
  var HAIRC = { castOsc: 0x3a2416, negro: 0x241a14, rubio: 0xe0c070, canas: 0xd8d4cc, cobrizo: 0xb4471c, tAzul: 'tAzul', tRosa: 'tRosa' };
  var dm = D.dims();
  var handLow = dm.shoulder - dm.UPPER - dm.FORE - dm.PALM - 0.06 * dm.HAND_K;
  var top = dm.top, headH = 2 * dm.HEAD_RY;
  // regiones: [y0, y1, medio ancho, fondo (m que la parte sobresale hacia la cámara: se suma a la distancia)]
  var REG = {
    head: [top - headH - 0.16, top + 0.16, dm.HEAD_RX + 0.24, 0.3],
    bust: [dm.shoulder - 0.38, top + 0.1, dm.SH_X + 0.2, 0.3],
    torso: [handLow - 0.08, dm.shoulder + 0.16, dm.SH_X + 0.26, 0.3],
    legs: [-0.05, dm.HIP_H + 0.12, dm.HIP_W + 0.26, 0.3],
    feet: [-0.05, 0.42, dm.HIP_W + 0.22, 0.32],
    full: [-0.06, top + 0.14, dm.SH_X + 0.32, 0.35],
    face: [top - headH - 0.02, top + 0.01, dm.HEAD_RX + 0.05, 0.3]   // (WP3) primer plano de la cara: pintura, marcas, barbas, gafas
  };
  // vistas: acimut (0 = de frente, + = hacia la izquierda del muñeco) y elevación (grados)
  var VIEW = { front: [0, 4], back: [180, 4], q3l: [45, 6], sideR: [-90, 4], top: [20, 35], full: [0, 3], fullBack: [180, 3], q3bl: [135, 8], q3br: [-135, 8], below: [20, -30] };
  var RNAME = { head: 'cabeza', bust: 'busto', torso: 'torso', legs: 'piernas', feet: 'pies', full: '', face: 'cara' };
  var VNAME = { front: 'frente', back: 'espalda', q3l: '3/4 izq', sideR: 'lado der', top: 'arriba 35°', full: 'entero', fullBack: 'entero espalda', q3bl: '3/4 espalda izq', q3br: '3/4 espalda der', below: 'desde abajo 30°', game: 'partido' };
  // «partido»: la cámara del partido en el móvil vista desde tu atleta (tools/lookvis.js, CAM): 8,7 m, 41° de elevación, 27° fuera de
  // la espalda, fov 50,4; la distancia se escala para que el muñeco mida en el lienzo lo que mide en el buffer de 800x450 (≈ 68 px de muñeco)
  var GAMECAM = { hall: { d: 8.71, el: 41.3, az: 153, fov: 50.4, bufH: 450 }, beach: { d: 6.38, el: 34.9, az: 153, fov: 60, bufH: 450 } };

  function kit(k) { return P.kitFrom(KITS[k]); }
  function emptySet() { var o = {}; LK.SLOTS.forEach(function (s) { o[s] = ''; }); return o; }
  /** fit base: 'none' = nada de nada; 'std' = sin complementos pero con lo que un muñeco de pista lleva siempre
   *  (rodilleras, calcetines, tobillera y zapatillas de serie). */
  function baseFit(mode, skin, hair, style) {
    var f = LK.defaults(0);
    f.hall = emptySet(); f.beach = emptySet();
    if (mode !== 'none') { f.hall.knees = 'cortas'; f.hall.socks = 'media'; f.hall.ankle = 'blanca'; f.hall.shoes = 'clasicas'; }
    f.skin = skin; f.hair = hair; f.style = style || 'tupe';
    return f;
  }
  /** pone objetos: list = [[slot, id], …] (slot 'arm'/'wrist' = las dos ranuras; 'style'/'hair' = identidad). Pasa por fix. */
  function wear(f, ven, list) {
    var removed = [];
    list.forEach(function (sv) {
      var s = sv[0], id = sv[1], slots = s === 'arm' ? ['armL', 'armR'] : s === 'wrist' ? ['wristL', 'wristR'] : [s];
      slots.forEach(function (sl) {
        if (sl === 'style' || sl === 'hair' || sl === 'skin' || sl === 'hair2' || sl === 'hairFx') f[sl] = id; else f[ven][sl] = id;
        var r = LK.fix(f, ven, sl); f = r.fit; (r.removed || []).forEach(function (x) { removed.push(x.msg); });
      });
    });
    return { fit: f, removed: removed };
  }
  function frames(n) { return new Promise(function (res) { var k = 0; (function t() { if (++k > n) res(); else requestAnimationFrame(t); })(); }); }

  // ------------------------------------------------ hoja
  var S = null;
  function sheet(cols, rows, tw, th, title) {
    var lab = 30, head = 44, cv = document.createElement('canvas');
    cv.width = cols * tw + (cols + 1) * 4; cv.height = head + rows * (th + lab + 4) + 4;
    var g = cv.getContext('2d'); g.fillStyle = '#111317'; g.fillRect(0, 0, cv.width, cv.height);
    g.fillStyle = '#ffe680'; g.font = 'bold 17px Arial, sans-serif'; g.textBaseline = 'top';
    var t = String(title || ''); g.fillText(t.slice(0, 210), 8, 6);
    if (t.length > 210) { g.font = '13px Arial, sans-serif'; g.fillText(t.slice(210, 400), 8, 26); }
    S = { cv: cv, g: g, cols: cols, tw: tw, th: th, lab: lab, head: head, n: 0, tiles: [] };
    return true;
  }
  function subtitle(txt) { var g = S.g; g.fillStyle = '#9fd0ff'; g.font = '13px Arial, sans-serif'; g.fillText(String(txt).slice(0, 260), 8, 26); }
  function cell(i) { var cx = i % S.cols, cy = Math.floor(i / S.cols); return [4 + cx * (S.tw + 4), S.head + cy * (S.th + S.lab + 4)]; }
  function label(i, txt, warn) {
    var p = cell(i), g = S.g; g.fillStyle = warn ? '#5a1d1d' : '#23262e'; g.fillRect(p[0], p[1] + S.th, S.tw, S.lab);
    g.fillStyle = '#f2f2f2'; g.font = '13px Arial, sans-serif'; g.textBaseline = 'middle';
    var t = String(txt); while (g.measureText(t).width > S.tw - 8 && t.length > 4) t = t.slice(0, -1);
    g.fillText(t, p[0] + 4, p[1] + S.th + S.lab / 2); g.textBaseline = 'top';
    S.tiles.push(txt);
  }
  function render() { if (c.renderFn) c.renderFn(c); else c.renderer.render(c.scene, c.camera); }

  // ------------------------------------------------ primeros planos (vista previa del Vestuario)
  var pvOn = false;
  async function setLook(fit, ven, kitK, px, pose) {
    var tc = kit(kitK), L = LK.resolve(fit, ven, tc);
    var ok = c.actions.showroom(true, L, { tc: tc, num: 7, beach: ven === 'beach', px: px || 2 });
    pvOn = ok;
    await frames(3);
    var inf = D.preview.info(); if (!inf) return null;
    var r = inf.rig; r.tFix = 0; r.blinkOn = 0; r.blinkT = 999; D.preview.face('neutra');
    D.preview.pose(pose || 'stand');
    await frames(2);
    r.blinkOn = 0; r.blinkT = 999; D.preview.face('neutra');
    return { L: L, lod: inf.lod, tris: inf.tris };
  }
  /** Fuerza el nivel de detalle lod (0-2) en el muñeco de la vista previa (como setLod de doll.js; la malla queda en r.geos). */
  function forceLod(lod) {
    var inf = D.preview.info(); if (!inf || lod == null) return;
    var r = inf.rig, g = D.geometry(r, lod);
    if (r.skin.geometry !== g) { r.skin.geometry = g; if (r.ink) r.ink.geometry = g; }
  }
  /** Casilla «partido»: el muñeco entero con la cámara del partido, al tamaño del móvil (≈ 68 px de muñeco en 800x450) y ampliado sin suavizar. */
  function snapGame(i, txt, ven) {
    var inf = D.preview.info(); if (!inf) { label(i, 'SIN VISTA PREVIA', 1); return; }
    var root = inf.rig.root, cam = c.camera, G = GAMECAM[ven] || GAMECAM.hall, cv = c.renderer.domElement;
    root.rotation.y = PI / 2; root.updateMatrixWorld(true);
    var keep = { fov: cam.fov, asp: cam.aspect, film: cam.filmOffset, zoom: cam.zoom };
    var d = G.d * cv.height / G.bufH, az = G.az * PI / 180, el = G.el * PI / 180, cy = 0.5 * top, X = root.position.x, Z = root.position.z;
    cam.fov = G.fov; cam.aspect = cv.width / cv.height; cam.filmOffset = 0; cam.zoom = 1; if (cam.view && cam.clearViewOffset) cam.clearViewOffset();
    cam.updateProjectionMatrix(); cam.up.set(0, 1, 0);
    cam.position.set(X + Math.cos(az) * d * Math.cos(el), cy + d * Math.sin(el), Z - Math.sin(az) * d * Math.cos(el));
    cam.lookAt(X, cy, Z); cam.updateMatrixWorld(true);
    render();
    // recorte cuadrado alrededor del muñeco (caja proyectada) y ampliado al vecino más cercano
    var v = new THREE.Vector3(), x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    [-0.06, top + 0.2].forEach(function (y) { [-0.5, 0.5].forEach(function (lx) { [-0.3, 0.3].forEach(function (lz) {
      v.set(lx, y, lz); root.localToWorld(v); v.project(cam);
      var px = (v.x * 0.5 + 0.5) * cv.width, py = (-v.y * 0.5 + 0.5) * cv.height;
      x0 = Math.min(x0, px); x1 = Math.max(x1, px); y0 = Math.min(y0, py); y1 = Math.max(y1, py);
    }); }); });
    v.set(0, 0, 0); root.localToWorld(v); v.project(cam); var fy = (-v.y * 0.5 + 0.5) * cv.height;
    v.set(0, top, 0); root.localToWorld(v); v.project(cam); var hpx = Math.round(fy - (-v.y * 0.5 + 0.5) * cv.height);
    var side = Math.ceil(Math.max(x1 - x0, y1 - y0)), cx = (x0 + x1) / 2, cyp = (y0 + y1) / 2, p = cell(i);
    S.g.imageSmoothingEnabled = false;
    S.g.fillStyle = '#000'; S.g.fillRect(p[0], p[1], S.tw, S.th);
    S.g.drawImage(cv, Math.round(cx - side / 2), Math.round(cyp - side / 2), side, side, p[0], p[1], S.tw, S.th);
    S.g.imageSmoothingEnabled = true;
    cam.fov = keep.fov; cam.aspect = keep.asp; cam.filmOffset = keep.film; cam.zoom = keep.zoom; cam.updateProjectionMatrix();
    label(i, txt + ' · ' + hpx + ' px LOD' + (inf.rig.geos ? inf.rig.geos.indexOf(inf.rig.skin.geometry) : '?'));
  }
  function snap(i, region, view, txt, ven) {
    if (view === 'game') return snapGame(i, txt, ven);
    var inf = D.preview.info(); if (!inf) { label(i, 'SIN VISTA PREVIA', 1); return; }
    var root = inf.rig.root, cam = c.camera, R = REG[region], V = VIEW[view];
    root.rotation.y = PI / 2; root.updateMatrixWorld(true);
    var keep = { fov: cam.fov, asp: cam.aspect, film: cam.filmOffset, zoom: cam.zoom };
    var cv = c.renderer.domElement, asp = cv.width / cv.height, fov = 30, tv = Math.tan(fov * PI / 360);
    var cy = (R[0] + R[1]) / 2, half = (R[1] - R[0]) / 2, lat = R[2];
    // encuadre cuadrado centrado: que quepa el alto y el ancho
    var d = Math.max(half, lat) / tv * 1.04 + R[3];
    var az = V[0] * PI / 180, el = V[1] * PI / 180, X = root.position.x, Z = root.position.z;
    var dir = [Math.cos(az), 0, -Math.sin(az)];
    cam.fov = fov; cam.aspect = asp; cam.filmOffset = 0; cam.zoom = 1; if (cam.view && cam.clearViewOffset) cam.clearViewOffset();
    cam.updateProjectionMatrix();
    cam.up.set(0, 1, 0);
    cam.position.set(X + dir[0] * d * Math.cos(el), cy + d * Math.sin(el), Z + dir[2] * d * Math.cos(el));
    cam.lookAt(X, cy, Z); cam.updateMatrixWorld(true);
    render();
    var p = cell(i), sq = Math.min(cv.width, cv.height);
    S.g.imageSmoothingEnabled = true; S.g.imageSmoothingQuality = 'high';
    S.g.drawImage(cv, (cv.width - sq) / 2, (cv.height - sq) / 2, sq, sq, p[0], p[1], S.tw, S.th);
    cam.fov = keep.fov; cam.aspect = keep.asp; cam.filmOffset = keep.film; cam.zoom = keep.zoom; cam.updateProjectionMatrix();
    label(i, txt + ' · ' + (region === 'full' ? '' : RNAME[region] + ' ') + VNAME[view]);
  }
  /** Hoja de un objeto (o combo): rows = [{skin, kit, hair, views:[[region, view]…]}]. list = objetos a poner. */
  async function itemSheet(o) {
    var cols = o.cols || 6, rows = o.rows;
    sheet(cols, rows.length, o.tw || 300, o.th || 300, o.title);
    var info = [], i = 0;
    for (var ri = 0; ri < rows.length; ri++) {
      var row = rows[ri];
      for (var vi = 0; vi < row.views.length; vi++) {
        var v = row.views[vi];
        var f = baseFit(o.base || 'std', SKIN[v.skin || row.skin], HAIRC[v.hair || row.hair || 'castOsc'], v.style || row.style || o.style);
        var w = wear(f, o.venue, (o.list || []).concat(v.list || []));
        var lk = await setLook(w.fit, o.venue, v.kit || row.kit, v.px || row.px, v.pose || row.pose);
        if (!lk) { label(i++, 'ERROR vista previa', 1); continue; }
        var lodF = v.lod != null ? v.lod : row.lod;
        if (lodF != null) forceLod(lodF);
        if (vi === 0 || v.list) info.push({ row: ri, removed: w.removed, lod: lk.lod, tris: lk.tris, L: lk.L });
        snap(i, v.region, v.view, (v.tag || row.tag || '') + (w.removed.length ? ' !' : ''), o.venue);
        i++;
      }
    }
    var rem = []; info.forEach(function (x) { x.removed.forEach(function (m) { if (rem.indexOf(m) < 0) rem.push(m); }); });
    var lods = info.map(function (x) { return 'LOD' + x.lod + ' ' + x.tris + ' tri'; }).filter(function (v, k, a) { return a.indexOf(v) === k; });
    subtitle((o.sub || '') + ' · ' + lods.join(' / ') + (rem.length ? ' · QUITADO POR REGLAS: ' + rem.join('; ') : ''));
    return { tiles: S.tiles.slice(), removed: rem, lods: lods, L: info.length ? info[0].L : null };
  }
  function sheetData(fmt) { return S ? (fmt === 'png' ? S.cv.toDataURL('image/png') : S.cv.toDataURL('image/jpeg', 0.86)) : ''; }

  // ------------------------------------------------ distancia de juego (partido de verdad)
  function myPlayer() {
    var g = c.game; if (!g) return null;
    var id = P.lookOf6Id ? P.lookOf6Id() : -1, all = g.players || [];
    if (id >= 0) for (var i = 0; i < all.length; i++) if (all[i].id === id) return all[i];
    if (g.teams && g.teams[0]) return g.teams[0][0];
    return all[0] || null;
  }
  async function gameLook(fit, kitK) {
    var st = Object.assign({}, c.settings, KITS[kitK], { looks: [fit, fit] });
    P.setKit(st, c.game);
    await frames(6);
    var p = myPlayer(), r = p && P.rigOf(p);
    if (!r) return null;
    var cam = c.camera, cv = c.renderer.domElement, v = new THREE.Vector3();
    r.root.updateMatrixWorld(true);
    v.set(0, 0, 0); r.root.localToWorld(v); var foot = v.clone().project(cam);
    v.set(0, 1.9, 0); r.root.localToWorld(v); var head = v.clone().project(cam);
    function px(n) { return [(n.x * 0.5 + 0.5) * cv.width, (-n.y * 0.5 + 0.5) * cv.height]; }
    var a = px(foot), b = px(head);
    var lod = -1; try { var geo = r.skin.geometry; for (var k = 0; k < 3; k++) if (r.geos && r.geos[k] === geo) lod = k; } catch (e) { }
    return { foot: a, head: b, hpx: Math.round(a[1] - b[1]), cw: cv.width, ch: cv.height, lod: lod, look: r.look };
  }
  async function gameSheet(o) {
    // o.rows = [{fit, kit, tag}], cada una: fotograma entero (escalado a fw) + recorte nativo de cs px ×z
    var fw = o.fw, fh = Math.round(fw * 9 / 16), cs = o.cs, z = o.z;
    var lab = 30, head = 44, colsW = [fw, cs * z, fw, cs * z], W = colsW.reduce(function (a, b) { return a + b + 4; }, 4);
    var cv = document.createElement('canvas'); cv.width = W; cv.height = head + o.rows.length * (Math.max(fh, cs * z) + lab + 4) + 4;
    var g = cv.getContext('2d'); g.fillStyle = '#111317'; g.fillRect(0, 0, cv.width, cv.height);
    g.fillStyle = '#ffe680'; g.font = 'bold 17px Arial, sans-serif'; g.textBaseline = 'top'; g.fillText(o.title, 8, 6);
    S = { cv: cv, g: g, tiles: [] };
    var y = head, out = [];
    for (var i = 0; i < o.rows.length; i++) {
      var row = o.rows[i], x = 4, rh = Math.max(fh, cs * z);
      for (var half = 0; half < 2; half++) {
        var it = row.items[half]; if (!it) { x += fw + cs * z + 8; continue; }
        var gl = await gameLook(it.fit, it.kit);
        render();
        var src = c.renderer.domElement;
        g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
        g.drawImage(src, 0, 0, src.width, src.height, x, y, fw, fh);
        var t1 = it.tag + ' · ' + src.width + 'x' + src.height + (gl ? ' · alto ' + gl.hpx + ' px · LOD' + gl.lod : ' · SIN ATLETA');
        if (gl) {   // marca del atleta en el fotograma
          var sx = fw / src.width; g.strokeStyle = '#ff2fd0'; g.lineWidth = 2;
          g.strokeRect(x + (gl.head[0] - gl.hpx * 0.4) * sx, y + gl.head[1] * sx - 3, gl.hpx * 0.8 * sx, gl.hpx * sx + 6);
        }
        lbl(x, y + rh, fw, t1);
        x += fw + 4;
        if (gl) {
          var cx = gl.head[0], cyy = (gl.head[1] + gl.foot[1]) / 2;
          g.imageSmoothingEnabled = false;
          g.fillStyle = '#000'; g.fillRect(x, y, cs * z, cs * z);
          g.drawImage(src, cx - cs / 2, cyy - cs / 2, cs, cs, x, y, cs * z, cs * z);
          lbl(x, y + rh, cs * z, it.tag + ' · recorte ' + cs + ' px ×' + z);
        }
        x += cs * z + 4;
        out.push({ tag: it.tag, hpx: gl ? gl.hpx : 0, lod: gl ? gl.lod : -1 });
      }
      y += rh + lab + 4;
    }
    function lbl(x0, y0, w, t) {
      g.fillStyle = '#23262e'; g.fillRect(x0, y0, w, lab); g.fillStyle = '#f2f2f2'; g.font = '13px Arial, sans-serif'; g.textBaseline = 'middle';
      while (g.measureText(t).width > w - 8 && t.length > 4) t = t.slice(0, -1);
      g.fillText(t, x0 + 4, y0 + lab / 2); g.textBaseline = 'top'; S.tiles.push(t);
    }
    return { tiles: S.tiles.slice(), rows: out };
  }

  function catalog() {
    return LK.CATALOG.map(function (it) { return { id: it.id, name: it.name, slot: it.slot, slots: it.slots, venue: it.venue, as: it.as }; });
  }
  return { itemSheet: itemSheet, sheetData: sheetData, gameSheet: gameSheet, catalog: catalog, baseFit: baseFit, wear: wear,
    STYLES: LK.STYLES, frames: frames, SKIN: SKIN, HAIRC: HAIRC, KITS: KITS,
    baseGame: function (mode, skin, hair, style, ven, list) { return wear(baseFit(mode, SKIN[skin], HAIRC[hair], style), ven, list || []).fit; },
    state: function () { return { state: c.state, q: c.quality && c.quality.level, rank: c.quality && c.quality.rank, venue: VB.Arena && VB.Arena.venue ? VB.Arena.venue() : '?', w: c.renderer.domElement.width, h: c.renderer.domElement.height, touch: c.isTouch, mobile: c.isMobile }; }
  };
})();
true;
`;

// ---------------------------------------------------------------- plan
const SLOT_GROUP = {
  head: 'head', eyes: 'head', paint: 'head', marks: 'head', beard: 'head',
  neck: 'torso', under: 'torso', band: 'torso', armL: 'torso', armR: 'torso', elbows: 'torso', wristL: 'torso', wristR: 'torso', hands: 'torso',
  legs: 'legs', knees: 'legs', socks: 'legs', ankle: 'legs', shoes: 'legs'
};
const SLOT_REGION = { head: 'head', eyes: 'head', paint: 'head', marks: 'head', beard: 'head', neck: 'bust', under: 'torso', band: 'torso',
  armL: 'torso', armR: 'torso', elbows: 'torso', wristL: 'torso', wristR: 'torso', hands: 'torso', legs: 'legs', knees: 'legs', socks: 'legs', ankle: 'feet', shoes: 'feet' };
const VIEWS5 = ['front', 'q3l', 'sideR', 'back', 'top'];
function wearSlot(slot) { return slot === 'armL' ? 'arm' : slot === 'wristL' ? 'wrist' : slot; }
function venOk(it, ven) { return it.venue === 'A' || it.venue === (ven === 'beach' ? 'Y' : 'P'); }
function rows2(region, extra) {
  const mk = (skin, kit, last) => ({ skin, kit, tag: '', views: VIEWS5.map(v => Object.assign({ region, view: v }, extra || {})).concat([{ region: 'full', view: last }]) });
  return [Object.assign(mk('light', 'A', 'full'), { tag: 'clara/A' }), Object.assign(mk('dark', 'B', 'fullBack'), { tag: 'oscura/B' })];
}
function tagRows(rows) { rows.forEach(r => r.views.forEach(v => { v.tag = v.tag || r.tag; })); return rows; }

const COMBOS = [
  // (WP3) objetos de cabeza sobre peinados con volumen, recogidos y de lado
  { id: 'c_corona_afro', venue: 'hall', region: 'head', style: 'afro', name: 'corona + afro', list: [['head', 'corona']] },
  { id: 'c_corona_cresta', venue: 'hall', region: 'head', style: 'cresta', name: 'corona + cresta (de lado)', list: [['head', 'corona']] },
  { id: 'c_corona_mono', venue: 'hall', region: 'head', style: 'mono', name: 'corona + moño', list: [['head', 'corona']] },
  { id: 'c_bandana_coleta', venue: 'hall', region: 'head', style: 'coleta', name: 'pañuelo + coleta', list: [['head', 'bandana']] },
  { id: 'c_bandana_melena', venue: 'hall', region: 'head', style: 'melena', name: 'pañuelo + melena', list: [['head', 'bandana']] },
  { id: 'c_frente_afro', venue: 'beach', region: 'head', style: 'afro', name: 'gafas en la frente + afro', list: [['eyes', 'frente']] },
  { id: 'c_frente_melena', venue: 'beach', region: 'head', style: 'melena', name: 'gafas en la frente + melena', list: [['eyes', 'frente']] },
  { id: 'c_cintaRizo_afro', venue: 'hall', region: 'head', style: 'afro', name: 'cinta de rizo + afro + deportivas', list: [['head', 'cintaRizo'], ['eyes', 'deporte']] },
  { id: 'c_gorraAtras_coleta', venue: 'beach', region: 'head', style: 'coleta', name: 'gorra al revés + coleta + espejo + barba', list: [['head', 'gorraAtras'], ['eyes', 'espejo'], ['beard', 'barba']] },
  { id: 'c_head_beach', venue: 'beach', region: 'head', style: 'trenzas', name: 'gorra + trenzas + gafas oscuras + perilla + zinc + pecas',
    list: [['head', 'gorra'], ['eyes', 'oscuras'], ['beard', 'perilla'], ['paint', 'zinc'], ['marks', 'pecas']] },
  { id: 'c_head_beach2', venue: 'beach', region: 'head', style: 'coletas', name: 'pescador + coletas + espejo + bigote + estrella + tirita',
    list: [['head', 'pescador'], ['eyes', 'espejo'], ['beard', 'bigote'], ['paint', 'estrella'], ['marks', 'tirita']] },
  { id: 'c_head_beach3', venue: 'beach', region: 'head', style: 'afro', name: 'gorra al revés + afro + gafas en la frente + tres días + rayas + tira nasal',
    list: [['head', 'gorraAtras'], ['eyes', 'frente'], ['beard', 'tresDias'], ['paint', 'rayas'], ['marks', 'tiraNasal']] },
  { id: 'c_head_hall', venue: 'hall', region: 'head', style: 'coleta', name: 'gorra MTC + coleta + deportivas + tres días + rayas eq + tira nasal',
    list: [['head', 'gorraMTC'], ['eyes', 'deporte'], ['beard', 'tresDias'], ['paint', 'rayasEq'], ['marks', 'tiraNasal']] },
  { id: 'c_head_hall2', venue: 'hall', region: 'head', style: 'afro', name: 'cinta + afro + pasta + bigote + estrella + pecas',
    list: [['head', 'cinta'], ['eyes', 'pasta'], ['beard', 'bigote'], ['paint', 'estrella'], ['marks', 'pecas']] },
  { id: 'c_head_hall3', venue: 'hall', region: 'head', style: 'trenzas', name: 'corona + trenzas + pasta + perilla + rayas + tirita',
    list: [['head', 'corona'], ['eyes', 'pasta'], ['beard', 'perilla'], ['paint', 'rayas'], ['marks', 'tirita']] },
  { id: 'c_torso_hall', venue: 'hall', region: 'torso', name: 'térmica + manguito llamas der + manguito izq + coderas + reloj izq + muñequera der + dedos + medalla + brazalete',
    list: [['under', 'termica'], ['armR', 'manguitoLlamas'], ['armL', 'manguito'], ['elbows', 'coderas'], ['wristL', 'reloj'], ['wristR', 'muneq'], ['hands', 'dedos'], ['neck', 'medalla'], ['band', 'capitan']] },
  { id: 'c_torso_hall2', venue: 'hall', region: 'torso', name: 'térmica + manguito dorado ×2 + coderas + muñequera cañón ×2 + dedos de hierro + brazalete',
    list: [['under', 'termica'], ['arm', 'manguitoOro'], ['elbows', 'coderas'], ['wrist', 'munhCanon'], ['hands', 'dedosMuro'], ['band', 'capitan']] },
  { id: 'c_torso_beach', venue: 'beach', region: 'torso', name: 'licra + kinesio ×2 + conchas + mitones + reloj ×2 + brazalete',
    list: [['under', 'licra'], ['arm', 'kinesio'], ['neck', 'conchas'], ['hands', 'mitones'], ['wrist', 'reloj'], ['band', 'capitan']] },
  { id: 'c_legs_hall', venue: 'hall', region: 'legs', name: 'malla larga + rodilleras altas + calcetines altos de rayas + tobillera + neón',
    list: [['legs', 'mallaLarga'], ['knees', 'altas'], ['socks', 'altosRayas'], ['ankle', 'blanca'], ['shoes', 'neon']] },
  { id: 'c_legs_hall2', venue: 'hall', region: 'legs', name: 'malla larga + rodilleras bajadas + desparejados + doradas',
    list: [['legs', 'mallaLarga'], ['knees', 'bajadas'], ['socks', 'desparejados'], ['shoes', 'doradas']] },
  { id: 'c_legs_hall3', venue: 'hall', region: 'legs', name: 'malla corta + rodilleras de pulpo + calcetines altos + negras',
    list: [['legs', 'malla'], ['knees', 'rodiPulpo'], ['socks', 'altos'], ['shoes', 'negras']] },
  { id: 'c_legs_beach', venue: 'beach', region: 'legs', name: 'malla larga + escarpines', list: [['legs', 'mallaLarga'], ['ankle', 'escarpines']] },
  { id: 'c_legs_beach2', venue: 'beach', region: 'legs', name: 'malla corta + tobillera de pulpo', list: [['legs', 'malla'], ['ankle', 'tobiPulpo']] },
  { id: 'c_all_hall', venue: 'hall', region: 'full', style: 'coleta', name: 'TODO (pista): gorra MTC, deportivas, térmica, manguitos, coderas, relojes, dedos, malla larga, altas, rayas, neón…',
    list: [['head', 'gorraMTC'], ['eyes', 'deporte'], ['beard', 'tresDias'], ['paint', 'rayasEq'], ['marks', 'tiraNasal'], ['neck', 'medalla'], ['under', 'termica'], ['band', 'capitan'],
      ['armR', 'manguitoLlamas'], ['armL', 'manguitoRayas'], ['elbows', 'coderas'], ['wrist', 'reloj'], ['hands', 'dedos'], ['legs', 'mallaLarga'], ['knees', 'altas'], ['socks', 'altosRayas'], ['ankle', 'blanca'], ['shoes', 'neon']] },
  { id: 'c_all_beach', venue: 'beach', region: 'full', style: 'trenzas', name: 'TODO (playa): gorra, oscuras, perilla, zinc, pecas, conchas, licra, brazalete, kinesio, reloj, mitones, malla larga, escarpines',
    list: [['head', 'gorra'], ['eyes', 'oscuras'], ['beard', 'perilla'], ['paint', 'zinc'], ['marks', 'pecas'], ['neck', 'conchas'], ['under', 'licra'], ['band', 'capitan'],
      ['arm', 'kinesio'], ['wrist', 'reloj'], ['hands', 'mitones'], ['legs', 'mallaLarga'], ['ankle', 'escarpines']] }
];

function save(file, dataUrl, entry) {
  const b64 = String(dataUrl || '').replace(/^data:image\/(png|jpeg);base64,/, '');
  file = file.replace(/\.png$/, '.' + FMT);
  if (!b64) throw new Error('hoja vacía: ' + file);
  // freno de disco: con menos de 250 MB libres se para (el PC se quedó a 0 bytes una vez durante la auditoría)
  try { const sf = fs.statfsSync(OUT.slice(0, 3)); if (sf.bavail * sf.bsize < 250e6) throw new Error('DISCO CASI LLENO (' + Math.round(sf.bavail * sf.bsize / 1e6) + ' MB libres): se para'); }
  catch (e) { if (/DISCO/.test(e.message)) throw e; }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, Buffer.from(b64, 'base64'));
  const rel = path.relative(OUT, file).replace(/\\/g, '/');
  manifest[rel] = entry;
  fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 1));
  console.log('  → ' + rel + (entry.removed && entry.removed.length ? '  [quitado: ' + entry.removed.join('; ') + ']' : ''));
}
const want = id => !onlyItems || onlyItems.indexOf(id) >= 0;

async function openPage(query, mob, size) {
  const page = await CDP.open(mob ? { size: '640x360', touch: true, dpr: 2, ua: CDP.ANDROID_UA } : { size: size || opt.size || '768x768' });
  await page.navigate(query);
  // espera a que el juego esté listo
  for (let i = 0; i < 60; i++) { await CDP.sleep(500); try { if (await page.evalJs('!!(window.VB&&VB.ctx&&VB.ctx.renderer&&VB.Look&&VB.Doll&&VB.Players)')) break; } catch (e) { } }
  await CDP.sleep(+(process.env.WAIT || 2500));
  await page.evalJs(PAGE);
  return page;
}
async function run(page, expr) { return page.evalJs('(async function(){ return ' + expr + '; })()', true); }

// ---------------------------------------------------------------- fase de primeros planos
async function closeups(ven) {
  const page = await openPage('debug=menu&map=' + (ven === 'beach' ? 'beach' : 'palau') + '&quality=high');
  let bad = 0;
  try {
    console.log('[' + ven + '] ' + JSON.stringify(await run(page, '__LS.state()')));
    const cat = await run(page, '__LS.catalog()');
    const styles = await run(page, '__LS.STYLES');
    const job = async (file, o, entry) => {
      const r = await run(page, '__LS.itemSheet(' + JSON.stringify(o) + ')');
      const data = await run(page, '__LS.sheetData(' + JSON.stringify(FMT) + ')');
      save(path.join(OUT, file), data, Object.assign({ tiles: r.tiles, removed: r.removed, lods: r.lods }, entry));
    };
    // --- base
    if (groups.indexOf('base') >= 0 && want('base')) {
      for (const mode of ['none', 'std']) {
        const v = (skin, kit, tag) => ({ skin, kit, tag, views: [['head', 'front'], ['head', 'q3l'], ['torso', 'front'], ['legs', 'front'], ['full', 'full'], ['full', 'fullBack']].map(a => ({ region: a[0], view: a[1] })) });
        await job('base/base-' + mode + '-' + ven + '.png', { venue: ven, base: mode, title: 'BASE ' + (mode === 'none' ? 'sin nada' : 'de serie (rodilleras, calcetines, tobillera, zapatillas de pista)') + ' · ' + ven,
          sub: 'tupé castaño', rows: tagRows([v('light', 'A', 'clara/A'), v('dark', 'B', 'oscura/B')]) }, { group: 'base', venue: ven, what: 'muñeco base ' + mode });
      }
      // los dos fits por defecto del juego
      for (const n of [0, 1]) {
        const o = { venue: ven, base: 'std', title: 'FIT POR DEFECTO n.º ' + (n + 1) + ' (VB.Look.defaults(' + n + ')) · ' + ven, sub: 'tal cual lo ve un jugador nuevo', defaultsN: n,
          rows: tagRows([{ skin: 'light', kit: 'A', tag: 'def' + (n + 1) + '/A', views: [['head', 'front'], ['head', 'q3l'], ['head', 'back'], ['torso', 'front'], ['full', 'full'], ['full', 'fullBack']].map(a => ({ region: a[0], view: a[1] })) }]) };
        // los defaults: se ponen todos los objetos de esa sede
        const d = await page.evalJs('(function(){var f=VB.Look.defaults(' + n + ');var o=[["style",f.style],["skin",f.skin],["hair",f.hair]];VB.Look.SLOTS.forEach(function(s){if(f.' + ven + '[s])o.push([s,f.' + ven + '[s]]);});return o;})()');
        o.list = d;
        o.rows[0].views.forEach(v => { v.skin = undefined; });
        await job('base/defaults' + (n + 1) + '-' + ven + '.png', o, { group: 'base', venue: ven, what: 'fit por defecto ' + (n + 1), list: d });
      }
    }
    // --- peinados × colores
    if (groups.indexOf('hair') >= 0) {
      for (const st of styles) {
        if (!want(st)) continue;
        const rows = rows2('head', { style: st });
        rows[1].hair = 'negro';
        const cols = ['castOsc', 'negro', 'rubio', 'canas', 'cobrizo', 'tAzul'];
        rows.push({ skin: 'light', kit: 'A', tag: '', views: cols.map(h => ({ region: 'head', view: 'q3l', style: st, hair: h, tag: h })) });
        const rows3 = rows.concat([{ skin: 'dark', kit: 'B', tag: '', views: ['tRosa', 'rubio', 'canas', 'castOsc'].map(h => ({ region: 'head', view: h === 'castOsc' || h === 'canas' ? 'back' : 'top', style: st, hair: h, tag: h + '/osc' })).concat([{ region: 'full', view: 'sideR', style: st, hair: 'rubio', tag: 'rubio' }, { region: 'bust', view: 'back', style: st, hair: 'castOsc', tag: 'castOsc' }]) }]);
        tagRows(rows3);
        await job('hair/hair-' + st + '-' + ven + '.png', { venue: ven, base: 'std', style: st, title: 'PEINADO ' + st + ' · ' + ven, sub: 'filas 1-2: vistas (clara/A castaño, oscura/B negro); fila 3: colores 3/4; fila 4: más ángulos', rows: rows3 },
          { group: 'hair', venue: ven, id: st });
      }
    }
    // --- de espaldas: todos los peinados en una hoja por vista, y los gorros
    if (groups.indexOf('back') >= 0) {
      const hairK = opt.hair || 'castOsc';
      const sts = styles.filter(st => want(st) || (onlyItems && onlyItems.indexOf('back') >= 0));
      const BV = [['espalda', 'head', 'back', {}], ['34-izq', 'head', 'q3bl', {}], ['34-der', 'head', 'q3br', {}],
        ['partido', 'full', 'game', { px: 1, lod: 1, pose: 'recv' }], ['partido-lod0', 'full', 'game', { px: 1, lod: 0, pose: 'recv' }],
        // (WP2) otras vistas con --bviews=frente,34-frente,lado,arriba,frente-lod0 (por defecto, las 5 de espaldas)
        ['frente', 'head', 'front', {}], ['34-frente', 'head', 'q3l', {}], ['lado', 'head', 'sideR', {}], ['arriba', 'head', 'top', {}], ['frente-lod0', 'head', 'front', { lod: 0 }]];
      const bvWant = opt.bviews ? opt.bviews.split(',') : ['espalda', '34-izq', '34-der', 'partido', 'partido-lod0'];
      if (sts.length) for (const [nm, region, view, ex] of BV.filter(b => bvWant.indexOf(b[0]) >= 0)) {
        const cols = sts.length <= 10 ? 5 : 8, rows = [];
        for (let i = 0; i < sts.length; i += cols) rows.push({ skin: 'light', kit: 'A', hair: hairK, tag: '',
          views: sts.slice(i, i + cols).map(st => Object.assign({ region, view, style: st, tag: st }, ex)) });
        await job('back/back-peinados-' + nm + '-' + ven + '.png', { venue: ven, base: 'std', cols, tw: view === 'game' ? 240 : 260, th: view === 'game' ? 240 : 260,
          title: 'PEINADOS DE ESPALDAS · ' + nm + ' · ' + ven + ' · ' + sts.length + ' peinados · pelo ' + hairK,
          sub: view === 'game' ? 'cámara del partido en el móvil (8,7 m, 41°, 27° fuera de la espalda), al tamaño del buffer de 800x450 del móvil (el muñeco mide ≈ 68 px; las 98 px del plan eran 1,9 m), LOD' + ex.lod + ', atlas 512², pose de recepción, ampliado sin suavizar' : 'vista previa LOD2, cabeza', rows },
          { group: 'back', venue: ven, what: 'peinados ' + nm, styles: sts });
      }
      // (WP2) --bviews=…,fx: efectos de pelo (columnas) con el segundo color automático y con rosa, y los colores nuevos
      if (bvWant.indexOf('fx') >= 0) {
        const FX = ['', 'raiz', 'puntas', 'mechas', 'flequilloFx', 'mitad'];
        const mkf = (style, view, h2, hair) => ({ skin: 'light', kit: 'A', hair: hair || hairK, tag: '', views: FX.map(fx => ({ region: 'head', view, style, tag: style + ' ' + (fx || 'sin efecto') + (h2 ? ' +' + h2 : ''), list: [['hairFx', fx]].concat(h2 ? [['hair2', h2]] : []) })) });
        await job('back/fx-' + ven + '.png', { venue: ven, base: 'std', cols: FX.length, tw: 220, th: 220, title: 'EFECTOS DE PELO · ' + ven, sub: 'segundo color automático salvo «+tRosa»',
          rows: [mkf('melena', 'q3l'), mkf('melena', 'q3bl'), mkf('tupe', 'q3l', 'tRosa', 'negro'), mkf('coleta', 'q3bl'), mkf('afroCorto', 'q3bl', 'tRosa', 'negro')] }, { group: 'back', venue: ven, what: 'fx' });
        const HC = [0x1c2438, 0x6e2a18, 0xc8913e, 0xbfb29a, 0xd2561c, 0xf6f3ec, 'tRojo', 'tNaranja', 'tLila', 'tMenta', 'tPlata', 'tEquipo'];
        const mkc = (style, view, skin) => ({ skin, kit: 'A', hair: hairK, tag: '', views: HC.map(h => ({ region: 'head', view, style, tag: style + ' ' + h.toString(16), list: [['hair', h]] })) });
        await job('back/colores-' + ven + '.png', { venue: ven, base: 'std', cols: HC.length, tw: 170, th: 170, title: 'COLORES NUEVOS · ' + ven, sub: '6 naturales y 6 tintes',
          rows: [mkc('ondas', 'q3l', 'light'), mkc('afroCorto', 'q3bl', 'dark')] }, { group: 'back', venue: ven, what: 'colores' });
      }
      const heads = cat.filter(it => it.slot === 'head' && venOk(it, ven) && (want(it.id) || (onlyItems && onlyItems.indexOf('back') >= 0)));
      if (heads.length) {
        const mk = (tag, style, region, view, ex) => ({ skin: 'light', kit: 'A', hair: hairK, tag, views: heads.map(h => Object.assign({ region, view, style, tag: h.id + ' ' + tag, list: [['head', h.id]] }, ex || {})) });
        const rows = [mk('tupé', 'tupe', 'head', 'back'), mk('tupé', 'tupe', 'head', 'q3bl'), mk('coleta', 'coleta', 'head', 'back'), mk('tupé', 'tupe', 'full', 'game', { px: 1, lod: 1, pose: 'recv' })];
        await job('back/back-gorros-' + ven + '.png', { venue: ven, base: 'std', cols: heads.length, tw: 220, th: 220,
          title: 'GORROS DE ESPALDAS · ' + ven + ' · filas: tupé espalda, tupé 3/4 espalda, coleta espalda, tupé partido (LOD1)', sub: 'pelo ' + hairK, rows },
          { group: 'back', venue: ven, what: 'gorros', heads: heads.map(h => h.id) });
      }
    }
    // --- objetos por ranura
    for (const it of cat) {
      const grp = SLOT_GROUP[it.slot]; if (!grp || groups.indexOf(grp) < 0 || !want(it.id) || !venOk(it, ven)) continue;
      const region = SLOT_REGION[it.slot];
      const both = it.slots.length > 1;
      const rows = tagRows(rows2(region));
      // (WP3) cabeza y cara: 8 columnas — 5 ángulos, desde abajo 30° (¿la visera tapa?), frente en LOD0 (z-fighting de las láminas)
      // y la cámara del partido en el móvil (LOD1)
      const fr = it.slot === 'head' ? region : 'face';   // lo de la cara, de cerca (frente, 3/4 y LOD0)
      if (grp === 'head') rows.forEach(r => { r.views = [['front', fr], ['q3l', fr], ['sideR', region], ['back', region], ['top', region], ['below', region]].map(v => ({ region: v[1], view: v[0] }))
        .concat([{ region: fr, view: 'front', lod: 0, tag: 'LOD0' }, { region: 'full', view: 'game', px: 1, lod: 1, pose: 'recv' }]); });
      const o = { venue: ven, base: 'std', list: [[wearSlot(it.slot), it.id]], title: it.slot + ' · ' + it.id + ' «' + it.name + '»' + (both ? ' (en las dos ranuras)' : '') + (it.as ? ' [se dibuja como ' + it.as + ' si doll.js no lo conoce]' : '') + ' · ' + ven,
        sub: 'base de serie + este objeto', rows };
      rows.forEach(r => r.views.forEach(v => { v.tag = it.id + ' ' + r.tag + (v.tag === 'LOD0' ? ' LOD0' : ''); }));
      if (grp === 'head') {
        // --hv=0,1,5: solo esas columnas (0 frente, 1 3/4, 2 lado, 3 espalda, 4 arriba, 5 abajo, 6 LOD0, 7 partido); --tile=N: casillas de N px
        if (opt.hv) { const keep = opt.hv.split(',').map(Number); rows.forEach(r => { r.views = r.views.filter((v, k) => keep.indexOf(k) >= 0); }); }
        o.cols = rows[0].views.length; o.tw = o.th = opt.tile ? TILE : 240;
      }
      await job(grp + '/' + it.slot.replace(/[LR]$/, '') + '-' + it.id + '-' + ven + '.png', o, { group: grp, venue: ven, id: it.id, slot: it.slot, name: it.name });
    }
    // --- combos
    if (groups.indexOf('combos') >= 0) {
      for (const cb of COMBOS) {
        if (cb.venue !== ven || !want(cb.id)) continue;
        const rows = tagRows(rows2(cb.region, cb.style ? { style: cb.style } : null));
        rows.forEach(r => r.views.forEach(v => { v.tag = cb.id.replace('c_', '') + ' ' + r.tag; }));
        if (cb.region === 'full') {   // combo entero: cabeza, torso y piernas en lugar de 5 ángulos de lo mismo
          const regs = [['head', 'front'], ['head', 'q3l'], ['torso', 'front'], ['torso', 'back'], ['legs', 'front']];
          rows.forEach(r => regs.forEach((a, k) => { r.views[k].region = a[0]; r.views[k].view = a[1]; }));
        }
        await job('combos/' + cb.id + '.png', { venue: ven, base: 'std', style: cb.style, list: cb.list, title: 'COMBO ' + cb.id + ' · ' + cb.name, sub: ven, rows },
          { group: 'combos', venue: ven, id: cb.id, list: cb.list });
      }
    }
  } catch (e) { bad++; console.error('ERROR ' + ven + ': ' + (e && e.stack || e)); }
  if (page.errors.length) { console.log('errores de página (' + page.errors.length + '):\n  ' + page.errors.slice(0, 8).join('\n  ')); }
  await page.close();
  return bad;
}

// ---------------------------------------------------------------- fase de distancia de juego
async function game(ven, mob) {
  const q = ven === 'beach' ? 'debug=rally&map=beach' : 'debug=rally6h&map=palau';
  const page = await openPage(q, mob, '1280x720');
  let bad = 0;
  try {
    const st = await run(page, '__LS.state()');
    console.log('[game ' + ven + (mob ? ' móvil' : ' escritorio') + '] ' + JSON.stringify(st));
    const cat = await run(page, '__LS.catalog()');
    const list = [{ id: 'base', name: 'base de serie', l: [] }];
    for (const it of cat) if (SLOT_GROUP[it.slot] && venOk(it, ven)) list.push({ id: it.id, name: it.name, l: [[wearSlot(it.slot), it.id]] });
    for (const s of await run(page, '__LS.STYLES')) list.push({ id: s, name: 'peinado', l: [['style', s]] });
    for (const cb of COMBOS) if (cb.venue === ven) list.push({ id: cb.id, name: cb.name, l: cb.list.concat(cb.style ? [['style', cb.style]] : []) });
    const todo = list.filter(x => want(x.id));
    const per = 5, dev = mob ? 'mobile' : 'desktop';
    for (let i = 0; i < todo.length; i += per) {
      const chunk = todo.slice(i, i + per);
      const rows = [];
      for (const x of chunk) {
        const fa = await run(page, '__LS.baseGame("std","light","castOsc","tupe",' + JSON.stringify(ven) + ',' + JSON.stringify(x.l) + ')');
        const fb = await run(page, '__LS.baseGame("std","dark","negro","tupe",' + JSON.stringify(ven) + ',' + JSON.stringify(x.l) + ')');
        rows.push({ items: [{ fit: fa, kit: 'A', tag: x.id + ' clara/A' }, { fit: fb, kit: 'B', tag: x.id + ' oscura/B' }] });
      }
      const o = { title: 'DISTANCIA DE JUEGO · ' + (ven === 'beach' ? 'playa 2v2 (debug=rally)' : 'pista 6v6 (debug=rally6h)') + ' · ' + (mob ? 'móvil 640x360 táctil dpr2' : 'escritorio 1280x720') + ' · q=' + st.q + ' · ' + chunk.map(x => x.id).join(', '),
        fw: mob ? 400 : 560, cs: mob ? 120 : 180, z: mob ? 3 : 2, rows };
      const r = await run(page, '__LS.gameSheet(' + JSON.stringify(o) + ')');
      const data = await run(page, '__LS.sheetData(' + JSON.stringify(FMT) + ')');
      const n = String(Math.floor(i / per) + 1).padStart(2, '0');
      save(path.join(OUT, 'game-distance', ven + '-' + dev + '-' + (onlyItems ? onlyItems.join('_') + '-' : '') + n + '.png'), data,
        { group: 'game-distance', venue: ven, device: dev, items: chunk.map(x => x.id), tiles: r.tiles, rows: r.rows, quality: st.q });
    }
  } catch (e) { bad++; console.error('ERROR game ' + ven + ': ' + (e && e.stack || e)); }
  if (page.errors.length) { console.log('errores de página (' + page.errors.length + '):\n  ' + page.errors.slice(0, 8).join('\n  ')); }
  await page.close();
  return bad;
}

setTimeout(() => { console.error('TIEMPO AGOTADO'); process.exit(2); }, 3 * 3600e3).unref();
(async () => {
  let bad = 0; const t0 = Date.now();
  const close = groups.filter(g => g !== 'game');
  for (const ven of venues) if (close.length) bad += await closeups(ven);
  if (groups.indexOf('game') >= 0) for (const ven of venues) for (const mob of [false, true]) bad += await game(ven, mob);
  console.log((bad ? '== HAY ERRORES ==' : '== listo ==') + ' ' + Math.round((Date.now() - t0) / 1000) + ' s');
  process.exit(bad ? 1 : 0);
})();
