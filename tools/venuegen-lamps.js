#!/usr/bin/env node
/* MAKE THE CUT — tools/venuegen-lamps.js (owner: arena)
 * Focos de las sedes generadas de pabellón contra las cámaras del 6v6 (plan «sedes-gen», revisión de F2: una campana colgada a
 * ~7 m sobre la línea central tapaba media pista en el plano de televisión).
 * 1) En Chrome (CDP) toma las matrices de la cámara real (proyección × vista) en serve6, rally6, serve6h y rally6h a 1280×720 y
 *    844×390, 8 muestras por escena en 3,2 s (la cámara acompaña un poco el balón). La cámara no depende de la sede.
 * 2) En node carga la receta (leagues.js, venues.js, venue-gen.js) y, para las 390 sedes de pista con constructor propio y 200
 *    al azar, proyecta cada foco de la planta (VB.VenueGen.plan: rejilla nx × lys a la altura z, centro y boca de la campana o
 *    esquinas del panel LED) con cada muestra.
 * Falla si algún punto cae DENTRO del rectángulo de la pista en pantalla (18 × 9 m con 0,5 m de margen; delante de la cámara).
 * Uso: node tools/venuegen-lamps.js   (VERBOSE=1 lista cada sede que falla)
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const CDP = require('./cdp.js');
const ROOT = path.join(__dirname, '..');
const SIZES = ['1280x720', '844x390'], SCENES = ['serve6', 'rally6', 'serve6h', 'rally6h'];
setTimeout(() => { console.error('TIEMPO AGOTADO'); process.exit(2); }, 300000).unref();

const SAMPLE = `(async function(){
  function wait(ms){return new Promise(function(r){setTimeout(r,ms)})}
  var out=[], c=VB.ctx.camera, M=new THREE.Matrix4();
  for(var i=0;i<8;i++){ c.updateMatrixWorld(); M.multiplyMatrices(c.projectionMatrix, c.matrixWorldInverse); out.push(Array.prototype.slice.call(M.elements)); await wait(400); }
  return JSON.stringify(out);
})()`;

function proj(m, x, y, z) {   // sim → three (x, z, −y) → clip → NDC; null detrás de la cámara
  const X = x, Y = z, Z = -y, e = m;
  const cx = e[0] * X + e[4] * Y + e[8] * Z + e[12], cy = e[1] * X + e[5] * Y + e[9] * Z + e[13], cw = e[3] * X + e[7] * Y + e[11] * Z + e[15];
  if (cw <= 0.05) return null;
  return [cx / cw, cy / cw];
}
function inQuad(p, q) {   // punto en cuadrilátero convexo (orden de los vértices cualquiera de los dos sentidos)
  let s = 0;
  for (let i = 0; i < 4; i++) {
    const a = q[i], b = q[(i + 1) % 4], cr = (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
    if (cr === 0) continue; const sg = cr > 0 ? 1 : -1; if (!s) s = sg; else if (sg !== s) return false;
  }
  return true;
}

(async () => {
  let code = 0;
  const cams = [];
  for (const size of SIZES) {
    let page;
    try {
      page = await CDP.open({ size });
      for (const sc of SCENES) {
        page.errors.length = 0;
        await page.navigate('debug=' + sc); await CDP.sleep(4500);
        const ms = JSON.parse(await page.evalJs(SAMPLE, true));
        ms.forEach((m, i) => cams.push({ id: sc + '@' + size + '#' + i, m }));
        if (page.errors.length) { console.error('ERRORES EN LA PÁGINA (' + sc + ' ' + size + '):\n' + page.errors.slice(0, 5).join('\n')); code = 1; }
      }
    } catch (e) { console.error(e && e.message || e); code = 1; }
    if (page) page.close();
  }
  // receta en node
  const ctx = { console, Math, JSON, Set }; ctx.globalThis = ctx; ctx.window = ctx; vm.createContext(ctx);
  for (const f of ['js/leagues.js', 'js/venues.js', 'js/venue-gen.js']) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  const VB = ctx.VB, G = VB.VenueGen, specs = [];
  VB.Leagues.regions.forEach(rg => (rg.countries || []).forEach(co => (co.divisions || []).forEach(d => (d.clubs || []).forEach(k => specs.push(G.spec(Object.assign({ cc: co.code }, k), 'hall'))))));
  for (let i = 1; i <= 200; i++) specs.push(G.random('hall', i));
  const HL = 9.5, HW = 5.0, court = cams.map(c => [[-HL, -HW], [HL, -HW], [HL, HW], [-HL, HW]].map(p => proj(c.m, p[0], p[1], 0)));
  let n = 0, nl = 0, bad = [];
  const byCam = {};
  for (const sp of specs) {
    if (sp.p.skin) continue;
    const L = G.plan(sp), led = sp.p.light === 'led' || sp.p.light === 'show', pts = [];
    for (let ix = 0; ix < L.lamps.nx; ix++) {
      const lx = -L.WX + 2 * L.WX * (ix + 0.5) / L.lamps.nx;
      for (const ly of L.lamps.lys) {
        const z = L.lamps.z;
        if (led) pts.push([lx, ly, z], [lx - 0.65, ly - 0.32, z], [lx + 0.65, ly - 0.32, z], [lx - 0.65, ly + 0.32, z], [lx + 0.65, ly + 0.32, z]);
        else pts.push([lx, ly, z], [lx, ly, z - 0.3], [lx - 0.55, ly, z - 0.2], [lx + 0.55, ly, z - 0.2], [lx, ly - 0.55, z - 0.2], [lx, ly + 0.55, z - 0.2]);
      }
    }
    n++; nl += L.lamps.n;
    let hit = null;
    for (let ci = 0; ci < cams.length && !hit; ci++) {
      const q = court[ci]; if (q.some(v => !v)) continue;
      for (const p of pts) { const s = proj(cams[ci].m, p[0], p[1], p[2]); if (s && Math.abs(s[0]) <= 1 && Math.abs(s[1]) <= 1 && inQuad(s, q)) { hit = { cam: cams[ci].id, p }; break; } }
    }
    if (hit) { bad.push(sp.id + ' (' + sp.arch + ', z ' + L.lamps.z + ', filas ' + L.lamps.lys.join('/') + ') ' + hit.cam + ' foco ' + hit.p.map(v => v.toFixed(1)).join(',')); const k = hit.cam.split('#')[0]; byCam[k] = (byCam[k] || 0) + 1; }
  }
  console.log('cámaras: ' + cams.length + ' muestras (' + SCENES.join(', ') + ' × ' + SIZES.join(', ') + ')');
  console.log('sedes construidas: ' + n + ' · focos: ' + nl + ' · con un foco sobre la pista en pantalla: ' + bad.length + (bad.length ? ' ' + JSON.stringify(byCam) : ''));
  if (bad.length) { (process.env.VERBOSE === '1' ? bad : bad.slice(0, 12)).forEach(b => console.log('  ' + b)); code = 1; }
  console.log(code ? '== HAY FALLOS ==' : '== TODO OK ==');
  process.exit(code);
})();
