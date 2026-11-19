#!/usr/bin/env node
/* MAKE THE CUT — tools/lookvis.js (plan del Vestuario, WP0.1): prueba de VISIBILIDAD de cada objeto del Vestuario.
 * «Se ve / no se ve» con un número: para cada objeto y sede renderiza el muñeco base y el muñeco con el objeto, en la MISMA pose y
 * con la MISMA cámara, y cuenta los píxeles que cambian (ΔE76 en Lab > --de, 8 por defecto) dentro de la caja del muñeco.
 * Todo en la vista previa del Vestuario (VB.Doll.preview vía ctx.actions.showroom, menú de ?debug=menu); base e objeto se pintan
 * en la MISMA tarea síncrona (showroom → preview.update(0) → render), así el tiempo de la pose y la respiración son idénticos
 * (tFix = 0, sin parpadeo) y el ruido es 0 (se mide con base contra base y sale en el informe).
 *
 * Tres casos (cada uno con su Chrome, uno detrás de otro; nunca dos a la vez):
 *  a) PRIMER PLANO del Vestuario: escritorio 768x768, &quality=high (LOD2), atlas px 2, cámara de 30° con el encuadre de la ranura
 *     (cabeza, busto, torso, piernas o pies, como tools/lookshots.js) desde frente, espalda, 3/4 izq., lado der. y 3/4 espalda der.
 *     Se queda la mejor vista. Umbral: ≥ 1,5 % de la caja de la ranura.
 *  b) PARTIDO EN EL MÓVIL, DE ESPALDAS: 640x360 táctil, dpr 2, UA Android (calidad media → LOD1, pixelRatio 1,25 → 800x450),
 *     atlas de 512² (px 1), pose de recepción, con la cámara del partido medida en el juego (ver CAM): distancia, elevación y fov de
 *     tu atleta en ?debug=rally6h (pista; el muñeco mide ≈ 68 px) y ?debug=rally&map=beach (playa). Tres acimuts: espalda recta y ±27°
 *     (el de la cámara de verdad). Se queda la mejor vista. Umbral: ≥ 9 px (un bloque de 3×3) para pelo, cabeza, piernas y brazos
 *     por fuera; lo de la cara (ojos, pintura, marcas, barba) y el cuello solo se exige en el primer plano (C12).
 *  c) LOD0 A 6v6 LEJOS: lo mismo con &quality=low (LOD0, 640x360) y la distancia del compañero más lejano (pista 11,9 m). Solo informa.
 * Dos variantes por objeto (piel clara + kit A blanco/rojo + pelo castaño; piel oscura + kit B marino/amarillo + pelo negro); cuenta
 * la PEOR (un objeto se ve si se ve en las dos).
 * Base de cada objeto: el muñeco de serie (pista: rodilleras cortas, calcetín media, tobillera blanca y zapatillas clásicas; playa:
 * nada) con SU ranura vacía. Referencias: las zapatillas clásicas son las de serie (en pista no se quitan) y el peinado se compara
 * con el tupé (el tupé con el rapado): de espaldas mide si el peinado se DISTINGUE del de serie (H5 del plan).
 * Zonas (ZONES, en la página): la camiseta interior (térmica, licra) solo cuenta lo que cambia en las MANGAS (tramos de hueso del
 * brazo por debajo de la bola del hombro y antebrazo, con la pose de ese momento): unas hombreras sueltas no son una licra (T1).
 * Lo que cambia de base a base (misma tarea) no cuenta (ruido; suele ser 0-7 px de bordes y se avisa).
 * Ranuras de UN brazo (brazalete, armL/armR, wristL/wristR): el primer plano cuenta en la mitad del torso de ese brazo (torsoL/torsoR).
 *
 * Uso:
 *   node tools/lookvis.js [--item=id[,id]] [--venue=hall|beach] [--case=a,b,c] [--de=8] [--sheet=all|fail|none] [--var=1|2] [--vs=id] [--expect=visible|invisible]
 *   --tile=N: lado de cada casilla de las hojas (150). --tha=0.015 --thb=9: otros umbrales.
 *   --vs=id: compara cada objeto de la ranura de id con id (no con la ranura vacía): ¿se DISTINGUEN? (p. ej. --item=altas --vs=cortas).
 *   Salida: tools/out/lookvis/report.json (se fusiona: con --item solo se rehacen esos), report.md (tabla) y hojas
 *   tools/out/lookvis/sheets/<sede>-NN.jpg (base | objeto | diferencia en magenta, para cada caso, de la variante peor).
 *   --sheet=fail (por defecto): hojas solo de lo que no pasa algún umbral; all: de todo; none: sin hojas.
 *   LOD: la vista previa del juego va siempre en LOD2, así que cada caso FUERZA su nivel con VB.Doll.preview.lod (a → 2, b → 1,
 *   c → 0) y avisa (y falla) si la malla medida no es la pedida. --loda=0|1: el primer plano en otro nivel (§4.7 del plan: LOD0 de
 *   cerca); entonces el informe va a report-loda<N>.json y las hojas a sheets-loda<N>/ para no mezclarse con el de verdad.
 *   Ejemplo (criterio de WP0): node tools/lookvis.js --item=pulseraTob,blanca,tobilleros,licra,manguito,altos
 *   Sale con 1 si algún objeto pedido con --item=…  y --expect=visible|invisible no cumple lo esperado.
 */
'use strict';
const path = require('path'), fs = require('fs'), vm = require('vm');
const CDP = require('./cdp.js');

const opt = {};
for (const a of process.argv.slice(2)) { const m = /^--([a-z]+)=(.*)$/.exec(a); if (m) opt[m[1]] = m[2]; }
const onlyItems = opt.item ? opt.item.split(',').filter(Boolean) : null;
const venues = opt.venue ? [opt.venue] : ['hall', 'beach'];
const CASES = (opt.case || 'a,b,c').split(',');
const DE = +(opt.de || 8);
const SHEET = opt.sheet || 'fail';
const NVAR = opt.var === '1' ? 1 : 2;
// nivel de detalle que se mide en cada caso (lo fuerza VB.Doll.preview.lod: la vista previa del juego va siempre en LOD2)
const LODA = opt.loda === '0' || opt.loda === '1' ? +opt.loda : 2;
const LOD_OF = { a: LODA, b: 1, c: 0 };
const OUT = path.join(CDP.ROOT, 'tools', 'out', 'lookvis');
const REPORT = path.join(OUT, LODA === 2 ? 'report.json' : 'report-loda' + LODA + '.json');
const SHEETS = LODA === 2 ? 'sheets' : 'sheets-loda' + LODA;
// umbrales del plan (WP0.1)
const TH_A = +(opt.tha || 0.015), TH_B = +(opt.thb || 9);   // (--tha=0.01 --thb=6 para probar otros umbrales)
// cámara del partido en el móvil, medida en el juego (640x360 táctil dpr 2, calidad media, buffer 800x450) con la posición de la
// cámara en el marco local de tu atleta (19-nov-2026): pista rally6h: (2,92, 5,70, −5,79) → 8,7 m, 41° de elevación, 27° fuera de
// la espalda, fov 50,4 y 98 px de 0 a 1,9 m (el muñeco, ≈ 68 px); compañero más lejano 11,9 m a 29°. Playa rally: 6,4 m a 35°, fov ≈ 60 (cambia con el zoom).
const CAM = {
  hall: { b: { d: 8.71, el: 41.3, fov: 50.4 }, c: { d: 11.86, el: 29.1, fov: 50.4 } },
  beach: { b: { d: 6.38, el: 34.9, fov: 60 }, c: { d: 6.46, el: 33.7, fov: 60 } }
};
// ranuras: dónde se encuadra el primer plano y si se exige verlo en el partido (de espaldas)
const SLOT_REGION = { style: 'head', hairTint: 'head', hairFx: 'head', head: 'head', eyes: 'head', paint: 'head', marks: 'head', beard: 'head', neck: 'bust',
  under: 'torso', band: 'torsoL', armL: 'torsoL', armR: 'torsoR', elbows: 'torso', wristL: 'torsoL', wristR: 'torsoR', hands: 'torso',
  legs: 'legs', knees: 'legs', socks: 'legs', ankle: 'feet', shoes: 'feet' };
// (WP5, ronda 1) Las ranuras de UN brazo (brazalete, brazo y muñeca izquierdos o derechos) se miden en la MITAD del torso de ese
// brazo (torsoL / torsoR: misma cámara que torso, la caja solo de ese lado): su caja de ranura es ese lado. Con la caja del torso entero
// un objeto de un solo brazo contaba contra los dos (la muñequera, el reloj o el brazalete se quedaban en 1,2 % y se veían bien).
const FACE_ONLY = { eyes: 1, paint: 1, marks: 1, beard: 1, neck: 1 };   // «solo de primer plano» (C12)

// catálogo (de js/look.js en node, sin navegador)
const LOOK = (() => { const VB = {}; vm.runInNewContext(fs.readFileSync(path.join(CDP.ROOT, 'js', 'look.js'), 'utf8'), { window: { VB, localStorage: null }, VB, console }); return VB.Look; })();
const venOk = (it, ven) => it.venue === 'A' || it.venue === (ven === 'beach' ? 'Y' : 'P');
function jobs(ven) {
  const out = [];
  for (const it of LOOK.CATALOG) {
    if (!venOk(it, ven) || it.slot === 'color') continue;
    if (onlyItems && onlyItems.indexOf(it.id) < 0) continue;
    let ref = it.slot === 'style' ? (it.id === 'tupe' ? 'rapado' : 'tupe') : (it.slot === 'shoes' && ven === 'hall' ? 'clasicas' : '');
    // --vs=id: comparar con otra opción de la misma ranura (¿se DISTINGUEN altas y cortas?) en vez de con la ranura vacía
    const vs = opt.vs && LOOK.item(opt.vs);
    if (vs && vs.slot === it.slot && vs.id !== it.id && venOk(vs, ven)) ref = vs.id;
    out.push({ id: it.id, slot: it.slot, ven, ref, key: ven + ':' + it.id + (vs && ref === vs.id ? '~' + vs.id : ''), ref0: !vs && it.slot === 'shoes' && ven === 'hall' && it.id === 'clasicas' });
  }
  return out;
}

// ---------------------------------------------------------------- código de la página
const PAGE = String.raw`
window.__LV = (function () {
  var c = VB.ctx, LK = VB.Look, D = VB.Doll, P = VB.Players, THREE = c.THREE || window.THREE, PI = Math.PI;
  var KITS = { A: { kitShirt: 0xf2f2ee, kitAccent: 0xd8262e, kitShorts: 0x1c1f2a, kitPattern: 'liso' },
               B: { kitShirt: 0x172246, kitAccent: 0xffcf2e, kitShorts: 0x172246, kitPattern: 'diag' } };
  var VARS = [{ skin: 0xf7dcc4, hair: 0x3a2416, kit: 'A', tag: 'clara/A' }, { skin: 0x5a3626, hair: 0x241a14, kit: 'B', tag: 'oscura/B' }];
  var dm = D.dims(), top = dm.top, headH = 2 * dm.HEAD_RY;
  var handLow = dm.shoulder - dm.UPPER - dm.FORE - dm.PALM - 0.06 * dm.HAND_K;
  // regiones (como lookshots): [y0, y1, medio ancho, fondo]
  var REG = {
    head: [top - headH - 0.16, top + 0.16, dm.HEAD_RX + 0.24, 0.3],
    bust: [dm.shoulder - 0.38, top + 0.1, dm.SH_X + 0.2, 0.3],
    torso: [handLow - 0.08, dm.shoulder + 0.16, dm.SH_X + 0.26, 0.3],
    torsoL: [handLow - 0.08, dm.shoulder + 0.16, dm.SH_X + 0.26, 0.3, 0],   // [4]: solo el lado del brazo k (ranuras de un brazo)
    torsoR: [handLow - 0.08, dm.shoulder + 0.16, dm.SH_X + 0.26, 0.3, 1],
    legs: [-0.05, dm.HIP_H + 0.12, dm.HIP_W + 0.26, 0.3],
    feet: [-0.05, 0.42, dm.HIP_W + 0.22, 0.32],
    full: [-0.06, top + 0.14, dm.SH_X + 0.32, 0.35]
  };
  // primer plano: [acimut, elevación] (0 = de frente, + = hacia la izquierda del muñeco)
  var VIEWS_A = { frente: [0, 4], espalda: [180, 4], q3izq: [45, 6], ladoDer: [-90, 4], q3espDer: [-135, 6] };
  var VIEWS_B = { espalda: 180, espIzq: 153, espDer: -153 };
  var cvR = c.renderer.domElement, rd = document.createElement('canvas'), rg = null;
  // lienzo de lectura
  function grab(x0, y0, w, h) {
    if (rd.width !== cvR.width || rd.height !== cvR.height) { rd.width = cvR.width; rd.height = cvR.height; rg = rd.getContext('2d', { willReadFrequently: true }); }
    if (!rg) rg = rd.getContext('2d', { willReadFrequently: true });
    rg.clearRect(0, 0, rd.width, rd.height); rg.drawImage(cvR, 0, 0);
    return rg.getImageData(x0, y0, w, h);
  }
  function render() { if (c.renderFn) c.renderFn(c); else c.renderer.render(c.scene, c.camera); }
  function emptySet() { var o = {}; LK.SLOTS.forEach(function (s) { o[s] = ''; }); return o; }
  /** fit base de serie (pista: rodilleras, calcetines, tobillera y zapatillas de serie) con la ranura del objeto en ref. */
  function fits(job, V) {
    var b = LK.defaults(0); b.hall = emptySet(); b.beach = emptySet();
    b.hall.knees = 'cortas'; b.hall.socks = 'media'; b.hall.ankle = 'blanca'; b.hall.shoes = 'clasicas';
    b.skin = V.skin; b.hair = V.hair; b.style = 'tupe';
    var ven = job.ven, s = job.slot;
    // (el peinado, el tinte y el efecto de pelo van en la raíz del fit, no en la sede: hairFx sin hair2 = segundo color que contraste)
    if (s === 'style') b.style = job.ref; else if (s === 'hairFx') b.hairFx = job.ref; else if (s !== 'hairTint') b[ven][s] = job.ref;
    b = LK.fix(b, ven, null).fit;
    var it = JSON.parse(JSON.stringify(b));
    if (s === 'style') it.style = job.id; else if (s === 'hairTint') it.hair = job.id; else if (s === 'hairFx') it.hairFx = job.id; else it[ven][s] = job.id;
    var fx = LK.fix(it, ven, s === 'hairTint' || s === 'hairFx' ? 'style' : s), f = fx.fit;
    var worn = s === 'style' ? f.style === job.id : s === 'hairTint' ? f.hair === job.id : s === 'hairFx' ? f.hairFx === job.id : f[ven][s] === job.id;
    return { base: b, item: f, worn: worn, removed: (fx.removed || []).map(function (x) { return x.msg; }) };
  }
  /** pone el aspecto en la vista previa, congelado (tFix 0, sin parpadeo, cara neutra) y aplicado YA (preview.update(0)). */
  function put(fit, ven, V, px, pose) {
    var tc = P.kitFrom(KITS[V.kit]), L = LK.resolve(fit, ven, tc);
    c.actions.showroom(true, L, { tc: tc, num: 7, beach: ven === 'beach', px: px });
    D.preview.pose(pose); D.preview.face('neutra');
    var inf = D.preview.info(), r = inf.rig;
    r.tFix = 0; r.blinkOn = 0; r.blinkT = 999;
    D.preview.update(0);
    return inf;
  }
  // caja (en píxeles del lienzo) de la región reg del muñeco vista con la cámara de ahora
  var V3 = null;
  function boxOf(root, R, rig) {
    if (!V3) V3 = new THREE.Vector3();
    var x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, W = cvR.width, H = cvR.height, cam = c.camera, xs = [-R[2], R[2]];
    if (R[4] != null && rig) {   // solo el lado del brazo R[4]: de x = 0 al hombro de ese brazo y más allá (marco local del muñeco)
      root.updateMatrixWorld(true); rig.sh[R[4]].getWorldPosition(V3); root.worldToLocal(V3);
      xs = V3.x < 0 ? [-R[2], 0] : [0, R[2]];
    }
    [R[0], R[1]].forEach(function (y) { xs.forEach(function (lx) { [-0.2, 0.2].forEach(function (lz) {
      V3.set(lx, y, lz); root.localToWorld(V3); V3.project(cam);
      var px = (V3.x * 0.5 + 0.5) * W, py = (-V3.y * 0.5 + 0.5) * H;
      x0 = Math.min(x0, px); x1 = Math.max(x1, px); y0 = Math.min(y0, py); y1 = Math.max(y1, py);
    }); }); });
    x0 = Math.max(0, Math.floor(x0) - 2); y0 = Math.max(0, Math.floor(y0) - 2); x1 = Math.min(W, Math.ceil(x1) + 2); y1 = Math.min(H, Math.ceil(y1) + 2);
    return [x0, y0, Math.max(1, x1 - x0), Math.max(1, y1 - y0)];
  }
  // zonas donde TIENE que verse el objeto (marco local del muñeco: [x0, x1, y0, y1]); sin zona, toda la caja de la región.
  // La camiseta interior (térmica, licra) se ve si se ven sus MANGAS (por debajo de la bola del hombro, de codo para arriba y
  // en el antebrazo): unas hombreras sueltas no son una licra (T1 del plan)
  var ZONES = {
    // [hueso, punto local] de cada tramo (con la pose de ahora): brazo desde debajo de la bola del hombro hasta el codo, y antebrazo
    under: function (r) { var out = []; for (var k = 0; k < 2; k++) { out.push([[r.up[k], 0, -0.15, 0], [r.el[k], 0, 0, 0]]); out.push([[r.el[k], 0, 0, 0], [r.hand[k], 0, 0, 0]]); } return out; },
    // (WP3) pintura, marcas y barbas: el % es de la CAJA DE LA CABEZA (lo que dice el plan), no de la región con sus márgenes de 16 cm
    paint: headZone, marks: headZone, beard: headZone
  };
  function headZone(r) { var d = D.dims(); return [[[r.head, 0, d.HEAD_C - d.HEAD_RY, 0], [r.head, 0, d.HEAD_C + d.HEAD_RY, 0], d.HEAD_RX]]; }
  var ZONE_RAD = 0.065;   // grosor (m) alrededor del hueso, solo de lado (en vertical no: la bola del hombro quedaría dentro)
  /** Máscara (1 = dentro) de las zonas del objeto dentro de la caja box ya proyectada con la cámara de ahora; null = toda. */
  function zoneMask(rig, slot, box) {
    var Z = ZONES[slot] && ZONES[slot](rig); if (!Z) return null;
    var m = new Uint8Array(box[2] * box[3]), W = cvR.width, H = cvR.height, cam = c.camera, P2 = new THREE.Vector3();
    rig.root.updateMatrixWorld(true);
    Z.forEach(function (seg) {
      var x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
      seg.forEach(function (pt) {
        if (!pt || !pt[0] || !pt[0].localToWorld) return;   // (el tercer elemento, si lo hay, es el radio del tramo)
        pt[0].localToWorld(P2.set(pt[1], pt[2], pt[3]));
        [[0, 0, 0], [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]].forEach(function (o) {
          var zr = typeof seg[2] === 'number' ? seg[2] : ZONE_RAD;
          V3.set(P2.x + o[0] * zr, P2.y + o[1] * zr, P2.z + o[2] * zr).project(cam);
          var px = (V3.x * 0.5 + 0.5) * W, py = (-V3.y * 0.5 + 0.5) * H;
          x0 = Math.min(x0, px); x1 = Math.max(x1, px); y0 = Math.min(y0, py); y1 = Math.max(y1, py);
        });
      });
      var ax = Math.max(0, Math.floor(x0 - box[0])), bx = Math.min(box[2], Math.ceil(x1 - box[0])), ay = Math.max(0, Math.floor(y0 - box[1])), by = Math.min(box[3], Math.ceil(y1 - box[1]));
      for (var yy = ay; yy < by; yy++) for (var xx = ax; xx < bx; xx++) m[yy * box[2] + xx] = 1;
    });
    return m;
  }
  function camA(root, region, view, rig) {
    var cam = c.camera, R = REG[region], Vw = VIEWS_A[view];
    root.rotation.y = PI / 2; root.updateMatrixWorld(true);
    var asp = cvR.width / cvR.height, fov = 30, tv = Math.tan(fov * PI / 360);
    var cy = (R[0] + R[1]) / 2, half = (R[1] - R[0]) / 2, d = Math.max(half, R[2]) / tv * 1.04 + R[3];
    var az = Vw[0] * PI / 180, el = Vw[1] * PI / 180, X = root.position.x, Z = root.position.z;
    cam.fov = fov; cam.aspect = asp; cam.filmOffset = 0; cam.zoom = 1; if (cam.view && cam.clearViewOffset) cam.clearViewOffset();
    cam.updateProjectionMatrix(); cam.up.set(0, 1, 0);
    cam.position.set(X + Math.cos(az) * d * Math.cos(el), cy + d * Math.sin(el), Z - Math.sin(az) * d * Math.cos(el));
    cam.lookAt(X, cy, Z); cam.updateMatrixWorld(true);
    // caja: la de la región, dentro del cuadrado central (el encuadre de las hojas)
    var b = boxOf(root, R, rig), sq = Math.min(cvR.width, cvR.height), qx = (cvR.width - sq) / 2, qy = (cvR.height - sq) / 2;
    var x0 = Math.max(b[0], qx), y0 = Math.max(b[1], qy), x1 = Math.min(b[0] + b[2], qx + sq), y1 = Math.min(b[1] + b[3], qy + sq);
    return [Math.floor(x0), Math.floor(y0), Math.max(1, Math.floor(x1 - x0)), Math.max(1, Math.floor(y1 - y0))];
  }
  function camB(root, G, azDeg) {
    var cam = c.camera, sc = root.scale.y, cy = 0.5 * top * sc;
    root.rotation.y = PI / 2; root.updateMatrixWorld(true);
    var az = azDeg * PI / 180, el = G.el * PI / 180, d = G.d, X = root.position.x, Z = root.position.z;
    cam.fov = G.fov; cam.aspect = cvR.width / cvR.height; cam.filmOffset = 0; cam.zoom = 1; if (cam.view && cam.clearViewOffset) cam.clearViewOffset();
    cam.updateProjectionMatrix(); cam.up.set(0, 1, 0);
    cam.position.set(X + Math.cos(az) * d * Math.cos(el), cy + d * Math.sin(el), Z - Math.sin(az) * d * Math.cos(el));
    cam.lookAt(X, cy, Z); cam.updateMatrixWorld(true);
    return boxOf(root, REG.full);
  }
  // ---- color: ΔE76 en Lab (sRGB D65)
  var LIN = new Float32Array(256); for (var i = 0; i < 256; i++) { var v = i / 255; LIN[i] = v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }
  function fl(t) { return t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116; }
  function lab(d, k, o) {
    var r = LIN[d[k]], g = LIN[d[k + 1]], b = LIN[d[k + 2]];
    var x = fl((0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047), y = fl(0.2126 * r + 0.7152 * g + 0.0722 * b), z = fl((0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883);
    o[0] = 116 * y - 16; o[1] = 500 * (x - y); o[2] = 200 * (y - z);
  }
  var LA = [0, 0, 0], LB = [0, 0, 0];
  /** Píxeles con ΔE > thr entre a y b. skip: los que se ignoran (ruido de base contra base); zone: solo los de dentro. */
  function diff(a, b, thr, skip, zone) {
    var d1 = a.data, d2 = b.data, n = 0, mask = new Uint8Array(a.width * a.height), t2 = thr * thr;
    for (var p = 0, k = 0; p < mask.length; p++, k += 4) {
      if ((skip && skip[p]) || (zone && !zone[p])) continue;
      if (d1[k] === d2[k] && d1[k + 1] === d2[k + 1] && d1[k + 2] === d2[k + 2]) continue;
      lab(d1, k, LA); lab(d2, k, LB);
      var dl = LA[0] - LB[0], da = LA[1] - LB[1], db = LA[2] - LB[2];
      if (dl * dl + da * da + db * db > t2) { mask[p] = 1; n++; }
    }
    return { n: n, mask: mask };
  }

  // ---- hojas: cada caso pinta su TIRA por objeto (base | objeto | diferencia, de la variante peor) y la última página las junta
  var TW = window.__LV_TILE || 150, TH = TW, LAB = 34;
  function paintTile(g, x, y, img, mask, scale, label, bad, zone) {
    var t = document.createElement('canvas'); t.width = img.width; t.height = img.height;
    var tg = t.getContext('2d'), id = tg.createImageData(img.width, img.height), s = img.data, o = id.data;
    for (var k = 0, p = 0; k < s.length; k += 4, p++) {
      if (mask) {
        if (mask[p]) { o[k] = 255; o[k + 1] = 40; o[k + 2] = 220; }
        else { var l = (s[k] * 0.3 + s[k + 1] * 0.59 + s[k + 2] * 0.11) * (zone && !zone[p] ? 0.18 : 0.45); o[k] = o[k + 1] = o[k + 2] = l; if (zone && zone[p]) o[k + 2] = Math.min(255, l + 40); }
      } else { o[k] = s[k]; o[k + 1] = s[k + 1]; o[k + 2] = s[k + 2]; }
      o[k + 3] = 255;
    }
    tg.putImageData(id, 0, 0);
    g.fillStyle = '#000'; g.fillRect(x, y, TW, TH);
    var k2 = Math.min(TW / img.width, TH / img.height); if (scale) k2 = Math.min(k2, scale);
    var w = img.width * k2, h = img.height * k2;
    g.imageSmoothingEnabled = !scale; g.drawImage(t, x + (TW - w) / 2, y + (TH - h) / 2, w, h);
    g.fillStyle = bad ? '#6a1f1f' : '#23262e'; g.fillRect(x, y + TH, TW, LAB);
    g.fillStyle = '#f2f2f2'; g.font = '12px Arial, sans-serif'; g.textBaseline = 'top';
    String(label || '').split('\n').slice(0, 2).forEach(function (ln, j) { var q = ln; while (g.measureText(q).width > TW - 6 && q.length > 3) q = q.slice(0, -1); g.fillText(q, x + 3, y + TH + 3 + j * 15); });
  }
  /** Tira de un caso para un objeto (JPEG en dataURL): a = base, objeto, diferencia; b = igual (recorte ×3); c = objeto, diferencia. */
  function strip(job, kase, rep) {
    var W = LAST[kase]; if (!W) return '';
    var n = kase === 'c' ? 2 : 3, cv = document.createElement('canvas'); cv.width = n * (TW + 4); cv.height = TH + LAB;
    var g = cv.getContext('2d'), sc = kase === 'a' ? 0 : 3, bad = rep.req && !rep.ok;
    var num = kase === 'a' ? (100 * W.ratio).toFixed(2) + ' % (' + W.px + ' px)' : W.px + ' px' + (kase === 'b' ? (rep.req ? ' (mín. 9)' : ' (cara: no se exige)') : ' LOD0');
    var i = 0;
    if (kase !== 'c') paintTile(g, (TW + 4) * i++, 0, W.base, null, sc, kase + ' base · ' + W.view + '\n' + W.tag, false);
    paintTile(g, (TW + 4) * i++, 0, W.item, null, sc, kase + ' ' + job.slot + '=' + job.id + '\n' + (kase === 'c' ? W.view + ' ' + W.tag : W.view), bad);
    paintTile(g, (TW + 4) * i++, 0, W.item, W.mask, sc, kase + ' cambia' + (W.zone ? ' (zona azul)' : '') + '\n' + num, bad, W.zone);
    return cv.toDataURL('image/jpeg', 0.85);
  }
  /** Junta las tiras en una hoja: rows = [{label, bad, a, b, c}] (dataURL o ''). Devuelve un dataURL JPEG. */
  async function compose(rows, title, sub) {
    var CW = { a: 3 * (TW + 4), b: 3 * (TW + 4), c: 2 * (TW + 4) }, LW = 170, head = 50, RH = TH + LAB + 6;
    var cv = document.createElement('canvas'); cv.width = LW + CW.a + CW.b + CW.c + 16; cv.height = head + rows.length * RH + 4;
    var g = cv.getContext('2d'); g.fillStyle = '#111317'; g.fillRect(0, 0, cv.width, cv.height);
    g.fillStyle = '#ffe680'; g.font = 'bold 16px Arial, sans-serif'; g.textBaseline = 'top'; g.fillText(String(title).slice(0, 170), 8, 6);
    g.fillStyle = '#9fd0ff'; g.font = '12px Arial, sans-serif'; g.fillText(String(sub).slice(0, 230), 8, 28);
    function load(src) { return new Promise(function (res) { if (!src) return res(null); var im = new Image(); im.onload = function () { res(im); }; im.onerror = function () { res(null); }; im.src = src; }); }
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i], y = head + i * RH, x = 4;
      g.fillStyle = r.bad ? '#6a1f1f' : '#23262e'; g.fillRect(x, y, LW - 6, TH + LAB);
      g.fillStyle = '#f2f2f2'; g.font = 'bold 14px Arial, sans-serif'; g.fillText(r.id, x + 6, y + 8);
      g.font = '12px Arial, sans-serif';
      String(r.label || '').split('\n').forEach(function (ln, j) { g.fillText(ln.slice(0, 28), x + 6, y + 30 + j * 16); });
      x = LW;
      for (var k of ['a', 'b', 'c']) { var im = await load(r[k]); if (im) g.drawImage(im, x, y); x += CW[k] + 4; }
    }
    return cv.toDataURL('image/jpeg', 0.85);
  }

  /** Mide un objeto en un caso ('a' | 'b' | 'c'). G = cámara del partido (b, c). Devuelve números por variante y, si
   *  keep, las imágenes de la variante peor para la hoja (se guardan en __LV.last). */
  function measure(job, kase, G, nvar, thr, keep) {
    var px = kase === 'a' ? 2 : 1, pose = kase === 'a' ? 'stand' : 'recv', res = { vars: [], lod: -1, tris: 0, worn: true, removed: [] }, worst = null;
    for (var vi = 0; vi < nvar; vi++) {
      var V = VARS[vi], F = fits(job, V);
      res.worn = res.worn && F.worn; F.removed.forEach(function (m) { if (res.removed.indexOf(m) < 0) res.removed.push(m); });
      var views = kase === 'a' ? Object.keys(VIEWS_A) : Object.keys(VIEWS_B), shots = {}, inf, root, best = null, noise = 0;
      // base, objeto y otra vez base (ruido) en la misma tarea
      ['base', 'item', 'base2'].forEach(function (w) {
        inf = put(w === 'item' ? F.item : F.base, job.ven, V, px, pose); root = inf.rig.root;
        if (w === 'item') { res.lod = inf.lod; res.tris = inf.tris; }
        views.forEach(function (vw) {
          var box = kase === 'a' ? camA(root, REG[job.region] ? job.region : 'full', vw, inf.rig) : camB(root, G, VIEWS_B[vw]);
          render();
          var im = grab(box[0], box[1], box[2], box[3]);
          shots[w + vw] = { im: im, box: box, zone: w === 'item' ? zoneMask(inf.rig, job.slot, box) : null };
        });
      });
      views.forEach(function (vw) {
        var a = shots['base' + vw], b = shots['item' + vw];
        // ruido: lo que cambia de base a base (misma tarea) no cuenta; con zona, solo cuenta lo de dentro y la caja es la zona
        var nz = diff(a.im, shots['base2' + vw].im, thr), zone = b.zone, d = diff(a.im, b.im, thr, nz.mask, zone), area = a.box[2] * a.box[3];
        if (zone) { area = 0; for (var q = 0; q < zone.length; q++) area += zone[q]; area = Math.max(1, area); }
        noise = Math.max(noise, nz.n);
        var v = { view: vw, px: d.n, ratio: d.n / area, area: area, zone: !!zone };
        if (!best || (kase === 'a' ? v.ratio > best.ratio : v.px > best.px)) best = Object.assign({ mask: d.mask }, v);
      });
      res.vars.push({ tag: V.tag, px: best.px, ratio: +best.ratio.toFixed(5), view: best.view, area: best.area, zone: best.zone, noise: noise });
      if (keep && (!worst || (kase === 'a' ? best.ratio < worst.ratio : best.px < worst.px))) worst = { px: best.px, ratio: best.ratio, view: best.view, tag: V.tag, base: shots['base' + best.view].im, item: shots['item' + best.view].im, mask: best.mask, zone: shots['item' + best.view].zone };
    }
    var m = res.vars.reduce(function (a, b) { return (kase === 'a' ? b.ratio < a.ratio : b.px < a.px) ? b : a; });
    res.px = m.px; res.ratio = m.ratio; res.view = m.view; res.tag = m.tag;
    LAST[kase] = worst;
    return res;
  }
  var LAST = {};
  function state() { return { q: c.quality && c.quality.level, rank: c.quality && c.quality.rank, w: cvR.width, h: cvR.height, touch: !!c.isTouch }; }
  return { measure: measure, strip: strip, compose: compose, state: state };
})();
true;
`;


// ---------------------------------------------------------------- node
fs.mkdirSync(path.join(OUT, SHEETS), { recursive: true });
let report = {}; try { report = JSON.parse(fs.readFileSync(REPORT, 'utf8')); } catch (e) { }
if (!report.items) report = { items: {} };
const key = (ven, id) => ven + ':' + id;
const freeMB = () => { try { const sf = fs.statfsSync(OUT.slice(0, 3)); return Math.round(sf.bavail * sf.bsize / 1e6); } catch (e) { return 1e9; } };

async function openPage(kase, ven) {
  const map = ven === 'beach' ? 'beach' : 'palau';
  const page = kase === 'a' ? await CDP.open({ size: '768x768' })
    : await CDP.open({ size: '640x360', touch: true, dpr: 2, ua: CDP.ANDROID_UA });
  await page.navigate('debug=menu&nonews=1&map=' + map + (kase === 'a' ? '&quality=high' : kase === 'c' ? '&quality=low' : ''));
  for (let i = 0; i < 60; i++) { await CDP.sleep(500); try { if (await page.evalJs('!!(window.VB&&VB.ctx&&VB.ctx.renderer&&VB.ctx.actions&&VB.ctx.actions.showroom&&VB.Look&&VB.Doll&&VB.Players)')) break; } catch (e) { } }
  await CDP.sleep(+(process.env.WAIT || 2500));
  await page.evalJs('window.__LV_TILE=' + (+opt.tile || 150) + ';' + PAGE);
  return page;
}
function verdictOf(e) {
  if (e.ref0) return 'REFERENCIA';
  if (e.worn === false) return 'QUITADO';
  if ((e.a && !e.a.ok) || (e.b && e.b.req && !e.b.ok)) return 'INVISIBLE';
  return e.a || e.b ? 'VISIBLE' : 'SIN MEDIR';
}
const isBad = e => { const v = verdictOf(e); return v === 'INVISIBLE' || v === 'QUITADO'; };
function rowLabel(e) {
  const f = (k) => !e[k] ? '-' : k === 'a' ? (100 * e[k].ratio).toFixed(2) + '%' : e[k].px + 'px';
  return verdictOf(e) + '\n' + e.slot + (e.ref ? ' (frente a ' + e.ref + ')' : '') + '\na ' + f('a') + ' · b ' + f('b') + (e.b && !e.b.req ? ' (cara)' : '') + '\nc ' + f('c') + (e.removed && e.removed.length ? '\n' + e.removed[0] : '');
}

/** Un caso de una sede: mide cada objeto y guarda su tira para la hoja; la página del último caso compone las hojas. */
async function runCase(kase, ven, list, strips, last) {
  const page = await openPage(kase, ven);
  let bad = 0;
  try {
    const lod = await page.evalJs('VB.Doll.preview.lod ? VB.Doll.preview.lod(' + LOD_OF[kase] + ') : -1');
    if (lod !== LOD_OF[kase]) throw new Error('no se puede forzar LOD' + LOD_OF[kase] + ' en la vista previa (VB.Doll.preview.lod)');
    const st = await page.evalJs('__LV.state()');
    console.log('[' + kase + ' ' + ven + '] ' + JSON.stringify(st) + ' · ' + list.length + ' objetos');
    const G = CAM[ven][kase] || null;
    for (const job of list) {
      job.region = SLOT_REGION[job.slot] || 'full';
      const r = await page.evalJs('__LV.measure(' + JSON.stringify(job) + ',' + JSON.stringify(kase) + ',' + JSON.stringify(G) + ',' + NVAR + ',' + DE + ',' + (SHEET !== 'none') + ')');
      const e = report.items[job.key];
      e.ref = job.ref; e.worn = r.worn; e.removed = r.removed;
      const req = kase === 'b' ? !FACE_ONLY[job.slot] : kase === 'a';
      const ok = kase === 'a' ? r.ratio >= TH_A : r.px >= TH_B;
      if (r.lod !== LOD_OF[kase]) { console.error('  ERROR ' + ven + ' ' + job.id + ' (' + kase + '): medido en LOD' + r.lod + ' y no en LOD' + LOD_OF[kase]); bad++; }
      e[kase] = { px: r.px, ratio: r.ratio, view: r.view, tag: r.tag, lod: r.lod, tris: r.tris, vars: r.vars, req, ok, buf: st.w + 'x' + st.h, q: st.q };
      const noise = Math.max.apply(null, r.vars.map(v => v.noise || 0));
      if (noise) { e[kase].noise = noise; console.log('  AVISO ruido ' + ven + ' ' + job.id + ' (' + kase + '): ' + noise + ' px cambian con base contra base'); }
      if (SHEET !== 'none') (strips[job.id] = strips[job.id] || {})[kase] = await page.evalJs('__LV.strip(' + JSON.stringify(job) + ',' + JSON.stringify(kase) + ',' + JSON.stringify(e[kase]) + ')');
    }
    if (last && SHEET !== 'none') {
      const rows = list.map(j => report.items[j.key]).filter(e => SHEET === 'all' || isBad(e) || (e.c && !e.c.ok && e.b && e.b.req))
        .map(e => Object.assign({ id: e.id, label: rowLabel(e), bad: isBad(e) }, strips[e.id] || {}));
      const tag = onlyItems ? onlyItems.slice(0, 6).join('_') + '-' : '';
      for (let i = 0, n = 1; i < rows.length; i += 10, n++) {
        if (freeMB() < 250) { console.error('DISCO CASI LLENO: sin hojas'); bad++; break; }
        const chunk = rows.slice(i, i + 10);
        const data = await page.evalJs('__LV.compose(' + JSON.stringify(chunk) + ',' + JSON.stringify('VISIBILIDAD · ' + ven + ' · ' + chunk.map(x => x.id).join(', ')) + ',' +
          JSON.stringify('a = primer plano LOD' + LODA + ' 768² (mejor de 5 vistas, mín. 1,5 % de la caja) · b = partido en el móvil de espaldas LOD1 800x450 (×3, mín. 9 px) · c = LOD0 lejos 640x360 (×3) · magenta = ΔE > ' + DE) + ')', true);
        const file = path.join(OUT, SHEETS, ven + '-' + tag + String(n).padStart(2, '0') + '.jpg');
        fs.writeFileSync(file, Buffer.from(String(data).replace(/^data:image\/jpeg;base64,/, ''), 'base64'));
        console.log('  → ' + path.relative(CDP.ROOT, file));
      }
    }
    const errs = page.errors.filter(x => !/favicon/i.test(String(x)));
    if (errs.length) { console.log('errores de página (' + errs.length + '):\n  ' + errs.slice(0, 8).join('\n  ')); bad += errs.length; }
  } catch (e) { bad++; console.error('ERROR ' + kase + ' ' + ven + ': ' + (e && e.stack || e)); }
  await page.close();
  return bad;
}

function table() {
  const all = Object.values(report.items);
  const order = id => LOOK.CATALOG.findIndex(x => x.id === id);
  all.sort((a, b) => a.ven === b.ven ? order(a.id) - order(b.id) : a.ven < b.ven ? 1 : -1);
  const f = (e, k) => !e[k] ? '-' : k === 'a' ? (100 * e[k].ratio).toFixed(2) + ' %' : String(e[k].px);
  const L = ['# Visibilidad del Vestuario (tools/lookvis.js)', '',
    'Umbral ΔE76 > ' + DE + '. a = primer plano (≥ 1,5 % de la caja de la ranura), b = partido en el móvil de espaldas (≥ 9 px; no se exige a la cara ni al cuello), c = LOD0 lejos (solo informa). Peor de las dos variantes (clara/A y oscura/B).', '',
    '| sede | ranura | objeto | a primer plano | b partido (px) | c LOD0 lejos (px) | veredicto | vista a / b |', '|---|---|---|---|---|---|---|---|'];
  const bad = [], cmp = [];
  const row = e => { const v = verdictOf(e); return '| ' + e.ven + ' | ' + e.slot + ' | ' + e.id + (e.ref ? ' (frente a ' + e.ref + ')' : '') + ' | ' + f(e, 'a') + ' | ' + f(e, 'b') + (e.b && !e.b.req ? ' (cara)' : '') + ' | ' + f(e, 'c') + ' | ' + (v === 'VISIBLE' ? v : '**' + v + '**') + ' | ' + (e.a ? e.a.view : '-') + ' / ' + (e.b ? e.b.view : '-') + ' |'; };
  for (const e of all) {
    if (e.vs) { cmp.push(e); continue; }   // comparaciones --vs: aparte (no cuentan como «no se ve»)
    const v = verdictOf(e);
    if (v === 'INVISIBLE' || v === 'QUITADO') bad.push(e);
    L.push(row(e));
  }
  L.push('', '## No pasan (' + bad.length + ')', '');
  bad.forEach(e => L.push('- ' + e.ven + ' ' + e.slot + '=' + e.id + ': ' + [e.a && !e.a.ok ? 'primer plano ' + f(e, 'a') : '', e.b && e.b.req && !e.b.ok ? 'partido ' + f(e, 'b') + ' px' : '', e.worn === false ? 'lo quitan las reglas' : ''].filter(Boolean).join(', ')));
  const lowC = all.filter(e => e.c && !e.c.ok && e.b && e.b.req && verdictOf(e) === 'VISIBLE');
  if (lowC.length) L.push('', '## Visibles en el móvil pero < 9 px en LOD0 lejos (' + lowC.length + ')', '', lowC.map(e => e.ven + ' ' + e.id + ' ' + e.c.px).join(' · '));
  if (cmp.length) L.push('', '## Comparaciones entre opciones (--vs): «INVISIBLE» = no se distinguen', '', L[4], L[5], ...cmp.map(row));
  return L.join('\n') + '\n';
}

(async () => {
  setTimeout(() => { console.error('TIEMPO AGOTADO'); process.exit(2); }, 2 * 3600e3).unref();
  const t0 = Date.now(); let bad = 0;
  if (freeMB() < 250) { console.error('DISCO CASI LLENO (< 250 MB): no se lanza'); process.exit(2); }
  for (const ven of venues) {
    const list = jobs(ven);
    if (!list.length) continue;
    list.forEach(j => { const e = report.items[j.key] = report.items[j.key] || { id: j.id, slot: j.slot, ven }; e.ref0 = j.ref0; e.vs = j.key.indexOf('~') > 0; CASES.forEach(k => { delete e[k]; }); });
    const strips = {};
    for (let i = 0; i < CASES.length; i++) {
      if (freeMB() < 250) { console.error('DISCO CASI LLENO: se para'); bad++; break; }
      bad += await runCase(CASES[i], ven, list, strips, i === CASES.length - 1);
    }
  }
  report.de = DE; report.th = { a: TH_A, b: TH_B }; report.cam = CAM; report.when = new Date().toISOString();
  fs.writeFileSync(REPORT, JSON.stringify(report, null, 1));
  const md = table();
  fs.writeFileSync(path.join(OUT, LODA === 2 ? 'report.md' : 'report-loda' + LODA + '.md'), md);
  // en consola: con --item solo las filas de esos objetos (el report.md lleva todo lo medido hasta ahora)
  console.log('\n' + md.split('\n').filter(l => !onlyItems || !/^\| (hall|beach) /.test(l) || onlyItems.some(id => l.indexOf('| ' + id + ' ') >= 0 || l.indexOf('| ' + id + ' (') >= 0)).join('\n'));
  let exp = 0;
  if (opt.expect && onlyItems) {
    const want = opt.expect.toUpperCase();
    for (const ven of venues) for (const id of onlyItems) {
      const jb = jobs(ven).find(j => j.id === id), e = jb && report.items[jb.key]; if (!e) continue;
      const v = verdictOf(e);
      if (v !== want && !(want === 'VISIBLE' && v === 'REFERENCIA')) { exp++; console.error('ESPERADO ' + want + ': ' + ven + ' ' + id + ' da ' + v); }
      else console.log('ok: ' + ven + ' ' + id + ' ' + v);
    }
  }
  console.log((bad ? '== HAY ERRORES ==' : '== listo ==') + ' ' + Math.round((Date.now() - t0) / 1000) + ' s → ' + path.relative(CDP.ROOT, REPORT));
  process.exit(bad || exp ? 1 : 0);
})();
