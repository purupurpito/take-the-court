#!/usr/bin/env node
/* MAKE THE CUT — tools/cam6clip.js (owner: arena)
 * ¿Tapa algo del pabellón las cámaras del 6v6? (15-nov-2026: en 5 pistas H1 pequeñas con techo de dientes de sierra, la cámara de
 * televisión del 6v6 —x 14,2, z 7,8— quedaba entre las cerchas del techo y una viga tapaba media pista). Para cada pista (las
 * generadas y las de a mano con grupo propio: canrebot, cupula) monta la sede (CDP, como venueshots) y lanza rayos (THREE.Raycaster)
 * contra las mallas VISIBLES del grupo de la sede (arena/map-<id>; ni la pista, ni la red, ni el público, ni los jugadores) desde la
 * envolvente de las cámaras de juego del 6v6 (js/camera.js) a una rejilla de la pista (x -9..9, y ±4,5, z 0,1 / 2 / 4):
 *   tv  x ±14,2 (tvShot: mn(14,2, bX - 0,8)), y -1,1 / 0 / 1,1 (TVS.y = 0,25·b.y), z 7,8
 *   3p  x ±11 / ±13,5 / ±15 (back 4-7,4 m tras el sujeto, hasta el límite bX), y -4,5 / 0 / 4,5, z 4,9 / 6,4 (TPK.h + subida por oclusión)
 * Solo los puntos al menos 3 m por delante de la cámara. Un rayo está TAPADO si choca antes de 0,3 m del punto.
 * Las H8/H9 (piel de Palau, sin grupo propio) cuentan como Palau, que es la sede para la que se diseñaron esas cámaras.
 * Salida: por sede, % de rayos tapados (tv y 3p) y la malla que más tapa; tools/out/cam6clip.json. Sale con 1 si alguna pasa de MAXP.
 * Variables: CLUBS=CZ:FIE,... (solo esas) · MAXP=0.5 (% máximo tolerado) · HAND=0 (sin canrebot/cupula)
 * Uso: node tools/cam6clip.js
 */
'use strict';
const fs = require('fs'), path = require('path');
const CDP = require('./cdp.js');
const MAXP = +(process.env.MAXP || 0.5), BATCH = 50;
const CLUBS = process.env.CLUBS ? process.env.CLUBS.split(',') : null;

function listAll() {
  var out = [];
  VB.Leagues.regions.forEach(function (rg) { (rg.countries || []).forEach(function (co) { (co.divisions || []).forEach(function (d) { (d.clubs || []).forEach(function (k) { out.push('club:' + co.code + ':' + k.short); }); }); }); });
  return out;
}

async function runBatch(list) {
  var c = VB.ctx, T = c.THREE, V = VB.Venues;
  function wait(ms) { return new Promise(function (res) { setTimeout(res, ms); }); }
  var rc = new T.Raycaster(), o = new T.Vector3(), t = new T.Vector3(), d = new T.Vector3(), out = [];
  var CAMS = { tv: [], '3p': [] };
  [-1, 1].forEach(function (s) {
    [-1.1, 0, 1.1].forEach(function (y) { CAMS.tv.push([s * 14.2, y, 7.8]); });
    [11, 13.5, 15].forEach(function (x) { [-4.5, 0, 4.5].forEach(function (y) { [4.9, 6.4].forEach(function (z) { CAMS['3p'].push([s * x, y, z]); }); }); });
  });
  var TG = [];
  for (var x = -9; x <= 9; x += 3) for (var y = -4.5; y <= 4.5; y += 3) [0.1, 2, 4].forEach(function (z) { TG.push([x, y, z]); });
  for (var i = 0; i < list.length; i++) {
    var q = list[i], id = V.parse(q) || q;
    VB.Arena.onSettings(Object.assign({}, c.settings, { arena: 'hall', forceMap: id }), 'arena');
    await wait(150);
    var row = { q: q, id: id, mounted: VB.Arena.map() };
    if (row.mounted !== id) { row.err = 'no montó'; out.push(row); continue; }
    var arena = c.scene.getObjectByName('arena'), grp = arena && arena.getObjectByName('map-' + id);
    if (!grp) { row.skin = 1; row.tv = row['3p'] = 0; out.push(row); continue; }   // (H8/H9: piel de Palau sobre su estática, sin grupo propio)
    grp.updateMatrixWorld(true);
    // solo los triángulos de la caja que pueden cruzarse entre las cámaras y la pista (sim: |x| ≤ 16, |y| ≤ 7, z 0,3-8,6): el resto
    // (muros, gradas, techo alto) no puede tapar y el Raycaster sin árbol tardaba un minuto por sede
    var pos = [], names = [], v0 = new T.Vector3(), v1 = new T.Vector3(), v2 = new T.Vector3(), im = new T.Matrix4(), mw = new T.Matrix4();
    function inBox(a, b2, cc) {
      var x0 = Math.min(a.x, b2.x, cc.x), x1 = Math.max(a.x, b2.x, cc.x), y0 = Math.min(a.y, b2.y, cc.y), y1 = Math.max(a.y, b2.y, cc.y), z0 = Math.min(a.z, b2.z, cc.z), z1 = Math.max(a.z, b2.z, cc.z);
      return x1 >= -16 && x0 <= 16 && y1 >= 0.3 && y0 <= 8.6 && z1 >= -7 && z0 <= 7;
    }
    function addGeo(geo, M, nm) {
      var P = geo.attributes.position, I = geo.index, n = I ? I.count : P.count;
      for (var k3 = 0; k3 + 2 < n; k3 += 3) {
        var a0 = I ? I.getX(k3) : k3, a1 = I ? I.getX(k3 + 1) : k3 + 1, a2 = I ? I.getX(k3 + 2) : k3 + 2;
        v0.fromBufferAttribute(P, a0).applyMatrix4(M); v1.fromBufferAttribute(P, a1).applyMatrix4(M); v2.fromBufferAttribute(P, a2).applyMatrix4(M);
        if (!inBox(v0, v1, v2)) continue;
        pos.push(v0.x, v0.y, v0.z, v1.x, v1.y, v1.z, v2.x, v2.y, v2.z); names.push(nm);
      }
    }
    grp.traverse(function (m) {
      if (!m.isMesh || !m.geometry || !m.geometry.attributes.position) return;
      for (var p = m; p; p = p.parent) if (!p.visible) return;
      var mat = Array.isArray(m.material) ? m.material[0] : m.material;
      if (mat && (mat.transparent || mat.blending === T.AdditiveBlending)) return;   // (haces de luz, cristal: no tapan)
      if (m.isInstancedMesh) { for (var q2 = 0; q2 < m.count; q2++) { m.getMatrixAt(q2, im); mw.multiplyMatrices(m.matrixWorld, im); addGeo(m.geometry, mw, m.name || 'inst'); } }
      else addGeo(m.geometry, m.matrixWorld, m.name || (m.parent && m.parent.name) || '?');
    });
    var cg = new T.BufferGeometry(); cg.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    var cmesh = new T.Mesh(cg, new T.MeshBasicMaterial({ side: T.DoubleSide })), meshes = [cmesh]; cmesh.updateMatrixWorld(true);
    row.tris = names.length;
    Object.keys(CAMS).forEach(function (k) {
      var n = 0, hit = 0, who = {};
      CAMS[k].forEach(function (cm) {
        VB.toThree(cm[0], cm[1], cm[2], o);
        TG.forEach(function (tg) {
          if (Math.sign(cm[0]) * (cm[0] - tg[0]) < 3) return;
          VB.toThree(tg[0], tg[1], tg[2], t); d.subVectors(t, o); var L = d.length(); d.normalize();
          rc.set(o, d); rc.near = 0.05; rc.far = L - 0.3; n++;
          var h = rc.intersectObjects(meshes, false);
          if (h.length) { hit++; var nm = names[h[0].faceIndex] + '@z' + h[0].point.y.toFixed(1); who[nm] = (who[nm] || 0) + 1; }
        });
      });
      var top = Object.keys(who).sort(function (a, b) { return who[b] - who[a]; })[0] || '';
      row[k] = +(hit / Math.max(1, n) * 100).toFixed(1); row[k + 'Who'] = top;
    });
    out.push(row);
  }
  return out;
}

function chunk(a, n) { const o = []; for (let i = 0; i < a.length; i += n) o.push(a.slice(i, i + n)); return o; }

(async () => {
  const t0 = Date.now();
  let items;
  if (CLUBS) items = CLUBS.map(k => /^(canrebot|cupula|palau)$/.test(k) ? k : 'club:' + k);
  else {
    const page = await CDP.open({ size: '1280x720' });
    await page.navigate('debug=menu'); await CDP.sleep(3500);
    items = await page.evalJs('(' + listAll.toString() + ')()');
    page.close();
    if (process.env.HAND !== '0') items = ['canrebot', 'cupula'].concat(items);
  }
  const rows = [];
  const jobs = chunk(items, BATCH);
  for (let j = 0; j < jobs.length; j++) {
    const page = await CDP.open({ size: '1280x720' });
    try {
      await page.navigate('debug=rally6&quality=high&map=palau'); await CDP.sleep(5000);
      const v = await page.evalJs('(' + runBatch.toString() + ')(' + JSON.stringify(jobs[j]) + ')', true);
      rows.push(...v);
      console.log('lote ' + (j + 1) + '/' + jobs.length + ' · ' + Math.round((Date.now() - t0) / 1000) + ' s');
    } catch (e) { console.error('lote ' + (j + 1) + ': ' + (e && e.message || e)); rows.push({ q: 'lote ' + (j + 1), err: String(e && e.message || e) }); }
    page.close();
  }
  fs.mkdirSync(path.join(__dirname, 'out'), { recursive: true });
  fs.writeFileSync(path.join(__dirname, 'out', 'cam6clip.json'), JSON.stringify(rows, null, 1));
  const bad = rows.filter(r => r.err || r.tv > MAXP || r['3p'] > MAXP);
  rows.slice().sort((a, b) => (b.tv || 0) + (b['3p'] || 0) - (a.tv || 0) - (a['3p'] || 0)).slice(0, 15)
    .forEach(r => console.log('  ' + r.q + ' tv ' + r.tv + ' % (' + (r.tvWho || '-') + ') · 3p ' + r['3p'] + ' % (' + (r['3pWho'] || '-') + ')' + (r.err ? ' · ' + r.err : '')));
  console.log('sedes: ' + rows.length + ' · con más de ' + MAXP + ' % de rayos tapados o error: ' + bad.length + (bad.length ? ': ' + bad.map(r => r.q.replace(/^club:/, '')).join(', ') : ''));
  console.log((bad.length ? '== HAY CÁMARAS TAPADAS ==' : '== TODO OK ==') + ' · ' + Math.round((Date.now() - t0) / 1000) + ' s');
  process.exit(bad.length ? 1 : 0);
})();
