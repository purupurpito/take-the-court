#!/usr/bin/env node
/* MAKE THE CUT — tools/venuegen-beach.js (owner: arena)
 * Recorrido de las PLAYAS GENERADAS (plan «sedes-gen», F4) en el navegador (CDP, como venuegen-browse): por cada calidad abre
 * ?debug=serve (cámara de juego) y monta cada playa como main.js forceVenue (VB.Arena.onSettings con forceMap). Por playa y calidad:
 *   - ms de setVenue; dibujos y triángulos de la escena tras 2 fotogramas; dibujos propios (mallas visibles del grupo 'beach');
 *   - triángulos de la estática (beachStatic) y de la emisiva de noche (genBeachEmissive); público (instancias);
 *   - geometrías, texturas y programas.
 * Asserts: 0 errores de JS; coste de la receta (VB.VenueGen.cost) a ±15 % de la estática y la emisiva medidas; escena ≤ Platja en
 * dibujos (+ 2 de noche: emisiva y halos; los haces de media/alta van a cambio de las nubes y gaviotas que la noche no lleva) y en
 * triángulos ≤ Platja + el margen de la estática (32 k − la de Platja; × 3 en media y alta: color, sombra y tinta); propios ≤ los de
 * Platja + 2 de noche; estática ≤ 32 k; emisiva ≤ 4 k; público ≤ 240; programas sin subir tras la primera playa generada
 * (salvo la primera noche: emisiva, halos y haces); vuelta a la base (Palau) con tolerancia 0 al final de cada lote; montaje ≤ 120 ms
 * (a la primera ≤ 250 ms; la repetición es en frío, con VB.Venues.forget; ≤ 2 repeticiones por calidad y lote)
 * (aviso ≥ 400 ms con la CPU ×4, pasada aparte en baja; NO4=1 la salta). LAKE obligado: en AT, CH, CZ y RS al menos un club monta
 * una playa de lago (def.scen === 'lake', con el agua visible).
 * Muestra por defecto: 2 clubes por país + 1 club de cada escenario que falte + la primera noche de cada escenario + los lagos de
 * AT/CH/CZ/RS + 4 playas al azar (gen:b:n). ALL=1: los 390 clubes por lotes de 50. CLUBS=IT:PER,PL:SUW… = esa lista (sin ':b').
 * Salidas: tools/out/gen/beach-report.json y beach-stats.csv (las 10 peores de cada métrica).
 * Uso: node tools/venuegen-beach.js [calidades=low,medium,high] [WxH=1280x720]   Sale con 1 si algo falla.
 */
'use strict';
const fs = require('fs'), path = require('path');
const CDP = require('./cdp.js');
const QS = (process.argv[2] || 'low,medium,high').split(',').filter(Boolean), SIZE = process.argv[3] || '1280x720';
const ALL = process.env.ALL === '1', BATCH = 50, BATCH_MS = 600000, NO4 = process.env.NO4 === '1';
const OUT = path.join(__dirname, 'out', 'gen');
const LIM = { stat: 32000, emis: 4000, crowd: 240, ms: 120, ms1: 250, rep: 2, ms4: 400, night: 2, est: 0.15 };
const LAKE_CC = ['AT', 'CH', 'CZ', 'RS'];

/** En la página: lista de playas (ids 'club:CC:SIGLAS' o 'gen:b:n'). */
function pickClubs(all, lakeCC) {
  var out = [], scen = {}, night = {}, lake = {};
  VB.Leagues.regions.forEach(function (rg) {
    (rg.countries || []).forEach(function (co) {
      var L = [];
      (co.divisions || []).forEach(function (d) { (d.clubs || []).forEach(function (k) { L.push([co.code + ':' + k.short, k]); }); });
      L.forEach(function (e, i) {
        if (all || i === 0 || i === Math.floor(L.length / 2)) out.push(e[0]);
        var sp = VB.VenueGen.spec(Object.assign({ cc: co.code }, e[1]), 'beach'), s = sp.p.scen;
        if (!scen[s]) scen[s] = e[0];
        if (sp.night && !night[s]) night[s] = e[0];
        if (s === 'lake' && lakeCC.indexOf(co.code) >= 0 && !lake[co.code]) lake[co.code] = e[0];
      });
    });
  });
  if (!all) [scen, night, lake].forEach(function (m) { for (var k in m) if (out.indexOf(m[k]) < 0) out.push(m[k]); });
  for (var n = 1; n <= 4; n++) out.push('gen:b:' + (n * 7919));
  return { list: out, lake: lake };
}

/** En la página: monta un lote de playas y mide. */
async function runBatch(list, timeOnly, msLim) {
  var c = VB.ctx, r = c.renderer, V = VB.Venues;
  function wait(ms) { return new Promise(function (res) { setTimeout(res, ms); }); }
  function frames(n) { return new Promise(function (res) { var k = 0; (function f() { if (++k > n) res(); else requestAnimationFrame(f); })(); }); }
  function mem() { return { geo: r.info.memory.geometries, tex: r.info.memory.textures, prog: (r.info.programs || []).length }; }
  function scene() { var i = r.info.render; return { calls: i.calls, tris: i.triangles }; }
  function go(id) { var t0 = performance.now(); VB.Arena.onSettings(Object.assign({}, c.settings, { arena: V.kindOf(id), forceMap: id }), 'arena'); return performance.now() - t0; }
  async function settle() { await wait(250); await frames(2); }
  function own() {
    var g = c.scene.getObjectByName('beach'), o = { own: 0, stat: 0, emis: 0, crowd: 0, sea: false, jetty: false };
    if (g) g.traverse(function (m) {
      if (!m.visible || !(m.isMesh || m.isPoints)) return; var p = m; while (p) { if (!p.visible) return; p = p.parent; }
      o.own++;
      if (m.name === 'beachStatic') o.stat = (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3;
      if (m.name === 'genBeachEmissive') o.emis = (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3;
      if (m.name === 'beachCrowd') o.crowd = m.count;
      if (m.name === 'beachSea') o.sea = true;
    });
    return o;
  }
  go('palau'); await settle(); go('platja'); await settle();
  var platja = Object.assign(scene(), own());
  go('palau'); await wait(500); await frames(3);
  var base = mem(), rows = [], seen = {}, progMax = null;
  for (var i = 0; i < list.length; i++) {
    var key = list[i], id = V.parse(/^gen:/.test(key) ? key : 'club:' + key + ':b');
    if (!id) { rows.push({ club: key, err: 'sin id' }); continue; }
    var ms = go(id), ms1 = null; await settle();
    // (un montaje por encima del límite se mide otra vez EN FRÍO: pasando por Palau y olvidando la sede (VB.Venues.forget, fuera de
    //  la caché LRU) para que la def se vuelva a construir; un GC o la carga de la máquina dan picos sueltos de 100-180 ms en clubes
    //  que montan en 15-40 ms. Cuenta el mejor de los dos, el primero queda en ms1 y tiene su propio tope duro (LIM.ms1) en el
    //  informe; más de LIM.rep repeticiones por calidad también fallan)
    if (msLim && ms > msLim) {
      ms1 = Math.round(ms * 10) / 10; go('palau'); await settle();
      V.forget(id); id = V.parse(/^gen:/.test(key) ? key : 'club:' + key + ':b');
      ms = Math.min(ms, go(id)); await settle();
    }
    var d = VB.Arena.mapDef(id), sp = d && d.spec, row = { club: key, id: id, scen: sp && sp.p.scen, hour: sp && sp.p.hour, night: !!(sp && sp.night), ms: Math.round(ms * 10) / 10, ms1: ms1 };
    if (VB.Arena.map() !== id) row.err = 'no montó (está ' + VB.Arena.map() + ')';
    if (!timeOnly) {
      Object.assign(row, own(), scene(), mem());
      if (d.parts) row.parts = d.parts();
      var est = VB.VenueGen.cost(sp); row.est = est.tris; row.estEmis = est.emis;
      // (la plaza esconde el agua: sus programas son un subconjunto y la primera playa con agua tras un lote que empieza en plaza
      //  compila los 2 del agua; por eso la plaza cuenta aparte, como la noche)
      var kind = (row.night ? 'noche' : 'dia') + (row.scen === 'plaza' ? '-plaza' : '');
      row.progUp = seen[kind] && progMax != null ? Math.max(0, row.prog - progMax) : 0; seen[kind] = 1;
      progMax = Math.max(progMax == null ? 0 : progMax, row.prog);
    }
    rows.push(row);
  }
  go('palau'); await wait(500); await frames(3);
  return { q: c.quality && c.quality.level, base: base, end: mem(), platja: platja, rows: rows };
}

function chunk(a, n) { const o = []; for (let i = 0; i < a.length; i += n) o.push(a.slice(i, i + n)); return o; }
function withTimeout(p, ms, what) { let t; return Promise.race([p, new Promise((_, rej) => { t = setTimeout(() => rej(new Error('tiempo agotado: ' + what)), ms); })]).finally(() => clearTimeout(t)); }

(async () => {
  let code = 0;
  const report = { date: new Date().toISOString(), size: SIZE, qualities: QS, all: ALL, platja: {}, rows: [], batches: [], fails: [], warns: [], lake: {}, reps: {} };
  function fail(m) { report.fails.push(m); code = 1; }
  function warn(m) { report.warns.push(m); }
  let list = process.env.CLUBS ? process.env.CLUBS.split(',') : null, lake = {};
  const nBatches = list ? Math.ceil(list.length / BATCH) : ALL ? 8 : 2;
  setTimeout(() => { console.error('TIEMPO AGOTADO'); process.exit(2); }, (QS.length + (NO4 ? 0 : 1)) * nBatches * BATCH_MS + 120000).unref();
  try {
    if (!list) {
      const page = await CDP.open({ size: SIZE });
      await page.navigate('debug=menu'); await CDP.sleep(3500);
      const v = await page.evalJs('(' + pickClubs.toString() + ')(' + ALL + ',' + JSON.stringify(LAKE_CC) + ')');
      list = v.list; lake = v.lake; page.close();
      LAKE_CC.forEach(cc => { if (!lake[cc]) fail('LAKE: ningún club de ' + cc + ' tiene playa de lago'); });
    }
    const batches = chunk(list, BATCH);
    console.log('playas: ' + list.length + ' en ' + batches.length + ' lote(s) × ' + QS.join(', ') + (NO4 ? '' : ' + CPU ×4 en baja'));
    const passes = QS.map(q => ({ q, cpu: 1 })).concat(NO4 ? [] : [{ q: 'low', cpu: 4 }]);
    for (const ps of passes) {
      for (let b = 0; b < batches.length; b++) {
        const page = await CDP.open({ size: SIZE });
        try {
          await page.navigate('debug=serve&quality=' + ps.q); await CDP.sleep(5000);
          if (ps.cpu > 1) await page.send('Emulation.setCPUThrottlingRate', { rate: ps.cpu });
          const v = await withTimeout(page.evalJs('(' + runBatch.toString() + ')(' + JSON.stringify(batches[b]) + ',' + (ps.cpu > 1) + ',' + (ps.cpu > 1 ? LIM.ms4 : LIM.ms) + ')', true), BATCH_MS, 'lote ' + (b + 1) + ' ' + ps.q);
          const tag = ps.cpu > 1 ? 'cpu4' : v.q, P = v.platja;
          report.batches.push({ q: tag, batch: b + 1, base: v.base, end: v.end, platja: P });
          if (ps.cpu === 1) report.platja[v.q] = P;
          const leak = v.base.geo !== v.end.geo || v.base.tex !== v.end.tex || v.base.prog !== v.end.prog;
          console.log('\n== ' + tag + ' · lote ' + (b + 1) + '/' + batches.length + ' · Platja ' + P.calls + ' dibujos / ' + Math.round(P.tris / 1000) + ' k · propios ' + P.own + ' · estática ' + P.stat + ' · base ' + JSON.stringify(v.base) + ' → fin ' + JSON.stringify(v.end) + (leak ? '  ← FUGA' : ''));
          if (leak) fail(tag + ' lote ' + (b + 1) + ': no vuelve a la base ' + JSON.stringify(v.base) + ' → ' + JSON.stringify(v.end));
          if (ps.cpu === 1) console.log('playa       escenario hora    ms  propios  estát.  emis  púb.  escena        geo/tex/prog  prog+');
          // (en media y alta la estática se dibuja 3 veces: color, sombra y tinta)
          const trisCap = P.tris + Math.max(0, LIM.stat - P.stat) * (v.q === 'low' || ps.cpu > 1 ? 1 : 3);
          for (const r of v.rows) {
            const key = r.club + ' ' + tag;
            if (r.err) { fail(key + ': ' + r.err); console.log(r.club + ' ' + r.err); continue; }
            if (ps.cpu > 1) {
              const row = report.rows.find(x => x.club === r.club && x.q === 'low') || null;
              if (row) row.ms4 = r.ms; else report.rows.push({ club: r.club, id: r.id, scen: r.scen, q: 'low', ms4: r.ms });
              if (r.ms >= LIM.ms4) warn(key + ': montaje ' + r.ms + ' ms con CPU ×4 (≥ ' + LIM.ms4 + ')');
              continue;
            }
            const bad = [], nx = r.night ? LIM.night : 0;
            if (r.ms1 != null) { warn(key + ': montaje ' + r.ms1 + ' ms a la primera, ' + r.ms + ' ms al repetirlo en frío'); report.reps[tag] = (report.reps[tag] || 0) + 1; }
            if (r.ms1 != null && r.ms1 > LIM.ms1) bad.push('montaje a la primera ' + r.ms1 + ' ms > ' + LIM.ms1);
            if (r.ms > LIM.ms) bad.push('montaje ' + r.ms + ' ms > ' + LIM.ms);
            if (r.calls > P.calls + nx) bad.push('dibujos ' + r.calls + ' > Platja ' + P.calls + (nx ? ' + ' + nx : ''));
            if (r.own > P.own + nx) bad.push('propios ' + r.own + ' > Platja ' + P.own + (nx ? ' + ' + nx : ''));
            if (r.tris > trisCap) bad.push('triángulos ' + Math.round(r.tris / 1000) + ' k > ' + Math.round(trisCap / 1000) + ' k');
            if (r.stat > LIM.stat) bad.push('estática ' + r.stat + ' > 32 k');
            if (r.emis > LIM.emis) bad.push('emisiva > 4 k');
            if (r.crowd > LIM.crowd) bad.push('público ' + r.crowd + ' > ' + LIM.crowd);
            if (r.progUp > 0) bad.push('programas +' + r.progUp);
            if (r.scen === 'lake' && (!r.sea)) bad.push('lago sin agua visible');
            if (r.scen === 'plaza' && r.sea) bad.push('plaza con el mar visible');
            // coste estimado de la receta (VB.VenueGen.cost, tabla COST.beach) contra lo medido: ±15 % (si no, se corrige la tabla)
            if (r.est && Math.abs(r.est / r.stat - 1) > LIM.est) bad.push('coste estimado ' + r.est + ' vs medido ' + r.stat + ' (' + Math.round((r.est / r.stat - 1) * 100) + ' %)');
            if (r.night && r.estEmis && Math.abs(r.estEmis / Math.max(1, r.emis) - 1) > LIM.est) bad.push('emisiva estimada ' + r.estEmis + ' vs ' + r.emis);
            bad.forEach(m => fail(key + ': ' + m));
            report.rows.push(Object.assign({ q: v.q }, r));
            console.log((r.club + '            ').slice(0, 11) + ' ' + ((r.scen || '') + '          ').slice(0, 9) + ' ' + ((r.night ? 'noche' : r.hour) + '     ').slice(0, 5) + String(r.ms).padStart(6) + String(r.own).padStart(7) + String(r.stat).padStart(9) +
              String(r.emis).padStart(6) + String(r.crowd).padStart(6) + '  ' + (r.calls + '/' + Math.round(r.tris / 1000) + 'k').padStart(10) + '  ' + (r.geo + '/' + r.tex + '/' + r.prog).padStart(13) + String(r.progUp).padStart(6) + (bad.length ? '  ← ' + bad.join(', ') : ''));
          }
          if (ps.cpu > 1) { const ms = v.rows.map(r => r.ms).sort((a, b) => b - a); console.log('montaje con CPU ×4: máx ' + ms[0] + ' ms, mediana ' + ms[Math.floor(ms.length / 2)] + ' ms'); }
          if (page.errors.length) { fail(tag + ' lote ' + (b + 1) + ': errores de JS: ' + page.errors.slice(0, 5).join(' | ')); console.error('ERRORES EN LA PÁGINA:\n' + page.errors.slice(0, 10).join('\n')); }
        } catch (e) { fail(ps.q + ' lote ' + (b + 1) + ': ' + (e && e.message || e)); console.error(e && e.message || e); }
        page.close();
      }
    }
    // repeticiones de montaje por calidad (en frío): más de LIM.rep por calidad es un montaje lento de verdad, no un pico suelto
    for (const t in report.reps) if (report.reps[t] > LIM.rep * batches.length) fail(t + ': ' + report.reps[t] + ' playas necesitaron repetir el montaje (> ' + LIM.rep * batches.length + ')');
    console.log('\nrepeticiones de montaje (en frío): ' + (QS.map(q => q + ' ' + (report.reps[q] || 0)).join(' · ')));
    // LAKE obligado: el club de lago de cada país montó una playa de lago con agua
    LAKE_CC.forEach(cc => {
      const k = lake[cc]; if (!k) return;
      const r = report.rows.find(x => x.club === k && x.scen);
      report.lake[cc] = r ? { club: k, scen: r.scen, sea: r.sea } : { club: k, err: 'sin medida' };
      if (!r || r.scen !== 'lake' || !r.sea) fail('LAKE ' + cc + ': ' + k + ' no montó una playa de lago con agua');
    });
    if (!process.env.CLUBS) console.log('\nLAKE obligado: ' + LAKE_CC.map(cc => cc + ' ' + (report.lake[cc] ? report.lake[cc].club + ' ' + report.lake[cc].scen : '—')).join(' · '));
  } catch (e) { fail(String(e && e.message || e)); console.error(e && e.message || e); }
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'beach-report.json'), JSON.stringify(report, null, 1));
  const metrics = ['ms', 'ms4', 'calls', 'tris', 'own', 'stat', 'emis', 'crowd'];
  const csv = ['metrica,puesto,playa,id,escenario,calidad,valor'];
  for (const m of metrics) report.rows.filter(r => r[m] != null).sort((a, b) => b[m] - a[m]).slice(0, 10).forEach((r, i) => csv.push([m, i + 1, r.club, r.id, r.scen, r.q, r[m]].join(',')));
  fs.writeFileSync(path.join(OUT, 'beach-stats.csv'), csv.join('\n') + '\n');
  console.log('\n' + path.relative(path.join(__dirname, '..'), path.join(OUT, 'beach-report.json')) + ' · ' + path.relative(path.join(__dirname, '..'), path.join(OUT, 'beach-stats.csv')));
  if (report.warns.length) console.log('AVISOS (' + report.warns.length + '):\n  ' + report.warns.slice(0, 20).join('\n  '));
  if (report.fails.length) console.log('FALLOS (' + report.fails.length + '):\n  ' + report.fails.slice(0, 40).join('\n  '));
  console.log(code ? '== HAY FALLOS ==' : '== TODO OK ==');
  process.exit(code);
})();
